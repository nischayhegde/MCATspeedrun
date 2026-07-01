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

    export let items: McatStudyItem[];

    const LETTERS = ["A", "B", "C", "D"];
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
        // wait for the in-flight answer writes to land, then recompute
        const started = Date.now();
        while (submittedCount < total && Date.now() - started < 30_000) {
            await new Promise((r) => setTimeout(r, 100));
        }
        readiness = await recomputeMcatLeafStates({});
        phase = "results";
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
            {#if item.front}
                <p class="stem">{item.front}</p>
            {/if}
            {#if item.image}
                <img src={item.image} alt="question" />
            {/if}
        </div>

        <div class="choices">
            {#each LETTERS as letter (letter)}
                <button class="choice" on:click={() => choose(letter)}>
                    <span class="letter">{letter}</span>
                    {#if item.choices[LETTERS.indexOf(letter)]}
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
        max-width: 46rem;
        margin: 0 auto;
        padding: 1.25rem;
        font-family: var(--mcat-font, system-ui, sans-serif);
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .panel {
        background: var(--canvas-elevated, #fff);
        border: 1px solid var(--border, #ccc);
        border-radius: 0.9rem;
        padding: 1.75rem;
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
        background: var(--mcat-accent, #3b82f6);
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
        padding: 1.25rem;
        box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
    }

    .card img {
        max-width: 100%;
        border-radius: 0.5rem;
    }

    .stem {
        white-space: pre-wrap;
    }

    .choices {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.5rem;
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
    }

    .idk {
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
        font-weight: 800;
        line-height: 1;
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
        background: var(--mcat-accent, #3b82f6);
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
        padding: 0.6rem 1.4rem;
        border-radius: 0.5rem;
        border: none;
        background: var(--mcat-accent, #3b82f6);
        color: white;
        font-weight: 700;
        cursor: pointer;
    }

    .secondary {
        padding: 0.6rem 1.2rem;
        border-radius: 0.5rem;
        border: 1px solid var(--border, #ccc);
        background: none;
        cursor: pointer;
    }
</style>
