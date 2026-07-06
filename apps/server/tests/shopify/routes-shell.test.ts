import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimeConfig } from "./test-utils";
import type { AppEnv } from "@/typings";

describe("Shopify app shell", () => {
  it("renders Polaris web component shell with Shopify scripts and API key", async () => {
    const { getShopifyModeCapabilities } =
      await import("@/app/modules/shopify/mode");

    const html = getShopifyModeCapabilities("embedded").renderAppShell({
      ...runtimeConfig,
      SHOPIFY_APP_KEY: "test_key",
    });

    expect(html).toContain(
      '<meta name="shopify-api-key" content="test_key" />',
    );
    expect(html).toContain(
      "https://cdn.shopify.com/shopifycloud/app-bridge.js",
    );
    expect(html).toContain("https://cdn.shopify.com/shopifycloud/polaris.js");
    expect(html).toContain("<s-page");
    expect(html).toContain('<s-section heading="Shop Info">');
    expect(html).toContain("escapeHtml");
  });

  it("renders standalone shell without App Bridge", async () => {
    const { getShopifyModeCapabilities } =
      await import("@/app/modules/shopify/mode");

    const html = getShopifyModeCapabilities("standalone").renderAppShell({
      ...runtimeConfig,
      SHOPIFY_APP_KEY: "test_key",
      SHOPIFY_APP_MODE: "standalone",
    });

    expect(html).toContain(
      '<meta name="shopify-api-key" content="test_key" />',
    );
    expect(html).not.toContain(
      "https://cdn.shopify.com/shopifycloud/app-bridge.js",
    );
    expect(html).toContain("https://cdn.shopify.com/shopifycloud/polaris.js");
  });

  it("registers app shell routes", async () => {
    const { registerAppShellRoutes } =
      await import("@/app/modules/shopify/app-shell");
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("runtimeEnv", runtimeConfig as never);
      await next();
    });

    registerAppShellRoutes(app as never);

    for (const path of ["/", "/app", "/app/settings"]) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("test_app_key");
    }
  });

  it("redirects standalone app shell launches with shop query to OAuth", async () => {
    const { registerAppShellRoutes } =
      await import("@/app/modules/shopify/app-shell");
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("runtimeEnv", {
        ...runtimeConfig,
        SHOPIFY_APP_MODE: "standalone",
      } as never);
      await next();
    });

    registerAppShellRoutes(app as never);

    const response = await app.request("/app?shop=test-shop.myshopify.com");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://app.example.com/auth?shop=test-shop.myshopify.com",
    );
  });

  it("redirects app shell routes to the web frontend target", async () => {
    const { registerAppShellRoutes } =
      await import("@/app/modules/shopify/app-shell");
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("runtimeEnv", {
        ...runtimeConfig,
        SHOPIFY_APP_FRONTEND_TARGET: "frontend",
      } as never);
      await next();
    });

    registerAppShellRoutes(app as never);

    for (const path of ["/", "/app", "/app/settings"]) {
      const response = await app.request(path);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("https://app.example.com/");
    }
  });

  it("builds app shell fallback URLs from the frontend target", async () => {
    const { getShopifyAppShellUrl } =
      await import("@/app/modules/shopify/app-shell/urls");

    expect(
      getShopifyAppShellUrl(
        {
          ...runtimeConfig,
          SHOPIFY_APP_FRONTEND_TARGET: "backend",
        },
        { shop: "shop.myshopify.com" },
      ),
    ).toBe("https://app.example.com/app?shop=shop.myshopify.com");
    expect(
      getShopifyAppShellUrl(
        {
          ...runtimeConfig,
          SHOPIFY_APP_FRONTEND_TARGET: "frontend",
        },
        { shop: "shop.myshopify.com" },
      ),
    ).toBe("https://app.example.com/?shop=shop.myshopify.com");
    expect(
      getShopifyAppShellUrl(
        {
          ...runtimeConfig,
          SHOPIFY_APP_FRONTEND_TARGET: "backend",
        },
        { host: undefined, shop: "shop.myshopify.com" },
      ),
    ).toBe("https://app.example.com/app?shop=shop.myshopify.com");
  });
});

