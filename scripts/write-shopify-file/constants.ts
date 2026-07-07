import path from "node:path";
import {
  DEFAULT_ENVS,
  type ConfigSchema,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { findMonorepoRoot, throwError } from "../utils";

export type ShopifyFileConfig = ConfigSchema;

export const root = findMonorepoRoot();

if (!root) {
  throwError("write-shopify-file", "Cannot find monorepo root");
}

export const serverShopifyWebPath = path.resolve(
  root,
  "apps/server/shopify.web.toml",
);

export const webShopifyWebPath = path.resolve(
  root,
  "apps/web/shopify.web.toml",
);

export const shopifyRedirectPaths = [
  "/auth/callback",
  "/auth/shopify/callback",
  "/api/auth/callback",
] as const;

export function getShopifyAppPath(appEnv: ShopifyFileConfig["APP_ENV"]) {
  return path.resolve(
    root,
    appEnv === DEFAULT_ENVS.PRODUCTION
      ? "shopify.app.production.toml"
      : "shopify.app.toml",
  );
}
