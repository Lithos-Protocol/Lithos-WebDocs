import React, { useEffect, useState } from 'react';
import m from '../Mining/styles.module.css';
import f from '../Collateral/styles.module.css';
import * as api from './api';
import { Alert } from '../Dex/ui';
import { fmtInt } from './format';

/**
 * API host, key and refresh period for the Extensions pages.
 *
 * The base URL is shared with every other panel and persists in localStorage. The key is held in memory for
 * the life of the page: the market reads without it, while your positions and every transaction need it.
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

  const useDefault = () => {
    api.resetBaseUrl();
    setBase(api.getBaseUrl());
  };

  const testConnection = async () => {
    api.setBaseUrl(base);
    setProbe({ state: 'running' });
    try {
      const acc = await api.getAccumulator();
      setProbe({
        state: 'ok',
        msg: `Connected at height ${fmtInt(acc.height)}. ${
          acc.deployed ? 'The difficulty accumulator is deployed.' : 'No difficulty accumulator is deployed on this network yet.'
        }`,
      });
      onSaved?.();
    } catch (e) {
      setProbe({ state: 'fail', msg: e.message });
    }
  };

  const effective = base || (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className={`${f.settingsPanel} ${m.stackGap}`}>
      <div className={f.settingsHead}>
        <h3 className={m.cardTitle} style={{ margin: 0 }}>
          Settings
        </h3>
        {onClose && (
          <button className={f.settingsClose} onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        )}
      </div>

      <div className={f.settings}>
        <div className={f.settingRow}>
          <label className={f.settingLabel} htmlFor="ext-base-url">
            Client API base URL
          </label>
          <input
            id="ext-base-url"
            className={f.settingInput}
            value={base}
            placeholder="(same origin as this page)"
            onChange={(e) => setBase(e.target.value)}
            spellCheck={false}
          />
          <span className={f.settingHint}>
            Shared with every other panel. Leave blank to use the origin serving this page. Requests go to{' '}
            <code>{effective || '(same origin)'}/forwards/…</code>{' '}
            <button className={f.linkBtn} onClick={useDefault} type="button">
              reset to default
            </button>
          </span>
        </div>

        <div className={f.settingRow}>
          <label className={f.settingLabel} htmlFor="ext-api-key">
            API key
          </label>
          <div className={f.settingInputRow}>
            <input
              id="ext-api-key"
              className={f.settingInput}
              type={reveal ? 'text' : 'password'}
              value={key}
              placeholder="needed for your positions and to sign"
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button className={`${f.btn} ${f.btnGhost} ${f.btnSm}`} onClick={() => setReveal((v) => !v)} type="button">
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className={f.settingHint}>
            The market, the order book and every quote read without it. Your positions, your history, and every offer,
            fill, cancel or settlement send it. Held for this page only and re-entered after a refresh.
          </span>
        </div>

        <div className={f.settingRow}>
          <label className={f.settingCheck}>
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
            Enable auto-refresh
          </label>
          <div className={f.settingInputRow}>
            <input
              className={f.settingInput}
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
            <span className={f.settingUnit}>seconds</span>
          </div>
          <span className={f.settingHint}>
            Re-reads the book, the market and your positions on a timer. Whole seconds, {api.MIN_REFRESH_SECONDS} to{' '}
            {api.MAX_REFRESH_SECONDS}.
          </span>
        </div>
      </div>

      <div className={f.btnRow}>
        <button className={f.btn} onClick={save}>
          Save
        </button>
        <button className={`${f.btn} ${f.btnGhost}`} onClick={testConnection} disabled={probe?.state === 'running'}>
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
