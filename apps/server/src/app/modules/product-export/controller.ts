import { ensureShopifyOfflineSession } from "@/app/modules/shopify/session";
import { registerConfiguredShopifyWebhooks } from "@/app/modules/shopify/webhook";
import { getEnvProvider } from "@/infra/provider";
import { badGatewayError } from "@/shared/exceptions";
import { AppError, createResponse } from "@/shared/models";
import {
  createProductExportRoute,
  deleteProductExportRoute,
  downloadProductExportRoute,
  getProductExportRoute,
  listProductExportsRoute,
  listProductExportTemplatesRoute,
} from "./meta";
import {
  createProductExport,
  deleteProductExport,
  downloadProductExport,
  getProductExport,
  listProductExports,
  listProductExportTemplates,
} from "./service";
import type { ProductExportStatus } from "./types";
import type { AppOpenAPI } from "@/app/bootstrap/register-openapi";

export function registerProductExportController(app: AppOpenAPI) {
  app.openapi(createProductExportRoute, async (c) => {
    try {
      const body = c.req.valid("json");
      const offlineSession = await ensureShopifyOfflineSession(c);
      await registerConfiguredShopifyWebhooks(c, offlineSession);
      return c.json(
        createResponse({
          data: await createProductExport(c, {
            name: body.name,
            runtimeEnv: getEnvProvider(c.get("runtimeEnv") ?? c.env),
            shopDomain: c.get("shopDomain"),
            template: body.template,
          }),
          requestId: c.get("requestId"),
        }),
        202,
      );
    } catch (error) {
      if (error instanceof AppError) throw error;

      const message = getErrorMessage(error);
      throw badGatewayError(`Failed to create product export: ${message}`, {
        details: {
          cause: error,
          message,
        },
        expose: true,
      });
    }
  });

  app.openapi(listProductExportsRoute, async (c) => {
    const { pagination, productExports } = await listProductExports(c, {
      cursor: c.req.valid("query").cursor,
      limit: c.req.valid("query").limit,
      page: c.req.valid("query").page,
      shopDomain: c.get("shopDomain"),
      status: c.req.valid("query").status as ProductExportStatus | undefined,
    });

    return c.json(
      createResponse({
        data: {
          pagination,
          result: productExports,
        },
        requestId: c.get("requestId"),
      }),
      200,
    );
  });

  app.openapi(listProductExportTemplatesRoute, (c) =>
    c.json(
      createResponse({
        data: listProductExportTemplates(),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );

  app.openapi(getProductExportRoute, async (c) =>
    c.json(
      createResponse({
        data: await getProductExport(c, {
          id: c.req.param("id"),
          shopDomain: c.get("shopDomain"),
        }),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );

  app.openapi(downloadProductExportRoute, async (c) => {
    const download = await downloadProductExport(
      c,
      c.get("shopDomain"),
      c.req.param("id"),
    );

    if (download.type === "redirect") {
      if (wantsJson(c.req.header("Accept"))) {
        return c.json(
          createResponse({
            data: {
              type: "redirect",
              url: download.url,
            },
            requestId: c.get("requestId"),
          }),
          200,
        );
      }

      return new Response(null, {
        status: 302,
        headers: {
          ...download.headers,
          Location: download.url,
        },
      });
    }

    if (wantsJson(c.req.header("Accept"))) {
      return c.json(
        createResponse({
          data: {
            type: "stream",
            url: c.req.url,
          },
          requestId: c.get("requestId"),
        }),
        200,
      );
    }

    return new Response(download.body, {
      status: 200,
      headers: download.headers,
    });
  });

  app.openapi(deleteProductExportRoute, async (c) => {
    await deleteProductExport(c, {
      id: c.req.param("id"),
      shopDomain: c.get("shopDomain"),
    });

    return c.body(null, 204);
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wantsJson(accept: string | undefined): boolean {
  return accept?.toLowerCase().includes("application/json") ?? false;
}
