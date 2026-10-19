import React from 'react';
import s from './styles.module.css';
import { fmtInt } from './format';

const TITLES = {
  loading: 'Statistics are loading',
  'catching-up': 'Statistics are catching up',
  recovering: 'Statistics are recovering from a reorg',
  stale: 'Statistics are stale',
  unavailable: 'Statistics are unavailable',
};

const EFFECTS = {
  stale: 'Figures read from them may be out of date.',
  unavailable: 'Figures read from them may be missing. The client log says why.',
};

/**
 * Collection status from `GET /stats`, under the header of every section that reads statistics. Shown
 * while `mining.status` is anything but `ready` or `disabled`, since only `ready` has reached the tip.
 */
export default function StatsBanner({ mining }) {
  const status = mining?.status;
  if (!status || status === 'ready' || status === 'disabled') return null;
  const source = mining.sourceHeight;
  const target = mining.targetHeight;
  const behind = source != null && target != null ? Math.max(0, target - source) : null;
  const where =
    behind > 0
      ? `${fmtInt(behind)} block${behind === 1 ? '' : 's'} behind the chain, at ${fmtInt(source)} of ${fmtInt(target)}. `
      : source != null
        ? `Collected to block ${fmtInt(source)}. `
        : '';
  return (
    <div className={s.commitBanner} role="alert">
      <span className={s.commitBannerIcon} aria-hidden="true">!</span>
      <div className={s.commitBannerText}>
        <span className={s.commitBannerTitle}>{TITLES[status] ?? `Statistics are ${status}`}</span>
        <span>
          {where}
          {EFFECTS[status] ?? 'Figures read from them are partial until they reach the tip.'}
        </span>
      </div>
    </div>
  );
}
