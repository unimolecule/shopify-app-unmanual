import { registerModuleProductExportJobs } from "@/app/modules/product-export/queue/jobs";

/**
 * Registers business queue jobs and scheduler tasks before runtime consumers
 * start. Infrastructure owns start/stop/dispose; modules only declare work.
 */
export function registerJobs() {
  registerModuleProductExportJobs();
}
