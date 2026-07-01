<script lang="ts">
    // One pixel-art fighter. `sub` is this fighter's own action.
    type Sub = "idle" | "jumprope" | "punch" | "block" | "hit";
    let {
        variant = "user",
        facing = "right",
        scale = 1,
        sub = "idle",
    }: {
        variant?: "user" | "opp";
        facing?: "right" | "left";
        scale?: number;
        sub?: Sub;
    } = $props();

    const mirror = $derived(facing === "left" ? -1 : 1);
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
        --skin: #d7a373;
        --trunks: #2f5bd4;
        --accent: #16d3c6;
        --glove: #16d3c6;
        --dark: #14213a;
    }
    .fig.opp {
        --skin: #c4894f;
        --trunks: #6d0f1e;
        --accent: #ff5d6c;
        --glove: #ff3b30;
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
        border: 2px solid #0a1220;
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
        border: 2px solid #0a1220;
    }
    .torso {
        width: 40px;
        height: 34px;
        bottom: 48px;
        left: 17px;
        background: var(--skin);
        border: 2px solid #0a1220;
    }
    .arm-back {
        width: 12px;
        height: 30px;
        bottom: 50px;
        left: 10px;
        background: var(--skin);
        border: 2px solid #0a1220;
    }
    .head {
        width: 26px;
        height: 26px;
        bottom: 84px;
        left: 24px;
        background: var(--skin);
        border: 2px solid #0a1220;
    }
    .eye {
        width: 5px;
        height: 6px;
        bottom: 96px;
        left: 42px;
        background: #0a1220;
    }
    .band {
        width: 30px;
        height: 8px;
        bottom: 102px;
        left: 22px;
        background: var(--accent);
        border: 2px solid #0a1220;
    }
    .glove {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--glove);
        border: 2px solid #0a1220;
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
            rgba(255, 70, 70, 0.55),
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

    .fig.jumprope {
        animation: hop 0.5s ease-in-out infinite;
    }
    @keyframes hop {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-11px);
        }
    }
    .fig.jumprope .rope {
        opacity: 1;
        border-top-color: #cfd8e6;
        border-bottom-color: #cfd8e6;
        animation: rope 0.5s linear infinite;
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
</style>
