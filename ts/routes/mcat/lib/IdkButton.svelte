<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import KeyHint from "./KeyHint.svelte";

    const dispatch = createEventDispatcher();
    export let disabled = false;
    export let selected = false;
</script>

<button class="idk" class:selected {disabled} on:click={() => dispatch("choose")}>
    I don't know <span class="hint"><KeyHint key="0" /></span>
</button>

<style lang="scss">
    @use "./mixins" as sf;
    .idk {
        flex-shrink: 0;
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.55rem 0.8rem;
        border: 1px dashed var(--border);
        border-radius: var(--sf-r-sm);
        background: none;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;
        font-weight: 600;
        transition: border-color 0.12s ease, background 0.12s ease, opacity 0.12s ease;
        @include sf.focusable;
        &:hover:not(:disabled) {
            opacity: 1;
            border-color: var(--sf-steel);
            background: color-mix(in srgb, var(--sf-steel) 12%, transparent);
        }
        &:disabled {
            cursor: default;
        }
        &.selected {
            border-style: solid;
            border-color: var(--sf-steel);
            background: color-mix(in srgb, var(--sf-steel) 16%, transparent);
            opacity: 1;
        }
    }
</style>
