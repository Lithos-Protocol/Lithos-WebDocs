import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import useAutoRefresh from '../Dex/useAutoRefresh';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import { Alert, GearIcon } from '../Dex/ui';
import SettingsPanel from './SettingsPanel';
import { fmtInt } from './format';

const ExtensionsContext = createContext(null);
export const useExtensions = () => useContext(ExtensionsContext);

const BAND_LINES = [46, 89, 130, 169, 206, 243, 280];

/** One tab per extension. Each owns everything under its path. */
const EXTENSIONS = [{ to: '/extensions/forwards', label: 'Difficulty Forwards' }];

/** The views inside Difficulty Forwards. */
const FORWARDS_NAV = [
  { to: '/extensions/forwards', label: 'Market', exact: true },
  { to: '/extensions/forwards/offer', label: 'Make an offer' },
  { to: '/extensions/forwards/portfolio', label: 'Portfolio', keyed: true },
  { to: '/extensions/forwards/guide', label: 'How it works' },
];

function usePath() {
  const { pathname } = useLocation();
  const base = useBaseUrl('/');
  const strip = (p) => p.replace(/\/+$/, '') || '/';
  return { cur: strip(pathname.replace(new RegExp(`^${base.replace(/\/$/, '')}`), '') || '/'), strip };
}

function ExtensionTabs() {
  const { cur, strip } = usePath();
  return (
    <div className={m.tabs}>
      {EXTENSIONS.map((n) => (
        <Link key={n.to} to={n.to} className={`${m.tab} ${cur.startsWith(strip(n.to)) ? m.tabActive : ''}`}>
          {n.label}
        </Link>
      ))}
      <span className={s.tabSoon} title="More extensions are planned">
        more soon
      </span>
    </div>
  );
}

