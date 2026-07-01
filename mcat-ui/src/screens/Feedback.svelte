<script lang="ts">
    import { store } from "../lib/store.svelte.ts";
    import Boxer from "../components/Boxer.svelte";

    const fb = $derived(store.lastFeedback);
    const ratingText: Record<string, string> = {
        again: "Wrong — logged as a miss",
        hard: "Correct, but slow — you reasoned it out",
        good: "Correct at a solid pace",
        easy: "Correct and fast — automatic recall",
    };
    function secs(ms: number): string {
        return (ms / 1000).toFixed(1) + "s";
    }
</script>

{#if fb}
    <div class="fbwrap">
        <div class="col main">
            <div class="banner {fb.correct ? 'ok' : 'no'}">
                <div class="big">{fb.correct ? "Correct" : "Not quite"}</div>
                <div class="meta mono">
                    You chose {fb.chosen} · Answer {fb.q.answer.letter} · {secs(fb.ms)}
                </div>
            </div>

            <div class="card ratingcard">
                <span class="section-label">Auto-grade (FSRS)</span>
                <div class="rating {fb.rating}">{ratingText[fb.rating]}</div>
                <div class="rsub">
                    Rating derived from correctness + response time — no self-grading on
                    objective items.
                </div>
            </div>

            <div class="card expl">
                <span class="section-label">Why</span>
                <p>
                    {fb.q.answer.explanation ||
                        "No explanation available for this item."}
                </p>
                <div class="tags">
                    {#each fb.q.tags.subtopics.slice(0, 4) as st (st)}
                        <span class="pill">{st}</span>
                    {/each}
                </div>
            </div>

            <button class="btn primary big" onclick={() => store.feedbackContinue()}>
                Continue →
            </button>
        </div>

        {#if store.settings.boxerOn}
            <div class="col boxer">
                <div class="card"><Boxer height={280} /></div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .fbwrap {
        max-width: 1120px;
        margin: 0 auto;
        padding: 20px;
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 18px;
        align-items: start;
    }
    .banner {
        border-radius: var(--radius);
        padding: 18px 22px;
        border: 1px solid var(--border);
        margin-bottom: 14px;
    }
    .banner.ok {
        background: linear-gradient(
            180deg,
            rgba(47, 214, 122, 0.18),
            rgba(47, 214, 122, 0.04)
        );
        border-color: rgba(47, 214, 122, 0.4);
    }
    .banner.no {
        background: linear-gradient(
            180deg,
            rgba(255, 93, 108, 0.18),
            rgba(255, 93, 108, 0.04)
        );
        border-color: rgba(255, 93, 108, 0.4);
    }
    .banner .big {
        font-size: 26px;
        font-weight: 800;
    }
    .banner .meta {
        color: var(--text-dim);
        margin-top: 4px;
    }
    .ratingcard,
    .expl {
        padding: 16px 18px;
        margin-bottom: 14px;
    }
    .rating {
        font-size: 18px;
        font-weight: 700;
        margin-top: 8px;
    }
    .rating.again {
        color: var(--bad);
    }
    .rating.hard {
        color: var(--warn);
    }
    .rating.good {
        color: var(--good);
    }
    .rating.easy {
        color: var(--accent);
    }
    .rsub {
        color: var(--text-faint);
        font-size: 12px;
        margin-top: 6px;
    }
    .expl p {
        color: var(--text-dim);
        line-height: 1.55;
        margin: 10px 0 12px;
    }
    .tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
    }
    .big {
        padding: 13px 22px;
        font-size: 16px;
    }
    .boxer {
        position: sticky;
        top: 20px;
    }
</style>
