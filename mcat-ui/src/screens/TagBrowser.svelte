<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import { LEAF_BY_ID, SECTIONS } from "../lib/taxonomy.ts";
    import { N_TARGET } from "../lib/scoring.ts";
    import TagBreakdown from "../components/TagBreakdown.svelte";

    const leaf = $derived(store.selectedLeaf ? LEAF_BY_ID[store.selectedLeaf] : null);
    const s = $derived(store.selectedLeaf ? store.leafState(store.selectedLeaf) : null);
    const depth = $derived(s ? Math.min(100, (s.attempts / N_TARGET) * 100) : 0);
</script>

<div class="tb">
    <div class="head">
        <h1>Tags</h1>
        <p class="sub">
            Drill into any content category to see fluency, application, evidence depth,
            and its two-stage gate state.
        </p>
    </div>

    {#if leaf && s}
        <div class="card detail">
            <div class="detail-head">
                <div>
                    <div class="dtitle">
                        <span class="mono id">{leaf.id}</span>
                        {leaf.name}
                    </div>
                    <div class="dmeta">
                        {SECTIONS[leaf.section].name}{leaf.fc ? ` · ${leaf.fc}` : ""} · blueprint
                        weight {(leaf.weight * 100).toFixed(1)}%
                    </div>
                </div>
                <button class="btn ghost" onclick={() => (store.selectedLeaf = null)}>
                    Close
                </button>
            </div>

            <div class="metrics">
                {#if !leaf.isCars}
                    <div class="m">
                        <div class="mk">Fluency</div>
                        <div class="track">
                            <div
                                class="fill flu"
                                style="width:{Math.round(s.fluency * 100)}%"
                            ></div>
                        </div>
                        <div class="mv mono">{Math.round(s.fluency * 100)}%</div>
                    </div>
                {/if}
                <div class="m">
                    <div class="mk">Application</div>
                    <div class="track">
                        <div
                            class="fill app"
                            style="width:{Math.round(s.application * 100)}%"
                        ></div>
                    </div>
                    <div class="mv mono">{Math.round(s.application * 100)}%</div>
                </div>
                <div class="m">
                    <div class="mk">Evidence depth</div>
                    <div class="track">
                        <div class="fill dep" style="width:{depth}%"></div>
                    </div>
                    <div class="mv mono">{s.attempts}/{N_TARGET}</div>
                </div>
                <div class="m">
                    <div class="mk">Freshness</div>
                    <div class="track">
                        <div
                            class="fill fre"
                            style="width:{Math.round(s.freshness * 100)}%"
                        ></div>
                    </div>
                    <div class="mv mono">{Math.round(s.freshness * 100)}%</div>
                </div>
            </div>

            <div class="gate">
                {#if leaf.isCars}
                    <span class="badge open">
                        Application-only track — no fluency gate
                    </span>
                {:else if s.gateOpen}
                    <span class="badge open">
                        Gate OPEN — fluent, application unlocked
                    </span>
                {:else}
                    <span class="badge closed">
                        Gate CLOSED — build fluency with rote flashcards first
                    </span>
                {/if}
            </div>
        </div>
    {/if}

    <div class="card list">
        <TagBreakdown onpick={(id) => (store.selectedLeaf = id)} />
    </div>
</div>

<style>
    .tb {
        max-width: 980px;
        margin: 0 auto;
        padding: 20px;
    }
    .head h1 {
        margin: 0 0 4px;
    }
    .sub {
        color: var(--text-dim);
        margin: 0 0 18px;
        max-width: 620px;
    }
    .detail {
        padding: 20px;
        margin-bottom: 18px;
    }
    .detail-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;
    }
    .dtitle {
        font-size: 18px;
        font-weight: 700;
    }
    .id {
        color: var(--accent);
        margin-right: 6px;
    }
    .dmeta {
        color: var(--text-faint);
        font-size: 12px;
        margin-top: 4px;
    }
    .metrics {
        display: grid;
        gap: 12px;
    }
    .m {
        display: grid;
        grid-template-columns: 130px 1fr 60px;
        align-items: center;
        gap: 12px;
    }
    .mk {
        font-size: 13px;
        color: var(--text-dim);
    }
    .mv {
        text-align: right;
        color: var(--text-dim);
        font-size: 13px;
    }
    .track {
        height: 10px;
        border-radius: 999px;
        background: #0c1526;
        overflow: hidden;
        border: 1px solid var(--border);
    }
    .fill {
        height: 100%;
    }
    .fill.flu {
        background: linear-gradient(90deg, #2f6bd6, #16d3c6);
    }
    .fill.app {
        background: linear-gradient(90deg, #2fd67a, #16d3c6);
    }
    .fill.dep {
        background: linear-gradient(90deg, #b98bff, #16d3c6);
    }
    .fill.fre {
        background: linear-gradient(90deg, #f4b740, #2fd67a);
    }
    .gate {
        margin-top: 18px;
    }
    .badge {
        padding: 6px 12px;
        border-radius: 999px;
        font-weight: 700;
        font-size: 13px;
        border: 1px solid var(--border);
    }
    .badge.open {
        color: var(--good);
        border-color: rgba(47, 214, 122, 0.4);
        background: rgba(47, 214, 122, 0.08);
    }
    .badge.closed {
        color: var(--warn);
        border-color: rgba(244, 183, 64, 0.4);
        background: rgba(244, 183, 64, 0.08);
    }
    .list {
        padding: 18px;
    }
</style>
