import React, { useEffect, useState } from 'react';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { KeyGate, Pager, usePaged } from '../Extensions/ui';
import { Alert, Spinner } from '../Dex/ui';
import { AssetIcon, Contents, TokenAmount } from './tokens';
import { ActionDrawer, Collateral, Repayment, TermCell } from './Shared';
import { BondTable, RequestCards } from './Book';

function Holdings({ rows, tip, open, setOpen }) {
  return <div className={s.loanGrid}>{rows.map((h) => {
    const action = h.claimable ? 'claim' : h.bond?.status === 'matured' && h.bond.verified ? 'liquidate' : null;
    const id = action === 'claim' ? h.assetId : h.bond?.boxId;
    const expanded = open === h.assetId;
    return <article key={h.assetId} className={`${s.loanCard} ${expanded ? s.expanded : ''}`}>
      <div className={`${s.loanCardBody} ${s.holdingCard}`}>
        <div className={s.loanTop}><span className={s.bondHeading}><AssetIcon tokenId={h.assetId} size={30} />SigmaFi Bond</span><span className={h.claimable ? s.settledBadge : h.bond?.status === 'matured' ? s.maturedBadge : s.liveBadge}>{h.claimable ? 'Claimable' : h.bond?.status === 'matured' ? 'Matured' : 'Active'}</span></div>
        <div><span className={s.fieldLabel}>{h.claimable ? 'Vault proceeds' : 'Repayment'}</span>{h.claimable ? h.vault.map((v) => <Contents key={v.boxId} nanoErgs={v.nanoErgs} tokens={v.tokens} />) : h.bond ? <Repayment t={h.bond.terms} /> : <span className={s.sub}>No active bond</span>}</div>
        {h.bond && <><div className={s.collateralWell}><span className={s.fieldLabel}>Collateral</span><Collateral t={h.bond.terms} breakdown /></div><TermCell t={h.bond.terms} tip={tip} /></>}
        <TokenAmount tokenId={h.assetId} amount="1" />
        {h.bond && !h.bond.verified && <p className={s.refusal}>{h.bond.verification ?? 'Unverified bond origin'}</p>}
        {action ? <button type="button" className={s.cardButton} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : h.assetId)}>{expanded ? 'Close preview' : api.ACTIONS[action].label}<span aria-hidden="true">↗</span></button> : <span className={s.hint}>Awaiting repayment or settlement</span>}
      </div>
      {expanded && action && <ActionDrawer action={action} id={id} tip={tip} onDone={() => setOpen(null)} />}
    </article>;
  })}</div>;
}

export default function Portfolio() {
  const { keyed, tick, version } = useExtensions();
  const [portfolio, setPortfolio] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('lending');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!keyed) { setPortfolio(null); return; }
    let live = true;
    api.getPortfolio().then((r) => { if (live) { setPortfolio(r); setError(null); } }, (e) => live && setError(e.message));
    return () => { live = false; };
  }, [keyed, tick, version]);
  const rows = portfolio?.[view] ?? [];
  const paged = usePaged(rows, 12);
  if (!keyed) return <KeyGate what="your loans and bond assets" />;
  if (error) return <Alert kind="error" title="Portfolio unavailable">{error}</Alert>;
  if (!portfolio) return <div className={s.empty}><Spinner /> Loading portfolio</div>;
  return <>
    <div className={s.marketHead}><div><h2 className={s.sectionHeading}>Portfolio</h2><p className={s.intro}>Manage loans, recover collateral, and claim bond proceeds.</p></div><span className={s.liveBadge}>{portfolio.lending.filter((h) => h.claimable).length} claimable</span></div>
    {portfolio.truncated && <Alert kind="warn">The scan reached its limit. Older positions may be missing.</Alert>}
    <div className={s.marketTabs}>{[['lending','Lending'],['borrowing','Borrowing'],['orders','Requests']].map(([id,label]) => <button type="button" key={id} className={`${s.marketTab} ${view === id ? s.marketTabActive : ''}`} aria-pressed={view === id} onClick={() => { setView(id); setOpen(null); paged.setPage(0); }}>{label}<span>{portfolio[id].length}</span></button>)}</div>
    {rows.length === 0 ? <div className={s.empty}><span className={s.emptyIcon} aria-hidden="true">◇</span><h3>{view === 'lending' ? 'No bond assets' : view === 'borrowing' ? 'No active loans' : 'No open requests'}</h3><p>{view === 'lending' ? 'Fund a loan request to receive a bond asset.' : view === 'borrowing' ? 'Funded requests appear here until repaid or liquidated.' : 'Create a request to borrow against your assets.'}</p></div> : view === 'lending' ? <Holdings rows={paged.rows} tip={portfolio.height} open={open} setOpen={setOpen} /> : view === 'borrowing' ? <BondTable rows={paged.rows} tip={portfolio.height} open={open} setOpen={setOpen} actionFor={(b) => b.status === 'open' ? 'repay' : null} /> : <RequestCards rows={paged.rows} tip={portfolio.height} open={open} setOpen={setOpen} />}
    {paged.pages > 1 && <div className={s.toolbar} style={{ marginTop: 18 }}><span className={s.hint}>{paged.first + 1}–{paged.first + paged.rows.length} of {rows.length}</span><Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} /></div>}
  </>;
}
