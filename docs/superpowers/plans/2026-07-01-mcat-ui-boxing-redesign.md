# Scorefighter UI/UX + Fight Scene Redesign — Wave 0+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the spec's Wave 0+1: real difficulty plumbed from backend to frontend, the refined red/black UI across all four MCAT screens, and the new rigged-SVG fight scene with hero + Rookie/Hobnail/Bullhorn(minotaur) opponents.

**Architecture:** Three proto fields flow difficulty from `rslib` through `build_study_item` to the Svelte frontend. A new `ts/routes/mcat/ring/` module holds one parameterized SVG rig (parametric tapered-capsule limbs, species head slots), a data-driven roster, a pure-reducer choreographer, and CSS-keyframe clips built on a shared timing grammar. A new `ts/routes/mcat/lib/` holds shared UI primitives; the three pages are rewritten on top of them.

**Tech Stack:** Svelte 4 (`export let` + `$:`), SCSS, protobuf/protobuf-es, Rust (rslib), vitest (`just test-ts`), Playwright (`just test-e2e`).

**Spec:** `docs/superpowers/specs/2026-07-01-mcat-ui-boxing-redesign-design.md` — read it before starting any task. Waves 2–3 (Sidewinder/Howler/Gravel, signatures, streaks, entrances, Chiron's taur chassis) are OUT of scope for this plan.

## Global Constraints

- Every new file starts with the repo's two-line AGPL header comment (copy from any existing file, matching `//` or `<!-- -->` style).
- No new npm dependencies. No canvas, no 3D, no external image assets, no audio, no web fonts.
- Svelte 4 style: `export let` props, `$:` reactivity, `<style lang="scss">`.
- Keep the red/black palette. Blue/indigo (`#3b82f6`, `#6366f1`, `#22c55e`, `#ef4444` as feedback colors) are banned — use the `--sf-*` tokens from Task 2. Delete hex fallbacks in `var()` (write `var(--sf-red)`, not `var(--sf-red, #e11d2f)`).
- Animate only `transform` and `opacity`. All shake is ring-local (inside the strip's `overflow: hidden`), never on the page.
- Ring strip heights are constant: ~100px study, 88px diagnostic. The layout never moves while the student reads.
- `prefers-reduced-motion: reduce` ⇒ no animation, communicative static poses instead.
- Diagnostic exam must never leak correctness: uniform bag reaction for every answer; `ChoiceGrid` grading is opt-in and stays off there.
- Build tooling: `just` recipes only (`just check`, `just test-rust`, `just test-ts`, `just test-e2e`, `just lint`, `just run`). `just`/`cargo` may not be on PATH — if `cargo` is missing use the just recipes. Close any running dev Anki before builds (it locks `_rsbridge.pyd`); e2e needs `PYTHONPATH=out\pylib`.
- Proto change lands BEFORE any frontend reference to the new fields (generated TS refreshes only on build).
- Commits end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Difficulty plumbing (proto + rslib)

**Files:**

- Modify: `proto/anki/scheduler.proto:545-566` (message McatStudyItem)
- Modify: `rslib/src/mcat/adapter.rs` (build_study_item ~:375-437, helpers ~:607, tests ~:637)

**Interfaces:**

- Produces (consumed by Tasks 6, 10, 11, 13 via `@generated/anki/scheduler_pb`): `McatStudyItem.difficulty: number` (1–5, 3 when untagged), `McatStudyItem.fsrsDifficulty: number` (raw 1.0–10.0, 0 = no memory state), `McatStudyItem.difficultyTagged: boolean`.

- [ ] **Step 1: Write the failing Rust test** — in the `#[cfg(test)] mod test` block of `rslib/src/mcat/adapter.rs` (next to `difficulty_parsed_from_tags`, ~:652), add:

```rust
#[test]
fn difficulty_tag_presence() {
    assert!(has_difficulty_tag(&["mcat::diff::4".to_string()]));
    assert!(has_difficulty_tag(&["mcat::difficulty::2".to_string()]));
    assert!(!has_difficulty_tag(&["mcat::cc::1B".to_string()]));
    assert!(!has_difficulty_tag(&["mcat::rc::5".to_string()]));
    assert!(!has_difficulty_tag(&[]));
}
```

- [ ] **Step 2: Run to verify it fails** — `cargo test -p anki mcat::adapter` (or `just test-rust`). Expected: compile error, `has_difficulty_tag` not found.

- [ ] **Step 3: Implement the helper** — directly under `difficulty_from_tags` (~:610), mirroring `marker_from_tags`'s parsing exactly:

```rust
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
```

- [ ] **Step 4: Run to verify it passes** — `cargo test -p anki mcat::adapter`. Expected: PASS (all existing mcat tests still green).

- [ ] **Step 5: Add the proto fields** — in `proto/anki/scheduler.proto`, `message McatStudyItem`, after `string explanation = 12;`:

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

- [ ] **Step 6: Wire the fields in `build_study_item`** — in `rslib/src/mcat/adapter.rs`, change `let item = match kind {` (~:404) to `let mut item = match kind {`, and before the function's final `Ok(Some(item))` add:

```rust
item.difficulty = difficulty_from_tags(&note.tags) as u32;
item.difficulty_tagged = has_difficulty_tag(&note.tags);
item.fsrs_difficulty = self
    .storage
    .get_card(CardId(card_id))?
    .and_then(|c| c.memory_state)
    .map(|s| s.difficulty)
    .unwrap_or(0.0);
```

`CardId` is already used in this file; if the import is missing add it to the existing `use` block. Both study queue (:367) and diagnostic (:497) flow through this function — no other Rust changes.

- [ ] **Step 7: Verify Rust side** — `cargo check` then `cargo test -p anki mcat`. Expected: clean check, all tests PASS.

- [ ] **Step 8: Full build to regenerate TS** — `just check` (close dev Anki first). Expected: passes; `out/ts/lib/generated/anki/scheduler_pb.d.ts` now has `difficulty`, `fsrsDifficulty`, `difficultyTagged` on `McatStudyItem`. Verify with: `grep -n "fsrsDifficulty" out/ts/lib/generated/anki/scheduler_pb.d.ts`.

- [ ] **Step 9: Commit**

```bash
git add proto/anki/scheduler.proto rslib/src/mcat/adapter.rs
git commit -m "feat(mcat): expose authored + FSRS difficulty on McatStudyItem"
```

---

### Task 2: Token layer + shell/nav refresh

**Files:**

- Modify: `ts/routes/mcat/+layout.svelte`
- Create: `ts/routes/mcat/lib/mixins.scss`

**Interfaces:**

- Produces: CSS custom properties `--sf-ok`, `--sf-ok-deep`, `--sf-err`, `--sf-warn`, `--sf-steel`, `--sf-r-sm/md/lg`, `--sf-shadow-1/2`, `--sf-focus` available under `.mcat-shell` (every mcat component). SCSS mixins `sf.button-primary`, `sf.button-secondary`, `sf.button-ghost`, `sf.focusable` via `@use "../lib/mixins" as sf;` (adjust relative path per file depth).

- [ ] **Step 1: Add tokens** — in `+layout.svelte` `.mcat-shell` rule, after the existing nine `--sf-*` tokens:

```scss
/* semantic status — one source of truth for right/wrong/neutral */
--sf-ok: #2fd67a;
--sf-ok-deep: #1a9d55;
--sf-err: #ff5d6c; /* feedback red, deliberately NOT brand --sf-red */
--sf-warn: #f5a03c;
--sf-steel: #566073; /* neutral chrome: IDK, blocks, secondary */
/* geometry + elevation rhythm */
--sf-r-sm: 8px;
--sf-r-md: 12px;
--sf-r-lg: 16px;
--sf-shadow-1: 0 1px 3px rgb(0 0 0 / 30%);
--sf-shadow-2: 0 12px 34px rgb(0 0 0 / 45%);
/* keyboard-first focus */
--sf-focus: 0 0 0 2px var(--sf-canvas), 0 0 0 4px var(--sf-gold);
```

Also change `--mcat-font` to `system-ui, "Segoe UI", -apple-system, sans-serif` (Inter is never loaded — be honest about what renders).

- [ ] **Step 2: Nav changes** — in the same file: nav padding `0.55rem 1.25rem`; `.nav-link.active` loses the red pill and becomes `color: var(--sf-text); background: none; box-shadow: inset 0 -2px 0 var(--sf-gold); border-radius: 0;`. Hover keeps the subtle red wash. Add a kbd micro-legend, right-aligned before `.links`, shown only on study/diagnostic routes:

```svelte
{#if path === "/mcat/study" || path === "/mcat/diagnostic"}
    <span class="kbd-legend">A–D answer · 0 not sure · ↵ confirm</span>
{/if}
```

```scss
.kbd-legend {
    margin-left: auto;
    font-size: 11px;
    color: var(--sf-dim);
    letter-spacing: 0.02em;
    white-space: nowrap;
}
/* .links loses margin-left: auto when legend present — simplest: put
   margin-left: auto on .kbd-legend and drop it from .links, restoring it
   via :global route check is overkill; keep .links { margin-left: auto }
   and give .kbd-legend { margin-left: auto } + .links { margin-left: 1rem }
   when the legend renders. Acceptable: always .kbd-legend { margin-left: auto },
   .links { margin-left: 0 } and when no legend, .links { margin-left: auto }
   via class:with-legend on .links. */
```

Implement the layout with a `class:with-legend` toggle: `.links { margin-left: auto; } .links.with-legend { margin-left: 1rem; }`.

- [ ] **Step 3: Create `ts/routes/mcat/lib/mixins.scss`** (with `//` AGPL header):

```scss
$ease-strike: cubic-bezier(0.2, 0.9, 0.1, 1);
$ease-settle: cubic-bezier(0.34, 1.56, 0.64, 1);

@mixin focusable {
    &:focus-visible {
        outline: none;
        box-shadow: var(--sf-focus);
    }
}

@mixin button-base {
    cursor: pointer;
    font-weight: 700;
    border-radius: var(--sf-r-sm);
    transition: filter 0.12s ease, background 0.12s ease, border-color 0.12s ease;
    @include focusable;
}

@mixin button-primary {
    @include button-base;
    padding: 0.55rem 1.4rem;
    border: none;
    color: #fff;
    font-weight: 800;
    background: linear-gradient(180deg, var(--sf-red) 0%, var(--sf-red-deep) 100%);
    box-shadow: 0 4px 14px rgba(225, 29, 47, 0.3);
    &:hover:not(:disabled) {
        filter: brightness(1.08);
    }
}

@mixin button-secondary {
    @include button-base;
    padding: 0.5rem 1.1rem;
    background: none;
    border: 1px solid var(--sf-steel);
    color: var(--sf-text);
}

@mixin button-ghost {
    @include button-base;
    padding: 0.4rem 1rem;
    background: none;
    border: 1px solid var(--sf-border);
    color: inherit;
    opacity: 0.75;
    &:disabled {
        opacity: 0.4;
        cursor: default;
    }
}
```

- [ ] **Step 4: Verify** — `just lint` (runs svelte-check + eslint). Expected: PASS. Then `just run`, open the mcat pages, confirm nav renders with gold underline on the active route.

- [ ] **Step 5: Commit**

```bash
git add ts/routes/mcat/+layout.svelte ts/routes/mcat/lib/mixins.scss
git commit -m "feat(mcat): semantic tokens, focus ring, quieter nav with kbd legend"
```

---

### Task 3: Shared UI primitives (`ts/routes/mcat/lib/`)

**Files:**

- Create: `ts/routes/mcat/lib/KeyHint.svelte`, `MeterBar.svelte`, `SessionHeader.svelte`, `QuestionCard.svelte`, `ChoiceGrid.svelte`, `IdkButton.svelte`

**Interfaces:**

- Produces (consumed by Tasks 11–13):
  - `KeyHint` — `export let key: string;` renders a kbd chip.
  - `MeterBar` — `export let value: number; export let tone: "red" | "gold" = "red";` (value 0–1) track+fill bar.
  - `SessionHeader` — `export let exitLabel = "Exit"; export let progress = 0; export let counter = ""; export let paceState: "gold" | "steel" | null = null; export let timerText = "";` dispatches `exit` and `timerclick`.
  - `QuestionCard` — `export let image = ""; export let front = ""; export let alt = "question";` fills available height, scrolls internally.
  - `ChoiceGrid` — `export let choices: string[] = []; export let lettersOnly = false; export let disabled = false; export let graded = false; export let chosen: string | null = null; export let answer = ""; export let pending: string | null = null; export let collapsed = false;` dispatches `choose` with `{ letter }`. When `graded` is false, NO right/wrong classes ever appear in the DOM (diagnostic safety is structural).
  - `IdkButton` — `export let disabled = false; export let selected = false;` dispatches `choose`; label "Not sure — show me", steel hover, `⓪` KeyHint.

Each file gets the AGPL header and `@use "./mixins" as sf;` where buttons are styled.

- [ ] **Step 1: KeyHint.svelte**

```svelte
<script lang="ts">
    export let key: string;
</script>

<kbd>{key}</kbd>

<style lang="scss">
    kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border: 1px solid var(--sf-steel);
        border-radius: 4px;
        font-family: ui-monospace, Consolas, monospace;
        font-size: 11px;
        line-height: 1;
        color: var(--sf-dim);
        background: none;
    }
</style>
```

- [ ] **Step 2: MeterBar.svelte**

```svelte
<script lang="ts">
    export let value = 0; // 0..1
    export let tone: "red" | "gold" = "red";
</script>

<div class="track">
    <div
        class="fill {tone}"
        style:width={`${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`}
    ></div>
</div>

<style lang="scss">
    .track {
        flex: 1;
        height: 0.5rem;
        border-radius: 1rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
        overflow: hidden;
    }
    .fill {
        height: 100%;
        border-radius: 1rem;
        &.red {
            background: linear-gradient(90deg, var(--sf-red-deep), var(--sf-red));
        }
        &.gold {
            background: linear-gradient(90deg, #b8860b, var(--sf-gold));
        }
    }
</style>
```

- [ ] **Step 3: SessionHeader.svelte**

```svelte
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    const dispatch = createEventDispatcher();
    export let exitLabel = "Exit";
    export let progress = 0; // 0..1
    export let counter = "";
    export let paceState: "gold" | "steel" | null = null;
    export let timerText = "";
</script>

<header class="progress-row">
    <button class="quit" on:click={() => dispatch("exit")}>{exitLabel}</button>
    <div class="progress-track">
        <div class="progress-fill" style:width={`${progress * 100}%`}></div>
    </div>
    {#if timerText}
        <button
            class="timer"
            title="Click to hide the timer"
            on:click={() => dispatch("timerclick")}
        >
            {#if paceState}<span class="pace {paceState}"></span>{/if}
            {timerText}
        </button>
    {/if}
    <span class="counter">{counter}</span>
</header>

<style lang="scss">
    @use "./mixins" as sf;
    .progress-row {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 30px;
    }
    .quit {
        border: none;
        background: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        @include sf.focusable;
    }
    .progress-track {
        flex: 1;
        height: 0.4rem;
        border-radius: 1rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
        overflow: hidden;
    }
    .progress-fill {
        height: 100%;
        border-radius: 1rem;
        background: linear-gradient(90deg, var(--sf-red-deep), var(--sf-red));
        transition: width 0.2s ease;
    }
    .timer {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.55;
        color: inherit;
        font-variant-numeric: tabular-nums;
        @include sf.focusable;
    }
    .pace {
        width: 6px;
        height: 6px;
        transform: rotate(45deg);
        &.gold {
            background: var(--sf-gold);
        }
        &.steel {
            background: var(--sf-steel);
        }
    }
    .counter {
        font-size: 0.85rem;
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
    }
</style>
```

- [ ] **Step 4: QuestionCard.svelte** — port the exact scroll rules from the current `StudyPage.svelte` `.card.question` block (page never scrolls; stem/image scroll inside):

```svelte
<script lang="ts">
    export let image = "";
    export let front = "";
    export let alt = "question";
</script>

<div class="card question">
    {#if image}
        <div class="qimg"><img src={image} {alt} /></div>
    {:else if front}
        <div class="qtext"><p class="stem">{front}</p></div>
    {/if}
</div>

<style lang="scss">
    .card {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow: hidden;
        background: var(--canvas-elevated);
        border: 1px solid var(--border);
        border-radius: var(--sf-r-md);
        padding: 1rem;
        box-shadow: var(--sf-shadow-1);
    }
    .qtext,
    .qimg {
        flex: 1 1 auto;
        min-height: 0;
        align-self: stretch;
        overflow: auto;
    }
    .stem {
        margin: 0;
        white-space: pre-wrap;
        font-size: 17px;
        line-height: 1.6;
    }
    .qimg img {
        display: block;
        width: 100%;
        height: auto;
        margin: 0 auto;
        border-radius: var(--sf-r-sm);
        background: #fff;
    }
</style>
```

- [ ] **Step 5: ChoiceGrid.svelte** — grading strictly opt-in; `pending` renders the diagnostic's two-step gold ring; `collapsed` renders the post-answer 40px chip row:

```svelte
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import KeyHint from "./KeyHint.svelte";
    const dispatch = createEventDispatcher();

    const LETTERS = ["A", "B", "C", "D"];
    export let choices: string[] = [];
    export let lettersOnly = false;
    export let disabled = false;
    export let graded = false;
    export let chosen: string | null = null;
    export let answer = "";
    export let pending: string | null = null;
    export let collapsed = false;
</script>

<div class="choices" class:letters={lettersOnly} class:collapsed>
    {#each LETTERS as letter, i (letter)}
        <button
            class="choice"
            class:pending={pending === letter}
            class:selected={graded && chosen === letter}
            class:right={graded && chosen !== null && letter === answer}
            class:wrong={graded && chosen === letter && letter !== answer}
            {disabled}
            on:click={() => dispatch("choose", { letter })}
        >
            <span class="letter">{letter}</span>
            {#if graded && chosen !== null && letter === answer}<span class="mark">✓</span>{/if}
            {#if graded && chosen === letter && letter !== answer}<span class="mark">✗</span>{/if}
            {#if !lettersOnly && choices[i] && !collapsed}
                <span class="choice-text">{choices[i]}</span>
            {/if}
            {#if !collapsed && !disabled}<span class="hint"><KeyHint key={letter} /></span>{/if}
        </button>
    {/each}
</div>

<style lang="scss">
    @use "./mixins" as sf;
    .choices {
        flex-shrink: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.5rem;
        &.letters,
        &.collapsed {
            grid-template-columns: repeat(4, 1fr);
        }
    }
    .choice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 0.8rem;
        border: 1px solid var(--border);
        border-radius: var(--sf-r-sm);
        background: var(--canvas-elevated);
        color: inherit;
        cursor: pointer;
        text-align: left;
        transition: border-color 0.12s ease, background 0.12s ease;
        @include sf.focusable;
        &:hover:not(:disabled) {
            border-color: var(--sf-gold);
            background: color-mix(in srgb, var(--sf-gold) 7%, transparent);
        }
        &:disabled {
            cursor: default;
        }
    }
    .letters .choice,
    .collapsed .choice {
        justify-content: center;
        font-weight: 800;
    }
    .letters .choice {
        padding: 0.7rem;
        font-size: 1.1rem;
    }
    .collapsed .choice {
        padding: 0.45rem;
    }
    .letter {
        font-weight: 800;
        color: var(--sf-red);
    }
    .hint {
        margin-left: auto;
    }
    .choice.pending {
        border-color: var(--sf-gold);
        box-shadow: 0 0 0 2px var(--sf-gold);
    }
    .choice.right {
        border-color: var(--sf-ok);
        background: color-mix(in srgb, var(--sf-ok) 14%, transparent);
        .letter,
        .mark {
            color: var(--sf-ok);
        }
    }
    .choice.wrong {
        border-color: var(--sf-err);
        background: color-mix(in srgb, var(--sf-err) 14%, transparent);
        .letter,
        .mark {
            color: var(--sf-err);
        }
    }
    .mark {
        font-weight: 800;
    }
</style>
```

- [ ] **Step 6: IdkButton.svelte**

```svelte
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import KeyHint from "./KeyHint.svelte";
    const dispatch = createEventDispatcher();
    export let disabled = false;
    export let selected = false;
</script>

<button class="idk" class:selected {disabled} on:click={() => dispatch("choose")}>
    Not sure — show me <span class="hint"><KeyHint key="0" /></span>
</button>

<style lang="scss">
    @use "./mixins" as sf;
    .idk {
        flex-shrink: 0;
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.55rem 0.8rem;
        border: 1px dashed var(--border);
        border-radius: var(--sf-r-sm);
        background: none;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;
        font-weight: 600;
        transition: border-color 0.12s ease, background 0.12s ease, opacity 0.12s ease;
        @include sf.focusable;
        &:hover:not(:disabled) {
            opacity: 1;
            border-color: var(--sf-steel);
            background: color-mix(in srgb, var(--sf-steel) 12%, transparent);
        }
        &:disabled {
            cursor: default;
        }
        &.selected {
            border-style: solid;
            border-color: var(--sf-steel);
            background: color-mix(in srgb, var(--sf-steel) 16%, transparent);
            opacity: 1;
        }
    }
</style>
```

- [ ] **Step 7: Verify** — `just lint`. Expected: PASS (components unused yet; svelte-check must be clean).

- [ ] **Step 8: Commit**

```bash
git add ts/routes/mcat/lib/
git commit -m "feat(mcat): shared UI primitives (SessionHeader, ChoiceGrid, QuestionCard, ...)"
```

---

### Task 4: RNG + ShuffleBag (`ring/rng.ts`)

**Files:**

- Create: `ts/routes/mcat/ring/rng.ts`
- Test: `ts/routes/mcat/ring/rng.test.ts`

**Interfaces:**

- Produces: `mulberry32(seed: number): () => number` (0..1); `class ShuffleBag<T> { constructor(items: T[], rng: () => number); next(): T }` (deals all items before repeating; never deals the same item twice in a row across refills when items.length > 1); `hashId(id: bigint, salt?: number): number` (deterministic 0..2^31 int from a card id).

- [ ] **Step 1: Write failing tests** (`rng.test.ts`, AGPL header, `import { expect, test } from "vitest";`):

```ts
import { expect, test } from "vitest";

import { hashId, mulberry32, ShuffleBag } from "./rng";

test("mulberry32 is deterministic and in [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
        const v = a();
        expect(v).toBe(b());
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
    }
});

test("ShuffleBag deals every item once per cycle", () => {
    const bag = new ShuffleBag(["a", "b", "c", "d"], mulberry32(7));
    const cycle = [bag.next(), bag.next(), bag.next(), bag.next()].sort();
    expect(cycle).toEqual(["a", "b", "c", "d"]);
});

test("ShuffleBag never repeats across refill boundary", () => {
    const bag = new ShuffleBag(["a", "b", "c"], mulberry32(3));
    let prev = bag.next();
    for (let i = 0; i < 300; i++) {
        const cur = bag.next();
        expect(cur).not.toBe(prev);
        prev = cur;
    }
});

test("hashId is deterministic and varies with salt", () => {
    expect(hashId(123456789n)).toBe(hashId(123456789n));
    expect(hashId(123456789n, 1)).not.toBe(hashId(123456789n, 2));
});
```

- [ ] **Step 2: Run to verify failure** — `just test-ts` (or `npx vitest run ts/routes/mcat/ring` from the ts tooling if the recipe is slow). Expected: FAIL, module not found.

- [ ] **Step 3: Implement `rng.ts`:**

```ts
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Deals items in shuffled order; refills when empty, guarding against an
 * immediate repeat across the refill boundary. */
export class ShuffleBag<T> {
    private pool: T[];
    private bag: T[] = [];
    private last: T | undefined;

    constructor(items: T[], private rng: () => number) {
        this.pool = [...items];
    }

    next(): T {
        if (this.bag.length === 0) {
            this.bag = [...this.pool];
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(this.rng() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
            if (
                this.pool.length > 1
                && this.bag[this.bag.length - 1] === this.last
            ) {
                [this.bag[0], this.bag[this.bag.length - 1]] = [
                    this.bag[this.bag.length - 1],
                    this.bag[0],
                ];
            }
        }
        this.last = this.bag.pop()!;
        return this.last;
    }
}

/** Deterministic 31-bit hash of a card id (+salt) for stable cosmetic picks. */
export function hashId(id: bigint, salt = 0): number {
    let h = Number(((id % 2147483647n) + 2147483647n) % 2147483647n)
        ^ (salt * 2654435761);
    h = Math.imul(h ^ (h >>> 16), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return (h ^ (h >>> 16)) >>> 0;
}
```

- [ ] **Step 4: Run tests** — `just test-ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ts/routes/mcat/ring/rng.ts ts/routes/mcat/ring/rng.test.ts
git commit -m "feat(mcat): session RNG, ShuffleBag, deterministic card hash"
```

---

### Task 5: Parametric body geometry (`ring/geometry.ts`)

**Files:**

- Create: `ts/routes/mcat/ring/geometry.ts`
- Test: `ts/routes/mcat/ring/geometry.test.ts`

**Interfaces:**

- Produces (consumed by FighterRig/roster):
  - `capsulePath(x1, y1, r1, x2, y2, r2): string` — closed tapered-capsule SVG path.
  - `type JointName = "root" | "pelvis" | "spine" | "chest" | "neck" | "head" | "armFront" | "forearmFront" | "armBack" | "forearmBack" | "legFront" | "shinFront" | "legBack" | "shinBack";`
  - `joints(bulk: number): Record<JointName, [number, number]>` — anatomical pivot coordinates in the 120×150 viewBox; shoulders widen with bulk.
  - `bodyPaths(bulk: number): { limbs: Record<string, string>; torso: string; muscles: string[] }` — capsule limb paths keyed by segment, one of 4 drawn torso silhouettes (thresholds: bulk <0.2 lean, <0.55 fit, <0.85 heavy, else colossal), and muscle overlay paths whose rendered opacity = `0.25 * bulk` (applied by FighterRig).
  - `const BUILD_BULK = { lean: 0, fit: 0.35, heavy: 0.7, colossal: 1 } as const;`

- [ ] **Step 1: Failing tests** (`geometry.test.ts`):

```ts
import { expect, test } from "vitest";

import { bodyPaths, BUILD_BULK, capsulePath, joints } from "./geometry";

test("capsulePath is a closed path with two arc caps", () => {
    const p = capsulePath(0, 0, 3, 0, 20, 5);
    expect(p.startsWith("M ")).toBe(true);
    expect(p.match(/A /g)?.length).toBe(2);
    expect(p.trim().endsWith("Z")).toBe(true);
});

test("shoulders widen with bulk, joints stay anatomical", () => {
    const lean = joints(BUILD_BULK.lean);
    const col = joints(BUILD_BULK.colossal);
    expect(col.armFront[0]).toBeGreaterThan(lean.armFront[0]);
    expect(col.armBack[0]).toBeLessThan(lean.armBack[0]);
    // pivots sit exactly where the limb paths start
    const paths = bodyPaths(BUILD_BULK.colossal);
    expect(paths.limbs.armFront).toContain("A ");
});

test("torso silhouette steps through 4 drawn variants", () => {
    const seen = new Set(
        [0, 0.35, 0.7, 1].map((b) => bodyPaths(b).torso),
    );
    expect(seen.size).toBe(4);
});
```

- [ ] **Step 2: Run** — `just test-ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `geometry.ts`** — full content:

```ts
export type JointName =
    | "root"
    | "pelvis"
    | "spine"
    | "chest"
    | "neck"
    | "head"
    | "armFront"
    | "forearmFront"
    | "armBack"
    | "forearmBack"
    | "legFront"
    | "shinFront"
    | "legBack"
    | "shinBack";

export const BUILD_BULK = {
    lean: 0,
    fit: 0.35,
    heavy: 0.7,
    colossal: 1,
} as const;

const fmt = (n: number): string => n.toFixed(2);

/** Closed tapered capsule from (x1,y1,r1) to (x2,y2,r2). */
export function capsulePath(
    x1: number,
    y1: number,
    r1: number,
    x2: number,
    y2: number,
    r2: number,
): string {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return [
        `M ${fmt(x1 + nx * r1)} ${fmt(y1 + ny * r1)}`,
        `L ${fmt(x2 + nx * r2)} ${fmt(y2 + ny * r2)}`,
        `A ${fmt(r2)} ${fmt(r2)} 0 0 1 ${fmt(x2 - nx * r2)} ${
            fmt(y2 - ny * r2)
        }`,
        `L ${fmt(x1 - nx * r1)} ${fmt(y1 - ny * r1)}`,
        `A ${fmt(r1)} ${fmt(r1)} 0 0 1 ${fmt(x1 + nx * r1)} ${
            fmt(y1 + ny * r1)
        }`,
        "Z",
    ].join(" ");
}

/** Anatomical pivots in the 120x150 viewBox. Shoulders/hips spread with bulk
 * so pivots always sit exactly on the joints the paths are built from. */
export function joints(bulk: number): Record<JointName, [number, number]> {
    const sh = 16 + 3 * bulk; // shoulder half-span from spine x=60
    return {
        root: [60, 150],
        pelvis: [60, 92],
        spine: [60, 90],
        chest: [60, 68],
        neck: [62, 52],
        head: [62, 46],
        armFront: [60 + sh, 66],
        forearmFront: [60 + sh + 8, 84],
        armBack: [60 - sh, 66],
        forearmBack: [60 - sh - 8, 84],
        legFront: [72, 96],
        shinFront: [74, 122],
        legBack: [48, 96],
        shinBack: [46, 122],
    };
}

/* limb radii: [proximal, distal] at bulk 0; widened non-uniformly with bulk */
const LIMB_R = {
    arm: [4.4, 3.4],
    forearm: [3.6, 2.6],
    leg: [5.2, 4.0],
    shin: [4.2, 3.0],
    neck: [3.0, 3.0],
} as const;
const widen = (r: number, bulk: number, f: number): number =>
    r * (1 + f * bulk);

/* 4 drawn torso silhouettes (lean taper -> colossal trapezius hump) */
const TORSOS = [
    "M 47 68 C 48 60 54 55 60 55 C 66 55 72 60 73 68 L 71 90 C 68 93 52 93 49 90 Z",
    "M 45 68 C 46 58 53 54 60 54 C 67 54 74 58 75 68 L 72 90 C 68 94 52 94 48 90 Z",
    "M 42 69 C 43 57 52 52 60 52 C 68 52 77 57 78 69 L 73 91 C 68 95 52 95 47 91 Z",
    "M 39 70 C 40 55 50 48 60 48 C 70 48 80 55 81 70 L 74 92 C 68 97 52 97 46 92 Z",
] as const;

/* deltoid/pec/ab highlight strokes; opacity scales with bulk in the rig */
const MUSCLES = [
    "M 50 60 C 54 57 66 57 70 60",
    "M 52 70 C 56 73 64 73 68 70",
    "M 56 78 L 56 86 M 64 78 L 64 86",
] as const;

export function bodyPaths(bulk: number): {
    limbs: Record<string, string>;
    torso: string;
    muscles: string[];
} {
    const j = joints(bulk);
    const a = (r: number) => widen(r, bulk, 0.35); // arms + neck
    const l = (r: number) => widen(r, bulk, 0.25); // legs
    const seg = (
        from: [number, number],
        to: [number, number],
        r: readonly [number, number],
        w: (r: number) => number,
    ) => capsulePath(from[0], from[1], w(r[0]), to[0], to[1], w(r[1]));
    const torso = bulk < 0.2
        ? TORSOS[0]
        : bulk < 0.55
        ? TORSOS[1]
        : bulk < 0.85
        ? TORSOS[2]
        : TORSOS[3];
    return {
        limbs: {
            armFront: seg(j.armFront, j.forearmFront, LIMB_R.arm, a),
            forearmFront: seg(
                j.forearmFront,
                [j.forearmFront[0] + 8, j.forearmFront[1] + 12],
                LIMB_R.forearm,
                a,
            ),
            armBack: seg(j.armBack, j.forearmBack, LIMB_R.arm, a),
            forearmBack: seg(
                j.forearmBack,
                [j.forearmBack[0] - 6, j.forearmBack[1] + 12],
                LIMB_R.forearm,
                a,
            ),
            legFront: seg(j.legFront, j.shinFront, LIMB_R.leg, l),
            shinFront: seg(
                j.shinFront,
                [j.shinFront[0] + 2, 146],
                LIMB_R.shin,
                l,
            ),
            legBack: seg(j.legBack, j.shinBack, LIMB_R.leg, l),
            shinBack: seg(j.shinBack, [j.shinBack[0] - 2, 146], LIMB_R.shin, l),
            neck: seg(j.neck, j.head, LIMB_R.neck, a),
        },
        torso,
        muscles: [...MUSCLES],
    };
}
```

- [ ] **Step 4: Run tests** — `just test-ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ts/routes/mcat/ring/geometry.ts ts/routes/mcat/ring/geometry.test.ts
git commit -m "feat(mcat): parametric tapered-capsule body geometry with bulk axis"
```

---

### Task 6: Roster + tier mapping (`ring/roster.ts`)

**Files:**

- Create: `ts/routes/mcat/ring/roster.ts`
- Test: `ts/routes/mcat/ring/roster.test.ts`

**Interfaces:**

- Consumes: `hashId` from `./rng`, `BUILD_BULK` from `./geometry`, `McatStudyItem` fields from Task 1.
- Produces:
  - Types: `Species` (`"rookie" | "sidewinder" | "hobnail" | "howler" | "gravel" | "bullhorn" | "chiron"`), `Build`, `Tier` (1–6), `Palette { skin; trunks; glove; accent; fur? }`, `SpeciesSpec { id; name; chassis: "biped" | "taur"; build: Build; headPath: string; extraPaths: string[]; palettes: Palette[]; hitSfx: string; amp: number; wt: number }`, `OpponentInstance { species: SpeciesSpec; tier: Tier; scale: number; bulk: number; paletteIndex: number }`.
  - `SPECIES: Record<Species, SpeciesSpec>` — all 7 entries (Wave 1 renders rookie/hobnail/bullhorn; the rest are used by the gallery and later waves; chiron renders as biped fallback until Wave 3).
  - `tierFor(authored: number, fsrs: number, tagged: boolean): Tier` — spec §5 formula.
  - `opponentFor(item: { cardId: bigint; difficulty: number; fsrsDifficulty: number; difficultyTagged: boolean }, cache: Map<string, Tier>): OpponentInstance` — tier frozen per card per session via `cache` (key `String(cardId)`); deterministic species/palette from `hashId`; within-band bulk interpolation.
  - `tierFromMastery(weakness: number): Tier` — dashboard fight cards (`weakness` 0–1).
  - `heroBulk(readinessPct: number): number` — 0 / 0.35 / 0.7 at <40 / <70 / ≥70.
  - `TIER_SPECIES: Record<Tier, Species[]>` — `{1:["rookie"],2:["sidewinder"],3:["hobnail"],4:["howler","gravel"],5:["bullhorn"],6:["chiron"]}`; Wave 1 remaps 2→rookie, 4→hobnail via `WAVE1_FALLBACK` so unshipped species degrade to the nearest shipped silhouette. 6→bullhorn until chiron ships.

- [ ] **Step 1: Failing tests** (`roster.test.ts`):

```ts
import { expect, test } from "vitest";

import {
    heroBulk,
    opponentFor,
    SPECIES,
    tierFor,
    tierFromMastery,
} from "./roster";

test("tierFor follows the spec formula", () => {
    expect(tierFor(3, 0, true)).toBe(3); // untagged fsrs -> authored
    expect(tierFor(5, 8.0, true)).toBe(6); // authored 5 + brutal -> centaur
    expect(tierFor(5, 5.0, true)).toBe(5);
    expect(tierFor(2, 2.0, true)).toBe(1); // easy for you -> -1
    expect(tierFor(3, 9.9, false)).toBe(6); // untagged: fsrs-only base 5, +1 mod
    expect(tierFor(1, 0, false)).toBe(1);
});

test("opponent identity is deterministic and tier is frozen per session", () => {
    const cache = new Map<string, Tier>();
    const item = {
        cardId: 999n,
        difficulty: 4,
        fsrsDifficulty: 0,
        difficultyTagged: true,
    };
    const a = opponentFor(item, cache);
    const b = opponentFor({ ...item, fsrsDifficulty: 9.9 }, cache); // fsrs moved mid-session
    expect(a.species.id).toBe(b.species.id); // frozen
    expect(a.paletteIndex).toBe(b.paletteIndex);
});

test("tier 5 is the minotaur, tier 6 falls back to bullhorn in wave 1", () => {
    const cache = new Map<string, Tier>();
    const t5 = opponentFor({
        cardId: 1n,
        difficulty: 5,
        fsrsDifficulty: 5,
        difficultyTagged: true,
    }, cache);
    expect(t5.species.id).toBe("bullhorn");
});

test("hero bulk steps at readiness 40/70", () => {
    expect(heroBulk(10)).toBe(0);
    expect(heroBulk(50)).toBe(0.35);
    expect(heroBulk(80)).toBe(0.7);
});

test("dashboard mastery mapping covers all tiers", () => {
    expect(tierFromMastery(0)).toBe(1);
    expect(tierFromMastery(1)).toBe(6);
});

test("all seven species exist with heads and palettes", () => {
    for (const s of Object.values(SPECIES)) {
        expect(s.headPath.length).toBeGreaterThan(10);
        expect(s.palettes.length).toBeGreaterThanOrEqual(2);
    }
});
```

- [ ] **Step 2: Run** — `just test-ts`. Expected: FAIL.

- [ ] **Step 3: Implement `roster.ts`:**

```ts
import { BUILD_BULK } from "./geometry";
import { hashId } from "./rng";

export type Species =
    | "rookie"
    | "sidewinder"
    | "hobnail"
    | "howler"
    | "gravel"
    | "bullhorn"
    | "chiron";
export type Build = keyof typeof BUILD_BULK;
export type Chassis = "biped" | "taur";
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export interface Palette {
    skin: string;
    trunks: string;
    glove: string;
    accent: string;
    fur?: string;
}

export interface SpeciesSpec {
    id: Species;
    name: string;
    chassis: Chassis;
    build: Build;
    headPath: string;
    extraPaths: string[];
    palettes: Palette[];
    hitSfx: string;
    amp: number;
    wt: number;
}

export interface OpponentInstance {
    species: SpeciesSpec;
    tier: Tier;
    scale: number;
    bulk: number;
    paletteIndex: number;
}

/* Draft head/extra paths — tuned visually in the Task 8 gallery spike.
   All paths live in the 120x150 viewBox, heads centered near (62,40). */
export const SPECIES: Record<Species, SpeciesSpec> = {
    rookie: {
        id: "rookie",
        name: "ROOKIE",
        chassis: "biped",
        build: "lean",
        headPath: "M 52 30 A 11 11 0 1 1 52 52 A 12 13 0 0 1 52 30 Z",
        extraPaths: ["M 50 28 A 13 13 0 0 1 76 32 L 72 40 A 9 9 0 0 0 54 38 Z"], // headgear dome
        palettes: [
            {
                skin: "#c9a181",
                trunks: "#3d4657",
                glove: "#4a5262",
                accent: "#566073",
            },
            {
                skin: "#a9846a",
                trunks: "#42556a",
                glove: "#4a5262",
                accent: "#5d6b80",
            },
        ],
        hitSfx: "BAP!",
        amp: 1.15,
        wt: 0.9,
    },
    sidewinder: {
        id: "sidewinder",
        name: "SIDEWINDER",
        chassis: "biped",
        build: "fit",
        headPath: "M 50 34 Q 58 26 70 32 Q 76 38 70 48 Q 58 54 50 46 Z",
        extraPaths: ["M 58 26 L 62 14 L 66 26 Z", "M 70 40 Q 78 40 80 44"], // crest fin + snout hint
        palettes: [
            {
                skin: "#3f5c54",
                trunks: "#2e4a4a",
                glove: "#37504e",
                accent: "#5f7a72",
            },
            {
                skin: "#46584f",
                trunks: "#33484f",
                glove: "#3a4f52",
                accent: "#67806f",
            },
        ],
        hitSfx: "SSAK!",
        amp: 1.1,
        wt: 0.95,
    },
    hobnail: {
        id: "hobnail",
        name: "HOBNAIL",
        chassis: "biped",
        build: "heavy",
        headPath: "M 50 32 Q 62 24 74 32 Q 78 42 72 50 Q 60 56 50 48 Z",
        extraPaths: ["M 48 36 L 38 30 L 48 42 Z", "M 74 36 L 84 30 L 74 42 Z"], // ear points
        palettes: [
            {
                skin: "#6a6f4e",
                trunks: "#3a4030",
                glove: "#4c523c",
                accent: "#7c825e",
            },
            {
                skin: "#5e6549",
                trunks: "#3f4436",
                glove: "#50563f",
                accent: "#878c66",
            },
        ],
        hitSfx: "CRACK!",
        amp: 0.95,
        wt: 1.1,
    },
    howler: {
        id: "howler",
        name: "HOWLER",
        chassis: "biped",
        build: "heavy",
        headPath: "M 48 34 Q 56 26 66 30 L 80 40 Q 74 50 62 52 Q 50 50 48 42 Z",
        extraPaths: ["M 52 28 L 48 16 L 58 24 Z", "M 62 28 L 62 14 L 70 24 Z"], // ears
        palettes: [
            {
                skin: "#2b2f38",
                trunks: "#232732",
                glove: "#343947",
                accent: "#4a4f5c",
                fur: "#4a4f5c",
            },
            {
                skin: "#31353f",
                trunks: "#282c37",
                glove: "#3a3f4d",
                accent: "#525866",
                fur: "#525866",
            },
        ],
        hitSfx: "AWROO!",
        amp: 1.05,
        wt: 1.0,
    },
    gravel: {
        id: "gravel",
        name: "GRAVEL",
        chassis: "biped",
        build: "colossal",
        headPath: "M 50 30 L 76 30 L 78 48 L 48 48 Z",
        extraPaths: ["M 54 34 L 60 44", "M 66 32 L 70 46"], // crack seams (accent stroke)
        palettes: [
            {
                skin: "#33363d",
                trunks: "#2a2d33",
                glove: "#3d4148",
                accent: "#a3121c",
            },
            {
                skin: "#383b42",
                trunks: "#2e3138",
                glove: "#42464e",
                accent: "#8c1019",
            },
        ],
        hitSfx: "THOOM!",
        amp: 0.8,
        wt: 1.25,
    },
    bullhorn: {
        id: "bullhorn",
        name: "BULLHORN",
        chassis: "biped",
        build: "colossal",
        headPath:
            "M 50 32 Q 62 22 74 32 Q 78 44 70 52 L 66 56 Q 62 58 58 56 L 54 52 Q 46 44 50 32 Z",
        extraPaths: [
            "M 50 32 Q 36 26 32 14 Q 44 18 52 26 Z", // left horn
            "M 74 32 Q 88 26 92 14 Q 80 18 72 26 Z", // right horn
            "M 58 50 Q 62 54 66 50", // snout ring line
        ],
        palettes: [
            {
                skin: "#262223",
                trunks: "#1d1a1b",
                glove: "#3a3336",
                accent: "#8a6d2f",
            },
            {
                skin: "#2c2628",
                trunks: "#221e20",
                glove: "#413a3d",
                accent: "#9b7c38",
            },
        ],
        hitSfx: "THUD!",
        amp: 0.8,
        wt: 1.25,
    },
    chiron: {
        id: "chiron",
        name: "CHIRON, WARLORD",
        chassis: "taur",
        build: "colossal",
        headPath: "M 52 30 Q 62 22 72 30 Q 76 40 70 48 Q 60 54 52 46 Z",
        extraPaths: ["M 56 26 Q 50 12 60 8 Q 58 20 64 26 Z"], // war crest/mane
        palettes: [
            {
                skin: "#3a2d26",
                trunks: "#2b211c",
                glove: "#4a3a30",
                accent: "#a3121c",
            },
            {
                skin: "#41332b",
                trunks: "#302620",
                glove: "#524139",
                accent: "#8c1019",
            },
        ],
        hitSfx: "BOOM!",
        amp: 0.85,
        wt: 1.2,
    },
};

export const TIER_SPECIES: Record<Tier, Species[]> = {
    1: ["rookie"],
    2: ["sidewinder"],
    3: ["hobnail"],
    4: ["howler", "gravel"],
    5: ["bullhorn"],
    6: ["chiron"],
};

/* Wave 1 ships rookie/hobnail/bullhorn; others degrade to nearest silhouette. */
const WAVE1_SHIPPED: Set<Species> = new Set(["rookie", "hobnail", "bullhorn"]);
const WAVE1_FALLBACK: Record<Species, Species> = {
    rookie: "rookie",
    sidewinder: "rookie",
    hobnail: "hobnail",
    howler: "hobnail",
    gravel: "hobnail",
    bullhorn: "bullhorn",
    chiron: "bullhorn",
};

const TIER_SCALE: Record<Tier, number> = {
    1: 0.9,
    2: 0.98,
    3: 1.06,
    4: 1.16,
    5: 1.28,
    6: 1.35,
};

const clamp = (n: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, n));

export function tierFor(authored: number, fsrs: number, tagged: boolean): Tier {
    const base = tagged || fsrs === 0
        ? clamp(authored, 1, 5)
        : clamp(Math.round(1 + ((fsrs - 1) / 9) * 4), 1, 5);
    const mod = fsrs === 0 ? 0 : fsrs >= 7.5 ? 1 : fsrs <= 3.5 ? -1 : 0;
    return clamp(base + mod, 1, 6) as Tier;
}

export function opponentFor(
    item: {
        cardId: bigint;
        difficulty: number;
        fsrsDifficulty: number;
        difficultyTagged: boolean;
    },
    cache: Map<string, Tier>,
): OpponentInstance {
    const key = String(item.cardId);
    let tier = cache.get(key);
    if (tier === undefined) {
        tier = tierFor(
            item.difficulty,
            item.fsrsDifficulty,
            item.difficultyTagged,
        );
        cache.set(key, tier); // frozen per card per session — no mid-session thrash
    }
    const pool = TIER_SPECIES[tier];
    const pick = pool[hashId(item.cardId, 1) % pool.length];
    const species =
        SPECIES[WAVE1_SHIPPED.has(pick) ? pick : WAVE1_FALLBACK[pick]];
    const paletteIndex = hashId(item.cardId, 2) % species.palettes.length;
    // within-band interpolation: personally-harder cards read bulkier
    const eff = item.fsrsDifficulty > 0 ? (item.fsrsDifficulty - 5.5) / 9 : 0;
    const bulk = clamp(BUILD_BULK[species.build] + eff * 0.25, 0, 1);
    return { species, tier, scale: TIER_SCALE[tier], bulk, paletteIndex };
}

export function tierFromMastery(weakness: number): Tier {
    return clamp(Math.ceil(clamp(weakness, 0, 1) * 6), 1, 6) as Tier;
}

export function heroBulk(readinessPct: number): number {
    return readinessPct >= 70 ? 0.7 : readinessPct >= 40 ? 0.35 : 0;
}
```

- [ ] **Step 4: Run tests** — `just test-ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ts/routes/mcat/ring/roster.ts ts/routes/mcat/ring/roster.test.ts
git commit -m "feat(mcat): opponent roster, real-difficulty tier mapping, session freeze"
```

---

### Task 7: Clip registry + choreographer reducer (`ring/clips.ts`, `ring/machine.ts`)

**Files:**

- Create: `ts/routes/mcat/ring/clips.ts`, `ts/routes/mcat/ring/machine.ts`
- Test: `ts/routes/mcat/ring/machine.test.ts`

**Interfaces:**

- Consumes: `ShuffleBag`, `mulberry32` from `./rng`.
- Produces:
  - `clips.ts`: `interface ClipDef { id: string; durMs: number; intensity: 1 | 2 | 3; badge?: { text: string; tone: "gold" | "steel" | "err" }; shake?: 0 | 1 | 2 | 3 }`, `const CLIPS: Record<string, ClipDef>` (every Wave-1 clip below), `const POOLS: Record<PoolName, string[]>` with `PoolName = "power" | "counter" | "heroHit" | "oppAttack" | "bag"`.
  - `machine.ts`:
    - `type RingStatus = "reading" | "feedback" | "results";`
    - `type FightEventKind = "question" | "fast-correct" | "slow-correct" | "wrong" | "idk" | "rate-again" | "rate-hard" | "rate-good" | "rate-easy" | "bag-hit" | "results-win" | "results-draw" | "results-loss";`
    - `interface FightEvent { kind: FightEventKind; trigger: number; }`
    - `interface ScheduledClip { who: "hero" | "opp" | "bag"; clip: string; atMs: number; }`
    - `interface RingModel { status: RingStatus; heroStance: string; oppStance: string; queue: ScheduledClip[]; badge: ClipDef["badge"] | null; shake: 0 | 1 | 2 | 3; }`
    - `initialModel(mode: "spar" | "train" | "bag"): RingModel`
    - `reduce(model: RingModel, ev: FightEvent, pools: { next(pool: PoolName): string }): RingModel` — pure; STRUCTURAL guarantee: any model whose `status === "reading"` has an empty queue and every stance's intensity is 1 (reduce filters, it does not trust callers).
    - `makePools(seed: number): { next(pool: PoolName): string }` — ShuffleBags per pool.

- [ ] **Step 1: Write `clips.ts`** (registry only — CSS classes are authored in Task 9; durations/intensities/badges below are the single source of truth):

```ts
export interface ClipDef {
    id: string;
    durMs: number;
    intensity: 1 | 2 | 3;
    badge?: { text: string; tone: "gold" | "steel" | "err" };
    shake?: 0 | 1 | 2 | 3;
}

const c = (
    id: string,
    durMs: number,
    intensity: 1 | 2 | 3,
    badge?: ClipDef["badge"],
    shake?: ClipDef["shake"],
): ClipDef => ({ id, durMs, intensity, badge, shake });

export const CLIPS: Record<string, ClipDef> = Object.fromEntries(
    [
        // loops (intensity 1 = reading-safe)
        c("stance-guard", 2900, 1),
        c("stance-bounce", 1800, 2),
        c("stance-jumprope", 520, 1),
        c("stance-spent", 3200, 1),
        c("bag-sway", 4500, 1),
        // hero power (fast-correct)
        c("atk-cross", 560, 3, { text: "POW!", tone: "gold" }, 2),
        c("atk-uppercut", 620, 3, { text: "BAM!", tone: "gold" }, 2),
        c("atk-hook", 580, 3, { text: "WHAM!", tone: "gold" }, 2),
        // hero counters (slow-correct)
        c("ctr-slip-jab", 640, 3, { text: "POINT!", tone: "gold" }, 1),
        c("ctr-block-hook", 700, 3, { text: "POINT!", tone: "gold" }, 1),
        // hero hit reactions (wrong)
        c("hit-head-snap", 480, 3, { text: "OOF!", tone: "err" }, 1),
        c("hit-gut-fold", 560, 3, { text: "OOF!", tone: "err" }, 1),
        c("hit-stagger", 640, 3, { text: "OOF!", tone: "err" }, 1),
        // IDK
        c("def-step-back", 600, 2, { text: "GOOD CALL", tone: "steel" }),
        // opponent shared core
        c("opp-atk-jab", 420, 3),
        c("opp-atk-cross", 520, 3),
        c("opp-hit-head-snap", 480, 3),
        c("opp-hit-gut-fold", 560, 3),
        c("opp-hit-stagger-ropes", 640, 3),
        c("opp-block", 500, 2),
        c("opp-taunt-respect-nod", 700, 2),
        // bag strikes (diagnostic + flashcard training beats)
        c("bag-jab", 340, 2, { text: "POW!", tone: "gold" }),
        c("bag-cross", 500, 2, { text: "BAM!", tone: "gold" }),
        c("bag-hook", 520, 2, { text: "WHAM!", tone: "gold" }),
        c("bag-uppercut", 550, 2, { text: "BOOM!", tone: "gold" }),
        // results
        c("win-arms-up", 1200, 3, undefined, 2),
        c("draw-glove-touch", 900, 2),
        c("loss-towel-nod", 1100, 2),
    ].map((d) => [d.id, d]),
);

export type PoolName = "power" | "counter" | "heroHit" | "oppAttack" | "bag";

export const POOLS: Record<PoolName, string[]> = {
    power: ["atk-cross", "atk-uppercut", "atk-hook"],
    counter: ["ctr-slip-jab", "ctr-block-hook"],
    heroHit: ["hit-head-snap", "hit-gut-fold", "hit-stagger"],
    oppAttack: ["opp-atk-jab", "opp-atk-cross"],
    bag: ["bag-jab", "bag-cross", "bag-hook", "bag-uppercut"],
};

/** Opponent reaction matched to the hero strike that landed. */
export const MATCHED_REACT: Record<string, string> = {
    "atk-cross": "opp-hit-stagger-ropes",
    "atk-uppercut": "opp-hit-head-snap",
    "atk-hook": "opp-hit-stagger-ropes",
    "ctr-slip-jab": "opp-hit-head-snap",
    "ctr-block-hook": "opp-hit-gut-fold",
};
```

- [ ] **Step 2: Failing reducer tests** (`machine.test.ts`):

```ts
import { expect, test } from "vitest";

import { CLIPS } from "./clips";
import { initialModel, makePools, reduce } from "./machine";

const pools = () => makePools(42);

test("reading state is structurally quiet", () => {
    let m = initialModel("spar");
    m = reduce(m, { kind: "fast-correct", trigger: 1 }, pools());
    expect(m.status).toBe("feedback");
    expect(m.queue.length).toBeGreaterThan(0);
    m = reduce(m, { kind: "question", trigger: 2 }, pools());
    expect(m.status).toBe("reading");
    expect(m.queue).toEqual([]);
    expect(CLIPS[m.heroStance].intensity).toBe(1);
    expect(CLIPS[m.oppStance].intensity).toBe(1);
});

test("fast-correct schedules hero strike then matched opponent react", () => {
    const m = reduce(
        initialModel("spar"),
        { kind: "fast-correct", trigger: 1 },
        pools(),
    );
    const hero = m.queue.find((q) => q.who === "hero")!;
    const opp = m.queue.find((q) => q.who === "opp")!;
    expect(hero.clip.startsWith("atk-")).toBe(true);
    expect(opp.atMs).toBeGreaterThan(hero.atMs);
    expect(m.badge?.tone).toBe("gold");
});

test("wrong schedules opponent telegraph then hero hit", () => {
    const m = reduce(
        initialModel("spar"),
        { kind: "wrong", trigger: 1 },
        pools(),
    );
    const opp = m.queue.find((q) => q.who === "opp")!;
    const hero = m.queue.find((q) => q.who === "hero")!;
    expect(opp.atMs).toBe(0);
    expect(hero.atMs).toBeGreaterThanOrEqual(180);
    expect(m.heroStance).toBe("stance-spent");
});

test("bag mode reacts identically for every answer (no leak)", () => {
    const p = pools();
    const a = reduce(initialModel("bag"), { kind: "bag-hit", trigger: 1 }, p);
    expect(a.queue.every((q) => q.who === "hero" || q.who === "bag")).toBe(
        true,
    );
    expect(a.badge?.tone).toBe("gold"); // same tone regardless of correctness
});

test("a new event replaces the queue (no pile-up behind a fast student)", () => {
    let m = reduce(
        initialModel("spar"),
        { kind: "wrong", trigger: 1 },
        pools(),
    );
    const before = m.queue;
    m = reduce(m, { kind: "fast-correct", trigger: 2 }, pools());
    expect(m.queue).not.toEqual(before);
});
```

- [ ] **Step 3: Run** — `just test-ts`. Expected: FAIL (machine.ts missing).

- [ ] **Step 4: Implement `machine.ts`:**

```ts
import { CLIPS, MATCHED_REACT, type PoolName, POOLS } from "./clips";
import { mulberry32, ShuffleBag } from "./rng";

export type RingStatus = "reading" | "feedback" | "results";
export type FightEventKind =
    | "question"
    | "fast-correct"
    | "slow-correct"
    | "wrong"
    | "idk"
    | "rate-again"
    | "rate-hard"
    | "rate-good"
    | "rate-easy"
    | "bag-hit"
    | "results-win"
    | "results-draw"
    | "results-loss";

export interface FightEvent {
    kind: FightEventKind;
    trigger: number;
}
export interface ScheduledClip {
    who: "hero" | "opp" | "bag";
    clip: string;
    atMs: number;
}
export interface RingModel {
    status: RingStatus;
    heroStance: string;
    oppStance: string;
    queue: ScheduledClip[];
    badge: { text: string; tone: "gold" | "steel" | "err" } | null;
    shake: 0 | 1 | 2 | 3;
}

export function makePools(seed: number): { next(pool: PoolName): string } {
    const rng = mulberry32(seed);
    const bags = Object.fromEntries(
        (Object.keys(POOLS) as PoolName[]).map((
            k,
        ) => [k, new ShuffleBag(POOLS[k], rng)]),
    ) as Record<PoolName, ShuffleBag<string>>;
    return { next: (pool) => bags[pool].next() };
}

export function initialModel(mode: "spar" | "train" | "bag"): RingModel {
    return {
        status: "reading",
        heroStance: mode === "train" ? "stance-jumprope" : "stance-guard",
        oppStance: "stance-guard",
        queue: [],
        badge: null,
        shake: 0,
    };
}

const quiet = (stance: string): string =>
    CLIPS[stance] && CLIPS[stance].intensity === 1 ? stance : "stance-guard";

export function reduce(
    model: RingModel,
    ev: FightEvent,
    pools: { next(pool: PoolName): string },
): RingModel {
    const next: RingModel = { ...model, queue: [], badge: null, shake: 0 };
    switch (ev.kind) {
        case "question": {
            // STRUCTURAL guarantee: reading holds no queue and only intensity-1 stances.
            next.status = "reading";
            next.heroStance = quiet(
                model.heroStance === "stance-jumprope"
                    ? "stance-jumprope"
                    : "stance-guard",
            );
            next.oppStance = "stance-guard";
            return next;
        }
        case "fast-correct":
        case "slow-correct": {
            const strike = pools.next(
                ev.kind === "fast-correct" ? "power" : "counter",
            );
            next.status = "feedback";
            next.heroStance = "stance-bounce";
            next.queue = [
                { who: "hero", clip: strike, atMs: 0 },
                {
                    who: "opp",
                    clip: MATCHED_REACT[strike] ?? "opp-hit-head-snap",
                    atMs: 180,
                },
            ];
            next.badge = CLIPS[strike].badge ?? null;
            next.shake = CLIPS[strike].shake ?? 0;
            return next;
        }
        case "wrong": {
            const attack = pools.next("oppAttack");
            const hit = pools.next("heroHit");
            next.status = "feedback";
            next.heroStance = "stance-spent";
            next.queue = [
                { who: "opp", clip: attack, atMs: 0 }, // telegraph is inside the clip
                { who: "hero", clip: hit, atMs: 220 },
            ];
            next.badge = CLIPS[hit].badge ?? null;
            next.shake = 1;
            return next;
        }
        case "idk": {
            next.status = "feedback";
            next.heroStance = "stance-guard";
            next.queue = [
                { who: "hero", clip: "def-step-back", atMs: 0 },
                { who: "opp", clip: "opp-taunt-respect-nod", atMs: 250 },
            ];
            next.badge = CLIPS["def-step-back"].badge ?? null;
            return next;
        }
        case "rate-again":
        case "rate-hard":
        case "rate-good":
        case "rate-easy": {
            const map = {
                "rate-again": "bag-jab",
                "rate-hard": "bag-cross",
                "rate-good": "bag-hook",
                "rate-easy": "bag-uppercut",
            } as const;
            const clip = map[ev.kind];
            next.status = "feedback";
            next.heroStance = "stance-jumprope";
            next.queue = [
                { who: "hero", clip, atMs: 0 },
                { who: "bag", clip: `swing-${clip}`, atMs: 120 },
            ];
            next.badge = CLIPS[clip].badge ?? null;
            return next;
        }
        case "bag-hit": {
            const clip = pools.next("bag");
            next.status = "feedback";
            next.heroStance = "stance-guard";
            next.queue = [
                { who: "hero", clip, atMs: 0 },
                { who: "bag", clip: `swing-${clip}`, atMs: 120 },
            ];
            next.badge = CLIPS[clip].badge ?? null; // uniform gold — zero leak
            return next;
        }
        case "results-win":
        case "results-draw":
        case "results-loss": {
            const map = {
                "results-win": ["win-arms-up", "opp-hit-stagger-ropes"],
                "results-draw": ["draw-glove-touch", "opp-taunt-respect-nod"],
                "results-loss": ["loss-towel-nod", "opp-taunt-respect-nod"],
            } as const;
            const [hero, opp] = map[ev.kind];
            next.status = "results";
            next.heroStance = "stance-guard";
            next.queue = [
                { who: "hero", clip: hero, atMs: 0 },
                { who: "opp", clip: opp, atMs: 200 },
            ];
            next.shake = CLIPS[hero].shake ?? 0;
            return next;
        }
    }
}
```

- [ ] **Step 5: Run tests** — `just test-ts`. Expected: PASS (fix any expectation drift found in Step 1's noted correction).

- [ ] **Step 6: Commit**

```bash
git add ts/routes/mcat/ring/clips.ts ts/routes/mcat/ring/machine.ts ts/routes/mcat/ring/machine.test.ts
git commit -m "feat(mcat): clip registry and pure-reducer ring choreographer"
```

---

### Task 8: FighterRig skeleton + Wave-0 spikes + dev gallery

**Files:**

- Create: `ts/routes/mcat/ring/FighterRig.svelte`, `ts/routes/mcat/ring/grammar.scss`
- Create: `ts/routes/mcat/gallery/+page.svelte`, `ts/routes/mcat/gallery/+page.ts`

**Interfaces:**

- Consumes: `bodyPaths`, `joints`, `BUILD_BULK` (geometry), `SpeciesSpec`, `Palette` (roster).
- Produces: `FighterRig.svelte` props: `export let spec: SpeciesSpec; export let bulk = 0; export let paletteIndex = 0; export let facing: "right" | "left" = "right"; export let scale = 1; export let stance = "stance-guard"; export let clip: string | null = null; export let clipTrigger = 0; export let staticPose: string | null = null;` — dispatches `clipend` when a one-shot finishes. Skeleton `<g>` class names (the clip-authoring contract for Task 9): `.rig`, `.pelvis`, `.spine`, `.chest`, `.neck`, `.head`, `.arm.front`, `.forearm.front`, `.glove.front`, `.arm.back`, `.forearm.back`, `.glove.back`, `.leg.front`, `.shin.front`, `.leg.back`, `.shin.back`, `.muscle`, `.shadow`.

- [ ] **Step 1: `grammar.scss`** — the shared timing grammar (used by every clip in Task 9):

```scss
// Strike grammar: anticipation (0-18%) -> contact (38%) -> hit-stop hold
// (38-50%) -> overshoot (70%) -> settle (100%). Author every one-shot clip
// against these five stops so feel cannot drift between authoring sessions.
$ease-strike: cubic-bezier(0.2, 0.9, 0.1, 1);
$ease-settle: cubic-bezier(0.34, 1.56, 0.64, 1);

@mixin oneshot($dur) {
    animation-duration: calc(var(--wt, 1) * #{$dur});
    animation-timing-function: $ease-strike;
    animation-iteration-count: 1;
    animation-fill-mode: both;
}

@mixin loop($dur) {
    animation-duration: $dur;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
}
```

- [ ] **Step 2: `FighterRig.svelte`** — skeleton only (stance-guard is the one clip; full library lands in Task 9):

```svelte
<script lang="ts">
    import { createEventDispatcher } from "svelte";

    import { bodyPaths, joints } from "./geometry";
    import type { SpeciesSpec } from "./roster";

    const dispatch = createEventDispatcher();

    export let spec: SpeciesSpec;
    export let bulk = 0;
    export let paletteIndex = 0;
    export let facing: "right" | "left" = "right";
    export let scale = 1;
    export let stance = "stance-guard";
    export let clip: string | null = null;
    export let clipTrigger = 0;
    export let staticPose: string | null = null;

    $: body = bodyPaths(bulk);
    $: j = joints(bulk);
    $: pal = spec.palettes[paletteIndex % spec.palettes.length];
    $: mirror = facing === "left" ? -1 : 1;
    $: active = staticPose ?? clip ?? stance;
    $: gloveR = 8 + 3 * bulk;

    function onAnimEnd(e: AnimationEvent): void {
        // one-shots clear back to stance; loops keep going
        if (clip && e.target === e.currentTarget) {
            dispatch("clipend");
        }
    }

    const origin = (p: [number, number]): string =>
        `transform-origin: ${p[0]}px ${p[1]}px;`;
</script>

<div
    class="wrap"
    style="transform: scale({scale}) scaleX({mirror}); --amp: {spec.amp}; --wt: {spec.wt};
           --skin: {pal.skin}; --trunks: {pal.trunks}; --glove: {pal.glove};
           --accent: {pal.accent}; --fur: {pal.fur ?? pal.accent};"
>
    {#key clipTrigger}
        <svg viewBox="0 0 120 150" width="96" height="120" aria-hidden="true">
            <g class="rig {active}" style={origin(j.root)} on:animationend={onAnimEnd}>
                <ellipse class="shadow" cx="60" cy="147" rx="26" ry="4" />
                <g class="pelvis" style={origin(j.pelvis)}>
                    <g class="leg back" style={origin(j.legBack)}>
                        <path d={body.limbs.legBack} />
                        <g class="shin back" style={origin(j.shinBack)}>
                            <path d={body.limbs.shinBack} />
                        </g>
                    </g>
                    <g class="leg front" style={origin(j.legFront)}>
                        <path d={body.limbs.legFront} />
                        <g class="shin front" style={origin(j.shinFront)}>
                            <path d={body.limbs.shinFront} />
                        </g>
                    </g>
                    <path class="trunks" d="M 46 88 L 74 88 L 76 104 L 44 104 Z" />
                    <g class="spine" style={origin(j.spine)}>
                        <g class="chest" style={origin(j.chest)}>
                            <g class="arm back" style={origin(j.armBack)}>
                                <path d={body.limbs.armBack} />
                                <g class="forearm back" style={origin(j.forearmBack)}>
                                    <path d={body.limbs.forearmBack} />
                                    <circle class="glove back" cx={j.forearmBack[0] - 6} cy={j.forearmBack[1] + 14} r={gloveR} />
                                </g>
                            </g>
                            <path class="torso" d={body.torso} />
                            {#each body.muscles as m (m)}
                                <path class="muscle" d={m} style="opacity: {0.25 * bulk};" />
                            {/each}
                            <g class="neck" style={origin(j.neck)}>
                                <path d={body.limbs.neck} />
                                <g class="head" style={origin(j.head)}>
                                    <path class="head-shape" d={spec.headPath} />
                                    {#each spec.extraPaths as p (p)}
                                        <path class="extra" d={p} />
                                    {/each}
                                    <circle class="eye" cx="68" cy="38" r="1.6" />
                                </g>
                            </g>
                            <g class="arm front" style={origin(j.armFront)}>
                                <path d={body.limbs.armFront} />
                                <g class="forearm front" style={origin(j.forearmFront)}>
                                    <path d={body.limbs.forearmFront} />
                                    <circle class="glove front" cx={j.forearmFront[0] + 8} cy={j.forearmFront[1] + 14} r={gloveR} />
                                </g>
                            </g>
                        </g>
                    </g>
                </g>
            </g>
        </svg>
    {/key}
</div>

<style lang="scss">
    @use "./grammar" as g;

    .wrap {
        transform-origin: bottom center;
        line-height: 0;
    }
    svg :global(g) {
        transform-box: view-box;
    }
    .shadow {
        fill: rgb(0 0 0 / 35%);
    }
    path,
    circle.glove {
        stroke: #05070c;
        stroke-width: 1.5;
    }
    .leg path,
    .shin path {
        fill: var(--trunks);
    }
    .arm path,
    .forearm path,
    .neck > path,
    .torso {
        fill: var(--skin);
    }
    .trunks {
        fill: var(--trunks);
    }
    .head-shape {
        fill: var(--skin);
    }
    .extra {
        fill: var(--fur);
        stroke: #05070c;
        stroke-width: 1.2;
    }
    .muscle {
        fill: none;
        stroke: rgb(0 0 0 / 55%);
        stroke-width: 1.4;
    }
    .glove {
        fill: var(--glove);
    }
    .eye {
        fill: #05070c;
        stroke: none;
    }

    /* Wave-0 clip: guard breathing, <=2px, reading-safe */
    .rig.stance-guard {
        @include g.loop(2.9s);
        animation-name: guard-breathe;
    }
    .rig.stance-guard .arm.front {
        transform: rotate(-38deg);
    }
    .rig.stance-guard .forearm.front {
        transform: rotate(-55deg);
    }
    .rig.stance-guard .arm.back {
        transform: rotate(30deg);
    }
    .rig.stance-guard .forearm.back {
        transform: rotate(70deg);
    }
    @keyframes guard-breathe {
        0%, 100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(calc(var(--amp, 1) * -2px));
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .rig,
        .rig :global(*) {
            animation: none !important;
        }
    }
</style>
```

Note the two load-bearing platform behaviors this file assumes — Step 4 verifies both in the running app (Wave-0 spike): (a) CSS `transform-origin` in viewBox px on SVG `<g>` with `transform-box: view-box`; (b) `var()`/`calc()` inside `@keyframes`. Fallbacks if the spike fails: (a) wrap each joint in nested translate→rotate→translate groups computed in the template; (b) generate per-build keyframe variants in SCSS with fixed numbers.

- [ ] **Step 3: Gallery route** — `ts/routes/mcat/gallery/+page.ts`:

```ts
export const load = () => ({});
```

`ts/routes/mcat/gallery/+page.svelte`:

```svelte
<script lang="ts">
    import FighterRig from "../ring/FighterRig.svelte";
    import { BUILD_BULK } from "../ring/geometry";
    import { SPECIES } from "../ring/roster";

    const specs = Object.values(SPECIES);
    const bulks = Object.entries(BUILD_BULK);
</script>

<div class="gallery">
    <h1>Rig gallery (dev)</h1>
    <section>
        <h2>Builds (hero palette)</h2>
        <div class="row">
            {#each bulks as [name, b] (name)}
                <figure>
                    <FighterRig spec={SPECIES.rookie} bulk={b} scale={1.4} />
                    <figcaption>{name}</figcaption>
                </figure>
            {/each}
        </div>
    </section>
    <section>
        <h2>Species</h2>
        <div class="row">
            {#each specs as s (s.id)}
                <figure>
                    <FighterRig spec={s} bulk={0.8} scale={1.4} facing="left" />
                    <figcaption>{s.name}</figcaption>
                </figure>
            {/each}
        </div>
    </section>
</div>

<style lang="scss">
    .gallery {
        padding: 1.5rem;
        color: var(--sf-text);
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        align-items: flex-end;
    }
    figure {
        margin: 0;
        text-align: center;
    }
    figcaption {
        font-size: 11px;
        color: var(--sf-dim);
        letter-spacing: 0.08em;
    }
</style>
```

- [ ] **Step 4: Run the Wave-0 spike** — `just run`, open `http://localhost:40000/_anki/pages/mcat` then navigate to `/mcat/gallery` (or open the gallery page URL directly). Verify: (a) guard pose renders with arms rotated at the shoulders/elbows — if limbs rotate around the SVG origin instead, transform-origin failed → apply fallback (a); (b) the breathe loop moves ≤2px and differs visibly between a lean rookie (`--amp` 1.15) and bullhorn (`--amp` 0.8) — if not, var()-in-keyframes failed → apply fallback (b); (c) **visual bar**: at 10 feet (squint test) the four builds read lean→colossal as muscle, not balloons, and all 7 species have distinct silhouettes. Iterate on `geometry.ts` radii and `roster.ts` head paths in place until (c) passes — this is expected tuning, not scope creep. If capsules are irredeemable, fall back to hand-drawn per-species part paths mounted on the same `<g>` skeleton (architecture unchanged).

- [ ] **Step 5: Lint + commit**

```bash
just lint
git add ts/routes/mcat/ring/FighterRig.svelte ts/routes/mcat/ring/grammar.scss ts/routes/mcat/gallery/
git commit -m "feat(mcat): articulated SVG fighter rig, guard stance, dev gallery (wave-0 spikes pass)"
```

---

### Task 9: Wave-1 clip library + HeavyBag + RingFx

**Files:**

- Modify: `ts/routes/mcat/ring/FighterRig.svelte` (style block — add all clips)
- Create: `ts/routes/mcat/ring/HeavyBag.svelte`, `ts/routes/mcat/ring/RingFx.svelte`

**Interfaces:**

- Consumes: skeleton class names from Task 8; `ClipDef` ids from Task 7 (every CLIPS id must have a matching CSS class here, minus the `opp-` prefix: opponent clips reuse hero keyframes where listed).
- Produces: `HeavyBag.svelte` props `export let swing: string | null = null; export let swingTrigger = 0;` (classes `swing-bag-jab`, `swing-bag-cross`, `swing-bag-hook`, `swing-bag-uppercut`, idle sway). `RingFx.svelte` props `export let badge: { text: string; tone: "gold" | "steel" | "err" } | null = null; export let badgeTrigger = 0;` renders the pop badge; star/dust are emitted via `export let impact: { x: number; y: number } | null = null` (Wave 1: fixed impact point per side is fine).

- [ ] **Step 1: Author the hero one-shot clips in `FighterRig.svelte`** following the grammar (every clip = five stops; contact held across two keyframe stops = hit-stop). Exemplar — copy this shape for the rest (durations from `clips.ts`):

```scss
/* atk-cross: rear-hand power straight. spine drives, glove squashes at contact */
.rig.atk-cross {
    @include g.oneshot(560ms);
    animation-name: cross-root;
    .spine {
        @include g.oneshot(560ms);
        animation-name: cross-spine;
    }
    .arm.back {
        @include g.oneshot(560ms);
        animation-name: cross-arm;
    }
    .forearm.back {
        @include g.oneshot(560ms);
        animation-name: cross-forearm;
    }
    .glove.back {
        @include g.oneshot(560ms);
        animation-name: cross-glove;
    }
}
@keyframes cross-root {
    0% { transform: translateX(0); }
    18% { transform: translateX(calc(var(--amp, 1) * -3px)); }   /* anticipation */
    38%, 50% { transform: translateX(calc(var(--amp, 1) * 9px)); } /* contact + hold */
    70% { transform: translateX(calc(var(--amp, 1) * 11px)); }   /* overshoot */
    100% { transform: translateX(0); }                            /* settle */
}
@keyframes cross-spine {
    0% { transform: rotate(0); }
    18% { transform: rotate(calc(var(--amp, 1) * 6deg)); }
    38%, 50% { transform: rotate(calc(var(--amp, 1) * -10deg)); }
    70% { transform: rotate(calc(var(--amp, 1) * -12deg)); }
    100% { transform: rotate(0); }
}
@keyframes cross-arm {
    0% { transform: rotate(30deg); }
    18% { transform: rotate(48deg); }
    38%, 50% { transform: rotate(-64deg); }
    70% { transform: rotate(-70deg); }
    100% { transform: rotate(30deg); }
}
@keyframes cross-forearm {
    0% { transform: rotate(70deg); }
    18% { transform: rotate(85deg); }
    38%, 50% { transform: rotate(-6deg); }
    70% { transform: rotate(-10deg); }
    100% { transform: rotate(70deg); }
}
@keyframes cross-glove {
    0%, 30% { transform: scale(1); }
    38%, 50% { transform: scale(1.3, 0.85); } /* contact squash */
    62% { transform: scale(1.05); }
    100% { transform: scale(1); }
}
```

Author the remaining clips with the same structure using these joint targets (all rotations get `calc(var(--amp,1) * …)`; all durations get the `oneshot()` `--wt` multiplier automatically):

| Clip                          | Duration     | Anticipation (18%)                                                         | Contact (38–50%)                                                                                       | Notes                                                                                                   |
| ----------------------------- | ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `atk-uppercut`                | 620ms        | root `translateY(4px)`, spine `rotate(8deg)`                               | root `translateY(-5px)`, spine `rotate(-6deg)`, arm.front `rotate(96deg)`→`rotate(-88deg)` rising      | glove.front squash at contact                                                                           |
| `atk-hook`                    | 580ms        | spine `rotate(-7deg)`, arm.front winds `rotate(-80deg)`                    | spine `rotate(9deg)`, arm.front sweeps to `rotate(-20deg)`, forearm.front `rotate(-70deg)`             | horizontal arc; add 2-frame smear: a `path.smear` in the front-glove group, `opacity 0→0.4→0` at 34–42% |
| `ctr-slip-jab`                | 640ms        | root `translateX(-6px) translateY(3px)`, spine `rotate(-10deg)` (the slip) | arm.front extends `rotate(-84deg)`, forearm.front `rotate(0)`                                          | slip first, then jab — reads "won on points"                                                            |
| `ctr-block-hook`              | 700ms        | both forearms raise (`rotate(-95deg)`/`rotate(95deg)`) guard 0–30%         | then hook contact at 55–65%                                                                            | two-beat clip: absorb → answer                                                                          |
| `hit-head-snap`               | 480ms        | —                                                                          | head `rotate(-22deg)` + neck `rotate(-8deg)` at 15–25%, root `translateX(-7px)`                        | recover with settle ease; add `.flash` opacity pulse (port from old BoxerFigure)                        |
| `hit-gut-fold`                | 560ms        | —                                                                          | spine `rotate(18deg)` fold + root `translateY(3px)` at 20–32%                                          | arms drop slightly                                                                                      |
| `hit-stagger`                 | 640ms        | —                                                                          | root steps back `translateX(-4px)` / `-8px` / `-11px` at 20/45/70% with `rotate(-3deg)` wobble         | three discrete stumble beats                                                                            |
| `def-step-back`               | 600ms        | —                                                                          | root `translateX(-9px)` hop at 30%, front glove raised `rotate(-70deg)` held 30–80%                    | deliberate, upright — not a flinch                                                                      |
| `opp-atk-jab`                 | 420ms        | 0–52% telegraph: arm.front winds `rotate(24deg)` slowly                    | contact at 62–74%                                                                                      | telegraph IS the first half (hero hit lands at +220ms)                                                  |
| `opp-atk-cross`               | 520ms        | 0–45% telegraph: spine `rotate(8deg)`                                      | contact 55–70%                                                                                         |                                                                                                         |
| `opp-hit-stagger-ropes`       | 640ms        | —                                                                          | root `translateX(10px)` into ropes at 30%, `rotate(6deg)`, rebound `translateX(4px)` at 70%            | ring ropes flex is faked ring-side (skip in Wave 1)                                                     |
| `opp-block`                   | 500ms        | —                                                                          | both forearms to guard 25–75%                                                                          |                                                                                                         |
| `opp-taunt-respect-nod`       | 700ms        | —                                                                          | head `rotate(10deg)` dip 30–60%, glove.front tap chest 40%                                             | used for IDK + draw                                                                                     |
| `win-arms-up`                 | 1200ms       | crouch `translateY(4px)` 0–15%                                             | both arms `rotate(-150deg)`/`rotate(150deg)` up 30–100%, two small hops at 40/70%                      | badge none; confetti deferred to Wave 2                                                                 |
| `draw-glove-touch`            | 900ms        | —                                                                          | front glove extends to center 35–65%, head nod                                                         |                                                                                                         |
| `loss-towel-nod`              | 1100ms       | —                                                                          | head drops `rotate(14deg)` 20–50%, then back to guard 80–100%                                          | determined, not humiliated                                                                              |
| `stance-bounce` (loop)        | 1800ms       | —                                                                          | `translateY` 0→-3px→0 with alternating `pelvis rotate(±2deg)` weight shifts                            | intensity 2: feedback state only                                                                        |
| `stance-spent` (loop)         | 3200ms       | —                                                                          | guard pose + `translateY` 0→-1px, shoulders dropped (chest `rotate(3deg)`)                             | intensity 1                                                                                             |
| `stance-jumprope` (loop)      | 520ms        | —                                                                          | port the old hop + rope from BoxerFigure.svelte:188-216 onto the rig (rope = ellipse toggled by class) | intensity 1                                                                                             |
| `bag-jab/cross/hook/uppercut` | per clips.ts | reuse the matching `atk-*`/`ctr-*` keyframes via `animation-name`          |                                                                                                        | hero-only; bag swings live in HeavyBag                                                                  |

Opponent clips (`opp-*`) reuse hero keyframes by assigning the same `animation-name`s under `.rig.opp-…` selectors — the rig is facing-mirrored so nothing else changes.

- [ ] **Step 2: `HeavyBag.svelte`** — port the existing bag from `Boxer.svelte:228-378` (strap, bag body, cap, seams, `bagSway` idle, four swing keyframes) into a standalone component with the new class names (`swing-bag-jab` etc.), `{#key swingTrigger}` around the rig for replay, and reduced-motion kill switch. Keep the existing keyframe values — they already read well.

- [ ] **Step 3: `RingFx.svelte`:**

```svelte
<script lang="ts">
    export let badge: { text: string; tone: "gold" | "steel" | "err" } | null = null;
    export let badgeTrigger = 0;
    export let impact: { x: number; y: number } | null = null;
</script>

{#key badgeTrigger}
    {#if badge}
        <div class="badge {badge.tone}">{badge.text}</div>
    {/if}
    {#if impact}
        <svg class="star" style="left: {impact.x}%; top: {impact.y}%;" viewBox="0 0 24 24">
            {#each [0, 60, 120, 180, 240, 300] as a (a)}
                <line x1="12" y1="12" x2={12 + 10 * Math.cos((a * Math.PI) / 180)} y2={12 + 10 * Math.sin((a * Math.PI) / 180)} />
            {/each}
        </svg>
    {/if}
{/key}

<style lang="scss">
    .badge {
        position: absolute;
        top: 12%;
        font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
        font-weight: 800;
        font-size: 13px;
        padding: 3px 8px;
        border-radius: 7px;
        border: 2px solid #05070c;
        letter-spacing: 0.05em;
        animation: pop 0.65s ease-out 1 both;
        &.gold {
            background: var(--sf-gold);
            color: #3a2a00;
            right: 22%;
        }
        &.steel {
            background: var(--sf-steel);
            color: #0a0e16;
            left: 50%;
            transform: translateX(-50%);
        }
        &.err {
            background: var(--sf-err);
            color: #2a0308;
            left: 22%;
        }
    }
    @keyframes pop {
        0% { transform: translateY(6px) scale(0.6); opacity: 0; }
        30% { transform: translateY(0) scale(1.1); opacity: 1; }
        100% { transform: translateY(-8px) scale(1); opacity: 0; }
    }
    .star {
        position: absolute;
        width: 24px;
        height: 24px;
        animation: burst 0.22s ease-out 1 both;
        line {
            stroke: var(--sf-gold);
            stroke-width: 2;
            stroke-linecap: round;
        }
    }
    @keyframes burst {
        0% { transform: scale(0.4); opacity: 1; }
        100% { transform: scale(1.15); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
        .badge {
            animation: none;
            opacity: 1;
        }
        .star {
            display: none;
        }
    }
</style>
```

(Note: the `.steel` badge needs the translateX baked into its pop keyframes like today's `popMid` — copy that pattern from `Boxer.svelte:425-438`.)

- [ ] **Step 4: Verify in the gallery** — add a temporary clip-player row to `gallery/+page.svelte`: a `<select>` of `Object.keys(CLIPS)` + a Play button that bumps `clipTrigger` and sets `clip` on a hero rig and an opponent rig (Bullhorn). Play every clip; check: contact reads (hit-stop visible), settle springs, `--wt` makes Bullhorn feel heavier than Rookie, reduced-motion (toggle in devtools) freezes everything into the guard pose.

- [ ] **Step 5: Lint + commit**

```bash
just lint
git add ts/routes/mcat/ring/ ts/routes/mcat/gallery/
git commit -m "feat(mcat): wave-1 clip library, heavy bag, ring fx"
```

---

### Task 10: FightRing (the strip)

**Files:**

- Create: `ts/routes/mcat/ring/FightRing.svelte`

**Interfaces:**

- Consumes: `FighterRig`, `HeavyBag`, `RingFx`, `machine.ts` (`initialModel`, `reduce`, `makePools`, `FightEvent`, `RingModel`), `roster.ts` (`OpponentInstance`, `SPECIES`, `heroBulk`).
- Produces (consumed by the three pages): props `export let mode: "spar" | "train" | "bag" = "spar"; export let event: FightEvent | null = null; export let heroScale = 1; export let heroBulkValue = 0; export let opponent: OpponentInstance | null = null; export let marquee = ""; export let showPips = true; export let height = 100;` plus hide toggle persisted at localStorage `sf-boxer-hidden` (key unchanged). Hero spec: a `HERO: SpeciesSpec` export in `roster.ts` — add it there in this task (rookie-shaped, hero palette `{ skin: "#e0b088", trunks: "#c81e2c", glove: "#e11d2f", accent: "#f5c451" }`, name "YOU", amp 1.0, wt 1.0).

- [ ] **Step 1: Add `HERO` to roster.ts** (as above) with a one-line test in `roster.test.ts` (`expect(HERO.palettes[0].glove).toBe("#e11d2f")`), run `just test-ts`.

- [ ] **Step 2: Implement `FightRing.svelte`:**

```svelte
<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import FighterRig from "./FighterRig.svelte";
    import HeavyBag from "./HeavyBag.svelte";
    import RingFx from "./RingFx.svelte";
    import { type FightEvent, initialModel, makePools, reduce, type RingModel } from "./machine";
    import { HERO, type OpponentInstance } from "./roster";

    export let mode: "spar" | "train" | "bag" = "spar";
    export let event: FightEvent | null = null;
    export let heroScale = 1;
    export let heroBulkValue = 0;
    export let opponent: OpponentInstance | null = null;
    export let marquee = "";
    export let showPips = true;
    export let height = 100;

    const pools = makePools(((globalThis.crypto?.getRandomValues(new Uint32Array(1))?.[0]) ?? 12345) >>> 0);

    let model: RingModel = initialModel(mode);
    $: model = mode ? refreshMode(mode) : model;
    function refreshMode(m: typeof mode): RingModel {
        return initialModel(m);
    }

    // executor: reduce on each new event; (re)schedule the queue with timers.
    let heroClip: string | null = null;
    let oppClip: string | null = null;
    let bagSwing: string | null = null;
    let clipTrigger = 0;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let lastTrigger = 0;

    $: if (event && event.trigger !== lastTrigger) {
        lastTrigger = event.trigger;
        model = reduce(model, event, pools);
        run(model);
    }

    function run(m: RingModel): void {
        timers.forEach(clearTimeout);
        timers = [];
        heroClip = oppClip = bagSwing = null;
        clipTrigger += 1;
        for (const s of m.queue) {
            timers.push(
                setTimeout(() => {
                    if (s.who === "hero") heroClip = s.clip;
                    else if (s.who === "opp") oppClip = s.clip;
                    else bagSwing = s.clip;
                    clipTrigger += 1;
                }, s.atMs),
            );
        }
    }
    onDestroy(() => timers.forEach(clearTimeout));

    let hidden = false;
    onMount(() => {
        hidden = localStorage.getItem("sf-boxer-hidden") === "1";
    });
    function toggle(): void {
        hidden = !hidden;
        localStorage.setItem("sf-boxer-hidden", hidden ? "1" : "0");
    }

    $: pips = opponent ? "●".repeat(opponent.tier) + "○".repeat(6 - opponent.tier) : "";
</script>

{#if hidden}
    <div class="sf-boxer-collapsed">
        <button class="sf-show" on:click={toggle}>🥊 Show ring</button>
    </div>
{:else}
    <div class="sf-ring" style="height:{height}px" aria-hidden="true">
        <div class="ropes"></div>
        <div class="floor"></div>
        <div class="post l"></div>
        <div class="post r"></div>
        <button class="sf-hide" on:click={toggle} title="Hide the ring">✕</button>

        {#if marquee}
            <div class="marquee">
                {marquee}
                {#if showPips && pips}<span class="pips" title="Difficulty tier {opponent?.tier}/6">{pips}</span>{/if}
            </div>
        {/if}

        <div class="stage shake-{model.shake}">
            <div class="corner user" class:bagpose={mode !== "spar"}>
                <FighterRig
                    spec={HERO}
                    bulk={heroBulkValue}
                    facing="right"
                    scale={heroScale * 0.62}
                    stance={model.heroStance}
                    clip={heroClip}
                    {clipTrigger}
                    on:clipend={() => (heroClip = null)}
                />
            </div>
            {#if mode === "spar" && opponent}
                <div class="corner opp">
                    <FighterRig
                        spec={opponent.species}
                        bulk={opponent.bulk}
                        paletteIndex={opponent.paletteIndex}
                        facing="left"
                        scale={opponent.scale * 0.62}
                        stance={model.oppStance}
                        clip={oppClip}
                        {clipTrigger}
                        on:clipend={() => (oppClip = null)}
                    />
                </div>
            {:else if mode !== "spar"}
                <HeavyBag swing={bagSwing} swingTrigger={clipTrigger} />
            {/if}
            <RingFx badge={model.badge} badgeTrigger={lastTrigger} />
        </div>
    </div>
{/if}

<style lang="scss">
    /* Port .sf-ring/.floor/.ropes/.post/.sf-hide/.sf-show/.sf-boxer-collapsed
       styles verbatim from Boxer.svelte:124-201,440-486, minus hex fallbacks. */
    .sf-ring {
        position: relative;
        flex-shrink: 0;
        width: 100%;
        border-radius: var(--sf-r-lg);
        overflow: hidden;
        background:
            radial-gradient(130% 96% at 50% -24%, rgba(245, 196, 81, 0.1), transparent 55%),
            linear-gradient(180deg, #10131a 0%, #0b0e14 100%);
        border: 1px solid var(--sf-border);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), var(--sf-shadow-2);
    }
    .stage {
        position: absolute;
        inset: 0;
    }
    .stage.shake-1 { animation: shake1 0.12s ease-out 1; }
    .stage.shake-2 { animation: shake2 0.16s ease-out 1; }
    .stage.shake-3 { animation: shake3 0.2s ease-out 1; }
    @keyframes shake1 { 25% { transform: translate(1px, -1px); } 75% { transform: translate(-1px, 0); } }
    @keyframes shake2 { 25% { transform: translate(2px, -1px); } 75% { transform: translate(-2px, 1px); } }
    @keyframes shake3 { 20% { transform: translate(3px, -2px); } 60% { transform: translate(-3px, 1px); } 85% { transform: translate(2px, 0); } }
    .marquee {
        position: absolute;
        top: 6px;
        left: 12px;
        z-index: 2;
        font-family: ui-monospace, Consolas, monospace;
        font-size: 11px;
        color: var(--sf-dim);
        letter-spacing: 0.04em;
        .pips {
            margin-left: 0.6rem;
            color: var(--sf-gold);
        }
    }
    .corner {
        position: absolute;
        bottom: 6%;
        &.user { left: 16%; }
        &.opp { right: 14%; }
        &.user.bagpose { left: 34%; }
    }
    /* … ported ring dressing styles … */
    @media (prefers-reduced-motion: reduce) {
        .stage { animation: none !important; }
    }
</style>
```

Port the remaining dressing styles exactly as noted in the comment. Height-based fighter layout: `.corner` bottoms align; width overflow is allowed (spec: the quadruped must not render smaller).

- [ ] **Step 3: Wire the gallery** to also mount one `<FightRing>` in spar mode with a Bullhorn opponent and buttons firing each `FightEventKind` — manual QA of exchanges, badge, shake, hide toggle. `just run`, verify: fast-correct ≤900ms and returns to guard; wrong shows telegraph→hit; reading state is still.

- [ ] **Step 4: Lint + commit**

```bash
just lint
git add ts/routes/mcat/ring/ ts/routes/mcat/gallery/
git commit -m "feat(mcat): FightRing strip with reducer-driven exchanges"
```

---

### Task 11: StudyPage rewrite

**Files:**

- Modify: `ts/routes/mcat/study/StudyPage.svelte` (full rewrite)

**Interfaces:**

- Consumes: `SessionHeader`, `QuestionCard`, `ChoiceGrid`, `IdkButton`, `KeyHint` (lib), `FightRing` + `FightEvent` (ring), `opponentFor`, `heroBulk` (roster), item fields from Task 1.
- Produces: same external contract as today (`export let items: McatStudyItem[]; export let readinessPct = 50;`).

- [ ] **Step 1: Rewrite the script.** Keep: `FAST_MS = 15000`, IDK sentinel, `answerMcatCard` calls, keyboard map, `next()`. Change:

```ts
import { goto } from "$app/navigation";

import type { McatStudyItem } from "@generated/anki/scheduler_pb";
import { McatStudyItem_Kind } from "@generated/anki/scheduler_pb";
import { answerMcatCard } from "@generated/backend";

import ChoiceGrid from "../lib/ChoiceGrid.svelte";
import IdkButton from "../lib/IdkButton.svelte";
import KeyHint from "../lib/KeyHint.svelte";
import QuestionCard from "../lib/QuestionCard.svelte";
import SessionHeader from "../lib/SessionHeader.svelte";
import FightRing from "../ring/FightRing.svelte";
import type { FightEvent } from "../ring/machine";
import { heroBulk, opponentFor, type Tier } from "../ring/roster";

export let items: McatStudyItem[];
export let readinessPct = 50;

const FAST_MS = 15000;
const IDK = "__idk__";

const tierCache = new Map<string, Tier>();
let event: FightEvent | null = null;
let trigger = 0;
function fire(kind: FightEvent["kind"]): void {
    trigger += 1;
    event = { kind, trigger };
}

let index = 0;
let revealed = false;
let chosen: string | null = null;
let answering = false;
let startedAt = Date.now();
let now = Date.now();
let timerHidden = false;
const tick = setInterval(() => (now = Date.now()), 1000);
import { onDestroy, onMount } from "svelte";
onDestroy(() => clearInterval(tick));
onMount(() => (timerHidden = localStorage.getItem("sf-timer-hidden") === "1"));

$: item = items[index] as McatStudyItem | undefined;
$: isMcq = item?.kind === McatStudyItem_Kind.MCQ;
$: done = index >= items.length;
$: correct = chosen !== null && item !== undefined && chosen === item.answer;
$: opponent = item && isMcq ? opponentFor(item, tierCache) : null;
$: heroScale = 0.9 + Math.max(0, Math.min(100, readinessPct)) / 100 * 0.3;
$: marquee = item
    ? `${item.leafId} · ${item.leafName}${
        opponent ? `  vs ${opponent.species.name} · TIER ${opponent.tier}` : ""
    }`
    : "";
$: elapsed = Math.max(0, now - startedAt);
$: timerText = timerHidden
    ? ""
    : `${Math.floor(elapsed / 60000)}:${
        String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")
    }`;
$: paceState = elapsed <= FAST_MS ? "gold" : "steel";

let lastStanceIndex = -1;
$: if (item && index !== lastStanceIndex) {
    lastStanceIndex = index;
    fire("question");
}
```

`chooseLetter` / `chooseIdk` / `rate` keep their backend calls; the boxer lines become `fire(wasCorrect ? (wasFast ? "fast-correct" : "slow-correct") : "wrong")`, `fire("idk")`, and `fire(("rate-again","rate-hard","rate-good","rate-easy")[selfRating-1])` respectively. `toggleTimer()` flips `timerHidden` and persists `sf-timer-hidden`.

- [ ] **Step 2: Rewrite the template** (order: SessionHeader → FightRing → QuestionCard → ChoiceGrid/IdkButton or feedback):

```svelte
<svelte:window on:keydown={onKeydown} />

<div class="study-page">
    {#if done}
        <div class="complete">
            <h1>Session complete</h1>
            <p>Your readiness has been updated from this session's answers.</p>
            <button class="primary" on:click={() => goto("/mcat")}>Back to dashboard</button>
        </div>
    {:else if item}
        <SessionHeader
            progress={index / items.length}
            counter={`${index + 1} / ${items.length}`}
            paceState={isMcq && chosen === null ? paceState : null}
            timerText={isMcq ? timerText : ""}
            on:exit={() => goto("/mcat")}
            on:timerclick={toggleTimer}
        />
        <FightRing
            mode={isMcq ? "spar" : "train"}
            {event}
            {heroScale}
            heroBulkValue={heroBulk(readinessPct)}
            {opponent}
            {marquee}
            height={100}
        />
        {#if isMcq}
            <QuestionCard image={item.image} front={item.front} alt={`${item.leafName} question`} />
            <ChoiceGrid
                choices={item.choices}
                lettersOnly={!!item.image}
                graded
                {chosen}
                answer={item.answer}
                disabled={chosen !== null}
                collapsed={chosen !== null}
                on:choose={(e) => chooseLetter(e.detail.letter)}
            />
            {#if chosen === null}
                <IdkButton disabled={answering} on:choose={chooseIdk} />
            {:else}
                <div class="feedback" class:correct class:idk={chosen === IDK}>
                    <strong>
                        {chosen === IDK
                            ? `Good call — the answer is ${item.answer}.`
                            : correct
                              ? "Correct"
                              : `Incorrect — answer: ${item.answer}`}
                    </strong>
                    {#if item.explanation}<p>{item.explanation}</p>{/if}
                    <button class="primary" on:click={next}>
                        Continue <KeyHint key="␣" />
                    </button>
                </div>
            {/if}
        {:else}
            <!-- flashcard branch: keep today's structure; ratings use the new
                 palette classes; Show answer button gains <KeyHint key="␣"/>,
                 ratings gain KeyHint 1-4 -->
        {/if}
    {:else}
        <div class="complete">
            <h1>Nothing due right now</h1>
            <p>Come back later, or add more MCAT-tagged content.</p>
            <button class="primary" on:click={() => goto("/mcat")}>Back to dashboard</button>
        </div>
    {/if}
</div>
```

Critical layout rules in the style block: page column is `height: 100%; display: flex; flex-direction: column; gap: 0.7rem; overflow: hidden;` — QuestionCard is the only `flex: 1` element in BOTH states (delete the old `.answered { flex: 0 1 34% }` behavior); `.feedback` gets `flex: 0 1 auto; max-height: 40%; overflow: hidden;` with the `<p>` scrolling internally (`overflow: auto; min-height: 0;`); feedback border-left `4px solid var(--sf-ok)` when `.correct`, `var(--sf-steel)` when `.idk`, else `var(--sf-err)`. `.primary` uses `@include sf.button-primary`. Ratings colors: Again `--sf-err`, Hard `--sf-warn`, Good `--sf-text` + `--sf-steel` border, Easy `--sf-ok`.

- [ ] **Step 3: Verify** — `just lint` clean, then `just run`: answer fast-correct/slow/wrong/IDK via keyboard; confirm the stem stays put when feedback appears, chips grade with ✓/✗, opponent changes with a hard-tagged card (tag a note `mcat::diff::5` and confirm Bullhorn + 5 pips), ring hide toggle works and feedback still readable.

- [ ] **Step 4: Commit**

```bash
git add ts/routes/mcat/study/StudyPage.svelte
git commit -m "feat(mcat): study page rewrite — stable layout, graded chips, real opponents"
```

---

### Task 12: Dashboard rewrite

**Files:**

- Modify: `ts/routes/mcat/McatDashboard.svelte`

**Interfaces:**

- Consumes: `MeterBar` (lib), `FighterRig` + `SPECIES`, `TIER_SPECIES`, `tierFromMastery` (ring/roster), existing `recomputeMcatLeafStates`, `resetMcatProgress`.
- Produces: no interface changes (`export let readiness` unchanged).

- [ ] **Step 1: Header changes** — delete the Recompute button; on mount run `recomputeMcatLeafStates({})` fire-and-forget and assign the fresh response to `readiness` when it resolves (a subtle `refreshing…` note in `--sf-dim` while pending; do NOT block first paint). Replace the confidence triple with: `Estimate is rough — you've assessed {pct(readiness.coverage)} of the blueprint.` followed by `<details><summary>How is this computed?</summary>` containing three `MeterBar` rows (coverage/depth/freshness). Keep score, `±N pts`. Add a `⋯` button top-right (next to the SCORECARD pseudo-label) opening a small absolute-positioned menu with one item: `Reset progress…` (opens the existing dialog; keep dialog code, add Escape handling via `<svelte:window on:keydown={...}>` and `autofocus` on Cancel — note svelte a11y warnings: use an action or `bind:this` + `focus()` in `onMount` of the dialog block if `autofocus` lint-fails).

- [ ] **Step 2: NEXT OPPONENTS row** — under the header:

```ts
$: weakest = readiness.leaves
    .filter((l) => l.assessed)
    .map((l) => ({
        leaf: l,
        weakness: 1 - l.fluency * 0.6 - l.application * 0.4,
    }))
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, 3);
```

```svelte
{#if weakest.length}
    <section class="next-opponents">
        <h2>Next opponents</h2>
        <div class="fight-cards">
            {#each weakest as w (w.leaf.leafId)}
                {@const tier = tierFromMastery(w.weakness)}
                {@const spec = SPECIES[TIER_SPECIES[tier][0]]}
                <div class="fight-card">
                    <div class="portrait">
                        <FighterRig {spec} bulk={0.7} scale={0.5} facing="left" staticPose="stance-guard" />
                    </div>
                    <div class="tale">
                        <span class="name">{w.leaf.name}</span>
                        <MeterBar value={w.leaf.fluency} tone="red" />
                        <MeterBar value={w.leaf.application} tone="gold" />
                    </div>
                    <button class="fight" on:click={() => goto("/mcat/study")}>Fight →</button>
                </div>
            {/each}
        </div>
    </section>
{/if}
```

(Wave-1 fallback mapping in roster means unshipped species render as their fallback silhouette — acceptable.)

- [ ] **Step 3: Leaf cards** — name first (2-line clamp), leaf-id as dim mono chip after it, gate copy `🔒 fluency first` / `unlocked`, replace the two bar-row markups with `MeterBar` + labels, remove the hover transform. Section `h2` styling: 13px uppercase, tracking 0.08em, `--sf-dim`.

- [ ] **Step 4: Verify + commit** — `just lint`; `just run` → dashboard shows fight cards, details disclosure, ⋯ menu, reset dialog Escape/cancel-focus.

```bash
git add ts/routes/mcat/McatDashboard.svelte
git commit -m "feat(mcat): dashboard — next-opponents fight cards, quieter scorecard"
```

---

### Task 13: Diagnostic rewrite + old component removal

**Files:**

- Modify: `ts/routes/mcat/diagnostic/DiagnosticPage.svelte`, `ts/routes/mcat/diagnostic/+page.ts`, `ts/routes/mcat/diagnostic/+page.svelte`
- Delete: `ts/routes/mcat/Boxer.svelte`, `ts/routes/mcat/BoxerFigure.svelte`, `ts/routes/mcat/boxer.ts`

**Interfaces:**

- Consumes: lib primitives, `FightRing`, `FightEvent`; `computeMcatReadiness` from `@generated/backend`.
- Produces: `+page.ts` now returns `{ diagnostic, before }` where `before` is the pre-exam `McatReadinessResponse`; `DiagnosticPage.svelte` gains `export let before: McatReadinessResponse | null = null;` (wired in `+page.svelte`).

- [ ] **Step 1: Loader** — `+page.ts`:

```ts
import { computeMcatReadiness, getMcatDiagnostic } from "@generated/backend";

import type { PageLoad } from "./$types";

export const load = (async () => {
    const [diagnostic, before] = await Promise.all([
        getMcatDiagnostic({ questionCount: 0, seed: BigInt(0) }),
        computeMcatReadiness({}),
    ]);
    return { diagnostic, before };
}) satisfies PageLoad;
```

Pass `before` through `+page.svelte` into the component.

- [ ] **Step 2: Exam flow** — replace `Boxer` with `FightRing mode="bag" height={88}` (no marquee, no pips). Two-step commit: `let pending: string | null = null;` — `select(letter)` sets `pending` (any letter switches it); `lock()` runs the old `choose(pending)`; keyboard: A–D/0 select, `Enter` locks, pressing the pending letter's key again locks. Every locked answer fires `fire("bag-hit")`. Render via `ChoiceGrid` with `graded={false}` + `pending={pending}` + `IdkButton selected={pending === IDK}`. Show `press again to lock in` hint (`--sf-dim`, 12px) while `pending !== null && index < 3`. "Finish early" opens a confirm dialog: `Submit now? {answered} answered · {total - answered} unanswered.` with `Keep going` focused and `Submit` calling `finish()`.

- [ ] **Step 3: Results** — headline `#{correctTotal} / {answeredTotal} correct ({pct}%)` in the 44px gold-gradient class; second line `Readiness: {before?.readinessScore ?? "—"} → {readiness.readinessScore} ({delta >= 0 ? "+" + delta : delta}) / 528 · ±{readiness.confidenceBand} pts`; section rows sorted worst-first (`sectionRows.sort((a, b) => a.pct - b.pct)`), each with a `Train this →` button → `goto("/mcat/study")`. Results flourish: `fire(pct >= 60 ? "results-win" : pct >= 40 ? "results-draw" : "results-loss")` with the ring switched to `mode="spar"` and a mid-tier opponent (`SPECIES.hobnail`, tier 3 instance) for the tableau.

- [ ] **Step 4: Delete old components** — remove `Boxer.svelte`, `BoxerFigure.svelte`, `boxer.ts`; `grep -rn "Boxer\|boxer" ts/routes/mcat --include="*.svelte" --include="*.ts"` must return only `ring/` and localStorage key names.

- [ ] **Step 5: Verify + commit** — `just lint`; `just run` → run a short diagnostic end-to-end: two-step lock works, bag punches vary, no correctness signal mid-exam, finish-early dialog, results show the delta and worst-first sections.

```bash
git add ts/routes/mcat/diagnostic/ && git rm ts/routes/mcat/Boxer.svelte ts/routes/mcat/BoxerFigure.svelte ts/routes/mcat/boxer.ts
git commit -m "feat(mcat): diagnostic two-step commit, readiness delta results; retire old boxer"
```

---

### Task 14: E2E smoke + final gate

**Files:**

- Create: `ts/tests/e2e/mcat.test.ts`

- [ ] **Step 1: Write the smoke test** (mirrors `sanity.test.ts` conventions):

```ts
import { expect, test } from "./fixtures";

test("mcat dashboard renders scorecard", async ({ page }) => {
    await page.goto("/mcat");
    await expect(page.locator(".mcat-nav")).toBeVisible();
    await expect(page.locator(".score")).toBeVisible();
});

test("mcat study page loads (question or empty state)", async ({ page }) => {
    await page.goto("/mcat/study");
    await expect(
        page.locator(".study-page .card, .study-page .complete").first(),
    ).toBeVisible();
});

test("mcat diagnostic intro renders", async ({ page }) => {
    await page.goto("/mcat/diagnostic");
    await expect(page.locator(".diagnostic")).toBeVisible();
});
```

- [ ] **Step 2: Run** — close dev Anki (it locks `_rsbridge.pyd`), then `just test-e2e` (needs `PYTHONPATH=out\pylib` per the project's tooling quirks). Expected: 3 new tests PASS.

- [ ] **Step 3: Full gate** — `just check`. Expected: clean (fix anything it flags — formatting will likely touch the new files).

- [ ] **Step 4: Commit**

```bash
git add ts/tests/e2e/mcat.test.ts
git commit -m "test(mcat): e2e smoke for dashboard/study/diagnostic routes"
```

---

## Self-review checklist (done during plan writing)

- Spec coverage: Task 1 = spec §7; Task 2 = §2, §3.1; Task 3 = §3.5; Tasks 4–7 = §4.3, §6.3, §6.4; Task 8 = §4.2 + Wave 0 spikes (§9); Task 9 = §6.1–6.2 (Wave-1 subset); Task 10 = §4.1, §8; Task 11 = §3.3; Task 12 = §3.2; Task 13 = §3.4; Task 14 = §9 testing. Deferred to Waves 2–3 per §9: fidgets, streaks/combos, entrances, rare-skin spice rolls, species signatures, Sidewinder/Howler/Gravel/Chiron rendering, hidden-ring inline badge chip, empty-state due-count backend.
- Known judgment calls: pace diamond lives next to the timer (not positioned on the track); results tableau uses a fixed mid-tier opponent; `stance-jumprope` intensity 1 keeps the flashcard hop during reveal (matches today's behavior).
