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
    const tick = setInterval(() => (now = Date.now()), 1000);
    onDestroy(() => clearInterval(tick));
    onMount(() => (timerHidden = localStorage.getItem("sf-timer-hidden") === "1"));

    $: item = items[index] as McatStudyItem | undefined;
    $: isMcq = item?.kind === McatStudyItem_Kind.MCQ;
    $: done = index >= items.length;
    $: correct = chosen !== null && item !== undefined && chosen === item.answer;
    $: verdictLabel = gaveUp
        ? "Didn't know — marked Again"
        : verdict === AnswerMcatCardTypedResponse_Verdict.CORRECT
          ? "Correct"
          : verdict === AnswerMcatCardTypedResponse_Verdict.PARTIAL
            ? "Partially correct"
            : "Incorrect";
    $: opponent = item && isMcq ? opponentFor(item, tierCache) : null;
    // Hero grows with readiness; capped so it never crowds the strip.
    $: heroScale = 0.9 + Math.max(0, Math.min(100, readinessPct)) / 100 * 0.3;
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
        fire("idk");
        answering = false;
    }

    // Submit the typed answer (or give up) for LLM grading. Blocks until a
    // verdict arrives — on failure the card stays unanswered and the same
    // submission can be retried (block-until-graded, no self-grade fallback).
    async function submitTyped(giveUp: boolean): Promise<void> {
        if (!item || flashPhase === "grading" || flashPhase === "graded") {
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
                (["rate-again", "rate-hard", "rate-good", "rate-easy"] as const)[resp.grade - 1],
            );
        } catch (err) {
            flashPhase = "error";
            gradeError = err instanceof Error ? err.message : String(err);
        }
    }

    function onAnswerKeydown(e: KeyboardEvent): void {
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
        if (!item) {
            return;
        }
        const key = event.key.toLowerCase();
        if (isMcq) {
            if (chosen === null && LETTERS.map((l) => l.toLowerCase()).includes(key)) {
                chooseLetter(key.toUpperCase());
            } else if (chosen === null && key === "0") {
                chooseIdk();
            } else if (chosen !== null && !answering && (key === " " || key === "enter")) {
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
            <QuestionCard
                image={item.image}
                front={item.front}
                alt={`${item.leafName} question`}
            />
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
        {:else}
            <QuestionCard front={item.front} alt={`${item.leafName} prompt`} center />
            {#if flashPhase === "prompt" || flashPhase === "error"}
                <div class="typed-entry">
                    <!-- svelte-ignore a11y-autofocus -->
                    <textarea
                        bind:value={typedAnswer}
                        rows="3"
                        placeholder="Describe this term from memory…"
                        autofocus
                        on:keydown={onAnswerKeydown}
                    ></textarea>
                    <div class="typed-actions">
                        <button class="primary" on:click={() => submitTyped(false)}>
                            Submit <KeyHint key="↵" />
                        </button>
                        <IdkButton on:choose={() => submitTyped(true)} />
                    </div>
                </div>
                {#if flashPhase === "error"}
                    <div class="feedback grade-error">
                        <strong>Grading failed — your answer is kept.</strong>
                        <p>{gradeError}</p>
                        <button class="primary" on:click={() => submitTyped(gaveUp)}>
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
                    <p class="typed-echo"><span>Your answer:</span> {typedAnswer}</p>
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
        max-width: 46rem;
        margin: 0 auto;
        padding: 0.9rem 1.25rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;
    }

    /* Feedback shares the leftover space; the explanation scrolls inside its
       own box (only if truly long). QuestionCard is the only flex:1 element,
       so the stem is what yields first as things get tight — but the page
       itself can still scroll as a fallback so Continue is never clipped. */
    .feedback {
        flex: 0 1 auto;
        max-height: 40%;
        border-left: 4px solid var(--sf-err);
        padding: 0.6rem 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow: hidden;
    }

    .feedback.correct {
        border-left-color: var(--sf-ok);
    }

    .feedback.idk {
        border-left-color: var(--sf-steel);
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
