import { configSchema } from "@unimolecule/shopify-app-unmanual-app-env";
import { unifiedSpawn } from "@unimolecule/utils/node";
import type { ChildProcess } from "node:child_process";

// When using `shopify app dev --tunnel-url=...`, manually keep
// `shopifyProxyPort` in sync with the named Cloudflare Tunnel and ensure the
// proxy port does not duplicate any root env port variable.
const shopifyProxyPort = "10101";

const tunnelReadyTimeoutMs = 5 * 1000;
const tunnelReadyPattern =
  /Registered tunnel connection|Connection .* registered|Started tunnel|Tunnel .* ready/i;
const portEnvKeyPattern = /port/i;

let isShuttingDown = false;

/**
 * Fail fast when the Shopify CLI proxy port duplicates an env port.
 */
function assertUniqueShopifyProxyPort(env: NodeJS.ProcessEnv = process.env) {
  const conflicts = Object.entries(env)
    .filter(([key, value]) => portEnvKeyPattern.test(key) && value)
    .filter(([, value]) => String(value).trim() === shopifyProxyPort)
    .map(([key]) => key);

  if (conflicts.length === 0) return;

  throw new Error(
    `shopifyProxyPort (${shopifyProxyPort}) must not duplicate root env port variable(s): ${conflicts.join(
      ", ",
    )}. Use a unique port for Shopify CLI's tunnel proxy.`,
  );
}

/**
 * Spawn a long-lived child process with inherited stdin and piped output.
 */
function spawnProcess(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  return unifiedSpawn(command, args, {
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });
}

/**
 * Write child output to the parent process and report when tunnel looks ready.
 */
function pipeOutput(child: ChildProcess, onOutput?: (chunk: string) => void) {
  child.stdout?.on("data", (chunk: any) => {
    const text = chunk.toString();
    process.stdout.write(text);
    onOutput?.(text);
  });

  child.stderr?.on("data", (chunk: any) => {
    const text = chunk.toString();
    process.stderr.write(text);
    onOutput?.(text);
  });
}

/**
 * Wait until Wrangler reports a ready tunnel, with a short timeout fallback.
 */
async function waitForTunnelReady(child: ChildProcess) {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      child.off("error", onError);
      resolve();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("error", onError);
      reject(
        new Error(
          `wrangler tunnel exited before ready with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`,
        ),
      );
    };

    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      reject(error);
    };

    const timer = setTimeout(finish, tunnelReadyTimeoutMs);

    child.once("exit", onExit);
    child.once("error", onError);
    pipeOutput(child, (chunk) => {
      if (tunnelReadyPattern.test(chunk)) {
        finish();
      }
    });
  });
}

/**
 * Stop child processes without leaving the named tunnel running.
 */
async function stopChildren(children: readonly ChildProcess[]) {
  await Promise.all(
    children.map((child) => {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
          resolve();
        }, 3_000);

        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });

        child.kill("SIGTERM");
      });
    }),
  );
}

/**
 * Build the custom Shopify CLI tunnel URL from env and the fixed proxy port.
 */
function getTunnelUrl() {
  const config = configSchema.parse(process.env);
  const url = new URL(config.SHOPIFY_APP_URL);

  url.port = shopifyProxyPort;

  return url.origin;
}

function getTunnelName() {
  const config = configSchema.parse(process.env);

  return `${config.APP_CLOUDFLARE_WORKER_NAME}-tunnel`;
}

/**
 * Start the named Cloudflare tunnel, then run Shopify app dev against it.
 */
async function main() {
  assertUniqueShopifyProxyPort();

  const tunnelUrl = getTunnelUrl();
  const tunnelName = getTunnelName();
  const tunnel = spawnProcess(
    "pnpm",
    ["exec", "wrangler", "tunnel", "run", tunnelName],
    {
      ...process.env,
      TUNNEL_TRANSPORT_PROTOCOL: "http2",
    },
  );

  await waitForTunnelReady(tunnel);

  const shopify = spawnProcess("pnpm", [
    "exec",
    "shopify",
    "app",
    "dev",
    `--tunnel-url=${tunnelUrl}`,
  ]);
  const children = [shopify, tunnel] as const;

  pipeOutput(shopify);

  const shutdown = async () => {
    isShuttingDown = true;
    await stopChildren(children);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise<void>((resolve, reject) => {
    const rejectAfterCleanup = async (error: Error) => {
      await stopChildren(children);
      reject(error);
    };

    shopify.once("error", rejectAfterCleanup);
    tunnel.once("error", rejectAfterCleanup);

    shopify.once("exit", async (code, signal) => {
      await stopChildren(children);

      if (isShuttingDown || code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `shopify app dev exited with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`,
        ),
      );
    });

    tunnel.once("exit", async (code, signal) => {
      await stopChildren(children);

      if (isShuttingDown) {
        resolve();
        return;
      }

      reject(
        new Error(
          `wrangler tunnel exited with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }`,
        ),
      );
    });
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
