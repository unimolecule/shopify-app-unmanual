import { Session } from "@shopify/shopify-api";
import { afterEach, describe, expect, it, vi } from "vitest";

const findSessionsByShop = vi.hoisted(() => vi.fn());

vi.mock("@/infra/provider", () => ({
  getEnvProvider: vi.fn((rawEnv) => rawEnv),
  getShopifyConfigProvider: vi.fn(() => ({
    clients: {
      Graphql: vi.fn(),
    },
    config: {
      scopes: ["read_products"],
    },
  })),
}));

describe("product export runtime Shopify client", () => {
  afterEach(() => {
    findSessionsByShop.mockReset();
  });

  it("fails instead of falling back to online sessions for background jobs", async () => {
    const onlineSession = new Session({
      accessToken: "online-token",
      id: "test-shop.myshopify.com_123",
      isOnline: true,
      scope: "read_products",
      shop: "test-shop.myshopify.com",
      state: "",
    });
    findSessionsByShop.mockResolvedValue([onlineSession]);

    const { createProductExportShopifyClient } =
      await import("@/app/modules/product-export/runtime");

    await expect(
      createProductExportShopifyClient(
        {
          APP_DATABASE_PROVIDER: "postgres",
          APP_RUNTIME: "node",
        } as never,
        { findSessionsByShop } as never,
        "test-shop.myshopify.com",
      ),
    ).rejects.toMatchObject({
      message: "No active offline Shopify Admin session found",
      status: 401,
    });
  });
});
