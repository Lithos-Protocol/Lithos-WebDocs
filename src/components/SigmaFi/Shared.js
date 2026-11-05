import React, { useEffect, useState } from 'react';
import m from '../Mining/styles.module.css';
import f from '../Collateral/styles.module.css';
import x from '../Extensions/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { KeyGate } from '../Extensions/ui';
import { Alert, Spinner, TxResult } from '../Dex/ui';
import { Contents, IdTag, TokenAmount } from './tokens';
import {
  aprOf,
  big,
  feeShare,
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
  if (t.principalToken) return <TokenAmount tokenId={t.principalToken.tokenId} amount={t.principalToken.amount} />;
  if (t.principalNanoErgs == null) return <span className={s.sub}>Not known</span>;
  return <TokenAmount tokenId="ERG" amount={t.principalNanoErgs} />;
}

/** What is repaid, in the loan's own asset. */
export function Repayment({ t }) {
  return <TokenAmount tokenId={t.repayToken ?? 'ERG'} amount={t.repayment} />;
}

/** Loan amount, with what it repays beneath. */
export function LoanCell({ t, mine }) {
  return (
    <span className={s.cell}>
      <span>
        <Principal t={t} /> {mine && <span className={s.yours}>Yours</span>}
      </span>
      <span className={s.sub}>
        Repays <Repayment t={t} />
      </span>
    </span>
  );
}

/** The yearly rate over the term left, with the total return beneath. */
export function AprCell({ t, tip }) {
  const r = interestOf(t);
  const apr = aprOf(t, tip);
  return (
    <span className={s.cell}>
      <span className={apr != null && apr > 0 ? s.apr : s.aprLow}>{apr == null ? '—' : pct(apr, 1)}</span>
      <span className={s.sub}>{r == null ? 'Return not known' : `${r >= 0 ? '+' : ''}${pct(r)} total`}</span>
    </span>
  );
}

/** How long until repayment closes, with the block beneath. */
export function TermCell({ t, tip }) {
  if (t.maturityHeight == null) {
    return (
      <span className={s.cell}>
        <span>{fmtTerm(t.durationBlocks)}</span>
        <span className={s.sub}>From the fill</span>
      </span>
    );
  }
  const left = t.maturityHeight - tip;
  return (
    <span className={s.cell}>
      {left > 0 ? <span>{fmtTerm(left)}</span> : <span className={s.matured}>Matured</span>}
      <span className={s.sub}>Block {fmtInt(t.maturityHeight)}</span>
    </span>
  );
}

/** The batching fee, with the liquidation rule beneath. Shown with every set of terms. */
export function FeeCell({ t }) {
  const low = big(t.batchingFee) < MIN_BATCHING_FEE;
  return (
    <span className={s.cell} title="The most a liquidator keeps from the collateral's ERG if the bond is not repaid">
      <span className={low ? s.warnText : undefined}>{fmtErg(t.batchingFee)} ERG</span>
      <span className={s.sub}>{low ? 'Below fee floor' : liquidationLabel(t.liquidation)}</span>
    </span>
  );
}

