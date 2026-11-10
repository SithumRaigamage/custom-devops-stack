"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchJenkinsBuilds,
  fetchJenkinsSummary,
  triggerJenkinsBuild,
} from "./api";

export const JENKINS_QUERY_KEY = ["jenkins"] as const;

/** The API caches Jenkins reads for 10s, so there is no need to poll faster. */
export function useJenkinsBuilds(serviceId: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...JENKINS_QUERY_KEY, serviceId, "builds"],
    queryFn: ({ signal }) => fetchJenkinsBuilds(serviceId ?? "", signal),
    retry: false,
    staleTime: 10_000,
    enabled: Boolean(serviceId) && (options.enabled ?? true),
  });
}

export function useJenkinsSummary(serviceId: string | undefined) {
  return useQuery({
    queryKey: [...JENKINS_QUERY_KEY, serviceId, "summary"],
    queryFn: ({ signal }) => fetchJenkinsSummary(serviceId ?? "", signal),
    retry: false,
    staleTime: 10_000,
    enabled: Boolean(serviceId),
  });
}

export function useRebuildJob(serviceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (job: string) => triggerJenkinsBuild(serviceId ?? "", job),
    onSettled: () => queryClient.invalidateQueries({ queryKey: JENKINS_QUERY_KEY }),
  });
}
