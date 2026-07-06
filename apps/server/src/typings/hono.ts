import type { RuntimeCapabilities } from "@/app/runtime/runtime-capabilities";
import type { RuntimeConfig } from "@/infra/env";
import type { Logger } from "@/infra/logger";
import type { ShopifyClient } from "@/infra/provider";
import type { JwtPayload, Session } from "@shopify/shopify-api";

type RuntimeBindings<TRuntime extends RuntimeConfig["APP_RUNTIME"]> =
  TRuntime extends RuntimeConfig["APP_RUNTIME"]
    ? Partial<Extract<RuntimeConfig, { APP_RUNTIME: TRuntime }>> & {
        APP_RUNTIME?: TRuntime;
      } & (TRuntime extends "cloudflare" ? Record<string, unknown> : {})
    : never;

export interface Variables {
  requestId: string;
  runtimeCapabilities: RuntimeCapabilities;
  runtimeEnv: RuntimeConfig;
  runtimeLogger: Logger;

  // Set by verify-session-token middleware
  shopifySessionToken: JwtPayload;
  shopDomain: string;
  shopifyUserId: string;
  // Set by token-exchange middleware
  shopifySession: Session;
  shopifyAccessToken: string;
  // Set by shopify-admin middleware
  shopifyAdminClient: ShopifyClient;
  // Set by verify-webhook middleware
  shopifyWebhook: ShopifyWebhookContext;
}

export type ShopifyWebhookContext = {
  apiVersion: string;
  eventId?: string;
  payload: unknown;
  shop: string;
  subTopic?: string;
  topic: string;
  triggeredAt?: string;
  webhookId?: string;
};

export type RuntimeAppEnv<
  TRuntime extends RuntimeConfig["APP_RUNTIME"] = RuntimeConfig["APP_RUNTIME"],
> = {
  /**
   * Bindings are derived from the runtime config union so env fields stay tied
   * to the Zod schemas. They remain partial because isolate bootstrap can read
   * process.env before request-bound platform bindings are available.
   */
  Bindings: RuntimeBindings<TRuntime>;
  Variables: Variables;
};

/**
 * Shared Hono env used by business modules. Runtime entries can narrow this
 * with RuntimeAppEnv<"cloudflare"> or RuntimeAppEnv<"node"> at the boundary.
 */
export type AppEnv = RuntimeAppEnv;
