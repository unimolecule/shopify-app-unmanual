import { badRequestError, payloadTooLargeError } from "@/shared/exceptions";
import type { FileUploadStreamParser, ParseFileUploadInput } from "../types";
import type { Context } from "hono";

/**
 * Parses file-only multipart uploads with formidable@4's Fetch Request API.
 */
export class FormidableFileUploadStreamParser implements FileUploadStreamParser {
  /**
   * Streams each accepted multipart file into the caller-provided callback.
   * Non-file fields are rejected so business forms can submit metadata later.
   */
  async parse(context: Context, input: ParseFileUploadInput): Promise<void> {
    const { FormidableError, parseMultipartRequest } =
      await import("formidable");
    let fileCount = 0;

    try {
      await parseMultipartRequest(
        context.req.raw,
        {
          maxFileKeySize: 255,
          maxFilenameSize: 255,
        },
        async (part) => {
          if (!input.fieldNames.includes(part.name)) {
            throw badRequestError("Unsupported multipart field", {
              details: {
                fieldName: part.name,
              },
            });
          }

          if (!part.isFile()) {
            throw badRequestError("Multipart field must be a file", {
              details: {
                fieldName: part.name,
              },
            });
          }

          fileCount += 1;
          if (fileCount > input.maxFiles) {
            throw badRequestError("Too many files", {
              details: {
                maxFiles: input.maxFiles,
              },
            });
          }

          await input.onFile({
            body: part.body,
            contentType: part.type || "application/octet-stream",
            originalName: part.filename,
          });
        },
      );
    } catch (error) {
      if (error instanceof FormidableError) {
        throw normalizeFormidableError(error);
      }

      throw error;
    }

    if (fileCount === 0) {
      throw badRequestError("At least one file is required");
    }
  }
}

const fileUploadStreamParser = new FormidableFileUploadStreamParser();

/**
 * Returns the shared file upload stream parser used by the file module.
 */
export function getFileUploadStreamParser(): FileUploadStreamParser {
  return fileUploadStreamParser;
}

/**
 * Maps formidable parser failures onto the app's HTTP error model.
 */
function normalizeFormidableError(error: { code?: string; message: string }) {
  if (error.code === "ERR_MAX_FILE_SIZE") {
    return payloadTooLargeError("Upload request body overflow maxsize", {
      details: {
        cause: error,
      },
    });
  }

  return badRequestError(error.message, {
    details: {
      cause: error,
      code: error.code,
    },
  });
}
