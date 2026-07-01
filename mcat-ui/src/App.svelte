<script lang="ts">
    import { store, type Route } from "./lib/store.svelte.ts";
    import Onboarding from "./screens/Onboarding.svelte";
    import Diagnostic from "./screens/Diagnostic.svelte";
    import DiagnosticResults from "./screens/DiagnosticResults.svelte";
    import Dashboard from "./screens/Dashboard.svelte";
    import Review from "./screens/Review.svelte";
    import Feedback from "./screens/Feedback.svelte";
    import TagBrowser from "./screens/TagBrowser.svelte";
    import Settings from "./screens/Settings.svelte";

    const nav: { r: Route; label: string }[] = [
        { r: "onboarding", label: "Onboarding" },
        { r: "diagnostic", label: "Diagnostic" },
        { r: "diagResults", label: "Results" },
        { r: "dashboard", label: "Dashboard" },
        { r: "review", label: "Study" },
        { r: "tagBrowser", label: "Tags" },
        { r: "settings", label: "Settings" },
    ];

    function navClick(r: Route) {
        // "Study" kicks off a fresh interleaved session; others just navigate.
        if (r === "review") store.startSession();
        else store.go(r);
    }
    const studyActive = $derived(
        store.route === "review" || store.route === "feedback",
    );
</script>

<div class="shell">
    <header class="nav">
        <button class="brand mono" onclick={() => store.go("dashboard")}>
            MCAT
            <span>SPEEDRUN</span>
        </button>
        <nav class="links">
            {#each nav as n (n.r)}
                <button
                    class="lnk"
                    class:active={n.r === "review" ? studyActive : store.route === n.r}
                    onclick={() => navClick(n.r)}
                >
                    {n.label}
                </button>
            {/each}
        </nav>
        <div class="devtag">prototype</div>
    </header>

    <div class="content">
        {#if store.route === "onboarding"}
            <Onboarding />
        {:else if store.route === "diagnostic"}
            <Diagnostic />
        {:else if store.route === "diagResults"}
            <DiagnosticResults />
        {:else if store.route === "dashboard"}
            <Dashboard />
        {:else if store.route === "review"}
            <Review />
        {:else if store.route === "feedback"}
            <Feedback />
        {:else if store.route === "tagBrowser"}
            <TagBrowser />
        {:else if store.route === "settings"}
            <Settings />
        {/if}
    </div>
</div>

<style>
    .shell {
        height: 100vh;
        display: flex;
        flex-direction: column;
    }
    .nav {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 10px 18px;
        background: rgba(9, 14, 26, 0.85);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--border);
        position: sticky;
        top: 0;
        z-index: 10;
    }
    .brand {
        background: none;
        border: none;
        color: var(--text);
        font-weight: 800;
        font-size: 16px;
        letter-spacing: 0.03em;
    }
    .brand span {
        color: var(--accent);
        margin-left: 4px;
    }
    .links {
        display: flex;
        gap: 2px;
        flex-wrap: wrap;
        flex: 1;
    }
    .lnk {
        background: none;
        border: none;
        color: var(--text-faint);
        font-size: 13px;
        font-weight: 600;
        padding: 6px 10px;
        border-radius: 8px;
    }
    .lnk:hover {
        color: var(--text);
        background: var(--bg-elev-2);
    }
    .lnk.active {
        color: var(--accent);
        background: var(--bg-elev-2);
    }
    .devtag {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--text-faint);
        border: 1px solid var(--border);
        padding: 3px 8px;
        border-radius: 999px;
    }
    .content {
        flex: 1;
        overflow: auto;
    }
</style>
