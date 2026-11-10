"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIncidents, fetchUptime } from "./api";

export const UPTIME_QUERY_KEY = ["uptime"] as const;
export const INCIDENTS_QUERY_KEY = ["incidents"] as const;

/** Uptime is sampled once a minute on the API, so a minute is enough here too. */
export function useUptime() {
  return useQuery({
    queryKey: UPTIME_QUERY_KEY,
    queryFn: ({ signal }) => fetchUptime(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useIncidents() {
  return useQuery({
    queryKey: INCIDENTS_QUERY_KEY,
    queryFn: ({ signal }) => fetchIncidents(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
