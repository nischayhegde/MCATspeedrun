<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    /* Intro story cutscene: a timed slideshow of stills with Ken Burns
       drift, ring-grammar shakes and broadcast-chyron nameplates. Purely
       cosmetic and always skippable — it never gates data loading and the
       screens underneath stay mounted (same contract as FightRing). The
       schedule is plain data in scenes.ts driven by a setTimeout batch,
       mirroring the ring's clip machine. */
    import { createEventDispatcher, onDestroy, onMount } from "svelte";

    import { DIP_LEAD_MS, FADE_MS, SCENES, startTimes, totalMs } from "./scenes";

    const dispatch = createEventDispatcher<{ close: void }>();

    let idx = 0;
    let ready = false;
    let closing = false;
    let veilTrigger = 0;
    let skipButton: HTMLButtonElement | undefined;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let begun = false;

    $: current = SCENES[idx];
    $: shake = ready && !closing ? (current.shake ?? 0) : 0;

    function begin(): void {
        if (begun) {
            return;
        }
        begun = true;
        ready = true;
        const starts = startTimes();
        for (let i = 1; i < SCENES.length; i++) {
            timers.push(setTimeout(() => (idx = i), starts[i]));
            if (SCENES[i].enter === "dip") {
                timers.push(
                    setTimeout(() => (veilTrigger += 1), starts[i] - DIP_LEAD_MS),
                );
            }
        }
        timers.push(setTimeout(finish, totalMs()));
    }

    function finish(): void {
        if (closing) {
            return;
        }
        closing = true;
        timers.forEach(clearTimeout);
        timers = [];
        timers.push(setTimeout(() => dispatch("close"), 520));
    }

    function onKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            finish();
        }
    }

    onMount(() => {
        // Warm every frame up front (they're immutable-cached after the
        // first run); start the clock on the first decode so the opening
        // shot never fades in half-loaded, but never stall on a bad file.
        const images = SCENES.filter((scene) => scene.img).map((scene) => {
            const image = new Image();
            image.src = scene.img;
            return image;
        });
        images[0].decode().then(begin, begin);
        timers.push(setTimeout(begin, 2000));
        skipButton?.focus();
    });

    onDestroy(() => timers.forEach(clearTimeout));
</script>

<svelte:window on:keydown={onKeydown} />

<div
    class="cutscene"
    class:closing
    role="dialog"
    aria-modal="true"
    aria-label="Story intro"
