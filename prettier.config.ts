import type { Config } from "prettier";

const config: Config = {
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  endOfLine: "lf",
  plugins: [
    "prettier-plugin-tailwindcss", // needs to be last
  ],
  overrides: [
    {
      files: "*.jsonc",
      options: {
        trailingComma: "none",
      },
    },
  ],
};

export default config;
