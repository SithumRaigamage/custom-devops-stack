"use client";

import { useState } from "react";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { LogsDrawer } from "@/components/LogsDrawer";
import { PageHeader } from "@/components/PageHeader";
import { ResourceChart } from "@/components/ResourceChart";
import { ServiceGrid } from "@/components/ServiceGrid";
import { StatCard } from "@/components/StatCard";
import { useSearch } from "@/components/search-provider";
import type { Service } from "@/lib/api";
import { filterServices } from "@/lib/filter-services";
import { relativeTime } from "@/lib/activity";
import { useJenkinsBuilds } from "@/lib/use-jenkins";
import { latestSonarProject, useSonarProject, useSonarProjects } from "@/lib/use-sonar";
import { useServices } from "@/lib/use-services";

export default function OverviewPage() {
  const { data: services, isPending, error } = useServices();
  const { data: jenkins, isError: jenkinsError } = useJenkinsBuilds();
  const lastBuild = jenkins?.builds[0];
  const { data: sonarProjects, isError: sonarError } = useSonarProjects();
  const latestProject = latestSonarProject(sonarProjects?.projects ?? []);
  const { data: sonarDetail } = useSonarProject(latestProject?.key ?? null);
  const { query } = useSearch();
  const [logsFor, setLogsFor] = useState<Service | null>(null);

  const list = services ?? [];
  const filtered = filterServices(list, query);

  const total = list.length;
  const running = list.filter((service) => service.status !== "stopped").length;
  const healthy = list.filter((service) => service.status === "healthy").length;
  const dockerDown = error?.message.includes("docker_unavailable") ?? false;

  const gateLabel =
    sonarDetail?.gate.status === "OK"
      ? "Passed"
      : sonarDetail?.gate.status === "ERROR"
        ? "Failed"
        : "—";
  const lastAnalysis = sonarDetail?.lastAnalysisDate
    ? Date.parse(sonarDetail.lastAnalysisDate)
    : null;
  const logService = logsFor ? (list.find((s) => s.id === logsFor.id) ?? logsFor) : null;

  return (
    <>
      <PageHeader title="Overview" sub="Everything running in your custom DevOps stack." />

      {error ? (
        <div className="rounded-[12px] border border-bad-bg bg-bad-bg px-4 py-3 text-sm text-bad">
          {dockerDown
            ? "Docker isn’t running. Start Docker Desktop and reload the page."
            : `Can’t reach the API: ${error.message}`}
        </div>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading services…</p>
      ) : (
        <>
          <section
            aria-label="Summary"
            className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4"
          >
            <StatCard
              label="Services running"
              value={String(running)}
              suffix={`/ ${total}`}
              note={running === total ? "All containers up" : `${total - running} stopped`}
            />
            <StatCard
              label="Healthy"
              value={String(healthy)}
              suffix={`/ ${total}`}
              note={
                healthy === total ? "Every health check passing" : `${total - healthy} need attention`
              }
              tone={healthy === total ? "text-ok" : "text-warn"}
            />
            <StatCard
              label="Quality gate"
              value={gateLabel}
              suffix={sonarDetail?.name ?? latestProject?.name}
              note={
                sonarDetail
                  ? `${sonarDetail.measures.coverage === null ? "—" : `${sonarDetail.measures.coverage}%`} coverage · ${
                      lastAnalysis !== null && Number.isFinite(lastAnalysis)
                        ? relativeTime(lastAnalysis)
                        : "not analysed"
                    }`
                  : sonarError
                    ? "SonarQube unavailable"
                    : sonarProjects && !sonarProjects.configured
                      ? "SonarQube isn’t configured"
                      : latestProject
                        ? "Loading quality gate…"
                        : "No analysed projects"
              }
              tone={
                gateLabel === "Passed"
                  ? "text-ok"
                  : gateLabel === "Failed"
                    ? "text-bad"
                    : "text-foreground"
              }
            />
            <StatCard
              label="Last build"
              value={
                lastBuild
                  ? lastBuild.status.charAt(0).toUpperCase() + lastBuild.status.slice(1)
                  : "—"
              }
              suffix={lastBuild ? `#${lastBuild.num}` : undefined}
              note={
                lastBuild
                  ? `${lastBuild.job} · ${relativeTime(lastBuild.startedAt)}`
                  : jenkins && !jenkins.configured
                    ? "Jenkins isn’t configured"
                    : jenkinsError
                      ? "Jenkins unavailable"
                      : "No builds yet"
              }
              tone={
                lastBuild?.status === "success"
                  ? "text-ok"
                  : lastBuild?.status === "failed"
                    ? "text-bad"
                    : lastBuild?.status === "running"
                      ? "text-info"
                      : lastBuild
                        ? "text-warn"
                        : "text-foreground"
              }
            />
          </section>

          <ServiceGrid
            services={filtered}
            total={total}
            query={query}
            onViewLogs={setLogsFor}
          />

          <div className="flex flex-wrap gap-4">
            <ResourceChart />
            <ActivityTimeline />
          </div>
        </>
      )}

      {logService && <LogsDrawer service={logService} onClose={() => setLogsFor(null)} />}
    </>
  );
}
