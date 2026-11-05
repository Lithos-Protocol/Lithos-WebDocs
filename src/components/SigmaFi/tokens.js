import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { lookupNfts, NFT_LOOKUP_MAX } from '../Wallet/api';
import { big, fmtErg, fmtToken, fmtTokenAmount, fmtInt } from '../Dex/format';
import s from './styles.module.css';

/**
 * How a token in a bond's terms is shown, the same way the wallet shows it: a verified ticker, or a single unit
 * checked against the chain as a LithosDex provision NFT or a SigmaFi bond asset, never by its name.
 */
const TokenContext = createContext(null);
export const useTokens = () => useContext(TokenContext);

/** The bond asset's EIP-4 name. Anyone can mint a token with it; only the chain says whether one is real. */
export const BOND_NAME = 'SigmaFi ZC-Bond';

/** What a check found for a token: its verified entry, LithosDex provision and bond-asset answers. */
export function TokenProvider({ children }) {
  const [verified, setVerified] = useState({});
  const [checks, setChecks] = useState({});
  const asked = useRef(new Set());

  useEffect(() => {
    api.getVerifiedTokens()
      .then((r) => setVerified(Object.fromEntries((r?.tokens ?? []).map((t) => [t.tokenId, t]))))
      .catch(() => setVerified({}));
  }, []);

  /** Asks both lookups for every id not asked yet, in the batch sizes each allows. */
  const check = useCallback(async (ids) => {
    const todo = [...new Set(ids)].filter((id) => id && id !== 'ERG' && !asked.current.has(id));
    if (!todo.length) return;
    todo.forEach((id) => asked.current.add(id));
    const found = {};
    try {
      for (let i = 0; i < todo.length; i += NFT_LOOKUP_MAX) {
        const { nfts } = await lookupNfts(todo.slice(i, i + NFT_LOOKUP_MAX));
        for (const n of nfts) found[n.tokenId] = { ...(found[n.tokenId] ?? {}), nft: n };
      }
    } catch {
      // A node without LithosDex reads still answers the bond lookup
    }
    try {
      for (let i = 0; i < todo.length; i += api.ASSET_LOOKUP_MAX) {
        const assets = await api.lookupAssets(todo.slice(i, i + api.ASSET_LOOKUP_MAX));
        for (const a of assets) found[a.tokenId] = { ...(found[a.tokenId] ?? {}), bond: a };
      }
    } catch {
      todo.forEach((id) => asked.current.delete(id));
    }
    setChecks((prev) => ({ ...prev, ...found }));
  }, []);

  return <TokenContext.Provider value={{ verified, checks, check }}>{children}</TokenContext.Provider>;
}

/** A token's standing, by the wallet's rule: the verified list first, then what a chain check found. */
export function tokenStatus(tokenId, verified, check, name) {
  if (verified) return 'verified';
  if (check?.nft?.provisionNft) return 'provision';
  if (check?.bond?.bondAsset && check.bond.verified) return 'bond';
  if (check?.bond && (check.bond.bondAsset || name === BOND_NAME)) return 'fakeBond';
  return 'unverified';
}

/** The kind tag a checked single-unit token carries, as the wallet marks it. */
const KIND = {
  provision: { label: 'LD-NFT', cls: s.kindNft, hint: 'Owns a provision on a LithosDex pool, checked against the chain' },
  bond: { label: 'ZC-Bond', cls: s.kindBond, hint: 'A SigmaFi bond asset, checked against the order or offer that minted it' },
  fakeBond: { label: 'Not a ZC-Bond', cls: s.kindBad, hint: 'Named or minted like a bond asset, but not the one its bond was created with' },
};

/** A token with no verified ticker: the first six characters of its id, the whole id on hover. */
export const IdTag = ({ tokenId }) => (
  <span className={s.idTag} title={tokenId}>
    {tokenId.slice(0, 6)}
  </span>
);

/**
 * One token amount: the amount at its decimals, then a verified ticker or a short id tag, and a kind tag when a
 * chain check found a LithosDex NFT or a bond asset. Single units are checked on first sight.
 */
export function TokenAmount({ tokenId, amount }) {
  const ctx = useTokens();
  useEffect(() => {
    if (ctx && tokenId !== 'ERG' && big(amount) === 1n) ctx.check([tokenId]);
  }, [ctx, tokenId, amount]);
  if (tokenId === 'ERG') {
    return (
      <span className={s.tokenAmount}>
        <span className={s.amount}>{fmtErg(amount)}</span>
        <span className={s.ticker}>ERG</span>
      </span>
    );
  }
  const v = ctx?.verified?.[tokenId];
  const status = tokenStatus(tokenId, v, ctx?.checks?.[tokenId]);
  const kind = KIND[status];
  return (
    <span className={s.tokenAmount} title={`${v ? fmtToken(amount, v.decimals, v.decimals) : fmtInt(amount)} of ${tokenId}`}>
      <span className={s.amount}>{v ? fmtTokenAmount(amount, v.decimals, 4) : fmtInt(amount)}</span>
      {v ? <span className={s.ticker}>{v.ticker}</span> : <IdTag tokenId={tokenId} />}
      {kind && (
        <span className={`${s.kindTag} ${kind.cls}`} title={kind.hint}>
          {kind.label}
        </span>
      )}
    </span>
  );
}

/** An asset's display name: ERG, a verified ticker, or the first six characters of its id. */
export const assetName = (verified, tokenId) =>
  tokenId === 'ERG' ? 'ERG' : verified?.[tokenId]?.ticker ?? tokenId.slice(0, 6);

/** A box's contents: its ERG, then each token. */
export function Contents({ nanoErgs, tokens = [] }) {
  return (
    <span className={s.contents}>
      {big(nanoErgs) > 0n && <TokenAmount tokenId="ERG" amount={nanoErgs} />}
      {tokens.map((t) => (
        <TokenAmount key={t.tokenId} tokenId={t.tokenId} amount={t.amount} />
      ))}
    </span>
  );
}

/** The decimals of a token the verified list names, or 0. */
export const decimalsOf = (verified, tokenId) => (tokenId === 'ERG' ? 9 : verified?.[tokenId]?.decimals ?? 0);
