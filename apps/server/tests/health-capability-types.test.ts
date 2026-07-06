import { describe, expect, it } from "vitest";
import type {
  RuntimeCapabilityDiskCheckResult,
  RuntimeCapabilityMemoryCheckResult,
} from "@/app/runtime/runtime-capabilities";
import type {
  ProcessDiskUsageCheckResult,
  ProcessMemoryUsageCheckResult,
} from "@unimolecule/utils/node";

type Assert<T extends true> = T;

type IsAssignable<Source, Target> = Source extends Target ? true : false;

type SupportedDiskHealthResult = Exclude<
  RuntimeCapabilityDiskCheckResult,
  { status: "unsupported" }
>;
type SupportedMemoryHealthResult = Exclude<
  RuntimeCapabilityMemoryCheckResult,
  { status: "unsupported" }
>;

export type _DiskHealthReusesProcessDiskUsageCheckResult = Assert<
  IsAssignable<
    SupportedDiskHealthResult,
    ProcessDiskUsageCheckResult & { runtime: string }
  >
>;

export type _MemoryHealthReusesProcessMemoryUsageCheckResult = Assert<
  IsAssignable<
    SupportedMemoryHealthResult,
    ProcessMemoryUsageCheckResult & { runtime: string }
  >
>;

export type _DiskHealthKeepsUnsupportedRuntimeBranch = Assert<
  IsAssignable<
    { runtime: string; status: "unsupported" },
    RuntimeCapabilityDiskCheckResult
  >
>;

export type _MemoryHealthKeepsUnsupportedRuntimeBranch = Assert<
  IsAssignable<
    { runtime: string; status: "unsupported" },
    RuntimeCapabilityMemoryCheckResult
  >
>;

describe("runtime health capability types", () => {
  it("keeps compile-time assertions attached to a real suite", () => {
    expect(true).toBe(true);
  });
});
