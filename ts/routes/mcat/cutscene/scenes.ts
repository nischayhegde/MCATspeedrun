// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

/* The intro cutscene timeline. Pure data, same contract as ring/clips.ts:
   durations live here and only here — Cutscene.svelte schedules from this
   table and its CSS reads them via custom properties. The monster scenes
   deliberately mirror the study-tab roster (ring/roster.ts): Sidewinder,
   Hobnail, Howler, Gravel, Bullhorn and Chiron are the opponents the player
   will meet in the ring, so the intro is their origin story. */

import city from "./assets/01-city.webp";
import arrest from "./assets/02-arrest.webp";
import tribunal from "./assets/03-tribunal.webp";
import gate from "./assets/04-gate.webp";
import descent from "./assets/05-descent.webp";
import pit from "./assets/06-pit.webp";
import cornerman from "./assets/07-cornerman.webp";
import sidewinder from "./assets/08-sidewinder.webp";
import impact from "./assets/09-impact.webp";
import hobnail from "./assets/10-hobnail.webp";
import howler from "./assets/11-howler.webp";
import gravel from "./assets/12-gravel.webp";
import bullhorn from "./assets/13-bullhorn.webp";
import cell from "./assets/14-cell.webp";
import chiron from "./assets/15-chiron.webp";
import resolve from "./assets/16-resolve.webp";

/* Ken Burns move: transform interpolates from (s0, x0, y0) to (s1, x1, y1)
   over the scene's hold. Translations are in % of frame size; scales stay
   inside 1.0-1.3 so the 1536x1024 frames never show edges. */
export interface KenBurns {
    s0: number;
    x0: number;
    y0: number;
    s1: number;
    x1: number;
    y1: number;
}

export type Enter = "fade" | "cut" | "flash" | "dip";

export interface Plate {
    text: string;
    tone: "gold" | "steel" | "err";
}

export interface CutsceneScene {
    id: string;
    /** Empty string = DOM-rendered card (no image). */
    img: string;
    /** Act label shown above the narration on act openers. */
    kicker?: string;
    text: string;
    /** Hold time for this scene, ms. */
    ms: number;
    kb: KenBurns;
    /** Transition used to bring this scene in. */
    enter: Enter;
    /** Stage shake fired as the scene lands (ring grammar levels). */
    shake?: 1 | 2 | 3;
    /** Lower-third nameplate, styled like the ring chyrons. */
    plate?: Plate;
}

const STILL: KenBurns = { s0: 1, x0: 0, y0: 0, s1: 1, x1: 0, y1: 0 };

