import React, { useCallback, useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import { useLocation } from '@docusaurus/router';
import useBaseUrl from '@docusaurus/useBaseUrl';
import m from '../Mining/styles.module.css';
import x from '../Extensions/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import useAutoRefresh from '../Dex/useAutoRefresh';
import FlowField, { cubeBetween } from '@site/src/components/FlowField';
import { Alert, GearIcon } from '../Dex/ui';
import { ExtensionsContext, ExtensionTabs } from '../Extensions/ExtensionsLayout';
import SettingsPanel from '../Extensions/SettingsPanel';
import { TokenProvider } from './tokens';
import { fmtInt } from './format';

const BAND_LINES = [46, 89, 130, 169, 206, 243, 280];

/**
 * Bond products. Zero-coupon bonds are the only one today; each later kind gets its own tab here and its own
 * views under its path.
 */
const PRODUCTS = [{ id: 'zc', label: 'Zero-coupon bonds' }];

/** The views of zero-coupon bonds. */
const NAV = [
  { to: '/extensions/sigmafi', label: 'Book', exact: true },
  { to: '/extensions/sigmafi/create', label: 'Create' },
  { to: '/extensions/sigmafi/portfolio', label: 'Portfolio', keyed: true },
  { to: '/extensions/sigmafi/guide', label: 'How it works' },
];

function useCur() {
  const { pathname } = useLocation();
  const base = useBaseUrl('/');
  const strip = (p) => p.replace(/\/+$/, '') || '/';
  return { cur: strip(pathname.replace(new RegExp(`^${base.replace(/\/$/, '')}`), '') || '/'), strip };
}

function Nav({ keyed }) {
  const { cur, strip } = useCur();
  return (
    <div className={s.productRow}>
      <div className={m.seg} role="tablist" aria-label="Bond kind">
        {PRODUCTS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected className={`${m.segBtn} ${m.segBtnOn}`}>
            {p.label}
          </button>
        ))}
      </div>
      <nav className={m.subTabs} aria-label="Zero-coupon bonds" style={{ margin: 0 }}>
        {NAV.map((n) => {
          const active = n.exact ? cur === strip(n.to) : cur.startsWith(strip(n.to));
          return (
            <Link key={n.to} to={n.to} className={`${m.subTab} ${active ? m.subTabActive : ''}`}>
              {n.label}
              {n.keyed && !keyed && <span className={x.keyGlyph} title="Needs your API key">key</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Where the chain is, from the last read: a breathing dot while the client answers, flat when it does not. */
function Pulse({ height, error }) {
  const dot = error || height == null ? `${m.pulseDot} ${m.pulseDotDead}` : m.pulseDot;
  return (
    <span className={m.pulse} title="The newest block this client has">
      <span className={dot} />
      {error ? 'client unreachable' : height == null ? 'loading' : `block ${fmtInt(height)}`}
    </span>
  );
}

/**
 * The SigmaFi section's frame. It provides the Extensions context, so the shared key gate, pager and settings
 * work here unchanged, and the token context every view shows tokens through.
 */
export default function SigmaFiLayout({ title, description, children }) {
  const [height, setHeight] = useState(null);
  const [error, setError] = useState(null);
  const [keyed, setKeyed] = useState(false);
  const [tick, setTick] = useState(0);
  const [version, setVersion] = useState(0);
  const [autoSecs, setAutoSecs] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(
    () =>
      api.getBonds({ limit: 1 })
        .then((b) => {
          setHeight(b.height);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    [],
  );

  useEffect(() => {
    refresh();
    setKeyed(api.hasApiKey());
    setAutoSecs(api.getAutoRefresh());
  }, [refresh]);

  useAutoRefresh(autoSecs, () => {
    refresh();
    setTick((n) => n + 1);
  });

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

  /** After a transaction: the book and anything keyed have moved. */
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
            cubeBetween({ cx: 980, size: 30, lineA: 46, lineB: 89 }),
            cubeBetween({ cx: 640, size: 24, lineA: 130, lineB: 169 }),
            cubeBetween({ cx: 260, size: 26, lineA: 89, lineB: 130 }),
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
                <Pulse height={height} error={error} />
                <button className={m.gearBtn} onClick={() => setShowSettings((v) => !v)} type="button">
                  <GearIcon />
                  {showSettings ? 'Close' : 'Settings'}
                </button>
              </div>
            </div>
          </div>

          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              onSaved={onSettingsSaved}
              getRefresh={api.getAutoRefresh}
              setRefresh={api.setAutoRefresh}
            />
          )}

          {error && (
            <Alert kind="error" title="Could not reach the Lithos client">
              {error}
              <div style={{ marginTop: '0.5rem' }}>
                Check that the client is running and that the base URL under Settings points at it.
              </div>
            </Alert>
          )}

          <ExtensionsContext.Provider value={{ height, error, refresh, tick, version, keyed, unlock, changed }}>
            <TokenProvider>
              <Nav keyed={keyed} />
              {children}
            </TokenProvider>
          </ExtensionsContext.Provider>
        </div>
      </div>
    </Layout>
  );
}
