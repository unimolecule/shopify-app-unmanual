# Document Workspace Instructions

## Scope

`apps/document` is the VitePress documentation workspace. It is private and does not participate in the Shopify runtime path.

## Rules

- Keep this app independent from `apps/server` and `apps/web` runtime code unless documentation sources are intentionally added.
- Prefer documentation content, examples, and generated references over runtime coupling.
- Keep VitePress configuration and theme behavior local to this workspace.
- Do not import Shopify server runtime code into the documentation app.

## Documentation Style

- App README content should focus on how to run, build, preview, configure, and publish the docs app.
- Keep docs examples aligned with current workspace package exports and commands.
- When documenting package APIs, prefer examples that compile against public package entrypoints.

## Verification

- Run `pnpm -F @shamt/document build` when changing VitePress config, theme, or docs app structure.
- Run `pnpm -F @shamt/document lint` after broad Markdown, Vue, TypeScript, or JSON edits.
