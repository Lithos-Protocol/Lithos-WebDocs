import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from '@docusaurus/Link';
import { useHistory, useLocation } from '@docusaurus/router';
import s from './styles.module.css';
import p from './pools.module.css';
import w from '../Wallet/styles.module.css';
import { Alert } from './ui';
import { fmtInt, fmtIntCompact, shortId } from './format';
import TokenIcon, { PairIcons, TrustBadge } from '../Wallet/TokenIcon';
import { CopyButton } from '../Wallet/ui';
import { fmtPrice, fmtSide, fmtSideFull, kindLabel, pairLabel, poolTrust, tokenLabel } from './pools';

/** A fee numerator over the pool's denominator, as a percentage. */
const feePct = (fp, n) => `${((n / fp.feeDenom) * 100).toFixed(2)}%`;

/**
 * A pool's fees in full: the part kept in the reserves on every swap, then each side's provider fee, which a
 * creator can set apart. `compact` fits a table cell.
 */
export function FeeBreakdown({ pool, compact = false }) {
  const fp = pool?.feeParams;
  if (!fp) return <span>—</span>;
  const keep = feePct(fp, fp.feeDenom - fp.dexFeeNum);
  const x = tokenLabel(pool.tokenX);
  const y = tokenLabel(pool.tokenY);
  const title = `Kept by the pool: ${keep} of every swap. To providers: ${feePct(fp, fp.ergFeeNum)} selling ${x}, ` +
    `${feePct(fp, fp.tokenFeeNum)} selling ${y}.`;
  if (compact) {
    return (
      <span className={p.feeStack} title={title}>
        <span>{keep} pool</span>
        <span className={w.tokenSub}>
          +{feePct(fp, fp.ergFeeNum)} {x} · +{feePct(fp, fp.tokenFeeNum)} {y}
        </span>
      </span>
    );
  }
  return (
    <>
      <div className={s.statValue} title={title}>
        {keep} <span className={s.statUnit}>pool</span>
      </div>
      <div className={`${s.statSub} ${p.feeLines}`} title={title}>
        <span>
          +{feePct(fp, fp.ergFeeNum)} selling {x}
        </span>
        <span>
          +{feePct(fp, fp.tokenFeeNum)} selling {y}
        </span>
      </div>
    </>
  );
}

/** The ERG:LIT summary from its own routes, for while the pool index is still building after a restart. */
export function canonicalSummary(pool) {
  if (!pool) return null;
  const tokenY = { tokenId: pool.tokenY, name: pool.tokenName, ticker: pool.tokenName, decimals: pool.tokenDecimals, verified: true };
  const rx = Number(pool.reservesX) / 1e9;
  const ry = Number(pool.reservesY) / 10 ** (pool.tokenDecimals ?? 0);
  return {
    poolNFT: pool.poolNFT, kind: 'n2t', utxoId: pool.utxoId, inclusionHeight: pool.syncHeight,
    tokenX: { tokenId: 'ERG', name: 'ERG', ticker: 'ERG', decimals: 9, verified: true }, tokenY,
    reservesX: pool.reservesX, reservesY: pool.reservesY, pendingX: pool.pendingX, pendingY: pool.pendingY,
    supply: pool.supply, feeParams: pool.feeParams, provTokensLeft: pool.provTokensLeft,
    price: rx > 0 ? ry / rx : undefined, verified: true, genesisChecked: false, problems: [], warnings: [],
  };
}

