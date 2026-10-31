import React, { useEffect, useRef, useState } from 'react';
import s from './styles.module.css';
import p from './pools.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { big, fmtErg, fmtInt, fmtPct, lessSlippage, ratio } from './format';
import { Alert, IdText, ImpactValue, OrderModeToggle, Row, Spinner, TxResult, SLIPPAGE_OPTIONS } from './ui';
import { OrderPlacedResult } from './OrdersPanel';
import TokenIcon from '../Wallet/TokenIcon';
import { decimalsOf, fmtPrice, fmtSide, fmtSideFull, matchSide, parseSide, tokenLabel } from './pools';

/** One side of the pool as a chip: its icon and label. */
export function TokenChip({ t }) {
  return (
    <span className={p.tokenChip}>
      <TokenIcon tokenId={t?.tokenId} label={t?.ticker ?? t?.name} size={20} />
      {tokenLabel(t)}
    </span>
  );
}

/** What the wallet holds of one side, from `/wallet/balances`; null without a key. */
export function heldOf(balance, t) {
  if (!balance || !t) return null;
  if (t.tokenId === 'ERG') return big(balance.nanoErgs);
  return big(balance.tokens?.find((x) => x.tokenId === t.tokenId)?.amount ?? 0);
}

/** Calls `quote` 320 ms after its inputs settle, keeping only the newest answer. */
function useQuote(enabled, deps, quote) {
  const [state, setState] = useState({ quote: null, error: null, quoting: false });
  const seq = useRef(0);
  useEffect(() => {
    if (!enabled) {
      setState({ quote: null, error: null, quoting: false });
      return undefined;
    }
    const id = ++seq.current;
    setState((st) => ({ ...st, quoting: true }));
    const t = setTimeout(() => {
      quote()
        .then((q) => seq.current === id && setState({ quote: q, error: null, quoting: false }))
        .catch((e) => seq.current === id && setState({ quote: null, error: e.message, quoting: false }));
    }, 320);
    return () => clearTimeout(t);
  }, deps);
  return state;
}

function SlippageChips({ value, onChange }) {
  return (
    <div className={s.chips} style={{ marginTop: 16 }}>
      <span className={s.fieldLabel} style={{ marginRight: 4 }}>
        Slippage
      </span>
      {SLIPPAGE_OPTIONS.map((v) => (
        <button
          key={v}
          className={`${s.chip} ${value === v ? s.chipActive : ''}`}
          onClick={() => onChange(v)}
          type="button"
        >
          {fmtPct(v, v < 0.01 ? 1 : 0)}
        </button>
      ))}
    </div>
  );
}

function BalanceChips({ held, t, onPick }) {
  if (held === null) return null;
  return (
    <div className={s.chips}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <button
          key={f}
          className={s.chip}
          type="button"
          onClick={() =>
            onPick(fmtSideFull((held * BigInt(Math.round(f * 1000))) / 1000n, t).replace(/,/g, ''))
          }
        >
          {f === 1 ? 'MAX' : `${f * 100}%`}
        </button>
      ))}
    </div>
  );
}

const balanceText = (held, t) =>
  held === null ? (api.hasApiKey() ? 'Balance —' : 'Balance hidden · set an API key') : `Balance ${fmtSideFull(held, t)}`;

/**
 * Consent to trade with a pool nobody vetted, given on the card that places the order. A verified pool needs
 * none; a pool that can be drained takes no order at all.
 */
function Consent({ pool, checked, onChange }) {
  if (pool.verified) return null;
  const strangers = [pool.tokenX, pool.tokenY].filter((t) => !t.verified).map(tokenLabel);
  return (
    <label className={p.consent}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      I understand this pool is not on the verified list
      {strangers.length === 1 && `, and that the name ${strangers[0]} was chosen by whoever minted it`}
      {strangers.length === 2 && `, and that the names ${strangers.join(' and ')} were chosen by whoever minted them`}.
    </label>
  );
}

/** Locked now: the order box's ERG and every token it holds. */
function lockedText(q, pool) {
  const sides = [pool.tokenX, pool.tokenY];
  const tokens = (q.tokensRequired ?? []).map((t) => {
    const side = sides.find((x) => x.tokenId === t.tokenId);
    return `${fmtSideFull(t.amount, side)} ${tokenLabel(side)}`;
  });
  return [`${fmtErg(q.totalErgRequired)} ERG`, ...tokens].join(' + ');
}

