import { Forbidden, NotFound, Offline, ServerError } from "@/components/errors";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function RouteError({ error }: ErrorComponentProps) {
  const ErrorView = getErrorView(error);

  return <ErrorView scope="page" />;
}

function getErrorView(error: unknown) {
  if (isOfflineError(error)) return Offline;

  const status = getErrorStatus(error);

  if (status === 403) return Forbidden;
  if (status === 404) return NotFound;
  return ServerError;
}

function isOfflineError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!(error instanceof Error)) return false;

  return /failed to fetch|network|offline/i.test(error.message);
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return;

  const status = Reflect.get(error, "status");
  if (typeof status === "number") return status;

  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return;

  const responseStatus = Reflect.get(response, "status");
  return typeof responseStatus === "number" ? responseStatus : undefined;
}
