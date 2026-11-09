import React, { useEffect, useRef, useState } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { KeyGate } from '../Extensions/ui';
import { Alert, Spinner } from '../Dex/ui';
import { Contents, IdTag, TokenAmount } from './tokens';
import { collateralOf, bondAssetName } from './bond';
import { CollateralHealth, UsdValue } from './PriceContext';
import BondIcon from '../Wallet/BondIcon';
import { buildFill } from './order';
import {
  aprOf,
  big,
  fmtErg,
  fmtInt,
  fmtTerm,
  interestOf,
  liquidationLabel,
  MIN_BATCHING_FEE,
  pct,
  termBlocks,
} from './format';
/** What is lent, as an amount. */
export function Principal({ t }) {
  if (t.principalToken) return <span className={s.valuedAmount}><TokenAmount tokenId={t.principalToken.tokenId} amount={t.principalToken.amount} /><UsdValue {...t.principalToken} /></span>;
  if (t.principalNanoErgs == null) return <span className={s.sub}>Not known</span>;
  return <span className={s.valuedAmount}><TokenAmount tokenId="ERG" amount={t.principalNanoErgs} /><UsdValue tokenId="ERG" amount={t.principalNanoErgs} /></span>;
}

/** What is repaid, in the loan's own asset. */
export function Repayment({ t }) {
  return <span className={s.valuedAmount}><TokenAmount tokenId={t.repayToken ?? 'ERG'} amount={t.repayment} /><UsdValue tokenId={t.repayToken ?? 'ERG'} amount={t.repayment} /></span>;
}

/** Loan amount, with what it repays beneath. */
export function LoanCell({ t, mine }) {
  return <span className={s.cell}><span><Principal t={t} /> {mine && <span className={s.sub}>Yours</span>}</span><span className={s.sub}>Repays <Repayment t={t} /></span></span>;
}

/** The total interest leads; APR is a secondary comparison over the remaining term. */
export function InterestCell({ t, tip }) {
  const rate = interestOf(t);
  const apr = aprOf(t, tip);
  return <span className={s.cell}>
    <span className={rate != null && rate > 0 ? s.interest : s.interestLow}>{pct(rate)} <small>total interest</small></span>
    <span className={s.sub}>{pct(apr, 1)} APR</span>
  </span>;
}

/** Collateral is shown separately from the bounty and the minimum box value. */
export function Collateral({ t, breakdown = false, unfilled = false }) {
  const c = collateralOf(t);
  return <>
    <Contents nanoErgs={c.collateral} tokens={t.collateralTokens} />
    {c.collateral === 0n && !t.collateralTokens.length && <TokenAmount tokenId="ERG" amount="0" />}
    <UsdValue nanoErgs={c.collateral} tokens={t.collateralTokens} />
    {breakdown && <CollateralHealth t={t} />}
    {breakdown && <div className={s.reserveBreakdown}>
      <span><span>Lender batching reserve</span>{unfilled ? <span title="Standard reserve for automatic liquidation; the lender selects the amount on fill.">≥ {fmtErg(MIN_BATCHING_FEE)} ERG</span> : <TokenAmount tokenId="ERG" amount={c.fee} />}</span>
      {unfilled ? <span><span>Liquidation</span><span>{liquidationLabel(t.liquidation)}</span></span> : <span><span>Box minimum</span><TokenAmount tokenId="ERG" amount={c.minimum} /></span>}
      <span className={s.reserveTotal}><span>{unfilled ? 'Borrower ERG locked' : 'ERG locked'}</span><TokenAmount tokenId="ERG" amount={unfilled ? c.borrower : c.total} /></span>
    </div>}
    {c.shortfall && <span className={s.refusal}>Insufficient ERG for the box minimum.</span>}
  </>;
}

/** Time estimates always keep the exact block countdown alongside them. */
export function TermCell({ t, tip }) {
  if (t.maturityHeight == null) return <span className={s.cell}>
    <span>{fmtTerm(t.durationBlocks)}</span>
    <span className={s.sub}>{fmtInt(t.durationBlocks)} blocks · from funding</span>
  </span>;
  const left = tip == null ? null : t.maturityHeight - tip;
  return <span className={s.cell}>
    {left == null ? <span>Fixed maturity</span> : left > 0 ? <span>{fmtTerm(left)}</span> : <span className={s.matured}>Matured</span>}
    {left != null && <span className={s.sub}>{fmtInt(Math.max(0, left))} blocks left{left < 0 ? ` · ${fmtInt(-left)} overdue` : ''}</span>}
    <span className={s.sub}>Block {fmtInt(t.maturityHeight)}</span>
  </span>;
}

