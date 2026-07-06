import { isString } from "@unimolecule/utils";

export function now(options: { type: "date" | "time"; timeZone: string }) {
  const { type, timeZone = "Asia/Shanghai" } = options;
  // avoid server utc date shift
  const now = new Date(new Date().toLocaleString("en-US", { timeZone }));

  if (type === "date") {
    // "YYYY-MM-DD"
    return now.toISOString().slice(0, 10);
  }

  return now.getTime();
}

/**
 * Parses nullable date values without throwing on malformed payloads.
 */
export function parseNullableDate(value: unknown): Date | null {
  if (!isString(value) || value.length === 0) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
