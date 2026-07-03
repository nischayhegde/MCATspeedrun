<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import KeyHint from "./KeyHint.svelte";

    const dispatch = createEventDispatcher();

    const LETTERS = ["A", "B", "C", "D"];
    export let choices: string[] = [];
    export let lettersOnly = false;
    export let disabled = false;
    export let graded = false;
    export let chosen: string | null = null;
    export let answer = "";
    export let pending: string | null = null;
    export let collapsed = false;
</script>

<div class="choices" class:letters={lettersOnly} class:collapsed>
    {#each LETTERS as letter, i (letter)}
        <button
            class="choice"
            class:pending={pending === letter}
            class:selected={graded && chosen === letter}
            class:right={graded && chosen !== null && letter === answer}
            class:wrong={graded && chosen === letter && letter !== answer}
            {disabled}
            on:click={() => dispatch("choose", { letter })}
        >
            <span class="letter">{letter}</span>
            {#if graded && chosen !== null && letter === answer}<span class="mark">
                    ✓
                </span>{/if}
            {#if graded && chosen === letter && letter !== answer}<span class="mark">
                    ✗
                </span>{/if}
            {#if !lettersOnly && choices[i] && !collapsed}
                <span class="choice-text">{choices[i]}</span>
            {/if}
            {#if !collapsed && !disabled}<span class="hint">
                    <KeyHint key={letter} />
                </span>{/if}
        </button>
    {/each}
</div>

<style lang="scss">
    @use "./mixins" as sf;
    .choices {
        flex-shrink: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.5rem;
        &.letters,
        &.collapsed {
            grid-template-columns: repeat(4, 1fr);
        }
    }
    .choice {
        /* min-width 0 lets grid tracks shrink below the content's intrinsic
           width, so a long unbreakable token wraps instead of forcing the row
           past the page's hidden x-overflow. */
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 0.8rem;
        border: 1px solid var(--border);
        border-radius: var(--sf-r-sm);
        background: var(--canvas-elevated);
        color: inherit;
        cursor: pointer;
        text-align: left;
        transition:
            border-color 0.12s ease,
            background 0.12s ease;
        @include sf.focusable;
        &:hover:not(:disabled) {
            border-color: var(--sf-gold);
            background: color-mix(in srgb, var(--sf-gold) 7%, transparent);
        }
        &:disabled {
            cursor: default;
        }
    }
    .letters .choice,
    .collapsed .choice {
        justify-content: center;
        font-weight: 800;
    }
    .letters .choice {
        padding: 0.7rem;
        font-size: 1.1rem;
    }
    .collapsed .choice {
        padding: 0.45rem;
    }
    .letter {
        font-weight: 800;
        color: var(--sf-red);
    }
    .choice-text {
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .hint {
        margin-left: auto;
    }
    .choice.pending {
        border-color: var(--sf-gold);
        box-shadow: 0 0 0 2px var(--sf-gold);
    }
    .choice.right {
        border-color: var(--sf-ok);
        background: color-mix(in srgb, var(--sf-ok) 14%, transparent);
        .letter,
        .mark {
            color: var(--sf-ok);
        }
    }
    .choice.wrong {
        border-color: var(--sf-err);
        background: color-mix(in srgb, var(--sf-err) 14%, transparent);
        .letter,
        .mark {
            color: var(--sf-err);
        }
    }
    .mark {
        font-weight: 800;
    }
</style>
