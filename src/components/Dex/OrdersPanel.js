import React, { useState } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { fmtErg, fmtToken, fmtInt, fmtBlocks, shortId, big } from './format';
import { Alert, Spinner, TxResult, GearIcon } from './ui';

/** Fragment id of the Your orders card, for "View in Your orders" links. */
export const ORDERS_ANCHOR = 'your-orders';

/*
 * How each status reads. Only PENDING and OPEN can be cancelled: the other two
 * already have an unconfirmed transaction spending the order.
 */
const STATUS = {
  PENDING: { label: 'Placing', cls: 'orderStatusWait', unconfirmed: true, cancellable: true },
  OPEN: { label: 'Open', cls: 'orderStatusOpen', unconfirmed: false, cancellable: true },
  FILLING: { label: 'Filling', cls: 'orderStatusFill', unconfirmed: true, cancellable: false },
  CANCELLING: { label: 'Cancelling', cls: 'orderStatusCancel', unconfirmed: true, cancellable: false },
};

const TYPE_LABEL = { SWAP: 'Swap', DEPOSIT: 'Deposit', REDEEM: 'Redeem' };

/**
 * ERG and pool tokens sitting in this wallet's orders.
 *
 * `/wallet/balances` counts neither: they left the wallet when the order was
 * placed. Tokens come from the terms — a token-selling swap locks `amountIn`, a
 * deposit locks `amountY` — while a redeem order holds only its owner NFT.
 */
export function lockedInOrders(orders) {
  let nanoErgs = 0n;
  let tokens = 0n;
  for (const o of orders ?? []) {
    nanoErgs += big(o.value);
    if (o.type === 'SWAP' && o.ergIn === false) tokens += big(o.amountIn);
    if (o.type === 'DEPOSIT') tokens += big(o.amountY);
  }
  return { nanoErgs, tokens };
}

/** An order's terms in one line: what goes in, and the floor it will accept. */
function termsOf(o, dec, name) {
  if (o.type === 'SWAP') {
    return o.ergIn
      ? `${fmtErg(o.amountIn)} ERG → ≥ ${fmtToken(o.minOutput, dec)} ${name}`
      : `${fmtToken(o.amountIn, dec)} ${name} → ≥ ${fmtErg(o.minOutput)} ERG`;
  }
  if (o.type === 'DEPOSIT') {
    return `${fmtErg(o.amountX)} ERG + ${fmtToken(o.amountY, dec)} ${name} → ≥ ${fmtInt(
      o.minShares,
    )} shares`;
  }
  // REDEEM: the provision box can be missing while it moves; the NFT cannot.
  return o.provisionBoxId
    ? `Close provision ${shortId(o.provisionBoxId, 6, 6)}`
    : `Close provision (NFT ${shortId(o.ownerNFT, 6, 6)})`;
}

/** What a cancel hands back, for the confirmation. */
function returnsOf(o, dec, name) {
  const parts = [`${fmtErg(o.value)} ERG`];
  if (o.type === 'SWAP' && o.ergIn === false) parts.push(`${fmtToken(o.amountIn, dec)} ${name}`);
  if (o.type === 'DEPOSIT') parts.push(`${fmtToken(o.amountY, dec)} ${name}`);
  if (o.type === 'REDEEM') parts.push('the provision owner NFT');
  return parts.join(' + ');
}

/**
 * Result banner for a placement. An order is not a trade: it fills when a miner
 * executes it, so this never reads as done, and it points at where to follow it.
 */
export function OrderPlacedResult({ result, rows, children, ordersHref }) {
  const order = result?.order;
  return (
    <TxResult title="Order placed" rows={rows} txId={result?.txId} outcome={result?.outcome}>
      <div className={s.txNote}>
        It fills when a miner executes it, not now.{' '}
        {ordersHref ? (
          <Link to={ordersHref}>Follow it in Your orders</Link>
        ) : (
          <a href={`#${ORDERS_ANCHOR}`}>Follow it in Your orders ↓</a>
        )}
      </div>
      {order && order.fillableNow === false && (
        <div className={s.txNoteWarn}>
          It would not fill against the pool as it stands, so it will wait. Cancel it from Your orders
          to place it again at the current price.
        </div>
      )}
      {children}
    </TxResult>
  );
}

function StatusCell({ o }) {
  const st = STATUS[o.status] ?? { label: o.status, cls: 'orderStatusOpen' };
  return (
    <span className={s.orderStatusCell}>
      <span className={`${s.orderStatus} ${s[st.cls]}`}>
        {st.unconfirmed && <span className={s.orderStatusDot} />}
        {st.label}
      </span>
      {st.unconfirmed && <span className={s.orderSub}>unconfirmed</span>}
      {o.fillableNow === false && (
        <span
          className={s.orderWaiting}
          title="The pool cannot meet this order's minimum right now. It waits until that changes, or cancel it and place again at the current price."
        >
          Waiting for price
        </span>
      )}
    </span>
  );
}

function CancelResult({ r, tokenY, dec, name }) {
  const tokens = (r.returnedTokens ?? []).map((t) =>
    t.tokenId === tokenY ? `${fmtToken(t.amount, dec)} ${name}` : `${fmtInt(t.amount)} × ${shortId(t.tokenId, 6, 4)}`,
  );
  return (
    <TxResult
      title="Cancel sent"
      outcome={r.outcome}
      txId={r.txId}
      rows={[
        ['Returned', [`${fmtErg(r.returnedNanoErgs)} ERG`, ...tokens].join(' + ')],
        ['Network fee', `${fmtErg(r.networkFee)} ERG`],
      ]}
    >
      <div className={s.txNote}>
        The order shows Cancelling until this confirms. A fill sent before the cancel can still
        confirm first, in which case the cancel is dropped and the order fills instead.
      </div>
    </TxResult>
  );
}

