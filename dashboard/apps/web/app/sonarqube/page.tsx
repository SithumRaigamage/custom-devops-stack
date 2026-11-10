"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { relativeTime } from "@/lib/activity";
import {
  latestSonarProject,
  useSonarProject,
  useSonarProjects,
} from "@/lib/use-sonar";

const GRADE_BG: Record<string, string> = {
  A: "bg-grade-a",
  B: "bg-grade-b",
  C: "bg-grade-c",
  D: "bg-grade-d",
  E: "bg-grade-e",
};

function analysisLabel(date: string | null): string {
  if (!date) return "never";
  const ts = Date.parse(date);
  return Number.isFinite(ts) ? relativeTime(ts) : "—";
}

function formatLoc(ncloc: number | null): string {
  if (ncloc === null) return "—";
  return ncloc >= 1000 ? `${(ncloc / 1000).toFixed(1)}k` : String(ncloc);
}

function display(value: number | null): string {
  return value === null ? "—" : String(value);
}

function EmptyState({
  configured,
  onRetry,
  retrying,
}: {
  configured: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section className="flex max-w-[760px] flex-col gap-5 rounded-[14px] border border-border bg-card p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-base font-semibold text-foreground">
          {configured ? "No projects analysed yet" : "Connect SonarQube"}
        </h2>
        <p className="m-0 text-[13px] text-muted-foreground">
          {configured
            ? "SonarQube is connected, but its project list is empty. Run an analysis and the projects will appear here."
            : "StackPilot reads quality gates and measures from the SonarQube web API using a user token."}
        </p>
      </div>

      {!configured ? (
        <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-[13px] text-foreground">
          <li>
            In SonarQube, open your user menu → <strong>My Account</strong> →{" "}
            <strong>Security</strong> → <strong>Generate Tokens</strong> and copy the token.
          </li>
          <li>
            Add these to <code className="font-mono text-xs">apps/api/.env</code>:
            <pre className="mt-2 overflow-x-auto rounded-[10px] border border-border2 bg-card2 p-3 font-mono text-xs text-fg2">
{`SONAR_URL=http://localhost:9000
SONAR_TOKEN=your-sonar-token`}
            </pre>
          </li>
          <li>
            Restart the API (<code className="font-mono text-xs">pnpm --filter api dev</code>) and
            retry.
          </li>
        </ol>
      ) : (
        <pre className="m-0 overflow-x-auto rounded-[10px] border border-border2 bg-card2 p-3 font-mono text-xs text-fg2">
{`sonar-scanner \\
  -Dsonar.host.url=http://localhost:9000 \\
  -Dsonar.token=your-sonar-token`}
        </pre>
      )}

      <div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-brand bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-60"
        >
          <RefreshCw
            className={retrying ? "size-[13px] animate-spin" : "size-[13px]"}
            strokeWidth={2.2}
            aria-hidden="true"
          />
          Retry
        </button>
      </div>
    </section>
  );
}