/** A swap on any pool, either direction: an order any miner fills, or a direct spend of the pool. */
export function PoolSwapCard({ pool, balance, unsafe, onPlaced }) {
  const [xIn, setXIn] = useState(true);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.005);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { orderFees, ordersOn, setOrdersOn, refresh } = useDex();

  const tin = xIn ? pool.tokenX : pool.tokenY;
  const tout = xIn ? pool.tokenY : pool.tokenX;
  const raw = parseSide(amount, tin);
  const hasAmount = raw !== null && raw > 0n;

  const { quote: q, error: quoteErr, quoting } = useQuote(
    hasAmount,
    [raw?.toString(), xIn, ordersOn, pool.poolNFT, pool.utxoId, orderFees?.executorFee, orderFees?.maxMinerFee],
    () =>
      (ordersOn ? api.checkPoolSwap : api.checkPoolDirectSwap)(pool.poolNFT, {
        tokenIn: tin.tokenId,
        amountIn: raw.toString(),
      }).then((r) => ({ ...r, ordersOn })),
  );
  // A quote fetched in the other mode describes the other kind of swap
  const qq = q && q.ordersOn === ordersOn ? q : null;

  const netOut = qq ? big(ordersOn ? qq.netOutput : qq.amountOut) : null;
  const minRecv = qq ? lessSlippage(netOut, slippage) : null;
  const unfillable = !!qq && (netOut <= 0n || minRecv <= 0n);
  // The least input that buys the same output; anything above it buys nothing more
  const least = qq?.minAmountIn ? big(qq.minAmountIn) : null;
  const surplus = least !== null && hasAmount && least < raw ? raw - least : 0n;
  const rate = qq && hasAmount
    ? ratio(big(qq.amountOut) * 10n ** BigInt(decimalsOf(tin)), raw * 10n ** BigInt(decimalsOf(tout)), 12)
    : null;
  const held = heldOf(balance, tin);
  const blocked = unsafe || (!pool.verified && !consent);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const body = {
        tokenIn: tin.tokenId,
        amountIn: raw.toString(),
        minOutput: minRecv.toString(),
        acknowledgeUnverified: pool.verified ? undefined : true,
      };
      const r = ordersOn
        ? await api.placePoolSwap(pool.poolNFT, body)
        : await api.placePoolDirectSwap(pool.poolNFT, { ...body, expectedPoolBoxId: qq.poolBoxId });
      setResult({ r, ordersOn, tin, tout, amountIn: raw, minOutput: minRecv, fee: qq.executorFee });
      setAmount('');
      setConsent(false);
      onPlaced();
      if (!ordersOn) refresh();
    } catch (e) {
      if (e.name === 'StateChangedError') {
        setError('The pool moved and nothing was sent. The quote has been refreshed.');
        refresh();
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={s.card}>
      <div className={p.cardHeadRow}>
        <h3 className={s.cardTitle}>Swap</h3>
        <OrderModeToggle
          checked={ordersOn}
          onChange={(on) => {
            setOrdersOn(on);
            setResult(null);
          }}
        />
      </div>

      <div className={s.field}>
        <div className={s.fieldHead}>
          <span className={s.fieldLabel}>You pay</span>
          <span className={s.fieldBalance}>{balanceText(held, tin)}</span>
        </div>
        <div className={s.fieldRow}>
          <input
            className={s.input}
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setResult(null);
            }}
          />
          <TokenChip t={tin} />
        </div>
        <BalanceChips held={held} t={tin} onPick={setAmount} />
      </div>

      <div className={p.flipRow}>
        <button
          className={p.flipBtn}
          type="button"
          onClick={() => {
            setXIn((v) => !v);
            setAmount('');
            setResult(null);
          }}
          aria-label="Switch swap direction"
        >
          ↓↑
        </button>
      </div>

      <div className={`${s.field} ${s.fieldPurple}`}>
        <div className={s.fieldHead}>
          <span className={s.fieldLabel}>
            {ordersOn && tout.tokenId === 'ERG' ? 'You receive (estimated, after executor fee)' : 'You receive (estimated)'}
          </span>
          <span className={s.fieldBalance}>{quoting && <Spinner />}</span>
        </div>
        <div className={s.fieldRow}>
          <input className={s.input} value={qq ? fmtSideFull(netOut, tout) : ''} placeholder="0.0" disabled readOnly />
          <TokenChip t={tout} />
        </div>
      </div>

      <SlippageChips value={slippage} onChange={setSlippage} />

      {surplus > 0n && (
        <div className={p.hint}>
          {fmtSideFull(surplus, tin)} {tokenLabel(tin)} of this buys nothing more: the pool rounds to whole units of{' '}
          {tokenLabel(tout)}.{' '}
          <button className={s.linkBtn} type="button" onClick={() => setAmount(fmtSideFull(least, tin).replace(/,/g, ''))}>
            Pay {fmtSideFull(least, tin)} instead
          </button>
        </div>
      )}

      {qq && (
        <div className={s.summary}>
          {rate !== null && (
            <Row label="Execution price" value={`1 ${tokenLabel(tin)} ≈ ${fmtPrice(rate)} ${tokenLabel(tout)}`} />
          )}
          <Row
            label={`Minimum received (${fmtPct(slippage, 1)})`}
            value={`${fmtSideFull(minRecv, tout)} ${tokenLabel(tout)}`}
            accent
          />
          <Row label="Price impact" value={<ImpactValue impact={qq.priceImpact} />} />
          <Row label="Permanent fee" value={`${fmtSideFull(qq.protocolFee, tin)} ${tokenLabel(tin)}`} />
          <Row label="AMM fee" value={`${fmtSideFull(qq.ammFee, tin)} ${tokenLabel(tin)}`} />
          {ordersOn ? (
            <>
              <Row label="Executor fee" value={`${fmtErg(qq.executorFee)} ERG`} />
              <Row label="Network fee" value={`${fmtErg(qq.networkFee)} ERG`} />
              <Row label="Locked now" value={lockedText(qq, pool)} />
              <Row label="Returned with the fill" value={`${fmtErg(qq.ergReturned)} ERG`} />
            </>
          ) : (
            <Row label="Network fee" value={`${fmtErg(qq.networkFee)} ERG`} />
          )}
          {!qq.executable && <Row label="Status" value="Not executable at this size" />}
          {qq.executable && unfillable && <Row label="Status" value="Output does not cover the executor fee" />}
        </div>
      )}

      {!unsafe && <Consent pool={pool} checked={consent} onChange={setConsent} />}

      <button
        className={s.btn}
        disabled={!hasAmount || !qq || !qq.executable || unfillable || quoting || submitting || blocked}
        onClick={submit}
        type="button"
      >
        {submitting ? (ordersOn ? 'Placing…' : 'Swapping…') : quoting ? 'Fetching quote…' : ordersOn ? 'Place order' : 'Swap'}
      </button>

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}
      {error && (
        <Alert kind="error" title={ordersOn ? 'Order not placed' : 'Swap not sent'}>
          {error}
        </Alert>
      )}
      {result && result.ordersOn && (
        <OrderPlacedResult
          result={result.r}
          rows={[
            ['Selling', `${fmtSideFull(result.amountIn, result.tin)} ${tokenLabel(result.tin)}`],
            ['Minimum received', `${fmtSideFull(result.minOutput, result.tout)} ${tokenLabel(result.tout)}`],
            ['Executor fee', `${fmtErg(result.fee)} ERG`],
          ]}
        />
      )}
      {result && !result.ordersOn && (
        <TxResult
          title="Swap sent"
          outcome={result.r.outcome}
          txId={result.r.txId}
          rows={[
            ['Sold', `${fmtSideFull(result.amountIn, result.tin)} ${tokenLabel(result.tin)}`],
            ['Received', `${fmtSideFull(result.r.amountY, result.tout)} ${tokenLabel(result.tout)}`],
          ]}
        />
      )}
    </div>
  );
}

