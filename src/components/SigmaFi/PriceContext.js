import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import { useExtensions } from '../Extensions/ExtensionsLayout';
import { useTokens, assetName } from './tokens';
import * as api from './api';
import { buildPrices, collateralization, valueBasket, usdText, collateralRatioColor } from './pricing';
import AssetHover from '../Wallet/AssetHover';
import w from '../Wallet/styles.module.css';
import s from './styles.module.css';

const PricingContext=createContext(null);
export const usePricing=()=>useContext(PricingContext);

export function PricingProvider({children}) {
  const {tick,version,height}=useExtensions();
  const {verified}=useTokens();
  const [snapshot,setSnapshot]=useState({});
  useEffect(()=>{setSnapshot({});},[version]);
  useEffect(()=>{
    let live=true;
    Promise.allSettled([api.getOracleFeed(),api.getPricingPools()]).then(([oracle,pools])=>{
      if(live) setSnapshot({oracle:oracle.status==='fulfilled'?oracle.value:null,poolState:pools.status==='fulfilled'?pools.value:null});
    });
    return ()=>{live=false;};
  },[tick,version]);
  const pricing=useMemo(()=>({...buildPrices({oracle:snapshot.oracle,pools:snapshot.poolState?.status==='ready'?snapshot.poolState.pools:[],verified,height}),poolState:snapshot.poolState}),[snapshot,verified,height]);
  return <PricingContext.Provider value={pricing}>{children}</PricingContext.Provider>;
}

function HelpDetails({estimate,pricing,metadata,checks,tooltipId}) {
  const sources=[...(estimate?.loan.sources ?? []),...(estimate?.collateral.sources ?? [])];
  const unique=[...new Map(sources.map(p=>[p.tokenId,p])).values()];
  return <span className={`${w.hoverCard} ${s.pricingHelp}`} role="tooltip" id={tooltipId}>
    <strong>Collateral Ratio</strong>
    <span>Collateral USD value ÷ loan principal. An informational health rating with no price-based liquidation threshold. Liquidation follows the agreed maturity and contract.</span>
    <span>Pricing uses the ERG/USD oracle, assumed $1 pegs for SigUSD/USE, and the deepest checked LithosDex liquidity route. Spectrum pools are excluded.</span>
    <span>Fees, the box minimum, and unpriced assets are excluded. “≥” is a lower bound. Spot prices do not include slippage.</span>
    <span>Colors: red at 80% or below, orange at 90%, yellow at 100%, then greener at 125%, 150%, 175%, and 200%+. These are display bands, not liquidation thresholds.</span>
    {pricing?.oracle && <span>Oracle: block {pricing.oracle.current.creationHeight.toLocaleString()} · {pricing.age} blocks old{pricing.fresh?'':' · stale, excluded from ERG pricing'}.</span>}
    {!pricing?.oracle && <span>ERG/USD oracle unavailable. ERG-based values are not shown.</span>}
    {pricing?.poolState?.truncated && <span>The pool index is truncated; routes cover only the pools returned by the client.</span>}
    {unique.map(p=><span key={p.tokenId} className={s.priceSource}><span><strong>{assetName(metadata,p.tokenId,checks)}</strong>: {p.route.length?'LP route to ':''}{p.anchor}</span>{p.route.map(e=><Link key={e.poolNFT} to={`/dex?pool=${e.poolNFT}`} title={e.poolNFT}>{assetName(metadata,e.from,checks)} → {assetName(metadata,e.to,checks)} · {e.poolNFT.slice(0,6)}…</Link>)}</span>)}
    {estimate?.collateral.missing.length>0 && <span>Unpriced: {estimate.collateral.missing.map(id=>assetName(metadata,id,checks)).join(', ')}.</span>}
    {estimate?.loan.missing.length>0 && <span>The loan asset has no eligible price, so a percentage cannot be calculated.</span>}
  </span>;
}

export function HealthHelp({estimate}) {
  const pricing=usePricing(); const {metadata,checks}=useTokens();
  return <AssetHover focusable={false} className={s.healthHelpHost} details={<HelpDetails estimate={estimate} pricing={pricing} metadata={metadata} checks={checks} />}><button type="button" className={s.healthHelpButton} aria-label="About Collateral Ratio">?</button></AssetHover>;
}

export function UsdValue({tokenId,amount,nanoErgs='0',tokens=[]}) {
  const pricing=usePricing();
  const value=tokenId ? valueBasket(pricing,tokenId==='ERG'?amount:'0',tokenId==='ERG'?[]:[{tokenId,amount}]) : valueBasket(pricing,nanoErgs,tokens);
  const text=usdText(value.usd);
  return text ? <span className={s.usdValue}>{value.partial?'≥':'≈'} {text}{value.partial?' · priced assets':''}</span> : null;
}

export function CollateralHealth({t,compact=false}) {
  const pricing=usePricing(); const estimate=collateralization(t,pricing);
  return <span className={`${s.collateralHealth} ${compact?s.compactHealth:''}`} style={{'--ratio-color':collateralRatioColor(estimate.ratio)}}><span>{!compact && 'Collateral Ratio '}<HealthHelp estimate={estimate} /></span><strong>{estimate.ratio==null?'Unavailable':`${estimate.partial?'≥':'≈'} ${estimate.ratio.toLocaleString('en-US',{maximumFractionDigits:1})}%`}</strong></span>;
}
