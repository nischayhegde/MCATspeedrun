MVP--------------------------------------------------------------------------
I will build my MCAT study app as a fork of anki. It will have a ~2500 question bank of real MCAT questions. It will also have terminology flashcards (term-description pairs). These flashcards and questions will be across every topic/subtopic in the mcat. The app will start the user off with a diagnostic test. The diagonistic test will have multiple questions for every type of problem, topic, subtopic etc so we can get a holistic view of the student's strengths and weak points. The user will get a fluency, and application score based on their diagnostic test and how long they took to answer each question. Fluency measures whether the student has stored that knowledge inside their long-term memory, application score measures how well a student can apply that knowledge to complex problems. If a student has a high application score, they have a high fluency aswell, but its not vice-versa. We know a student is fluent, but cannot apply if they get the simple rote-memorization practice problems correct, but not the application problems. In the anki-powered study guide, the student will recieve both flashcards and practice problems based on spaced recall and interleaving. If they aren't fluent in a topic, they will only recieve flashcards until they become fluent. If they are fluent in a topic, they will recieve practice problems in that topic.

SCOPE (MVP): DESKTOP Anki only. The MVP adds the MCAT question bank + our scoring/study layer (diagnostic, fluency/application scores, auto-grading, and study-loop gating) on top of normal desktop Anki, all running locally against the local collection. Mobile apps and cross-device sync are DEFERRED to post-MVP (see the deferred section at the bottom). Flashcard short-answer grading is LLM-based (see GRADING & RATING); LLM explanation-grading for MCQ reasoning remains future work.

CONTENT TAXONOMY (AAMC blueprint)--------------------------------------------------------------------------
Tag tree: Section -> Foundational Concept (FC) -> Content Category (CC) -> Subtopic. Source: AAMC "What's on the MCAT Exam?" content outline. Every item is tagged with section, discipline, FC, CC, and (where available) subtopic.

TRACKING GRANULARITY (this resolves the diagnostic coverage question): content sections are tracked at the CONTENT-CATEGORY level - 31 CCs (commonly summarized as ~30); CARS adds 3 skill leaves, for 34 tracked leaves total. Finer AAMC subtopics are still tagged on every item for drill-down and future use, but the MVP does not gate on them.
TERMINOLOGY: elsewhere in this doc, "subtopic" = "the tracked leaf"; for the MVP the tracked leaf IS the content category.

SECTIONS (each section contributes equally, ~25%, to the 472-528 composite). Per-section discipline mix + FC weights (AAMC, approx to nearest 5%):

1. Chem/Phys (Chemical and Physical Foundations of Biological Systems) - 59 Q
   Disciplines: Gen Chem 30%, Biochem 25%, Physics 25%, Orgo 15%, Bio 5%
   FC4 (40%): 4A translational motion/forces/work/energy/equilibrium; 4B fluids & gas exchange; 4C electrochemistry & circuits; 4D light & sound; 4E atoms/nuclear/electronic structure
   FC5 (60%): 5A water & solutions (acid-base); 5B molecules & intermolecular forces; 5C separations & purification; 5D structure/function/reactivity of bio-relevant molecules; 5E thermodynamics & kinetics

2. Bio/Biochem (Biological and Biochemical Foundations of Living Systems) - 59 Q
   Disciplines: Bio 65%, Biochem 25%, Gen Chem 5%, Orgo 5%
   FC1 (55%): 1A proteins & amino acids; 1B gene -> protein; 1C heritable info & genetic diversity; 1D bioenergetics & fuel metabolism
   FC2 (20%): 2A assemblies of molecules/cells; 2B prokaryotes & viruses; 2C cell division/differentiation
   FC3 (25%): 3A nervous & endocrine systems; 3B other organ systems

3. Psych/Soc (Psychological, Social, and Biological Foundations of Behavior) - 59 Q
   Disciplines: Psych 65%, Soc 30%, Bio 5%
   FC6 (25%): 6A sensing the environment; 6B making sense of the environment; 6C responding to the world
   FC7 (35%): 7A individual influences on behavior; 7B social processes; 7C attitude & behavior change
   FC8 (20%): 8A self-identity; 8B social thinking; 8C social interactions
   FC9 (15%): 9A social structure; 9B demographics & processes
   FC10 (5%): 10A social inequality

4. CARS (Critical Analysis and Reasoning Skills) - 53 Q - NO content knowledge; skills only. INCLUDED in the MVP as an application-only track (see QUESTION TYPES). Tracked leaves = the 3 CARS skills: Foundations of Comprehension 30%, Reasoning Within the Text 30%, Reasoning Beyond the Text 40%. No content categories, no flashcards, no fluency gate.

BLUEPRINT WEIGHT w_i (for readiness/confidence): AAMC publishes weights down to the FC level, not per-CC. So approximate w_i(CC) = section_share x (FC_weight_within_section) / (number of CCs in that FC), refined later by counting items per CC in our bank. section_share = 1/4 across all four sections (CARS included). CARS's 1/4 is distributed across its 3 skill leaves by their AAMC weights (30/30/40).

READINESS COVERAGE: all four sections (including CARS) are modeled, so readiness maps to the FULL 472-528 composite with no gap.

QUESTION TYPES & SECTION SCOPE--------------------------------------------------------------------------
Item classes (the item-type tag carried by every card):

