<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    export let image = "";
    export let front = "";
    export let alt = "question";
    export let center = false;
</script>

<div class="card question">
    {#if image}
        <div class="qimg"><img src={image} {alt} /></div>
    {:else if front}
        <div class="qtext" class:center><p class="stem">{front}</p></div>
    {/if}
</div>

<style lang="scss">
    .card {
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow: hidden;
        background: var(--canvas-elevated);
        border: 1px solid var(--border);
        border-radius: var(--sf-r-md);
        padding: 1rem;
        box-shadow: var(--sf-shadow-1);
    }
    .qtext,
    .qimg {
        flex: 1 1 auto;
        min-height: 0;
        align-self: stretch;
        overflow: auto;
    }
    .qtext.center {
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
    }
    .stem {
        margin: 0;
        white-space: pre-wrap;
        font-size: 17px;
        line-height: 1.6;
    }
    .qimg img {
        display: block;
        width: 100%;
        height: auto;
        margin: 0 auto;
        border-radius: var(--sf-r-sm);
        background: #fff;
    }
</style>
