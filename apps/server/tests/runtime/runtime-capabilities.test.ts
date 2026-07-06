import { describe, expect, it } from "vitest";
import { runtimeCapabilityLazy } from "@/app/runtime/runtime-capabilities";

describe("runtimeCapabilityLazy", () => {
  it("memoizes a synchronous capability within one scope", () => {
    let calls = 0;
    const value = {};
    const lazy = runtimeCapabilityLazy(() => {
      calls += 1;
      return value;
    });

    expect(lazy()).toBe(value);
    expect(lazy()).toBe(value);
    expect(calls).toBe(1);
  });

  it("memoizes an asynchronous capability promise within one scope", async () => {
    let calls = 0;
    const value = {};
    const lazy = runtimeCapabilityLazy(() => {
      calls += 1;
      return Promise.resolve(value);
    });

    const first = lazy();
    const second = lazy();

    expect(first).toBe(second);
    await expect(first).resolves.toBe(value);
    expect(calls).toBe(1);
  });
});
