import {
  GraphqlQueryError,
  HttpInternalError,
  HttpMaxRetriesError,
  HttpResponseError,
  HttpRetriableError,
  HttpThrottlingError,
  InvalidHmacError,
  InvalidJwtError,
  InvalidSession,
  InvalidWebhookError,
  SessionStorageError,
  ShopifyError,
} from "@shopify/shopify-api";
import { describe, expect, it } from "vitest";

describe("Shopify error normalization", () => {
  it("maps Shopify auth errors to authorization responses", async () => {
    const { normalizeError } = await import("@/shared/exceptions");

    expect(normalizeError(new InvalidSession("expired"))).toMatchObject({
      status: 401,
      message: "Shopify authorization is required",
      details: {
        message: "expired",
        name: "Error",
      },
    });
    expect(normalizeError(new InvalidJwtError("bad token"))).toMatchObject({
      status: 401,
      message: "Shopify authorization is required",
    });
  });

  it("maps Shopify webhook validation errors to unauthorized responses", async () => {
    const { normalizeError } = await import("@/shared/exceptions");

    expect(normalizeError(new InvalidHmacError("bad hmac"))).toMatchObject({
      status: 401,
      message: "Invalid Shopify webhook request",
    });
    expect(
      normalizeError(
        new InvalidWebhookError({
          message: "bad webhook",
          response: new Response("bad webhook", {
            status: 400,
            statusText: "Bad Request",
            headers: {
              "x-shopify-error": "webhook",
            },
          }),
        }),
      ),
    ).toMatchObject({
      status: 401,
      message: "Invalid Shopify webhook request",
      details: {
        response: {
          code: 400,
          headers: {
            "x-shopify-error": "webhook",
          },
          statusText: "Bad Request",
        },
      },
    });
  });

  it("maps Shopify throttling errors to rate limit responses with retry headers", async () => {
    const { normalizeError } = await import("@/shared/exceptions");

    const error = new HttpThrottlingError({
      body: { errors: "Exceeded 2 calls per second" },
      code: 429,
      message: "throttled",
      retryAfter: 3,
      statusText: "Too Many Requests",
    });

    expect(normalizeError(error)).toMatchObject({
      status: 429,
      message: "Shopify API rate limit exceeded",
      headers: { "Retry-After": "3" },
      details: {
        response: {
          body: { errors: "Exceeded 2 calls per second" },
          code: 429,
          statusText: "Too Many Requests",
        },
      },
    });
  });

  it("maps Shopify retriable API errors to service unavailable responses", async () => {
    const { normalizeError } = await import("@/shared/exceptions");

    const params = {
      body: { error: "temporary" },
      code: 503,
      message: "temporary",
      statusText: "Service Unavailable",
    };

    expect(normalizeError(new HttpRetriableError(params))).toMatchObject({
      status: 503,
      message: "Shopify API is temporarily unavailable",
    });
    expect(normalizeError(new HttpInternalError(params))).toMatchObject({
      status: 503,
      message: "Shopify API is temporarily unavailable",
    });
    expect(
      normalizeError(new HttpMaxRetriesError("too many retries")),
    ).toMatchObject({
      status: 503,
      message: "Shopify API is temporarily unavailable",
    });
  });

  it("maps Shopify Admin HTTP and GraphQL errors to bad gateway responses", async () => {
    const { normalizeError } = await import("@/shared/exceptions");

    expect(
      normalizeError(
        new HttpResponseError({
          body: { errors: "upstream failed" },
          code: 500,
          headers: { "x-request-id": "shopify_req" },
          message: "upstream failed",
          statusText: "Internal Server Error",
        }),
      ),
    ).toMatchObject({
      status: 502,
      message: "Shopify API request failed",
      details: {
        response: {
          body: { errors: "upstream failed" },
          code: 500,
          headers: { "x-request-id": "shopify_req" },
          statusText: "Internal Server Error",
        },
      },
    });

    expect(
      normalizeError(
        new GraphqlQueryError({
          body: { errors: [{ message: "GraphQL failed" }] },
          headers: { "x-request-id": "graphql_req" },
          message: "GraphQL failed",
          response: { errors: [{ message: "GraphQL failed" }] },
        }),
      ),
    ).toMatchObject({
      status: 502,
      message: "Shopify API request failed",
      details: {
        graphql: {
          body: { errors: [{ message: "GraphQL failed" }] },
          headers: { "x-request-id": "graphql_req" },
          response: { errors: [{ message: "GraphQL failed" }] },
        },
      },
    });
  });

  it("maps Shopify storage and unknown Shopify errors conservatively", async () => {
    const { normalizeError } = await import("@/shared/exceptions");

    expect(
      normalizeError(new SessionStorageError("KV unavailable")),
    ).toMatchObject({
      status: 503,
      message: "Shopify session storage is unavailable",
    });
    expect(normalizeError(new ShopifyError("library error"))).toMatchObject({
      status: 500,
      message: "Shopify app error",
    });
  });
});
