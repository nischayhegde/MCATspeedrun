// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Bridges Anki's real data (notes/tags, the review log, and FSRS
//! `memory_state`) into the pure MCAT scoring layer, and persists the derived
//! [`LeafState`] rows to the `mcat_leaf_state` SQLite table.
//!
//! Tagging convention (see `leaf_tag.rs`):
//!   * A note is assigned to a leaf via a tag like `mcat::cc::2B` (content
//!     category) or `mcat::cars::CARS1` (CARS skill). A bare `2B` tag also
//!     works, and subtopic children (`mcat::cc::2B::gram_staining`) are
//!     matched.
//!   * A note is treated as an **application/MCQ** item if it carries an
//!     `mcat::app` tag; otherwise it is a **rote flashcard**. CARS notes are
//!     always application items.

use std::collections::HashMap;
use std::collections::HashSet;

use fsrs::FSRS;
use fsrs::FSRS5_DEFAULT_DECAY;

use super::aggregate::score_leaf;
use super::leaf_tag::is_cars;
use super::leaf_tag::leaf_id_from_tags;
use super::model::*;
use super::scheduler::build_queue;
use super::scheduler::SelKind;
use super::scheduler::SelectableCard;
use super::scheduler::SelectionContext;
use super::scoring;
use super::taxonomy;
use crate::card::CardQueue;
use crate::prelude::*;
use crate::revlog::RevlogEntry;
use crate::revlog::RevlogReviewKind;
use crate::search::SortMode;

/// Does this note's tag set mark it as an application/MCQ item?
///
/// True when some tag contains both an `mcat` and an `app`/`application`
/// component, e.g. `mcat::app` or `mcat::app::discrete`.
fn note_is_application(tags: &[String]) -> bool {
    tags.iter().any(|t| {
        let mut has_mcat = false;
        let mut has_app = false;
        for part in t.split("::") {
            let p = part.trim();
            if p.eq_ignore_ascii_case("mcat") {
                has_mcat = true;
            }
            if p.eq_ignore_ascii_case("app") || p.eq_ignore_ascii_case("application") {
                has_app = true;
            }
        }
        has_mcat && has_app
    })
}

/// Replay a single card's review log into scoring-layer [`Review`]s.
///
/// `massed`/`productive_failure`/`elapsed_days` are derived from the per-card
/// sequence exactly as the reference engine does at record time (see
/// `mcat-ui/src/engine/grade.ts`). Manual/rescheduling rows (button 0) are
/// skipped so they don't count as evidence.
fn build_card_reviews(
    entries: &[RevlogEntry],
    kind: ItemKind,
    is_app: bool,
    cars: bool,
    latency: Latency,
    objective_ids: &HashSet<i64>,
) -> Vec<Review> {
    let mut sorted: Vec<&RevlogEntry> = entries.iter().collect();
    sorted.sort_by_key(|e| e.id.0);

    let mut out = Vec::new();
    let mut prev_ts: Option<i64> = None;
    let mut reps: u32 = 0;
    for e in sorted {
        if e.button_chosen == 0 {
            continue;
        }
        if matches!(
            e.review_kind,
            RevlogReviewKind::Manual | RevlogReviewKind::Rescheduled
        ) {
            continue;
        }
        let ts = e.id.0;
        let correct = e.button_chosen > 1;
        let elapsed_days = match prev_ts {
            Some(p) => (ts - p) as f32 / DAY_MS as f32,
            None => 0.0,
        };
        let massed = reps > 0 && elapsed_days < 1.0;
        let productive_failure = reps == 0 && !correct;
        // MCQ answers are always auto-graded; a flashcard row is objective
        // when a verdict-backed answer-log entry points at it. Typed answers
        // are judged against the wider typed-mode thresholds.
        let objective = is_app || objective_ids.contains(&ts);
        let latency = if !is_app && objective_ids.contains(&ts) {
            super::grader::typed_latency()
        } else {
            latency
        };
        out.push(Review {
            ts_ms: ts,
            grade: Grade::from_button(e.button_chosen),
            correct,
            ms: e.taken_millis,
            kind,
            is_application: is_app,
            is_cars: cars,
            elapsed_days,
            massed,
            productive_failure,
            latency,
            objective,
        });
        prev_ts = Some(ts);
        reps += 1;
    }
    out
}

