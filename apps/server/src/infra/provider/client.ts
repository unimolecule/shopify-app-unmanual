import { createClient, getClientEnvConfig } from "@/infra/http/client";
import { getEnvProvider } from "./env";
import { createProviderSignature } from "./signature";
import type { RuntimeConfig } from "@/infra/env";

export type HttpClient = ReturnType<typeof createClient>;

type ClientProviderSlot = {
  signature: string;
  value: HttpClient;
};

let clientProviderSlot: ClientProviderSlot | undefined;

export function getClientProvider(config?: RuntimeConfig): HttpClient {
  const clientConfig = config ?? getCurrentEnvProvider();

  const signature = getClientProviderSignature(clientConfig);
  if (clientProviderSlot?.signature !== signature) {
    setClientProvider(createClient(clientConfig), signature);
  }

  return getCurrentClientProvider();
}

export function resetClientProvider() {
  clientProviderSlot?.value.dispose();
  clientProviderSlot = undefined;
}

function setClientProvider(client: HttpClient, signature: string) {
  const current = clientProviderSlot?.value;
  if (current && current !== client) {
    current.dispose();
  }
  clientProviderSlot = { signature, value: client };
}

function getCurrentClientProvider(): HttpClient {
  if (!clientProviderSlot) {
    throw new Error("Client provider is not configured");
  }

  return clientProviderSlot.value;
}

function getCurrentEnvProvider(): RuntimeConfig {
  return getEnvProvider();
}

function getClientProviderSignature(config: RuntimeConfig): string {
  return createProviderSignature(getClientEnvConfig(config));
}
