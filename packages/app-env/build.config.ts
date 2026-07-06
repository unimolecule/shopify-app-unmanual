import process from "node:process";
import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./src/index.ts"],
    format: ["esm", "cjs"],
    platform: "node",
    dts: true,
    tsconfig: "./tsconfig.json",
    unbundle: true,
    watch: process.env.APP_ENV === "development",
  },
]);
