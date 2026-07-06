import { DEFAULT_APP_NAME } from "@shamt/app-env";

const appName =
  typeof process !== "undefined" && process.env.APP_NAME
    ? process.env.APP_NAME
    : DEFAULT_APP_NAME;

export const DEFAULT_APP_ACCOUNT_SESSION_COOKIE = `${appName}:shopify_session_id`;
export const DEFAULT_APP_ACCOUNT_SESSION_EXPIRE = 60 * 60 * 24 * 30;
export const DEFAULT_WEBHOOK_MAX_SIZE = 1024 * 1024; // limit webhook body size to 1mb
export const DEFAULT_SIGNED_DOWNLOAD_URL_EXPIRE = 10 * 60 * 1000;
