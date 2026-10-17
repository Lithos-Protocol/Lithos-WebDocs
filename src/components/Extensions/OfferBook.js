import React, { useCallback, useEffect, useMemo, useState } from 'react';
import m from '../Mining/styles.module.css';
import f from '../Collateral/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from './ExtensionsLayout';
import { PayoutCurve, StrikeLadder } from './charts';
import { KeyGate, PageSize, Pager, SideChip, usePaged, WindowText } from './ui';
import { Alert, Spinner, TxResult } from '../Dex/ui';
import {
  big,
  COLORS,
  epochEnd,
  epochStart,
  fmtDate,
  fmtDifficulty,
  fmtInt,
  fmtLit,
  fmtLitFull,
  fmtLitSigned,
  fmtMove,
  fmtSpan,
  fmtStartsIn,
  fmtWindowRange,
  heightTime,
  moveOf,
  parseLit,
  perPercent,
  shortId,
  sidePayout,
  scaleDifficulty,
} from './format';

/** Strike bins, as moves against the next epoch's difficulty, with an open bin at each end. */
const BIN_STEP = 0.02;
const BIN_EDGE = 0.2;

function makeBins() {
  const bins = [{ from: -Infinity, to: -BIN_EDGE, label: '<-20%', range: 'below -20%' }];
  for (let lo = -BIN_EDGE; lo < BIN_EDGE - 1e-9; lo += BIN_STEP) {
    const a = Math.round(lo * 100);
    const b = Math.round((lo + BIN_STEP) * 100);
    bins.push({ from: lo, to: lo + BIN_STEP, label: `${a > 0 ? '+' : ''}${a}%`, range: `${a}% to ${b}%` });
  }
  bins.push({ from: BIN_EDGE, to: Infinity, label: '>+20%', range: 'above +20%' });
  return bins;
}
const BINS = makeBins();
const binOf = (move) => BINS.findIndex((b) => move >= b.from && move < b.to);

/* Lengths and starts in days, which read the same in either unit; the titles give epochs and blocks */
const LENGTHS = [
  { id: 'any', label: 'Any', test: () => true },
  { id: 'short', label: '< 1.5 d', hint: '1–7 epochs, 128–896 blocks', test: (l) => l < 8 },
  { id: 'mid', label: '1.5–7 d', hint: '8–39 epochs, 1,024–4,992 blocks', test: (l) => l >= 8 && l < 40 },
  { id: 'long', label: '> 7 d', hint: '40 epochs or more, 5,120 blocks or more', test: (l) => l >= 40 },
];

const STARTS = [
  { id: 'any', label: 'Any', test: () => true },
  { id: 'soon', label: '< 1.5 d', hint: 'within 8 epochs, about 1,024 blocks', test: (e) => e <= 8 },
  { id: 'mid', label: '< 1 wk', hint: 'within 40 epochs, about 5,120 blocks', test: (e) => e <= 40 },
  { id: 'far', label: '> 1 wk', hint: 'more than 40 epochs away', test: (e) => e > 40 },
];

const SORTS = [
  { id: 'start', label: 'Window start' },
  { id: 'implied', label: 'Strike vs next' },
  { id: 'margin', label: 'Margin' },
  { id: 'expiry', label: 'Fill by' },
];

/** Every page of the book, up to five, so filtering never hides an offer on a page not yet read. */
async function readBook() {
  const first = await api.getOffers({ limit: api.MAX_OFFER_PAGE });
  let offers = first.offers;
  for (let page = 1; offers.length < first.total && page < 5; page++) {
    const more = await api.getOffers({ offset: offers.length, limit: api.MAX_OFFER_PAGE });
    offers = offers.concat(more.offers);
  }
  return { ...first, offers };
}

/** The window as a strip: the lead before it and its length, on one epoch scale. */
function WindowStrip({ offer, epoch }) {
  const lead = offer.windowStart - epoch;
  const total = lead + offer.windowLength;
  const leadPct = Math.max(4, (lead / total) * 100);
  return (
    <span className={s.windowStrip} title={`Starts in about ${fmtSpan(lead * 128)} and runs about ${fmtSpan(offer.windowLength * 128)}`}>
      <span className={s.windowLead} style={{ width: `${leadPct}%` }} />
      <span className={s.windowBody} style={{ width: `${100 - leadPct}%` }} />
    </span>
  );
}

