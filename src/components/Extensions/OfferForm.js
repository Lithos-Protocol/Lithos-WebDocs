import React, { useEffect, useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import m from '../Mining/styles.module.css';
import f from '../Collateral/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from './ExtensionsLayout';
import { PayoutCurve } from './charts';
import { KeyGate, SideChip } from './ui';
import { Alert, Spinner, TxResult } from '../Dex/ui';
import {
  big,
  COLORS,
  EPOCH_LENGTH,
  epochEnd,
  epochOf,
  epochStart,
  fmtDate,
  fmtDifficulty,
  fmtEpochAt,
  fmtEpochs,
  fmtInt,
  fmtLit,
  fmtLitFull,
  fmtLitSigned,
  fmtMove,
  fmtSpan,
  fmtWindowRange,
  heightTime,
  lastFillHeight,
  litText,
  marginOf,
  moveOf,
  notionalFor,
  parseDifficulty,
  parseLit,
  perPercent,
  scaleDifficulty,
  shortId,
  SIDE_REWARD,
  sidePayout,
} from './format';

const LENGTH_PRESETS = [1, 4, 8, 40, 80, 120];
const STRIKE_STEPS = [-0.05, -0.02, 0, 0.02, 0.05];
const MARGIN_PRESETS = ['100', '200', '1000', '2000'];
/** How long a new offer stands unless the maker moves it: one epoch of blocks. */
const DEFAULT_EXPIRY_BLOCKS = EPOCH_LENGTH;

/** Where the window's average could end against the strike, for the outcomes table. */
const OUTCOMES = [-0.2, -0.1, -0.05, 0.05, 0.1, 0.2];

/** Now, the lead the contract requires, and the window, on one epoch scale. */
function Timeline({ acc, start, length, heights }) {
  const now = acc.currentEpoch;
  const lead = start - now;
  const total = lead + length;
  const pct = (x) => `${(x / total) * 100}%`;
  const tip = acc.height;
  return (
    <div className={s.timeline}>
      <div className={s.timelineTrack}>
        <span className={s.timelineNow} style={{ width: pct(1) }} title="The current epoch" />
        <span className={s.timelineLead} style={{ width: pct(lead - 1) }} title="Epochs before the window" />
        <span className={s.timelineWindow} style={{ width: pct(length) }} title="The window" />
      </div>
      <div className={s.timelineLabels}>
        <span>now · {heights ? `block ${fmtInt(tip)}` : `epoch ${fmtInt(now)}`}</span>
        <span style={{ color: COLORS.long }}>
          window {heights ? 'blocks ' : ''}
          {fmtWindowRange(start, length, heights)} · {fmtDate(heightTime(epochStart(start), tip))} →{' '}
          {fmtDate(heightTime(epochEnd(start + length - 1), tip))}
        </span>
      </div>
    </div>
  );
}

export default function OfferForm() {
  const { acc, keyed, changed, heights } = useExtensions();
  const [long, setLong] = useState(true);
  const [start, setStart] = useState(null);
  const [length, setLength] = useState(8);
  const [strikeText, setStrikeText] = useState('');
  const [marginText, setMarginText] = useState('200');
  const [expiryPick, setExpiryPick] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [sendError, setSendError] = useState(null);

  const limits = acc?.limits;
  const base = acc?.nextDifficulty?.difficulty ?? acc?.currentDifficulty;
  // An offer is filled after the block it is mined in, which at an epoch's last block is already the next epoch
  const minStart = acc ? Math.max(limits.minWindowStart, epochOf(acc.height + 1) + 2) : null;

  // Start at the earliest window, and keep the chosen one inside the limits as epochs pass
  useEffect(() => {
    if (!limits) return;
    setStart((st) => (st == null ? minStart : Math.min(limits.maxWindowStart, Math.max(minStart, st))));
  }, [minStart, limits?.maxWindowStart]);

  useEffect(() => {
    if (base && !strikeText) setStrikeText(fmtDifficulty(base, 3).replace(/,/g, ''));
  }, [base]);

  const strike = parseDifficulty(strikeText);
  const marginUnits = parseLit(marginText);
  // The contract takes a notional; five times the margin gives exactly the margin typed
  const notionalUnits = marginUnits == null ? null : notionalFor(marginUnits);
  // A fill must be mined after the next block, and no later than the contract's lead allows for this window
  const minExpiry = acc ? acc.height + 2 : null;
  const maxExpiry = start == null ? null : lastFillHeight(start);
  const expiry =
    minExpiry == null || maxExpiry == null
      ? null
      : Math.min(maxExpiry, Math.max(minExpiry, expiryPick ?? acc.height + 1 + DEFAULT_EXPIRY_BLOCKS));
  const capped = limits && length < limits.shortWindowEpochs;
  const marginCap = limits ? marginOf(limits.shortWindowMaxNotional) : null;
  const overCap = capped && notionalUnits != null && notionalUnits > big(limits.shortWindowMaxNotional);

  const request = useMemo(() => {
    if (start == null || expiry == null || strike == null || notionalUnits == null || notionalUnits <= 0n) return null;
    return {
      makerSide: long ? 'long' : 'short',
      strike: strike.toString(),
      notional: notionalUnits.toString(),
      windowStart: start,
      windowLength: length,
      expiry,
    };
  }, [long, start, length, strike, notionalUnits, expiry]);

  // Quoted against the client as the form settles, so every figure on the right is the client's own
  useEffect(() => {
    if (!request || !acc?.deployed) {
      setQuote(null);
      setQuoteError(null);
      return undefined;
    }
    setChecking(true);
    const t = setTimeout(() => {
      api
        .checkOffer(request)
        .then((q) => {
          setQuote(q);
          setQuoteError(null);
        })
        .catch((e) => {
          setQuote(null);
          setQuoteError(e.message);
        })
        .finally(() => setChecking(false));
    }, 350);
    return () => clearTimeout(t);
  }, [JSON.stringify(request), acc?.deployed, acc?.height]);

  const submit = async () => {
    setSending(true);
    setSendError(null);
    try {
      const r = await api.createOffer(request);
      setResult(r);
      changed();
    } catch (e) {
      setSendError(e.message);
    } finally {
      setSending(false);
    }
  };

  if (!acc || start == null) {
    return (
      <div className={m.card}>
        <div className={m.empty}>
          <Spinner /> Reading the chain…
        </div>
      </div>
    );
  }

  const margin = marginUnits ?? 0n;
  const locked = margin + SIDE_REWARD;
  const nextMove = strike ? moveOf(strike, base) : null;

  return (
    <div className={s.formGrid}>
      <div className={m.card}>
        <h3 className={m.cardTitle}>Your terms</h3>

        <div className={s.field}>
          <span className={m.label}>Your side</span>
          <div className={s.sidePick}>
            {[true, false].map((isLong) => (
              <button
                key={String(isLong)}
                type="button"
                className={`${s.sideTile} ${long === isLong ? s.sideTileOn : ''}`}
                style={{ '--side-color': isLong ? COLORS.long : COLORS.short }}
                onClick={() => setLong(isLong)}
                aria-pressed={long === isLong}
              >
                <span className={s.sideTileHead}>{isLong ? '▲ Long' : '▼ Short'}</span>
                <span className={s.sideTileText}>
                  {isLong
                    ? "Wins when Ergo's average difficulty over the window ends above the strike. A miner's hedge: rising difficulty cuts income per hash, and this pays when it rises."
                    : "Wins when Ergo's average difficulty over the window ends below the strike."}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={s.field}>
          <div className={s.fieldHead}>
            <span className={m.label}>Window starts</span>
            <span className={s.fieldValue}>
              {fmtEpochAt(start, heights)} · in about {fmtSpan(epochStart(start) - acc.height - 1)}
            </span>
          </div>
          <input
            type="range"
            className={s.range}
            min={minStart}
            max={limits.maxWindowStart}
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            aria-label="Window start epoch"
          />
          <div className={s.rangeEnds}>
            <span>{fmtEpochAt(minStart, heights)} · earliest</span>
            <span>{fmtEpochAt(limits.maxWindowStart, heights)} · latest</span>
          </div>
          <p className={m.cardNote} style={{ marginTop: 6 }}>
            The window is the stretch of time whose average difficulty decides the bet. It cannot start sooner, because
            the next epoch's difficulty can already be worked out from the chain.
          </p>
        </div>

        <div className={s.field}>
          <div className={s.fieldHead}>
            <span className={m.label}>Window length</span>
            <span className={s.fieldValue}>
              {fmtEpochs(length, heights)} · about {fmtSpan(length * EPOCH_LENGTH)}
            </span>
          </div>
          <input
            type="range"
            className={s.range}
            min={1}
            max={limits.maxWindowLength}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            aria-label="Window length in epochs"
          />
          <div className={s.chipRow}>
            {LENGTH_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                title={`${fmtEpochs(n)}, about ${fmtSpan(n * EPOCH_LENGTH)}`}
                className={`${s.chipBtn} ${length === n ? s.chipBtnOn : ''}`}
                onClick={() => setLength(n)}
              >
                {heights ? fmtInt(n * EPOCH_LENGTH) : n}
              </button>
            ))}
          </div>
        </div>

        <Timeline acc={acc} start={start} length={length} heights={heights} />

        <div className={s.field}>
          <div className={s.fieldHead}>
            <span className={m.label}>Strike difficulty</span>
            <span className={s.fieldValue} style={{ color: COLORS.next }}>
              {nextMove == null ? '' : `${fmtMove(nextMove, 2)} vs ${acc.nextDifficulty ? 'next epoch' : 'now'}`}
            </span>
          </div>
          <input
            className={`${f.settingInput} ${strike == null && strikeText ? s.inputBad : ''}`}
            value={strikeText}
            onChange={(e) => setStrikeText(e.target.value)}
            placeholder="64.27T"
            spellCheck={false}
            aria-label="Strike difficulty"
          />
          <p className={m.cardNote} style={{ marginTop: 6 }}>
            The difficulty the window's average is measured against. Near the next epoch's difficulty is an even bet;
            move it to ask for better odds, which a taker may not take.
          </p>
          <div className={s.chipRow}>
            {STRIKE_STEPS.map((st) => (
              <button
                key={st}
                type="button"
                className={s.chipBtn}
                onClick={() => setStrikeText(fmtDifficulty(scaleDifficulty(base, st), 3).replace(/,/g, ''))}
              >
                {st === 0 ? (acc.nextDifficulty ? 'next epoch' : 'now') : fmtMove(st, 0)}
              </button>
            ))}
          </div>
        </div>

        <div className={s.field}>
          <div className={s.fieldHead}>
            <span className={m.label}>Margin, your stake</span>
            <span className={s.fieldValue}>± {fmtLit(perPercent(margin), 2)} LIT per 1% move</span>
          </div>
          <span className={s.unitInput} style={{ width: '100%' }}>
            <input value={marginText} onChange={(e) => setMarginText(e.target.value)} inputMode="decimal" aria-label="Margin in LIT" />
            <i>LIT</i>
          </span>
          <div className={s.chipRow}>
            {MARGIN_PRESETS.map((n) => (
              <button key={n} type="button" className={`${s.chipBtn} ${marginText === n ? s.chipBtnOn : ''}`} onClick={() => setMarginText(n)}>
                {fmtInt(n)}
              </button>
            ))}
          </div>
          <p className={m.cardNote} style={{ marginTop: 6 }}>
            The most you can win, and the most you can lose before the {litText(SIDE_REWARD)} of fees. The counterparty who fills your offer puts up the same amount.
            On chain the bet is 
            recorded as a notional of {notionalUnits ? fmtLit(notionalUnits, 0) : '—'} LIT, five times the margin.
          </p>
          {capped && (
            <p className={`${m.cardNote} ${overCap ? s.noteWarn : ''}`} style={{ marginTop: 6 }}>
              Windows shorter than {fmtEpochs(limits.shortWindowEpochs, heights)} (about{' '}
              {fmtSpan(limits.shortWindowEpochs * EPOCH_LENGTH)}) are limited to {fmtLit(marginCap, 0)} LIT of margin here:
              over so few epochs, a miner with a tenth of Ergo's hashrate can move the average by about 7.5%.
            </p>
          )}
        </div>

        <div className={s.field}>
          <div className={s.fieldHead}>
            <span className={m.label}>Expiry</span>
            <span className={s.fieldValue}>
              block {fmtInt(expiry)} · in about {fmtSpan(expiry - acc.height - 1)}
            </span>
          </div>
          <input
            type="range"
            className={s.range}
            min={minExpiry}
            max={maxExpiry}
            value={expiry}
            onChange={(e) => setExpiryPick(Number(e.target.value))}
            aria-label="Expiry height"
          />
          <div className={s.rangeEnds}>
            <span>block {fmtInt(minExpiry)} · soonest</span>
            <span>block {fmtInt(maxExpiry)} · last fill</span>
          </div>
          <p className={m.cardNote} style={{ marginTop: 6 }}>
            No fill can be mined within 2 epochs of the window, so that is the latest expiry. Each difficulty change before
            then makes the window easier to forecast, and a taker fills only offers that have turned in their favour.
          </p>
        </div>
      </div>

      <div className={s.formSide}>
        <div className={m.card}>
          <div className={m.cardHead}>
            <h3 className={m.cardTitle}>Your offer {checking && <Spinner />}</h3>
            <SideChip side={long ? 'long' : 'short'} />
          </div>
          <div className={s.lockFigure}>
            <span className={m.label}>You lock</span>
            <div className={s.lockValue}>
              {quote ? fmtLitFull(quote.lit, 2) : fmtLitFull(locked, 2)}
              <span className={s.kpiUnit}>LIT</span>
            </div>
            <span className={m.cardNote}>
              plus {quote ? fmtLitFull(quote.nanoErgs, 4) : '0.002'} ERG in the offer and a{' '}
              {quote ? fmtLitFull(quote.networkFee, 4) : '0.001'} ERG network fee
            </span>
          </div>
          <div className={s.quoteRows}>
            <div className={m.kv}>
              <span className={m.kvKey}>Margin, your stake</span>
              <span className={m.kvVal}>{fmtLitFull(margin, 2)} LIT</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Fees, not returned</span>
              <span className={m.kvVal}>{litText(SIDE_REWARD)}</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Most you can lose</span>
              <span className={m.kvVal} style={{ color: COLORS.loss }}>
                {fmtLitFull(locked, 2)} LIT
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Most you can win</span>
              <span className={m.kvVal} style={{ color: COLORS.gain }}>
                {fmtLitFull(margin, 2)} LIT
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Expires</span>
              <span className={m.kvVal}>
                {quote ? `block ${fmtInt(quote.expiry)} · in ${fmtSpan(quote.expiresInBlocks)}` : '—'}
              </span>
            </div>
          </div>
          {strike && notionalUnits > 0n && (
            <PayoutCurve
              long={long}
              strike={strike}
              notional={notionalUnits}
              height={190}
              marks={[
                acc.nextDifficulty ? { move: moveOf(acc.nextDifficulty.difficulty, strike), label: 'next epoch', color: COLORS.next } : null,
                { move: moveOf(acc.currentDifficulty, strike), label: 'now', color: COLORS.difficulty },
              ].filter(Boolean)}
            />
          )}
          <p className={m.cardNote} style={{ marginTop: 6 }}>
            What you win or lose against where the window's average difficulty ends, before the {litText(SIDE_REWARD)} of fees.
          </p>
          {strike && margin > 0n && <Outcomes long={long} strike={strike} notional={notionalUnits} />}

          {!acc.deployed && (
            <Alert kind="info" title="Not deployed yet">
              Offers open once a difficulty accumulator is deployed on this network.
            </Alert>
          )}
          {quoteError && <Alert kind="warn" title="The client would refuse this offer">{quoteError}</Alert>}
          {quote?.warnings?.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}
          {sendError && <Alert kind="error" title="Offer not sent">{sendError}</Alert>}

          {result ? (
            <TxResult
              title="Offer posted"
              outcome={result.outcome}
              txId={result.txId}
              rows={[['Offer', shortId(result.offerBoxId, 10, 8)]]}
            >
              <div style={{ marginTop: 8 }}>
                See it under <Link to="/extensions/forwards/portfolio">Portfolio</Link>, where you can cancel it until it
                fills.{' '}
                <button type="button" className={f.linkBtn} onClick={() => setResult(null)}>
                  Post another
                </button>
              </div>
            </TxResult>
          ) : !keyed ? (
            <KeyGate what="posting offers" />
          ) : (
            <button type="button" className={f.btn} disabled={!quote || sending} onClick={submit}>
              {sending ? 'Posting…' : `Post offer: lock ${fmtLit(quote?.lit ?? locked, 2)} LIT`}
            </button>
          )}
        </div>
        <Similar acc={acc} start={start} length={length} long={long} strike={strike} heights={heights} />
      </div>
    </div>
  );
}

/**
 * Offers already in the book for a window like yours, so a strike can be set against what others ask. A
 * taker picks the better price, so an offer on the same side at a worse strike waits.
 */
/** What this side wins or loses if the window's average ends at each of a few moves from the strike. */
function Outcomes({ long, strike, notional }) {
  return (
    <div className={s.outcomes}>
      {OUTCOMES.map((mv) => {
        const won = sidePayout(long, scaleDifficulty(strike, mv), strike, notional);
        return (
          <div key={mv} className={s.outcome}>
            <span className={s.outcomeMove}>{fmtMove(mv, 0)}</span>
            <span className={s.outcomeValue} style={{ color: won >= 0n ? COLORS.gain : COLORS.loss }}>
              {fmtLitSigned(won, 1)}
            </span>
          </div>
        );
      })}
      <span className={s.outcomeNote}>average vs strike → LIT to you</span>
    </div>
  );
}

function Similar({ acc, start, length, long, strike, heights }) {
  const { tick } = useExtensions();
  const [book, setBook] = useState(null);
  useEffect(() => {
    api
      .getOffers({ limit: api.MAX_OFFER_PAGE })
      .then(setBook)
      .catch(() => setBook(null));
  }, [tick]);

  const near = (book?.offers ?? [])
    .filter((o) => !o.mine && o.windowLength === length && Math.abs(o.windowStart - start) <= 3)
    .sort((a, b) => Math.abs(a.windowStart - start) - Math.abs(b.windowStart - start) || (big(a.strike) < big(b.strike) ? -1 : 1))
    .slice(0, 6);
  const base = acc.nextDifficulty?.difficulty ?? acc.currentDifficulty;

  return (
    <div className={`${m.card} ${m.stackGap}`}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>Similar offers in the book</h3>
        <span className={m.label}>
          {fmtEpochs(length, heights)} · starting{' '}
          {heights
            ? `blocks ${fmtInt(epochStart(start - 3))}–${fmtInt(epochStart(start + 3))}`
            : `${fmtInt(start - 3)}–${fmtInt(start + 3)}`}
        </span>
      </div>
      {near.length === 0 ? (
        <p className={m.cardNote}>No open offers on a window like this. Yours would be the only one.</p>
      ) : (
        <div className={s.table}>
          <div className={`${s.tr} ${s.similarTr} ${s.th}`}>
            <span>Maker</span>
            <span>Window</span>
            <span className={m.num}>Strike</span>
            <span className={m.num}>vs next</span>
            <span className={m.num}>Margin</span>
          </div>
          {near.map((o) => {
            const same = (o.makerSide === 'long') === long;
            return (
              <div key={o.boxId} className={`${s.tr} ${s.similarTr}`}>
                <span>
                  <SideChip side={o.makerSide} />
                </span>
                <span>{fmtWindowRange(o.windowStart, o.windowLength, heights)}</span>
                <span className={m.num} style={strike && same ? { color: big(o.strike) === strike ? undefined : (big(o.strike) > strike) === long ? COLORS.gain : undefined } : undefined}>
                  {fmtDifficulty(o.strike, 2)}
                </span>
                <span className={m.num}>{fmtMove(moveOf(o.strike, base), 1)}</span>
                <span className={m.num}>{fmtLit(o.margin, 0)}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className={m.cardNote} style={{ marginTop: 8 }}>
        A maker on your side whose strike suits takers better than yours is highlighted: higher for a long maker,
        whose taker goes short, and lower for a short one. Takers fill that offer first.
      </p>
    </div>
  );
}

