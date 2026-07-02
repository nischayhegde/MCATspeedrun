<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    // One pixel-art fighter. `sub` is this fighter's own action.
    import type { Sub } from "./boxer";

    export let variant: "user" | "opp" = "user";
    export let facing: "right" | "left" = "right";
    export let scale = 1;
    export let sub: Sub = "idle";

    $: mirror = facing === "left" ? -1 : 1;
</script>

<div class="wrap" style="transform: scale({scale}) scaleX({mirror});">
    <div class="fig {sub}" class:opp={variant === "opp"}>
        <div class="rope"></div>
        <div class="leg left"></div>
        <div class="leg right"></div>
        <div class="trunks"></div>
        <div class="torso"></div>
        <div class="arm-back"></div>
        <div class="head"></div>
        <div class="eye"></div>
        <div class="band"></div>
        <div class="glove back"></div>
        <div class="glove front"></div>
        <div class="flash"></div>
    </div>
</div>

<style>
    .wrap {
        width: 74px;
        height: 124px;
        transform-origin: bottom center;
    }
    .fig {
        position: relative;
        width: 74px;
        height: 124px;
        transform-origin: bottom center;
        /* hero: crimson trunks, gold band, red gloves */
        --skin: #e0b088;
        --trunks: #c81e2c;
        --accent: #f5c451;
        --glove: #e11d2f;
        --dark: #1a1f2b;
    }
    .fig.opp {
        /* opponent: muted gunmetal so the hero pops */
        --skin: #9c7a58;
        --trunks: #2c3444;
        --accent: #566073;
        --glove: #40485a;
        --dark: #171c26;
    }

    .fig > div {
        position: absolute;
        image-rendering: pixelated;
    }

    .leg {
        width: 14px;
        height: 34px;
        bottom: 0;
        background: var(--dark);
        border: 2px solid #05070c;
    }
    .leg.left {
        left: 18px;
    }
    .leg.right {
        left: 42px;
    }
    .trunks {
        width: 46px;
        height: 24px;
        bottom: 28px;
        left: 14px;
        background: var(--trunks);
        border: 2px solid #05070c;
    }
    .torso {
        width: 40px;
        height: 34px;
        bottom: 48px;
        left: 17px;
        background: var(--skin);
        border: 2px solid #05070c;
    }
    .arm-back {
        width: 12px;
        height: 30px;
        bottom: 50px;
        left: 10px;
        background: var(--skin);
        border: 2px solid #05070c;
    }
    .head {
        width: 26px;
        height: 26px;
        bottom: 84px;
        left: 24px;
        background: var(--skin);
        border: 2px solid #05070c;
    }
    .eye {
        width: 5px;
        height: 6px;
        bottom: 96px;
        left: 42px;
        background: #05070c;
    }
    .band {
        width: 30px;
        height: 8px;
        bottom: 102px;
        left: 22px;
        background: var(--accent);
        border: 2px solid #05070c;
    }
    .glove {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--glove);
        border: 2px solid #05070c;
        box-shadow: inset -2px -2px 0 rgba(0, 0, 0, 0.18);
    }
    .glove.back {
        bottom: 48px;
        left: 8px;
    }
    .glove.front {
        bottom: 62px;
        left: 46px;
    }
    .rope {
        width: 78px;
        height: 118px;
        left: -2px;
        bottom: -2px;
        border: 3px solid transparent;
        border-radius: 50%;
        opacity: 0;
    }
    .flash {
        inset: 0;
        width: 74px;
        height: 124px;
        background: radial-gradient(
            circle at 60% 70%,
            rgba(255, 80, 80, 0.5),
            transparent 60%
        );
        opacity: 0;
    }

    /* ---- animations -------------------------------------------------------- */
    .fig.idle {
        animation: bob 2.6s ease-in-out infinite;
    }
    @keyframes bob {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-3px);
        }
    }

    /* ready: subtle bob with gloves raised into a guard */
    .fig.ready {
        animation: bob 2.9s ease-in-out infinite;
    }
    .fig.ready .glove.front {
        transform: translate(-4px, 16px);
    }
    .fig.ready .glove.back {
        transform: translate(9px, 14px);
    }

    .fig.jumprope {
        animation: hop 0.52s ease-in-out infinite;
    }
    @keyframes hop {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-9px);
        }
    }
    .fig.jumprope .rope {
        opacity: 1;
        border-top-color: #cfd8e6;
        border-bottom-color: #cfd8e6;
        animation: rope 0.52s linear infinite;
    }
    @keyframes rope {
        0% {
            transform: scaleY(1);
        }
        50% {
            transform: scaleY(-1);
        }
        100% {
            transform: scaleY(1);
        }
    }

    .fig.punch {
        animation: lunge 0.45s ease-out 1;
    }
    @keyframes lunge {
        0% {
            transform: translateX(0);
        }
        35% {
            transform: translateX(8px);
        }
        100% {
            transform: translateX(0);
        }
    }
    .fig.punch .glove.front {
        animation: jab 0.45s ease-out 1;
    }
    @keyframes jab {
        0% {
            transform: translate(0, 0) scale(1);
        }
        35% {
            transform: translate(30px, -4px) scale(1.25);
        }
        100% {
            transform: translate(0, 0) scale(1);
        }
    }

    /* ---- heavy-bag punches: four visually distinct strikes ---------------- */
    /* jab: quick, snappy lead-hand straight */
    .fig.jab {
        animation: leanJab 0.34s ease-out 1;
    }
    @keyframes leanJab {
        0%,
        100% {
            transform: translateX(0);
        }
        45% {
            transform: translateX(5px);
        }
    }
    .fig.jab .glove.front {
        animation: jabG 0.34s ease-out 1;
    }
    @keyframes jabG {
        0%,
        100% {
            transform: translate(0, 0) scale(1);
        }
        45% {
            transform: translate(34px, -2px) scale(1.2);
        }
    }

    /* cross: rear-hand power straight, big hip rotation, reaches across */
    .fig.cross {
        animation: leanCross 0.5s ease-out 1;
    }
    @keyframes leanCross {
        0%,
        100% {
            transform: translateX(0) rotate(0);
        }
        50% {
            transform: translateX(9px) rotate(4deg);
        }
    }
    .fig.cross .glove.back {
        z-index: 5;
        animation: crossG 0.5s ease-out 1;
    }
    @keyframes crossG {
        0%,
        100% {
            transform: translate(0, 0) scale(1);
        }
        50% {
            transform: translate(52px, 12px) scale(1.28);
        }
    }
    .fig.cross .glove.front {
        animation: crossGuard 0.5s ease-out 1;
    }
    @keyframes crossGuard {
        0%,
        100% {
            transform: translate(0, 0);
        }
        50% {
            transform: translate(-4px, 6px);
        }
    }

    /* hook: lead glove winds up and swings across in an arc */
    .fig.hook {
        animation: leanHook 0.52s ease-out 1;
    }
    @keyframes leanHook {
        0%,
        100% {
            transform: rotate(0);
        }
        30% {
            transform: rotate(-5deg);
        }
        58% {
            transform: rotate(7deg);
        }
    }
    .fig.hook .glove.front {
        animation: hookG 0.52s ease-out 1;
    }
    @keyframes hookG {
        0%,
        100% {
            transform: translate(0, 0) rotate(0) scale(1);
        }
        30% {
            transform: translate(4px, -14px) rotate(-22deg) scale(1.08);
        }
        60% {
            transform: translate(30px, -6px) rotate(26deg) scale(1.28);
        }
    }

    /* uppercut: body dips then springs, lead glove rises from low */
    .fig.uppercut {
        animation: dipUpper 0.55s ease-out 1;
    }
    @keyframes dipUpper {
        0%,
        100% {
            transform: translateY(0);
        }
        25% {
            transform: translateY(4px);
        }
        58% {
            transform: translateY(-4px);
        }
    }
    .fig.uppercut .glove.front {
        animation: upperG 0.55s ease-out 1;
    }
    @keyframes upperG {
        0%,
        100% {
            transform: translate(0, 0) scale(1);
        }
        25% {
            transform: translate(6px, 10px) scale(1.05);
        }
        62% {
            transform: translate(26px, -34px) scale(1.3);
        }
    }

    .fig.block .glove.front {
        animation: guardF 0.6s ease-out 1;
    }
    @keyframes guardF {
        0% {
            transform: translate(0, 0);
        }
        25%,
        75% {
            transform: translate(-8px, 22px);
        }
        100% {
            transform: translate(0, 0);
        }
    }
    .fig.block .glove.back {
        animation: guardB 0.6s ease-out 1;
    }
    @keyframes guardB {
        0% {
            transform: translate(0, 0);
        }
        25%,
        75% {
            transform: translate(14px, 24px);
        }
        100% {
            transform: translate(0, 0);
        }
    }

    .fig.hit {
        animation: recoil 0.55s ease-out 1;
    }
    @keyframes recoil {
        0% {
            transform: translateX(0) rotate(0);
        }
        20% {
            transform: translateX(-9px) rotate(-7deg);
        }
        55% {
            transform: translateX(4px) rotate(3deg);
        }
        100% {
            transform: translateX(0) rotate(0);
        }
    }
    .fig.hit .flash {
        animation: flash 0.55s ease-out 1;
    }
    @keyframes flash {
        0% {
            opacity: 0;
        }
        25% {
            opacity: 1;
        }
        100% {
            opacity: 0;
        }
    }

    /* Respect reduced-motion: hold a calm guard pose, no looping/among motion. */
    @media (prefers-reduced-motion: reduce) {
        .fig,
        .fig * {
            animation: none !important;
        }
        .fig .glove.front {
            transform: translate(-4px, 16px);
        }
        .fig .glove.back {
            transform: translate(9px, 14px);
        }
        .fig.jumprope .rope {
            opacity: 0;
        }
    }
</style>
