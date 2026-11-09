/** Focused V2 wire-contract and amount regressions. Run: node scripts/check-sigmafi.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const normal = require.extensions['.js'];
require.extensions['.js'] = (mod, filename) => {
  if (!filename.startsWith(path.join(root, 'src'))) return normal(mod, filename);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-modules-commonjs'] });
  mod._compile(code, filename);
};
const storage = new Map();
global.window = { location: { hostname: 'localhost', port: '3000', origin: 'http://localhost:3000' }, localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: (k) => storage.delete(k) } };
const { buildOrder, buildFill, units, decimalText, termToBlocks } = require('../src/components/SigmaFi/order');
const { assetLookupLink, bondLookupLink, nftLookupLink } = require('../src/components/Wallet/assetLinks');
const api = require('../src/components/SigmaFi/api');
const { collateralOf, bondState, isNftAsset } = require('../src/components/SigmaFi/bond');
const { buildPrices, valueBasket, collateralization, compareHealth, tokenPriority } = require('../src/components/SigmaFi/pricing');
const token = 'a'.repeat(64), collateral = 'b'.repeat(64);
const base = { asset: 'ERG', loanAmount: '5', repayAmount: '5.25', days: '30', schedule: 'onClose', collateralErg: '10', collateralTokens: [], height: 1500000 };
async function main() {
  assert.equal(termToBlocks('1.5','blocks'),null);
  assert.equal(termToBlocks('30.0','blocks'),null);
  assert.equal(termToBlocks('1e3','blocks'),null);
  assert.equal(termToBlocks('21600','blocks'),21600);
  assert.equal(termToBlocks('30','days'),21600);
  assert.equal(termToBlocks('0.5','days'),360);
  assert.ok(buildOrder({...base,term:'30.5',termUnit:'blocks'}).why);
  assert.equal(buildOrder({...base,term:'21601',termUnit:'blocks'}).body.durationBlocks,21601);
  const registry={
    [token]:{tokenId:token,ticker:'LIT',verified:true,decimals:9},
    [collateral]:{tokenId:collateral,ticker:'SigUSD',verified:true,decimals:2},
  };
  const oracle={feed:{baseAsset:'ERG',quoteAsset:'USD',maxAgeBlocks:30},current:{priceNumerator:'2',priceDenominator:'1',creationHeight:1499998},ageBlocks:2,stale:false};
  const pool=(poolNFT,x,y,reservesX,reservesY)=>({poolNFT,tokenX:{tokenId:x},tokenY:{tokenId:y},reservesX,reservesY,verified:true,problems:[]});
  const pools=[pool('deep-erg','ERG',token,'1000000000000','10000000000000'),pool('thin-erg','ERG',token,'1000000000','1000000000'),pool('deep-usd',token,collateral,'20000000000000','500000')];
  const prices=buildPrices({oracle,pools,verified:registry,height:1500000});
  assert.equal(prices.prices.get(token).route[0].poolNFT,'deep-usd');
  assert.equal(valueBasket(prices,'0',[{tokenId:token,amount:'1000000000'}]).usd,.25);
  assert.equal(valueBasket(prices,'5000000000').usd,10);
  const terms={principalNanoErgs:'5000000000',collateralNanoErgs:'10001000000',batchingFee:'50000000',collateralTokens:[]};
  assert.equal(collateralization(terms,prices).ratio,200); // fee and box floor do not inflate collateral
  const partial=collateralization({...terms,collateralTokens:[{tokenId:'c'.repeat(64),amount:'1'}]},prices);
  assert.equal(partial.ratio,200); assert.equal(partial.partial,true);
  assert.equal(collateralization({...terms,collateralNanoErgs:'1000000',collateralTokens:[{tokenId:'c'.repeat(64),amount:'1'}]},prices).ratio,null);
  assert.equal(collateralization({...terms,principalNanoErgs:null},prices).ratio,null);
  const stale=buildPrices({oracle:{...oracle,stale:true},pools,verified:registry,height:1500000});
  assert.equal(stale.prices.has('ERG'),false);
  assert.equal(stale.prices.get(token).anchor,'SigUSD assumed $1');
  assert.equal(buildPrices({oracle,pools,verified:registry,height:1500100}).fresh,false);
  assert.equal(buildPrices({oracle,pools:pools.map(p=>({...p,problems:['unsafe']})),verified:registry,height:1500000}).prices.has(token),false);
  assert.equal(buildPrices({oracle,pools:[pool('empty','ERG',token,'0','1000')],verified:registry,height:1500000}).prices.has(token),false);
  assert.equal(tokenPriority({tokenId:token,ticker:'SigUSD',verified:false}),Infinity);
  assert.ok(tokenPriority({tokenId:token,ticker:'rsFIRO',verified:true})<Infinity);
  assert.equal(tokenPriority({tokenId:token,ticker:'SPF',verified:true}),Infinity);
  assert.ok(compareHealth({ratio:null},{ratio:100},-1)>0);
  assert.ok(compareHealth({ratio:200},{ratio:100},-1)<0);
  assert.equal(valueBasket(prices,'9223372036854775807').exact.n,9223372036854775807n);
  assert.equal(valueBasket(prices,'9223372036854775807').exact.d,500000000n);
  const rsn='d'.repeat(64);
  const multi=buildPrices({oracle,verified:{...registry,[rsn]:{tokenId:rsn,ticker:'RSN',decimals:3,verified:true}},height:1500000,pools:[
    ...pools,pool('lit-rsn',token,rsn,'10000000000000','100000000'),pool('rsn-usd',rsn,collateral,'100000000','1000000'),
  ]});
  assert.deepEqual(multi.prices.get(token).route.map(e=>e.poolNFT),['lit-rsn','rsn-usd']);
  assert.equal(valueBasket(multi,'0',[{tokenId:token,amount:'1000000000'}]).usd,1);
  assert.equal(collateralization({...terms,collateralNanoErgs:'1000000'},prices).ratio,0);
  assert.equal(collateralization({...terms,batchingFee:'90000000000'},prices).ratio,200);
  assert.equal(units('0.000000001',9),1n);
  assert.equal(units('1.0000000001',9),null);
  assert.equal(units('1e9',9),null);
  assert.equal(units('9223372036854775808',0),null);
  assert.equal(decimalText(9007199254740993n,2),'90071992547409.93');
  const order = buildOrder(base).body;
  assert.equal(order.principalNanoErgs,'5000000000');
  assert.equal(order.durationBlocks,21600);
  assert.equal(order.maturityHeight,undefined);
  assert.equal(order.principalToken,undefined);
  const fixed = buildOrder({ ...base,schedule:'fixed' }).body;
  assert.equal(fixed.maturityHeight,1521600);
  assert.equal(fixed.durationBlocks,undefined);
  const huge = buildOrder({ ...base, asset:token,loanAmount:'9007199254740993',repayAmount:'9007199254740994' }).body;
  assert.equal(huge.principalToken.amount,'9007199254740993');
  assert.equal(huge.principalNanoErgs,undefined);
  assert.equal(JSON.parse(JSON.stringify(huge)).repayment,'9007199254740994');
  assert.equal(buildOrder({ ...base, asset:token,loanAmount:'.1',repayAmount:'.2',metadata:{[token]:{decimals:2}} }).body.principalToken.amount,'10');
  for (const patch of [
    {height:null},{loanAmount:'.0009'}, {collateralErg:'-1'}, {days:'.001'},
    {asset:token,collateralTokens:[{tokenId:token,amount:'1'}]},
    {collateralTokens:[{tokenId:collateral,amount:'1'},{tokenId:collateral,amount:'1'}]},
    {collateralTokens:[{tokenId:collateral,amount:'2'}],wallet:{nanoErgs:'20000000000',tokens:[{tokenId:collateral,amount:'1'}]}},
  ]) assert.ok(buildOrder({ ...base,...patch }).why,JSON.stringify(patch));
  assert.equal(buildOrder({ ...base,days:'0.004',schedule:'onClose' }).body,undefined);
  assert.equal(buildOrder({ ...base,days:'0.004',schedule:'fixed' }).body.maturityHeight,1500003);
  // Borrower funds only collateral and the box floor. The reserve never enters an order request.
  assert.equal(order.collateralNanoErgs,'10001000000');
  assert.equal(Object.hasOwn(order,'batchingFee'),false);
  assert.equal(collateralOf(order).collateral,10000000000n);
  assert.equal(collateralOf(order).fee,0n);
  assert.equal(collateralOf(order).minimum,1000000n);
  assert.equal(collateralOf(terms).total,10051000000n);
  assert.equal(collateralOf(terms).borrower,10001000000n);
  assert.equal(collateralOf({collateralNanoErgs:'999999',batchingFee:'50000000'}).shortfall,true);
  assert.equal(collateralOf({collateralNanoErgs:'1000000',batchingFee:'90000000000'}).shortfall,false);
  assert.equal(units('0',9,true),0n);
  assert.equal(units('0',9),null);
  const nftOrder = buildOrder({...base,collateralErg:'0',collateralTokens:[{tokenId:collateral,amount:''}],nftIds:new Set([collateral])}).body;
  assert.equal(nftOrder.collateralNanoErgs,'1000000');
  assert.deepEqual(nftOrder.collateralTokens,[{tokenId:collateral,amount:'1'}]);
  assert.ok(buildOrder({...base,asset:token,nftIds:new Set([token])}).why);
  assert.ok(buildOrder({...base,wallet:{nanoErgs:'10001999999',tokens:[]}}).why);
  assert.ok(buildOrder({...base,wallet:{nanoErgs:'10002000000',tokens:[]}}).body);
  const fill = buildFill('0.123456789').body;
  assert.deepEqual(fill,{batchingFee:'123456789'});
  assert.deepEqual(buildFill('0').body,{batchingFee:'0'});
  assert.deepEqual(buildFill('.001').body,{batchingFee:'1000000'});
  for (const fee of ['', '-1', '1e3', '0.0000000001', '9223372036.854775808']) assert.ok(buildFill(fee).why);
  assert.equal(assetLookupLink(token,{bond:{bondAsset:true,verified:true}}),bondLookupLink(token));
  assert.equal(assetLookupLink(token,{provisionNft:true}),nftLookupLink(token));
  assert.equal(assetLookupLink(token,{nft:{redeemed:true}}),nftLookupLink(token));
  assert.equal(assetLookupLink(token,{name:'SigmaFi-ZC-Bond'}),null);
  assert.equal(assetLookupLink('invalid',{bond:{bondAsset:true}}),null);
  assert.ok(buildOrder({...base,collateralErg:'9223372036.854775807'}).why);
  assert.equal(isNftAsset({amount:'1',decimals:0,verified:false}),true);
  assert.equal(isNftAsset({amount:'1',decimals:0,verified:true}),false);
  assert.equal(isNftAsset({amount:'100',decimals:0}, {nft:{provisionNft:true}}),true);
  assert.equal(bondState({verified:true,bond:{status:'open'},vault:[]}), 'active');
  assert.equal(bondState({verified:true,bond:{status:'matured'},vault:[]}), 'matured');
  // A 5.25 ERG vault could be repayment or liquidation of 5.30 ERG less a 0.05 fee.
  assert.equal(bondState({verified:true,bond:null,vault:[{nanoErgs:'5250000000',tokens:[]}]}), 'settled');
  assert.equal(bondState({verified:false,bond:{status:'open'}}),'unverified');
  assert.equal(bondState({verified:true,status:'Repaid',vault:[]}), 'repaid');
  assert.equal(bondState({verified:true,status:'Liquidated',vault:[{}]}), 'liquidated');
  assert.equal(bondState({verified:true,status:'Unknown',bond:{status:'open'}}), 'unknown');
  const calls = [];
  global.fetch = async (url, options) => { calls.push({url, ...options}); return {ok:true,status:200,text:async()=>JSON.stringify({ok:true})}; };
  await api.getOrders({offset:100,collateral,loan:token});
  assert.equal(new URL(calls.at(-1).url).pathname,'/sigmafi/orders');
  assert.equal(new URL(calls.at(-1).url).searchParams.get('collateral'),collateral);
  await api.getBonds({all:true});
  assert.equal(new URL(calls.at(-1).url).searchParams.get('all'),'true');
  await api.lookupAssets([token]);
  assert.deepEqual(JSON.parse(calls.at(-1).body),{tokenIds:[token]});
  await api.getOracleFeed();
  assert.equal(new URL(calls.at(-1).url).pathname,'/oracles/erg-usd');
  assert.equal(new URL(calls.at(-1).url).searchParams.get('limit'),'0');
  assert.equal(calls.at(-1).headers.api_key,undefined);
  await api.getPricingPools();
  assert.equal(new URL(calls.at(-1).url).pathname,'/dex/pools');
  await api.checkCreateOrder(huge);
  assert.deepEqual(JSON.parse(calls.at(-1).body),huge);
  await api.checkFillOrder(token,fill);
  assert.deepEqual(JSON.parse(calls.at(-1).body),fill);
  assert.equal(calls.at(-1).headers.api_key,undefined);
  for(const action of Object.values(api.ACTIONS)) { await action.check(token); assert.ok(calls.at(-1).url.endsWith('/check')); assert.equal(calls.at(-1).headers.api_key,undefined); }
  const before=calls.length;
  await assert.rejects(()=>api.createOrder(order),e=>e.status===401);
  assert.equal(calls.length,before);
  api.setApiKey('fixture-key');
  await api.fillOrder(token,fill);
  assert.deepEqual(JSON.parse(calls.at(-1).body),fill);
  assert.equal(calls.at(-1).headers.api_key,'fixture-key');
  await api.createOrder(order);
  assert.deepEqual(JSON.parse(calls.at(-1).body),order);
  for(const action of Object.values(api.ACTIONS)) { await action.send(token); assert.equal(calls.at(-1).method,'POST'); assert.equal(calls.at(-1).headers.api_key,'fixture-key'); }
  await api.getPortfolio();
  assert.equal(calls.at(-1).headers.api_key,'fixture-key');
  assert.equal(new URL(calls.at(-1).url).pathname,'/sigmafi/portfolio');
  assert.ok(calls.every(c=>!c.url.includes('/offers')));
  assert.equal(api.getOffers,undefined);
  assert.equal(api.createOffer,undefined);
  api.setAutoRefresh(0); assert.equal(api.getAutoRefresh(),0);
  api.setAutoRefresh(30); assert.equal(api.getAutoRefresh(),30);
  const pages=await api.allPages(async({offset,limit})=>({height:1,orders:Array.from({length:limit},(_,i)=>offset+i),total:1100,truncated:false}),'orders');
  assert.equal(pages.orders.length,1000); assert.equal(pages.truncated,true);
  console.log('SigmaFi: exact amounts, block/day durations, oracle freshness, deepest liquidity routes, partial collateralization, settlement states, API routes, key gates and refresh checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
