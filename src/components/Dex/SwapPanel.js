import React, { useState, useEffect, useRef } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { fmtErg, fmtToken, fmtNum, fmtPct, parseErg, parseToken, big, lessSlippage } from './format';
import { Alert, TxResult, Row, AssetChip, Spinner, OrderModeToggle, SLIPPAGE_OPTIONS } from './ui';
import SwapAside, { PoolCompositionCard } from './SwapAside';
import OrdersCard, { OrderPlacedResult, lockedInOrders } from './OrdersPanel';

/** 46×52 connector: a streamline behind a disc with a cyan arrow. Static — no particles. */
function DirectionConnector({ onClick }) {
  return (
    <div className={s.flipWrap}>
      <button className={s.flip} onClick={onClick} aria-label="Switch swap direction" type="button">
        <svg width="46" height="52" viewBox="0 0 46 52">
          <defs>
            <linearGradient id="dexConnFlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
              <stop offset=".25" stopColor="#38bdf8" stopOpacity=".62" />
              <stop offset=".62" stopColor="#818cf8" stopOpacity=".56" />
              <stop offset=".9" stopColor="#a855f7" stopOpacity=".38" />
              <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M23 2 C 23 14 23 28 23 50"
            fill="none"
            stroke="url(#dexConnFlow)"
            strokeWidth="1.6"
          />
          <circle
            className={s.flipDisc}
            cx="23"
            cy="26"
            r="17"
            fill="#0f1629"
            stroke="rgba(56,189,248,.32)"
          />
          <path
            className={s.flipArrow}
            d="M23 18v16M17.5 28.5L23 34l5.5-5.5"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export default function SwapPanel() {
  const { pool, refresh, tick, ordersOn, setOrdersOn, orderFees, orders, reloadOrders } = useDex();
  /* `hasApiKey()` is a module read, not state, but it is read during render —
     so this flips false->true on the re-render Settings triggers and the
     balance loads once a key exists. The balance is a display; the quote below
     still never moves on its own. */
  const hasKey = api.hasApiKey();
  const [ergIn, setErgIn] = useState(true);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.005);

  const [quote, setQuote] = useState(null);
  const [quotedPoolBox, setQuotedPoolBox] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
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
  const raw = ergIn ? parseErg(amount) : parseToken(amount, dec);
  const hasAmount = raw !== null && raw > 0n;

  // Debounced quote — 320ms, with a sequence guard so a slow earlier response
  // cannot overwrite a newer one.
  const seq = useRef(0);
  useEffect(() => {
    // NOTE: deliberately does NOT clear `result`. A successful swap clears the
    // amount and calls refresh(), both of which retrigger this effect — wiping
    // the tx id out from under the user before they can read it. The result is
    // cleared when a NEW amount is typed instead (see onChange).
    setError(null);
    setStale(false);
    if (!hasAmount || !pool) {
      setQuote(null);
      setQuoteErr(null);
      setQuoting(false);
      return undefined;
    }
    const id = ++seq.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const body = { amountIn: raw.toString(), ergIn };
        // Normalised so the form reads one shape: `swap` is the curve quote in
        // both modes, `order` carries the fee and lock figures when there is one.
        const q =
          mode === 'order'
            ? await api.checkSwapOrder(body).then((o) => ({ mode, swap: o.swap, order: o }))
            : await api.checkSwap(body).then((sq) => ({ mode, swap: sq, order: null }));
        if (seq.current === id) {
          setQuote(q);
          setQuotedPoolBox(pool.utxoId);
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
    // Order fees are an input to the order quote, so a change in Settings re-quotes.
  }, [raw?.toString(), ergIn, pool?.utxoId, hasAmount, mode, orderFees?.executorFee, orderFees?.maxMinerFee]);

  // A quote from the other mode is not a quote for this one.
  const q = quote && quote.mode === mode ? quote : null;
  const order = q?.order ?? null;

  const flip = () => {
    setErgIn((v) => !v);
    setAmount('');
    setQuote(null);
    setResult(null);
  };

  const pctOfBalance = (pct) => {
    if (!balance) return;
    const scale = BigInt(Math.round(pct * 1000));
    if (ergIn) {
      setAmount(fmtErg((big(balance.nanoErgs) * scale) / 1000n, 6).replace(/,/g, ''));
    } else {
      const tok = balance.tokens?.find((t) => t.tokenId === pool?.tokenY);
      if (!tok) return;
      setAmount(fmtToken((big(tok.amount) * scale) / 1000n, dec, 6).replace(/,/g, ''));
    }
  };

  /*
   * What the owner actually receives. Selling ERG it is the curve's output;
   * selling the token as an order, the executor fee comes out of the ERG, so
   * `netOutput` is lower — and negative when the fee exceeds the output, which
   * no fill can satisfy.
   */
  const netOut = q ? big(order ? order.netOutput : q.swap.amountOut) : null;
  // Order floors are required and positive: a zero floor gives the fill to
  // whoever moves the pool first. Direct swaps keep their existing floor.
  const minRecv = q ? lessSlippage(netOut, slippage) : null;
  const orderUnfillable = !!order && (netOut <= 0n || minRecv <= 0n);
  const executable = !!q && q.swap.isExecutable && !orderUnfillable;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    setStale(false);
    try {
      if (mode === 'order') {
        const r = await api.placeSwapOrder({
          amountIn: raw.toString(),
          ergIn,
          minOutput: minRecv.toString(),
        });
        setResult({ mode, ergIn, data: r });
        setAmount('');
        setQuote(null);
        // Placing does not spend the pool, so there is no pool to re-read — but
        // the wallet and the order list both just changed.
        reloadOrders();
        loadBalance();
      } else {
        const r = await api.swap({
          amountIn: raw.toString(),
          ergIn,
          minOutput: minRecv.toString(),
          // Send the box the quote came from: a moved pool then 409s instead of
          // executing at a price we never showed.
          expectedPoolBoxId: quotedPoolBox ?? pool?.utxoId,
        });
        setResult({ mode, ergIn, data: r });
        setAmount('');
        setQuote(null);
        refresh();
        loadBalance();
      }
    } catch (e) {
      if (e.name === 'StateChangedError') {
        setStale(true);
        setQuote(null);
        refresh();
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const outDisplay = q ? (ergIn ? fmtToken(netOut, dec) : fmtErg(netOut)) : '';
  const inUnit = ergIn ? 'ERG' : name;
  const outUnit = ergIn ? name : 'ERG';
  const fmtIn = (v) => (ergIn ? fmtErg(v) : fmtToken(v, dec));
  const fmtOut = (v) => (ergIn ? fmtToken(v, dec) : fmtErg(v));

  // The balance excludes whatever is locked in orders; show that beside it so a
  // wallet that just placed an order does not read as having lost the funds.
  const locked = orders ? lockedInOrders(orders) : null;
  const tokBal = balance?.tokens?.find((t) => t.tokenId === pool?.tokenY)?.amount ?? 0;
  const lockedHere = locked ? (ergIn ? locked.nanoErgs : locked.tokens) : 0n;
  const balanceText = balance
    ? `Balance ${ergIn ? fmtErg(balance.nanoErgs) : fmtToken(tokBal, dec)}${
        lockedHere > 0n ? ` · ${fmtIn(lockedHere)} in orders` : ''
      }`
    : hasKey
      ? 'Balance —'
      : 'Balance hidden · set an API key';

  const res = result?.data;

  return (
    <>
      <div className={s.swapLayout}>
        {/* ---------- LEFT COLUMN ---------- */}
        <div className={s.swapCol}>
          <div className={s.swapCardWrap}>
            <div className={s.swapCard}>
              <div className={s.swapGlow} aria-hidden="true" />

              <div className={s.swapHead}>
                <h3 className={s.swapTitle}>Swap</h3>
                <OrderModeToggle
                  checked={ordersOn}
                  onChange={(on) => {
                    setOrdersOn(on);
                    setResult(null);
                  }}
                />
              </div>

              <div className={s.stack}>
                <div className={s.field}>
                  <div className={s.fieldHead}>
                    <span className={s.fieldLabel}>You pay</span>
                    {/* /wallet/balances is key-gated, so a missing balance is
                        usually a missing key rather than an empty wallet. */}
                    <span className={s.fieldBalance}>{balanceText}</span>
                  </div>
                  <div className={s.fieldRow}>
                    <input
                      className={s.input}
                      inputMode="decimal"
                      placeholder="0.0"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setResult(null); // starting a new trade retires the last receipt
                      }}
                    />
                    <AssetChip isErg={ergIn} tokenName={name} />
                  </div>
                  <div className={s.chips}>
                    {[0.25, 0.5, 0.75, 1].map((p) => (
                      <button
                        key={p}
                        className={s.chip}
                        onClick={() => pctOfBalance(p)}
                        type="button"
                      >
                        {p === 1 ? 'MAX' : `${p * 100}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <DirectionConnector onClick={flip} />

                <div className={`${s.field} ${s.fieldPurple}`}>
                  <div className={s.fieldHead}>
                    <span className={s.fieldLabel}>
                      {/* Selling the token as an order, the executor fee is paid out
                          of the ERG received — say so where the number is. */}
                      {mode === 'order' && !ergIn
                        ? 'You receive (estimated, after executor fee)'
                        : 'You receive (estimated)'}
                    </span>
                    <span className={s.fieldBalance}>{quoting && <Spinner />}</span>
                  </div>
                  <div className={s.fieldRow}>
                    <input
                      className={s.input}
                      value={outDisplay}
                      placeholder="0.0"
                      disabled
                      readOnly
                    />
                    <AssetChip isErg={!ergIn} tokenName={name} />
                  </div>
                </div>
              </div>

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

              {q && (
                <div className={s.summary}>
                  <Row
                    label="Execution price"
                    value={`1 ${inUnit} ≈ ${fmtNum(
                      q.swap.executionPrice * 10 ** (ergIn ? 9 - dec : dec - 9),
                      6,
                    )} ${outUnit}`}
                  />
                  <Row
                    label={`Minimum received (${fmtPct(slippage, 1)})`}
                    value={`${fmtOut(minRecv)} ${outUnit}`}
                    accent={!!order}
                  />
                  <Row label="Price impact" value={fmtPct(q.swap.priceImpact)} />
                  <Row label="Permanent fee" value={`${fmtIn(q.swap.protocolFee)} ${inUnit}`} />
                  <Row label="AMM fee" value={`${fmtIn(q.swap.ammFee)} ${inUnit}`} />
                  {order && (
                    <>
                      <Row label="Executor fee" value={`${fmtErg(order.executorFee)} ERG`} />
                      <Row label="Network fee" value={`${fmtErg(order.networkFee)} ERG`} />
                      {/* Selling the token, the ERG locked is only what comes back
                          with the fill; the tokens are locked beside it. */}
                      <Row
                        label="Locked now"
                        value={
                          ergIn
                            ? `${fmtErg(order.totalErgRequired)} ERG`
                            : `${fmtErg(order.totalErgRequired)} ERG + ${fmtToken(raw, dec)} ${name}`
                        }
                      />
                      <Row
                        label="Returned with the fill"
                        value={`${fmtErg(order.ergReturned)} ERG`}
                      />
                    </>
                  )}
                  {!q.swap.isExecutable && <Row label="Status" value="Not executable at this size" />}
                  {q.swap.isExecutable && orderUnfillable && (
                    <Row label="Status" value="Output does not cover the executor fee" />
                  )}
                </div>
              )}

              <button
                className={s.btn}
                disabled={!hasAmount || !q || !executable || quoting || submitting}
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
                      ? 'Place order'
                      : 'Swap'}
              </button>

              {quoteErr && (
                <Alert kind="error" title="Quote failed">
                  {quoteErr}
                </Alert>
              )}

              {stale && (
                <Alert kind="warn" title="The pool moved">
                  Another transaction landed before yours, so the quote is no longer valid. Nothing
                  was sent. The pool has been re-read, adjust the amount to get a fresh quote.
                </Alert>
              )}

              {error && (
                <Alert kind="error" title={mode === 'order' ? 'Order not placed' : 'Swap failed'}>
                  {error}
                </Alert>
              )}

              {res && result.mode === 'order' && (
                <OrderPlacedResult
                  result={res}
                  rows={[
                    [
                      'Selling',
                      result.ergIn
                        ? `${fmtErg(res.order?.amountIn)} ERG`
                        : `${fmtToken(res.order?.amountIn, dec)} ${name}`,
                    ],
                    [
                      'Minimum received',
                      result.ergIn
                        ? `${fmtToken(res.order?.minOutput, dec)} ${name}`
                        : `${fmtErg(res.order?.minOutput)} ERG`,
                    ],
                    ['Executor fee', `${fmtErg(res.order?.executorFee)} ERG`],
                  ]}
                />
              )}

              {res && result.mode === 'direct' && (
                <TxResult
                  title="Swap submitted"
                  outcome={res.outcome}
                  rows={[
                    [
                      'Received',
                      `${result.ergIn ? fmtToken(res.amountOut, dec) : fmtErg(res.amountOut)} ${
                        result.ergIn ? name : 'ERG'
                      }`,
                    ],
                  ]}
                  txId={res.txId}
                />
              )}
            </div>
          </div>

          {/* Pool composition sits under the swap card: it describes the pool you
              are trading against, so it belongs beside the trade, not in the
              analytics column. */}
          <PoolCompositionCard />
        </div>

        {/* ---------- RIGHT COLUMN ---------- */}
        <SwapAside />
      </div>

      <OrdersCard />
    </>
  );
}
