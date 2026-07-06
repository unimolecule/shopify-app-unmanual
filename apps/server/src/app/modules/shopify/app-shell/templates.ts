import { escape as escapeHtml } from "@unimolecule/utils";
import type { RuntimeConfig } from "@/infra/env";

/**
 * Renders the embedded app shell with App Bridge and Polaris web components.
 */
export function renderEmbeddedAppShell(options: RuntimeConfig): string {
  return renderShopifyAppShell({
    appRuntime: options.APP_RUNTIME,
    apiKey: options.SHOPIFY_APP_KEY,
    appBridge: true,
    mode: options.SHOPIFY_APP_MODE,
  });
}

/**
 * Renders the standalone app shell with Polaris web components only.
 */
export function renderStandaloneAppShell(options: RuntimeConfig): string {
  return renderShopifyAppShell({
    appRuntime: options.APP_RUNTIME,
    apiKey: options.SHOPIFY_APP_KEY,
    appBridge: false,
    mode: options.SHOPIFY_APP_MODE,
  });
}

/**
 * Builds the shared HTML document used by both Shopify app modes.
 */
function renderShopifyAppShell(options: {
  appRuntime: string;
  apiKey: string;
  appBridge: boolean;
  mode: string;
}): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="app-runtime" content="${escapeHtml(options.appRuntime)}" />
      <meta name="shopify-api-key" content="${escapeHtml(options.apiKey)}" />
      <meta name="shopify-app-mode" content="${escapeHtml(options.mode)}" />
      ${renderAppBridgeScript(options.appBridge)}
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js"></script>
      <title>My Shopify App</title>
    </head>
    <body>
      <s-page heading="My Shopify App" inline-size="base">
        <s-section heading="Shop Info">
          <s-box id="shop-info">
            <s-spinner size="base" accessibility-label="Loading shop info"></s-spinner>
          </s-box>
        </s-section>

        <s-section heading="Products">
          <s-box id="products-container">
            <s-spinner size="base" accessibility-label="Loading products"></s-spinner>
          </s-box>
        </s-section>
      </s-page>

      <script>
        // Embedded mode relies on App Bridge session tokens.
        // Standalone mode relies on the app's own session cookie.

        async function loadShopInfo() {
          const container = document.getElementById('shop-info');
          try {
            const res = await fetch('/api/shop');
            if (!res.ok) throw new Error('Failed to load shop info');
            const data = await res.json();
            const shop = data.data?.shop;
            if (shop) {
              container.innerHTML =
                '<s-text type="strong">' + escapeHtml(shop.name) + '</s-text>' +
                '<s-text color="subdued"> (' + escapeHtml(shop.myshopifyDomain) + ')</s-text>';
            }
          } catch (err) {
            container.innerHTML = '<s-banner tone="critical">' + escapeHtml(err.message) + '</s-banner>';
          }
        }

        async function loadProducts() {
          const container = document.getElementById('products-container');
          try {
            const res = await fetch('/api/product');
            if (!res.ok) throw new Error('Failed to load products');
            const data = await res.json();
            const products = data.data?.products?.edges || [];

            if (products.length === 0) {
              container.innerHTML = '<s-text color="subdued">No products found.</s-text>';
              return;
            }

            container.innerHTML = '<s-unordered-list>' +
              products.map(function(edge) {
                return '<s-list-item>' + escapeHtml(edge.node.title) + '</s-list-item>';
              }).join('') +
              '</s-unordered-list>';
          } catch (err) {
            container.innerHTML = '<s-banner tone="critical">' + escapeHtml(err.message) + '</s-banner>';
          }
        }

        function escapeHtml(str) {
          var div = document.createElement('div');
          div.appendChild(document.createTextNode(str));
          return div.innerHTML;
        }

        loadShopInfo();
        loadProducts();
      </script>
    </body>
    </html>
  `;
}

/**
 * Returns the App Bridge script tag only when the shell is embedded.
 */
function renderAppBridgeScript(appBridge: boolean): string {
  if (!appBridge) return "";

  return `<script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>`;
}
