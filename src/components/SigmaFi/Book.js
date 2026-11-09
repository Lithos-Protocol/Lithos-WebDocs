import React, { useEffect, useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import m from '../Mining/styles.module.css';
import x from '../Extensions/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { Pager, usePaged } from '../Extensions/ui';
import { Alert, Spinner } from '../Dex/ui';
import { assetName, Contents, TokenAmount, useTokens } from './tokens';
import { ActionDrawer, InterestCell, Collateral, Principal, Repayment, TermCell, termOf } from './Shared';
import { aprOf, interestOf, big, fmtInt, pct } from './format';
import BondIcon from '../Wallet/BondIcon';
import { collateralOf, bondAssetName } from './bond';
import TokenIcon from '../Wallet/TokenIcon';
import { usePricing, HealthHelp, UsdValue } from './PriceContext';
import { collateralization, compareHealth } from './pricing';

const SORTS = [{ id: 'newest', label: 'Newest' }, { id: 'interest', label: 'Highest interest' }, { id: 'term', label: 'Shortest term' }, {id:'healthHigh',label:'Highest collateral ratio'}, {id:'healthLow',label:'Lowest collateral ratio'}];
const loanAsset = (t) => t.principalToken?.tokenId ?? t.repayToken ?? 'ERG';
const collateralAssets = (t) => [...(collateralOf(t).collateral > 0n ? ['ERG'] : []), ...t.collateralTokens.map((c) => c.tokenId)];

function AssetMenu({ label, value, onChange, assets }) {
  const { metadata, checks } = useTokens();
  return <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
    <option value="">All assets</option>
    {[...assets].sort((a, b) => assetName(metadata, a, checks).localeCompare(assetName(metadata, b, checks))).map((a) => <option key={a} value={a}>{assetName(metadata, a, checks)}</option>)}
  </select>;
}

function Metric({ label, children, note }) {
  return <div className={s.metric}><span className={s.fieldLabel}>{label}</span><strong>{children}</strong><span className={s.hint}>{note}</span></div>;
}

export function RequestCards({ rows, tip, open, setOpen }) {
  return <div className={s.loanGrid}>{rows.map((r) => {
    const expanded = open === r.boxId;
    const action = r.mine ? 'cancelOrder' : 'fillOrder';
    return <article key={r.boxId} className={`${s.loanCard} ${expanded ? s.expanded : ''}`}>
      <div className={s.loanCardBody}>
        <div className={s.loanTop}><span className={s.loanType}>{r.mine ? 'Your request' : 'Loan request'}</span><span className={s.liveBadge}>{r.refusal && !r.mine ? 'Unavailable' : 'Open'}</span></div>
        {!expanded && <>
        <div className={s.loanHeading}><Principal t={r.terms} /><InterestCell t={r.terms} tip={tip} /></div>
        <div className={s.collateralWell}><span className={s.fieldLabel}>Collateral</span><Collateral t={r.terms} breakdown unfilled /></div>
        <div className={s.loanDetails}>
          <div><span className={s.fieldLabel}>Term</span><TermCell t={r.terms} tip={tip} /></div>
          <div><span className={s.fieldLabel}>Repayment</span><Repayment t={r.terms} /></div>
        </div>
        {r.refusal && !r.mine && <p className={s.refusal}>{r.refusal}</p>}
        </>}
        <button type="button" className={`${s.cardButton} ${r.mine ? s.secondaryBtn : ''}`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : r.boxId)}>
          {expanded ? 'Close preview' : r.mine ? 'Cancel request' : r.refusal ? 'View details' : 'Lend'} <span aria-hidden="true">{expanded ? '−' : '↗'}</span>
        </button>
      </div>
      {expanded && <ActionDrawer action={action} id={r.boxId} tip={tip} terms={r.terms} onDone={() => setOpen(null)} />}
    </article>;
  })}</div>;
}

