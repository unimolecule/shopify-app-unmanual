// do not use `enum` in typescript, see: https://www.reddit.com/r/typescript/comments/1s3qhx6/i_will_stop_using_enum_in_typescript/
// use const object to replace it:
export const DEFAULT_ENVS = {
  DEVELOPMENT: "development",
  TEST: "test",
  PRODUCTION: "production",
} as const;
export const DEFAULT_ENV = DEFAULT_ENVS.DEVELOPMENT;
export type DEFAULT_ENVS_KEYS = keyof typeof DEFAULT_ENVS;
export type DEFAULT_ENVS_VALUES = (typeof DEFAULT_ENVS)[DEFAULT_ENVS_KEYS];

export const DEFAULT_RUNTIMES = {
  NODE: "node",
  CLOUDFLARE: "cloudflare",
  VERCEL_EDGE: "vercel-edge",
} as const;
export const DEFAULT_RUNTIME = DEFAULT_RUNTIMES.NODE;
export type DEFAULT_RUNTIMES_KEYS = keyof typeof DEFAULT_RUNTIMES;
export type DEFAULT_RUNTIMES_VALUES =
  (typeof DEFAULT_RUNTIMES)[DEFAULT_RUNTIMES_KEYS];
