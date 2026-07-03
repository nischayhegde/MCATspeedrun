<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import { LEAF_BY_ID, SECTIONS } from "../lib/taxonomy.ts";
    import QuestionView from "../components/QuestionView.svelte";
    import Boxer from "../components/Boxer.svelte";
    import type { Rating } from "../lib/types.ts";

    const item = $derived(store.currentItem);
    const pos = $derived(store.session.index + 1);
    const total = $derived(store.session.queue.length);
    const leaf = $derived.by(() => {
        if (!item) return null;
        const id =
            item.kind === "flashcard"
                ? item.card?.leafId
                : item.q?.tags.contentCategory;
        return id ? (LEAF_BY_ID[id] ?? null) : null;
    });

    let revealed = $state(false);
    $effect(() => {
        store.session.index;
        revealed = false;
    });

    const grades: { r: Rating; label: string; cls: string; key: string }[] = [
        { r: "again", label: "Again", cls: "again", key: "1" },
        { r: "hard", label: "Hard", cls: "hard", key: "2" },
        { r: "good", label: "Good", cls: "good", key: "3" },
        { r: "easy", label: "Easy", cls: "easy", key: "4" },
    ];

    function onkey(e: KeyboardEvent) {
        if (!item || item.kind !== "flashcard") return;
        if (!revealed && (e.key === " " || e.key === "Enter")) {
            revealed = true;
            e.preventDefault();
            return;
        }
        if (revealed) {
            const g = grades.find((x) => x.key === e.key);
            if (g) store.gradeFlashcard(g.r);
        }
    }
</script>

<svelte:window onkeydown={onkey} />

