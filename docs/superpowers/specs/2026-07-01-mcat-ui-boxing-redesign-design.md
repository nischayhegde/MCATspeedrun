# Scorefighter UI/UX + Fight Scene Redesign — "Quiet Corner, Loud Punch"

Date: 2026-07-01
Status: Approved by user (design + pre-answer opponent visibility)

## 0. Goals & decisions log

Redesign the MCAT trainer (`ts/routes/mcat/`) to be beautiful and functional yet
non-distracting, and replace the boxing animation with a dramatically better
fight scene: varied animations, varied musculatures, and fantasy opponents
(muscular centaur/minotaur) for extremely difficult questions.

User decisions (locked):

1. Difficulty is REAL: authored `mcat::diff::N` tags (1–5) + FSRS memory-state
   difficulty, exposed through the proto. Full-stack change approved.
2. Fight tech: rigged inline SVG figures, CSS keyframe animation. No canvas,
   no 3D, no external image assets, no audio.
3. Keep the red & black Scorefighter palette (crimson/deep-red/gold on
   near-black navy).
4. Study mode shows the opponent and difficulty pips BEFORE answering
   (pre-fight calibration is intentional). The diagnostic stays blind
   (heavy-bag mode, uniform reaction for every answer).

Design provenance: 3-way design panel (game-feel / focus-first / systems-first)
judged by 3 lenses (student, animation craft, implementing engineer). Winner:
game-feel, with the judges' converged grafts folded in below.

## 1. Design philosophy

The study surface is a silent, disciplined corner — calm type, one accent,
zero idle noise. All of the juice is compressed into the ~700ms after an
answer is committed, the one moment attention is free. Every hit follows the
classic game-feel grammar — anticipation → contact frame → hit-stop →
follow-through → settle — so a 100ms freeze delivers more impact than any
amount of continuous wiggle. Difficulty becomes legible fiction: real
authored+FSRS difficulty picks the opponent's species and mass, so "this is a
hard question" is communicated by a minotaur's silhouette instead of a number.
The metaphor is load-bearing: flashcards are *training* (gym, bag, jump rope),
MCQs are *fights* (opponent in the ring), the diagnostic is *fight camp*
(heavy bag, no scoring leaks) — mirroring the app's fluency-gate → application
model.

Layout law: **the layout never moves while the student reads.** The ring strip
is constant-height; shake is ring-local; feedback text renders the instant the
backend answers and never waits on animation.

## 2. Token layer & typography

All changes land in `+layout.svelte` `.mcat-shell`. Keep the existing nine
`--sf-*` tokens verbatim. Add:

```scss
/* semantic status — kills the #2fd67a/#22c55e/#ef4444/#ff5d6c/#3b82f6 drift */
--sf-ok: #2fd67a;        --sf-ok-deep: #1a9d55;
--sf-err: #ff5d6c;       /* feedback red, deliberately NOT brand --sf-red */
--sf-warn: #f5a03c;
--sf-steel: #566073;     /* neutral chrome: IDK, blocks, secondary */
/* geometry + elevation rhythm */
--sf-r-sm: 8px; --sf-r-md: 12px; --sf-r-lg: 16px;
--sf-shadow-1: 0 1px 3px rgb(0 0 0 / 30%);
--sf-shadow-2: 0 12px 34px rgb(0 0 0 / 45%);
/* keyboard-first focus */
--sf-focus: 0 0 0 2px var(--sf-canvas), 0 0 0 4px var(--sf-gold);
```

Rules enforced across all mcat files:

- Delete every per-rule hex fallback (`var(--sf-red, #e11d2f)` → `var(--sf-red)`).
  Safe: every mcat component renders under `.mcat-shell`. Kills the stale
  indigo `#6366f1` / blue `#3b82f6` fallbacks outright. Blue is banned.
- Radii unify to the three tokens: cards `--sf-r-md`, buttons/chips
  `--sf-r-sm`, ring & hero panels `--sf-r-lg`.
- `:focus-visible { box-shadow: var(--sf-focus); outline: none; }` on every
  interactive element.
- Typography (system-ui is reality — Inter is never loaded; `--mcat-font`
  becomes `system-ui, "Segoe UI", -apple-system, sans-serif`): base 15px/1.55;
  stem/passage **17px/1.6**; H1 28px w800; section headers 13px uppercase,
  tracking 0.08em, `--sf-dim`; micro/meta 12px; scores keep the gold-gradient
  treatment at 64px (dashboard) / 44px (results). `font-variant-numeric:
  tabular-nums` on every number.
