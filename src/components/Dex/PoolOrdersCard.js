import React, { useEffect, useState } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { fmtErg, fmtInt, fmtBlocks, shortId } from './format';
import { Alert, Spinner, TxResult } from './ui';
import { ORDERS_ANCHOR, STATUS, TYPE_LABEL, StatusCell } from './OrdersPanel';
import { fmtSideFull, tokenLabel } from './pools';

/** An order's terms in one line, in the pool's own token names. */
function termsOf(o, pool) {
  const { tokenX: tx, tokenY: ty } = pool;
  const amt = (raw, t) => `${fmtSideFull(raw, t)} ${tokenLabel(t)}`;
  if (o.type === 'SWAP') {
    // ERG/token orders say which way with ergIn; token/token ones name the token sold
    const xIn = o.tokenIn ? o.tokenIn === tx.tokenId : o.ergIn !== false;
    const [tin, tout] = xIn ? [tx, ty] : [ty, tx];
    return `${amt(o.amountIn, tin)} → ≥ ${amt(o.minOutput, tout)}`;
  }
  if (o.type === 'DEPOSIT') return `${amt(o.amountX, tx)} + ${amt(o.amountY, ty)} → ≥ ${fmtInt(o.minShares)} shares`;
  return o.provisionBoxId
    ? `Close provision ${shortId(o.provisionBoxId, 6, 6)}`
    : `Close provision (NFT ${shortId(o.ownerNFT, 6, 6)})`;
}

function CancelResult({ r, pool }) {
  const sides = [pool.tokenX, pool.tokenY];
  const tokens = (r.returnedTokens ?? []).map((t) => {
    const side = sides.find((x) => x.tokenId === t.tokenId);
    return side ? `${fmtSideFull(t.amount, side)} ${tokenLabel(side)}` : `${fmtInt(t.amount)} × ${shortId(t.tokenId, 6, 4)}`;
  });
  return (
    <TxResult
      title="Cancel sent"
      outcome={r.outcome}
      txId={r.txId}
      rows={[
        ['Returned', [`${fmtErg(r.returnedNanoErgs)} ERG`, ...tokens].join(' + ')],
        ['Network fee', `${fmtErg(r.networkFee)} ERG`],
      ]}
    />
  );
}

/**
 * This wallet's outstanding orders on one pool, with cancel. Re-read on the page's tick, after anything placed
 * here (`version`), and after a cancel.
 */