impl Collection {
    /// Gather the scoring inputs (reviews + current rote retrievability) for a
    /// single leaf, by searching its tagged cards.
    fn mcat_leaf_inputs(&mut self, leaf_id: &str) -> Result<(Vec<Review>, Vec<RoteMemory>)> {
        let cars = is_cars(leaf_id);
        let search = format!(
            "(\"tag:mcat::cc::{id}\" OR \"tag:mcat::cc::{id}::*\" OR \"tag:mcat::cars::{id}\" OR \"tag:mcat::cars::{id}::*\" OR \"tag:{id}\")",
            id = leaf_id
        );
        let cids = self.search_cards(search.as_str(), SortMode::NoOrder)?;
        let now = self.timing_today()?.now;

        let mut reviews: Vec<Review> = Vec::new();
        let mut rote: Vec<RoteMemory> = Vec::new();
        for cid in cids {
            let card = match self.storage.get_card(cid)? {
                Some(c) => c,
                None => continue,
            };
            let note = match self.storage.get_note(card.note_id)? {
                Some(n) => n,
                None => continue,
            };
            // Defensive: only include cards that actually resolve to this leaf.
            if leaf_id_from_tags(&note.tags).as_deref() != Some(leaf_id) {
                continue;
            }

            let is_app = !cars && note_is_application(&note.tags);
            let kind = if cars {
                ItemKind::Cars
            } else if is_app {
                ItemKind::Application
            } else {
                ItemKind::Flashcard
            };
            let latency = note_expected_latency(&note.tags, kind);

            let entries = self.storage.get_revlog_entries_for_card(cid)?;
            let objective_ids = self.storage.mcat_answer_log_ids_for_card(cid.0)?;
            let card_reviews =
                build_card_reviews(&entries, kind, is_app, cars, latency, &objective_ids);
            let reps = card_reviews.len() as u32;
            reviews.extend(card_reviews);

            // Rote cards contribute current FSRS retrievability (durability).
            if matches!(kind, ItemKind::Flashcard) {
                if let Some(state) = card.memory_state {
                    let last = match card.last_review_time {
                        Some(l) => Some(l),
                        None => self.storage.time_of_last_review(cid)?,
                    };
                    if let Some(last) = last {
                        let decay = card.decay.unwrap_or(FSRS5_DEFAULT_DECAY);
                        let seconds = now.elapsed_secs_since(last).max(0) as u32;
                        let r = FSRS::new(None).unwrap().current_retrievability_seconds(
                            state.into(),
                            seconds,
                            decay,
                        );
                        rote.push(RoteMemory {
                            retrievability_now: r,
                            reps,
                        });
                    }
                }
            }
        }
        Ok((reviews, rote))
    }

    /// Recompute and persist the [`LeafState`] for a single leaf id.
    fn mcat_persist_leaf(&mut self, leaf_id: &str) -> Result<Option<LeafState>> {
        let def = match taxonomy::leaf(leaf_id) {
            Some(l) => l,
            None => return Ok(None),
        };
        let (reviews, rote) = self.mcat_leaf_inputs(leaf_id)?;
        let now_ms = TimestampMillis::now().0;
        let state = score_leaf(&def, &reviews, &rote, now_ms);
        self.storage.upsert_mcat_leaf_state(&state, now_ms)?;
        Ok(Some(state))
    }

    /// Update the leaf state for the leaf the given card belongs to. Called
    /// from the answer flow; a no-op for non-MCAT cards.
    pub(crate) fn mcat_update_leaf_for_card(&mut self, card: &Card) -> Result<()> {
        let leaf_id = {
            let note = match self.storage.get_note(card.note_id)? {
                Some(n) => n,
                None => return Ok(()),
            };
            match leaf_id_from_tags(&note.tags) {
                Some(id) => id,
                None => return Ok(()),
            }
        };
        self.mcat_persist_leaf(&leaf_id)?;
        Ok(())
    }

    /// Recompute every leaf from scratch (e.g. after import or diagnostic).
    pub fn mcat_recompute_all(&mut self) -> Result<()> {
        for leaf in taxonomy::leaves() {
            self.mcat_persist_leaf(leaf.id)?;
        }
        Ok(())
    }

