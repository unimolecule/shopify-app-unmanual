const ApiPrefix = "api";

export const ApiPrefixWithVersion = {
  v1: `${ApiPrefix}/v1`,
  v2: `${ApiPrefix}/v2`,
} as const;
