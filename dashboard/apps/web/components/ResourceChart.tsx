import { CPU_SERIES, MEMORY_SERIES } from "@/lib/mock";

/** Maps a 0–100 series to the 600×170 chart box: y = 160 − value × 1.5. */
function points(series: number[]): string {
  return series
    .map(
      (value, i) =>
        `${((i * 600) / (series.length - 1)).toFixed(1)},${(160 - value * 1.5).toFixed(1)}`,
    )
    .join(" ");
}

export function ResourceChart() {
  const cpuLine = points(CPU_SERIES);
  const memLine = points(MEMORY_SERIES);
  const cpuNow = CPU_SERIES[CPU_SERIES.length - 1];
  const memNow = MEMORY_SERIES[MEMORY_SERIES.length - 1];

  return (
    <section
      aria-label="Resource usage"
      className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold text-foreground">Stack resources</h2>
          <span className="text-xs text-muted-foreground">
            CPU and memory across all containers, last hour
          </span>
        </div>
        <div className="flex gap-4 text-xs text-fg2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-3.5 rounded-[2px] bg-brand" />
            CPU {cpuNow}%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-3.5 rounded-[2px] bg-series2" />
            Memory {memNow}%
          </span>
        </div>
      </div>

      <svg
        viewBox="0 0 600 170"
        preserveAspectRatio="none"
        role="img"
        aria-label="Line chart of CPU and memory use over the last hour"
        className="block h-[200px] w-full"
      >
        {[10, 47.5, 85, 122.5].map((y) => (
          <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="var(--track)" strokeWidth="1" />
        ))}
        <line x1="0" y1="160" x2="600" y2="160" stroke="var(--border2)" strokeWidth="1" />
        <polygon points={`0,160 ${cpuLine} 600,160`} fill="var(--accentSoft)" />
        <polyline
          points={memLine}
          fill="none"
          stroke="var(--series2)"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={cpuLine}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>-60m</span>
        <span>-45m</span>
        <span>-30m</span>
        <span>-15m</span>
        <span>now</span>
      </div>
    </section>
  );
}