/** Picks the pool every LithosDex tab shows; the choice travels as `?pool=` and ERG:LIT needs none. */
export function PoolSelector({ selected, pools, canonicalNft }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const history = useHistory();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (t) => [t?.tokenId, t?.name, t?.ticker].some((v) => v && v.toLowerCase().includes(q));
    // The list arrives verified first, then newest; pools that can be drained go last
    return (pools ?? [])
      .filter((x) => !q || x.poolNFT.includes(q) || matches(x.tokenX) || matches(x.tokenY))
      .sort((a, b) => Number(!!a.problems?.length) - Number(!!b.problems?.length));
  }, [pools, query]);

  const pick = (nft) => {
    setOpen(false);
    setQuery('');
    history.push(nft === canonicalNft ? pathname : `${pathname}?pool=${nft}`);
  };

  return (
    <div className={`${p.picker} ${p.poolPicker}`} ref={ref}>
      <button className={p.pickerBtn} type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {selected ? (
          <span className={p.selectedPool}>
            <PairIcons x={selected.tokenX} y={selected.tokenY} size={26} />
            <span className={p.selectedPair}>{pairLabel(selected)}</span>
            <TrustBadge status={poolTrust(selected)} />
          </span>
        ) : (
          <span className={p.pickerEmpty}>Choose a pool</span>
        )}
        <span className={p.pickerCaret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={p.pickerMenu}>
          <input
            className={w.search}
            style={{ width: '100%' }}
            autoFocus
            value={query}
            placeholder="Search pools by ticker, name or id"
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <div className={p.pickerList} role="listbox">
            {pools === null && <div className={w.empty}>The pool list is still loading.</div>}
            {pools && options.length === 0 && <div className={w.empty}>No pool matches.</div>}
            {options.map((x) => (
              <button
                key={x.poolNFT}
                type="button"
                role="option"
                aria-selected={selected?.poolNFT === x.poolNFT}
                className={p.pickerItem}
                onClick={() => pick(x.poolNFT)}
              >
                <PairIcons x={x.tokenX} y={x.tokenY} size={22} />
                <span className={w.tokenText}>
                  <span className={x.verified ? w.tokenName : w.tokenNameUnverified}>{pairLabel(x)}</span>
                  <span className={w.tokenSub}>
                    {kindLabel(x.kind)} · {shortId(x.poolNFT, 6, 4)}
                  </span>
                </span>
                <TrustBadge status={poolTrust(x)} />
              </button>
            ))}
          </div>
          <Link className={p.pickerFoot} to="/dex/pools" onClick={() => setOpen(false)}>
            Every pool, with filters →
          </Link>
        </div>
      )}
    </div>
  );
}

