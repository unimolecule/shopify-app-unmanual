export function getSafeProcessEnv(): Record<string, unknown> {
  return typeof process === "undefined" ? {} : process.env;
}