/** The views of the current extension, under the header. */
export function ForwardsNav() {
  const { cur, strip } = usePath();
  const { keyed } = useExtensions();
  return (
    <nav className={m.subTabs} aria-label="Difficulty forwards">
      {FORWARDS_NAV.map((n) => {
        const active = n.exact ? cur === strip(n.to) : cur.startsWith(strip(n.to));
        return (
          <Link key={n.to} to={n.to} className={`${m.subTab} ${active ? m.subTabActive : ''}`}>
            {n.label}
            {n.keyed && !keyed && <span className={s.keyGlyph} title="Needs your API key">key</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Where the chain and the accumulator stand: a breathing dot while the accumulator reads, amber while
 * this network has none deployed yet, flat when the client did not answer.
 */
function Pulse({ acc, error, heights }) {
  const live = acc?.deployed && acc?.boxId;
  const preview = acc && !acc.deployed;
  const dot = error || !acc ? `${m.pulseDot} ${m.pulseDotDead}` : live ? m.pulseDot : `${m.pulseDot} ${m.pulseDotIdle}`;
  const where = acc
    ? heights
      ? `block ${fmtInt(acc.height)} · retarget in ${fmtInt(acc.blocksLeftInEpoch)}`
      : `epoch ${fmtInt(acc.currentEpoch)} · ${fmtInt(acc.blocksLeftInEpoch)} blocks left`
    : '';
  const text = error ? 'client unreachable' : !acc ? 'loading' : preview ? `not deployed · ${where}` : where;
  return (
    <span className={m.pulse} title="Where the chain is, and how many blocks until difficulty next changes">
      <span className={dot} />
      {text}
    </span>
  );
}

/** Shows block heights wherever epochs would be. Every view reads the choice from the context. */
function HeightsToggle({ on, onChange }) {
  return (
    <label
      className={s.heightsToggle}
      title="Ergo changes difficulty every 128 blocks, an epoch. Tick to see the blocks instead of epoch numbers."
    >
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      Block heights
    </label>
  );
}

export default function ExtensionsLayout({ title, description, children }) {
  const [acc, setAcc] = useState(null);
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [keyed, setKeyed] = useState(false);
  const [tick, setTick] = useState(0);
  // Moves only when this page sends something or unlocks, for reads too heavy to repeat on every tick
  const [version, setVersion] = useState(0);
  const [autoSecs, setAutoSecs] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [heights, setHeightsState] = useState(false);

  const setHeights = useCallback((on) => {
    api.setShowHeights(on);
    setHeightsState(on);
  }, []);

  /** Settles once both reads land. Both are open, so a failure means the client did not answer. */
  const refresh = useCallback(
    () =>
      Promise.all([api.getAccumulator(), api.getMarket().catch(() => null)])
        .then(([a, mk]) => {
          setAcc(a);
          setMarket(mk);
          setError(null);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    refresh();
    setKeyed(api.hasApiKey());
    setAutoSecs(api.getAutoRefresh());
    setHeightsState(api.getShowHeights());
  }, [refresh]);

  useAutoRefresh(autoSecs, () => {
    refresh();
    setTick((n) => n + 1);
  });

  /** Holds `key` for this page and re-reads everything that needs it. */
  const unlock = useCallback((key) => {
    api.setApiKey(key);
    setKeyed(api.hasApiKey());
    setTick((n) => n + 1);
    setVersion((n) => n + 1);
  }, []);

  const onSettingsSaved = useCallback(() => {
    setAutoSecs(api.getAutoRefresh());
    setKeyed(api.hasApiKey());
    refresh();
    setTick((n) => n + 1);
  }, [refresh]);

  /** After a transaction: the book, the market and anything keyed have all moved. */
  const changed = useCallback(() => {
    refresh();
    setTick((n) => n + 1);
    setVersion((n) => n + 1);
  }, [refresh]);

  return (
    <Layout title={`Lithos Extensions · ${title}`} description={description}>
      <div className={m.page}>
        <FlowField
          height={320}
          lines={BAND_LINES}
          cubes={[
            cubeBetween({ cx: 1040, size: 34, lineA: 46, lineB: 89 }),
            cubeBetween({ cx: 720, size: 22, lineA: 130, lineB: 169 }),
            cubeBetween({ cx: 300, size: 28, lineA: 89, lineB: 130 }),
          ]}
        />
        <div className={m.pageGlow1} aria-hidden="true" />
        <div className={m.pageGlow2} aria-hidden="true" />

        <div className={m.shell}>
          <div className={m.header}>
            <div className="curScrimHost curScrimHostTight">
              <h1 className={m.title}>
                Lithos<span className="curFlowWord">Extensions</span>
              </h1>
              <p className={m.subtitle}>{description}</p>
            </div>
            <div className={m.headerSide}>
              <ExtensionTabs />
              <div className={m.headerRow}>
                <Pulse acc={acc} error={error} heights={heights} />
                <HeightsToggle on={heights} onChange={setHeights} />
                <button className={m.gearBtn} onClick={() => setShowSettings((v) => !v)} type="button">
                  <GearIcon />
                  {showSettings ? 'Close' : 'Settings'}
                </button>
              </div>
            </div>
          </div>

          {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} onSaved={onSettingsSaved} />}

          {error && !loading && (
            <Alert kind="error" title="Could not reach the Lithos client">
              {error}
              <div style={{ marginTop: '0.5rem' }}>
                Check that the client is running and that the base URL under Settings points at it.
              </div>
            </Alert>
          )}

          {acc && !acc.deployed && (
            <div className={s.previewBanner}>
              <span className={s.previewTag}>preview</span>
              No difficulty accumulator is deployed on this network yet. The difficulty figures below are live,
              but offers cannot be made, filled or settled until it is.
            </div>
          )}

          <ExtensionsContext.Provider
            value={{ acc, market, loading, error, refresh, tick, version, keyed, unlock, changed, heights }}
          >
            {children}
          </ExtensionsContext.Provider>
        </div>
      </div>
    </Layout>
  );
}
