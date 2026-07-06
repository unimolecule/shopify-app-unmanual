import process from "node:process";
import { outputEntryBuilder } from "@unimolecule/utils/node";
import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: outputEntryBuilder("./src", {
      entries: "index",
    }),
    format: ["esm", "cjs"],
    platform: "node",
    dts: true,
    tsconfig: "./tsconfig.json",
    unbundle: true,
    watch: process.env.APP_ENV === "development",
  },
]);
