import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import pp from './pools.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { fmtErg, fmtInt, fmtPct, parseErg, big, hasAny, lessSlippage } from './format';
import { Alert, TxResult, Row, Spinner, OrderModeToggle, SLIPPAGE_OPTIONS } from './ui';
import OrdersCard, { OrderPlacedResult, lockedInOrders, ORDERS_ANCHOR } from './OrdersPanel';
import { TokenChip } from './PoolTrade';
import { fmtSide, tokenLabel } from './pools';

/** ERG as the pools list names a pool's X side, until that list has answered. */
const ERG_SIDE = { tokenId: 'ERG', name: 'ERG', ticker: 'ERG', decimals: 9, verified: true };

function DepositCard() {
  const { pool, selected: summary, refresh, tick, ordersOn, orderFees, orders, reloadOrders } = useDex();
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
  const tx = summary?.tokenX ?? ERG_SIDE;
  const ty = summary?.tokenY ?? { tokenId: pool?.tokenY, name: pool?.tokenName, decimals: pool?.tokenDecimals };
  const both = (x, y) => `${fmtSide(x, tx)} ${tokenLabel(tx)} + ${fmtSide(y, ty)} ${tokenLabel(ty)}`;
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
        {mode === 'order'
          ? 'A deposit order mints you a provision when a miner fills it. The side the pool cannot match comes back.'
          : 'Enter the ERG side; the client adds the matching token side and mints you a provision straight away.'}
      </p>

      <div className={s.field}>
        <div className={s.fieldHead}>
          <span className={s.fieldLabel}>ERG to deposit</span>
          <span className={s.fieldBalance}>
            {balance
              ? `Balance ${fmtErg(balance.nanoErgs)}${locked > 0n ? ` · ${fmtErg(locked)} in orders` : ''}`
              : hasKey
                ? 'Balance —'
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
          <TokenChip t={tx} />
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

      {q && !order && (
        <div className={s.summary}>
          <Row label="Shares" value={fmtInt(q.direct.shares)} />
          <Row label="Share of the pool" value={fmtPct(q.direct.shareOfSupply, 4)} />
          <Row label="Used" value={both(q.direct.amountX, q.direct.amountY)} accent />
          <Row label="Provision box" value={`${fmtErg(q.direct.provisionBoxValue)} ERG, returned on redeem`} />
          <Row label="ERG out in total" value={`${fmtErg(q.direct.totalErgRequired)} ERG`} />
        </div>
      )}

      {q && order && (
        <div className={s.summary}>
          <Row label="Shares" value={fmtInt(order.shares)} />
          <Row label={`Fewest accepted (${fmtPct(slippage, 1)})`} value={fmtInt(minShares)} accent />
          <Row label="Share of the pool" value={fmtPct(order.shareOfSupply, 4)} />
          <Row label="Offered" value={both(q.direct.amountX, q.direct.amountY)} />
          {hasAny(order.excessX, order.excessY) && (
            <Row label="Returned unused" value={both(order.excessX, order.excessY)} />
          )}
          <Row label="Provision box" value={`${fmtErg(order.provisionBoxValue)} ERG, returned on redeem`} />
          <Row label="Executor fee" value={`${fmtErg(order.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(order.networkFee)} ERG`} />
          <Row label="Locked now" value={`${fmtErg(order.totalErgRequired)} ERG + ${fmtSide(q.direct.amountY, ty)} ${tokenLabel(ty)}`} />
        </div>
      )}

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}

      <button className={s.btn} disabled={!has || !q || quoting || submitting} onClick={submit} type="button">
        {submitting
          ? mode === 'order'
            ? 'Placing…'
            : 'Submitting…'
          : quoting
            ? 'Fetching quote…'
            : mode === 'order'
              ? 'Place deposit order'
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
            ['Offering', both(res.order?.amountX ?? 0, res.order?.amountY ?? 0)],
            ['Fewest shares', fmtInt(res.order?.minShares)],
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
              ['Deposited', both(res.amountX, res.amountY)],
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
  const { pool, selected: summary, refresh, tick, ordersOn, orderFees, reloadOrders, toggleSettings } = useDex();
  const hasKey = api.hasApiKey();
  const [provisions, setProvisions] = useState(null);
  const [listError, setListError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [ackFees, setAckFees] = useState(false);

  const mode = ordersOn ? 'order' : 'direct';
  // The pool's two sides as the pools list names them, so amounts read as they do on every other pool
  const tx = summary?.tokenX ?? ERG_SIDE;
  const ty = summary?.tokenY ?? { tokenId: pool?.tokenY, name: pool?.tokenName, decimals: pool?.tokenDecimals };
  const both = (x, y) => `${fmtSide(x, tx)} ${tokenLabel(tx)} + ${fmtSide(y, ty)} ${tokenLabel(ty)}`;

  const load = useCallback(() => {
    if (!api.hasApiKey()) {
      setProvisions(null);
      return;
    }
    api
      .listProvisions()
      .then((r) => {
        setProvisions(r.provisions ?? []);
        setListError(null);
      })
      .catch((e) => setListError(e.message));
  }, []);

  useEffect(load, [load, tick, hasKey]);

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
        setResult({ mode, data: r, q });
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

  let body;
  if (!hasKey) {
    body = (
      <div className={s.empty}>
        Your provisions need an API key.{' '}
        <button className={s.linkBtn} onClick={toggleSettings} type="button">
          Open settings
        </button>
      </div>
    );
  } else if (provisions === null) {
    body = listError ? (
      <Alert kind="error" title="Could not read your provisions">
        {listError}
      </Alert>
    ) : (
      <div className={s.empty}>
        <Spinner /> Reading your provisions…
      </div>
    );
  } else if (provisions.length === 0) {
    body = <div className={s.empty}>No provisions on this pool.</div>;
  } else {
    body = (
      <div className={pp.provList} role="radiogroup" aria-label="Your provisions">
        {provisions.map((x) => {
          // In a redeem order, the owner NFT is locked away: nothing can act on
          // the provision until that order fills or is cancelled.
          const inOrder = !!x.redeemOrderBoxId;
          return (
            <label
              key={x.boxId}
              className={`${pp.prov} ${selected === x.boxId ? pp.provActive : ''} ${inOrder ? pp.provLocked : ''}`}
              title={`Provision ${x.boxId}`}
            >
              <input
                type="radio"
                name="prov-canonical"
                checked={selected === x.boxId}
                disabled={inOrder}
                onChange={() => {
                  setSelected(x.boxId);
                  setResult(null);
                }}
              />
              <span className={pp.provMain}>
                <span className={pp.provShares}>{fmtInt(x.shares)} shares</span>
                <span className={pp.provSub}>{fmtPct(x.shareOfSupply, 4)} of the pool</span>
              </span>
              <span className={pp.provFees}>
                {inOrder ? (
                  <a className={pp.provSub} href={`#${ORDERS_ANCHOR}`}>
                    closing: a redeem order holds its NFT
                  </a>
                ) : (
                  <>
                    <span>{both(x.claimableX, x.claimableY)}</span>
                    <span className={pp.provSub}>fees claimable now</span>
                  </>
                )}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className={s.card}>
      <h3 className={s.cardTitle}>Remove liquidity</h3>
      <p className={s.cardDesc}>
        {mode === 'order'
          ? 'Placing the order claims what the vault owes the provision first. Fees still unflushed when it fills are forfeited.'
          : 'Closing a provision returns its share of the reserves straight away. Fees it has not claimed are lost with the box.'}
      </p>
      {body}

      {q && mode === 'direct' && (
        <div className={s.summary}>
          <Row label="Returns" value={both(q.amountX, q.amountY)} accent />
          {!q.withinMinSupply && <Row label="Status" value="The pool refuses to close its last shares" />}
        </div>
      )}

      {q && mode === 'order' && (
        <div className={s.summary}>
          <Row label="Returns" value={both(q.receivedX, q.amountY)} accent />
          <Row label="Claimed first" value={both(q.claimableX, q.claimableY)} />
          {hasUnflushed && <Row label="Lost when it fills" value={both(q.unflushedX, q.unflushedY)} />}
          <Row label="Executor fee" value={`${fmtErg(q.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(q.networkFee)} ERG`} />
          {!q.withinMinSupply && <Row label="Status" value="The pool refuses to close its last shares" />}
        </div>
      )}

      {/* Direct: unclaimed fees die with the box, so losing them takes an explicit tick. */}
      {hasUnclaimed && (
        <Alert kind="warn" title="Unclaimed fees on this provision">
          {both(q.unclaimedX, q.unclaimedY)} is still owed to it. Redeeming spends the box and
          <strong> destroys them</strong>. Claim from the Fees tab first to keep them.
          <label className={s.ackRow}>
            <input type="checkbox" checked={ackFees} onChange={(e) => setAckFees(e.target.checked)} />
            <span>Redeem anyway and give up these fees</span>
          </label>
        </Alert>
      )}

      {/* Order: only unflushed fees are at stake, and no flag exists for them; a flush first saves them. */}
      {hasUnflushed && (
        <Alert kind="warn" title="Unflushed fees are lost when this order fills">
          A <Link to="/dex/flush">flush</Link> first moves them into the vault, and placing the order then claims
          them.
        </Alert>
      )}

      <button
        className={s.btn}
        disabled={!selected || !q || quoting || submitting || q?.withinMinSupply === false || (hasUnclaimed && !ackFees)}
        onClick={submit}
        type="button"
      >
        {submitting
          ? mode === 'order'
            ? 'Placing…'
            : 'Submitting…'
          : quoting
            ? 'Fetching quote…'
            : mode === 'order'
              ? 'Place redeem order'
              : hasUnclaimed && !ackFees
                ? 'Confirm fee loss to continue'
                : 'Redeem provision'}
      </button>

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}
      {error && (
        <Alert kind="error" title={mode === 'order' ? 'Order not placed' : 'Redemption failed'}>
          {error}
        </Alert>
      )}

      {res && result.mode === 'order' && (
        <OrderPlacedResult
          result={res}
          rows={[
            ...(result.q ? [['Returns', both(result.q.receivedX, result.q.amountY)]] : []),
            // Only present when the placement had settled fees to claim.
            ...(res.claimedX != null || res.claimedY != null
              ? [['Claimed now', both(res.claimedX ?? 0, res.claimedY ?? 0)]]
              : []),
          ]}
        />
      )}

      {res && result.mode === 'direct' && (
        <TxResult
          title="Provision redeemed"
          outcome={res.outcome}
          rows={[
            ['Returned', both(res.amountX, res.amountY)],
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
