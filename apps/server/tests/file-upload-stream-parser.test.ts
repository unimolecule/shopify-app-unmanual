import { describe, expect, it } from "vitest";
import { FormidableFileUploadStreamParser } from "@/app/modules/file/upload-stream-parser";
import type { ParsedFileUpload } from "@/app/modules/file/types";
import type { Context } from "hono";

describe("FormidableFileUploadStreamParser", () => {
  it("parses files and files[] fields with formidable", async () => {
    const parser = new FormidableFileUploadStreamParser();
    const context = createParserContext([
      ["files", new File(["hello"], "hello.txt", { type: "text/plain" })],
      ["files[]", new File(["world"], "world.txt", { type: "text/plain" })],
    ]);
    const files: ParsedFileUpload[] = [];

    await parser.parse(context, {
      fieldNames: ["files", "files[]"],
      maxFiles: 2,
      onFile: async (file) => {
        await files.push(file);
      },
    });

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.originalName)).toEqual([
      "hello.txt",
      "world.txt",
    ]);
    await expect(new Response(files[0]!.body).text()).resolves.toBe("hello");
  });

  it("rejects uploads over maxFiles", async () => {
    const parser = new FormidableFileUploadStreamParser();
    const context = createParserContext([
      ["files", new File(["one"], "one.txt", { type: "text/plain" })],
      ["files", new File(["two"], "two.txt", { type: "text/plain" })],
    ]);

    await expect(
      parser.parse(context, {
        fieldNames: ["files"],
        maxFiles: 1,
        onFile: async (file) => {
          await new Response(file.body).arrayBuffer();
        },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Too many files",
    });
  });

  it("rejects requests without files", async () => {
    const parser = new FormidableFileUploadStreamParser();
    const context = createParserContext([]);

    await expect(
      parser.parse(context, {
        fieldNames: ["files"],
        maxFiles: 1,
        onFile: async () => {},
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "At least one file is required",
    });
  });

  it("rejects unsupported fields before they can stall parsing", async () => {
    const parser = new FormidableFileUploadStreamParser();
    const context = createParserContext([
      ["avatar", new File(["bad"], "bad.txt", { type: "text/plain" })],
    ]);

    await expect(
      parser.parse(context, {
        fieldNames: ["files"],
        maxFiles: 1,
        onFile: async () => {},
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Unsupported multipart field",
    });
  });
});

function createParserContext(entries: [string, File][]): Context {
  const data = new FormData();

  for (const [key, value] of entries) {
    data.append(key, value);
  }

  const request = new Request("https://example.test/api/files", {
    method: "POST",
    body: data,
  });
  const context: Pick<Context, "req"> = {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    req: {
      raw: request,
    } as Context["req"],
  };

  return context as Context;
}
