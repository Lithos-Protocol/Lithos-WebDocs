import React, { useState, useEffect, useCallback } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useCollateral } from './CollarLayout';
import { fmtErgAmount, fmtTokenAmount, fmtInt, shortId } from './format';
import { Alert, Row, Spinner, IdText, KeyHintPill } from './ui';
import BoxGrid, { TileHead, TileField } from './BoxGrid';

export default function ActiveSetPanel() {
  const { market, wallet, tick } = useCollateral();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const size = Number(market?.activeSetSize ?? 0);
  const max = Number(market?.activeSetMax ?? 100);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api
      .getActive({ limit: 100 })
      .then((r) => {
        if (!alive) return;
        // The endpoint answers with a bare array.
        setRows(Array.isArray(r) ? r : (r.entries ?? r.boxes ?? []));
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // The active set only changes when a block lands or a queue head activates,
  // both of which move `activeSetSize` — that is the cheap reload trigger.
  useEffect(load, [load, size, tick]);

  const myAddrs = new Set();
  if (wallet?.primaryAddress) myAddrs.add(wallet.primaryAddress);
  for (const k of wallet?.lenderKeys ?? []) if (k.address) myAddrs.add(k.address);

  /*
   * The dial splits all posted collateral into live and waiting.
   *
   * Measuring both against the slot cap was the obvious first cut, but the cap
   * is small and the set sits full: every free slot is taken the block after it
   * opens, so that dial reads 100% live and 0% queue and says nothing. Against
   * the combined total it always carries the one figure that does move — how
   * much collateral is committed but not yet earning.
   */
  const queueLen = Number(market?.queueLength ?? 0);
  const posted = size + queueLen;
  const pct = posted > 0 ? (size / posted) * 100 : 0;
  const queuePct = posted > 0 ? (queueLen / posted) * 100 : 0;

  return (
    <>
      <div className={s.cols}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Set fill</h3>
          <p className={s.cardDesc}>
            At most {fmtInt(max)} collateral boxes are live at once; every one of them can be spent
            by any miner to make the next Lithos block. The chart shows what portion
            of collateral is usable, along with what is currently locked.
          </p>

          <div className={s.cmGauge}>
            <div
              className={s.cmGaugeRing}
              style={{ '--p': pct, '--q': queuePct }}
              role="img"
              aria-label={`${size} live of ${max} slots, ${queueLen} waiting in the queue`}
            >
              {/* The slot count is pinned at its cap and says nothing; the
                  total posted behind it is the figure that actually moves. */}
              <div className={s.cmGaugeHole}>
                <span className={s.cmGaugeValue}>{fmtInt(posted)}</span>
                <span className={s.cmGaugeLabel}>total collateral</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className={s.summary} style={{ marginTop: 0 }}>
                <Row label="Live collateral boxes" value={fmtInt(size)} accent={size > 0} />
                <Row label="Queue length" value={fmtInt(queueLen)} />
              </div>
              <div className={s.cmGaugeKey}>
                <span className={s.cmLegendItem}>
                  <span className={s.cmGaugeKeyDot} style={{ background: '#38bdf8' }} />
                  live set
                </span>
                <span className={s.cmLegendItem}>
                  <span className={s.cmGaugeKeyDot} style={{ background: '#a855f7' }} />
                  queue waiting
                </span>
              </div>
            </div>
          </div>

          <Alert kind="info">
            When a block spends a live box, its slot frees and the queue&rsquo;s head box activates
            into it. Collateral is processed in order of arrival.
          </Alert>
        </div>

        <div className={s.card}>
          <h3 className={s.cardTitle}>What a slot holds</h3>
          <p className={s.cardDesc}>
            Each live box carries the lender&rsquo;s principal plus everything accumulated on it so
            far.
          </p>
          <div className={s.summary} style={{ marginTop: 0 }}>
            {/* Per-box terms first, then what the whole set adds up to. */}
            <Row
              label="ERG principal"
              value={market ? `${fmtErgAmount(market.principalNanoErgs, 4)} ERG` : '—'}
            />
            <Row
              label="Current permit"
              value={market ? `${fmtTokenAmount(market.currentPermitLit, 9, 2)} LIT` : '—'}
            />
            <Row
              label="Total live collateral"
              value={market ? `${fmtErgAmount(market.activeNanoErgs, 3)} ERG` : '—'}
              accent
            />
            <Row
              label="LIT carried on boxes"
              value={market ? `${fmtTokenAmount(market.permitLitLocked, 9, 3)} LIT` : '—'}
            />
          </div>
          <div className={s.cmFootnote}>
            A live box carries emission LIT and the lender&rsquo;s permit together on-chain, so the
            figure shown includes the total.
          </div>
        </div>
      </div>

      <div className={s.card} style={{ marginTop: '1.25rem' }}>
        <div className={s.cmCardHead}>
          <h3 className={s.cardTitle} style={{ margin: 0 }}>
            Live boxes
          </h3>
          {!wallet && <KeyHintPill />}
        </div>
        <p className={s.cardDesc}>
          One square per live box, newest activations first. Yours are filled and ringed; everyone
          else&rsquo;s are outlined. Click any square to open it.
        </p>

        {loading && !rows ? (
          <div className={s.empty}>
            <Spinner /> Loading the active set…
          </div>
        ) : error ? (
          <Alert kind="error" title="Could not load the active set">
            {error}
          </Alert>
        ) : rows.length === 0 ? (
          <div className={s.empty}>No live collateral yet.</div>
        ) : (
          <>
            <BoxGrid
              items={rows}
              variant="live"
              getKey={(r) => r.boxId}
              isMine={(r) => myAddrs.has(r.lenderAddress)}
              cellLabel={(r) =>
                `${fmtErgAmount(r.valueNanoErgs, 3)} ERG · activated ${fmtInt(r.creationHeight)}`
              }
              renderDetail={(r, close) => {
                const mine = myAddrs.has(r.lenderAddress);
                return (
                  <>
                    <TileHead
                      title={<IdText id={r.boxId} />}
                      badge={
                        mine ? (
                          <span className={s.feeBadge} title="This is you">
                            you
                          </span>
                        ) : null
                      }
                      onClose={close}
                    />
                    <div className={s.cmTileGrid}>
                      <TileField
                        label="Value"
                        tone="erg"
                        value={`${fmtErgAmount(r.valueNanoErgs, 3)} ERG`}
                      />
                      <TileField
                        label="LIT on box"
                        tone="lit"
                        value={
                          r.carriedLit != null ? `${fmtTokenAmount(r.carriedLit, 9, 2)} LIT` : '—'
                        }
                      />
                      <TileField label="Activated" value={fmtInt(r.creationHeight)} />
                      <TileField
                        label="Age"
                        value={
                          market?.syncHeight != null && r.creationHeight != null
                            ? `${fmtInt(Math.max(0, market.syncHeight - Number(r.creationHeight)))} blk`
                            : '—'
                        }
                      />
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
                    background: 'rgba(56,189,248,.34)',
                    borderColor: '#38bdf8',
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
              <span className={s.cmLegendItem}>{fmtInt(rows.length)} shown</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