>
    <div class="stage shake-{shake}">
        {#each SCENES as scene, i (scene.id)}
            <div
                class="frame enter-{scene.enter}"
                class:shown={ready && i <= idx}
                style="--kb-dur: {scene.ms + FADE_MS}ms; --kb-s0: {scene.kb
                    .s0}; --kb-x0: {scene.kb.x0}%; --kb-y0: {scene.kb
                    .y0}%; --kb-s1: {scene.kb.s1}; --kb-x1: {scene.kb
                    .x1}%; --kb-y1: {scene.kb.y1}%;"
            >
                {#if scene.img}
                    <img class="shot" src={scene.img} alt="" draggable="false" />
                {:else}
                    <div class="title-card">
                        <div class="title-kicker">Scorefighter presents</div>
                        <h1 class="title-name">The Pit Eternal</h1>
                        <p class="title-sub">
                            Sentenced to forever. Fighting for the truth.
                        </p>
                        <button class="title-enter" on:click={finish}>
                            Enter the ring
                        </button>
                    </div>
                {/if}
            </div>
        {/each}

        {#key veilTrigger}
            {#if veilTrigger > 0}
                <div class="veil"></div>
            {/if}
        {/key}

        {#key idx}
            {#if ready && current.enter === "flash"}
                <div class="flash"></div>
            {/if}
        {/key}
    </div>

    <div class="scrim"></div>

    {#if ready && (current.kicker || current.text)}
        {#key idx}
            <div class="caption">
                {#if current.plate}
                    <div class="plate {current.plate.tone}">
                        <span class="plate-bar"></span>
                        {current.plate.text}
                    </div>
                {/if}
                {#if current.kicker}
                    <div class="kicker">{current.kicker}</div>
                {/if}
                {#if current.text}
                    <p class="nar">{current.text}</p>
                {/if}
            </div>
        {/key}
    {/if}

    <button class="skip" bind:this={skipButton} on:click={finish}>
        Skip intro <kbd>Esc</kbd>
    </button>

    <div class="progress">
        <div
            class="bar"
            style="width: {((ready ? idx + 1 : 0) / SCENES.length) *
                100}%; transition-duration: {current.ms}ms;"
        ></div>
    </div>
</div>

<style lang="scss">
    @use "../ring/grammar.scss" as g;

    .cutscene {
        position: fixed;
        inset: 0;
        z-index: 100;
        background: #05070c;
        overflow: hidden;
        transition: opacity 0.5s ease;
        &.closing {
            opacity: 0;
            pointer-events: none;
        }
    }

    .stage {
        position: absolute;
        inset: 0;
    }

    /* Ring-grammar shakes (FightRing's shake1-3 shape and timing, amplitudes
       scaled ~3x because this stage is the full viewport, not a 500px ring). */
    .stage.shake-1 {
        animation: shake1 0.12s ease-out 1;
    }
    .stage.shake-2 {
        animation: shake2 0.16s ease-out 1;
    }
    .stage.shake-3 {
        animation: shake3 0.2s ease-out 1;
    }
    @keyframes shake1 {
        25% {
            transform: translate(3px, -3px);
        }
        75% {
            transform: translate(-3px, 0);
        }
    }
    @keyframes shake2 {
        25% {
            transform: translate(6px, -3px);
        }
        75% {
            transform: translate(-6px, 3px);
        }
    }
    @keyframes shake3 {
        20% {
            transform: translate(9px, -6px);
        }
        60% {
            transform: translate(-9px, 3px);
        }
        85% {
            transform: translate(6px, 0);
        }
    }

    .frame {
        position: absolute;
        inset: 0;
        opacity: 0;
        &.shown {
            opacity: 1;
        }
        &.enter-fade {
            transition: opacity 0.9s ease;
        }
        &.enter-dip {
            transition: opacity 0.25s ease;
        }
        &.enter-cut,
        &.enter-flash {
            transition: none;
        }
    }

    .shot {
        width: 100%;
        height: 100%;
        object-fit: cover;
        will-change: transform;
    }

    /* Slow zoom/drift; each frame supplies its own endpoints via custom
       props. Runs through the crossfade overlap and holds its final pose. */
    .frame.shown .shot {
        animation: kenburns var(--kb-dur) linear both;
    }
    @keyframes kenburns {
        from {
            transform: scale(var(--kb-s0)) translate(var(--kb-x0), var(--kb-y0));
        }
        to {
            transform: scale(var(--kb-s1)) translate(var(--kb-x1), var(--kb-y1));
        }
    }

    /* Dip-to-black act break: covers the swap, then lifts. */
    .veil {
        position: absolute;
        inset: 0;
        background: #05070c;
        opacity: 0;
        animation: veil 1.4s ease-in-out 1 both;
        pointer-events: none;
    }
    @keyframes veil {
        0% {
            opacity: 0;
        }
        35% {
            opacity: 1;
        }
        65% {
            opacity: 1;
        }
        100% {
            opacity: 0;
        }
    }

    /* Impact flash: red-white pop on the hit frame. */
    .flash {
        position: absolute;
        inset: 0;
        background: radial-gradient(
            ellipse at center,
            rgb(255 236 220 / 95%) 0%,
            rgb(255 80 80 / 55%) 45%,
            transparent 80%
        );
        opacity: 0;
        animation: flash 0.24s g.$ease-strike 1;
        pointer-events: none;
    }
    @keyframes flash {
        0% {
            opacity: 0;
        }
        25% {
            opacity: 1;
        }
        100% {
            opacity: 0;
        }
    }

    .scrim {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 40%;
        background: linear-gradient(180deg, transparent 0%, rgb(0 0 0 / 80%) 100%);
        pointer-events: none;
    }

    .caption {
        position: absolute;
        left: 50%;
        bottom: 9%;
        transform: translateX(-50%);
        width: min(680px, 84vw);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.55rem;
        text-align: center;
        animation: caption-in 0.6s ease-out 0.35s both;
    }
    @keyframes caption-in {
        from {
            opacity: 0;
            transform: translate(-50%, 10px);
        }
        to {
            opacity: 1;
            transform: translate(-50%, 0);
        }
    }

    .kicker {
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.28em;
        color: var(--sf-red);
    }

    .nar {
        margin: 0;
        font-size: 1.08rem;
        line-height: 1.55;
        color: var(--sf-text);
        text-shadow:
            0 1px 2px rgb(0 0 0 / 85%),
            0 0 18px rgb(0 0 0 / 60%);
        text-wrap: balance;
    }

    /* Nameplates: the ring chyron recipe (RingFx), sized up for cinema and
       holding at full opacity instead of self-fading — it's a title, not a
       hit badge. */
    .plate {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
        font-weight: 800;
        font-style: italic;
        font-size: 15px;
        letter-spacing: 0.03em;
        padding: 4px 14px 4px 8px;
        clip-path: polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%);
        animation: plate-in 0.5s ease-out both;
        &.gold {
            background: linear-gradient(120deg, #ffe9ad, #f5c451 60%, #a3792b);
            color: #3a2a00;
        }
        &.steel {
            background: linear-gradient(120deg, #aab2c0, #566073 60%, #333a47);
            color: #0a0e16;
        }
        &.err {
            background: linear-gradient(120deg, #ff9aa3, #ff5d6c 60%, #8c1019);
            color: #2a0308;
        }
    }
    .plate-bar {
        width: 3px;
        align-self: stretch;
        background: rgb(0 0 0 / 35%);
    }
    @keyframes plate-in {
        0% {
            transform: translateX(12px) scaleX(0.7);
            opacity: 0;
        }
        30% {
            transform: translateX(0) scaleX(1.05);
            opacity: 1;
        }
        100% {
            transform: translateX(0) scaleX(1);
            opacity: 1;
        }
    }

    .skip {
        position: absolute;
        top: 16px;
        right: 18px;
        display: flex;
        align-items: center;
        gap: 0.45rem;
        border: 1px solid color-mix(in srgb, var(--sf-border) 70%, transparent);
        border-radius: var(--sf-r-sm);
        background: color-mix(in srgb, #05070c 62%, transparent);
        color: var(--sf-dim);
        font-size: 0.72rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 0.45rem 0.7rem;
        cursor: pointer;
        backdrop-filter: blur(6px);
        transition:
            color 0.12s ease,
            background 0.12s ease;
        &:hover {
            color: var(--sf-text);
            background: color-mix(in srgb, var(--sf-red) 18%, #05070c);
        }
        &:focus-visible {
            outline: none;
            box-shadow: var(--sf-focus);
        }
        kbd {
            font-family: ui-monospace, Consolas, monospace;
            font-size: 0.62rem;
            font-weight: 700;
            padding: 0.1rem 0.3rem;
            border: 1px solid var(--sf-steel);
            border-bottom-width: 2px;
            border-radius: 4px;
            color: var(--sf-dim);
            background: rgb(0 0 0 / 30%);
        }
    }

    .progress {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 3px;
        background: rgb(255 255 255 / 6%);
    }
    .bar {
        height: 100%;
        width: 0;
        background: linear-gradient(90deg, var(--sf-red-deep), var(--sf-red));
        transition-property: width;
        transition-timing-function: linear;
    }

    .title-card {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        text-align: center;
        padding: 0 1.5rem;
        background:
            radial-gradient(
                900px 540px at 50% 118%,
                color-mix(in srgb, var(--sf-red-deep) 26%, transparent) 0%,
                transparent 62%
            ),
            #05070c;
    }

    .title-kicker {
        font-size: 0.7rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.28em;
        color: var(--sf-red);
    }

    .title-name {
        margin: 0;
        font-size: clamp(2.6rem, 7vw, 4.6rem);
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        line-height: 1.05;
        background: linear-gradient(
            140deg,
            var(--sf-gold) 0%,
            #fff2cf 42%,
            var(--sf-red) 118%
        );
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: 0 2px 18px rgba(245, 196, 81, 0.12);
    }

    .title-sub {
        margin: 0;
        color: var(--sf-dim);
        font-size: 0.98rem;
        letter-spacing: 0.02em;
    }

    .title-enter {
        margin-top: 0.9rem;
        border: 1px solid color-mix(in srgb, var(--sf-red) 55%, transparent);
        border-radius: var(--sf-r-sm);
        background: linear-gradient(180deg, var(--sf-red) 0%, var(--sf-red-deep) 100%);
        color: #ffffff;
        font-weight: 800;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 0.7rem 1.6rem;
        cursor: pointer;
        box-shadow: var(--sf-shadow-2);
        transition: filter 0.12s ease;
        &:hover {
            filter: brightness(1.12);
        }
        &:focus-visible {
            outline: none;
            box-shadow: var(--sf-focus);
        }
    }

    /* House rule: keep meaningful text readable, drop the ephemera, freeze
       all motion. The slideshow still advances and skip still works. */
    @media (prefers-reduced-motion: reduce) {
        .stage,
        .shot,
        .caption,
        .plate {
            animation: none !important;
        }
        .frame,
        .bar {
            transition: none !important;
        }
        .flash,
        .veil {
            display: none;
        }
    }
</style>
