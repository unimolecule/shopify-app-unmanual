export const SHOPIFY_WEBHOOK_BASE_PATH = `/webhooks`;

export const SHOPIFY_WEBHOOK_ROUTE_PATHS = {
  APP_UNINSTALLED: "/app/uninstalled",
  BULK_OPERATIONS_FINISH: "/bulk_operations/finish",
  PRIVACY_CUSTOMERS_DATA_REQUEST: "/privacy/customers-data-request",
  PRIVACY_CUSTOMERS_REDACT: "/privacy/customers-redact",
  PRIVACY_SHOP_REDACT: "/privacy/shop-redact",
} as const;
