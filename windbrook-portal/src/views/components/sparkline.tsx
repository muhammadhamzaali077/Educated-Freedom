import type { FC } from 'hono/jsx';

export interface SparklinePoint {
  /** anchor of the bucket (e.g., first day of the month) */
  date: Date;
  count: number;
}

type SparklineProps = {
  data: SparklinePoint[];
  width?: number;
  height?: number;
};

const labelFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });

/**
 * Hand-rolled inline SVG sparkline. Per CLAUDE.md §Dashboard Composition,
 * the dashboard never imports a chart library — sparklines compute path
 * d-attributes from a small array of points. Peaks are dotted in gold; the
 * final (current) point is always dotted larger.
 */
export const Sparkline: FC<SparklineProps> = ({ data, width = 320, height = 80 }) => {
  if (data.length === 0) {
    return (
      <div class="sparkline-empty" style={`width:${width}px;height:${height}px;`}>
        <span>No data yet</span>
      </div>
    );
  }

  const padX = 8;
  const padY = 8;
  const labelHeight = 16;
  const plotHeight = height - labelHeight;
  const plotInner = plotHeight - padY * 2;

  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const xStep = data.length === 1 ? 0 : (width - padX * 2) / (data.length - 1);

  const points = data.map((d, i) => ({
    x: padX + i * xStep,
    y: padY + plotInner - (d.count / maxCount) * plotInner,
    count: d.count,
    date: d.date,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  // Local maxima — strictly greater than both neighbors (excluding the very
  // last point, which always renders as the highlighted "current" dot).
  const peakIdx = new Set<number>();
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!.count;
    const cur = points[i]!.count;
    const next = points[i + 1]!.count;
    if (cur > prev && cur > next && cur > 0) peakIdx.add(i);
  }

  const lastIdx = points.length - 1;

  return (
    <svg
      class="sparkline"
      role="img"
      aria-label={`Sparkline: ${data.length} months of report counts, latest ${data[lastIdx]?.count ?? 0}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
    >
      <rect class="sparkline-bg" x="0" y="0" width={width} height={plotHeight} />
      <path class="sparkline-line" d={pathD} fill="none" />

      {[...peakIdx].map((i) => {
        const p = points[i]!;
        return <circle class="sparkline-peak" cx={p.x} cy={p.y} r="4" />;
      })}

      {/* Final point — always rendered, larger and filled */}
      {points[lastIdx] ? (
        <circle
          class="sparkline-current"
          cx={points[lastIdx].x}
          cy={points[lastIdx].y}
          r="6"
        />
      ) : null}

      {/* Month labels every other bucket. We render labels under the plot,
          aligned to point centers; ticks are visual only — no axis line. */}
      {points.map((p, i) => {
        if (i % 2 !== 0 && i !== lastIdx) return null;
        return (
          <text
            class="sparkline-label"
            x={p.x}
            y={height - 3}
            text-anchor="middle"
          >
            {labelFmt.format(p.date)}
          </text>
        );
      })}
    </svg>
  );
};
