<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

Standalone heavy bag. Idle sway loops; each `swingTrigger` bump replays the
swing named by `swing` (jab/cross/hook/uppercut). Ported from the old
Boxer.svelte bag — the keyframe values already read well.
-->
<script lang="ts">
    export let swing: string | null = null;
    export let swingTrigger = 0;
</script>

{#key swingTrigger}
    <div class="bag-rig {swing ? 'swing-bag-' + swing : 'idle'}" aria-hidden="true">
        <div class="bag-strap"></div>
        <div class="bag"></div>
    </div>
{/key}

<style lang="scss">
    .bag-rig {
        position: absolute;
        top: 8%;
        left: 50%;
        width: 34px;
        height: 80%;
        transform: translateX(-50%);
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
            transform: translateX(-50%) rotate(-1.5deg);
        }
        50% {
            transform: translateX(-50%) rotate(1.5deg);
        }
    }

    .bag-rig.swing-bag-jab {
        animation: bagJab 0.6s ease-out 1;
    }
    @keyframes bagJab {
        0% {
            transform: translateX(-50%) rotate(0);
        }
        20% {
            transform: translateX(-50%) rotate(8deg);
        }
        48% {
            transform: translateX(-50%) rotate(-4deg);
        }
        72% {
            transform: translateX(-50%) rotate(2deg);
        }
        100% {
            transform: translateX(-50%) rotate(0);
        }
    }

    .bag-rig.swing-bag-cross {
        animation: bagCross 0.85s ease-out 1;
    }
    @keyframes bagCross {
        0% {
            transform: translateX(-50%) rotate(0);
        }
        18% {
            transform: translateX(-50%) rotate(15deg);
        }
        44% {
            transform: translateX(-50%) rotate(-9deg);
        }
        66% {
            transform: translateX(-50%) rotate(5deg);
        }
        85% {
            transform: translateX(-50%) rotate(-2deg);
        }
        100% {
            transform: translateX(-50%) rotate(0);
        }
    }

    .bag-rig.swing-bag-hook {
        animation: bagHook 0.85s ease-out 1;
    }
    @keyframes bagHook {
        0% {
            transform: translateX(-50%) rotate(0);
        }
        22% {
            transform: translateX(calc(-50% + 5px)) rotate(12deg);
        }
        52% {
            transform: translateX(calc(-50% - 3px)) rotate(-8deg);
        }
        78% {
            transform: translateX(calc(-50% + 1px)) rotate(3deg);
        }
        100% {
            transform: translateX(-50%) rotate(0);
        }
    }

    .bag-rig.swing-bag-uppercut {
        animation: bagUpper 0.8s ease-out 1;
    }
    @keyframes bagUpper {
        0% {
            transform: translateX(-50%) translateY(0) rotate(0);
        }
        22% {
            transform: translateX(-50%) translateY(-9px) rotate(3deg);
        }
        50% {
            transform: translateX(-50%) translateY(0) rotate(-3deg);
        }
        76% {
            transform: translateX(-50%) translateY(-3px) rotate(1deg);
        }
        100% {
            transform: translateX(-50%) translateY(0) rotate(0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .bag-rig {
            animation: none !important;
        }
    }
</style>
