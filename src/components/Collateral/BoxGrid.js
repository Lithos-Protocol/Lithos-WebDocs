import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import s from './styles.module.css';

/**
 * Fixed column count, shared by both grids.
 *
 * 25 columns × 4 rows is exactly the 100-box page both endpoints serve, so a
 * full page lands on a clean rectangle and a short one simply leaves the tail
 * of the last row empty. Holding the count fixed also means zooming rescales
 * the cells instead of reflowing them into a different shape.
 */
const COLS = 25;
const GAP = 8;
const CELL_MIN = 10;
const CELL_MAX = 40;

/** Target size of the expanded tile, in px, before it is snapped to whole cells. */
const TILE_W = 280;
const TILE_H = 150;

/** Open/close travel time. Mirrored in the stylesheet's transition durations. */
const ANIM_MS = 240;

/** Cell edge that makes COLS columns fill the available width. */
function cellSize(width) {
  if (!width) return 0;
  const raw = (width - (COLS - 1) * GAP) / COLS;
  return Math.max(CELL_MIN, Math.min(CELL_MAX, Math.floor(raw)));
}

const span = (cell, target, min) =>
  Math.min(COLS, Math.max(min, Math.ceil((target + GAP) / (cell + GAP))));

/**
 * Run `fn` once the browser has had a chance to commit the current styles.
 *
 * A double rAF is the usual way to do this, but a hidden or background tab
 * never services rAF at all — the tile would then sit at its seed size forever
 * rather than growing. The timeout is the one path guaranteed to fire; rAF just
 * gets there sooner when the page is actually being painted.
 */
function afterCommit(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  const t = setTimeout(run, 32);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  }
  return () => {
    done = true;
    clearTimeout(t);
  };
}

/**
 * Width of the grid, tracked however the browser will let us.
 *
 * ResizeObserver alone is not enough. The synchronous read at attach time can
 * land before the subtree has been laid out and come back 0, and a hidden tab
 * never delivers observer callbacks to correct it — leaving the grid empty. So
 * the measurement is retried on a timeout (which always fires), on window
 * resize, and when the tab becomes visible.
 *
 * `resizing` is true for a moment after the width moves. Zoom changes every
 * cell's position at once, and letting that ride the same transition the tile
 * uses makes the whole grid appear to swim; suppressing it keeps zoom instant
 * and leaves the animation for what it is meant for.
 */
function useGridWidth() {
  const [width, setWidth] = useState(0);
  const [resizing, setResizing] = useState(false);
  const cleanup = useRef(null);
  const settle = useRef(null);
  const last = useRef(0);

  const attach = useCallback((el) => {
    if (cleanup.current) {
      cleanup.current();
      cleanup.current = null;
    }
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      if (!w || w === last.current) return;
      if (last.current !== 0) {
        setResizing(true);
        if (settle.current) clearTimeout(settle.current);
        settle.current = setTimeout(() => setResizing(false), 160);
      }
      last.current = w;
      setWidth(w);
    };
    measure();

    /*
     * Layout is not always resolved when the ref fires, and `clientWidth` then
     * reads 0. A background tab can stay that way for a long time — it does not
     * lay out until something forces it, and no resize or observer callback
     * arrives to prompt a second look — which would leave the grid blank until
     * the reader happened to resize the window. Retrying on a short ladder
     * costs nothing (each call no-ops once the width stops changing) and closes
     * that window wherever it comes from.
     */
    const retries = [16, 60, 200, 600, 1500].map((d) => setTimeout(measure, d));
    const cancel = afterCommit(measure);
    window.addEventListener('resize', measure);
    document.addEventListener('visibilitychange', measure);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }

    cleanup.current = () => {
      cancel();
      retries.forEach(clearTimeout);
      if (settle.current) clearTimeout(settle.current);
      window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', measure);
      if (ro) ro.disconnect();
    };
  }, []);

  return [width, attach, resizing];
}

/**
 * Assign a cell to every box, routing around the expanded tile's footprint.
 *
 * Slots are handed out in index order and only ever move forward, so reading
 * order (left to right, top to bottom) always matches list order — which is
 * what keeps the queue legible as a queue once a tile displaces part of a row.
 *
 * The tile is anchored to the row and column the box occupied before it grew,
 * clamped so it can never run past the last column.
 */
function layout(count, selIndex, spanC, spanR) {
  let tile = null;
  if (selIndex != null && selIndex >= 0 && selIndex < count) {
    const r = Math.floor(selIndex / COLS);
    const c = selIndex % COLS;
    tile = { r, c: Math.max(0, Math.min(c, COLS - spanC)), spanC, spanR };
  }

  const taken = new Set();
  if (tile) {
    for (let dr = 0; dr < tile.spanR; dr++) {
      for (let dc = 0; dc < tile.spanC; dc++) {
        taken.add((tile.r + dr) * COLS + tile.c + dc);
      }
    }
  }

  const cells = new Array(count).fill(null);
  let slot = 0;
  let maxRow = tile ? tile.r + tile.spanR - 1 : 0;

  for (let i = 0; i < count; i++) {
    if (i === selIndex) continue; // the tile stands in for this box
    while (taken.has(slot)) slot++;
    const r = Math.floor(slot / COLS);
    cells[i] = { r, c: slot % COLS };
    if (r > maxRow) maxRow = r;
    slot++;
  }

  return { cells, tile, rows: maxRow + 1 };
}

