import React, { useState, useEffect, useCallback, useRef } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useCollateral } from './CollarLayout';
import { big, fmtErgAmount, fmtTokenAmount, fmtInt, shortId, parseErg } from './format';
import { Alert, Row, Spinner } from './ui';
import { MIN_FEE_NANO } from './feeMarket';

const MIN_COUNT = 1;
const MAX_COUNT = 25;
const QUICK_COUNTS = [1, 5, 10, 25];
// Same debounce cadence as the Dex deposit card — fast enough to feel live,
// slow enough not to hammer the client while someone clicks.
const QUOTE_DEBOUNCE_MS = 320;

/*
 * Priority-fee presets, in ERG. The first non-zero one is the minimum the client
 * accepts and the last is the break-even it reports (0.085 ERG) — past that a
 * position costs more than the block reward returns, so it is the top of the
 * useful range rather than a limit.
 */
const QUICK_FEES = ['0', '0.001', '0.01', '0.085'];

export default function JoinPanel() {
  const { market, refresh, refreshWallet } = useCollateral();

  const [count, setCount] = useState(1);
  /** Priority fee as typed, in ERG. Empty means none. */
  const [feeErg, setFeeErg] = useState('0');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(true);
  const [quoteErr, setQuoteErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  /** Guards against a stale quote response landing after a newer request. */
  const seq = useRef(0);
  /** One automatic re-quote per send attempt on 409 — never an infinite loop. */
  const requotedRef = useRef(false);

  const runQuote = useCallback(async (n, fee) => {
    const id = ++seq.current;
    setQuoting(true);
    try {
      const q = await api.checkJoin({ count: n, priorityFeeEachNanoErgs: fee });
      if (seq.current === id) {
        setQuote(q);
        setQuoteErr(null);
        requotedRef.current = false;
      }
    } catch (e) {
      if (seq.current === id) {
        setQuote(null);
        setQuoteErr(e.message);
      }
    } finally {
      if (seq.current === id) {
        setQuoting(false);
      }
    }
  }, []);

  /*
   * The quote is key-gated now, so a panel that mounted before a key was
   * entered has to re-quote once one is. `hasApiKey()` is a plain module read
   * rather than state, but it is read during render, so this flips false->true
   * on the re-render that Settings triggers and fires exactly once.
   *
   * Deliberately not the auto-refresh tick: a quote must not move on a timer.
   */
  const hasKey = api.hasApiKey();

  /*
   * The typed fee as nanoERG, or null while it is unparseable. A half-typed
   * "0." must not be quoted as though it were a number, so the effect below
   * holds the last good quote rather than firing on it.
   *
   * The minimum is checked here as well as on the client, so a fee too small to
   * be worth the finder's output is caught while it is still being typed rather
   * than as a rejected send.
   */
  const feeNano = feeErg.trim() === '' ? 0n : parseErg(feeErg);
  const feeParses = feeNano !== null && feeNano >= 0n;
  const feeTooSmall = feeParses && feeNano > 0n && feeNano < MIN_FEE_NANO;
  const feeValid = feeParses && !feeTooSmall;

  useEffect(() => {
    setError(null);
    setNotice(null);
    if (!feeValid) return undefined;
    const t = setTimeout(() => runQuote(count, feeNano.toString()), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // feeNano is a BigInt derived from feeErg; depending on its string keeps the
    // effect stable across re-renders that reparse the same text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, String(feeNano), feeValid, runQuote, hasKey]);

  const submit = async () => {
    const q = quote;
    if (!q) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      // Cap each permit at the quote plus headroom, and pin the emission tip box
      // so a queue that moves mid-flight fails loudly (409) instead of silently
      // joining at a worse price.
      const maxPermit = (q.permitsLit ?? []).reduce(
        (a, b) => (big(b) > big(a) ? big(b) : big(a)),
        0n,
      );
      const r = await api.join({
        count: q.count,
        maxPermitEachLit: ((maxPermit * 101n) / 100n).toString(),
        expectedEmissionBoxId: q.emissionTipBoxId,
        acknowledgeNoWithdrawal: acknowledged,
        // From the quote, never from the input: those agree only when the
        // debounce has settled, and this decides what each position locks up.
        priorityFeeEachNanoErgs: q.priorityFeeEachNanoErgs,
      });
      setResult(r);
      setQuote(null);
      // A fresh join has to be acknowledged afresh.
      setAcknowledged(false);
      // Reset to the floor and pull a fresh quote immediately — setting state
      // alone isn't enough when count was already MIN_COUNT (no dep change).
      setCount(MIN_COUNT);
      setFeeErg('0');
      runQuote(MIN_COUNT, '0');
      refresh();
      refreshWallet();
    } catch (e) {
      if (e.name === 'StateChangedError' || e.status === 409) {
        // Nothing was decided. Re-quote off live state once, keep the user's
        // count, and require a deliberate second confirmation — the price may
        // have moved up.
        if (!requotedRef.current) {
          requotedRef.current = true;
          setNotice(
            'The queue moved while you were confirming so nothing was sent. Costs below are refreshed; read them and confirm again.',
          );
          runQuote(count, feeValid ? feeNano.toString() : '0');
        } else {
          setError(
            'The queue moved again before the join could land, and nothing was sent. Wait a moment, then confirm once more.',
          );
        }
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const bump = (d) => setCount((c) => Math.max(MIN_COUNT, Math.min(MAX_COUNT, c + d)));

  const afford = quote?.affordNow !== false;

  /*
   * The client decides whether a manual join is allowed and says so on the
   * quote. `maxJoinsPerRun` never bounded a manual join — it is the ceiling on
   * one automated pass — so nothing here reads it.
   *
   * The endpoint enforces this regardless: a quote is a snapshot and the config
   * can change under it, so the control being enabled is never a promise.
   */
  const blocked = quote != null && quote.manualJoinAllowed === false;
  const BLOCK_COPY = {
    AUTO_COLLATERALIZE: {
      title: 'Manual joins are disabled',
      body: 'Manual joins cannot be performed while autoCollateralize is set to true in your config. The automated pass picks the lender keys, and a join made by hand can take one it is already using.',
    },
    NO_LENDER_KEYS: {
      title: 'Not enough lender keys',
      body: 'A join takes one free lender key per position, and there are not enough free or derivable to cover this count. Lower the count, or raise maxLenderKeys in the client config.',
    },
    BUDGET_EXHAUSTED: {
      title: 'Exposure budget reached',
      body: 'Your configured ceiling on live positions leaves no room for this join. Lower the count, or raise maxOwnCollateral in the client config.',
    },
    INSUFFICIENT_FUNDS: {
      title: "The wallet can't cover this",
      body: 'Principal plus permits and fees exceed the spendable balance. Lower the count or top the wallet up.',
    },
  };
  const blockCopy = blocked
    ? (BLOCK_COPY[quote.blockedReason] ?? {
        title: 'This join cannot be sent',
        body: 'The client refused it. Check the client configuration and try again.',
      })
    : null;

  // The client names only the keys that already exist — deriving one writes to
  // the wallet, and a quote does not mutate. The rest appear at send time.
  const named = quote?.lenderAddresses ?? [];
  const toDerive = Math.max(0, count - named.length);

  return (
    <>
      <div className={s.card}>
        <h3 className={s.cardTitle}>Join the collateral market</h3>
        <p className={s.cardDesc}>
          Post {market ? fmtErgAmount(market.principalNanoErgs, 3) : '2.915'} ERG of principal plus
          a LIT permit per position and take a place in the queue. When a block consumes your box,
          the coinbase pays you 3 ERG plus that block&rsquo;s fees. Add a priority fee to be
          consumed sooner.
        </p>

        {/* ---- COUNT ---- */}
        <div className={s.field}>
          <div className={s.fieldHead}>
            <span className={s.fieldLabel}>Positions to take</span>
            <span className={s.fieldBalance}>
              {quote?.firstPosition != null &&
                `first position would be #${fmtInt(quote.firstPosition)}`}
            </span>
          </div>
          <div className={s.cmStepperRow}>
            <div className={s.cmStepper}>
              <button
                type="button"
                className={s.cmStepBtn}
                onClick={() => bump(-1)}
                disabled={count <= MIN_COUNT || quoting || submitting}
                aria-label="Fewer positions"
              >
                −
              </button>
              <span className={s.cmStepValue}>{count}</span>
              <button
                type="button"
                className={s.cmStepBtn}
                onClick={() => bump(1)}
                disabled={count >= MAX_COUNT || quoting || submitting}
                aria-label="More positions"
              >
                +
              </button>
            </div>
            <div className={s.chips} style={{ marginTop: 0 }}>
              {QUICK_COUNTS.map((n) => (
                <button
                  key={n}
                  className={`${s.chip} ${count === n ? s.chipActive : ''}`}
                  onClick={() => setCount(n)}
                  disabled={quoting || submitting}
                  type="button"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---- PRIORITY FEE ---- */}
        <div className={s.field}>
          <div className={s.fieldHead}>
            <span className={s.fieldLabel}>Priority fee, per position</span>
            <span className={s.fieldBalance}>added to your collateral box</span>
          </div>
          <div className={s.fieldRow}>
            <input
              className={s.input}
              type="text"
              inputMode="decimal"
              value={feeErg}
              placeholder="0"
              onChange={(e) => setFeeErg(e.target.value)}
              disabled={submitting}
              aria-label="Priority fee in ERG"
            />
            <span className={s.inputText}>ERG</span>
          </div>
          <div className={s.chips}>
            {QUICK_FEES.map((f) => (
              <button
                key={f}
                className={`${s.chip} ${feeErg === f ? s.chipActive : ''}`}
                onClick={() => setFeeErg(f)}
                disabled={submitting}
                type="button"
              >
                {f === '0' ? 'None' : `${f} ERG`}
              </button>
            ))}
          </div>
          <div className={s.cmPermitNote}>
            Added to your collateral box on top of the principal, so it raises what the position
            locks up one for one. Miners spend whichever box pays them most, which is what moves
            you ahead of the boxes offering nothing. The minimum is 0.001 ERG.
          </div>
        </div>

        {!feeParses && (
          <Alert kind="error" title="That priority fee isn't a number">
            Enter an amount in ERG, or 0 to post at the floor and offer nothing.
          </Alert>
        )}

        {feeTooSmall && (
          <Alert kind="error" title="That priority fee is too small">
            The smallest fee is {fmtErgAmount(MIN_FEE_NANO, 3)} ERG. Below that the block&rsquo;s
            finder is left less than the output it is paid in costs. Raise it, or set 0 to post at
            the floor.
          </Alert>
        )}

        {/* ---- COST BREAKDOWN ---- */}
        {quoting && (
          <div className={s.summary}>
            <Spinner /> <span className={s.rowLabel}>Quoting permits…</span>
          </div>
        )}

        {quote && !quoting && (
          <div className={s.summary}>
            <Row
              label={`Principal × ${fmtInt(quote.count)}`}
              value={`${fmtErgAmount(big(quote.principalEachNanoErgs) * BigInt(quote.count), 4)} ERG`}
            />
            {/* Already inside the principal above; broken out so the fee is
                visible as its own line rather than folded into one number. */}
            {big(quote.priorityFeeEachNanoErgs) > 0n && (
              <Row
                label={`└ priority fee × ${fmtInt(quote.count)}`}
                value={`${fmtErgAmount(big(quote.priorityFeeEachNanoErgs) * BigInt(quote.count), 6)} ERG`}
              />
            )}
            <Row
              label={`Network fee × ${fmtInt(quote.count)}`}
              value={`${fmtErgAmount(big(quote.txFeeEachNanoErgs) * BigInt(quote.count), 6)} ERG`}
            />
            <div className={s.cmPermitNote}>
              Permits escalate: every extra position lengthens the queue, and each later slot pays
              more than the one before it. This is the honest cost of batching.
            </div>
            <div className={s.cmPermitLines}>
              {(quote.permitsLit ?? []).map((p, i) => (
                <Row
                  key={i}
                  label={`Permit · position #${fmtInt(Number(quote.firstPosition ?? 0) + i)}`}
                  value={`${fmtTokenAmount(p, 9, 2)} LIT`}
                />
              ))}
            </div>
            <Row
              label="Permits total"
              value={`${fmtTokenAmount(quote.permitTotalLit, 9, 2)} LIT`}
            />
            <Row
              label="Total committed now"
              value={`${fmtErgAmount(quote.totalNanoErgs, 4)} ERG`}
              accent
            />
          </div>
        )}

        {/* ---- LENDER KEYS ---- */}
        {quote && !quoting && (named.length > 0 || toDerive > 0) && (
          <div className={s.cmKeysBlock}>
            <div className={s.fieldLabel}>Lender keys this join would use</div>
            <div className={s.cmPermitNote}>
              One key per position. Each holds its position, receives the block reward when it is
              mined against, and gets the permit back when the box is spent.
            </div>
            {named.map((addr, i) => (
              <div key={addr} className={s.cmKeyRow}>
                <span className={s.cmKeyIndex}>
                  #{fmtInt(Number(quote.firstPosition ?? 0) + i)}
                </span>
                <span className={s.cmKeyAddr} title={addr}>
                  {shortId(addr, 12, 10)}
                </span>
              </div>
            ))}
            {toDerive > 0 && (
              <div className={s.cmKeyRow}>
                <span className={s.cmKeyIndex}>+{fmtInt(toDerive)}</span>
                {/* Naming these would mean deriving them, and deriving writes to
                    the wallet — a quote does not mutate, so they appear only in
                    the result. */}
                <span className={s.cmKeyPending}>derived when you confirm</span>
              </div>
            )}
          </div>
        )}

        {quoteErr && (
          <Alert kind="error" title="Could not get a quote">
            {quoteErr}
          </Alert>
        )}

        {/* ---- PRE-SEND WARNINGS ---- */}
        {/* The client accepts a bid above break-even on purpose: the fees of the
            block you are mined against can still cover it. Say what the shortfall
            is and leave the judgement to the reader. */}
        {quote && !quoting && big(quote.netAtCoinbaseEachNanoErgs) < 0n && (
          <Alert kind="warn" title="This bid costs more than the block reward returns">
            Each position locks {fmtErgAmount(quote.principalEachNanoErgs, 4)} ERG and the coinbase
            pays back 3 ERG, leaving you{' '}
            {fmtErgAmount(-big(quote.netAtCoinbaseEachNanoErgs), 6)} ERG short per position. You
            recover that only if the block your box is mined against carries at least that much in
            transaction fees. Bidding at or under{' '}
            {fmtErgAmount(quote.breakEvenPriorityFeeNanoErgs, 4)} ERG stays inside the reward.
          </Alert>
        )}

        {quote && quote.affordNow === false && (
          <Alert kind="error" title="The wallet can't cover this right now">
            Short by {fmtErgAmount(quote.shortfallNanoErgs, 4)} ERG including fees. Lower the count
            or top the wallet up.
          </Alert>
        )}

        {blockCopy && (
          <Alert kind="error" title={blockCopy.title}>
            {blockCopy.body}
          </Alert>
        )}

        {/* The irreversibility is acknowledged, not merely displayed — the same
            shape the DEX uses before redeeming a provision with unclaimed fees.
            The endpoint requires the flag, so an unticked box cannot be sent. */}
        <label className={s.cmAckRow}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={submitting || blocked}
          />
          <span>
            <strong>This cannot be undone.</strong> Once queued, funds are locked until a Lithos miner
            mines a block that spends this box. There is no early exit and no withdrawal. The total time locked can
            depend on factors like pool hashrate, other collateral boxes, and some amount of luck in block finding.
          </span>
        </label>

        <button
          className={s.btn}
          disabled={
            !quote ||
            quoting ||
            submitting ||
            !afford ||
            !hasKey ||
            blocked ||
            !acknowledged ||
            !feeValid ||
            count < MIN_COUNT
          }
          onClick={submit}
        >
          {submitting
            ? 'Submitting…'
            : !hasKey
              ? 'Set an API key to confirm'
              : blocked
                ? 'Joining is disabled'
                : !acknowledged
                  ? 'Acknowledge the warning to confirm'
                  : quote
                    ? `Queue ${fmtInt(count)} position${count === 1 ? '' : 's'} · ${fmtErgAmount(quote.totalNanoErgs, 4)} ERG`
                    : 'Waiting for a quote…'}
        </button>

        {!hasKey && (
          <div className={s.cmFootnote}>
            Confirming spends real ERG, so it needs the API key: set it under Settings (top right).
          </div>
        )}

        {notice && (
          <Alert kind="warn" title="Re-check before confirming">
            {notice}
          </Alert>
        )}

        {error && (
          <Alert kind="error" title="Join failed">
            {error}
          </Alert>
        )}

        {/* Positions are created one at a time, each chained onto the last, so a
            run can stop part way. Those already sent are real and their
            principal is spent — reporting the whole thing as a success would
            hide that fewer landed than were asked for. */}
        {result &&
          (() => {
            const made = result.joins?.length ?? 0;
            const partial = !!result.stoppedReason;
            return (
              <Alert
                kind={partial ? 'warn' : 'ok'}
                title={
                  partial
                    ? `Stopped after ${fmtInt(made)} of ${fmtInt(count)} position${count === 1 ? '' : 's'}`
                    : "You're in the queue"
                }
              >
                {fmtInt(made)} position{made === 1 ? '' : 's'} queued ·{' '}
                {fmtErgAmount(result.totalNanoErgs, 4)} ERG committed. They activate as slots free
                up.
                {partial && (
                  <div style={{ marginTop: '0.5rem' }}>
                    The run stopped early: {result.stoppedReason}. The positions below were created
                    and their principal is spent; the rest were not sent.
                  </div>
                )}
                {(result.joins ?? []).map((j) => (
                  <div key={j.txId ?? j.position} className={s.row}>
                    <span className={s.rowLabel}>
                      Position #{fmtInt(j.position)} · {fmtTokenAmount(j.permitLit, 9, 2)} LIT
                      permit
                      {big(j.priorityFeeNanoErgs ?? '0') > 0n && (
                        <> · {fmtErgAmount(j.priorityFeeNanoErgs, 6)} ERG fee</>
                      )}
                      {j.lenderAddress && (
                        <>
                          {' · '}
                          <span className={s.cmKeyAddr} title={j.lenderAddress}>
                            {shortId(j.lenderAddress, 10, 8)}
                          </span>
                        </>
                      )}
                    </span>
                    <span className={s.txId}>{j.txId}</span>
                  </div>
                ))}
              </Alert>
            );
          })()}
      </div>
    </>
  );
}
