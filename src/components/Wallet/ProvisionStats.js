import React from 'react';
import s from './styles.module.css';
import { fmtErgAmount, fmtInt, fmtPct, hasAny } from '../Dex/format';
import { pairLabel, kindLabel, poolTrust, fmtSide } from '../Dex/pools';
import { TrustBadge, tokenLabel } from './TokenIcon';

const Line = ({ label, children }) => (
  <span className={s.hoverRow}>
    <span>{label}</span>
    <span>{children}</span>
  </span>
);

/** The pool a provision NFT belongs to, and how its NFT was minted: shared by an open and a redeemed provision. */
function PoolAndMint({ c }) {
  const { pool, minted } = c;
  const both = (ax, ay) =>
    `${fmtSide(ax, pool.tokenX)} ${tokenLabel(pool.tokenX)} + ${fmtSide(ay, pool.tokenY)} ${tokenLabel(pool.tokenY)}`;
  return (
    <>
      <Line label="Pool">
        {pairLabel(pool)} ({kindLabel(pool.kind)})
      </Line>
      <Line label="Pool list">
        <TrustBadge status={poolTrust(pool)} />
      </Line>
      {minted && (
        <>
          <Line label={minted.genesis ? 'Created the pool' : 'Deposited'}>block {fmtInt(minted.height)}</Line>
          <Line label="Put in">{both(minted.amountX, minted.amountY)}</Line>
        </>
      )}
    </>
  );
}

/**
 * What a provision check found for an NFT that owns one: its pool, how it was minted, its stake, its fees and when
 * its box may be refreshed. `c` is one answer of `POST /dex/provisions/nft`.
 */
export function ProvisionStats({ c, checkedAt }) {
  const { pool, provision: p } = c;
  const both = (ax, ay) =>
    `${fmtSide(ax, pool.tokenX)} ${tokenLabel(pool.tokenX)} + ${fmtSide(ay, pool.tokenY)} ${tokenLabel(pool.tokenY)}`;
  return (
    <>
      <PoolAndMint c={c} />
      <Line label="Shares">{fmtInt(p.shares)}</Line>
      <Line label="Share of pool">{fmtPct(p.shareOfSupply, 4)}</Line>
      <Line label="Liquidity now">{both(c.amountX, c.amountY)}</Line>
      <Line label="Claimable fees">{hasAny(p.claimableX, p.claimableY) ? both(p.claimableX, p.claimableY) : 'none yet'}</Line>
      {p.awaitingFlush && <Line label="Awaiting a flush">{both(p.unflushedX, p.unflushedY)}</Line>}
      <Line label="Last claimed">
        {c.lastClaimedHeight != null ? `block ${fmtInt(c.lastClaimedHeight)}` : 'never'}
      </Line>
      <Line label="Box holds">{fmtErgAmount(p.value, 4)} ERG</Line>
      {c.refreshableHeight != null && (
        <Line label="Refreshable from">
          block {fmtInt(c.refreshableHeight)}
          {c.refreshBountyNanoErg != null && `, paying ${fmtErgAmount(c.refreshBountyNanoErg, 4)} ERG`}
        </Line>
      )}
      {checkedAt != null && (
        <Line label="Checked at">
          {new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Line>
      )}
    </>
  );
}

/** A token that owned a provision since closed: what pool it was in, and what went in. */
export function RedeemedStats({ c }) {
  return (
    <>
      <PoolAndMint c={c} />
      <Line label="Provision">closed, its liquidity taken out</Line>
    </>
  );
}
