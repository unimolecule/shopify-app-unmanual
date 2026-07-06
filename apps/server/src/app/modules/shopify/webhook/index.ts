import {
  DeliveryMethod,
  type AddHandlersParams,
  type Session,
} from "@shopify/shopify-api";
import { Hono, type Context } from "hono";
import { handleProductExportBulkOperationFinishWebhook } from "@/app/modules/product-export/webhook";
import {
  getEnvProvider,
  getLoggerProvider,
  getShopifyConfigProvider,
} from "@/infra/provider";
import { verifyWebhook } from "@/shared/middlewares";
import { createResponse } from "@/shared/models";
import { getShopifySessionStorage } from "../session-storage";
import {
  SHOPIFY_WEBHOOK_BASE_PATH,
  SHOPIFY_WEBHOOK_ROUTE_PATHS,
} from "./constants";
import type { AppEnv } from "@/typings";

const SHOPIFY_WEBHOOK_HANDLERS = {
  APP_UNINSTALLED: {
    callbackUrl: `${SHOPIFY_WEBHOOK_BASE_PATH}${SHOPIFY_WEBHOOK_ROUTE_PATHS.APP_UNINSTALLED}`,
    deliveryMethod: DeliveryMethod.Http,
    callback: async (
      topic,
      shop,
      _body,
      webhookId,
      _apiVersion,
      _subTopic,
      context,
    ) => {
      await Promise.resolve();
      context?.logger?.debug(
        `Shopify SDK webhook callback reached for ${topic} ${webhookId} from ${shop}`,
      );
    },
  },
  BULK_OPERATIONS_FINISH: {
    callbackUrl: `${SHOPIFY_WEBHOOK_BASE_PATH}${SHOPIFY_WEBHOOK_ROUTE_PATHS.BULK_OPERATIONS_FINISH}`,
    deliveryMethod: DeliveryMethod.Http,
    callback: async (
      topic,
      shop,
      _body,
      webhookId,
      _apiVersion,
      _subTopic,
      context,
    ) => {
      await Promise.resolve();
      context?.logger?.debug(
        `Shopify SDK webhook callback reached for ${topic} ${webhookId} from ${shop}`,
      );
    },
  },
} satisfies AddHandlersParams;

const shopifyInstancesWithWebhookHandlers = new WeakSet<
  Awaited<ReturnType<typeof getShopifyConfigProvider>>
>();

/**
 * Creates verified Shopify webhook routes and handlers.
 */
export const createWebhookRoutes = () => {
  const webhookRoutes = new Hono<AppEnv>();

  webhookRoutes.use("/*", verifyWebhook);

  webhookRoutes.post(SHOPIFY_WEBHOOK_ROUTE_PATHS.APP_UNINSTALLED, async (c) => {
    const { shop } = c.var.shopifyWebhook;
    const sessionStorage = await getShopifySessionStorage(c);
    const sessions = await sessionStorage.findSessionsByShop(shop);
    await sessionStorage.deleteSessions(sessions.map((session) => session.id));
    const logger = await getRequestLogger(c);
    logger.info(`App uninstalled: ${shop}`);
    return c.json(
      createResponse({ data: { ok: true }, requestId: c.get("requestId") }),
    );
  });

  webhookRoutes.post(
    SHOPIFY_WEBHOOK_ROUTE_PATHS.BULK_OPERATIONS_FINISH,
    handleProductExportBulkOperationFinishWebhook,
  );

  //:========================================: GDPR START :========================================//
  webhookRoutes.post(
    SHOPIFY_WEBHOOK_ROUTE_PATHS.PRIVACY_CUSTOMERS_DATA_REQUEST,
    async (c) => {
      const { payload, shop } = c.var.shopifyWebhook;
      const logger = await getRequestLogger(c);
      logger.info(
        `Customer data request from ${shop}: ${JSON.stringify(payload)}`,
      );
      return c.json(
        createResponse({ data: { ok: true }, requestId: c.get("requestId") }),
      );
    },
  );

  webhookRoutes.post(
    SHOPIFY_WEBHOOK_ROUTE_PATHS.PRIVACY_CUSTOMERS_REDACT,
    async (c) => {
      const { payload, shop } = c.var.shopifyWebhook;
      const logger = await getRequestLogger(c);
      logger.info(
        `Customer redact request from ${shop}: ${JSON.stringify(payload)}`,
      );
      return c.json(
        createResponse({ data: { ok: true }, requestId: c.get("requestId") }),
      );
    },
  );

  webhookRoutes.post(
    SHOPIFY_WEBHOOK_ROUTE_PATHS.PRIVACY_SHOP_REDACT,
    async (c) => {
      const { payload, shop } = c.var.shopifyWebhook;
      const logger = await getRequestLogger(c);
      logger.info(
        `Shop redact request from ${shop}: ${JSON.stringify(payload)}`,
      );
      return c.json(
        createResponse({ data: { ok: true }, requestId: c.get("requestId") }),
      );
    },
  );
  //:========================================: GDPR  END  :========================================//

  return webhookRoutes;
};

/**
 * Mounts Shopify webhook routes under the webhook prefix.
 */
export const registerWebhookRoutes = (app: Hono<AppEnv>) => {
  app.route(SHOPIFY_WEBHOOK_BASE_PATH, createWebhookRoutes());
};

/**
 * Reconciles the app's shop-specific webhook subscriptions for one shop.
 */
export async function registerConfiguredShopifyWebhooks(
  c: Context<AppEnv>,
  session: Session,
) {
  const shopify = await getShopifyConfigProvider(
    getEnvProvider(c.get("runtimeEnv") ?? c.env),
  );

  if (!shopifyInstancesWithWebhookHandlers.has(shopify)) {
    shopify.webhooks.addHandlers(SHOPIFY_WEBHOOK_HANDLERS);
    shopifyInstancesWithWebhookHandlers.add(shopify);
  }

  const result = await shopify.webhooks.register({ session });

  const logger = await getRequestLogger(c);
  const message = `Registered Shopify webhooks for ${session.shop}`;
  logger.info(
    result === undefined ? message : `${message}: ${JSON.stringify(result)}`,
  );

  return result;
}

function getRequestLogger(c: Context<AppEnv>) {
  return getLoggerProvider(getEnvProvider(c.get("runtimeEnv") ?? c.env));
}
