"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOllamaStatus, fetchOllamaModels, fetchOllamaRunning } from "./api";

export const OLLAMA_QUERY_KEY = ["ollama"] as const;

export function useOllamaStatus(serviceId: string) {
  return useQuery({
    queryKey: [...OLLAMA_QUERY_KEY, serviceId, "status"],
    queryFn: ({ signal }) => fetchOllamaStatus(serviceId, signal),
    staleTime: 2000,
    refetchInterval: false,
  });
}

export function useOllamaModels(serviceId: string) {
  return useQuery({
    queryKey: [...OLLAMA_QUERY_KEY, serviceId, "models"],
    queryFn: ({ signal }) => fetchOllamaModels(serviceId, signal),
    staleTime: 2000,
    refetchInterval: false,
    retry: false,
  });
}

export function useOllamaRunning(serviceId: string) {
  return useQuery({
    queryKey: [...OLLAMA_QUERY_KEY, serviceId, "running"],
    queryFn: ({ signal }) => fetchOllamaRunning(serviceId, signal),
    staleTime: 2000,
    refetchInterval: false,
    retry: false,
  });
}