/** Every term of a bond, as key/value rows. */
export function TermRows({ t, tip }) {
  const share = feeShare(t);
  const left = termBlocks(t, tip);
  const rows = [
    ['Loan', <Principal t={t} />],
    ['Repayment', <Repayment t={t} />],
    ['Return', `${pct(interestOf(t))} total, ${pct(aprOf(t, tip), 1)} a year`],
    [
      'Repay by',
      t.maturityHeight != null
        ? `Block ${fmtInt(t.maturityHeight)}${left > 0 ? `, in ${fmtTerm(left)}` : ', matured'}`
        : `${fmtTerm(t.durationBlocks)} after the fill`,
    ],
    ['Collateral', <Contents nanoErgs={t.collateralNanoErgs} tokens={t.collateralTokens} />],
    ['Batching fee', `${fmtErg(t.batchingFee)} ERG${share != null ? `, ${pct(share, 1)} of the collateral's ERG` : ''}`],
    ['Liquidation', liquidationLabel(t.liquidation)],
  ];
  return (
    <div className={x.quoteRows}>
      {rows.map(([k, v]) => (
        <div key={k} className={m.kv}>
          <span className={m.kvKey}>{k}</span>
          <span className={m.kvVal}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One action on one box: its check on open, which signs nothing, then a send behind the key. A 409 means the box
 * moved, so everything is re-read.
 */
export function ActionDrawer({ action, id, tip, onDone }) {
  const { keyed, changed } = useExtensions();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const a = api.ACTIONS[action];

  useEffect(() => {
    let live = true;
    setQuote(null);
    setError(null);
    a.check(id)
      .then((q) => live && setQuote(q))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [action, id]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      setSent(await a.send(id));
      changed();
    } catch (e) {
      setError(e.status === 409 ? `${e.message}. The book is being re-read.` : e.message);
      if (e.status === 409) changed();
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className={x.drawer}>
        <TxResult
          title={`${a.label}: sent`}
          outcome={sent.outcome}
          txId={sent.txId}
          rows={[...(sent.boxId ? [['Box', sent.boxId]] : []), ...(sent.assetId ? [['Bond asset', sent.assetId]] : [])]}
        >
          <div style={{ marginTop: 8 }}>
            <button type="button" className={f.linkBtn} onClick={onDone}>
              Close
            </button>
          </div>
        </TxResult>
      </div>
    );
  }

  const minted = quote?.receivesTokens.some((t) => t.tokenId === quote.boxId);
  const received = quote?.receivesTokens.filter((t) => t.tokenId !== quote.boxId) ?? [];

  return (
    <div className={x.drawer}>
      <div className={x.drawerGrid}>
        <div>
          <div className={m.label}>Terms</div>
          {!quote && !error && (
            <div className={m.empty}>
              <Spinner /> Checking with your client
            </div>
          )}
          {quote?.terms && <TermRows t={quote.terms} tip={tip} />}
        </div>
        <div>
          <div className={m.label}>This transaction</div>
          {error && <Alert kind="error" title="Not possible now">{error}</Alert>}
          {quote && (
            <>
              <div className={x.quoteRows}>
                <div className={m.kv}>
                  <span className={m.kvKey}>You pay</span>
                  <span className={m.kvVal}>
                    <Contents nanoErgs={quote.paysNanoErgs} tokens={quote.paysTokens} />
                  </span>
                </div>
                <div className={m.kv}>
                  <span className={m.kvKey}>You receive</span>
                  <span className={m.kvVal}>
                    {big(quote.receivesNanoErgs) === 0n && received.length === 0 && !minted ? (
                      'Nothing now'
                    ) : (
                      <Contents nanoErgs={quote.receivesNanoErgs} tokens={received} />
                    )}
                  </span>
                </div>
                {minted && (
                  <div className={m.kv}>
                    <span className={m.kvKey}>Bond asset</span>
                    <span className={m.kvVal}>
                      1 new, id <IdTag tokenId={quote.boxId} />
                    </span>
                  </div>
                )}
                <div className={m.kv}>
                  <span className={m.kvKey}>Network fee</span>
                  <span className={m.kvVal}>{fmtErg(quote.feeNanoErgs)} ERG, included</span>
                </div>
              </div>
              {quote.notes.map((n) => (
                <p key={n} className={m.cardNote}>
                  {n}
                </p>
              ))}
              {quote.warnings.map((w) => (
                <Alert key={w} kind="warn">
                  {w}
                </Alert>
              ))}
              {keyed ? (
                <div className={f.btnRow}>
                  <button className={s.primaryBtn} style={{ width: 'auto', padding: '10px 22px' }} type="button" onClick={send} disabled={sending}>
                    {sending ? <Spinner /> : a.label}
                  </button>
                  <button className={f.linkBtn} type="button" onClick={onDone}>
                    Cancel
                  </button>
                </div>
              ) : (
                <KeyGate what="sending this" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The blocks left in a term, for sorting: an on-close order counts its duration. */
export const termOf = (t, tip) => termBlocks(t, tip) ?? Number.MAX_SAFE_INTEGER;
