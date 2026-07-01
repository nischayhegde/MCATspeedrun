<script lang="ts">
    import type { QuestionFixture } from "../lib/types.ts";
    import { store } from "../lib/store.svelte.ts";

    let {
        q,
        onanswer,
        showTimer = true,
        disabled = false,
    }: {
        q: QuestionFixture;
        onanswer: (letter: string) => void;
        showTimer?: boolean;
        disabled?: boolean;
    } = $props();

    const letters = $derived(Object.keys(q.choices));
    let imgOk = $state(true);
    let selected = $state<string | null>(null);

    // live timer
    let elapsed = $state(0);
    $effect(() => {
        // reset whenever the question changes
        q.id;
        selected = null;
        imgOk = true;
        const start = store.cardStartedAt || Date.now();
        elapsed = Math.floor((Date.now() - start) / 1000);
        const t = setInterval(() => {
            elapsed = Math.floor((Date.now() - start) / 1000);
        }, 500);
        return () => clearInterval(t);
    });

    function fmt(s: number): string {
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${r.toString().padStart(2, "0")}`;
    }

    function pick(l: string) {
        if (disabled) return;
        selected = l;
        onanswer(l);
    }
</script>

<div class="qv">
    <div class="qhead">
        <div class="tags">
            <span class="pill">{q.tags.section ?? "?"}</span>
            {#if q.tags.contentCategory}<span class="pill">
                    CC {q.tags.contentCategory}
                </span>{/if}
            <span class="pill diff">Difficulty {q.difficulty}/5</span>
            {#if q.hasPassage}<span class="pill">passage</span>{/if}
            {#if q.hasFigure}<span class="pill">figure</span>{/if}
        </div>
        {#if showTimer}
            <div class="timer mono">{fmt(elapsed)}</div>
        {/if}
    </div>

    <div class="stage">
        {#if imgOk}
            <img
                class="qimg pixelated"
                src={q.image}
                alt="MCAT question"
                onerror={() => (imgOk = false)}
            />
        {:else}
            <div class="fallback">
                <p class="stem">{q.stem}</p>
                <ul>
                    {#each letters as l (l)}
                        <li>
                            <b>{l}.</b>
                            {q.choices[l]}
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}
    </div>

    <div class="answers">
        <div class="prompt">Select your answer</div>
        <div class="letters">
            {#each letters as l (l)}
                <button
                    class="letter"
                    class:sel={selected === l}
                    title={q.choices[l]}
                    {disabled}
                    onclick={() => pick(l)}
                >
                    {l}
                </button>
            {/each}
        </div>
    </div>
</div>

<style>
    .qv {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    .qhead {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }
    .pill.diff {
        color: var(--warn);
    }
    .timer {
        font-size: 20px;
        font-weight: 700;
        color: var(--text-dim);
    }
    .stage {
        background: #fbfcfe;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 10px;
        max-height: 46vh;
        overflow: auto;
        display: flex;
        justify-content: center;
    }
    .qimg {
        max-width: 100%;
        height: auto;
        border-radius: 6px;
    }
    .fallback {
        color: #10203a;
        padding: 10px 14px;
        text-align: left;
    }
    .fallback .stem {
        font-weight: 600;
    }
    .fallback ul {
        padding-left: 18px;
    }
    .fallback li {
        margin: 4px 0;
    }
    .answers {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .prompt {
        color: var(--text-faint);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-weight: 700;
    }
    .letters {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
    }
    .letter {
        font-family: var(--mono);
        font-size: 26px;
        font-weight: 800;
        padding: 16px 0;
        border-radius: 12px;
        border: 2px solid var(--border);
        background: var(--bg-elev-2);
        color: var(--text);
        transition:
            transform 0.06s ease,
            border-color 0.15s ease,
            background 0.15s ease;
    }
    .letter:hover:not(:disabled) {
        border-color: var(--accent);
        background: #16283f;
    }
    .letter:active:not(:disabled) {
        transform: translateY(2px);
    }
    .letter.sel {
        border-color: var(--accent);
        background: var(--accent);
        color: #04231f;
    }
    .letter:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>
