<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import { goto } from "$app/navigation";

    import type { McatStudyItem } from "@generated/anki/scheduler_pb";
    import {
        AnswerMcatCardTypedResponse_Verdict,
        McatStudyItem_Kind,
    } from "@generated/anki/scheduler_pb";
    import { answerMcatCard, answerMcatCardTyped } from "@generated/backend";

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

    const LETTERS = ["A", "B", "C", "D"];

    // A correct MCQ answered within this long counts as "automatic" (a landed
    // punch); slower-but-correct is a defensive block. Cosmetic only.
    const FAST_MS = 15000;

    // Sentinel choice: never equals a real answer (A–D), so it always grades as
    // incorrect. Lets honest test-takers avoid inflating the score by guessing.
    const IDK = "__idk__";

    // Tier is frozen per card per session so the opponent never thrashes mid-run.
    const tierCache = new Map<string, Tier>();

    // Bridge to the FightRing choreographer: bump `trigger` so the ring's
    // executor picks up each new event exactly once.
    let event: FightEvent | null = null;
    let trigger = 0;
    function fire(kind: FightEvent["kind"]): void {
        trigger += 1;
        event = { kind, trigger };
    }

    let index = 0;
    let chosen: string | null = null;
    let answering = false;

    // Typed short-answer flashcard flow (replaces reveal + self-grade buttons).
    type FlashPhase = "prompt" | "grading" | "graded" | "error";
    let flashPhase: FlashPhase = "prompt";
    let typedAnswer = "";
    let verdict: AnswerMcatCardTypedResponse_Verdict =
        AnswerMcatCardTypedResponse_Verdict.INCORRECT;
    let feedback = "";
    let gaveUp = false;
    let gradeError = "";
    let submittedMs = 0;

    let startedAt = Date.now();
    let now = Date.now();
    let timerHidden = false;
    let paused = false;
    let pausedAt = 0;
    const tick = setInterval(() => {
        if (!paused) {
            now = Date.now();
        }
    }, 1000);
    onDestroy(() => clearInterval(tick));
    onMount(() => (timerHidden = localStorage.getItem("sf-timer-hidden") === "1"));

    // Pausing freezes the on-screen timer; resuming shifts `startedAt` forward
    // by exactly the paused span so elapsed time, the fast-answer threshold,
    // and the millisecondsTaken sent to the backend all exclude the pause.
    function togglePause(): void {
        if (paused) {
            const pausedSpan = Date.now() - pausedAt;
            startedAt += pausedSpan;
            now = Date.now();
            paused = false;
        } else {
            pausedAt = Date.now();
            paused = true;
        }
    }

    $: item = items[index] as McatStudyItem | undefined;
    $: isMcq = item?.kind === McatStudyItem_Kind.MCQ;
    $: done = index >= items.length;
    $: correct = chosen !== null && item !== undefined && chosen === item.answer;
    function verdictText(
        v: AnswerMcatCardTypedResponse_Verdict,
        didntKnow: boolean,
    ): string {
        if (didntKnow) {
            return "Didn't know — marked Again";
        }
        if (v === AnswerMcatCardTypedResponse_Verdict.CORRECT) {
            return "Correct";
        }
        if (v === AnswerMcatCardTypedResponse_Verdict.PARTIAL) {
            return "Partially correct";
        }
        return "Incorrect";
    }
    $: verdictLabel = verdictText(verdict, gaveUp);
    $: opponent = item && isMcq ? opponentFor(item, tierCache) : null;
    // Hero grows with readiness; capped so it never crowds the strip.
    $: heroScale = 0.9 + (Math.max(0, Math.min(100, readinessPct)) / 100) * 0.3;
    $: marquee = item
        ? `${item.leafId} · ${item.leafName}${
              opponent ? `  vs ${opponent.species.name} · TIER ${opponent.tier}` : ""
          }`
        : "";
    $: elapsed = Math.max(0, now - startedAt);
    $: timerText = timerHidden
        ? ""
        : `${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}`;
    // Typed via `let` so the "gold"|"steel" literals survive into SessionHeader's
    // "gold"|"steel"|null prop (a bare `$:` conditional would widen to `string`).
    let paceState: "gold" | "steel";
    $: paceState = elapsed <= FAST_MS ? "gold" : "steel";

    // Resting stance, set once per item: reduce("question") pins the ring to a
    // quiet guard/jump-rope. Answer reactions below override until the next card.
    let lastStanceIndex = -1;
    $: if (item && index !== lastStanceIndex) {
        lastStanceIndex = index;
        fire("question");
    }

    function elapsedMs(): number {
        return Math.min(Date.now() - startedAt, 10 * 60 * 1000);
    }

    async function chooseLetter(letter: string): Promise<void> {
        if (!item || chosen !== null || answering || paused) {
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
        if (!wasCorrect) {
            fire("wrong");
        } else if (wasFast) {
            fire("fast-correct");
        } else {
            fire("slow-correct");
        }
        answering = false;
    }

    async function chooseIdk(): Promise<void> {
        if (!item || chosen !== null || answering || paused) {
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
        fire("idk");
        answering = false;
    }

    // Submit the typed answer (or give up) for LLM grading. Blocks until a
    // verdict arrives — on failure the card stays unanswered and the same
    // submission can be retried (block-until-graded, no self-grade fallback).
    async function submitTyped(giveUp: boolean): Promise<void> {
        if (!item || flashPhase === "grading" || flashPhase === "graded" || paused) {
            return;
        }
        if (flashPhase === "prompt") {
            // freeze latency at first submit; retries reuse it
            submittedMs = elapsedMs();
        }
        gaveUp = giveUp || typedAnswer.trim().length === 0;
        flashPhase = "grading";
        gradeError = "";
        try {
            const resp = await answerMcatCardTyped({
                cardId: item.cardId,
                typedAnswer,
                millisecondsTaken: submittedMs,
                gaveUp,
            });
            verdict = resp.verdict;
            feedback = resp.feedback;
            flashPhase = "graded";
            fire(
                (["rate-again", "rate-hard", "rate-good", "rate-easy"] as const)[
                    resp.grade - 1
                ],
            );
        } catch (err) {
            flashPhase = "error";
            gradeError = err instanceof Error ? err.message : String(err);
        }
    }

    function onAnswerKeydown(e: KeyboardEvent): void {
        if (paused) {
            return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitTyped(false);
        } else if (e.key === "Escape") {
            e.preventDefault();
            submitTyped(true);
        }
    }

    function next(): void {
        index += 1;
        flashPhase = "prompt";
        typedAnswer = "";
        feedback = "";
        gaveUp = false;
        gradeError = "";
        chosen = null;
        startedAt = Date.now();
        now = Date.now();
    }

    function toggleTimer(): void {
        timerHidden = !timerHidden;
        localStorage.setItem("sf-timer-hidden", timerHidden ? "1" : "0");
    }

    function onKeydown(event: KeyboardEvent): void {
        if (!item || paused) {
            return;
        }
        const key = event.key.toLowerCase();
        if (isMcq) {
            if (chosen === null && LETTERS.map((l) => l.toLowerCase()).includes(key)) {
                chooseLetter(key.toUpperCase());
            } else if (chosen === null && key === "0") {
                chooseIdk();
            } else if (
                chosen !== null &&
                !answering &&
                (key === " " || key === "enter")
            ) {
                next();
            }
        } else if (flashPhase === "graded" && (key === " " || key === "enter")) {
            event.preventDefault();
            next();
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
        <SessionHeader
            progress={index / items.length}
            counter={`${index + 1} / ${items.length}`}
            paceState={isMcq && chosen === null ? paceState : null}
            timerText={isMcq ? timerText : ""}
            showPause
            {paused}
            on:exit={() => goto("/mcat")}
            on:timerclick={toggleTimer}
            on:pauseclick={togglePause}
        />
        {#if paused}
            <div class="pause-overlay">
                <div class="pause-card">
                    <h1>Paused</h1>
                    <p>Your timer is frozen. Take your time.</p>
                    <button class="primary" on:click={togglePause}>Resume</button>
                </div>
            </div>
        {/if}
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
            <div class="mcq-layout">
                <div class="mcq-question">
                    <QuestionCard
                        image={item.image}
                        front={item.front}
                        alt={`${item.leafName} question`}
                    />
                </div>
                <div class="mcq-answer">
                    <ChoiceGrid
                        choices={item.choices}
                        lettersOnly={!!item.image}
                        graded
                        {chosen}
                        answer={item.answer}
                        disabled={chosen !== null || paused}
                        collapsed={chosen !== null}
                        on:choose={(e) => chooseLetter(e.detail.letter)}
                    />
                    {#if chosen === null}
                        <IdkButton
                            disabled={answering || paused}
                            on:choose={chooseIdk}
                        />
                    {:else}
                        <div class="feedback" class:correct class:idk={chosen === IDK}>
                            <strong>
                                {#if chosen === IDK}
                                    Good call — the answer is {item.answer}.
                                {:else if correct}
                                    Correct
                                {:else}
                                    Incorrect — answer: {item.answer}
                                {/if}
                            </strong>
                            {#if item.explanation}
                                <p>{item.explanation}</p>
                            {/if}
                            <button class="primary" on:click={next}>
                                Continue <KeyHint key="␣" />
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
            <div class="flash-content">
                <QuestionCard
                    front={item.front}
                    alt={`${item.leafName} prompt`}
                    center
                />
                {#if flashPhase === "prompt" || flashPhase === "error"}
                    <div class="typed-entry">
                        <!-- svelte-ignore a11y-autofocus -->
                        <textarea
                            bind:value={typedAnswer}
                            rows="3"
                            placeholder="Describe this term from memory…"
                            autofocus
                            disabled={paused}
                            on:keydown={onAnswerKeydown}
                        ></textarea>
                        <div class="typed-actions">
                            <button
                                class="primary"
                                disabled={paused}
                                on:click={() => submitTyped(false)}
                            >
                                Submit <KeyHint key="↵" />
                            </button>
                            <IdkButton
                                disabled={paused}
                                on:choose={() => submitTyped(true)}
                            />
                        </div>
                    </div>
                    {#if flashPhase === "error"}
                        <div class="feedback grade-error">
                            <strong>Grading failed — your answer is kept.</strong>
                            <p>{gradeError}</p>
                            <button
                                class="primary"
                                on:click={() => submitTyped(gaveUp)}
                            >
                                Retry
                            </button>
                        </div>
                    {/if}
                {:else}
                    <div class="answer">
                        <hr />
                        <p class="back">{item.back}</p>
                    </div>
                    {#if !gaveUp && typedAnswer.trim()}
                        <p class="typed-echo">
                            <span>Your answer:</span>
                            {typedAnswer}
                        </p>
                    {/if}
                    {#if flashPhase === "grading"}
                        <div class="grading">Grading your answer…</div>
                    {:else}
                        <div
                            class="feedback"
                            class:correct={!gaveUp &&
                                verdict === AnswerMcatCardTypedResponse_Verdict.CORRECT}
                            class:partial={!gaveUp &&
                                verdict === AnswerMcatCardTypedResponse_Verdict.PARTIAL}
                            class:idk={gaveUp}
                        >
                            <strong>{verdictLabel}</strong>
                            {#if feedback}
                                <p>{feedback}</p>
                            {/if}
                            <button class="primary" on:click={next}>
                                Continue <KeyHint key="␣" />
                            </button>
                        </div>
                    {/if}
                {/if}
            </div>
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
    @use "../lib/mixins" as sf;

    .study-page {
        height: 100%;
        /* Wider than the flashcard reading column (46rem, see .flash-content)
           so an MCQ's image and its choices/explanation can sit side by side
           without either being cramped. */
        max-width: 64rem;
        margin: 0 auto;
        padding: 0.9rem 1.25rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;
    }

    .flash-content {
        flex: 1 1 auto;
        min-height: 0;
        max-width: 46rem;
        width: 100%;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
    }

    @include sf.mcq-columns;

    .pause-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--sf-canvas) 92%, transparent);
        backdrop-filter: blur(6px);
    }

    .pause-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.9rem;
        text-align: center;
        padding: 2.5rem 3rem;
        border-radius: var(--sf-r-lg);
        border: 1px solid var(--sf-border);
        background: var(--sf-surface);
        box-shadow: var(--sf-shadow-2);
    }

    .pause-card h1 {
        margin: 0;
        font-size: 2.4rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }

    .pause-card p {
        margin: 0;
        opacity: 0.75;
    }

    .pause-card .primary {
        @include sf.button-primary;
    }

    /* Feedback shares leftover space and the explanation scrolls inside its
       own box, yielding first (down to a ~2-line floor) as space gets tight —
       so the verdict and Continue stay on screen. overflow must stay VISIBLE:
       hidden would zero the flex automatic minimum size, letting the box be
       crushed and Continue clipped with no scrollbar to reach it. With the
       min-content floor intact, the page overflows instead and its own
       scrollbar takes over — Continue is always reachable. */
    .feedback {
        flex: 0 1 auto;
        max-height: 40%;
        border-left: 4px solid var(--sf-err);
        padding: 0.6rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .feedback strong,
    .feedback .primary {
        flex-shrink: 0;
    }

    .feedback.correct {
        border-left-color: var(--sf-ok);
    }

    .feedback.idk {
        border-left-color: var(--sf-steel);
    }

    .feedback p {
        flex: 1 1 auto;
        min-height: 3em;
        margin: 0;
        overflow: auto;
        line-height: 1.5;
    }

    .answer {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.85rem;
        text-align: center;
    }

    .answer hr {
        width: 60%;
        margin: 0;
        border: none;
        border-top: 1px solid var(--sf-border);
    }

    .answer .back {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.55;
        max-width: 34rem;
    }

    .primary {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        @include sf.button-primary;
    }

    .typed-entry {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .typed-entry textarea {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        min-height: 4.5rem;
        padding: 0.6rem 0.75rem;
        border-radius: var(--sf-r-sm);
        border: 1px solid var(--sf-border);
        background: none;
        color: inherit;
        font: inherit;
        line-height: 1.5;
        @include sf.focusable;
    }

    .typed-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .typed-echo {
        flex-shrink: 0;
        margin: 0;
        font-size: 0.95rem;
        opacity: 0.85;

        span {
            font-weight: 600;
        }
    }

    .grading {
        flex-shrink: 0;
        padding: 0.6rem 1rem;
        font-weight: 600;
        animation: sf-grading-pulse 1.2s ease-in-out infinite;
    }

    @keyframes sf-grading-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.45;
        }
    }

    .feedback.partial {
        border-left-color: var(--sf-warn);
    }

    .grade-error {
        border-left-color: var(--sf-err);
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

    .complete .primary {
        align-self: center;
    }
</style>
