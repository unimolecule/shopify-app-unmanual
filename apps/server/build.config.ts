import process from "node:process";
import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["./src/app/runtime/process/node/index.ts"],
    format: ["esm", "cjs"],
    platform: "node",
    dts: true,
    tsconfig: "./tsconfig.json",
    outDir: "dist/process/node",
    watch: process.env.APP_ENV === "development",
    shims: true,
  },
  {
    entry: ["./src/app/runtime/isolate/cloudflare/index.ts"],
    format: ["esm"],
    platform: "neutral",
    dts: true,
    tsconfig: "./tsconfig.json",
    outDir: "dist/isolate/cloudflare",
    watch: process.env.APP_ENV === "development",
  },
  {
    entry: ["./src/app-api-type.ts"],
    format: ["esm"],
    platform: "neutral",
    dts: true,
    tsconfig: "./tsconfig.json",
    outDir: "dist/typings",
    watch: process.env.APP_ENV === "development",
  },
]);
