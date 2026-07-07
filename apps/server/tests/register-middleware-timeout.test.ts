import { OpenAPIHono } from "@hono/zod-openapi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeConfig } from "./shopify/test-utils";
import type { AppEnv } from "@/typings";

const uploadTimeoutMs = 15;

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createTestApp(timeoutMs: number) {
  vi.resetModules();
  vi.doMock(
    "@unimolecule/shopify-app-unmanual-app-env",
    async (importOriginal) => ({
      ...(await importOriginal<
        typeof import("@unimolecule/shopify-app-unmanual-app-env")
      >()),
      DEFAULT_UPLOAD_TIMEOUT: uploadTimeoutMs,
    }),
  );
  vi.doMock("@/infra/provider", () => ({
    getEnvProvider: vi.fn(() => ({
      ...runtimeConfig,
      APP_FILE_MAX_SIZE: 200 * 1024,
      APP_FILE_UPLOAD_MULTIPLE_SIZE: 10,
      APP_FILE_UPLOAD_TIMEOUT: uploadTimeoutMs,
      APP_REQUEST_TIMEOUT: timeoutMs,
    })),
    getLoggerProvider: vi.fn(() => logger),
  }));

  const { registerMiddleware } =
    await import("@/app/bootstrap/register-middleware");
  const { onAppError } = await import("@/app/lifecycle/error");
  const app = new OpenAPIHono<AppEnv>();

  registerMiddleware(app);
  app.get("/api/slow", async (c) => {
    await sleep(timeoutMs + 20);
    return c.json({ ok: true });
  });
  app.post("/api/files", async (c) => {
    const mode = c.req.query("mode");
    if (mode === "slow") {
      await sleep(uploadTimeoutMs + 20);
    }

    return c.json({ ok: true });
  });
  app.get("/api/files", (c) => {
    return c.json({ ok: true });
  });
  app.post("/api/files/chunk", async (c) => {
    const mode = c.req.query("mode");
    if (mode === "slow") {
      await sleep(uploadTimeoutMs + 20);
    }

    return c.json({ ok: true });
  });
  app.get("/slow", async (c) => {
    await sleep(timeoutMs + 20);
    return c.json({ ok: true });
  });
  onAppError(app);

  return app;
}

describe("registerMiddleware timeout", () => {
  afterEach(() => {
    vi.doUnmock("@/infra/provider");
    vi.doUnmock("@unimolecule/shopify-app-unmanual-app-env");
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns a normalized timeout response for API routes", async () => {
    const app = await createTestApp(5);

    const response = await app.request("/api/slow", {}, runtimeConfig as never);
    const body: any = await response.json();

    expect(response.status).toBe(408);
    expect(body).toMatchObject({
      code: 408,
      data: null,
      message: "Request timed out",
      success: false,
    });
    expect(body.requestId).toEqual(expect.any(String));
    expect(body.details).toMatchObject({
      timeoutMs: 5,
    });
  });

  it("does not apply the API timeout middleware to non-API routes", async () => {
    const app = await createTestApp(5);

    const response = await app.request("/slow", {}, runtimeConfig as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("limits upload request bodies to the multi-file request size", async () => {
    const app = await createTestApp(5);
    const maxSize = runtimeConfig.APP_FILE_UPLOAD_MULTIPLE_SIZE * 200 * 1024;

    const response = await app.request(
      "/api/files",
      {
        body: "x".repeat(maxSize + 1),
        method: "POST",
      },
      runtimeConfig as never,
    );
    const body: any = await response.json();

    expect(response.status).toBe(413);
    expect(body).toMatchObject({
      code: 413,
      data: null,
      message: "Upload request body overflow maxsize",
      success: false,
    });
    expect(body.details).toMatchObject({
      maxSize,
    });
  });

  it("uses the upload timeout for upload requests", async () => {
    const app = await createTestApp(1);

    const response = await app.request(
      "/api/files?mode=slow",
      {
        body: "ok",
        method: "POST",
      },
      runtimeConfig as never,
    );
    const body: any = await response.json();

    expect(response.status).toBe(408);
    expect(body).toMatchObject({
      code: 408,
      data: null,
      message: "Upload request timed out",
      success: false,
    });
    expect(body.details).toMatchObject({
      timeoutMs: uploadTimeoutMs,
    });
  });

  it("does not apply upload middleware to non-POST file requests", async () => {
    const app = await createTestApp(5);

    const response = await app.request(
      "/api/files",
      {
        method: "GET",
      },
      runtimeConfig as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("does not apply upload middleware to nested file routes", async () => {
    const app = await createTestApp(1);

    const response = await app.request(
      "/api/files/chunk?mode=slow",
      {
        body: "ok",
        method: "POST",
      },
      runtimeConfig as never,
    );
    const body: any = await response.json();

    expect(response.status).toBe(408);
    expect(body).toMatchObject({
      code: 408,
      data: null,
      message: "Request timed out",
      success: false,
    });
    expect(body.details).toMatchObject({
      timeoutMs: 1,
    });
  });
});
