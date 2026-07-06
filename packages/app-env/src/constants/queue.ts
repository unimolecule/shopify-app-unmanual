export const DEFAULT_APP_QUEUE_PROVIDERS = {
  PGBOSS: "pg-boss",
  QUEUES: "queues",
} as const;
export type DEFAULT_APP_QUEUE_PROVIDERS_VALUES =
  (typeof DEFAULT_APP_QUEUE_PROVIDERS)[keyof typeof DEFAULT_APP_QUEUE_PROVIDERS];
