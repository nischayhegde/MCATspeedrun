<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import { QUESTIONS } from "../lib/store.svelte.ts";
</script>

<div class="onb">
    <div class="brand">
        <div class="logo mono">
            MCAT
            <span>SPEEDRUN</span>
        </div>
        <p class="tagline">Diagnose. Drill to fluency. Fight the real thing.</p>
    </div>

    <div class="card panel">
        <h2>Let's set your target</h2>

        <label class="field">
            <span class="section-label">Target score</span>
            <div class="scorepick">
                <input
                    type="range"
                    min="472"
                    max="528"
                    bind:value={store.profile.targetScore}
                />
                <span class="scorebig mono">{store.profile.targetScore}</span>
            </div>
            <span class="hint">
                The MCAT composite runs 472–528 (four sections, 118–132 each).
            </span>
        </label>

        <label class="field">
            <span class="section-label">Test date</span>
            <input class="date" type="date" bind:value={store.profile.targetDate} />
        </label>

        <div class="explain">
            <h3>First up: a 120-question diagnostic</h3>
            <ul>
                <li>
                    Stratified-random across every content category + difficulty band.
                </li>
                <li>
                    We measure <b>fluency</b>
                    (fast, durable recall) and
                    <b>application</b>
                     (novel problems) separately.
                </li>
                <li>
                    Questions you likely can't answer yet are shown on purpose — that
                    "productive failure" primes the direct instruction that follows.
                </li>
                <li>No feedback until the end. Just answer honestly and quickly.</li>
            </ul>
            <p class="note mono">
                Prototype note: only {QUESTIONS.length} real parsed questions are bundled,
                so this diagnostic is a scaled-down demo of the full 120.
            </p>
        </div>

        <button class="btn primary big" onclick={() => store.startDiagnostic()}>
            Begin diagnostic →
        </button>
    </div>
</div>

<style>
    .onb {
        max-width: 640px;
        margin: 0 auto;
        padding: 32px 20px 60px;
    }
    .brand {
        text-align: center;
        margin-bottom: 22px;
    }
    .logo {
        font-size: 30px;
        font-weight: 800;
        letter-spacing: 0.04em;
    }
    .logo span {
        color: var(--accent);
        margin-left: 8px;
    }
    .tagline {
        color: var(--text-dim);
        margin-top: 4px;
    }
    .panel {
        padding: 26px;
    }
    h2 {
        margin: 0 0 18px;
    }
    .field {
        display: block;
        margin-bottom: 20px;
    }
    .scorepick {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 8px;
    }
    input[type="range"] {
        flex: 1;
        accent-color: var(--accent);
    }
    .scorebig {
        font-size: 34px;
        font-weight: 800;
        color: var(--accent);
        min-width: 84px;
        text-align: right;
    }
    .date {
        margin-top: 8px;
        background: var(--bg-elev-2);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 9px;
        padding: 10px 12px;
        font-size: 15px;
    }
    .hint {
        display: block;
        color: var(--text-faint);
        font-size: 12px;
        margin-top: 6px;
    }
    .explain {
        background: var(--bg-elev-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 16px 18px;
        margin: 8px 0 22px;
    }
    .explain h3 {
        margin: 0 0 8px;
        font-size: 15px;
    }
    .explain ul {
        margin: 0;
        padding-left: 18px;
        color: var(--text-dim);
        font-size: 14px;
        line-height: 1.5;
    }
    .note {
        color: var(--text-faint);
        font-size: 11px;
        margin: 10px 0 0;
    }
    .big {
        width: 100%;
        padding: 14px;
        font-size: 16px;
    }
</style>
