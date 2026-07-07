import { getEnvProvider } from "@/infra/provider";
import { createResponse } from "@/shared/models";
import {
  createFileRoute,
  deleteFileRoute,
  downloadFileRoute,
  getFileRoute,
  listFilesRoute,
} from "./meta";
import {
  createFile,
  createFiles,
  deleteFile,
  downloadFile,
  getFile,
  listFiles,
} from "./service";
import type { AppOpenAPI } from "@/app/bootstrap/register-openapi";

export function registerFileController(app: AppOpenAPI) {
  return app
    .openapi(createFileRoute, async (c) => {
      const runtimeEnv = getEnvProvider(c.get("runtimeEnv") ?? c.env);
      const shopDomain = c.get("shopDomain");

      if (isMultipartRequest(c.req.header("Content-Type"))) {
        return c.json(
          createResponse({
            data: await createFiles(c, {
              runtimeEnv,
              shopDomain,
            }),
            requestId: c.get("requestId"),
          }),
          201,
        );
      }

      return c.json(
        createResponse({
          data: await createFile(c, {
            body: c.req.raw.body,
            contentType: c.req.header("Content-Type"),
            originalName: c.req.header("X-File-Name"),
            runtimeEnv,
            shopDomain,
          }),
          requestId: c.get("requestId"),
        }),
        201,
      );
    })
    .openapi(listFilesRoute, async (c) => {
      const { files, pagination } = await listFiles(c, {
        cursor: c.req.valid("query").cursor,
        limit: c.req.valid("query").limit,
        page: c.req.valid("query").page,
        shopDomain: c.get("shopDomain"),
      });

      return c.json(
        createResponse({
          data: {
            pagination,
            result: files,
          },
          requestId: c.get("requestId"),
        }),
        200,
      );
    })
    .openapi(getFileRoute, async (c) =>
      c.json(
        createResponse({
          data: await getFile(c, c.get("shopDomain"), c.req.param("id")),
          requestId: c.get("requestId"),
        }),
        200,
      ),
    )
    .openapi(downloadFileRoute, async (c) => {
      const download = await downloadFile(
        c,
        c.get("shopDomain"),
        c.req.param("id"),
      );

      if (download.type === "redirect") {
        return new Response(null, {
          status: 302,
          headers: {
            ...download.headers,
            Location: download.url,
          },
        });
      }

      return new Response(download.body, {
        status: 200,
        headers: download.headers,
      });
    })
    .openapi(deleteFileRoute, async (c) => {
      await deleteFile(c, c.get("shopDomain"), c.req.param("id"));
      return c.body(null, 204);
    });
}

function isMultipartRequest(contentType: string | undefined): boolean {
  return contentType?.toLowerCase().startsWith("multipart/form-data") ?? false;
}
