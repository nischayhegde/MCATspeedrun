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
                <ellipse class="rope" cx="60" cy="76" rx="40" ry="60" />
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
                            <rect class="flash" x="30" y="10" width="70" height="120" rx="8" />
                            <g class="arm front" style={origin(j.armFront)}>
                                <path d={body.limbs.armFront} />
                                <g class="forearm front" style={origin(j.forearmFront)}>
                                    <path d={body.limbs.forearmFront} />
                                    <path
                                        class="smear"
                                        d="M {j.forearmFront[0] - 10} {j.forearmFront[1] + 6} Q {j.forearmFront[0] + 14} {j.forearmFront[1] - 2} {j.forearmFront[0] + 8} {j.forearmFront[1] + 24}"
                                    />
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
    svg :global(g),
    .rope,
    .smear,
    .flash {
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
        0% { transform: scaleY(1); }
        50% { transform: scaleY(-1); }
        100% { transform: scaleY(1); }
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
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(calc(var(--amp, 1) * -3px)); }
    }
    @keyframes bounce-pelvis {
        0%, 100% { transform: rotate(calc(var(--amp, 1) * 2deg)); }
        50% { transform: rotate(calc(var(--amp, 1) * -2deg)); }
    }

    /* stance-spent: dropped shoulders, shallow breath (intensity 1). */
    .rig.stance-spent {
        @include g.loop(3.2s);
        animation-name: spent-root;
        .chest {
            transform: rotate(3deg);
        }
        .arm.front { transform: rotate(82deg); }
        .forearm.front { transform: rotate(158deg); }
        .arm.back { transform: rotate(-84deg); }
        .forearm.back { transform: rotate(-116deg); }
    }
    @keyframes spent-root {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(calc(var(--amp, 1) * -1px)); }
    }

    /* stance-jumprope: hop + rope toggle (intensity 1). Ported from the old
       BoxerFigure hop/rope onto the rig; rope is the .shadow-less .rope. */
    .rig.stance-jumprope {
        @include g.loop(520ms);
        animation-name: jumprope-hop;
        .arm.front { transform: rotate(82deg); }
        .forearm.front { transform: rotate(158deg); }
        .arm.back { transform: rotate(-84deg); }
        .forearm.back { transform: rotate(-116deg); }
    }
    @keyframes jumprope-hop {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(calc(var(--amp, 1) * -9px)); }
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
        .glove.back {
            @include g.oneshot(560ms);
            animation-name: cross-glove;
        }
    }
    @keyframes cross-root {
        0% { transform: translateX(0); }
        18% { transform: translateX(calc(var(--amp, 1) * -3px)); }   /* anticipation */
        38%, 50% { transform: translateX(calc(var(--amp, 1) * 9px)); } /* contact + hold */
        70% { transform: translateX(calc(var(--amp, 1) * 11px)); }   /* overshoot */
        100% { transform: translateX(0); }                            /* settle */
    }
    @keyframes cross-spine {
        0% { transform: rotate(0); }
        18% { transform: rotate(calc(var(--amp, 1) * 6deg)); }
        38%, 50% { transform: rotate(calc(var(--amp, 1) * -10deg)); }
        70% { transform: rotate(calc(var(--amp, 1) * -12deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes cross-arm {
        0% { transform: rotate(30deg); }
        18% { transform: rotate(48deg); }
        38%, 50% { transform: rotate(-64deg); }
        70% { transform: rotate(-70deg); }
        100% { transform: rotate(30deg); }
    }
    @keyframes cross-forearm {
        0% { transform: rotate(70deg); }
        18% { transform: rotate(85deg); }
        38%, 50% { transform: rotate(-6deg); }
        70% { transform: rotate(-10deg); }
        100% { transform: rotate(70deg); }
    }
    @keyframes cross-glove {
        0%, 30% { transform: scale(1); }
        38%, 50% { transform: scale(1.3, 0.85); } /* contact squash */
        62% { transform: scale(1.05); }
        100% { transform: scale(1); }
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
        .glove.front {
            @include g.oneshot(620ms);
            animation-name: upper-glove;
        }
    }
    @keyframes upper-root {
        0% { transform: translateY(0); }
        18% { transform: translateY(calc(var(--amp, 1) * 4px)); }    /* dip */
        38%, 50% { transform: translateY(calc(var(--amp, 1) * -5px)); } /* spring + hold */
        70% { transform: translateY(calc(var(--amp, 1) * -7px)); }
        100% { transform: translateY(0); }
    }
    @keyframes upper-spine {
        0% { transform: rotate(0); }
        18% { transform: rotate(calc(var(--amp, 1) * 8deg)); }
        38%, 50% { transform: rotate(calc(var(--amp, 1) * -6deg)); }
        70% { transform: rotate(calc(var(--amp, 1) * -8deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes upper-arm {
        0% { transform: rotate(82deg); }
        18% { transform: rotate(96deg); }
        38%, 50% { transform: rotate(-88deg); }
        70% { transform: rotate(-94deg); }
        100% { transform: rotate(82deg); }
    }
    @keyframes upper-forearm {
        0% { transform: rotate(158deg); }
        18% { transform: rotate(150deg); }
        38%, 50% { transform: rotate(40deg); }
        70% { transform: rotate(34deg); }
        100% { transform: rotate(158deg); }
    }
    @keyframes upper-glove {
        0%, 30% { transform: scale(1); }
        38%, 50% { transform: scale(0.85, 1.3); } /* contact squash (rising) */
        62% { transform: scale(1.05); }
        100% { transform: scale(1); }
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
        .glove.front {
            @include g.oneshot(580ms);
            animation-name: cross-glove;
        }
        .smear {
            @include g.oneshot(580ms);
            animation-name: hook-smear;
        }
    }
    @keyframes hook-root {
        0% { transform: translateX(0); }
        18% { transform: translateX(calc(var(--amp, 1) * -2px)); }
        38%, 50% { transform: translateX(calc(var(--amp, 1) * 6px)); }
        70% { transform: translateX(calc(var(--amp, 1) * 8px)); }
        100% { transform: translateX(0); }
    }
    @keyframes hook-spine {
        0% { transform: rotate(0); }
        18% { transform: rotate(calc(var(--amp, 1) * -7deg)); }  /* wind */
        38%, 50% { transform: rotate(calc(var(--amp, 1) * 9deg)); } /* sweep-through + hold */
        70% { transform: rotate(calc(var(--amp, 1) * 11deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes hook-arm {
        0% { transform: rotate(82deg); }
        18% { transform: rotate(-80deg); }   /* wind up wide */
        38%, 50% { transform: rotate(-20deg); } /* sweep across + hold */
        70% { transform: rotate(-14deg); }
        100% { transform: rotate(82deg); }
    }
    @keyframes hook-forearm {
        0% { transform: rotate(158deg); }
        18% { transform: rotate(-40deg); }
        38%, 50% { transform: rotate(-70deg); }
        70% { transform: rotate(-66deg); }
        100% { transform: rotate(158deg); }
    }
    /* 2-frame smear: a faint arc streak flashed only across the sweep */
    @keyframes hook-smear {
        0%, 34% { opacity: 0; }
        38% { opacity: 0.4; }
        42% { opacity: 0; }
        100% { opacity: 0; }
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
        0% { transform: translate(0, 0); }
        18% { transform: translate(calc(var(--amp, 1) * -6px), calc(var(--amp, 1) * 3px)); } /* the slip */
        38%, 50% { transform: translate(calc(var(--amp, 1) * 4px), 0); } /* jab out + hold */
        70% { transform: translate(calc(var(--amp, 1) * 6px), 0); }
        100% { transform: translate(0, 0); }
    }
    @keyframes slip-spine {
        0% { transform: rotate(0); }
        18% { transform: rotate(calc(var(--amp, 1) * -10deg)); } /* slip off the line */
        38%, 50% { transform: rotate(calc(var(--amp, 1) * 2deg)); }
        70% { transform: rotate(calc(var(--amp, 1) * 3deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes slip-arm {
        0% { transform: rotate(82deg); }
        18% { transform: rotate(76deg); }
        38%, 50% { transform: rotate(-84deg); }  /* extend */
        70% { transform: rotate(-88deg); }
        100% { transform: rotate(82deg); }
    }
    @keyframes slip-forearm {
        0% { transform: rotate(158deg); }
        18% { transform: rotate(150deg); }
        38%, 50% { transform: rotate(0); }  /* straighten into the jab */
        70% { transform: rotate(-4deg); }
        100% { transform: rotate(158deg); }
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
        0%, 30% { transform: translateX(0); }             /* absorb, planted */
        55%, 65% { transform: translateX(calc(var(--amp, 1) * 7px)); } /* answer + hold */
        80% { transform: translateX(calc(var(--amp, 1) * 9px)); }
        100% { transform: translateX(0); }
    }
    @keyframes blockhook-spine {
        0%, 30% { transform: rotate(calc(var(--amp, 1) * -4deg)); }
        55%, 65% { transform: rotate(calc(var(--amp, 1) * 8deg)); }
        80% { transform: rotate(calc(var(--amp, 1) * 10deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes blockhook-fore-front {
        0% { transform: rotate(158deg); }
        30% { transform: rotate(-95deg); }  /* raise guard */
        55%, 65% { transform: rotate(-95deg); }
        100% { transform: rotate(158deg); }
    }
    @keyframes blockhook-fore-back {
        0% { transform: rotate(-116deg); }
        30% { transform: rotate(95deg); }  /* raise guard */
        55%, 65% { transform: rotate(-70deg); }  /* whip the hook */
        100% { transform: rotate(-116deg); }
    }
    @keyframes blockhook-arm-back {
        0%, 30% { transform: rotate(-84deg); }
        55%, 65% { transform: rotate(-24deg); }  /* answer hook */
        80% { transform: rotate(-18deg); }
        100% { transform: rotate(-84deg); }
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
        0% { transform: translateX(0); }
        20% { transform: translateX(calc(var(--amp, 1) * -7px)); }
        100% { transform: translateX(0); }
    }
    @keyframes headsnap-head {
        0% { transform: rotate(0); }
        15%, 25% { transform: rotate(calc(var(--amp, 1) * -22deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes headsnap-neck {
        0% { transform: rotate(0); }
        15%, 25% { transform: rotate(calc(var(--amp, 1) * -8deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes hit-flash {
        0% { opacity: 0; }
        25% { opacity: 1; }
        100% { opacity: 0; }
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
        0% { transform: translateY(0); }
        20%, 32% { transform: translateY(calc(var(--amp, 1) * 3px)); }
        100% { transform: translateY(0); }
    }
    @keyframes gutfold-spine {
        0% { transform: rotate(0); }
        20%, 32% { transform: rotate(calc(var(--amp, 1) * 18deg)); } /* fold */
        100% { transform: rotate(0); }
    }
    @keyframes gutfold-arm-front {
        0% { transform: rotate(82deg); }
        20%, 32% { transform: rotate(92deg); }  /* arms drop */
        100% { transform: rotate(82deg); }
    }
    @keyframes gutfold-arm-back {
        0% { transform: rotate(-84deg); }
        20%, 32% { transform: rotate(-94deg); }
        100% { transform: rotate(-84deg); }
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
        0% { transform: translateX(0) rotate(0); }
        20% { transform: translateX(calc(var(--amp, 1) * -4px)) rotate(calc(var(--amp, 1) * -3deg)); }
        45% { transform: translateX(calc(var(--amp, 1) * -8px)) rotate(calc(var(--amp, 1) * 3deg)); }
        70% { transform: translateX(calc(var(--amp, 1) * -11px)) rotate(calc(var(--amp, 1) * -3deg)); }
        100% { transform: translateX(0) rotate(0); }
    }

    /* def-step-back: deliberate hop back, front glove raised (not a flinch) */
    .rig.def-step-back {
        @include g.oneshot(600ms);
        animation-name: stepback-root;
        .arm.front {
            @include g.oneshot(600ms);
            animation-name: stepback-arm-front;
        }
        .arm.back { transform: rotate(-84deg); }
        .forearm.back { transform: rotate(-116deg); }
    }
    @keyframes stepback-root {
        0% { transform: translateX(0); }
        30% { transform: translateX(calc(var(--amp, 1) * -9px)); }  /* hop back */
        100% { transform: translateX(0); }
    }
    @keyframes stepback-arm-front {
        0% { transform: rotate(82deg); }
        30%, 80% { transform: rotate(-70deg); }  /* front glove raised, held */
        100% { transform: rotate(82deg); }
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
    }
    @keyframes win-root {
        0% { transform: translateY(0); }
        15% { transform: translateY(calc(var(--amp, 1) * 4px)); }   /* crouch */
        40% { transform: translateY(calc(var(--amp, 1) * -6px)); }  /* hop 1 */
        55% { transform: translateY(0); }
        70% { transform: translateY(calc(var(--amp, 1) * -4px)); }  /* hop 2 */
        100% { transform: translateY(0); }
    }
    @keyframes win-arm-front {
        0%, 15% { transform: rotate(82deg); }
        30% { transform: rotate(150deg); }  /* thrown up */
        100% { transform: rotate(150deg); }
    }
    @keyframes win-arm-back {
        0%, 15% { transform: rotate(-84deg); }
        30% { transform: rotate(-150deg); }  /* thrown up */
        100% { transform: rotate(-150deg); }
    }

    /* draw-glove-touch: front glove extends to center, head nod */
    .rig.draw-glove-touch {
        @include g.oneshot(900ms);
        animation-name: draw-arm-front;
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
        .arm.back { transform: rotate(-84deg); }
        .forearm.back { transform: rotate(-116deg); }
    }
    @keyframes draw-arm-front {
        0% { transform: rotate(82deg); }
        35%, 65% { transform: rotate(-60deg); }  /* extend to center */
        100% { transform: rotate(82deg); }
    }
    @keyframes draw-fore-front {
        0% { transform: rotate(158deg); }
        35%, 65% { transform: rotate(10deg); }
        100% { transform: rotate(158deg); }
    }
    @keyframes draw-head {
        0%, 30% { transform: rotate(0); }
        45% { transform: rotate(calc(var(--amp, 1) * 8deg)); }  /* nod */
        60% { transform: rotate(0); }
        100% { transform: rotate(0); }
    }

    /* loss-towel-nod: head drops, then back to guard (determined, not humiliated) */
    .rig.loss-towel-nod {
        @include g.oneshot(1100ms);
        animation-name: loss-head;
        .head {
            @include g.oneshot(1100ms);
            animation-name: loss-head;
        }
        .neck {
            @include g.oneshot(1100ms);
            animation-name: loss-neck;
        }
        .arm.front { transform: rotate(82deg); }
        .forearm.front { transform: rotate(158deg); }
        .arm.back { transform: rotate(-84deg); }
        .forearm.back { transform: rotate(-116deg); }
    }
    @keyframes loss-head {
        0% { transform: rotate(0); }
        20%, 50% { transform: rotate(calc(var(--amp, 1) * 14deg)); }  /* head drops */
        80%, 100% { transform: rotate(0); }                            /* back up */
    }
    @keyframes loss-neck {
        0% { transform: rotate(0); }
        20%, 50% { transform: rotate(calc(var(--amp, 1) * 6deg)); }
        80%, 100% { transform: rotate(0); }
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
        0%, 52% { transform: translateX(0); }
        62%, 74% { transform: translateX(calc(var(--amp, 1) * 5px)); }  /* contact + hold */
        100% { transform: translateX(0); }
    }
    @keyframes opp-jab-arm {
        0% { transform: rotate(82deg); }
        52% { transform: rotate(24deg); }   /* slow telegraph wind */
        62%, 74% { transform: rotate(-84deg); } /* release */
        100% { transform: rotate(82deg); }
    }
    @keyframes opp-jab-fore {
        0% { transform: rotate(158deg); }
        52% { transform: rotate(120deg); }
        62%, 74% { transform: rotate(0); }
        100% { transform: rotate(158deg); }
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
        0%, 45% { transform: translateX(0); }
        55%, 70% { transform: translateX(calc(var(--amp, 1) * 8px)); }
        100% { transform: translateX(0); }
    }
    @keyframes opp-cross-spine {
        0% { transform: rotate(0); }
        45% { transform: rotate(calc(var(--amp, 1) * 8deg)); }  /* telegraph */
        55%, 70% { transform: rotate(calc(var(--amp, 1) * -10deg)); }
        100% { transform: rotate(0); }
    }
    @keyframes opp-cross-arm {
        0%, 45% { transform: rotate(30deg); }
        55%, 70% { transform: rotate(-64deg); }
        100% { transform: rotate(30deg); }
    }
    @keyframes opp-cross-fore {
        0%, 45% { transform: rotate(70deg); }
        55%, 70% { transform: rotate(-6deg); }
        100% { transform: rotate(70deg); }
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
        0% { transform: translateX(0) rotate(0); }
        30% { transform: translateX(calc(var(--amp, 1) * 10px)) rotate(calc(var(--amp, 1) * 6deg)); } /* into ropes */
        70% { transform: translateX(calc(var(--amp, 1) * 4px)) rotate(calc(var(--amp, 1) * 2deg)); }  /* rebound */
        100% { transform: translateX(0) rotate(0); }
    }

    /* opp-block: both forearms to guard, held 25-75% */
    .rig.opp-block {
        @include g.oneshot(500ms);
        animation-name: opp-block-fore-front;
        .forearm.front {
            @include g.oneshot(500ms);
            animation-name: opp-block-fore-front;
        }
        .forearm.back {
            @include g.oneshot(500ms);
            animation-name: opp-block-fore-back;
        }
    }
    @keyframes opp-block-fore-front {
        0% { transform: rotate(158deg); }
        25%, 75% { transform: rotate(-95deg); }
        100% { transform: rotate(158deg); }
    }
    @keyframes opp-block-fore-back {
        0% { transform: rotate(-116deg); }
        25%, 75% { transform: rotate(95deg); }
        100% { transform: rotate(-116deg); }
    }

    /* opp-taunt-respect-nod: head dip + front glove taps chest (IDK + draw) */
    .rig.opp-taunt-respect-nod {
        @include g.oneshot(700ms);
        animation-name: opp-nod-head;
        .head {
            @include g.oneshot(700ms);
            animation-name: opp-nod-head;
        }
        .arm.front {
            @include g.oneshot(700ms);
            animation-name: opp-nod-arm;
        }
    }
    @keyframes opp-nod-head {
        0%, 30% { transform: rotate(0); }
        45% { transform: rotate(calc(var(--amp, 1) * 10deg)); }  /* respectful dip */
        60% { transform: rotate(0); }
        100% { transform: rotate(0); }
    }
    @keyframes opp-nod-arm {
        0% { transform: rotate(82deg); }
        40% { transform: rotate(112deg); }  /* tap chest */
        100% { transform: rotate(82deg); }
    }

    @media (prefers-reduced-motion: reduce) {
        .rig,
        .rig :global(*) {
            animation: none !important;
        }
    }
</style>
