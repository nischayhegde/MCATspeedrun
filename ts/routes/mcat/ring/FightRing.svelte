<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

The FightRing strip: reducer-driven exchanges between the hero and an
opponent (spar mode) or a heavy bag (train/bag mode). Purely cosmetic —
never blocks study and can be hidden. Consumes machine.ts's reduce() to
turn FightEvents into scheduled clips, then plays them out on timers.
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";

    import FighterRig from "./FighterRig.svelte";
    import HeavyBag from "./HeavyBag.svelte";
    import RingFx from "./RingFx.svelte";
    import { type FightEvent, initialModel, makePools, reduce, type RingModel } from "./machine";
    import { HERO, type OpponentInstance } from "./roster";

    export let mode: "spar" | "train" | "bag" = "spar";
    export let event: FightEvent | null = null;
    export let heroScale = 1;
    export let heroBulkValue = 0;
    export let opponent: OpponentInstance | null = null;
    export let marquee = "";
    export let showPips = true;
    export let height = 100;

    const pools = makePools(((globalThis.crypto?.getRandomValues(new Uint32Array(1))?.[0]) ?? 12345) >>> 0);

    let model: RingModel = initialModel(mode);

    // The brief's reactive `$: model = mode ? refreshMode(mode) : model` self-
    // references model and would re-run (and reset the in-progress fight) on
    // every model mutation, not just on a real mode change. Track the last
    // seen mode instead and only reset when it actually changes. Authorized
    // mechanical fix — see task-10-report.md.
    let lastMode: typeof mode | null = null;
    $: if (mode !== lastMode) {
        lastMode = mode;
        model = initialModel(mode);
    }

    // executor: reduce on each new event; (re)schedule the queue with timers.
    let heroClip: string | null = null;
    let oppClip: string | null = null;
    let bagSwing: string | null = null;
    let clipTrigger = 0;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let lastTrigger = 0;

    $: if (event && event.trigger !== lastTrigger) {
        lastTrigger = event.trigger;
        model = reduce(model, event, pools);
        run(model);
    }

    function run(m: RingModel): void {
        timers.forEach(clearTimeout);
        timers = [];
        heroClip = oppClip = bagSwing = null;
        clipTrigger += 1;
        for (const s of m.queue) {
            timers.push(
                setTimeout(() => {
                    if (s.who === "hero") {
                        heroClip = s.clip;
                    } else if (s.who === "opp") {
                        oppClip = s.clip;
                    } else {
                        bagSwing = s.clip;
                    }
                    clipTrigger += 1;
                }, s.atMs),
            );
        }
    }
    onDestroy(() => timers.forEach(clearTimeout));

    let hidden = false;
    onMount(() => {
        hidden = localStorage.getItem("sf-boxer-hidden") === "1";
    });
    function toggle(): void {
        hidden = !hidden;
        localStorage.setItem("sf-boxer-hidden", hidden ? "1" : "0");
    }

    $: pips = opponent ? "●".repeat(opponent.tier) + "○".repeat(6 - opponent.tier) : "";
</script>

