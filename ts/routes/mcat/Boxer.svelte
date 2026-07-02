<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

Ambient, cosmetic "fight night" ring. Purely decorative: it never blocks study
and can be hidden. Its states map 1:1 to the grading signals (see PRD gamification).
-->
<script lang="ts">
    import { onMount } from "svelte";

    import BoxerFigure from "./BoxerFigure.svelte";
    import type { Sub, BoxerAction } from "./boxer";
    import { PUNCHES, PUNCH_SFX } from "./boxer";

    export let action: BoxerAction = "ready";
    // Bump to replay a one-shot reaction (punch/block/hit, or a bag punch).
    export let trigger = 0;
    // Hero grows with readiness; opponent grows with question toughness.
    export let userScale = 1;
    export let oppScale = 1;
    export let height = 118;
    // "spar" = two fighters (study/results). "bag" = hero works a heavy bag,
    // landing a different punch on every `trigger` bump (diagnostic exam).
    export let mode: "spar" | "bag" = "spar";

    const BASE = 0.64;
    const clamp = (n: number, lo: number, hi: number): number =>
        Math.max(lo, Math.min(hi, n));

    // The lone hero on the bag reads better a touch larger than a sparring pair.
    $: userFig = clamp(userScale, 0.85, 1.2) * (mode === "bag" ? 0.78 : BASE);
    $: oppFig = clamp(oppScale, 0.8, 1.35) * BASE;

    const MAP: Record<BoxerAction, { user: Sub; opp: Sub }> = {
        idle: { user: "idle", opp: "idle" },
        ready: { user: "ready", opp: "ready" },
        jumprope: { user: "jumprope", opp: "idle" },
        punch: { user: "punch", opp: "hit" },
        block: { user: "block", opp: "punch" },
        hit: { user: "hit", opp: "punch" },
    };
    $: subs = MAP[action] ?? MAP.idle;

    // Heavy-bag: cycle the punch list so each answer looks different.
    $: punchIdx = (((trigger - 1) % PUNCHES.length) + PUNCHES.length) % PUNCHES.length;
    $: punch = PUNCHES[punchIdx];
    // Before the first punch, hold a live guard; after, replay the cycled punch.
    $: userSub = mode === "bag" ? (trigger > 0 ? punch : "ready") : subs.user;

    $: badge =
        mode === "bag"
            ? trigger > 0
                ? { text: PUNCH_SFX[punchIdx], cls: "good", side: "opp" }
                : null
            : action === "punch"
              ? { text: "POW!", cls: "good", side: "opp" }
              : action === "block"
                ? { text: "BLOCK", cls: "warn", side: "mid" }
                : action === "hit"
                  ? { text: "OUCH!", cls: "bad", side: "user" }
                  : null;

    let hidden = false;
    onMount(() => {
        hidden = localStorage.getItem("sf-boxer-hidden") === "1";
    });
    function toggle(): void {
        hidden = !hidden;
        localStorage.setItem("sf-boxer-hidden", hidden ? "1" : "0");
    }
</script>

