import React from 'react';
import s from './styles.module.css';

/**
 * Content components for the startup guide (screen 03).
 *
 * Registered globally through the swizzled MDXComponents, so a doc author can
 * write <Step n="01" title="…"> without an import in every file.
 */

/**
 * Numbered step card. 34px circle badge — cyan for 01–02, purple for 03–04,
 * matching the design's alternation; pass `tone` to override.
 */
export function Step({ n, title, tone, children }) {
  const num = parseInt(String(n).replace(/\D/g, ''), 10);
  const resolved = tone ?? (Number.isFinite(num) && num >= 3 ? 'purple' : 'cyan');
  return (
    <section className={`${s.step} ${resolved === 'purple' ? s.stepPurple : s.stepCyan}`}>
      <div className={s.stepHead}>
        <span className={s.stepBadge}>{String(n).padStart(2, '0')}</span>
        <h3 className={s.stepTitle}>{title}</h3>
      </div>
      <div className={s.stepBody}>{children}</div>
    </section>
  );
}

/** 3-up grid of requirement cards. */
export function Requirements({ children }) {
  return <div className={s.reqGrid}>{children}</div>;
}

export function Req({ label, value, children }) {
  return (
    <div className={s.reqCard}>
      <div className={s.reqLabel}>{label}</div>
      <div className={s.reqValue}>{value}</div>
      {children && <div className={s.reqNote}>{children}</div>}
    </div>
  );
}

/** Feature row with a coloured dot, from screen 02. */
export function FeatureRow({ tone = 'cyan', title, children }) {
  return (
    <div className={s.featureRow}>
      <span className={`${s.featureDot} ${tone === 'purple' ? s.dotPurple : s.dotCyan}`} />
      <div>
        <div className={s.featureTitle}>{title}</div>
        <div className={s.featureBody}>{children}</div>
      </div>
    </div>
  );
}

/** Right-rail progress list; the active step's dot glows. */
export function Progress({ steps = [], active = 0 }) {
  return (
    <div className={s.progress}>
      <div className={s.progressLabel}>Progress</div>
      {steps.map((label, i) => (
        <div key={label} className={`${s.progressItem} ${i === active ? s.progressActive : ''}`}>
          <span className={`${s.progressDot} ${i === active ? s.progressDotActive : ''}`} />
          {label}
        </div>
      ))}
    </div>
  );
}

/** Cyan "Need help?" card. */
export function HelpCard({ title = 'Need help?', children }) {
  return (
    <div className={s.helpCard}>
      <div className={s.helpTitle}>{title}</div>
      <div className={s.helpBody}>{children}</div>
    </div>
  );
}
