import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProcessMemoryBucket } from "@/infra/bucket/process";

let tempDirs: string[] = [];

describe("ProcessMemoryBucket", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { force: true, recursive: true })),
    );
    tempDirs = [];
  });

  it("streams uploads to disk and opens files as web streams", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-storage-"));
    tempDirs.push(dir);
    const bucket = new ProcessMemoryBucket(dir);

    const stored = await bucket.put({
      body: streamFromText("hello"),
      contentType: "text/plain",
      expiresAt: new Date(Date.now() + 1000),
      key: "test-shop/2026/06/file/hello.txt",
      maxBytes: 10,
      originalName: "hello.txt",
      safeName: "hello.txt",
      shopDomain: "test-shop.myshopify.com",
    });

    expect(stored.byteSize).toBe(5);
    await expect(
      readFile(join(dir, "test-shop/2026/06/file/hello.txt"), "utf8"),
    ).resolves.toBe("hello");

    const opened = await bucket.open({ key: stored.key });
    expect(opened.byteSize).toBe(5);
    await expect(new Response(opened.body).text()).resolves.toBe("hello");
  });

  it("rejects uploads over maxBytes and removes partial files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-storage-"));
    tempDirs.push(dir);
    const bucket = new ProcessMemoryBucket(dir);

    await expect(
      bucket.put({
        body: streamFromText("hello"),
        contentType: "text/plain",
        expiresAt: new Date(Date.now() + 1000),
        key: "test-shop/hello.txt",
        maxBytes: 4,
        originalName: "hello.txt",
        safeName: "hello.txt",
        shopDomain: "test-shop.myshopify.com",
      }),
    ).rejects.toMatchObject({
      status: 413,
    });

    await expect(readFile(join(dir, "test-shop/hello.txt"))).rejects.toThrow();
  });
});

function streamFromText(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}
