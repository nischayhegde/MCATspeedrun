// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! LLM grading of typed flashcard answers: the pure verdict -> FSRS grade
//! mapping, plus the OpenAI HTTP client used by the AnswerMcatCardTyped RPC.

use std::time::Duration;

use serde::Deserialize;

use super::model::Grade;
use crate::error::NetworkError;
use crate::error::NetworkErrorKind;
use crate::prelude::*;

/// LLM judgment of a typed answer against the card's canonical description.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Incorrect,
    Partial,
    Correct,
}

/// The verdict as stored in `mcat_answer_log`.
pub fn verdict_str(v: Verdict) -> &'static str {
    match v {
        Verdict::Incorrect => "incorrect",
        Verdict::Partial => "partial",
        Verdict::Correct => "correct",
    }
}

/// A graded typed answer. `model` is empty for the gave-up path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GradedAnswer {
    pub verdict: Verdict,
    pub feedback: String,
    pub model: String,
}

/// The result recorded for an "I don't know" / empty submission: objectively
/// wrong, no LLM call needed.
pub fn gave_up_result() -> GradedAnswer {
    GradedAnswer {
        verdict: Verdict::Incorrect,
        feedback: String::new(),
        model: String::new(),
    }
}

/// Map an LLM verdict to the FSRS grade. Flashcards are untimed: typing
/// speed is noise, and the verdict is the objective correctness signal.
pub fn grade_typed(verdict: Verdict) -> Grade {
    match verdict {
        Verdict::Incorrect => Grade::Again,
        Verdict::Partial => Grade::Hard,
        Verdict::Correct => Grade::Good,
    }
}

const DEFAULT_MODEL: &str = "gpt-5-mini";
const OPENAI_URL: &str = "https://api.openai.com/v1/chat/completions";
const MAX_ATTEMPTS: u32 = 5;
const REQUEST_TIMEOUT_SECS: u64 = 60;

/// Grades a typed answer against the card's canonical description. Trait so
/// the answer flow can be tested without the network.
pub trait AnswerGrader {
    fn grade_answer(&self, term: &str, expected: &str, typed: &str) -> Result<GradedAnswer>;
}

pub struct OpenAiGrader {
    client: reqwest::Client,
    runtime: tokio::runtime::Handle,
}

impl OpenAiGrader {
    pub fn new(client: reqwest::Client, runtime: tokio::runtime::Handle) -> OpenAiGrader {
        OpenAiGrader { client, runtime }
    }
}

impl AnswerGrader for OpenAiGrader {
    fn grade_answer(&self, term: &str, expected: &str, typed: &str) -> Result<GradedAnswer> {
        let key = api_key()?;
        let model = grader_model();
        let body = request_body(&model, term, expected, typed);
        self.runtime
            .block_on(grade_with_retries(&self.client, &key, &model, &body))
    }
}

fn api_key() -> Result<String> {
    match std::env::var("OPENAI_API_KEY") {
        Ok(k) if !k.trim().is_empty() => Ok(k),
        _ => invalid_input!(
            "OPENAI_API_KEY is not set; add it to questionbankparsing/.env or the environment"
        ),
    }
}

fn grader_model() -> String {
    std::env::var("MCAT_GRADER_MODEL")
        .ok()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}

/// Chat-completions payload with a strict JSON schema so the reply is always
/// `{verdict, feedback}`.
fn request_body(model: &str, term: &str, expected: &str, typed: &str) -> serde_json::Value {
    let system = "You grade a student's short-answer description of an MCAT term \
against the canonical description from their flashcard. Grade MEANING, not wording: \
synonyms and paraphrases are fine, but the answer must contain the key discriminating \
facts of the canonical description. verdict: \"correct\" when the key facts are all \
present, \"partial\" when some are, \"incorrect\" when the answer is wrong, vacuous, \
or off-topic. feedback: one short sentence naming what was missing or wrong (empty \
string when fully correct).";
    let user =
        format!("Term: {term}\n\nCanonical description: {expected}\n\nStudent's answer: {typed}");
    let mut body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "grade",
                "strict": true,
                "schema": {
                    "type": "object",
                    "properties": {
                        "verdict": {"type": "string", "enum": ["correct", "partial", "incorrect"]},
                        "feedback": {"type": "string"}
                    },
                    "required": ["verdict", "feedback"],
                    "additionalProperties": false
                }
            }
        }
    });
    if model.starts_with("gpt-5") {
        // reasoning models default to a slower effort; grading is simple
        body["reasoning_effort"] = serde_json::json!("minimal");
    }
    body
}

fn parse_response(model: &str, body: &str) -> Result<GradedAnswer> {
    #[derive(Deserialize)]
    struct Msg {
        content: String,
    }
    #[derive(Deserialize)]
    struct Choice {
        message: Msg,
    }
    #[derive(Deserialize)]
    struct Resp {
        choices: Vec<Choice>,
    }
    #[derive(Deserialize)]
    struct GraderJson {
        verdict: String,
        feedback: String,
    }

    let resp: Resp = serde_json::from_str(body)?;
    let content = resp
        .choices
        .first()
        .map(|c| c.message.content.as_str())
        .unwrap_or_default();
    let parsed: GraderJson = serde_json::from_str(content)?;
    let verdict = match parsed.verdict.as_str() {
        "correct" => Verdict::Correct,
        "partial" => Verdict::Partial,
        _ => Verdict::Incorrect,
    };
    Ok(GradedAnswer {
        verdict,
        feedback: parsed.feedback,
        model: model.to_string(),
    })
}

