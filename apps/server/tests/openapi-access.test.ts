import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { bootstrapApp } from "@/app/bootstrap";
import { registerOpenAPI } from "@/app/bootstrap/register-openapi";
import { setupProcessLogger } from "@/infra/logger/process";
import { registerProcessLoggerSetup } from "@/infra/provider/logger";
import { runtimeConfig } from "./shopify/test-utils";
import type { AppEnv } from "@/typings";

registerProcessLoggerSetup(setupProcessLogger);

function createOpenAPIApp(options: { enabled?: boolean } = {}) {
  const app = new OpenAPIHono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("runtimeEnv", runtimeConfig as never);
    await next();
  });
  app.onError((error, c) =>
    c.json(
      {
        message: error.message,
        status: (error as { status?: number }).status,
      },
      (error as { status?: 500 }).status ?? 500,
    ),
  );

  registerOpenAPI(app, { enabled: options.enabled });

  return app;
}

describe("OpenAPI reference access control", () => {
  it("registers document and reference routes when enabled", async () => {
    const app = createOpenAPIApp({ enabled: true });

    const document = await app.request("/document", {
      headers: { "x-real-ip": "203.0.113.10" },
    });
    const reference = await app.request("/reference", {
      headers: { "x-real-ip": "203.0.113.10" },
    });

    expect(document.status).toBe(200);
    expect(await document.json()).toMatchObject({
      openapi: "3.1.0",
      info: { title: "@shamt/server" },
    });
    expect(reference.status).toBe(200);
  });

  it("does not register document and reference routes when disabled", async () => {
    const app = createOpenAPIApp({ enabled: false });

    for (const path of ["/document", "/reference"]) {
      const response = await app.request(path);

      expect(response.status).toBe(404);
    }
  });

  it("keeps OpenAPI routes absent when the app is created with OpenAPI disabled", async () => {
    const app = await bootstrapApp({ registerOpenApi: false });

    const document = await app.request("/document", {}, runtimeConfig as never);
    const reference = await app.request(
      "/reference",
      {},
      runtimeConfig as never,
    );

    expect(document.status).toBe(404);
    expect(reference.status).toBe(404);
  });
});
