<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script context="module" lang="ts">
    // Unique per mounted instance so simultaneous hero+opponent rigs (or the
    // gallery's many rigs) don't collide on gradient <defs> ids. Declared in
    // module context (shared across every FighterRig instance) rather than
    // in the instance script below — an instance-scoped `let ridCounter = 0`
    // would reset to 0 on every mount and every rig would compute the same
    // "rig0" id, defeating the point.
    let ridCounter = 0;
</script>

<script lang="ts">
    import { createEventDispatcher } from "svelte";

    import { shadeColor } from "./color";
    import { bodyPaths, glovePath, joints } from "./geometry";
    import { morphPath } from "./morph";
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

    const rid = `rig${ridCounter++}`;

    $: body = bodyPaths(bulk);
    $: j = joints(bulk);
    $: pal = spec.palettes[paletteIndex % spec.palettes.length];
    $: mirror = facing === "left" ? -1 : 1;
    $: active = staticPose ?? clip ?? stance;
    $: gloveR = 8 + 3 * bulk;

    // Key-art gradient stops derived from the flat palette hex values —
    // no hand-authored gradient data, see color.ts.
    $: skinHi = shadeColor(pal.skin, 0.32);
    $: skinLo = shadeColor(pal.skin, -0.38);
    $: gloveHi = shadeColor(pal.glove, 0.4);
    $: gloveLo = shadeColor(pal.glove, -0.45);
    $: trunksHi = shadeColor(pal.trunks, 0.3);
    $: trunksLo = shadeColor(pal.trunks, -0.35);
    $: rimColor = shadeColor(pal.accent, 0.45);

    function onAnimEnd(e: AnimationEvent): void {
        // one-shots clear back to stance; loops keep going
        if (clip && e.target === e.currentTarget) {
            dispatch("clipend");
        }
    }

    const origin = (p: [number, number]): string =>
        `transform-origin: ${p[0]}px ${p[1]}px;`;

    // Organic deformation on top of the existing rotation-based joint system,
    // for the highest-impact one-shots only (see plan Task 5). Each entry
    // gives the element ref getter, a duration matching the clip's CSS
    // animation-duration (see clips.ts), and rest/peak `d` keyframes built
    // from the same geometry functions used for static rendering.
    let gloveFrontEl: SVGPathElement | undefined;
    let gloveBackEl: SVGPathElement | undefined;

    const MORPH_DURATION_MS: Record<string, number> = {
        "atk-cross": 560,
        "atk-uppercut": 620,
        "atk-hook": 580,
        "hit-head-snap": 480,
        "hit-gut-fold": 560,
    };

    function frontGloveD(squashX: number, squashY: number): string {
        return glovePath(
            j.forearmFront[0] + 8,
            j.forearmFront[1] + 14,
            gloveR,
            mirror as 1 | -1,
            squashX,
            squashY,
        );
    }
    function backGloveD(squashX: number, squashY: number): string {
        return glovePath(
            j.forearmBack[0] - 6,
            j.forearmBack[1] + 14,
            gloveR,
            -mirror as 1 | -1,
            squashX,
            squashY,
        );
    }

    $: if (clip && clipTrigger && MORPH_DURATION_MS[clip]) {
        const durationMs = MORPH_DURATION_MS[clip];
        const rest = [1, 1] as const;
        const squash: [number, number] =
            clip === "atk-uppercut" ? [0.85, 1.3] : [1.3, 0.85];
        if (clip === "atk-cross" || clip === "atk-uppercut" || clip === "atk-hook") {
            if (gloveBackEl && clip !== "atk-hook" && clip !== "atk-uppercut") {
                morphPath(
                    gloveBackEl,
                    [backGloveD(...rest), backGloveD(...squash), backGloveD(...rest)],
                    { durationMs },
                );
            }
            if (gloveFrontEl && (clip === "atk-hook" || clip === "atk-uppercut")) {
                morphPath(
                    gloveFrontEl,
                    [
                        frontGloveD(...rest),
                        frontGloveD(...squash),
                        frontGloveD(...rest),
                    ],
                    { durationMs },
                );
            }
        } else if (clip === "hit-head-snap" || clip === "hit-gut-fold") {
            // struck fighter: both gloves flinch-squash slightly, no thumb-side bias
            if (gloveFrontEl) {
                morphPath(
                    gloveFrontEl,
                    [
                        frontGloveD(...rest),
                        frontGloveD(0.9, 1.08),
                        frontGloveD(...rest),
                    ],
                    { durationMs },
                );
            }
            if (gloveBackEl) {
                morphPath(
                    gloveBackEl,
                    [backGloveD(...rest), backGloveD(0.9, 1.08), backGloveD(...rest)],
                    { durationMs },
                );
            }
        }
    }
</script>

<div
    class="wrap"
    style="transform: scale({scale}) scaleX({mirror}); --amp: {spec.amp}; --wt: {spec.wt};
           --glove: {pal.glove};
           --accent: {pal.accent}; --fur: {pal.fur ?? pal.accent};"
