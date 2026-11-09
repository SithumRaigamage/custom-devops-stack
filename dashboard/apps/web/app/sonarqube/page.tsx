"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SONAR_PROJECTS, type SonarGrade } from "@/lib/mock";

const GRADE_BG: Record<SonarGrade, string> = {
  A: "bg-grade-a",
  B: "bg-grade-b",
  C: "bg-grade-c",
  D: "bg-grade-d",
  E: "bg-grade-e",
};

export default function SonarQubePage() {
  const [active, setActive] = useState(0);
  const project = SONAR_PROJECTS[active];

  const coverageTone =
    project.coverage >= 80 ? "bg-brand" : project.coverage >= 60 ? "bg-brand-text" : "bg-hot";

  const metrics = [
    {
      label: "Bugs",
      value: project.bugs,
      note: project.bugs === 0 ? "Clean" : "Open issues",
      tone: project.bugs > 5 ? "text-bad" : "text-foreground",
    },
    {
      label: "Vulnerabilities",
      value: project.vulns,
      note: project.vulns === 0 ? "None found" : "Fix before release",
      tone: project.vulns > 0 ? "text-bad" : "text-ok",
    },
    {
      label: "Security hotspots",
      value: project.hotspots,
      note: "To review",
      tone: project.hotspots > 0 ? "text-warn" : "text-ok",
    },
    {
      label: "Code smells",
      value: project.smells,
      note: "Maintainability debt",
      tone: "text-foreground",
    },
  ];

  const ratings = [
    { grade: project.rel, label: "Reliability" },
    { grade: project.sec, label: "Security" },
    { grade: project.maint, label: "Maintainability" },
  ];

  return (
    <>
      <PageHeader title="SonarQube" sub="Code quality and quality gates for your projects." />

      <div role="group" aria-label="Project" className="flex flex-wrap gap-2">
        {SONAR_PROJECTS.map((entry, i) => {
          const isActive = i === active;
          return (
            <button
              key={entry.name}
              type="button"
              onClick={() => setActive(i)}
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

      <section
        aria-label="Quality gate"
        className="flex flex-wrap items-center gap-5 rounded-[14px] border border-border bg-card p-5"
      >
        <div className="flex flex-[1_1_240px] flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">
            Quality gate · {project.name}
          </span>
          <span
            className={`text-[28px] font-bold tracking-[-0.02em] ${
              project.gate === "Passed" ? "text-ok" : "text-bad"
            }`}
          >
            {project.gate}
          </span>
          <span className="text-xs text-muted2">
            Last analysis {project.analysed} · {project.loc} lines of code
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {ratings.map((rating) => (
            <div
              key={rating.label}
              className="flex min-w-[92px] flex-col items-center gap-1.5 rounded-[10px] border border-border bg-card2 p-3"
            >
              <span
                className={`flex size-10 items-center justify-center rounded-[10px] text-xl font-extrabold text-grade-fg ${GRADE_BG[rating.grade]}`}
              >
                {rating.grade}
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
            Target 80% · Duplications {project.dup}%
          </span>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-track">
          <div
            className={`h-full rounded-full ${coverageTone}`}
            style={{ width: `${project.coverage}%` }}
          />
          <div className="absolute bottom-0 left-[80%] top-0 w-0.5 bg-foreground opacity-60" />
        </div>
        <span className="font-mono text-[13px] text-fg2">
          {project.coverage.toFixed(1)}% covered
        </span>
      </section>
    </>
  );
}
