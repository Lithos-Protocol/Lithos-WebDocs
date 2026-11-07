import React, { useEffect, useRef, useState } from 'react';
import Link from '@docusaurus/Link';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { KeyGate } from '../Extensions/ui';
import { Alert, Spinner, TxResult } from '../Dex/ui';
import { assetName, AssetIcon, Contents, decimalsOf, TokenAmount, useTokens } from './tokens';
import { BLOCKS_PER_YEAR, fmtInt, fmtTerm, pct } from './format';
import { BLOCKS_PER_DAY, buildOrder, decimalText, units, termToBlocks } from './order';
import AssetPicker from './AssetPicker';
import { BOX_MINIMUM, NETWORK_FEE, isNftAsset } from './bond';
import { CollateralHealth, UsdValue } from './PriceContext';

function Field({ label, hint, children, full = false }) {
  return <div className={full ? s.fieldFull : undefined}><span className={s.fieldLabel}>{label}</span>{children}{hint && <p className={s.hint}>{hint}</p>}</div>;
}
function Amount({ label, value, onChange, asset = 'ERG', suffix, integer = false }) {
  const { metadata, checks } = useTokens();
  return <div className={s.input}><input aria-label={label} inputMode={integer ? 'numeric' : 'decimal'} pattern={integer ? '[0-9]*' : undefined} value={value} onChange={(e) => { if (!integer || /^\d*$/.test(e.target.value)) onChange(e.target.value); }} placeholder={integer ? '0' : '0.00'} />
    <span className={s.inputUnit}>{suffix ?? <><AssetIcon tokenId={asset} size={20} />{assetName(metadata, asset, checks)}</>}</span>
  </div>;
}

function SectionIcon({ kind }) {
  const paths = { loan: 'M4 8h16M7 5 4 8l3 3m10 2 3 3-3 3M4 16h16', time: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', collateral: 'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3m-4 9 3 3 5-6', fee: 'M4 7c0-2 16-2 16 0s-16 2-16 0m0 0v10c0 3 16 3 16 0V7M4 12c0 3 16 3 16 0' };
  return <span className={s.sectionSymbol} aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]} /></svg></span>;
}

