import React, { useState } from 'react';
import m from '../Mining/styles.module.css';
import f from '../Collateral/styles.module.css';
import s from './styles.module.css';
import { useExtensions } from './ExtensionsLayout';
import { COLORS, fmtEpochs, fmtInt, fmtSpan, fmtWindowRange, EPOCH_LENGTH } from './format';

export const PAGE_SIZES = [10, 25, 50, 100, 200, 300];

/**
 * A window for a table cell, in the reader's unit: "14,814–14,821 8 ep", or the blocks it covers with their count
 * on a second line. The title gives the rough duration either way.
 */
export function WindowText({ start, length }) {
  const { heights } = useExtensions();
  const title = `${fmtEpochs(length)}, ${fmtInt(length * EPOCH_LENGTH)} blocks, about ${fmtSpan(length * EPOCH_LENGTH)}`;
  return heights ? (
    <span className={s.windowText} title={title}>
      <span>{fmtWindowRange(start, length, true)}</span>
      <span className={s.dimUnit}>{fmtEpochs(length, true)}</span>
    </span>
  ) : (
    <span title={title}>
      {fmtWindowRange(start, length, false)} <b>{length}</b>
      <span className={s.dimUnit}> ep</span>
    </span>
  );
}

/** Which side, in its fixed colour: long is paid when difficulty rises, short when it falls. */
export function SideChip({ side, prefix = '' }) {
  const long = side === 'long';
  const both = side === 'both';
  return (
    <span
      className={s.sideChip}
      style={{ '--side-color': both ? 'var(--cur-muted)' : long ? COLORS.long : COLORS.short }}
      title={both ? 'This wallet holds both sides' : long ? 'Paid when difficulty rises' : 'Paid when difficulty falls'}
    >
      <span className={s.sideArrow}>{both ? '↕' : long ? '▲' : '▼'}</span>
      {prefix}
      {both ? 'both' : long ? 'long' : 'short'}
    </span>
  );
}

const STATUS = {
  waiting: { label: 'Waiting', cls: 'statusWaiting', hint: 'The window has not started' },
  in_window: { label: 'In window', cls: 'statusLive', hint: 'Epochs of the window are being recorded' },
  settleable: { label: 'Settleable', cls: 'statusReady', hint: 'Every epoch is recorded; anyone can settle it now' },
  refundable: { label: 'Refundable', cls: 'statusRefund', hint: 'The window left the accumulator; each side gets its margin back' },
  open: { label: 'Open', cls: 'statusLive', hint: 'A taker can fill it now' },
  expired: { label: 'Expired', cls: 'statusDead', hint: 'No block can fill it any more; cancel it to get your LIT back' },
  unfillable: { label: 'Not fillable', cls: 'statusDead', hint: 'A fill would be refused' },
  filled: { label: 'Filled', cls: 'statusReady', hint: 'A taker filled it and it became a position' },
  cancelled: { label: 'Cancelled', cls: 'statusDead', hint: 'Returned to you' },
  settled: { label: 'Settled', cls: 'statusReady', hint: 'Paid out' },
  refunded: { label: 'Refunded', cls: 'statusRefund', hint: 'Margins returned' },
};

export function StatusChip({ status }) {
  const st = STATUS[status] ?? { label: status, cls: 'statusDead' };
  return (
    <span className={`${s.statusChip} ${s[st.cls]}`} title={st.hint}>
      {st.label}
    </span>
  );
}

/** A headline figure with its own supporting line. */
export function Kpi({ label, value, unit, sub, tone }) {
  return (
    <div className={s.kpi}>
      <div className={m.label}>{label}</div>
      <div className={s.kpiValue} style={tone ? { color: tone } : undefined}>
        {value}
        {unit && <span className={s.kpiUnit}>{unit}</span>}
      </div>
      {sub && <div className={s.kpiSub}>{sub}</div>}
    </div>
  );
}

/** First / previous / page / next / last. */
export function Pager({ page, pages, onPage }) {
  const go = (p) => onPage(Math.max(0, Math.min(pages - 1, p)));
  return (
    <div className={m.stackPager}>
      <button type="button" className={m.pageBtn} disabled={page === 0} onClick={() => go(0)} aria-label="First page">
        «
      </button>
      <button type="button" className={m.pageBtn} disabled={page === 0} onClick={() => go(page - 1)} aria-label="Previous page">
        ‹
      </button>
      <span className={m.pageLabel}>
        {fmtInt(page + 1)} / {fmtInt(pages)}
      </span>
      <button type="button" className={m.pageBtn} disabled={page >= pages - 1} onClick={() => go(page + 1)} aria-label="Next page">
        ›
      </button>
      <button type="button" className={m.pageBtn} disabled={page >= pages - 1} onClick={() => go(pages - 1)} aria-label="Last page">
        »
      </button>
    </div>
  );
}

export function PageSize({ value, onChange, label = 'rows' }) {
  return (
    <>
      <span className={m.label}>{label}</span>
      <select className={m.pageSelect} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Rows per page">
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </>
  );
}

/** Slices `rows` to one page and keeps the page in range as the rows change. */
export function usePaged(rows, initialSize = PAGE_SIZES[0]) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(page, pages - 1);
  return {
    rows: rows.slice(at * size, (at + 1) * size),
    page: at,
    pages,
    size,
    first: at * size,
    setPage,
    setSize: (n) => {
      setSize(n);
      setPage(0);
    },
  };
}

/**
 * Asks for the API key in place, for a view that cannot show anything without it. The key is held as it is
 * everywhere else on the site: in memory, unless the reader turned on remembering it.
 */
export function KeyGate({ what }) {
  const { unlock } = useExtensions();
  const [key, setKey] = useState('');
  return (
    <div className={s.keyGate}>
      <div className={s.keyGateGlyph} aria-hidden="true">
        ⚿
      </div>
      <div className={s.keyGateBody}>
        <div className={m.cardTitle}>Your API key unlocks {what}</div>
        <p className={m.cardNote}>
          It stays in this page's memory, so it is asked for again after a refresh, unless you turn on
          remembering it under Settings.
        </p>
        <form
          className={s.keyForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) unlock(key);
          }}
        >
          <input
            className={f.settingInput}
            type="password"
            value={key}
            placeholder="API key"
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="API key"
          />
          <button className={`${f.btn} ${f.btnSm}`} type="submit" disabled={!key.trim()}>
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
