import { getEnvProvider } from "@/infra/provider";
import { createResponse } from "@/shared/models";
import {
  getDatabaseHealthRoute,
  getDiskHealthRoute,
  getHealthRoute,
  getMemoryHealthRoute,
  getNetworkHealthRoute,
  getRedisHealthRoute,
} from "./meta";
import {
  checkDatabaseHealth,
  checkDiskHealth,
  checkMemoryHealth,
  checkNetworkHealth,
  getHealths,
  getReservedHealthStatus,
} from "./service";
import type { AppOpenAPI } from "@/app/bootstrap/register-openapi";

export function registerHealthController(app: AppOpenAPI) {
  app.openapi(getHealthRoute, async (c) =>
    c.json(
      createResponse({
        data: await getHealths(c),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );

  app.openapi(getDiskHealthRoute, async (c) =>
    c.json(
      createResponse({
        data: await checkDiskHealth(c),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );

  app.openapi(getMemoryHealthRoute, async (c) =>
    c.json(
      createResponse({
        data: await checkMemoryHealth(c),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );

  app.openapi(getNetworkHealthRoute, async (c) =>
    c.json(
      createResponse({
        data: await checkNetworkHealth(
          getEnvProvider(c.get("runtimeEnv") ?? c.env),
        ),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );

  app.openapi(getDatabaseHealthRoute, async (c) =>
    c.json(
      createResponse({
        data: await checkDatabaseHealth(c),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );

  app.openapi(getRedisHealthRoute, (c) =>
    c.json(
      createResponse({
        data: getReservedHealthStatus("redis"),
        requestId: c.get("requestId"),
      }),
      200,
    ),
  );
}