/** What the client's checks say about a pool, shown on every tab while it is selected. */
export function TrustNotes({ pool }) {
  const trust = poolTrust(pool);
  return (
    <div className={p.notes}>
      {trust === 'unsafe' && (
        <Alert kind="error" title="This pool can be drained">
          Its genesis breaks facts the pool contracts rely on, so the client refuses swaps and deposits here. A
          provision can still be redeemed, and its fees flushed and claimed.
          <ul className={p.problemList}>
            {pool.problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Alert>
      )}
      {trust === 'unverified' && (
        <Alert kind="info" title="Not on the verified list">
          Its genesis passed the client's checks, but nobody vetted who created it or its tokens. Trading here needs
          your consent on each order, and the client keeps no graphs or history for it.
        </Alert>
      )}
      {trust === 'unchecked' && (
        <Alert kind="info" title="Genesis not yet checked">
          The client has not read this pool's genesis yet. It checks it before placing any order here.
        </Alert>
      )}
      {pool.warnings?.length > 0 && (
        <Alert kind="warn" title={pool.warnings.length === 1 ? 'Warning' : 'Warnings'}>
          <ul className={p.problemList}>
            {pool.warnings.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

/** Six cells for any pool: each pairs its X figure with the Y side underneath. */
export function PoolStrip({ pool, vault }) {
  const { tokenX: tx, tokenY: ty } = pool;
  const inverse = pool.price ? 1 / pool.price : null;
  return (
    <div className={s.stats}>
      <div className={s.stat}>
        <div className={s.statLabel}>Reserves</div>
        <div className={`${s.statValue} ${s.statValueSoft}`} title={`${fmtSideFull(pool.reservesX, tx)} ${tokenLabel(tx)}`}>
          {fmtSide(pool.reservesX, tx, 2)} <span className={s.statUnit}>{tokenLabel(tx)}</span>
        </div>
        <div className={s.statSub} title={`${fmtSideFull(pool.reservesY, ty)} ${tokenLabel(ty)}`}>
          {fmtSide(pool.reservesY, ty, 2)} {tokenLabel(ty)}
        </div>
      </div>
      <div className={s.stat}>
        <div className={s.statLabel}>Spot price</div>
        <div className={`${s.statValue} ${s.statValueCyan}`}>{fmtPrice(pool.price)}</div>
        <div className={s.statSub}>
          {tokenLabel(ty)} per {tokenLabel(tx)}
          {inverse ? ` · ${fmtPrice(inverse)} inverse` : ''}
        </div>
      </div>
      <div className={s.stat}>
        <div className={s.statLabel}>Swap fee</div>
        <FeeBreakdown pool={pool} />
      </div>
      <div className={`${s.stat} ${s.statPurple}`}>
        <div className={s.statLabel}>Awaiting flush</div>
        <div className={`${s.statValue} ${s.statValuePurple}`}>
          {fmtSide(pool.pendingX, tx, 6)} <span className={s.statUnit}>{tokenLabel(tx)}</span>
        </div>
        <div className={s.statSub}>
          {fmtSide(pool.pendingY, ty, 4)} {tokenLabel(ty)}
        </div>
      </div>
      <div className={s.stat}>
        <div className={s.statLabel}>Vault balance</div>
        <div className={s.statValue}>
          {vault ? fmtSide(vault.balanceX, tx, 6) : '—'} <span className={s.statUnit}>{tokenLabel(tx)}</span>
        </div>
        <div className={s.statSub}>{vault ? `${fmtSide(vault.balanceY, ty, 4)} ${tokenLabel(ty)} held for providers` : '—'}</div>
      </div>
      <div className={s.stat}>
        <div className={s.statLabel}>LP supply</div>
        <div className={s.statValue} title={fmtInt(pool.supply)}>
          {fmtIntCompact(pool.supply)}
        </div>
        <div className={s.statSub}>{fmtIntCompact(pool.provTokensLeft)} deposits left</div>
      </div>
    </div>
  );
}

/** Which tokens these are, by id, and how the fee splits: what to check before trading with an unvetted pool. */
export function PoolInfoCard({ pool, vault }) {
  const fp = pool.feeParams;
  const side = (t, label) => (
    <div className={p.infoToken} key={label}>
      <TokenIcon tokenId={t.tokenId} label={t.ticker ?? t.name} size={32} />
      <div className={p.infoTokenText}>
        <div className={p.infoTokenHead}>
          <span className={p.infoSide}>{label}</span>
          <span className={t.verified ? p.infoName : p.infoNameUnverified}>{tokenLabel(t)}</span>
          {t.tokenId !== 'ERG' && <TrustBadge status={t.verified ? 'verified' : 'unverified'} />}
        </div>
        {t.tokenId === 'ERG' ? (
          <div className={p.infoSub}>Ergo's native coin</div>
        ) : (
          <div className={p.infoId}>
            <span title={t.tokenId}>{shortId(t.tokenId, 10, 10)}</span>
            <CopyButton text={t.tokenId} title="Copy token id" />
          </div>
        )}
        {!t.verified && t.name && <div className={p.infoSub}>name set by its minter: {t.name}</div>}
      </div>
    </div>
  );
  return (
    <div className={s.card}>
      <h3 className={s.cardTitle}>About this pool</h3>
      {side(pool.tokenX, 'X')}
      {side(pool.tokenY, 'Y')}
      <div className={s.summary}>
        <div className={s.row}>
          <span className={s.rowLabel}>Kept by the pool</span>
          <span className={s.rowValue}>{feePct(fp, fp.feeDenom - fp.dexFeeNum)} of every swap</span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>To providers, selling {tokenLabel(pool.tokenX)}</span>
          <span className={s.rowValue}>{feePct(fp, fp.ergFeeNum)}</span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>To providers, selling {tokenLabel(pool.tokenY)}</span>
          <span className={s.rowValue}>{feePct(fp, fp.tokenFeeNum)}</span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>Genesis</span>
          <span className={s.rowValue}>
            {pool.verified ? 'checked by hand' : pool.genesisChecked ? 'checked by this client' : 'not yet read'}
          </span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>Pool</span>
          <span className={s.rowValue}>
            <span title={pool.poolNFT}>{shortId(pool.poolNFT, 8, 6)}</span> <CopyButton text={pool.poolNFT} title="Copy pool NFT id" />
          </span>
        </div>
        {vault && (
          <div className={s.row}>
            <span className={s.rowLabel}>Vault</span>
            <span className={s.rowValue} title={vault.vaultNFT}>
              {shortId(vault.vaultNFT, 8, 6)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** In place of a graph on a pool the client keeps no history for. */
export function VerifiedOnlyCard({ title = 'Graphs and history are kept for verified pools only' }) {
  return (
    <div className={`${s.card} ${p.verifiedOnly}`}>
      <h3 className={s.cardTitle}>{title}</h3>
      <p className={s.cardDesc} style={{ marginBottom: 0 }}>
        The client collects them in the background, and limits that work to pools on its verified list. Swaps,
        liquidity, flushes and claims all work here as on any pool.
      </p>
    </div>
  );
}