    /// Wipe all MCAT study progress so the learner can start over, while
    /// keeping the imported content (notes/cards/media) intact:
    ///   1. reset every MCAT card to "new" (this also clears FSRS
    ///      `memory_state` and scheduling via [`Card::schedule_as_new`]),
    ///   2. delete the review log for those cards, and
    ///   3. clear the persisted per-subtopic leaf state,
    ///
    /// then recompute the (now-baseline) leaf states so the dashboard reflects
    /// the reset immediately.
    pub fn mcat_reset_progress(&mut self) -> Result<()> {
        let cids = self.search_cards("tag:mcat::*", SortMode::NoOrder)?;

        // Reset scheduling + clear FSRS memory on every MCAT card. This runs its
        // own transaction (Op::ScheduleAsNew).
        self.reschedule_cards_as_new(&cids, false, true, true, None)?;

        // Wipe review history for those cards and the derived leaf state.
        let ids: Vec<i64> = cids.iter().map(|c| c.0).collect();
        self.transact_no_undo(|col| {
            col.storage.clear_revlog_for_cards(&ids)?;
            col.storage.clear_mcat_answer_log()?;
            col.storage.clear_mcat_leaf_states()
        })?;

        // Rebuild the empty baseline so readiness/confidence read as fresh.
        self.mcat_recompute_all()?;
        Ok(())
    }

    /// All persisted leaf states.
    pub fn mcat_leaf_states(&self) -> Result<Vec<LeafState>> {
        self.storage.all_mcat_leaf_states()
    }

    /// Blueprint-weighted readiness + confidence from the persisted leaf
    /// states.
    pub fn mcat_readiness(&self) -> Result<(Readiness, Confidence)> {
        let states: HashMap<String, LeafState> = self
            .storage
            .all_mcat_leaf_states()?
            .into_iter()
            .map(|s| (s.id.clone(), s))
            .collect();
        Ok((scoring::readiness(&states), scoring::confidence(&states)))
    }

    /// Build the interleaved study queue from the collection's MCAT-tagged
    /// cards, returning fully-populated study items for the frontend.
    pub fn mcat_study_queue(
        &mut self,
        session_size: u32,
    ) -> Result<Vec<anki_proto::scheduler::McatStudyItem>> {
        let now_ms = TimestampMillis::now().0;
        let timing = self.timing_today()?;
        let cids = self.search_cards("tag:mcat::*", SortMode::NoOrder)?;

        let mut selectable: Vec<SelectableCard> = Vec::new();
        let mut ctx = SelectionContext::default();
        // card id -> (note id, leaf id, kind, cars)
        let mut meta: HashMap<i64, (NoteId, String, SelKind, bool)> = HashMap::new();

        for leaf in taxonomy::leaves() {
            ctx.weights.insert(leaf.id.to_string(), leaf.weight);
        }

        for cid in cids {
            let card = match self.storage.get_card(cid)? {
                Some(c) => c,
                None => continue,
            };
            if matches!(
                card.queue,
                CardQueue::Suspended | CardQueue::SchedBuried | CardQueue::UserBuried
            ) {
                continue;
            }
            let note = match self.storage.get_note(card.note_id)? {
                Some(n) => n,
                None => continue,
            };
            let leaf_id = match leaf_id_from_tags(&note.tags) {
                Some(id) => id,
                None => continue,
            };
            let cars = is_cars(&leaf_id);
            let is_app = cars || note_is_application(&note.tags);
            let kind = if is_app {
                SelKind::Mcq
            } else {
                SelKind::Flashcard
            };

            let entries = self.storage.get_revlog_entries_for_card(cid)?;
            let rated: Vec<&RevlogEntry> = entries.iter().filter(|e| e.button_chosen > 0).collect();
            let seen = !rated.is_empty();

            if is_app {
                if let Some(last) = rated.last() {
                    let e = ctx.last_app_ms.entry(leaf_id.clone()).or_insert(0);
                    *e = (*e).max(last.id.0);
                }
                let correct = rated.iter().filter(|e| e.button_chosen > 1).count() as u32;
                *ctx.app_correct.entry(leaf_id.clone()).or_insert(0) += correct;
            }

            // rote due time in epoch ms, derived from the card's queue semantics
            let due_ms = match card.queue {
                CardQueue::Learn | CardQueue::PreviewRepeat => Some(card.due as i64 * 1000),
                CardQueue::DayLearn | CardQueue::Review => {
                    let days_ahead = card.due as i64 - timing.days_elapsed as i64;
                    Some(now_ms + days_ahead * DAY_MS)
                }
                _ => None,
            };

            selectable.push(SelectableCard {
                card_id: cid.0.to_string(),
                leaf_id: leaf_id.clone(),
                kind,
                is_cars: cars,
                seen,
                due_ms,
                reps: card.reps,
            });
            meta.insert(cid.0, (card.note_id, leaf_id, kind, cars));
        }

        let states: HashMap<String, LeafState> = self
            .storage
            .all_mcat_leaf_states()?
            .into_iter()
            .map(|s| (s.id.clone(), s))
            .collect();

        let mut config = StudyConfig::default();
        if session_size > 0 {
            config.session_size = session_size;
        }
        let queue = build_queue(&selectable, &states, &ctx, now_ms, &config);

        let mut items = Vec::with_capacity(queue.len());
        for qi in queue {
            let cid: i64 = qi.card_id.parse().unwrap_or(0);
            let Some((nid, leaf_id, kind, cars)) = meta.get(&cid) else {
                continue;
            };
            if let Some(item) = self.build_study_item(cid, *nid, leaf_id, *kind, *cars)? {
                items.push(item);
            }
        }
        Ok(items)
    }

