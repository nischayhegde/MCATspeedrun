<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { goto } from "$app/navigation";

    import type { McatStudyItem } from "@generated/anki/scheduler_pb";
    import { McatStudyItem_Kind } from "@generated/anki/scheduler_pb";
    import { answerMcatCard } from "@generated/backend";

    export let items: McatStudyItem[];

    const LETTERS = ["A", "B", "C", "D"];
    // Sentinel choice: never equals a real answer (A–D), so it always grades as
    // incorrect. Lets honest test-takers avoid inflating the score by guessing.
    const IDK = "__idk__";

    let index = 0;
    let revealed = false;
    let chosen: string | null = null;
    let answering = false;
    let startedAt = Date.now();

    $: item = items[index] as McatStudyItem | undefined;
    $: isMcq = item?.kind === McatStudyItem_Kind.MCQ;
    $: done = index >= items.length;
    $: correct = chosen !== null && item !== undefined && chosen === item.answer;

    function elapsedMs(): number {
        return Math.min(Date.now() - startedAt, 10 * 60 * 1000);
    }

    async function chooseLetter(letter: string): Promise<void> {
        if (!item || chosen !== null || answering) {
            return;
        }
        answering = true;
        chosen = letter;
        await answerMcatCard({
            cardId: item.cardId,
            correct: letter === item.answer,
            millisecondsTaken: elapsedMs(),
            selfRating: 0,
        });
        answering = false;
    }

    async function chooseIdk(): Promise<void> {
        if (!item || chosen !== null || answering) {
            return;
        }
        answering = true;
        chosen = IDK;
        await answerMcatCard({
            cardId: item.cardId,
            correct: false,
            millisecondsTaken: elapsedMs(),
            selfRating: 0,
        });
        answering = false;
    }

    async function rate(selfRating: number): Promise<void> {
        if (!item || answering) {
            return;
        }
        answering = true;
        await answerMcatCard({
            cardId: item.cardId,
            correct: selfRating > 1,
            millisecondsTaken: elapsedMs(),
            selfRating,
        });
        answering = false;
        next();
    }

    function next(): void {
        index += 1;
        revealed = false;
        chosen = null;
        startedAt = Date.now();
    }

    function onKeydown(event: KeyboardEvent): void {
        if (!item) {
            return;
        }
        const key = event.key.toLowerCase();
        if (isMcq) {
            if (chosen === null && LETTERS.map((l) => l.toLowerCase()).includes(key)) {
                chooseLetter(key.toUpperCase());
            } else if (chosen === null && key === "0") {
                chooseIdk();
            } else if (chosen !== null && (key === " " || key === "enter")) {
                next();
            }
        } else {
            if (!revealed && (key === " " || key === "enter")) {
                revealed = true;
            } else if (revealed && ["1", "2", "3", "4"].includes(key)) {
                rate(Number(key));
            }
        }
    }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="study-page">
    {#if done}
        <div class="complete">
            <h1>Session complete</h1>
            <p>Your readiness has been updated from this session's answers.</p>
            <button class="primary" on:click={() => goto("/mcat")}>
                Back to dashboard
            </button>
        </div>
    {:else if item}
        <header class="progress-row">
            <button class="quit" on:click={() => goto("/mcat")}>Exit</button>
            <div class="progress-track">
                <div
                    class="progress-fill"
                    style:width={`${(index / items.length) * 100}%`}
                ></div>
            </div>
            <span class="counter">{index + 1} / {items.length}</span>
        </header>

        <div class="tag-line">
            <span class="leaf-id">{item.leafId}</span>
            <span class="leaf-name">{item.leafName}</span>
            <span class="section">{item.section}</span>
        </div>

        {#if isMcq}
            <div class="card question">
                {#if item.front}
                    <p class="stem">{item.front}</p>
                {/if}
                {#if item.image}
                    <img src={item.image} alt="question" />
                {/if}
            </div>

            <div class="choices">
                {#each LETTERS as letter, i (letter)}
                    <button
                        class="choice"
                        class:selected={chosen === letter}
                        class:right={chosen !== null && letter === item.answer}
                        class:wrong={chosen === letter && letter !== item.answer}
                        disabled={chosen !== null}
                        on:click={() => chooseLetter(letter)}
                    >
                        <span class="letter">{letter}</span>
                        {#if item.choices[i]}
                            <span class="choice-text">{item.choices[i]}</span>
                        {/if}
                    </button>
                {/each}
            </div>

            <button
                class="idk"
                class:wrong={chosen === IDK}
                disabled={chosen !== null}
                on:click={chooseIdk}
            >
                I don't know the answer to this question
            </button>

            {#if chosen !== null}
                <div class="feedback" class:correct>
                    <strong>
                        {correct ? "Correct" : `Incorrect — answer: ${item.answer}`}
                    </strong>
                    {#if item.explanation}
                        <p>{item.explanation}</p>
                    {/if}
                    <button class="primary" on:click={next}>Continue</button>
                </div>
            {/if}
        {:else}
            <div class="card flashcard">
                <p class="front">{item.front}</p>
                {#if revealed}
                    <hr />
                    <p class="back">{item.back}</p>
                {/if}
            </div>

            {#if !revealed}
                <button class="primary reveal" on:click={() => (revealed = true)}>
                    Show answer
                </button>
            {:else}
                <div class="ratings">
                    <button class="rating again" on:click={() => rate(1)}>Again</button>
                    <button class="rating hard" on:click={() => rate(2)}>Hard</button>
                    <button class="rating good" on:click={() => rate(3)}>Good</button>
                    <button class="rating easy" on:click={() => rate(4)}>Easy</button>
                </div>
            {/if}
        {/if}
    {:else}
        <div class="complete">
            <h1>Nothing due right now</h1>
            <p>Come back later, or add more MCAT-tagged content.</p>
            <button class="primary" on:click={() => goto("/mcat")}>
                Back to dashboard
            </button>
        </div>
    {/if}
</div>

<style lang="scss">
    .study-page {
        max-width: 46rem;
        margin: 0 auto;
        padding: 1.5rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
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
        background: var(--mcat-accent, #6366f1);
        border-radius: 1rem;
        transition: width 0.2s ease;
    }

    .counter {
        font-size: 0.85rem;
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
    }

    .tag-line {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        font-size: 0.85rem;
        opacity: 0.75;
    }

    .leaf-id {
        font-weight: 700;
    }

    .section {
        margin-left: auto;
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.06em;
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

    .flashcard .front {
        font-size: 1.2rem;
        font-weight: 600;
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
        padding: 0.6rem 0.8rem;
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

    .choice:hover:not(:disabled) {
        border-color: var(--mcat-accent, #6366f1);
        background: color-mix(in srgb, var(--mcat-accent, #6366f1) 8%, transparent);
    }

    .choice .letter {
        font-weight: 800;
    }

    .choice.right {
        border-color: #22c55e;
        background: color-mix(in srgb, #22c55e 12%, transparent);
    }

    .choice.wrong {
        border-color: #ef4444;
        background: color-mix(in srgb, #ef4444 12%, transparent);
    }

    .idk {
        width: 100%;
        padding: 0.6rem 0.8rem;
        border: 1px dashed var(--border, #ccc);
        border-radius: 0.5rem;
        background: none;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;
        text-align: center;
        font-weight: 600;
        transition:
            border-color 0.12s ease,
            background 0.12s ease,
            opacity 0.12s ease;
    }

    .idk:hover:not(:disabled) {
        opacity: 1;
        border-color: #ef4444;
        background: color-mix(in srgb, #ef4444 8%, transparent);
    }

    .idk:disabled {
        cursor: default;
    }

    .idk.wrong {
        border-style: solid;
        border-color: #ef4444;
        background: color-mix(in srgb, #ef4444 12%, transparent);
        opacity: 1;
    }

    .feedback {
        border-left: 4px solid #ef4444;
        padding: 0.6rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .feedback.correct {
        border-color: #22c55e;
    }

    .primary {
        align-self: flex-start;
        padding: 0.5rem 1.2rem;
        border-radius: 0.5rem;
        border: none;
        background: var(--mcat-accent, #6366f1);
        color: var(--mcat-accent-fg, #fff);
        font-weight: 600;
        cursor: pointer;
        transition: filter 0.12s ease;
    }

    .primary:hover {
        filter: brightness(1.08);
    }

    .reveal {
        align-self: center;
    }

    .ratings {
        display: flex;
        gap: 0.5rem;
        justify-content: center;
    }

    .rating {
        padding: 0.5rem 1.1rem;
        border-radius: 0.5rem;
        border: 1px solid var(--border, #ccc);
        background: none;
        cursor: pointer;
        font-weight: 600;
    }

    .rating.again {
        color: #ef4444;
    }

    .rating.hard {
        color: #f59e0b;
    }

    .rating.good {
        color: #3b82f6;
    }

    .rating.easy {
        color: #22c55e;
    }

    .complete {
        text-align: center;
        padding: 3rem 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
    }
</style>
