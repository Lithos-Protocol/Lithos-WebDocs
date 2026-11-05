import React, { useMemo, useState } from 'react';
import m from '../Mining/styles.module.css';
import x from '../Extensions/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { KeyGate } from '../Extensions/ui';
import { Alert, Spinner, TxResult } from '../Dex/ui';
import { parseUnits } from '../Dex/format';
import { assetName, decimalsOf, IdTag, useTokens } from './tokens';
import { BLOCK_MS, BLOCKS_PER_YEAR, fmtErg, fmtInt, fmtTerm, MIN_BATCHING_FEE, pct } from './format';

const BLOCKS_PER_DAY = Math.round(86_400_000 / BLOCK_MS);
const TERM_CHIPS = [7, 30, 90];
const RETURN_CHIPS = [0.02, 0.05, 0.1];
const FEE_CHIPS = ['0.05', '0.1', '0.25'];
const TOKEN_ID = /^[0-9a-fA-F]{64}$/;

const SIDES = [
  { id: 'borrow', title: 'Borrow', text: 'Lock collateral in an order. A lender fills it and the loan comes to you.', color: 'var(--cur-cyan)' },
  { id: 'lend', title: 'Lend', text: 'Lock the loan in an offer. A borrower takes it by posting the collateral you ask for.', color: 'var(--cur-green)' },
];

