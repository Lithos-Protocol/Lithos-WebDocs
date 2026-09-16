import React, { useState, useMemo } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import sidebar from '@site/docs/lithosapi/sidebar.ts';
import styles from './api.module.css';

/**
 * Endpoint atlas — every tag, endpoint and model on one page.
 *
 * Reads the generated `docs/lithosapi/sidebar.ts` directly rather than
 * duplicating the route list, so it cannot drift from the spec: regenerate the
 * docs and this page follows.
 */

// The band stops well above the filter pills. Two things made the lowest line
// intrusive: the band scales with width, so it reaches further down the page as
// the window grows, and the gradient rule (i % 3 === 1) happens to make index 4
// one of the BRIGHT strokes — so the lowest line was also the most visible.
const ATLAS_LINES = [44, 86, 126, 166];

// Explicit particles so the two dots never share a line, and neither rides the
// bottom-most one. Defaults reference line indexes that no longer exist here.
const ATLAS_PARTICLES = [
  { line: 1, dur: 7, begin: 0.2, color: '#7dd3fc' },
  { line: 3, dur: 8.5, begin: 2.1, color: '#c084fc' },
];

const METHODS = {
  get: { label: 'GET', cls: 'badgeGet' },
  post: { label: 'POST', cls: 'badgePost' },
  put: { label: 'PUT', cls: 'badgePut' },
  delete: { label: 'DEL', cls: 'badgeDel' },
  patch: { label: 'PATCH', cls: 'badgePatch' },
};

function methodOf(item) {
  if (!item.className) return null;
  for (const k of Object.keys(METHODS)) {
    if (item.className.includes(`api-method ${k}`)) return k;
  }
  return null;
}
const isSchema = (i) => i.className?.includes('schema');

/**
 * sidebar.ts default-exports the `apisidebar` ARRAY, not the config object that
 * wraps it. Accept either, so a regeneration that changes the export shape
 * degrades to an empty atlas rather than a crash.
 */
function readCategories() {
  const list = Array.isArray(sidebar) ? sidebar : (sidebar?.apisidebar ?? []);
  return list
    .filter((e) => e.type === 'category')
    .map((c) => ({
      label: c.label,
      description: c.description,
      to: c.link?.id ? `/docs/${c.link.id}` : null,
      endpoints: (c.items ?? []).filter((i) => methodOf(i)).map(withRoute),
      models: (c.items ?? []).filter(isSchema).map(withRoute),
    }));
}

/**
 * Raw sidebar entries carry a doc `id`, not an `href` — only the processed
 * `useCurrentSidebarCategory()` items have hrefs. Build the route ourselves so
 * the links actually resolve.
 */
function withRoute(item) {
  return { ...item, to: item.id ? `/docs/${item.id}` : item.href };
}

function Badge({ method }) {
  const cfg = METHODS[method];
  return <span className={`${styles.badge} ${styles[cfg.cls]}`}>{cfg.label}</span>;
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`${styles.statCard} ${styles[tone] ?? ''}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

export default function ApiAtlas() {
  const categories = useMemo(readCategories, []);
  const [active, setActive] = useState('all');

  const totals = useMemo(
    () =>
      categories.reduce(
        (a, c) => ({
          endpoints: a.endpoints + c.endpoints.length,
          models: a.models + c.models.length,
        }),
        { endpoints: 0, models: 0 },
      ),
    [categories],
  );

  const shown = active === 'all' ? categories : categories.filter((c) => c.label === active);

  return (
    <Layout title="Endpoint atlas" description="Every Lithos Client API endpoint and model.">
      <div className={styles.page}>
        <FlowField
          height={240}
          lines={ATLAS_LINES}
          particles={ATLAS_PARTICLES}
          cubes={[
            cubeBetween({ cx: 1136, size: 42, lineA: 44, lineB: 86 }),
            cubeBetween({ cx: 656, size: 24, lineA: 86, lineB: 126 }),
          ]}
        />

        <div className={styles.shell}>
          <div className={styles.header}>
            <div className="curScrimHost curScrimHostTight">
              <div className={styles.breadcrumb}>
                <Link to="/">Home</Link> <span>/</span> API reference
              </div>
              <h1 className={styles.title}>
                Endpoint <span className="curFlowWord">atlas</span>
              </h1>
              <p className={styles.lead}>
                Every route the Lithos Client exposes, grouped by tag. Each row opens the full
                reference with schemas and sample calls.
              </p>
            </div>
            <div className={styles.statRow}>
              <StatCard label="Endpoints" value={totals.endpoints} tone="toneCyan" />
              <StatCard label="Models" value={totals.models} tone="tonePurple" />
              <StatCard label="Tags" value={categories.length} />
            </div>
          </div>

          <div className={styles.filters}>
            <button
              className={`${styles.pill} ${active === 'all' ? styles.pillActive : ''}`}
              onClick={() => setActive('all')}
              type="button"
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.label}
                className={`${styles.pill} ${active === c.label ? styles.pillActive : ''}`}
                onClick={() => setActive(c.label)}
                type="button"
              >
                {c.label}
              </button>
            ))}
          </div>

          {shown.map((c) => (
            <section key={c.label} className={styles.group}>
              <div className={styles.groupHead}>
                <h2 className={styles.groupTitle}>
                  {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
                </h2>
                {c.description && <p className={styles.groupDesc}>{c.description}</p>}
              </div>

              {c.endpoints.length > 0 && (
                <div className={styles.table}>
                  {c.endpoints.map((i, n) => (
                    <Link key={n} to={i.to} className={styles.row}>
                      <span className={styles.rowBadge}>
                        <Badge method={methodOf(i)} />
                      </span>
                      <span className={styles.rowLabel}>{i.label}</span>
                      <span className={styles.rowArrow}>→</span>
                    </Link>
                  ))}
                </div>
              )}

              {c.models.length > 0 && (
                <div className={styles.modelGrid}>
                  {c.models.map((i, n) => (
                    <Link key={n} to={i.to} className={styles.modelChip}>
                      <span className={styles.modelName}>{i.label}</span>
                      <span className={styles.modelArrow}>→</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </Layout>
  );
}
