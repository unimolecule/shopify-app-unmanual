import { createMiddleware } from "hono/factory";
import type { AppEnv } from "@/typings";

export function emojiFaviconMiddleware(emoji: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.req.path === "/favicon.ico") {
      c.res.headers.set("content-type", "image/svg+xml");
      return c.body(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" x="-0.1em" font-size="90">${emoji}</text></svg>`,
      );
    }
    await next();
  });
}