/** The batching fee, with the liquidation rule beneath. Shown with every set of terms. */
export function FeeCell({ t }) {
  const low = big(t.batchingFee) < MIN_BATCHING_FEE;
  return (
    <span className={s.cell} title="Lender-funded reserve, refunded to the lender on repayment or available to a liquidator">
      <span className={low ? s.warnText : undefined}><TokenAmount tokenId="ERG" amount={t.batchingFee} /></span>
      <span className={s.sub}>{low ? 'Below fee floor' : liquidationLabel(t.liquidation)}</span>
    </span>
  );
}

function PreviewAssets({ nanoErgs = '0', tokens = [], empty = 'Nothing now' }) {
  const erg = big(nanoErgs);
  return <div className={s.previewAssetList}>
    {erg > 0n && <TokenAmount tokenId="ERG" amount={erg} />}
    {tokens.map(t => <TokenAmount key={t.tokenId} {...t} />)}
    {erg === 0n && !tokens.length && <span className={s.sub}>{empty}</span>}
  </div>;
}

/** A loan's headline amounts, timing, collateral, and reserves have distinct visual groups. */
export function TermRows({ t, tip, unfilled = false }) {
  const c = collateralOf(t);
  return <section className={s.previewTerms} aria-label="Loan terms">
    <h3 className={s.previewTitle}>Loan terms</h3>
    <div className={s.previewAmounts}>
      <div><span className={s.fieldLabel}>Loan</span><Principal t={t} /></div>
      <div><span className={s.fieldLabel}>Repayment</span><Repayment t={t} /></div>
    </div>
    <div className={s.previewFacts}>
      <div><span className={s.fieldLabel}>Interest</span><strong className={s.previewNumber}>{pct(interestOf(t))}</strong><span className={s.sub}>{pct(aprOf(t, tip), 1)} APR</span></div>
      <div><span className={s.fieldLabel}>Maturity</span><TermCell t={t} tip={tip} /></div>
    </div>
    <div className={s.previewCollateral}>
      <div className={s.previewSectionHead}><h4>Collateral</h4><UsdValue nanoErgs={c.collateral} tokens={t.collateralTokens} /></div>
      <PreviewAssets nanoErgs={c.collateral} tokens={t.collateralTokens} empty="0 ERG" />
      <CollateralHealth t={t} />
      <div className={s.previewReserves}>
        <div><span>Lender batching reserve</span>{unfilled ? <span>Selected on fill</span> : <TokenAmount tokenId="ERG" amount={c.fee} icon={false} />}</div>
        <div><span>Box minimum</span><TokenAmount tokenId="ERG" amount={c.minimum} icon={false} /></div>
        <div><span>ERG locked</span><TokenAmount tokenId="ERG" amount={c.total} icon={false} /></div>
      </div>
      <p className={s.previewRule}><span>Liquidation</span><span>{liquidationLabel(t.liquidation)}</span></p>
      {c.shortfall && <span className={s.refusal}>Insufficient ERG for the box minimum.</span>}
    </div>
  </section>;
}

/**
 * One action on one box: its check on open, which signs nothing, then a send behind the key. A 409 means the box
 * moved, so everything is re-read.
 */
