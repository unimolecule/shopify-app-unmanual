import { getEnvProvider, getLoggerProvider } from "@/infra/provider";
import { normalizeError } from "@/shared/exceptions";
import { isDev } from "@/utils";

/**
 * Register global exception handlers for uncaught errors
 */
export async function registerProcessExceptions() {
  const env = getEnvProvider();
  const logger = await getLoggerProvider();

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason: unknown, promise: Promise<any>) => {
    const error = normalizeError(reason);
    logger.error({
      code: error.code,
      details: error.details,
      message: error.message,
      promise,
      status: error.status,
      $message: "Unhandled Rejection",
    });
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    const appError = normalizeError(error);
    logger.error({
      code: appError.code,
      details: appError.details,
      message: appError.message,
      status: appError.status,
      $message: "Uncaught Exception",
    });
    !isDev(env.APP_ENV) && process.exit(1);
  });

  process.on("beforeExit", (code) => {
    logger.info(`Process beforeExit event with code: ${code}`);
  });

  process.on("exit", (code) => {
    logger.info(`Process exit event with code: ${code}`);
  });
}
