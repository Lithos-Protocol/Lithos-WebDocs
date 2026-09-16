import React from 'react';
import { useCurrentSidebarCategory } from '@docusaurus/theme-common';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

const METHODS = {
  get: { label: 'GET', cls: 'badgeGet' },
  post: { label: 'POST', cls: 'badgePost' },
  put: { label: 'PUT', cls: 'badgePut' },
  delete: { label: 'DEL', cls: 'badgeDel' },
  patch: { label: 'PATCH', cls: 'badgePatch' },
};

function getMethod(item) {
  if (!item.className) return null;
  for (const key of Object.keys(METHODS)) {
    if (item.className.includes(`api-method ${key}`)) return key;
  }
  return null;
}

const isSchema = (item) => item.className?.includes('schema');

function MethodBadge({ method }) {
  const cfg = METHODS[method];
  return <span className={`${styles.badge} ${styles[cfg.cls]}`}>{cfg.label}</span>;
}

/** Endpoint row: verb badge, summary, arrow. Zebra striping comes from :nth-child. */
function EndpointRow({ item }) {
  const method = getMethod(item);
  return (
    <Link href={item.href} className={styles.row}>
      <span className={styles.rowBadge}>{method && <MethodBadge method={method} />}</span>
      <span className={styles.rowLabel}>{item.label}</span>
      <span className={styles.rowArrow}>→</span>
    </Link>
  );
}

/** Models render as a 4-up grid of purple-bordered chips. */
function ModelChip({ item }) {
  return (
    <Link href={item.href} className={styles.modelChip}>
      <span className={styles.modelName}>{item.label}</span>
      <span className={styles.modelArrow}>→</span>
    </Link>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <div className={`${styles.statCard} ${styles[tone] ?? ''}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
    </div>
  );
}

export default function ApiCategoryPage() {
  const { items } = useCurrentSidebarCategory();

  const endpoints = items.filter((item) => getMethod(item) !== null);
  const models = items.filter(isSchema);
  const other = items.filter((item) => !getMethod(item) && !isSchema(item));

  return (
    <div className={styles.container}>
      <div className={styles.statRow}>
        <StatCard label="Endpoints" value={endpoints.length} tone="toneCyan" />
        <StatCard label="Models" value={models.length} tone="tonePurple" />
      </div>

      {endpoints.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Endpoints</h2>
          </div>
          <div className={styles.table}>
            {endpoints.map((item, i) => (
              <EndpointRow key={i} item={item} />
            ))}
          </div>
        </section>
      )}

      {models.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Models</h2>
          </div>
          <div className={styles.modelGrid}>
            {models.map((item, i) => (
              <ModelChip key={i} item={item} />
            ))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Other</h2>
          </div>
          <div className={styles.table}>
            {other.map((item, i) => (
              <EndpointRow key={i} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