export default function SonarQubePage() {
  const projectsQuery = useSonarProjects();
  const projects = projectsQuery.data?.projects ?? [];
  const configured = projectsQuery.data?.configured ?? true;

  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      setActiveKey(null);
      return;
    }
    setActiveKey((current) =>
      current && projects.some((project) => project.key === current)
        ? current
        : (latestSonarProject(projects)?.key ?? projects[0].key),
    );
  }, [projects]);

  const detailQuery = useSonarProject(activeKey);
  const detail = detailQuery.data;
  const project = projects.find((entry) => entry.key === activeKey) ?? null;

  const gateStatus = detail?.gate.status;
  const gateLabel =
    gateStatus === "OK" ? "Passed" : gateStatus === "ERROR" ? "Failed" : "Not analysed";

  const measures = detail?.measures;
  const coverage = measures?.coverage ?? null;
  const duplication = measures?.duplicatedLinesDensity ?? null;
  const coverageTone =
    coverage === null
      ? "bg-border2"
      : coverage >= 80
        ? "bg-brand"
        : coverage >= 60
          ? "bg-brand-text"
          : "bg-hot";

  const metrics = [
    {
      label: "Bugs",
      value: display(measures?.bugs ?? null),
      note: (measures?.bugs ?? 0) === 0 ? "Clean" : "Open issues",
      tone: (measures?.bugs ?? 0) > 5 ? "text-bad" : "text-foreground",
    },
    {
      label: "Vulnerabilities",
      value: display(measures?.vulnerabilities ?? null),
      note: (measures?.vulnerabilities ?? 0) === 0 ? "None found" : "Fix before release",
      tone: (measures?.vulnerabilities ?? 0) > 0 ? "text-bad" : "text-ok",
    },
    {
      label: "Security hotspots",
      value: display(measures?.securityHotspots ?? null),
      note: "To review",
      tone: (measures?.securityHotspots ?? 0) > 0 ? "text-warn" : "text-ok",
    },
    {
      label: "Code smells",
      value: display(measures?.codeSmells ?? null),
      note: "Maintainability debt",
      tone: "text-foreground",
    },
  ];

  const ratings = [
    { grade: measures?.reliabilityRating ?? null, label: "Reliability" },
    { grade: measures?.securityRating ?? null, label: "Security" },
    { grade: measures?.sqaleRating ?? null, label: "Maintainability" },
  ];

  function retry() {
    void projectsQuery.refetch();
    if (activeKey) void detailQuery.refetch();
  }

  return (
    <>
      <PageHeader title="SonarQube" sub="Code quality and quality gates for your projects." />

      {projectsQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : projectsQuery.error ? (
        <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
          Can’t reach SonarQube: {projectsQuery.error.message}
        </div>
      ) : !configured || projects.length === 0 ? (
        <EmptyState
          configured={configured}
          onRetry={retry}
          retrying={projectsQuery.isFetching}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div role="group" aria-label="Project" className="flex flex-wrap gap-2">
            {projects.map((entry) => {
              const isActive = entry.key === activeKey;

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setActiveKey(entry.key)}
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "inline-flex h-[38px] items-center rounded-full border border-brand bg-brand-soft px-3.5 text-[13px] font-semibold text-brand-text"
                      : "inline-flex h-[38px] items-center rounded-full border border-border2 bg-card2 px-3.5 text-[13px] font-semibold text-fg2"
                  }
                >
                  {entry.name}
                </button>
              );
            })}
          </div>

          {detailQuery.error ? (
            <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
              Can’t load this project: {detailQuery.error.message}
            </div>
          ) : detailQuery.isPending || !detail ? (
            <p className="text-sm text-muted-foreground">Loading project…</p>
          ) : (
            <>
              <section
                aria-label="Quality gate"
                className="flex flex-wrap items-center gap-5 rounded-[14px] border border-border bg-card p-5"
              >
                <div className="flex flex-[1_1_240px] flex-col gap-1.5">
                  <span className="text-[13px] text-muted-foreground">
                    Quality gate · {project?.name ?? detail.name}
                  </span>
                  <span
                    className={`text-[28px] font-bold tracking-[-0.02em] ${
                      gateLabel === "Passed"
                        ? "text-ok"
                        : gateLabel === "Failed"
                          ? "text-bad"
                          : "text-muted-foreground"
                    }`}
                  >
                    {gateLabel}
                  </span>
                  <span className="text-xs text-muted2">
                    Last analysis {analysisLabel(detail.lastAnalysisDate)} ·{" "}
                    {formatLoc(measures?.ncloc ?? null)} lines of code
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {ratings.map((rating) => (
                    <div
                      key={rating.label}
                      className="flex min-w-[92px] flex-col items-center gap-1.5 rounded-[10px] border border-border bg-card2 p-3"
                    >
                      <span
                        className={`flex size-10 items-center justify-center rounded-[10px] text-xl font-extrabold ${
                          rating.grade && GRADE_BG[rating.grade]
                            ? `text-grade-fg ${GRADE_BG[rating.grade]}`
                            : "bg-neutral-bg text-muted2"
                        }`}
                      >
                        {rating.grade ?? "—"}
                      </span>
                      <span className="text-xs text-muted2">{rating.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section
                aria-label="Issues"
                className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
              >
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-[18px]"
                  >
                    <span className="text-[13px] text-muted-foreground">{metric.label}</span>
                    <span className={`text-[28px] font-bold ${metric.tone}`}>{metric.value}</span>
                    <span className="text-xs text-muted2">{metric.note}</span>
                  </div>
                ))}
              </section>

              <section
                aria-label="Coverage"
                className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-5"
              >
                <div className="flex justify-between gap-3 text-[13px]">
                  <span className="font-semibold text-foreground">Coverage</span>
                  <span className="text-muted-foreground">
                    Target 80% · Duplications {duplication === null ? "—" : `${duplication}%`}
                  </span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-track">
                  <div
                    className={`h-full rounded-full ${coverageTone}`}
                    style={{ width: `${Math.min(Math.max(coverage ?? 0, 0), 100)}%` }}
                  />
                  <div className="absolute bottom-0 left-[80%] top-0 w-0.5 bg-foreground opacity-60" />
                </div>
                <span className="font-mono text-[13px] text-fg2">
                  {coverage === null ? "No coverage data" : `${coverage.toFixed(1)}% covered`}
                </span>
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
