import React, { useState, useEffect, useCallback } from 'react';
import s from './styles.module.css';
import { useDex } from './DexLayout';
import { fmtInt, fmtUnitsMin, big } from './format';
import { Alert, TxResult, Row, Spinner } from './ui';
import { decimalsOf, fmtSideFull, tokenLabel } from './pools';

/**
 * Flush the selected pool's pending fees into its vault. Any pool: a flush only moves fees already owed to its
 * providers. ERG:LIT's vault also reports what it holds back for storage rent; other vaults report their balance.
 */
export default function FlushPanel() {
  const { selected: pool, selectedVault, vault: canonicalVault, isCanonical, poolApi, refresh, tick } = useDex();
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const tx = pool?.tokenX;
  const ty = pool?.tokenY;
  const xName = tokenLabel(tx);
  const yName = tokenLabel(ty);
  const xMin = (v) => fmtUnitsMin(v, decimalsOf(tx), 6);
  const yMin = (v) => fmtUnitsMin(v, decimalsOf(ty), 6);
  // ERG:LIT's own vault read names what is payable; any other vault pays all but the seed it was created with
  const vault = isCanonical ? canonicalVault : selectedVault;

  const load = useCallback(() => {
    if (!poolApi) return;
    setLoading(true);
    poolApi
      .checkFlush()
      .then(setCheck)
      .catch(() => setCheck(null))
      .finally(() => setLoading(false));
  }, [poolApi]);

  useEffect(load, [load, tick]);

  const run = async () => {
    setFlushing(true);
    setError(null);
    setResult(null);
    try {
      const r = await poolApi.flush({
        expectedPoolBoxId: pool?.utxoId,
        expectedVaultBoxId: (selectedVault ?? canonicalVault)?.utxoId,
      });
      setResult(r);
      load();
      refresh();
    } catch (e) {
      if (e.name === 'StateChangedError') {
        setError('The pool or vault moved and nothing was sent. State reloaded; try again.');
        load();
        refresh();
      } else {
        setError(e.message);
      }
    } finally {
      setFlushing(false);
    }
  };

  const canFlush = check?.canFlush;
  // lastFlushHeight is optional: absent when the vault has never been flushed, or when the client does not
  // track it, which it does for ERG:LIT only. Render that as unknown, not as zero.
  const lastFlush = check?.lastFlushHeight ?? null;
  const blocksSince =
    check?.currentHeight != null && lastFlush != null ? check.currentHeight - lastFlush : null;

  if (!pool) return null;

  return (
    <>
      <div className={s.cols}>
        {/* ---- POOL SIDE ---- */}
        <div className={s.card}>
          <h3 className={s.cardTitle}>Pending provider fees</h3>
          <p className={s.cardDesc}>
            Every swap sets a slice of its input aside for liquidity providers. Those fees sit in the pool box until
            someone flushes them across to the vault.
          </p>

          {loading ? (
            <div className={s.empty}>
              <Spinner /> Reading pool state…
            </div>
          ) : (
            <>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{xMin(check?.pendingX)}</div>
                <div className={s.bigStatLabel}>{xName} pending</div>
              </div>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{yMin(check?.pendingY)}</div>
                <div className={s.bigStatLabel}>{yName} pending</div>
              </div>

              <div className={s.summary}>
                {isCanonical && (
                  <>
                    <Row label="Last flush" value={lastFlush != null ? `Block ${fmtInt(lastFlush)}` : 'Not recorded'} />
                    <Row label="Blocks since" value={blocksSince != null ? fmtInt(blocksSince) : '—'} />
                  </>
                )}
                <Row label="Status" value={canFlush ? 'Ready to flush' : 'Nothing pending'} accent={canFlush} />
              </div>
            </>
          )}
        </div>

        {/* ---- VAULT SIDE ---- */}
        <div className={s.card}>
          <h3 className={s.cardTitle}>Provider fee vault</h3>
          <p className={s.cardDesc}>
            The vault holds flushed fees and the accumulators they funded. A provision can only claim fees that have
            been flushed to the vault.
          </p>

          {loading || !vault ? (
            <div className={s.empty}>
              <Spinner /> Reading vault state…
            </div>
          ) : (
            <>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{xMin(vault.payableX ?? vault.balanceX)}</div>
                <div className={s.bigStatLabel}>{xName} {vault.payableX != null ? 'payable' : 'held'}</div>
              </div>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{yMin(vault.payableY ?? vault.balanceY)}</div>
                <div className={s.bigStatLabel}>{yName} {vault.payableY != null ? 'payable' : 'held'}</div>
              </div>

              <div className={s.summary}>
                <Row label="Vault balance" value={`${fmtSideFull(vault.balanceX, tx)} ${xName}`} />
                {vault.vaultMin != null && <Row label="Held for rent" value={`${fmtSideFull(vault.vaultMin, tx)} ${xName}`} />}
                {check && (
                  <>
                    <Row label="After flush" value={`${fmtSideFull(check.vaultBalanceAfterX, tx)} ${xName}`} accent={canFlush} />
                    <Row label={`After flush (${yName})`} value={`${fmtSideFull(check.vaultBalanceAfterY, ty)} ${yName}`} accent={canFlush} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---- ACCUMULATOR GAP ---- */}
      <div className={s.card} style={{ marginTop: '1.25rem' }}>
        <h3 className={s.cardTitle}>Accumulator gap</h3>
        <p className={s.cardDesc}>
          Each accumulator tracks cumulative fees per share. Both the pool and vault track them, and the difference
          represents what must be flushed.
        </p>

        {check && (
          <div className={s.accGrid}>
            {[
              ['X', check.poolAccX, check.vaultAccX],
              ['Y', check.poolAccY, check.vaultAccY],
            ].flatMap(([side, poolAcc, vaultAcc]) => [
              <div className={s.accCol} key={`${side}p`}>
                <div className={s.accLabel}>Pool acc{side}</div>
                <div className={s.accValue}>{poolAcc}</div>
              </div>,
              <div className={s.accCol} key={`${side}v`}>
                <div className={s.accLabel}>Vault acc{side}</div>
                <div className={s.accValue}>{vaultAcc}</div>
              </div>,
              <div className={s.accCol} key={`${side}g`}>
                <div className={s.accLabel}>Gap</div>
                <div className={`${s.accValue} ${s.accGap}`}>{(big(poolAcc) - big(vaultAcc)).toString()}</div>
              </div>,
            ])}
          </div>
        )}

        <button className={`${s.btn} ${s.btnDanger}`} disabled={!canFlush || flushing || loading} onClick={run} type="button">
          {flushing ? 'Flushing…' : canFlush ? 'Flush fees to vault' : 'Nothing to flush'}
        </button>

        {error && (
          <Alert kind="error" title="Flush failed">
            {error}
          </Alert>
        )}

        {result && (
          <TxResult
            title="Fees flushed to vault"
            outcome={result.outcome}
            rows={[
              [`${xName} flushed`, `${fmtSideFull(result.flushedX, tx)} ${xName}`],
              [`${yName} flushed`, `${fmtSideFull(result.flushedY, ty)} ${yName}`],
            ]}
            txId={result.txId}
          />
        )}

        <Alert kind="info">
          Flushing is permissionless and benefits every provider. Providers may claim their settled share from the
          Fees page after a flush is performed.
        </Alert>
      </div>
    </>
  );
}
