import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import s from './styles.module.css';
import * as api from './api';
import useAutoRefresh from '../Dex/useAutoRefresh';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import { Alert, GearIcon } from '../Dex/ui';
import SettingsPanel from './SettingsPanel';
import { fmtAge } from './format';

const MiningContext = createContext(null);
export const useMining = () => useContext(MiningContext);

const BAND_LINES = [46, 89, 130, 169, 206, 243, 280];

const NAV = [
  { to: '/mining', label: 'Hashrate', exact: true },
  { to: '/mining/difficulty', label: 'Difficulty' },
  { to: '/mining/package', label: 'Block package' },
  { to: '/mining/payments', label: 'Payments' },
];

function Tabs() {
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
 * Collection liveness, stated rather than implied.
 *
 * Every statistics response carries its own status and only `ready` means the numbers reached the
 * chain tip. A page that polls every fifteen seconds looks identical whether it is current or
 * frozen, so the distinction gets its own indicator instead of being left to the reader.
 */
function Pulse({ status, observedAt }) {
  const live = status === 'ready';
  const working = status === 'catching-up' || status === 'loading' || status === 'recovering';
  const dot = live ? s.pulseDot : working ? `${s.pulseDot} ${s.pulseDotIdle}` : `${s.pulseDot} ${s.pulseDotDead}`;
  const age = fmtAge(observedAt);
  const text = live
    ? `live${age ? ` · ${age} ago` : ''}`
    : status === 'disabled'
      ? 'collection off'
      : status ?? 'unknown';
  return (
    <span className={s.pulse} title={`Collection status: ${status ?? 'unknown'}`}>
      <span className={dot} />
      {text}
    </span>
  );
}

export default function MiningLayout({ title, description, children }) {
  const [stats, setStats] = useState(null);
  const [workers, setWorkers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    // Both reads are open endpoints, so neither can fail for a missing key — an error here really
    // does mean the client is unreachable, which is worth saying plainly.
    Promise.all([api.getStats(), api.getWorkers()])
      .then(([st, w]) => {
        setStats(st);
        setWorkers(w);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const [autoSecs, setAutoSecs] = useState(0);
  const [tick, setTick] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => setAutoSecs(api.getAutoRefresh()), []);
  useAutoRefresh(autoSecs, () => {
    refresh();
    setTick((n) => n + 1);
  });

  // Saving can move the base URL, so everything read from the client is suspect afterwards —
  // including panels that only watch the tick.
  const onSettingsSaved = useCallback(() => {
    setAutoSecs(api.getAutoRefresh());
    refresh();
    setTick((n) => n + 1);
  }, [refresh]);

  const mining = stats?.mining;

  return (
    <Layout title={`Lithos Mining — ${title}`} description={description}>
      <div className={s.page}>
        <FlowField
          height={320}
          lines={BAND_LINES}
          cubes={[
            cubeBetween({ cx: 1086, size: 40, lineA: 46, lineB: 89 }),
            cubeBetween({ cx: 660, size: 24, lineA: 89, lineB: 130 }),
            cubeBetween({ cx: 250, size: 30, lineA: 130, lineB: 169 }),
          ]}
        />
        <div className={s.pageGlow1} aria-hidden="true" />
        <div className={s.pageGlow2} aria-hidden="true" />

        <div className={s.shell}>
          <div className={s.header}>
            <div className="curScrimHost curScrimHostTight">
              <h1 className={s.title}>
                Lithos<span className="curFlowWord">Mining</span>
              </h1>
              <p className={s.subtitle}>{description}</p>
            </div>
            <div className={s.headerSide}>
              <Tabs />
              <div className={s.headerRow}>
                <Pulse status={mining?.status} observedAt={mining?.observedAt} />
                <button
                  className={s.gearBtn}
                  onClick={() => setShowSettings((v) => !v)}
                  type="button"
                >
                  <GearIcon />
                  {showSettings ? 'Close' : 'Settings'}
                </button>
              </div>
            </div>
          </div>

          {showSettings && (
            <SettingsPanel onClose={() => setShowSettings(false)} onSaved={onSettingsSaved} />
          )}

          {error && !loading && (
            <Alert kind="error" title="Could not reach the Lithos client">
              {error}
              <div style={{ marginTop: '0.5rem' }}>
                Check that the client is running and that the base URL under the DEX or Collateral
                settings points at it.
              </div>
            </Alert>
          )}

          <MiningContext.Provider
            value={{ stats, mining, workers, loading, error, refresh, tick, autoSecs }}
          >
            {children}
          </MiningContext.Provider>
        </div>
      </div>
    </Layout>
  );
}
