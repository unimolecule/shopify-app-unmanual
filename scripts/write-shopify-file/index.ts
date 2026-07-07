import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  configSchema,
  DEFAULT_RUNTIMES,
  DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS,
  DEFAULT_SHOPIFY_APP_MODES,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { isObject, throwRepositoryError as throwError } from "../utils";
import {
  getShopifyAppPath,
  root,
  serverShopifyWebPath,
  shopifyRedirectPaths,
  webShopifyWebPath,
  type ShopifyFileConfig,
} from "./constants";
import {
  formatTomlString,
  replaceOrInsertSectionValue,
  replaceOrInsertTopLevelValue,
  replaceSectionArray,
} from "./toml";

interface ShopifyWebTomlInput {
  roles: readonly string[];
  port: number;
  command: {
    dev: string;
    build: string;
  };
}

const serverCommandsByRuntime = {
  [DEFAULT_RUNTIMES.CLOUDFLARE]: {
    dev: "pnpm cf:dev",
    build: "pnpm cf:deploy",
  },
  [DEFAULT_RUNTIMES.NODE]: {
    dev: "pnpm node:dev",
    build: "pnpm node:deploy",
  },
} as const satisfies Partial<
  Record<ShopifyFileConfig["APP_RUNTIME"], ShopifyWebTomlInput["command"]>
>;

type ServerCommandRuntime = keyof typeof serverCommandsByRuntime;

/**
 * Renders a shopify.web.toml file from roles, port, and command settings.
 */
function renderShopifyWebToml({ roles, port, command }: ShopifyWebTomlInput) {
  return `roles = [${roles.map(formatTomlString).join(", ")}]
port = ${port}

[commands]
dev = ${formatTomlString(command.dev)}
build = ${formatTomlString(command.build)}
`;
}

/**
 * Regenerates Shopify web role files from the active frontend target.
 */
async function writeShopifyWebFiles(config: ShopifyFileConfig) {
  await Promise.all([
    removeFileIfExists(serverShopifyWebPath),
    removeFileIfExists(webShopifyWebPath),
  ]);

  const isBackendFrontendTarget =
    config.SHOPIFY_APP_FRONTEND_TARGET ===
    DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.BACKEND;
  const backendRole = DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.BACKEND;
  const frontendRole = DEFAULT_SHOPIFY_APP_FRONTEND_TARGETS.FRONTEND;
  const serverToml = renderShopifyWebToml({
    roles: isBackendFrontendTarget
      ? [frontendRole, backendRole]
      : [backendRole],
    port: config.APP__SERVER_PORT,
    command: getServerCommand(config.APP_RUNTIME),
  });

  if (isBackendFrontendTarget) {
    await writeFile(serverShopifyWebPath, serverToml);
    return;
  }

  await Promise.all([
    writeFile(serverShopifyWebPath, serverToml),
    writeFile(
      webShopifyWebPath,
      renderShopifyWebToml({
        roles: [frontendRole],
        port: config.APP__WEB_PORT,
        command: {
          dev: "pnpm dev",
          build: "pnpm build",
        },
      }),
    ),
  ]);
}

/**
 * Updates shopify.app.toml while preserving unrelated TOML sections.
 */
async function writeShopifyFile(config: ShopifyFileConfig) {
  const shopifyAppPath = getShopifyAppPath(config.APP_ENV);
  const appUrl = config.SHOPIFY_APP_URL;
  const redirectUrls = shopifyRedirectPaths.map((redirectPath) => {
    return new URL(redirectPath, appUrl).toString();
  });

  let toml = await readRequiredFile(shopifyAppPath);

  toml = replaceOrInsertTopLevelValue(
    toml,
    "client_id",
    formatTomlString(config.SHOPIFY_APP_KEY),
  );
  toml = replaceOrInsertTopLevelValue(
    toml,
    "application_url",
    formatTomlString(appUrl),
  );
  toml = replaceOrInsertTopLevelValue(
    toml,
    "embedded",
    String(config.SHOPIFY_APP_MODE === DEFAULT_SHOPIFY_APP_MODES.EMBEDDED),
  );
  toml = replaceOrInsertSectionValue(
    toml,
    "webhooks",
    "api_version",
    formatTomlString(config.SHOPIFY_API_VERSION),
  );
  toml = replaceOrInsertSectionValue(
    toml,
    "access_scopes",
    "scopes",
    formatTomlString(config.SCOPES),
  );
  toml = replaceSectionArray(toml, "auth", "redirect_urls", redirectUrls);

  await writeFile(shopifyAppPath, toml);
}

/**
 * Resolves server lifecycle commands for runtimes supported by Shopify CLI.
 */
function getServerCommand(runtime: ShopifyFileConfig["APP_RUNTIME"]) {
  if (!isServerCommandRuntime(runtime)) {
    throwError(
      `APP_RUNTIME=${runtime} is not supported by Shopify web TOML generation`,
    );
  }

  const command = serverCommandsByRuntime[runtime];

  return command;
}

/**
 * Narrows runtime values to the command table keys.
 */
function isServerCommandRuntime(
  runtime: ShopifyFileConfig["APP_RUNTIME"],
): runtime is ServerCommandRuntime {
  return Reflect.has(serverCommandsByRuntime, runtime);
}

/**
 * Reads a required file and reports missing paths relative to the repo root.
 */
async function readRequiredFile(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throwError(`${path.relative(root, filePath)} does not exist`);
    }

    throw error;
  }
}

/**
 * Removes generated files when present so each run starts from env state.
 */
async function removeFileIfExists(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

/**
 * Narrows unknown errors to Node filesystem-style errors.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && isObject(error) && "code" in error;
}

/**
 * Validates env and regenerates all Shopify config files.
 */
async function main() {
  const config = configSchema.parse(process.env);

  await Promise.all([writeShopifyWebFiles(config), writeShopifyFile(config)]);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
