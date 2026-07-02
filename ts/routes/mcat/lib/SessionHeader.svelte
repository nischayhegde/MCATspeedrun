<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();
    export let exitLabel = "Exit";
    export let progress = 0; // 0..1
    export let counter = "";
    export let paceState: "gold" | "steel" | null = null;
    export let timerText = "";
</script>

<header class="progress-row">
    <button class="quit" on:click={() => dispatch("exit")}>{exitLabel}</button>
    <div class="progress-track">
        <div class="progress-fill" style:width={`${progress * 100}%`}></div>
    </div>
    {#if timerText}
        <button
            class="timer"
            title="Click to hide the timer"
            on:click={() => dispatch("timerclick")}
        >
            {#if paceState}<span class="pace {paceState}"></span>{/if}
            {timerText}
        </button>
    {/if}
    <span class="counter">{counter}</span>
</header>

<style lang="scss">
    @use "./mixins" as sf;
    .progress-row {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-height: 30px;
    }
    .quit {
        border: none;
        background: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        @include sf.focusable;
    }
    .progress-track {
        flex: 1;
        height: 0.4rem;
        border-radius: 1rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
        overflow: hidden;
    }
    .progress-fill {
        height: 100%;
        border-radius: 1rem;
        background: linear-gradient(90deg, var(--sf-red-deep), var(--sf-red));
        transition: width 0.2s ease;
    }
    .timer {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: 12px;
        opacity: 0.55;
        color: inherit;
        font-variant-numeric: tabular-nums;
        @include sf.focusable;
    }
    .pace {
        width: 6px;
        height: 6px;
        transform: rotate(45deg);
        &.gold {
            background: var(--sf-gold);
        }
        &.steel {
            background: var(--sf-steel);
        }
    }
    .counter {
        font-size: 0.85rem;
        opacity: 0.7;
        font-variant-numeric: tabular-nums;
    }
</style>