- Spacing on a 4px grid: intra-component 8px, between components 12px,
  between sections 20px, page padding 16–20px.
- Palette art direction for opponents: saturation cap ≤55%; gold/red trim
  quota grows with tier so bosses "borrow the hero's crimson to read regal";
  Gravel's magma seams are the first opponent element carrying brand red.

## 3. UI refinement per screen

### 3.1 Shell / nav

Keep the rope-line box-shadow signature. Nav padding tightens to
`0.55rem 1.25rem` (~48px tall). Active nav pill becomes a 2px gold underline
(`box-shadow: inset 0 -2px 0 var(--sf-gold)`) instead of a red wash — a red
pill in the periphery is an attention magnet while reading. On study and
diagnostic routes the nav's right side shows a dim micro kbd legend:
`A–D answer · 0 not sure · ↵ confirm`.

### 3.2 Dashboard (McatDashboard.svelte)

Emphasize the score, the three weakest topics, one primary action; quieten
machinery and jargon.

1. Scorecard header keeps the SCORECARD label and corner-bar signature. The
   coverage/depth/freshness triple collapses to one sentence — *"Estimate is
   rough — you've assessed 41% of the blueprint."* — with a `details`
   disclosure ("How is this computed?") revealing the three bars. `±7 pts`
   stays; `62% confidence` goes.
2. Actions: `Study now` (primary red gradient) and `Take diagnostic`
   (secondary: `border: 1px solid var(--sf-steel); color: var(--sf-text)`).
   The **Recompute button is deleted** — recompute runs automatically
   (debounced) on dashboard load. (Implementation caveat: measure recompute
   latency first; if it's slow, run it fire-and-forget with a stale-data
   shimmer instead of blocking.) `Reset progress` moves into a `⋯` overflow
   menu at the header's top-right. Destructive red leaves the hero panel.
