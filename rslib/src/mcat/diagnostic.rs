// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

//! Diagnostic exam selection.
//!
//! PRD intent: an initial ~120-question exam with varying difficulty that
//! covers every subtopic. The naive "random 120" leaves coverage to chance, so
//! this uses **stratified-random** selection:
//!
//!   1. Guarantee one item from every leaf that has questions (breadth first),
//!      preferring a mid-difficulty item so the first taste of a topic isn't a
//!      fluke either way.
//!   2. Fill the remaining budget proportional to each leaf's blueprint weight
//!      (so high-yield areas get more items), drawing within a leaf across
//!      difficulty bands in round-robin order for a spread.
//!   3. Deterministic given a seed, so a diagnostic can be reproduced/tested;
//!      the caller passes a seed (e.g. derived from the collection + day).

use std::collections::HashMap;

use super::taxonomy;

/// A candidate question for the diagnostic.
#[derive(Clone, Debug)]
pub struct DiagCandidate {
    pub card_id: String,
    pub leaf_id: String,
    /// 1..=5 (AAMC-style overall difficulty). Unknown -> 3.
    pub difficulty: u8,
}

/// Small deterministic PRNG (xorshift64*), to avoid pulling in rand here and to
/// keep the selection reproducible for tests.
struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self {
        Rng(seed | 1)
    }
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    fn shuffle<T>(&mut self, v: &mut [T]) {
        for i in (1..v.len()).rev() {
            let j = (self.next_u64() % (i as u64 + 1)) as usize;
            v.swap(i, j);
        }
    }
}

fn difficulty_band(d: u8) -> usize {
    match d {
        0..=2 => 0, // easy
        3 => 1,     // medium
        _ => 2,     // hard
    }
}

