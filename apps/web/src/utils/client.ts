import { createHttpClient } from "@unimolecule/oh-my-fetch/client";
import { HttpRequestError } from "@unimolecule/oh-my-fetch/errors";
import {
  DEFAULT_APP_API_PREFIX,
  DEFAULT_REQUEST_TIMEOUT,
} from "@/utils/public-env";
import { showToast } from "@/utils/toast";
import type { HttpPlugin } from "@unimolecule/oh-my-fetch";

export { HttpRequestError };

export type Client = ReturnType<typeof createHttpClient>;
export type ApiClient = ReturnType<Client["extend"]>;

const HTTP_ERROR_TOAST_MESSAGES: Partial<Record<number, string>> = {
  400: "The request could not be processed. Check your input and try again.",
  401: "Your session has expired. Please authorize the app again.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource could not be found.",
  409: "The resource was updated elsewhere. Refresh and try again.",
  422: "Some submitted values are invalid. Check the form and try again.",
  429: "Too many requests. Wait a moment and try again.",
  500: "Something went wrong on the server. Try again later.",
  502: "The server is temporarily unavailable. Try again later.",
  503: "The service is temporarily unavailable. Try again later.",
  504: "The request timed out upstream. Try again later.",
};

const httpErrorToastPlugin: HttpPlugin = {
  name: "http-error-toast",
  beforeError(error) {
    if (error instanceof HttpRequestError && error.status) {
      const message = HTTP_ERROR_TOAST_MESSAGES[error.status];

      if (message) {
        showToast(message);
      }
    }

    return error;
  },
};

/**
 * Creates the base browser HTTP client with shared timeout and no retries.
 */
export function createClient() {
  return createHttpClient({
    prefix: `/${DEFAULT_APP_API_PREFIX}`,
    timeout: DEFAULT_REQUEST_TIMEOUT,
    retry: { limit: 0 },
    plugins: [httpErrorToastPlugin],
  });
}
