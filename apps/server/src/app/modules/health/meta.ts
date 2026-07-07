import { createRoute, z } from "@hono/zod-openapi";
import { ErrorSchema, ResponseSchema } from "@/shared/models";
import { apiPath, tags } from "./constants";

const HealthStatusSchema = z.enum(["ok", "error", "unsupported", "reserved"]);
const HealthChecksSchema = z.record(z.string(), z.unknown()).openapi({
  description: "Runtime-specific threshold check details.",
});

export const DiskHealthDataSchema = z.object({
  status: HealthStatusSchema.openapi({
    description: "Disk check status.",
    example: "ok",
  }),
  target: z.literal("disk").openapi({
    description: "Health check target.",
    example: "disk",
  }),
  runtime: z.string().openapi({
    description: "Application runtime used for this check.",
    example: "node",
  }),
  path: z.string().optional().openapi({
    description: "Checked filesystem path when disk access is supported.",
    example: "/app",
  }),
  totalBytes: z.number().int().optional().openapi({
    description: "Total filesystem size in bytes.",
    example: 107374182400,
  }),
  freeBytes: z.number().int().optional().openapi({
    description: "Free filesystem bytes.",
    example: 64424509440,
  }),
  availableBytes: z.number().int().optional().openapi({
    description: "Available filesystem bytes for unprivileged users.",
    example: 60129542144,
  }),
  usedBytes: z.number().int().optional().openapi({
    description: "Used filesystem bytes.",
    example: 42949672960,
  }),
  usedPercent: z.number().optional().openapi({
    description: "Used filesystem ratio from 0 to 1.",
    example: 0.4,
  }),
  checks: HealthChecksSchema.optional(),
  message: z.string().optional().openapi({
    description: "Runtime-specific disk check failure message.",
    example: "Module health disk checker capability is not registered",
  }),
});
export const getDiskHealthRoute = createRoute({
  method: "get",
  path: `${apiPath}/disk`,
  tags,
  summary: "Disk health check",
  description: "Check filesystem availability when the runtime supports it.",
  responses: {
    200: {
      description: "Disk health result.",
      content: {
        "application/json": {
          schema: ResponseSchema(DiskHealthDataSchema),
        },
      },
    },
  },
});

export const MemoryHealthDataSchema = z.object({
  status: HealthStatusSchema.openapi({
    description: "Memory check status.",
    example: "ok",
  }),
  target: z.literal("memory").openapi({
    description: "Health check target.",
    example: "memory",
  }),
  runtime: z.string().openapi({
    description: "Application runtime used for this check.",
    example: "node",
  }),
  rss: z.number().int().optional().openapi({
    description: "Resident set size in bytes.",
    example: 73400320,
  }),
  heapTotal: z.number().int().optional().openapi({
    description: "Total V8 heap size in bytes.",
    example: 31457280,
  }),
  heapUsed: z.number().int().optional().openapi({
    description: "Used V8 heap size in bytes.",
    example: 18874368,
  }),
  external: z.number().int().optional().openapi({
    description: "External memory in bytes.",
    example: 4194304,
  }),
  arrayBuffers: z.number().int().optional().openapi({
    description: "ArrayBuffer memory in bytes.",
    example: 1048576,
  }),
  checks: HealthChecksSchema.optional(),
  message: z.string().optional().openapi({
    description: "Runtime-specific memory check message.",
    example: "heap used bytes 200000000 exceeds 150000000",
  }),
});
export const getMemoryHealthRoute = createRoute({
  method: "get",
  path: `${apiPath}/memory`,
  tags,
  summary: "Memory health check",
  description: "Check runtime memory metrics when available.",
  responses: {
    200: {
      description: "Memory health result.",
      content: {
        "application/json": {
          schema: ResponseSchema(MemoryHealthDataSchema),
        },
      },
    },
  },
});

