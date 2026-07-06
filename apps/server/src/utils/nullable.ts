import { isNumber, isString } from "@unimolecule/utils";

/**
 * Reads nullable numeric fields that can arrive as numbers or numeric strings.
 */
export function readNullableNumber(value: unknown): number | null {
  if (isNumber(value)) return Number.isFinite(value) ? value : null;
  if (!isString(value) || value.length === 0) return null;

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

/**
 * Reads nullable string fields and treats empty strings as absent.
 */
export function readNullableString(value: unknown): string | null {
  return isString(value) && value.length > 0 ? value : null;
}
