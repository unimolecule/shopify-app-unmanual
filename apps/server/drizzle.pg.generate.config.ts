import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle.pg",
  schema: "../../packages/database/src/models/postgres/index.ts",
});