export function ActionDrawer({ action, id, tip, onDone, terms }) {
  const { keyed, changed, version, submitted } = useExtensions();
  const [reviewed, setReviewed] = useState(null);
  const [fee, setFee] = useState('0.05');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const a = api.ACTIONS[action];
  const fill = action === 'fillOrder';
  const request = fill ? buildFill(fee) : { body: undefined };
  const requestKey = JSON.stringify([action, id, version, fill ? request.body ?? fee : null]);
  const current = useRef(requestKey);
  current.current = requestKey;
  const quote = reviewed?.key === requestKey ? reviewed.quote : null;

  useEffect(() => {
    let live = true;
    setReviewed(null);
    setError(null);
    if (fill && !request.body) return;
    const timer = setTimeout(() => {
      a.check(id, request.body)
        .then((q) => { if (live && current.current === requestKey) setReviewed({ quote: q, body: request.body, key: requestKey }); })
        .catch((e) => { if (live && current.current === requestKey) setError(e.message); });
    }, fill ? 300 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [requestKey]);

  const send = async () => {
    if (!quote || reviewed.key !== current.current || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await a.send(id, reviewed.body);
      submitted(a.label, result);
      onDone();
    } catch (e) {
      setError(e.status === 409 ? `${e.message}. The book is being re-read.` : e.message);
      setReviewed(null);
      if (e.status === 409) changed();
    } finally {
      setSending(false);
    }
  };

  const minted = quote?.receivesTokens.some((t) => t.tokenId === quote.boxId);
  const received = quote?.receivesTokens.filter((t) => t.tokenId !== quote.boxId) ?? [];
  const loanTerms = quote?.terms ?? terms;

  return (
    <div className={s.actionDrawer}>
      <div className={`${s.drawerGrid} ${!loanTerms ? s.previewSingle : ''}`}>
        {loanTerms && <TermRows t={loanTerms} tip={tip} unfilled={action === 'cancelOrder' || (fill && !quote)} />}
        <section className={s.previewWallet} aria-label="Wallet impact">
          <h3 className={s.previewTitle}>Wallet impact</h3>
          {fill && <div className={s.fillReserve}>
            <label><span className={s.fieldLabel}>Batching reserve (ERG)</span><input className={s.search} aria-label="Batching reserve (ERG)" inputMode="decimal" value={fee} disabled={sending} onChange={(e) => { setFee(e.target.value); setError(null); }} /></label>
            <p className={s.hint}>You fund this above the borrower’s collateral. It returns to the bond holder with repayment, or pays the liquidator if the loan matures unpaid. The standard reserve is 0.05 ERG.</p>
            {request.why && <p className={s.refusal}>{request.why}</p>}
          </div>}
          {!quote && !error && (!fill || request.body) && <div className={s.previewLoading}><Spinner /> Checking with your client</div>}
          {error && <Alert kind="error" title="Not possible now">{error}</Alert>}
          {quote && (
            <>
              <div className={s.walletMovement}>
                <span className={s.fieldLabel}>You pay</span>
                <PreviewAssets nanoErgs={quote.paysNanoErgs} tokens={quote.paysTokens} />
              </div>
              <div className={s.walletMovement}>
                <span className={s.fieldLabel}>You receive</span>
                {(big(quote.receivesNanoErgs) > 0n || received.length > 0 || !minted) && <PreviewAssets nanoErgs={quote.receivesNanoErgs} tokens={received} />}
                {minted && <div className={s.previewBond}>
                  <BondIcon bond={loanTerms ? {terms:loanTerms} : undefined} state="active" size={24} />
                  <span><strong>1 {bondAssetName()}</strong><span className={s.sub}>New asset · <IdTag tokenId={quote.boxId} /></span></span>
                </div>}
              </div>
              <div className={s.previewNetworkFee}>
                <span>Network fee, included</span><span>{fmtErg(quote.feeNanoErgs)} ERG</span>
              </div>
              <div className={s.previewNotes}>
                {quote.notes.map((n) => <p key={n}>{n}</p>)}
              </div>
              {quote.warnings.map((w) => (
                <Alert key={w} kind="warn">
                  {w}
                </Alert>
              ))}
              {keyed ? (
                <div className={s.previewActions}>
                  <button className={s.primaryBtn} style={{ width: 'auto', padding: '10px 22px' }} type="button" onClick={send} disabled={sending || !quote}>
                    {sending ? <Spinner /> : a.label}
                  </button>
                  <button className={`${s.cardButton} ${s.secondaryBtn}`} type="button" onClick={onDone} disabled={sending}>
                    Cancel
                  </button>
                </div>
              ) : (
                <KeyGate what="sending this" />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** The blocks left in a term, for sorting: an on-close order counts its duration. */
export const termOf = (t, tip) => termBlocks(t, tip) ?? Number.MAX_SAFE_INTEGER;
