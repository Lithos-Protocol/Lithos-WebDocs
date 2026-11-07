import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { getBalances, lookupNfts, NFT_LOOKUP_MAX } from '../Wallet/api';
import { big, fmtErgAmount, fmtTokenAmount, fmtInt } from '../Dex/format';
import TokenIcon, { PairIcons, TrustBadge } from '../Wallet/TokenIcon';
import BondIcon from '../Wallet/BondIcon';
import TokenHover from '../Wallet/AssetDetails';
import AssetHover from '../Wallet/AssetHover';
import { bondState } from './bond';
import s from './styles.module.css';
import { useExtensions } from '../Extensions/ExtensionsLayout';

const TokenContext = createContext(null);
export const useTokens = () => useContext(TokenContext);
export const BOND_NAME = 'SigmaFi ZC-Bond';

export function TokenProvider({ children }) {
  const { keyed, version, tick } = useExtensions();
  const [verified, setVerified] = useState({});
  const [wallet, setWallet] = useState(null);
  const [walletError, setWalletError] = useState(null);
  const [checks, setChecks] = useState({});
  const asked = useRef(new Set());
  const generation = useRef(0);
  const checksRef = useRef(checks);
  checksRef.current = checks;

  useEffect(() => {
    let live = true;
    setVerified({});
    api.getVerifiedTokens().then((r) => {
      if (live) setVerified(Object.fromEntries((r?.tokens ?? []).map((t) => [t.tokenId, { ...t, verified: true }])));
    }, () => live && setVerified({}));
    return () => { live = false; };
  }, [version]);

  useEffect(() => { generation.current += 1; asked.current.clear(); setChecks({}); }, [version]);

  useEffect(() => { setWallet(null); setWalletError(null); }, [keyed, version]);

  useEffect(() => {
    let live = true;
    if (keyed) getBalances().then((r) => { if (live) { setWallet(r); setWalletError(null); } }, (e) => live && setWalletError(e.message));
    return () => { live = false; };
  }, [keyed, tick, version]);

  const check = useCallback(async (ids, force = false) => {
    const todo = [...new Set(ids)].filter((id) => id && id !== 'ERG' && (force || !asked.current.has(id)));
    if (!todo.length) return;
    const at = generation.current;
    todo.forEach((id) => asked.current.add(id));
    const found = {};
    await Promise.allSettled([
      (async () => {
        for (let i = 0; i < todo.length; i += NFT_LOOKUP_MAX) {
          const { nfts } = await lookupNfts(todo.slice(i, i + NFT_LOOKUP_MAX));
          for (const n of nfts) found[n.tokenId] = { ...found[n.tokenId], nft: n };
        }
      })(),
      (async () => {
        for (let i = 0; i < todo.length; i += api.ASSET_LOOKUP_MAX) {
          const assets = await api.lookupAssets(todo.slice(i, i + api.ASSET_LOOKUP_MAX));
          for (const a of assets) found[a.tokenId] = { ...found[a.tokenId], bond: a };
        }
      })(),
    ]);
    if (at !== generation.current) return;
    setChecks((prev) => ({ ...prev, ...found }));
  }, []);

  useEffect(() => {
    if (tick > 0) check(Object.keys(checksRef.current), true);
  }, [tick, check]);

  const metadata = { ...Object.fromEntries((wallet?.tokens ?? []).map((t) => [t.tokenId, t])), ...verified };
  return <TokenContext.Provider value={{ verified, metadata, wallet, walletError, checks, check }}>{children}</TokenContext.Provider>;
}

export function tokenStatus(tokenId, verified, check, name) {
  if (verified) return 'verified';
  if (check?.nft?.provisionNft) return 'provision';
  if (check?.bond?.bondAsset && check.bond.verified) return 'bond';
  if (check?.bond && (check.bond.bondAsset || name === BOND_NAME)) return 'fakeBond';
  return 'unverified';
}

export const IdTag = ({ tokenId }) => <span className={s.idTag} title={tokenId}>{tokenId.slice(0, 6)}…</span>;

export function AssetIcon({ tokenId, size = 24 }) {
  const ctx = useTokens();
  const c = ctx?.checks[tokenId];
  if (c?.nft?.provisionNft) return <PairIcons x={c.nft.pool.tokenX} y={c.nft.pool.tokenY} size={size * .8} />;
  if (c?.bond?.verified) return <BondIcon bond={c.bond.bond} state={bondState(c.bond)} size={size} />;
  return <TokenIcon tokenId={tokenId} label={ctx?.metadata[tokenId]?.ticker ?? ctx?.metadata[tokenId]?.name} size={size} />;
}

export function TokenAmount({ tokenId, amount, icon = true }) {
  const ctx = useTokens();
  const check = ctx?.checks[tokenId];
  const metadata = ctx?.metadata[tokenId];
  const verified = ctx?.verified[tokenId];
  const status = tokenStatus(tokenId, verified, check, metadata?.name);
  const special = ['provision', 'bond', 'fakeBond'].includes(status);
  useEffect(() => {
    if (ctx && tokenId !== 'ERG' && big(amount) === 1n) ctx.check([tokenId]);
  }, [ctx?.check, ctx?.checks, tokenId, amount]);
  const label = tokenId === 'ERG' ? 'ERG' : verified?.ticker ?? (status === 'provision' ? 'LD-NFT' : status === 'bond' ? 'SigmaFi Bond' : null);
  const decimals = tokenId === 'ERG' ? 9 : metadata?.decimals;
  return (
    <AssetHover className={s.tokenAmount} enabled={tokenId !== 'ERG'} details={<TokenHover t={{ ...metadata, tokenId, amount, verified: !!verified, decimals }} check={{ ...check?.nft, bond: check?.bond }} status={status} candidate={big(amount) === 1n} metadata={ctx?.metadata} />}>
      {icon && <AssetIcon tokenId={tokenId} size={special ? 25 : 20} />}
      <span className={s.amount}>{tokenId === 'ERG' ? fmtErgAmount(amount) : decimals != null ? fmtTokenAmount(amount, decimals, 4) : fmtInt(amount)}</span>
      {!special && (label ? <span className={s.ticker}>{label}</span> : <IdTag tokenId={tokenId} />)}
      {special && <TrustBadge status={status} bondState={check?.bond ? bondState(check.bond) : undefined} />}
    </AssetHover>
  );
}

export const assetName = (metadata, tokenId) => tokenId === 'ERG' ? 'ERG' : metadata?.[tokenId]?.ticker ?? metadata?.[tokenId]?.name ?? tokenId.slice(0, 6);
export const decimalsOf = (metadata, tokenId) => tokenId === 'ERG' ? 9 : metadata?.[tokenId]?.decimals ?? 0;

export function Contents({ nanoErgs, tokens = [] }) {
  return <span className={s.contents}>
    {big(nanoErgs) > 0n && <TokenAmount tokenId="ERG" amount={nanoErgs} />}
    {tokens.map((t) => <TokenAmount key={t.tokenId} tokenId={t.tokenId} amount={t.amount} />)}
  </span>;
}
