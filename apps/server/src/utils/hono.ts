import type { AppEnv } from "@/typings";
import type { Context } from "hono";

export function setResponseHeaders(
  c: Context<AppEnv>,
  headers: Record<string, string>,
) {
  for (const [key, value] of Object.entries(headers)) {
    c.header(key, value);
  }
}
