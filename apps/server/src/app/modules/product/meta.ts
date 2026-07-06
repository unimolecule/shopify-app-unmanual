import { createRoute, z } from "@hono/zod-openapi";
import { shopifyAdminClient } from "@/app/modules/shopify/admin";
import { shopifyAdminSession } from "@/app/modules/shopify/mode";
import { ErrorSchema, ResponseSchema } from "@/shared/models";
import { apiPath, tags } from "./constants";

export const ShopifyProductsDataSchema = z.object({
  products: z.object({
    edges: z.array(
      z.object({
        node: z.object({
          id: z.string().openapi({
            description: "Product GraphQL ID.",
            example: "gid://shopify/Product/1234567890",
          }),
          title: z.string().openapi({
            description: "Product title.",
            example: "Snowboard",
          }),
          status: z.string().openapi({
            description: "Product status.",
            example: "ACTIVE",
          }),
        }),
      }),
    ),
  }),
});

export const getProductsRoute = createRoute({
  method: "get",
  path: apiPath,
  middleware: [shopifyAdminSession(), shopifyAdminClient()] as const,
  tags,
  summary: "Products",
  description: "Fetch a sample list of Shopify products for the app.",
  responses: {
    200: {
      description: "Products list.",
      content: {
        "application/json": {
          schema: ResponseSchema(ShopifyProductsDataSchema),
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
