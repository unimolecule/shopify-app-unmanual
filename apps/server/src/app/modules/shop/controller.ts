import { badGatewayError } from "@/shared/exceptions";
import { AppError, createResponse } from "@/shared/models";
import { getShopRoute } from "./meta";
import { getShopInfo } from "./service";
import type { AppOpenAPI } from "@/app/bootstrap/register-openapi";

export function registerShopController(app: AppOpenAPI) {
  app.openapi(getShopRoute, async (c) => {
    try {
      return c.json(
        createResponse({
          data: await getShopInfo(c.var.shopifyAdminClient),
          requestId: c.get("requestId"),
        }),
        200,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;

      throw badGatewayError("Failed to fetch shop info", {
        details: {
          cause: error,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}