/** A deposit on any pool, as an order or directly. With "Balanced" on, typing one side fills in the other at the pool's ratio. */
export function PoolDepositCard({ pool, balance, unsafe, onPlaced }) {
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [balanced, setBalanced] = useState(true);
  const [slippage, setSlippage] = useState(0.005);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { orderFees, ordersOn, refresh } = useDex();

  const { tokenX: tx, tokenY: ty } = pool;
  const rawX = parseSide(amountX, tx);
  const rawY = parseSide(amountY, ty);
  const ready = rawX !== null && rawX > 0n && rawY !== null && rawY > 0n;
  const full = pool.provTokensLeft === '0';

  const { quote: q, error: quoteErr, quoting } = useQuote(
    ready && !full,
    [rawX?.toString(), rawY?.toString(), ordersOn, pool.poolNFT, pool.utxoId, orderFees?.executorFee, orderFees?.maxMinerFee],
    () =>
      (ordersOn ? api.checkPoolDeposit : api.checkPoolDirectDeposit)(pool.poolNFT, {
        amountX: rawX.toString(),
        amountY: rawY.toString(),
      }).then((r) => ({ ...r, ordersOn })),
  );
  const qq = q && q.ordersOn === ordersOn ? q : null;

  const setSide = (fromX, text) => {
    setResult(null);
    (fromX ? setAmountX : setAmountY)(text);
    if (!balanced) return;
    const raw = parseSide(text, fromX ? tx : ty);
    const other = raw && raw > 0n ? fmtSideFull(matchSide(raw, pool, fromX), fromX ? ty : tx).replace(/,/g, '') : '';
    (fromX ? setAmountY : setAmountX)(other);
  };

  const minShares = qq ? lessSlippage(big(qq.shares), slippage) : null;
  const blocked = unsafe || full || (!pool.verified && !consent);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const body = {
        amountX: rawX.toString(),
        amountY: rawY.toString(),
        minShares: minShares.toString(),
        acknowledgeUnverified: pool.verified ? undefined : true,
      };
      const r = ordersOn
        ? await api.placePoolDeposit(pool.poolNFT, body)
        : await api.placePoolDirectDeposit(pool.poolNFT, { ...body, expectedPoolBoxId: qq.poolBoxId });
      setResult({ r, ordersOn, rawX, rawY, minShares });
      setAmountX('');
      setAmountY('');
      setConsent(false);
      onPlaced();
      if (!ordersOn) refresh();
    } catch (e) {
      if (e.name === 'StateChangedError') {
        setError('The pool moved and nothing was sent. The quote has been refreshed.');
        refresh();
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const field = (t, value, fromX) => {
    const held = heldOf(balance, t);
    return (
      <div className={`${s.field} ${fromX ? '' : s.fieldPurple}`}>
        <div className={s.fieldHead}>
          <span className={s.fieldLabel}>{tokenLabel(t)} to deposit</span>
          <span className={s.fieldBalance}>{balanceText(held, t)}</span>
        </div>
        <div className={s.fieldRow}>
          <input
            className={s.input}
            inputMode="decimal"
            placeholder="0.0"
            value={value}
            onChange={(e) => setSide(fromX, e.target.value)}
          />
          <TokenChip t={t} />
        </div>
        <BalanceChips held={held} t={t} onPick={(v) => setSide(fromX, v)} />
      </div>
    );
  };

  const both = (x, y) => `${fmtSide(x, tx)} ${tokenLabel(tx)} + ${fmtSide(y, ty)} ${tokenLabel(ty)}`;

  return (
    <div className={s.card}>
      <div className={p.cardHeadRow}>
        <h3 className={s.cardTitle}>Add liquidity</h3>
        <label className={p.inlineCheck} title="Fill in the other side at the pool's current ratio">
          <input type="checkbox" checked={balanced} onChange={(e) => setBalanced(e.target.checked)} />
          Balanced
        </label>
      </div>
      <p className={s.cardDesc}>
        {ordersOn
          ? 'A deposit order mints you a provision when a miner fills it. The side the pool cannot match comes back.'
          : 'A direct deposit mints the provision and its owner NFT at once. The side the pool cannot match stays in the wallet.'}
      </p>

      {full && (
        <Alert kind="warn" title="This pool takes no more deposits">
          It has handed out every provision token it was created with.
        </Alert>
      )}

      <div className={p.stack}>
        {field(tx, amountX, true)}
        {field(ty, amountY, false)}
      </div>

      <SlippageChips value={slippage} onChange={setSlippage} />

      {qq && (
        <div className={s.summary}>
          <Row label="Shares" value={fmtInt(qq.shares)} />
          <Row label={`Fewest accepted (${fmtPct(slippage, 1)})`} value={fmtInt(minShares)} accent />
          <Row label="Share of the pool" value={fmtPct(qq.shareOfSupply, 4)} />
          <Row label="Used" value={both(qq.takenX, qq.takenY)} />
          {(big(qq.excessX) > 0n || big(qq.excessY) > 0n) && (
            <Row label={ordersOn ? 'Returned unused' : 'Left in the wallet'} value={both(qq.excessX, qq.excessY)} />
          )}
          <Row label="Provision box" value={`${fmtErg(qq.provisionBoxValue)} ERG, returned on redeem`} />
          {ordersOn && <Row label="Executor fee" value={`${fmtErg(qq.executorFee)} ERG`} />}
          <Row label="Network fee" value={`${fmtErg(qq.networkFee)} ERG`} />
          {ordersOn && <Row label="Locked now" value={lockedText(qq, pool)} />}
          {big(qq.shares) <= 0n && <Row label="Status" value="Too small to issue a share" />}
        </div>
      )}

      {!unsafe && !full && <Consent pool={pool} checked={consent} onChange={setConsent} />}

      <button
        className={s.btn}
        disabled={!ready || !qq || big(qq.shares) <= 0n || minShares <= 0n || quoting || submitting || blocked}
        onClick={submit}
        type="button"
      >
        {submitting
          ? ordersOn
            ? 'Placing…'
            : 'Depositing…'
          : quoting
            ? 'Fetching quote…'
            : ordersOn
              ? 'Place deposit order'
              : 'Deposit'}
      </button>

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}
      {error && (
        <Alert kind="error" title={ordersOn ? 'Order not placed' : 'Deposit not sent'}>
          {error}
        </Alert>
      )}
      {result && result.ordersOn && (
        <OrderPlacedResult
          result={result.r}
          rows={[
            ['Offering', `${fmtSideFull(result.rawX, tx)} ${tokenLabel(tx)} + ${fmtSideFull(result.rawY, ty)} ${tokenLabel(ty)}`],
            ['Fewest shares', fmtInt(result.minShares)],
          ]}
        />
      )}
      {result && !result.ordersOn && (
        <TxResult
          title="Deposit sent"
          outcome={result.r.outcome}
          txId={result.r.txId}
          rows={[
            ['Deposited', both(result.r.amountX, result.r.amountY)],
            ['Shares', fmtInt(result.r.shares)],
            ['Owner NFT', <IdText key="nft" id={result.r.ownerNFT} />],
          ]}
        />
      )}
    </div>
  );
}

