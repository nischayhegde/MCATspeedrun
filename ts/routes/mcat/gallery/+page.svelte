<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import { CLIPS } from "../ring/clips";
    import FighterRig from "../ring/FighterRig.svelte";
    import FightRing from "../ring/FightRing.svelte";
    import { BUILD_BULK } from "../ring/geometry";
    import HeavyBag from "../ring/HeavyBag.svelte";
    import type { FightEventKind } from "../ring/machine";
    import RingFx from "../ring/RingFx.svelte";
    import { opponentFor, SPECIES } from "../ring/roster";

    const specs = Object.values(SPECIES);
    const bulks = Object.entries(BUILD_BULK);

    // --- Step-3 FightRing harness -------------------------------------------
    const ringOpponent = opponentFor(
        { cardId: 5n, difficulty: 5, fsrsDifficulty: 5, difficultyTagged: true },
        new Map(),
    ); // bullhorn (tier 5)
    const eventKinds: FightEventKind[] = [
        "question",
        "fast-correct", "slow-correct", "wrong", "idk",
        "rate-again", "rate-hard", "rate-good", "rate-easy",
        "bag-hit",
        "results-win", "results-draw", "results-loss",
    ];
    let ringTrigger = 0;
    let ringEvent: { kind: FightEventKind; trigger: number } | null = null;
    function fire(kind: FightEventKind): void {
        ringTrigger += 1;
        ringEvent = { kind, trigger: ringTrigger };
    }

    // --- Step-4 clip player -------------------------------------------------
    const clipIds = Object.keys(CLIPS);
    let selected = "atk-cross";
    let clip: string | null = null;
    let clipTrigger = 0;

    // Opponent mirrors the hero clip under the opp- reuse rules.
    let oppClip: string | null = null;

    // Ring FX + heavy bag driven off the same Play.
    let badgeTrigger = 0;
    let swingTrigger = 0;

    $: def = CLIPS[selected];
    $: badge = def?.badge ?? null;
    $: bagSwing = selected.startsWith("bag-") && selected !== "bag-sway"
        ? selected.slice("bag-".length)
        : null;

    // Opponent plays its own opp- variant when one exists, else mirrors the
    // hero clip (rig is facing-mirrored, so the reuse reads correctly).
    function oppVariant(id: string): string | null {
        const opp = "opp-" + id;
        if (opp in CLIPS) {
            return opp;
        }
        return id in CLIPS ? id : null;
    }

    function play(): void {
        clip = selected;
        oppClip = oppVariant(selected);
        clipTrigger += 1;
        badgeTrigger += 1;
        if (bagSwing) {
            swingTrigger += 1;
        }
    }

    function onClipend(): void {
        clip = null;
        oppClip = null;
    }
</script>

<div class="gallery">
    <h1>Rig gallery (dev)</h1>

    <section>
        <h2>Clip player</h2>
        <div class="player">
            <select bind:value={selected}>
                {#each clipIds as id (id)}
                    <option value={id}>{id}</option>
                {/each}
            </select>
            <button on:click={play}>Play</button>
            <span class="meta">
                {def?.durMs}ms · intensity {def?.intensity}
            </span>
        </div>
        <div class="stage">
            <div class="fx-frame">
                <FighterRig
                    spec={SPECIES.rookie}
                    bulk={0.4}
                    scale={1.6}
                    {clip}
                    {clipTrigger}
                    on:clipend={onClipend}
                />
                <RingFx {badge} {badgeTrigger} />
                <span class="cap">ROOKIE (--wt light)</span>
            </div>
            <div class="fx-frame">
                <FighterRig
                    spec={SPECIES.bullhorn}
                    bulk={1}
                    scale={1.6}
                    facing="left"
                    clip={oppClip}
                    {clipTrigger}
                    on:clipend={onClipend}
                />
                <span class="cap">BULLHORN (--wt heavy)</span>
            </div>
            <div class="fx-frame bag">
                <HeavyBag swing={bagSwing} {swingTrigger} />
                <span class="cap">heavy bag</span>
            </div>
        </div>
    </section>

    <section>
        <h2>Builds (hero palette)</h2>
        <div class="row">
            {#each bulks as [name, b] (name)}
                <figure>
                    <FighterRig spec={SPECIES.rookie} bulk={b} scale={1.4} />
                    <figcaption>{name}</figcaption>
                </figure>
            {/each}
        </div>
    </section>
    <section>
        <h2>FightRing (spar vs. Bullhorn)</h2>
        <FightRing
            mode="spar"
            event={ringEvent}
            opponent={ringOpponent}
            marquee="SPARRING — GALLERY"
            heroBulkValue={0.5}
        />
        <div class="row buttons">
            {#each eventKinds as kind (kind)}
                <button on:click={() => fire(kind)}>{kind}</button>
            {/each}
        </div>
    </section>

    <section>
        <h2>Species</h2>
        <div class="row">
            {#each specs as s (s.id)}
                <figure>
                    <FighterRig spec={s} bulk={0.8} scale={1.4} facing="left" />
                    <figcaption>{s.name}</figcaption>
                </figure>
            {/each}
        </div>
    </section>
</div>

<style lang="scss">
    .gallery {
        padding: 1.5rem;
        color: var(--sf-text);
    }
    .row {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        align-items: flex-end;
    }
    figure {
        margin: 0;
        text-align: center;
    }
    figcaption {
        font-size: 11px;
        color: var(--sf-dim);
        letter-spacing: 0.08em;
    }
    .player {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        margin-bottom: 1rem;
    }
    .player select,
    .player button {
        font: inherit;
        padding: 0.3rem 0.6rem;
        border-radius: 0.5rem;
        border: 1px solid var(--sf-border);
        background: var(--sf-surface);
        color: var(--sf-text);
        cursor: pointer;
    }
    .player button:hover {
        background: color-mix(in srgb, var(--sf-text) 8%, var(--sf-surface));
    }
    .player .meta {
        font-size: 11px;
        color: var(--sf-dim);
    }
    .stage {
        display: flex;
        gap: 2rem;
        align-items: flex-end;
    }
    .fx-frame {
        position: relative;
        width: 160px;
        height: 220px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        border: 1px dashed var(--sf-border);
        border-radius: 12px;
        background: linear-gradient(180deg, #10131a 0%, #0b0e14 100%);
    }
    .fx-frame .cap {
        position: absolute;
        bottom: 4px;
        left: 0;
        right: 0;
        font-size: 11px;
        color: var(--sf-dim);
        letter-spacing: 0.08em;
        text-align: center;
    }
    .fx-frame.bag {
        overflow: hidden;
    }
    .row.buttons {
        margin-top: 0.75rem;
        gap: 0.4rem;
    }
    .row.buttons button {
        font: inherit;
        font-size: 11px;
        padding: 0.3rem 0.6rem;
        border-radius: 0.5rem;
        border: 1px solid var(--sf-border);
        background: var(--sf-surface);
        color: var(--sf-text);
        cursor: pointer;
    }
    .row.buttons button:hover {
        border-color: var(--sf-red);
        background: color-mix(in srgb, var(--sf-red) 10%, var(--sf-surface));
    }
</style>
