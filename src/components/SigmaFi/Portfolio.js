import React, { useEffect, useState } from 'react';
import m from '../Mining/styles.module.css';
import x from '../Extensions/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { KeyGate, Pager, usePaged } from '../Extensions/ui';
import { Alert, Spinner } from '../Dex/ui';
import { Contents, IdTag } from './tokens';
import { ActionDrawer, AprCell, FeeCell, LoanCell, Repayment, TermCell } from './Shared';
import { BondTable } from './Book';
import { fmtInt, fmtTerm } from './format';

/** One section's card, paged at a fixed size so the page never grows with the wallet. */
function Section({ title, note, rows, empty, children }) {
  const paged = usePaged(rows);
  return (
    <div className={m.card}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>
          {title} <span className={x.dimText}>{fmtInt(rows.length)}</span>
        </h3>
      </div>
      {note && <p className={m.cardNote} style={{ marginTop: 0 }}>{note}</p>}
      {rows.length === 0 ? <div className={m.empty}>{empty}</div> : children(paged.rows)}
      {paged.pages > 1 && (
        <div className={x.tableFoot}>
          <span />
          <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />
        </div>
      )}
    </div>
  );
}

/** This wallet's open orders or offers, each cancellable. */
function OpenList({ rows, kind, tip }) {
  const [open, setOpen] = useState(null);
  return (
    <div className={x.table}>
      <div className={`${x.tr} ${s.bookTr} ${x.th}`}>
        <span>Loan</span>
        <span>APR</span>
        <span>Term</span>
        <span>Collateral</span>
        <span>Batching fee</span>
        <span />
      </div>
      {rows.map((r) => {
        const toggle = () => setOpen(open === r.boxId ? null : r.boxId);
        return (
          <React.Fragment key={r.boxId}>
            <div
              className={`${x.tr} ${s.bookTr} ${x.rowHover} ${open === r.boxId ? x.rowOpen : ''}`}
              onClick={toggle}
              onKeyDown={(e) => e.key === 'Enter' && toggle()}
              role="button"
              tabIndex={0}
            >
              <LoanCell t={r.terms} />
              <AprCell t={r.terms} tip={tip} />
              <TermCell t={r.terms} tip={tip} />
              <span className={s.cell}>
                <Contents nanoErgs={r.terms.collateralNanoErgs} tokens={r.terms.collateralTokens} />
              </span>
              <FeeCell t={r.terms} />
              <span className={s.actionCell}>
                <span className={`${s.actionBtn} ${s.actionQuiet}`}>Cancel</span>
              </span>
            </div>
            {open === r.boxId && (
              <ActionDrawer action={kind === 'order' ? 'cancelOrder' : 'cancelOffer'} id={r.boxId} tip={tip} onDone={() => setOpen(null)} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Bond assets this wallet holds: the bond each claims while live, or what the vault holds once settled. */
function Holdings({ rows, tip }) {
  const [open, setOpen] = useState(null);
  return (
    <div className={x.table}>
      <div className={`${x.tr} ${s.vaultTr} ${x.th}`}>
        <span>Bond asset</span>
        <span>Owed to you</span>
        <span />
      </div>
      {rows.map((h) => {
        const action = h.claimable ? 'claim' : h.bond?.status === 'matured' ? 'liquidate' : null;
        const id = action === 'claim' ? h.assetId : h.bond?.boxId;
        const toggle = () => action && setOpen(open === h.assetId ? null : h.assetId);
        return (
          <React.Fragment key={h.assetId}>
            <div
              className={`${x.tr} ${s.vaultTr} ${action ? x.rowHover : ''} ${open === h.assetId ? x.rowOpen : ''}`}
              onClick={toggle}
              onKeyDown={(e) => e.key === 'Enter' && toggle()}
              role={action ? 'button' : undefined}
              tabIndex={action ? 0 : undefined}
            >
              <span className={s.cell} title={h.bond?.verification ?? h.assetId}>
                <IdTag tokenId={h.assetId} />
                <span className={`${s.sub} ${h.bond && !h.bond.verified ? s.verifyNo : s.verifyOk}`}>
                  {h.claimable ? 'Settled' : h.bond ? (h.bond.verified ? 'Verified' : 'Not verified') : ''}
                </span>
              </span>
              {h.claimable ? (
                <span className={s.cell}>
                  {h.vault.map((v) => (
                    <Contents key={v.boxId} nanoErgs={v.nanoErgs} tokens={v.tokens} />
                  ))}
                  <span className={s.sub}>In the vault, ready to claim</span>
                </span>
              ) : h.bond ? (
                <span className={s.cell}>
                  <Repayment t={h.bond.terms} />
                  <span className={s.sub}>
                    {h.bond.status === 'matured'
                      ? 'Matured without repayment: liquidate to claim the collateral'
                      : `Due by block ${fmtInt(h.bond.terms.maturityHeight)}, in ${fmtTerm(h.bond.blocksLeft)}`}
                  </span>
                </span>
              ) : (
                <span className={s.sub}>Nothing owed</span>
              )}
              <span className={s.actionCell}>
                {action ? <span className={s.actionBtn}>{api.ACTIONS[action].label}</span> : <span className={s.sub}>Awaiting repayment</span>}
              </span>
            </div>
            {open === h.assetId && action && <ActionDrawer action={action} id={id} tip={tip} onDone={() => setOpen(null)} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function Portfolio() {
  const { keyed, tick, version } = useExtensions();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [openBond, setOpenBond] = useState(null);

  useEffect(() => {
    if (!keyed) return undefined;
    let live = true;
    api.getPortfolio()
      .then((r) => {
        if (!live) return;
        setP(r);
        setError(null);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [keyed, tick, version]);

  if (!keyed) return <KeyGate what="your orders, offers and bonds" />;
  if (error) return <Alert kind="error" title="Could not read your portfolio">{error}</Alert>;
  if (!p)
    return (
      <div className={m.empty}>
        <Spinner /> Reading your portfolio…
      </div>
    );
  const tip = p.height;

  return (
    <div className={s.stack}>
      {p.truncated && <Alert kind="warn">A scan stopped at its cap, so older boxes may be missing below.</Alert>}
      <Section
        title="Lending"
        note="Bond assets you hold. Claim once the bond is repaid or liquidated; a matured bond nobody has liquidated yet you can liquidate yourself."
        rows={p.lending}
        empty="No bond assets in this wallet."
      >
        {(rows) => <Holdings rows={rows} tip={tip} />}
      </Section>
      <Section
        title="Borrowing"
        note="Bonds holding your collateral. Repay before maturity to take it back."
        rows={p.borrowing}
        empty="No open loans."
      >
        {(rows) => (
          <BondTable rows={rows} tip={tip} open={openBond} setOpen={setOpenBond} actionFor={(b) => (b.status === 'open' ? 'repay' : null)} />
        )}
      </Section>
      <Section title="Your orders" note="Waiting for a lender." rows={p.orders} empty="No open orders.">
        {(rows) => <OpenList rows={rows} kind="order" tip={tip} />}
      </Section>
      <Section title="Your offers" note="Waiting for a borrower." rows={p.offers} empty="No open offers.">
        {(rows) => <OpenList rows={rows} kind="offer" tip={tip} />}
      </Section>
    </div>
  );
}
