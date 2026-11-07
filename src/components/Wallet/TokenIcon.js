import React, { useEffect, useState } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import { tokenIconPath, tokenIconPlated } from './tokenIcons';
import s from './styles.module.css';
import { tokenDisplayName } from './assetNames';

/** Two characters for a token with no icon: from its ticker or name, else from its id. */
function initials(label, tokenId) {
  const letters = String(label ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (letters) return letters.slice(0, 2).toUpperCase();
  return String(tokenId ?? '?').slice(0, 2).toUpperCase();
}

/**
 * A token's bundled icon, or a neutral initials badge when none ships or the file fails to load. `tokenId` is
 * 'ERG' for ERG. Icons are matched by id only, so a token named like a known one gets the badge.
 */
export default function TokenIcon({ tokenId, label, size = 20 }) {
  const path = tokenIconPath(tokenId);
  // Called unconditionally: hooks cannot depend on whether an icon exists
  const src = useBaseUrl(path ?? '/');
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [tokenId]);

  if (path && !failed) {
    const plated = tokenIconPlated(tokenId);
    return (
      <img
        className={`${s.tokenIcon} ${plated ? s.tokenIconPlated : ''}`}
        // Padding in pixels: a percentage would resolve against the container's width
        style={plated ? { padding: Math.max(1, Math.round(size * 0.1)) } : undefined}
        src={src}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={s.tokenInitials}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }}
      aria-hidden="true"
    >
      {initials(label, tokenId)}
    </span>
  );
}

/** Two tokens' icons overlapping, X in front, for a pool's pair. */
export function PairIcons({ x, y, size = 22 }) {
  return (
    <span className={s.pairIcons} style={{ '--pair-size': `${size}px` }}>
      <TokenIcon tokenId={x?.tokenId} label={x?.ticker ?? x?.name} size={size} />
      <TokenIcon tokenId={y?.tokenId} label={y?.ticker ?? y?.name} size={size} />
    </span>
  );
}

/**
 * Whether the client's verified list names a token or pool. `unsafe` is for a pool whose genesis breaks a fact
 * its contracts rely on, which can be drained.
 */
export function TrustBadge({ status, title, bondState }) {
  const meta = TRUST[status] ?? TRUST.unverified;
  return (
    <span className={`${s.trust} ${s[meta.cls]} ${status === 'bond' ? s.bondTone : ''}`} data-state={status === 'bond' ? bondState : undefined} title={title ?? meta.hint}>
      {meta.glyph && <span aria-hidden="true">{meta.glyph}</span>}
      {meta.label}
    </span>
  );
}

const TRUST = {
  verified: { label: 'Verified', glyph: '✓', cls: 'trustVerified', hint: 'On the verified list this client ships with' },
  unverified: { label: 'Unverified', cls: 'trustUnverified', hint: 'Not on the verified list: anyone can mint a token or create a pool' },
  unchecked: { label: 'Not checked', cls: 'trustUnverified', hint: 'The client has not yet read this pool’s genesis' },
  unsafe: { label: 'Can be drained', glyph: '!', cls: 'trustUnsafe', hint: 'Its genesis breaks a fact the pool contracts rely on' },
  provision: { label: 'LD-NFT', glyph: '✓', cls: 'trustProvision', hint: 'Owns a provision on a LithosDex pool, checked by this client' },
  fakeNft: { label: 'Not an LD-NFT', glyph: '!', cls: 'trustUnsafe', hint: 'Named like a provision NFT, but owns no open provision' },
  checking: { label: 'Checking', cls: 'trustUnverified', hint: 'Asking the client whether this token owns a provision' },
  bond: { label: 'ZC-Bond', glyph: '✓', cls: 'trustBond', hint: 'A SigmaFi bond asset, checked against the order that minted it' },
  fakeBond: { label: 'Not a ZC-Bond', glyph: '!', cls: 'trustUnsafe', hint: 'Named or minted like a bond asset, but not the one its bond was created with' },
};

/** A token's display name: ERG, a verified ticker, the minter's chosen name, or a short id. */
export const tokenLabel = tokenDisplayName;