export default function Create() {
  const { keyed, changed, height, version } = useExtensions();
  const { verified, metadata, wallet, walletError, checks } = useTokens();
  const [asset, setAsset] = useState('ERG');
  const [loanAmount, setLoanAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [term, setTerm] = useState('30');
  const [termUnit, setTermUnit] = useState('days');
  const [schedule, setSchedule] = useState('onClose');
  const [collateralErg, setCollateralErg] = useState('');
  const [collateralTokens, setCollateralTokens] = useState([]);
  const [fee, setFee] = useState('0.05');
  const [reviewed, setReviewed] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const nftIds = new Set([
    ...Object.keys(checks).filter((id) => isNftAsset(metadata[id], checks[id])),
    ...(wallet?.tokens ?? []).filter((t) => isNftAsset({ ...t, verified: t.verified || !!verified[t.tokenId] }, checks[t.tokenId])).map((t) => t.tokenId),
  ]);
  const request = buildOrder({ asset, loanAmount, repayAmount, term, termUnit, schedule, collateralErg, collateralTokens, fee, height, metadata, wallet, nftIds });
  const requestKey = request.body ? JSON.stringify([version, api.getBaseUrl(), request.body]) : '';
  const current = useRef(requestKey);
  current.current = requestKey;
  useEffect(() => { setReviewed(null); setError(null); }, [requestKey]);
  const edit = (set) => (value) => { set(value); setReviewed(null); setError(null); };
  const principal = units(loanAmount, decimalsOf(metadata, asset));
  const repayment = units(repayAmount, decimalsOf(metadata, asset));
  const duration = termToBlocks(term, termUnit);
  const interest = principal && repayment ? Number(repayment - principal) / Number(principal) : null;
  const apr = interest != null && duration > 0 ? interest * BLOCKS_PER_YEAR / duration : null;
  const loanOptions = [{ tokenId: 'ERG', verified: true }, ...Object.values(metadata).filter((t) => !nftIds.has(t.tokenId))];
  const heldTokens = (wallet?.tokens ?? []).filter((t) => BigInt(t.amount) > 0n && t.tokenId !== asset);
  const ergCollateral = units(collateralErg.trim() || '0', 9, true);
  const feeAmount = units(fee, 9);
  const locked = ergCollateral != null && feeAmount != null ? ergCollateral + feeAmount + BOX_MINIMUM : null;
  const networkFee = BigInt(reviewed?.quote.feeNanoErgs ?? NETWORK_FEE);
  const selectedTokens = collateralTokens.flatMap((t) => {
    const amount = nftIds.has(t.tokenId) ? 1n : units(t.amount, decimalsOf(metadata, t.tokenId));
    return t.tokenId && amount ? [{ tokenId: t.tokenId, amount: amount.toString() }] : [];
  });
  const updateToken = (i, patch) => edit(setCollateralTokens)(collateralTokens.map((t, j) => j === i ? { ...t, ...patch } : t));
  const valuationTerms = {
    principalNanoErgs: asset === 'ERG' && principal != null ? principal.toString() : null,
    principalToken: asset !== 'ERG' && principal != null ? {tokenId:asset,amount:principal.toString()} : null,
    collateralNanoErgs: ((ergCollateral ?? 0n)+(feeAmount ?? 0n)+BOX_MINIMUM).toString(),
    batchingFee: (feeAmount ?? 0n).toString(), collateralTokens:selectedTokens,
  };
  const preview = async () => {
    if (!request.body) return;
    const body = request.body;
    const key = requestKey;
    setBusy(true); setError(null);
    try {
      const quote = await api.checkCreateOrder(body);
      if (current.current === key) setReviewed({ quote, body, key });
    } catch (e) { if (current.current === key) setError(e.message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!reviewed || reviewed.key !== current.current) return;
    setBusy(true); setError(null);
    try { setSent(await api.createOrder(reviewed.body)); changed(); }
    catch (e) { setError(e.message); setReviewed(null); if (e.status === 409) changed(); }
    finally { setBusy(false); }
  };
  const presetReturn = (percent) => {
    if (principal) edit(setRepayAmount)(decimalText(principal + principal * BigInt(percent) / 100n, decimalsOf(metadata, asset)));
  };
  const changeTermUnit = (unit) => {
    edit(setTerm)(duration == null ? '' : unit === 'blocks' ? String(duration) : String(Number((duration / BLOCKS_PER_DAY).toFixed(9))));
    setTermUnit(unit);
  };
  return <>
    <div className={s.marketHead}><div><h2 className={s.sectionHeading}>Borrow</h2><p className={s.intro}>Set your terms and secure a loan with assets from your wallet.</p></div><span className={s.liveBadge}>Fixed-term lending</span></div>
    <div className={s.createGrid}>
      <fieldset className={s.formCard} disabled={busy || !!sent}>
        <section className={s.section}>
          <h3 className={s.sectionTitle}><SectionIcon kind="loan" />Loan terms</h3>
          <div className={s.fieldGrid}>
            <Field label="Loan asset" full><AssetPicker tokens={loanOptions} value={asset} label="Loan asset" allowCustom excludeNfts onChange={(id) => { edit(setAsset)(id); setLoanAmount(''); setRepayAmount(''); }} /></Field>
            <Field label="Loan amount"><Amount label="Loan amount" value={loanAmount} onChange={edit(setLoanAmount)} asset={asset} /></Field>
            <Field label="Repayment"><Amount label="Repayment" value={repayAmount} onChange={edit(setRepayAmount)} asset={asset} /><div className={s.chips}>{[2, 5, 10].map((p) => <button type="button" key={p} className={s.chip} disabled={!principal} onClick={() => presetReturn(p)}>+{p}%</button>)}</div></Field>
            {asset !== 'ERG' && !verified[asset] && <p className={`${s.hint} ${s.fieldFull}`}>Unverified token. {metadata[asset]?.decimals == null ? 'Decimals are unknown; enter raw whole units.' : 'Check the token ID before creating this loan.'}</p>}
          </div>
        </section>
        <section className={s.section}>
          <h3 className={s.sectionTitle}><SectionIcon kind="time" />Duration</h3>
          <div className={s.fieldGrid}>
            <Field label="Loan term" hint={duration > 0 ? termUnit === 'days' ? `Approximately ${fmtInt(duration)} blocks` : `${fmtTerm(duration)} · exact block duration` : null}><Amount label={`Loan term in ${termUnit}`} value={term} onChange={edit(setTerm)} integer={termUnit === 'blocks'} suffix={<select className={s.unitSelect} aria-label="Term unit" value={termUnit} onChange={(e) => changeTermUnit(e.target.value)}><option value="days">days</option><option value="blocks">blocks</option></select>} /><div className={s.chips}>{[7, 30, 90].map((d) => <button key={d} type="button" className={`${s.chip} ${duration === d * BLOCKS_PER_DAY ? s.chipActive : ''}`} onClick={() => edit(setTerm)(String(termUnit === 'blocks' ? d * BLOCKS_PER_DAY : d))}>{d} days</button>)}</div></Field>
            <Field label="Term starts" hint={schedule === 'onClose' ? 'The full term begins when a lender funds your request.' : 'Maturity is fixed when you publish. The available term shortens while waiting.'}><select className={s.fullSelect} value={schedule} onChange={(e) => edit(setSchedule)(e.target.value)} aria-label="Term starts"><option value="onClose">When funded</option><option value="fixed">Fixed maturity</option></select></Field>
          </div>
        </section>
        <section className={s.section}>
          <h3 className={s.sectionTitle}><SectionIcon kind="collateral" />Collateral</h3>
          {!keyed ? <KeyGate what="wallet collateral" /> : walletError ? <Alert kind="error" title="Wallet unavailable">{walletError}</Alert> : !wallet ? <p className={s.hint}><Spinner /> Loading wallet tokens</p> : <p className={s.walletAvailable}><span>Available</span><TokenAmount tokenId="ERG" amount={wallet.nanoErgs} /></p>}
          <div className={s.fieldGrid}>
            <Field label="ERG collateral" full hint="Your collateral amount. The batching / liquidation fee and 0.001 ERG box minimum are added separately."><Amount label="ERG collateral" value={collateralErg} onChange={edit(setCollateralErg)} /></Field>
            <div className={s.fieldFull}>
              {collateralTokens.map((t, i) => <div className={s.tokenRow} key={i}>
                <AssetPicker label={`Collateral token ${i + 1}`} tokens={heldTokens.filter((a) => !collateralTokens.some((b, j) => j !== i && a.tokenId === b.tokenId))} value={t.tokenId} onChange={(id) => updateToken(i, { tokenId: id, amount: nftIds.has(id) ? '1' : '' })} balances />
                <>{nftIds.has(t.tokenId) ? <div className={s.fixedAmount} aria-label={`Collateral amount ${i + 1}: fixed at one`}><TokenAmount tokenId={t.tokenId} amount="1" /></div> : <Amount label={`Collateral amount ${i + 1}`} value={t.amount} onChange={(amount) => updateToken(i, { amount })} asset={t.tokenId || 'ERG'} suffix={!t.tokenId ? 'Token' : undefined} />}</>
                <button type="button" className={s.removeBtn} aria-label={`Remove collateral token ${i + 1}`} onClick={() => edit(setCollateralTokens)(collateralTokens.filter((_, j) => j !== i))}>×</button>
              </div>)}
              <button type="button" className={s.addBtn} disabled={!wallet || heldTokens.length <= collateralTokens.length} onClick={() => edit(setCollateralTokens)([...collateralTokens, { tokenId: '', amount: '' }])}>+ Add wallet token</button>
              {wallet && !heldTokens.length && <p className={s.hint}>No other tokens available in this wallet.</p>}
            </div>
          </div>
        </section>
        <section className={s.section}>
          <h3 className={s.sectionTitle}><SectionIcon kind="fee" />Batching / liquidation fee</h3>
          <Amount label="Batching / liquidation fee" value={fee} onChange={edit(setFee)} />
          <p className={s.hint}>Added to your collateral and paid to the liquidator only if the loan matures unpaid. Minimum 0.05 ERG. This reserve and the box minimum return with your collateral on repayment.</p>
        </section>
      </fieldset>
      <aside className={s.formSide}>
        <div className={s.summary}>
          <span className={s.eyebrow}>Loan summary</span>
          <div className={s.summaryRate}>{pct(interest)}<span>total interest</span></div>
          <p className={s.hint}>{interest != null ? `${pct(apr, 1)} APR · ${fmtTerm(duration)} · ${fmtInt(duration)} blocks` : 'Enter a loan amount and repayment.'}</p>
          <div className={s.summaryHealth}><CollateralHealth t={valuationTerms} /></div>
          <div className={s.summaryRows}>
            <div className={s.summaryRow}><span>Loan</span><span>{principal ? <><TokenAmount tokenId={asset} amount={principal} /><UsdValue tokenId={asset} amount={principal} /></> : '—'}</span></div>
            <div className={s.summaryRow}><span>Repayment</span><span>{repayment ? <><TokenAmount tokenId={asset} amount={repayment} /><UsdValue tokenId={asset} amount={repayment} /></> : '—'}</span></div>
            <div className={s.summaryRow}><span>Duration</span><span className={s.cell}>{duration > 0 ? <><span>{fmtTerm(duration)}</span><span className={s.sub}>{fmtInt(duration)} blocks</span></> : '—'}</span></div>
            <div className={s.summaryRow}><span>Maturity</span><span>{schedule === 'onClose' ? 'From funding' : height && duration > 0 ? `Block ${fmtInt(height + duration)}` : '—'}</span></div>
            <div className={s.summaryRow}><span>Collateral</span><span>{ergCollateral != null ? <Contents nanoErgs={ergCollateral} tokens={selectedTokens} /> : '—'}{ergCollateral === 0n && !selectedTokens.length && <TokenAmount tokenId="ERG" amount="0" />}<UsdValue nanoErgs={ergCollateral ?? '0'} tokens={selectedTokens} /></span></div>
            <div className={s.summaryRow}><span>Batching / liquidation fee</span><span>{feeAmount ? <TokenAmount tokenId="ERG" amount={feeAmount} /> : '—'}</span></div>
            <div className={s.summaryRow}><span>Box minimum</span><TokenAmount tokenId="ERG" amount={BOX_MINIMUM} /></div>
            <div className={`${s.summaryRow} ${s.summaryTotal}`}><span>Total locked</span><span>{locked != null ? <Contents nanoErgs={locked} tokens={selectedTokens} /> : '—'}</span></div>
            <div className={s.summaryRow}><span>Creation network fee</span><TokenAmount tokenId="ERG" amount={networkFee} /></div>
            <div className={`${s.summaryRow} ${s.summaryTotal}`}><span>Total to pay</span><span>{locked != null ? <Contents nanoErgs={locked + networkFee} tokens={selectedTokens} /> : '—'}</span></div>
          </div>
          {error && <Alert kind="error" title="Request unavailable">{error}</Alert>}
          {reviewed && <div className={s.reviewBox}><span className={s.fieldLabel}>Transaction preview</span><span className={s.hint}>You pay, including the network fee</span><Contents nanoErgs={reviewed.quote.paysNanoErgs} tokens={reviewed.quote.paysTokens} />{reviewed.quote.notes.map((n) => <p className={s.hint} key={n}>{n}</p>)}</div>}
          {reviewed?.quote.warnings.map((warning) => <Alert kind="warn" key={warning}>{warning}</Alert>)}
          {sent ? <TxResult title="Request submitted" outcome={sent.outcome} txId={sent.txId} rows={sent.boxId ? [['Order', sent.boxId]] : []}><Link to="/extensions/sigmafi/portfolio">View portfolio ↗</Link></TxResult> : reviewed ? keyed ? <button type="button" className={s.primaryBtn} disabled={busy || reviewed.key !== requestKey} onClick={submit}>{busy ? <Spinner /> : 'Publish request'}</button> : <KeyGate what="publishing this request" /> : <><button type="button" className={s.primaryBtn} disabled={busy || !request.body} onClick={preview}>{busy ? <Spinner /> : 'Review request'}</button><p className={s.why}>{request.why ?? 'Preview the transaction before publishing.'}</p></>}
        </div>
        <p className={s.sideNote}>Repay before maturity to recover your collateral. After maturity, the lender can receive it through liquidation. <Link to="/docs/extensions/sigmafi-bonds">Read the docs ↗</Link></p>
      </aside>
    </div>
  </>;
}
