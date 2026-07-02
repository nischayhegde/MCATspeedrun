<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { goto } from "$app/navigation";

    import type {
        McatReadinessResponse,
        McatStudyItem,
    } from "@generated/anki/scheduler_pb";
    import { answerMcatCard, recomputeMcatLeafStates } from "@generated/backend";

    import ChoiceGrid from "../lib/ChoiceGrid.svelte";
    import IdkButton from "../lib/IdkButton.svelte";
    import QuestionCard from "../lib/QuestionCard.svelte";
    import SessionHeader from "../lib/SessionHeader.svelte";
    import FightRing from "../ring/FightRing.svelte";
    import type { FightEvent } from "../ring/machine";
    import { type OpponentInstance, opponentFor } from "../ring/roster";

    export let items: McatStudyItem[];
    // Pre-exam readiness snapshot, for the before -> after delta on the results
    // screen. Null when the loader couldn't compute one (e.g. no content yet).
    export let before: McatReadinessResponse | null = null;

    const LETTERS = ["A", "B", "C", "D"];
    // Sentinel choice: never equals a real answer (A-D), so it always grades as
    // incorrect. Lets honest test-takers avoid inflating the score by guessing.
    const IDK = "__idk__";

    // During the exam the hero works a heavy bag: every locked answer lands the
    // same "bag-hit" punch (the ring cycles jab/cross/hook/uppercut for variety).
    // Because it's the same event regardless of correctness, it never leaks the
    // answer — the PRD's no-mid-exam-feedback rule holds. The two-fighter outcome
    // plays only on the results screen.
    let ringEvent: FightEvent | null = null;
    let ringTrigger = 0;
    function fire(kind: FightEvent["kind"]): void {
        ringTrigger += 1;
        ringEvent = { kind, trigger: ringTrigger };
    }

    type Phase = "intro" | "exam" | "submitting" | "results";
    let phase: Phase = "intro";
    $: ringMode = phase === "results" ? "spar" : "bag";

    let index = 0;
    let startedAt = Date.now();
    let submittedCount = 0;
    let readiness: McatReadinessResponse | null = null;
    // Two-step commit: the first activation of a choice arms `pending` (gold
    // ring); a second activation of the SAME choice — or Enter — locks it in.
    // A different choice just re-arms. Nothing is written until it's locked.
    let pending: string | null = null;
    let confirmOpen = false;
    let keepGoingBtn: HTMLButtonElement | undefined;

    // per-section running tallies for the results screen. `answerTick` is bumped
    // on every locked answer so the reactive derivations below re-run (mutating
    // the Map in place doesn't, on its own, trigger Svelte reactivity).
    const perSection = new Map<string, { correct: number; total: number }>();
    let answerTick = 0;

    // Fixed mid-tier opponent for the results tableau: SPECIES.hobnail at tier 3.
    // (difficulty 3, untagged-FSRS → tierFor returns 3, whose only species is
    // hobnail.) Frozen — purely cosmetic backdrop for the outcome flourish.
    const resultsOpponent: OpponentInstance = opponentFor(
        { cardId: 3n, difficulty: 3, fsrsDifficulty: 0, difficultyTagged: true },
        new Map(),
    );

    $: item = items[index] as McatStudyItem | undefined;
    $: total = items.length;

    // A single snapshot of the tallies, recomputed whenever a new answer locks
    // (the `answerTick` argument is what makes this reactive statement re-run;
    // mutating the Map in place doesn't, on its own, trigger Svelte reactivity).
    // Everything on the results screen derives from this snapshot.
    interface SectionRow {
        section: string;
        correct: number;
        total: number;
        pct: number;
    }
    function snapshot(_tick: number): SectionRow[] {
        return [...perSection.entries()].map(([section, v]) => ({
            section,
            correct: v.correct,
            total: v.total,
            pct: v.total ? Math.round((v.correct / v.total) * 100) : 0,
        }));
    }
    $: sectionRows = snapshot(answerTick);
    $: answeredCount = sectionRows.reduce((n, r) => n + r.total, 0);

    function begin(): void {
        if (total === 0) {
            return;
        }
        phase = "exam";
        index = 0;
        pending = null;
        startedAt = Date.now();
    }

    // First step: arm (or re-arm) the pending selection. Any letter switches it.
    function select(choice: string): void {
        if (phase !== "exam" || !item) {
            return;
        }
        pending = choice;
    }

    // Second step: commit the armed choice. Writes the answer, lands a bag punch,
    // and advances (or finishes on the last question).
    async function lock(): Promise<void> {
        if (phase !== "exam" || !item || pending === null) {
            return;
        }
        const choice = pending;
        const correct = choice === item.answer;
        const bucket = perSection.get(item.section) ?? { correct: 0, total: 0 };
        bucket.total += 1;
        if (correct) {
            bucket.correct += 1;
        }
        perSection.set(item.section, bucket);
        answerTick += 1;

        // Land a punch on the bag for every locked answer (the ring varies which).
        fire("bag-hit");

        const ms = Math.min(Date.now() - startedAt, 10 * 60 * 1000);
        // fire-and-forget scoring; no feedback is shown mid-exam
        void answerMcatCard({
            cardId: item.cardId,
            correct,
            millisecondsTaken: ms,
            selfRating: 0,
        }).then(() => {
            submittedCount += 1;
        });

        pending = null;
        if (index + 1 >= total) {
            await finish();
        } else {
            index += 1;
            startedAt = Date.now();
        }
    }

    function onChoose(letter: string): void {
        // Activating the already-pending choice locks it; otherwise it arms.
        if (pending === letter) {
            void lock();
        } else {
            select(letter);
        }
    }

    function openConfirm(): void {
        confirmOpen = true;
        // Focus "Keep going" so an accidental Enter doesn't submit.
        void Promise.resolve().then(() => keepGoingBtn?.focus());
    }

    async function finish(): Promise<void> {
        confirmOpen = false;
        phase = "submitting";
        // wait for the in-flight answer writes to land, then recompute
        const started = Date.now();
        while (submittedCount < answeredCount && Date.now() - started < 30_000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        readiness = await recomputeMcatLeafStates({});
        phase = "results";
        // Single outcome flourish, framed positively even when the score is low
        // (productive failure -> back to training). Computed straight from the
        // tallies (not the reactive `pct`, whose flush timing we don't want to
        // depend on) so the tableau matches the headline exactly.
        const tallies = [...perSection.values()];
        const answered = tallies.reduce((n, v) => n + v.total, 0);
        const correct = tallies.reduce((n, v) => n + v.correct, 0);
        const outcomePct = answered ? Math.round((correct / answered) * 100) : 0;
        // Thresholds per spec: >=60 win, 40-59 draw, <40 loss.
        if (outcomePct >= 60) {
            fire("results-win");
        } else if (outcomePct >= 40) {
            fire("results-draw");
        } else {
            fire("results-loss");
        }
    }

    function onKeydown(event: KeyboardEvent): void {
        if (phase !== "exam" || !item || confirmOpen) {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === "enter") {
            if (pending !== null) {
                event.preventDefault();
                void lock();
            }
        } else if (LETTERS.map((l) => l.toLowerCase()).includes(key)) {
            onChoose(key.toUpperCase());
        } else if (key === "0") {
            onChoose(IDK);
        }
    }

    // Results tallies. correctTotal/answeredTotal drive the headline; the exam
    // never reveals correctness before this screen.
    // Worst-first: the sections most in need of work lead the list.
    $: rankedRows = [...sectionRows].sort((a, b) => a.pct - b.pct);
    $: correctTotal = sectionRows.reduce((n, r) => n + r.correct, 0);
    $: answeredTotal = sectionRows.reduce((n, r) => n + r.total, 0);
    $: pct = answeredTotal ? Math.round((correctTotal / answeredTotal) * 100) : 0;
    $: delta = readiness && before
        ? readiness.readinessScore - before.readinessScore
        : 0;
</script>

<svelte:window on:keydown={onKeydown} />

<div class="diagnostic">
    <FightRing
        mode={ringMode}
        event={ringEvent}
        opponent={phase === "results" ? resultsOpponent : null}
        marquee=""
        showPips={false}
        height={88}
    />
    {#if phase === "intro"}
        <div class="panel intro">
            <h1>Diagnostic exam</h1>
            <p>
                {total} questions spanning every MCAT subtopic, at a spread of difficulty.
                This calibrates your readiness score and unlocks application practice where
                you're already fluent.
            </p>
            <ul>
                <li>No feedback during the exam — answer as you would on test day.</li>
                <li>Getting something wrong is fine; it tells us where to start.</li>
                <li>You can leave anytime; answered questions still count.</li>
            </ul>
            {#if total === 0}
                <p class="empty">
                    No MCAT questions found. Import content first, then come back.
                </p>
                <button class="secondary" on:click={() => goto("/mcat")}>Back</button>
            {:else}
                <button class="primary" on:click={begin}>Begin diagnostic</button>
            {/if}
        </div>
    {:else if phase === "exam" && item}
        <SessionHeader
            exitLabel="Finish early"
            progress={index / total}
            counter={`${index + 1} / ${total}`}
            on:exit={openConfirm}
        />

        <QuestionCard image={item.image} front={item.front} />

        <ChoiceGrid
            choices={item.choices}
            lettersOnly={!!item.image}
            graded={false}
            {pending}
            on:choose={(e) => onChoose(e.detail.letter)}
        />

        <IdkButton
            selected={pending === IDK}
            on:choose={() => onChoose(IDK)}
        />

        <p class="lock-hint" class:show={pending !== null && index < 3}>
            press again to lock in
        </p>

        {#if confirmOpen}
            <div class="confirm-scrim">
                <div class="confirm" role="dialog" aria-modal="true" aria-label="Submit diagnostic">
                    <p class="confirm-title">
                        Submit now? {answeredCount} answered · {total - answeredCount} unanswered.
                    </p>
                    <div class="confirm-actions">
                        <button
                            class="secondary"
                            bind:this={keepGoingBtn}
                            on:click={() => (confirmOpen = false)}
                        >
                            Keep going
                        </button>
                        <button class="primary" on:click={finish}>Submit</button>
                    </div>
                </div>
            </div>
        {/if}
    {:else if phase === "submitting"}
        <div class="panel">
            <h1>Scoring…</h1>
            <p>Computing your readiness across the blueprint.</p>
        </div>
    {:else if phase === "results" && readiness}
        <div class="panel results">
            <h1>Diagnostic complete</h1>
            <div class="headline">{correctTotal} / {answeredTotal} correct ({pct}%)</div>
            <p class="delta">
                Readiness: {before?.readinessScore ?? "—"} → {readiness.readinessScore}
                ({delta >= 0 ? "+" + delta : delta}) / 528 · ±{readiness.confidenceBand} pts
            </p>

            <h2>By section</h2>
            <div class="section-grid">
                {#each rankedRows as row (row.section)}
                    <div class="section-row">
                        <span class="section-name">{row.section}</span>
                        <div class="track">
                            <div class="fill" style:width={`${row.pct}%`}></div>
                        </div>
                        <span class="section-val">{row.correct}/{row.total}</span>
                        <button class="train" on:click={() => goto("/mcat/study")}>
                            Train this →
                        </button>
                    </div>
                {/each}
            </div>

            <div class="actions">
                <button class="primary" on:click={() => goto("/mcat/study")}>
                    Start studying
                </button>
                <button class="secondary" on:click={() => goto("/mcat")}>
                    Dashboard
                </button>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    @use "../lib/mixins" as sf;

    .diagnostic {
        height: 100%;
        max-width: 46rem;
        margin: 0 auto;
        padding: 0.9rem 1.25rem 1rem;
        font-family: var(--mcat-font, system-ui, sans-serif);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        overflow: hidden;
        box-sizing: border-box;
    }

    /* Each phase panel fills the leftover height; if a panel is unusually tall
       it scrolls inside its own box so the page itself never scrolls. */
    .panel {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        background: var(--canvas-elevated, #fff);
        border: 1px solid var(--border, #ccc);
        border-radius: 0.9rem;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        box-shadow: var(--sf-shadow-1);
    }

    h1 {
        margin: 0;
        font-size: 1.6rem;
    }

    ul {
        margin: 0;
        padding-left: 1.1rem;
        opacity: 0.8;
        line-height: 1.6;
    }

    .empty {
        color: var(--sf-err, #ff5d6c);
    }

    /* Dim, unobtrusive nudge that only shows on the first few questions while a
       choice is armed. Reinforces the two-step commit without nagging. */
    .lock-hint {
        flex-shrink: 0;
        margin: 0;
        min-height: 1em;
        text-align: center;
        font-size: 12px;
        color: var(--sf-dim);
        opacity: 0;
        transition: opacity 0.15s ease;
    }
    .lock-hint.show {
        opacity: 1;
    }

    /* Confirm dialog for "Finish early". */
    .confirm-scrim {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.55);
    }
    .confirm {
        max-width: 22rem;
        margin: 1rem;
        padding: 1.4rem;
        border-radius: var(--sf-r-md, 12px);
        background: var(--canvas-elevated, #fff);
        border: 1px solid var(--border, #ccc);
        box-shadow: var(--sf-shadow-2);
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .confirm-title {
        margin: 0;
        font-weight: 700;
    }
    .confirm-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
    }

    .results .headline {
        font-size: 44px;
        font-weight: 900;
        line-height: 1;
        letter-spacing: -0.02em;
        background: linear-gradient(
            140deg,
            var(--sf-gold, #f5c451) 0%,
            #fff2cf 42%,
            var(--sf-red, #e11d2f) 118%
        );
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: 0 2px 18px rgba(245, 196, 81, 0.12);
    }

    .delta {
        margin: 0;
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
    }

    .section-grid {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
    }

    .section-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .section-name {
        width: 3.5rem;
        font-weight: 700;
    }

    .track {
        flex: 1;
        height: 0.5rem;
        border-radius: 1rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
        overflow: hidden;
    }

    .fill {
        height: 100%;
        background: linear-gradient(
            90deg,
            var(--sf-red-deep, #a3121c),
            var(--sf-red, #e11d2f)
        );
    }

    .section-val {
        width: 3.5rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    .train {
        @include sf.button-ghost;
        flex-shrink: 0;
        font-size: 0.8rem;
        white-space: nowrap;
    }

    .actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .primary {
        @include sf.button-primary;
    }

    .secondary {
        @include sf.button-secondary;
    }
</style>
