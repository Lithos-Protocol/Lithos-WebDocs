import React, { useEffect, useState } from 'react';
import s from './styles.module.css';
import { big, fmtInt } from './format';

/**
 * The package's transactions as a list beside the cube, in stack order.
 *
 * It replaces the colour legend rather than sitting next to one: every row already carries its
 * kind's swatch, so the list *is* the legend, and one that also says which slab is which. Hovering
 * a row lights the matching slab, which is easier to aim at than a slab a pixel thick.
 *
 * A row is one drawing unit: a single transaction, or a group of them shown with its count and
 * their summed size or cost.
 *
 * Paged rather than scrolled, because the list sits alongside a fixed-height drawing and a
 * scrolling column next to it would leave the two disagreeing about how tall the card is.
 */
function TxStackList({
  units,
  total,
  paintOf,
  labelOf,
  hovered,
  onHover,
  focused,
  onFocus,
  axis,
  perPage = 8,
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(units.length / perPage));

  /*
   * Rows read in the order the node applies them: genesis first, the top-up last.
   *
   * That is the cube's order too, but the cube builds upward while a list reads downward, so the
   * two run opposite ways on the screen. The list is a running order rather than a picture of the
   * stack, and hovering links them whichever way round they are drawn.
   */

  // Follow a selection made on the cube itself, so the two never disagree about what is showing.
  useEffect(() => {
    if (focused == null) return;
    setPage(Math.floor(focused / perPage));
  }, [focused, perPage]);

  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const start = page * perPage;
  const slice = units.slice(start, start + perPage);
  const measure = (unit) => (axis === 'bytes' ? unit.sizeBytes : unit.cost);

  return (
    <div className={s.stackList}>
      <div className={s.stackListHead}>
        <span className={s.label}>stack</span>
        <span className={s.stackListMeta}>{fmtInt(total)} tx · applied order</span>
      </div>

      <div className={s.stackRows}>
        {slice.map((unit, k) => {
          const i = start + k;
          const value = measure(unit);
          const unreported = value == null || !(Number(big(value)) > 0);
          return (
            <button
              key={unit.id ?? i}
              type="button"
              className={`${s.stackRow} ${hovered === i ? s.stackRowOn : ''} ${focused === i ? s.stackRowFocus : ''}`}
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onFocus(focused === i ? null : i)}
            >
              <span
                className={s.stackSwatch}
                style={{ background: paintOf(unit.kind) }}
              />
              {unit.group ? (
                <span className={s.stackKindGroup}>
                  <span className={s.stackKind} title={labelOf(unit.kind)}>
                    {labelOf(unit.kind)}
                  </span>
                  <span className={s.countChip}>×{unit.count}</span>
                </span>
              ) : (
                <span className={s.stackKind} title={labelOf(unit.kind)}>
                  {labelOf(unit.kind)}
                </span>
              )}
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

export default React.memo(TxStackList);