3. New signature: **"NEXT OPPONENTS"** row under the scorecard — the three
   weakest *assessed* leaves rendered as tale-of-the-tape fight cards: a
   static `FighterRig` portrait (pose `guard`, ~64px) of the species that
   leaf's weakness maps to (`tierFromMastery(1 − fluency·0.6 −
   application·0.4)`), leaf name, fluency/application micro-bars, and a
   `Fight →` button (links to `/mcat/study`; targeted sessions are a backend
   follow-up).
4. Leaf cards: name first, wrapping to 2 lines (`-webkit-line-clamp: 2`);
   leaf-id demoted to a dim mono chip. Gate chip copy: `locked` → `🔒 fluency
   first`. Remove the hover lift until cards are actually clickable.
5. Reset dialog a11y: `<svelte:window on:keydown>` Escape while open,
   autofocus on Cancel.

### 3.3 Study (StudyPage.svelte) — the flagship

Column order (fixes "decoration above orientation"):

```
┌ progress row: [Exit] [———red fill———◆pace] [timer 0:42] [12 / 30] ┐  30px
┌ RING STRIP — marquee: "1B · Enzymes  ●●●●○  vs BULLHORN · TIER 5" ┐  ~100px constant
┌ QUESTION CARD (flex: 1, keeps ≥55% height even after answering)   ┐
┌ choices: [A][B][C][D] each with <kbd> hint → collapses to chips   ┐  56px → 40px
┌ [Not sure — show me  ⓪]                    → feedback panel       ┐  34px
```

- Progress row moves above the ring. The standalone `.tag-line` is deleted;
  leaf-id/name/section + difficulty pips (`●●●○○`, gold-deep, title-texted)
  become the ring's **marquee** (11px dim mono inside the strip's top edge),
  doubling as the fight card. Pips + opponent are visible pre-answer by
  design (user-approved). Pips are hidden during the diagnostic.
- **Constant-height ring strip (~100px).** No height animation on answer
  (the panel's "dock pump" idea is rejected per judge consensus — layout
  shift while reading the explanation). Spotlight moments happen via
  lighting/FX *within* the fixed strip.
- Timer (new): dim `m:ss` (12px, opacity .55, tabular-nums) beside the
  counter, plus a 6px gold **pace diamond** at the 15s-equivalent position on
  the progress track that fades to steel when `FAST_MS` passes. Click to hide
  (localStorage `sf-timer-hidden`).
- **Answer flow inversion** (single biggest UX fix): on answer the question
  card stays full-height; the choice grid collapses to a 40px row of graded
  letter chips (picked = filled; correct = `--sf-ok` ring + ✓; wrong pick =
  `--sf-err` + ✗ — icon + color, never hue alone); the IDK button unmounts;
  the feedback panel (`border-left: 4px solid var(--sf-ok|--sf-err)`) slides
  up 8px/160ms into the reclaimed space with `Continue ⏎` right-aligned.
  Students review explanations while still seeing the stem. Delete
  `.card.question.answered { flex: 0 1 34% }`.
- Keyboard discoverability: every choice gets a right-aligned `<kbd>` chip
  (18×18px, 1px `--sf-steel` border, radius 4px, 11px dim): `A–D`, `0` on
  IDK, `␣` on Continue/Show answer, `1–4` on ratings.
- IDK reframed: label `Not sure — show me` + `⓪`; hover/selected color
  `--sf-steel`, not red. Feedback header for IDK: **"Good call — the answer
  is B."** Boxer reaction is a defensive round, not a beating.
- Flashcard ratings recolor to palette: Again `--sf-err`, Hard `--sf-warn`,
  Good `--sf-text` on `--sf-steel` border, Easy `--sf-ok`. Kbd hints `1–4`.
  Advance stays instant; each rating fires a matching training beat in the
  ring — the ring is the confirmation toast.
- Empty state gains a next step: "Nothing due right now — next cards due in
  ~2h · 34 answered today" (needs a tiny backend count; degrade to current
  copy if absent).

### 3.4 Diagnostic + results (DiagnosticPage.svelte)

- Exam ring: bag mode, fixed 88px, no marquee tier info, no pips (difficulty
  display mid-exam would psych students out; the MCAT doesn't do it). Bag set
  gets the expanded 8-strike rotation so 200 answers never loop visibly.
- **Two-step commit (exam only):** first click/keypress selects (gold 2px
  ring, nothing submitted); second activation of the same choice or `Enter`
  locks and advances. A dim "press again to lock in" hint appears on first
  selection, first 3 questions only. Study keeps single-tap (highest-volume
  interaction; feedback is immediate and stakes are per-card).
- Finish early gets a confirm dialog: *"Submit now? 37 answered · 63
  unanswered."* with `Keep going` autofocused.
- Results hierarchy: headline is the diagnostic's own result — **"31 / 59
  correct (53%)"** in the 44px gold-gradient treatment — then the readiness
  **delta**: `Readiness: 498 → 506 (+8) / 528 (±7)` (fetch
  `computeMcatReadiness({})` pre-exam in `diagnostic/+page.ts` to have the
  before-value), then sections sorted worst-first, each row with a
  `Train this →` CTA. The results flourish keys off the diagnostic pct.

### 3.5 Shared primitives — `ts/routes/mcat/lib/`

Extract the recon-confirmed copy-paste between StudyPage and DiagnosticPage:

- `SessionHeader.svelte` — exit/finish button + progress track (+ optional
  pace diamond, timer, counter).
- `QuestionCard.svelte` — image/text stem with internal scroll rules.
- `ChoiceGrid.svelte` — A–D buttons + kbd chips; **grading is opt-in via a
  `graded` prop (default false)** so the diagnostic structurally cannot leak
  correctness classes into the DOM.
- `IdkButton.svelte`, `MeterBar.svelte` (track/fill), `KeyHint.svelte`.
- Buttons (`.primary/.secondary/.ghost/.danger`) become shared SCSS mixins or
  a `Button.svelte`.

## 4. Fight scene architecture

### 4.1 Component breakdown (replaces Boxer.svelte / BoxerFigure.svelte)

```
ts/routes/mcat/ring/
  FightRing.svelte     — the strip. Ring dressing (ropes/posts/floor/marquee),
                         stage <div> receiving ring-local shake, FX layer,
                         badge layer, hide toggle (localStorage
                         "sf-boxer-hidden"). Owns the choreographer.
  FighterRig.svelte    — ONE articulated inline-SVG fighter. Props:
                         spec: SpeciesSpec, build: Build, palette: Palette,
                         facing, scale, clip (one-shot), stance (loop),
                         staticPose (dashboard portraits & reduced-motion).
  HeavyBag.svelte      — extracted bag rig, existing swing clips + new ones.
  RingFx.svelte        — impact stars, dust puffs, sweat arcs, spotlight cone,
                         badges.
  choreo/machine.ts    — PURE REDUCER: (RingModel, RingEvent, rng) → RingModel
                         with a queue of {who, clip, atMs}. Clip intensity
                         levels (1 = reading-safe … 3 = exchange); the reading
                         state may only hold intensity-1 clips — enforced
                         structurally in the reducer (filter, not just a dev
                         assert). Unit-tested with vitest (just test-ts).
  choreo/clips.ts      — CLIPS registry: ClipDef {id, css, durMs, intensity,
                         fx, badge}; ACTION_POOLS as data tables.
  choreo/rng.ts        — mulberry32 session RNG + ShuffleBag.
  roster.ts            — SpeciesSpec table, tierFor(), opponentFor(item).
  geometry.ts          — parametric limb/torso path builders + computed joint
                         origins (see 4.3).
  boxer.ts             — thin re-exports during migration, then deleted.
