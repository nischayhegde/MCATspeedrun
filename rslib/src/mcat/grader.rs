// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! LLM grading of typed flashcard answers: the pure verdict -> FSRS grade
//! mapping, plus the OpenAI HTTP client used by the AnswerMcatCardTyped RPC
//! (added in a later task).

use super::model::Grade;
use super::model::Latency;

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

/// Typed-mode latency thresholds (ms). Typing an answer is much slower than
/// pressing a grade button, so these are wider than
/// `latency_for(ItemKind::Flashcard)`. PLACEHOLDER calibration, like the other
/// per-type thresholds (see PRD).
pub fn typed_latency() -> Latency {
    Latency {
        fast: 20_000,
        slow: 45_000,
    }
}

/// Map an LLM verdict + response time to the FSRS grade (design spec §2):
/// correctness decides pass/fail, speed modulates only full-credit answers.
pub fn grade_typed(verdict: Verdict, ms: u32) -> Grade {
    match verdict {
        Verdict::Incorrect => Grade::Again,
        Verdict::Partial => Grade::Hard,
        Verdict::Correct => {
            if ms <= typed_latency().fast {
                Grade::Easy
            } else {
                Grade::Good
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verdict_maps_to_grade_with_speed_modulation() {
        let fast = typed_latency().fast;
        assert_eq!(grade_typed(Verdict::Incorrect, 1_000), Grade::Again);
        assert_eq!(grade_typed(Verdict::Incorrect, 100_000), Grade::Again);
        assert_eq!(grade_typed(Verdict::Partial, 1_000), Grade::Hard);
        assert_eq!(grade_typed(Verdict::Correct, fast), Grade::Easy);
        assert_eq!(grade_typed(Verdict::Correct, fast + 1), Grade::Good);
        assert_eq!(grade_typed(Verdict::Correct, 200_000), Grade::Good);
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
}
