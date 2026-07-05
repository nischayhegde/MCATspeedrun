<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { onMount } from "svelte";

    import { goto, invalidate } from "$app/navigation";

    import type {
        McatLeafState,
        McatReadinessResponse,
    } from "@generated/anki/scheduler_pb";
    import { recomputeMcatLeafStates, resetMcatProgress } from "@generated/backend";
    import LanServerModal from "./lib/LanServerModal.svelte";
    import MeterBar from "./lib/MeterBar.svelte";

    export let readiness: McatReadinessResponse;

    let refreshing = false;
    let confirmingReset = false;
    let resetting = false;
    let menuOpen = false;
    let lanOpen = false;

    onMount(() => {
        // Fire-and-forget: never block first paint on a recompute round-trip.
        refreshing = true;
        recomputeMcatLeafStates({})
            .then((fresh) => {
                readiness = fresh;
            })
            .finally(() => {
                refreshing = false;
            });
    });

    async function reset(): Promise<void> {
        resetting = true;
        try {
            readiness = await resetMcatProgress({});
            // Drop the cached diagnostic and study queue so the next attempt
            // draws a fresh, newly-seeded set instead of replaying the last one.
            await invalidate("mcat:diagnostic");
            await invalidate("mcat:study");
            confirmingReset = false;
        } finally {
            resetting = false;
        }
    }

    function focusOnMount(node: HTMLElement): void {
        node.focus();
    }

    function openReset(): void {
        menuOpen = false;
        confirmingReset = true;
    }

    function onWindowKeydown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            if (confirmingReset && !resetting) {
                confirmingReset = false;
            } else if (menuOpen) {
                menuOpen = false;
            }
        }
    }

    function onWindowClick(e: MouseEvent): void {
        if (menuOpen && !(e.target as HTMLElement).closest(".overflow-wrap")) {
            menuOpen = false;
        }
    }

    interface SectionGroup {
        label: string;
        leaves: McatLeafState[];
    }

    function groupBySection(leaves: McatLeafState[]): SectionGroup[] {
        const order: string[] = [];
        const map = new Map<string, McatLeafState[]>();
        for (const leaf of leaves) {
            if (!map.has(leaf.section)) {
                map.set(leaf.section, []);
                order.push(leaf.section);
            }
            map.get(leaf.section)!.push(leaf);
        }
        return order.map((label) => ({ label, leaves: map.get(label)! }));
    }

    function pct(x: number): string {
        return `${Math.round(x * 100)}%`;
    }

    $: sections = groupBySection(readiness.leaves);
    $: assessedCount = readiness.leaves.filter((l) => l.assessed).length;
    $: diagnosticDone = assessedCount > 0;
</script>

<svelte:window on:keydown={onWindowKeydown} on:click={onWindowClick} />