/**
 * Your orders: every outstanding order this wallet owns, with cancel.
 *
 * Reads the list DexLayout already holds, so it refreshes on the same tick as
 * provisions. It also reloads after anything done here, since an order changes
 * status without anything else on the page moving.
 */
export default function OrdersCard() {
  const { pool, orders, ordersError, ordersLoading, reloadOrders, toggleSettings } = useDex();
  const [confirming, setConfirming] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [outcome, setOutcome] = useState(null); // { boxId, ok, data | error }

  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';
  const height = pool?.syncHeight;
  const hasKey = api.hasApiKey();

  const cancel = async (o) => {
    setCancelling(o.boxId);
    setOutcome(null);
    try {
      const r = await api.cancelOrder(o.boxId);
      setOutcome({ boxId: o.boxId, ok: true, data: r });
    } catch (e) {
      setOutcome({
        boxId: o.boxId,
        ok: false,
        error:
          e.status === 409
            ? 'An unconfirmed transaction is already filling or cancelling this order, so nothing was sent. The list has been re-read.'
            : e.message,
      });
    } finally {
      setCancelling(null);
      setConfirming(null);
      // 200 moves it to CANCELLING; 409 means it already moved. Either way re-read.
      reloadOrders();
    }
  };

  const anyWaiting = (orders ?? []).some((o) => o.fillableNow === false);

  let body;
  if (!hasKey) {
    body = (
      <div className={s.empty}>
        Your orders need an API key: the list names this wallet's funds.{' '}
        <button className={s.linkBtn} onClick={toggleSettings} type="button">
          Open settings
        </button>
      </div>
    );
  } else if (orders === null) {
    body = ordersError ? (
      <Alert kind="error" title="Could not load your orders">
        {ordersError}
      </Alert>
    ) : (
      <div className={s.empty}>
        <Spinner /> Loading your orders…
      </div>
    );
  } else if (orders.length === 0) {
    body = <div className={s.empty}>No outstanding orders.</div>;
  } else {
    body = (
      <div className={s.orderTableWrap}>
        <div className={s.orderTable} role="table" aria-label="Your orders">
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
            const st = STATUS[o.status];
            const canCancel = !!st?.cancellable;
            const age =
              o.placedHeight != null && height != null ? fmtBlocks(height - o.placedHeight) : null;
            const res = outcome?.boxId === o.boxId ? outcome : null;
            return (
              <React.Fragment key={o.boxId}>
                <div className={s.orderRow} role="row">
                  <span className={`${s.orderType} ${s[`orderType${o.type}`] ?? ''}`}>
                    {TYPE_LABEL[o.type] ?? o.type}
                  </span>
                  <span className={s.orderTerms} title={`Order box ${o.boxId}`}>
                    {termsOf(o, dec, name)}
                  </span>
                  <span className={s.orderFee}>{fmtErg(o.executorFee)} ERG</span>
                  <StatusCell o={o} />
                  <span
                    className={s.orderAge}
                    title={o.placedHeight != null ? `Placed at block ${fmtInt(o.placedHeight)}` : 'Placement not yet confirmed'}
                  >
                    {age ?? '—'}
                  </span>
                  <span className={s.orderAction}>
                    <button
                      className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                      type="button"
                      disabled={!canCancel || cancelling === o.boxId}
                      title={
                        canCancel
                          ? 'Return this order’s funds to your wallet'
                          : 'An unconfirmed transaction is already spending this order'
                      }
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
                        Returns {returnsOf(o, dec, name)} to your wallet. The network fee comes out of
                        the order when it holds enough ERG, otherwise out of your wallet.
                      </div>
                    </div>
                    <div className={s.orderConfirmBtns}>
                      <button
                        className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                        type="button"
                        onClick={() => setConfirming(null)}
                      >
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
                      <CancelResult r={res.data} tokenY={pool?.tokenY} dec={dec} name={name} />
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

  // A cancel whose order has already left the list still deserves its receipt.
  const orphan =
    outcome && !(orders ?? []).some((o) => o.boxId === outcome.boxId) ? outcome : null;

  return (
    <div className={`${s.card} ${s.ordersCard}`} id={ORDERS_ANCHOR}>
      <div className={s.ordersHead}>
        <div>
          <h3 className={s.cardTitle}>
            Your orders
            {orders?.length ? <span className={s.ordersCount}>{orders.length}</span> : null}
          </h3>
          <p className={s.cardDesc} style={{ marginBottom: 0 }}>
            Outstanding orders from this wallet, unconfirmed placements included. An order leaves
            the list once the transaction filling or cancelling it confirms.
          </p>
        </div>
        {hasKey ? (
          <button
            className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
            type="button"
            onClick={reloadOrders}
            disabled={ordersLoading}
          >
            {ordersLoading ? 'Reading…' : 'Reload'}
          </button>
        ) : (
          <button
            className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
            type="button"
            onClick={toggleSettings}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <GearIcon />
            Settings
          </button>
        )}
      </div>

      {orders !== null && ordersError && (
        <Alert kind="warn" title="Showing the last list read">
          {ordersError}
        </Alert>
      )}

      {body}

      {orphan &&
        (orphan.ok ? (
          <CancelResult r={orphan.data} tokenY={pool?.tokenY} dec={dec} name={name} />
        ) : (
          <Alert kind="error" title="Cancel failed">
            {orphan.error}
          </Alert>
        ))}

      {anyWaiting && (
        <Alert kind="info">
          Orders marked <strong>Waiting for price</strong> would not fill against the pool as it
          stands. They stay open until the price comes back to them, or you can cancel and place
          again at the current price.
        </Alert>
      )}
    </div>
  );
}
