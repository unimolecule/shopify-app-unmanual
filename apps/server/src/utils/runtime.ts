import { serviceUnavailableError } from "@/shared/exceptions/errors";

export type RuntimeUnsupportedResult = {
  runtime: string;
  status: "unsupported";
};

type RuntimeNotSupportedBaseOptions = {
  /**
   * Runtime name reported to callers or attached to the thrown error details.
   */
  runtime: string;
  /**
   * Optional public-facing message for the unsupported runtime capability.
   */
  message?: string;
};

type RuntimeNotSupportedReturnOptions = RuntimeNotSupportedBaseOptions & {
  mode?: "return";
};

type RuntimeNotSupportedThrowOptions = RuntimeNotSupportedBaseOptions & {
  mode: "throw";
};

export type RuntimeNotSupportedOptions =
  RuntimeNotSupportedReturnOptions | RuntimeNotSupportedThrowOptions;

export function runtimeNotSupported(
  options: RuntimeNotSupportedThrowOptions,
): never;
export function runtimeNotSupported(
  options: RuntimeNotSupportedReturnOptions,
): RuntimeUnsupportedResult;
/**
 * Handles runtime capabilities that are intentionally unavailable.
 *
 * Use return mode for health/status payloads, and throw mode for request paths
 * where an unavailable capability should become an HTTP error.
 */
export function runtimeNotSupported(
  options: RuntimeNotSupportedOptions,
): RuntimeUnsupportedResult {
  const message =
    options.message ??
    `Capability is not supported in the ${options.runtime} runtime`;

  if (options.mode === "throw") {
    throw serviceUnavailableError(message, {
      details: { runtime: options.runtime },
    });
  }

  return {
    status: "unsupported",
    runtime: options.runtime,
  };
}
