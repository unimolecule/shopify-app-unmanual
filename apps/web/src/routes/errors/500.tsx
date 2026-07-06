import { createFileRoute } from "@tanstack/react-router";
import { ServerError } from "@/components/errors";

export const Route = createFileRoute("/errors/500")({
  component: ServerError,
});
