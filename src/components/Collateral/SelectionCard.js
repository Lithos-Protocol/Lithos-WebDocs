import React from 'react';
import s from './styles.module.css';
import { big, fmtErgAmount, fmtInt } from './format';
import { Row } from './ui';

const BLOCK_MS = 120_000;

const fmtWait = (blocks) => {
  const d = (Number(blocks) * BLOCK_MS) / 86_400_000;
  return d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${d.toFixed(d < 10 ? 1 : 0)} days`;
};

const fmtNet = (nano) => {
  const v = big(nano ?? '0');
  return `${v > 0n ? '+' : v < 0n ? '−' : ''}${fmtErgAmount(v < 0n ? -v : v, 4)} ERG`;
};

/** One path's returns: the pooled APR on top, then what it is made of. */
function PathSide({ title, path }) {
  const none = !path || Number(path.boxes ?? 0) === 0;
  return (
    <div className={s.cmBookSide}>
      <div className={s.cmBookHead}>
        <span className={s.cmBookTitle}>{title}</span>
        <span className={s.cmBookCount}>{none ? 'no boxes' : `${fmtInt(path.boxes)} boxes`}</span>
      </div>
      <div className={`${s.statValue} ${none ? s.statValueSoft : s.statValueCyan}`}>
        {path?.aprPercent != null ? `${path.aprPercent.toFixed(1)}%` : '—'}
        <span className={s.statUnit}>APR</span>
      </div>
      {!none && (
        <>
          <Row label="Mean bid" value={`${fmtErgAmount(path.meanPriorityFeeNanoErg ?? '0', 4)} ERG`} />
          <Row label="Mean wait, join to spend" value={path.meanWaitBlocks != null ? fmtWait(path.meanWaitBlocks) : '—'} />
          <Row label="Net to lenders" value={fmtNet(path.netNanoErg)} />
        </>
      )}
    </div>
  );
}

/**
 * What lenders earned over the stats window, split by how a Lithos block took their box: by bid, or through
 * clearance once the box reached the clearance age. ERG only, pooled over the ERG each box locked from its join
 * until its reward unlocked.
 */
export default function SelectionCard({ selection }) {
  if (!selection) return null;
  const covered = Number(selection.coveredBlocks ?? 0);
  const blocks = Number(selection.lithosBlocks ?? 0);
  return (
    <div className={s.card} style={{ marginTop: '1.25rem' }}>
      <h3 className={s.cardTitle}>Lender returns by selection</h3>
      <p className={s.cardDesc}>
        ERG only, from each box&rsquo;s join until its reward unlocks. Clearance takes a box once it is{' '}
        {fmtInt(selection.clearanceAge)} blocks old.
      </p>
      <div className={s.cmBook}>
        <PathSide title="By bid" path={selection.bid} />
        <PathSide title="Through clearance" path={selection.clearance} />
      </div>
      <div className={s.cardNote} style={{ marginTop: 10 }}>
        {covered === blocks
          ? `${fmtInt(blocks)} Lithos blocks in the window.`
          : `${fmtInt(covered)} of ${fmtInt(blocks)} Lithos blocks in the window; the rest were recorded before selections were.`}
      </div>
    </div>
  );
}
