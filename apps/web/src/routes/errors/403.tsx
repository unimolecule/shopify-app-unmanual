import { createFileRoute } from "@tanstack/react-router";
import { Forbidden } from "@/components/errors";

export const Route = createFileRoute("/errors/403")({
  component: Forbidden,
});
