// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Problem/flashcard selection. Builds one interleaved study queue per the PRD
//! STUDY LOOP. Ported from `mcat-ui/src/engine/scheduler.ts`.

use std::collections::HashMap;
use std::collections::HashSet;

use super::model::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SelKind {
    Flashcard,
    Mcq,
}

/// A selectable content card (fixture/note) considered for the queue.
#[derive(Clone, Debug)]
pub struct SelectableCard {
    pub card_id: String,
    pub leaf_id: String,
    pub kind: SelKind,
    pub is_cars: bool,
    /// Whether this exact card already has a review-log entry (application
    /// items are fresh-every-time, so a seen MCQ is excluded).
    pub seen: bool,
    /// FSRS due (epoch ms) for rote cards; ignored for MCQs.
    pub due_ms: Option<i64>,
    pub reps: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct QueueItem {
    pub card_id: String,
    pub kind: SelKind,
    pub leaf_id: String,
}

/// Extra inputs the selector needs, derived from the review log.
#[derive(Default)]
pub struct SelectionContext {
    /// leaf_id -> epoch ms of last application attempt
    pub last_app_ms: HashMap<String, i64>,
    /// leaf_id -> number of correct application attempts
    pub app_correct: HashMap<String, u32>,
    /// leaf_id -> blueprint weight (for high-yield new-content ordering)
    pub weights: HashMap<String, f32>,
}

const PER_LEAF_MAX: usize = 3;

#[derive(Clone)]
struct Cand {
    card_id: String,
    kind: SelKind,
    leaf_id: String,
    due: f32,
    is_new: bool,
}

/// How overdue a maintenance rote card is, in days (0 if not yet due).
fn overdue_days(due_ms: Option<i64>, now_ms: i64) -> f32 {
    match due_ms {
        Some(d) => ((now_ms - d) as f32 / DAY_MS as f32).max(0.0),
        None => 0.0,
    }
}

// Priority bands for the `due` sort key (higher = scheduled sooner). These keep
// the study loop balanced when a session mixes categories:
//   * overdue maintenance rote ranks highest (don't let memory decay), scaled
//     by how overdue it is;
//   * new rote for a not-yet-fluent subtopic is next (rote fluency is the gate
//     that unlocks everything else);
//   * fresh application MCQs start lower but are boosted by how long since the
//     leaf was last practiced (rotation), by staleness (recalibration), and by
//     how weak the leaf's application score is (APP_NEED_BOOST) — a subtopic
//     that keeps missing its MCQs is exactly what application practice exists
//     to fix, so it can outrank rote.
// Priority alone can't survive an arbitrarily overdue rote backlog, so the
// session additionally reserves an APP_RESERVE_FRAC share of its slots for
// application candidates (see the capping pass below).
const NEW_ROTE_PRIORITY: f32 = 2.5;
const MAINTENANCE_BASE: f32 = 3.0;
const APPLICATION_BASE: f32 = 1.0;

pub fn build_queue(
    cards: &[SelectableCard],
    states: &HashMap<String, LeafState>,
    ctx: &SelectionContext,
    now_ms: i64,
    config: &StudyConfig,
) -> Vec<QueueItem> {
    let mut cands: Vec<Cand> = Vec::new();

    // Leaves with at least one rote card: only those can open the fluency gate
    // through flashcard practice. A leaf with no rote pool at all would
    // deadlock behind a closed gate (nothing to study ever again), so its MCQs
    // bypass the gate.
    let has_rote: HashSet<&str> = cards
        .iter()
        .filter(|c| c.kind == SelKind::Flashcard)
        .map(|c| c.leaf_id.as_str())
        .collect();

    for c in cards {
        let gate_open = states.get(&c.leaf_id).map(|s| s.gate_open).unwrap_or(false);
        match c.kind {
            SelKind::Flashcard => {
                let is_new = c.reps == 0;
                let is_due = c.due_ms.map(|d| d <= now_ms).unwrap_or(true);
                // While a subtopic is NOT fluent (gate closed) we push rote hard:
                // new cards + anything due. Once fluent (gate open) we stop
                // introducing NEW rote, but still surface genuinely-DUE cards so
                // FSRS maintenance keeps durability from decaying (PRD: rote
                // supports application, it isn't abandoned once the gate opens).
                let include = if gate_open {
                    !is_new && is_due
                } else {
                    is_new || is_due
                };
                if include {
                    let due = if is_new {
                        NEW_ROTE_PRIORITY
                    } else {
                        MAINTENANCE_BASE + overdue_days(c.due_ms, now_ms)
                    };
                    cands.push(Cand {
                        card_id: c.card_id.clone(),
                        kind: SelKind::Flashcard,
                        leaf_id: c.leaf_id.clone(),
                        due,
                        is_new,
                    });
                }
            }
            SelKind::Mcq => {
                // Application: fresh (unseen) MCQs for gate-open leaves (or CARS).
                // Each MCQ is one-shot, so once seen it's never re-served; we do
                // NOT apply per-leaf day spacing here (that would starve the loop
                // right after a diagnostic). PER_LEAF_MAX + interleaving keep any
                // one subtopic from dominating a session; `recency` just rotates
                // practice across leaves over successive sessions.
                if c.seen {
                    continue;
                }
                // CARS is always gate-exempt; so is a leaf with no rote pool
                // (its gate could never open through flashcards).
                let gate_exempt = c.is_cars || !has_rote.contains(c.leaf_id.as_str());
                if !gate_open && !gate_exempt {
                    continue;
                }
                let recency = match ctx.last_app_ms.get(&c.leaf_id).copied() {
                    None => 1.0,
                    Some(last) => ((now_ms - last) as f32 / DAY_MS as f32).clamp(0.0, 1.0),
                };
                // Recalibration: a gate-open leaf whose evidence has gone stale
                // (low freshness — mainly CARS/no-rote leaves, which have no
                // FSRS due-cards to refresh them) gets boosted so a probe item
                // reliably wins a session slot instead of losing to leaves
                // practiced more recently. Fully stale outranks maintenance.
                let freshness = states.get(&c.leaf_id).map(|s| s.freshness).unwrap_or(0.0);
                let stale_boost = if freshness < STALE_FRESHNESS {
                    STALE_APP_BOOST * (STALE_FRESHNESS - freshness) / STALE_FRESHNESS
                } else {
                    0.0
                };
                // Need: the weaker the leaf's application score, the more this
                // MCQ is the work the learner actually needs.
                let app_score = states
                    .get(&c.leaf_id)
                    .map(|s| clamp01(s.application))
                    .unwrap_or(0.0);
                let need_boost = APP_NEED_BOOST * (1.0 - app_score);
                cands.push(Cand {
                    card_id: c.card_id.clone(),
                    kind: SelKind::Mcq,
                    leaf_id: c.leaf_id.clone(),
                    due: APPLICATION_BASE + recency + stale_boost + need_boost,
                    is_new: false,
                });
            }
        }
    }

    // (3) new-content fallback if the session would be thin, high-yield first
    if cands.len() < 6 {
        let mut extra: Vec<&SelectableCard> = cards
            .iter()
            .filter(|c| {
                let assessed = states.get(&c.leaf_id).map(|s| s.assessed).unwrap_or(false);
                !assessed && !cands.iter().any(|x| x.card_id == c.card_id)
            })
            .collect();
        extra.sort_by(|a, b| {
            let wa = ctx.weights.get(&a.leaf_id).copied().unwrap_or(0.0);
            let wb = ctx.weights.get(&b.leaf_id).copied().unwrap_or(0.0);
            wb.partial_cmp(&wa).unwrap_or(std::cmp::Ordering::Equal)
        });
        for c in extra {
            cands.push(Cand {
                card_id: c.card_id.clone(),
                kind: c.kind,
                leaf_id: c.leaf_id.clone(),
                due: 0.5,
                is_new: true,
            });
        }
    }

    // spaced-repetition order: most due first
    cands.sort_by(|a, b| {
        b.due
            .partial_cmp(&a.due)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // caps: per-leaf, per-day new, per-session — with a share of the session
    // reserved for application MCQs, so an arbitrarily overdue rote backlog
    // (maintenance priority is unbounded) can never starve application out of
    // the loop entirely. Pass 1 seats the highest-priority application
    // candidates into the reserved slots; pass 2 fills the rest from all
    // candidates by priority as before.
    let mut per_leaf: HashMap<String, usize> = HashMap::new();
    let mut new_count = 0u32;
    let cap = config.session_size.min(config.max_reviews) as usize;
    let reserve = (cap as f32 * APP_RESERVE_FRAC).ceil() as usize;
    let mut taken = vec![false; cands.len()];
    let mut capped: Vec<Cand> = Vec::new();

    // pass 1: reserved application slots (fresh MCQs, not new-content fallback)
    for (i, c) in cands.iter().enumerate() {
        if capped.len() >= reserve {
            break;
        }
        if c.kind != SelKind::Mcq || c.is_new {
            continue;
        }
        let n = per_leaf.get(&c.leaf_id).copied().unwrap_or(0);
        if n >= PER_LEAF_MAX {
            continue;
        }
        per_leaf.insert(c.leaf_id.clone(), n + 1);
        taken[i] = true;
        capped.push(c.clone());
    }

    // pass 2: fill the remaining slots by priority
    for (i, c) in cands.iter().enumerate() {
        if capped.len() >= cap {
            break;
        }
        if taken[i] {
            continue;
        }
        let n = per_leaf.get(&c.leaf_id).copied().unwrap_or(0);
        if n >= PER_LEAF_MAX {
            continue;
        }
        if c.is_new && new_count >= config.new_per_day {
            continue;
        }
        per_leaf.insert(c.leaf_id.clone(), n + 1);
        if c.is_new {
            new_count += 1;
        }
        capped.push(c.clone());
    }

    // restore strict priority order before interleaving
    capped.sort_by(|a, b| {
        b.due
            .partial_cmp(&a.due)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    interleave(capped)
}

/// Round-robin across subtopic buckets so no two same-subtopic items are
/// adjacent.
fn interleave(items: Vec<Cand>) -> Vec<QueueItem> {
    let mut buckets: Vec<(String, Vec<Cand>)> = Vec::new();
    for it in items {
        if let Some(entry) = buckets.iter_mut().find(|(k, _)| *k == it.leaf_id) {
            entry.1.push(it);
        } else {
            buckets.push((it.leaf_id.clone(), vec![it]));
        }
    }

    let mut result: Vec<QueueItem> = Vec::new();
    let mut last: Option<String> = None;
    loop {
        // indices of non-empty buckets
        let non_empty: Vec<usize> = buckets
            .iter()
            .enumerate()
            .filter(|(_, (_, v))| !v.is_empty())
            .map(|(i, _)| i)
            .collect();
        if non_empty.is_empty() {
            break;
        }
        // prefer buckets whose key != last; among those pick the biggest
        let mut pool: Vec<usize> = non_empty
            .iter()
            .copied()
            .filter(|&i| Some(&buckets[i].0) != last.as_ref())
            .collect();
        if pool.is_empty() {
            pool = non_empty;
        }
        pool.sort_by(|&a, &b| buckets[b].1.len().cmp(&buckets[a].1.len()));
        let idx = pool[0];
        let it = buckets[idx].1.remove(0);
        last = Some(it.leaf_id.clone());
        result.push(QueueItem {
            card_id: it.card_id,
            kind: it.kind,
            leaf_id: it.leaf_id,
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_700_000_000_000;

    fn open_state(id: &str) -> LeafState {
        let mut s = LeafState::empty(id);
        s.assessed = true;
        s.gate_open = true;
        s.fluency = 0.8;
        s
    }
    fn closed_state(id: &str) -> LeafState {
        let mut s = LeafState::empty(id);
        s.assessed = true;
        s.gate_open = false;
        s.fluency = 0.5;
        s
    }

    fn sample() -> (
        Vec<SelectableCard>,
        HashMap<String, LeafState>,
        SelectionContext,
    ) {
        let mut states = HashMap::new();
        states.insert("1B".to_string(), open_state("1B"));
        states.insert("1C".to_string(), open_state("1C"));
        states.insert("1A".to_string(), closed_state("1A"));
        states.insert("1D".to_string(), closed_state("1D"));

        let mut cards = Vec::new();
        for i in 0..3 {
            cards.push(SelectableCard {
                card_id: format!("q1b-{i}"),
                leaf_id: "1B".into(),
                kind: SelKind::Mcq,
                is_cars: false,
                seen: false,
                due_ms: None,
                reps: 0,
            });
            cards.push(SelectableCard {
                card_id: format!("q1c-{i}"),
                leaf_id: "1C".into(),
                kind: SelKind::Mcq,
                is_cars: false,
                seen: false,
                due_ms: None,
                reps: 0,
            });
        }
        cards.push(SelectableCard {
            card_id: "fc1a".into(),
            leaf_id: "1A".into(),
            kind: SelKind::Flashcard,
            is_cars: false,
            seen: false,
            due_ms: None,
            reps: 0,
        });
        cards.push(SelectableCard {
            card_id: "fc1d".into(),
            leaf_id: "1D".into(),
            kind: SelKind::Flashcard,
            is_cars: false,
            seen: false,
            due_ms: None,
            reps: 0,
        });

        (cards, states, SelectionContext::default())
    }

    #[test]
    fn mixes_rote_and_application() {
        let (cards, states, ctx) = sample();
        let q = build_queue(&cards, &states, &ctx, NOW, &StudyConfig::default());
        assert!(q.len() > 4);
        assert!(q.iter().any(|i| i.kind == SelKind::Flashcard));
        assert!(q.iter().any(|i| i.kind == SelKind::Mcq));
        assert!(q.len() <= StudyConfig::default().session_size as usize);
    }

    #[test]
    fn no_two_same_subtopic_adjacent() {
        let (cards, states, ctx) = sample();
        let q = build_queue(&cards, &states, &ctx, NOW, &StudyConfig::default());
        for w in q.windows(2) {
            assert_ne!(w[0].leaf_id, w[1].leaf_id);
        }
    }

    #[test]
    fn caps_per_subtopic() {
        let (cards, states, ctx) = sample();
        let cfg = StudyConfig {
            session_size: 100,
            ..StudyConfig::default()
        };
        let q = build_queue(&cards, &states, &ctx, NOW, &cfg);
        let mut counts: HashMap<String, usize> = HashMap::new();
        for i in &q {
            *counts.entry(i.leaf_id.clone()).or_default() += 1;
        }
        assert!(counts.values().all(|&n| n <= PER_LEAF_MAX));
    }

    #[test]
    fn fluent_leaf_still_surfaces_due_rote_but_not_new() {
        let mut states = HashMap::new();
        states.insert("1B".to_string(), open_state("1B"));
        let ctx = SelectionContext::default();

        // a fluent (gate-open) leaf with one overdue rote card and one brand-new
        let cards = vec![
            SelectableCard {
                card_id: "due-rote".into(),
                leaf_id: "1B".into(),
                kind: SelKind::Flashcard,
                is_cars: false,
                seen: true,
                due_ms: Some(NOW - 3 * DAY_MS), // overdue
                reps: 4,
            },
            SelectableCard {
                card_id: "new-rote".into(),
                leaf_id: "1B".into(),
                kind: SelKind::Flashcard,
                is_cars: false,
                seen: false,
                due_ms: None,
                reps: 0,
            },
        ];
        let q = build_queue(&cards, &states, &ctx, NOW, &StudyConfig::default());
        assert!(
            q.iter().any(|i| i.card_id == "due-rote"),
            "due maintenance rote should appear"
        );
        assert!(
            !q.iter().any(|i| i.card_id == "new-rote"),
            "new rote should NOT be introduced once the leaf is fluent"
        );
    }

    #[test]
    fn recent_application_still_serves_unseen_mcqs() {
        // Regression: right after a diagnostic every assessed leaf has a very
        // recent application attempt. Unseen MCQs must still be served (no
        // leaf-level day spacing), otherwise the study loop starves.
        let mut states = HashMap::new();
        states.insert("1B".to_string(), open_state("1B"));
        let mut ctx = SelectionContext::default();
        ctx.last_app_ms.insert("1B".to_string(), NOW - 60_000); // 1 min ago
        ctx.app_correct.insert("1B".to_string(), 3);

        let cards: Vec<SelectableCard> = (0..3)
            .map(|i| SelectableCard {
                card_id: format!("q1b-{i}"),
                leaf_id: "1B".into(),
                kind: SelKind::Mcq,
                is_cars: false,
                seen: false,
                due_ms: None,
                reps: 0,
            })
            .collect();

        let q = build_queue(&cards, &states, &ctx, NOW, &StudyConfig::default());
        assert!(
            q.iter().filter(|i| i.kind == SelKind::Mcq).count() >= 1,
            "unseen application MCQs should be served even just after practice"
        );
    }

    #[test]
    fn stale_leaf_probes_outrank_fresh_leaves() {
        // both leaves gate-open with one unseen MCQ each; only one session slot
        let mut fresh = open_state("1B");
        fresh.freshness = 1.0;
        let mut stale = open_state("1C");
        stale.freshness = 0.1;
        let mut states = HashMap::new();
        states.insert("1B".to_string(), fresh);
        states.insert("1C".to_string(), stale);

        let cards: Vec<SelectableCard> = ["1B", "1C"]
            .iter()
            .map(|leaf| SelectableCard {
                card_id: format!("q-{leaf}"),
                leaf_id: leaf.to_string(),
                kind: SelKind::Mcq,
                is_cars: false,
                seen: false,
                due_ms: None,
                reps: 0,
            })
            .collect();

        let cfg = StudyConfig {
            session_size: 1,
            ..StudyConfig::default()
        };
        let q = build_queue(&cards, &states, &SelectionContext::default(), NOW, &cfg);
        assert_eq!(q.len(), 1);
        assert_eq!(
            q[0].leaf_id, "1C",
            "the stale leaf should win the only slot"
        );
    }

    #[test]
    fn rote_backlog_cannot_starve_application() {
        // 5 gate-closed leaves x 3 overdue rote cards outnumber the session;
        // gate-open leaves' unseen MCQs must still get a reserved share
        let mut states = HashMap::new();
        for id in ["1A", "1D", "2A", "2B", "2C"] {
            states.insert(id.to_string(), closed_state(id));
        }
        for id in ["1B", "1C"] {
            let mut s = open_state(id);
            s.freshness = 1.0;
            states.insert(id.to_string(), s);
        }

        let mut cards = Vec::new();
        for leaf in ["1A", "1D", "2A", "2B", "2C"] {
            for i in 0..3 {
                cards.push(SelectableCard {
                    card_id: format!("fc-{leaf}-{i}"),
                    leaf_id: leaf.to_string(),
                    kind: SelKind::Flashcard,
                    is_cars: false,
                    seen: true,
                    due_ms: Some(NOW - 3 * DAY_MS), // overdue -> priority 6.0
                    reps: 4,
                });
            }
        }
        for leaf in ["1B", "1C"] {
            for i in 0..2 {
                cards.push(SelectableCard {
                    card_id: format!("q-{leaf}-{i}"),
                    leaf_id: leaf.to_string(),
                    kind: SelKind::Mcq,
                    is_cars: false,
                    seen: false,
                    due_ms: None,
                    reps: 0,
                });
            }
        }

        let q = build_queue(
            &cards,
            &states,
            &SelectionContext::default(),
            NOW,
            &StudyConfig::default(),
        );
        assert_eq!(q.len(), 12);
        let mcqs = q.iter().filter(|i| i.kind == SelKind::Mcq).count();
        assert!(mcqs >= 4, "only {mcqs} MCQs in a 12-item session");
    }

    #[test]
    fn weakest_application_leaf_wins_the_slot() {
        // two gate-open leaves with one unseen MCQ each; the one with the
        // weaker application score needs the practice and must be scheduled
        let mut strong = open_state("1B");
        strong.freshness = 1.0;
        strong.application = 0.9;
        let mut weak = open_state("1C");
        weak.freshness = 1.0;
        weak.application = 0.1;
        let mut states = HashMap::new();
        states.insert("1B".to_string(), strong);
        states.insert("1C".to_string(), weak);

        // strong leaf's card first so a priority tie would pick it
        let cards: Vec<SelectableCard> = ["1B", "1C"]
            .iter()
            .map(|leaf| SelectableCard {
                card_id: format!("q-{leaf}"),
                leaf_id: leaf.to_string(),
                kind: SelKind::Mcq,
                is_cars: false,
                seen: false,
                due_ms: None,
                reps: 0,
            })
            .collect();

        let cfg = StudyConfig {
            session_size: 1,
            ..StudyConfig::default()
        };
        let q = build_queue(&cards, &states, &SelectionContext::default(), NOW, &cfg);
        assert_eq!(q.len(), 1);
        assert_eq!(
            q[0].leaf_id, "1C",
            "the weak-application leaf should win the slot"
        );
    }

    #[test]
    fn mcq_only_leaf_is_not_gate_deadlocked() {
        // a leaf with no rote cards can never open its gate through
        // flashcards; its fresh MCQs must be served anyway
        let mut states = HashMap::new();
        states.insert("1B".to_string(), closed_state("1B"));
        let cards = vec![SelectableCard {
            card_id: "q1b".into(),
            leaf_id: "1B".into(),
            kind: SelKind::Mcq,
            is_cars: false,
            seen: false,
            due_ms: None,
            reps: 0,
        }];
        let q = build_queue(
            &cards,
            &states,
            &SelectionContext::default(),
            NOW,
            &StudyConfig::default(),
        );
        assert!(
            q.iter().any(|i| i.card_id == "q1b"),
            "MCQ-only leaf was starved by its own gate"
        );
    }

    #[test]
    fn seen_mcqs_excluded() {
        let (mut cards, states, ctx) = sample();
        for c in &mut cards {
            if c.kind == SelKind::Mcq {
                c.seen = true;
            }
        }
        let q = build_queue(&cards, &states, &ctx, NOW, &StudyConfig::default());
        assert!(q.iter().all(|i| i.kind == SelKind::Flashcard));
    }
}