export const SCENES: CutsceneScene[] = [
    {
        id: "city",
        img: city,
        kicker: "Act I — The Verdict",
        text: "Vhal. A city that buys its peace in blood — and calls the price justice.",
        ms: 7000,
        kb: { s0: 1.02, x0: 0, y0: 0, s1: 1.14, x1: -2, y1: -1.5 },
        enter: "dip",
    },
    {
        id: "arrest",
        img: arrest,
        text: "They came for him at midnight. No warrant. No questions. The verdict had been signed before the crime.",
        ms: 6500,
        kb: { s0: 1.18, x0: 2, y0: 1, s1: 1.06, x1: 0, y1: 0 },
        enter: "fade",
    },
    {
        id: "tribunal",
        img: tribunal,
        text: "Seven masks. One word — guilty. A murder he didn't commit, pinned to a name he'd never heard.",
        ms: 7000,
        kb: { s0: 1.04, x0: 0, y0: -1, s1: 1.16, x1: 0, y1: 1.5 },
        enter: "fade",
    },
    {
        id: "gate",
        img: gate,
        text: "The sentence was not death. Death ends. They sentenced him to the Pit: eternity, payable in rounds.",
        ms: 6500,
        kb: { s0: 1.12, x0: 0, y0: 2, s1: 1.02, x1: 0, y1: -0.5 },
        enter: "fade",
    },
    {
        id: "descent",
        img: descent,
        kicker: "Act II — The Pit",
        text:
            "Below the world there is a prison. Below the prison, there is a ring. No one has ever served a full sentence.",
        ms: 6500,
        kb: { s0: 1.06, x0: 0, y0: -2, s1: 1.18, x1: 0, y1: 2.5 },
        enter: "dip",
    },
    {
        id: "pit",
        img: pit,
        text: "The Pit Eternal. Ten thousand monsters in the dark — and one rule, written in old blood: you fight.",
        ms: 7000,
        kb: { s0: 1.22, x0: 0, y0: 3, s1: 1.04, x1: 0, y1: 0 },
        enter: "fade",
    },
    {
        id: "cornerman",
        img: cornerman,
        text:
            "A one-eyed cornerman wrapped his fists in red. “Forget innocent,” he said. “Innocent dies in round one.”",
        ms: 7000,
        kb: { s0: 1.05, x0: -1.5, y0: 0.5, s1: 1.17, x1: 1.5, y1: -0.5 },
        enter: "fade",
    },
    {
        id: "sidewinder",
        img: sidewinder,
        text: "The serpent came first — venom-quick, patient as debt.",
        ms: 6000,
        kb: { s0: 1.06, x0: 2, y0: 0, s1: 1.2, x1: -1.5, y1: 0.5 },
        enter: "fade",
        plate: { text: "SIDEWINDER", tone: "err" },
    },
    {
        id: "impact",
        img: impact,
        text: "He learned the Pit's first law that night: hesitate, and the dark keeps you.",
        ms: 5000,
        kb: { s0: 1.04, x0: 0, y0: 0, s1: 1.28, x1: 1, y1: -1 },
        enter: "flash",
        shake: 3,
        plate: { text: "POW!", tone: "gold" },
    },
    {
        id: "hobnail",
        img: hobnail,
        text: "They kept coming. Hobnail — who breaks bones for the sound.",
        ms: 5000,
        kb: { s0: 1.08, x0: -2, y0: 1, s1: 1.22, x1: 0, y1: -1 },
        enter: "cut",
        shake: 1,
        plate: { text: "HOBNAIL", tone: "err" },
    },
    {
        id: "howler",
        img: howler,
        text: "Howler — who hunts what's left of your nerve.",
        ms: 5000,
        kb: { s0: 1.06, x0: 2, y0: -1, s1: 1.2, x1: -1, y1: 1 },
        enter: "cut",
        shake: 1,
        plate: { text: "HOWLER", tone: "err" },
    },
    {
        id: "gravel",
        img: gravel,
        text: "Gravel — the mountain they taught to punch.",
        ms: 5500,
        kb: { s0: 1.06, x0: 0, y0: 1.5, s1: 1.18, x1: 0, y1: -2 },
        enter: "cut",
        shake: 2,
        plate: { text: "GRAVEL", tone: "err" },
    },
    {
        id: "bullhorn",
        img: bullhorn,
        text: "And on the nights the crowd went quiet, Bullhorn was already waiting in the ring.",
        ms: 6500,
        kb: { s0: 1.16, x0: -1, y0: -1.5, s1: 1.04, x1: 0.5, y1: 1 },
        enter: "fade",
        plate: { text: "BULLHORN", tone: "err" },
    },
    {
        id: "cell",
        img: cell,
        kicker: "Act III — Eternity",
        text:
            "A hundred fights. A thousand. He stopped counting wins and started collecting lies — every bout buying back a piece of the truth.",
        ms: 7500,
        kb: { s0: 1.03, x0: 1, y0: -0.5, s1: 1.15, x1: -1.5, y1: 1 },
        enter: "dip",
    },
    {
        id: "chiron",
        img: chiron,
        text:
            "Because above it all sits Chiron — Warlord of the Pit, keeper of every key. The false verdict bears his seal.",
        ms: 7500,
        kb: { s0: 1.04, x0: 0, y0: 1, s1: 1.16, x1: 0, y1: -2 },
        enter: "fade",
        plate: { text: "CHIRON, WARLORD", tone: "steel" },
    },
    {
        id: "resolve",
        img: resolve,
        text: "They gave him eternity. He means to spend it — one round, one truth, one monster at a time.",
        ms: 7000,
        kb: { s0: 1.05, x0: 0, y0: 2, s1: 1.24, x1: 0, y1: -1.5 },
        enter: "fade",
        shake: 2,
        plate: { text: "YOU", tone: "gold" },
    },
    {
        id: "title",
        img: "",
        text: "",
        ms: 9000,
        kb: STILL,
        enter: "dip",
    },
];

/** Crossfade length for "fade" entries; "dip" holds black around the swap. */
export const FADE_MS = 900;
/** The dip veil starts this long before the scene swap so black lands first. */
export const DIP_LEAD_MS = 700;

export function totalMs(): number {
    return SCENES.reduce((sum, scene) => sum + scene.ms, 0);
}

/** Absolute start time of each scene on the master clock. */
export function startTimes(): number[] {
    const starts: number[] = [];
    let t = 0;
    for (const scene of SCENES) {
        starts.push(t);
        t += scene.ms;
    }
    return starts;
}