{#if hidden}
    <div class="sf-boxer-collapsed">
        <button class="sf-show" on:click={toggle}>🥊 Show ring</button>
    </div>
{:else}
    <div class="sf-ring" style="height:{height}px">
        <svg class="dressing" viewBox="0 0 700 110" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <radialGradient id="sf-ring-spot" cx="50%" cy="-10%" r="95%">
                    <stop offset="0" stop-color="#2e2216" />
                    <stop offset="45%" stop-color="#15171d" />
                    <stop offset="100%" stop-color="#08090c" />
                </radialGradient>
                <linearGradient id="sf-ring-floor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#20242f" />
                    <stop offset="1" stop-color="#0a0c10" />
                </linearGradient>
                <linearGradient id="sf-ring-rope-red" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#ff8a7a" />
                    <stop offset="0.5" stop-color="#c81e2c" />
                    <stop offset="1" stop-color="#6e0f16" />
                </linearGradient>
                <linearGradient id="sf-ring-rope-gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#ffe9ad" />
                    <stop offset="0.5" stop-color="#f5c451" />
                    <stop offset="1" stop-color="#a3792b" />
                </linearGradient>
                <linearGradient id="sf-ring-post" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#3a4358" />
                    <stop offset="0.5" stop-color="#1c2230" />
                    <stop offset="1" stop-color="#0c0f16" />
                </linearGradient>
                <filter id="sf-ring-glow"><feGaussianBlur stdDeviation="9" /></filter>
            </defs>
            <rect width="700" height="110" fill="url(#sf-ring-spot)" />
            <g filter="url(#sf-ring-glow)" opacity="0.35">
                <circle cx="90" cy="8" r="14" fill="#f5c451" />
                <circle cx="240" cy="4" r="10" fill="#ff5d6c" />
                <circle cx="470" cy="6" r="12" fill="#f5c451" />
                <circle cx="620" cy="4" r="9" fill="#8fb6ff" />
            </g>
            <rect y="52" width="700" height="58" fill="url(#sf-ring-floor)" />
            <circle cx="350" cy="82" r="20" fill="none" stroke="#f5c451" stroke-width="1.2" opacity="0.22" />
            <text x="350" y="89" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#f5c451" opacity="0.2" font-weight="700">S</text>
            <g stroke="#232834" stroke-width="1" opacity="0.5">
                <line x1="0" y1="62" x2="700" y2="62" />
                <line x1="0" y1="74" x2="700" y2="74" />
                <line x1="0" y1="86" x2="700" y2="86" />
                <line x1="0" y1="98" x2="700" y2="98" />
            </g>
            <ellipse cx="350" cy="66" rx="260" ry="16" fill="#f5c451" opacity="0.09" />
            <rect x="14" y="6" width="10" height="96" rx="4" fill="url(#sf-ring-post)" />
            <rect x="676" y="6" width="10" height="96" rx="4" fill="url(#sf-ring-post)" />
            <circle cx="19" cy="8" r="8" fill="url(#sf-ring-rope-gold)" />
            <circle cx="681" cy="8" r="8" fill="url(#sf-ring-rope-gold)" />
            <path d="M14,20 Q350,32 686,20" fill="none" stroke="url(#sf-ring-rope-gold)" stroke-width="6" stroke-linecap="round" />
            <path d="M14,38 Q350,52 686,38" fill="none" stroke="url(#sf-ring-rope-red)" stroke-width="6" stroke-linecap="round" />
            <path d="M14,56 Q350,70 686,56" fill="none" stroke="url(#sf-ring-rope-gold)" stroke-width="6" stroke-linecap="round" />
        </svg>
        <button class="sf-hide" on:click={toggle} title="Hide the ring">✕</button>

        {#if marquee}
            <div class="marquee">
                {marquee}
                {#if showPips && pips}<span class="pips" title="Difficulty tier {opponent?.tier}/6">{pips}</span>{/if}
            </div>
        {/if}

        <div class="stage shake-{model.shake}" aria-hidden="true">
            <div class="corner user" class:bagpose={mode !== "spar"}>
                <FighterRig
                    spec={HERO}
                    bulk={heroBulkValue}
                    facing="right"
                    scale={heroScale * 0.62}
                    stance={model.heroStance}
                    clip={heroClip}
                    {clipTrigger}
                    on:clipend={() => (heroClip = null)}
                />
            </div>
            {#if mode === "spar" && opponent}
                <div class="corner opp">
                    <FighterRig
                        spec={opponent.species}
                        bulk={opponent.bulk}
                        paletteIndex={opponent.paletteIndex}
                        facing="left"
                        scale={opponent.scale * 0.62}
                        stance={model.oppStance}
                        clip={oppClip}
                        {clipTrigger}
                        on:clipend={() => (oppClip = null)}
                    />
                </div>
            {:else if mode !== "spar"}
                <HeavyBag swing={bagSwing} swingTrigger={clipTrigger} />
            {/if}
            <RingFx badge={model.badge} badgeTrigger={lastTrigger} />
        </div>
    </div>
{/if}

<style lang="scss">
    .sf-ring {
        position: relative;
        flex-shrink: 0;
        width: 100%;
        border-radius: var(--sf-r-lg);
        overflow: hidden;
        background:
            radial-gradient(130% 96% at 50% -24%, rgba(245, 196, 81, 0.1), transparent 55%),
            linear-gradient(180deg, #10131a 0%, #0b0e14 100%);
        border: 1px solid var(--sf-border);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), var(--sf-shadow-2);
    }
    .dressing {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
    }
    .stage {
        position: absolute;
        inset: 0;
    }
    .stage.shake-1 {
        animation: shake1 0.12s ease-out 1;
    }
    .stage.shake-2 {
        animation: shake2 0.16s ease-out 1;
    }
    .stage.shake-3 {
        animation: shake3 0.2s ease-out 1;
    }
    @keyframes shake1 {
        25% {
            transform: translate(1px, -1px);
        }
        75% {
            transform: translate(-1px, 0);
        }
    }
    @keyframes shake2 {
        25% {
            transform: translate(2px, -1px);
        }
        75% {
            transform: translate(-2px, 1px);
        }
    }
    @keyframes shake3 {
        20% {
            transform: translate(3px, -2px);
        }
        60% {
            transform: translate(-3px, 1px);
        }
        85% {
            transform: translate(2px, 0);
        }
    }
    .marquee {
        position: absolute;
        top: 6px;
        left: 12px;
        z-index: 2;
        font-family: ui-monospace, Consolas, monospace;
        font-size: 11px;
        color: var(--sf-dim);
        letter-spacing: 0.04em;
        .pips {
            margin-left: 0.6rem;
            color: var(--sf-gold);
        }
    }
    .corner {
        position: absolute;
        bottom: 6%;
        &.user {
            left: 16%;
        }
        &.opp {
            right: 14%;
        }
        &.user.bagpose {
            left: 34%;
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
        color: var(--sf-dim);
        font-size: 11px;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s ease;
    }
    .sf-ring:hover .sf-hide,
    .sf-hide:focus-visible {
        opacity: 1;
    }
    .sf-hide:hover {
        color: var(--sf-text);
        background: rgba(255, 255, 255, 0.12);
    }
    .sf-hide:focus-visible {
        outline: none;
        box-shadow: var(--sf-focus);
    }
    .sf-boxer-collapsed {
        flex-shrink: 0;
        display: flex;
        justify-content: flex-end;
    }
    .sf-show {
        border: 1px solid var(--sf-border);
        background: none;
        color: var(--sf-dim);
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.2rem 0.6rem;
        border-radius: 0.5rem;
        cursor: pointer;
    }
    .sf-show:hover {
        color: var(--sf-text);
        border-color: var(--sf-red);
        background: color-mix(in srgb, var(--sf-red) 10%, transparent);
    }
    @media (prefers-reduced-motion: reduce) {
        .stage {
            animation: none !important;
        }
    }
</style>