/** Close one of this wallet's provisions on the pool, as a redeem order or directly. Open on every pool. */
export function PoolRedeemCard({ pool, version, onPlaced }) {
  const { tick, toggleSettings, ordersOn, refresh } = useDex();
  const hasKey = api.hasApiKey();
  const [provisions, setProvisions] = useState(null);
  const [listError, setListError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [ackFees, setAckFees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { tokenX: tx, tokenY: ty } = pool;

  useEffect(() => {
    if (!hasKey) {
      setProvisions(null);
      return;
    }
    api
      .listPoolProvisions(pool.poolNFT)
      .then((r) => {
        setProvisions(r.provisions ?? []);
        setListError(null);
      })
      .catch((e) => setListError(e.message));
  }, [pool.poolNFT, tick, version, hasKey]);

  // A claim or a placement gives the provision a new box id; drop a selection that no longer exists
  useEffect(() => {
    if (selected && provisions && !provisions.some((x) => x.boxId === selected)) setSelected(null);
  }, [provisions, selected]);

  // A new selection or mode must be acknowledged on its own terms
  useEffect(() => setAckFees(false), [selected, ordersOn]);

  const { quote: q, error: quoteErr, quoting } = useQuote(!!selected, [selected, ordersOn, pool.utxoId], () =>
    (ordersOn ? api.checkPoolRedeem : api.checkPoolDirectRedeem)(pool.poolNFT, { provisionBoxId: selected }).then(
      (r) => ({ ...r, ordersOn }),
    ),
  );
  const qq = q && q.ordersOn === ordersOn ? q : null;
  const both = (x, y) => `${fmtSide(x, tx)} ${tokenLabel(tx)} + ${fmtSide(y, ty)} ${tokenLabel(ty)}`;
  const hasUnclaimed = !ordersOn && !!qq && (big(qq.unclaimedX) > 0n || big(qq.unclaimedY) > 0n);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = ordersOn
        ? await api.placePoolRedeem(pool.poolNFT, { provisionBoxId: selected })
        : await api.placePoolDirectRedeem(pool.poolNFT, {
            provisionBoxId: selected,
            acknowledgeUnclaimedFees: ackFees || undefined,
            expectedPoolBoxId: qq.poolBoxId,
          });
      setResult({ r, q: qq, ordersOn });
      setSelected(null);
      onPlaced();
      if (!ordersOn) refresh();
    } catch (e) {
      if (e.name === 'StateChangedError') {
        setError('The pool or provision moved and nothing was sent. Reloading; select it again.');
        setSelected(null);
        onPlaced();
        refresh();
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

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
      <div className={p.provList} role="radiogroup" aria-label="Your provisions">
        {provisions.map((x) => {
          const inOrder = !!x.redeemOrderBoxId;
          return (
            <label
              key={x.boxId}
              className={`${p.prov} ${selected === x.boxId ? p.provActive : ''} ${inOrder ? p.provLocked : ''}`}
              title={`Provision ${x.boxId}`}
            >
              <input
                type="radio"
                name={`prov-${pool.poolNFT}`}
                checked={selected === x.boxId}
                disabled={inOrder}
                onChange={() => {
                  setSelected(x.boxId);
                  setResult(null);
                }}
              />
              <span className={p.provMain}>
                <span className={p.provShares}>{fmtInt(x.shares)} shares</span>
                <span className={p.provSub}>{fmtPct(x.shareOfSupply, 4)} of the pool</span>
              </span>
              <span className={p.provFees}>
                {inOrder ? (
                  <span className={p.provSub}>closing: a redeem order holds its NFT</span>
                ) : (
                  <>
                    <span>{both(x.claimableX, x.claimableY)}</span>
                    <span className={p.provSub}>fees claimable now</span>
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
        {ordersOn
          ? 'Placing the order claims what the vault owes the provision first. Fees still unflushed when it fills are forfeited.'
          : 'Closing a provision returns its share of the reserves straight away. Fees it has not claimed are lost with the box.'}
      </p>
      {body}

      {qq && ordersOn && (
        <div className={s.summary}>
          <Row label="Returns" value={both(qq.amountX, qq.amountY)} accent />
          <Row label="Claimed first" value={both(qq.claimableX, qq.claimableY)} />
          <Row label="ERG back beside it" value={`${fmtErg(qq.ergReturned)} ERG`} />
          <Row label="Executor fee" value={`${fmtErg(qq.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(qq.networkFee)} ERG`} />
          {!qq.withinMinSupply && <Row label="Status" value="The pool refuses to close its last shares" />}
        </div>
      )}

      {qq && !ordersOn && (
        <div className={s.summary}>
          <Row label="Returns" value={both(qq.amountX, qq.amountY)} accent />
          <Row label="ERG back beside it" value={`${fmtErg(qq.ergReturned)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(qq.networkFee)} ERG`} />
          {!qq.withinMinSupply && <Row label="Status" value="The pool refuses to close its last shares" />}
        </div>
      )}

      {/* Direct: unclaimed fees die with the box, so losing them takes an explicit tick. */}
      {hasUnclaimed && (
        <Alert kind="warn" title="Unclaimed fees on this provision">
          {both(qq.unclaimedX, qq.unclaimedY)} is still owed to it. Redeeming spends the box and
          <strong> destroys them</strong>. Claim from the Fees tab first to keep them.
          <label className={s.ackRow}>
            <input type="checkbox" checked={ackFees} onChange={(e) => setAckFees(e.target.checked)} />
            <span>Redeem anyway and give up these fees</span>
          </label>
        </Alert>
      )}

      <button
        className={s.btn}
        disabled={!selected || !qq || !qq.withinMinSupply || quoting || submitting || (hasUnclaimed && !ackFees)}
        onClick={submit}
        type="button"
      >
        {submitting
          ? ordersOn
            ? 'Placing…'
            : 'Redeeming…'
          : quoting
            ? 'Fetching quote…'
            : ordersOn
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
        <Alert kind="error" title={ordersOn ? 'Order not placed' : 'Redemption failed'}>
          {error}
        </Alert>
      )}
      {result && result.ordersOn && (
        <OrderPlacedResult
          result={result.r}
          rows={[
            ['Returns', both(result.q.amountX, result.q.amountY)],
            ...(result.r.claimedX ? [['Claimed now', both(result.r.claimedX, result.r.claimedY)]] : []),
          ]}
        />
      )}
      {result && !result.ordersOn && (
        <TxResult
          title="Provision redeemed"
          outcome={result.r.outcome}
          txId={result.r.txId}
          rows={[
            ['Returned', both(result.r.amountX, result.r.amountY)],
            ['Shares closed', fmtInt(result.r.shares)],
          ]}
        />
      )}
    </div>
  );
}
