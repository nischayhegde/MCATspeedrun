<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import QuestionView from "../components/QuestionView.svelte";

    const total = $derived(store.diag.items.length);
    const num = $derived(store.diag.index + 1);
    const progress = $derived(total ? (store.diag.index / total) * 100 : 0);
</script>

<div class="diag">
    <div class="topbar">
        <div class="left">
            <span class="dtag">DIAGNOSTIC</span>
            <span class="count mono">Question {num} / {total}</span>
        </div>
        <div class="right hint">No feedback until the end — answer and move on.</div>
    </div>

    <div class="progress"><div class="bar" style="width:{progress}%"></div></div>

    {#if store.currentDiag}
        <div class="card body">
            <QuestionView
                q={store.currentDiag}
                showTimer={store.settings.showTimer}
                onanswer={(l) => store.answerDiagnostic(l)}
            />
        </div>
    {/if}
</div>

<style>
    .diag {
        max-width: 820px;
        margin: 0 auto;
        padding: 20px;
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
        gap: 12px;
    }
    .dtag {
        font-weight: 800;
        letter-spacing: 0.16em;
        color: var(--accent);
        font-size: 12px;
    }
    .count {
        color: var(--text-dim);
    }
    .hint {
        color: var(--text-faint);
        font-size: 12px;
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
</style>
