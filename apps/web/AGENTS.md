# Web Workspace Instructions

## Scope

`apps/web` owns the Vite/React frontend target, Shopify App Bridge integration, public env injection, browser API client, TanStack Router and Query setup, and admin UI rendering.

## UI Rules

- Shopify admin UI must use Polaris web components loaded by the app shell.
- Do not introduce custom CSS, raw HTML UI, or non-Polaris component libraries for admin interfaces.
- Use `<s-page>` as the top-level page layout and `<s-section>` for content areas.
- Use `<s-banner>` for messages, `<s-spinner>` for loading, and `<s-text>` for text.
- Escape user-facing strings that are injected into component HTML.
- Use React only to orchestrate state, routing, and component composition around Polaris web components.
- The app shell includes Shopify App Bridge and Polaris scripts in the document head; route code should use those existing web components.
- When generating Polaris web component code and the `validate_component_codeblocks` MCP tool is available, validate with `api: "polaris-app-home"`.

Common components:

| Component                                 | Use for                            |
| ----------------------------------------- | ---------------------------------- |
| `<s-page>`                                | Top-level page layout with heading |
| `<s-section>`                             | Content sections within a page     |
| `<s-box>`                                 | Custom padding, background, border |
| `<s-text>`                                | Inline text with variants          |
| `<s-heading>`                             | Section headings                   |
| `<s-banner>`                              | Alerts and messages                |
| `<s-button>`                              | Actions                            |
| `<s-spinner>`                             | Loading indicators                 |
| `<s-table>`                               | Data tables                        |
| `<s-unordered-list>` / `<s-ordered-list>` | Lists                              |
| `<s-badge>`                               | Status indicators                  |
| `<s-modal>`                               | Dialogs                            |
| `<s-text-field>`                          | Text inputs                        |
| `<s-select>`                              | Dropdowns                          |
| `<s-stack>`                               | Flex layout                        |
| `<s-grid>`                                | Grid layout                        |

## Env And Browser Boundary

- Browser code must not import `configs/env.ts` or parse full server env.
- Public browser env must flow through the existing Vite public env plugin and `src/utils/public-env.ts`.
- Keep secret filtering conservative. New secret, token, database, Redis, password, ID, private, or scope-like env fields must be filtered from browser output.
- Keep App Bridge loading conditional on Shopify app mode and existing shell injection patterns.

## API Client Rules

- Browser API calls should go through `src/utils/client.shopify.ts` and `src/apis/*`.
- Do not duplicate authorization header logic, OAuth recovery, or redirect throttling in pages.
- Page and route components should call business API functions rather than constructing raw fetch requests.
- Reuse `@unimolecule/oh-my-fetch` and existing client hooks before adding client-specific request logic.
- API schemas, types, enums, and status values that mirror database-backed records must come from `@shamt/database` when available.
- API files may define browser-safe serialized response types, transport wrappers, or JSON-date adaptations locally when package types are not directly browser-safe.
- Before adding local API schema/type/enum definitions, check `@shamt/database`, `@shamt/app-env`, and other semantic `packages/*` exports first.
- Paginated API client responses should expect list arrays at `response.data?.result` and pagination metadata at `response.data?.pagination`.
- Do not read resource-specific list keys such as `productExports` or `files` from API list responses.
- API client list inputs may pass either `cursor` or `page` with `limit`, never both.
- Use page pagination only for shallow table navigation. Use the server-returned `nextCursor` for deep pagination or infinite/loading-more flows.
- Keep pagination query builders from sending `undefined` values.
- Page-mode UI may use `pagination.total`; cursor-mode UI should rely on `hasNext` and `nextCursor`.

## File Organization

- Keep Vite config and plugins under `configs/` and `scripts/vite/`.
- Keep public constants for build plugins under `constants/`.
- Keep route-level UI in route files and shared UI states in `src/components/`.
- Put reusable browser helpers in `src/utils/`.
- Put reusable types in local `types.ts` files or `typings/` when they describe globals.

## Documentation

- Update `apps/web/README.md` when changing env injection, App Bridge behavior, Vite server/proxy behavior, image optimization, routing, or API client boundaries.
- App README content should focus on usage, env, commands, runtime behavior, and troubleshooting.

## Verification

- For frontend behavior changes, run `pnpm -F @shamt/web test` when tests are relevant.
- Run `pnpm -F @shamt/web build` when changing Vite config, env injection, routing, or production assets.
- Run `pnpm -F @shamt/web lint` after broad TypeScript, React, Markdown, or JSON edits.