export const NetworkHealthDataSchema = z.object({
  status: z.literal("ok").openapi({
    description: "Network check status.",
    example: "ok",
  }),
  target: z.literal("network").openapi({
    description: "Health check target.",
    example: "network",
  }),
  reachable: z.literal(true).openapi({
    description: "Whether the network target responded successfully.",
    example: true,
  }),
  statusCode: z.number().int().openapi({
    description: "HTTP status code returned by the network target.",
    example: 200,
  }),
  latencyMs: z.number().openapi({
    description: "Measured request latency in milliseconds.",
    example: 42.5,
  }),
});
export const NetworkHealthErrorDataSchema = z.object({
  status: z.literal("error").openapi({
    description: "Network check error status.",
    example: "error",
  }),
  target: z.literal("network").openapi({
    description: "Health check target.",
    example: "network",
  }),
  reachable: z.literal(false).openapi({
    description: "Whether the network target responded successfully.",
    example: false,
  }),
  latencyMs: z.number().optional().openapi({
    description: "Measured request latency in milliseconds.",
    example: 42.5,
  }),
  message: z.string().openapi({
    description: "Runtime-specific network check failure message.",
    example: "fetch failed",
  }),
});
export const AggregatedNetworkHealthDataSchema = z.union([
  NetworkHealthDataSchema,
  NetworkHealthErrorDataSchema,
]);
export const getNetworkHealthRoute = createRoute({
  method: "get",
  path: `${apiPath}/network`,
  tags,
  summary: "Network health check",
  description: "Check outbound network connectivity.",
  responses: {
    200: {
      description: "Network health result.",
      content: {
        "application/json": {
          schema: ResponseSchema(NetworkHealthDataSchema),
        },
      },
    },
    408: {
      description: "Network health check timed out.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
    502: {
      description: "Network health check failed.",
      content: {
        "application/json": {
          schema: ErrorSchema(z.null()),
        },
      },
    },
  },
});

export const DatabaseHealthDataSchema = z.object({
  status: z.enum(["ok", "error"]).openapi({
    description: "Database check status.",
    example: "ok",
  }),
  target: z.literal("database").openapi({
    description: "Health check target.",
    example: "database",
  }),
  runtime: z.string().openapi({
    description: "Application runtime used for this check.",
    example: "node",
  }),
  provider: z.string().optional().openapi({
    description: "Database provider used for this check.",
    example: "postgres",
  }),
  dialect: z.enum(["postgres", "sqlite"]).optional().openapi({
    description: "SQL dialect used for this check.",
    example: "postgres",
  }),
  latencyMs: z.number().optional().openapi({
    description: "Measured database check latency in milliseconds.",
    example: 4.2,
  }),
  message: z.string().optional().openapi({
    description: "Runtime-specific database check failure message.",
    example: "connection refused",
  }),
});
export const getDatabaseHealthRoute = createRoute({
  method: "get",
  path: `${apiPath}/database`,
  tags,
  summary: "Database health check",
  description:
    "Check database connectivity through the active runtime adapter.",
  responses: {
    200: {
      description: "Database health result.",
      content: {
        "application/json": {
          schema: ResponseSchema(DatabaseHealthDataSchema),
        },
      },
    },
  },
});

export const ReservedHealthDataSchema = z.object({
  status: z.literal("reserved").openapi({
    description: "Reserved health check status.",
    example: "reserved",
  }),
  target: z.enum(["redis"]).openapi({
    description: "Reserved health check target.",
    example: "redis",
  }),
});
export const getRedisHealthRoute = createReservedHealthRoute(
  `${apiPath}/redis`,
  "Redis health check",
  "Reserved Redis health check endpoint.",
);

const HealthAggregateChecksSchema = z.object({
  disk: DiskHealthDataSchema,
  memory: MemoryHealthDataSchema,
  network: AggregatedNetworkHealthDataSchema,
  database: DatabaseHealthDataSchema,
  redis: ReservedHealthDataSchema,
});
export const HealthDataSchema = z.object({
  status: z.enum(["ok", "error"]).openapi({
    description: "Aggregated server health status.",
    example: "ok",
  }),
  checks: HealthAggregateChecksSchema.openapi({
    description: "Aggregated health check results by target.",
  }),
});
export const getHealthRoute = createRoute({
  method: "get",
  path: apiPath,
  tags,
  summary: "Health check",
  description: "Check server health by aggregating all health targets.",
  responses: {
    200: {
      description: "Aggregated health result.",
      content: {
        "application/json": {
          schema: ResponseSchema(HealthDataSchema),
        },
      },
    },
  },
});

function createReservedHealthRoute<const TPath extends string>(
  routePath: TPath,
  summary: string,
  description: string,
) {
  return createRoute({
    method: "get",
    path: routePath,
    tags,
    summary,
    description,
    responses: {
      200: {
        description: "Reserved health result.",
        content: {
          "application/json": {
            schema: ResponseSchema(ReservedHealthDataSchema),
          },
        },
      },
    },
  });
}
