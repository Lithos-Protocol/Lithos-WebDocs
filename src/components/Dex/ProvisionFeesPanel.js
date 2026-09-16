import React, { useState, useEffect, useCallback } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import { ORDERS_ANCHOR } from './OrdersPanel';
import * as api from './api';
import { useDex } from './DexLayout';
import { fmtErgMin, fmtTokenMin, fmtInt, fmtPct, big, hasAny } from './format';
import { Alert, TxResult, Row, Spinner, IdText } from './ui';

export default function ProvisionFeesPanel() {
  const { pool, vault, refresh, tick } = useDex();
  const [provisions, setProvisions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [msg, setMsg] = useState({});

  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';

  const load = useCallback(() => {
    setLoading(true);
    api
      .listProvisions()
      .then((r) => setProvisions(r.provisions ?? []))
      .catch(() => setProvisions([]))
      .finally(() => setLoading(false));
  }, [tick]);

  useEffect(load, [load]);

  const claim = async (boxId) => {
    setBusy((b) => ({ ...b, [boxId]: true }));
    setMsg((m) => ({ ...m, [boxId]: null }));
    try {
      const r = await api.claimProvision(boxId, {
        expectedProvisionBoxId: boxId,
        expectedVaultBoxId: vault?.utxoId,
      });
      setMsg((m) => ({ ...m, [boxId]: { ok: true, data: r } }));
      // A claim replaces the provision box, so every id on screen is now stale.
      load();
      refresh();
    } catch (e) {
      const stale = e.name === 'StateChangedError';
      setMsg((m) => ({
        ...m,
        [boxId]: {
          ok: false,
          error: stale
            ? 'The vault or provision moved and nothing was sent. The list has been reloaded.'
            : e.message,
        },
      }));
      if (stale) {
        load();
        refresh();
      }
    } finally {
      setBusy((b) => ({ ...b, [boxId]: false }));
    }
  };

  // Totals across every provision.
  const totals = (provisions ?? []).reduce(
    (a, p) => ({
      accruedX: a.accruedX + big(p.accruedX),
      accruedY: a.accruedY + big(p.accruedY),
      claimableX: a.claimableX + big(p.claimableX),
      claimableY: a.claimableY + big(p.claimableY),
      unflushedX: a.unflushedX + big(p.unflushedX),
      unflushedY: a.unflushedY + big(p.unflushedY),
    }),
    {
      accruedX: 0n,
      accruedY: 0n,
      claimableX: 0n,
      claimableY: 0n,
      unflushedX: 0n,
      unflushedY: 0n,
    },
  );

  const anyUnflushed = totals.unflushedX > 0n || totals.unflushedY > 0n;

  return (
    <>
      {/* ---- TOTALS ---- */}
      <div className={s.card}>
        <h3 className={s.cardTitle}>Outstanding permanent fees</h3>
        <p className={s.cardDesc}>
          Permanent fees are your share of fixed value swap fees the pool collects. Unlike the
          liquidity itself, they are not exposed to impermanent loss. Fees are proportioned by your
          liquidity, and assigned to each provision.
        </p>
        <p className={s.cardDesc}>
          <strong>Earned</strong> is the total amount your provisions have accrued in the pool.{' '}
          <strong>Claimable</strong> represents the value your provisions can take from the vault
          right now.
        </p>

        {loading ? (
          <div className={s.empty}>
            <Spinner /> Loading provisions…
          </div>
        ) : (
          <div className={s.totalsGrid}>
            <div className={s.totalCard}>
              <div className={s.totalLabel}>Earned</div>
              <div className={s.totalValue}>{fmtErgMin(totals.accruedX, 4)}</div>
              <div className={s.totalSub}>ERG</div>
              <div className={s.totalValueAlt}>{fmtTokenMin(totals.accruedY, dec, 4)}</div>
              <div className={s.totalSub}>{name}</div>
            </div>
            <div className={`${s.totalCard} ${s.totalCardOk}`}>
              <div className={s.totalLabel}>Claimable now</div>
              <div className={s.totalValue}>{fmtErgMin(totals.claimableX, 4)}</div>
              <div className={s.totalSub}>ERG</div>
              <div className={s.totalValueAlt}>{fmtTokenMin(totals.claimableY, dec, 4)}</div>
              <div className={s.totalSub}>{name}</div>
            </div>
            <div className={`${s.totalCard} ${anyUnflushed ? s.totalCardWarn : ''}`}>
              <div className={s.totalLabel}>Awaiting flush</div>
              <div className={s.totalValue}>{fmtErgMin(totals.unflushedX, 4)}</div>
              <div className={s.totalSub}>ERG</div>
              <div className={s.totalValueAlt}>{fmtTokenMin(totals.unflushedY, dec, 4)}</div>
              <div className={s.totalSub}>{name}</div>
            </div>
          </div>
        )}

        {anyUnflushed && (
          <Alert kind="info">
            Some of what you have earned has not reached the vault yet. Anyone can trigger a flush
            from the Flush page, it costs only the network fee and settles every provider at once.
          </Alert>
        )}
      </div>

      {/* ---- PER PROVISION ---- */}
      <div className={s.card} style={{ marginTop: '1.25rem' }}>
        <h3 className={s.cardTitle}>By provision</h3>
        <p className={s.cardDesc}>
          Each provision settles independently against its own entry accumulator. Claiming moves the
          entry up to the vault's current accumulator without touching your share.
        </p>

        {loading ? (
          <div className={s.empty}>
            <Spinner /> Loading…
          </div>
        ) : provisions?.length ? (
          <div className={s.list}>
            {provisions.map((p) => {
              const m = msg[p.boxId];
              const hasUnflushed = big(p.unflushedX) > 0n || big(p.unflushedY) > 0n;
              // Its owner NFT is in a redeem order: nothing can act on it until
              // that order fills or is cancelled, whatever canClaim says.
              const inOrder = !!p.redeemOrderBoxId;
              return (
                <div key={p.boxId} className={`${s.item} ${s.itemStatic}`}>
                  <div className={s.itemHead}>
                    <span className={s.itemHeadLeft}>
                      <IdText id={p.boxId} />
                      {inOrder && (
                        <span className={s.orderBadge} title={`Order box ${p.redeemOrderBoxId}`}>
                          <span className={s.orderBadgeDot} />
                          redeem order open
                        </span>
                      )}
                      {!inOrder && hasAny(p.accruedX, p.accruedY) && (
                        <span className={s.feeBadge} title="Has unclaimed permanent fees">
                          <span className={s.feeBadgeDot} />
                          unclaimed fees
                        </span>
                      )}
                    </span>
                    <span className={s.itemShare}>{fmtPct(p.shareOfSupply, 4)} of pool</span>
                  </div>

                  <div className={s.itemGrid}>
                    <div className={s.itemCell}>
                      <div className={s.itemCellLabel}>Shares</div>
                      <div className={s.itemCellValue}>{fmtInt(p.shares)}</div>
                    </div>
                    <div className={s.itemCell}>
                      <div className={s.itemCellLabel}>Earned ERG</div>
                      <div className={s.itemCellValue}>{fmtErgMin(p.accruedX)}</div>
                    </div>
                    <div className={s.itemCell}>
                      <div className={s.itemCellLabel}>Claimable ERG</div>
                      <div className={`${s.itemCellValue} ${s.valueOk}`}>
                        {fmtErgMin(p.claimableX)}
                      </div>
                    </div>
                    <div className={s.itemCell}>
                      <div className={s.itemCellLabel}>Awaiting flush</div>
                      <div className={`${s.itemCellValue} ${hasUnflushed ? s.valueWarn : ''}`}>
                        {fmtErgMin(p.unflushedX)}
                      </div>
                    </div>
                    <div className={s.itemCell}>
                      <div className={s.itemCellLabel}>Earned {name}</div>
                      <div className={s.itemCellValue}>{fmtTokenMin(p.accruedY, dec)}</div>
                    </div>
                    <div className={s.itemCell}>
                      <div className={s.itemCellLabel}>Claimable {name}</div>
                      <div className={`${s.itemCellValue} ${s.valueOk}`}>
                        {fmtTokenMin(p.claimableY, dec)}
                      </div>
                    </div>
                  </div>

                  <div className={s.summary}>
                    <Row label="Owner NFT" value={p.ownerNFT} />
                    <Row label="Entry accX" value={p.entryX} />
                    <Row label="Entry accY" value={p.entryY} />
                    <Row label="Opened at" value={`Block ${fmtInt(p.createdHeight)}`} />
                  </div>

                  <div className={s.btnRow}>
                    <button
                      className={s.btn}
                      disabled={inOrder || !p.canClaim || busy[p.boxId]}
                      onClick={() => claim(p.boxId)}
                    >
                      {busy[p.boxId]
                        ? 'Claiming…'
                        : inOrder
                          ? 'In a redeem order'
                          : p.canClaim
                            ? 'Claim settled permanent fees'
                            : p.awaitingFlush
                              ? 'Waiting on the next flush'
                              : 'Nothing settled yet'}
                    </button>
                  </div>

                  {inOrder && (
                    <Alert kind="info" title="Redeem order open">
                      This provision's owner NFT is held by a redeem order, so it cannot be claimed
                      until that order fills or is cancelled. Any fees already settled were claimed
                      when the order was placed.{' '}
                      <Link to={`/dex/liquidity#${ORDERS_ANCHOR}`}>View the order</Link>
                    </Alert>
                  )}

                  {/* awaitingFlush is normal right after a deposit or resize, not an error. */}
                  {!inOrder && !p.canClaim && p.awaitingFlush && (
                    <Alert kind="info">
                      This provision has earned fees, but none have reached the vault yet. Anyone
                      can trigger a flush from the Flush page to make them claimable.
                    </Alert>
                  )}

                  {m && !m.ok && (
                    <Alert kind="error" title="Claim failed">
                      {m.error}
                    </Alert>
                  )}
                  {m?.ok && (
                    <TxResult
                      title="Permanent fees claimed"
                      outcome={m.data.outcome}
                      rows={[
                        ['ERG claimed', `${fmtErgMin(m.data.claimedX)} ERG`],
                        [`${name} claimed`, `${fmtTokenMin(m.data.claimedY, dec)} ${name}`],
                        ['New provision box', m.data.successorBoxId],
                      ]}
                      txId={m.data.txId}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={s.empty}>No open provisions.</div>
        )}
      </div>
    </>
  );
}