- Rote flashcard: term -> description recall (fluency building; the back doubles as instruction).
- Discrete practice problem: standalone MCQ requiring content knowledge (application).
- Passage-based practice problem: MCQ tied to a shared stimulus/passage (application); several questions may share one passage.
- Figure/data problem: a discrete or passage item that includes a figure/graph/table (the parser already extracts these).
  CARS is special: it uses NO outside content knowledge and is pure reading/reasoning, so the fluency (rote) axis does NOT apply. DECISION: CARS is INCLUDED in the MVP as an APPLICATION-ONLY track - no flashcards, no fluency gate. It has a CARS proficiency score (optionally split across the 3 CARS skills - Foundations of Comprehension, Reasoning Within the Text, Reasoning Beyond the Text), measured from correctness + time on FRESH passages. "Instruction" for CARS is strategy + answer-explanation review, not content.
  Passage handling: a passage is stored once and referenced by its child questions. A "fresh" application problem means a passage/stem the student has not seen; do not reuse a passage's questions to measure application twice.

SCORING MODEL (built on FSRS)--------------------------------------------------------------------------
Rationale: students are poor judges of their own learning (Hendrick), so we never rely on self-assessment to MEASURE fluency or open gates (flashcard answers are LLM-graded; see GRADING & RATING); the system measures fluency objectively (LLM-verdict recall consistency + FSRS durability for flashcards; correctness + latency for MCQs). Two scores drive everything, both computed as a LAYER ON TOP of FSRS. FSRS's per-card memory model (Stability = days for recall probability to fall to ~90%, Difficulty ~1-10, and derived Retrievability) decides WHEN a rote card returns; our layer decides WHICH mode a student is eligible for (rote/content vs application).

FLUENCY (per subtopic) = consistency + durability of rote knowledge. It is NOT the same as FSRS stability alone. It has two components:

1. Durability: FSRS retrievability/stability for the subtopic's rote cards (is the knowledge retained over time).
2. Consistency: spaced, verdict-backed correct recall. FLASHCARDS ARE UNTIMED (2026-07-03 spec): typed answers make latency dominated by typing speed, and the LLM verdict is already an objective correctness signal, so recall speed is no longer scored — what matters is being RIGHT across SPACED recalls. Full verdicts count 1.0, partial verdicts 0.5, misses 0; first-exposure misses are productive failure (instruction), not evidence.
   A subtopic is "fluent" only when, across >= [N] SPACED recalls, the student is consistently correct (LLM verdict) with FSRS retrievability >= [R_target], and there is enough evidence to be confident (see evidence rules). Recalls that happen too soon after the concept was shown (massed / high-retrievability) do NOT count toward fluency: a correct answer right after instruction is "unproductive success" and tells us nothing about retention (Article 7). Evidence weight is schedule-aware: a recall answered at its FSRS-scheduled due date is full evidence at any interval length; an early recall is proportionally weaker.

APPLICATION (per subtopic) = ability to apply the concept to novel MCAT-style problems. FSRS cannot measure this (it only knows "did you recall this card, how fast"), so it is a separate axis, measured from correctness + time on application-tagged problems. IMPORTANT: application uses FRESH problems every time. A solved application problem is never re-shown, because re-showing it would test memory of that specific item, not applied skill. Application practice is therefore spaced/interleaved at the SUBTOPIC level (draw a new problem from the pool), NOT per-card like rote flashcards.

EVIDENCE RULES (correctness is asymmetric):

- Incorrect = strong, immediate evidence of non-fluency. One wrong answer is enough to (re)open rote work for that subtopic — and re-opening the gate afterwards requires RE-EARNING the full evidence bar with post-lapse reviews (recovery-aware demotion; a single next-day correct never flips it back).
- A single correct = WEAK evidence. On 4-option MCQs a correct can be a lucky guess (~25%). The application score is CHANCE-CORRECTED — accuracy is mapped through max(0, (p - 0.25) / 0.75), so a blind guesser converges to ~0 — and "demonstrated application" requires >= APP_DEMONSTRATED_TARGET (1.3) effective spaced corrects AND corrected accuracy >= 0.5, never a single data point.
- Correctness evidence is DIFFICULTY-WEIGHTED (mcat::diff::N): a correct on a hard item, or a miss on an easy one, moves the estimate more than the reverse (evidence weight scaled by 1 +/- 0.15*(diff-3)).

GATE + IMPLICATION (rote before application; Article 6):

- Not fluent, no application evidence -> deliver rote content/flashcards only, until fluent.
- Fluent -> unlock application practice for that subtopic (fresh problems, interleaved across fluent subtopics).
- Bidirectional inference: demonstrated application IMPLIES fluency, so a student who solves application problems (in the diagnostic or later) is credited as fluent and SKIPS rote drilling for that subtopic. We never force a strong student through flashcards they don't need. "Demonstrated" uses the evidence threshold above (>= 1.3 effective spaced corrects + corrected accuracy >= 0.5); one lucky guess never opens the gate.
- CARS is EXEMPT from the gate: it is application-only (no rote/fluency stage), delivered as spaced practice of fresh passages.

ITEM TYPES delivered to the student (two):

1. Rote flashcards (term -> description): build fluency to threshold via FSRS-scheduled recall. The flashcard BACK doubles as the direct instruction/content: on first exposure (and immediately after productive failure) the student attempts, then the back teaches the concept. There is NO separate "content" item type.
2. Application problems: build/measure application once fluent (fresh items each time, subtopic-level spacing).

