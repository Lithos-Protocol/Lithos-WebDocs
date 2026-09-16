import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import {
  fmtErg,
  fmtToken,
  fmtErgMin,
  fmtTokenMin,
  fmtInt,
  fmtPct,
  parseErg,
  big,
  hasAny,
  lessSlippage,
  shortId,
} from './format';
import {
  Alert,
  TxResult,
  Row,
  AssetChip,
  Spinner,
  IdText,
  OrderModeToggle,
  SLIPPAGE_OPTIONS,
} from './ui';
import OrdersCard, { OrderPlacedResult, lockedInOrders, ORDERS_ANCHOR } from './OrdersPanel';

function DepositCard() {
  const { pool, refresh, tick, ordersOn, orderFees, orders, reloadOrders } = useDex();
  /* `hasApiKey()` is a module read, not state, but it is read during render —
     so this flips false->true on the re-render Settings triggers and the
     balance loads once a key exists. The balance is a display; the quote below
     still never moves on its own. */
  const hasKey = api.hasApiKey();
  const [ergAmount, setErgAmount] = useState('');
  const [slippage, setSlippage] = useState(0.005);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(null);

  const loadBalance = () =>
    api
      .getWalletBalances()
      .then(setBalance)
      .catch(() => setBalance(null));

  useEffect(() => {
    loadBalance();
  }, [tick, hasKey]);

  const mode = ordersOn ? 'order' : 'direct';
  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';
  const raw = parseErg(ergAmount);
  const has = raw !== null && raw > 0n;

  // The API quotes by `shares`, or by BOTH sides — a one-sided availableX is
  // rejected, matching LDLiquidityPool.simDeposit. The user only enters ERG, so
  // convert to shares here with the same flooring division the pool uses:
  //   shares = availableX * supply / reservesX
  const shares = has && pool ? (raw * big(pool.supply)) / big(pool.reservesX) : null;

  const seq = useRef(0);
  useEffect(() => {
    // Not clearing `result` here — see SwapPanel: submitting clears the amount
    // and refreshes the pool, which would retrigger this and drop the tx id.
    setError(null);
    if (!has || !pool) {
      setQuote(null);
      setQuoteErr(null);
      return undefined;
    }
    if (shares !== null && shares <= 0n) {
      setQuote(null);
      setQuoteErr('Deposit is too small to buy a single LP share.');
      setQuoting(false);
      return undefined;
    }
    const id = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        // Both modes start from the balanced pair for these shares. An order then
        // offers exactly that pair, so its excess is only whatever the pool moves.
        const direct = await api.checkDeposit({ shares: shares.toString() });
        const order =
          mode === 'order'
            ? await api.checkDepositOrder({ amountX: direct.amountX, amountY: direct.amountY })
            : null;
        if (seq.current === id) {
          setQuote({ mode, direct, order });
          setQuoteErr(null);
        }
      } catch (e) {
        if (seq.current === id) {
          setQuote(null);
          setQuoteErr(e.message);
        }
      } finally {
        if (seq.current === id) setQuoting(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [shares?.toString(), pool, has, mode, orderFees?.executorFee, orderFees?.maxMinerFee]);

  const q = quote && quote.mode === mode ? quote : null;
  const order = q?.order ?? null;

  // A deposit order's only protection against a pool moved earlier in the same
  // block. Floored like every other bound, but never below one share: zero would
  // be refused, and would protect nothing if it were not.
  const minShares = order ? (() => {
    const v = lessSlippage(order.shares, slippage);
    return v < 1n ? 1n : v;
  })() : null;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'order') {
        const r = await api.placeDepositOrder({
          amountX: q.direct.amountX,
          amountY: q.direct.amountY,
          minShares: minShares.toString(),
        });
        setResult({ mode, data: r });
        setErgAmount('');
        setQuote(null);
        reloadOrders();
        loadBalance();
      } else {
        const r = await api.deposit({
          shares: q.direct.shares,
          // Cap the cost at the quote so a pool that moves mid-flight cannot charge
          // more than was shown. 1% headroom absorbs the contract's ceiling rounding.
          maxAmountX: ((big(q.direct.amountX) * 101n) / 100n).toString(),
          maxAmountY: ((big(q.direct.amountY) * 101n) / 100n).toString(),
          expectedPoolBoxId: pool?.utxoId,
        });
        setResult({ mode, data: r });
        setErgAmount('');
        setQuote(null);
        refresh();
        loadBalance();
      }
    } catch (e) {
      if (e.name === 'StateChangedError') {
        setError('The pool moved and nothing was sent. Re-enter an amount for a fresh quote.');
        refresh();
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const locked = orders ? lockedInOrders(orders).nanoErgs : 0n;
  const res = result?.data;

  return (
    <div className={s.card}>
      <h3 className={s.cardTitle}>Add liquidity</h3>
      <p className={s.cardDesc}>
        Deposit a balanced pair and receive a provision box recording your share and the accumulator
        you entered at. You earn compounding liquidity and permanent fees.
      </p>

      <div className={s.field}>
        <div className={s.fieldHead}>
          <span className={s.fieldLabel}>ERG to deposit</span>
          <span className={s.fieldBalance}>
            {balance
              ? `Balance: ${fmtErg(balance.nanoErgs)}${
                  locked > 0n ? ` · ${fmtErg(locked)} in orders` : ''
                }`
              : hasKey
                ? 'Balance: —'
                : 'Balance hidden · set an API key'}
          </span>
        </div>
        <div className={s.fieldRow}>
          <input
            className={s.input}
            inputMode="decimal"
            placeholder="0.0"
            value={ergAmount}
            onChange={(e) => {
              setErgAmount(e.target.value);
              setResult(null);
            }}
          />
          <AssetChip isErg tokenName={name} />
        </div>
        <div className={s.chips}>
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <button
              key={p}
              className={s.chip}
              onClick={() =>
                balance &&
                setErgAmount(
                  fmtErg((big(balance.nanoErgs) * BigInt(Math.round(p * 1000))) / 1000n, 6).replace(
                    /,/g,
                    '',
                  ),
                )
              }
            >
              {p === 1 ? 'MAX' : `${p * 100}%`}
            </button>
          ))}
        </div>
      </div>

      {/* The direct deposit keeps its fixed 1% cost cap; only the order form has a
          floor the reader sets. */}
      {mode === 'order' && (
        <div className={s.chips} style={{ marginTop: 16 }}>
          <span className={s.fieldLabel} style={{ marginRight: 4 }}>
            Slippage
          </span>
          {SLIPPAGE_OPTIONS.map((v) => (
            <button
              key={v}
              className={`${s.chip} ${slippage === v ? s.chipActive : ''}`}
              onClick={() => setSlippage(v)}
              type="button"
            >
              {fmtPct(v, v < 0.01 ? 1 : 0)}
            </button>
          ))}
        </div>
      )}

      {quoting && (
        <div className={s.summary}>
          <Spinner /> <span className={s.rowLabel}>Quoting deposit…</span>
        </div>
      )}

      {q && !quoting && !order && (
        <div className={s.summary}>
          <Row label="LP shares" value={fmtInt(q.direct.shares)} accent />
          <Row label="ERG required" value={`${fmtErg(q.direct.amountX)} ERG`} />
          <Row label={`${name} required`} value={`${fmtToken(q.direct.amountY, dec)} ${name}`} />
          <Row label="Provision box value" value={`${fmtErg(q.direct.provisionBoxValue)} ERG`} />
          <Row label="Total ERG out" value={`${fmtErg(q.direct.totalErgRequired)} ERG`} accent />
          <Row label="Share of pool" value={fmtPct(q.direct.shareOfSupply, 4)} />
        </div>
      )}

      {q && !quoting && order && (
        <div className={s.summary}>
          <Row label="LP shares" value={fmtInt(order.shares)} accent />
          <Row label={`Minimum shares (${fmtPct(slippage, 1)})`} value={fmtInt(minShares)} accent />
          <Row label="ERG offered" value={`${fmtErg(q.direct.amountX)} ERG`} />
          <Row label={`${name} offered`} value={`${fmtToken(q.direct.amountY, dec)} ${name}`} />
          <Row
            label="Returned if unmatched"
            value={`${fmtErg(order.excessX)} ERG · ${fmtToken(order.excessY, dec)} ${name}`}
          />
          <Row label="Provision box value" value={`${fmtErg(order.provisionBoxValue)} ERG`} />
          <Row label="Executor fee" value={`${fmtErg(order.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(order.networkFee)} ERG`} />
          <Row
            label="Locked now"
            value={`${fmtErg(order.totalErgRequired)} ERG + ${fmtToken(q.direct.amountY, dec)} ${name}`}
          />
          <Row label="Returned with the fill" value={`${fmtErg(order.ergReturned)} ERG`} />
          <Row label="Share of pool" value={fmtPct(order.shareOfSupply, 4)} />
        </div>
      )}

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}

      <button className={s.btn} disabled={!has || !q || quoting || submitting} onClick={submit}>
        {submitting
          ? mode === 'order'
            ? 'Placing…'
            : 'Submitting…'
          : mode === 'order'
            ? 'Place order'
            : 'Deposit liquidity'}
      </button>

      {error && (
        <Alert kind="error" title={mode === 'order' ? 'Order not placed' : 'Deposit failed'}>
          {error}
        </Alert>
      )}

      {res && result.mode === 'order' && (
        <OrderPlacedResult
          result={res}
          rows={[
            ['ERG offered', `${fmtErg(res.order?.amountX)} ERG`],
            [`${name} offered`, `${fmtToken(res.order?.amountY, dec)} ${name}`],
            ['Minimum shares', fmtInt(res.order?.minShares)],
            ['Executor fee', `${fmtErg(res.order?.executorFee)} ERG`],
          ]}
        >
          <div className={s.txNote}>
            When it fills, the owner NFT for the new provision arrives in your wallet, along with
            anything the pool did not take. The NFT is the key to that liquidity: keep it safe.
          </div>
        </OrderPlacedResult>
      )}

      {res && result.mode === 'direct' && (
        <>
          <TxResult
            title="Liquidity deposited"
            outcome={res.outcome}
            rows={[
              ['Shares', fmtInt(res.shares)],
              ['ERG deposited', `${fmtErg(res.amountX)} ERG`],
              [`${name} deposited`, `${fmtToken(res.amountY, dec)} ${name}`],
              ['Owner NFT', res.ownerNFT],
              ['Provision box', res.provisionBoxId],
            ]}
            txId={res.txId}
          />
          <Alert kind="info" title="Keep the owner NFT">
            The owner NFT is the key to your liquidity provision. Losing or burning it is equivalent
            to losing the value you deposited and fees you gained. Ensure that it is kept safe so
            that you can access your liquidity again in the future.
          </Alert>
        </>
      )}
    </div>
  );
}

