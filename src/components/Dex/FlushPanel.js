import React, { useState, useEffect, useCallback } from 'react';
import s from './styles.module.css';
import * as api from './api';
import { useDex } from './DexLayout';
import { fmtErg, fmtToken, fmtErgMin, fmtTokenMin, fmtInt, big } from './format';
import { Alert, TxResult, Row, Spinner } from './ui';

export default function FlushPanel() {
  const { pool, vault, refresh } = useDex();
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const dec = pool?.tokenDecimals ?? 0;
  const name = pool?.tokenName ?? 'TOKEN';

  const load = useCallback(() => {
    setLoading(true);
    api
      .checkFlush()
      .then(setCheck)
      .catch(() => setCheck(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const run = async () => {
    setFlushing(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.flush({
        expectedPoolBoxId: pool?.utxoId,
        expectedVaultBoxId: vault?.utxoId,
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
  // lastFlushHeight is optional — absent when the vault has never been flushed,
  // or when the client does not track it. Render that as unknown, not as zero.
  const lastFlush = check?.lastFlushHeight ?? null;
  const blocksSince =
    check?.currentHeight != null && lastFlush != null ? check.currentHeight - lastFlush : null;

  return (
    <>
      <div className={s.cols}>
        {/* ---- POOL SIDE ---- */}
        <div className={s.card}>
          <h3 className={s.cardTitle}>Pending permanent fees</h3>
          <p className={s.cardDesc}>
            Every swap sets a slice of its input aside for liquidity providers as permanent fees.
            Those fees sit in the pool box until someone flushes them across to the vault.
          </p>

          {loading ? (
            <div className={s.empty}>
              <Spinner /> Reading pool state…
            </div>
          ) : (
            <>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{fmtErgMin(check?.pendingX, 6)}</div>
                <div className={s.bigStatLabel}>ERG permanent fees pending</div>
              </div>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{fmtTokenMin(check?.pendingY, dec, 6)}</div>
                <div className={s.bigStatLabel}>{name} pending</div>
              </div>

              <div className={s.summary}>
                <Row
                  label="Last flush"
                  value={lastFlush != null ? `Block ${fmtInt(lastFlush)}` : 'Not recorded'}
                />
                <Row label="Blocks since" value={blocksSince != null ? fmtInt(blocksSince) : '—'} />
                <Row
                  label="Status"
                  value={canFlush ? 'Ready to flush' : 'Nothing pending'}
                  accent={canFlush}
                />
              </div>
            </>
          )}
        </div>

        {/* ---- VAULT SIDE ---- */}
        <div className={s.card}>
          <h3 className={s.cardTitle}>Permanent fee vault</h3>
          <p className={s.cardDesc}>
            The vault holds flushed permanent fees and the accumulators they funded. A provision can
            only claim fees that have been flushed to the vault.
          </p>

          {loading || !vault ? (
            <div className={s.empty}>
              <Spinner /> Reading vault state…
            </div>
          ) : (
            <>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{fmtErgMin(vault.payableX, 6)}</div>
                <div className={s.bigStatLabel}>ERG payable</div>
              </div>
              <div className={s.bigStat}>
                <div className={s.bigStatValue}>{fmtTokenMin(vault.payableY, dec, 6)}</div>
                <div className={s.bigStatLabel}>{name} payable</div>
              </div>

              <div className={s.summary}>
                <Row label="Vault balance" value={`${fmtErg(vault.balanceX)} ERG`} />
                <Row label="Held for rent" value={`${fmtErg(vault.vaultMin)} ERG`} />
                {check && (
                  <>
                    <Row
                      label="After flush"
                      value={`${fmtErg(check.vaultBalanceAfterX)} ERG`}
                      accent={canFlush}
                    />
                    <Row
                      label={`After flush (${name})`}
                      value={`${fmtToken(check.vaultBalanceAfterY, dec)} ${name}`}
                      accent={canFlush}
                    />
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
          Each accumulator tracks cumulative fees per share. Both the pool and vault track them, and
          the difference represents what must be flushed.
        </p>

        {check && (
          <div className={s.accGrid}>
            <div className={s.accCol}>
              <div className={s.accLabel}>Pool accX</div>
              <div className={s.accValue}>{check.poolAccX}</div>
            </div>
            <div className={s.accCol}>
              <div className={s.accLabel}>Vault accX</div>
              <div className={s.accValue}>{check.vaultAccX}</div>
            </div>
            <div className={s.accCol}>
              <div className={s.accLabel}>Gap</div>
              <div className={`${s.accValue} ${s.accGap}`}>
                {(big(check.poolAccX) - big(check.vaultAccX)).toString()}
              </div>
            </div>
            <div className={s.accCol}>
              <div className={s.accLabel}>Pool accY</div>
              <div className={s.accValue}>{check.poolAccY}</div>
            </div>
            <div className={s.accCol}>
              <div className={s.accLabel}>Vault accY</div>
              <div className={s.accValue}>{check.vaultAccY}</div>
            </div>
            <div className={s.accCol}>
              <div className={s.accLabel}>Gap</div>
              <div className={`${s.accValue} ${s.accGap}`}>
                {(big(check.poolAccY) - big(check.vaultAccY)).toString()}
              </div>
            </div>
          </div>
        )}

        <button
          className={`${s.btn} ${s.btnDanger}`}
          disabled={!canFlush || flushing || loading}
          onClick={run}
        >
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
              ['ERG flushed', `${fmtErg(result.flushedX)} ERG`],
              [`${name} flushed`, `${fmtToken(result.flushedY, dec)} ${name}`],
            ]}
            txId={result.txId}
          />
        )}

        <Alert kind="info">
          Flushing is permissionless and benefits every provider. Providers may claim their settled
          share from the Fees page after a flush is performed.
        </Alert>
      </div>
    </>
  );
}
