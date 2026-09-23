import React, { useMemo } from 'react';
import s from './styles.module.css';
import { big, fmtErgMin, fmtInt, fmtNum, fmtPct } from './format';

/**
 * What the package is made of: what each kind costs, and what it earns.
 *
 * The cube can only be measured against one axis at a time, so seeing that a kind is cheap in
 * bytes and expensive in cost means toggling back and forth and holding the first view in your
 * head. Here the bars are stacked in the same colours and the same order, and a kind wider on a
 * lower bar than an upper one is denser in that thing — the whole comparison in one glance.
 *
 * The third bar is the point of the other two. Size and cost are what a transaction takes from the
 * block; revenue is what it gives back. A kind that claims a third of the cost budget and earns
 * nothing is worth knowing about, and that is a shape you can only see with all three together.
 *
 * Transactions reporting no cost — carried mempool ancestors the node never measured — contribute
 * nothing to the cost bar, so its segments are floors. That is called out rather than hidden.
 */
export default function CompositionPanel({ txs, colorOf, labelOf, hovered, onHover }) {
  const model = useMemo(() => {
    const byKind = new Map();
    txs.forEach((tx, i) => {
      const bytes = Number(big(tx.sizeBytes));
      const cost = Number(big(tx.cost));
      const row = byKind.get(tx.kind) ?? {
        kind: tx.kind,
        count: 0,
        bytes: 0,
        cost: 0,
        revenue: 0n,
        uncosted: 0,
        indices: [],
      };
      row.count += 1;
      row.bytes += bytes;
      row.cost += cost;
      // Revenue stays BigInt: nanoERG across a package can pass the exact range of a double, and
      // this figure is summed and compared rather than only drawn.
      row.revenue += big(tx.revenueNanoErg);
      if (!(cost > 0)) row.uncosted += 1;
      row.indices.push(i);
      byKind.set(tx.kind, row);
    });
    const rows = [...byKind.values()].sort((a, b) => b.bytes - a.bytes);
    const totalBytes = rows.reduce((n, r) => n + r.bytes, 0);
    const totalCost = rows.reduce((n, r) => n + r.cost, 0);
    const totalRevenue = rows.reduce((n, r) => n + r.revenue, 0n);
    return {
      rows,
      totalBytes,
      totalCost,
      totalRevenue,
      uncosted: rows.reduce((n, r) => n + r.uncosted, 0),
    };
  }, [txs]);

  if (model.rows.length === 0) return null;

  // Shares are computed at a fixed scale so a BigInt total divides exactly like a Number one.
  const shareOf = (value, total) => {
    if (typeof value === 'bigint') {
      return total > 0n ? Number((value * 10000n) / total) / 10000 : 0;
    }
    return total > 0 ? value / total : 0;
  };

  const bar = (total, pick) => (
    <div className={s.compBar}>
      {model.rows.map((row) => {
        const share = shareOf(pick(row), total);
        if (share <= 0) return null;
        const lit = hovered != null && row.indices.includes(hovered);
        return (
          <span
            key={row.kind}
            className={`${s.compSeg} ${lit ? s.compSegOn : ''}`}
            style={{ width: `${share * 100}%`, background: colorOf(row.kind) }}
            title={`${labelOf(row.kind)} — ${fmtPct(share, 1)}`}
            onMouseEnter={() => onHover(row.indices[0])}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
    </div>
  );

  return (
    <div className={`${s.card} ${s.stackGap}`}>
      <div className={s.cardHead}>
        <h3 className={s.cardTitle}>Composition</h3>
        <span className={s.label}>both budgets, same order</span>
      </div>

      <div className={s.compBars}>
        <div className={s.compRow}>
          <span className={s.compAxis}>size</span>
          {bar(model.totalBytes, (r) => r.bytes)}
          <span className={s.compTotal}>{fmtInt(model.totalBytes)} B</span>
        </div>
        <div className={s.compRow}>
          <span className={s.compAxis}>cost</span>
          {bar(model.totalCost, (r) => r.cost)}
          <span className={s.compTotal}>{fmtInt(model.totalCost)}</span>
        </div>
        <div className={s.compRow}>
          <span className={s.compAxis}>earns</span>
          {bar(model.totalRevenue, (r) => r.revenue)}
          <span className={`${s.compTotal} ${s.compTotalErg}`}>
            {fmtErgMin(model.totalRevenue, 4)} ERG
          </span>
        </div>
      </div>

      <div className={s.compTable}>
        <div className={`${s.compTr} ${s.compTh}`}>
          <span />
          <span>kind</span>
          <span className={s.txNum}>n</span>
          <span className={s.txNum}>bytes</span>
          <span className={s.txNum}>of size</span>
          <span className={s.txNum}>cost</span>
          <span className={s.txNum}>of cost</span>
          <span className={s.txNum}>cost/B</span>
          <span className={s.txNum}>earns</span>
        </div>
        {model.rows.map((row) => (
          <div
            key={row.kind}
            className={`${s.compTr} ${
              hovered != null && row.indices.includes(hovered) ? s.compTrOn : ''
            }`}
            onMouseEnter={() => onHover(row.indices[0])}
            onMouseLeave={() => onHover(null)}
          >
            <span className={s.stackSwatch} style={{ background: colorOf(row.kind) }} />
            <span className={s.compKind}>{labelOf(row.kind)}</span>
            <span className={s.txNum}>{row.count}</span>
            <span className={s.txNum}>{fmtInt(row.bytes)}</span>
            <span className={s.txNum}>
              {model.totalBytes > 0 ? fmtPct(row.bytes / model.totalBytes, 1) : '—'}
            </span>
            <span className={`${s.txNum} ${row.uncosted === row.count ? s.txGhost : ''}`}>
              {row.cost > 0 ? fmtInt(row.cost) : 'n/r'}
            </span>
            <span className={s.txNum}>
              {model.totalCost > 0 && row.cost > 0 ? fmtPct(row.cost / model.totalCost, 1) : '—'}
            </span>
            <span className={s.txNum}>
              {row.bytes > 0 && row.cost > 0 ? fmtNum(row.cost / row.bytes, 1) : '—'}
            </span>
            {/* A kind that earns nothing is a fact about it, so the zero is dimmed, not blank. */}
            <span className={`${s.txNum} ${row.revenue > 0n ? s.txErg : s.txGhost}`}>
              {row.revenue > 0n ? fmtErgMin(row.revenue, 4) : '—'}
            </span>
          </div>
        ))}
      </div>

      <p className={s.cardNote} style={{ marginTop: 12 }}>
       Transaction types are broken down into cost, byte size, and earned revenue funneled into the pool. 
        {model.uncosted > 0 && (
          <>
            {' '}
            {model.uncosted === 1 ? 'One transaction reports' : `${model.uncosted} transactions report`}{' '}
            no cost because the node never measured it.
          </>
        )}
      </p>
    </div>
  );
}
