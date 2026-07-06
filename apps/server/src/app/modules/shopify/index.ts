import { registerAppShellRoutes } from "./app-shell";
import { registerAuthRoutes } from "./auth";
import { registerWebhookRoutes } from "./webhook";
import type { AppOpenAPI } from "@/app/bootstrap/register-openapi";

/**
 * Registers Shopify app-flow routes without registering resource API controllers.
 */
export function registerShopifyRoutes(app: AppOpenAPI) {
  registerAppShellRoutes(app);
  registerAuthRoutes(app);
  registerWebhookRoutes(app);
}
