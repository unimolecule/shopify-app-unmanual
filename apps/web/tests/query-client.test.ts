import { describe, expect, it } from "vitest";
import {
  createQueryClient,
  DEFAULT_QUERY_GC_TIME,
  DEFAULT_QUERY_STALE_TIME,
} from "@/utils/client.query";

describe("createQueryClient", () => {
  it("configures bounded admin UI query defaults", () => {
    const queryClient = createQueryClient();
    const options = queryClient.getDefaultOptions();

    expect(options.queries).toMatchObject({
      staleTime: DEFAULT_QUERY_STALE_TIME,
      gcTime: DEFAULT_QUERY_GC_TIME,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    });
    expect(options.mutations).toMatchObject({
      retry: 0,
    });
  });
});
