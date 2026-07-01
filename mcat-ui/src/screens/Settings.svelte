<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import { LATENCY } from "../lib/scoring.ts";

    let showAdvanced = $state(false);
</script>

<div class="settings">
    <h1>Settings</h1>

    <div class="card group">
        <div class="row">
            <div>
                <div class="rt">8-bit boxer animation</div>
                <div class="rd">Ambient, cosmetic. Never blocks study.</div>
            </div>
            <label class="switch">
                <input type="checkbox" bind:checked={store.settings.boxerOn} />
                <span class="slider"></span>
            </label>
        </div>
        <div class="row">
            <div>
                <div class="rt">Show question timer</div>
                <div class="rd">
                    Latency is always recorded; this only toggles the display.
                </div>
            </div>
            <label class="switch">
                <input type="checkbox" bind:checked={store.settings.showTimer} />
                <span class="slider"></span>
            </label>
        </div>
    </div>

    <div class="card group">
        <div class="row">
            <div>
                <div class="rt">New subtopics / day</div>
                <div class="rd">Caps how many new content areas are introduced.</div>
            </div>
            <input
                class="num"
                type="number"
                min="0"
                max="60"
                bind:value={store.settings.newPerDay}
            />
        </div>
        <div class="row">
            <div>
                <div class="rt">Max reviews / day</div>
                <div class="rd">Reuses Anki's deck-config daily limit.</div>
            </div>
            <input
                class="num"
                type="number"
                min="0"
                max="500"
                bind:value={store.settings.reviewsPerDay}
            />
        </div>
    </div>

    <div class="card group">
        <button class="advtoggle" onclick={() => (showAdvanced = !showAdvanced)}>
            {showAdvanced ? "▾" : "▸"} Advanced — latency thresholds (placeholders, calibrated
            later)
        </button>
        {#if showAdvanced}
            <table class="lat">
                <thead>
                    <tr>
                        <th>Item type</th>
                        <th>fast &lt; (ms)</th>
                        <th>slow &gt; (ms)</th>
                    </tr>
                </thead>
                <tbody>
                    {#each Object.entries(LATENCY) as [kind, t] (kind)}
                        <tr>
                            <td>{kind}</td>
                            <td class="mono">{t.fast}</td>
                            <td class="mono">{t.slow}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
            <p class="warnnote">
                These self-correct once Anki's FSRS optimizer refits parameters to your
                actual rating distribution.
            </p>
        {/if}
    </div>
</div>

<style>
    .settings {
        max-width: 680px;
        margin: 0 auto;
        padding: 26px 20px 60px;
    }
    h1 {
        margin: 0 0 18px;
    }
    .group {
        padding: 6px 20px;
        margin-bottom: 16px;
    }
    .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        border-bottom: 1px solid var(--border);
    }
    .row:last-child {
        border-bottom: none;
    }
    .rt {
        font-weight: 600;
    }
    .rd {
        color: var(--text-faint);
        font-size: 12px;
        margin-top: 3px;
    }
    .num {
        width: 84px;
        background: var(--bg-elev-2);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 8px;
        padding: 8px 10px;
        text-align: right;
        font-family: var(--mono);
    }
    .switch {
        position: relative;
        width: 46px;
        height: 26px;
    }
    .switch input {
        display: none;
    }
    .slider {
        position: absolute;
        inset: 0;
        background: var(--bg-elev-2);
        border: 1px solid var(--border);
        border-radius: 999px;
        transition: 0.2s;
    }
    .slider::before {
        content: "";
        position: absolute;
        width: 18px;
        height: 18px;
        left: 3px;
        top: 3px;
        background: var(--text-dim);
        border-radius: 50%;
        transition: 0.2s;
    }
    .switch input:checked + .slider {
        background: var(--accent);
        border-color: transparent;
    }
    .switch input:checked + .slider::before {
        transform: translateX(20px);
        background: #04231f;
    }
    .advtoggle {
        background: none;
        border: none;
        color: var(--text-dim);
        font-weight: 600;
        padding: 16px 0;
        width: 100%;
        text-align: left;
    }
    .lat {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
    }
    .lat th,
    .lat td {
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
    }
    .lat th {
        color: var(--text-faint);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
    }
    .warnnote {
        color: var(--text-faint);
        font-size: 12px;
    }
</style>
