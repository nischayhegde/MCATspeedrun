<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";

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
    let revealed = false;
    let chosen: string | null = null;
    let answering = false;
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
        fire((["rate-again", "rate-hard", "rate-good", "rate-easy"] as const)[selfRating - 1]);
        answering = false;
        next();
    }

    function next(): void {
        index += 1;
        revealed = false;
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
            <QuestionCard front={item.front} alt={`${item.leafName} prompt`} />
            {#if revealed}
                <div class="answer">
                    <hr />
                    <p class="back">{item.back}</p>
                </div>
                <div class="ratings">
                    <button class="rating again" on:click={() => rate(1)}>
                        Again <KeyHint key="1" />
                    </button>
                    <button class="rating hard" on:click={() => rate(2)}>
                        Hard <KeyHint key="2" />
                    </button>
                    <button class="rating good" on:click={() => rate(3)}>
                        Good <KeyHint key="3" />
                    </button>
                    <button class="rating easy" on:click={() => rate(4)}>
                        Easy <KeyHint key="4" />
                    </button>
                </div>
            {:else}
                <button class="primary reveal" on:click={() => (revealed = true)}>
                    Show answer <KeyHint key="␣" />
                </button>
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
        overflow: hidden;
        box-sizing: border-box;
    }

    /* Feedback shares the leftover space; the explanation scrolls inside its
       own box (only if truly long) so the page never scrolls and Continue
       stays visible. QuestionCard is the only flex:1 element, so the stem
       never moves when feedback appears. */
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
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 1.1rem;
        border-radius: var(--sf-r-sm);
        border: 1px solid var(--sf-border);
        background: none;
        color: inherit;
        cursor: pointer;
        font-weight: 600;
        transition: border-color 0.12s ease, background 0.12s ease;
        @include sf.focusable;
    }

    .rating.again {
        color: var(--sf-err);
    }

    .rating.hard {
        color: var(--sf-warn);
    }

    .rating.good {
        color: var(--sf-text);
        border-color: var(--sf-steel);
    }

    .rating.easy {
        color: var(--sf-ok);
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
