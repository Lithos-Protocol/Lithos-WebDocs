#!/usr/bin/env node
/**
 * Re-applies the hand-made customizations that `gen-api-docs` / `clean-api-docs`
 * overwrite every time they run.
 *
 * Two things get wiped:
 *   1. `description` on each category in docs/lithosapi/sidebar.ts — the plugin
 *      emits categories without one, and DocCard renders the description.
 *   2. Each *.tag.mdx uses <DocCardList>, but this site uses the custom
 *      <ApiCategoryPage> (src/components/ApiCategoryPage) which splits a tag
 *      into Endpoints vs Models and drops the emoji / "N items" fallback.
 *
 * Wired as `postgen-api-docs` so `yarn gen-api-docs <id>` restores automatically.
 * NOTE: yarn only fires post-hooks for the *named* script — running
 * `yarn docusaurus gen-api-docs <id>` bypasses it. Use `yarn gen-api-docs`, or
 * run `yarn restore-api-customizations` by hand afterwards.
 *
 * Idempotent: safe to run any number of times, including when nothing is wiped.
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs', 'lithosapi');
const SIDEBAR = path.join(DOCS_DIR, 'sidebar.ts');

/**
 * Category label in sidebar.ts -> description to render on its DocCard.
 * PlasmaDex was removed from the spec; LithosDex replaced it.
 */
const CATEGORY_DESCRIPTIONS = {
  Info: 'Information about the Lithos client and its current state',
  Blocks: 'Blocks currently being processed by Lithos contracts',
  Payments: 'Payments made to you from Lithos contracts',
  Mining: 'Information about the local stratum and mining process',
  Statistics: 'Mining, payment, collateral and client activity numbers for dashboards and graphs',
  // The legacy /collateral/* UTXO endpoints were removed from the client; their
  // tag went with them. Only the collateral-market tag remains.
  'Collateral Market':
    'Stats and participation for the collateral market: the queue, the active set, emission state, and joining',
  // /wallet/balances replaced the split /wallet/balance and /collateral/wallet,
  // so wallet data is its own tag rather than living under either consumer.
  Wallet: "Balances and lending status for the client's own wallet",
  'Lithos Dex': 'Swap, provide liquidity, and collect permanent fees on the LithosDex pool',
};

const DOC_CARD_LIST_BLOCK =
  "import DocCardList from '@theme/DocCardList';\n" +
  "import {useCurrentSidebarCategory} from '@docusaurus/theme-common';\n" +
  '\n' +
  '<DocCardList items={useCurrentSidebarCategory().items}/>';

const API_CATEGORY_PAGE_BLOCK =
  "import ApiCategoryPage from '@site/src/components/ApiCategoryPage';\n" +
  '\n' +
  '<ApiCategoryPage />';

const warnings = [];
const log = (msg) => console.log(`  ${msg}`);

/** Insert `description:` after each category's `label:`, unless already present. */
function restoreSidebar() {
  if (!fs.existsSync(SIDEBAR)) {
    warnings.push(`sidebar.ts not found at ${SIDEBAR} — did gen-api-docs run?`);
    return;
  }

  let src = fs.readFileSync(SIDEBAR, 'utf8');
  let added = 0;
  let already = 0;

  for (const [label, description] of Object.entries(CATEGORY_DESCRIPTIONS)) {
    // Match the category block for this label, capturing indentation so the
    // inserted line lines up with whatever the generator emitted.
    const re = new RegExp(
      `(type: "category",\\s*\\n(\\s*)label: ${JSON.stringify(label)},\\s*\\n)(\\s*)(description:|link:)`,
    );
    const m = src.match(re);

    if (!m) {
      warnings.push(`category "${label}" not found in sidebar.ts (renamed or removed?)`);
      continue;
    }
    if (m[4] === 'description:') {
      already++;
      continue;
    }

    src = src.replace(re, `$1$3description: ${JSON.stringify(description)},\n$3$4`);
    added++;
  }

  // Surface categories the generator produced that we have no description for —
  // otherwise a newly added tag silently ships without one.
  const labels = [...src.matchAll(/type: "category",\s*\n\s*label: "([^"]+)"/g)].map((m) => m[1]);
  for (const label of labels) {
    if (!(label in CATEGORY_DESCRIPTIONS)) {
      warnings.push(
        `category "${label}" has no description mapping — add it to CATEGORY_DESCRIPTIONS in ${path.relative(process.cwd(), __filename)}`,
      );
    }
  }

  if (added) fs.writeFileSync(SIDEBAR, src);
  log(`sidebar.ts: ${added} description(s) added, ${already} already present`);
}

/** Swap the generated DocCardList block for ApiCategoryPage in every tag page. */
function restoreTagPages() {
  if (!fs.existsSync(DOCS_DIR)) {
    warnings.push(`docs dir not found at ${DOCS_DIR}`);
    return;
  }

  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.tag.mdx'));
  if (files.length === 0) {
    warnings.push('no *.tag.mdx files found — did gen-api-docs run?');
    return;
  }

  let patched = 0;
  let already = 0;

  for (const file of files) {
    const p = path.join(DOCS_DIR, file);
    const text = fs.readFileSync(p, 'utf8');

    if (text.includes(DOC_CARD_LIST_BLOCK)) {
      fs.writeFileSync(p, text.replace(DOC_CARD_LIST_BLOCK, API_CATEGORY_PAGE_BLOCK));
      patched++;
    } else if (text.includes('<ApiCategoryPage />')) {
      already++;
    } else {
      warnings.push(`${file}: neither DocCardList nor ApiCategoryPage found — check by hand`);
    }
  }

  log(`tag pages: ${patched} patched, ${already} already correct (${files.length} total)`);
}

console.log('Restoring API doc customizations…');
restoreSidebar();
restoreTagPages();

if (warnings.length) {
  console.warn('\nWarnings:');
  for (const w of warnings) console.warn(`  ! ${w}`);
  // Non-fatal: a warning means "look at this", not "the build is broken".
  // Genuine failures (missing dirs) already surface as warnings above and will
  // show up immediately as a broken docs build.
}

console.log('Done.');
