"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchServices, runServiceAction, type ServiceAction } from "./api";

export const SERVICES_QUERY_KEY = ["services"] as const;
/** Fallback cadence; live updates normally arrive over /api/events. */
export const POLL_INTERVAL_MS = 4_000;

export function useServices() {
  return useQuery({
    queryKey: SERVICES_QUERY_KEY,
    queryFn: ({ signal }) => fetchServices(signal),
  });
}

/** One mutation per card, so actions on different services can run concurrently. */
export function useServiceAction(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (action: ServiceAction) => runServiceAction(id, action),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SERVICES_QUERY_KEY }),
  });
}