DIAGNOSTIC (prescription + productive failure):

- FORMAT: a fixed 120-question exam drawn from the bank, STRATIFIED-random to span (a) every subtopic / content category and (b) the full difficulty range (easy -> hard). Pure uniform-random wouldn't guarantee coverage or difficulty spread, so we stratify. ~120 items is roughly half a real MCAT (~2-3 hrs).
- COVERAGE: tracked leaves = 31 CCs (3 science sections) + 3 CARS skills = 34 leaves across all four sections (see CONTENT TAXONOMY). The 120 items include CARS passage sets, giving a floor of ~3-4 items per leaf (even coverage) with any remainder weighted by w_i toward high-yield leaves, so every tracked leaf is assessed. Finer subtopics are sampled, not exhaustively covered; unsampled subtopics inherit their CC prior and firm up during the study loop.
- DIFFICULTY spread lets us separate the two axes: easy item correct+fast -> fluent; hard item correct -> can apply; easy item wrong -> not even fluent.
- Purpose 1 - prescription: estimate initial fluency/application per subtopic and seed FSRS, so the study loop starts with no cold start.
- Purpose 2 - productive failure: deliberately show the student subtopics they likely cannot answer; the failure primes learning and is immediately followed by direct instruction/flashcards for that subtopic (Article 7). Diagnostic failures are logged as productive-failure events, NOT as FSRS lapses.
- Because the diagnostic samples only 1-few items per subtopic, its estimates are PROVISIONAL (low confidence) and are refined during the study loop before any hard gating decision.
- Diagnostic items count as SEEN and are removed from the fresh application pool (they can't later measure application), so reserve them within the diagnostic/application split.

PRODUCTIVE FAILURE vs LAPSE:

- Failure on FIRST exposure to a concept (diagnostic or first attempt) is expected and beneficial -> route to instruction, do not penalize as a memory lapse.
- Failure AFTER the concept has been learned is a genuine lapse -> FSRS drops stability and reschedules.

SCORE DYNAMICS: fluency durability decays naturally via FSRS retrievability. The consistency and application components are computed over a recency-weighted rolling window of attempts (exponential decay, tau = 21 days), and confidence grows with the number of spaced attempts. Application = chance-corrected accuracy x speed quality: accuracy (difficulty-weighted) is mapped through the guessing correction, then multiplied by a continuous speed factor in [0.7, 1.0] over correct answers only.

SPACING WEIGHTS (continuous, not a massed/spaced cliff — 2026-07-01 spec, schedule-aware 2026-07-03): every attempt's evidence weight scales with how much forgetting the recall fought through. Rote: when the card's scheduled interval is known (review phase), weight = clamp01((1 - 0.9^(elapsed/scheduled)) / 0.1) — answering ON SCHEDULE is full evidence at ANY interval length, answering early proportionally less; first exposures and learning steps fall back to clamp01(elapsed_days / 3), first-ever = 1. Application: weight = max(0.3, clamp01(leaf_gap_days / 1)) — same-day fresh problems are distinct items, so they keep a floor (this also lets the diagnostic seed estimates). Per-leaf evidence depth ("attempts") is the SUM of these weights, so ten crammed repeats never read as ten spaced data points. The fluency gate needs effective spaced-correct >= 2.0 (not a raw count; partial verdicts count 0.5, self-graded history 0.5).

EXPECTED TIME PER ITEM (MCQs only — flashcards are untimed): a slow answer only signals weakness if the item shouldn't take that long. The parser scores each question's reasoning_complexity (rc) and calculation_tedium (ct) 1-5; the importer tags them (mcat::rc::N / mcat::ct::N) and the per-kind latency thresholds are scaled by 1 + 0.15*(rc-3) + 0.15*(ct-3), clamped to [0.5, 2.0]. On top of that, a PER-STUDENT PACE FACTOR (median observed/expected time over correct timed MCQ answers, >= 20 samples, clamped [0.8, 1.25], stored in col config as mcatPaceFactor, refreshed on recompute) widens or narrows every MCQ threshold so a uniformly slow reader isn't misread as non-fluent. This feeds both auto-grading (Hard/Good/Easy) and the application speed-quality signal.

Prerequisite: every item is pre-tagged with topic, subtopic, and item-type (rote vs application). All content is real MCAT-style material from the curated bank; the LLM is used only to CURATE/select/tag (and later grade explanations), never to GENERATE problems (Articles 1, 9, 10).

Parameters to calibrate: [N] spaced recalls for fluency, [R_target], per-type MCQ latency thresholds, APP_DEMONSTRATED_TARGET / corrected-accuracy floor, DIFF_EVIDENCE_STEP, pace-factor clamp, FC_PRIOR_PSEUDO_N, confidence threshold for declaring fluency, diagnostic size (fixed at 120 total; items-per-subtopic follows from taxonomy size), and the split of the finite ~2500-item bank between the diagnostic and application pools (plus behavior when a subtopic's application pool is exhausted).

GRADING & RATING--------------------------------------------------------------------------
Two grading paths, by item type:

FLASHCARDS (rote) - TYPED + LLM-GRADED: the student TYPES a short description of the term (or clicks "I don't know" / submits empty to flip immediately, which grades Again with no LLM call). An OpenAI model (default gpt-5-mini, MCAT_GRADER_MODEL override; OPENAI_API_KEY loaded from questionbankparsing/.env at startup) grades the typed answer against the card back for MEANING, not wording, returning correct/partial/incorrect + a one-line feedback note. Mapping (UNTIMED — 2026-07-03): incorrect -> Again; partial -> Hard; correct -> Good. Response time never affects a flashcard's grade or score (typing speed is noise). Grading is MANDATORY (block-until-graded): transient failures retry with backoff (5 attempts, 2->60s), and on hard failure the card stays UNANSWERED with a Retry in the UI - there is NO self-grade fallback. Every graded review is persisted to the mcat_answer_log table (revlog id, verdict, typed answer, feedback, model) in the same transaction as the answer, making flashcard correctness OBJECTIVE: verdict-backed correct recalls count fully toward the fluency gate's spaced-correct requirement (partial = 0.5), while legacy self-graded reviews are discounted (SELF_GRADED_EVIDENCE_WEIGHT = 0.5).

APPLICATION / MCQ (discrete, passage-based) - AUTO-GRADED: these have a ground-truth answer, so we do NOT ask the user to self-grade. We AUTO-COMPUTE the FSRS rating from objective signals (correctness + time taken, captured as `rating` and `milliseconds_taken`):

- Wrong answer -> Again (lapse; stability drops)
- Correct but slow -> Hard
- Correct at normal speed -> Good
- Correct and fast -> Easy

OBJECTIVE FLUENCY SIGNAL: flashcard correctness is the LLM verdict (objective), not a button the student pressed, and flashcards are untimed — the fluency gate opens only on objective corroboration: consistent, spaced, verdict-backed correct recalls plus performance on auto-graded MCQs — never on a student self-declaring mastery. Anki still records answer latency (taken_millis) on every review; MCQ grading and the application speed-quality signal use it (pace-adjusted), flashcard scoring does not.

Caveats (see Scoring Model): (1) a correct on an auto-graded item is only PROVISIONAL evidence; the application score is chance-corrected and gate decisions require the demonstrated-application threshold (a 4-option MCQ can be guessed). (2) A wrong answer on FIRST exposure (diagnostic or first attempt) is PRODUCTIVE FAILURE routed to instruction, not an FSRS lapse; only post-learning failures are true lapses. Application problems are graded for correctness/time but never re-scheduled as the same item (fresh problems only).

For auto-graded items, FSRS needs only the pass/fail distinction (Again vs. the rest); the Hard/Good/Easy split (time-driven) modulates how much stability grows. Latency thresholds are per type (PLACEHOLDERS, to be calibrated):

- Rote flashcard: UNTIMED (no latency thresholds; the LLM verdict alone sets the grade)
- Discrete practice problem: fast < [Xs], slow > [Ys]
- Application practice problem: fast < [Xs], slow > [Ys]
- CARS/passage-based: fast < [Xs], slow > [Ys]

Note: FSRS's default parameters are trained on human self-grading behavior, so the auto-graded path may be slightly miscalibrated at first. This self-corrects: Anki's parameter optimizer refits the FSRS parameters to our actual rating distribution once enough review history accumulates.

STUDY LOOP (session/queue algorithm)--------------------------------------------------------------------------
There is ONE unified study session (no separate "flashcard" vs "application" tabs). When the student clicks "Study," `build_queue` (rslib/src/mcat/scheduler.rs) assembles a single interleaved queue and each item is presented in the mode its note type dictates (self-graded flashcard vs auto-graded MCQ). Candidate selection + priority (higher `due` = scheduled sooner):

1. Maintenance rote (highest): flashcards FSRS marks due for ANY subtopic, INCLUDING fluent (gate-open) ones - once fluent we stop introducing NEW rote but keep surfacing genuinely-due cards so durability doesn't decay. Priority scales with how overdue the card is.
2. New rote (builds fluency): for subtopics that are NOT yet fluent (gate closed / lapsed), introduce new flashcards. Ranked just under maintenance because rote fluency is the gate that unlocks everything else. Subject to Anki's max-new/day.
3. Application MCQs: FRESH (never-seen) problems for subtopics whose fluency gate is OPEN (or CARS, always open; or a subtopic with NO rote cards at all, whose gate could otherwise never open - no rote path exists, so its MCQs bypass the gate). One-shot: once answered, an MCQ is never re-served, so we do NOT apply per-leaf day-spacing (that would starve the loop right after the diagnostic); instead PER_LEAF_MAX (<=3/subtopic/session) + interleaving prevent over-drilling. Priority = base + recency (rotates practice across subtopics) + staleness boost (recalibration) + NEED boost (APP_NEED_BOOST * (1 - application score)): the weaker a subtopic's application score, the sooner its MCQs are scheduled - working on application for weak topics is the point of the loop.
4. Thin-session fallback: if too few candidates qualify, pull new content from unassessed leaves, high-w_i (high-yield) first.
5. INTERLEAVING: round-robin across subtopic buckets so no two same-subtopic items are back-to-back, mixing rote and application.
6. Limits/order: sort by the `due` priority, then apply caps - PER_LEAF_MAX per subtopic, StudyConfig.new_per_day for new cards, StudyConfig.session_size total. RESERVED APPLICATION SHARE: APP_RESERVE_FRAC (1/3) of the session's slots are reserved for application MCQs (filled highest-priority first) before the rest is filled by priority, so an arbitrarily overdue rote backlog can never starve application out of a session.
   DEMOTION (lapse -> rote, recovery-aware): if a fluent subtopic lapses (a genuine post-learning miss - detected in aggregate.rs), its fluency gate CLOSES; the student resumes new+due rote for it until re-fluent, and application practice pauses for that subtopic. Re-opening requires the SAME evidence bar as the first time, counted only from post-lapse reviews (spaced-correct >= 2.0 rote, or the demonstrated-application threshold), so the gate cannot oscillate on a single next correct answer.
   CARS: no rote/flashcard phase and no gate; scheduled as spaced practice of FRESH passages at the CARS-skill level, interleaved into the session like application items.
   SESSION SIZE: count-boxed via StudyConfig.session_size (default in model.rs); the queue also respects Anki's max-reviews/day and max-new/day.
   POOL EXHAUSTION: because MCQs are one-shot, once a subtopic's fresh application pool is exhausted the scheduler simply stops drawing new application for it and relies on rote maintenance (FSRS) to hold the subtopic; re-exposure of seen MCQs is intentionally NOT done.
   NO SESSION SUMMARY: finishing a session routes straight back to the Dashboard (whose readiness/confidence already reflect the just-answered items); there is no interstitial summary screen.

DIAGNOSTIC ALGORITHM (stratified-random)--------------------------------------------------------------------------
Implemented in rslib/src/mcat/diagnostic.rs (select_diagnostic) and exposed via the GetMcatDiagnostic RPC. Goal: a ~120-question exam that COVERS every subtopic with a SPREAD of difficulty, rather than a naive "random 120" that leaves coverage to chance.

1. Bucket every candidate MCQ by leaf, then by difficulty band (easy 1-2 / medium 3 / hard 4-5). Difficulty comes from the `mcat::diff::N` tag (parser difficulty.overall; unknown -> 3/medium).
2. BREADTH first: take one item from every leaf that has questions, preferring a medium-difficulty item (order medium->easy->hard) so a topic's first taste isn't a fluke either way.
3. WEIGHTED FILL: distribute the remaining budget proportional to each leaf's blueprint weight w_i (high-yield areas get more items), cycling difficulty bands for spread, until the target is hit or the pool is exhausted.
4. DETERMINISM: selection is seeded (xorshift64* PRNG) and fully reproducible for a given seed - candidate/band ordering is sorted before any RNG use so collection-query order can't perturb it. This makes the diagnostic testable and repeatable.
   NO MID-EXAM FEEDBACK: the diagnostic returns MCQ items with no correctness revealed; the UI shows one at a time, records choice + latency, and only surfaces results at the end. Answers are auto-graded through the same answer_mcat_card path as normal study (productive-failure first exposures), then readiness is recomputed for the results screen.

LLM integration: in the future, we will make the student write a short explaination of their answer choice in both the diagnostic test and in the practice problems. These explanations will be graded by the LLM so we can know if the student has actually mastered a topic, or is trying to reason too hard about a problem because they aren't actually fluent, or is just guessing, or has a wrong methadology and got lucky.

DASHBOARD--------------------------------------------------------------------------
The dashboard's headline is a READINESS number with an attached CONFIDENCE score, plus a per-tag breakdown of fluency/application.

READINESS (point estimate — evidence-shrunk, 2026-07-01 spec):

- Per subtopic, compute raw mastery m_i in [0,1] blending the two scores, application-weighted because the MCAT tests application (fluency alone must never read as "ready"): m_i = clamp(0.4*fluency_i + 0.6*application_i). Result: not fluent ~0; fluent-not-applied ~0.4; applied up to 1.0. [weights tunable] For CARS leaves there is no fluency term: m_i = CARS proficiency (application-only).
- SHRINKAGE (FC-pooled, 2026-07-03): the raw estimate can't tell a lucky guess from real skill, so it is pulled toward a prior in proportion to how little evidence backs it: n_i = attempts_i * freshness_i (effective spaced evidence, stale-discounted); w = n/(n+5); m_adj = w*m_i + (1-w)*prior_i. The prior is POOLED from the leaf's foundational-concept siblings — prior_i = (Sum sibling n_j*m_j + 10*0.1) / (Sum n_j + 10) — so a thin leaf whose concept-mates are strong reads like them instead of like an unknown (ability correlates within a concept; the confidence model already assumes rho = 0.3). With no sibling evidence this reduces to the flat 0.1 prior: cold collection reads ~478, not 472; thin evidence never reads as mastered; with deep evidence m_adj converges to the raw score.
- Weight each content category by exam importance w_i (AAMC blueprint; derivation in CONTENT TAXONOMY).
- Readiness = Sum(w_i * m_adj_i) / Sum(w_i), shown as 0-100 AND mapped to a projected scaled-score band via a calibration function (rough linear map now; refit once real score outcomes exist). All four sections (including CARS) are modeled, so readiness maps to the full 472-528 composite.

CONFIDENCE (how much to trust the number — variance-propagated, replaces the v1 cbrt heuristic):

- Each leaf's estimate carries sigma_i = 0.5 / sqrt(1 + n_i). Readiness sigma combines an independent term with a fully-correlated term (rho = 0.3), because student ability is correlated across leaves — pure independence over 34 leaves would read ~6x too confident: sigma^2 = (1-rho)*Sum((wbar_i*sigma_i)^2) + rho*(Sum(wbar_i*sigma_i))^2.
- confidence_band = round(1.96 * sigma * 56) points on the 472-528 scale, clamped [1, 28]; confidence% = 100*(1 - sigma/sigma_0) where sigma_0 is the zero-evidence sigma (so cold = 0%, and it rises as evidence accumulates: ~50% / ±16 after a diagnostic, ~78% / ±7 after deep study).
- Coverage / Depth / Freshness remain as reported diagnostics on the dashboard (Depth uses effective spaced attempts).
- Future upgrade (deferred): full Beta posterior per leaf with persisted pseudo-counts; the shrinkage model above is its cheap approximation and was chosen to avoid schema churn.

PER-TAG BREAKDOWN: for each tag (topic -> subtopic) show fluency %, application %, a confidence/evidence-depth indicator, and the two-stage state (Fluent outline -> Applied filled). This is the "know my strengths/weak points by tag" view.

GAMIFICATION (8-bit boxer)--------------------------------------------------------------------------
An ambient, non-blocking 8-bit boxing animation on the review/dashboard screen: the USER's boxer faces an OPPONENT. It is deliberately "slight" (skippable/muteable, cosmetic only, never blocks study). Its states map 1:1 to our grading signals, and the training-vs-fight split mirrors the fluency -> application gate.

- During FLASHCARDS (rote / fluency-building): the user's boxer JUMP-ROPES (training montage). Rote practice = training.
- During APPLICATION problems (the "fight"):
  Miss (wrong) -> the opponent LANDS A PUNCH on the user's boxer.
  Correct but SLOW -> the user's boxer BLOCKS a punch (defends; reasoned it out but not automatic).
  Correct and FAST -> the user's boxer LANDS A PUNCH on the opponent (automatic recall).
- OPPONENT size/muscularity scales with QUESTION DIFFICULTY (from the per-question difficulty tag / FSRS difficulty): harder question = bigger, more muscular opponent.
- USER boxer size/muscularity scales with the READINESS number: as readiness rises, the boxer gets fitter/stronger.
- Framing stays consistent with productive failure: a hit is never punitive messaging, just the visual. [OPTIONAL later: a session = a "match" with an opponent health bar that depletes as the user lands punches; clearing due application problems wins the round.]

FRONTEND / SCREENS--------------------------------------------------------------------------
Relationship to stock Anki: we REPLACE Anki's deck-list home with our Dashboard (deckbrowser.py loads the /mcat SvelteKit route and hides the bottom toolbar) and REPLACE the reviewer with our own study screen. Anki's Browser/Stats/Settings remain as dev/power-user tools but are not primary UX. All MCAT screens live under the SvelteKit route tree `ts/routes/mcat/**` (TypeScript/Svelte over the Rust backend via protobuf RPC, exposed through mediasrv.py). A shared `+layout.svelte` provides the "MCAT Speedrun" brand + top nav (Dashboard / Study / Diagnostic) and is dark-mode aware (uses Anki theme tokens --canvas/--canvas-elevated/--fg/--border with an accent).
Screens (MVP, as built):

1. Onboarding / first-run: capture target test date + target score; explain and launch the diagnostic. [planned]
2. Diagnostic (ts/routes/mcat/diagnostic): intro -> exam -> results in one flow. The exam presents the diagnostic one question at a time - PARSED IMAGE (choices included) + letter-only A/B/C/D (also keyboard A-D); progress bar; captures choice + latency; NO feedback until the end; "Finish early" allowed (answered items still count). Results show readiness + confidence and a by-section correctness breakdown, with CTAs to Study or Dashboard.
3. Dashboard (ts/routes/mcat, McatDashboard.svelte): readiness score (472-528) + confidence band, per-subtopic fluency/application bars grouped by section with gate (locked/unlocked) state, subtopics-assessed count, and primary CTAs "Study now" / "Take diagnostic" / "Recompute". Hosts the boxer animation [planned].
4. Study (ts/routes/mcat/study, StudyPage.svelte): ONE unified, interleaved queue (no separate flashcard/application tabs). Each item renders in its own mode - FLASHCARD: front -> typed short answer (Enter submits, Esc/"I don't know" flips immediately) -> LLM verdict chip + one-line feedback -> Continue; MCQ: parsed question image + letter-only A/B/C/D (keys A-D), then inline feedback revealing correct letter + explanation and a Continue. Progress bar; latency captured for both; on completion routes back to the Dashboard. NO session-summary screen.
5. Tag browser: drill into any subtopic to see its scores, evidence depth, and gate state. [planned - dashboard bars are the interim view]
6. Settings: boxer animation on/off, daily new/review limits, advanced latency-threshold overrides (hidden by default). [planned]
   [RESOLVED 2026-07-02: rote flashcards are TYPED + LLM-GRADED (no grade buttons); MCQs remain auto-graded from choice + latency. Both modes live in the single StudyPage; flashcard latency is still recorded for the automaticity signal. See GRADING & RATING.]

USER-PERSONA--------------------------------------------------------------------------
Motivated students who have been struggling to study effectively for the MCAT using traditional question banks and resources.

USER-STORIES--------------------------------------------------------------------------
I want the app to estimate my readiness for the exam.
I want the app to be given practice problems/flashcards which get me up to speed in topics I am weak at.
I want the app to explain why I got a problem wrong.
I want the app to use both rote-memorization flash cards, and real MCAT practice problems to get me fluent in both memorization and appliciation.
I want the practice problems to be from real MCAT exams and not AI generated slop.
I want the app to be slightly gamified to make studying fun.

Deferred to post-MVP:
I want to be able to use this app from both my desktop and my mobile device.
I want my progress to sync between my desktop and mobile device.

DATA MODEL--------------------------------------------------------------------------
Built on Anki's existing objects (notes, cards, note types/fields, tags, revlog) plus a small amount of custom state; avoid schema changes where possible. MCQ content comes directly from questionbankparsing output (one folder per accepted question: image.png composite + data.json with stem/choices/context/answer/tags/difficulty/validation).

PRESENTATION (this decision - option 2):

- QUESTIONS are shown to the user as the PARSED IMAGE (the parser's composite PNG, which already includes the stem, any passage/figure/table, AND the four answer choices) - preserving figures, chemical structures, equations, tables, and Roman-numeral formatting that a text transcription can lose.
- ANSWER SELECTION is via LETTER-ONLY buttons (A/B/C/D): the choice text is read from the image, the student clicks the letter, and auto-grading compares the selected letter to answer.letter (+ time). No separate text rendering of the choices and NO compose.py change - we display the composite as-is. The parsed `choices` A-D text is still stored as metadata (search / accessibility / analytics), just not separately rendered.
- The correct-answer EXPLANATION is TEXT (parser `answer.explanation`).
- FLASHCARDS are TEXT (term -> description, from flashcards.py); the back doubles as instruction.

NOTE TYPES:

- MCQ note (discrete / passage / CARS): fields {QuestionImage (parsed composite PNG - includes stem + choices + any context), ChoiceA-D (text, metadata only), CorrectLetter, Explanation (text), ContextText (optional passage/figure transcript, for search/accessibility), + tag fields}. The reviewer renders QuestionImage and shows letter-only A/B/C/D buttons; grading uses CorrectLetter.
- Flashcard note: fields {Term, Description/Instruction} (text). Self-graded (see GRADING & RATING).
- Shared passages/figures need no separate note for the MVP: the parser already composites shared context into each dependent question's image (context.shared_with).

INGEST / IMPORTER (parser -> Anki): implemented in mcat_tools/importer.py (import_all). Two note types are created on demand: "MCAT MCQ" {McatId, Question, Image, A-D, Answer, Explanation} and "MCAT Flashcard" {McatId, Front, Back}. For each question dir (data.json + image.png): copy image.png into collection media and store `<img src="...">` in Image; stem->Question, choices.{A..D}->A-D, answer.letter->Answer, answer.explanation->Explanation; tag with the leaf + `mcat::app` + `mcat::diff::N`. flashcards.deduped.jsonl -> Flashcard notes, each tagged with the leaf inferred from its linked question_ids (most-common leaf). The importer is IDEMPOTENT (skips notes whose McatId already exists) and skips CARS flashcards / items with no resolvable leaf. Verified end-to-end importing the full parsed bank (~1900 MCQs + ~5400 flashcards) - see IMPLEMENTATION STATUS.

TAG CONVENTIONS (the actual join keys read by rslib/src/mcat/leaf_tag.rs + adapter.rs):

- Leaf: `mcat::cc::<CC>` (e.g. mcat::cc::4B) for science content categories; `mcat::cars::<SKILL>` (e.g. mcat::cars::CARS1) for CARS. Bare `<CC>` and subtopic children (`mcat::cc::4B::...`) also match.
- `mcat::app` marks a note as an application/MCQ item (CARS notes are always application); absence => rote flashcard.
- `mcat::diff::<N>` carries overall difficulty 1-5 (drives the diagnostic difficulty spread).
  The parser's richer tags (discipline/FC/subtopics) are still stored for drill-down/search.
  PER-CARD STATE: FSRS memory state (existing revlog + card memory) is the source of truth; per-attempt signals (correct?, latency, productive-failure/massed) are reconstructed from the review log in adapter.rs rather than requiring a new per-attempt table. Typed-answer flashcard reviews additionally persist a row in `mcat_answer_log` (rslib/src/storage/mcat/) linking the revlog entry to its LLM verdict, the student's typed answer, feedback, and model - the objectivity marker for the fluency gate and the archive for future explanation-grading.
  PER-SUBTOPIC STATE (fluency%, application%, attempts, freshness, assessed, gate open/closed): [DECISION - persisted] stored in a new SQLite table `mcat_leaf_state` (rslib/src/storage/mcat/, created in open_or_create). It is DERIVED by recomputing from revlog + FSRS memory (aggregate.rs) and upserted: incrementally on each answer_mcat_card, and fully via RecomputeMcatLeafStates (after import or a diagnostic). ComputeMcatReadiness reads this table. This gives fast dashboard reads with always-recomputable state.
  CONTENT vs PROGRESS: the bank ships as notes/cards (parsed images as media) in a base collection; user progress lives in revlog + card state + custom_data (this split is what the deferred sync design relies on).

TECHSTACK--------------------------------------------------------------------------
I will build inside of ankis existing tech stack. I will use the rust backend and the protobuf defined RPC to communicate.

The MVP targets DESKTOP Anki only and runs entirely LOCALLY against the existing collection; no networking changes are needed. The MCAT question bank, diagnostic, scoring layer (fluency/application), auto-grading, and study-loop gating are all built on top of the existing local Rust backend, communicating over the existing protobuf RPC. No changes to the local-process model for the MVP.

desktop frontend: pyQT -> typescript (existing stack)

IMPLEMENTATION STATUS (as built)--------------------------------------------------------------------------
BACKEND (Rust, rslib/src/mcat/): the scoring/scheduling layer is a set of pure modules ported from the TypeScript reference engine -

- model.rs (types, StudyConfig, readiness/confidence structs), taxonomy.rs (34 leaves incl. 3 CARS, blueprint weights), scoring.rs (grade_mcq, mastery, readiness clamped 472-528, confidence), aggregate.rs (per-leaf fluency/application/gate/freshness with bidirectional fluency inference + lapse-driven demotion), scheduler.rs (build_queue + interleave), diagnostic.rs (stratified-random select_diagnostic), leaf_tag.rs (tag->leaf), adapter.rs (bridges Anki notes/tags + revlog + FSRS memory into the pure layer, and persists leaf state).
- Grading: MCQs auto-graded from correctness + latency (pace-adjusted); flashcards typed + LLM-graded, UNTIMED; both flow through FSRS. Built on Anki's real FSRS scheduler (not a parallel scheduler) - FSRS owns rote scheduling; our layer adds the fluency/application/gate scoring on top.
  STORAGE: `mcat_leaf_state` table (rslib/src/storage/mcat/{create,get,upsert}.sql + mod.rs), created in sqlite.rs open_or_create.
  RPCs (proto/anki/scheduler.proto, impl in rslib/src/scheduler/service/mod.rs, exposed to the webview in qt/aqt/mediasrv.py): ComputeMcatReadiness, RecomputeMcatLeafStates, GetMcatStudyQueue, AnswerMcatCard, GetMcatDiagnostic. Python bindings auto-generated in pylib (_backend_generated.py); TS bindings in ts/lib/generated/backend.ts.
  FRONTEND: SvelteKit routes under ts/routes/mcat/** (dashboard, study, diagnostic) with a shared branded, theme-aware layout; deckbrowser.py loads /mcat as the home.
  IMPORTER: mcat_tools/importer.py (idempotent parser->Anki ingest, above).
  TESTS: 29 Rust unit tests in rslib/src/mcat/** (taxonomy, scoring, aggregate, scheduler, diagnostic determinism/coverage/spread, adapter helpers) all pass. Headless E2E (mcat_tools/e2e_test.py, run via out/pyenv against the built pylib) imports the full parsed bank (~1900 MCQs + ~5400 flashcards), runs cold readiness -> deterministic diagnostic (120 items across 33 leaves / 4 sections) -> auto-graded answers -> recomputed readiness (472->~508, confidence band tightens) -> interleaved study queue (rich rote+MCQ mix, no adjacent same-subtopic, answered MCQs not re-served) -> final readiness. All checks pass.
  BUILD NOTE: after adding rust source files, reconfigure (regenerate build.ninja) so the CargoBuild input globs pick them up; `tools\ninja pylib` then rebuilds _rsbridge.pyd. `tools\ninja check:svelte` typechecks the frontend.
  LLM SHORT-ANSWER GRADING (flashcards): built - rslib/src/mcat/grader.rs (verdict model + OpenAI structured-output client with retry/backoff) + the AnswerMcatCardTyped RPC (proto/anki/scheduler.proto, impl in scheduler/service/mod.rs on Backend) + mcat_answer_log persistence + the typed StudyPage flow. Verdict-backed correctness feeds the fluency gate (self-graded reviews discounted); grading is untimed (verdict alone sets the FSRS grade). Specs: docs/superpowers/specs/2026-07-02-llm-flashcard-grading-design.md, docs/superpowers/specs/2026-07-03-objective-evidence-scoring-design.md.
  NOT YET BUILT: 8-bit boxer animation, onboarding screen, standalone tag-browser + settings screens, LLM explanation grading for MCQ reasoning (all noted inline above).

DEFERRED (POST-MVP): MOBILE & SYNC--------------------------------------------------------------------------
Not part of the MVP; captured here so the analysis isn't lost. When we add mobile + cross-device sync:

- Do NOT expose the backend's protobuf RPC over a port: it's an in-process API with no auth/TLS, it assumes a single collection owner (one SQLite writer), and it kills offline use. It is not a network API.
- Reuse Anki's EXISTING sync system already in this fork: sync server rslib/src/sync/http_server (axum; HostKey/Meta/Start/ApplyGraves/ApplyChanges/Chunk/ApplyChunk/SanityCheck2/Finish/Upload/Download + media), sync client rslib/src/sync/http_client, HostKey auth (username/password -> token, password_hash per user in sync/http_server/user.rs) + TLS.
- LOCAL-FIRST: each device runs its own backend + local collection and works offline; only per-user progress syncs (conflict detection already handled via sanity check + graves + chunked changes). Host the sync server centrally (like AnkiWeb) rather than on the desktop, to avoid NAT/port-forwarding.
- SHARED CONTENT vs USER PROGRESS: ship the ~2500-item bank as a versioned base deck; sync only progress; define a content-update path for shared-deck updates.
- Mobile client decision (deferred): embed rslib in React Native via a native module (uniffi/FFI) for true offline, vs. thin client (no offline). mobile frontend: react native on expo (needs an EAS dev/prod build, not just Expo Go).
