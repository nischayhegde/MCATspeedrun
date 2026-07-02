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
        <div class="ropes" aria-hidden="true"></div>
        <div class="floor" aria-hidden="true"></div>
        <div class="post l" aria-hidden="true"></div>
        <div class="post r" aria-hidden="true"></div>
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
    .floor {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 42%;
        background: repeating-linear-gradient(90deg, #12161f 0 26px, #0f131b 26px 52px);
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
            linear-gradient(transparent 0 34%, rgba(245, 196, 81, 0.16) 34% 37%, transparent 37%),
            linear-gradient(transparent 0 66%, rgba(225, 29, 47, 0.16) 66% 69%, transparent 69%);
    }
    .post {
        position: absolute;
        top: 10%;
        bottom: 16%;
        width: 5px;
        border-radius: 3px;
        background: linear-gradient(180deg, #2c3444, #1b2130);
        box-shadow: 0 0 0 1px #05070c;
        &::before {
            content: "";
            position: absolute;
            top: -4px;
            left: -2px;
            right: -2px;
            height: 6px;
            border-radius: 3px;
            background: var(--sf-gold);
            box-shadow: 0 0 0 1px #05070c;
        }
        &.l {
            left: 10px;
        }
        &.r {
            right: 10px;
        }
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
