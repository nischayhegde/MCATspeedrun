<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { goto } from "$app/navigation";

    import type {
        McatLeafState,
        McatReadinessResponse,
    } from "@generated/anki/scheduler_pb";
    import { recomputeMcatLeafStates, resetMcatProgress } from "@generated/backend";

    export let readiness: McatReadinessResponse;

    let recomputing = false;
    let confirmingReset = false;
    let resetting = false;

    async function recompute(): Promise<void> {
        recomputing = true;
        try {
            readiness = await recomputeMcatLeafStates({});
        } finally {
            recomputing = false;
        }
    }

    async function reset(): Promise<void> {
        resetting = true;
        try {
            readiness = await resetMcatProgress({});
            confirmingReset = false;
        } finally {
            resetting = false;
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
</script>

<div class="mcat-dashboard">
    <header class="readiness">
        <div class="score-block">
            <div class="score">{readiness.readinessScore}</div>
            <div class="scale">/ 528</div>
        </div>
        <div class="meta">
            <div class="mastery">
                {Math.round(readiness.readinessPct)}% blueprint mastery
            </div>
            <div class="confidence">
                <span class="conf-pct">±{readiness.confidenceBand} pts</span>
                <span class="conf-label">
                    {Math.round(readiness.confidencePct)}% confidence
                </span>
            </div>
            <div class="conf-breakdown">
                <span title="How much of the blueprint you've touched">
                    coverage {pct(readiness.coverage)}
                </span>
                <span title="How many spaced attempts back the estimate">
                    depth {pct(readiness.depth)}
                </span>
                <span title="How recent the evidence is">
                    freshness {pct(readiness.freshness)}
                </span>
            </div>
            <div class="assessed">
                {assessedCount} / {readiness.leaves.length} subtopics assessed
            </div>
        </div>
        <div class="actions">
            <button class="primary" on:click={() => goto("/mcat/study")}>
                Study now
            </button>
            <button class="secondary" on:click={() => goto("/mcat/diagnostic")}>
                Take diagnostic
            </button>
            <button class="ghost" disabled={recomputing} on:click={recompute}>
                {recomputing ? "Recomputing…" : "Recompute"}
            </button>
            <button class="danger" on:click={() => (confirmingReset = true)}>
                Reset progress
            </button>
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
                    : your readiness score, every subtopic's fluency &amp; application,
                    all review history, and each card's spaced-repetition schedule. Your
                    imported questions and flashcards are kept, but you'll start
                    completely over.
                </p>
                <p class="warn">This can't be undone.</p>
                <div class="reset-actions">
                    <button
                        class="cancel"
                        disabled={resetting}
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

    {#each sections as section (section.label)}
        <section class="tag-section">
            <h2>{section.label}</h2>
            <div class="leaves">
                {#each section.leaves as leaf (leaf.leafId)}
                    <div class="leaf" class:unassessed={!leaf.assessed}>
                        <div class="leaf-head">
                            <span class="leaf-id">{leaf.leafId}</span>
                            <span class="leaf-name">{leaf.name}</span>
                            {#if !leaf.isCars}
                                <span
                                    class="gate"
                                    class:open={leaf.gateOpen}
                                    title={leaf.gateOpen
                                        ? "Fluency gate open — application unlocked"
                                        : "Build rote fluency to unlock application"}
                                >
                                    {leaf.gateOpen ? "unlocked" : "locked"}
                                </span>
                            {/if}
                        </div>
                        <div class="bars">
                            {#if !leaf.isCars}
                                <div class="bar-row">
                                    <span class="bar-label">fluency</span>
                                    <div class="track">
                                        <div
                                            class="fill fluency"
                                            style:width={pct(leaf.fluency)}
                                        ></div>
                                    </div>
                                    <span class="bar-val">{pct(leaf.fluency)}</span>
                                </div>
                            {/if}
                            <div class="bar-row">
                                <span class="bar-label">application</span>
                                <div class="track">
                                    <div
                                        class="fill application"
                                        style:width={pct(leaf.application)}
                                    ></div>
                                </div>
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
    .mcat-dashboard {
        max-width: 62rem;
        margin: 0 auto;
        padding: 1.5rem;
    }

    .readiness {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1.25rem 2rem;
        padding: 1.75rem 1.9rem;
        background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--sf-red-deep, #a3121c) 28%, var(--canvas-elevated, #161b24))
                0%,
            var(--canvas-elevated, #161b24) 55%
        );
        border: 1px solid var(--border, #ccc);
        border-radius: 1rem;
        margin-bottom: 2rem;
        box-shadow: 0 12px 34px rgb(0 0 0 / 45%);
    }

    /* judge's scorecard label + ring-corner accent bar (the signature) */
    .readiness::before {
        content: "SCORECARD";
        position: absolute;
        top: 0.75rem;
        right: 1.05rem;
        font-size: 0.62rem;
        letter-spacing: 0.28em;
        font-weight: 800;
        color: var(--sf-dim, #9aa4b6);
        opacity: 0.7;
    }

    .readiness::after {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(
            var(--sf-red, #e11d2f),
            var(--sf-red-deep, #a3121c)
        );
    }

    .score-block {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        padding-right: 1.5rem;
        border-right: 1px solid var(--border-subtle, #eee);
    }

    .score {
        font-size: 4.4rem;
        font-weight: 900;
        line-height: 1;
        letter-spacing: -0.02em;
        background: linear-gradient(
            140deg,
            var(--sf-gold, #f5c451) 0%,
            #fff2cf 42%,
            var(--sf-red, #e11d2f) 118%
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
        padding: 0.6rem 1.5rem;
        border-radius: 0.55rem;
        border: none;
        background: linear-gradient(
            180deg,
            var(--sf-red, #e11d2f) 0%,
            var(--sf-red-deep, #a3121c) 100%
        );
        color: var(--mcat-accent-fg, #fff);
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(225, 29, 47, 0.35);
        transition: filter 0.12s ease;
    }

    .actions .primary:hover {
        filter: brightness(1.08);
    }

    .actions .secondary {
        padding: 0.55rem 1rem;
        border-radius: 0.5rem;
        border: 1px solid var(--mcat-accent, #6366f1);
        color: var(--mcat-accent, #6366f1);
        background: none;
        font-weight: 600;
        cursor: pointer;
    }

    .actions .ghost {
        padding: 0.4rem 1rem;
        border-radius: 0.5rem;
        border: 1px solid var(--border, #ccc);
        background: none;
        color: inherit;
        opacity: 0.75;
        cursor: pointer;
    }

    .actions .ghost:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .actions .danger {
        padding: 0.4rem 1rem;
        border-radius: 0.5rem;
        border: 1px solid color-mix(in srgb, #ef4444 45%, transparent);
        background: none;
        color: #ef4444;
        font-weight: 600;
        cursor: pointer;
        transition:
            background 0.12s ease,
            border-color 0.12s ease;
    }

    .actions .danger:hover {
        background: color-mix(in srgb, #ef4444 10%, transparent);
        border-color: #ef4444;
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
        background: var(--canvas-elevated, #fff);
        border: 1px solid var(--border, #ccc);
        box-shadow: 0 12px 40px rgb(0 0 0 / 25%);
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
        color: #ef4444;
        opacity: 1;
    }

    .reset-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        margin-top: 1rem;
    }

    .reset-actions .cancel {
        padding: 0.55rem 1.1rem;
        border-radius: 0.5rem;
        border: 1px solid var(--border, #ccc);
        background: none;
        color: inherit;
        font-weight: 600;
        cursor: pointer;
    }

    .reset-actions .confirm-danger {
        padding: 0.55rem 1.1rem;
        border-radius: 0.5rem;
        border: none;
        background: #ef4444;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.12s ease;
    }

    .reset-actions .confirm-danger:hover:not(:disabled) {
        filter: brightness(1.08);
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

    .conf-breakdown {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 1rem;
        font-size: 0.8rem;
        opacity: 0.7;
    }

    .tag-section {
        margin-bottom: 1.5rem;
    }

    .tag-section h2 {
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        opacity: 0.7;
        margin-bottom: 0.5rem;
    }

    .leaves {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: 0.75rem;
    }

    .leaf {
        background: var(--canvas-elevated, #fff);
        border: 1px solid var(--border, #ddd);
        border-radius: 0.6rem;
        padding: 0.7rem 0.85rem;
        transition:
            transform 0.12s ease,
            box-shadow 0.12s ease;
    }

    .leaf:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgb(0 0 0 / 8%);
    }

    .leaf.unassessed {
        opacity: 0.5;
    }

    .leaf-head {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        margin-bottom: 0.4rem;
    }

    .leaf-id {
        font-weight: 700;
    }

    .leaf-name {
        flex: 1;
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .gate {
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 0.08rem 0.45rem;
        border-radius: 1rem;
        background: color-mix(in srgb, var(--sf-red, #e11d2f) 16%, transparent);
        color: #ff8088;
    }

    .gate.open {
        background: color-mix(in srgb, var(--sf-gold, #f5c451) 15%, transparent);
        color: var(--sf-gold, #f5c451);
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

    .track {
        flex: 1;
        height: 0.5rem;
        border-radius: 1rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
        overflow: hidden;
    }

    .fill {
        height: 100%;
        border-radius: 1rem;
    }

    .fill.fluency {
        background: linear-gradient(
            90deg,
            var(--sf-red-deep, #a3121c),
            var(--sf-red, #e11d2f)
        );
    }

    .fill.application {
        background: linear-gradient(90deg, #b8860b, var(--sf-gold, #f5c451));
    }

    .bar-val {
        width: 2.5rem;
        text-align: right;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
    }
</style>
