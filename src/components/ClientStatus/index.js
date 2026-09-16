import React, { useEffect, useState } from 'react';
import { getBaseUrl } from '@site/src/components/Dex/api';
import s from './styles.module.css';

/**
 * How each `LithosInfo.status` should read.
 *
 * `synced` alone collapses six distinct states into two, and two of them —
 * `SyncFailed` and `Stale` — are not progress. Reporting either as "Syncing"
 * next to an amber dot tells someone to wait for something that is not coming.
 *
 * `tone` picks the dot; `bad` is reserved for states that need attention rather
 * than patience.
 */
const STATUS = {
  Ready: { label: 'Ready', tone: 'ok' },
  CatchingUp: { label: 'Catching up', tone: 'warn' },
  Starting: { label: 'Starting', tone: 'idle' },
  Stale: { label: 'Stale', tone: 'bad' },
  Reorganizing: { label: 'Reorganizing', tone: 'warn' },
  SyncFailed: { label: 'Sync failed', tone: 'bad' },
};

/**
 * Right-rail "Client status" card from screen 02.
 *
 * Polls GET /info on the same client the DEX talks to, so it reports real state
 * rather than being decorative. Degrades to "offline" when the client is not
 * running — which is the common case for someone just reading the docs, so it
 * must never look like an error.
 */
export default function ClientStatus() {
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${getBaseUrl()}/info`, { headers: { Accept: 'application/json' } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          if (!alive) return;
          setInfo(d);
          setState('ok');
        })
        .catch(() => {
          if (!alive) return;
          setInfo(null);
          setState('offline');
        });
    };
    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // `status` is the richer field; fall back to `synced` so an older client that
  // does not send it still reports something truthful.
  const detail = state === 'ok' ? STATUS[info?.status] : null;
  const fallbackTone = info?.synced ? 'ok' : 'warn';
  const tone =
    state === 'loading' ? 'idle' : state === 'offline' ? 'off' : (detail?.tone ?? fallbackTone);

  const dotClass = {
    ok: s.dotOk,
    warn: s.dotWarn,
    bad: s.dotBad,
    idle: s.dotIdle,
    off: s.dotOff,
  }[tone];

  const text =
    state === 'loading'
      ? 'Checking…'
      : state === 'offline'
        ? 'Not running'
        : (detail?.label ?? (info?.synced ? 'Synced' : 'Syncing'));

  /*
   * Each subsystem reports its own availability with a reason attached. Only
   * the ones that are actually down are shown — a healthy client should not
   * carry a list of things that are fine.
   */
  const problems =
    state === 'ok'
      ? [
          !info?.synced && info?.canonicalReason ? ['Canonical', info.canonicalReason] : null,
          info?.minerDictionaryAvailable === false
            ? ['Miner dictionary', info.minerDictionaryReason ?? 'unavailable']
            : null,
          info?.mempoolAvailable === false
            ? ['Mempool', info.mempoolReason ?? 'unavailable']
            : null,
        ].filter(Boolean)
      : [];

  return (
    <div className={s.card}>
      <div className={s.label}>Client status</div>
      <div className={s.statusRow}>
        <span className={`${s.dot} ${dotClass}`} />
        <span className={s.statusText}>{text}</span>
      </div>

      {state === 'ok' && (
        <>
          <div className={s.meta}>
            <span>Pool blocks</span>
            <span className={s.metaValue}>
              {Number(info.numPoolBlocks ?? 0).toLocaleString('en-US')}
            </span>
          </div>
          {/* Height only exists once a block has committed. */}
          {info.height != null && (
            <div className={s.meta}>
              <span>Height</span>
              <span className={s.metaValue}>{Number(info.height).toLocaleString('en-US')}</span>
            </div>
          )}
          {problems.map(([what, why]) => (
            <p key={what} className={s.problem} title={why}>
              <strong>{what}:</strong> {why}
            </p>
          ))}
        </>
      )}

      {state === 'offline' && (
        <p className={s.hint}>Start the Lithos client to see live state here.</p>
      )}
    </div>
  );
}