/** One label/value pair inside an expanded tile. */
export function TileField({ label, value, tone }) {
  const toneClass = tone === 'erg' ? s.cmTileErg : tone === 'lit' ? s.cmTileLit : '';
  return (
    <div className={s.cmTileField}>
      <div className={s.cmTileLabel}>{label}</div>
      <div className={`${s.cmTileValue} ${toneClass}`}>{value}</div>
    </div>
  );
}

/** Shared header for a tile: a title on the left, a close control on the right. */
export function TileHead({ title, badge, onClose }) {
  return (
    <div className={s.cmTileHead}>
      <span className={s.cmTileTitle}>
        {title}
        {badge}
      </span>
      <button
        className={s.cmTileClose}
        onClick={onClose}
        type="button"
        aria-label="Collapse"
        title="Collapse"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Square-per-box grid where the selected box grows in place into a detail tile.
 *
 * Boxes are positioned absolutely rather than by CSS grid: `grid-column` and
 * `grid-row` cannot be transitioned, so a grid-placed layout can only ever snap
 * between states. Driving position through `transform` instead lets every box
 * slide aside as the tile opens and slide back as it closes, and lets the tile
 * itself grow out of — and shrink back into — the exact square that was
 * clicked. Geometry is uniform, so each cell's pixel position is arithmetic.
 */
export default function BoxGrid({
  items,
  variant = 'live', // 'live' | 'queue' — picks the "mine" accent
  getKey,
  isMine = () => false,
  isHead = () => false,
  isTail = () => false,
  cellLabel = () => '',
  renderDetail,
}) {
  const [width, attachGrid, resizing] = useGridWidth();
  const [sel, setSel] = useState(null); // key of the expanded box
  const [closing, setClosing] = useState(false);
  const [grown, setGrown] = useState(false);
  const timer = useRef(null);
  const frame = useRef(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (frame.current) frame.current();
    },
    [],
  );

  const cell = cellSize(width);
  const step = cell + GAP;
  const at = (i) => i * step;
  const px = (n) => n * cell + Math.max(0, n - 1) * GAP;

  const spanC = cell ? span(cell, TILE_W, 6) : 6;
  const spanR = cell ? span(cell, TILE_H, 3) : 3;

  const found = sel == null ? -1 : items.findIndex((it) => getKey(it) === sel);
  const idx = found >= 0 ? found : null;

  // While closing, lay out as if nothing were selected: the boxes slide back at
  // the same moment the tile shrinks, instead of snapping once it disappears.
  const layoutIdx = closing ? null : idx;

  const { cells, tile, rows } = useMemo(
    () => layout(items.length, layoutIdx, spanC, spanR),
    [items.length, layoutIdx, spanC, spanR],
  );

  const open = (key) => {
    if (timer.current) clearTimeout(timer.current);
    if (frame.current) frame.current();
    setClosing(false);
    setSel(key);
    setGrown(false);
    // The tile is committed at the square's size first, then flipped to full
    // size so the browser has two states to interpolate between.
    frame.current = afterCommit(() => setGrown(true));
  };

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    if (frame.current) frame.current();
    setClosing(true);
    setGrown(false);
    timer.current = setTimeout(() => {
      setSel(null);
      setClosing(false);
      timer.current = null;
    }, ANIM_MS);
  };

  const selected = idx != null ? items[idx] : null;

  // Where the selected square sits with nothing expanded — the tile grows out
  // of this rect and shrinks back into it.
  const seed = idx == null ? null : { r: Math.floor(idx / COLS), c: idx % COLS };

  const tone = selected
    ? isMine(selected)
      ? variant === 'queue'
        ? s.cmTileToneQueued
        : s.cmTileToneLive
      : s.cmTileToneOther
    : '';

  const mineClass = variant === 'queue' ? s.cmBoxMineQueued : s.cmBoxMineLive;
  const expanded = grown && !closing && tile;

  return (
    <div
      className={`${s.cmBoxGrid} ${resizing ? s.cmBoxGridStatic : ''}`}
      ref={attachGrid}
      style={{ height: cell ? px(rows) : undefined }}
    >
      {cell > 0 &&
        items.map((it, i) => {
          if (i === idx && !closing) return null; // the tile stands in for it
          const pos = cells[i] ?? seed;
          if (!pos) return null;
          const mine = isMine(it);
          const label = cellLabel(it);
          return (
            <button
              key={getKey(it)}
              type="button"
              title={label}
              aria-label={label}
              className={[
                s.cmBox,
                mine ? mineClass : s.cmBoxOther,
                isHead(it) ? s.cmBoxHead : '',
                isTail(it) ? s.cmBoxTail : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                width: cell,
                height: cell,
                transform: `translate(${at(pos.c)}px, ${at(pos.r)}px)`,
              }}
              onClick={() => open(getKey(it))}
            />
          );
        })}

      {cell > 0 && selected && seed && (
        <div
          className={`${s.cmBoxTile} ${tone} ${expanded ? s.cmBoxTileOpen : ''}`}
          style={
            expanded
              ? {
                  transform: `translate(${at(tile.c)}px, ${at(tile.r)}px)`,
                  width: px(tile.spanC),
                  height: px(tile.spanR),
                }
              : {
                  // Collapsed: exactly the square that was clicked.
                  transform: `translate(${at(seed.c)}px, ${at(seed.r)}px)`,
                  width: cell,
                  height: cell,
                }
          }
        >
          <div className={s.cmTileInner}>{renderDetail(selected, close)}</div>
        </div>
      )}
    </div>
  );
}
