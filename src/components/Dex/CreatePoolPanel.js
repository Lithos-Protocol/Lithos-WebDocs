import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@docusaurus/Link';
import s from './styles.module.css';
import p from './pools.module.css';
import w from '../Wallet/styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { big, fmtErg, fmtInt, fmtPct, ratio, shortId } from './format';
import { Alert, Row, Spinner } from './ui';
import TokenIcon, { TrustBadge, tokenLabel } from '../Wallet/TokenIcon';
import { TokenChip } from './PoolTrade';
import { fmtPrice, fmtSideFull, parseSide, poolHref } from './pools';

const ERG = { tokenId: 'ERG', ticker: 'ERG', name: 'ERG', decimals: 9, verified: true };

/** The default split, as ErgoDEX pools are usually created: 0.15% kept by the pool and 0.15% to providers. */
const DEFAULT_FEES = { keep: '0.15', x: '0.15', y: '0.15' };
const FEE_DENOM = 10000;

/** Percent strings -> fee numerators over 10,000, or an error naming the bound broken. */
function feeParams(f) {
  const num = (v) => Math.round(Number(v) * 100);
  const keep = num(f.keep);
  const x = num(f.x);
  const y = num(f.y);
  if (![keep, x, y].every((n) => Number.isInteger(n) && n >= 0 && n < FEE_DENOM)) {
    return { error: 'Each fee is a percentage from 0 up to, but not including, 100.' };
  }
  return { value: { dexFeeNum: FEE_DENOM - keep, ergFeeNum: x, tokenFeeNum: y, feeDenom: FEE_DENOM } };
}

/**
 * Picks one of the wallet's tokens, verified first, searchable by name, ticker or id. The list opens in place,
 * pushing the form down: an overlay would be cut off at the bottom of the page.
 */
