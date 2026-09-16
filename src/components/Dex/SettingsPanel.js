import React, { useState, useEffect } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { fmtErg, parseErg } from './format';
import { Alert } from './ui';

/**
 * API key + base URL.
 *
 * The base URL is persisted to localStorage. The key deliberately is not — it is
 * held in memory for the life of the page and has to be re-entered after a
 * refresh. It is only ever sent as the `api_key` header on mutating endpoints,
 * and is masked here so it isn't left on screen. Nothing is stored server-side.
 */
export default function SettingsPanel({ onClose, onSaved }) {
  const [key, setKey] = useState('');
  const [base, setBase] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probe, setProbe] = useState(null);
  const [autoOn, setAutoOn] = useState(false);
  const [autoSecs, setAutoSecs] = useState(String(api.DEFAULT_REFRESH_SECONDS));
  // Order fees are entered in ERG and stored as nanoERG. Blank-and-off means the
  // client's own defaults, which is what most people should leave alone.
  const [feesOn, setFeesOn] = useState(false);
  const [execFee, setExecFee] = useState('');
  const [minerCap, setMinerCap] = useState('');
  const [feeErr, setFeeErr] = useState(null);

  useEffect(() => {
    setKey(api.getApiKey());
    setBase(api.getBaseUrl());
    const secs = api.getAutoRefresh();
    setAutoOn(secs > 0);
    // Keep the last period visible after unticking, so re-enabling does not
    // make the reader retype it.
    if (secs > 0) setAutoSecs(String(secs));
    const fees = api.getOrderFees();
    setFeesOn(!!fees);
    if (fees) {
      setExecFee(fmtErg(fees.executorFee, 9).replace(/,/g, ''));
      setMinerCap(fmtErg(fees.maxMinerFee, 9).replace(/,/g, ''));
    }
  }, []);

  /**
   * Both fees or neither. `maxMinerFee` must be below `executorFee` or every order
   * request is refused — checked here, since the form is the only place both
   * numbers are in view.
   */
  const readFees = () => {
    if (!feesOn) return { fees: null };
    const e = parseErg(execFee);
    const m = parseErg(minerCap);
    if (e === null || e <= 0n || m === null || m <= 0n) {
      return { error: 'Enter both order fees as positive ERG amounts, or untick custom fees.' };
    }
    if (m >= e) {
      return { error: 'The miner fee cap must be below the executor fee: it is paid out of it.' };
    }
    return { fees: { executorFee: e.toString(), maxMinerFee: m.toString() } };
  };

  const save = () => {
    const { fees, error: bad } = readFees();
    if (bad) {
      setFeeErr(bad);
      return;
    }
    setFeeErr(null);
    api.setApiKey(key);
    api.setBaseUrl(base);
    api.setAutoRefresh(autoOn ? autoSecs : 0);
    api.setOrderFees(fees);
    setSaved(true);
    setProbe(null);
    onSaved?.();
    setTimeout(() => setSaved(false), 2500);
  };

  const useDefault = () => {
    api.resetBaseUrl();
    setBase(api.getBaseUrl());
  };

  /** Hit a cheap read-only endpoint so a bad host or port fails here, not mid-swap. */
  const testConnection = async () => {
    api.setBaseUrl(base);
    setProbe({ state: 'running' });
    try {
      const pool = await api.getPool();
      setProbe({
        state: 'ok',
        msg: `Connected: pool synced at height ${pool.syncHeight?.toLocaleString?.() ?? '?'}.`,
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
          <label className={s.settingLabel} htmlFor="dex-base-url">
            Client API base URL
          </label>
          <input
            id="dex-base-url"
            className={s.settingInput}
            value={base}
            placeholder="(same origin as this page)"
            onChange={(e) => setBase(e.target.value)}
            spellCheck={false}
          />
          <span className={s.settingHint}>
            Leave blank to use the origin serving this page. Using external APIs may not provide the
            same security guarantees. Requests go to{' '}
            <code>{effective || '(same origin)'}/dex/…</code>{' '}
            <button className={s.linkBtn} onClick={useDefault} type="button">
              reset to default
            </button>
          </span>
        </div>

        <div className={s.settingRow}>
          <label className={s.settingLabel} htmlFor="dex-api-key">
            API key
          </label>
          <div className={s.settingInputRow}>
            <input
              id="dex-api-key"
              className={s.settingInput}
              type={reveal ? 'text' : 'password'}
              value={key}
              placeholder="required for swaps, deposits, claims and flushes"
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
              id="dex-auto-secs"
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

        <div className={s.settingRow}>
          <label className={s.settingCheck}>
            <input
              type="checkbox"
              checked={feesOn}
              onChange={(e) => {
                setFeesOn(e.target.checked);
                setFeeErr(null);
              }}
            />
            Custom order fees
          </label>
          <div className={s.settingFeeGrid}>
            <label className={s.settingFeeField}>
              <span className={s.settingFeeLabel}>Executor fee</span>
              <span className={s.settingInputRow}>
                <input
                  className={s.settingInput}
                  inputMode="decimal"
                  placeholder="0.003"
                  value={execFee}
                  disabled={!feesOn}
                  onChange={(e) => setExecFee(e.target.value)}
                  aria-label="Executor fee in ERG"
                />
                <span className={s.settingUnit}>ERG</span>
              </span>
            </label>
            <label className={s.settingFeeField}>
              <span className={s.settingFeeLabel}>Max miner fee</span>
              <span className={s.settingInputRow}>
                <input
                  className={s.settingInput}
                  inputMode="decimal"
                  placeholder="0.001"
                  value={minerCap}
                  disabled={!feesOn}
                  onChange={(e) => setMinerCap(e.target.value)}
                  aria-label="Maximum miner fee in ERG"
                />
                <span className={s.settingUnit}>ERG</span>
              </span>
            </label>
          </div>
          <span className={s.settingHint}>
            Applies to swap, deposit and redeem orders. The executor fee pays whoever fills the order;
            the miner fee cap is how much of it a broadcast fill may spend, and must be lower. Miners
            skip orders paying less than they accept, so a low fee can leave an order waiting. Off
            uses this client's defaults.
          </span>
          {feeErr && (
            <Alert kind="error" title="Order fees not saved">
              {feeErr}
            </Alert>
          )}
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
