import { DEFAULT_SHOPIFY_APP_MODES, type ConfigSchema } from "@shamt/app-env";
import { escape as escapeHtml } from "@unimolecule/utils";
import { throwAppWebError as throwError } from "../../../internal";
import type { Plugin } from "vite";

interface HtmlPluginOptions {
  env: ConfigSchema;
  appName: string;
  shopifyApiKey?: string;
}

/**
 * Replaces Shopify HTML placeholders with escaped metadata and runtime scripts.
 */
export function htmlPlugin({
  env,
  appName,
  shopifyApiKey,
}: HtmlPluginOptions): Plugin {
  const resolvedShopifyApiKey = shopifyApiKey ?? env.SHOPIFY_APP_KEY;

  return {
    name: "html",
    enforce: "pre",
    transformIndexHtml(html) {
      if (!resolvedShopifyApiKey) {
        throwError(
          "apps/web",
          "SHOPIFY_API_KEY or SHOPIFY_APP_KEY is required to render apps/web/index.html",
        );
      }

      return html
        .replaceAll("%SHOPIFY_APP_FRONTEND_NAME%", escapeHtml(appName))
        .replaceAll(
          "%SHOPIFY_APP_FRONTEND_HEAD%",
          renderShopifyHead({
            appRuntime: env.APP_RUNTIME,
            apiKey: resolvedShopifyApiKey,
            mode: env.SHOPIFY_APP_MODE,
          }),
        );
    },
  };
}

/**
 * Renders the fixed Shopify head tags that the web app needs at startup.
 */
function renderShopifyHead(options: {
  appRuntime: string;
  apiKey: string;
  mode: string;
}) {
  return [
    `<meta name="app-runtime" content="${escapeHtml(options.appRuntime)}" />`,
    `<meta name="shopify-api-key" content="${escapeHtml(options.apiKey)}" />`,
    `<meta name="shopify-app-mode" content="${escapeHtml(options.mode)}" />`,
    ...renderAppBridgeScript(options.mode),
    `<script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>`,
  ].join("\n    ");
}

/**
 * Loads App Bridge only for embedded apps that run inside Shopify Admin.
 */
function renderAppBridgeScript(mode: string) {
  if (mode !== DEFAULT_SHOPIFY_APP_MODES.EMBEDDED) {
    return [];
  }

  return [
    `<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`,
  ];
}
