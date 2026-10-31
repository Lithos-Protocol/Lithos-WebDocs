import React, { useEffect, useState } from 'react';
import c from '../Collateral/styles.module.css';
import * as api from './api';
import { Alert, RememberKeySetting } from '../Dex/ui';

/**
 * Base URL, API key and auto-refresh for the wallet page. The base URL and key are the site's shared ones, so
 * changing them here changes them for every section.
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

  const testConnection = async () => {
    api.setBaseUrl(base);
    setProbe({ state: 'running' });
    try {
      const r = await api.getVerifiedTokens();
      setProbe({ state: 'ok', msg: `Connected: the client lists ${r.tokens?.length ?? 0} verified tokens.` });
      onSaved?.();
    } catch (e) {
      setProbe({ state: 'fail', msg: e.message });
    }
  };

  const effective = base || (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className={c.settingsPanel}>
      <div className={c.settingsHead}>
        <h3 className={c.cardTitle} style={{ margin: 0 }}>
          Settings
        </h3>
        {onClose && (
          <button className={c.settingsClose} onClick={onClose} aria-label="Close settings" type="button">
            ✕
          </button>
        )}
      </div>

      <div className={c.settings}>
        <div className={c.settingRow}>
          <label className={c.settingLabel} htmlFor="wallet-base-url">
            Client API base URL
          </label>
          <input
            id="wallet-base-url"
            className={c.settingInput}
            value={base}
            placeholder="(same origin as this page)"
            onChange={(e) => setBase(e.target.value)}
            spellCheck={false}
          />
          <span className={c.settingHint}>
            Shared by every section. Requests go to <code>{effective || '(same origin)'}/wallet/…</code>{' '}
            <button
              className={c.linkBtn}
              onClick={() => {
                api.resetBaseUrl();
                setBase(api.getBaseUrl());
              }}
              type="button"
            >
              reset to default
            </button>
          </span>
        </div>

        <div className={c.settingRow}>
          <label className={c.settingLabel} htmlFor="wallet-api-key">
            API key
          </label>
          <div className={c.settingInputRow}>
            <input
              id="wallet-api-key"
              className={c.settingInput}
              type={reveal ? 'text' : 'password'}
              value={key}
              placeholder="required to read this wallet"
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button className={`${c.btn} ${c.btnGhost} ${c.btnSm}`} onClick={() => setReveal((v) => !v)} type="button">
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className={c.settingHint}>
            Sent as the <code>api_key</code> header. Re-entered after a refresh unless remembered below.
          </span>
        </div>

        <RememberKeySetting />

        <div className={c.settingRow}>
          <label className={c.settingCheck}>
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
            Enable auto-refresh
          </label>
          <div className={c.settingInputRow}>
            <input
              className={c.settingInput}
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
            <span className={c.settingUnit}>seconds</span>
          </div>
          <span className={c.settingHint}>
            Re-reads balances and rewards on a timer. Whole seconds, {api.MIN_REFRESH_SECONDS}&ndash;
            {api.MAX_REFRESH_SECONDS}.
          </span>
        </div>
      </div>

      <div className={c.btnRow}>
        <button className={c.btn} onClick={save} type="button">
          Save
        </button>
        <button
          className={`${c.btn} ${c.btnGhost}`}
          onClick={testConnection}
          disabled={probe?.state === 'running'}
          type="button"
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
