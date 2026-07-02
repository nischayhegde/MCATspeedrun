<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { goto } from "$app/navigation";

    import type { McatStudyItem } from "@generated/anki/scheduler_pb";
    import { McatStudyItem_Kind } from "@generated/anki/scheduler_pb";
    import { answerMcatCard } from "@generated/backend";

    import Boxer from "../Boxer.svelte";
    import type { BoxerAction } from "../boxer";

    export let items: McatStudyItem[];
    export let readinessPct = 50;

    const LETTERS = ["A", "B", "C", "D"];

    // A correct MCQ answered within this long counts as "automatic" (a landed
    // punch); slower-but-correct is a defensive block. Cosmetic only.
    const FAST_MS = 15000;

    let boxerAction: BoxerAction = "ready";
    let boxerTrigger = 0;
    let lastStanceIndex = -1;

    // Hero grows with readiness; opponent size varies per card for variety.
    $: userScale = 0.9 + Math.max(0, Math.min(100, readinessPct)) / 100 * 0.3;
    function oppScaleFor(it: McatStudyItem): number {
        const band = Number(((it.cardId % 5n) + 5n) % 5n); // 0..4, stable per card
        return 0.85 + (band / 4) * 0.55;
    }
    $: oppScale = item ? oppScaleFor(item) : 1;
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

    // Resting stance, set once per item: jump-rope on flashcards (training),
    // guard up on MCQs (the fight). Answer reactions below override until next.
    $: if (item && index !== lastStanceIndex) {
        lastStanceIndex = index;
        boxerAction = isMcq ? "ready" : "jumprope";
    }

    function elapsedMs(): number {
        return Math.min(Date.now() - startedAt, 10 * 60 * 1000);
    }

    async function chooseLetter(letter: string): Promise<void> {
        if (!item || chosen !== null || answering) {
            return;
        }
        answering = true;
        chosen = letter;
        const wasCorrect = letter === item.answer;
        const wasFast = elapsedMs() <= FAST_MS;
        await answerMcatCard({
            cardId: item.cardId,
            correct: wasCorrect,
            millisecondsTaken: elapsedMs(),
            selfRating: 0,
        });
        boxerAction = wasCorrect ? (wasFast ? "punch" : "block") : "hit";
        boxerTrigger += 1;
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
        boxerAction = "hit";
        boxerTrigger += 1;
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
    <Boxer
        action={boxerAction}
        trigger={boxerTrigger}
        {userScale}
        {oppScale}
    />
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
            <div class="card question" class:answered={chosen !== null}>
                {#if item.image}
                    <!-- The imported image is the full question composite (stem +
                         lettered choices), so it's the source of truth. Rendering
                         the stem text again would just duplicate it. -->
                    <div class="qimg"><img src={item.image} alt="question" /></div>
                {:else if item.front}
                    <div class="qtext"><p class="stem">{item.front}</p></div>
                {/if}
            </div>

            <div class="choices" class:letters={!!item.image}>
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
                        {#if !item.image && item.choices[i]}
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
        height: 100%;
        max-width: 46rem;
        margin: 0 auto;
        padding: 0.9rem 1.25rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        overflow: hidden;
        box-sizing: border-box;
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

    .tag-line {
        flex-shrink: 0;
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
        padding: 1rem;
        box-shadow: 0 1px 3px rgb(0 0 0 / 5%);
    }

    /* Question image fills the leftover height and scales to fit — never
       forces the page to scroll. */
    .card.question {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow: hidden;
    }

    /* Once answered, the image yields room so the explanation + Continue fit. */
    .card.question.answered {
        flex: 0 1 34%;
    }

    /* Text-only questions: scroll inside the card if a stem is unusually long,
       so the page itself never scrolls. */
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
       scrolls, and the choices/Continue below stay pinned in view. */
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

    .flashcard {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        /* Center vertically when it fits; fall back to top-aligned scroll for
           long cards so nothing gets clipped. */
        justify-content: safe center;
        text-align: center;
        gap: 0.85rem;
    }

    .flashcard .front {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 700;
    }

    .flashcard .back {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.55;
        max-width: 34rem;
    }

    .flashcard hr {
        width: 60%;
        margin: 0;
        border: none;
        border-top: 1px solid var(--border, #ccc);
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
        color: var(--sf-red, #e11d2f);
    }

    .choice.right {
        border-color: #2fd67a;
        background: color-mix(in srgb, #2fd67a 14%, transparent);
    }

    .choice.right .letter {
        color: #2fd67a;
    }

    .choice.wrong {
        border-color: #ff5d6c;
        background: color-mix(in srgb, #ff5d6c 14%, transparent);
    }

    .choice.wrong .letter {
        color: #ff5d6c;
    }

    .idk {
        flex-shrink: 0;
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

    /* Feedback shares the leftover space; the explanation scrolls inside its
       own box (only if truly long) so the page never scrolls and Continue
       stays visible. */
    .feedback {
        flex: 1 1 auto;
        min-height: 0;
        border-left: 4px solid #ff5d6c;
        padding: 0.6rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow: hidden;
    }

    .feedback strong {
        flex-shrink: 0;
    }

    .feedback p {
        flex: 1 1 auto;
        min-height: 0;
        margin: 0;
        overflow: auto;
        line-height: 1.5;
    }

    .feedback .primary {
        flex-shrink: 0;
    }

    .feedback.correct {
        border-color: #2fd67a;
    }

    .primary {
        align-self: flex-start;
        padding: 0.5rem 1.3rem;
        border-radius: 0.5rem;
        border: none;
        background: linear-gradient(
            180deg,
            var(--sf-red, #e11d2f) 0%,
            var(--sf-red-deep, #a3121c) 100%
        );
        color: var(--mcat-accent-fg, #fff);
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(225, 29, 47, 0.3);
        transition: filter 0.12s ease;
    }

    .primary:hover {
        filter: brightness(1.08);
    }

    .reveal {
        align-self: center;
    }

    .ratings {
        flex-shrink: 0;
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
        flex: 1 1 auto;
        min-height: 0;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }
</style>
