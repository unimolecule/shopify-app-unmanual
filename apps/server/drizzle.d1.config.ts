import { defineConfig } from "drizzle-kit";
import { requireD1HttpCredentials } from "./scripts/database/env";

export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  out: "./drizzle.d1",
  schema: "../../packages/database/src/models/sqlite/index.ts",
  dbCredentials: requireD1HttpCredentials(),
});
