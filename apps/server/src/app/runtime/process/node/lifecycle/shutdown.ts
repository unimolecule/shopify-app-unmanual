import { runtimeCapabilityNodeDispose } from "@/app/runtime/process/node/runtime-capabilities";
import { providersDispose } from "@/infra/provider";

export async function onAppShutdown() {
  await runtimeCapabilityNodeDispose();
  await providersDispose();
}
