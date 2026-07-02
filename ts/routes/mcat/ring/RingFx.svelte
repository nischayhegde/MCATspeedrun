<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

Ring-side FX overlay: the pop badge (POW!/GOOD CALL/OOF!) and a small impact
star burst. Purely cosmetic; freezes under reduced-motion.
-->
<script lang="ts">
    export let badge: { text: string; tone: "gold" | "steel" | "err" } | null = null;
    export let badgeTrigger = 0;
    export let impact: { x: number; y: number } | null = null;
</script>

{#key badgeTrigger}
    {#if badge}
        <div class="badge {badge.tone}">{badge.text}</div>
    {/if}
    {#if impact}
        <svg class="star" style="left: {impact.x}%; top: {impact.y}%;" viewBox="0 0 24 24">
            {#each [0, 60, 120, 180, 240, 300] as a (a)}
                <line x1="12" y1="12" x2={12 + 10 * Math.cos((a * Math.PI) / 180)} y2={12 + 10 * Math.sin((a * Math.PI) / 180)} />
            {/each}
        </svg>
    {/if}
{/key}

<style lang="scss">
    .badge {
        position: absolute;
        top: 12%;
        font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
        font-weight: 800;
        font-size: 13px;
        padding: 3px 8px;
        border-radius: 7px;
        border: 2px solid #05070c;
        letter-spacing: 0.05em;
        animation: pop 0.65s ease-out 1 both;
        &.gold {
            background: var(--sf-gold);
            color: #3a2a00;
            right: 22%;
        }
        &.steel {
            /* centered — translateX must live inside its own pop keyframes,
               otherwise the animation would clobber the centering offset. */
            background: var(--sf-steel);
            color: #0a0e16;
            left: 50%;
            transform: translateX(-50%);
            animation: popMid 0.65s ease-out 1 both;
        }
        &.err {
            background: var(--sf-err);
            color: #2a0308;
            left: 22%;
        }
    }
    @keyframes pop {
        0% { transform: translateY(6px) scale(0.6); opacity: 0; }
        30% { transform: translateY(0) scale(1.1); opacity: 1; }
        100% { transform: translateY(-8px) scale(1); opacity: 0; }
    }
    @keyframes popMid {
        0% { transform: translateX(-50%) translateY(6px) scale(0.6); opacity: 0; }
        30% { transform: translateX(-50%) translateY(0) scale(1.1); opacity: 1; }
        100% { transform: translateX(-50%) translateY(-8px) scale(1); opacity: 0; }
    }
    .star {
        position: absolute;
        width: 24px;
        height: 24px;
        animation: burst 0.22s ease-out 1 both;
        line {
            stroke: var(--sf-gold);
            stroke-width: 2;
            stroke-linecap: round;
        }
    }
    @keyframes burst {
        0% { transform: scale(0.4); opacity: 1; }
        100% { transform: scale(1.15); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
        .badge {
            animation: none;
            opacity: 1;
        }
        .star {
            display: none;
        }
    }
</style>
