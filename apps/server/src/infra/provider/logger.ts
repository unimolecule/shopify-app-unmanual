import runtimeLogger, { dispose, setupBootstrapLogger } from "@/infra/logger";
import { isIsolateRuntime } from "@/utils";
import { getLoggerEnvConfig } from "../logger/config";
import { createProviderSignature } from "./signature";
import type { LoggerSetupOptions } from "../logger/shared";
import type { RuntimeConfig } from "@/infra/env";

type RuntimeLoggerSetup = (
  config: RuntimeConfig,
  options: LoggerSetupOptions,
) => Promise<void> | void;

type LoggerProviderSlot = {
  signature: string;
  setupPromise?: Promise<void>;
  setupSignature?: string;
  value: typeof runtimeLogger;
};

let loggerProviderSlot: LoggerProviderSlot | undefined;
let processLoggerSetup: RuntimeLoggerSetup | undefined;

/**
 * Get the logger provider for bootstrap or runtime phases.
 * Call without config for bootstrap; call with runtime config inside route middleware.
 */
export async function getLoggerProvider(config?: RuntimeConfig) {
  if (!config) {
    if (!loggerProviderSlot) {
      await ensureLoggerProvider("bootstrap", () => setupBootstrapLogger());
    }

    return getCurrentLoggerProvider();
  }

  const signature = getLoggerProviderSignature(config);
  const shouldReset = loggerProviderSlot !== undefined;
  await ensureLoggerProvider(signature, () =>
    setupRuntimeLogger(config, {
      reset: shouldReset,
    }),
  );

  return getCurrentLoggerProvider();
}

/**
 * Remove the logger provider and reset its lifecycle phase.
 * This does not call LogTape dispose; disposeLoggerProvider handles that path.
 */
export async function resetLoggerProvider() {
  await dispose();
  loggerProviderSlot = undefined;
}

export function registerProcessLoggerSetup(setup: RuntimeLoggerSetup) {
  processLoggerSetup = setup;
}

/**
 * Store the shared logger facade and its lifecycle signature.
 */
function setLoggerProvider(signature: string) {
  loggerProviderSlot = { signature, value: runtimeLogger };
}

function getCurrentLoggerProvider(): typeof runtimeLogger {
  if (!loggerProviderSlot) {
    throw new Error("Logger provider is not configured");
  }

  return loggerProviderSlot.value;
}

function getLoggerProviderSignature(config: RuntimeConfig): string {
  return createProviderSignature(getLoggerEnvConfig(config));
}

async function ensureLoggerProvider(
  signature: string,
  setup: () => Promise<void>,
) {
  if (loggerProviderSlot?.signature === signature) {
    return;
  }

  if (
    loggerProviderSlot?.setupPromise &&
    loggerProviderSlot.setupSignature === signature
  ) {
    await loggerProviderSlot.setupPromise;
    return;
  }

  loggerProviderSlot = {
    signature: loggerProviderSlot?.signature ?? signature,
    setupSignature: signature,
    value: runtimeLogger,
  };
  const setupPromise = Promise.resolve(setup()).then(() => {
    if (loggerProviderSlot?.setupPromise === setupPromise) {
      setLoggerProvider(signature);
    }
  });
  loggerProviderSlot.setupPromise = setupPromise;

  try {
    await setupPromise;
  } finally {
    if (loggerProviderSlot?.setupPromise === setupPromise) {
      loggerProviderSlot = {
        signature: loggerProviderSlot.signature,
        value: runtimeLogger,
      };
    }
  }
}

async function setupRuntimeLogger(
  config: RuntimeConfig,
  options: LoggerSetupOptions,
) {
  if (isIsolateRuntime(config.APP_RUNTIME)) {
    const { setupIsolateLogger } = await import("../logger/isolate");
    await setupIsolateLogger(config, options);
    return;
  }

  if (!processLoggerSetup) {
    throw new Error("Process logger setup is not registered");
  }

  await processLoggerSetup(config, options);
}
