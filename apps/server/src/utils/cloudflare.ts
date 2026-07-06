import { getClientProvider } from "@/infra/provider";
import { internalServerError } from "@/shared/exceptions";
import type { RuntimeConfig } from "@/infra/env";

/**
 * https://developers.cloudflare.com/r2/api/tokens/#get-s3-api-credentials-from-an-api-token
 */
export async function getCloudflareTokenId(
  config: RuntimeConfig,
  token: string,
): Promise<string> {
  let response: Response;

  try {
    response = await getClientProvider(config).request<Response>(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        responseType: "response",
        throwHttpErrors: false,
      },
    );
  } catch (error) {
    throw internalServerError("Failed to verify Cloudflare API token", {
      details: {
        cause: error,
      },
    });
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    throw internalServerError("Failed to parse Cloudflare token response", {
      details: {
        cause: error,
        status: response.status,
      },
    });
  }

  if (!response.ok || !isCloudflareTokenVerifyResponse(body)) {
    throw internalServerError("Cloudflare API token verification failed", {
      details: {
        body,
        status: response.status,
      },
      expose: true,
    });
  }

  return body.result.id;
}

function isCloudflareTokenVerifyResponse(
  value: unknown,
): value is { result: { id: string } } {
  return (
    value !== null &&
    typeof value === "object" &&
    "result" in value &&
    value.result !== null &&
    typeof value.result === "object" &&
    "id" in value.result &&
    typeof value.result.id === "string" &&
    value.result.id.length > 0
  );
}
