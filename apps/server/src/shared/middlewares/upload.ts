import { bodyLimit } from "hono/body-limit";
import {
  createErrorResponse,
  uploadPayloadTooLargeError,
} from "@/shared/exceptions";

export function uploadMiddleware(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) =>
      createErrorResponse(
        c,
        uploadPayloadTooLargeError("Upload request body overflow maxsize", {
          details: {
            maxSize,
          },
        }),
      ),
  });
}
