import { timeout } from "hono/timeout";
import { timeoutError } from "@/shared/exceptions";
import type { HTTPException } from "hono/http-exception";

export function timeoutMiddleware(
  timeoutMs: number,
  message = "Request timed out",
) {
  return timeout(
    timeoutMs,
    () =>
      timeoutError(message, {
        details: {
          timeoutMs,
        },
      }) as unknown as HTTPException,
  );
}
