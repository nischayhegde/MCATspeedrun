<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { goto } from "$app/navigation";
    import { page } from "$app/stores";
    import { onMount } from "svelte";

    import type { LayoutData } from "./$types";
    import Cutscene from "./cutscene/Cutscene.svelte";
    import gloveIcon from "./lib/assets/glove-icon.png";

    export let data: LayoutData;

    /* Story intro: plays when the app is entered, once per app session.
       The webview also reloads on sync/reset and the global "d" shortcut,
       so gate on sessionStorage (which survives those reloads but not an
       app restart). ?cutscene=1 forces a replay, ?cutscene=0 suppresses
       (dev + automation escape hatch). Purely cosmetic: the shell below
       stays mounted and interactive the moment it's skipped. */
    let showCutscene = false;

    onMount(() => {
        const forced = new URLSearchParams(window.location.search).get("cutscene");
        if (forced === "0") {
            return;
        }
        if (forced === "1" || sessionStorage.getItem("sf-intro-seen") !== "1") {
            sessionStorage.setItem("sf-intro-seen", "1");
            showCutscene = true;
        }
    });

    const links = [
        { href: "/mcat", label: "Dashboard" },
        { href: "/mcat/study", label: "Study" },
        { href: "/mcat/diagnostic", label: "Diagnostic" },
    ];

    $: path = $page.url.pathname.replace(/\/$/, "") || "/mcat";
    $: showKbdLegend = path === "/mcat/study" || path === "/mcat/diagnostic";
    // Study needs at least one assessed leaf, which today can only come from
    // taking (even a partial) diagnostic — that's the app's only entry point
    // that seeds evidence across leaves.
    $: diagnosticDone = data.readiness.leaves.some((leaf) => leaf.assessed);
</script>