/// Select up to `target` cards, stratified across leaves and difficulty.
pub fn select_diagnostic(candidates: &[DiagCandidate], target: usize, seed: u64) -> Vec<String> {
    if candidates.is_empty() || target == 0 {
        return Vec::new();
    }

    // Bucket candidates by leaf, then by difficulty band, shuffling within.
    let mut rng = Rng::new(seed);
    let weights: HashMap<&str, f32> = taxonomy::leaves()
        .into_iter()
        .map(|l| (l.id, l.weight))
        .collect();

    let mut by_leaf: HashMap<String, [Vec<String>; 3]> = HashMap::new();
    for c in candidates {
        let entry = by_leaf
            .entry(c.leaf_id.clone())
            .or_insert_with(|| [Vec::new(), Vec::new(), Vec::new()]);
        entry[difficulty_band(c.difficulty)].push(c.card_id.clone());
    }

    // Stable leaf ordering (by descending weight, then id) for deterministic
    // fill. Established BEFORE any RNG use so shuffles happen in a fixed order.
    let mut leaf_ids: Vec<String> = by_leaf.keys().cloned().collect();
    leaf_ids.sort_by(|a, b| {
        let wa = weights.get(a.as_str()).copied().unwrap_or(0.0);
        let wb = weights.get(b.as_str()).copied().unwrap_or(0.0);
        wb.partial_cmp(&wa)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.cmp(b))
    });

    // Shuffle each leaf's difficulty bands in the deterministic leaf order so a
    // given seed always consumes the RNG identically. Sort each band first so
    // the *starting* order is fixed regardless of the caller's candidate order
    // (collection queries don't guarantee a stable order), otherwise the same
    // seed could shuffle a differently-ordered band into a different result.
    for leaf in &leaf_ids {
        if let Some(bands) = by_leaf.get_mut(leaf) {
            for b in bands.iter_mut() {
                b.sort();
                rng.shuffle(b);
            }
        }
    }

    let mut chosen: Vec<String> = Vec::new();
    let mut taken: HashMap<String, usize> = HashMap::new();

    // pull one card from a leaf, preferring band order [medium, easy, hard].
    let pop_from = |bands: &mut [Vec<String>; 3], order: [usize; 3]| -> Option<String> {
        for &b in &order {
            if let Some(id) = bands[b].pop() {
                return Some(id);
            }
        }
        None
    };

    // (1) breadth: one mid-ish item from every leaf with content.
    for leaf in &leaf_ids {
        if chosen.len() >= target {
            break;
        }
        if let Some(bands) = by_leaf.get_mut(leaf) {
            if let Some(id) = pop_from(bands, [1, 0, 2]) {
                chosen.push(id);
                *taken.entry(leaf.clone()).or_insert(0) += 1;
            }
        }
    }

    // (2) weighted fill: distribute the remaining budget by blueprint weight,
    // cycling difficulty bands for a spread. Loop until budget hit or exhausted.
    let band_cycle = [0usize, 2, 1];
    let mut cycle_idx = 0;
    loop {
        if chosen.len() >= target {
            break;
        }
        let remaining = target - chosen.len();
        // desired extra per leaf this pass, proportional to weight.
        let total_w: f32 = leaf_ids
            .iter()
            .map(|l| weights.get(l.as_str()).copied().unwrap_or(0.01))
            .sum();
        let mut progressed = false;
        for leaf in &leaf_ids {
            if chosen.len() >= target {
                break;
            }
            let w = weights.get(leaf.as_str()).copied().unwrap_or(0.01);
            let share = ((w / total_w) * remaining as f32).ceil() as usize;
            if share == 0 {
                continue;
            }
            if let Some(bands) = by_leaf.get_mut(leaf) {
                let order = [
                    band_cycle[cycle_idx % 3],
                    band_cycle[(cycle_idx + 1) % 3],
                    band_cycle[(cycle_idx + 2) % 3],
                ];
                let mut pulled = 0;
                while pulled < share && chosen.len() < target {
                    match pop_from(bands, order) {
                        Some(id) => {
                            chosen.push(id);
                            *taken.entry(leaf.clone()).or_insert(0) += 1;
                            pulled += 1;
                            progressed = true;
                        }
                        None => break,
                    }
                }
            }
        }
        cycle_idx += 1;
        if !progressed {
            break; // no more candidates anywhere
        }
    }

    chosen
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make(n_per_leaf: usize) -> Vec<DiagCandidate> {
        let mut v = Vec::new();
        for leaf in taxonomy::leaves() {
            for i in 0..n_per_leaf {
                v.push(DiagCandidate {
                    card_id: format!("{}-{}", leaf.id, i),
                    leaf_id: leaf.id.to_string(),
                    difficulty: (1 + (i % 5)) as u8,
                });
            }
        }
        v
    }

    #[test]
    fn covers_every_leaf_when_budget_allows() {
        let cands = make(10);
        let sel = select_diagnostic(&cands, 120, 42);
        assert_eq!(sel.len(), 120);
        // every leaf represented at least once
        let leaves = taxonomy::leaves();
        for leaf in &leaves {
            assert!(
                sel.iter()
                    .any(|id| id.starts_with(&format!("{}-", leaf.id))),
                "leaf {} missing from diagnostic",
                leaf.id
            );
        }
    }

    #[test]
    fn deterministic_for_seed() {
        let cands = make(10);
        let a = select_diagnostic(&cands, 120, 7);
        let b = select_diagnostic(&cands, 120, 7);
        assert_eq!(a, b);
    }

    #[test]
    fn no_duplicates() {
        let cands = make(10);
        let sel = select_diagnostic(&cands, 120, 99);
        let mut uniq = sel.clone();
        uniq.sort();
        uniq.dedup();
        assert_eq!(uniq.len(), sel.len());
    }

    #[test]
    fn respects_scarce_pool() {
        // only 40 cards available total
        let cands = make(1);
        let sel = select_diagnostic(&cands, 120, 1);
        assert_eq!(sel.len(), cands.len().min(120));
    }

    #[test]
    fn spreads_across_difficulty() {
        let cands = make(10);
        let sel = select_diagnostic(&cands, 120, 3);
        // reconstruct difficulty from index suffix -> ensure >1 band present
        let bands: std::collections::HashSet<usize> = sel
            .iter()
            .map(|id| {
                let i: usize = id.rsplit('-').next().unwrap().parse().unwrap();
                difficulty_band((1 + (i % 5)) as u8)
            })
            .collect();
        assert!(bands.len() >= 2);
    }
}