```

`FightRing` public API (both pages migrate in one small diff):

```ts
export let mode: "spar" | "train" | "bag" = "spar"; // spar=MCQ, train=flashcards, bag=diagnostic
export let event: FightEvent | null = null;         // {kind, trigger}
export let heroScale = 1;                           // readiness formula, unchanged
export let opponent: OpponentInstance | null = null; // from opponentFor(item)
export let marquee = "";                            // "1B · Enzymes ●●●●○ vs BULLHORN · TIER 5"
```

No `{#key trigger}` re-mounting of the whole scene (today's flicker bug). The
choreographer applies one-shot clip classes; `FighterRig` clears its clip on
`animationend` and falls back to `stance`. If the remove-class → double-rAF →
re-add retrigger pattern misbehaves in QtWebEngine, fall back to
`{#key clipKey}` scoped to the rig subtree only. A new answer event or
navigation resets the reducer's queue — animations never pile up behind a
fast student.

### 4.2 The SVG rig

One skeleton, `viewBox="0 0 120 150"` (biped) — every joint is a named `<g>`
with a `transform-origin` in viewBox coordinates:

```
g.root            — whole-body translate/squash (scaleY .94 on landings)
└ g.pelvis        — weight shifts, dips
  ├ g.leg.back   └ g.shin.back  └ path.boot
  ├ g.leg.front  └ g.shin.front └ path.boot
  └ g.spine       — torso lean (the power generator)
    └ g.chest     — shoulder-girdle counter-rotation
      ├ g.arm.back   └ g.forearm.back  └ g.glove.back
      ├ g.neck       └ g.head          ← SPECIES SLOT (head + horns/ears/mane)
      └ g.arm.front  └ g.forearm.front └ g.glove.front
ellipse.shadow (under root, scaleX 1.15 on landings)
```

Joint transform-origins are **computed in `geometry.ts` from the same numbers
that generate the limb paths**, so pivots always sit exactly on the anatomical
joint (no hand-maintained origin table to drift). Gloves use
`transform-box: fill-box; transform-origin: center`.

Species/build axes — one template, many fighters:

1. **Muscularity — parametric tapered capsules, not stroke width.**
   `geometry.ts` builds each limb segment as a closed tapered-capsule path
   from a `bulk` parameter (0–1). Bulk widens non-uniformly: arms/chest/neck
   ×~1.35 at full bulk, waist ×~1.15 — mass reads as muscle, not inflation.
   `.muscle` overlay paths (deltoid/pec/forearm highlights) fade in with bulk.
   Torso is a closed path chosen from 4 drawn build-variant silhouettes (lean
   taper → colossal trapezius hump) — drawn anchors, parametric limbs.
   Within-band interpolation: `bulk += (effTier − bandCenter) × 0.25` so two
   tier-4 opponents at different effective difficulty differ visibly.
2. **Head slot.** Each species contributes `headPath` + `extraPaths` (horns,
   wolf ears/muzzle, crest fin, mane) inside `g.head` — every head animation
   (snap-back, shake, snort) works for every species free.
3. **Palette** via CSS vars on the rig root (`--skin/--trunks/--glove/
   --accent/--fur`). Hero wires to `--sf-red`/`--sf-gold`; opponents get
   muted cool tones (≤55% saturation) so the hero pops.
4. **Weight-class physics**: root vars `--amp` (amplitude multiplier: lean
   1.15 → colossal 0.8) and `--wt` (duration multiplier: lean 0.9 → colossal
   1.25) consumed inside shared keyframes via
   `rotate(calc(var(--amp) * -14deg))` / `animation-duration:
   calc(var(--wt) * 640ms)`. Heavy fighters feel heavy with zero extra
   keyframes.
5. **Chassis swap** for the centaur: `{#if spec.chassis === "taur"}` replaces
   pelvis+legs with `g.quad` (viewBox widens to `0 0 190 150`): barrel, 4
   legs, tail; the same `g.spine` subtree mounts at the withers. All
   upper-body clips run unmodified; only locomotion clips are
   chassis-specific. FightRing lays fighters out **by height with width
   overflow allowed** so the quadruped doesn't render smaller than the
   minotaur.

Shared core clips are written once against skeleton class names
(`.rig.jab .arm.front { … }`); species add only 1–2 signature clips. Only
`transform`/`opacity` animate (compositor-friendly; two rigs + FX < 100
nodes).

### 4.3 Data model (`roster.ts`)

```ts
export type Species = "rookie" | "sidewinder" | "hobnail" | "howler" | "gravel"
                    | "bullhorn" | "chiron";
export type Build = "lean" | "fit" | "heavy" | "colossal";
export type Chassis = "biped" | "taur";
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export interface SpeciesSpec {
    id: Species; name: string; chassis: Chassis; build: Build;
    headPath: string; extraPaths: string[];
    palettes: Palette[];          // 2–3 recolors per species
    signatures: ClipName[];       // species-only attacks/taunts
    taunts: ClipName[]; hitSfx: string;   // "THUD!" for bullhorn…
    amp: number; wt: number;      // physics multipliers
    reactOverrides?: Partial<Record<ClipName, ClipName>>;
}
export interface OpponentInstance {
    species: SpeciesSpec; tier: Tier; scale: number; bulk: number;
    paletteIndex: number;
}
export type FightEventKind =
    | "fast-correct" | "slow-correct" | "wrong" | "idk"
    | "streak-3" | "streak-5"
    | "rate-again" | "rate-hard" | "rate-good" | "rate-easy"
    | "reveal" | "bag-hit"
    | "results-win" | "results-draw" | "results-loss" | "entrance";
export interface FightEvent { kind: FightEventKind; trigger: number; }
```

- `opponentFor(item)` replaces `oppScaleFor` at both call sites; the
  `cardId % 5` hack is deleted.
- **Deterministic identity:** tier-4 species pick (Howler/Gravel) and palette
  variant are hashed from `cardId` — the same question always summons the
  same opponent ("oh no, the werewolf question").
- **Persistence ("rounds"):** the opponent persists across consecutive
  same-tier questions; entrances play only on tier change. Tier is frozen per
  card per session, with ±0.25 band hysteresis on the FSRS fallback so
  mid-session memory-state updates never thrash species.
- Hero: red trunks/gloves, gold band; `heroScale` keeps the readiness
  formula; hero build steps lean→fit→heavy at readiness 0–40–70.

## 5. Opponent roster & difficulty mapping

```
mod  = fsrs == 0 ? 0 : fsrs >= 7.5 ? +1 : fsrs <= 3.5 ? -1 : 0
base = tagged || fsrs == 0 ? clamp(authored, 1, 5)
                           : clamp(round(1 + ((fsrs − 1) / 9) * 4), 1, 5)
tier = clamp(base + mod, 1, 6)
```

Tier 6 is only reachable as authored-5 AND personally brutal (FSRS ≥ 7.5) —
the centaur is *your personal nightmare question*.

| Tier | Name (marquee) | Species | Build / chassis | Scale | Silhouette (10-ft test) | Palette accent | Signature moves |
|---|---|---|---|---|---|---|---|
| 1 | ROOKIE | human featherweight | lean, upright, headgear | 0.90 | narrow column, headgear dome | slate `#3d4657` | `flail-jab`, `gulp` taunt |
| 2 | SIDEWINDER | lizardfolk welterweight | fit | 0.98 | head crest fin + tail curve | desat teal `#2e4a4a` | `tail-sweep-feint`, `tongue-flick` |
| 3 | HOBNAIL | hobgoblin bruiser | heavy, hunched | 1.06 | arms below knees, ear points | olive gunmetal `#3a4030` | `haymaker-windmill`, `knuckle-crack` |
| 4a | HOWLER | werewolf | fit-heavy, digitigrade | 1.14 | muzzle + ears + fur spikes | charcoal `#2b2f38` + `--fur #4a4f5c` | `lunge-claw`, `howl` taunt |
| 4b | GRAVEL | stone golem | colossal, slab shoulders | 1.18 | rectangular mass, no neck, crack seams | basalt `#33363d` + ember seams `#a3121c` | `boulder-slam`, `chest-pound` |
| 5 | BULLHORN | **minotaur** | colossal | 1.28 | wide horn span, shoulder hump, snout, hooves | near-black hide + brass horn caps `#8a6d2f` | `horn-rake`, `steam-snort` taunt |
| 6 | CHIRON, WARLORD | **centaur** | colossal, taur chassis | 1.35 | the only quadruped | dark bay + war paint `--sf-red-deep` | `rear-up` entrance, `overrun` |

Tier 4 alternates Howler/Gravel by cardId parity. Each species ships 2–3
palette variants hashed from cardId.

## 6. Animation taxonomy

### 6.1 The grammar (enforced mechanically)

All strike clips follow: **anticipation (15–20%, ease-in) → contact frame
(~35–40%) → hit-stop (contact pose held across two keyframe stops, 10–14% ≈
70–100ms, 1px vibrate) → follow-through overshoot → settle**
(`cubic-bezier(0.34, 1.56, 0.64, 1)`); strike acceleration
`cubic-bezier(0.2, 0.9, 0.1, 1)`. An **SCSS mixin generates the
anticipation/contact/hold/settle percentage skeleton** so every clip shares
the grammar mechanically and feel can't drift across authoring sessions.
Gloves squash `scale(1.3, 0.85)` on contact; the struck fighter's root
squashes `scale(1.06, 0.94)` for one 80ms beat. Fast horizontal strikes get a
2-frame glove-colored smear (40% opacity). Every impact: 6-spoke star burst
(220ms) at the contact point + ring-local shake on `.stage` (never the page):
1px/120ms light, 2px/160ms medium, 3px/200ms heavy (tier 5/6). Dust puffs on
landings; 3 sweat arcs on hit-reacts.

### 6.2 Clip inventory (~55 named clips; CSS classes; metadata in clips.ts)

- **Hero stances (loops):** `stance-guard` (2.9s bob ≤2px — the ONLY motion
  while a question is unanswered), `stance-bounce` (feedback state),
  `stance-jumprope` (train), `stance-spent` (after wrong).
- **Hero micro-fidgets** (600–800ms one-shots, feedback/intro/results states
  ONLY): `fidget-glove-tap`, `fidget-neck-roll`, `fidget-switch-step`,
  `fidget-shadow-double` — one every 9–14s (rng) in eligible states. ×4.
- **Hero power pool (fast-correct):** `atk-cross` 560ms, `atk-uppercut`
  620ms, `atk-hook` 580ms, `atk-overhand` 600ms, `atk-double-jab-cross`
  780ms (3 contacts, 3 shakes). ×5.
- **Hero counter pool (slow-correct; "won on points"):** `ctr-slip-jab`
  640ms, `ctr-parry-cross` 680ms, `ctr-block-hook` 700ms,
  `ctr-catch-counter` 660ms. ×4.
- **Hero hit reactions (wrong):** `hit-head-snap` 480ms, `hit-gut-fold`
  560ms, `hit-stagger` 640ms, `hit-wobble` 520ms. ×4.
- **Hero IDK set (honesty ≠ beating):** `def-step-back` 600ms,
  `def-tape-study` 700ms; opponent `taunt-respect-nod`; badge **GOOD CALL**
  (steel/gold). ×2.
- **Hero combos:** `combo-one-two` 760ms (streak-3), `combo-blitz` 1.05s +
  opponent `ko-knee` then `getup` during next question load (streak-5). ×2.
- **Opponent shared core (all species, written once):** `stance-guard`,
  `atk-jab/cross/hook`, `hit-head-snap`, `hit-gut-fold`,
  `hit-stagger-ropes` (ropes flex 4px), `hit-crumple`, `block`, `getup`,
  `taunt-respect-nod`. ×10.
- **Species signatures:** 2 each × 7 species. ×14.
- **Entrances:** `enter-step-in` 400ms (tiers 1–3); `enter-stomp` 700ms
  (tier ≥5, once per species per session: ring dims to 65%, spotlight cone,
  2px shake, marquee flashes `★ TIER 5 — BULLHORN`) — **contractually pinned
  to the question-swap boundary**, never during reading; `enter-rear-up`
  900ms (Chiron). Other opponent swaps: 250ms crossfade. ×3.
- **Bag mode (diagnostic; correctness-blind by construction):** `bag-jab`
  340ms, `bag-cross` 500ms, `bag-hook` 520ms, `bag-uppercut` 550ms,
  `bag-body` 480ms, `bag-double-jab` 620ms, `bag-flurry` 900ms (every 10th
  answer), `bag-circle-step` filler. ×8.
- **Train mode (flashcards; no opponent — the gym is a safe room):**
  rate-easy → `bag-uppercut` + showboat spin; rate-good → `bag-jab`;
  rate-hard → slow `bag-body` + shake-out; rate-again → `fidget-brow-wipe` +
  towel dab. ×4 mappings.
- **Results flourishes:** `win-arms-up` 1.2s + belt glint + ≤12 gold confetti
  strokes (900ms, inside the strip); `draw-glove-touch` 900ms;
  `loss-towel-nod` 1.1s (determined, not humiliated). ×3.

### 6.3 Randomization

- `mulberry32` RNG seeded per session at mount.
- Every pool (power, counter, hero-hit, opp-attack-per-species, bag, fidget,
  taunt) is a **ShuffleBag** (Fisher–Yates, deal until empty, reshuffle with
  no immediate repeat across the refill boundary).
- **Spice roll:** on any hero attack, `rng() < 0.12` upgrades to a rare skin
  of the same clip (same contact timing).
- Opponent identity deterministic (cardId hash); clip choice random.

### 6.4 Event → animation contract

| Study event | Hero | Opponent | FX / badge | Budget |
|---|---|---|---|---|
| fast-correct (≤15s) | ShuffleBag(power) | matched hit-react (uppercut→head-snap, body→gut-fold, cross/hook→stagger-ropes) | star, medium shake, `POW!/BAM!/WHAM!/BOOM!` | ≤900ms |
| slow-correct | ShuffleBag(counter) | `hit-head-snap` or `block`→flinch | small star, light shake, `POINT!` gold-outline | ≤900ms |
| wrong | ShuffleBag(hero-hit) | telegraph 220ms → species attack (signature 40% / core 60%) | red flash on hero, `OOF!`, taunt 35% *after* exchange | ≤1100ms |
| IDK | `def-step-back`/`def-tape-study` | `taunt-respect-nod` | `GOOD CALL` steel/gold | ≤800ms |
| streak-3 / streak-5 | `combo-one-two` / `combo-blitz` | stagger / `ko-knee`+`getup` | `ON A ROLL!` / `KNOCKDOWN!` | ≤1.1s |
| flashcard rate 1–4 | train mappings | — (bag) | tiny badge in status color | ≤700ms |
| diagnostic answer | ShuffleBag(bag), flurry every 10th | — | uniform for all answers — zero leak | ≤900ms |
| results | win/draw/loss by diagnostic pct (≥60 / 40–59 / <40) | crumple / glove-touch / — | one flourish, once | ≤1.3s |

Wrong-answer exchanges are sequenced by the reducer (telegraph → strike →
hero hit at contact +180ms → badge +180ms), fully cancellable. Feedback text
renders the instant the backend answers — the ring is commentary, not a
loading screen.

## 7. Difficulty plumbing (verified against source by recon)

1. **Proto** — `proto/anki/scheduler.proto`, `message McatStudyItem` (line
   545), after `string explanation = 12;`:

```proto
  // Authored difficulty from the mcat::diff::N tag, 1-5. 3 when untagged
  // (see difficulty_tagged).
  uint32 difficulty = 13;
  // FSRS memory-state difficulty, raw 1.0-10.0. 0.0 = no memory state yet
  // (new/reset card); consumers must fall back to `difficulty`.
  float fsrs_difficulty = 14;
  // True when the note actually carries an mcat::diff/difficulty tag, so
  // the frontend can distinguish "authored medium" from "untagged".
  bool difficulty_tagged = 15;
```

2. **rslib** — `rslib/src/mcat/adapter.rs`, in `build_study_item()` (note
   already fetched at :383; both match arms end in `..Default::default()`):

```rust
let mut item = /* existing match */;
item.difficulty = difficulty_from_tags(&note.tags) as u32;      // adapter.rs:608
item.difficulty_tagged = has_difficulty_tag(&note.tags);        // new ~3-line helper
item.fsrs_difficulty = self.storage.get_card(CardId(card_id))?
    .and_then(|c| c.memory_state)                               // card/mod.rs:96
    .map(|s| s.difficulty)                                      // raw 1.0-10.0
    .unwrap_or(0.0);
```

   One extra `get_card` read per item (negligible). Both study queue
   (adapter.rs:367) and diagnostic (adapter.rs:497) flow through
   `build_study_item`. Extend the `difficulty_parsed_from_tags` test (:652)
   for the tagged/untagged flag.

3. **Regeneration:** `just check` after the proto edit regenerates
   `anki_proto` + `out/ts/lib/generated/anki/scheduler_pb.d.ts`. Fields
   arrive camelCased (`difficulty`, `fsrsDifficulty`, `difficultyTagged`).
   **Land in two steps: (proto+rust+build) before any frontend reference,**
   or svelte-check fails on unknown properties. No pylib work (nothing in
   pylib/qt touches McatStudyItem).

4. **Frontend** — `tierFor(authored, fsrs, tagged)` per §5; diagnostic keeps
   using authored difficulty for stratified selection (adapter.rs:480,
   untouched); bag mode ignores tier by design.

## 8. Accessibility & non-distraction guardrails

- **Reading state is sacred:** while an MCQ is unanswered the only motion is
  `stance-guard` breathing ≤2px / ≥2.8s and the bag's ±1.5° sway. No fidgets,
  taunts, palette pulses, or badge remnants — enforced structurally in the
  reducer (intensity-1 filter), not by convention.
- **One-shot budget:** exchanges complete ≤1100ms; ring returns to a ≤3px
  loop. Nothing loops at high amplitude. Shake is ring-local (`.stage` inside
  the `overflow:hidden` strip); viewport and text never move.
- **Vertical budget:** ring ~100px (study) / 88px (diagnostic) / 0 hidden —
  constant; question card contractually ≥55% of content height in every
  state.
- **prefers-reduced-motion:** all `animation: none`, but the scene still
  communicates via instant static tableaux: `pose-guard` (reading),
  `pose-jab-land` (correct), `pose-guard-low` (wrong), `pose-glove-raised`
  (IDK), `pose-arms-up`/`pose-towel` (results). Badges render without pop and
  persist until the next event. Entrances/spotlight/confetti disabled;
  discrete pose swaps allowed.
- **Hide toggle preserved** (localStorage `sf-boxer-hidden`, "Show ring"
  pill). When hidden, badges appear as an inline text chip next to the
  feedback header (`POW! · Correct`) — hiders lose zero information.
  `sf-timer-hidden` follows the same pattern.
- **Color-independence:** every right/wrong signal pairs color with ✓/✗ icon
  and text; `--sf-ok`/`--sf-err` ≥3:1 against `--sf-surface`.
  `alt={item.leafName + " question"}`; ring stays `aria-hidden="true"`.
- **No audio.** SFX are typographic badges.
- **Focus:** gold `:focus-visible` ring on all interactives; dialogs get
  Escape handling + autofocus on the safe action.

## 9. Delivery waves (each independently shippable)

- **Wave 0 — spikes (day one, before authoring clips):** in QtWebEngine via
  `just run`: (a) CSS `transform-origin` in viewBox coords on SVG `<g>`
  (fallback: nested translate-rotate-translate groups); (b) `var()`/`calc()`
  inside keyframes for `--amp`/`--wt` (fallback: build-class keyframe
  variants); (c) a static dev gallery rendering all 7 species poses — the
  parametric-capsule fighters must pass a visual bar ("muscular and mythic,
  not noodle-people"); pre-approved fallback: hand-drawn part-set paths per
  species mounted on the same skeleton, keeping the registry/reducer
  architecture intact.
- **Wave 1:** difficulty plumbing; UI refinement (tokens, all four screens,
  shared primitives); rig skeleton + hero full set + Rookie / Hobnail /
  **Bullhorn** (the minotaur ships first) + opponent shared core. Cap: ~25
  clips, ~1200 SCSS lines.
- **Wave 2:** Sidewinder / Howler / Gravel + signatures + streak system +
  entrances.
- **Wave 3:** Chiron's taur chassis + rear-up entrance (degrades gracefully
  to a rearing biped behind the same SpeciesSpec if cut).
- **Testing:** vitest units on reducer/roster/rng; one Playwright e2e smoke
  (`ts/tests/e2e/`): load study page, answer via keyboard, assert feedback +
  Continue visible, toggle ring hidden (there is no /mcat e2e coverage
  today).

## 10. Risks & open questions

1. **Untagged-content cliff:** untagged banks + fsrs=0 would be wall-to-wall
   tier 3. Mitigated by `difficulty_tagged` + FSRS-only fallback; hysteresis
   ±0.25 + per-session tier freeze prevent species thrash.
2. **Build-order trap:** frontend referencing `item.difficulty` before the
   generated TS refreshes fails svelte-check. Two-step landing.
3. **Art risk (existential):** if parametric capsules fail the Wave-0 visual
   bar, fall back to drawn part-sets per species (architecture unchanged).
4. **Two-step diagnostic commit** changes exam pacing — `Enter` always locks;
   hint teaches it in 3 questions; hallway-test.
5. **"Fight →" targeted sessions** need a `leaf_id` filter on the study-queue
   RPC — natural follow-up, out of scope here.
6. **Auto-recompute on dashboard load** assumes recompute is fast; measure,
   else fire-and-forget with a shimmer.
7. **QtWebEngine perf:** transform/opacity on <100 nodes is comfortably
   60fps; the nav's `backdrop-filter: blur(8px)` is the one compositor risk —
   drop to solid color-mix if frames drop.
8. **Typeface:** design assumes system-ui. Any future display face must ship
   as a local asset.

RESOLVED: pre-answer difficulty visibility in study — user approved showing
opponent + pips before answering. Diagnostic stays blind.