    /// Build a study item proto for one card by reading its note fields.
    fn build_study_item(
        &mut self,
        card_id: i64,
        note_id: NoteId,
        leaf_id: &str,
        kind: SelKind,
        cars: bool,
    ) -> Result<Option<anki_proto::scheduler::McatStudyItem>> {
        let note = match self.storage.get_note(note_id)? {
            Some(n) => n,
            None => return Ok(None),
        };
        let nt = match self.get_notetype(note.notetype_id)? {
            Some(nt) => nt,
            None => return Ok(None),
        };
        let field = |names: &[&str]| -> String {
            for (idx, f) in nt.fields.iter().enumerate() {
                if names.iter().any(|n| f.name.eq_ignore_ascii_case(n)) {
                    return note.fields().get(idx).cloned().unwrap_or_default();
                }
            }
            String::new()
        };
        let (leaf_name, section) = taxonomy::leaf(leaf_id)
            .map(|l| (l.name.to_string(), section_short(l.section).to_string()))
            .unwrap_or_default();

        let fields = note.fields();
        let mut item = match kind {
            SelKind::Flashcard => anki_proto::scheduler::McatStudyItem {
                card_id,
                leaf_id: leaf_id.to_string(),
                leaf_name,
                section,
                is_cars: cars,
                kind: anki_proto::scheduler::mcat_study_item::Kind::Flashcard as i32,
                front: non_empty_or(field(&["Front", "Question"]), fields.first()),
                back: non_empty_or(field(&["Back", "Answer"]), fields.get(1)),
                ..Default::default()
            },
            SelKind::Mcq => anki_proto::scheduler::McatStudyItem {
                card_id,
                leaf_id: leaf_id.to_string(),
                leaf_name,
                section,
                is_cars: cars,
                kind: anki_proto::scheduler::mcat_study_item::Kind::Mcq as i32,
                front: field(&["Question", "Stem", "Front"]),
                image: media_url(&field(&["Image"])),
                choices: vec![
                    field(&["A", "ChoiceA"]),
                    field(&["B", "ChoiceB"]),
                    field(&["C", "ChoiceC"]),
                    field(&["D", "ChoiceD"]),
                ],
                answer: field(&["Answer", "Correct"]),
                explanation: field(&["Explanation"]),
                ..Default::default()
            },
        };
        item.difficulty = difficulty_from_tags(&note.tags) as u32;
        item.difficulty_tagged = has_difficulty_tag(&note.tags);
        item.fsrs_difficulty = self
            .storage
            .get_card(CardId(card_id))?
            .and_then(|c| c.memory_state)
            .map(|s| s.difficulty)
            .unwrap_or(0.0);
        Ok(Some(item))
    }

