import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import s from './styles.module.css';
import * as api from './api';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import { fmtErgAmount, fmtTokenAmount, fmtInt, big } from './format';
import { Spinner, Alert, GearIcon } from './ui';
import SettingsPanel from './SettingsPanel';
import useAutoRefresh from '../Dex/useAutoRefresh';

const CollateralContext = createContext(null);
export const useCollateral = () => useContext(CollateralContext);

const BAND_LINES = [46, 89, 130, 169, 206, 243, 280];

const NAV = [
  { to: '/collateral', label: 'Overview', exact: true },
  { to: '/collateral/queue', label: 'Queue status' },
  // Nothing on this page exists without a key — it is entirely the reader's own
  // balances, keys and positions.
  { to: '/collateral/portfolio', label: 'Your position', needsKey: true },
  { to: '/collateral/join', label: 'Join' },
];

const LOCK_HINT = 'Needs an API key: add one under Settings to unlock';

function LockIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 018 0v3.5" />
    </svg>
  );
}

function SubNav({ unlocked }) {
  const { pathname } = useLocation();
  const base = useBaseUrl('/');
  const strip = (p) => p.replace(/\/+$/, '') || '/';
  const cur = strip(pathname.replace(new RegExp(`^${base.replace(/\/$/, '')}`), '') || '/');

  return (
    <div className={s.tabs}>
      {NAV.map((n) => {
        const active = n.exact ? cur === strip(n.to) : cur.startsWith(strip(n.to));
        if (n.needsKey && !unlocked) {
          // A span, not a Link: the tab is genuinely closed rather than merely
          // styled as such. Settings sits in the header on every page, so this
          // never traps anyone.
          return (
            <span
              key={n.to}
              className={`${s.tab} ${s.tabLocked}`}
              title={LOCK_HINT}
              aria-disabled="true"
            >
              <LockIcon />
              {n.label}
            </span>
          );
        }
        return (
          <Link key={n.to} to={n.to} className={`${s.tab} ${active ? s.tabActive : ''}`}>
            {n.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Emission phase -> short human label for the rate pill's sub-line. */
const PHASE_LABELS = {
  DECAYING: 'decaying',
  STEPPED: 'stepped',
  FLAT_50: 'flat 50',
  ENDED: 'ended',
};

/**
 * The fetch layer records the HTTP status on ApiError; a 404 from the market
 * snapshot is meaningful ("nothing deployed here"), not a bug.
 */
function lastStatus404(err) {
  return err?.status === 404;
}

/**
 * Six glass cells, one snapshot. Cyan marks ERG-denominated figures, purple
 * LIT-denominated ones — same rule as everywhere else on the site.
 */
function StatStrip({ market, loading, wallet, walletTried, lastPermitLit }) {
  if (loading || !market) {
    return (
      <div className={s.stats}>
        <div className={s.stat}>
          <div className={s.statLabel}>Collateral market</div>
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

  const freeSlots = big(market.activeSetMax) - big(market.activeSetSize);
  const phase =
    PHASE_LABELS[market.emissionPhase] ?? String(market.emissionPhase ?? '').toLowerCase();
  const exposureCount = big(wallet?.ownPositionsQueued) + big(wallet?.ownPositionsLive);

  return (
    <div className={s.stats}>
      <div className={s.stat}>
        <div className={s.statLabel}>Queue length</div>
        <div className={s.statValue}>
          {fmtInt(market.queueLength)} <span className={s.statUnit}>boxes</span>
        </div>
        <div className={s.statSub}>head #{fmtInt(market.queueHead)}</div>
      </div>

      <div className={s.stat}>
        <div className={s.statLabel}>Active set</div>
        <div className={`${s.statValue} ${s.statValueSoft}`}>
          {fmtInt(market.activeSetSize)}
          <span className={s.statUnit}>/ {fmtInt(market.activeSetMax)}</span>
        </div>
        <div className={s.statSub}>{fmtInt(freeSlots)} free slots</div>
      </div>

      {/* What a join pays NOW — it rises with queue length, hence "next". */}
      <div className={`${s.stat} ${s.statPurple}`}>
        <div className={s.statLabel}>Next permit</div>
        <div
          className={`${s.statValue} ${s.statValuePurple}`}
          title={`${big(market.currentPermitLit)} LIT`}
        >
          {fmtTokenAmount(market.currentPermitLit, 9, 2)} <span className={s.statUnit}>LIT</span>
        </div>
        <div className={s.statSub} title="The permit locked by the newest position still waiting">
          {lastPermitLit != null
            ? `${fmtTokenAmount(lastPermitLit, 9, 2)} LIT last paid`
            : 'per new position'}
        </div>
      </div>

      <div className={s.stat}>
        <div className={s.statLabel}>Principal</div>
        <div
          className={`${s.statValue} ${s.statValueCyan}`}
          title={`${big(market.principalNanoErgs)} nanoERG`}
        >
          {fmtErgAmount(market.principalNanoErgs, 3)} <span className={s.statUnit}>ERG</span>
        </div>
        <div className={s.statSub}>fixed per position</div>
      </div>

      <div className={`${s.stat} ${s.statPurple}`}>
        <div className={s.statLabel}>Emission rate</div>
        <div className={`${s.statValue} ${s.statValuePurple}`}>
          {fmtTokenAmount(market.emissionRateTotalLit, 9, 3)}{' '}
          <span className={s.statUnit}>LIT</span>
        </div>
        <div className={s.statSub}>per block · {phase}</div>
      </div>

      {/* Wallet-scoped, fetched lazily — absent without an API key. */}
      <div className={s.stat}>
        <div className={s.statLabel}>Your exposure</div>
        <div className={s.statValue}>
          {!walletTried || !wallet ? (
            '—'
          ) : (
            <>
              {fmtInt(exposureCount)} <span className={s.statUnit}>boxes</span>
            </>
          )}
        </div>
        <div className={s.statSub}>
          {!walletTried
            ? 'set an API key to see yours'
            : wallet
              ? `${fmtErgAmount(
                  (wallet.positions ?? []).reduce((a, p) => a + big(p.principalNanoErgs), 0n),
                  3,
                )} ERG committed`
              : 'unavailable'}
        </div>
      </div>
    </div>
  );
}

export default function CollarLayout({ title, description, children }) {
  const { pathname } = useLocation();

  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Permit paid by the newest position still waiting — the tail of the queue.
  // Sourced from the permit-history series, whose last point is always the
  // most recent join; purely cosmetic for a stat sub-line, so failures stay quiet.
  const [lastPermitLit, setLastPermitLit] = useState(null);
  const [wallet, setWallet] = useState(null);
  // Distinguishes "no key, never tried" from "tried and failed" in the pills.
  const [walletTried, setWalletTried] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  /** Silent-refreshable: only the very first load flips the loading flag. */
  const refresh = useCallback(async () => {
    try {
      const m = await api.getMarket();
      setMarket(m);
      setError(null);
    } catch (e) {
      setMarket(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }

    api
      .getPermitHistory({ limit: 50 })
      .then((h) => {
        const pts = h?.points ?? [];
        setLastPermitLit(pts.length ? pts[pts.length - 1].permitLit : null);
      })
      .catch(() => setLastPermitLit(null));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  /**
   * Wallet state is personal and key-gated: fetched only when a key exists,
   * retried whenever Settings are saved or a panel mutates something.
   */
  const refreshWallet = useCallback(async () => {
    if (!api.hasApiKey()) {
      setWallet(null);
      return;
    }
    try {
      const w = await api.getWallet();
      setWallet(w);
    } catch {
      setWallet(null);
    } finally {
      setWalletTried(true);
    }
  }, []);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  /*
   * Auto-refresh.
   *
   * `tick` is what read-only panels watch. The join quote deliberately does
   * not: a permit price you were shown has to stay put until you change an
   * input, or it could move between reading it and signing for it.
   */
  const [autoSecs, setAutoSecs] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => setAutoSecs(api.getAutoRefresh()), []);

  useAutoRefresh(autoSecs, () => {
    refresh();
    refreshWallet();
    setTick((n) => n + 1);
  });

  // 404 from /collateral/market means the emission contracts are not on this
  // network — say that instead of a raw request failure.
  const notLaunched = error && market === null && !loading && lastStatus404(error);

  return (
    <Layout title={`Lithos Collateral — ${title}`} description={description}>
      <div className={s.page}>
        {/* Decorative band. Cubes float in open space above the first content row,
            anchored differently from the Dex band so the sections read apart. */}
        <FlowField
          height={320}
          lines={BAND_LINES}
          cubes={[
            cubeBetween({ cx: 758, size: 36, lineA: 46, lineB: 89 }),
            cubeBetween({ cx: 1080, size: 26, lineA: 130, lineB: 169 }),
          ]}
        />
        <div className={s.pageGlow1} aria-hidden="true" />
        <div className={s.pageGlow2} aria-hidden="true" />

        <div className={s.shell}>
          <div className={s.header}>
            <div className="curScrimHost curScrimHostTight">
              <h1 className={s.title}>
                Lithos
                <span className={`curFlowWord curFlowWordPurple`}>Collateral</span>
              </h1>
              <p className={s.subtitle}>{description}</p>
            </div>
            <div className={s.headerMeta}>
              <button
                className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                onClick={() => setShowSettings((v) => !v)}
                type="button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
              >
                <GearIcon />
                {showSettings ? 'Close settings' : 'Settings'}
              </button>
            </div>
          </div>

          <StatStrip
            market={market}
            loading={loading}
            wallet={wallet}
            walletTried={walletTried}
            lastPermitLit={lastPermitLit}
          />
          {/* `hasApiKey()` is not reactive, so the wallet read — which the
              layout retries whenever Settings are saved — is what unlocks it. */}
          <SubNav unlocked={!!wallet} />

          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              onSaved={() => {
                setAutoSecs(api.getAutoRefresh());
                refresh();
                refreshWallet();
                // A new base URL or key invalidates every panel, not just the
                // two reads above.
                setTick((n) => n + 1);
              }}
            />
          )}

          {error && !loading && (
            <Alert
              kind={notLaunched ? 'info' : 'error'}
              title={
                notLaunched
                  ? 'Emission has not launched on this network'
                  : 'Could not load market state'
              }
            >
              {notLaunched ? (
                <>
                  There are no emission contracts deployed here yet, so the collateral market has
                  nothing to show. Everything on this panel lights up once launch happens.
                </>
              ) : (
                error
              )}
              {!notLaunched && (
                <div style={{ marginTop: '0.5rem' }}>
                  Check that the Lithos client is running and that the base URL under Settings
                  points at it.
                </div>
              )}
            </Alert>
          )}

          <CollateralContext.Provider
            value={{
              market,
              loading,
              error,
              refresh,
              tick,
              wallet,
              refreshWallet,
              lastPermitLit,
              showSettings,
              toggleSettings: () => setShowSettings((v) => !v),
            }}
          >
            {children}
          </CollateralContext.Provider>
        </div>
      </div>
    </Layout>
  );
}
