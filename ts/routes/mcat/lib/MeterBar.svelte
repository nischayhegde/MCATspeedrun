<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    export let value = 0; // 0..1
    export let tone: "red" | "gold" = "red";

    $: pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
</script>

<div
    class="track"
    role="progressbar"
    aria-valuenow={pct}
    aria-valuemin={0}
    aria-valuemax={100}
>
    <div class="fill {tone}" style:width={`${pct}%`}></div>
</div>

<style lang="scss">
    .track {
        flex: 1;
        height: 0.5rem;
        border-radius: 1rem;
        background: color-mix(in srgb, currentColor 12%, transparent);
        overflow: hidden;
    }
    .fill {
        height: 100%;
        border-radius: 1rem;
        &.red {
            background: linear-gradient(90deg, var(--sf-red-deep), var(--sf-red));
        }
        &.gold {
            background: linear-gradient(90deg, #b8860b, var(--sf-gold));
        }
    }
</style>
