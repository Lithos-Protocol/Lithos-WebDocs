import React, { useEffect, useRef, useState } from 'react';
import s from './styles.module.css';
import p from './pools.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { big, fmtErg, fmtInt, fmtPct, lessSlippage, ratio } from './format';
import { Alert, Row, Spinner, SLIPPAGE_OPTIONS } from './ui';
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

/** A swap order on any pool, either direction. */
export function PoolSwapCard({ pool, balance, unsafe, onPlaced }) {
  const [xIn, setXIn] = useState(true);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.005);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { orderFees } = useDex();

  const tin = xIn ? pool.tokenX : pool.tokenY;
  const tout = xIn ? pool.tokenY : pool.tokenX;
  const raw = parseSide(amount, tin);
  const hasAmount = raw !== null && raw > 0n;

  const { quote: q, error: quoteErr, quoting } = useQuote(
    hasAmount,
    [raw?.toString(), xIn, pool.poolNFT, pool.utxoId, orderFees?.executorFee, orderFees?.maxMinerFee],
    () => api.checkPoolSwap(pool.poolNFT, { tokenIn: tin.tokenId, amountIn: raw.toString() }),
  );

  const netOut = q ? big(q.netOutput) : null;
  const minRecv = q ? lessSlippage(netOut, slippage) : null;
  const unfillable = !!q && (netOut <= 0n || minRecv <= 0n);
  // The least input that buys the same output; anything above it buys nothing more
  const least = q?.minAmountIn ? big(q.minAmountIn) : null;
  const surplus = least !== null && hasAmount && least < raw ? raw - least : 0n;
  const rate = q && hasAmount
    ? ratio(big(q.amountOut) * 10n ** BigInt(decimalsOf(tin)), raw * 10n ** BigInt(decimalsOf(tout)), 12)
    : null;
  const held = heldOf(balance, tin);
  const blocked = unsafe || (!pool.verified && !consent);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.placePoolSwap(pool.poolNFT, {
        tokenIn: tin.tokenId,
        amountIn: raw.toString(),
        minOutput: minRecv.toString(),
        acknowledgeUnverified: pool.verified ? undefined : true,
      });
      setResult({ r, tin, tout, amountIn: raw, minOutput: minRecv, fee: q.executorFee });
      setAmount('');
      setConsent(false);
      onPlaced();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={s.card}>
      <div className={p.cardHeadRow}>
        <h3 className={s.cardTitle}>Swap</h3>
        <span className={p.orderNote}>placed as an order</span>
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
            {tout.tokenId === 'ERG' ? 'You receive (estimated, after executor fee)' : 'You receive (estimated)'}
          </span>
          <span className={s.fieldBalance}>{quoting && <Spinner />}</span>
        </div>
        <div className={s.fieldRow}>
          <input className={s.input} value={q ? fmtSideFull(netOut, tout) : ''} placeholder="0.0" disabled readOnly />
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

      {q && (
        <div className={s.summary}>
          {rate !== null && (
            <Row label="Rate" value={`1 ${tokenLabel(tin)} ≈ ${fmtPrice(rate)} ${tokenLabel(tout)}`} />
          )}
          <Row
            label={`Minimum received (${fmtPct(slippage, 1)})`}
            value={`${fmtSideFull(minRecv, tout)} ${tokenLabel(tout)}`}
            accent
          />
          <Row label="Executor fee" value={`${fmtErg(q.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(q.networkFee)} ERG`} />
          <Row label="Locked now" value={lockedText(q, pool)} />
          <Row label="Returned with the fill" value={`${fmtErg(q.ergReturned)} ERG`} />
          {!q.executable && <Row label="Status" value="Not executable at this size" />}
          {q.executable && unfillable && <Row label="Status" value="Output does not cover the executor fee" />}
        </div>
      )}

      {!unsafe && <Consent pool={pool} checked={consent} onChange={setConsent} />}

      <button
        className={s.btn}
        disabled={!hasAmount || !q || !q.executable || unfillable || quoting || submitting || blocked}
        onClick={submit}
        type="button"
      >
        {submitting ? 'Placing…' : quoting ? 'Fetching quote…' : 'Place order'}
      </button>

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}
      {error && (
        <Alert kind="error" title="Order not placed">
          {error}
        </Alert>
      )}
      {result && (
        <OrderPlacedResult
          result={result.r}
          rows={[
            ['Selling', `${fmtSideFull(result.amountIn, result.tin)} ${tokenLabel(result.tin)}`],
            ['Minimum received', `${fmtSideFull(result.minOutput, result.tout)} ${tokenLabel(result.tout)}`],
            ['Executor fee', `${fmtErg(result.fee)} ERG`],
          ]}
        />
      )}
    </div>
  );
}

