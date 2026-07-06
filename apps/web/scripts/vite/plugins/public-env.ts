import {
  PUBLIC_ENV_GLOBAL_NAME,
  SENSITIVE_ENV_KEY_IDENTIFIERS,
} from "../../../constants";
import { throwAppWebError as throwError } from "../../../internal";
import type { ConfigSchema } from "@shamt/app-env";
import type { Plugin } from "vite";

interface PublicEnvPluginOptions {
  env: ConfigSchema;
  globalName?: string;
}

/**
 * Injects a frozen, client-safe env object before the application bundle runs.
 */
export function publicEnvPlugin({
  env,
  globalName = PUBLIC_ENV_GLOBAL_NAME,
}: PublicEnvPluginOptions): Plugin {
  validateGlobalName(globalName);

  const publicEnv = Object.fromEntries(
    Object.entries(env).filter(
      ([key, value]) => value !== undefined && !isSensitiveEnvKey(key),
    ),
  );
  const script = [
    `Object.defineProperty(globalThis, ${JSON.stringify(globalName)}, {`,
    `  value: Object.freeze(${serializeScriptJson(publicEnv)}),`,
    "  writable: false,",
    "  configurable: false,",
    "});",
  ].join("\n");

  return {
    name: "public-env",
    enforce: "pre",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: script,
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

/**
 * Rejects global names that cannot be assigned as JavaScript identifiers.
 */
function validateGlobalName(globalName: string) {
  if (!/^[$A-Z_][$\w]*$/i.test(globalName)) {
    throwError("apps/web", `Invalid public env global name: ${globalName}`);
  }
}

/**
 * Detects env keys that should never be exposed to browser code.
 */
function isSensitiveEnvKey(key: string) {
  return sensitiveEnvKeyPattern.test(key);
}

const sensitiveEnvKeyPattern = new RegExp(
  SENSITIVE_ENV_KEY_IDENTIFIERS.map(escapeRegExp).join("|"),
  "i",
);

/**
 * Escapes user-provided fragments before they are joined into a RegExp.
 */
function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * Serializes JSON for inline scripts without allowing HTML/script breakouts.
 */
function serializeScriptJson(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", String.raw`\u003C`)
    .replaceAll(">", String.raw`\u003E`)
    .replaceAll("&", String.raw`\u0026`)
    .replaceAll("\u2028", String.raw`\u2028`)
    .replaceAll("\u2029", String.raw`\u2029`);
}
