<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    export let key: string;
</script>

<kbd>{key}</kbd>

<style lang="scss">
    kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border: 1px solid var(--sf-steel);
        border-radius: 4px;
        font-family: ui-monospace, Consolas, monospace;
        font-size: 11px;
        line-height: 1;
        color: var(--sf-dim);
        background: none;
    }
</style>
