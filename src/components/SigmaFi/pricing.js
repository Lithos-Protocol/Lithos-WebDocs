import { big } from '../Dex/format';
import { collateralOf } from './bond';

// Resolve these tickers through the client's verified registry, never through wallet-provided names.
export const PRIORITY_TICKERS = ['ERG', 'SigUSD', 'USE', 'SigRSV', 'RSN', 'rsBTC', 'rsETH', 'LIT', 'rsFIRO', 'rsADA', 'CRUX', 'CYPX', 'FAKU', 'MEOW'];
/** Visual ratio bands only; they never change a bond's liquidation rules. */
export function collateralRatioColor(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return 'var(--cur-muted)';
  if (ratio <= 80) return '#f87171';
  if (ratio <= 90) return '#fb923c';
  if (ratio < 125) return '#facc15';
  if (ratio < 150) return '#c6e746';
  if (ratio < 175) return '#95e34e';
  if (ratio < 200) return '#5ce56a';
  return '#39ef7d';
}
const rank = new Map(PRIORITY_TICKERS.map((t, i) => [t.toLowerCase(), i]));
export function tokenPriority(t) {
  return t.tokenId === 'ERG' ? 0 : t.verified ? rank.get(t.ticker?.toLowerCase()) ?? Infinity : Infinity;
}
const validDecimals = d => Number.isInteger(d) && d >= 0 && d <= 18;
const positive = n => { try { const v=BigInt(n); return v > 0n ? v : null; } catch { return null; } };
function rational(n,d) {
  let a=n, b=d;
  while(b) { const remainder=a%b; a=b; b=remainder; }
  return {n:n/a,d:d/a};
}
const add = (a,b) => rational(a.n*b.d+b.n*a.d,a.d*b.d);
function number(r) {
  const n=r.n.toString(), d=r.d.toString();
  return Number(n.slice(0,16))/Number(d.slice(0,16))*10**(Math.max(0,n.length-16)-Math.max(0,d.length-16));
}
const multiply = (r,n) => rational(r.n*n,r.d);

/** Exact base-unit spot prices. Rank routes by their weakest quote-side reserve in USD. */
export function buildPrices({ oracle, pools, verified = {}, height }) {
  const eligible = Object.values(verified).filter(t => t.verified && tokenPriority(t) < Infinity && validDecimals(t.decimals));
  const allowed = new Map(eligible.map(t=>[t.tokenId,t]));
  allowed.set('ERG',{tokenId:'ERG',ticker:'ERG',decimals:9});
  const anchors = new Map();
  const age = oracle ? Math.max(oracle.ageBlocks ?? Infinity, height != null ? height-oracle.current?.creationHeight : 0) : Infinity;
  const numerator = positive(oracle?.current?.priceNumerator), denominator = positive(oracle?.current?.priceDenominator);
  const fresh = !!(oracle && oracle.feed?.baseAsset === 'ERG' && oracle.feed?.quoteAsset === 'USD' && !oracle.stale && age <= oracle.feed.maxAgeBlocks && numerator && denominator);
  if (fresh) anchors.set('ERG',{ rate:rational(numerator,denominator*1_000_000_000n), route:[], anchor:'ERG/USD oracle', depth:Infinity });
  for (const t of eligible) if (['sigusd','use'].includes(t.ticker.toLowerCase())) {
    anchors.set(t.tokenId,{rate:rational(1n,10n**BigInt(t.decimals)),route:[],anchor:`${t.ticker} assumed $1`,depth:Infinity});
  }
  const graph = new Map();
  for (const p of pools ?? []) {
    if ((!p.verified && !p.genesisChecked) || p.problems?.length || !allowed.has(p.tokenX?.tokenId) || !allowed.has(p.tokenY?.tokenId)) continue;
    const x=positive(p.reservesX), y=positive(p.reservesY);
    if (!x || !y || p.tokenX.tokenId === p.tokenY.tokenId) continue;
    for (const edge of [
      {from:p.tokenX.tokenId,to:p.tokenY.tokenId,input:x,output:y,poolNFT:p.poolNFT},
      {from:p.tokenY.tokenId,to:p.tokenX.tokenId,input:y,output:x,poolNFT:p.poolNFT},
    ]) {
      if (!graph.has(edge.from)) graph.set(edge.from,new Map());
      const previous=graph.get(edge.from).get(edge.to);
      if (!previous || edge.output > previous.output) graph.get(edge.from).set(edge.to,edge);
    }
  }
  function routes(id, visited = new Set()) {
    if (anchors.has(id)) return [anchors.get(id)];
    if (id === 'ERG' || visited.size >= 3 || visited.has(id)) return [];
    const next = new Set([...visited,id]);
    return [...(graph.get(id)?.values() ?? [])].filter(e=>!next.has(e.to)).flatMap(e => routes(e.to,next).map(tail=>({
      rate:rational(e.output*tail.rate.n,e.input*tail.rate.d),
      route:[e,...tail.route], anchor:tail.anchor,
      depth:Math.min(number(multiply(tail.rate,e.output)),tail.depth),
    })));
  }
  const prices = new Map();
  for (const id of allowed.keys()) {
    const best=routes(id).filter(r=>r.depth>0 && Number.isFinite(number(r.rate)) && number(r.rate)>0).sort((a,b)=>b.depth-a.depth || a.route.length-b.route.length || String(a.route[0]?.poolNFT).localeCompare(String(b.route[0]?.poolNFT)))[0];
    if (best) prices.set(id,best);
  }
  return { prices, oracle, fresh, age, allowed };
}

export function valueBasket(pricing, nanoErgs = '0', tokens = []) {
  let total=rational(0n,1n), priced=0;
  const missing=[], sources=[];
  for (const a of [{tokenId:'ERG',amount:nanoErgs},...tokens]) {
    const amount=big(a.amount);
    if (amount<=0n) continue;
    const quote=pricing?.prices.get(a.tokenId);
    if (!quote) { missing.push(a.tokenId); continue; }
    total=add(total,multiply(quote.rate,amount));
    priced++;
    sources.push({tokenId:a.tokenId,...quote});
  }
  return { usd:priced || !missing.length ? number(total) : null, exact:total, partial:missing.length>0, missing, sources };
}

export function collateralization(terms, pricing) {
  const c=collateralOf(terms);
  const collateral=valueBasket(pricing,c.collateral,terms.collateralTokens ?? []);
  const loan=terms.principalToken ? valueBasket(pricing,'0',[terms.principalToken]) : valueBasket(pricing,terms.principalNanoErgs ?? '0');
  const ratio=loan.usd>0 && collateral.usd!=null ? number(rational(collateral.exact.n*loan.exact.d*100n,collateral.exact.d*loan.exact.n)) : null;
  return { ratio: Number.isFinite(ratio) ? ratio : null, partial:collateral.partial, collateral, loan };
}

export function compareHealth(a,b,direction) {
  if (a.ratio==null) return b.ratio==null ? 0 : 1;
  if (b.ratio==null) return -1;
  return direction*(a.ratio-b.ratio);
}
export const usdText = value => value == null || !Number.isFinite(value) ? null : value > 0 && value < .01 ? '<$0.01' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
