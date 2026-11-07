import React from 'react';
import TokenIcon from './TokenIcon';
import s from './styles.module.css';
import { bondState, collateralOf } from '../SigmaFi/bond';

/** A verified bond's loan asset, with its collateral tucked into a small tray. */
export default function BondIcon({ bond, size = 34, state }) {
  const t = bond?.terms;
  const loan = t ? t.principalToken?.tokenId ?? t.repayToken ?? 'ERG' : 'BOND';
  const collateral = t ? [
    ...(collateralOf(t).collateral > 0n ? ['ERG'] : []),
    ...(t.collateralTokens ?? []).map((a) => a.tokenId),
  ] : [];
  return (
    <span className={`${s.bondIcon} ${s.bondTone}`} data-state={state ?? bondState({ bond, verified: bond?.verified })} style={{ '--bond-size': `${size}px` }} aria-hidden="true">
      <TokenIcon tokenId={loan} label={t ? undefined : 'SF'} size={size} />
      <span className={s.bondCollateral}>
        {collateral.slice(0, 2).map((id) => <TokenIcon key={id} tokenId={id} size={Math.max(10, Math.round(size * .34))} />)}
        {collateral.length > 2 ? <span>+{collateral.length - 2}</span> : !collateral.length ? <span>SF</span> : null}
      </span>
    </span>
  );
}
