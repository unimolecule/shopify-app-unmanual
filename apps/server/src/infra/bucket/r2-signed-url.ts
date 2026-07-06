import { sha256Hex } from "@unimolecule/utils";
import { getAttachmentDisposition } from "@/utils";
import type { BucketDownloadSigner, BucketDownloadSignInput } from "./shared";

export type R2SignedUrlDownloadSignerConfig = {
  accessKeyId: string;
  bucketName: string;
  endpoint: string;
  secretAccessKey: string;
};

export type R2SignedUrlDownloadSignerOptions = {
  now?: () => Date;
};

const SIGNING_ALGORITHM = "AWS4-HMAC-SHA256";
const SIGNING_REGION = "auto";
const SIGNING_SERVICE = "s3";
const SIGNING_TERMINATOR = "aws4_request";
const SIGNED_HEADERS = "host";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

/**
 * Creates short-lived R2 S3-compatible download URLs with Web Crypto.
 *
 * This intentionally implements only the presigned GET object subset used by
 * private downloads, so Node and Cloudflare runtimes can share one signer.
 */
export class R2SignedUrlDownloadSigner implements BucketDownloadSigner {
  constructor(
    private readonly config: R2SignedUrlDownloadSignerConfig,
    private readonly options: R2SignedUrlDownloadSignerOptions = {},
  ) {}

  async signDownloadUrl(input: BucketDownloadSignInput): Promise<string> {
    const now = this.options.now?.() ?? new Date();
    const amzDate = formatAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = [
      dateStamp,
      SIGNING_REGION,
      SIGNING_SERVICE,
      SIGNING_TERMINATOR,
    ].join("/");
    const url = new URL(this.config.endpoint);
    const canonicalUri = getCanonicalUri(this.config.bucketName, input.key);
    const canonicalHeaders = `host:${url.host}\n`;
    const expiresIn = String(Math.ceil(input.expiresInMilliseconds / 1000));
    const query = new URLSearchParams({
      "X-Amz-Algorithm": SIGNING_ALGORITHM,
      "X-Amz-Content-Sha256": UNSIGNED_PAYLOAD,
      "X-Amz-Credential": `${this.config.accessKeyId}/${credentialScope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": expiresIn,
      "X-Amz-SignedHeaders": SIGNED_HEADERS,
      "response-content-disposition": getAttachmentDisposition(
        input.originalName,
      ),
      "response-content-type": input.contentType,
    });
    const canonicalQueryString = getCanonicalQueryString(query);
    const canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      SIGNED_HEADERS,
      UNSIGNED_PAYLOAD,
    ].join("\n");
    const stringToSign = [
      SIGNING_ALGORITHM,
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = await getSigningKey(
      this.config.secretAccessKey,
      dateStamp,
    );
    const signature = await hmacHex(signingKey, stringToSign);

    query.set("X-Amz-Signature", signature);
    url.pathname = canonicalUri;
    url.search = getCanonicalQueryString(query);

    return url.toString();
  }
}

function getCanonicalUri(bucketName: string, key: string): string {
  return `/${encodePathSegment(bucketName)}/${key
    .split("/")
    .map(encodePathSegment)
    .join("/")}`;
}

function encodePathSegment(value: string): string {
  return encodeRfc3986(value);
}

function getCanonicalQueryString(query: URLSearchParams): string {
  return [...query.entries()]
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .toSorted(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey < rightKey) return -1;
      if (leftKey > rightKey) return 1;
      if (leftValue < rightValue) return -1;
      if (leftValue > rightValue) return 1;
      return 0;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replaceAll(/[!'()*]/g, (char) => {
    const codePoint = char.codePointAt(0);
    return codePoint === undefined
      ? ""
      : `%${codePoint.toString(16).toUpperCase()}`;
  });
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replaceAll(/[:-]|\.\d{3}/g, "");
}

async function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = await hmacBytes(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = await hmacBytes(dateKey, SIGNING_REGION);
  const serviceKey = await hmacBytes(regionKey, SIGNING_SERVICE);

  return hmacBytes(serviceKey, SIGNING_TERMINATOR);
}

async function hmacBytes(
  key: string | Uint8Array,
  message: string,
): Promise<Uint8Array> {
  const keyData =
    typeof key === "string" ? new TextEncoder().encode(key) : copyBytes(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    {
      hash: "SHA-256",
      name: "HMAC",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message),
  );

  return new Uint8Array(signature);
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

async function hmacHex(key: Uint8Array, message: string): Promise<string> {
  const signature = await hmacBytes(key, message);

  return Array.from(signature, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
