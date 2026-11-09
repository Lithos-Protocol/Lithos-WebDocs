import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import s from './styles.module.css';
import p from './pools.module.css';
import * as api from './api';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import { Spinner, Alert, GearIcon } from './ui';
import SettingsPanel from './SettingsPanel';
import useAutoRefresh from './useAutoRefresh';
import { PoolSelector, PoolStrip, TrustNotes, canonicalSummary } from './PoolParts';

const DexContext = createContext(null);
export const useDex = () => useContext(DexContext);

const BAND_LINES = [46, 89, 130, 169, 206, 243, 280];

/** `pooled` tabs act on the selected pool and carry it in their links. */
const NAV = [
  { to: '/dex', label: 'Swap', exact: true, pooled: true },
  { to: '/dex/liquidity', label: 'Liquidity', pooled: true },
  { to: '/dex/flush', label: 'Flush', pooled: true },
  { to: '/dex/fees', label: 'Fees', pooled: true },
  { to: '/dex/history', label: 'History', pooled: true },
  { to: '/dex/pools', label: 'Pools', also: ['/dex/create'] },
  { to: '/dex/search', label: 'NFT search' },
];

function SubNav({ query }) {
  const { pathname } = useLocation();
  const base = useBaseUrl('/');
  const strip = (x) => x.replace(/\/+$/, '') || '/';
  const cur = strip(pathname.replace(new RegExp(`^${base.replace(/\/$/, '')}`), '') || '/');

  return (
    <div className={s.tabs}>
      {NAV.map((n) => {
        const active = n.exact
          ? cur === strip(n.to)
          : cur.startsWith(strip(n.to)) || (n.also ?? []).includes(cur);
        return (
          <Link key={n.to} to={n.pooled ? `${n.to}${query}` : n.to} className={`${s.tab} ${active ? s.tabActive : ''}`}>
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Every LithosDex page. The pages that act on one pool read it from `?pool=`, ERG:LIT when absent, and get it from
 * the context with a `poolApi` that calls ERG:LIT's own routes for ERG:LIT and the `/dex/pools/{nft}` routes for
 * any other pool, so a panel is written once for both.
 *
 * @param pooled false on the pool list and the create page, which show no pool strip or selector
 */
export default function DexLayout({ title, description, children, pooled = true }) {
  // The design places the Settings pill above the swap page's price chart. The
  // other pages have no such anchor, so it falls back to the header there.
  const { pathname, search } = useLocation();
  const baseForSettings = useBaseUrl('/');
  const rel =
    (pathname.replace(new RegExp(`^${baseForSettings.replace(/\/$/, '')}`), '') || '/').replace(
      /\/+$/,
      '',
    ) || '/';
  const isSwapPage = rel === '/dex';

  const wanted = (new URLSearchParams(search).get('pool') ?? '').trim().toLowerCase();
  const wantedNft = /^[0-9a-f]{64}$/.test(wanted) ? wanted : null;

  const [pool, setPool] = useState(null); // ERG:LIT, from /dex/pool
  const [vault, setVault] = useState(null); // ERG:LIT's vault, read only while it is selected
  const [pools, setPools] = useState(null);
  const [detail, setDetail] = useState(null); // the selected pool and its vault
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const canonicalNft = pool?.poolNFT ?? null;
  const poolNft = wantedNft ?? canonicalNft;
  const isCanonical = !!poolNft && poolNft === canonicalNft;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [canonical, list] = await Promise.all([api.getPool().catch(() => null), api.listPools().catch(() => null)]);
      setPool(canonical);
      setPools(list);
      const nft = wantedNft ?? canonical?.poolNFT;
      if (!nft) throw new Error('Could not read the ERG:LIT pool from the client.');
      const ownPool = !!canonical && nft === canonical.poolNFT;
      const [d, v] = await Promise.all([
        // While the pool index builds after a restart, ERG:LIT still renders from its own routes
        api.getPoolByNft(nft).catch((e) => {
          if (ownPool) return null;
          throw e;
        }),
        ownPool ? api.getVault().catch(() => null) : Promise.resolve(null),
      ]);
      setDetail(d);
      setVault(v);
      setError(null);
    } catch (e) {
      setDetail(null);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [wantedNft]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /*
   * Auto-refresh.
   *
   * `tick` is what read-only panels watch. Quotes deliberately do not: a price
   * you were shown has to stay put until you change an input, or a figure could
   * move between reading it and signing for it.
   */
  const [autoSecs, setAutoSecs] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => setAutoSecs(api.getAutoRefresh()), []);

  useAutoRefresh(autoSecs, () => {
    refresh();
    setTick((n) => n + 1);
  });

  /* ---- Orders ----
     One "Use orders" choice for ERG:LIT's Swap and Liquidity pages, and one read of
     GET /dex/orders shared by the Your orders table, the balance's "in orders"
     figure and the activity feed's own-fill highlight. Other pools are orders only
     and list their own orders on their pages. */
  const [ordersOn, setOrdersOnState] = useState(true);
  const [orderFees, setOrderFees] = useState(null);
  const [orders, setOrders] = useState(null); // null: not loaded, or no key
  const [ordersError, setOrdersError] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  // Every order box this page has seen. A fill confirms after the order leaves
  // the list, so recent activity needs this to keep recognising it as yours.
  const ownOrderIds = useRef(new Set());

  useEffect(() => {
    setOrdersOnState(api.getUseOrders());
    setOrderFees(api.getOrderFees());
  }, []);

  const setOrdersOn = useCallback((on) => {
    api.setUseOrders(on);
    setOrdersOnState(on);
  }, []);

  // Read during render, like the panels do: saving Settings re-renders through
  // the tick, which is when a newly entered key becomes visible here.
  const hasKey = api.hasApiKey();
  const readsOrders = pooled && isCanonical;

  const reloadOrders = useCallback(() => {
    if (!readsOrders || !api.hasApiKey()) {
      setOrders(null);
      setOrdersError(null);
      return Promise.resolve();
    }
    setOrdersLoading(true);
    return api
      .listOrders()
      .then((r) => {
        const list = r.orders ?? [];
        list.forEach((o) => ownOrderIds.current.add(o.boxId));
        setOrders(list);
        setOrdersError(null);
      })
      .catch((e) => {
        // Keep the last good list: the endpoint never returns a partial one, so a
        // failed read says nothing about the orders themselves.
        setOrdersError(e.message);
      })
      .finally(() => setOrdersLoading(false));
  }, [readsOrders]);

  useEffect(() => {
    reloadOrders();
  }, [tick, hasKey, reloadOrders]);

  const onSettingsSaved = useCallback(() => {
    setAutoSecs(api.getAutoRefresh());
    setOrderFees(api.getOrderFees());
    refresh();
    // Saving can change the base URL or the key, so everything read from the
    // client is now suspect, including panels that only watch the tick.
    setTick((n) => n + 1);
  }, [refresh]);

  const selected = detail?.pool ?? (isCanonical ? canonicalSummary(pool) : null);
  const selectedVault = detail?.vault ?? (isCanonical && vault ? { ...vault } : null);

  const poolApi = useMemo(() => {
    if (!poolNft) return null;
    if (isCanonical) {
      return {
        checkFlush: () => api.checkFlush(),
        flush: (o) => api.flush(o),
        listProvisions: () => api.listProvisions(),
        claimProvision: (boxId, o) => api.claimProvision(boxId, o),
        getFeeHistory: (q) => api.getFeeHistory(q),
        getProvisionFeeHistory: (boxId, q) => api.getProvisionFeeHistory(boxId, q),
        getPriceHistory: (q) => api.getPriceHistory(q),
        getRecentActivity: (q) => api.getRecentActivity(q),
      };
    }
    return {
      checkFlush: () => api.checkPoolFlush(poolNft),
      flush: (o) => api.flushPool(poolNft, o),
      listProvisions: () => api.listPoolProvisions(poolNft),
      claimProvision: (boxId, o) => api.claimPoolProvision(poolNft, boxId, o),
      getFeeHistory: (q) => api.getPoolFeeHistory(poolNft, q),
      getProvisionFeeHistory: (boxId, q) => api.getPoolProvisionFeeHistory(poolNft, boxId, q),
      getPriceHistory: (q) => api.getPoolPriceHistory(poolNft, q),
      getRecentActivity: (q) => api.getPoolRecentActivity(poolNft, q),
    };
  }, [poolNft, isCanonical]);

  const query = poolNft && !isCanonical ? `?pool=${poolNft}` : '';
  const notFound = error?.status === 404;

  return (
    <Layout title={`LithosDex · ${title}`} description={description}>
      <div className={s.page}>
        {/* Decorative band. Cubes float in open space above the first content row. */}
        <FlowField
          height={320}
          lines={BAND_LINES}
          cubes={[
            cubeBetween({ cx: 1122, size: 44, lineA: 46, lineB: 89 }),
            cubeBetween({ cx: 618, size: 26, lineA: 89, lineB: 130 }),
          ]}
        />
        <div className={s.pageGlow1} aria-hidden="true" />
        <div className={s.pageGlow2} aria-hidden="true" />

        <div className={s.shell}>
          <div className={s.header}>
            <div className="curScrimHost curScrimHostTight">
              <h1 className={s.title}>
                Lithos<span className={`curFlowWord curFlowWordPurple`}>Dex</span>
              </h1>
              <p className={s.subtitle}>{description}</p>
            </div>
            <div className={s.headerMeta}>
              {pooled && <PoolSelector selected={selected} pools={pools?.pools ?? null} canonicalNft={canonicalNft} />}
              {!isSwapPage && (
                <button
                  className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                  onClick={() => setShowSettings((v) => !v)}
                  type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
                >
                  <GearIcon />
                  {showSettings ? 'Close settings' : 'Settings'}
                </button>
              )}
            </div>
          </div>

          {pooled &&
            (selected ? (
              <PoolStrip pool={selected} vault={selectedVault} />
            ) : (
              loading && (
                <div className={p.stripLoading}>
                  <Spinner /> Loading the pool…
                </div>
              )
            ))}
          <SubNav query={query} />
          {pooled && selected && !selected.verified && <TrustNotes pool={selected} />}

          {showSettings && (
            <SettingsPanel onClose={() => setShowSettings(false)} onSaved={onSettingsSaved} />
          )}

          {pooled && error && !loading && (
            <Alert kind="error" title={notFound ? 'No LithosDex pool with that NFT' : 'Could not load the pool'}>
              {notFound ? (
                <>
                  The client's pool index does not list it. <Link to="/dex/pools">Pick one from the pool list.</Link>
                </>
              ) : (
                <>
                  {error.message}
                  <div style={{ marginTop: '0.5rem' }}>
                    Check that the Lithos client is running and that the base URL under Settings points at it.
                  </div>
                </>
              )}
            </Alert>
          )}

          <DexContext.Provider
            value={{
              pool,
              vault,
              loading,
              error,
              refresh,
              tick,
              showSettings,
              toggleSettings: () => setShowSettings((v) => !v),
              ordersOn,
              setOrdersOn,
              orderFees,
              orders,
              ordersError,
              ordersLoading,
              reloadOrders,
              ownOrderIds: ownOrderIds.current,
              poolNft,
              isCanonical,
              selected,
              selectedVault,
              pools,
              poolApi,
              query,
            }}
          >
            {children}
          </DexContext.Provider>
        </div>
      </div>
    </Layout>
  );
}
