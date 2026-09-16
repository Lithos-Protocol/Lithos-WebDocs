import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import s from './styles.module.css';
import * as api from './api';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import {
  fmtErg,
  fmtToken,
  fmtErgAmount,
  fmtTokenAmount,
  fmtInt,
  fmtIntCompact,
  fmtPct,
  big,
  ratio,
} from './format';
import { Spinner, Alert, GearIcon } from './ui';
import SettingsPanel from './SettingsPanel';
import useAutoRefresh from './useAutoRefresh';

const DexContext = createContext(null);
export const useDex = () => useContext(DexContext);

const BAND_LINES = [46, 89, 130, 169, 206, 243, 280];

const NAV = [
  { to: '/dex', label: 'Swap', exact: true },
  { to: '/dex/liquidity', label: 'Liquidity' },
  { to: '/dex/flush', label: 'Flush' },
  { to: '/dex/fees', label: 'Fees' },
  { to: '/dex/history', label: 'History' },
];

function SubNav() {
  const { pathname } = useLocation();
  const base = useBaseUrl('/');
  const strip = (p) => p.replace(/\/+$/, '') || '/';
  const cur = strip(pathname.replace(new RegExp(`^${base.replace(/\/$/, '')}`), '') || '/');

  return (
    <div className={s.tabs}>
      {NAV.map((n) => {
        const active = n.exact ? cur === strip(n.to) : cur.startsWith(strip(n.to));
        return (
          <Link key={n.to} to={n.to} className={`${s.tab} ${active ? s.tabActive : ''}`}>
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Six glass cells. Both reserves share one cell so the row divides evenly at every
 * breakpoint — seven items left an orphan.
 */
function StatStrip({ pool, vault, loading }) {
  if (loading || !pool) {
    return (
      <div className={s.stats}>
        <div className={s.stat}>
          <div className={s.statLabel}>Pool</div>
          <div className={s.statValue}>
            {loading ? (
              <>
                <Spinner /> Loading…
              </>
            ) : (
              'Unavailable'
            )}
          </div>
          {!loading && <div className={s.statSub}>could not reach the client</div>}
        </div>
      </div>
    );
  }

  const dec = pool.tokenDecimals ?? 0;
  const name = pool.tokenName ?? 'TOKEN';
  const price = ratio(big(pool.reservesY) * 10n ** 9n, big(pool.reservesX) * 10n ** BigInt(dec));
  const fp = pool.feeParams;
  const feePct = (fp.feeDenom - fp.dexFeeNum + fp.ergFeeNum) / fp.feeDenom;

  return (
    <div className={s.stats}>
      {/* Every amount carries its denomination, and each ERG figure is paired with
          the token side in its subtitle — the pool always has two sides and showing
          one without the other invites reading a number as the whole picture. */}
      <div className={s.stat}>
        <div className={s.statLabel}>Pool reserves</div>
        <div
          className={`${s.statValue} ${s.statValueSoft}`}
          title={`${fmtErg(pool.reservesX, 9)} ERG`}
        >
          {fmtErgAmount(pool.reservesX, 2)} <span className={s.statUnit}>ERG</span>
        </div>
        <div className={s.statSub} title={`${fmtToken(pool.reservesY, dec, dec)} ${name}`}>
          {fmtTokenAmount(pool.reservesY, dec, 2)} {name}
        </div>
      </div>

      <div className={s.stat}>
        <div className={s.statLabel}>Spot price</div>
        <div className={`${s.statValue} ${s.statValueCyan}`}>
          {price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
        </div>
        <div className={s.statSub}>{name} per ERG</div>
      </div>

      <div className={s.stat}>
        <div className={s.statLabel}>Swap fee</div>
        <div className={s.statValue}>{fmtPct(feePct, 2)}</div>
        <div className={s.statSub}>dex + side fee</div>
      </div>

      {/* Fee amounts run small — a fixed 2dp would render a live balance as "0". */}
      <div className={`${s.stat} ${s.statPurple}`}>
        <div className={s.statLabel}>Awaiting flush</div>
        <div className={`${s.statValue} ${s.statValuePurple}`}>
          {fmtErgAmount(pool.pendingX, 6)} <span className={s.statUnit}>ERG</span>
        </div>
        <div className={s.statSub} title={`${fmtToken(pool.pendingY, dec, dec)} ${name}`}>
          {fmtTokenAmount(pool.pendingY, dec, 4)} {name}
        </div>
      </div>

      <div className={s.stat}>
        <div className={s.statLabel}>Vault balance</div>
        <div className={s.statValue}>
          {vault ? (
            <>
              {fmtErgAmount(vault.payableX, 6)} <span className={s.statUnit}>ERG</span>
            </>
          ) : (
            '—'
          )}
        </div>
        <div className={s.statSub}>
          {vault ? `${fmtTokenAmount(vault.payableY, dec, 4)} ${name} claimable` : 'claimable'}
        </div>
      </div>

      <div className={s.stat}>
        <div className={s.statLabel}>LP supply</div>
        <div className={s.statValue} title={fmtInt(pool.supply)}>
          {fmtIntCompact(pool.supply)}
        </div>
        <div className={s.statSub}>shares outstanding</div>
      </div>
    </div>
  );
}

export default function DexLayout({ title, description, children }) {
  // The design places the Settings pill above the swap page's price chart. The
  // other four pages have no such anchor, so it falls back to the header there.
  const { pathname } = useLocation();
  const baseForSettings = useBaseUrl('/');
  const rel =
    (pathname.replace(new RegExp(`^${baseForSettings.replace(/\/$/, '')}`), '') || '/').replace(
      /\/+$/,
      '',
    ) || '/';
  const isSwapPage = rel === '/dex';

  const [pool, setPool] = useState(null);
  const [vault, setVault] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([api.getPool(), api.getVault()])
      .then(([p, v]) => {
        setPool(p);
        setVault(v);
        setError(null);
      })
      .catch((e) => {
        setPool(null);
        setVault(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  /*
   * Auto-refresh.
   *
   * `tick` is what read-only panels watch. Quotes deliberately do not: a price
   * you were shown has to stay put until you change an input, or a figure could
   * move between reading it and signing for it. Anything driven by user input
   * beyond the API key is left alone for the same reason.
   */
  const [autoSecs, setAutoSecs] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => setAutoSecs(api.getAutoRefresh()), []);

  useAutoRefresh(autoSecs, () => {
    refresh();
    setTick((n) => n + 1);
  });

  /* ---- Orders ----
     One "Use orders" choice for the Swap and Liquidity pages, and one read of
     GET /dex/orders shared by the Your orders table, the balance's "in orders"
     figure and the activity feed's own-fill highlight — three views of the same
     list should never disagree about it. */
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

  const reloadOrders = useCallback(() => {
    if (!api.hasApiKey()) {
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
        // failed read says nothing about the orders themselves. The error is shown
        // beside it rather than blanking the table.
        setOrdersError(e.message);
      })
      .finally(() => setOrdersLoading(false));
  }, []);

  useEffect(() => {
    reloadOrders();
  }, [tick, hasKey, reloadOrders]);

  const onSettingsSaved = useCallback(() => {
    setAutoSecs(api.getAutoRefresh());
    setOrderFees(api.getOrderFees());
    refresh();
    // Saving can change the base URL or the key, so everything read from the
    // client is now suspect — including panels that only watch the tick.
    setTick((n) => n + 1);
  }, [refresh]);

  return (
    <Layout title={`LithosDex — ${title}`} description={description}>
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

          <StatStrip pool={pool} vault={vault} loading={loading} />
          <SubNav />

          {showSettings && (
            <SettingsPanel onClose={() => setShowSettings(false)} onSaved={onSettingsSaved} />
          )}

          {error && !loading && (
            <Alert kind="error" title="Could not load pool state">
              {error}
              <div style={{ marginTop: '0.5rem' }}>
                Check that the Lithos client is running and that the base URL under Settings points
                at it.
              </div>
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
            }}
          >
            {children}
          </DexContext.Provider>
        </div>
      </div>
    </Layout>
  );
}
