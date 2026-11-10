"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchJenkinsBuilds,
  fetchJenkinsSummary,
  triggerJenkinsBuild,
} from "./api";

export const JENKINS_QUERY_KEY = ["jenkins"] as const;

/** The API caches Jenkins reads for 10s, so there is no need to poll faster. */
export function useJenkinsBuilds(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...JENKINS_QUERY_KEY, "builds"],
    queryFn: ({ signal }) => fetchJenkinsBuilds(signal),
    staleTime: 10_000,
    enabled: options.enabled ?? true,
  });
}

export function useJenkinsSummary() {
  return useQuery({
    queryKey: [...JENKINS_QUERY_KEY, "summary"],
    queryFn: ({ signal }) => fetchJenkinsSummary(signal),
    staleTime: 10_000,
  });
}

export function useRebuildJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (job: string) => triggerJenkinsBuild(job),
    onSettled: () => queryClient.invalidateQueries({ queryKey: JENKINS_QUERY_KEY }),
  });
}
