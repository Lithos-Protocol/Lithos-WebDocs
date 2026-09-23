import React, { useEffect, useState } from 'react';
import s from './styles.module.css';
/*
 * Form chrome is borrowed from the Collateral stylesheet rather than copied into this module.
 * All three panels present the same three settings, and two stylesheets for one form is how they
 * drift apart.
 */
import f from '../Collateral/styles.module.css';
import * as api from './api';
import { Alert } from '../Dex/ui';
import { fmtInt } from './format';

/**
 * API host, key and refresh period for the Mining page.
 *
 * The base URL is shared with the DEX and Collateral panels and persists in localStorage; the key
 * is held in memory for the life of the page and has to be re-entered after a refresh.
 *
 * Nothing on this page needs the key — every statistics endpoint it reads is open. It is offered
 * anyway because it is the same key the other two panels use, so someone who lands here first can
 * set it once and have it apply across the site.
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

  /** Probes the overview, which is the cheapest read and also reports collection status. */
  const testConnection = async () => {
    api.setBaseUrl(base);
    setProbe({ state: 'running' });
    try {
      const stats = await api.getStats();
      const m = stats?.mining ?? {};
      setProbe({
        state: 'ok',
        msg: `Connected. Statistics are ${m.status ?? 'unknown'}${
          m.sourceHeight != null ? ` at height ${fmtInt(m.sourceHeight)}` : ''
        }.`,
      });
      onSaved?.();
    } catch (e) {
      setProbe({ state: 'fail', msg: e.message });
    }
  };

  const effective = base || (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className={`${f.settingsPanel} ${s.stackGap}`}>
      <div className={f.settingsHead}>
        <h3 className={s.cardTitle} style={{ margin: 0 }}>
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
          <label className={f.settingLabel} htmlFor="mining-base-url">
            Client API base URL
          </label>
          <input
            id="mining-base-url"
            className={f.settingInput}
            value={base}
            placeholder="(same origin as this page)"
            onChange={(e) => setBase(e.target.value)}
            spellCheck={false}
          />
          <span className={f.settingHint}>
            Shared with the DEX and Collateral panels. Leave blank to use the origin serving this
            page. Requests go to <code>{effective || '(same origin)'}/stats/…</code>{' '}
            <button className={f.linkBtn} onClick={useDefault} type="button">
              reset to default
            </button>
          </span>
        </div>

        <div className={f.settingRow}>
          <label className={f.settingLabel} htmlFor="mining-api-key">
            API key
          </label>
          <div className={f.settingInputRow}>
            <input
              id="mining-api-key"
              className={f.settingInput}
              type={reveal ? 'text' : 'password'}
              value={key}
              placeholder="not needed for any statistics on this page"
              onChange={(e) => setKey(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className={`${f.btn} ${f.btnGhost} ${f.btnSm}`}
              onClick={() => setReveal((v) => !v)}
              type="button"
            >
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>
          <span className={f.settingHint}>
            Every statistic here is an open read, so this page never sends it. It is the same key
            the DEX and Collateral panels use for wallet-scoped calls, and must be re-entered after
            a refresh.
          </span>
        </div>

        <div className={f.settingRow}>
          <label className={f.settingCheck}>
            <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
            Enable auto-refresh
          </label>
          <div className={f.settingInputRow}>
            <input
              id="mining-auto-secs"
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
            Re-reads every chart on this page on a timer. Collection runs in the client regardless —
            a refresh only decides how often the page asks for what it has already gathered. Whole
            seconds, {api.MIN_REFRESH_SECONDS}&ndash;{api.MAX_REFRESH_SECONDS}.
          </span>
        </div>
      </div>

      <div className={f.btnRow}>
        <button className={f.btn} onClick={save}>
          Save
        </button>
        <button
          className={`${f.btn} ${f.btnGhost}`}
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