/** A user's amount in an asset's base units, or null when it does not parse to more than zero. */
function units(text, tokenId, verified) {
  const decimals = decimalsOf(verified, tokenId);
  // More decimal places than the asset has would be cut off silently
  const frac = String(text).trim().split('.')[1] ?? '';
  if (frac.replace(/0+$/, '').length > decimals) return null;
  try {
    const v = parseUnits(String(text).trim(), decimals);
    return v != null && v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Base units back to a decimal string at the asset's decimals. */
function toText(raw, decimals) {
  if (decimals === 0) return raw.toString();
  const d = 10n ** BigInt(decimals);
  const frac = (raw % d).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${raw / d}.${frac}` : `${raw / d}`;
}

/** The unit shown beside an amount: ERG, a verified ticker, or a short id tag. */
function Unit({ tokenId }) {
  const { verified } = useTokens() ?? {};
  if (tokenId === 'ERG' || verified?.[tokenId]) return <span className={s.inputUnit}>{assetName(verified, tokenId)}</span>;
  return <span className={s.inputUnit}>{TOKEN_ID.test(tokenId) ? <IdTag tokenId={tokenId} /> : 'Token'}</span>;
}

function Field({ label, hint, full, children }) {
  return (
    <div className={full ? s.fieldFull : undefined}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
      {hint && <div className={s.hint}>{hint}</div>}
    </div>
  );
}

function Amount({ value, onChange, unit, placeholder = '0' }) {
  return (
    <div className={s.input}>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder={placeholder} />
      {unit}
    </div>
  );
}

/**
 * Create an order (borrow) or an offer (lend). Review asks the client to check the terms exactly as they would be
 * sent, signing nothing; Create sends them.
 */
export default function Create() {
  const { keyed, changed, height } = useExtensions();
  const { verified } = useTokens() ?? {};
  const [side, setSide] = useState('borrow');
  const [kind, setKind] = useState('ERG');
  const [tokenId, setTokenId] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [schedule, setSchedule] = useState('fixed');
  const [days, setDays] = useState('30');
  const [collateralErg, setCollateralErg] = useState('');
  const [collateralTokens, setCollateralTokens] = useState([]);
  const [fee, setFee] = useState('0.05');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);

  const tip = height ?? 0;
  const asset = kind === 'ERG' ? 'ERG' : tokenId.trim().toLowerCase();
  const blocks = Math.round(Number(days) * BLOCKS_PER_DAY);
  const fixed = side === 'lend' || schedule === 'fixed';

  /** Every edit clears the last review, so Create only ever sends terms just checked. */
  const edit = (set) => (v) => {
    set(v);
    setQuote(null);
    setError(null);
    setSent(null);
  };

  const principal = units(loanAmount, asset, verified);
  const repayment = units(repayAmount, asset, verified);
  const ret = principal && repayment ? Number(repayment - principal) / Number(principal) : null;
  const apr = ret != null && blocks > 0 ? (ret * BLOCKS_PER_YEAR) / blocks : null;

  /** The request as the API takes it, or why it cannot be built yet. */
  const request = useMemo(() => {
    const collateral = units(collateralErg, 'ERG', verified);
    const feeUnits = units(fee, 'ERG', verified);
    if (kind === 'Token' && !TOKEN_ID.test(asset)) return { why: 'Enter the token ID of the loan.' };
    if (!principal) return { why: kind === 'Token' && loanAmount ? 'The amount has more decimal places than the token allows.' : 'Enter the loan amount.' };
    if (!repayment) return { why: kind === 'Token' && repayAmount ? 'The repayment has more decimal places than the token allows.' : 'Enter the repayment.' };
    if (!Number.isFinite(blocks) || blocks < 30) return { why: 'The term must be at least 30 blocks, about an hour.' };
    if (!collateral) return { why: 'Enter the collateral ERG.' };
    if (!feeUnits || feeUnits < MIN_BATCHING_FEE) return { why: 'The batching fee must be at least 0.05 ERG.' };
    if (collateral - feeUnits < 1_000_000n) return { why: 'The collateral ERG must exceed the batching fee by 0.001 ERG.' };
    const tokens = [];
    for (const t of collateralTokens) {
      if (!TOKEN_ID.test(t.tokenId)) return { why: 'Each collateral token needs a token ID.' };
      const n = units(t.amount, t.tokenId.toLowerCase(), verified);
      if (!n) return { why: 'Each collateral token needs an amount.' };
      tokens.push({ tokenId: t.tokenId.toLowerCase(), amount: n.toString() });
    }
    const loan = kind === 'ERG' ? { principalNanoErgs: principal.toString() } : { principalToken: { tokenId: asset, amount: principal.toString() } };
    const body = {
      ...loan,
      repayment: repayment.toString(),
      collateralNanoErgs: collateral.toString(),
      collateralTokens: tokens,
      batchingFee: feeUnits.toString(),
      liquidation: 'MaturityLiquidation',
    };
    return { body: fixed ? { ...body, maturityHeight: tip + blocks } : { ...body, durationBlocks: blocks } };
  }, [kind, asset, principal, repayment, loanAmount, repayAmount, blocks, collateralErg, collateralTokens, fee, fixed, tip, verified]);

  const review = async () => {
    setBusy(true);
    setError(null);
    try {
      setQuote(await (side === 'borrow' ? api.checkCreateOrder : api.checkCreateOffer)(request.body));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await (side === 'borrow' ? api.createOrder : api.createOffer)(request.body));
      changed();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setReturn = (r) => {
    if (!principal) return;
    const d = decimalsOf(verified, asset);
    edit(setRepayAmount)(toText(principal + (principal * BigInt(Math.round(r * 10000))) / 10000n, d));
  };

  const updateToken = (i, patch) =>
    edit(setCollateralTokens)(collateralTokens.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className={x.formGrid}>
      <div className={`${m.card} ${s.formCard}`}>
        <div className={x.sidePick} style={{ marginTop: 0, marginBottom: 6 }}>
          {SIDES.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`${x.sideTile} ${side === o.id ? x.sideTileOn : ''}`}
              style={{ '--side-color': o.color }}
              onClick={() => edit(setSide)(o.id)}
            >
              <span className={x.sideTileHead}>{o.title}</span>
              <span className={x.sideTileText}>{o.text}</span>
            </button>
          ))}
        </div>

        <div className={s.section}>
          <h4 className={s.sectionTitle}>Loan</h4>
          <div className={s.fieldGrid}>
            <Field label="Asset" full={kind === 'ERG'}>
              <div className={m.seg}>
                {['ERG', 'Token'].map((k) => (
                  <button key={k} type="button" className={`${m.segBtn} ${kind === k ? m.segBtnOn : ''}`} onClick={() => edit(setKind)(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </Field>
            {kind === 'Token' && (
              <Field label="Token ID">
                <div className={s.input}>
                  <input value={tokenId} onChange={(e) => edit(setTokenId)(e.target.value.trim())} placeholder="64 hex characters" spellCheck={false} />
                </div>
              </Field>
            )}
            <Field label="Amount">
              <Amount value={loanAmount} onChange={edit(setLoanAmount)} unit={<Unit tokenId={asset || 'Token'} />} />
            </Field>
            <Field label="Repayment">
              <Amount value={repayAmount} onChange={edit(setRepayAmount)} unit={<Unit tokenId={asset || 'Token'} />} />
              <div className={s.chips}>
                {RETURN_CHIPS.map((r) => (
                  <button key={r} type="button" className={x.chipBtn} onClick={() => setReturn(r)} disabled={!principal}>
                    +{r * 100}%
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <div className={s.section}>
          <h4 className={s.sectionTitle}>Term</h4>
          <div className={s.fieldGrid}>
            <Field label="Length" hint={Number.isFinite(blocks) && blocks > 0 ? `${fmtInt(blocks)} blocks` : null}>
              <Amount value={days} onChange={edit(setDays)} unit={<span className={s.inputUnit}>days</span>} />
              <div className={s.chips}>
                {TERM_CHIPS.map((d) => (
                  <button key={d} type="button" className={`${x.chipBtn} ${Number(days) === d ? x.chipBtnOn : ''}`} onClick={() => edit(setDays)(String(d))}>
                    {d} days
                  </button>
                ))}
              </div>
            </Field>
            {side === 'borrow' ? (
              <Field
                label="Counted from"
                hint={schedule === 'fixed' ? 'A fixed block: the term shortens while the order waits.' : 'The block a lender fills it: the term never shortens.'}
              >
                <div className={m.seg}>
                  {[
                    ['fixed', 'Now'],
                    ['onClose', 'The fill'],
                  ].map(([id, label]) => (
                    <button key={id} type="button" className={`${m.segBtn} ${schedule === id ? m.segBtnOn : ''}`} onClick={() => edit(setSchedule)(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            ) : (
              <Field label="Repay by">
                <div className={s.hint} style={{ marginTop: 10 }}>
                  Block {fmtInt(tip + (Number.isFinite(blocks) ? blocks : 0))}
                </div>
              </Field>
            )}
          </div>
        </div>

        <div className={s.section}>
          <h4 className={s.sectionTitle}>Collateral</h4>
          <div className={s.fieldGrid}>
            <Field label="ERG" full hint="The bond holds this until it is repaid. It must exceed the batching fee by 0.001 ERG.">
              <Amount value={collateralErg} onChange={edit(setCollateralErg)} unit={<span className={s.inputUnit}>ERG</span>} />
            </Field>
            <div className={s.fieldFull}>
              {collateralTokens.length > 0 && <span className={s.fieldLabel}>Tokens</span>}
              {collateralTokens.map((t, i) => (
                <div key={i} className={s.tokenRow}>
                  <div className={s.input}>
                    <input value={t.tokenId} onChange={(e) => updateToken(i, { tokenId: e.target.value.trim() })} placeholder="Token ID" spellCheck={false} />
                  </div>
                  <Amount value={t.amount} onChange={(v) => updateToken(i, { amount: v })} unit={<Unit tokenId={t.tokenId.toLowerCase() || 'Token'} />} />
                  <button type="button" className={s.removeBtn} aria-label="Remove token" onClick={() => edit(setCollateralTokens)(collateralTokens.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className={s.addBtn} onClick={() => edit(setCollateralTokens)([...collateralTokens, { tokenId: '', amount: '' }])}>
                + Add token
              </button>
            </div>
          </div>
        </div>

        <div className={s.section}>
          <h4 className={s.sectionTitle}>Batching fee</h4>
          <Field label="Fee" hint="Kept by whoever liquidates the bond if it is not repaid. Lithos miners liquidate bonds paying 0.05 ERG or more.">
            <Amount value={fee} onChange={edit(setFee)} unit={<span className={s.inputUnit}>ERG</span>} />
            <div className={s.chips}>
              {FEE_CHIPS.map((c) => (
                <button key={c} type="button" className={`${x.chipBtn} ${fee === c ? x.chipBtnOn : ''}`} onClick={() => edit(setFee)(c)}>
                  {c} ERG
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div className={x.formSide}>
        <div className={`${m.card} ${s.summary}`}>
          <div className={s.summaryHead}>{side === 'borrow' ? 'Your order' : 'Your offer'}</div>
          <div className={s.summaryApr} style={apr != null && apr <= 0 ? { color: 'var(--cur-muted)' } : undefined}>
            {apr == null ? '—' : pct(apr, 1)}
          </div>
          <div className={s.sub}>
            {ret == null ? 'APR, once the loan and repayment are set' : `APR · ${ret >= 0 ? '+' : ''}${pct(ret)} over ${fmtTerm(blocks)}`}
          </div>
          <div className={s.summaryRows}>
            <div className={s.summaryRow}>
              <span>You lock</span>
              <span>
                {side === 'borrow'
                  ? collateralErg
                    ? `${collateralErg} ERG${collateralTokens.length ? ` + ${collateralTokens.length} token${collateralTokens.length === 1 ? '' : 's'}` : ''}`
                    : '—'
                  : loanAmount
                    ? `${loanAmount} ${kind === 'ERG' ? 'ERG' : assetName(verified, asset || '------')} + 0.001 ERG`
                    : '—'}
              </span>
            </div>
            <div className={s.summaryRow}>
              <span>{side === 'borrow' ? 'You receive when filled' : 'You are repaid'}</span>
              <span>
                {(side === 'borrow' ? loanAmount : repayAmount)
                  ? `${side === 'borrow' ? loanAmount : repayAmount} ${kind === 'ERG' ? 'ERG' : assetName(verified, asset || '------')}`
                  : '—'}
              </span>
            </div>
            <div className={s.summaryRow}>
              <span>Repay by</span>
              <span>{fixed ? `Block ${fmtInt(tip + (Number.isFinite(blocks) ? blocks : 0))}` : `${fmtTerm(blocks)} after the fill`}</span>
            </div>
            <div className={s.summaryRow}>
              <span>Liquidation</span>
              <span>At maturity</span>
            </div>
            <div className={s.summaryRow}>
              <span>Network fee</span>
              <span>{fmtErg(1_000_000n)} ERG</span>
            </div>
          </div>

          {error && <Alert kind="error" title="Not possible">{error}</Alert>}
          {quote?.warnings.map((w) => (
            <Alert key={w} kind="warn">
              {w}
            </Alert>
          ))}

          {sent ? (
            <TxResult title={side === 'borrow' ? 'Order created' : 'Offer created'} outcome={sent.outcome} txId={sent.txId} rows={[['Box', sent.boxId]]}>
              <div style={{ marginTop: 8 }}>It shows under Portfolio once your node has it.</div>
            </TxResult>
          ) : quote ? (
            keyed ? (
              <button type="button" className={s.primaryBtn} onClick={create} disabled={busy}>
                {busy ? <Spinner /> : side === 'borrow' ? 'Create order' : 'Create offer'}
              </button>
            ) : (
              <KeyGate what="creating this" />
            )
          ) : (
            <>
              <button type="button" className={s.primaryBtn} onClick={review} disabled={busy || !request.body}>
                {busy ? <Spinner /> : 'Review'}
              </button>
              <div className={s.why}>{request.why ?? 'Your client checks the terms. Nothing is signed.'}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
