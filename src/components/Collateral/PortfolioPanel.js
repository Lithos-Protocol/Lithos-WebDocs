import React, { useState, useCallback } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useCollateral } from './CollarLayout';
import { big, fmtErgAmount, fmtTokenAmount, fmtInt, shortId } from './format';
import { Alert, Row, Spinner, CubeGlyph, IdText, GearIcon } from './ui';

const TABLE_PAGE = 30;

const STATUS_CLASS = {
  FREE: 'cmStatusFree',
  QUEUED: 'cmStatusQueued',
  ACTIVE: 'cmStatusActive',
  // A key whose collateral box was spent recently and is still named by a
  // proof-of-spend box. The client will not join with it — a reorg could make
  // that box live again — so it is not "free" however idle it looks.
  RETIRING: 'cmStatusRetiring',
};

const STATUS_TITLE = {
  FREE: 'Unused — available for a join',
  QUEUED: 'Waiting in the queue',
  ACTIVE: 'Holds a live collateral box',
  RETIRING: 'Recently spent and still named by a proof-of-spend. Not available for a join yet.',
};

function StatusChip({ status }) {
  const key = String(status).toUpperCase();
  const cls = s[STATUS_CLASS[key] ?? ''] ?? '';
  return (
    <span
      className={`${s.cmStatusChip} ${cls}`}
      title={STATUS_TITLE[key] ?? `Key status: ${status}`}
    >
      <span className={s.cmStatusDot} />
      {String(status).toLowerCase()}
    </span>
  );
}

/* ============================================================
   Positions table
   ============================================================ */

/**
 * Every row is the reader's own box, so there is no "mine" colouring to do
 * here — the columns carry the information the old grid hid behind a click.
 *
 * This card shares a two-column row with the client configuration, so the
 * table is kept to five narrow columns; `.cmTableWrap` scrolls it sideways if
 * the viewport gets tight rather than letting it squash.
 */