    /// Build the stratified-random diagnostic exam over all MCAT application
    /// (MCQ) cards in the collection.
    pub fn mcat_diagnostic(
        &mut self,
        question_count: u32,
        seed: u64,
    ) -> Result<Vec<anki_proto::scheduler::McatStudyItem>> {
        let target = if question_count == 0 {
            120
        } else {
            question_count
        } as usize;
        let seed = if seed == 0 {
            TimestampMillis::now().0 as u64
        } else {
            seed
        };

        let cids = self.search_cards("tag:mcat::*", SortMode::NoOrder)?;
        let mut candidates: Vec<super::diagnostic::DiagCandidate> = Vec::new();
        // card id -> (note id, leaf id, cars) for item building afterwards
        let mut meta: HashMap<i64, (NoteId, String, bool)> = HashMap::new();

        for cid in cids {
            let card = match self.storage.get_card(cid)? {
                Some(c) => c,
                None => continue,
            };
            let note = match self.storage.get_note(card.note_id)? {
                Some(n) => n,
                None => continue,
            };
            let leaf_id = match leaf_id_from_tags(&note.tags) {
                Some(id) => id,
                None => continue,
            };
            let cars = is_cars(&leaf_id);
            // diagnostic is application/MCQ only (rote flashcards excluded)
            if !(cars || note_is_application(&note.tags)) {
                continue;
            }
            let difficulty = difficulty_from_tags(&note.tags);
            candidates.push(super::diagnostic::DiagCandidate {
                card_id: cid.0.to_string(),
                leaf_id: leaf_id.clone(),
                difficulty,
            });
            meta.insert(cid.0, (card.note_id, leaf_id, cars));
        }

        let chosen = super::diagnostic::select_diagnostic(&candidates, target, seed);

        let mut items = Vec::with_capacity(chosen.len());
        for card_id in chosen {
            let cid: i64 = card_id.parse().unwrap_or(0);
            let Some((nid, leaf_id, cars)) = meta.get(&cid) else {
                continue;
            };
            if let Some(item) = self.build_study_item(cid, *nid, leaf_id, SelKind::Mcq, *cars)? {
                items.push(item);
            }
        }
        Ok(items)
    }

    /// Answer an MCAT item: auto-grade MCQs from correctness + latency,
    /// self-grade flashcards, then run the normal answer flow (FSRS scheduling,
    /// revlog with taken millis, and the leaf-state hook).
    pub fn mcat_answer_card(
        &mut self,
        card_id: CardId,
        correct: bool,
        milliseconds_taken: u32,
        self_rating: u32,
    ) -> Result<Grade> {
        let card = self.storage.get_card(card_id)?.or_not_found(card_id)?;
        let note = self
            .storage
            .get_note(card.note_id)?
            .or_not_found(card.note_id)?;
        let leaf_id = leaf_id_from_tags(&note.tags);
        let cars = leaf_id.as_deref().map(is_cars).unwrap_or(false);
        let is_app = cars || note_is_application(&note.tags);

        let grade = if is_app {
            let kind = if cars {
                ItemKind::Cars
            } else {
                ItemKind::Application
            };
            let latency = note_expected_latency(&note.tags, kind);
            scoring::grade_mcq(correct, milliseconds_taken, latency).grade
        } else {
            Grade::from_button(self_rating.clamp(1, 4) as u8)
        };

        self.transact(crate::ops::Op::AnswerCard, |col| {
            let states = col.get_scheduling_states(card_id)?;
            let new_state = match grade {
                Grade::Again => states.again,
                Grade::Hard => states.hard,
                Grade::Good => states.good,
                Grade::Easy => states.easy,
            };
            let mut answer: crate::scheduler::answering::CardAnswer =
                anki_proto::scheduler::CardAnswer {
                    card_id: card_id.into(),
                    current_state: Some(states.current.into()),
                    new_state: Some(new_state.into()),
                    rating: grade.as_u8() as i32 - 1,
                    milliseconds_taken,
                    answered_at_millis: TimestampMillis::now().into(),
                }
                .into();
            answer.from_queue = false;
            col.answer_card_inner(&mut answer)
        })?;
        Ok(grade)
    }
}

/// Turn an Image field into a root-absolute media URL the webview can load.
///
/// The importer stores `<img src="file.png">` (so Anki's media GC sees the
/// reference); the media server serves collection media from the site root, so
/// we return `/file.png`. Bare filenames are also accepted. Empty -> empty.
fn media_url(field: &str) -> String {
    let field = field.trim();
    if field.is_empty() {
        return String::new();
    }
    let name = if let Some(rest) = field.split_once("src=\"") {
        rest.1.split('"').next().unwrap_or("").to_string()
    } else if let Some(rest) = field.split_once("src='") {
        rest.1.split('\'').next().unwrap_or("").to_string()
    } else {
        field.to_string()
    };
    let name = name.trim();
    if name.is_empty() {
        String::new()
    } else if name.starts_with('/') || name.starts_with("http") {
        name.to_string()
    } else {
        format!("/{name}")
    }
}

/// Extract a 1..=5 marker following any of `keys` in a `mcat::<key>::N` tag;
/// default 3 (typical) when untagged.
fn marker_from_tags(tags: &[String], keys: &[&str]) -> u8 {
    for t in tags {
        let mut saw_key = false;
        for part in t.split("::") {
            let p = part.trim();
            if saw_key {
                if let Ok(n) = p.parse::<u8>() {
                    return n.clamp(1, 5);
                }
            }
            if keys.iter().any(|k| p.eq_ignore_ascii_case(k)) {
                saw_key = true;
            }
        }
    }
    3
}

