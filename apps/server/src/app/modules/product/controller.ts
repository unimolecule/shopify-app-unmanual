import { badGatewayError } from "@/shared/exceptions";
import { AppError, createResponse } from "@/shared/models";
import { getProductsRoute } from "./meta";
import { getProducts } from "./service";
import type { AppOpenAPI } from "@/app/bootstrap/register-openapi";

export function registerProductController(app: AppOpenAPI) {
  return app.openapi(getProductsRoute, async (c) => {
    try {
      return c.json(
        createResponse({
          data: await getProducts(c.var.shopifyAdminClient),
          requestId: c.get("requestId"),
        }),
        200,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw badGatewayError("Failed to fetch products", {
        details: {
          cause: error,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
