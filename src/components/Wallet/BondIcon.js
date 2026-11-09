import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import s from './styles.module.css';
import { bondState } from '../SigmaFi/bond';

/** Every SigmaFi bond uses the dark mark; the badge keeps its lifecycle color. */
export default function BondIcon({ bond, size = 34, state, badge = true, badgePlacement = 'corner' }) {
  const lifecycle = state ?? bondState({ bond, verified: bond?.verified });
  const src = useBaseUrl('/img/sigmafi/bond-dark.svg');
  const beside = badge && badgePlacement === 'right';
  const markSize = badge && !beside ? size + 2 : size;
  return (
    <span className={`${s.bondIcon} ${s.bondTone} ${!badge ? s.bondIconPlain : ''} ${beside ? s.bondIconBeside : ''}`} data-state={lifecycle} style={{ '--bond-size': `${size}px`, '--bond-badge-font': beside ? `${Math.max(8, Math.round(size * .42))}px` : size < 26 ? '6px' : '7px' }} aria-hidden="true">
      <img src={src} width={markSize} height={markSize} alt="" />
      {badge && <span className={s.bondBadge}>ZC</span>}
    </span>
  );
}