/// Extract overall difficulty (1..=5) from a `mcat::diff::N` tag; default 3.
fn difficulty_from_tags(tags: &[String]) -> u8 {
    marker_from_tags(tags, &["diff", "difficulty"])
}

/// True when the note carries an explicit `mcat::diff::N`/`mcat::difficulty::N`
/// marker, so consumers can distinguish "authored medium" from "untagged".
fn has_difficulty_tag(tags: &[String]) -> bool {
    for t in tags {
        let mut saw_key = false;
        for part in t.split("::") {
            let p = part.trim();
            if saw_key && p.parse::<u8>().is_ok() {
                return true;
            }
            if ["diff", "difficulty"]
                .iter()
                .any(|k| p.eq_ignore_ascii_case(k))
            {
                saw_key = true;
            }
        }
    }
    false
}

/// Per-item expected-time thresholds from the note's parser-scored reasoning
/// complexity (`mcat::rc::N`) and calculation tedium (`mcat::ct::N`) tags.
fn note_expected_latency(tags: &[String], kind: ItemKind) -> Latency {
    let rc = marker_from_tags(tags, &["rc", "reasoning"]);
    let ct = marker_from_tags(tags, &["ct", "tedium"]);
    expected_latency(kind, rc, ct)
}

fn section_short(section: taxonomy::Section) -> &'static str {
    match section {
        taxonomy::Section::Cpbs => "C/P",
        taxonomy::Section::Bbls => "B/B",
        taxonomy::Section::Psbb => "P/S",
        taxonomy::Section::Cars => "CARS",
    }
}

fn non_empty_or(primary: String, fallback: Option<&String>) -> String {
    if primary.is_empty() {
        fallback.cloned().unwrap_or_default()
    } else {
        primary
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_url_extracts_from_img_tag() {
        assert_eq!(media_url("<img src=\"q1.png\">"), "/q1.png");
        assert_eq!(media_url("<img src='pic.jpg' >"), "/pic.jpg");
        assert_eq!(media_url("bare.png"), "/bare.png");
        assert_eq!(media_url("/already.png"), "/already.png");
        assert_eq!(media_url(""), "");
        assert_eq!(media_url("https://x/y.png"), "https://x/y.png");
    }

    #[test]
    fn difficulty_parsed_from_tags() {
        assert_eq!(difficulty_from_tags(&["mcat::diff::4".to_string()]), 4);
        assert_eq!(
            difficulty_from_tags(&["mcat::difficulty::2".to_string()]),
            2
        );
        assert_eq!(difficulty_from_tags(&["mcat::diff::9".to_string()]), 5); // clamp
        assert_eq!(difficulty_from_tags(&["mcat::cc::1B".to_string()]), 3); // default
    }

    #[test]
    fn difficulty_tag_presence() {
        assert!(has_difficulty_tag(&["mcat::diff::4".to_string()]));
        assert!(has_difficulty_tag(&["mcat::difficulty::2".to_string()]));
        assert!(!has_difficulty_tag(&["mcat::cc::1B".to_string()]));
        assert!(!has_difficulty_tag(&["mcat::rc::5".to_string()]));
        assert!(!has_difficulty_tag(&[]));
    }

    #[test]
    fn expected_latency_from_rc_ct_tags() {
        let base = latency_for(ItemKind::Application);
        // tedious item: rc 5 + ct 5 -> 1.6x time budget
        let tags = vec!["mcat::rc::5".to_string(), "mcat::ct::5".to_string()];
        let t = note_expected_latency(&tags, ItemKind::Application);
        assert_eq!(t.slow, (base.slow as f32 * 1.6) as u32);
        // untagged -> markers default to 3 -> flat thresholds
        let t = note_expected_latency(&["mcat::cc::4B".to_string()], ItemKind::Application);
        assert_eq!((t.fast, t.slow), (base.fast, base.slow));
        // leaf/cc components must not be misread as markers
        assert_eq!(marker_from_tags(&["mcat::cc::4".to_string()], &["ct"]), 3);
    }

    #[test]
    fn application_marker_detected() {
        assert!(note_is_application(&["mcat::app".to_string()]));
        assert!(note_is_application(&["mcat::app::discrete".to_string()]));
        assert!(!note_is_application(&["mcat::cc::1B".to_string()]));
    }
}
