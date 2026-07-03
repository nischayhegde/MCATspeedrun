// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! MCAT study engine: the fluency/application scoring layer, the rote ->
//! application gate, blueprint-weighted readiness/confidence, and the
//! problem/flashcard selector.
//!
//! This is the Rust port of the reference TypeScript engine in
//! `mcat-ui/src/engine`. It is deliberately layered:
//!   * FSRS scheduling itself is NOT reimplemented here — production reads
//!     Anki's own `Card::memory_state` (the `fsrs` crate). This module only
//!     consumes FSRS retrievability via [`model::RoteMemory`].
//!   * The pure logic in [`aggregate`]/[`scheduler`]/[`scoring`] is decoupled
//!     from Anki's `Card`/`RevlogEntry`/`Note` types so it can be unit-tested
//!     in isolation. An adapter in the storage/collection layer maps Anki's
//!     revlog and FSRS state into these inputs and persists
//!     [`model::LeafState`] to the `mcat_leaf_state` SQLite table.

pub mod adapter;
pub mod aggregate;
pub mod diagnostic;
pub mod grader;
pub mod leaf_tag;
pub mod model;
pub mod scheduler;
pub mod scoring;
pub mod taxonomy;

use std::collections::HashMap;

pub use model::Confidence;
pub use model::LeafState;
pub use model::Readiness;
pub use model::Review;
pub use model::RoteMemory;
pub use model::StudyConfig;

/// Compute every leaf's state from grouped reviews + rote memories.
///
/// `reviews_by_leaf` and `rote_by_leaf` are keyed by leaf id ("1B", "CARS1").
pub fn compute_leaf_states(
    reviews_by_leaf: &HashMap<String, Vec<Review>>,
    rote_by_leaf: &HashMap<String, Vec<RoteMemory>>,
    now_ms: i64,
) -> HashMap<String, LeafState> {
    let empty_reviews: Vec<Review> = Vec::new();
    let empty_rote: Vec<RoteMemory> = Vec::new();
    taxonomy::leaves()
        .iter()
        .map(|leaf| {
            let reviews = reviews_by_leaf.get(leaf.id).unwrap_or(&empty_reviews);
            let rote = rote_by_leaf.get(leaf.id).unwrap_or(&empty_rote);
            (
                leaf.id.to_string(),
                aggregate::score_leaf(leaf, reviews, rote, now_ms),
            )
        })
        .collect()
}

/// Blueprint-weighted readiness (472..528) from a set of leaf states.
pub fn readiness(states: &HashMap<String, LeafState>) -> Readiness {
    scoring::readiness(states)
}

/// Confidence in the readiness number.
pub fn confidence(states: &HashMap<String, LeafState>) -> Confidence {
    scoring::confidence(states)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcat::model::latency_for;
    use crate::mcat::model::Grade;
    use crate::mcat::model::ItemKind;
    use crate::mcat::model::DAY_MS;

    fn app_review(now: i64, days_ago: i64) -> Review {
        Review {
            ts_ms: now - days_ago * DAY_MS,
            grade: Grade::Easy,
            correct: true,
            ms: 30_000,
            kind: ItemKind::Application,
            is_application: true,
            is_cars: false,
            elapsed_days: 0.0,
            massed: false,
            productive_failure: false,
            latency: latency_for(ItemKind::Application),
            objective: true,
            scheduled_days: 0.0,
            difficulty: 3,
        }
    }

    #[test]
    fn end_to_end_readiness_from_reviews() {
        let now = 1_700_000_000_000i64;
        let mut reviews: HashMap<String, Vec<Review>> = HashMap::new();
        // one correct answer is compatible with a lucky guess: gate stays shut
        reviews.insert("1B".to_string(), vec![app_review(now, 10)]);
        let rote: HashMap<String, Vec<RoteMemory>> = HashMap::new();
        let states = compute_leaf_states(&reviews, &rote, now);
        assert!(!states["1B"].gate_open);

        // consistent spaced corrects demonstrate application and open it
        reviews.insert(
            "1B".to_string(),
            vec![app_review(now, 10), app_review(now, 5)],
        );
        let states = compute_leaf_states(&reviews, &rote, now);
        assert!(states["1B"].gate_open);
        let r = readiness(&states);
        assert!(r.score > 472 && r.score <= 528);
    }
}
