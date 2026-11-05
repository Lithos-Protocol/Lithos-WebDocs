import React, { useEffect, useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import m from '../Mining/styles.module.css';
import x from '../Extensions/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { Kpi, PageSize, Pager, usePaged } from '../Extensions/ui';
import { Alert, Spinner } from '../Dex/ui';
import { assetName, Contents, IdTag, useTokens } from './tokens';
import { ActionDrawer, AprCell, FeeCell, LoanCell, Principal, Repayment, TermCell, termOf } from './Shared';
import { aprOf, big, fmtErg, fmtInt, pct } from './format';

/** The three lists: what a lender can fill, what a borrower can close, and the bonds already made. */
const VIEWS = [
  { id: 'orders', label: 'Lend', note: 'Borrowers asking for a loan. Lend to one to earn its return.' },
  { id: 'offers', label: 'Borrow', note: 'Lenders offering a loan. Borrow from one by posting the collateral it asks for.' },
  { id: 'bonds', label: 'Live bonds', note: 'Loans made and not yet repaid or liquidated.' },
];

const SORTS = [
  { id: 'apr', label: 'Highest APR' },
  { id: 'term', label: 'Shortest term' },
  { id: 'newest', label: 'Newest' },
];

/** The loan's asset: ERG, or the token lent. */
const loanAsset = (t) => t.principalToken?.tokenId ?? 'ERG';
/** Every asset the collateral holds. */
const collateralAssets = (t) => [...(big(t.collateralNanoErgs) > 0n ? ['ERG'] : []), ...t.collateralTokens.map((c) => c.tokenId)];

/** A menu of the assets present, ERG first, then by name. */
function AssetMenu({ label, value, onChange, assets }) {
  const { verified } = useTokens() ?? {};
  const sorted = [...assets].sort((a, b) => (a === 'ERG' ? -1 : b === 'ERG' ? 1 : assetName(verified, a).localeCompare(assetName(verified, b))));
  return (
    <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: any</option>
      {sorted.map((a) => (
        <option key={a} value={a}>
          {label}: {assetName(verified, a)}
        </option>
      ))}
    </select>
  );
}

export default function Book() {
  const { tick, version, height } = useExtensions();
  const [view, setView] = useState('orders');
  const [loan, setLoan] = useState('');
  const [collateral, setCollateral] = useState('');
  const [all, setAll] = useState(false);
  const [hideMine, setHideMine] = useState(false);
  const [sort, setSort] = useState('apr');
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  // All three lists at once: the strip summarises them, and switching lists costs no read
  useEffect(() => {
    let live = true;
    setBusy(true);
    Promise.all([
      api.allPages(api.getOrders, 'orders'),
      api.allPages(api.getOffers, 'offers'),
      api.allPages((p) => api.getBonds({ ...p, all: true }), 'bonds'),
    ])
      .then(([o, f, b]) => {
        if (!live) return;
        setBook({ height: o.height, orders: o.orders, offers: f.offers, bonds: b.bonds, truncated: o.truncated || f.truncated || b.truncated });
        setError(null);
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [tick, version]);

  const tip = book?.height ?? height ?? 0;
  const source = useMemo(() => {
    if (!book) return [];
    return view === 'bonds' ? book.bonds.filter((b) => all || b.verified) : book[view];
  }, [book, view, all]);

  const assets = useMemo(() => {
    const loans = new Set();
    const coll = new Set();
    source.forEach((r) => {
      loans.add(loanAsset(r.terms));
      collateralAssets(r.terms).forEach((a) => coll.add(a));
    });
    return { loans: [...loans], coll: [...coll] };
  }, [source]);

  const rows = useMemo(() => {
    const list = source.filter(
      (r) =>
        !(hideMine && (r.mine || r.borrowerIsMe)) &&
        (!loan || loanAsset(r.terms) === loan) &&
        (!collateral || collateralAssets(r.terms).includes(collateral)),
    );
    const key = {
      apr: (r) => -(aprOf(r.terms, tip) ?? -Infinity),
      term: (r) => termOf(r.terms, tip),
      newest: (r) => -r.creationHeight,
    }[sort];
    return [...list].sort((a, b) => key(a) - key(b));
  }, [source, hideMine, loan, collateral, sort, tip]);
  const paged = usePaged(rows);

  const strip = useMemo(() => {
    if (!book) return null;
    const ergSum = (list) => list.filter((r) => !r.terms.principalToken).reduce((n, r) => n + big(r.terms.principalNanoErgs), 0n);
    const best = book.orders
      .filter((o) => !o.mine && !o.refusal)
      .map((o) => aprOf(o.terms, tip))
      .filter((v) => v != null);
    const live = book.bonds.filter((b) => b.verified);
    return {
      orders: book.orders.length,
      asked: ergSum(book.orders),
      offers: book.offers.length,
      offered: ergSum(book.offers),
      bonds: live.length,
      matured: live.filter((b) => b.status === 'matured').length,
      best: best.length ? Math.max(...best) : null,
    };
  }, [book, tip]);

  const pick = (id) => {
    setView(id);
    setOpen(null);
    setLoan('');
    setCollateral('');
  };

  return (
    <>
      <div className={s.kpis}>
        <Kpi label="Open orders" value={strip ? fmtInt(strip.orders) : '—'} sub={strip ? `${fmtErg(strip.asked, 2)} ERG asked` : 'Loading'} />
        <Kpi label="Open offers" value={strip ? fmtInt(strip.offers) : '—'} sub={strip ? `${fmtErg(strip.offered, 2)} ERG offered` : 'Loading'} />
        <Kpi label="Live bonds" value={strip ? fmtInt(strip.bonds) : '—'} sub={strip ? `${fmtInt(strip.matured)} matured, awaiting liquidation` : 'Loading'} />
        <Kpi
          label="Best lending APR"
          value={strip?.best != null ? pct(strip.best, 1) : '—'}
          tone={strip?.best != null ? 'var(--cur-green)' : undefined}
          sub="Across open orders"
        />
      </div>

      <div className={m.card}>
        <div className={m.cardHead}>
          <h3 className={m.cardTitle}>Market {busy && <Spinner />}</h3>
          <div className={m.seg}>
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={`${m.segBtn} ${view === v.id ? m.segBtnOn : ''}`} onClick={() => pick(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <p className={m.cardNote} style={{ marginTop: 0 }}>
          {VIEWS.find((v) => v.id === view).note} <Link to="/extensions/sigmafi/guide">How bonds work</Link>
        </p>

        <div className={s.toolbar}>
          <div className={s.toolGroup}>
            <AssetMenu label="Loan" value={loan} onChange={setLoan} assets={assets.loans} />
            <AssetMenu label="Collateral" value={collateral} onChange={setCollateral} assets={assets.coll} />
            <label className={s.check}>
              <input type="checkbox" checked={hideMine} onChange={(e) => setHideMine(e.target.checked)} /> Hide mine
            </label>
            {view === 'bonds' && (
              <label className={s.check} title="A bond is verified when it is the one its bond asset's order or offer created">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include unverified
              </label>
            )}
          </div>
          <div className={s.toolGroup}>
            <select className={s.select} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              {SORTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <PageSize value={paged.size} onChange={paged.setSize} />
          </div>
        </div>

        {error && <Alert kind="error" title="Could not read the market">{error}</Alert>}
        {book?.truncated && <p className={m.cardNote}>A scan stopped at its cap, so older boxes may be missing.</p>}

        {!book && !error ? (
          <div className={m.empty}>
            <Spinner /> Reading the market
          </div>
        ) : rows.length === 0 ? (
          <div className={m.empty}>
            {source.length > 0 ? 'Nothing matches these filters.' : view === 'bonds' ? 'No live bonds.' : 'Nothing open yet. '}
            {source.length === 0 && view !== 'bonds' && <Link to="/extensions/sigmafi/create">Create the first</Link>}
          </div>
        ) : view === 'bonds' ? (
          <BondTable rows={paged.rows} tip={tip} open={open} setOpen={setOpen} />
        ) : (
          <div className={x.table}>
            <div className={`${x.tr} ${s.bookTr} ${x.th}`}>
              <span>Loan</span>
              <span>APR</span>
              <span>Term</span>
              <span>Collateral</span>
              <span>Batching fee</span>
              <span />
            </div>
            {paged.rows.map((r) => {
              const action = r.mine ? (view === 'orders' ? 'cancelOrder' : 'cancelOffer') : view === 'orders' ? 'fillOrder' : 'closeOffer';
              const usable = r.mine || !r.refusal;
              const toggle = () => setOpen(open === r.boxId ? null : r.boxId);
              return (
                <React.Fragment key={r.boxId}>
                  <div
                    className={`${x.tr} ${s.bookTr} ${x.rowHover} ${open === r.boxId ? x.rowOpen : ''} ${usable ? '' : x.rowDim}`}
                    onClick={toggle}
                    role="button"
                    tabIndex={0}
                    title={r.refusal ?? undefined}
                    onKeyDown={(e) => e.key === 'Enter' && toggle()}
                  >
                    <LoanCell t={r.terms} mine={r.mine} />
                    <AprCell t={r.terms} tip={tip} />
                    <TermCell t={r.terms} tip={tip} />
                    <span className={s.cell}>
                      <Contents nanoErgs={r.terms.collateralNanoErgs} tokens={r.terms.collateralTokens} />
                    </span>
                    <FeeCell t={r.terms} />
                    <span className={s.actionCell}>
                      <span className={`${s.actionBtn} ${usable && !r.mine ? '' : s.actionQuiet}`}>
                        {r.mine ? 'Cancel' : usable ? api.ACTIONS[action].label : 'Details'}
                      </span>
                    </span>
                  </div>
                  {open === r.boxId && <ActionDrawer action={action} id={r.boxId} tip={tip} onDone={() => setOpen(null)} />}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <div className={x.tableFoot}>
          <span className={m.cardNote}>
            {rows.length > 0 && `${fmtInt(paged.first + 1)} to ${fmtInt(paged.first + paged.rows.length)} of ${fmtInt(rows.length)}`}
          </span>
          {paged.pages > 1 && <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />}
        </div>
      </div>
    </>
  );
}

/** Live bonds: what each is owed, by when, and whether it is the bond its asset was minted for. */
export function BondTable({ rows, tip, open, setOpen, actionFor }) {
  return (
    <div className={x.table}>
      <div className={`${x.tr} ${s.bondTr} ${x.th}`}>
        <span>Owed</span>
        <span>APR</span>
        <span>Term</span>
        <span>Collateral</span>
        <span>Bond asset</span>
        <span />
      </div>
      {rows.map((b) => {
        const action = actionFor ? actionFor(b) : b.status === 'matured' ? 'liquidate' : null;
        const toggle = () => action && setOpen(open === b.boxId ? null : b.boxId);
        return (
          <React.Fragment key={b.boxId}>
            <div
              className={`${x.tr} ${s.bondTr} ${action ? x.rowHover : ''} ${open === b.boxId ? x.rowOpen : ''}`}
              onClick={toggle}
              role={action ? 'button' : undefined}
              tabIndex={action ? 0 : undefined}
              onKeyDown={(e) => e.key === 'Enter' && toggle()}
            >
              <span className={s.cell}>
                <span>
                  <Repayment t={b.terms} /> {b.borrowerIsMe && <span className={s.yours}>Yours</span>}
                </span>
                <span className={s.sub}>
                  {b.terms.principalNanoErgs != null || b.terms.principalToken ? (
                    <>
                      Lent <Principal t={b.terms} />
                    </>
                  ) : (
                    'Loan not known'
                  )}
                </span>
              </span>
              <AprCell t={b.terms} tip={tip} />
              <TermCell t={b.terms} tip={tip} />
              <span className={s.cell}>
                <Contents nanoErgs={b.terms.collateralNanoErgs} tokens={b.terms.collateralTokens} />
              </span>
              <span className={s.cell} title={b.verification ?? 'The bond its asset was minted for'}>
                <IdTag tokenId={b.assetId} />
                <span className={`${s.sub} ${b.verified ? s.verifyOk : s.verifyNo}`}>{b.verified ? 'Verified' : 'Not verified'}</span>
              </span>
              <span className={s.actionCell}>{action && <span className={s.actionBtn}>{api.ACTIONS[action].label}</span>}</span>
            </div>
            {open === b.boxId && action && <ActionDrawer action={action} id={b.boxId} tip={tip} onDone={() => setOpen(null)} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}
