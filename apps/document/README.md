# `@shamt/document`

`apps/document` is the VitePress documentation workspace. It is currently a
private app package and does not participate in the Shopify runtime path.

## Scripts

```bash
pnpm -F @shamt/document dev
pnpm -F @shamt/document build
pnpm -F @shamt/document preview
```

The scripts are Bun-oriented and load root env files before running VitePress.
This package should stay independent from `apps/server` and `apps/web` runtime
code unless documentation sources are intentionally added later.
