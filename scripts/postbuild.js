#!/usr/bin/env node
/**
 * Post-processes `build/` into the layout the Play server serves.
 *
 * Play mounts the site at /assets from `public/`, which changes two things about
 * the vanilla Docusaurus output:
 *
 *   1. Docusaurus emits assets under `build/assets/{js,css}`, so served through
 *      Play they land at /assets/assets/... — one level too deep. Move them up
 *      and rewrite the references.
 *   2. Play's `Assets` resolves a URL to a LITERAL file, and Docusaurus emits
 *      directory-index routes (`dex/liquidity/index.html`). The client's
 *      WebPanelController resolves /assets/dex/liquidity to that index.html, so
 *      a refresh works; the sibling `dex/liquidity.html` written here keeps the
 *      `.html` form of each URL working too.
 *
 * Runs automatically as `postbuild`, so `yarn build` leaves a deployable tree.
 * Idempotent: safe to run twice.
 */

const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const log = (m) => console.log(`  ${m}`);

if (!fs.existsSync(BUILD)) {
  console.error('postbuild: build/ not found — run a build first.');
  process.exit(1);
}

/* ---------- 1. lift js/ and css/ out of assets/ ---------- */
function lift(name) {
  const from = path.join(BUILD, 'assets', name);
  const to = path.join(BUILD, name);
  if (fs.existsSync(from)) {
    if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
    fs.renameSync(from, to);
    log(`moved assets/${name} -> ${name}`);
  } else if (fs.existsSync(to)) {
    log(`${name}/ already lifted`);
  } else {
    log(`!! neither assets/${name} nor ${name} exists`);
  }
}
lift('js');
lift('css');

/* ---------- 2. rewrite the doubled /assets/assets/ prefix ----------
   EVERY page, not just index/404. Each generated HTML file carries its own
   <link>/<script> tags pointing at /assets/assets/..., so patching only the two
   root files leaves every doc and app route with no CSS or JS once the folders
   above have moved. */
function eachHtml(dir, fn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) eachHtml(full, fn);
    else if (entry.name.endsWith('.html')) fn(full);
  }
}

let filesPatched = 0;
let refsPatched = 0;
eachHtml(BUILD, (p) => {
  const before = fs.readFileSync(p, 'utf8');
  if (!before.includes('/assets/assets/')) return;
  const n = before.split('/assets/assets/').length - 1;
  fs.writeFileSync(p, before.split('/assets/assets/').join('/assets/'));
  filesPatched++;
  refsPatched += n;
});
log(`html: ${refsPatched} reference(s) rewritten across ${filesPatched} file(s)`);

/* ---------- 3. point webpack's chunk loader at the lifted js/ ---------- */
const jsDir = path.join(BUILD, 'js');
if (fs.existsSync(jsDir)) {
  const runtime = fs.readdirSync(jsDir).find((f) => /^runtime~main\..*\.js$/.test(f));
  if (!runtime) {
    log('!! no runtime~main.*.js found');
  } else {
    const p = path.join(jsDir, runtime);
    const before = fs.readFileSync(p, 'utf8');
    const after = before.split('"assets/js/"').join('"js/"');
    if (after !== before) {
      fs.writeFileSync(p, after);
      log(`${runtime}: chunk path rewritten`);
    } else {
      log(`${runtime}: already rewritten`);
    }
  }
}

/* ---------- 4. sibling .html for every directory route ---------- */
let made = 0;
let skipped = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Asset directories hold no routes.
      if (['js', 'css', 'img', 'assets'].includes(path.relative(BUILD, full))) continue;
      walk(full);
      const index = path.join(full, 'index.html');
      if (fs.existsSync(index)) {
        const sibling = `${full}.html`;
        const src = fs.readFileSync(index);
        if (fs.existsSync(sibling) && fs.readFileSync(sibling).equals(src)) {
          skipped++;
        } else {
          fs.writeFileSync(sibling, src);
          made++;
        }
      }
    }
  }
})(BUILD);
log(`sibling routes: ${made} written, ${skipped} already current`);

/* ---------- verify ---------- */
const problems = [];
for (const d of ['js', 'css']) {
  if (!fs.existsSync(path.join(BUILD, d))) problems.push(`build/${d} missing`);
  if (fs.existsSync(path.join(BUILD, 'assets', d))) problems.push(`build/assets/${d} still present`);
}

// No page may reference the old prefix, and every page must reference a stylesheet
// that actually exists on disk — the failure mode is a silently unstyled site.
let stale = 0;
let missingCss = 0;
eachHtml(BUILD, (p) => {
  const html = fs.readFileSync(p, 'utf8');
  if (html.includes('/assets/assets/')) stale++;
  const m = html.match(/href="\/assets\/(css\/[^"]+\.css)"/);
  if (m && !fs.existsSync(path.join(BUILD, m[1]))) missingCss++;
});
if (stale) problems.push(`${stale} page(s) still reference /assets/assets/`);
if (missingCss) problems.push(`${missingCss} page(s) link a stylesheet that does not exist`);
if (problems.length) {
  console.error('\npostbuild problems:');
  for (const p of problems) console.error(`  ! ${p}`);
  process.exit(1);
}
log('verified');
