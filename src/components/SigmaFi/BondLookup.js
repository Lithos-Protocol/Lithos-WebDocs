import React, { useEffect } from 'react';
import * as api from './api';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { useTokens } from './tokens';
import useTokenLookup from '../Wallet/useTokenLookup';
import AssetLookupForm from '../Wallet/AssetLookupForm';
import { BondStats } from '../Wallet/AssetDetails';
import BondIcon from '../Wallet/BondIcon';
import { CopyButton } from '../Wallet/ui';
import { Alert, Spinner } from '../Dex/ui';
import { CollateralHealth } from './PriceContext';
import { bondState, BOND_STATE_LABEL } from './bond';
import s from './styles.module.css';
import w from '../Wallet/styles.module.css';

const readBond = async (id) => {
  const assets = await api.lookupAssets([id]);
  const asset = assets.find((a) => a.tokenId === id);
  if (!asset) throw new Error('The client returned no lookup result. Try again.');
  return asset;
};

export default function BondLookup() {
  const { version, tick } = useExtensions();
  const { metadata, checks, check } = useTokens();
  const lookup = useTokenLookup(readBond, `${version}:${tick}`);
  const b = lookup.answer;
  useEffect(() => {
    if (!b) return;
    check([
      ...(b.bond?.terms?.collateralTokens ?? []),
      ...(b.settlement?.returnedCollateral?.tokens ?? []),
      ...(b.settlement?.vault?.tokens ?? []),
      ...(b.vault ?? []).flatMap((v) => v.tokens ?? []),
    ].map((a) => a.tokenId));
  }, [b, check]);
  const state = bondState(b);
  return <>
    <div className={s.marketHead}><div><h2 className={s.sectionHeading}>Search a bond</h2><p className={s.intro}>Inspect its collateral, repayment and settlement. Follow collateral assets to explore the bonds or provisions behind them.</p></div></div>
    <section className={s.lookupCard}>
      <AssetLookupForm lookup={lookup} label="Bond token ID" />
      <p className={s.hint}>Enter the bond asset’s token ID to inspect it through your client. No API key is needed.</p>
      {lookup.busy && <p className={s.hint}><Spinner /> Reading bond evidence</p>}
      {lookup.error && <Alert kind="error" title="Bond lookup unavailable">{lookup.error}</Alert>}
      {b && <div className={w.lookupStats}>
        {b.bondAsset ? <>
          <div className={s.loanTop}><span className={s.bondHeading}>{b.verified && <BondIcon state={state} size={30} />}SigmaFi Bond</span><span className={`${s.stateBadge} ${w.bondTone}`} data-state={state}>{BOND_STATE_LABEL[state]}</span></div>
          <BondStats b={b} metadata={metadata} checks={checks} />
          {b.bond && <CollateralHealth t={b.bond.terms} />}
        </> : <Alert kind="warn" title="Bond origin not verified">{b.verification ?? 'The client could not establish that a SigmaFi order minted this token.'}</Alert>}
        <div className={w.lookupId}><span>{lookup.tokenId}</span><CopyButton text={lookup.tokenId} title="Copy bond token ID" /></div>
      </div>}
    </section>
  </>;
}
