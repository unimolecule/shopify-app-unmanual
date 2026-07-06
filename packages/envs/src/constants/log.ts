export const DEFAULT_LOGGER_LEVELS = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
  DEBUG: "debug",
  VERBOSE: "verbose",
} as const;
export const DEFAULT_LOG_LEVEL = DEFAULT_LOGGER_LEVELS.DEBUG;
export type DEFAULT_LOGGER_LEVELS_KEYS = keyof typeof DEFAULT_LOGGER_LEVELS;
export type DEFAULT_LOGGER_LEVELS_VALUES =
  (typeof DEFAULT_LOGGER_LEVELS)[DEFAULT_LOGGER_LEVELS_KEYS];

export const DEFAULT_APP_LOGGER_DIR = "logs";
export const DEFAULT_APP_LOGGER_EXPIRE = 1000 * 60 * 60 * 24 * 7; // limit log keep 7d
export const DEFAULT_APP_LOGGER_MAX_SIZE = 1024 * 1024 * 200; // limit size 200M