/** A deposit order on any pool. With "Balanced" on, typing one side fills in the other at the pool's ratio. */
export function PoolDepositCard({ pool, balance, unsafe, onPlaced }) {
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [balanced, setBalanced] = useState(true);
  const [slippage, setSlippage] = useState(0.005);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { orderFees } = useDex();

  const { tokenX: tx, tokenY: ty } = pool;
  const rawX = parseSide(amountX, tx);
  const rawY = parseSide(amountY, ty);
  const ready = rawX !== null && rawX > 0n && rawY !== null && rawY > 0n;
  const full = pool.provTokensLeft === '0';

  const { quote: q, error: quoteErr, quoting } = useQuote(
    ready && !full,
    [rawX?.toString(), rawY?.toString(), pool.poolNFT, pool.utxoId, orderFees?.executorFee, orderFees?.maxMinerFee],
    () => api.checkPoolDeposit(pool.poolNFT, { amountX: rawX.toString(), amountY: rawY.toString() }),
  );

  const setSide = (fromX, text) => {
    setResult(null);
    (fromX ? setAmountX : setAmountY)(text);
    if (!balanced) return;
    const raw = parseSide(text, fromX ? tx : ty);
    const other = raw && raw > 0n ? fmtSideFull(matchSide(raw, pool, fromX), fromX ? ty : tx).replace(/,/g, '') : '';
    (fromX ? setAmountY : setAmountX)(other);
  };

  const minShares = q ? lessSlippage(big(q.shares), slippage) : null;
  const blocked = unsafe || full || (!pool.verified && !consent);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.placePoolDeposit(pool.poolNFT, {
        amountX: rawX.toString(),
        amountY: rawY.toString(),
        minShares: minShares.toString(),
        acknowledgeUnverified: pool.verified ? undefined : true,
      });
      setResult({ r, rawX, rawY, minShares });
      setAmountX('');
      setAmountY('');
      setConsent(false);
      onPlaced();
    } catch (e) {
      setError(e.message);
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
        A deposit order mints you a provision when a miner fills it. The side the pool cannot match comes back.
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

      {q && (
        <div className={s.summary}>
          <Row label="Shares" value={fmtInt(q.shares)} />
          <Row label={`Fewest accepted (${fmtPct(slippage, 1)})`} value={fmtInt(minShares)} accent />
          <Row label="Share of the pool" value={fmtPct(q.shareOfSupply, 4)} />
          <Row label="Used" value={`${fmtSide(q.takenX, tx)} ${tokenLabel(tx)} + ${fmtSide(q.takenY, ty)} ${tokenLabel(ty)}`} />
          {(big(q.excessX) > 0n || big(q.excessY) > 0n) && (
            <Row
              label="Returned unused"
              value={`${fmtSide(q.excessX, tx)} ${tokenLabel(tx)} + ${fmtSide(q.excessY, ty)} ${tokenLabel(ty)}`}
            />
          )}
          <Row label="Provision box" value={`${fmtErg(q.provisionBoxValue)} ERG, returned on redeem`} />
          <Row label="Executor fee" value={`${fmtErg(q.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(q.networkFee)} ERG`} />
          <Row label="Locked now" value={lockedText(q, pool)} />
          {big(q.shares) <= 0n && <Row label="Status" value="Too small to issue a share" />}
        </div>
      )}

      {!unsafe && !full && <Consent pool={pool} checked={consent} onChange={setConsent} />}

      <button
        className={s.btn}
        disabled={!ready || !q || big(q.shares) <= 0n || minShares <= 0n || quoting || submitting || blocked}
        onClick={submit}
        type="button"
      >
        {submitting ? 'Placing…' : quoting ? 'Fetching quote…' : 'Place deposit order'}
      </button>

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}
      {error && (
        <Alert kind="error" title="Order not placed">
          {error}
        </Alert>
      )}
      {result && (
        <OrderPlacedResult
          result={result.r}
          rows={[
            ['Offering', `${fmtSideFull(result.rawX, tx)} ${tokenLabel(tx)} + ${fmtSideFull(result.rawY, ty)} ${tokenLabel(ty)}`],
            ['Fewest shares', fmtInt(result.minShares)],
          ]}
        />
      )}
    </div>
  );
}