describe("Shopify auth routes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/infra/provider");
    vi.doUnmock("@/app/modules/shopify/session-storage");
  });

  function createAuthApp(routes: Hono<AppEnv>) {
    const app = new Hono<AppEnv>();
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
        (error as { status?: 400 }).status ?? 500,
      ),
    );
    app.route("/auth", routes);
    return app;
  }

  it("starts OAuth for valid myshopify domains and rejects invalid shops", async () => {
    const begin = vi.fn(() => new Response("begin"));
    vi.doMock("@/infra/provider", () => ({
      getEnvProvider: vi.fn((rawEnv) => rawEnv ?? runtimeConfig),
      getShopifyConfigProvider: vi.fn(() => ({
        auth: { begin },
      })),
    }));
    vi.doMock("@/app/modules/shopify/session-storage", () => ({
      getShopifySessionStorage: vi.fn(),
    }));

    const { createAuthRoutes } = await import("@/app/modules/shopify/auth");
    const app = createAuthApp(createAuthRoutes());

    const response = await app.request("/auth?shop=test-shop.myshopify.com");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("begin");
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({
        shop: "test-shop.myshopify.com",
        callbackPath: "/auth/callback",
        isOnline: false,
        rawRequest: expect.any(Request),
      }),
    );

    const invalid = await app.request("/auth?shop=evil.example.com");
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      message: "Invalid or missing shop parameter",
      status: 400,
    });
  });

  it("stores callback sessions and redirects to embedded or fallback URLs", async () => {
    const callback = vi
      .fn()
      .mockResolvedValueOnce({
        headers: { "Set-Cookie": "shopify=1", Location: "/old" },
        session: { shop: "shop.myshopify.com" },
      })
      .mockResolvedValueOnce({
        headers: {},
        session: { shop: "fallback.myshopify.com" },
      });
    const buildEmbeddedAppUrl = vi.fn(
      (host) => `https://admin.shopify.com/${host}`,
    );
    const storeSession = vi.fn();
    vi.doMock("@/infra/provider", () => ({
      getEnvProvider: vi.fn((rawEnv) => rawEnv ?? runtimeConfig),
      getShopifyConfigProvider: vi.fn(() => ({
        auth: { callback, buildEmbeddedAppUrl },
      })),
    }));
    vi.doMock("@/app/modules/shopify/session-storage", () => ({
      getShopifySessionStorage: vi.fn(() => ({ storeSession })),
    }));

    const { createAuthRoutes } = await import("@/app/modules/shopify/auth");
    const app = createAuthApp(createAuthRoutes());

    const embedded = await app.request("/auth/callback?host=encoded-host");
    expect(embedded.status).toBe(302);
    expect(embedded.headers.get("Location")).toBe(
      "https://admin.shopify.com/encoded-host",
    );
    expect(embedded.headers.get("Set-Cookie")).toBe("shopify=1");

    const fallback = await app.request("/auth/callback");
    expect(fallback.status).toBe(302);
    expect(fallback.headers.get("Location")).toBe(
      "https://app.example.com/app?shop=fallback.myshopify.com",
    );
    expect(storeSession).toHaveBeenCalledTimes(2);
  });

  it("stores callback sessions and sets standalone app session cookies", async () => {
    const callback = vi.fn().mockResolvedValue({
      headers: { "Set-Cookie": "shopify=1" },
      session: {
        id: "offline_shop.myshopify.com",
        shop: "shop.myshopify.com",
        accessToken: "offline-token",
      },
    });
    const storeSession = vi.fn();
    vi.doMock("@/infra/provider", () => ({
      getEnvProvider: vi.fn((rawEnv) => rawEnv ?? runtimeConfig),
      getShopifyConfigProvider: vi.fn(() => ({
        auth: { callback },
      })),
    }));
    vi.doMock("@/app/modules/shopify/session-storage", () => ({
      getShopifySessionStorage: vi.fn(() => ({ storeSession })),
    }));

    const { createAuthRoutes } = await import("@/app/modules/shopify/auth");
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("runtimeEnv", {
        ...runtimeConfig,
        SHOPIFY_APP_MODE: "standalone",
      } as never);
      await next();
    });
    app.route("/auth", createAuthRoutes());

    const response = await app.request("/auth/callback");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://app.example.com/app",
    );
    expect(response.headers.get("Set-Cookie")).toContain(
      ":shopify_session_id=offline_shop.myshopify.com",
    );
    expect(storeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "offline-token",
      }),
    );
  });

  it("registers auth routes on an app", async () => {
    const { registerAuthRoutes } = await import("@/app/modules/shopify/auth");
    const app = { route: vi.fn() };

    registerAuthRoutes(app as never);

    expect(app.route).toHaveBeenCalledWith("/auth", expect.any(Object));
  });
});

describe("Shopify route metadata and aggregate registration", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("defines shop and product route metadata and schemas", async () => {
    const productMeta = await import("@/app/modules/product/meta");
    const shopMeta = await import("@/app/modules/shop/meta");

    expect(productMeta.getProductsRoute.path).toBe("/api/products");
    expect(productMeta.getProductsRoute.method).toBe("get");
    expect(productMeta.getProductsRoute.middleware).toHaveLength(2);
    expect(
      productMeta.ShopifyProductsDataSchema.safeParse({
        products: {
          edges: [
            {
              node: {
                id: "gid://shopify/Product/1",
                title: "Board",
                status: "ACTIVE",
              },
            },
          ],
        },
      }).success,
    ).toBe(true);

    expect(shopMeta.getShopRoute.path).toBe("/api/shops");
    expect(shopMeta.getShopRoute.method).toBe("get");
    expect(shopMeta.getShopRoute.middleware).toHaveLength(2);
    expect(
      shopMeta.ShopifyShopDataSchema.safeParse({
        shop: {
          name: "Test Shop",
          email: "merchant@example.com",
          myshopifyDomain: "test.myshopify.com",
        },
      }).success,
    ).toBe(true);
  });

  it("registers Shopify app flow routes", async () => {
    const { registerShopifyRoutes } = await import("@/app/modules/shopify");
    const app = {
      get: vi.fn(),
      route: vi.fn(),
      openapi: vi.fn(),
    };

    registerShopifyRoutes(app as never);

    expect(app.get).toHaveBeenCalledTimes(3);
    expect(app.route).toHaveBeenCalledWith("/auth", expect.any(Object));
    expect(app.route).toHaveBeenCalledWith("/webhooks", expect.any(Object));
    expect(app.openapi).not.toHaveBeenCalled();
  });

  it("registers Shopify-backed resource routes from the app route aggregator", async () => {
    const { registerRoutes } = await import("@/app/bootstrap/register-routes");
    const app = {
      get: vi.fn(),
      route: vi.fn(),
      openapi: vi.fn(),
    };

    registerRoutes(app as never);

    const paths = app.openapi.mock.calls.map(([route]) => route.path);
    expect(paths).toContain("/api/shops");
    expect(paths).toContain("/api/products");
  });
});
