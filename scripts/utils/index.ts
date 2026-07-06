import { getPackagesSync } from "@unimolecule/utils/node";

/**
 * Find the nearest monorepo root using @manypkg workspace discovery.
 */
export function findMonorepoRoot(cwd: string = process.cwd()): string {
  try {
    return getPackagesSync(cwd).rootDir;
  } catch {
    return "";
  }
}

/**
 * Error type used by scripts to prefix failures with a scope.
 */
class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

/**
 * Throw a scoped script error and stop execution.
 */
export function throwRepositoryError(
  message: string,
  scope = "repository",
): never {
  throw new RepositoryError(`[${scope}] ${message}`);
}

/**
 * Throw a scoped script error with scope-first call sites.
 */
export function throwError(scope: string, message: string): never {
  throwRepositoryError(message, scope);
}

export { isObject, serializeValue } from "@unimolecule/utils";
