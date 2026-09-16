# Lithos WebDocs

The web front end served by the [Lithos Protocol](https://github.com/Lithos-Protocol) client:
protocol documentation, a REST API reference generated from the client's OpenAPI spec, and the
LithosDex and Collateral Market interfaces.

Built with [Docusaurus 3](https://docusaurus.io/) and
[docusaurus-plugin-openapi-docs](https://github.com/PaloAltoNetworks/docusaurus-openapi-docs).

## What's in here

| Path | What it is |
|---|---|
| `docs/` | Protocol documentation and the startup guide, hand written |
| `docs/lithosapi/` | API reference pages, **generated** from the spec — see below |
| `examples/lithosapi.yaml` | The client's OpenAPI spec, copied from `Lithos-Client/conf/openapi.yaml` |
| `src/components/Dex/` | LithosDex interface: swap, liquidity, orders, fees, flush |
| `src/components/Collateral/` | Collateral market interface |
| `src/pages/` | Home page and the API atlas |
| `src/css/custom.css` | The design system — colours, typography, component overrides |
| `src/theme/` | Swizzled Docusaurus components |
| `scripts/` | Build post-processing and API doc customisation restore |

## Running it

Requires Node 18+ and Yarn.

```bash
yarn install
```

```bash
yarn start
```

The dev server runs at `http://localhost:3000/assets/`. The DEX and Collateral pages talk to a
Lithos Client; with no client running they show their unavailable states. Point them at one under
**Settings** on either page, or run a client on `http://localhost:9000`, which the dev server
assumes by default.

New files under `src/theme/` need a full restart — hot reload does not pick them up.

## Building

```bash
yarn build
```

This writes `build/` and then runs `scripts/postbuild.js`, which rewrites asset paths for the way
the client serves the site. **Use `yarn build`, not `yarn docusaurus build`** — the post-build step
only runs as a hook on the named script, and pages ship without CSS if it is skipped.

To deploy, replace the client's `public/` directory with the contents of `build/`. Clear the old
directory first: asset filenames are content hashed, so copying over the top leaves orphans behind.

## Regenerating the API reference

`docs/lithosapi/` is generated from `examples/lithosapi.yaml`. After updating that spec from the
client's `conf/openapi.yaml`:

```bash
yarn clean-api-docs lithosapi && yarn gen-api-docs lithosapi
```

Generation overwrites two hand-made customisations: the category `description` fields in
`sidebar.ts`, and the `*.tag.mdx` pages that use `<ApiCategoryPage />` instead of `<DocCardList />`.
`scripts/restore-api-customizations.js` puts both back and runs automatically as a `postgen-api-docs`
hook. Running `yarn docusaurus gen-api-docs` directly bypasses that hook; use the named script, or
run `yarn restore-api-customizations` afterwards.

A tag added to the spec needs a matching entry in `CATEGORY_DESCRIPTIONS` in that script, which
warns when it finds a category it has no description for.

## Configuration

`url` and `baseUrl` in `docusaurus.config.ts` describe the default deployment, where the client
serves the site at `/assets` on its own host. Change both if you host it elsewhere.

## Licence

MIT — see [LICENSE](LICENSE). This project began as Palo Alto Networks' Docusaurus OpenAPI
template; [NOTICE](NOTICE) records that and the other upstream work it builds on.
