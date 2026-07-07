import { createResponse } from "@/shared/models";
import {
  createReferenceRoute,
  deleteReferenceRoute,
  getReferenceRoute,
  listReferencesRoute,
  updateReferenceRoute,
} from "./meta";
import {
  createReference,
  deleteReference,
  getReference,
  listReferences,
  updateReference,
} from "./service";
import type { AppOpenAPI } from "@/app/bootstrap/register-openapi";

export function registerReferenceController(app: AppOpenAPI) {
  return app
    .openapi(listReferencesRoute, async (c) => {
      const { pagination, references } = await listReferences(c, {
        cursor: c.req.valid("query").cursor,
        enabled: c.req.valid("query").enabled,
        limit: c.req.valid("query").limit,
        namespace: c.req.param("namespace"),
        page: c.req.valid("query").page,
        shopDomain: c.get("shopDomain"),
      });

      return c.json(
        createResponse({
          data: {
            pagination,
            result: references,
          },
          requestId: c.get("requestId"),
        }),
        200,
      );
    })
    .openapi(createReferenceRoute, async (c) => {
      const body = c.req.valid("json");

      return c.json(
        createResponse({
          data: await createReference(c, {
            code: body.code,
            enabled: body.enabled,
            label: body.label,
            namespace: c.req.param("namespace"),
            shopDomain: c.get("shopDomain"),
            sortOrder: body.sortOrder,
          }),
          requestId: c.get("requestId"),
        }),
        201,
      );
    })
    .openapi(getReferenceRoute, async (c) =>
      c.json(
        createResponse({
          data: await getReference(c, {
            id: c.req.param("id"),
            namespace: c.req.param("namespace"),
            shopDomain: c.get("shopDomain"),
          }),
          requestId: c.get("requestId"),
        }),
        200,
      ),
    )
    .openapi(updateReferenceRoute, async (c) => {
      const body = c.req.valid("json");

      return c.json(
        createResponse({
          data: await updateReference(c, {
            code: body.code,
            enabled: body.enabled,
            id: c.req.param("id"),
            label: body.label,
            namespace: c.req.param("namespace"),
            shopDomain: c.get("shopDomain"),
            sortOrder: body.sortOrder,
          }),
          requestId: c.get("requestId"),
        }),
        200,
      );
    })
    .openapi(deleteReferenceRoute, async (c) => {
      await deleteReference(c, {
        id: c.req.param("id"),
        namespace: c.req.param("namespace"),
        shopDomain: c.get("shopDomain"),
      });

      return c.body(null, 204);
    });
}
