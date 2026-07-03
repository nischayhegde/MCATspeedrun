<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";

    import QRCode from "qrcode";

    import type { LanServerStatus } from "@generated/anki/frontend_pb";
    import { startLanServer, stopLanServer } from "@generated/backend";

    const dispatch = createEventDispatcher<{ close: void }>();

    let status: LanServerStatus | null = null;
    let qrDataUrl = "";
    let pairingCode = "";
    let busy = true;
    let copied = false;

    async function apply(s: LanServerStatus): Promise<void> {
        status = s;
        if (s.running && s.token) {
            pairingCode = JSON.stringify({
                v: 1,
                host: s.hostIp,
                port: s.port,
                token: s.token,
            });
            qrDataUrl = await QRCode.toDataURL(pairingCode, {
                width: 240,
                margin: 1,
            });
        } else {
            pairingCode = "";
            qrDataUrl = "";
        }
    }

    onMount(async () => {
        try {
            await apply(await startLanServer({}));
        } finally {
            busy = false;
        }
    });

    async function stop(): Promise<void> {
        busy = true;
        try {
            await apply(await stopLanServer({}));
        } finally {
            busy = false;
        }
        dispatch("close");
    }

    async function copyCode(): Promise<void> {
        try {
            await navigator.clipboard.writeText(pairingCode);
            copied = true;
            setTimeout(() => (copied = false), 1500);
        } catch {
            // Clipboard access can fail (e.g. permissions); the code stays selectable in the input.
        }
    }

    function onWindowKeydown(e: KeyboardEvent): void {
        if (e.key === "Escape") {
            dispatch("close");
        }
    }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="lan-overlay" role="button" tabindex="-1" on:click={() => dispatch("close")}>
    <div
        class="lan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lan-title"
        tabindex="-1"
        on:click|stopPropagation
        on:keydown|stopPropagation
    >
        <h2 id="lan-title">Phone access</h2>
        {#if busy}
            <p>Starting LAN server…</p>
        {:else if status?.error}
            <p class="error">Couldn't start the server: {status.error}</p>
        {:else if status?.running}
            <p class="address">
                http://{status.hostIp}:{status.port}
            </p>
            {#if qrDataUrl}
                <img class="qr" src={qrDataUrl} alt="Pairing QR code" />
            {/if}
            <p class="hint">
                Scan this QR from the phone app, or copy the pairing code below. Anyone
                with this code can read and answer your MCAT cards while the server is
                running.
            </p>
            <div class="code-row">
                <input readonly value={pairingCode} />
                <button on:click={copyCode}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <p class="hint">
                If the phone can't connect, allow Python/Anki through Windows Firewall
                for private networks (a prompt may have appeared), and make sure the
                phone is on the same Wi-Fi.
            </p>
        {:else}
            <p>Server stopped.</p>
        {/if}
        <div class="lan-actions">
            <button class="stop" disabled={busy || !status?.running} on:click={stop}>
                Stop server
            </button>
            <button class="close" on:click={() => dispatch("close")}>Close</button>
        </div>
    </div>
</div>

<style lang="scss">
    @use "./mixins" as sf;

    .lan-overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: rgb(0 0 0 / 45%);
    }

    .lan-dialog {
        max-width: 26rem;
        width: 100%;
        padding: 1.5rem 1.6rem;
        border-radius: 0.9rem;
        background: var(--canvas-elevated);
        border: 1px solid var(--border);
        box-shadow: var(--sf-shadow-2, 0 12px 40px rgb(0 0 0 / 25%));
        text-align: center;
    }

    .lan-dialog h2 {
        margin: 0 0 0.6rem;
        font-size: 1.25rem;
    }

    .address {
        font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
        font-size: 1.15rem;
        font-weight: 700;
        margin: 0.4rem 0;
        user-select: text;
    }

    .qr {
        display: block;
        margin: 0.6rem auto;
        border-radius: 0.5rem;
        background: #fff;
        padding: 0.4rem;
    }

    .hint {
        font-size: 0.8rem;
        color: var(--sf-dim);
        margin: 0.4rem 0;
    }

    .error {
        color: var(--sf-err);
        font-weight: 600;
    }

    .code-row {
        display: flex;
        gap: 0.4rem;
        margin: 0.5rem 0;

        input {
            flex: 1;
            min-width: 0;
            font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
            font-size: 0.72rem;
        }

        button {
            @include sf.button-secondary;
        }
    }

    .lan-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.6rem;
        margin-top: 1rem;

        .stop {
            @include sf.button-base;
            padding: 0.55rem 1.1rem;
            border: none;
            background: var(--sf-err);
            color: #fff;
            font-weight: 700;

            &:disabled {
                opacity: 0.5;
                cursor: default;
            }
        }

        .close {
            @include sf.button-secondary;
        }
    }
</style>
