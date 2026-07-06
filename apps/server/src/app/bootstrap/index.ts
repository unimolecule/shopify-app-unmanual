import { onAppStartup } from "../lifecycle/startup";
import { createApp } from "./create-app";
import { registerOpenAPI } from "./register-openapi";
import type { RuntimeCapabilitiesCreator } from "@/shared/middlewares";

type BootstrapAppOptions = {
  createRuntimeCapabilities?: RuntimeCapabilitiesCreator;
  runStartup?: boolean;
  registerOpenApi?: boolean;
};

export async function bootstrapApp(options: BootstrapAppOptions = {}) {
  const { createRuntimeCapabilities, runStartup, registerOpenApi } = options;

  if (runStartup) {
    await onAppStartup();
  }

  const app = createApp({ createRuntimeCapabilities });
  registerOpenAPI(app, { enabled: registerOpenApi });

  return app;
}
