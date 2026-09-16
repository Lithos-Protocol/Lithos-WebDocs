/**
 * Shared UI primitives for the Collateral Market panel.
 *
 * Re-exported from the Dex so both sections stay pixel-identical; the Dex css
 * module these components bind to ships with them. Collateral-specific pieces
 * live in this folder's styles.module.css under `cm`-prefixed class names.
 */
import React from 'react';
import s from './styles.module.css';

export {
  Spinner,
  Alert,
  PartialTag,
  TxResult,
  Row,
  CubeGlyph,
  AssetChip,
  IdText,
  GearIcon,
} from '../Dex/ui';

/**
 * Says why none of the squares are highlighted yet.
 *
 * Both grids colour the reader's own boxes, and without a key none of them can
 * be — which is indistinguishable from genuinely owning nothing. Shown only
 * while the key is missing, so it disappears the moment the distinction stops
 * mattering.
 */
export function KeyHintPill() {
  return (
    <span
      className={s.cmKeyHint}
      title="Add an API key under Settings and your own boxes will be highlighted here"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        aria-hidden="true"
      >
        <rect x="4" y="10.5" width="16" height="10" rx="2" />
        <path d="M8 10.5V7a4 4 0 018 0v3.5" />
      </svg>
      Your positions will be displayed when an API key is active
    </span>
  );
}