function RedeemCard() {
  const { pool, refresh, tick, ordersOn, orderFees, reloadOrders } = useDex();
  const [provisions, setProvisions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [ackFees, setAckFees] = useState(false);

  const mode = ordersOn ? 'order' : 'direct';
  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';

  const load = useCallback(() => {
    setLoading(true);
    api
      .listProvisions()
      .then((r) => setProvisions(r.provisions ?? []))
      .catch(() => setProvisions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, tick]);

  // A provision that went into a redeem order (here or elsewhere) can no longer be
  // redeemed; one that vanished has been closed. Either way, drop the selection.
  useEffect(() => {
    if (!selected || !provisions) return;
    const p = provisions.find((x) => x.boxId === selected);
    if (!p || p.redeemOrderBoxId) setSelected(null);
  }, [provisions, selected]);

  useEffect(() => {
    setError(null);
    setQuoteErr(null);
    setAckFees(false); // a new selection must be acknowledged on its own terms
    if (!selected) {
      setQuote(null);
      return undefined;
    }
    let alive = true;
    setQuoting(true);
    const check =
      mode === 'order'
        ? api.checkRedeemOrder({ provisionBoxId: selected })
        : api.checkRedeem({ provisionBoxId: selected });
    check
      .then((r) => alive && setQuote({ mode, data: r }))
      .catch((e) => {
        if (!alive) return;
        setQuote(null);
        setQuoteErr(e.message);
        // 409: the provision moved. The list holds a dead id; re-read it.
        if (e.name === 'StateChangedError') load();
      })
      .finally(() => alive && setQuoting(false));
    return () => {
      alive = false;
    };
  }, [selected, mode, orderFees?.executorFee, orderFees?.maxMinerFee]);

  const q = quote && quote.mode === mode ? quote.data : null;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      if (mode === 'order') {
        const r = await api.placeRedeemOrder({ provisionBoxId: selected });
        setResult({ mode, data: r });
        setSelected(null);
        setQuote(null);
        // The provision now reports its redeem order, and the placement may have
        // claimed fees from the vault.
        load();
        reloadOrders();
        refresh();
      } else {
        const r = await api.redeem({
          provisionBoxId: selected,
          expectedPoolBoxId: pool?.utxoId,
          // The API refuses a redemption that would destroy unclaimed fees unless
          // this is set. Only send it once the user has ticked the confirmation.
          acknowledgeUnclaimedFees: ackFees || undefined,
        });
        setResult({ mode, data: r });
        setSelected(null);
        setQuote(null);
        setAckFees(false);
        load();
        refresh();
      }
    } catch (e) {
      if (e.name === 'StateChangedError') {
        setError(
          mode === 'order'
            ? 'The vault or provision moved and nothing was sent. Reloading; select it again.'
            : 'The pool or provision moved and nothing was sent. Reloading; select it again.',
        );
        setSelected(null);
        load();
        refresh();
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasUnclaimed = mode === 'direct' && q && hasAny(q.unclaimedX, q.unclaimedY);
  const hasUnflushed = mode === 'order' && q && hasAny(q.unflushedX, q.unflushedY);
  const res = result?.data;

  return (
    <div className={s.card}>
      <h3 className={s.cardTitle}>Remove liquidity</h3>
      <p className={s.cardDesc}>
        {mode === 'order'
          ? 'A redeem order closes a provision when a miner fills it. Settled fees are claimed as the order is placed.'
          : 'Closing a provision returns its share of the reserves. Permanent fees settle against the vault separately. Claim them first, or they are lost when the box is spent.'}
      </p>

      {loading && provisions === null ? (
        <div className={s.empty}>
          <Spinner /> Loading provisions…
        </div>
      ) : provisions?.length ? (
        <div className={s.list}>
          {provisions.map((p) => {
            // In a redeem order, the owner NFT is locked away: nothing can act on
            // the provision until that order fills or is cancelled.
            const inOrder = !!p.redeemOrderBoxId;
            // Anything earned but not yet claimed is forfeited when the box is
            // spent — including the part still waiting on a flush. Flag on the
            // full accrued amount, not just what the vault can pay today.
            const owed = !inOrder && hasAny(p.accruedX, p.accruedY);
            return (
              <div
                key={p.boxId}
                className={`${s.item} ${selected === p.boxId ? s.itemActive : ''} ${
                  owed ? s.itemFlagged : ''
                } ${inOrder ? s.itemLocked : ''}`}
                aria-disabled={inOrder || undefined}
                onClick={() => {
                  if (inOrder) return;
                  setSelected(selected === p.boxId ? null : p.boxId);
                  setResult(null);
                }}
              >
                <div className={s.itemHead}>
                  <span className={s.itemHeadLeft}>
                    <IdText id={p.boxId} />
                    {inOrder && (
                      <span className={s.orderBadge} title={`Order box ${p.redeemOrderBoxId}`}>
                        <span className={s.orderBadgeDot} />
                        redeem order open
                      </span>
                    )}
                    {owed && (
                      <span
                        className={s.feeBadge}
                        title="This provision has unclaimed permanent fees: redeeming forfeits them"
                      >
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
                    <div className={s.itemCellLabel}>Unclaimed ERG</div>
                    <div className={`${s.itemCellValue} ${owed ? s.valueWarn : ''}`}>
                      {fmtErgMin(p.accruedX)} ERG
                    </div>
                  </div>
                  <div className={s.itemCell}>
                    <div className={s.itemCellLabel}>Unclaimed {name}</div>
                    <div className={`${s.itemCellValue} ${owed ? s.valueWarn : ''}`}>
                      {fmtTokenMin(p.accruedY, dec)} {name}
                    </div>
                  </div>
                  <div className={s.itemCell}>
                    <div className={s.itemCellLabel}>Opened at</div>
                    <div className={s.itemCellValue}>{fmtInt(p.createdHeight)}</div>
                  </div>
                </div>
                {inOrder && (
                  <div className={s.itemNote}>
                    Cannot be claimed or redeemed until the order fills or is cancelled.{' '}
                    <a href={`#${ORDERS_ANCHOR}`} onClick={(e) => e.stopPropagation()}>
                      View the order ↓
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>No open provisions.</div>
      )}

      {quoting && (
        <div className={s.summary}>
          <Spinner /> <span className={s.rowLabel}>Quoting redemption…</span>
        </div>
      )}

      {q && !quoting && mode === 'direct' && (
        <div className={s.summary}>
          <Row label="Shares closed" value={fmtInt(q.shares)} />
          <Row label="ERG returned" value={`${fmtErg(q.amountX)} ERG`} accent />
          <Row label={`${name} returned`} value={`${fmtToken(q.amountY, dec)} ${name}`} accent />
          {!q.withinMinSupply && (
            <Row label="Blocked" value="Would take supply under CONST_MIN_SUPPLY" />
          )}
        </div>
      )}

      {q && !quoting && mode === 'order' && (
        <div className={s.summary}>
          <Row label="Shares closed" value={fmtInt(q.shares)} />
          <Row label="ERG received" value={`${fmtErg(q.receivedX)} ERG`} accent />
          <Row label={`${name} received`} value={`${fmtToken(q.amountY, dec)} ${name}`} accent />
          <Row
            label="Fees claimed now"
            value={`${fmtErgMin(q.claimableX)} ERG · ${fmtTokenMin(q.claimableY, dec)} ${name}`}
          />
          <Row
            label="Fees lost when it fills"
            value={`${fmtErgMin(q.unflushedX)} ERG · ${fmtTokenMin(q.unflushedY, dec)} ${name}`}
          />
          <Row label="Executor fee" value={`${fmtErg(q.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(q.networkFee)} ERG`} />
          <Row label="Locked now" value={`${fmtErg(q.totalErgRequired)} ERG + owner NFT`} />
          {!q.withinMinSupply && (
            <Row label="Blocked" value="Would take supply under CONST_MIN_SUPPLY" />
          )}
        </div>
      )}

      {/* Direct: unclaimed fees die with the box, so losing them takes an explicit tick. */}
      {hasUnclaimed && (
        <Alert kind="warn" title="Unclaimed permanent fees on this provision">
          This provision still has {fmtErgMin(q.unclaimedX)} ERG and{' '}
          {fmtTokenMin(q.unclaimedY, dec)} {name} owed to it. Redeeming spends the box and
          <strong> destroys them</strong>. Claim from the Fees page first to keep them.
          <label className={s.ackRow}>
            <input
              type="checkbox"
              checked={ackFees}
              onChange={(e) => setAckFees(e.target.checked)}
            />
            <span>Redeem anyway and give up these fees</span>
          </label>
        </Alert>
      )}

      {/* Order: settled fees are claimed at placement, so only unflushed ones — and
          whatever accrues while the order waits — are at stake. No acknowledge flag
          exists for these; the form's job is to show them before the send. */}
      {q && !quoting && mode === 'order' && (
        <Alert
          kind={hasUnflushed ? 'warn' : 'info'}
          title={hasUnflushed ? 'Unflushed fees are lost when this order fills' : undefined}
        >
          {hasUnflushed ? (
            <>
              {fmtErgMin(q.unflushedX)} ERG and {fmtTokenMin(q.unflushedY, dec)} {name} have been
              earned but not yet flushed to the vault, so the placement cannot claim them. A{' '}
              <Link to="/dex/flush">flush</Link> first moves them into the vault, and placing the
              order then claims them. Fees earned while the order waits are lost as well.
            </>
          ) : (
            <>
              Settled fees are claimed when the order is placed. Fees the provision earns while the
              order waits are lost when it fills.
            </>
          )}
        </Alert>
      )}

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}

      <button
        className={`${s.btn} ${s.btnPurple}`}
        disabled={
          !selected ||
          !q ||
          quoting ||
          submitting ||
          q?.withinMinSupply === false ||
          (hasUnclaimed && !ackFees)
        }
        onClick={submit}
      >
        {submitting
          ? mode === 'order'
            ? 'Placing…'
            : 'Submitting…'
          : mode === 'order'
            ? 'Place order'
            : hasUnclaimed && !ackFees
              ? 'Confirm fee loss to continue'
              : 'Redeem provision'}
      </button>

      {error && (
        <Alert kind="error" title={mode === 'order' ? 'Order not placed' : 'Redemption failed'}>
          {error}
        </Alert>
      )}

      {res && result.mode === 'order' && (
        <OrderPlacedResult
          result={res}
          rows={[
            // Shortened: a full 64-char id wraps and squeezes its label onto two lines.
            [
              'Provision',
              shortId(res.order?.provisionBoxId ?? res.order?.ownerNFT, 10, 10),
            ],
            // Only present when the placement had settled fees to claim.
            ...(res.claimedX != null || res.claimedY != null
              ? [
                  [
                    'Fees claimed',
                    `${fmtErgMin(res.claimedX ?? 0)} ERG · ${fmtTokenMin(res.claimedY ?? 0, dec)} ${name}`,
                  ],
                ]
              : []),
            ['Executor fee', `${fmtErg(res.order?.executorFee)} ERG`],
          ]}
        />
      )}

      {res && result.mode === 'direct' && (
        <TxResult
          title="Provision redeemed"
          outcome={res.outcome}
          rows={[
            ['ERG returned', `${fmtErg(res.amountX)} ERG`],
            [`${name} returned`, `${fmtToken(res.amountY, dec)} ${name}`],
            ['Shares closed', fmtInt(res.shares)],
          ]}
          txId={res.txId}
        />
      )}
    </div>
  );
}

export default function LiquidityPanel() {
  const { ordersOn, setOrdersOn } = useDex();
  return (
    <>
      {/* One switch for both cards: deposit and redeem always agree on the mode. */}
      <div className={s.modeBar}>
        <OrderModeToggle checked={ordersOn} onChange={setOrdersOn} />
        <span className={s.modeBarText}>
          {ordersOn
            ? 'Deposits and redemptions are placed as orders that any miner fills for a small executor fee. Claims stay direct.'
            : 'Deposits and redemptions spend the pool directly. A miner batching orders may replace an unconfirmed direct spend, which then has to be resent.'}
        </span>
      </div>

      <div className={s.cols}>
        <DepositCard />
        <RedeemCard />
      </div>

      <OrdersCard />
    </>
  );
}
