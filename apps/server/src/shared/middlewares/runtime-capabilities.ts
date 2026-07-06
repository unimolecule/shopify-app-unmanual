import { createMiddleware } from "hono/factory";
import {
  runtimeCapabilityDatabase,
  runtimeCapabilityLazy,
  type RuntimeCapabilities,
} from "@/app/runtime/runtime-capabilities";
import { internalServerError } from "@/shared/exceptions";
import type { AppEnv } from "@/typings";
import type { Context } from "hono";

export type RuntimeCapabilitiesCreator = (
  c: Context<AppEnv>,
) => RuntimeCapabilities | Promise<RuntimeCapabilities>;

export function runtimeCapabilitiesMiddleware(
  createRuntimeCapabilities: RuntimeCapabilitiesCreator = createMissingRuntimeCapabilitiesError,
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const capabilities = await createRuntimeCapabilities(c);
    c.set("runtimeCapabilities", capabilities);
    await next();
  });
}

function createMissingRuntimeCapabilitiesError(): RuntimeCapabilities {
  return {
    database: runtimeCapabilityDatabase(missingCapability("database"), {
      files: missingSyncCapability("database.repositories.files"),
      productExports: missingSyncCapability(
        "database.repositories.productExports",
      ),
      references: missingSyncCapability("database.repositories.references"),
    }),
    bucket: missingCapability("bucket"),
    shopifySessionStorage: missingCapability("shopifySessionStorage"),
    health: {
      disk: missingCapability("health.disk"),
      memory: missingCapability("health.memory"),
    },
    file: {
      downloadResolver: missingCapability("file.downloadResolver"),
    },
    queue: {
      producer: missingCapability("queue.producer"),
    },
  };
}

function missingCapability<T>(name: string) {
  return runtimeCapabilityLazy<T>(() => {
    throw internalServerError(`Runtime capability is not available: ${name}`, {
      expose: true,
    });
  });
}

function missingSyncCapability(name: string) {
  return () => {
    throw internalServerError(`Runtime capability is not available: ${name}`, {
      expose: true,
    });
  };
}