/**
 * Filling one offer: the quote, the payout against where the window could land, and the fill itself. The
 * quote is re-read when the drawer opens, so what you confirm is what the offer holds now.
 */
function FillDrawer({ offer, acc, onDone, onFilled }) {
  const { keyed, changed, heights } = useExtensions();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .checkFill(offer.boxId)
      .then((q) => live && setQuote(q))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [offer.boxId]);

  const takerLong = offer.makerSide === 'short';
  const next = acc?.nextDifficulty?.difficulty;
  const atNext = next ? sidePayout(takerLong, next, offer.strike, offer.notional) : null;
  const tip = acc?.height ?? 0;
  const startAt = heightTime(epochStart(offer.windowStart), tip);
  const endAt = heightTime(epochEnd(offer.windowEnd), tip);

  const fill = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await api.fillOffer(offer.boxId);
      onFilled(r, takerLong ? 'long' : 'short');
      changed();
    } catch (e) {
      setError(e.status === 409 ? `${e.message}. Someone may have filled it first; the book is being re-read.` : e.message);
      if (e.status === 409) changed();
    } finally {
      setSending(false);
    }
  };

  const view = quote?.offer ?? offer;

  return (
    <div className={s.drawer}>
      <div className={s.drawerGrid}>
        <div>
          <div className={s.drawerHead}>
            <SideChip side={takerLong ? 'long' : 'short'} prefix="you go " />
            <span className={m.cardNote}>
              {takerLong ? 'You gain when the window mean ends above the strike.' : 'You gain when the window mean ends below the strike.'}
            </span>
          </div>
          <div className={s.quoteRows}>
            <div className={m.kv}>
              <span className={m.kvKey}>Your margin</span>
              <span className={m.kvVal}>{fmtLitFull(view.margin, 2)} LIT</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Each 1% move</span>
              <span className={m.kvVal}>± {fmtLitFull(perPercent(view.margin), 2)} LIT</span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Most you can win</span>
              <span className={m.kvVal} style={{ color: COLORS.gain }}>
                {fmtLitFull(view.margin, 2)} LIT
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Most you can lose</span>
              <span className={m.kvVal} style={{ color: COLORS.loss }}>
                {quote ? `${fmtLitFull(quote.maxLoss, 2)} LIT` : '—'}
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>You lock now</span>
              <span className={m.kvVal}>
                {fmtLitFull(view.takerLit, 2)} LIT · {fmtLitFull(view.takerNanoErgs, 4)} ERG
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>At next epoch's level</span>
              <span className={m.kvVal} style={{ color: atNext == null ? undefined : atNext >= 0n ? COLORS.gain : COLORS.loss }}>
                {atNext == null ? '—' : `${fmtLitSigned(atNext)} LIT`}
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Window</span>
              <span className={m.kvVal}>
                {fmtDate(startAt)} → {fmtDate(endAt)}
                {heights && (
                  <span className={s.dimUnit}> · blocks {fmtWindowRange(offer.windowStart, offer.windowLength, true)}</span>
                )}
              </span>
            </div>
            <div className={m.kv}>
              <span className={m.kvKey}>Fill by</span>
              <span className={m.kvVal}>
                block {fmtInt(view.lastFillHeight)} · {fmtSpan(view.lastFillHeight - tip)}
              </span>
            </div>
          </div>
          <p className={m.cardNote}>
            Your margin is your stake: the most you can win and, with 1.5 LIT on top, the most you can lose. For every 1%
            the window's average difficulty ends away from the strike, 5% of the margin moves from one side to the other,
            so a 20% move takes all of it. The 1.5 LIT pays whoever settles and the difficulty record, and does not come
            back. Everything is in LIT, so the LIT price is not hedged.
          </p>
          <p className={m.cardNote}>
            On chain this bet is sized as a notional of {fmtLitFull(view.notional, 0)} LIT, five times the margin.
          </p>
        </div>
        <div>
          <PayoutCurve
            long={takerLong}
            strike={offer.strike}
            notional={offer.notional}
            height={196}
            marks={[
              next ? { move: moveOf(next, offer.strike), label: 'next epoch', color: COLORS.next } : null,
              acc ? { move: moveOf(acc.currentDifficulty, offer.strike), label: 'now', color: COLORS.difficulty } : null,
            ].filter(Boolean)}
          />
          <p className={m.cardNote} style={{ marginTop: 6 }}>
            Your gain or loss against where the window's mean difficulty lands, before rewards. It stops at the margin, a
            20% move either way.
          </p>
        </div>
      </div>

      {quote?.warnings?.map((w) => (
        <Alert key={w} kind="warn">
          {w}
        </Alert>
      ))}
      {quote && !quote.offer.fillable && (
        <Alert kind="warn" title="This offer cannot be filled now">
          {quote.offer.refusal}
        </Alert>
      )}
      {error && <Alert kind="error" title="Fill failed">{error}</Alert>}

      {!keyed ? (
        <KeyGate what="fills" />
      ) : (
        <div className={f.btnRow}>
          <button
            type="button"
            className={f.btn}
            disabled={sending || !quote || !quote.offer.fillable}
            onClick={fill}
          >
            {sending ? 'Filling…' : `Fill: lock ${fmtLit(view.takerLit, 2)} LIT`}
          </button>
          <button type="button" className={`${f.btn} ${f.btnGhost}`} onClick={onDone}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default function OfferBook() {
  const { acc, tick, heights } = useExtensions();
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(null);
  const [filled, setFilled] = useState(null);

  const [side, setSide] = useState('any');
  const [length, setLength] = useState('any');
  const [starts, setStarts] = useState('any');
  const [maxMargin, setMaxMargin] = useState('');
  const [minMargin, setMinMargin] = useState('');
  const [hideMine, setHideMine] = useState(true);
  const [fillableOnly, setFillableOnly] = useState(false);
  const [bin, setBin] = useState(null);
  const [sort, setSort] = useState('start');
  const [ascending, setAscending] = useState(true);

  const load = useCallback(() => {
    setBusy(true);
    readBook()
      .then((b) => {
        setBook(b);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);
  useEffect(load, [load, tick]);

  const base = acc?.nextDifficulty?.difficulty ?? acc?.currentDifficulty;
  const rows = useMemo(
    () =>
      (book?.offers ?? []).map((o) => ({
        ...o,
        takerSide: o.makerSide === 'long' ? 'short' : 'long',
        implied: moveOf(o.strike, base),
        startsIn: o.windowStart - (book?.currentEpoch ?? 0),
      })),
    [book, base],
  );

  const maxMarginLit = parseLit(maxMargin);
  const minMarginLit = parseLit(minMargin);
  const lengthTest = LENGTHS.find((l) => l.id === length).test;
  const startsTest = STARTS.find((x) => x.id === starts).test;

  // Everything except the strike bin, so the ladder shows the whole range the other filters leave
  const prefiltered = useMemo(
    () =>
      rows.filter(
        (o) =>
          (!hideMine || !o.mine) &&
          (!fillableOnly || o.fillable) &&
          lengthTest(o.windowLength) &&
          startsTest(o.startsIn) &&
          (maxMarginLit == null || big(o.margin) <= maxMarginLit) &&
          (minMarginLit == null || big(o.margin) >= minMarginLit),
      ),
    [rows, hideMine, fillableOnly, lengthTest, startsTest, maxMarginLit, minMarginLit],
  );

  const bins = useMemo(
    () =>
      BINS.map((b) => {
        const inBin = prefiltered.filter((o) => o.implied != null && binOf(o.implied) === BINS.indexOf(b));
        const longs = inBin.filter((o) => o.takerSide === 'long');
        const shorts = inBin.filter((o) => o.takerSide === 'short');
        return {
          ...b,
          long: longs.reduce((a, o) => a + big(o.margin), 0n),
          short: shorts.reduce((a, o) => a + big(o.margin), 0n),
          longCount: longs.length,
          shortCount: shorts.length,
        };
      }),
    [prefiltered],
  );

  const shown = useMemo(() => {
    const list = prefiltered.filter(
      (o) => (side === 'any' || o.takerSide === side) && (bin == null || (o.implied != null && binOf(o.implied) === bin)),
    );
    const key = {
      start: (o) => o.windowStart * 1000 + o.windowLength,
      implied: (o) => o.implied ?? 0,
      margin: (o) => Number(big(o.margin) / 1_000_000n),
      expiry: (o) => o.lastFillHeight,
    }[sort];
    return [...list].sort((a, b) => (ascending ? key(a) - key(b) : key(b) - key(a)));
  }, [prefiltered, side, bin, sort, ascending]);

  const paged = usePaged(shown);
  const tip = acc?.height ?? book?.height ?? 0;
  const show = { long: side !== 'short', short: side !== 'long' };
  const filtersOn =
    side !== 'any' || length !== 'any' || starts !== 'any' || maxMargin || minMargin || !hideMine || fillableOnly || bin != null;

  const reset = () => {
    setSide('any');
    setLength('any');
    setStarts('any');
    setMaxMargin('');
    setMinMargin('');
    setHideMine(true);
    setFillableOnly(false);
    setBin(null);
  };

  return (
    <div className={`${m.card} ${m.stackGap}`}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>
          Order book {busy && <Spinner />}
        </h3>
        <div className={m.controls}>
          <div className={m.legend}>
            {[
              { id: 'long', label: 'You go long', color: COLORS.long },
              { id: 'short', label: 'You go short', color: COLORS.short },
            ].map((l) => (
              <button
                key={l.id}
                type="button"
                className={`${m.legendBtn} ${side === 'any' || side === l.id ? m.legendOn : m.legendOff}`}
                style={side === l.id || side === 'any' ? { '--legend-color': l.color } : undefined}
                onClick={() => setSide(side === l.id ? 'any' : l.id)}
                aria-pressed={side === l.id}
              >
                <span className={m.swatch} style={{ background: l.color }} />
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className={m.cardNote} style={{ marginTop: 0, marginBottom: 10 }}>
        Each row is someone's open bet on Ergo's average difficulty over a window of time. Filling one puts you on the
        other side. Long wins if the window's average ends above the strike, short wins if it ends below. The margin is
        each side's stake: every 1% the average lands from the strike moves 5% of it, up to all of it at 20%.
      </p>
      <StrikeLadder bins={bins} show={show} selected={bin} onSelect={setBin} width={1120} />
      <p className={m.cardNote} style={{ marginTop: 6 }}>
        Margin on offer by strike, against the {acc?.nextDifficulty ? "next epoch's" : 'current'} difficulty
        {acc?.nextDifficulty ? `, ${fmtDifficulty(acc.nextDifficulty.difficulty)}` : ''}. Going long at a strike below
        it starts you ahead; going short at a strike above it does too. Click a column to filter the book.
      </p>

      <div className={s.filters}>
        <div className={s.filter}>
          <span className={m.label}>Window length</span>
          <div className={m.seg}>
            {LENGTHS.map((l) => (
              <button key={l.id} type="button" title={l.hint} className={`${m.segBtn} ${length === l.id ? m.segBtnOn : ''}`} onClick={() => setLength(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div className={s.filter}>
          <span className={m.label}>Starts within</span>
          <div className={m.seg}>
            {STARTS.map((x) => (
              <button key={x.id} type="button" title={x.hint} className={`${m.segBtn} ${starts === x.id ? m.segBtnOn : ''}`} onClick={() => setStarts(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
        <label className={s.filter}>
          <span className={m.label}>Margin from</span>
          <span className={s.unitInput}>
            <input value={minMargin} onChange={(e) => setMinMargin(e.target.value)} placeholder="any" inputMode="decimal" />
            <i>LIT</i>
          </span>
        </label>
        <label className={s.filter}>
          <span className={m.label}>Margin up to</span>
          <span className={s.unitInput}>
            <input value={maxMargin} onChange={(e) => setMaxMargin(e.target.value)} placeholder="any" inputMode="decimal" />
            <i>LIT</i>
          </span>
        </label>
        <div className={s.filterChecks}>
          <label>
            <input type="checkbox" checked={hideMine} onChange={(e) => setHideMine(e.target.checked)} /> Hide my offers
          </label>
          <label>
            <input type="checkbox" checked={fillableOnly} onChange={(e) => setFillableOnly(e.target.checked)} /> Fillable now
          </label>
        </div>
      </div>

      <div className={s.tableTools}>
        <span className={m.cardNote}>
          {fmtInt(shown.length)} of {fmtInt(rows.length)} offers
          {bin != null && ` · strikes ${BINS[bin].range}`}
          {filtersOn && (
            <>
              {' · '}
              <button type="button" className={f.linkBtn} onClick={reset}>
                clear filters
              </button>
            </>
          )}
          {book?.truncated && ' · the book scan stopped at its cap, older offers may be missing'}
        </span>
        <div className={m.controls}>
          <span className={m.label}>sort</span>
          <select className={m.pageSelect} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort offers by">
            {SORTS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className={m.textBtn} onClick={() => setAscending((a) => !a)} aria-label="Sort direction">
            {ascending ? '↑ asc' : '↓ desc'}
          </button>
          <PageSize value={paged.size} onChange={paged.setSize} />
        </div>
      </div>

      {error && <Alert kind="error" title="Could not read the book">{error}</Alert>}
      {filled && (
        <TxResult
          title="Filled"
          outcome={filled.result.outcome}
          txId={filled.result.txId}
          rows={[
            ['Position', shortId(filled.result.positionBoxId, 10, 8)],
            ['Your side', filled.side],
          ]}
        >
          <div style={{ marginTop: 8 }}>
            It appears under Portfolio once the node has it.{' '}
            <button type="button" className={f.linkBtn} onClick={() => setFilled(null)}>
              dismiss
            </button>
          </div>
        </TxResult>
      )}

      {!book && !error ? (
        <div className={m.empty}>
          <Spinner /> Reading the book…
        </div>
      ) : shown.length === 0 ? (
        <div className={m.empty}>
          {rows.length === 0 ? 'No open offers yet. Be the first: make one.' : 'No offers match these filters.'}
        </div>
      ) : (
        <div className={s.table}>
          <div className={`${s.tr} ${s.bookTr} ${s.th}`}>
            <span>You take</span>
            <span>Window</span>
            <span>Starts in</span>
            <span className={m.num}>Strike</span>
            <span className={m.num}>vs next</span>
            <span className={m.num} title="Each side's stake: the most either can win or lose">
              Margin
            </span>
            <span className={m.num}>Fill by</span>
            <span />
          </div>
          {paged.rows.map((o) => (
            <React.Fragment key={o.boxId}>
              <div
                className={`${s.tr} ${s.bookTr} ${s.rowHover} ${open === o.boxId ? s.rowOpen : ''} ${o.fillable ? '' : s.rowDim}`}
                onClick={() => setOpen(open === o.boxId ? null : o.boxId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setOpen(open === o.boxId ? null : o.boxId)}
              >
                <span>
                  <SideChip side={o.takerSide} />
                  {o.mine && <span className={s.mineTag}>yours</span>}
                </span>
                <span className={s.windowCell}>
                  <WindowText start={o.windowStart} length={o.windowLength} />
                  <WindowStrip offer={o} epoch={book.currentEpoch} />
                </span>
                <span className={s.dimText}>{fmtStartsIn(o.windowStart, book.currentEpoch, tip, heights)}</span>
                <span className={m.num}>{fmtDifficulty(o.strike, 2)}</span>
                <span className={m.num} style={{ color: o.implied == null ? undefined : (o.implied > 0) === (o.takerSide === 'short') ? COLORS.gain : 'var(--cur-muted)' }}>
                  {fmtMove(o.implied, 1)}
                </span>
                <span className={m.num} title={`You lock ${fmtLitFull(o.takerLit, 2)} LIT: the margin and 1.5 LIT toward settling`}>
                  {fmtLit(o.margin, 1)}
                </span>
                <span className={m.num} title={`Block ${fmtInt(o.lastFillHeight)}, about ${fmtSpan(Math.max(0, o.lastFillHeight - tip))}`}>
                  {heights ? fmtInt(o.lastFillHeight) : fmtSpan(Math.max(0, o.lastFillHeight - tip))}
                </span>
                <span className={s.rowAction}>{o.mine ? '' : o.fillable ? 'Fill' : 'View'}</span>
              </div>
              {open === o.boxId && (
                <FillDrawer
                  offer={o}
                  acc={acc}
                  onDone={() => setOpen(null)}
                  onFilled={(result, side) => {
                    setFilled({ result, side });
                    setOpen(null);
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
      <div className={s.tableFoot}>
        <span className={m.cardNote}>
          {shown.length > 0 && `${fmtInt(paged.first + 1)}–${fmtInt(paged.first + paged.rows.length)} of ${fmtInt(shown.length)}`}
          {' · '}strike vs next is highlighted where the side you take starts ahead.
        </span>
        {paged.pages > 1 && <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />}
      </div>
    </div>
  );
}

/** Offers a strike near `base`: the next epoch's difficulty moved by `frac`. Exported for the offer form. */
export const strikeAt = (base, frac) => scaleDifficulty(base, frac);
