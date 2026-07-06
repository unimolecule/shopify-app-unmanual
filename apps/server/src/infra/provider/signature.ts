import type { z } from "zod";

type SignatureSource = Record<string, unknown>;

type SignatureValue =
  | null
  | string
  | number
  | boolean
  | SignatureValue[]
  | { [key: string]: SignatureValue };

/**
 * Build a stable signature from a plain provider config DTO.
 */
export function createProviderSignature(config: SignatureSource): string {
  return stableSerialize(config);
}

/**
 * Build a stable signature from the fields accepted by a Zod object schema.
 * This keeps env provider cache invalidation aligned with the composed schema.
 */
export function createSchemaSignature(
  schema: z.ZodObject,
  source: SignatureSource,
): string {
  return createProviderSignature(pickSchemaFields(schema, source));
}

function pickSchemaFields(
  schema: z.ZodObject,
  source: SignatureSource,
): SignatureSource {
  return Object.keys(schema.shape)
    .toSorted()
    .reduce<SignatureSource>((signatureSource, key) => {
      signatureSource[key] = source[key];
      return signatureSource;
    }, {});
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeSignatureValue(value));
}

function normalizeSignatureValue(value: unknown): SignatureValue {
  if (value === undefined || value === null) return null;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) return value.map(normalizeSignatureValue);

  if (typeof value === "object") {
    if (isPlatformBinding(value)) return "[binding:present]";

    return Object.keys(value)
      .toSorted()
      .reduce<{ [key: string]: SignatureValue }>((normalized, key) => {
        normalized[key] = normalizeSignatureValue(
          (value as Record<string, unknown>)[key],
        );
        return normalized;
      }, {});
  }

  return String(value);
}

function isPlatformBinding(value: object): boolean {
  return (
    "get" in value &&
    "put" in value &&
    "delete" in value &&
    "list" in value &&
    typeof value.get === "function" &&
    typeof value.put === "function" &&
    typeof value.delete === "function" &&
    typeof value.list === "function"
  );
}
