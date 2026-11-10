"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOllamaStatus, fetchOllamaModels, fetchOllamaRunning } from "./api";

export const OLLAMA_QUERY_KEY = ["ollama"] as const;

export function useOllamaStatus(signal?: AbortSignal) {
  return useQuery({
    queryKey: [...OLLAMA_QUERY_KEY, "status"],
    queryFn: () => fetchOllamaStatus(signal),
    staleTime: 2000,
    refetchInterval: false,
  });
}

export function useOllamaModels(signal?: AbortSignal) {
  return useQuery({
    queryKey: [...OLLAMA_QUERY_KEY, "models"],
    queryFn: () => fetchOllamaModels(signal),
    staleTime: 2000,
    refetchInterval: false,
  });
}

export function useOllamaRunning(signal?: AbortSignal) {
  return useQuery({
    queryKey: [...OLLAMA_QUERY_KEY, "running"],
    queryFn: () => fetchOllamaRunning(signal),
    staleTime: 2000,
    refetchInterval: false,
  });
}