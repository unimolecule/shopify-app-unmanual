import {
  ApiVersion,
  LogSeverity,
  shopifyApi,
  type Shopify,
} from "@shopify/shopify-api";
import { internalServerError } from "@/shared/exceptions";
import { isEmbeddedShopifyAppMode } from "@/utils";
import type { RuntimeConfig } from "@/infra/env";
import type { Logger } from "@/infra/logger";
import "@shopify/shopify-api/adapters/web-api";

const apiVersions: Record<string, ApiVersion> = {
  "2026-07": ApiVersion.July26,
};

export function getShopifyEnvConfig(config: RuntimeConfig) {
  const appUrl = new URL(config.SHOPIFY_APP_URL);
  const hostScheme: "http" | "https" =
    appUrl.protocol === "http:" ? "http" : "https";

  return {
    apiKey: config.SHOPIFY_APP_KEY,
    apiSecretKey: config.SHOPIFY_APP_SECRET,
    apiVersion: getShopifyApiVersion(config.SHOPIFY_API_VERSION),
    hostName: appUrl.host,
    hostScheme,
    isEmbeddedApp: isEmbeddedShopifyAppMode(config.SHOPIFY_APP_MODE),
    scopes: config.SCOPES.split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}

/**
 * Creates the Shopify API SDK instance from validated runtime configuration.
 */
export function createShopifyConfig(
  config: RuntimeConfig,
  logger: Logger,
): Shopify {
  const shopifyEnvConfig = getShopifyEnvConfig(config);

  return shopifyApi({
    ...shopifyEnvConfig,
    logger: {
      level: LogSeverity.Info,
      log: (severity, message) => {
        logShopifyMessage(logger, severity, message);
      },
    },
  });
}

/**
 * Maps the configured Shopify API version string to the SDK enum.
 */
function getShopifyApiVersion(version: string): ApiVersion {
  const apiVersion = apiVersions[version.trim()];
  if (!apiVersion) {
    throw internalServerError(`Unsupported Shopify API version: ${version}`, {
      details: {
        version,
      },
      expose: true,
    });
  }
  return apiVersion;
}

/**
 * Forwards Shopify SDK logs into the app logger with matching severity.
 */
function logShopifyMessage(
  logger: Logger,
  severity: LogSeverity,
  message: string,
) {
  switch (severity) {
    case LogSeverity.Debug: {
      logger.debug(message);
      break;
    }
    case LogSeverity.Info: {
      logger.info(message);
      break;
    }
    case LogSeverity.Warning: {
      logger.warn(message);
      break;
    }
    case LogSeverity.Error: {
      logger.error(message);
      break;
    }
  }
}
