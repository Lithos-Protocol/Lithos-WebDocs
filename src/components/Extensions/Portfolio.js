import React, { useCallback, useEffect, useMemo, useState } from 'react';
import m from '../Mining/styles.module.css';
import f from '../Collateral/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from './ExtensionsLayout';
import { CumulativeLine } from './charts';
import { KeyGate, Kpi, PageSize, Pager, SideChip, StatusChip, usePaged, WindowText } from './ui';
import { Alert, Spinner, TxResult } from '../Dex/ui';
import {
  big,
  COLORS,
  fmtDifficulty,
  fmtInt,
  fmtLit,
  fmtLitFull,
  fmtLitSigned,
  fmtMove,
  fmtSpan,
  fmtWindowRange,
  litText,
  moveOf,
  shortId,
  SIDE_REWARD,
} from './format';

/** A LIT amount as a share of the margin it was won or lost against: "+38% of margin". */
function ofMargin(amount, margin) {
  const m0 = big(margin);
  if (amount == null || m0 <= 0n) return '';
  const pct = Number((big(amount) * 1000n) / m0) / 10;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(Math.abs(pct) < 10 ? 1 : 0)}% of margin`;
}

const toneOf = (raw) => (raw == null ? undefined : big(raw) > 0n ? COLORS.gain : big(raw) < 0n ? COLORS.loss : undefined);

/** How far through its window a position is: epochs known out of its length. */
function Progress({ p }) {
  const frac = p.status === 'waiting' ? 0 : Math.min(1, p.epochsKnown / p.windowLength);
  return (
    <span className={s.progress} title={`${p.epochsKnown} of ${p.windowLength} epochs recorded so far`}>
      <span className={s.progressFill} style={{ width: `${frac * 100}%` }} />
    </span>
  );
}

/** One confirm step for a transaction that needs no amount from the reader: settle or cancel. */
function Confirm({ title, load, rows, act, onDone, onSent, actLabel, note }) {
  const { changed } = useExtensions();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    load()
      .then((q) => live && setQuote(q))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const go = async () => {
    setSending(true);
    setError(null);
    try {
      onSent(await act());
      changed();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={s.drawer}>
      {!quote && !error && (
        <div className={m.cardNote}>
          <Spinner /> Checking…
        </div>
      )}
      {quote && (
        <>
          <div className={s.quoteRows}>
            {rows(quote).map(([k, v, tone]) => (
              <div key={k} className={m.kv}>
                <span className={m.kvKey}>{k}</span>
                <span className={m.kvVal} style={tone ? { color: tone } : undefined}>
                  {v}
                </span>
              </div>
            ))}
          </div>
          {note && <p className={m.cardNote}>{note}</p>}
        </>
      )}
      {error && <Alert kind="error" title={`${title} failed`}>{error}</Alert>}
      <div className={f.btnRow}>
        <button type="button" className={f.btn} disabled={!quote || sending} onClick={go}>
          {sending ? 'Sending…' : actLabel}
        </button>
        <button type="button" className={`${f.btn} ${f.btnGhost}`} onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}

/** A sent transaction, shown by the card whose row it removed. */
function Sent({ sent, onDismiss }) {
  if (!sent) return null;
  return (
    <TxResult title={`${sent.title} sent`} outcome={sent.result.outcome} txId={sent.result.txId}>
      <div style={{ marginTop: 8 }}>
        The row updates once the node has it.{' '}
        <button type="button" className={f.linkBtn} onClick={onDismiss}>
          dismiss
        </button>
      </div>
    </TxResult>
  );
}

function PositionsCard({ list }) {
  const [open, setOpen] = useState(null);
  const [sent, setSent] = useState(null);
  const paged = usePaged(list?.positions ?? []);
  const positions = list?.positions ?? [];
  return (
    <div className={`${m.card} ${m.stackGap}`}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>Open positions</h3>
        <div className={m.controls}>
          <PageSize value={paged.size} onChange={paged.setSize} />
        </div>
      </div>
      <Sent sent={sent} onDismiss={() => setSent(null)} />
      {positions.length === 0 ? (
        <div className={m.empty}>No open positions. Fill an offer from the Market, or post your own.</div>
      ) : (
        <div className={s.table}>
          <div className={`${s.tr} ${s.posTr} ${s.th}`}>
            <span>Side</span>
            <span>Window</span>
            <span>Status</span>
            <span className={m.num}>Strike</span>
            <span className={m.num} title="Where the window's average stands against the strike so far">
              Average
            </span>
            <span className={m.num}>Margin</span>
            <span className={m.num}>If settled now</span>
            <span />
          </div>
          {paged.rows.map((p) => {
            const due = p.status === 'settleable' || p.status === 'refundable';
            return (
              <React.Fragment key={p.boxId}>
                <div className={`${s.tr} ${s.posTr} ${open === p.boxId ? s.rowOpen : ''}`}>
                  <span>
                    <SideChip side={p.side} />
                  </span>
                  <span className={s.windowCell}>
                    <WindowText start={p.windowStart} length={p.windowLength} />
                    <Progress p={p} />
                  </span>
                  <span>
                    <StatusChip status={p.status} />
                  </span>
                  <span className={m.num}>{fmtDifficulty(p.strike, 2)}</span>
                  <span className={m.num} title={p.markDifficulty ? fmtDifficulty(p.markDifficulty, 3) : ''}>
                    {p.markMove == null ? '—' : fmtMove(p.markMove, 1)}
                  </span>
                  <span className={m.num}>{fmtLit(p.margin, 0)}</span>
                  <span className={m.num} style={{ color: toneOf(p.pnl) }} title={ofMargin(p.pnl, p.margin)}>
                    {p.pnl == null ? '—' : fmtLitSigned(p.pnl)}
                  </span>
                  <span className={s.rowAction}>
                    {due && (
                      <button type="button" className={m.textBtn} onClick={() => setOpen(open === p.boxId ? null : p.boxId)}>
                        {p.status === 'refundable' ? 'Refund' : 'Settle'}
                      </button>
                    )}
                  </span>
                </div>
                {open === p.boxId && (
                  <Confirm
                    title={p.status === 'refundable' ? 'Refund' : 'Settlement'}
                    load={() => api.checkSettle(p.boxId)}
                    act={() => api.settlePosition(p.boxId)}
                    onDone={() => setOpen(null)}
                    onSent={(result) => {
                      setSent({ title: p.status === 'refundable' ? 'Refund' : 'Settlement', result });
                      setOpen(null);
                    }}
                    actLabel={p.status === 'refundable' ? 'Refund both margins' : 'Settle now'}
                    note="Anyone can settle a finished position, and Lithos clients do it on their own, by broadcast from an epoch's fourth block by default. Settling now pays the 0.001 ERG fee out of the position and gives you the builder's reward."
                    rows={(q) => [
                      ['Long receives', `${fmtLitFull(q.owedLong, 2)} LIT`],
                      ['Short receives', `${fmtLitFull(q.owedShort, 2)} LIT`],
                      ['Your reward for settling', `${fmtLitFull(q.rewardLit, 2)} LIT`, COLORS.gain],
                      ['Records the current epoch too', q.records ? 'yes' : 'no'],
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      <div className={s.tableFoot}>
        <span className={m.cardNote}>
          Until the window ends, the average uses the newest difficulty known for every epoch not yet recorded, so it
          moves as epochs are recorded. "If settled now" is what your side would win or lose at that average, before the
          {litText(SIDE_REWARD)} of fees each side paid in. Positions settle on their own once the window ends.
        </span>
        {paged.pages > 1 && <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />}
      </div>
    </div>
  );
}

function OffersCard({ list }) {
  const { heights } = useExtensions();
  const [open, setOpen] = useState(null);
  const [sent, setSent] = useState(null);
  const offers = list?.offers ?? [];
  const paged = usePaged(offers);
  const height = list?.height ?? 0;
  return (
    <div className={`${m.card} ${m.stackGap}`}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>Your offers</h3>
        <div className={m.controls}>
          <PageSize value={paged.size} onChange={paged.setSize} />
        </div>
      </div>
      <Sent sent={sent} onDismiss={() => setSent(null)} />
      {offers.length === 0 ? (
        <div className={m.empty}>No offers waiting. Post one under Make an offer.</div>
      ) : (
        <div className={s.table}>
          <div className={`${s.tr} ${s.offerTr} ${s.th}`}>
            <span>Your side</span>
            <span>Window</span>
            <span className={m.num}>Strike</span>
            <span className={m.num}>Margin</span>
            <span className={m.num}>Locked</span>
            <span>Status</span>
            <span className={m.num}>Fill by</span>
            <span />
          </div>
          {paged.rows.map((o) => {
            const live = o.lastFillHeight > height;
            return (
              <React.Fragment key={o.boxId}>
                <div className={`${s.tr} ${s.offerTr} ${open === o.boxId ? s.rowOpen : ''}`}>
                  <span>
                    <SideChip side={o.makerSide} />
                  </span>
                  <WindowText start={o.windowStart} length={o.windowLength} />
                  <span className={m.num}>{fmtDifficulty(o.strike, 2)}</span>
                  <span className={m.num}>{fmtLit(o.margin, 0)}</span>
                  <span className={m.num}>{fmtLit(o.lit, 1)}</span>
                  <span>
                    <StatusChip status={live ? 'open' : 'expired'} />
                  </span>
                  <span className={m.num} title={`Block ${fmtInt(o.lastFillHeight)}`}>
                    {live ? (heights ? fmtInt(o.lastFillHeight) : fmtSpan(o.lastFillHeight - height)) : '—'}
                  </span>
                  <span className={s.rowAction}>
                    <button type="button" className={m.textBtn} onClick={() => setOpen(open === o.boxId ? null : o.boxId)}>
                      Cancel
                    </button>
                  </span>
                </div>
                {open === o.boxId && (
                  <Confirm
                    title="Cancel"
                    load={() => api.checkCancel(o.boxId)}
                    act={() => api.cancelOffer(o.boxId)}
                    onDone={() => setOpen(null)}
                    onSent={(result) => {
                      setSent({ title: 'Cancel', result });
                      setOpen(null);
                    }}
                    actLabel="Cancel and return it"
                    note={live ? 'A taker may fill it before the cancel confirms; then the cancel is dropped.' : undefined}
                    rows={(q) => [
                      ['Returns', `${fmtLitFull(q.returnedLit, 2)} LIT`],
                      ['And', `${fmtLitFull(q.returnedNanoErgs, 4)} ERG`],
                      ['Network fee', `${fmtLitFull(q.networkFee, 4)} ERG${q.feeFromOffer ? ', from the offer' : ''}`],
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      <div className={s.tableFoot}>
        <span className={m.cardNote}>An expired offer can no longer fill. Its LIT stays locked until you cancel it.</span>
        {paged.pages > 1 && <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />}
      </div>
    </div>
  );
}

function HistoryCard({ history, error }) {
  const { heights } = useExtensions();
  const [view, setView] = useState('settled');
  const settled = history?.settled ?? [];
  const closed = history?.offers ?? [];
  const pagedSettled = usePaged(settled);
  const pagedClosed = usePaged(closed);
  const points = useMemo(
    () =>
      [...settled]
        .sort((a, b) => a.settledAt - b.settledAt)
        .map((v) => ({
          t: v.settledAt,
          net: v.net,
          label: `${heights ? 'blocks' : 'epochs'} ${fmtWindowRange(v.windowStart, v.windowLength, heights)}`,
        })),
    [settled, heights],
  );
  const paged = view === 'settled' ? pagedSettled : pagedClosed;

  return (
    <div className={`${m.card} ${m.stackGap}`}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>History</h3>
        <div className={m.controls}>
          <div className={m.seg}>
            {[
              { id: 'settled', label: `Settled · ${settled.length}` },
              { id: 'offers', label: `Closed offers · ${closed.length}` },
            ].map((t) => (
              <button key={t.id} type="button" className={`${m.segBtn} ${view === t.id ? m.segBtnOn : ''}`} onClick={() => setView(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <PageSize value={paged.size} onChange={paged.setSize} />
        </div>
      </div>
      {error && <Alert kind="error" title="Could not read your history">{error}</Alert>}

      {view === 'settled' ? (
        <>
          <CumulativeLine points={points} width={1120} />
          {settled.length > 0 && (
            <div className={s.table} style={{ marginTop: 10 }}>
              <div className={`${s.tr} ${s.histTr} ${s.th}`}>
                <span>Settled</span>
                <span>Side</span>
                <span>Window</span>
                <span className={m.num}>Strike</span>
                <span className={m.num}>Window average</span>
                <span className={m.num}>Margin</span>
                <span className={m.num}>Net</span>
              </div>
              {pagedSettled.rows.map((v) => (
                <div key={v.boxId} className={`${s.tr} ${s.histTr}`} title={`Settlement ${v.txId}`}>
                  <span className={s.dimText}>
                    {new Date(v.settledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span>
                    <SideChip side={v.side} />
                  </span>
                  <WindowText start={v.windowStart} length={v.windowLength} />
                  <span className={m.num}>{fmtDifficulty(v.strike, 2)}</span>
                  <span className={m.num}>
                    {v.refund ? <StatusChip status="refunded" /> : `${fmtDifficulty(v.windowMean, 2)} · ${fmtMove(moveOf(v.windowMean, v.strike), 1)}`}
                  </span>
                  <span className={m.num} title={`Received ${fmtLitFull(v.received, 2)} LIT`}>{fmtLit(v.margin, 0)}</span>
                  <span className={m.num} style={{ color: toneOf(v.net), fontWeight: 600 }} title={ofMargin(v.net, v.margin)}>
                    {fmtLitSigned(v.net)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : closed.length === 0 ? (
        <div className={m.empty}>No offers of yours have been filled or cancelled yet.</div>
      ) : (
        <div className={s.table}>
          <div className={`${s.tr} ${s.closedTr} ${s.th}`}>
            <span>Closed</span>
            <span>Your side</span>
            <span>Window</span>
            <span className={m.num}>Strike</span>
            <span className={m.num}>Margin</span>
            <span>Outcome</span>
            <span>Position</span>
          </div>
          {pagedClosed.rows.map((o) => (
            <div key={o.boxId} className={`${s.tr} ${s.closedTr}`} title={`Transaction ${o.txId}`}>
              <span className={s.dimText}>
                {new Date(o.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span>
                <SideChip side={o.makerSide} />
              </span>
              <WindowText start={o.windowStart} length={o.windowLength} />
              <span className={m.num}>{fmtDifficulty(o.strike, 2)}</span>
              <span className={m.num}>{fmtLit(big(o.notional) / 5n, 0)}</span>
              <span>
                <StatusChip status={o.outcome} />
              </span>
              <span className={s.dimText}>{o.positionBoxId ? shortId(o.positionBoxId, 8, 6) : ''}</span>
            </div>
          ))}
        </div>
      )}
      <div className={s.tableFoot}>
        <span className={m.cardNote}>
          Net is what your side got back less what it put in: its margin and its {litText(SIDE_REWARD)} of fees.
          {history?.truncated && ' Older history is past the scan cap and not shown.'}
        </span>
        {paged.pages > 1 && <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { keyed, tick, version } = useExtensions();
  const [list, setList] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!keyed) return;
    setBusy(true);
    api
      .getPositions()
      .then((p) => {
        setList(p);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [keyed]);
  useEffect(load, [load, tick]);

  // History reads every settlement transaction, so it is re-read only when this page sends something
  useEffect(() => {
    if (!keyed) return;
    api
      .getHistory()
      .then((h) => {
        setHistory(h);
        setHistoryError(null);
      })
      .catch((e) => setHistoryError(e.message));
  }, [keyed, version]);

  if (!keyed) return <KeyGate what="your positions, offers and history" />;

  const positions = list?.positions ?? [];
  const openOffers = (list?.offers ?? []).filter((o) => o.lastFillHeight > (list?.height ?? 0));
  const markPnl = positions.reduce((a, p) => a + big(p.pnl), 0n);
  const atStake = positions.reduce((a, p) => a + big(p.margin), 0n);
  const due = positions.filter((p) => p.status === 'settleable' || p.status === 'refundable').length;

  return (
    <>
      {error && <Alert kind="error" title="Could not read your positions">{error}</Alert>}
      <div className={s.kpis}>
        <Kpi
          label="Open positions"
          value={list ? fmtInt(positions.length) : '—'}
          sub={list ? `${fmtLit(atStake, 0)} LIT of margin at stake${due ? ` · ${due} ready to settle` : ''}` : busy ? 'loading…' : ''}
        />
        <Kpi
          label="If settled now"
          value={list ? fmtLitSigned(markPnl) : '—'}
          unit="LIT"
          tone={toneOf(markPnl)}
          sub={list && atStake > 0n ? `${ofMargin(markPnl, atStake)} · open positions` : 'open positions, before fees'}
        />
        <Kpi
          label="Realized net"
          value={history ? fmtLitSigned(history.realizedNet) : '—'}
          unit="LIT"
          tone={toneOf(history?.realizedNet)}
          sub={history ? `${fmtInt(history.wins)} won · ${fmtInt(history.losses)} lost · after fees` : ''}
        />
        <Kpi
          label="Offers waiting"
          value={list ? fmtInt(openOffers.length) : '—'}
          sub={list ? `${fmtInt((list.offers ?? []).length - openOffers.length)} expired, still locked` : ''}
        />
      </div>
      <PositionsCard list={list} />
      <OffersCard list={list} />
      <HistoryCard history={history} error={historyError} />
    </>
  );
}
