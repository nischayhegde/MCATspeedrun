<script lang="ts">
    import {
        LEAVES,
        SECTIONS,
        SECTION_ORDER,
        type SectionCode,
    } from "../lib/taxonomy.ts";
    import { store } from "../lib/store.svelte.ts";

    let { onpick }: { onpick?: (leafId: string) => void } = $props();

    const grouped = $derived(
        SECTION_ORDER.map((sec) => ({
            sec,
            meta: SECTIONS[sec],
            leaves: LEAVES.filter((l) => l.section === sec),
        })),
    );

    function pct(x: number): number {
        return Math.round(x * 100);
    }
</script>

<div class="wrap">
    {#each grouped as g (g.sec)}
        <div class="group">
            <div class="group-head">
                <span class="dot {g.sec}"></span>
                <span class="name">{g.meta.name}</span>
                <span class="short mono">{g.sec}</span>
            </div>
            <div class="rows">
                {#each g.leaves as leaf (leaf.id)}
                    {@const s = store.leafState(leaf.id)}
                    <button class="row" onclick={() => onpick?.(leaf.id)}>
                        <div class="idcell mono">{leaf.id}</div>
                        <div class="labelcell">
                            <div class="lname">{leaf.name}</div>
                            <div class="state">
                                {#if leaf.isCars}
                                    <span class="pill">application-only</span>
                                {:else if s.gateOpen}
                                    <span class="pill open">fluent → applied</span>
                                {:else if s.assessed}
                                    <span class="pill build">building fluency</span>
                                {:else}
                                    <span class="pill none">not assessed</span>
                                {/if}
                            </div>
                        </div>
                        <div class="bars">
                            {#if !leaf.isCars}
                                <div class="metric">
                                    <span class="mlabel">FLU</span>
                                    <div class="track">
                                        <div
                                            class="fill flu"
                                            style="width:{pct(s.fluency)}%"
                                        ></div>
                                    </div>
                                    <span class="mval mono">{pct(s.fluency)}</span>
                                </div>
                            {/if}
                            <div class="metric">
                                <span class="mlabel">APP</span>
                                <div class="track">
                                    <div
                                        class="fill app"
                                        style="width:{pct(s.application)}%"
                                    ></div>
                                </div>
                                <span class="mval mono">{pct(s.application)}</span>
                            </div>
                        </div>
                    </button>
                {/each}
            </div>
        </div>
    {/each}
</div>

<style>
    .group {
        margin-bottom: 18px;
    }
    .group-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
    }
    .group-head .name {
        font-weight: 700;
        color: var(--text);
    }
    .group-head .short {
        color: var(--text-faint);
        font-size: 12px;
    }
    .dot {
        width: 10px;
        height: 10px;
        border-radius: 3px;
    }
    .dot.CPBS {
        background: #f4b740;
    }
    .dot.BBLS {
        background: #2fd67a;
    }
    .dot.PSBB {
        background: #b98bff;
    }
    .dot.CARS {
        background: #16d3c6;
    }
    .rows {
        display: grid;
        gap: 6px;
    }
    .row {
        display: grid;
        grid-template-columns: 34px 1fr 220px;
        align-items: center;
        gap: 12px;
        text-align: left;
        padding: 8px 10px;
        background: var(--bg-elev-2);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--text);
        transition: border-color 0.15s ease;
    }
    .row:hover {
        border-color: var(--accent);
    }
    .idcell {
        font-weight: 800;
        color: var(--text-dim);
    }
    .lname {
        font-size: 13px;
        line-height: 1.25;
    }
    .state {
        margin-top: 3px;
    }
    .pill {
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--text-faint);
    }
    .pill.open {
        color: var(--good);
        border-color: rgba(47, 214, 122, 0.4);
    }
    .pill.build {
        color: var(--warn);
        border-color: rgba(244, 183, 64, 0.4);
    }
    .pill.none {
        color: var(--text-faint);
    }
    .bars {
        display: grid;
        gap: 4px;
    }
    .metric {
        display: grid;
        grid-template-columns: 30px 1fr 26px;
        align-items: center;
        gap: 8px;
    }
    .mlabel {
        font-size: 9px;
        font-weight: 800;
        color: var(--text-faint);
    }
    .mval {
        font-size: 11px;
        text-align: right;
        color: var(--text-dim);
    }
    .track {
        height: 7px;
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
</style>
