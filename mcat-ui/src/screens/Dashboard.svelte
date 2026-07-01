<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import { LEAVES } from "../lib/taxonomy.ts";
    import ReadinessGauge from "../components/ReadinessGauge.svelte";
    import TagBreakdown from "../components/TagBreakdown.svelte";
    import Boxer from "../components/Boxer.svelte";

    const r = $derived(store.readiness);
    const c = $derived(store.confidence);
    const gap = $derived(store.profile.targetScore - r.score);
    const fluentCount = $derived(
        LEAVES.filter((l) => !l.isCars && store.leafState(l.id).gateOpen).length,
    );
    const assessedCount = $derived(
        LEAVES.filter((l) => store.leafState(l.id).assessed).length,
    );
</script>

<div class="dash">
    <aside class="side">
        <div class="card gaugecard">
            <ReadinessGauge
                pct={r.pct}
                score={r.score}
                confidencePct={c.pct}
                band={c.band}
                targetScore={store.profile.targetScore}
                size={230}
            />
            <div class="target mono">
                Target {store.profile.targetScore}
                {#if gap > 0}<span class="behind">· {gap} to go</span>{:else}<span
                        class="ahead"
                    >
                        · on track
                    </span>{/if}
            </div>
        </div>

        <div class="card stats">
            <div class="stat">
                <div class="v mono">{store.streak}🔥</div>
                <div class="k">day streak</div>
            </div>
            <div class="stat">
                <div class="v mono">{fluentCount}</div>
                <div class="k">gates open</div>
            </div>
            <div class="stat">
                <div class="v mono">{assessedCount}/{LEAVES.length}</div>
                <div class="k">assessed</div>
            </div>
        </div>

        <button class="btn primary study" onclick={() => store.startSession()}>
            ▶ Study now
        </button>
        <button class="btn ghost" onclick={() => store.go("tagBrowser")}>
            Browse all tags
        </button>
    </aside>

    <main class="main">
        <div class="card boxercard">
            <div class="boxer-head">
                <span class="section-label">Your fighter</span>
                <span class="hint">
                    grows with readiness · trains on flashcards · fights application
                    problems
                </span>
            </div>
            <Boxer height={240} />
        </div>

        <div class="card tags">
            <div class="tags-head">
                <span class="section-label">Strengths & weak points by tag</span>
                <span class="legend">
                    <span class="lg flu">fluency</span>
                    <span class="lg app">application</span>
                </span>
            </div>
            <TagBreakdown onpick={(id) => store.pickLeaf(id)} />
        </div>
    </main>
</div>

<style>
    .dash {
        display: grid;
        grid-template-columns: 300px 1fr;
        gap: 18px;
        max-width: 1160px;
        margin: 0 auto;
        padding: 20px;
        align-items: start;
    }
    .side {
        display: flex;
        flex-direction: column;
        gap: 14px;
        position: sticky;
        top: 20px;
    }
    .gaugecard {
        padding: 20px;
        text-align: center;
    }
    .target {
        margin-top: 12px;
        color: var(--text-dim);
        font-size: 13px;
    }
    .behind {
        color: var(--warn);
    }
    .ahead {
        color: var(--good);
    }
    .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        padding: 14px;
        gap: 8px;
    }
    .stat {
        text-align: center;
    }
    .stat .v {
        font-size: 20px;
        font-weight: 800;
    }
    .stat .k {
        font-size: 11px;
        color: var(--text-faint);
        margin-top: 2px;
    }
    .study {
        padding: 14px;
        font-size: 16px;
    }
    .main {
        display: flex;
        flex-direction: column;
        gap: 18px;
    }
    .boxercard {
        padding: 16px;
    }
    .boxer-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 10px;
    }
    .boxer-head .hint {
        color: var(--text-faint);
        font-size: 11px;
    }
    .tags {
        padding: 18px;
    }
    .tags-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 14px;
    }
    .legend {
        display: flex;
        gap: 10px;
        font-size: 11px;
    }
    .lg {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--text-dim);
    }
    .lg::before {
        content: "";
        width: 12px;
        height: 6px;
        border-radius: 3px;
    }
    .lg.flu::before {
        background: linear-gradient(90deg, #2f6bd6, #16d3c6);
    }
    .lg.app::before {
        background: linear-gradient(90deg, #2fd67a, #16d3c6);
    }
</style>