/** Close one of this wallet's provisions on the pool through a redeem order. Open on every pool. */
export function PoolRedeemCard({ pool, version, onPlaced }) {
  const { tick, toggleSettings } = useDex();
  const hasKey = api.hasApiKey();
  const [provisions, setProvisions] = useState(null);
  const [listError, setListError] = useState(null);
  const [selected, setSelected] = useState(null);
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

  const { quote: q, error: quoteErr, quoting } = useQuote(!!selected, [selected, pool.utxoId], () =>
    api.checkPoolRedeem(pool.poolNFT, { provisionBoxId: selected }),
  );

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.placePoolRedeem(pool.poolNFT, { provisionBoxId: selected });
      setResult({ r, q });
      setSelected(null);
      onPlaced();
    } catch (e) {
      setError(e.message);
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
                    <span>
                      {fmtSide(x.claimableX, tx)} {tokenLabel(tx)} + {fmtSide(x.claimableY, ty)} {tokenLabel(ty)}
                    </span>
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
        Placing the order claims what the vault owes the provision first. Fees still unflushed when it fills are
        forfeited.
      </p>
      {body}

      {q && (
        <div className={s.summary}>
          <Row label="Returns" value={`${fmtSide(q.amountX, tx)} ${tokenLabel(tx)} + ${fmtSide(q.amountY, ty)} ${tokenLabel(ty)}`} accent />
          <Row label="Claimed first" value={`${fmtSide(q.claimableX, tx)} ${tokenLabel(tx)} + ${fmtSide(q.claimableY, ty)} ${tokenLabel(ty)}`} />
          <Row label="ERG back beside it" value={`${fmtErg(q.ergReturned)} ERG`} />
          <Row label="Executor fee" value={`${fmtErg(q.executorFee)} ERG`} />
          <Row label="Network fee" value={`${fmtErg(q.networkFee)} ERG`} />
          {!q.withinMinSupply && <Row label="Status" value="The pool refuses to close its last shares" />}
        </div>
      )}

      <button
        className={s.btn}
        disabled={!selected || !q || !q.withinMinSupply || quoting || submitting}
        onClick={submit}
        type="button"
      >
        {submitting ? 'Placing…' : quoting ? 'Fetching quote…' : 'Place redeem order'}
      </button>

      {quoteErr && (
        <Alert kind="error" title="Quote failed">
          {quoteErr}
        </Alert>
      )}
      {error && (
        <Alert kind="error" title="Order not placed">
          {error}
        </Alert>
      )}
      {result && (
        <OrderPlacedResult
          result={result.r}
          rows={[
            ['Returns', `${fmtSide(result.q.amountX, tx)} ${tokenLabel(tx)} + ${fmtSide(result.q.amountY, ty)} ${tokenLabel(ty)}`],
            ...(result.r.claimedX
              ? [['Claimed now', `${fmtSide(result.r.claimedX, tx)} ${tokenLabel(tx)} + ${fmtSide(result.r.claimedY, ty)} ${tokenLabel(ty)}`]]
              : []),
          ]}
        />
      )}
    </div>
  );
}
