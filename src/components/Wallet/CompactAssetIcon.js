import React from 'react';
import TokenIcon from './TokenIcon';
import BondIcon from './BondIcon';
import { bondState } from '../SigmaFi/bond';
import s from './styles.module.css';

/** Provisions use a compact tile; bonds keep the SigmaFi mark and a lifecycle badge. */
export default function CompactAssetIcon({ tokenId, check, label, size = 16 }) {
  const nft = check?.nft ?? check;
  const bond = check?.bond;
  if (bond?.bondAsset && bond.verified) return <BondIcon state={bondState(bond)} size={size} badgePlacement="right" />;
  return nft?.provisionNft ? <span className={s.compactAsset} data-kind="LD" style={{ width: size, height: size, '--compact-font-size':size < 14 ? '6px' : '8px' }} aria-hidden="true">LD</span> : <TokenIcon tokenId={tokenId} label={label} size={size} />;
}
