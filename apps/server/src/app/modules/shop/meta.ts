import { createRoute, z } from "@hono/zod-openapi";
import { shopifyAdminClient } from "@/app/modules/shopify/admin";
import { shopifyAdminSession } from "@/app/modules/shopify/mode";
import { ErrorSchema, ResponseSchema } from "@/shared/models";
import { apiPath, tags } from "./constants";

export const ShopifyShopDataSchema = z.object({
  shop: z.object({
    name: z.string().openapi({
      description: "Shop display name.",
      example: "My Shopify Store",
    }),
    email: z.string().email().openapi({
      description: "Shop contact email.",
      example: "merchant@example.com",
    }),
    myshopifyDomain: z.string().openapi({
      description: "Shop myshopify.com domain.",
      example: "my-store.myshopify.com",
    }),
  }),
});

export const getShopRoute = createRoute({
  method: "get",
  path: apiPath,
  middleware: [shopifyAdminSession(), shopifyAdminClient()] as const,
  tags,
  summary: "Shop info",
  description: "Fetch basic Shopify shop information for the app.",
  responses: {
    200: {
      description: "Shop information.",
      content: {
        "application/json": {
          schema: ResponseSchema(ShopifyShopDataSchema),
        },
      },
    },
    401: {
      description: "Missing or invalid Shopify session token.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
    502: {
      description: "Shopify Admin API request failed.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});