/// Block-until-graded policy: retry transient failures (connect/timeout/429/
/// 5xx) with exponential backoff; anything else fails immediately and the
/// card is left unanswered for the UI to retry.
async fn grade_with_retries(
    client: &reqwest::Client,
    key: &str,
    model: &str,
    body: &serde_json::Value,
) -> Result<GradedAnswer> {
    let mut delay = 2u64;
    let mut last_err = String::new();
    for attempt in 0..MAX_ATTEMPTS {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(delay)).await;
            delay = (delay * 2).min(60);
        }
        match client
            .post(OPENAI_URL)
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .bearer_auth(key)
            .json(body)
            .send()
            .await
        {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if status.is_success() {
                    return parse_response(model, &text);
                }
                let retryable = status.as_u16() == 429 || status.is_server_error();
                if !retryable {
                    return Err(network_error(format!("OpenAI HTTP {status}: {text}")));
                }
                last_err = format!("HTTP {status}");
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(network_error(format!(
        "LLM grading failed after {MAX_ATTEMPTS} attempts: {last_err}"
    )))
}

fn network_error(info: String) -> AnkiError {
    AnkiError::NetworkError {
        source: NetworkError {
            info,
            kind: NetworkErrorKind::Other,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verdicts_map_to_grades_untimed() {
        assert_eq!(grade_typed(Verdict::Incorrect), Grade::Again);
        assert_eq!(grade_typed(Verdict::Partial), Grade::Hard);
        assert_eq!(grade_typed(Verdict::Correct), Grade::Good);
    }

    #[test]
    fn gave_up_is_incorrect_with_no_feedback() {
        let g = gave_up_result();
        assert_eq!(g.verdict, Verdict::Incorrect);
        assert!(g.feedback.is_empty());
        assert!(g.model.is_empty());
    }

    #[test]
    fn verdict_strings_match_storage_format() {
        assert_eq!(verdict_str(Verdict::Correct), "correct");
        assert_eq!(verdict_str(Verdict::Partial), "partial");
        assert_eq!(verdict_str(Verdict::Incorrect), "incorrect");
    }

    #[test]
    fn request_body_shape() {
        let b = request_body("gpt-5-mini", "Glycolysis", "splits glucose", "my answer");
        assert_eq!(b["model"], "gpt-5-mini");
        // gpt-5 family: keep grading snappy
        assert_eq!(b["reasoning_effort"], "minimal");
        let user = b["messages"][1]["content"].as_str().unwrap();
        assert!(user.contains("Glycolysis"));
        assert!(user.contains("splits glucose"));
        assert!(user.contains("my answer"));
        assert_eq!(b["response_format"]["type"], "json_schema");
        // non-reasoning models must not get the parameter
        let b = request_body("gpt-4o-mini", "t", "e", "a");
        assert!(b.get("reasoning_effort").is_none());
    }

    #[test]
    fn parses_chat_completion_response() {
        let body = r#"{"choices":[{"message":{"content":"{\"verdict\":\"partial\",\"feedback\":\"Missed the ATP yield.\"}"}}]}"#;
        let g = parse_response("gpt-5-mini", body).unwrap();
        assert_eq!(g.verdict, Verdict::Partial);
        assert_eq!(g.feedback, "Missed the ATP yield.");
        assert_eq!(g.model, "gpt-5-mini");
    }

    #[test]
    fn unknown_verdict_reads_as_incorrect() {
        let body = r#"{"choices":[{"message":{"content":"{\"verdict\":\"garbled\",\"feedback\":\"\"}"}}]}"#;
        assert_eq!(
            parse_response("m", body).unwrap().verdict,
            Verdict::Incorrect
        );
    }

    /// Loads questionbankparsing/.env so the ignored live test can run
    /// without exporting the key manually. Pre-set env vars win.
    fn load_dotenv_for_test() {
        let path =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../questionbankparsing/.env");
        if let Ok(text) = std::fs::read_to_string(path) {
            for line in text.lines() {
                if let Some((k, v)) = line.split_once('=') {
                    let (k, v) = (k.trim(), v.trim().trim_matches('"').trim_matches('\''));
                    if !k.is_empty() && std::env::var(k).is_err() {
                        std::env::set_var(k, v);
                    }
                }
            }
        }
    }

    #[test]
    #[ignore = "live OpenAI call; run: cargo test -p anki grader -- --ignored"]
    fn live_grading_smoke() {
        load_dotenv_for_test();
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .enable_all()
            .build()
            .unwrap();
        let grader = OpenAiGrader::new(reqwest::Client::new(), rt.handle().clone());
        let g = grader
            .grade_answer(
                "Glycolysis",
                "The metabolic pathway that splits glucose into two pyruvate molecules, \
                 producing a net 2 ATP and 2 NADH.",
                "it splits glucose into pyruvate and makes some ATP",
            )
            .unwrap();
        assert_ne!(g.verdict, Verdict::Incorrect);
        assert!(!g.model.is_empty());
    }
}