{#if !item}
    <div class="empty">
        <div class="card ec">
            <h2>No active session</h2>
            <p>
                Your queue mixes flashcards and questions automatically — rote drills
                for subtopics you're not yet fluent in, fresh problems for the ones you
                are, interleaved and spaced.
            </p>
            <button class="btn primary big" onclick={() => store.startSession()}>
                ▶ Start studying
            </button>
        </div>
    </div>
{:else}
    <div class="rev" class:withboxer={store.settings.boxerOn}>
        <div class="col main">
            <div class="topbar">
                <div class="left">
                    {#if item.kind === "flashcard"}
                        <span class="mode train">FLASHCARD · TRAINING</span>
                    {:else}
                        <span class="mode fight">APPLICATION · THE FIGHT</span>
                    {/if}
                    {#if leaf}
                        <span class="chip mono">{leaf.id}</span>
                        <span class="chipname">{SECTIONS[leaf.section].short}</span>
                    {/if}
                </div>
                <span class="count mono">{pos} / {total}</span>
            </div>

            <div class="progress">
                <div
                    class="bar"
                    style="width:{(store.session.index / total) * 100}%"
                ></div>
            </div>

            {#if item.kind === "flashcard" && item.card}
                <div class="card flash">
                    <div class="front">{item.card.term}</div>
                    {#if revealed}
                        <div class="divider"></div>
                        <div class="back">{item.card.description}</div>
                        <div class="section-label center">
                            How well did you recall it?
                        </div>
                        <div class="grades">
                            {#each grades as g (g.r)}
                                <button
                                    class="grade {g.cls}"
                                    onclick={() => store.gradeFlashcard(g.r)}
                                >
                                    <span class="glabel">{g.label}</span>
                                    <span class="gkey mono">{g.key}</span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <button
                            class="btn primary reveal"
                            onclick={() => (revealed = true)}
                        >
                            Reveal answer <span class="hintkey">(space)</span>
                        </button>
                    {/if}
                </div>
            {:else if item.q}
                <div class="card body">
                    <QuestionView
                        q={item.q}
                        showTimer={store.settings.showTimer}
                        onanswer={(l) => store.answerApplication(l)}
                    />
                </div>
            {/if}
        </div>

        {#if store.settings.boxerOn}
            <div class="col boxer">
                <div class="card boxwrap">
                    <Boxer height={300} />
                    {#if item.kind === "flashcard"}
                        <div class="legend center">
                            Training montage — building fluency through spaced recall.
                        </div>
                    {:else}
                        <div class="legend">
                            <div>
                                <span class="k good">Fast + correct</span>
                                you land a punch
                            </div>
                            <div>
                                <span class="k warn">Slow + correct</span>
                                you block
                            </div>
                            <div>
                                <span class="k bad">Wrong</span>
                                you take a hit
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .empty {
        max-width: 560px;
        margin: 60px auto;
        padding: 20px;
    }
    .ec {
        padding: 30px;
        text-align: center;
    }
    .ec p {
        color: var(--text-dim);
        line-height: 1.55;
        margin: 12px 0 22px;
    }
    .rev {
        max-width: 1120px;
        margin: 0 auto;
        padding: 20px;
        display: grid;
        grid-template-columns: 1fr;
        gap: 18px;
    }
    .rev.withboxer {
        grid-template-columns: 1fr 340px;
        align-items: start;
    }
    .topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }
    .left {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .mode {
        font-weight: 800;
        letter-spacing: 0.14em;
        font-size: 12px;
    }
    .mode.train {
        color: var(--accent);
    }
    .mode.fight {
        color: var(--bad);
    }
    .chip {
        font-weight: 800;
        color: var(--text-dim);
        background: var(--bg-elev-2);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 2px 7px;
        font-size: 12px;
    }
    .chipname {
        color: var(--text-faint);
        font-size: 12px;
    }
    .count {
        color: var(--text-dim);
    }
    .progress {
        height: 6px;
        background: var(--bg-elev-2);
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid var(--border);
        margin-bottom: 16px;
    }
    .progress .bar {
        height: 100%;
        background: linear-gradient(90deg, var(--accent-2), var(--accent));
        transition: width 0.3s ease;
    }
    .body {
        padding: 18px;
    }
    .flash {
        padding: 30px;
        min-height: 320px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }
    .front {
        font-size: 26px;
        font-weight: 700;
        margin: 40px 0 10px;
    }
    .divider {
        width: 60%;
        height: 1px;
        background: var(--border);
        margin: 14px 0 18px;
    }
    .back {
        font-size: 16px;
        color: var(--text-dim);
        line-height: 1.55;
        max-width: 560px;
        margin-bottom: 26px;
    }
    .center {
        text-align: center;
    }
    .grades {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        width: 100%;
        max-width: 520px;
        margin-top: 12px;
    }
    .grade {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px 0;
        border-radius: 10px;
        border: 2px solid var(--border);
        background: var(--bg-elev-2);
        color: var(--text);
        font-weight: 700;
    }
    .grade:hover {
        transform: translateY(-1px);
    }
    .grade .gkey {
        font-size: 11px;
        color: var(--text-faint);
    }
    .grade.again {
        border-color: rgba(255, 93, 108, 0.5);
    }
    .grade.hard {
        border-color: rgba(244, 183, 64, 0.5);
    }
    .grade.good {
        border-color: rgba(47, 214, 122, 0.5);
    }
    .grade.easy {
        border-color: rgba(22, 211, 198, 0.6);
    }
    .reveal {
        margin-top: 30px;
        padding: 13px 26px;
        font-size: 16px;
    }
    .hintkey {
        opacity: 0.7;
        font-size: 12px;
    }
    .big {
        padding: 13px 26px;
        font-size: 16px;
    }
    .boxer {
        position: sticky;
        top: 20px;
    }
    .boxwrap {
        padding: 14px;
    }
    .legend {
        margin-top: 12px;
        display: grid;
        gap: 6px;
        font-size: 12px;
        color: var(--text-dim);
    }
    .legend.center {
        text-align: center;
    }
    .k {
        font-weight: 700;
        margin-right: 4px;
    }
    .k.good {
        color: var(--good);
    }
    .k.warn {
        color: var(--warn);
    }
    .k.bad {
        color: var(--bad);
    }
</style>
