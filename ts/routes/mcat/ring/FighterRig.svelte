<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";

    import { bodyPaths, joints } from "./geometry";
    import type { SpeciesSpec } from "./roster";

    const dispatch = createEventDispatcher();

    export let spec: SpeciesSpec;
    export let bulk = 0;
    export let paletteIndex = 0;
    export let facing: "right" | "left" = "right";
    export let scale = 1;
    export let stance = "stance-guard";
    export let clip: string | null = null;
    export let clipTrigger = 0;
    export let staticPose: string | null = null;

    $: body = bodyPaths(bulk);
    $: j = joints(bulk);
    $: pal = spec.palettes[paletteIndex % spec.palettes.length];
    $: mirror = facing === "left" ? -1 : 1;
    $: active = staticPose ?? clip ?? stance;
    $: gloveR = 8 + 3 * bulk;

    function onAnimEnd(e: AnimationEvent): void {
        // one-shots clear back to stance; loops keep going
        if (clip && e.target === e.currentTarget) {
            dispatch("clipend");
        }
    }

    const origin = (p: [number, number]): string =>
        `transform-origin: ${p[0]}px ${p[1]}px;`;
</script>

<div
    class="wrap"
    style="transform: scale({scale}) scaleX({mirror}); --amp: {spec.amp}; --wt: {spec.wt};
           --skin: {pal.skin}; --trunks: {pal.trunks}; --glove: {pal.glove};
           --accent: {pal.accent}; --fur: {pal.fur ?? pal.accent};"
>
    {#key clipTrigger}
        <svg viewBox="0 0 120 150" width="96" height="120" aria-hidden="true">
            <g class="rig {active}" style={origin(j.root)} on:animationend={onAnimEnd}>
                <ellipse class="shadow" cx="60" cy="147" rx="26" ry="4" />
                <g class="pelvis" style={origin(j.pelvis)}>
                    <g class="leg back" style={origin(j.legBack)}>
                        <path d={body.limbs.legBack} />
                        <g class="shin back" style={origin(j.shinBack)}>
                            <path d={body.limbs.shinBack} />
                        </g>
                    </g>
                    <g class="leg front" style={origin(j.legFront)}>
                        <path d={body.limbs.legFront} />
                        <g class="shin front" style={origin(j.shinFront)}>
                            <path d={body.limbs.shinFront} />
                        </g>
                    </g>
                    <path class="trunks" d="M 46 88 L 74 88 L 76 104 L 44 104 Z" />
                    <g class="spine" style={origin(j.spine)}>
                        <g class="chest" style={origin(j.chest)}>
                            <g class="arm back" style={origin(j.armBack)}>
                                <path d={body.limbs.armBack} />
                                <g class="forearm back" style={origin(j.forearmBack)}>
                                    <path d={body.limbs.forearmBack} />
                                    <circle class="glove back" cx={j.forearmBack[0] - 6} cy={j.forearmBack[1] + 14} r={gloveR} />
                                </g>
                            </g>
                            <path class="torso" d={body.torso} />
                            {#each body.muscles as m (m)}
                                <path class="muscle" d={m} style="opacity: {0.25 * bulk};" />
                            {/each}
                            <g class="neck" style={origin(j.neck)}>
                                <path d={body.limbs.neck} />
                                <g class="head" style={origin(j.head)}>
                                    <path class="head-shape" d={spec.headPath} />
                                    {#each spec.extraPaths as p (p)}
                                        <path class="extra" d={p} />
                                    {/each}
                                    <circle class="eye" cx="68" cy="38" r="1.6" />
                                </g>
                            </g>
                            <g class="arm front" style={origin(j.armFront)}>
                                <path d={body.limbs.armFront} />
                                <g class="forearm front" style={origin(j.forearmFront)}>
                                    <path d={body.limbs.forearmFront} />
                                    <circle class="glove front" cx={j.forearmFront[0] + 8} cy={j.forearmFront[1] + 14} r={gloveR} />
                                </g>
                            </g>
                        </g>
                    </g>
                </g>
            </g>
        </svg>
    {/key}
</div>

<style lang="scss">
    @use "./grammar" as g;

    .wrap {
        transform-origin: bottom center;
        line-height: 0;
    }
    svg :global(g) {
        transform-box: view-box;
    }
    .shadow {
        fill: rgb(0 0 0 / 35%);
    }
    path,
    circle.glove {
        stroke: #05070c;
        stroke-width: 1.5;
    }
    .leg path,
    .shin path {
        fill: var(--trunks);
    }
    .arm path,
    .forearm path,
    .neck > path,
    .torso {
        fill: var(--skin);
    }
    .trunks {
        fill: var(--trunks);
    }
    .head-shape {
        fill: var(--skin);
    }
    .extra {
        fill: var(--fur);
        stroke: #05070c;
        stroke-width: 1.2;
    }
    .muscle {
        fill: none;
        stroke: rgb(0 0 0 / 55%);
        stroke-width: 1.4;
    }
    .glove {
        fill: var(--glove);
    }
    .eye {
        fill: #05070c;
        stroke: none;
    }

    /* Wave-0 clip: guard breathing, <=2px, reading-safe */
    .rig.stance-guard {
        @include g.loop(2.9s);
        animation-name: guard-breathe;
    }
    /* Boxing guard: upper arms drop below the shoulders and tuck in, forearms
       fold up so the gloves ride at jaw height beside the head. Signs chosen so
       the near-vertical forearms bring both gloves toward the face; the lead
       (front) glove sits slightly forward of the rear glove. */
    .rig.stance-guard .arm.front {
        transform: rotate(82deg);
    }
    .rig.stance-guard .forearm.front {
        transform: rotate(158deg);
    }
    .rig.stance-guard .arm.back {
        transform: rotate(-84deg);
    }
    .rig.stance-guard .forearm.back {
        transform: rotate(-116deg);
    }
    @keyframes guard-breathe {
        0%, 100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(calc(var(--amp, 1) * -2px));
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .rig,
        .rig :global(*) {
            animation: none !important;
        }
    }
</style>
