import {
  configure,
  getConsoleSink,
  jsonLinesFormatter,
  withFilter,
  type Sink,
} from "@logtape/logtape";
import {
  DEFAULT_APP_LOGGER_DIR,
  DEFAULT_APP_LOGGER_EXPIRE,
  DEFAULT_ENVS,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { name } from "../../../package.json";
import { getLoggerEnvConfig } from "./config";
import {
  setupConsoleLogger,
  toLogTapeLevel,
  type LoggerSetupOptions,
} from "./shared";
import type { RuntimeConfig } from "@/infra/env";

const PROCESS_LOG_FILE_NAMES = {
  warn: "warn.log",
  error: "error.log",
} as const;

type ProcessLogPathLevel = keyof typeof PROCESS_LOG_FILE_NAMES;
type ProcessLogPaths = {
  files: Record<ProcessLogPathLevel, string>;
  directories: Record<ProcessLogPathLevel, string>;
};
type ProcessLoggerSinkName =
  "console" | "warnFile" | "errorFile" | "warnDailyFile" | "errorDailyFile";

/**
 * Configure logger sinks for process runtimes such as Node.
 * Production can write rotating files, while non-production stays console-only.
 */
export async function setupProcessLogger(
  config: RuntimeConfig,
  options: LoggerSetupOptions,
): Promise<void> {
  const loggerEnvConfig = getLoggerEnvConfig(config);

  if (config.APP_ENV !== DEFAULT_ENVS.PRODUCTION) {
    await setupConsoleLogger(
      { level: loggerEnvConfig.APP_LOGGER_LEVEL },
      options,
    );
    return;
  }

  const logPaths = await resolveProcessLogPaths(config);
  const maxSize = loggerEnvConfig.APP_LOGGER_MAX_SIZE;
  const expire = loggerEnvConfig.APP_LOGGER_EXPIRE;
  const sinks: Partial<Record<ProcessLoggerSinkName, Sink>> = {
    console: getConsoleSink({ formatter: jsonLinesFormatter }),
  };
  const loggerSinks: ProcessLoggerSinkName[] = ["console"];

  if (maxSize !== undefined) {
    sinks.warnFile = withFilter(
      await getProcessFileSink(logPaths.files.warn, {
        maxSize,
        maxFiles: 1,
      }),
      "warning",
    );
    sinks.errorFile = withFilter(
      await getProcessFileSink(logPaths.files.error, {
        maxSize,
        maxFiles: 1,
      }),
      "error",
    );
    loggerSinks.push("warnFile", "errorFile");
  }

  if (expire !== undefined || (maxSize === undefined && expire === undefined)) {
    const maxAgeMs = expire ?? DEFAULT_APP_LOGGER_EXPIRE;
    sinks.warnDailyFile = withFilter(
      await getProcessDailyFileSink(logPaths.directories.warn, { maxAgeMs }),
      "warning",
    );
    sinks.errorDailyFile = withFilter(
      await getProcessDailyFileSink(logPaths.directories.error, { maxAgeMs }),
      "error",
    );
    loggerSinks.push("warnDailyFile", "errorDailyFile");
  }

  await configure({
    reset: options.reset,
    sinks: sinks as Record<ProcessLoggerSinkName, Sink>,
    loggers: [
      {
        category: ["logtape", "meta"],
        sinks: ["console"],
        lowestLevel: "warning",
      },
      {
        category: name,
        lowestLevel: toLogTapeLevel(config.APP_LOGGER_LEVEL),
        sinks: loggerSinks,
      },
    ],
  });
}

/**
 * Resolve log file and daily-rotation directories relative to APP_LOGGER_DIR.
 * Node-only modules are imported lazily so isolate bundles do not eagerly touch them.
 */
async function resolveProcessLogPaths(
  config: RuntimeConfig,
): Promise<ProcessLogPaths> {
  const [{ mkdir }, { dirname, isAbsolute, join }, { fileURLToPath }] =
    await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
      import("node:url"),
    ]);
  const appServerDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const configuredLogDir = config.APP_LOGGER_DIR ?? DEFAULT_APP_LOGGER_DIR;
  const logDir = isAbsolute(configuredLogDir)
    ? configuredLogDir
    : join(appServerDir, configuredLogDir);
  await mkdir(logDir, { recursive: true });

  const logPaths = {
    files: {
      warn: join(logDir, PROCESS_LOG_FILE_NAMES.warn),
      error: join(logDir, PROCESS_LOG_FILE_NAMES.error),
    },
    directories: {
      warn: join(logDir, "warn"),
      error: join(logDir, "error"),
    },
  };
  return logPaths;
}

/**
 * Create a size-rotating file sink for process runtimes.
 * This function is only called after the runtime has been classified as process.
 */
async function getProcessFileSink(
  logFilePath: string,
  options: { maxSize: number; maxFiles: number },
) {
  const { getRotatingFileSink } = await import("@logtape/file");
  return getRotatingFileSink(logFilePath, options);
}

/**
 * Create a daily time-rotating file sink for process runtimes.
 * This is used when APP_LOGGER_EXPIRE is configured or no file rotation mode is set.
 */
async function getProcessDailyFileSink(
  directory: string,
  options: { maxAgeMs: number },
) {
  const { getTimeRotatingFileSink } = await import("@logtape/file");
  return getTimeRotatingFileSink({
    directory,
    interval: "daily",
    maxAgeMs: options.maxAgeMs,
  });
}
