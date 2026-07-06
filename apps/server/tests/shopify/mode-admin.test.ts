import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockContext, expectAppError, runtimeConfig } from "./test-utils";

describe("Shopify app mode capabilities", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/shared/middlewares/shopify");
    vi.doUnmock("@/app/modules/shopify/account/session");
    vi.doUnmock("@/app/modules/shopify/session");
  });

  it("delegates Admin authentication to the configured mode capability", async () => {
    const { shopifyAdminSession, setShopifyModeCapabilities } =
      await import("@/app/modules/shopify/mode/capabilities");
    const authenticateAdminRequest = vi.fn(async (_c, next) => {
      await next();
    });
    const capabilities = {
      isEmbeddedApp: true,
      buildAppShellResponse: vi.fn(),
      renderAppShell: vi.fn(),
      authenticateAdminRequest,
      refreshAdminSession: vi.fn(),
      buildAuthCallbackRedirect: vi.fn(),
    };
    setShopifyModeCapabilities("embedded", capabilities as never);
    const context = createMockContext();
    const next = vi.fn();

    await shopifyAdminSession()(context as never, next);

    expect(authenticateAdminRequest).toHaveBeenCalledWith(context, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("runs embedded Admin authentication through session verification and token exchange", async () => {
    const verifySessionToken = vi.fn(async (_c, callback) => {
      await callback();
    });
    const tokenExchange = vi.fn(async (_c, next) => {
      await next();
    });
    vi.doMock("@/shared/middlewares/shopify", () => ({
      verifySessionToken,
      tokenExchange,
    }));

    const { embeddedShopifyModeCapabilities } =
      await import("@/app/modules/shopify/mode/embedded");
    const context = createMockContext();
    const next = vi.fn();

    await embeddedShopifyModeCapabilities.authenticateAdminRequest(
      context as never,
      next,
    );

    expect(verifySessionToken).toHaveBeenCalledWith(
      context,
      expect.any(Function),
    );
    expect(tokenExchange).toHaveBeenCalledWith(context, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("builds embedded app shell and callback redirects for host and fallback launches", async () => {
    const { embeddedShopifyModeCapabilities } =
      await import("@/app/modules/shopify/mode/embedded");
    const html = vi.fn((body) => new Response(body));
    const hostContext = {
      ...createMockContext({
        url: "https://app.example.com/auth/callback?host=encoded-host",
      }),
      html,
    };
    const fallbackContext = {
      ...createMockContext(),
      html,
    };
    const shopify = {
      auth: {
        buildEmbeddedAppUrl: vi.fn(
          (host) => `https://admin.shopify.com/${host}`,
        ),
      },
    };

    const shell = await embeddedShopifyModeCapabilities.buildAppShellResponse(
      hostContext as never,
    );
    const hostedRedirect =
      embeddedShopifyModeCapabilities.buildAuthCallbackRedirect(
        hostContext as never,
        shopify as never,
        { shop: "shop.myshopify.com" } as never,
        new Headers({ "Set-Cookie": "shopify=1" }),
      );
    const fallbackRedirect =
      embeddedShopifyModeCapabilities.buildAuthCallbackRedirect(
        fallbackContext as never,
        shopify as never,
        { shop: "fallback.myshopify.com" } as never,
        new Headers(),
      );

    expect(await shell.text()).toContain("test_app_key");
    expect((await hostedRedirect).headers.get("Location")).toBe(
      "https://admin.shopify.com/encoded-host",
    );
    expect((await hostedRedirect).headers.get("Set-Cookie")).toBe("shopify=1");
    expect((await fallbackRedirect).headers.get("Location")).toBe(
      "https://app.example.com/app?shop=fallback.myshopify.com",
    );
  });

  it("handles standalone app shell, authentication, refresh failure, and callback cookies", async () => {
    const session = {
      id: "offline_shop.myshopify.com",
      shop: "shop.myshopify.com",
      accessToken: "offline-token",
    };
    const hasShopifyAccountSession = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const loadShopifySessionForAccount = vi.fn(() => session);
    const setShopifySessionContext = vi.fn((c, nextSession) => {
      c.set("shopifySession", nextSession);
      c.set("shopifyAccessToken", nextSession.accessToken);
    });
    vi.doMock(
      "@/app/modules/shopify/account/session",
      async (importOriginal) => ({
        ...(await importOriginal<
          typeof import("@/app/modules/shopify/account/session")
        >()),
        hasShopifyAccountSession,
        loadShopifySessionForAccount,
      }),
    );
    vi.doMock("@/app/modules/shopify/session", () => ({
      setShopifySessionContext,
    }));

    const { standaloneShopifyModeCapabilities } =
      await import("@/app/modules/shopify/mode/standalone");
    const redirectContext = {
      ...createMockContext({
        url: "https://app.example.com/app?shop=shop.myshopify.com",
        vars: {
          runtimeEnv: {
            ...runtimeConfig,
            SHOPIFY_APP_MODE: "standalone",
          },
        },
      }),
      redirect: vi.fn((location) => Response.redirect(location)),
      html: vi.fn((body) => new Response(body)),
    };
    const htmlContext = {
      ...createMockContext({
        vars: {
          runtimeEnv: {
            ...runtimeConfig,
            SHOPIFY_APP_MODE: "standalone",
          },
        },
      }),
      redirect: vi.fn((location) => Response.redirect(location)),
      html: vi.fn((body) => new Response(body)),
    };
    const authContext = createMockContext();
    const next = vi.fn();

    const redirectResponse =
      standaloneShopifyModeCapabilities.buildAppShellResponse(
        redirectContext as never,
      );
    const htmlResponse =
      standaloneShopifyModeCapabilities.buildAppShellResponse(
        htmlContext as never,
      );
    await standaloneShopifyModeCapabilities.authenticateAdminRequest(
      authContext as never,
      next,
    );
    const callbackResponse =
      standaloneShopifyModeCapabilities.buildAuthCallbackRedirect(
        htmlContext as never,
        {} as never,
        session as never,
        new Headers({ "Set-Cookie": "shopify=1" }),
      );

    expect((await redirectResponse).status).toBe(302);
    expect((await redirectResponse).headers.get("Location")).toBe(
      "https://app.example.com/auth?shop=shop.myshopify.com",
    );
    expect(await (await htmlResponse).text()).toContain("test_app_key");
    expect(authContext.var.shopDomain).toBe("shop.myshopify.com");
    expect(authContext.var.shopifySession).toBe(session);
    expect(authContext.var.shopifyAccessToken).toBe("offline-token");
    expect(next).toHaveBeenCalledOnce();
    expect((await callbackResponse).status).toBe(302);
    expect((await callbackResponse).headers.get("Location")).toBe(
      "https://app.example.com/app",
    );
    expect((await callbackResponse).headers.get("Set-Cookie")).toContain(
      ":shopify_session_id=offline_shop.myshopify.com",
    );

    expect(() =>
      standaloneShopifyModeCapabilities.refreshAdminSession(
        htmlContext as never,
      ),
    ).toThrow();
    try {
      standaloneShopifyModeCapabilities.refreshAdminSession(
        htmlContext as never,
      );
    } catch (error) {
      expectAppError(
        error,
        401,
        "Standalone Shopify session expired or was revoked",
      );
    }
  });
});
