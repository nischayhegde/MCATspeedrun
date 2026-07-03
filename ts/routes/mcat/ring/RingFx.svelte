<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

Ring-side FX overlay: the pop badge (POW!/GOOD CALL!/OOF!) rendered as a
broadcast chyron, plus a layered impact burst and optional dust/sweat FX.
Purely cosmetic; freezes under reduced-motion.
-->
<script lang="ts">
    export let badge: { text: string; tone: "gold" | "steel" | "err" } | null = null;
    export let badgeTrigger = 0;
    export let impact: { x: number; y: number } | null = null;
    export let dust = false;
    export let dustTrigger = 0;
    export let sweat = false;
    export let sweatTrigger = 0;
</script>

{#key badgeTrigger}
    {#if badge}
        <div class="chyron {badge.tone}">
            <span class="chyron-bar"></span>
            <span class="chyron-text">{badge.text}</span>
        </div>
    {/if}
{/key}
{#key impact ? `${impact.x}-${impact.y}` : "none"}
    {#if impact}
        <svg
            class="burst"
            style="left: {impact.x}%; top: {impact.y}%;"
            viewBox="-16 -16 32 32"
        >
            <circle class="burst-flash" r="7" />
            <polygon
                class="burst-shard"
                points="0,-13 3,-3 13,0 3,3 0,13 -3,3 -13,0 -3,-3"
            />
            {#each [0, 60, 120, 180, 240, 300] as a (a)}
                <line
                    class="burst-spoke"
                    x1={7 * Math.cos((a * Math.PI) / 180)}
                    y1={7 * Math.sin((a * Math.PI) / 180)}
                    x2={14 * Math.cos((a * Math.PI) / 180)}
                    y2={14 * Math.sin((a * Math.PI) / 180)}
                />
            {/each}
        </svg>
    {/if}
{/key}
{#key dustTrigger}
    {#if dust}
        <svg class="dust" viewBox="0 0 40 20">
            <circle class="mote" cx="8" cy="16" r="2.4" />
            <circle class="mote" cx="20" cy="14" r="1.8" />
            <circle class="mote" cx="30" cy="17" r="2.1" />
        </svg>
    {/if}
{/key}
{#key sweatTrigger}
    {#if sweat}
        <svg class="sweat" viewBox="0 0 40 40">
            <path class="drop" d="M 8 4 Q 6 10 8 14 Q 10 10 8 4 Z" />
            <path class="drop" d="M 22 2 Q 20 9 22 13 Q 24 9 22 2 Z" />
            <path class="drop" d="M 32 6 Q 30 11 32 15 Q 34 11 32 6 Z" />
        </svg>
    {/if}
{/key}

<style lang="scss">
    .chyron {
        position: absolute;
        top: 12%;
        display: flex;
        align-items: center;
        gap: 4px;
        font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
        font-weight: 800;
        font-style: italic;
        font-size: 12px;
        letter-spacing: 0.03em;
        padding: 3px 10px 3px 6px;
        clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
        animation: chyron-in 0.65s ease-out 1 both;
        &.gold {
            background: linear-gradient(120deg, #ffe9ad, #f5c451 60%, #a3792b);
            color: #3a2a00;
            right: 22%;
        }
        &.steel {
            background: linear-gradient(120deg, #aab2c0, #566073 60%, #333a47);
            color: #0a0e16;
            left: 50%;
            transform: translateX(-50%);
            animation-name: chyron-in-mid;
        }
        &.err {
            background: linear-gradient(120deg, #ff9aa3, #ff5d6c 60%, #8c1019);
            color: #2a0308;
            left: 22%;
        }
    }
    .chyron-bar {
        width: 3px;
        align-self: stretch;
        background: rgb(0 0 0 / 35%);
    }
    @keyframes chyron-in {
        0% {
            transform: translateX(12px) scaleX(0.7);
            opacity: 0;
        }
        30% {
            transform: translateX(0) scaleX(1.05);
            opacity: 1;
        }
        100% {
            transform: translateX(0) scaleX(1);
            opacity: 0;
        }
    }
    @keyframes chyron-in-mid {
        0% {
            transform: translateX(-50%) translateY(6px);
            opacity: 0;
        }
        30% {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        100% {
            transform: translateX(-50%) translateY(0);
            opacity: 0;
        }
    }
    .burst {
        position: absolute;
        width: 34px;
        height: 34px;
        margin: -17px 0 0 -17px;
        animation: burst-pop 0.24s ease-out 1 both;
    }
    .burst-flash {
        fill: #fff;
        opacity: 0.9;
    }
    .burst-shard {
        fill: var(--sf-gold);
        stroke: #05070c;
        stroke-width: 1;
    }
    .burst-spoke {
        stroke: var(--sf-gold);
        stroke-width: 2;
        stroke-linecap: round;
    }
    @keyframes burst-pop {
        0% {
            transform: scale(0.3);
            opacity: 1;
        }
        100% {
            transform: scale(1.2);
            opacity: 0;
        }
    }
    .dust {
        position: absolute;
        left: 50%;
        bottom: 6%;
        width: 40px;
        height: 20px;
        transform: translateX(-50%);
        animation: dust-rise 0.5s ease-out 1 both;
    }
    .dust .mote {
        fill: rgb(210 200 180 / 55%);
    }
    @keyframes dust-rise {
        0% {
            transform: translateX(-50%) translateY(4px);
            opacity: 0;
        }
        30% {
            opacity: 0.8;
        }
        100% {
            transform: translateX(-50%) translateY(-10px);
            opacity: 0;
        }
    }
    .sweat {
        position: absolute;
        top: 20%;
        left: 50%;
        width: 40px;
        height: 40px;
        transform: translateX(-50%);
        animation: sweat-fly 0.4s ease-out 1 both;
    }
    .sweat .drop {
        fill: #bcd8ff;
        opacity: 0.85;
    }
    @keyframes sweat-fly {
        0% {
            transform: translateX(-50%) translateY(0) scale(0.6);
            opacity: 0;
        }
        40% {
            opacity: 0.9;
        }
        100% {
            transform: translateX(-50%) translateY(-14px) scale(1);
            opacity: 0;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .chyron {
            animation: none;
            opacity: 1;
        }
        .burst,
        .dust,
        .sweat {
            display: none;
        }
    }
</style>
