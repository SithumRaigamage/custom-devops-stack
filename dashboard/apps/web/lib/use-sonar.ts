"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSonarProject, fetchSonarProjects, type SonarProject } from "./api";

export const SONAR_QUERY_KEY = ["sonar"] as const;

/** The API caches SonarQube reads for 30s. */
export function useSonarProjects(serviceId: string | undefined) {
  return useQuery({
    queryKey: [...SONAR_QUERY_KEY, serviceId, "projects"],
    queryFn: ({ signal }) => fetchSonarProjects(serviceId ?? "", signal),
    retry: false,
    enabled: Boolean(serviceId),
    staleTime: 30_000,
  });
}

export function useSonarProject(serviceId: string | undefined, key: string | null) {
  return useQuery({
    queryKey: [...SONAR_QUERY_KEY, serviceId, "project", key],
    queryFn: ({ signal }) => fetchSonarProject(serviceId ?? "", key ?? "", signal),
    retry: false,
    enabled: Boolean(serviceId && key),
    staleTime: 30_000,
  });
}

/** The project analysed most recently, or the first project when dates are missing. */
export function latestSonarProject(projects: SonarProject[]): SonarProject | null {
  if (projects.length === 0) return null;

  return [...projects].sort((a, b) => {
    const aTime = a.lastAnalysisDate ? Date.parse(a.lastAnalysisDate) : 0;
    const bTime = b.lastAnalysisDate ? Date.parse(b.lastAnalysisDate) : 0;
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  })[0];
}