function TokenPicker({ tokens, value, exclude, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tokens
      .filter((t) => t.tokenId !== exclude)
      .filter((t) => !q || [t.name, t.ticker, t.tokenId].some((v) => v && v.toLowerCase().includes(q)))
      .sort(
        (a, b) =>
          Number(b.verified) - Number(a.verified) ||
          tokenLabel(a).localeCompare(tokenLabel(b), undefined, { sensitivity: 'base' }),
      );
  }, [tokens, exclude, query]);

  return (
    <div className={p.picker} ref={ref}>
      <button className={p.pickerBtn} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {value ? <TokenChip t={value} /> : <span className={p.pickerEmpty}>{placeholder}</span>}
        <span className={p.pickerCaret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={`${p.pickerMenu} ${p.pickerMenuInline}`}>
          <input
            className={w.search}
            style={{ width: '100%' }}
            autoFocus
            value={query}
            placeholder="Search your tokens"
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <div className={p.pickerList} role="listbox">
            {options.length === 0 && <div className={w.empty}>No token matches.</div>}
            {options.map((t) => (
              <button
                key={t.tokenId}
                type="button"
                role="option"
                aria-selected={value?.tokenId === t.tokenId}
                className={p.pickerItem}
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <TokenIcon tokenId={t.tokenId} label={t.ticker ?? t.name} size={22} />
                <span className={w.tokenText}>
                  <span className={t.verified ? w.tokenName : w.tokenNameUnverified}>{tokenLabel(t)}</span>
                  <span className={w.tokenSub}>{shortId(t.tokenId, 6, 6)}</span>
                </span>
                {t.verified && <TrustBadge status="verified" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AmountField({ label, t, value, onChange, held }) {
  return (
    <div className={s.field}>
      <div className={s.fieldHead}>
        <span className={s.fieldLabel}>{label}</span>
        <span className={s.fieldBalance}>{held !== null && t ? `Balance ${fmtSideFull(held, t)}` : ''}</span>
      </div>
      <div className={s.fieldRow}>
        <input className={s.input} inputMode="decimal" placeholder="0.0" value={value} onChange={(e) => onChange(e.target.value)} />
        {t && <TokenChip t={t} />}
      </div>
    </div>
  );
}

const STEP_LABEL = {
  POOL_NFT: 'Mint the pool NFT',
  VAULT_NFT: 'Mint the vault NFT',
  OWNER_NFT: 'Mint the NFT that owns your provision',
  GENESIS: 'Genesis: the pool, its vault and your provision',
};

function Created({ r }) {
  const done = r.outcome === 'accepted';
  return (
    <Alert
      kind={done ? 'ok' : r.outcome === 'uncertain' ? 'warn' : 'error'}
      title={done ? 'Pool sent' : r.outcome === 'uncertain' ? 'Pool sent, outcome uncertain' : 'Pool not created'}
    >
      <div className={p.steps}>
        {r.steps.map((st) => (
          <div key={st.step} className={p.step}>
            <span className={`${p.stepOutcome} ${p[`step_${st.outcome}`] ?? ''}`}>{st.outcome}</span>
            <span>{STEP_LABEL[st.step] ?? st.step}</span>
            <span className={p.stepTx} title={st.txId}>
              {shortId(st.txId, 8, 6)}
            </span>
            {st.reason && <span className={p.stepReason}>{st.reason}</span>}
          </div>
        ))}
      </div>
      {done ? (
        <div className={s.txNote}>
          The pool is listed once its genesis is in a block. Keep NFT{' '}
          <span className={p.nftText}>{shortId(r.ownerNFT, 8, 6)}</span>: it owns your provision.{' '}
          <Link to={poolHref(r.poolNFT)}>Open the pool</Link>
        </div>
      ) : (
        <div className={s.txNote}>
          Transactions marked unsent were not sent, and the boxes held for them were given back. NFTs already minted
          stay in your wallet and do nothing on their own.
        </div>
      )}
    </Alert>
  );
}

/** Create a LithosDex pool from this wallet: ERG against a token, or two tokens. */
export default function CreatePoolPanel() {
  const { toggleSettings, tick } = useDex();
  const hasKey = api.hasApiKey();
  const [balance, setBalance] = useState(null);
  const [kind, setKind] = useState('n2t');
  const [tokenX, setTokenX] = useState(null);
  const [tokenY, setTokenY] = useState(null);
  const [amountX, setAmountX] = useState('');
  const [amountY, setAmountY] = useState('');
  const [fees, setFees] = useState(DEFAULT_FEES);
  const [showFees, setShowFees] = useState(false);
  const [consent, setConsent] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState(null);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!hasKey) return;
    api.getWalletBalances().then(setBalance, () => setBalance(null));
  }, [hasKey, tick]);

  const tokens = balance?.tokens ?? [];
  const x = kind === 'n2t' ? ERG : tokenX;
  const rawX = x ? parseSide(amountX, x) : null;
  const rawY = tokenY ? parseSide(amountY, tokenY) : null;
  const fp = feeParams(fees);
  const ready = !!x && !!tokenY && rawX > 0n && rawY > 0n && !!fp.value;
  const held = (t) =>
    !balance || !t ? null : t.tokenId === 'ERG' ? big(balance.nanoErgs) : big(tokens.find((k) => k.tokenId === t.tokenId)?.amount);

  const request = ready
    ? { tokenX: x.tokenId, tokenY: tokenY.tokenId, amountX: rawX.toString(), amountY: rawY.toString(), feeParams: fp.value }
    : null;
  const requestKey = request ? JSON.stringify(request) : '';

  // Quoted 400 ms after the inputs settle; only the newest answer is kept
  const seq = useRef(0);
  useEffect(() => {
    setConsent(false);
    if (!request) {
      setQuote(null);
      setQuoteErr(null);
      setQuoting(false);
      return undefined;
    }
    const id = ++seq.current;
    setQuoting(true);
    const t = setTimeout(() => {
      api
        .checkCreatePool(request)
        .then((q) => seq.current === id && (setQuote(q), setQuoteErr(null)))
        .catch((e) => seq.current === id && (setQuote(null), setQuoteErr(e.message)))
        .finally(() => seq.current === id && setQuoting(false));
    }, 400);
    return () => clearTimeout(t);
  }, [requestKey]);

  const create = async () => {
    setCreating(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.createPool(request));
      setAmountX('');
      setAmountY('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const tokenText = (list) =>
    (list ?? [])
      .map((t) => {
        const side = [x, tokenY].find((k) => k?.tokenId === t.tokenId);
        return `${side ? fmtSideFull(t.amount, side) : fmtInt(t.amount)} ${side ? tokenLabel(side) : shortId(t.tokenId, 6, 4)}`;
      })
      .join(' + ');
  const price =
    ready && x && tokenY
      ? ratio(rawY * 10n ** BigInt(x.decimals ?? 0), rawX * 10n ** BigInt(tokenY.decimals ?? 0), 12)
      : null;

  if (!hasKey) {
    return (
      <div className={s.card}>
        <h3 className={s.cardTitle}>Create a pool</h3>
        <div className={s.empty}>
          Creating a pool spends this wallet's funds, so it needs an API key.{' '}
          <button className={s.linkBtn} onClick={toggleSettings} type="button">
            Open settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={p.createCols}>
      <div className={s.card}>
        <div className={p.cardHeadRow}>
          <h3 className={s.cardTitle}>Create a pool</h3>
          <div className={w.filters} role="group">
            {[
              ['n2t', 'ERG / token'],
              ['t2t', 'Token / token'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${w.filter} ${kind === id ? w.filterActive : ''}`}
                onClick={() => {
                  setKind(id);
                  setTokenX(null);
                  setAmountX('');
                  setResult(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className={s.cardDesc}>
          Everything you put in becomes the pool's reserves, at the price the two amounts set, and genesis gives you a
          provision for all of it but a millionth.
        </p>

        {!balance ? (
          <div className={s.empty}>
            <Spinner /> Reading your wallet…
          </div>
        ) : (
          <div className={p.stack}>
            {kind === 't2t' && (
              <TokenPicker tokens={tokens} value={tokenX} exclude={tokenY?.tokenId} onChange={setTokenX} placeholder="First token (X)" />
            )}
            {x && <AmountField label={`${tokenLabel(x)} into the pool`} t={x} value={amountX} onChange={setAmountX} held={held(x)} />}
            <TokenPicker
              tokens={tokens}
              value={tokenY}
              exclude={x?.tokenId}
              onChange={setTokenY}
              placeholder={kind === 't2t' ? 'Second token (Y)' : 'Token to pair with ERG'}
            />
            {tokenY && (
              <AmountField label={`${tokenLabel(tokenY)} into the pool`} t={tokenY} value={amountY} onChange={setAmountY} held={held(tokenY)} />
            )}
          </div>
        )}

        <button className={`${s.linkBtn} ${p.feesToggle}`} type="button" onClick={() => setShowFees((v) => !v)}>
          {showFees ? 'Hide fees' : 'Fees'}: {fees.keep}% kept by the pool, {fees.x}% / {fees.y}% to providers
        </button>
        {showFees && (
          <div className={p.feeGrid}>
            {[
              ['keep', 'Kept by the pool'],
              ['x', `To providers, selling ${x ? tokenLabel(x) : 'X'}`],
              ['y', `To providers, selling ${tokenY ? tokenLabel(tokenY) : 'Y'}`],
            ].map(([k, label]) => (
              <label key={k} className={p.feeField}>
                <span className={s.fieldLabel}>{label}</span>
                <span className={p.feeInputRow}>
                  <input
                    className={w.search}
                    inputMode="decimal"
                    value={fees[k]}
                    onChange={(e) => setFees((f) => ({ ...f, [k]: e.target.value }))}
                  />
                  %
                </span>
              </label>
            ))}
            {fp.error && <div className={p.feeError}>{fp.error}</div>}
          </div>
        )}
      </div>

      <div className={s.card}>
        <h3 className={s.cardTitle}>What creating it does</h3>
        {!ready ? (
          <div className={s.empty}>Choose the tokens and amounts to see the quote.</div>
        ) : quoting && !quote ? (
          <div className={s.empty}>
            <Spinner /> Quoting…
          </div>
        ) : quote ? (
          <>
            <div className={s.summary}>
              {price !== null && (
                <Row label="Opening price" value={`1 ${tokenLabel(x)} = ${fmtPrice(price)} ${tokenLabel(tokenY)}`} accent />
              )}
              <Row label="Your provision" value={`${fmtInt(quote.shares)} shares`} />
              <Row label="Locked for good" value={`${fmtInt(quote.lockedShares)} shares, ${fmtPct(quote.lockedShare, 4)} of the pool`} />
              <Row
                label="Never recoverable"
                value={[`${fmtErg(quote.lockedErg)} ERG`, tokenText(quote.lockedTokens)].filter(Boolean).join(' + ')}
              />
              <Row label="Pool box" value={`${fmtErg(quote.poolBoxValue)} ERG`} />
              <Row label="Vault box" value={`${fmtErg(quote.vaultBoxValue)} ERG`} />
              <Row label="Provision box" value={`${fmtErg(quote.provisionBoxValue)} ERG, returned on redeem`} />
              <Row label="Network fees" value={`${fmtErg(quote.networkFee)} ERG over four transactions`} />
              <Row
                label="Leaves your wallet"
                value={[`${fmtErg(quote.totalErgRequired)} ERG`, tokenText(quote.tokensRequired)].filter(Boolean).join(' + ')}
              />
            </div>
            {quote.warnings?.length > 0 && (
              <Alert kind="warn" title={quote.warnings.length === 1 ? 'Before you create it' : 'Before you create them'}>
                <ul className={p.problemList}>
                  {quote.warnings.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <label className={p.consent}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              The pool's boxes and the locked share can never be taken back.
            </label>
          </>
        ) : null}

        <button className={s.btn} type="button" disabled={!quote || !consent || quoting || creating} onClick={create}>
          {creating ? 'Sending four transactions…' : 'Create pool'}
        </button>

        {quoteErr && (
          <Alert kind="error" title="Quote failed">
            {quoteErr}
          </Alert>
        )}
        {error && (
          <Alert kind="error" title="Pool not created">
            {error}
          </Alert>
        )}
        {result && <Created r={result} />}
      </div>
    </div>
  );
}
