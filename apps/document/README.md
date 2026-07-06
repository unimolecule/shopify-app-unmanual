# `@unimolecule/shopify-app-unmanual-document`

`apps/document` is the VitePress documentation workspace. It is currently a
private app package and does not participate in the Shopify runtime path.

## Scripts

```bash
pnpm -F @unimolecule/shopify-app-unmanual-document dev
pnpm -F @unimolecule/shopify-app-unmanual-document build
pnpm -F @unimolecule/shopify-app-unmanual-document preview
```

The scripts are Bun-oriented and load root env files before running VitePress.
This package should stay independent from `apps/server` and `apps/web` runtime
code unless documentation sources are intentionally added later.
