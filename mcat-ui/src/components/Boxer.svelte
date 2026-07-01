<script lang="ts">
    import BoxerFigure from "./BoxerFigure.svelte";
    import { store, type BoxerAction } from "../lib/store.svelte.ts";

    let { height = 220 }: { height?: number } = $props();

    type Sub = "idle" | "jumprope" | "punch" | "block" | "hit";
    const map: Record<BoxerAction, { user: Sub; opp: Sub }> = {
        idle: { user: "idle", opp: "idle" },
        jumprope: { user: "jumprope", opp: "idle" },
        punch: { user: "punch", opp: "hit" },
        block: { user: "block", opp: "punch" },
        hit: { user: "hit", opp: "punch" },
    };

    const action = $derived(store.boxer.action);
    const subs = $derived(map[action]);
    const oppScale = $derived(0.85 + ((store.boxer.oppSize - 1) / 4) * 0.75);
    const userScale = $derived(store.userScale);

    const badge = $derived(
        action === "punch"
            ? { text: "POW!", side: "opp", cls: "good" }
            : action === "block"
              ? { text: "BLOCK", side: "mid", cls: "warn" }
              : action === "hit"
                ? { text: "OUCH!", side: "user", cls: "bad" }
                : null,
    );
</script>

<div class="ring" style="height:{height}px">
    <div class="ropes"></div>
    <div class="floor"></div>

    {#key store.boxer.nonce}
        <div class="corner user">
            <BoxerFigure
                variant="user"
                facing="right"
                scale={userScale}
                sub={subs.user}
            />
        </div>
        <div class="corner opp">
            <BoxerFigure variant="opp" facing="left" scale={oppScale} sub={subs.opp} />
        </div>

        {#if badge}
            <div class="badge {badge.cls} {badge.side}">{badge.text}</div>
        {/if}
    {/key}
</div>

<style>
    .ring {
        position: relative;
        width: 100%;
        border-radius: var(--radius);
        overflow: hidden;
        background: linear-gradient(180deg, #0d1830 0%, #0a1426 100%);
        border: 1px solid var(--border);
    }
    .floor {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 46%;
        background: repeating-linear-gradient(90deg, #16223c 0 24px, #13203a 24px 48px);
        border-top: 3px solid #26314c;
        box-shadow: inset 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .ropes {
        position: absolute;
        left: 0;
        right: 0;
        top: 12%;
        height: 42%;
        background:
            linear-gradient(
                transparent 0 30%,
                rgba(255, 93, 108, 0.35) 30% 33%,
                transparent 33%
            ),
            linear-gradient(
                transparent 0 62%,
                rgba(22, 211, 198, 0.3) 62% 65%,
                transparent 65%
            );
    }
    .corner {
        position: absolute;
        bottom: 8%;
    }
    .corner.user {
        left: 14%;
    }
    .corner.opp {
        right: 14%;
    }
    .badge {
        position: absolute;
        top: 16%;
        transform: translateX(-50%);
        font-family: var(--mono);
        font-weight: 800;
        font-size: 18px;
        padding: 4px 10px;
        border-radius: 8px;
        border: 2px solid #0a1220;
        animation: pop 0.6s ease-out 1;
        letter-spacing: 0.06em;
    }
    .badge.good {
        background: var(--good);
        color: #04231a;
    }
    .badge.warn {
        background: var(--warn);
        color: #3a2a00;
    }
    .badge.bad {
        background: var(--bad);
        color: #2a0308;
    }
    .badge.opp {
        right: 20%;
        left: auto;
        transform: none;
    }
    .badge.user {
        left: 20%;
        transform: none;
    }
    .badge.mid {
        left: 50%;
    }
    @keyframes pop {
        0% {
            transform: translateY(6px) scale(0.6);
            opacity: 0;
        }
        30% {
            transform: translateY(0) scale(1.1);
            opacity: 1;
        }
        100% {
            transform: translateY(-8px) scale(1);
            opacity: 0;
        }
    }
</style>
