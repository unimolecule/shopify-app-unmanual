import { defineConfig } from "drizzle-kit";
import { requirePostgresUrl } from "./scripts/database/env";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle.pg",
  schema: "../../packages/database/src/models/postgres/index.ts",
  dbCredentials: requirePostgresUrl(),
});
