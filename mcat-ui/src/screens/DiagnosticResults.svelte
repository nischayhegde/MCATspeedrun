<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import { LEAVES, SECTIONS } from "../lib/taxonomy.ts";
    import ReadinessGauge from "../components/ReadinessGauge.svelte";

    const r = $derived(store.readiness);
    const c = $derived(store.confidence);
    const correct = $derived(store.diag.answers.filter((a) => a.correct).length);
    const answered = $derived(store.diag.answers.length);

    // prescription: highest-yield weak leaves that were actually assessed
    const prescription = $derived(
        LEAVES.map((l) => ({ leaf: l, s: store.leafState(l.id) }))
            .filter((x) => x.s.assessed)
            .map((x) => ({
                ...x,
                priority: x.leaf.weight * (1 - store.mastery(x.leaf)),
            }))
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 6),
    );
</script>

<div class="res">
    <h1>Diagnostic complete</h1>
    <p class="sub">
        Here's your starting point. Confidence is low on purpose — these estimates come
        from just a few items and firm up as you study.
    </p>

    <div class="grid">
        <div class="card gaugecard">
            <ReadinessGauge
                pct={r.pct}
                score={r.score}
                confidencePct={c.pct}
                band={c.band}
                targetScore={store.profile.targetScore}
            />
            <div class="scored mono">Scored {correct}/{answered} on the diagnostic</div>
        </div>

        <div class="card rx">
            <div class="section-label">Start here — highest-yield gaps</div>
            <div class="rxlist">
                {#each prescription as p (p.leaf.id)}
                    <div class="rxrow">
                        <div class="rxid mono">{p.leaf.id}</div>
                        <div class="rxname">
                            {p.leaf.name}
                            <div class="rxmeta">
                                {#if p.leaf.isCars}
                                    CARS practice
                                {:else if p.s.gateOpen}
                                    application practice
                                {:else}
                                    rote → fluency first
                                {/if}
                                · {SECTIONS[p.leaf.section].short}
                            </div>
                        </div>
                        <div class="rxbar">
                            <div class="track">
                                <div
                                    class="fill"
                                    style="width:{Math.round(
                                        store.mastery(p.leaf) * 100,
                                    )}%"
                                ></div>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    </div>

    <div class="cta">
        <button class="btn primary big" onclick={() => store.startSession()}>
            Start studying →
        </button>
        <button class="btn ghost" onclick={() => store.go("dashboard")}>
            Go to dashboard
        </button>
    </div>
</div>

<style>
    .res {
        max-width: 980px;
        margin: 0 auto;
        padding: 26px 20px 60px;
    }
    h1 {
        margin: 0 0 6px;
    }
    .sub {
        color: var(--text-dim);
        max-width: 640px;
        margin: 0 0 22px;
    }
    .grid {
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: 18px;
        align-items: start;
    }
    .gaugecard {
        padding: 22px;
        text-align: center;
    }
    .scored {
        color: var(--text-faint);
        font-size: 12px;
        margin-top: 12px;
    }
    .rx {
        padding: 20px;
    }
    .rxlist {
        margin-top: 12px;
        display: grid;
        gap: 8px;
    }
    .rxrow {
        display: grid;
        grid-template-columns: 40px 1fr 120px;
        align-items: center;
        gap: 12px;
        padding: 10px;
        background: var(--bg-elev-2);
        border: 1px solid var(--border);
        border-radius: 10px;
    }
    .rxid {
        font-weight: 800;
        color: var(--warn);
    }
    .rxname {
        font-size: 14px;
    }
    .rxmeta {
        color: var(--text-faint);
        font-size: 11px;
        margin-top: 2px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .track {
        height: 8px;
        border-radius: 999px;
        background: #0c1526;
        overflow: hidden;
        border: 1px solid var(--border);
    }
    .fill {
        height: 100%;
        background: linear-gradient(90deg, var(--bad), var(--warn));
    }
    .cta {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-top: 24px;
    }
    .big {
        padding: 13px 22px;
        font-size: 16px;
    }
</style>
