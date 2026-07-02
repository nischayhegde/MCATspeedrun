<!--
Copyright: Ankitects Pty Ltd and contributors
License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html
-->
<script lang="ts">
    import FighterRig from "../ring/FighterRig.svelte";
    import { BUILD_BULK } from "../ring/geometry";
    import { SPECIES } from "../ring/roster";

    const specs = Object.values(SPECIES);
    const bulks = Object.entries(BUILD_BULK);
</script>

<div class="gallery">
    <h1>Rig gallery (dev)</h1>
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
</style>
