import { QueryClient } from "@tanstack/react-query";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const DEFAULT_QUERY_STALE_TIME = 30 * SECOND;
export const DEFAULT_QUERY_GC_TIME = 5 * MINUTE;

/**
 * Creates a React Query client with conservative cache and retry defaults.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_QUERY_STALE_TIME,
        gcTime: DEFAULT_QUERY_GC_TIME,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