function PositionsTable({ positions }) {
  const [page, setPage] = useState(0);

  // LIVE boxes are one block away from paying, so they lead; within a kind,
  // lowest queue position first.
  const sorted = [...positions].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'LIVE' ? -1 : 1;
    return (
      Number(a.position ?? a.creationHeight ?? 0) - Number(b.position ?? b.creationHeight ?? 0)
    );
  });

  const pages = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * TABLE_PAGE, (cur + 1) * TABLE_PAGE);

  return (
    <>
      <div className={s.cmTableWrap}>
        <table className={s.cmTable}>
          <thead>
            <tr>
              <th className={s.cmTh}>Status</th>
              <th className={s.cmTh}>Box</th>
              <th className={`${s.cmTh} ${s.cmThNum}`}>Principal</th>
              <th className={`${s.cmTh} ${s.cmThNum}`}>LIT</th>
              <th className={`${s.cmTh} ${s.cmThNum}`}>Height</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => {
              const live = p.kind === 'LIVE';
              return (
                <tr key={p.boxId} className={s.cmTr}>
                  <td className={s.cmTd}>
                    <span
                      className={`${s.cmStatusChip} ${live ? s.cmStatusActive : s.cmStatusQueued}`}
                    >
                      <span className={s.cmStatusDot} />
                      {live
                        ? 'live'
                        : `queued${p.position != null ? ` #${fmtInt(p.position)}` : ''}`}
                    </span>
                  </td>
                  <td className={s.cmTd}>
                    <IdText id={p.boxId} />
                  </td>
                  <td className={`${s.cmTd} ${s.cmNum}`} style={{ color: 'var(--cur-cyan-light)' }}>
                    {fmtErgAmount(p.principalNanoErgs, 4)} ERG
                  </td>
                  {/* Queued boxes report the permit they paid; live boxes report
                      permit plus accrued emission carried on-chain. Different
                      meanings, one column — the title says which. */}
                  <td
                    className={`${s.cmTd} ${s.cmNum}`}
                    style={{ color: 'var(--cur-purple-light)' }}
                    title={live ? 'LIT carried on the box' : 'Permit paid to join'}
                  >
                    {live
                      ? p.carriedLit != null
                        ? `${fmtTokenAmount(p.carriedLit, 9, 2)} LIT`
                        : '—'
                      : p.permitLit != null
                        ? `${fmtTokenAmount(p.permitLit, 9, 2)} LIT`
                        : '—'}
                  </td>
                  <td
                    className={`${s.cmTd} ${s.cmNum}`}
                    title={live ? 'Activated at this height' : 'Joined at this height'}
                  >
                    {fmtInt(p.creationHeight)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className={s.cmPager}>
          <span className={s.cmPagerInfo}>
            boxes {fmtInt(cur * TABLE_PAGE + 1)}–
            {fmtInt(Math.min(sorted.length, (cur + 1) * TABLE_PAGE))} of {fmtInt(sorted.length)}
          </span>
          <button
            className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
            disabled={cur === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            type="button"
          >
            ← Prev
          </button>
          <button
            className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
            disabled={cur + 1 >= pages}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            Next →
          </button>
        </div>
      )}

      <Alert kind="warn">
        Queued funds cannot be withdrawn. They come back when a Lithos miner mines a block and spends the box.
      </Alert>
    </>
  );
}

/* ============================================================
   Rewards card
   ============================================================ */

function RewardsCard({ rewards, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [partial, setPartial] = useState(null);

  /*
   * Three outcomes, not two.
   *
   * 400 means nothing was claimable or a sweep is already running — nothing was
   * lost, so the server's wording is shown as-is. 422 is different: the sweep
   * started and stopped part way, and batches broadcast before that point HAVE
   * been sent. Reporting it as a plain failure would tell someone nothing
   * happened when ERG has already moved.
   */
  const claim = async () => {
    setBusy(true);
    setError(null);
    setPartial(null);
    setResult(null);
    try {
      const r = await api.claimRewards();
      setResult(r);
      onChanged?.();
    } catch (e) {
      if (e.status === 422) {
        setPartial(e.message);
        // Some batches may have landed, so the balances are stale either way.
        onChanged?.();
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const unlocked = Number(rewards?.unlockedBoxes ?? 0);
  const locked = Math.max(0, Number(rewards?.boxes ?? 0) - unlocked);

  return (
    <div className={s.card}>
      <h3 className={s.cardTitle}>Lending rewards</h3>
      <p className={s.cardDesc}>
        Your coinbases sit at the reward script for 720 blocks (~a day) until they mature. Claiming
        sweeps every unlocked one back into spendable ERG at your first address, consolidating dust
        rather than dropping it.
      </p>

      {!rewards ? (
        <div className={s.empty}>—</div>
      ) : (
        <>
          <div className={s.totalsGrid}>
            <div className={`${s.totalCard} ${unlocked > 0 ? s.totalCardOk : ''}`}>
              <div className={s.totalLabel}>Unlocked now</div>
              <div className={s.totalValue}>{fmtInt(unlocked)}</div>
              <div className={s.totalSub}>
                boxes · {fmtErgAmount(rewards.unlockedNanoErgs, 6)} ERG
              </div>
            </div>
            <div className={s.totalCard}>
              <div className={s.totalLabel}>Still locked</div>
              <div className={s.totalValue}>{fmtInt(locked)}</div>
              <div className={s.totalSub}>
                boxes ·{' '}
                {fmtErgAmount(big(rewards.totalNanoErgs) - big(rewards.unlockedNanoErgs), 6)} ERG
              </div>
            </div>
            <div className={s.totalCard}>
              <div className={s.totalLabel}>Total rewards</div>
              <div className={s.totalValueAlt} style={{ marginTop: 0 }}>
                {fmtErgAmount(rewards.totalNanoErgs, 6)} ERG
              </div>
              <div className={s.totalSub}>
                {rewards.blocksUntilFirstUnlock != null
                  ? `${fmtInt(rewards.blocksUntilFirstUnlock)} blocks until the next unlock`
                  : 'next unlock pending'}
              </div>
            </div>
          </div>

          <button className={s.btn} disabled={unlocked === 0 || busy} onClick={claim}>
            {busy
              ? 'Claiming…'
              : unlocked > 0
                ? `Claim ${fmtInt(unlocked)} unlocked box${unlocked === 1 ? '' : 'es'}`
                : 'Nothing unlocked yet'}
          </button>

          {/* Server-written detail strings surface verbatim, right under the control. */}
          {error && (
            <Alert kind="error" title="Claim failed">
              {error}
            </Alert>
          )}

          {partial && (
            <Alert kind="warn" title="The sweep stopped part way">
              {partial}
              <div style={{ marginTop: '0.5rem' }}>
                Batches sent before it stopped have still been broadcast, so some rewards may
                already have moved. The balances above have been re-read.
              </div>
            </Alert>
          )}

          {result && (
            <Alert kind="ok" title="Rewards claimed">
              {fmtErgAmount(result.claimedNanoErgs, 4)} ERG swept across{' '}
              {result.claims?.length ?? 0} transaction
              {(result.claims?.length ?? 0) === 1 ? '' : 's'}.
              {(result.claims ?? []).map((c) => (
                <div key={c.txId} className={s.row}>
                  <span className={s.rowLabel}>
                    {fmtInt(c.boxes)} box
                    {(Number(c.boxes) || 0) === 1 ? '' : 'es'} · {fmtErgAmount(c.nanoErgs, 4)} ERG
                  </span>
                  <span className={s.txId}>{c.txId}</span>
                </div>
              ))}
            </Alert>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   Panel
   ============================================================ */

export default function PortfolioPanel() {
  const { wallet, refreshWallet, refresh, toggleSettings, tick } = useCollateral();
  const [w, setW] = useState(wallet);
  const [loading, setLoading] = useState(!wallet);
  const [error, setError] = useState(null);
  const [keyPage, setKeyPage] = useState(0);

  /** Mount + after any mutation: balances, keys, positions and rewards all move together. */
  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    api
      .getWallet()
      .then((r) => {
        if (!alive) return;
        setW(r);
        setError(null);
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  /*
   * `hasApiKey()` is a plain module read, not reactive state, so an effect that
   * only depends on `load` never learns that a key arrived — the gate below
   * lifts on the next render but the fetch never fires, leaving this page
   * stuck on "could not load". Keys now live in memory and have to be
   * re-entered after every refresh, so that is the common path, not an edge
   * case. The layout re-reads the wallet whenever Settings are saved; keying
   * off whether that succeeded gives this panel the trigger it needs, and the
   * boolean (rather than the object) keeps a mutation from refetching twice.
   */
  const hasWallet = !!wallet;

  React.useEffect(() => {
    if (!api.hasApiKey()) {
      setW(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    return load();
  }, [load, hasWallet, tick]);

  const afterMutation = () => {
    load();
    refreshWallet();
    refresh();
  };

  if (!api.hasApiKey()) {
    return (
      <div className={s.card}>
        <h3 className={s.cardTitle}>Your position</h3>
        <p className={s.cardDesc}>
          Everything on this page is about your keys: balances, queued and live positions, locked
          rewards. It needs an API key. Please add one under Settings to fill in this page.
        </p>
        <button
          className={`${s.btn} ${s.btnGhost}`}
          onClick={toggleSettings}
          style={{ maxWidth: 260 }}
        >
          <GearIcon /> Open Settings
        </button>
      </div>
    );
  }

  if (loading && !w) {
    return (
      <div className={s.card}>
        <div className={s.empty}>
          <Spinner /> Loading your position…
        </div>
      </div>
    );
  }

  if (!w) {
    return (
      <div className={s.card}>
        <h3 className={s.cardTitle}>Your position</h3>
        <Alert kind="error" title="Could not load wallet status">
          {typeof error === 'string'
            ? error
            : (error?.message ??
              'The request returned nothing. Check the API key and base URL under Settings.')}
          <div style={{ marginTop: '0.5rem' }}>
            <button className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={load} type="button">
              Retry
            </button>
          </div>
        </Alert>
      </div>
    );
  }

  const positions = w.positions ?? [];
  const keys = w.lenderKeys ?? [];
  const keyPages = Math.max(1, Math.ceil(keys.length / TABLE_PAGE));
  const curKeyPage = Math.min(keyPage, keyPages - 1);

  const configRows = [
    ['Automated top-ups', w.autoCollateralize ? 'on' : 'off'],
    [
      'Join budget',
      `${fmtInt(w.maxJoinsPerRun)} per run · ${fmtInt(w.ownBudgetRemaining ?? 0)} room left`,
    ],
    [
      'Max own collateral',
      `${fmtInt(w.maxOwnCollateral)} position${Number(w.maxOwnCollateral) === 1 ? '' : 's'}`,
    ],
    ['Max lender keys', fmtInt(w.maxLenderKeys)],
    [
      'Max permit per join',
      w.maxPermitPerJoinLit != null
        ? `${fmtTokenAmount(w.maxPermitPerJoinLit, 9, 2)} LIT`
        : 'unset',
    ],
  ];

  /*
   * What is committed rather than spendable.
   *
   * Every position posts the same principal, but summing the boxes is still
   * right — a resize or a protocol change would break a multiply. LIT is the
   * permit for a queued box and permit-plus-accrued-emission for a live one,
   * which is exactly what each box carries on-chain.
   */
  const lockedNanoErgs = positions.reduce((a, p) => a + big(p.principalNanoErgs), 0n);
  const lockedLit = positions.reduce(
    (a, p) => a + big(p.kind === 'LIVE' ? p.carriedLit : p.permitLit),
    0n,
  );
  // Only FREE is available. RETIRING looks idle but cannot take a position, so
  // counting it as spare would offer a join the client then refuses.
  const keysInUse = keys.filter((k) => String(k.status).toUpperCase() !== 'FREE').length;
  const freeKeys =
    w.freeLenderKeys ?? keys.filter((k) => String(k.status).toUpperCase() === 'FREE').length;
  const derivable = w.keysDerivable ?? 0;

  return (
    <>
      {/* ---- TOP: BALANCES + REWARDS ---- */}
      <div className={s.cols}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Balances</h3>
          <p className={s.cardDesc}>
            Spendable ERG at your first address, and LIT for permits. Wallet:{' '}
            <span className={s.itemId} title={w.primaryAddress}>
              {shortId(w.primaryAddress, 10, 8)}
            </span>
          </p>

          <div className={s.chips} style={{ marginTop: 0 }}>
            <span
              className={`${s.asset} ${s.assetErg}`}
              title={`${big(w.spendableNanoErgs)} nanoERG`}
            >
              <CubeGlyph />
              {fmtErgAmount(w.spendableNanoErgs, 4)} ERG
            </span>
            {/* Null when the token could not be identified — a wrong balance
                would look right, so it says so instead. */}
            <span
              className={`${s.asset} ${s.assetTok}`}
              title={
                w.litBalance == null
                  ? 'Could not identify the LIT token'
                  : `${big(w.litBalance)} base units`
              }
            >
              <CubeGlyph purple />
              {w.litBalance == null
                ? 'LIT unavailable'
                : `${fmtTokenAmount(w.litBalance, 9, 2)} LIT`}
            </span>
          </div>

          <div className={s.summary}>
            <Row label="Queued positions" value={fmtInt(w.ownPositionsQueued ?? 0)} />
            <Row
              label="Live collateral boxes"
              value={fmtInt(w.ownPositionsLive ?? 0)}
              accent={(w.ownPositionsLive ?? 0) > 0}
            />
            <Row
              label="Lender keys in use"
              value={`${fmtInt(keysInUse)} of ${fmtInt(keys.length)}`}
            />
            <Row
              label="Keys free for a join"
              value={
                derivable > 0
                  ? `${fmtInt(freeKeys)} · ${fmtInt(derivable)} more derivable`
                  : fmtInt(freeKeys)
              }
              accent={freeKeys + derivable > 0}
            />
            <Row
              label="ERG locked"
              value={`${fmtErgAmount(lockedNanoErgs, 4)} ERG`}
              accent={lockedNanoErgs > 0n}
            />
            <Row label="LIT locked" value={`${fmtTokenAmount(lockedLit, 9, 2)} LIT`} />
          </div>
        </div>

        <RewardsCard rewards={w.rewards} onChanged={afterMutation} />
      </div>

      {/* ---- SECOND ROW: CONFIG ---- */}
      <div style={{ marginTop: '1.25rem' }}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Client configuration</h3>
          <p className={s.cardDesc}>
            What the client will do on its own runs. Change these in the client&rsquo;s config.
          </p>
          <div className={s.summary} style={{ marginTop: 0 }}>
            {configRows.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      </div>

      {/* ---- THIRD ROW: POSITIONS + KEYS, side by side ---- */}
      <div className={s.cols} style={{ marginTop: '1.25rem' }}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Positions</h3>
          <p className={s.cardDesc}>
            Every box you hold. Live collateral first, then whatever is still waiting in the queue.
          </p>
          {positions.length === 0 ? (
            <div className={s.empty}>No open positions.</div>
          ) : (
            <PositionsTable positions={positions} />
          )}
        </div>

        <div className={s.card}>
          <h3 className={s.cardTitle}>Lender keys</h3>
          <p className={s.cardDesc}>
            The protocol allows one live collateral box per key. The client derives fresh keys per
            join so you never have to think about it. FREE keys are unused, ACTIVE keys currently
            hold live collateral.
          </p>

          {keys.length === 0 ? (
            <div className={s.empty}>No derived keys yet: they appear with your first join.</div>
          ) : (
            <>
              <div className={s.cmTableWrap}>
                <table className={s.cmTable}>
                  <thead>
                    <tr>
                      <th className={s.cmTh}>Key</th>
                      <th className={s.cmTh}>Status</th>
                      <th className={`${s.cmTh} ${s.cmThNum}`}>Queue position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.slice(curKeyPage * TABLE_PAGE, (curKeyPage + 1) * TABLE_PAGE).map((k) => (
                      <tr key={k.address} className={s.cmTr}>
                        <td className={`${s.cmTd} ${s.cmAddr}`} title={k.address}>
                          {shortId(k.address, 10, 8)}
                        </td>
                        <td className={s.cmTd}>
                          <StatusChip status={k.status} />
                        </td>
                        <td className={`${s.cmTd} ${s.cmNum}`}>
                          {k.position != null ? `#${fmtInt(k.position)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {keyPages > 1 && (
                <div className={s.cmPager}>
                  <span className={s.cmPagerInfo}>
                    keys {fmtInt(curKeyPage * TABLE_PAGE + 1)}–
                    {fmtInt(Math.min(keys.length, (curKeyPage + 1) * TABLE_PAGE))} of{' '}
                    {fmtInt(keys.length)}
                  </span>
                  <button
                    className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                    disabled={curKeyPage === 0}
                    onClick={() => setKeyPage((p) => Math.max(0, p - 1))}
                    type="button"
                  >
                    ← Prev
                  </button>
                  <button
                    className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                    disabled={curKeyPage + 1 >= keyPages}
                    onClick={() => setKeyPage((p) => p + 1)}
                    type="button"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