export default function Book() {
  const { tick, version, height, changed, error: clientError } = useExtensions();
  const pricing = usePricing();
  const [healthFilter,setHealthFilter] = useState('');
  const [view, setView] = useState('orders');
  const [loan, setLoan] = useState('');
  const [collateral, setCollateral] = useState('');
  const [all, setAll] = useState(false);
  const [hideMine, setHideMine] = useState(false);
  const [sort, setSort] = useState('newest');
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let live = true;
    setBusy(true);
    Promise.all([api.allPages(api.getOrders, 'orders'), api.allPages((p) => api.getBonds({ ...p, all: true }), 'bonds')])
      .then(([o, b]) => {
        if (!live) return;
        setBook({ height: o.height, orders: o.orders, bonds: b.bonds, truncated: o.truncated || b.truncated });
        setError(null);
      }).catch((e) => live && setError(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [tick, version]);
  const tip = book?.height ?? height;
  const source = useMemo(() => !book ? [] : view === 'bonds' ? book.bonds.filter((b) => all || b.verified) : book.orders, [book, view, all]);
  const assets = useMemo(() => ({ loans: [...new Set(source.map((r) => loanAsset(r.terms)))], collateral: [...new Set(source.flatMap((r) => collateralAssets(r.terms)))] }), [source]);
  const health = useMemo(() => new Map(source.map(r => [r.boxId,collateralization(r.terms,pricing)])),[source,pricing]);
  const rows = useMemo(() => source.filter((r) => {
    const rating=health.get(r.boxId);
    return !(hideMine && (r.mine || r.borrowerIsMe)) && (!loan || loanAsset(r.terms) === loan) && (!collateral || collateralAssets(r.terms).includes(collateral)) && (!healthFilter || (healthFilter === 'unpriced' ? rating.ratio==null || rating.partial : rating.ratio!=null && rating.ratio>=Number(healthFilter)));
  }).sort((a, b) => sort.startsWith('health') ? compareHealth(health.get(a.boxId),health.get(b.boxId),sort==='healthHigh'?-1:1) : sort === 'interest' ? (interestOf(b.terms) ?? -Infinity) - (interestOf(a.terms) ?? -Infinity) : sort === 'term' ? termOf(a.terms, tip) - termOf(b.terms, tip) : b.creationHeight - a.creationHeight), [source, hideMine, loan, collateral, sort, tip, health, healthFilter]);
  const paged = usePaged(rows, 12);
  const liveBonds = book?.bonds.filter((b) => b.verified) ?? [];
  const best = book?.orders.filter((o) => !o.mine && !o.refusal && interestOf(o.terms) != null).sort((a, b) => interestOf(b.terms) - interestOf(a.terms))[0];
  const ergRequested = book?.orders.filter((o) => !o.terms.principalToken).reduce((n, o) => n + big(o.terms.principalNanoErgs), 0n);
  return <>
    <div className={`${s.marketHead} ${s.bookHeading}`}>
      <div><h2 className={s.sectionHeading}>Lending market {busy && <Spinner />}</h2><p className={s.intro}>Explore collateral and terms. Fund a request to start lending.</p></div>
      <Link className={s.createLink} to="/extensions/sigmafi/create">+ Borrow</Link>
    </div>
    <div className={s.kpis}>
      <Metric label="Loan requests" note="Open in the market">{book ? fmtInt(book.orders.length) : '—'}</Metric>
      <Metric label="ERG requested" note={book ? <><UsdValue tokenId="ERG" amount={ergRequested} />ERG loans only</> : 'ERG loans only'}>{book ? <TokenAmount tokenId="ERG" amount={ergRequested} /> : '—'}</Metric>
      <Metric label="Active bonds" note={book ? `${liveBonds.filter((b) => b.status === 'matured').length} matured` : 'Verified bonds'}>{book ? fmtInt(liveBonds.length) : '—'}</Metric>
      <Metric label="Highest interest" note={best ? `${pct(aprOf(best.terms, tip), 1)} APR · available requests` : 'Available requests'}>{best ? <span className={s.interest}>{pct(interestOf(best.terms))}</span> : '—'}</Metric>
    </div>
    <section className={s.marketControls} aria-label="Market controls">
      <div className={s.marketControlTop}>
        <div className={s.marketTabs}>
          {[['orders', 'Loan requests'], ['bonds', 'Active bonds']].map(([id, label]) => <button type="button" key={id} className={`${s.marketTab} ${view === id ? s.marketTabActive : ''}`} aria-pressed={view === id} onClick={() => { setView(id); setOpen(null); setLoan(''); setCollateral(''); paged.setPage(0); }}>{label}<span>{book ? id === 'orders' ? book.orders.length : liveBonds.length : '—'}</span></button>)}
        </div>
        <div className={s.marketSort}>
          <label className={s.sortField}><span>Sort by</span><select className={s.select} value={sort} onChange={(e) => { setSort(e.target.value); paged.setPage(0); }} aria-label="Sort loans">{SORTS.map((v) => <option value={v.id} key={v.id}>{v.label}</option>)}</select></label>
          <button type="button" className={s.refreshBtn} aria-label="Refresh market" disabled={busy} onClick={changed}>↻</button>
        </div>
      </div>
      <div className={s.marketFilters}>
        <label className={s.filterField}><span>Loan asset</span><AssetMenu label="Loan assets" value={loan} assets={assets.loans} onChange={(v) => { setLoan(v); paged.setPage(0); }} /></label>
        <label className={s.filterField}><span>Collateral</span><AssetMenu label="Collateral assets" value={collateral} assets={assets.collateral} onChange={(v) => { setCollateral(v); paged.setPage(0); }} /></label>
        <div className={s.filterField}><span>Collateral Ratio <HealthHelp /></span><select className={s.select} aria-label="Collateral Ratio filter" value={healthFilter} onChange={e=>{setHealthFilter(e.target.value);paged.setPage(0);}}><option value="">All ratios</option>{[80,90,100,125,150,175,200,300].map(n=><option key={n} value={n}>At least {n}%</option>)}<option value="unpriced">Unpriced or partial</option></select></div>
        <div className={s.filterFlags}>
          <label className={s.check}><input type="checkbox" checked={hideMine} onChange={(e) => { setHideMine(e.target.checked); paged.setPage(0); }} />Hide mine</label>
          {view === 'bonds' && <label className={s.check}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Include unverified</label>}
        </div>
      </div>
    </section>
    {error && error !== clientError && <Alert kind="error" title="Market unavailable">{error}</Alert>}
    {book?.truncated && <Alert kind="warn">The scan reached its limit. Totals cover the loaded requests and bonds.</Alert>}
    {!book && !error ? <div className={s.empty}><Spinner /> Loading market</div> : error && !book ? null : rows.length === 0 ? <div className={s.empty}><span className={s.emptyIcon} aria-hidden="true">◇</span><h3>{source.length ? 'No matching loans' : view === 'bonds' ? 'No active bonds' : 'No loan requests'}</h3><p>{source.length ? 'Try another asset or clear your filters.' : 'New requests and funded loans appear here.'}</p>{view === 'orders' && <Link to="/extensions/sigmafi/create">Create a loan request ↗</Link>}</div> : view === 'bonds' ? <BondTable rows={paged.rows} tip={tip} open={open} setOpen={setOpen} /> : <RequestCards rows={paged.rows} tip={tip} open={open} setOpen={setOpen} />}
    {rows.length > 0 && <div className={x.tableFoot}><span className={s.hint}>{paged.first + 1}–{paged.first + paged.rows.length} of {rows.length}</span><div className={s.toolGroup}><select className={s.select} value={paged.size} onChange={(e) => paged.setSize(Number(e.target.value))} aria-label="Loans per page">{[12,24,48].map((n) => <option key={n} value={n}>{n} per page</option>)}</select>{paged.pages > 1 && <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />}</div></div>}
    <p className={s.marketNote}>APR is annualized using the remaining term and estimated block time. Review the collateral and choose your batching reserve before lending.</p>
  </>;
}

export function BondTable({ rows, tip, open, setOpen, actionFor }) {
  return <div className={s.loanGrid}>{rows.map((b) => {
    const action = actionFor ? actionFor(b) : b.status === 'matured' && b.verified ? 'liquidate' : null;
    const expanded = open === b.boxId;
    return <article key={b.boxId} className={`${s.loanCard} ${expanded ? s.expanded : ''}`}>
      <div className={s.loanCardBody}>
        <div className={s.loanTop}><span className={s.bondHeading}><>{b.verified ? <BondIcon bond={b} size={28} /> : <TokenIcon tokenId={b.assetId} size={28} />}</><span className={s.assetName}>{bondAssetName(b.assetId)}</span></span><span className={b.status === 'matured' ? s.maturedBadge : s.liveBadge}>{b.status === 'matured' ? 'Matured' : 'Active'}</span></div>
        {!expanded && <>
        <div className={s.loanHeading}><Repayment t={b.terms} /><InterestCell t={b.terms} tip={tip} /></div>
        <span className={s.sub}>Repayment · {b.verified ? 'Verified origin' : 'Unverified origin'}</span>
        <div className={s.collateralWell}><span className={s.fieldLabel}>Collateral</span><Collateral t={b.terms} breakdown /></div>
        <div className={s.loanDetails}><div><span className={s.fieldLabel}>Maturity</span><TermCell t={b.terms} tip={tip} /></div></div>
        <TokenAmount tokenId={b.assetId} amount="1" />
        {!b.verified && <p className={s.refusal}>{b.verification ?? 'The client could not verify this bond’s origin.'}</p>}
        </>}
        {action && <button type="button" className={`${s.cardButton} ${s.bondAction}`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : b.boxId)}>{expanded ? 'Close preview' : api.ACTIONS[action].label}<span aria-hidden="true">↗</span></button>}
      </div>
      {expanded && action && <ActionDrawer action={action} id={b.boxId} tip={tip} terms={b.terms} onDone={() => setOpen(null)} />}
    </article>;
  })}</div>;
}
