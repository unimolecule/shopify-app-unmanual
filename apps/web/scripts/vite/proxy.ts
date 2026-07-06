import type { ServerOptions } from "vite";

/**
 * Proxies backend-owned routes to the local server runtime during Vite dev.
 */
export function createViteProxy(backendPort: number): ServerOptions["proxy"] {
  const backendOrigin = `http://127.0.0.1:${backendPort}`;

  return {
    "/api": backendOrigin,
    "/auth": backendOrigin,
    "/webhooks": backendOrigin,
  };
}
