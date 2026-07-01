<script lang="ts">
    let {
        pct,
        score,
        confidencePct,
        band,
        targetScore = 515,
        size = 260,
    }: {
        pct: number;
        score: number;
        confidencePct: number;
        band: number;
        targetScore?: number;
        size?: number;
    } = $props();

    const R = 80;
    const C = 2 * Math.PI * R;
    const ARC = 0.75 * C; // 270 degree gauge
    const valueLen = $derived((Math.max(0, Math.min(100, pct)) / 100) * ARC);

    // target tick position along the 270-arc (135deg start, clockwise)
    const targetFrac = $derived(
        Math.max(0, Math.min(1, (targetScore - 472) / (528 - 472))),
    );
    const targetAngle = $derived(135 + targetFrac * 270);
    const tick = $derived.by(() => {
        const a = (targetAngle * Math.PI) / 180;
        return {
            x1: 100 + (R - 10) * Math.cos(a),
            y1: 100 + (R - 10) * Math.sin(a),
            x2: 100 + (R + 10) * Math.cos(a),
            y2: 100 + (R + 10) * Math.sin(a),
        };
    });

    const arcColor = $derived(
        pct >= 66 ? "var(--good)" : pct >= 40 ? "var(--accent)" : "var(--warn)",
    );
</script>

<div class="gauge" style="width:{size}px">
    <svg viewBox="0 0 200 200" width={size} height={size}>
        <g transform="rotate(135 100 100)">
            <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke="var(--bg-elev-2)"
                stroke-width="16"
                stroke-linecap="round"
                stroke-dasharray="{ARC} {C}"
            />
            <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={arcColor}
                stroke-width="16"
                stroke-linecap="round"
                stroke-dasharray="{valueLen} {C}"
                style="transition: stroke-dasharray 0.6s ease"
            />
        </g>
        <line
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="var(--gold)"
            stroke-width="3"
            stroke-linecap="round"
        />
    </svg>

    <div class="center">
        <div class="label">PROJECTED</div>
        <div class="score mono">{score}</div>
        <div class="pm mono">± {band}</div>
        <div class="rd mono">{Math.round(pct)}% ready</div>
    </div>
</div>

<div class="conf">
    <div class="conf-head">
        <span class="section-label">Confidence</span>
        <span class="mono">{Math.round(confidencePct)}%</span>
    </div>
    <div class="bar">
        <div class="fill" style="width:{Math.max(2, confidencePct)}%"></div>
    </div>
    <div class="hint">how much to trust the number (coverage × depth × freshness)</div>
</div>

<style>
    .gauge {
        position: relative;
        margin: 0 auto;
    }
    .center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
    }
    .label {
        font-size: 10px;
        letter-spacing: 0.18em;
        color: var(--text-faint);
        font-weight: 700;
    }
    .score {
        font-size: 52px;
        font-weight: 800;
        line-height: 1;
        color: var(--text);
    }
    .pm {
        color: var(--text-dim);
        font-size: 14px;
        margin-top: -2px;
    }
    .rd {
        color: var(--accent);
        font-size: 13px;
        margin-top: 4px;
        font-weight: 700;
    }
    .conf {
        margin-top: 10px;
    }
    .conf-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        color: var(--text-dim);
        font-weight: 700;
    }
    .bar {
        height: 8px;
        border-radius: 999px;
        background: var(--bg-elev-2);
        overflow: hidden;
        margin-top: 6px;
        border: 1px solid var(--border);
    }
    .fill {
        height: 100%;
        background: linear-gradient(90deg, var(--accent-2), var(--accent));
        transition: width 0.6s ease;
    }
    .hint {
        color: var(--text-faint);
        font-size: 11px;
        margin-top: 6px;
    }
</style>
