<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";

    const links = [
        { href: "/mcat", label: "Dashboard" },
        { href: "/mcat/study", label: "Study" },
        { href: "/mcat/diagnostic", label: "Diagnostic" },
    ];

    $: path = $page.url.pathname.replace(/\/$/, "") || "/mcat";
</script>

<div class="mcat-shell">
    <nav class="mcat-nav">
        <button class="brand" on:click={() => goto("/mcat")}>
            <span class="glove">🥊</span>
            <span class="wordmark">MCAT&nbsp;Speedrun</span>
        </button>
        <div class="links">
            {#each links as link (link.href)}
                <button
                    class="nav-link"
                    class:active={path === link.href}
                    on:click={() => goto(link.href)}
                >
                    {link.label}
                </button>
            {/each}
        </div>
    </nav>
    <main class="mcat-content">
        <slot />
    </main>
</div>

<style lang="scss">
    .mcat-shell {
        --mcat-accent: #6366f1;
        --mcat-accent-fg: #ffffff;
        min-height: 100vh;
        background: var(--canvas, #f6f7fb);
        color: var(--fg, #1a1a1a);
        font-family:
            "Inter",
            system-ui,
            -apple-system,
            sans-serif;
    }

    .mcat-nav {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.6rem 1.25rem;
        background: var(--canvas-elevated, #fff);
        border-bottom: 1px solid var(--border, #e3e3e8);
        backdrop-filter: blur(6px);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        border: none;
        background: none;
        cursor: pointer;
        font-weight: 800;
        font-size: 1.05rem;
        color: inherit;
        letter-spacing: -0.01em;
    }

    .glove {
        font-size: 1.2rem;
    }

    .links {
        display: flex;
        gap: 0.25rem;
        margin-left: auto;
    }

    .nav-link {
        border: none;
        background: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.65;
        font-weight: 600;
        font-size: 0.92rem;
        padding: 0.4rem 0.8rem;
        border-radius: 0.5rem;
        transition:
            background 0.12s ease,
            opacity 0.12s ease;
    }

    .nav-link:hover {
        opacity: 1;
        background: color-mix(in srgb, var(--mcat-accent) 10%, transparent);
    }

    .nav-link.active {
        opacity: 1;
        color: var(--mcat-accent);
        background: color-mix(in srgb, var(--mcat-accent) 14%, transparent);
    }

    .mcat-content {
        display: block;
    }
</style>
