import { afterEach, describe, expect, it, vi } from "vitest";
import { getBucketEnvConfig, getR2BucketConfig } from "@/infra/bucket";
import { runtimeConfig } from "./shopify/test-utils";
import type { RuntimeConfig } from "@/infra/env";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bucket runtime strategy", () => {
  it("supports node with memory bucket", () => {
    expect(
      getBucketEnvConfig({
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "memory",
        APP_RUNTIME: "node",
      } as RuntimeConfig),
    ).toEqual({
      provider: "memory",
      runtime: "node",
    });
  });

  it("supports node with r2 bucket", () => {
    expect(
      getBucketEnvConfig({
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "r2",
        APP_RUNTIME: "node",
      } as RuntimeConfig),
    ).toEqual({
      provider: "r2",
      runtime: "node",
    });
  });

  it("parses r2 endpoint and derives credentials for node r2 bucket", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        result: {
          id: "token_id",
        },
      }),
    );

    vi.stubGlobal("fetch", fetch);

    await expect(
      getR2BucketConfig({
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "r2",
        APP_BUCKET_R2_URL:
          "https://account-id.r2.cloudflarestorage.com/product-export",
        APP_CLOUDFLARE_USER_TOKEN: "token_value",
      } as RuntimeConfig),
    ).resolves.toEqual({
      accessKeyId: "token_id",
      bucketName: "product-export",
      endpoint: "https://account-id.r2.cloudflarestorage.com",
      region: "auto",
      secretAccessKey:
        "f52efb2f55ed508755282e4a5ebd9d568598a229f36f9868bec7e2e32ad204e5",
    });

    const [request] = fetch.mock.calls[0] as [Request];
    expect(request.url).toBe(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
    );
    expect(request.headers.get("authorization")).toBe("Bearer token_value");
  });

  it("rejects incomplete r2 config", async () => {
    await expect(
      getR2BucketConfig({
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "r2",
      } as RuntimeConfig),
    ).rejects.toThrow("R2 bucket config is incomplete");
  });

  it("supports cloudflare with r2 bucket", () => {
    expect(
      getBucketEnvConfig({
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "r2",
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig),
    ).toEqual({
      provider: "r2",
      runtime: "cloudflare",
    });
  });

  it("defaults node to memory bucket", () => {
    const { APP_BUCKET_PROVIDER: _provider, ...config } = runtimeConfig;

    expect(
      getBucketEnvConfig({
        ...config,
        APP_RUNTIME: "node",
      } as RuntimeConfig),
    ).toEqual({
      provider: "memory",
      runtime: "node",
    });
  });

  it("defaults cloudflare to r2 bucket", () => {
    const { APP_BUCKET_PROVIDER: _provider, ...config } = runtimeConfig;

    expect(
      getBucketEnvConfig({
        ...config,
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig),
    ).toEqual({
      provider: "r2",
      runtime: "cloudflare",
    });
  });

  it("rejects cloudflare with memory bucket", () => {
    expect(() =>
      getBucketEnvConfig({
        ...runtimeConfig,
        APP_BUCKET_PROVIDER: "memory",
        APP_RUNTIME: "cloudflare",
      } as RuntimeConfig),
    ).toThrow("Cloudflare runtime only supports the r2 bucket provider");
  });
});
