import React from 'react';
import s from './styles.module.css';
import TokenIcon, { PairIcons, TrustBadge } from './TokenIcon';
import BondIcon from './BondIcon';
import { ProvisionStats, RedeemedStats } from './ProvisionStats';
import { big, fmtErg, fmtInt, fmtToken, shortId } from '../Dex/format';
import { bondState, BOND_STATE_LABEL, collateralOf } from '../SigmaFi/bond';
import { fmtTerm } from '../SigmaFi/format';

const Line = ({ label, children }) => <span className={s.hoverRow}><span>{label}</span><span>{children}</span></span>;

function AssetValue({ tokenId = 'ERG', amount, metadata }) {
  const t = metadata?.[tokenId];
  return <span className={s.hoverAsset}><TokenIcon tokenId={tokenId} label={t?.ticker ?? t?.name} size={16} />
    {tokenId === 'ERG' ? `${fmtErg(amount)} ERG` : t?.decimals != null ? `${fmtToken(amount, t.decimals)} ${t.ticker ?? shortId(tokenId, 4, 4)}` : `${fmtInt(amount)} units · ${shortId(tokenId, 4, 4)}`}
  </span>;
}

export function BondStats({ b, metadata }) {
  const t = b.bond?.terms;
  const state = bondState(b);
  const collateral = t ? collateralOf(t) : null;
  const vault = b.vault ?? [];
  const assets = new Map();
  vault.forEach((v) => (v.tokens ?? []).forEach((a) => assets.set(a.tokenId, (assets.get(a.tokenId) ?? 0n) + big(a.amount))));
  return <>
    <Line label="Type">Zero-coupon bond</Line>
    <Line label="Status"><span className={`${s.bondStatus} ${s.bondTone}`} data-state={state}>{BOND_STATE_LABEL[state]}</span></Line>
    {state === 'settled' && <span className={s.settlementNote}>Proceeds await claim. Repayment versus liquidation is not identified.</span>}
    {t && <>
      <Line label="Repayment"><AssetValue tokenId={t.repayToken ?? 'ERG'} amount={t.repayment} metadata={metadata} /></Line>
      <Line label="Maturity"><span className={s.hoverAssets}><span>Block {fmtInt(t.maturityHeight)}</span><span>{fmtInt(b.bond.blocksLeft)} blocks left{b.bond.blocksLeft > 0 ? ` · ${fmtTerm(b.bond.blocksLeft)}` : ''}</span></span></Line>
      <Line label="Collateral"><span className={s.hoverAssets}>
        {collateral.collateral > 0n && <AssetValue amount={collateral.collateral} metadata={metadata} />}
        {t.collateralTokens.map((a) => <AssetValue key={a.tokenId} {...a} metadata={metadata} />)}
        {collateral.collateral === 0n && !t.collateralTokens.length && <AssetValue amount="0" metadata={metadata} />}
      </span></Line>
      <Line label="Batching fee"><AssetValue amount={t.batchingFee} metadata={metadata} /></Line>
      <Line label="Box minimum"><AssetValue amount={collateral.minimum} metadata={metadata} /></Line>
      <Line label="ERG locked"><AssetValue amount={collateral.total} metadata={metadata} /></Line>
    </>}
    {vault.length > 0 && <Line label="Vault proceeds"><span className={s.hoverAssets}>
      <AssetValue amount={vault.reduce((n, v) => n + big(v.nanoErgs), 0n)} metadata={metadata} />
      {[...assets].map(([tokenId, amount]) => <AssetValue key={tokenId} tokenId={tokenId} amount={amount} metadata={metadata} />)}
    </span></Line>}
    {!b.verified && <span className={s.tokenSubWarn}>{b.verification ?? 'Bond origin could not be verified.'}</span>}
  </>;
}

/** Shared Wallet and SigmaFi details; asset kinds always come from chain lookups. */
export default function TokenHover({ t, check, status, candidate, metadata, tooltipId }) {
  const c = check?.provisionNft ? check : null;
  const b = check?.bond?.bondAsset ? check.bond : null;
  return <span className={s.hoverCard} role="tooltip" id={tooltipId}>
    <span className={s.hoverTitle}>
      {c ? <PairIcons x={c.pool.tokenX} y={c.pool.tokenY} size={20} /> : b?.verified ? <BondIcon bond={b.bond} state={bondState(b)} size={28} /> : <TokenIcon tokenId={t.tokenId} label={t.ticker ?? t.name} size={22} />}
      <span>{c ? 'LithosDex provision' : b?.verified ? 'SigmaFi bond' : t.ticker ?? t.name ?? 'Token'}</span>
      <TrustBadge status={status} bondState={b ? bondState(b) : undefined} />
    </span>
    {c ? <ProvisionStats c={c} checkedAt={c.at} /> : b ? <BondStats b={b} metadata={metadata} /> : check?.redeemed ? <RedeemedStats c={check} /> : <>
      <Line label="List">{t.verified ? 'Verified' : 'Unverified'}</Line>
      {t.name && <Line label="Name">{t.name}</Line>}
      <Line label="Amount">{t.decimals == null ? `${fmtInt(t.amount)} raw units` : fmtToken(t.amount, t.decimals, t.decimals)}</Line>
      <Line label="Decimals">{t.decimals ?? 'Unknown'}</Line>
      {candidate && <Line label="Asset check">{status === 'checking' ? 'Checking' : check ? 'No active provision' : 'Not checked'}</Line>}
    </>}
    <span className={s.hoverId}>{t.tokenId}</span>
  </span>;
}
