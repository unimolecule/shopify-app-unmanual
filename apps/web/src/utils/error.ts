/**
 * Error type used by scripts to prefix failures with a scope.
 */
class AppWebError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppWebError";
  }
}

/**
 * Throw a scoped script error and stop execution.
 */
export function throwError(scope: string, message: string): never {
  throw new AppWebError(`[${scope}] ${message}`);
}
