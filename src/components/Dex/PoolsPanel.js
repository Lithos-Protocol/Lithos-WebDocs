import React, { useEffect, useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import m from '../Mining/styles.module.css';
import w from '../Wallet/styles.module.css';
import p from './pools.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { Alert, Spinner } from './ui';
import { big, fmtErgAmount, fmtInt, shortId } from './format';
import { Pager, PageSize, usePaged } from '../Extensions/ui';
import { PairIcons, TrustBadge } from '../Wallet/TokenIcon';
import { FilterChips } from '../Wallet/ui';
import {
  canonicalFirst,
  poolHref,
  poolTrust,
  pairLabel,
  kindLabel,
  fmtSide,
  fmtSideFull,
  fmtPrice,
  tokenLabel,
} from './pools';
import { FeeBreakdown } from './PoolParts';

/** How often to re-read while the client's first index is still building. */
const BUILDING_RETRY_MS = 5000;

function Strip({ list }) {
  const pools = list?.pools ?? [];
  const verified = pools.filter((x) => x.verified).length;
  const n2t = pools.filter((x) => x.kind === 'n2t' && !x.problems?.length);
  const t2t = pools.length - pools.filter((x) => x.kind === 'n2t').length;
  // A pool that can be drained holds nothing anyone should count on
  const ergHeld = n2t.reduce((sum, x) => sum + big(x.reservesX), 0n);
  return (
    <div className={w.kpis}>
      <div className={w.kpi}>
        <div className={m.label}>Pools</div>
        <div className={w.kpiValue}>{list ? fmtInt(pools.length) : '—'}</div>
        <div className={w.kpiSub}>{list ? `${fmtInt(verified)} verified` : 'reading the index'}</div>
      </div>
      <div className={w.kpi}>
        <div className={m.label}>ERG / token</div>
        <div className={w.kpiValue}>{list ? fmtInt(pools.length - t2t) : '—'}</div>
        <div className={w.kpiSub}>ERG against one token</div>
      </div>
      <div className={w.kpi}>
        <div className={m.label}>Token / token</div>
        <div className={w.kpiValue}>{list ? fmtInt(t2t) : '—'}</div>
        <div className={w.kpiSub}>two tokens, ERG for storage only</div>
      </div>
      <div className={w.kpi}>
        <div className={m.label}>ERG in pools</div>
        <div className={w.kpiValue}>{list ? fmtErgAmount(ergHeld, 2) : '—'}</div>
        <div className={w.kpiSub}>{list ? `ERG/token reserves at block ${fmtInt(list.height)}` : '—'}</div>
      </div>
    </div>
  );
}

/** Every LithosDex pool, filterable, each row linking to its own page. */
export default function PoolsPanel() {
  const { tick, pool: canonical } = useDex();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [trust, setTrust] = useState('all');
  const [kind, setKind] = useState('all');
  const [showUnsafe, setShowUnsafe] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .listPools()
      .then((r) => {
        if (!live) return;
        setList(r);
        setError(null);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [tick, retry]);

  // The first index after a restart takes a pass; re-read until it is ready rather than showing it empty
  useEffect(() => {
    if (list?.status !== 'building') return undefined;
    const t = setTimeout(() => setRetry((n) => n + 1), BUILDING_RETRY_MS);
    return () => clearTimeout(t);
  }, [list]);

  const pools = list?.pools ?? [];
  const unsafeCount = pools.filter((x) => x.problems?.length).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (t) => [t.tokenId, t.name, t.ticker].some((v) => v && v.toLowerCase().includes(q));
    return canonicalFirst(pools, canonical?.poolNFT).filter((x) => {
      if (!showUnsafe && x.problems?.length) return false;
      if (kind !== 'all' && x.kind !== kind) return false;
      if (trust === 'verified' && !x.verified) return false;
      if (trust === 'unverified' && x.verified) return false;
      return !q || x.poolNFT.toLowerCase().includes(q) || matches(x.tokenX) || matches(x.tokenY);
    });
  }, [pools, query, trust, kind, showUnsafe, canonical?.poolNFT]);
  const paged = usePaged(rows);

  return (
    <>
      <Strip list={list} />

      <div className={`${m.card} ${p.listCard}`}>
        <div className={w.cardHead}>
          <div>
            <h3 className={m.cardTitle}>Pools</h3>
            <p className={m.cardNote}>
              Anyone can create a pool. Verified pools were checked by hand; every other pool is checked against
              its genesis, and one that fails can be drained.
            </p>
          </div>
          <Link className={w.primaryBtn} to="/dex/create">
            Create a pool
          </Link>
        </div>

        <div className={p.listTools}>
          <FilterChips
            value={trust}
            onChange={setTrust}
            options={[
              { id: 'all', label: 'All' },
              { id: 'verified', label: 'Verified' },
              { id: 'unverified', label: 'Unverified' },
            ]}
          />
          <FilterChips
            value={kind}
            onChange={setKind}
            options={[
              { id: 'all', label: 'Any kind' },
              { id: 'n2t', label: 'ERG/token' },
              { id: 't2t', label: 'Token/token' },
            ]}
          />
          <input
            className={w.search}
            value={query}
            placeholder="Search ticker, name or id"
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            aria-label="Search pools"
          />
          {unsafeCount > 0 && (
            <label className={p.unsafeToggle}>
              <input type="checkbox" checked={showUnsafe} onChange={(e) => setShowUnsafe(e.target.checked)} />
              Show {fmtInt(unsafeCount)} that can be drained
            </label>
          )}
        </div>

        {error && (
          <Alert kind="error" title="Could not read the pools">
            {error}
          </Alert>
        )}
        {list?.status === 'building' && (
          <Alert kind="info" title="The client is still indexing pools">
            Its first pass after a restart reads every pool on chain. This list fills in when it finishes.
          </Alert>
        )}
        {list?.truncated && (
          <Alert kind="warn">More pools exist than one index reads; the newest are listed.</Alert>
        )}

        {!list && !error ? (
          <div className={w.empty}>
            <Spinner /> Reading pools…
          </div>
        ) : rows.length === 0 && list ? (
          <div className={w.empty}>{pools.length ? 'No pool matches.' : 'No pools yet.'}</div>
        ) : (
          rows.length > 0 && (
            <div className={w.table} role="table" aria-label="Pools">
              <div className={`${w.tRow} ${w.tHead} ${p.poolRow}`} role="row">
                <span role="columnheader">Pair</span>
                <span role="columnheader">List</span>
                <span role="columnheader" className={w.right}>
                  Reserves
                </span>
                <span role="columnheader" className={w.right}>
                  Price
                </span>
                <span role="columnheader" className={w.right}>
                  Fees
                </span>
              </div>
              {paged.rows.map((x) => (
                <Link key={x.poolNFT} to={poolHref(x.poolNFT)} className={`${w.tRow} ${w.tRowLink} ${p.poolRow}`} role="row">
                  <span className={w.tokenCell}>
                    <PairIcons x={x.tokenX} y={x.tokenY} size={24} />
                    <span className={w.tokenText}>
                      <span className={x.verified ? w.tokenName : w.tokenNameUnverified}>{pairLabel(x)}</span>
                      <span className={w.tokenSub} title={x.poolNFT}>
                        {kindLabel(x.kind)} · {shortId(x.poolNFT, 6, 4)}
                      </span>
                    </span>
                  </span>
                  <span>
                    <TrustBadge status={poolTrust(x)} />
                  </span>
                  <span className={`${w.right} ${p.reserves}`}>
                    <span title={fmtSideFull(x.reservesX, x.tokenX)}>
                      {fmtSide(x.reservesX, x.tokenX, 2)} <span className={w.unit}>{tokenLabel(x.tokenX)}</span>
                    </span>
                    <span title={fmtSideFull(x.reservesY, x.tokenY)}>
                      {fmtSide(x.reservesY, x.tokenY, 2)} <span className={w.unit}>{tokenLabel(x.tokenY)}</span>
                    </span>
                  </span>
                  <span className={`${w.right} ${p.price}`}>
                    <span className={w.amount}>{fmtPrice(x.price)}</span>
                    <span className={w.tokenSub}>
                      {tokenLabel(x.tokenY)} per {tokenLabel(x.tokenX)}
                    </span>
                  </span>
                  <span className={w.right}>
                    <FeeBreakdown pool={x} compact />
                  </span>
                </Link>
              ))}
            </div>
          )
        )}

        {rows.length > 0 && (
          <div className={w.tableFoot}>
            <span className={m.label}>
              {fmtInt(paged.first + 1)}–{fmtInt(paged.first + paged.rows.length)} of {fmtInt(rows.length)}
            </span>
            <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />
            <span className={w.pageSize}>
              <PageSize value={paged.size} onChange={paged.setSize} />
            </span>
          </div>
        )}
      </div>
    </>
  );
}
