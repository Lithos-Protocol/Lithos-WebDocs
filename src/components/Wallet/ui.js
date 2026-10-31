import React, { useEffect, useRef, useState } from 'react';
import s from './styles.module.css';

/** Copies `text`, then reads "Copied" for a moment. Does nothing visible where the clipboard is blocked. */
export function CopyButton({ text, label = 'Copy', title }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the text is still selectable */
    }
  };

  return (
    <button className={s.copyBtn} onClick={copy} type="button" title={title ?? `Copy ${text}`}>
      {copied ? 'Copied' : label}
    </button>
  );
}

/**
 * Asks for the API key in place, for a view that shows nothing without it. The key is held in memory unless the
 * reader turned on remembering it under Settings.
 */
export function KeyGate({ what, onUnlock }) {
  const [key, setKey] = useState('');
  return (
    <form
      className={s.keyGate}
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim()) onUnlock(key.trim());
      }}
    >
      <div className={s.keyGateText}>
        <div className={s.keyGateTitle}>Your API key unlocks {what}</div>
        <p className={s.keyGateNote}>
          It stays in this page's memory, so it is asked for again after a refresh, unless you turn on
          remembering it under Settings.
        </p>
      </div>
      <div className={s.keyGateRow}>
        <input
          className={s.search}
          type="password"
          value={key}
          placeholder="api_key"
          onChange={(e) => setKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="API key"
        />
        <button className={s.primaryBtn} type="submit" disabled={!key.trim()}>
          Unlock
        </button>
      </div>
    </form>
  );
}

/** Legend-style filter buttons; each shows how many rows it would leave. */
export function FilterChips({ options, value, onChange }) {
  return (
    <div className={s.filters} role="group">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`${s.filter} ${value === o.id ? s.filterActive : ''}`}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.label}
          {o.count != null && <span className={s.filterCount}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
