import React, { useState, useEffect } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { Alert } from './ui';

/**
 * API key + base URL for the Collateral Market panel.
 *
 * The base URL is persisted to localStorage under `lithos.collateral.baseUrl`.
 * The key deliberately is not — it is held in memory for the life of the page
 * and has to be re-entered after a refresh. It is only ever sent as the
 * `api_key` header on wallet-scoped endpoints, and is masked here so it isn't
 * left on screen. Nothing is stored server-side.
 */
export default function SettingsPanel({ onClose, onSaved }) {
  const [key, setKey] = useState('');
  const [base, setBase] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probe, setProbe] = useState(null);
  const [autoOn, setAutoOn] = useState(false);
  const [autoSecs, setAutoSecs] = useState(String(api.DEFAULT_REFRESH_SECONDS));

  useEffect(() => {
    setKey(api.getApiKey());
    setBase(api.getBaseUrl());
    const secs = api.getAutoRefresh();
    setAutoOn(secs > 0);
    // Keep the last period visible after unticking, so re-enabling does not
    // make the reader retype it.
    if (secs > 0) setAutoSecs(String(secs));
  }, []);

  const save = () => {
    api.setApiKey(key);
    api.setBaseUrl(base);
    api.setAutoRefresh(autoOn ? autoSecs : 0);
    setSaved(true);
    setProbe(null);
    onSaved?.();
    setTimeout(() => setSaved(false), 2500);
  };

  const useDefault = () => {
    api.resetBaseUrl();
    setBase(api.getBaseUrl());
  };

  /** Hit a cheap read-only endpoint so a bad host or port fails here, not mid-join. */
  const testConnection = async () => {
    api.setBaseUrl(base);
    setProbe({ state: 'running' });
    try {
      const market = await api.getMarket();
      setProbe({
        state: 'ok',
        msg: `Connected: synced at height ${market.syncHeight?.toLocaleString?.() ?? '?'}.`,
      });
      onSaved?.();
    } catch (e) {
      setProbe({ state: 'fail', msg: e.message });
    }
  };

  const effective = base || (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className={s.settingsPanel}>
      <div className={s.settingsHead}>
        <h3 className={s.cardTitle} style={{ margin: 0 }}>
          Settings
        </h3>
        {onClose && (
          <button className={s.settingsClose} onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        )}
      </div>

      <div className={s.settings}>
        <div className={s.settingRow}>
          <label className={s.settingLabel} htmlFor="collateral-base-url">
            Client API base URL
          </label>
          <input
            id="collateral-base-url"
            className={s.settingInput}
            value={base}
            placeholder="(same origin as this page)"
            onChange={(e) => setBase(e.target.value)}
            spellCheck={false}
          />
          <span className={s.settingHint}>
            Leave blank to use the origin serving this page. Using external APIs may not provide the
            same security guarantees. Requests go to{' '}
            <code>{effective || '(same origin)'}/collateral/…</code>{' '}
            <button className={s.linkBtn} onClick={useDefault} type="button">
              reset to default
            </button>
          </span>
        </div>

        <div className={s.settingRow}>
          <label className={s.settingLabel} htmlFor="collateral-api-key">
            API key
          </label>
          <div className={s.settingInputRow}>
            <input
              id="collateral-api-key"
              className={s.settingInput}
              type={reveal ? 'text' : 'password'}
              value={key}
              placeholder="required for your position, joining and reward claims"
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
              onClick={() => setReveal((v) => !v)}
              type="button"
            >
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className={s.settingHint}>
            Sent as the <code>api_key</code> header. Must be re-entered after a refresh.
          </span>
        </div>

        <div className={s.settingRow}>
          <label className={s.settingCheck}>
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
            Enable auto-refresh
          </label>
          <div className={s.settingInputRow}>
            <input
              id="collateral-auto-secs"
              className={s.settingInput}
              type="number"
              inputMode="numeric"
              min={api.MIN_REFRESH_SECONDS}
              max={api.MAX_REFRESH_SECONDS}
              step={1}
              value={autoSecs}
              disabled={!autoOn}
              onChange={(e) => setAutoSecs(e.target.value.replace(/[^0-9]/g, ''))}
              aria-label="Auto-refresh interval in seconds"
            />
            <span className={s.settingUnit}>seconds</span>
          </div>
          <span className={s.settingHint}>
            Re-reads pool state, balances, lists and charts on a timer. Quotes are never re-run: a
            price you were shown stays put until you change an input, so nothing you are about to
            sign can move underneath you. Whole seconds, {api.MIN_REFRESH_SECONDS}&ndash;
            {api.MAX_REFRESH_SECONDS}.
          </span>
        </div>
      </div>

      <div className={s.btnRow}>
        <button className={s.btn} onClick={save}>
          Save
        </button>
        <button
          className={`${s.btn} ${s.btnGhost}`}
          onClick={testConnection}
          disabled={probe?.state === 'running'}
        >
          {probe?.state === 'running' ? 'Testing…' : 'Test connection'}
        </button>
      </div>

      {saved && <Alert kind="ok">Saved.</Alert>}
      {probe?.state === 'ok' && <Alert kind="ok">{probe.msg}</Alert>}
      {probe?.state === 'fail' && (
        <Alert kind="error" title="Connection failed">
          {probe.msg}
        </Alert>
      )}
    </div>
  );
}