export default function PoolOrdersCard({ pool, version }) {
  const { tick, pool: canonical, toggleSettings } = useDex();
  const hasKey = api.hasApiKey();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [confirming, setConfirming] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    if (!hasKey) {
      setOrders(null);
      return undefined;
    }
    let live = true;
    setLoading(true);
    api
      .listPoolOrders(pool.poolNFT)
      .then((r) => {
        if (!live) return;
        setOrders(r.orders ?? []);
        setError(null);
      })
      // The last good list stays: the endpoint never answers partially
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [pool.poolNFT, tick, version, reload, hasKey]);

  const cancel = async (o) => {
    setCancelling(o.boxId);
    setOutcome(null);
    try {
      setOutcome({ boxId: o.boxId, ok: true, data: await api.cancelOrder(o.boxId) });
    } catch (e) {
      setOutcome({
        boxId: o.boxId,
        ok: false,
        error:
          e.status === 409
            ? 'An unconfirmed transaction is already filling or cancelling this order, so nothing was sent.'
            : e.message,
      });
    } finally {
      setCancelling(null);
      setConfirming(null);
      setReload((n) => n + 1);
    }
  };

  const height = canonical?.syncHeight;

  let body;
  if (!hasKey) {
    body = (
      <div className={s.empty}>
        Your orders need an API key.{' '}
        <button className={s.linkBtn} onClick={toggleSettings} type="button">
          Open settings
        </button>
      </div>
    );
  } else if (orders === null) {
    body = error ? (
      <Alert kind="error" title="Could not load your orders">
        {error}
      </Alert>
    ) : (
      <div className={s.empty}>
        <Spinner /> Loading your orders…
      </div>
    );
  } else if (orders.length === 0) {
    body = <div className={s.empty}>No outstanding orders on this pool.</div>;
  } else {
    body = (
      <div className={s.orderTableWrap}>
        <div className={s.orderTable} role="table" aria-label="Your orders on this pool">
          <div className={`${s.orderRow} ${s.orderHeadRow}`} role="row">
            <span role="columnheader">Type</span>
            <span role="columnheader">Terms</span>
            <span role="columnheader">Executor fee</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className={s.orderAgeHead}>
              Age
            </span>
            <span role="columnheader" />
          </div>
          {orders.map((o) => {
            const canCancel = !!STATUS[o.status]?.cancellable;
            const age = o.placedHeight != null && height != null ? fmtBlocks(height - o.placedHeight) : null;
            const res = outcome?.boxId === o.boxId ? outcome : null;
            return (
              <React.Fragment key={o.boxId}>
                <div className={s.orderRow} role="row">
                  <span className={`${s.orderType} ${s[`orderType${o.type}`] ?? ''}`}>{TYPE_LABEL[o.type] ?? o.type}</span>
                  <span className={s.orderTerms} title={`Order box ${o.boxId}`}>
                    {termsOf(o, pool)}
                  </span>
                  <span className={s.orderFee}>{fmtErg(o.executorFee)} ERG</span>
                  <StatusCell o={o} />
                  <span className={s.orderAge}>{age ?? '—'}</span>
                  <span className={s.orderAction}>
                    <button
                      className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                      type="button"
                      disabled={!canCancel || cancelling === o.boxId}
                      onClick={() => {
                        setOutcome(null);
                        setConfirming(confirming === o.boxId ? null : o.boxId);
                      }}
                    >
                      {cancelling === o.boxId ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </span>
                </div>
                {confirming === o.boxId && canCancel && (
                  <div className={s.orderConfirm}>
                    <div>
                      <div className={s.orderConfirmTitle}>Cancel this order?</div>
                      <div className={s.orderConfirmBody}>
                        Returns its ERG and tokens to your wallet. The network fee comes out of the order when it holds
                        enough ERG, otherwise out of your wallet.
                      </div>
                    </div>
                    <div className={s.orderConfirmBtns}>
                      <button className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} type="button" onClick={() => setConfirming(null)}>
                        Keep order
                      </button>
                      <button
                        className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                        type="button"
                        disabled={cancelling === o.boxId}
                        onClick={() => cancel(o)}
                      >
                        Cancel order
                      </button>
                    </div>
                  </div>
                )}
                {res && (
                  <div className={s.orderResult}>
                    {res.ok ? (
                      <CancelResult r={res.data} pool={pool} />
                    ) : (
                      <Alert kind="error" title="Cancel failed">
                        {res.error}
                      </Alert>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  const orphan = outcome && !(orders ?? []).some((o) => o.boxId === outcome.boxId) ? outcome : null;

  return (
    <div className={`${s.card} ${s.ordersCard}`} id={ORDERS_ANCHOR}>
      <div className={s.ordersHead}>
        <div>
          <h3 className={s.cardTitle}>
            Your orders
            {orders?.length ? <span className={s.ordersCount}>{orders.length}</span> : null}
          </h3>
          <p className={s.cardDesc} style={{ marginBottom: 0 }}>
            Outstanding orders from this wallet on this pool, unconfirmed placements included.
          </p>
        </div>
        {hasKey && (
          <button
            className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
            type="button"
            onClick={() => setReload((n) => n + 1)}
            disabled={loading}
          >
            {loading ? 'Reading…' : 'Reload'}
          </button>
        )}
      </div>
      {orders !== null && error && (
        <Alert kind="warn" title="Showing the last list read">
          {error}
        </Alert>
      )}
      {body}
      {orphan &&
        (orphan.ok ? (
          <CancelResult r={orphan.data} pool={pool} />
        ) : (
          <Alert kind="error" title="Cancel failed">
            {orphan.error}
          </Alert>
        ))}
    </div>
  );
}
