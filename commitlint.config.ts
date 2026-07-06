import { getPackagesSync } from "@unimolecule/utils/node";
import type { UserConfig } from "@commitlint/types";

const { packages } = getPackagesSync(process.cwd());

const allowedScopes = [
  ".github",
  ".vscode",
  ...packages.map((pkg) => pkg.packageJson.name),
  "docs",
  "scripts",
  "repository-config", // 根目录工程化配置文件
];

const Configuration: UserConfig = {
  extends: ["@commitlint/config-conventional"],
  ignores: [(commit: any) => commit.includes("init")],
  rules: {
    "body-leading-blank": [1, "always"],
    "footer-leading-blank": [1, "always"],
    "header-max-length": [2, "always", 256],
    "scope-enum": [
      2,
      "always",
      { scopes: [...allowedScopes], delimiters: [","] },
    ],
    "scope-case": [2, "always", { cases: ["lower-case"], delimiters: [","] }],
    "subject-case": [
      1,
      "never",
      ["sentence-case", "start-case", "pascal-case", "upper-case"],
    ],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
  },
  prompt: {
    // @ts-ignore
    useEmoji: true,
    enableMultipleScopes: true,
    scopeEnumSeparator: ",",
    scopes: [...allowedScopes],
  },
};

export default Configuration;
