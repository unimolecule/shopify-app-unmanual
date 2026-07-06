import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  out: "./drizzle.d1",
  schema: "../../packages/database/src/models/sqlite/index.ts",
});