<div class="mcat-shell">
    <nav class="mcat-nav">
        <button
            class="brand"
            on:click={() => goto("/mcat")}
            aria-label="Scorefighter home"
        >
            <img class="glove-mark" src={gloveIcon} alt="" aria-hidden="true" />
            <span class="wordmark">
                Score
                <b>fighter</b>
            </span>
        </button>
        {#if showKbdLegend}
            <span class="kbd-legend">A–D answer · 0 not sure · ↵ confirm</span>
        {/if}
        <div class="links" class:with-legend={showKbdLegend}>
            {#each links as link (link.href)}
                {@const locked = link.href === "/mcat/study" && !diagnosticDone}
                <button
                    class="nav-link"
                    class:active={path === link.href}
                    class:locked
                    aria-current={path === link.href ? "page" : undefined}
                    aria-disabled={locked}
                    title={locked ? "Complete a diagnostic first" : undefined}
                    on:click={() => !locked && goto(link.href)}
                >
                    {link.label}
                </button>
            {/each}
        </div>
    </nav>
    <main class="mcat-content">
        <slot />
    </main>
    {#if showCutscene}
        <Cutscene on:close={() => (showCutscene = false)} />
    {/if}
</div>

<style lang="scss">
    .mcat-shell {
        /* Fight Night palette — kept self-contained so Scorefighter reads the
           same regardless of Anki's active light/dark theme. */
        --sf-canvas: #0d0f14;
        --sf-surface: #161b24;
        --sf-surface-2: #1f2632;
        --sf-border: #2a3242;
        --sf-text: #eef1f6;
        --sf-dim: #9aa4b6;
        --sf-red: #e11d2f;
        --sf-red-deep: #a3121c;
        --sf-gold: #f5c451;

        /* semantic status — one source of truth for right/wrong/neutral */
        --sf-ok: #2fd67a;
        --sf-ok-deep: #1a9d55;
        --sf-err: #ff5d6c; /* feedback red, deliberately NOT brand --sf-red */
        --sf-warn: #f5a03c;
        --sf-steel: #566073; /* neutral chrome: IDK, blocks, secondary */
        /* geometry + elevation rhythm */
        --sf-r-sm: 8px;
        --sf-r-md: 12px;
        --sf-r-lg: 16px;
        --sf-shadow-1: 0 1px 3px rgb(0 0 0 / 30%);
        --sf-shadow-2: 0 12px 34px rgb(0 0 0 / 45%);
        /* keyboard-first focus */
        --sf-focus: 0 0 0 2px var(--sf-canvas), 0 0 0 4px var(--sf-gold);

        /* Remap the Anki theme tokens the child screens consume so they inherit
           the dark boxing surfaces without touching every rule. */
        --canvas: var(--sf-canvas);
        --canvas-elevated: var(--sf-surface);
        --border: var(--sf-border);
        --border-subtle: var(--sf-border);
        --fg: var(--sf-text);
        --mcat-accent: var(--sf-red);
        --mcat-accent-fg: #ffffff;
        --mcat-font: system-ui, "Segoe UI", -apple-system, sans-serif;

        /* App-shell: the shell owns the viewport height and the content area
           holds any scrolling, so the nav stays pinned. Study/Diagnostic fit
           inside the content area without scrolling; the dashboard scrolls
           within it. */
        display: flex;
        flex-direction: column;
        height: 100dvh;
        overflow: hidden;
        background: radial-gradient(
            1100px 700px at 78% -12%,
            #16141c 0%,
            var(--sf-canvas) 58%
        );
        color: var(--sf-text);
        font-family: var(--mcat-font);
    }

    .mcat-nav {
        flex-shrink: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.55rem 1.25rem;
        background: color-mix(in srgb, var(--sf-surface) 92%, transparent);
        border-bottom: 1px solid var(--sf-border);
        /* thin "ring rope" accent line under the bar */
        box-shadow:
            0 2px 0 0 var(--sf-red),
            0 3px 0 0 var(--sf-canvas),
            0 4px 0 0 color-mix(in srgb, var(--sf-red) 45%, transparent);
        backdrop-filter: blur(8px);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        border: none;
        background: none;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        margin: -0.25rem -0.5rem;
        border-radius: 0.5rem;
        transition: background 0.12s ease;
        &:hover {
            background: color-mix(in srgb, var(--sf-red) 8%, transparent);
        }
        &:focus-visible {
            outline: none;
            box-shadow: var(--sf-focus);
        }
    }

    .glove-mark {
        width: 28px;
        height: 28px;
        display: block;
        filter: drop-shadow(0 1px 2px rgba(225, 29, 47, 0.35));
    }

    .wordmark {
        font-weight: 900;
        font-size: 1.12rem;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--sf-text);
        line-height: 1;
    }

    .wordmark b {
        color: var(--sf-red);
        font-weight: 900;
    }

    .kbd-legend {
        margin-left: auto;
        font-size: 11px;
        color: var(--sf-dim);
        letter-spacing: 0.02em;
        white-space: nowrap;
    }

    .links {
        display: flex;
        gap: 0.25rem;
        margin-left: auto;
    }

    .links.with-legend {
        margin-left: 1rem;
    }

    .nav-link {
        border: none;
        background: none;
        cursor: pointer;
        color: var(--sf-dim);
        font-weight: 600;
        font-size: 0.9rem;
        padding: 0.4rem 0.85rem;
        border-radius: 0.5rem;
        transition:
            background 0.12s ease,
            color 0.12s ease;
        &:focus-visible {
            outline: none;
            box-shadow: var(--sf-focus);
        }
    }

    .nav-link:hover {
        color: var(--sf-text);
        background: color-mix(in srgb, var(--sf-red) 12%, transparent);
    }

    .nav-link.active {
        color: var(--sf-text);
        background: none;
        box-shadow: inset 0 -2px 0 var(--sf-gold);
        border-radius: 0;
    }

    .nav-link.locked {
        opacity: 0.4;
        cursor: default;
    }

    .nav-link.locked:hover {
        color: var(--sf-dim);
        background: none;
    }

    .mcat-content {
        flex: 1;
        min-height: 0;
        overflow-x: hidden;
        overflow-y: auto;
    }

    /* Slim dark scrollbars for every scroll area inside the shell (page
       fallback scroll, explanation boxes, panels) — stock Chromium bars read
       as a glitch on the Fight Night surfaces. */
    .mcat-shell :global(::-webkit-scrollbar) {
        width: 10px;
        height: 10px;
    }
    .mcat-shell :global(::-webkit-scrollbar-track) {
        background: transparent;
    }
    .mcat-shell :global(::-webkit-scrollbar-thumb) {
        background: var(--sf-border);
        border-radius: 8px;
        border: 2px solid transparent;
        background-clip: padding-box;
    }
    .mcat-shell :global(::-webkit-scrollbar-thumb:hover) {
        background: var(--sf-steel);
        background-clip: padding-box;
    }
    .mcat-shell :global(::-webkit-scrollbar-corner) {
        background: transparent;
    }
</style>
