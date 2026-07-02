<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import type { PageData } from "./$types";
    import DiagnosticPage from "./DiagnosticPage.svelte";

    export let data: PageData;
</script>

<DiagnosticPage items={data.diagnostic.items} before={data.before} />
