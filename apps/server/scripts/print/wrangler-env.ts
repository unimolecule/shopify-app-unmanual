const envKeys = [
  "APP_ENV",
  "APP_RUNTIME",
  "APP_LOGGER_EXPIRE",
  "APP__SERVER_PORT",
  "APP__WEB_PORT",
  "HOST",
  "APP_URL",
  "SERVER_PORT",
  "BACKEND_PORT",
  "FRONTEND_PORT",
  "PORT",
  "SHOPIFY_API_KEY",
  "SHOPIFY_APP_MODE",
  "SHOPIFY_APP_KEY",
  "SHOPIFY_APP_SECRET",
  "SHOPIFY_APP_URL",
  "SHOPIFY_API_VERSION",
  "SCOPES",
] as const;

const isRealWranglerCli = process.argv[1]?.includes("wrangler-dist/cli.js");

if (isRealWranglerCli) {
  // eslint-disable-next-line no-console
  console.log("[wrangler process env]", {
    pid: process.pid,
    cwd: process.cwd(),
    argv: process.argv,
    env: Object.fromEntries(
      envKeys.map((key) => [key, formatEnvValue(key, process.env[key])]),
    ),
  });
}

/**
 * Redact secret values while preserving whether they were provided.
 */
function formatEnvValue(key: string, value: string | undefined) {
  if (value === undefined) return "<missing>";
  if (key.includes("SECRET")) return `<set:${value.length}>`;
  return value;
}
