import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '@theme/Layout';
import m from '../Mining/styles.module.css';
import x from '../Extensions/styles.module.css';
import s from './styles.module.css';
import * as api from './api';
import useAutoRefresh from '../Dex/useAutoRefresh';
import ExtensionHeader, { ExtensionNav } from '../Extensions/ExtensionHeader';
import { Alert, GearIcon, TxResult } from '../Dex/ui';
import { CopyButton } from '../Wallet/ui';
import { ExtensionsContext } from '../Extensions/ExtensionsLayout';
import SettingsPanel from '../Extensions/SettingsPanel';
import { TokenProvider } from './tokens';
import { PricingProvider } from './PriceContext';
import { fmtInt } from './format';

const NAV = [
  { to: '/extensions/sigmafi', label: 'Market', exact: true },
  { to: '/extensions/sigmafi/create', label: 'Borrow' },
  { to: '/extensions/sigmafi/portfolio', label: 'Portfolio' },
  { to: '/extensions/sigmafi/search', label: 'Search' },
];

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
  const [receipt, setReceipt] = useState(null);
  const receiptRef = useRef(null);

  useEffect(() => {
    if (!receipt) return;
    receiptRef.current?.focus({ preventScroll: true });
    receiptRef.current?.scrollIntoView({ block: 'nearest' });
  }, [receipt]);

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
    setVersion((n) => n + 1);
  }, [refresh]);

  /** After a transaction: the book and anything keyed have moved. */
  const changed = useCallback(() => {
    refresh();
    setTick((n) => n + 1);
    setVersion((n) => n + 1);
  }, [refresh]);

  // A spent order or bond disappears on refresh. Its receipt belongs to the page, not that row.
  const submitted = useCallback((label, result) => {
    setReceipt({ label, result });
    changed();
  }, [changed]);

  return (
    <Layout title={`SigmaFi · ${title}`} description={description}>
      <div className={`${x.extensionPage} ${s.page}`}>
        <div className={x.extensionShell}>
          <ExtensionHeader name="SigmaFi" description="Peer-to-peer loans. Your assets, your terms." docs="/docs/extensions/sigmafi-bonds">
            <Pulse height={height} error={error} />
            <button className={m.gearBtn} onClick={() => setShowSettings((v) => !v)} type="button" aria-expanded={showSettings}>
              <GearIcon /> Settings
            </button>
          </ExtensionHeader>

          {showSettings && (
            <SettingsPanel
              onClose={() => setShowSettings(false)}
              onSaved={onSettingsSaved}
              getRefresh={api.getAutoRefresh}
              setRefresh={api.setAutoRefresh}
              probeConnection={() => api.getBonds({ limit: 1 })}
              apiPath="sigmafi"
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

          <ExtensionsContext.Provider value={{ height, error, refresh, tick, version, keyed, unlock, changed, submitted }}>
            <TokenProvider>
              <PricingProvider>
              <ExtensionNav items={NAV} label="SigmaFi" />
              {receipt && <section ref={receiptRef} tabIndex={-1} className={s.transactionReceipt} aria-label="Transaction result">
                <TxResult title={`${receipt.label}: sent`} outcome={receipt.result.outcome} txId={receipt.result.txId}
                  rows={[...(receipt.result.boxId ? [['Box', receipt.result.boxId]] : []), ...(receipt.result.assetId ? [['Bond asset', receipt.result.assetId]] : [])]}>
                  <div className={s.receiptActions}>
                    <CopyButton text={receipt.result.txId} label="Copy transaction ID" />
                    <button type="button" className={s.refreshBtn} onClick={() => setReceipt(null)}>Dismiss</button>
                  </div>
                </TxResult>
              </section>}
              {children}
              </PricingProvider>
            </TokenProvider>
          </ExtensionsContext.Provider>
        </div>
      </div>
    </Layout>
  );
}
