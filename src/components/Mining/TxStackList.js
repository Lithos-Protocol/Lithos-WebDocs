import React, { useEffect, useMemo, useState } from 'react';
import s from './styles.module.css';
import { big, fmtInt } from './format';

/**
 * The package's transactions as a list beside the cube, in stack order.
 *
 * It replaces the colour legend rather than sitting next to one: every row already carries its
 * kind's swatch, so the list *is* the legend, and one that also says which slab is which. Hovering
 * a row lights the matching slab, which is easier to aim at than a slab a pixel thick.
 *
 * Paged rather than scrolled, because the list sits alongside a fixed-height drawing and a
 * scrolling column next to it would leave the two disagreeing about how tall the card is.
 */
export default function TxStackList({
  txs,
  colorOf,
  labelOf,
  hovered,
  onHover,
  focused,
  onFocus,
  axis,
  perPage = 8,
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(txs.length / perPage));

  /*
   * Rows read in the order the node applies them: genesis first, the top-up last.
   *
   * That is the cube's order too, but the cube builds upward while a list reads downward, so the
   * two run opposite ways on the screen. The list is a running order rather than a picture of the
   * stack, and hovering links them whichever way round they are drawn.
   */
  const ordered = useMemo(() => txs.map((tx, i) => ({ tx, i })), [txs]);

  // Follow a selection made on the cube itself, so the two never disagree about what is showing.
  useEffect(() => {
    if (focused == null) return;
    const row = ordered.findIndex((r) => r.i === focused);
    if (row >= 0) setPage(Math.floor(row / perPage));
  }, [focused, ordered, perPage]);

  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const start = page * perPage;
  const slice = ordered.slice(start, start + perPage);
  const measure = (tx) => (axis === 'bytes' ? tx.sizeBytes : tx.cost);

  return (
    <div className={s.stackList}>
      <div className={s.stackListHead}>
        <span className={s.label}>stack</span>
        <span className={s.stackListMeta}>{fmtInt(txs.length)} tx · applied order</span>
      </div>

      <div className={s.stackRows}>
        {slice.map(({ tx, i }) => {
          const value = measure(tx);
          const unreported = value == null || !(Number(big(value)) > 0);
          return (
            <button
              key={tx.id ?? i}
              type="button"
              className={`${s.stackRow} ${hovered === i ? s.stackRowOn : ''} ${
                focused === i ? s.stackRowFocus : ''
              }`}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onFocus(focused === i ? null : i)}
            >
              <span className={s.stackSwatch} style={{ background: colorOf(tx.kind) }} />
              <span className={s.stackKind}>{labelOf(tx.kind)}</span>
              <span className={`${s.stackVal} ${unreported ? s.stackValDim : ''}`}>
                {unreported
                  ? 'n/r'
                  : axis === 'bytes'
                    ? `${fmtInt(value)} B`
                    : fmtInt(value)}
              </span>
            </button>
          );
        })}
        {/* Blank rows keep the column's height fixed on the last page. */}
        {Array.from({ length: Math.max(0, perPage - slice.length) }).map((_, i) => (
          <span key={`pad-${i}`} className={`${s.stackRow} ${s.stackRowPad}`} />
        ))}
      </div>

      <div className={s.stackPager}>
        <button
          type="button"
          className={s.pageBtn}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className={s.pageLabel}>
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          className={s.pageBtn}
          onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          disabled={page >= pages - 1}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
