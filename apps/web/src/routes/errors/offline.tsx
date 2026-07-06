import { createFileRoute } from "@tanstack/react-router";
import { Offline } from "@/components/errors";

export const Route = createFileRoute("/errors/offline")({
  component: Offline,
});
