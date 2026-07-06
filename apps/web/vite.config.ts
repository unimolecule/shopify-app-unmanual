import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { env } from "./configs/env";
import { name } from "./package.json";
import { htmlPlugin } from "./scripts/vite/plugins/html";
import { imageOptimizerPlugin } from "./scripts/vite/plugins/image-optimizer";
import { publicEnvPlugin } from "./scripts/vite/plugins/public-env";
import { createViteServer } from "./scripts/vite/server";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
/**
 * Configures the web app build around injected Shopify env and Vite plugins.
 */
export default defineConfig(({ command }) => {
  return {
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: createViteServer({ env }),
    build: {
      rolldownOptions: {
        output: {
          minify: {
            compress: {
              dropConsole: true,
            },
          },
        },
      },
    },
    plugins: [
      publicEnvPlugin({
        env,
      }),
      htmlPlugin({
        env,
        appName: name,
      }),
      tailwindcss(),
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      ...(command === "build" ? [imageOptimizerPlugin()] : []),
    ],
  };
});