>
    {#key clipTrigger}
        <svg viewBox="0 0 120 150" width="96" height="120" aria-hidden="true">
            <defs>
                <linearGradient id="{rid}-skin" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color={skinHi} />
                    <stop offset="0.55" stop-color={pal.skin} />
                    <stop offset="1" stop-color={skinLo} />
                </linearGradient>
                <linearGradient id="{rid}-trunks" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color={trunksHi} />
                    <stop offset="1" stop-color={trunksLo} />
                </linearGradient>
                <linearGradient id="{rid}-glove" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color={gloveHi} />
                    <stop offset="0.6" stop-color={pal.glove} />
                    <stop offset="1" stop-color={gloveLo} />
                </linearGradient>
            </defs>
            <g class="rig {active}" style={origin(j.root)} on:animationend={onAnimEnd}>
                <ellipse class="shadow" cx="60" cy="147" rx="26" ry="4" />
                <ellipse class="rope" cx="60" cy="76" rx="40" ry="60" />
                <g class="pelvis" style={origin(j.pelvis)}>
                    <g class="leg back" style={origin(j.legBack)}>
                        <path d={body.limbs.legBack} style="fill:url(#{rid}-trunks)" />
                        <g class="shin back" style={origin(j.shinBack)}>
                            <path
                                d={body.limbs.shinBack}
                                style="fill:url(#{rid}-trunks)"
                            />
                        </g>
                    </g>
                    <g class="leg front" style={origin(j.legFront)}>
                        <path d={body.limbs.legFront} style="fill:url(#{rid}-trunks)" />
                        <g class="shin front" style={origin(j.shinFront)}>
                            <path
                                d={body.limbs.shinFront}
                                style="fill:url(#{rid}-trunks)"
                            />
                        </g>
                    </g>
                    <path
                        class="trunks"
                        d="M 46 88 L 74 88 L 76 104 L 44 104 Z"
                        style="fill:url(#{rid}-trunks)"
                    />
                    <g class="spine" style={origin(j.spine)}>
                        <g class="chest" style={origin(j.chest)}>
                            <path
                                class="torso"
                                d={body.torso}
                                style="fill:url(#{rid}-skin)"
                            />
                            {#each body.muscles as m (m)}
                                <path
                                    class="muscle"
                                    d={m}
                                    style="opacity: {0.25 * bulk};"
                                />
                            {/each}
                            {#if spec.texture === "scale"}
                                {#each [[52, 74], [60, 76], [68, 74], [54, 84], [66, 84]] as [tx, ty] (tx + "-" + ty)}
                                    <ellipse
                                        class="texture-scale"
                                        cx={tx}
                                        cy={ty}
                                        rx="4"
                                        ry="2.6"
                                    />
                                {/each}
                            {:else if spec.texture === "fur"}
                                <path
                                    class="texture-fur"
                                    d="M 44 62 L 41 66 L 45 68 L 42 72 L 46 74 M 76 62 L 79 66 L 75 68 L 78 72 L 74 74"
                                />
                            {:else if spec.texture === "crack"}
                                <path
                                    class="texture-crack"
                                    d="M 54 62 L 58 74 L 55 84 M 68 60 L 65 70 L 69 80"
                                />
                            {:else if spec.texture === "warpaint"}
                                <path
                                    class="texture-warpaint"
                                    d="M 48 68 L 72 66 L 72 71 L 48 73 Z M 50 78 L 70 77 L 70 81 L 50 82 Z"
                                />
                            {/if}
                            <g class="neck" style={origin(j.neck)}>
                                <path
                                    d={body.limbs.neck}
                                    style="fill:url(#{rid}-skin)"
                                />
                                <g class="head" style={origin(j.head)}>
                                    <path
                                        class="head-shape"
                                        d={spec.headPath}
                                        style="fill:url(#{rid}-skin)"
                                    />
                                    {#each spec.extraPaths as p (p)}
                                        <path class="extra" d={p} />
                                    {/each}
                                    <path
                                        class="rim-light"
                                        d="M 54 32 Q 62 26 70 30"
                                        style="stroke:{rimColor}"
                                    />
                                    <circle class="eye" cx="68" cy="38" r="1.6" />
                                </g>
                            </g>
                            <ellipse class="ao-shadow" cx="60" cy="66" rx="16" ry="7" />
                            <!-- rear arm above the torso and head: the rear
                                 glove guards the chin in front of the jaw, and
                                 rear-hand punches (cross) stay visible instead
                                 of being swallowed behind the torso -->
                            <g class="arm back" style={origin(j.armBack)}>
                                <path
                                    d={body.limbs.armBack}
                                    style="fill:url(#{rid}-skin)"
                                />
                                <g class="forearm back" style={origin(j.forearmBack)}>
                                    <path
                                        d={body.limbs.forearmBack}
                                        style="fill:url(#{rid}-skin)"
                                    />
                                    <path
                                        bind:this={gloveBackEl}
                                        class="glove back"
                                        d={backGloveD(1, 1)}
                                        style="fill:url(#{rid}-glove)"
                                    />
                                </g>
                            </g>
                            <rect
                                class="flash"
                                x="30"
                                y="10"
                                width="70"
                                height="120"
                                rx="8"
                            />
                            <g class="arm front" style={origin(j.armFront)}>
                                <path
                                    d={body.limbs.armFront}
                                    style="fill:url(#{rid}-skin)"
                                />
                                <g class="forearm front" style={origin(j.forearmFront)}>
                                    <path
                                        d={body.limbs.forearmFront}
                                        style="fill:url(#{rid}-skin)"
                                    />
                                    <path
                                        class="smear"
                                        d="M {j.forearmFront[0] - 10} {j
                                            .forearmFront[1] + 6} Q {j.forearmFront[0] +
                                            14} {j.forearmFront[1] - 2} {j
                                            .forearmFront[0] + 8} {j.forearmFront[1] +
                                            24}"
                                    />
                                    <path
                                        bind:this={gloveFrontEl}
                                        class="glove front"
                                        d={frontGloveD(1, 1)}
                                        style="fill:url(#{rid}-glove)"
                                    />
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
    svg :global(g),
    .rope,
    .smear,
    .flash {
        transform-box: view-box;
    }
    /* contact-squash scales (cross-glove etc.) must squash the mitt in place —
       without a local box+origin they'd scale around the view-box origin and
       send the glove flying off the wrist */
    .glove {
        transform-box: fill-box;
        transform-origin: center;
    }
    .shadow {
        fill: rgb(0 0 0 / 35%);
    }
    path {
        stroke: #05070c;
        stroke-width: 1.5;
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
    .eye {
        fill: #05070c;
        stroke: none;
    }
    .ao-shadow {
        fill: #000;
        opacity: 0.28;
        filter: blur(2.5px);
        pointer-events: none;
    }
    .rim-light {
        fill: none;
        stroke-width: 1.2;
        stroke-linecap: round;
        opacity: 0.55;
    }
    .texture-scale {
        fill: rgb(0 0 0 / 18%);
        stroke: none;
    }
    .texture-fur,
    .texture-crack {
        fill: none;
        stroke: rgb(0 0 0 / 55%);
        stroke-width: 1.2;
        stroke-linecap: round;
    }
    .texture-warpaint {
        fill: var(--accent);
        opacity: 0.85;
        stroke: none;
    }
    /* motion aids — invisible until their clip drives opacity */
    .smear {
        fill: none;
        stroke: var(--glove);
        stroke-width: 6;
        stroke-linecap: round;
        opacity: 0;
    }
    .flash {
        fill: rgb(255 80 80 / 55%);
        stroke: none;
        opacity: 0;
        pointer-events: none;
    }
    .rope {
        fill: none;
        stroke: #cfd8e6;
        stroke-width: 2;
        opacity: 0;
    }
    /* jumprope: rope arcs over/under with the hop */
    .rig.stance-jumprope .rope {
        opacity: 1;
        animation: jumprope-rope 520ms linear infinite;
        transform-origin: 60px 76px;
    }
    @keyframes jumprope-rope {
        0% {
            transform: scaleY(1);
        }
        50% {
            transform: scaleY(-1);
        }
        100% {
            transform: scaleY(1);
        }
    }

    /* Default arm pose = boxing guard, applied to EVERY stance/clip unless a
       clip animates that limb (CSS animations override the static transform).
       Keeps the arms in guard during head/body hit reactions instead of
       snapping to the drawn rest pose (arms hanging).

       Pose math (rest angles: front arm 66°, back arm 114°, y-down, 0°=facing
       direction): front arm +29° puts the lead elbow at the front ribs
       (74,86) and with forearm -150° the lead glove sits forward of the chest
       at (82,72); back arm -100° tucks the rear elbow behind the torso and
       forearm -92° parks the rear glove under the chin at (66,56), peeking
       out below the jaw. Elbows never cross the midline. */
    .rig .arm.front {
        transform: rotate(29deg);
    }
    .rig .forearm.front {
        transform: rotate(-150deg);
    }
    .rig .arm.back {
        transform: rotate(-100deg);
    }
    .rig .forearm.back {
        transform: rotate(-92deg);
    }

    /* Wave-0 clip: guard breathing, <=2px, reading-safe */
    .rig.stance-guard {
        @include g.loop(2.9s);
        animation-name: guard-breathe;
    }
    @keyframes guard-breathe {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(calc(var(--amp, 1) * -2px));
        }
    }

    /* ===================================================================== */
    /* Wave-1 loops                                                          */
    /* ===================================================================== */

    /* stance-bounce: weight-shifting bob (intensity 2 — feedback state). */
    .rig.stance-bounce {
        @include g.loop(1.8s);
        animation-name: bounce-root;
        .pelvis {
            @include g.loop(1.8s);
            animation-name: bounce-pelvis;
        }
    }
    @keyframes bounce-root {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(calc(var(--amp, 1) * -3px));
        }
    }
    @keyframes bounce-pelvis {
        0%,
        100% {
            transform: rotate(calc(var(--amp, 1) * 2deg));
        }
        50% {
            transform: rotate(calc(var(--amp, 1) * -2deg));
        }
    }

    /* stance-spent: dropped shoulders, gloves droop low (intensity 1). */
    .rig.stance-spent {
        @include g.loop(3.2s);
        animation-name: spent-root;
        .chest {
            transform: rotate(3deg);
        }
        .arm.front {
            transform: rotate(34deg);
        }
        .forearm.front {
            transform: rotate(-135deg);
        }
        .arm.back {
            transform: rotate(-94deg);
        }
        .forearm.back {
            transform: rotate(-87deg);
        }
    }
    @keyframes spent-root {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(calc(var(--amp, 1) * -1px));
        }
    }

    /* stance-jumprope: hop + rope toggle (intensity 1). Ported from the old
       BoxerFigure hop/rope onto the rig; rope is the .shadow-less .rope. */
    .rig.stance-jumprope {
        @include g.loop(520ms);
        animation-name: jumprope-hop;
        /* hands low and out at the hips, turning the rope handles */
        .arm.front {
            transform: rotate(19deg);
        }
        .forearm.front {
            transform: rotate(-50deg);
        }
        .arm.back {
            transform: rotate(-19deg);
        }
        .forearm.back {
            transform: rotate(57deg);
        }
    }
    @keyframes jumprope-hop {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(calc(var(--amp, 1) * -9px));
        }
    }

    /* ===================================================================== */
    /* Wave-1 hero one-shots                                                 */
    /* ===================================================================== */

    /* atk-cross: rear-hand power straight. spine drives, glove squashes at contact */
    .rig.atk-cross {
        @include g.oneshot(560ms);
        animation-name: cross-root;
        .spine {
            @include g.oneshot(560ms);
            animation-name: cross-spine;
        }
        .arm.back {
            @include g.oneshot(560ms);
            animation-name: cross-arm;
        }
        .forearm.back {
            @include g.oneshot(560ms);
            animation-name: cross-forearm;
        }
    }
    @keyframes cross-root {
        0% {
            transform: translateX(0);
        }
        18% {
            transform: translateX(calc(var(--amp, 1) * -3px));
        } /* anticipation */
        38%,
        50% {
            transform: translateX(calc(var(--amp, 1) * 9px));
        } /* contact + hold */
        70% {
            transform: translateX(calc(var(--amp, 1) * 11px));
        } /* overshoot */
        100% {
            transform: translateX(0);
        } /* settle */
    }
    /* spine + (clockwise) drives the shoulders toward the opponent; wind back
       first, whip forward into contact. */
    @keyframes cross-spine {
        0% {
            transform: rotate(0);
        }
        18% {
            transform: rotate(calc(var(--amp, 1) * -6deg));
        }
        38%,
        50% {
            transform: rotate(calc(var(--amp, 1) * 12deg));
        }
        70% {
            transform: rotate(calc(var(--amp, 1) * 14deg));
        }
        100% {
            transform: rotate(0);
        }
    }
    /* contact: rear arm + forearm aligned at ~-6° absolute — a straight line
       from shoulder through glove, extended past the body toward the target */
    @keyframes cross-arm {
        0% {
            transform: rotate(-100deg);
        }
        18% {
            transform: rotate(-94deg);
        }
        38%,
        50% {
            transform: rotate(-120deg);
        }
        70% {
            transform: rotate(-122deg);
        }
        100% {
            transform: rotate(-100deg);
        }
    }
    @keyframes cross-forearm {
        0% {
            transform: rotate(-92deg);
        }
        18% {
            transform: rotate(-129deg);
        }
        38%,
        50% {
            transform: rotate(-3deg);
        }
        70% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(-92deg);
        }
    }
    @keyframes cross-glove {
        0%,
        30% {
            transform: scale(1);
        }
        38%,
        50% {
            transform: scale(1.3, 0.85);
        } /* contact squash */
        62% {
            transform: scale(1.05);
        }
        100% {
            transform: scale(1);
        }
    }

    /* atk-uppercut: dip then spring, front hand rises from low */
    .rig.atk-uppercut {
        @include g.oneshot(620ms);
        animation-name: upper-root;
        .spine {
            @include g.oneshot(620ms);
            animation-name: upper-spine;
        }
        .arm.front {
            @include g.oneshot(620ms);
            animation-name: upper-arm;
        }
        .forearm.front {
            @include g.oneshot(620ms);
            animation-name: upper-forearm;
        }
    }
    @keyframes upper-root {
        0% {
            transform: translateY(0);
        }
        18% {
            transform: translateY(calc(var(--amp, 1) * 4px));
        } /* dip */
        38%,
        50% {
            transform: translateY(calc(var(--amp, 1) * -5px));
        } /* spring + hold */
        70% {
            transform: translateY(calc(var(--amp, 1) * -7px));
        }
        100% {
            transform: translateY(0);
        }
    }
    @keyframes upper-spine {
        0% {
            transform: rotate(0);
        }
        18% {
            transform: rotate(calc(var(--amp, 1) * -6deg));
        } /* load down-back */
        38%,
        50% {
            transform: rotate(calc(var(--amp, 1) * 8deg));
        } /* drive up-forward */
        70% {
            transform: rotate(calc(var(--amp, 1) * 10deg));
        }
        100% {
            transform: rotate(0);
        }
    }
    /* contact: elbow forward-low, forearm vertical — fist drives straight up
       in front of the face to (90,~60) */
    @keyframes upper-arm {
        0% {
            transform: rotate(29deg);
        }
        18% {
            transform: rotate(39deg);
        }
        38%,
        50% {
            transform: rotate(-21deg);
        }
        70% {
            transform: rotate(-26deg);
        }
        100% {
            transform: rotate(29deg);
        }
    }
    @keyframes upper-forearm {
        0% {
            transform: rotate(-150deg);
        }
        18% {
            transform: rotate(-125deg);
        } /* glove dips to load */
        38%,
        50% {
            transform: rotate(-129deg);
        }
        70% {
            transform: rotate(-129deg);
        }
        100% {
            transform: rotate(-150deg);
        }
    }
    @keyframes upper-glove {
        0%,
        30% {
            transform: scale(1);
        }
        38%,
        50% {
            transform: scale(0.85, 1.3);
        } /* contact squash (rising) */
        62% {
            transform: scale(1.05);
        }
        100% {
            transform: scale(1);
        }
    }

    /* atk-hook: horizontal arc; a 2-frame smear reads the sweep */
    .rig.atk-hook {
        @include g.oneshot(580ms);
        animation-name: hook-root;
        .spine {
            @include g.oneshot(580ms);
            animation-name: hook-spine;
        }
        .arm.front {
            @include g.oneshot(580ms);
            animation-name: hook-arm;
        }
        .forearm.front {
            @include g.oneshot(580ms);
            animation-name: hook-forearm;
        }
        .smear {
            @include g.oneshot(580ms);
            animation-name: hook-smear;
        }
    }
    @keyframes hook-root {
        0% {
            transform: translateX(0);
        }
        18% {
            transform: translateX(calc(var(--amp, 1) * -2px));
        }
        38%,
        50% {
            transform: translateX(calc(var(--amp, 1) * 6px));
        }
        70% {
            transform: translateX(calc(var(--amp, 1) * 8px));
        }
        100% {
            transform: translateX(0);
        }
    }
    @keyframes hook-spine {
        0% {
            transform: rotate(0);
        }
        18% {
            transform: rotate(calc(var(--amp, 1) * -7deg));
        } /* wind */
        38%,
        50% {
            transform: rotate(calc(var(--amp, 1) * 9deg));
        } /* sweep-through + hold */
        70% {
            transform: rotate(calc(var(--amp, 1) * 11deg));
        }
        100% {
            transform: rotate(0);
        }
    }
    /* wind: glove pulls in across the body (elbow lifts); sweep: arm+forearm
       aligned at ~5° absolute, glove at full horizontal extension (111,70) */
    @keyframes hook-arm {
        0% {
            transform: rotate(29deg);
        }
        18% {
            transform: rotate(54deg);
        } /* wind: glove tucked to rear shoulder */
        38%,
        50% {
            transform: rotate(-61deg);
        } /* sweep across + hold */
        70% {
            transform: rotate(-66deg);
        }
        100% {
            transform: rotate(29deg);
        }
    }
    @keyframes hook-forearm {
        0% {
            transform: rotate(-150deg);
        }
        18% {
            transform: rotate(-250deg);
        } /* keeps turning the same way through the sweep */
        38%,
        50% {
            transform: rotate(-350deg);
        }
        70% {
            transform: rotate(-346deg);
        }
        100% {
            transform: rotate(-150deg);
        }
    }
    /* 2-frame smear: a faint arc streak flashed only across the sweep */
    @keyframes hook-smear {
        0%,
        34% {
            opacity: 0;
        }
        38% {
            opacity: 0.4;
        }
        42% {
            opacity: 0;
        }
        100% {
            opacity: 0;
        }
    }

    /* ctr-slip-jab: slip first (won on points), then jab out */
    .rig.ctr-slip-jab {
        @include g.oneshot(640ms);
        animation-name: slip-root;
        .spine {
            @include g.oneshot(640ms);
            animation-name: slip-spine;
        }
        .arm.front {
            @include g.oneshot(640ms);
            animation-name: slip-arm;
        }
        .forearm.front {
            @include g.oneshot(640ms);
            animation-name: slip-forearm;
        }
        .glove.front {
            @include g.oneshot(640ms);
            animation-name: cross-glove;
        }
    }
    @keyframes slip-root {
        0% {
            transform: translate(0, 0);
        }
        18% {
            transform: translate(calc(var(--amp, 1) * -6px), calc(var(--amp, 1) * 3px));
        } /* the slip */
        38%,
        50% {
            transform: translate(calc(var(--amp, 1) * 4px), 0);
        } /* jab out + hold */
        70% {
            transform: translate(calc(var(--amp, 1) * 6px), 0);
        }
        100% {
            transform: translate(0, 0);
        }
    }
    @keyframes slip-spine {
        0% {
            transform: rotate(0);
        }
        18% {
            transform: rotate(calc(var(--amp, 1) * -10deg));
        } /* slip off the line */
        38%,
        50% {
            transform: rotate(calc(var(--amp, 1) * 2deg));
        }
        70% {
            transform: rotate(calc(var(--amp, 1) * 3deg));
        }
        100% {
            transform: rotate(0);
        }
    }
    @keyframes slip-arm {
        0% {
            transform: rotate(29deg);
        }
        18% {
            transform: rotate(34deg);
        }
        38%,
        50% {
            transform: rotate(-71deg);
        } /* extend: arm at ~-5° absolute */
        70% {
            transform: rotate(-73deg);
        }
        100% {
            transform: rotate(29deg);
        }
    }
    @keyframes slip-forearm {
        0% {
            transform: rotate(-150deg);
        }
        18% {
            transform: rotate(-155deg);
        }
        38%,
        50% {
            transform: rotate(10deg);
        } /* straighten into the jab, glove at (112,64) */
        70% {
            transform: rotate(10deg);
        }
        100% {
            transform: rotate(-150deg);
        }
    }

    /* ctr-block-hook: absorb (guard 0-30%) then answer (contact 55-65%) */
    .rig.ctr-block-hook {
        @include g.oneshot(700ms);
        animation-name: blockhook-root;
        .spine {
            @include g.oneshot(700ms);
            animation-name: blockhook-spine;
        }
        .forearm.front {
            @include g.oneshot(700ms);
            animation-name: blockhook-fore-front;
        }
        .forearm.back {
            @include g.oneshot(700ms);
            animation-name: blockhook-fore-back;
        }
        .arm.back {
            @include g.oneshot(700ms);
            animation-name: blockhook-arm-back;
        }
        .glove.back {
            @include g.oneshot(700ms);
            animation-name: cross-glove;
        }
    }
    @keyframes blockhook-root {
        0%,
        30% {
            transform: translateX(0);
        } /* absorb, planted */
        55%,
        65% {
            transform: translateX(calc(var(--amp, 1) * 7px));
        } /* answer + hold */
        80% {
            transform: translateX(calc(var(--amp, 1) * 9px));
        }
        100% {
            transform: translateX(0);
        }
    }
    @keyframes blockhook-spine {
        0%,
        30% {
            transform: rotate(calc(var(--amp, 1) * -4deg));
        }
        55%,
        65% {
            transform: rotate(calc(var(--amp, 1) * 8deg));
        }
        80% {
            transform: rotate(calc(var(--amp, 1) * 10deg));
        }
        100% {
            transform: rotate(0);
        }
    }
    @keyframes blockhook-fore-front {
        0% {
            transform: rotate(-150deg);
        }
        30% {
            transform: rotate(-175deg);
        } /* shield up in front of the face */
        55%,
        65% {
            transform: rotate(-175deg);
        }
        100% {
            transform: rotate(-150deg);
        }
    }
    @keyframes blockhook-fore-back {
        0%,
        30% {
            transform: rotate(-92deg);
        } /* hold guard while absorbing */
        55%,
        65% {
            transform: rotate(-3deg);
        } /* whip the hook out */
        100% {
            transform: rotate(-92deg);
        }
    }
    @keyframes blockhook-arm-back {
        0%,
        30% {
            transform: rotate(-100deg);
        }
        55%,
        65% {
            transform: rotate(-114deg);
        } /* answer: rear arm level at ~0° absolute */
        80% {
            transform: rotate(-116deg);
        }
        100% {
            transform: rotate(-100deg);
        }
    }

    /* ===================================================================== */
    /* Wave-1 hero hit reactions (settle ease)                               */
    /* ===================================================================== */

    /* hit-head-snap: head whips back, quick recover */
    .rig.hit-head-snap {
        @include g.oneshot(480ms);
        animation-name: headsnap-root;
        .head {
            @include g.oneshot(480ms);
            animation-name: headsnap-head;
        }
        .neck {
            @include g.oneshot(480ms);
            animation-name: headsnap-neck;
        }
        .flash {
            @include g.oneshot(480ms);
            animation-name: hit-flash;
        }
    }
    @keyframes headsnap-root {
        0% {
            transform: translateX(0);
        }
        20% {
            transform: translateX(calc(var(--amp, 1) * -7px));
        }
        100% {
            transform: translateX(0);
        }
    }
    @keyframes headsnap-head {
        0% {
            transform: rotate(0);
        }
        15%,
        25% {
            transform: rotate(calc(var(--amp, 1) * -22deg));
        }
        100% {
            transform: rotate(0);
        }
    }
    @keyframes headsnap-neck {
        0% {
            transform: rotate(0);
        }
        15%,
        25% {
            transform: rotate(calc(var(--amp, 1) * -8deg));
        }
        100% {
            transform: rotate(0);
        }
    }
    @keyframes hit-flash {
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

    /* hit-gut-fold: body folds forward over the gut */
    .rig.hit-gut-fold {
        @include g.oneshot(560ms);
        animation-name: gutfold-root;
        .spine {
            @include g.oneshot(560ms);
            animation-name: gutfold-spine;
        }
        .arm.front {
            @include g.oneshot(560ms);
            animation-name: gutfold-arm-front;
        }
        .arm.back {
            @include g.oneshot(560ms);
            animation-name: gutfold-arm-back;
        }
        .flash {
            @include g.oneshot(560ms);
            animation-name: hit-flash;
        }
    }
    @keyframes gutfold-root {
        0% {
            transform: translateY(0);
        }
        20%,
        32% {
            transform: translateY(calc(var(--amp, 1) * 3px));
        }
        100% {
            transform: translateY(0);
        }
    }
    @keyframes gutfold-spine {
        0% {
            transform: rotate(0);
        }
        20%,
        32% {
            transform: rotate(calc(var(--amp, 1) * 18deg));
        } /* fold */
        100% {
            transform: rotate(0);
        }
    }
    @keyframes gutfold-arm-front {
        0% {
            transform: rotate(29deg);
        }
        20%,
        32% {
            transform: rotate(39deg);
        } /* arms drop */
        100% {
            transform: rotate(29deg);
        }
    }
    @keyframes gutfold-arm-back {
        0% {
            transform: rotate(-100deg);
        }
        20%,
        32% {
            transform: rotate(-90deg);
        }
        100% {
            transform: rotate(-100deg);
        }
    }

    /* hit-stagger: three discrete stumble beats backward */
    .rig.hit-stagger {
        @include g.oneshot(640ms);
        animation-name: stagger-root;
        .flash {
            @include g.oneshot(640ms);
            animation-name: hit-flash;
        }
    }
    @keyframes stagger-root {
        0% {
            transform: translateX(0) rotate(0);
        }
        20% {
            transform: translateX(calc(var(--amp, 1) * -4px))
                rotate(calc(var(--amp, 1) * -3deg));
        }
        45% {
            transform: translateX(calc(var(--amp, 1) * -8px))
                rotate(calc(var(--amp, 1) * 3deg));
        }
        70% {
            transform: translateX(calc(var(--amp, 1) * -11px))
                rotate(calc(var(--amp, 1) * -3deg));
        }
        100% {
            transform: translateX(0) rotate(0);
        }
    }

    /* def-step-back: deliberate hop back, front glove raised (not a flinch) */
    .rig.def-step-back {
        @include g.oneshot(600ms);
        animation-name: stepback-root;
        .arm.front {
            @include g.oneshot(600ms);
            animation-name: stepback-arm-front;
        }
    }
    @keyframes stepback-root {
        0% {
            transform: translateX(0);
        }
        30% {
            transform: translateX(calc(var(--amp, 1) * -9px));
        } /* hop back */
        100% {
            transform: translateX(0);
        }
    }
    @keyframes stepback-arm-front {
        0% {
            transform: rotate(29deg);
        }
        30%,
        80% {
            transform: rotate(-41deg);
        } /* front glove raised to face height, held */
        100% {
            transform: rotate(29deg);
        }
    }

    /* ===================================================================== */
    /* Wave-1 bag strikes (hero-only; reuse the attack + counter keyframes)  */
    /* ===================================================================== */

    .rig.bag-jab {
        @include g.oneshot(340ms);
        animation-name: slip-root;
        .arm.front {
            @include g.oneshot(340ms);
            animation-name: slip-arm;
        }
        .forearm.front {
            @include g.oneshot(340ms);
            animation-name: slip-forearm;
        }
        .glove.front {
            @include g.oneshot(340ms);
            animation-name: cross-glove;
        }
    }
    .rig.bag-cross {
        @include g.oneshot(500ms);
        animation-name: cross-root;
        .spine {
            @include g.oneshot(500ms);
            animation-name: cross-spine;
        }
        .arm.back {
            @include g.oneshot(500ms);
            animation-name: cross-arm;
        }
        .forearm.back {
            @include g.oneshot(500ms);
            animation-name: cross-forearm;
        }
        .glove.back {
            @include g.oneshot(500ms);
            animation-name: cross-glove;
        }
    }
    .rig.bag-hook {
        @include g.oneshot(520ms);
        animation-name: hook-root;
        .spine {
            @include g.oneshot(520ms);
            animation-name: hook-spine;
        }
        .arm.front {
            @include g.oneshot(520ms);
            animation-name: hook-arm;
        }
        .forearm.front {
            @include g.oneshot(520ms);
            animation-name: hook-forearm;
        }
        .glove.front {
            @include g.oneshot(520ms);
            animation-name: cross-glove;
        }
    }
    .rig.bag-uppercut {
        @include g.oneshot(550ms);
        animation-name: upper-root;
        .spine {
            @include g.oneshot(550ms);
            animation-name: upper-spine;
        }
        .arm.front {
            @include g.oneshot(550ms);
            animation-name: upper-arm;
        }
        .forearm.front {
            @include g.oneshot(550ms);
            animation-name: upper-forearm;
        }
        .glove.front {
            @include g.oneshot(550ms);
            animation-name: upper-glove;
        }
    }

    /* ===================================================================== */
    /* Wave-1 results                                                        */
    /* ===================================================================== */

    /* win-arms-up: crouch then throw both arms up with two hops */
    .rig.win-arms-up {
        @include g.oneshot(1200ms);
        animation-name: win-root;
        .arm.front {
            @include g.oneshot(1200ms);
            animation-name: win-arm-front;
        }
        .arm.back {
            @include g.oneshot(1200ms);
            animation-name: win-arm-back;
        }
        .forearm.front {
            @include g.oneshot(1200ms);
            animation-name: win-fore-front;
        }
        .forearm.back {
            @include g.oneshot(1200ms);
            animation-name: win-fore-back;
        }
    }
    @keyframes win-root {
        0% {
            transform: translateY(0);
        }
        15% {
            transform: translateY(calc(var(--amp, 1) * 4px));
        } /* crouch */
        40% {
            transform: translateY(calc(var(--amp, 1) * -6px));
        } /* hop 1 */
        55% {
            transform: translateY(0);
        }
        70% {
            transform: translateY(calc(var(--amp, 1) * -4px));
        } /* hop 2 */
        100% {
            transform: translateY(0);
        }
    }
    /* both arms thrown up into a V (front sweeps forward-over, back sweeps
       back-over), forearms extended in line with the arms */
    @keyframes win-arm-front {
        0%,
        15% {
            transform: rotate(29deg);
        }
        30% {
            transform: rotate(219deg);
        } /* thrown up-out: glove at (87,32) */
        100% {
            transform: rotate(219deg);
        }
    }
    @keyframes win-arm-back {
        0%,
        15% {
            transform: rotate(-100deg);
        }
        30% {
            transform: rotate(-219deg);
        } /* thrown up-out: glove at (33,32) */
        100% {
            transform: rotate(-219deg);
        }
    }
    @keyframes win-fore-front {
        0%,
        15% {
            transform: rotate(-150deg);
        }
        30% {
            transform: rotate(-346deg);
        }
        100% {
            transform: rotate(-346deg);
        }
    }
    @keyframes win-fore-back {
        0%,
        15% {
            transform: rotate(-92deg);
        }
        30% {
            transform: rotate(-107deg);
        }
        100% {
            transform: rotate(-107deg);
        }
    }

    /* draw-glove-touch: front glove extends to center, head nod */
    .rig.draw-glove-touch {
        @include g.oneshot(900ms);
        animation-name: draw-root;
        .arm.front {
            @include g.oneshot(900ms);
            animation-name: draw-arm-front;
        }
        .forearm.front {
            @include g.oneshot(900ms);
            animation-name: draw-fore-front;
        }
        .head {
            @include g.oneshot(900ms);
            animation-name: draw-head;
        }
    }
    @keyframes draw-root {
        0%,
        100% {
            transform: translateX(0);
        }
    }
    @keyframes draw-arm-front {
        0% {
            transform: rotate(29deg);
        }
        35%,
        65% {
            transform: rotate(-51deg);
        } /* extend to center */
        100% {
            transform: rotate(29deg);
        }
    }
    @keyframes draw-fore-front {
        0% {
            transform: rotate(-150deg);
        }
        35%,
        65% {
            transform: rotate(6deg);
        } /* arm+forearm level: offering the glove */
        100% {
            transform: rotate(-150deg);
        }
    }
    @keyframes draw-head {
        0%,
        30% {
            transform: rotate(0);
        }
        45% {
            transform: rotate(calc(var(--amp, 1) * 8deg));
        } /* nod */
        60% {
            transform: rotate(0);
        }
        100% {
            transform: rotate(0);
        }
    }

    /* loss-towel-nod: head drops, then back to guard (determined, not humiliated) */
    .rig.loss-towel-nod {
        @include g.oneshot(1100ms);
        animation-name: loss-root;
        .head {
            @include g.oneshot(1100ms);
            animation-name: loss-head;
        }
        .neck {
            @include g.oneshot(1100ms);
            animation-name: loss-neck;
        }
    }
    @keyframes loss-root {
        0%,
        100% {
            transform: translateX(0);
        }
    }
    @keyframes loss-head {
        0% {
            transform: rotate(0);
        }
        20%,
        50% {
            transform: rotate(calc(var(--amp, 1) * 14deg));
        } /* head drops */
        80%,
        100% {
            transform: rotate(0);
        } /* back up */
    }
    @keyframes loss-neck {
        0% {
            transform: rotate(0);
        }
        20%,
        50% {
            transform: rotate(calc(var(--amp, 1) * 6deg));
        }
        80%,
        100% {
            transform: rotate(0);
        }
    }

    /* ===================================================================== */
    /* Wave-1 opponent clips — reuse hero keyframes; rig is facing-mirrored  */
    /* ===================================================================== */

    /* opp-atk-jab: telegraph IS the first half (hero hit lands at +220ms) */
    .rig.opp-atk-jab {
        @include g.oneshot(420ms);
        animation-name: opp-jab-root;
        .arm.front {
            @include g.oneshot(420ms);
            animation-name: opp-jab-arm;
        }
        .forearm.front {
            @include g.oneshot(420ms);
            animation-name: opp-jab-fore;
        }
        .glove.front {
            @include g.oneshot(420ms);
            animation-name: cross-glove;
        }
    }
    @keyframes opp-jab-root {
        0%,
        52% {
            transform: translateX(0);
        }
        62%,
        74% {
            transform: translateX(calc(var(--amp, 1) * 5px));
        } /* contact + hold */
        100% {
            transform: translateX(0);
        }
    }
    @keyframes opp-jab-arm {
        0% {
            transform: rotate(29deg);
        }
        52% {
            transform: rotate(44deg);
        } /* slow telegraph wind: glove tucks to chest */
        62%,
        74% {
            transform: rotate(-70deg);
        } /* release: arm level, glove at (112,65) */
        100% {
            transform: rotate(29deg);
        }
    }
    @keyframes opp-jab-fore {
        0% {
            transform: rotate(-150deg);
        }
        52% {
            transform: rotate(-220deg);
        }
        62%,
        74% {
            transform: rotate(-350deg);
        }
        100% {
            transform: rotate(-150deg);
        }
    }

    /* opp-atk-cross: telegraph in the spine (0-45%), contact 55-70% */
    .rig.opp-atk-cross {
        @include g.oneshot(520ms);
        animation-name: opp-cross-root;
        .spine {
            @include g.oneshot(520ms);
            animation-name: opp-cross-spine;
        }
        .arm.back {
            @include g.oneshot(520ms);
            animation-name: opp-cross-arm;
        }
        .forearm.back {
            @include g.oneshot(520ms);
            animation-name: opp-cross-fore;
        }
        .glove.back {
            @include g.oneshot(520ms);
            animation-name: cross-glove;
        }
    }
    @keyframes opp-cross-root {
        0%,
        45% {
            transform: translateX(0);
        }
        55%,
        70% {
            transform: translateX(calc(var(--amp, 1) * 8px));
        }
        100% {
            transform: translateX(0);
        }
    }
    @keyframes opp-cross-spine {
        0% {
            transform: rotate(0);
        }
        45% {
            transform: rotate(calc(var(--amp, 1) * -8deg));
        } /* telegraph: wind back */
        55%,
        70% {
            transform: rotate(calc(var(--amp, 1) * 10deg));
        } /* drive through */
        100% {
            transform: rotate(0);
        }
    }
    @keyframes opp-cross-arm {
        0% {
            transform: rotate(-100deg);
        }
        45% {
            transform: rotate(-94deg);
        }
        55%,
        70% {
            transform: rotate(-120deg);
        }
        100% {
            transform: rotate(-100deg);
        }
    }
    @keyframes opp-cross-fore {
        0% {
            transform: rotate(-92deg);
        }
        45% {
            transform: rotate(-129deg);
        }
        55%,
        70% {
            transform: rotate(-3deg);
        }
        100% {
            transform: rotate(-92deg);
        }
    }

    /* opp-hit-head-snap / opp-hit-gut-fold reuse the hero hit keyframes */
    .rig.opp-hit-head-snap {
        @include g.oneshot(480ms);
        animation-name: headsnap-root;
        .head {
            @include g.oneshot(480ms);
            animation-name: headsnap-head;
        }
        .neck {
            @include g.oneshot(480ms);
            animation-name: headsnap-neck;
        }
    }
    .rig.opp-hit-gut-fold {
        @include g.oneshot(560ms);
        animation-name: gutfold-root;
        .spine {
            @include g.oneshot(560ms);
            animation-name: gutfold-spine;
        }
        .arm.front {
            @include g.oneshot(560ms);
            animation-name: gutfold-arm-front;
        }
        .arm.back {
            @include g.oneshot(560ms);
            animation-name: gutfold-arm-back;
        }
    }

    /* opp-hit-stagger-ropes: stagger into the ropes then rebound */
    .rig.opp-hit-stagger-ropes {
        @include g.oneshot(640ms);
        animation-name: opp-ropes-root;
    }
    @keyframes opp-ropes-root {
        0% {
            transform: translateX(0) rotate(0);
        }
        30% {
            transform: translateX(calc(var(--amp, 1) * 10px))
                rotate(calc(var(--amp, 1) * 6deg));
        } /* into ropes */
        70% {
            transform: translateX(calc(var(--amp, 1) * 4px))
                rotate(calc(var(--amp, 1) * 2deg));
        } /* rebound */
        100% {
            transform: translateX(0) rotate(0);
        }
    }

    /* opp-block: both forearms to guard, held 25-75% */
    .rig.opp-block {
        @include g.oneshot(500ms);
        animation-name: opp-block-root;
        .forearm.front {
            @include g.oneshot(500ms);
            animation-name: opp-block-fore-front;
        }
        .forearm.back {
            @include g.oneshot(500ms);
            animation-name: opp-block-fore-back;
        }
    }
    @keyframes opp-block-root {
        0%,
        100% {
            transform: translateX(0);
        }
    }
    @keyframes opp-block-fore-front {
        0% {
            transform: rotate(-150deg);
        }
        25%,
        75% {
            transform: rotate(-175deg);
        }
        100% {
            transform: rotate(-150deg);
        }
    }
    @keyframes opp-block-fore-back {
        0% {
            transform: rotate(-92deg);
        }
        25%,
        75% {
            transform: rotate(-101deg);
        }
        100% {
            transform: rotate(-92deg);
        }
    }

    /* opp-taunt-respect-nod: head dip + front glove taps chest (IDK + draw) */
    .rig.opp-taunt-respect-nod {
        @include g.oneshot(700ms);
        animation-name: opp-nod-root;
        .head {
            @include g.oneshot(700ms);
            animation-name: opp-nod-head;
        }
        .arm.front {
            @include g.oneshot(700ms);
            animation-name: opp-nod-arm;
        }
        .forearm.front {
            @include g.oneshot(700ms);
            animation-name: opp-nod-fore;
        }
    }
    @keyframes opp-nod-root {
        0%,
        100% {
            transform: translateX(0);
        }
    }
    @keyframes opp-nod-head {
        0%,
        30% {
            transform: rotate(0);
        }
        45% {
            transform: rotate(calc(var(--amp, 1) * 10deg));
        } /* respectful dip */
        60% {
            transform: rotate(0);
        }
        100% {
            transform: rotate(0);
        }
    }
    @keyframes opp-nod-arm {
        0% {
            transform: rotate(29deg);
        }
        40% {
            transform: rotate(40deg);
        } /* tap chest */
        100% {
            transform: rotate(29deg);
        }
    }
    @keyframes opp-nod-fore {
        0% {
            transform: rotate(-150deg);
        }
        40% {
            transform: rotate(-185deg);
        } /* glove lands on the pecs */
        100% {
            transform: rotate(-150deg);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .rig,
        .rig :global(*) {
            animation: none !important;
        }
    }
</style>
