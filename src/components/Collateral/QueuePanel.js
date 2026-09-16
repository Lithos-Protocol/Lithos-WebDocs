import React, { useState, useEffect, useCallback } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useCollateral } from './CollarLayout';
import {
  big,
  fmtErgAmount,
  fmtTokenAmount,
  fmtInt,
  fmtAge,
  shortId,
  BLOCK_INTERVAL_MS,
} from './format';
import { Alert, Spinner, KeyHintPill } from './ui';
import BoxGrid, { TileHead, TileField } from './BoxGrid';

/** The endpoint caps `limit` at 100, and a full page fills the grid nicely. */
const PAGE_SIZE = 100;

/**
 * Height -> rough wall-clock age via Ergo's two-minute target. Good enough for
 * a "joined 3d ago" column; never used for anything financial.
 */
function joinedAge(creationHeight, syncHeight, now) {
  if (creationHeight == null || syncHeight == null || syncHeight < creationHeight) return null;
  return fmtAge(now - (syncHeight - Number(creationHeight)) * BLOCK_INTERVAL_MS, now);
}

export default function QueuePanel() {
  const { market, wallet, tick } = useCollateral();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);

  const head = market?.queueHead;

  const load = useCallback((off) => {
    let alive = true;
    setLoading(true);
    api
      .getQueue({ limit: PAGE_SIZE, offset: off })
      .then((r) => {
        if (!alive) return;
        // The endpoint answers with a bare array.
        setRows(Array.isArray(r) ? r : (r.entries ?? r.positions ?? []));
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (head == null) return undefined;
    return load(offset);
  }, [load, offset, head, tick]);

  // The reader's own addresses: primary plus every derived lender key.
  const myAddrs = new Set();
  if (wallet?.primaryAddress) myAddrs.add(wallet.primaryAddress);
  for (const k of wallet?.lenderKeys ?? []) if (k.address) myAddrs.add(k.address);

  const now = Date.now();
  const queueLen = Number(market?.queueLength ?? 0);
  const qHead = Number(market?.queueHead ?? 0);

  // Only the last page's last box is the real tail; on any earlier page the
  // final square just runs off the end of the page.
  const hasMore =
    (rows?.length ?? 0) >= PAGE_SIZE || (queueLen > 0 && offset + (rows?.length ?? 0) < queueLen);

  const aheadOf = (r) => {
    if (r.position == null || !market) return null;
    const d = big(r.position) - big(qHead);
    return d > 0n ? d : 0n;
  };

  return (
    <div className={s.card}>
      <div className={s.cmCardHead}>
        <h3 className={s.cardTitle} style={{ margin: 0 }}>
          The queue
        </h3>
        {!wallet && <KeyHintPill />}
      </div>
      <p className={s.cardDesc}>
        Lenders waiting to fund a block, first-come first-served. Boxes are ordered from
        the head. Yours are filled and ringed; everyone else&rsquo;s are outlined. Click any square
        to open it.
      </p>

      {loading && !rows ? (
        <div className={s.empty}>
          <Spinner /> Loading queue…
        </div>
      ) : error ? (
        <Alert kind="error" title="Could not load the queue">
          {error}
        </Alert>
      ) : rows.length === 0 ? (
        <div className={s.empty}>The queue is empty: a join would activate immediately.</div>
      ) : (
        <>
          {/* Reading order is the queue order, so say so explicitly: the grid
              runs left-to-right and wraps downward, head first. */}
          <div className={s.cmQueueAxis}>
            <span className={`${s.cmQueueEnd} ${s.cmQueueEndHead}`}>
              ▸ Head · #{fmtInt(qHead)} · activates next
            </span>
            {/* Line plus a real glyph arrowhead. A 6px CSS-border triangle on a
                1px rule was technically drawn but far too faint to read as a
                direction, which is the only thing this element is for. */}
            <span className={s.cmQueueFlow} aria-hidden="true">
              <span className={s.cmQueueFlowLine} />
              <span className={s.cmQueueArrow}>▶</span>
            </span>
            <span className={s.cmQueueEnd}>Tail · newest join</span>
          </div>

          <BoxGrid
            items={rows}
            variant="queue"
            getKey={(r) => r.boxId ?? String(r.position)}
            isMine={(r) => myAddrs.has(r.lenderAddress)}
            isHead={(r) => offset === 0 && String(r.position) === String(qHead)}
            isTail={(r) => rows.indexOf(r) === rows.length - 1 && !hasMore}
            cellLabel={(r) =>
              `#${fmtInt(r.position)} · ${fmtErgAmount(r.principalNanoErgs, 3)} ERG · ${fmtInt(
                aheadOf(r) ?? 0n,
              )} ahead`
            }
            renderDetail={(r, close) => {
              const ahead = aheadOf(r);
              const age = joinedAge(Number(r.creationHeight), market?.syncHeight, now);
              const mine = myAddrs.has(r.lenderAddress);
              const tail = rows.indexOf(r) === rows.length - 1 && !hasMore;
              return (
                <>
                  <TileHead
                    title={`#${fmtInt(r.position)}`}
                    badge={
                      <>
                        {/* The tile replaces the square, taking its amber ring
                            with it — say "head" here so it stays identified. */}
                        {String(r.position) === String(qHead) && (
                          <span className={s.feeBadge} title="Activates into the next free slot">
                            head
                          </span>
                        )}
                        {tail && (
                          <span className={s.cmTailBadge} title="Last box in the queue">
                            tail
                          </span>
                        )}
                        {mine && (
                          <span className={s.feeBadge} title="This is you">
                            you
                          </span>
                        )}
                      </>
                    }
                    onClose={close}
                  />
                  <div className={s.cmTileGrid}>
                    <TileField
                      label="Principal"
                      tone="erg"
                      value={`${fmtErgAmount(r.principalNanoErgs, 3)} ERG`}
                    />
                    <TileField
                      label="Permit paid"
                      tone="lit"
                      value={`${fmtTokenAmount(r.permitLit, 9, 2)} LIT`}
                    />
                    <TileField label="Boxes ahead" value={ahead == null ? '—' : fmtInt(ahead)} />
                    <TileField label="Joined" value={age ?? '—'} />
                  </div>
                  <div className={s.cmTileAddr} title={r.lenderAddress}>
                    {shortId(r.lenderAddress, 12, 8)}
                  </div>
                </>
              );
            }}
          />

          <div className={s.cmQueueLegend}>
            <span className={s.cmLegendItem}>
              <span
                className={s.cmLegendSwatch}
                style={{
                  background: 'rgba(168,85,247,.34)',
                  borderColor: '#c084fc',
                }}
              />
              yours
            </span>
            <span className={s.cmLegendItem}>
              <span
                className={s.cmLegendSwatch}
                style={{
                  background: 'rgba(148,163,184,.07)',
                  borderColor: 'rgba(148,163,184,.26)',
                }}
              />
              someone else&rsquo;s
            </span>
            <span className={s.cmLegendItem}>
              <span
                className={s.cmLegendSwatch}
                style={{
                  background: 'rgba(148,163,184,.07)',
                  borderColor: 'rgba(148,163,184,.26)',
                  boxShadow: '0 0 0 2px var(--cur-amber)',
                }}
              />
              amber ring — head
            </span>
            <span className={s.cmLegendItem}>
              <span
                className={s.cmLegendSwatch}
                style={{
                  background: 'rgba(148,163,184,.07)',
                  borderColor: 'rgba(148,163,184,.26)',
                  boxShadow: '0 0 0 2px #38bdf8',
                }}
              />
              cyan ring — tail
            </span>
          </div>
        </>
      )}

      {!error && rows?.length > 0 && (
        <div className={s.cmPager}>
          <span className={s.cmPagerInfo}>
            positions {fmtInt(offset + 1)}–{fmtInt(offset + rows.length)}
            {queueLen > 0 && <> of {fmtInt(queueLen)}</>}
          </span>
          <button
            className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            ← Newer
          </button>
          <button
            className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
            disabled={
              loading || rows.length < PAGE_SIZE || (queueLen > 0 && offset + PAGE_SIZE >= queueLen)
            }
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Older →
          </button>
        </div>
      )}

      {/* Oldest ~500 entries are covered by the scan; beyond that the server simply
          stops answering, so say where the page ends rather than implying more. */}
      {market?.syncHeight != null && (
        <div className={s.cmFootnote}>
          Head of the queue is position #{fmtInt(qHead)}:that box activates into the next free
          slot. Hover a lender for their full address.
        </div>
      )}
    </div>
  );
}
