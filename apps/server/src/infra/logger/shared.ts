import {
  configure,
  getConsoleSink,
  jsonLinesFormatter,
  type LogLevel,
} from "@logtape/logtape";
import {
  DEFAULT_LOGGER_LEVELS,
  type DEFAULT_LOGGER_LEVELS_VALUES,
} from "@unimolecule/shopify-app-unmanual-app-env";
import { name } from "../../../package.json";

export type LoggerSetupOptions = {
  reset: boolean;
};

/**
 * Configure a console-only LogTape logger.
 * This is shared by bootstrap, isolate runtimes, and non-production process runtimes.
 */
export async function setupConsoleLogger(
  config: { level: DEFAULT_LOGGER_LEVELS_VALUES },
  options: LoggerSetupOptions,
): Promise<void> {
  await configure({
    reset: options.reset,
    sinks: {
      console: getConsoleSink({ formatter: jsonLinesFormatter }),
    },
    loggers: [
      {
        category: ["logtape", "meta"],
        sinks: ["console"],
        lowestLevel: "warning",
      },
      {
        category: name,
        lowestLevel: toLogTapeLevel(config.level),
        sinks: ["console"],
      },
    ],
  });
}

/**
 * Convert project log level names to LogTape level names.
 * LogTape uses "warning" and "trace" where project config uses "warn" and "verbose".
 */
export function toLogTapeLevel(level: DEFAULT_LOGGER_LEVELS_VALUES): LogLevel {
  if (level === DEFAULT_LOGGER_LEVELS.WARN) return "warning";
  if (level === DEFAULT_LOGGER_LEVELS.VERBOSE) return "trace";
  return level;
}
