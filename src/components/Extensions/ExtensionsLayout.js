import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import m from '../Mining/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import useAutoRefresh from '../Dex/useAutoRefresh';
import ExtensionHeader, { ExtensionNav } from './ExtensionHeader';
import { Alert, GearIcon } from '../Dex/ui';
import SettingsPanel from './SettingsPanel';
import { fmtInt } from './format';

export const ExtensionsContext = createContext(null);
export const useExtensions = () => useContext(ExtensionsContext);

const FORWARDS_NAV = [
  { to: '/extensions/forwards', label: 'Market', exact: true },
  { to: '/extensions/forwards/offer', label: 'Create offer' },
  { to: '/extensions/forwards/portfolio', label: 'Portfolio' },
  { to: '/extensions/forwards/guide', label: 'How it works' },
];

export function ForwardsNav() {
  return <ExtensionNav items={FORWARDS_NAV} label="Diff Forwards" />;
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

  /** Settles once the reads land. All are open, so a failure means the client did not answer. */
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
    setVersion((n) => n + 1);
  }, [refresh]);

  /** After a transaction: the book, the market and anything keyed have all moved. */
  const changed = useCallback(() => {
    refresh();
    setTick((n) => n + 1);
    setVersion((n) => n + 1);
  }, [refresh]);

  return (
    <Layout title={title === 'Difficulty Forwards' ? 'Diff Forwards' : `Diff Forwards · ${title}`} description={description}>
      <div className={s.extensionPage}>
        <div className={s.extensionShell}>
          <ExtensionHeader name="Diff Forwards" description="Trade Ergo difficulty. Hedge your hashrate." docs="/docs/extensions/difficulty-forwards">
            <Pulse acc={acc} error={error} heights={heights} />
            <HeightsToggle on={heights} onChange={setHeights} />
            <button className={m.gearBtn} onClick={() => setShowSettings((v) => !v)} type="button" aria-expanded={showSettings}>
              <GearIcon /> Settings
            </button>
          </ExtensionHeader>

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
