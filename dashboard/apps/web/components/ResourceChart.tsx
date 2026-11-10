"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchMetricsRange,
  type MetricsRange,
  type MetricsResponse,
} from "@/lib/api";

const RANGES: MetricsRange[] = ["1h", "6h", "24h"];

const VIEW_WIDTH = 600;
const BASELINE_Y = 160;
const PLOT_HEIGHT = 150;

/** Map a 0–yMax series across the 600×170 box; y = 160 − value/yMax × 150. */
function linePoints(values: number[], yMax: number): string {
  const series = values.length === 1 ? [values[0], values[0]] : values;
  if (series.length === 0) return "";

  return series
    .map((value, index) => {
      const x = (index * VIEW_WIDTH) / (series.length - 1);
      const y = BASELINE_Y - (Math.min(value, yMax) / yMax) * PLOT_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function tickLabels(range: MetricsRange): string[] {
  const totalMinutes = range === "1h" ? 60 : range === "6h" ? 360 : 1440;
  return [1, 0.75, 0.5, 0.25, 0].map((fraction) => {
    if (fraction === 0) return "now";
    const minutes = totalMinutes * fraction;
    return minutes < 60 ? `-${minutes}m` : `-${minutes / 60}h`;
  });
}

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ResourceChart() {
  const [range, setRange] = useState<MetricsRange>("1h");
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const result = await fetchMetricsRange(range, controller.signal);
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Metrics unavailable");
      }
    }

    void load();
    const interval = setInterval(() => void load(), 15000);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [range]);

  const points = data?.points ?? [];
  const latest = data?.latest ?? null;

  const yMax = useMemo(() => {
    let max = 0;
    for (const point of points) max = Math.max(max, point.cpuPct, point.memPct);
    return Math.max(100, Math.ceil(max / 10) * 10);
  }, [points]);

  const cpuLine = linePoints(
    points.map((point) => point.cpuPct),
    yMax,
  );
  const memLine = linePoints(
    points.map((point) => point.memPct),
    yMax,
  );

  const hovered = hoverIndex !== null ? points[hoverIndex] : undefined;
  const hoverRatio =
    hoverIndex !== null && points.length > 1 ? hoverIndex / (points.length - 1) : null;

  function handlePointer(event: React.PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(ratio * (points.length - 1)));
  }

  const collecting = points.length < 2;

  return (
    <section
      aria-label="Resource usage"
      className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 rounded-[14px] border border-border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold text-foreground">Stack resources</h2>
          <span className="text-xs text-muted-foreground">
            CPU and memory across all running containers · last {range}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-4 text-xs text-fg2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-3.5 rounded-[2px] bg-brand" />
              CPU {latest ? `${latest.cpuPct}%` : "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[3px] w-3.5 rounded-[2px] bg-series2" />
              Memory {latest ? `${latest.memPct}%` : "—"}
            </span>
          </div>

          <div
            role="group"
            aria-label="Chart time range"
            className="flex overflow-hidden rounded-[8px] border border-border2 bg-card2"
          >
            {RANGES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={range === option}
                onClick={() => {
                  setRange(option);
                  setHoverIndex(null);
                }}
                className={`h-[28px] px-2.5 text-xs font-semibold transition-colors ${
                  range === option
                    ? "bg-brand text-brand-foreground"
                    : "text-fg2 hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 600 170"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Line chart of CPU and memory use over the last ${range}`}
          className="block h-[200px] w-full"
          onPointerMove={handlePointer}
          onPointerLeave={() => setHoverIndex(null)}
        >
          {[10, 47.5, 85, 122.5].map((y) => (
            <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="var(--track)" strokeWidth="1" />
          ))}
          <line
            x1="0"
            y1={BASELINE_Y}
            x2="600"
            y2={BASELINE_Y}
            stroke="var(--border2)"
            strokeWidth="1"
          />

          {!collecting && (
            <>
              <polygon points={`0,${BASELINE_Y} ${cpuLine} 600,${BASELINE_Y}`} fill="var(--accentSoft)" />
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
            </>
          )}

          {hovered && hoverRatio !== null && (
            <>
              <line
                x1={hoverRatio * VIEW_WIDTH}
                y1="0"
                x2={hoverRatio * VIEW_WIDTH}
                y2={BASELINE_Y}
                stroke="var(--border2)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hoverRatio * VIEW_WIDTH}
                cy={BASELINE_Y - (Math.min(hovered.cpuPct, yMax) / yMax) * PLOT_HEIGHT}
                r="3.5"
                fill="var(--accent)"
              />
              <circle
                cx={hoverRatio * VIEW_WIDTH}
                cy={BASELINE_Y - (Math.min(hovered.memPct, yMax) / yMax) * PLOT_HEIGHT}
                r="3.5"
                fill="var(--series2)"
              />
            </>
          )}
        </svg>

        {collecting && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-muted-foreground">
            {error ? error : "Collecting samples…"}
          </p>
        )}

        {hovered && hoverRatio !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-border2 bg-card px-2.5 py-1.5 text-[11px] shadow-sm"
            style={{ left: `${hoverRatio * 100}%` }}
          >
            <div className="font-mono text-muted-foreground">{clockTime(hovered.ts)}</div>
            <div className="mt-0.5 flex gap-2.5">
              <span className="text-foreground">
                <span className="mr-1 inline-block h-[3px] w-3 rounded-[2px] bg-brand align-middle" />
                CPU {hovered.cpuPct}%
              </span>
              <span className="text-foreground">
                <span className="mr-1 inline-block h-[3px] w-3 rounded-[2px] bg-series2 align-middle" />
                Mem {hovered.memPct}%
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        {tickLabels(range).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </section>
  );
}
