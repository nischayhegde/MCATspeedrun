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

    import Boxer from "../Boxer.svelte";
    import type { BoxerAction } from "../boxer";

    export let items: McatStudyItem[];

    const LETTERS = ["A", "B", "C", "D"];

    // During the exam the hero works a heavy bag: every answer lands a punch
    // (the ring cycles jab/cross/hook/uppercut for variety). Because it's the
    // same event regardless of correctness, it never leaks the answer — the
    // PRD's no-mid-exam-feedback rule holds. The two-fighter outcome still plays
    // on the results screen.
    let boxerAction: BoxerAction = "ready";
    let boxerTrigger = 0;
    $: boxerMode = phase === "exam" ? "bag" : "spar";

    $: userScale = readiness
        ? 0.9 + Math.max(0, Math.min(100, readiness.readinessPct)) / 100 * 0.3
        : 1;
    function oppScaleFor(it: McatStudyItem): number {
        const bandRaw = Number(((it.cardId % 5n) + 5n) % 5n); // 0..4, stable
        return 0.85 + (bandRaw / 4) * 0.55;
    }
    $: oppScale = item ? oppScaleFor(item) : 1.1;
    // Sentinel choice: never equals a real answer (A–D), so it always grades as
    // incorrect. Lets honest test-takers avoid inflating the score by guessing.
    const IDK = "__idk__";

    type Phase = "intro" | "exam" | "submitting" | "results";
    let phase: Phase = "intro";

    let index = 0;
    let startedAt = Date.now();
    let submittedCount = 0;
    let readiness: McatReadinessResponse | null = null;

    // per-section running tallies for the results screen
    const perSection = new Map<string, { correct: number; total: number }>();

    $: item = items[index] as McatStudyItem | undefined;
    $: total = items.length;

    function begin(): void {
        if (total === 0) {
            return;
        }
        phase = "exam";
        index = 0;
        startedAt = Date.now();
    }

    async function choose(letter: string): Promise<void> {
        if (!item) {
            return;
        }
        const correct = letter === item.answer;
        const bucket = perSection.get(item.section) ?? { correct: 0, total: 0 };
        bucket.total += 1;
        if (correct) {
            bucket.correct += 1;
        }
        perSection.set(item.section, bucket);

        // Land a punch on the bag for every answer (the ring varies which one).
        boxerAction = "punch";
        boxerTrigger += 1;

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

        if (index + 1 >= total) {
            await finish();
        } else {
            index += 1;
            startedAt = Date.now();
        }
    }

    async function finish(): Promise<void> {
        phase = "submitting";
        boxerAction = "idle";
        // wait for the in-flight answer writes to land, then recompute
        const started = Date.now();
        while (submittedCount < total && Date.now() - started < 30_000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        readiness = await recomputeMcatLeafStates({});
        phase = "results";
        // Single outcome flourish, framed positively even when the score is low
        // (productive failure -> back to training).
        const pct = readiness.readinessPct;
        boxerAction = pct >= 60 ? "punch" : pct >= 40 ? "block" : "jumprope";
        boxerTrigger += 1;
    }

    function onKeydown(event: KeyboardEvent): void {
        if (phase !== "exam" || !item) {
            return;
        }
        const key = event.key.toLowerCase();
        if (LETTERS.map((l) => l.toLowerCase()).includes(key)) {
            void choose(key.toUpperCase());
        } else if (key === "0") {
            void choose(IDK);
        }
    }

    $: sectionRows = [...perSection.entries()].map(([section, v]) => ({
        section,
        correct: v.correct,
        total: v.total,
        pct: v.total ? Math.round((v.correct / v.total) * 100) : 0,
    }));
</script>

<svelte:window on:keydown={onKeydown} />

<div class="diagnostic">
    <Boxer
        action={boxerAction}
        trigger={boxerTrigger}
        mode={boxerMode}
        {userScale}
        {oppScale}
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
        <header class="progress-row">
            <button class="quit" on:click={finish}>Finish early</button>
            <div class="progress-track">
                <div
                    class="progress-fill"
                    style:width={`${(index / total) * 100}%`}
                ></div>
            </div>
            <span class="counter">{index + 1} / {total}</span>
        </header>

        <div class="card question">
            {#if item.image}
                <!-- The imported image is the full question composite (stem +
                     lettered choices), so it's the source of truth; the text stem
                     would only duplicate it. -->
                <div class="qimg"><img src={item.image} alt="question" /></div>
            {:else if item.front}
                <div class="qtext"><p class="stem">{item.front}</p></div>
            {/if}
        </div>

        <div class="choices" class:letters={!!item.image}>
            {#each LETTERS as letter (letter)}
                <button class="choice" on:click={() => choose(letter)}>
                    <span class="letter">{letter}</span>
                    {#if !item.image && item.choices[LETTERS.indexOf(letter)]}
                        <span class="choice-text">
                            {item.choices[LETTERS.indexOf(letter)]}
                        </span>
                    {/if}
                </button>
            {/each}
        </div>

        <button class="idk" on:click={() => choose(IDK)}>
            I don't know the answer to this question
        </button>
    {:else if phase === "submitting"}
        <div class="panel">
            <h1>Scoring…</h1>
            <p>Computing your readiness across the blueprint.</p>
        </div>
    {:else if phase === "results" && readiness}
        <div class="panel results">
            <h1>Diagnostic complete</h1>
            <div class="score-block">
                <div class="score">{readiness.readinessScore}</div>
                <div class="scale">/ 528</div>
            </div>
            <p class="confidence">
                {Math.round(readiness.readinessPct)}% blueprint mastery · ±{readiness.confidenceBand}
                pts confidence
            </p>

            <h2>By section</h2>
            <div class="section-grid">
                {#each sectionRows as row (row.section)}
                    <div class="section-row">
                        <span class="section-name">{row.section}</span>
                        <div class="track">
                            <div class="fill" style:width={`${row.pct}%`}></div>
                        </div>
                        <span class="section-val">{row.correct}/{row.total}</span>
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
        box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
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
        color: #ef4444;
    }

    .progress-row {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .quit {
        border: none;
        background: none;
        cursor: pointer;
        opacity: 0.6;
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
        background: linear-gradient(
            90deg,
            var(--sf-red-deep, #a3121c),
            var(--sf-red, #e11d2f)
        );
        border-radius: 1rem;
        transition: width 0.2s ease;
    }

    .counter {
        font-size: 0.85rem;
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
    }

    .card {
        background: var(--canvas-elevated, #fff);
        border: 1px solid var(--border, #ccc);
        border-radius: 0.75rem;
        padding: 1rem;
        box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
    }

    /* Question image fills leftover height and scales to fit — no page scroll. */
    .card.question {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow: hidden;
    }

    /* Text-only questions scroll inside the card if the stem is very long, so
       the page itself never scrolls. */
    .card.question .qtext {
        flex: 1 1 auto;
        min-height: 0;
        align-self: stretch;
        overflow: auto;
    }

    .card.question .qtext .stem {
        margin: 0;
        white-space: pre-wrap;
        font-size: 1.05rem;
        line-height: 1.5;
    }

    /* Fit the question to the available WIDTH so text stays legible. A tall
       passage then scrolls inside this pane — the page itself still never
       scrolls, and the choices below stay pinned in view. */
    .card.question .qimg {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
    }

    .card.question .qimg img {
        display: block;
        width: 100%;
        height: auto;
        margin: 0 auto;
        border-radius: 0.5rem;
        background: #fff;
    }

    .card img {
        max-width: 100%;
        border-radius: 0.5rem;
    }

    .stem {
        white-space: pre-wrap;
    }

    .choices {
        flex-shrink: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.5rem;
    }

    /* When the composite image already lists the options, the answer row is a
       compact scantron of letters rather than repeating each option's text. */
    .choices.letters {
        grid-template-columns: repeat(4, 1fr);
    }

    .choices.letters .choice {
        justify-content: center;
        padding: 0.7rem;
        font-size: 1.1rem;
        font-weight: 800;
    }

    .choice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.7rem 0.9rem;
        border: 1px solid var(--border, #ccc);
        border-radius: 0.5rem;
        background: var(--canvas-elevated, #fff);
        color: inherit;
        cursor: pointer;
        text-align: left;
        transition:
            border-color 0.12s ease,
            background 0.12s ease;
    }

    .choice:hover {
        border-color: var(--mcat-accent, #3b82f6);
        background: color-mix(in srgb, var(--mcat-accent, #3b82f6) 8%, transparent);
    }

    .choice .letter {
        font-weight: 800;
        color: var(--sf-red, #e11d2f);
    }

    .idk {
        flex-shrink: 0;
        width: 100%;
        margin-top: 0.15rem;
        padding: 0.7rem 0.9rem;
        border: 1px dashed var(--border, #ccc);
        border-radius: 0.5rem;
        background: none;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;
        text-align: center;
        font-size: 0.9rem;
        transition:
            border-color 0.12s ease,
            background 0.12s ease,
            opacity 0.12s ease;
    }

    .idk:hover {
        opacity: 1;
        border-color: #ef4444;
        background: color-mix(in srgb, #ef4444 8%, transparent);
    }

    .results .score-block {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
    }

    .results .score {
        font-size: 3.5rem;
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
    }

    .results .scale {
        font-size: 1.1rem;
        opacity: 0.6;
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

    .actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .primary {
        padding: 0.6rem 1.5rem;
        border-radius: 0.55rem;
        border: none;
        background: linear-gradient(
            180deg,
            var(--sf-red, #e11d2f) 0%,
            var(--sf-red-deep, #a3121c) 100%
        );
        color: white;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(225, 29, 47, 0.3);
    }

    .secondary {
        padding: 0.6rem 1.2rem;
        border-radius: 0.5rem;
        border: 1px solid var(--border, #ccc);
        background: none;
        cursor: pointer;
    }
</style>
