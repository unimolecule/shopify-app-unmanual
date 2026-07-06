import { getLoggerProvider } from "@/infra/provider";

export async function onAppReady() {
  const logger = await getLoggerProvider();
  logger.info("🏖️ Both logger and env are initialized.");
}