<div class="mcat-dashboard">
    <header class="readiness">
        <div class="overflow-wrap">
            <button
                class="overflow-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                on:click={() => (menuOpen = !menuOpen)}
            >
                ⋯
            </button>
            {#if menuOpen}
                <div class="overflow-menu" role="menu">
                    <button role="menuitem" on:click={openReset}>
                        Reset progress…
                    </button>
                </div>
            {/if}
        </div>
        {#if !readiness.ready}
            <div class="not-ready">
                <div class="not-ready-title">Not enough data for a score yet</div>
                <p class="not-ready-reason">{readiness.notReadyReason}</p>
                <div class="assessed">
                    {assessedCount} / {readiness.leaves.length} subtopics assessed &middot;
                    {readiness.totalGradedReviews} graded reviews
                    {#if refreshing}<span class="refreshing-note">refreshing…</span>{/if}
                </div>
            </div>
        {:else}
            <div class="score-block">
                <div class="score">{readiness.readinessScore}</div>
                <div class="scale">/ 528</div>
            </div>
            <div class="meta">
                <div class="mastery">
                    {Math.round(readiness.readinessPct)}% blueprint mastery
                </div>
                <div class="range">
                    Likely range: {readiness.rangeLow} to {readiness.rangeHigh}
                </div>
                <div class="confidence">
                    <span class="conf-pct">±{readiness.confidenceBand} pts</span>
                    <span class="conf-label">
                        {Math.round(readiness.confidencePct)}% confidence
                    </span>
                </div>
                <p class="rough-note">
                    Estimate is rough — you've assessed {pct(readiness.coverage)} of the blueprint.
                    Updated {new Date(Number(readiness.lastUpdatedMs)).toLocaleString()}.
                    {#if refreshing}<span class="refreshing-note">refreshing…</span>{/if}
                </p>
                {#if readiness.reasons.length > 0}
                    <ul class="reasons">
                        {#each readiness.reasons as reason}
                            <li>{reason}</li>
                        {/each}
                    </ul>
                {/if}
                <details class="conf-details">
                    <summary>How is this computed?</summary>
                    <div class="conf-breakdown">
                        <div class="conf-row">
                            <span class="conf-row-label">coverage</span>
                            <MeterBar value={readiness.coverage} tone="gold" />
                            <span class="conf-row-val">{pct(readiness.coverage)}</span>
                        </div>
                        <div class="conf-row">
                            <span class="conf-row-label">depth</span>
                            <MeterBar value={readiness.depth} tone="gold" />
                            <span class="conf-row-val">{pct(readiness.depth)}</span>
                        </div>
                        <div class="conf-row">
                            <span class="conf-row-label">freshness</span>
                            <MeterBar value={readiness.freshness} tone="gold" />
                            <span class="conf-row-val">{pct(readiness.freshness)}</span>
                        </div>
                    </div>
                </details>
                <div class="assessed">
                    {assessedCount} / {readiness.leaves.length} subtopics assessed
                </div>
            </div>
        {/if}
        <div class="actions">
            <button
                class="primary"
                disabled={!diagnosticDone}
                title={diagnosticDone ? undefined : "Complete a diagnostic first"}
                on:click={async () => {
                    // Re-run the study load so each session is a fresh draw.
                    await invalidate("mcat:study");
                    goto("/mcat/study");
                }}
            >
                Study now
            </button>
            <button
                class="secondary"
                on:click={async () => {
                    // Re-run the diagnostic load so each attempt is a fresh draw.
                    await invalidate("mcat:diagnostic");
                    goto("/mcat/diagnostic");
                }}
            >
                Take diagnostic
            </button>
            <button class="secondary" on:click={() => (lanOpen = true)}>
                Phone access
            </button>
            {#if !diagnosticDone}
                <p class="locked-hint">Take the diagnostic to unlock Study.</p>
            {/if}
        </div>
    </header>

    {#if confirmingReset}
        <div
            class="reset-overlay"
            role="button"
            tabindex="-1"
            on:click={() => !resetting && (confirmingReset = false)}
            on:keydown={(e) =>
                e.key === "Escape" && !resetting && (confirmingReset = false)}
        >
            <div
                class="reset-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reset-title"
                tabindex="-1"
                on:click|stopPropagation
                on:keydown|stopPropagation
            >
                <h2 id="reset-title">Reset all progress?</h2>
                <p>
                    This permanently wipes <strong>everything you've done</strong>
                    : your readiness score, every subtopic's fluency &amp; application, all
                    review history, and each card's spaced-repetition schedule. Your imported
                    questions and flashcards are kept, but you'll start completely over.
                </p>
                <p class="warn">This can't be undone.</p>
                <div class="reset-actions">
                    <button
                        class="cancel"
                        disabled={resetting}
                        use:focusOnMount
                        on:click={() => (confirmingReset = false)}
                    >
                        Cancel
                    </button>
                    <button
                        class="confirm-danger"
                        disabled={resetting}
                        on:click={reset}
                    >
                        {resetting ? "Resetting…" : "Yes, wipe everything"}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    {#if lanOpen}
        <LanServerModal on:close={() => (lanOpen = false)} />
    {/if}

    {#each sections as section (section.label)}
        <section class="tag-section">
            <h2>{section.label}</h2>
            <div class="leaves">
                {#each section.leaves as leaf (leaf.leafId)}
                    <div class="leaf" class:unassessed={!leaf.assessed}>
                        <div class="leaf-head">
                            <div class="leaf-title">
                                <span class="leaf-name">{leaf.name}</span>
                                <span class="leaf-id">{leaf.leafId}</span>
                            </div>
                            {#if !leaf.isCars}
                                <span
                                    class="gate"
                                    class:open={leaf.gateOpen}
                                    title={leaf.gateOpen
                                        ? "Fluency gate open — application unlocked"
                                        : "Build rote fluency to unlock application"}
                                >
                                    {leaf.gateOpen ? "unlocked" : "🔒 fluency first"}
                                </span>
                            {/if}
                        </div>
                        <div class="bars">
                            {#if !leaf.isCars}
                                <div class="bar-row">
                                    <span class="bar-label">fluency</span>
                                    <MeterBar value={leaf.fluency} tone="red" />
                                    <span class="bar-val">{pct(leaf.fluency)}</span>
                                </div>
                            {/if}
                            <div class="bar-row">
                                <span class="bar-label">application</span>
                                <MeterBar value={leaf.application} tone="gold" />
                                <span class="bar-val">{pct(leaf.application)}</span>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </section>
    {/each}
</div>

<style lang="scss">
    @use "./lib/mixins" as sf;

    .mcat-dashboard {
        max-width: 62rem;
        margin: 0 auto;
        padding: 1.5rem;
    }

    .readiness {
        position: relative;
        overflow: visible;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1.25rem 2rem;
        padding: 1.75rem 1.9rem;
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--sf-red-deep) 28%, var(--canvas-elevated)) 0%,
            var(--canvas-elevated) 55%
        );
        border: 1px solid var(--border);
        border-radius: 1rem;
        margin-bottom: 2rem;
        box-shadow: var(--sf-shadow-2, 0 12px 34px rgb(0 0 0 / 45%));
    }

    /* judge's scorecard label + ring-corner accent bar (the signature) */
    .readiness::before {
        content: "SCORECARD";
        position: absolute;
        top: 0.75rem;
        right: 2.6rem;
        font-size: 0.62rem;
        letter-spacing: 0.28em;
        font-weight: 800;
        color: var(--sf-dim);
        opacity: 0.7;
    }

    .readiness::after {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(var(--sf-red), var(--sf-red-deep));
        border-radius: 1rem 0 0 1rem;
    }

    .overflow-wrap {
        position: absolute;
        top: 0.6rem;
        right: 0.75rem;
        z-index: 2;
    }

    .overflow-btn {
        @include sf.button-ghost;
        width: 1.9rem;
        height: 1.9rem;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        line-height: 1;
    }

    .overflow-menu {
        position: absolute;
        top: 2.2rem;
        right: 0;
        z-index: 3;
        min-width: 11rem;
        padding: 0.35rem;
        border-radius: var(--sf-r-sm);
        border: 1px solid var(--border);
        background: var(--canvas-elevated);
        box-shadow: var(--sf-shadow-2, 0 12px 34px rgb(0 0 0 / 45%));
        display: flex;
        flex-direction: column;
    }

    .overflow-menu button {
        @include sf.button-base;
        padding: 0.5rem 0.7rem;
        border: none;
        background: none;
        color: var(--sf-err);
        text-align: left;
        font-weight: 600;
        &:hover {
            background: color-mix(in srgb, var(--sf-err) 12%, transparent);
        }
    }

    .score-block {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        padding-right: 1.5rem;
        border-right: 1px solid var(--border-subtle);
    }

    .score {
        font-size: 4.4rem;
        font-weight: 900;
        line-height: 1;
        letter-spacing: -0.02em;
        background: linear-gradient(
            140deg,
            var(--sf-gold) 0%,
            #fff2cf 42%,
            var(--sf-red) 118%
        );
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: 0 2px 18px rgba(245, 196, 81, 0.12);
    }

    .scale {
        font-size: 1.25rem;
        opacity: 0.6;
    }

    .meta {
        flex: 1 1 12rem;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }

    .actions {
        margin-left: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .actions .primary {
        @include sf.button-primary;
        &:disabled {
            opacity: 0.45;
            filter: none;
            cursor: default;
            box-shadow: none;
        }
    }

    .actions .secondary {
        @include sf.button-secondary;
    }

    .locked-hint {
        margin: 0;
        font-size: 0.78rem;
        color: var(--sf-dim);
        text-align: right;
    }

    .reset-overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: rgb(0 0 0 / 45%);
    }

    .reset-dialog {
        max-width: 30rem;
        width: 100%;
        padding: 1.5rem 1.6rem;
        border-radius: 0.9rem;
        background: var(--canvas-elevated);
        border: 1px solid var(--border);
        box-shadow: var(--sf-shadow-2, 0 12px 40px rgb(0 0 0 / 25%));
    }

    .reset-dialog h2 {
        margin: 0 0 0.6rem;
        font-size: 1.25rem;
    }

    .reset-dialog p {
        margin: 0 0 0.6rem;
        font-size: 0.9rem;
        line-height: 1.5;
        opacity: 0.85;
    }

    .reset-dialog .warn {
        font-weight: 700;
        color: var(--sf-err);
        opacity: 1;
    }

    .reset-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        margin-top: 1rem;
    }

    .reset-actions .cancel {
        @include sf.button-secondary;
    }

    .reset-actions .confirm-danger {
        @include sf.button-base;
        padding: 0.55rem 1.1rem;
        border: none;
        background: var(--sf-err);
        color: #fff;
        font-weight: 700;
        &:hover:not(:disabled) {
            filter: brightness(1.08);
        }
    }

    .reset-actions button:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .mastery {
        font-size: 1.1rem;
        font-weight: 600;
    }

    .confidence {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
    }

    .conf-pct {
        font-weight: 700;
    }

    .conf-label,
    .assessed {
        opacity: 0.7;
        font-size: 0.9rem;
    }

    .rough-note {
        margin: 0;
        font-size: 0.82rem;
        color: var(--sf-dim);
    }

    .not-ready {
        grid-column: 1 / -1;
    }
    .not-ready-title {
        font-weight: 600;
    }
    .not-ready-reason {
        color: var(--sf-dim);
    }
    .range {
        font-size: 0.9em;
    }
    .reasons {
        margin: 0.5em 0 0;
        padding-left: 1.2em;
        font-size: 0.9em;
    }

    .refreshing-note {
        margin-left: 0.4rem;
        color: var(--sf-dim);
        font-style: italic;
    }

    .conf-details {
        font-size: 0.82rem;
        color: var(--sf-dim);
    }

    .conf-details summary {
        cursor: pointer;
        user-select: none;
        @include sf.focusable;
    }

    .conf-breakdown {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-top: 0.5rem;
    }

    .conf-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .conf-row-label {
        width: 4.5rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 0.7rem;
    }

    .conf-row-val {
        width: 2.5rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    .tag-section {
        margin-bottom: 1.5rem;
    }

    .tag-section h2 {
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--sf-dim);
        font-weight: 800;
        margin-bottom: 0.5rem;
    }

    .leaves {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: 0.75rem;
    }

    .leaf {
        background: var(--canvas-elevated);
        border: 1px solid var(--border);
        border-radius: 0.6rem;
        padding: 0.7rem 0.85rem;
    }

    .leaf.unassessed {
        opacity: 0.5;
    }

    .leaf-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.4rem;
    }

    .leaf-title {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
    }

    .leaf-name {
        font-size: 0.85rem;
        font-weight: 600;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .leaf-id {
        display: inline-block;
        font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
        font-size: 0.66rem;
        color: var(--sf-dim);
    }

    .gate {
        flex-shrink: 0;
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 0.08rem 0.45rem;
        border-radius: 1rem;
        background: color-mix(in srgb, var(--sf-red) 16%, transparent);
        color: var(--sf-err);
        white-space: nowrap;
    }

    .gate.open {
        background: color-mix(in srgb, var(--sf-gold) 15%, transparent);
        color: var(--sf-gold);
    }

    .bars {
        margin-top: 0.4rem;
    }

    .bar-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 0.2rem;
    }

    .bar-label {
        width: 5rem;
        font-size: 0.75rem;
        opacity: 0.7;
    }

    .bar-val {
        width: 2.5rem;
        text-align: right;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
    }
</style>
