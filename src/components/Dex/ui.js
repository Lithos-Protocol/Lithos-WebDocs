import React from 'react';
import s from './styles.module.css';
import { shortId } from './format';

export function Spinner() {
  return <span className={s.spinner} aria-label="loading" />;
}

export function Alert({ kind = 'info', title, children }) {
  const cls =
    kind === 'error'
      ? s.alertError
      : kind === 'ok'
        ? s.alertOk
        : kind === 'warn'
          ? s.alertWarn
          : s.alertInfo;
  return (
    <div className={`${s.alert} ${cls}`}>
      {title && <div className={s.alertTitle}>{title}</div>}
      {children}
    </div>
  );
}

/**
 * Marks a series the index cannot cover in full — `partial` on the history
 * endpoints. The points shown are exact; there are just fewer of them than the
 * chosen range asks for, and a chart that silently spans less than its label
 * says invites the wrong reading.
 */
export function PartialTag({
  title = 'The index does not span this whole range, the points shown are still exact',
}) {
  return (
    <span className={s.partialTag} title={title}>
      partial
    </span>
  );
}

/**
 * Banner for a submitted transaction.
 *
 * `outcome` is the node's answer. A `rejected` one never reaches here — the API
 * layer throws it as an error. `uncertain` means the node neither accepted nor
 * refused it: the transaction may still confirm, so the banner says so instead
 * of calling it done, and warns against sending again, which could spend the
 * same funds twice.
 */
export function TxResult({ title, rows, txId, outcome = 'accepted', children }) {
  const uncertain = outcome === 'uncertain';
  return (
    <Alert kind={uncertain ? 'warn' : 'ok'} title={uncertain ? `${title}, outcome uncertain` : title}>
      {uncertain && (
        <div className={s.txNote}>
          The node did not confirm it accepted this transaction. It may still go through, so check
          the transaction id before sending again: a second send could spend the same funds twice.
        </div>
      )}
      {rows?.map(([label, value]) => (
        <div key={label} className={s.row}>
          <span className={s.rowLabel}>{label}</span>
          <span className={s.rowValue}>{value}</span>
        </div>
      ))}
      {children}
      {txId && (
        <div style={{ marginTop: '0.4rem' }}>
          <div className={s.rowLabel}>Transaction</div>
          <div className={s.txId}>{txId}</div>
        </div>
      )}
    </Alert>
  );
}

export function Row({ label, value, accent = false }) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={`${s.rowValue} ${accent ? s.rowValueAccent : ''}`}>{value}</span>
    </div>
  );
}

/**
 * Mini isometric cube glyph — the mining-block motif at chip scale.
 * Cyan for ERG, purple for the pool token.
 */
export function CubeGlyph({ purple = false, size = 13 }) {
  const stroke = purple ? '#c084fc' : '#7dd3fc';
  const front = purple ? 'rgba(168,85,247,.3)' : 'rgba(56,189,248,.35)';
  const top = purple ? 'rgba(192,132,252,.45)' : 'rgba(125,211,252,.5)';
  const side = purple ? 'rgba(168,85,247,.18)' : 'rgba(56,189,248,.2)';
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <polygon points="4,7 12,7 12,15 4,15" fill={front} stroke={stroke} strokeWidth=".8" />
      <polygon points="4,7 8,3.5 16,3.5 12,7" fill={top} stroke={stroke} strokeWidth=".8" />
      <polygon points="12,7 16,3.5 16,11.5 12,15" fill={side} stroke={stroke} strokeWidth=".8" />
    </svg>
  );
}

export function AssetChip({ isErg, tokenName = 'TOKEN' }) {
  return (
    <span className={`${s.asset} ${isErg ? s.assetErg : s.assetTok}`}>
      <CubeGlyph purple={!isErg} />
      {isErg ? 'ERG' : tokenName}
    </span>
  );
}

export function IdText({ id }) {
  return (
    <span className={s.itemId} title={id}>
      {shortId(id)}
    </span>
  );
}

/**
 * Slippage chips, as fractions, for the swap form and the deposit order form.
 * One list so the two pages always offer the same choices. The upper values
 * exist for orders: a floor set too tight against a moving pool leaves the order
 * waiting instead of filling.
 */
export const SLIPPAGE_OPTIONS = [0.001, 0.005, 0.01, 0.03, 0.05, 0.07];

/**
 * The "Use orders" switch shared by the Swap and Liquidity pages.
 *
 * Presentational only; the value lives in DexLayout so both pages, and both
 * cards on the Liquidity page, always agree.
 */
export function OrderModeToggle({ checked, onChange, compact = false }) {
  return (
    <label
      className={`${s.modeToggle} ${checked ? s.modeToggleOn : ''} ${compact ? s.modeToggleCompact : ''}`}
      title={
        checked
          ? 'Placed as an order that any miner fills for the executor fee'
          : 'Sent directly, spending the pool at once'
      }
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>Use orders</span>
    </label>
  );
}

/** Gear icon for the Settings pill. */
export function GearIcon({ size = 12, color = 'currentColor' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.5 6.5l1.5 1.5M16 16l1.5 1.5M17.5 6.5L16 8M8 16l-1.5 1.5" />
    </svg>
  );
}
