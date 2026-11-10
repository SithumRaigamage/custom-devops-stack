"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchActivity } from "./api";

export const ACTIVITY_QUERY_KEY = ["activity"] as const;

/** Recent activity rows, newest first. Refreshed by the /api/events stream. */
export function useActivity(limit = 50) {
  return useQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, limit],
    queryFn: ({ signal }) => fetchActivity(limit, signal),
  });
}