{#if hidden}
    <div class="sf-boxer-collapsed">
        <button class="sf-show" on:click={toggle} title="Show the ring">
            <span class="glove">🥊</span> Show ring
        </button>
    </div>
{:else}
    <div class="sf-ring" style="height:{height}px" aria-hidden="true">
        <div class="ropes"></div>
        <div class="floor"></div>
        <div class="post l"></div>
        <div class="post r"></div>

        <button class="sf-hide" on:click={toggle} title="Hide the ring">✕</button>

        {#key trigger}
            <div class="corner user" class:bagpose={mode === "bag"}>
                <BoxerFigure
                    variant="user"
                    facing="right"
                    scale={userFig}
                    sub={userSub}
                />
            </div>

            {#if mode === "bag"}
                <div
                    class="bag-rig {trigger > 0 ? 'swing-' + punch : 'idle'}"
                    style="--fig: {userFig}"
                >
                    <div class="bag-strap"></div>
                    <div class="bag"></div>
                </div>
            {:else}
                <div class="corner opp">
                    <BoxerFigure
                        variant="opp"
                        facing="left"
                        scale={oppFig}
                        sub={subs.opp}
                    />
                </div>
            {/if}

            {#if badge}
                <div class="badge {badge.cls} {badge.side}">{badge.text}</div>
            {/if}
        {/key}
    </div>
{/if}

<style>
    .sf-ring {
        position: relative;
        flex-shrink: 0;
        width: 100%;
        border-radius: 14px;
        overflow: hidden;
        background:
            radial-gradient(
                130% 96% at 50% -24%,
                rgba(245, 196, 81, 0.1),
                transparent 55%
            ),
            linear-gradient(180deg, #10131a 0%, #0b0e14 100%);
        border: 1px solid var(--sf-border, #2a3242);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.03),
            0 10px 26px rgba(0, 0, 0, 0.4);
    }
    .floor {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 42%;
        background: repeating-linear-gradient(
            90deg,
            #12161f 0 26px,
            #0f131b 26px 52px
        );
        border-top: 2px solid #262d3b;
        box-shadow: inset 0 10px 22px rgba(0, 0, 0, 0.45);
    }
    .ropes {
        position: absolute;
        left: 0;
        right: 0;
        top: 16%;
        height: 40%;
        background:
            linear-gradient(
                transparent 0 34%,
                rgba(245, 196, 81, 0.16) 34% 37%,
                transparent 37%
            ),
            linear-gradient(
                transparent 0 66%,
                rgba(225, 29, 47, 0.16) 66% 69%,
                transparent 69%
            );
    }
    .post {
        position: absolute;
        top: 10%;
        bottom: 16%;
        width: 5px;
        border-radius: 3px;
        background: linear-gradient(180deg, #2c3444, #1b2130);
        box-shadow: 0 0 0 1px #05070c;
    }
    .post::before {
        content: "";
        position: absolute;
        top: -4px;
        left: -2px;
        right: -2px;
        height: 6px;
        border-radius: 3px;
        background: var(--sf-gold, #f5c451);
        box-shadow: 0 0 0 1px #05070c;
    }
    .post.l {
        left: 10px;
    }
    .post.r {
        right: 10px;
    }

    .corner {
        position: absolute;
        bottom: 7%;
    }
    .corner.user {
        left: 16%;
    }
    .corner.opp {
        right: 16%;
    }

    /* Heavy-bag layout: hero shifts toward the bag and keeps a live bob. */
    .corner.user.bagpose {
        left: 34%;
        animation: cornerBob 2.6s ease-in-out infinite;
    }
    @keyframes cornerBob {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-2px);
        }
    }

    /* ---- heavy bag ------------------------------------------------------- */
    .bag-rig {
        position: absolute;
        top: 8%;
        left: 47%;
        width: 34px;
        height: 80%;
        transform-origin: top center;
    }
    .bag-rig.idle {
        animation: bagSway 4.5s ease-in-out infinite;
    }
    .bag-strap {
        position: absolute;
        top: 0;
        left: 50%;
        width: 4px;
        height: 18%;
        transform: translateX(-50%);
        background: linear-gradient(180deg, #4a5262, #2b3240);
        box-shadow: 0 0 0 1px #05070c;
    }
    .bag {
        position: absolute;
        top: 16%;
        left: 50%;
        transform: translateX(-50%);
        width: 32px;
        height: 74%;
        border-radius: 13px / 18px;
        background: linear-gradient(180deg, #c94a2f 0%, #9c331d 55%, #7a2616 100%);
        border: 2px solid #05070c;
        box-shadow:
            inset -5px 0 0 rgba(0, 0, 0, 0.22),
            inset 5px 0 0 rgba(255, 255, 255, 0.08);
    }
    /* top cap + a couple of seams so it reads as a heavy bag */
    .bag::before {
        content: "";
        position: absolute;
        top: -4px;
        left: -2px;
        right: -2px;
        height: 8px;
        border-radius: 4px;
        background: var(--sf-gold, #f5c451);
        box-shadow: 0 0 0 1px #05070c;
    }
    .bag::after {
        content: "";
        position: absolute;
        left: 3px;
        right: 3px;
        top: 42%;
        height: 2px;
        background: rgba(0, 0, 0, 0.28);
        box-shadow: 0 8px 0 rgba(0, 0, 0, 0.28);
    }

    @keyframes bagSway {
        0%,
        100% {
            transform: rotate(-1.5deg);
        }
        50% {
            transform: rotate(1.5deg);
        }
    }
    .bag-rig.swing-jab {
        animation: bagJab 0.6s ease-out 1;
    }
    @keyframes bagJab {
        0% {
            transform: rotate(0);
        }
        20% {
            transform: rotate(8deg);
        }
        48% {
            transform: rotate(-4deg);
        }
        72% {
            transform: rotate(2deg);
        }
        100% {
            transform: rotate(0);
        }
    }
    .bag-rig.swing-cross {
        animation: bagCross 0.85s ease-out 1;
    }
    @keyframes bagCross {
        0% {
            transform: rotate(0);
        }
        18% {
            transform: rotate(15deg);
        }
        44% {
            transform: rotate(-9deg);
        }
        66% {
            transform: rotate(5deg);
        }
        85% {
            transform: rotate(-2deg);
        }
        100% {
            transform: rotate(0);
        }
    }
    .bag-rig.swing-hook {
        animation: bagHook 0.85s ease-out 1;
    }
    @keyframes bagHook {
        0% {
            transform: rotate(0) translateX(0);
        }
        22% {
            transform: rotate(12deg) translateX(5px);
        }
        52% {
            transform: rotate(-8deg) translateX(-3px);
        }
        78% {
            transform: rotate(3deg) translateX(1px);
        }
        100% {
            transform: rotate(0) translateX(0);
        }
    }
    .bag-rig.swing-uppercut {
        animation: bagUpper 0.8s ease-out 1;
    }
    @keyframes bagUpper {
        0% {
            transform: translateY(0) rotate(0);
        }
        22% {
            transform: translateY(-9px) rotate(3deg);
        }
        50% {
            transform: translateY(0) rotate(-3deg);
        }
        76% {
            transform: translateY(-3px) rotate(1deg);
        }
        100% {
            transform: translateY(0) rotate(0);
        }
    }

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
        animation: pop 0.65s ease-out 1;
    }
    .badge.good {
        background: var(--sf-gold, #f5c451);
        color: #3a2a00;
        right: 22%;
    }
    .badge.warn {
        background: #566073;
        color: #0a0e16;
        left: 50%;
        transform: translateX(-50%);
    }
    .badge.bad {
        background: var(--sf-red, #e11d2f);
        color: #2a0308;
        left: 22%;
    }
    @keyframes pop {
        0% {
            transform: translateY(6px) scale(0.6);
            opacity: 0;
        }
        30% {
            transform: translateY(0) scale(1.1);
            opacity: 1;
        }
        100% {
            transform: translateY(-8px) scale(1);
            opacity: 0;
        }
    }
    .badge.warn {
        animation: popMid 0.65s ease-out 1;
    }
    @keyframes popMid {
        0% {
            transform: translateX(-50%) translateY(6px) scale(0.6);
            opacity: 0;
        }
        30% {
            transform: translateX(-50%) translateY(0) scale(1.1);
            opacity: 1;
        }
        100% {
            transform: translateX(-50%) translateY(-8px) scale(1);
            opacity: 0;
        }
    }

    .sf-hide {
        position: absolute;
        top: 6px;
        right: 8px;
        z-index: 2;
        width: 20px;
        height: 20px;
        border: none;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.06);
        color: var(--sf-dim, #9aa4b6);
        font-size: 11px;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease;
    }
    .sf-ring:hover .sf-hide {
        opacity: 1;
    }
    .sf-hide:hover {
        color: var(--sf-text, #eef1f6);
        background: rgba(255, 255, 255, 0.12);
    }

    .sf-boxer-collapsed {
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
    }
    .sf-show {
        border: 1px solid var(--sf-border, #2a3242);
        background: none;
        color: var(--sf-dim, #9aa4b6);
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.2rem 0.6rem;
        border-radius: 0.5rem;
        cursor: pointer;
    }
    .sf-show:hover {
        color: var(--sf-text, #eef1f6);
        border-color: var(--sf-red, #e11d2f);
    }
    .sf-show .glove {
        filter: grayscale(0.15);
    }

    @media (prefers-reduced-motion: reduce) {
        .badge {
            animation: none !important;
            opacity: 1;
        }
        .bag-rig,
        .corner.user.bagpose {
            animation: none !important;
        }
    }
</style>
