import { describe, expect, it } from "vitest";
import {
  parseNullableDate,
  readNullableNumber,
  readNullableString,
} from "@/utils";

describe("nullable server utils", () => {
  it("reads non-empty strings and returns null for other values", () => {
    expect(readNullableString("ready")).toBe("ready");
    expect(readNullableString("")).toBeNull();
    expect(readNullableString(null)).toBeNull();
    expect(readNullableString(123)).toBeNull();
  });

  it("reads finite numbers from numbers and numeric strings", () => {
    expect(readNullableNumber(1024)).toBe(1024);
    expect(readNullableNumber("10")).toBe(10);
    expect(readNullableNumber("")).toBeNull();
    expect(readNullableNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(readNullableNumber("not-a-number")).toBeNull();
  });

  it("parses valid date strings and returns null for invalid values", () => {
    expect(parseNullableDate("2026-06-18T12:00:00.000Z")).toEqual(
      new Date("2026-06-18T12:00:00.000Z"),
    );
    expect(parseNullableDate("")).toBeNull();
    expect(parseNullableDate("not-a-date")).toBeNull();
    expect(parseNullableDate(null)).toBeNull();
    expect(parseNullableDate(123)).toBeNull();
  });
});
