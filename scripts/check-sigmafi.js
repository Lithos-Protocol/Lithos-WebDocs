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
const { buildOrder, units, decimalText } = require('../src/components/SigmaFi/order');
const api = require('../src/components/SigmaFi/api');
const { collateralOf, bondState, isNftAsset } = require('../src/components/SigmaFi/bond');
const token = 'a'.repeat(64), collateral = 'b'.repeat(64);
const base = { asset: 'ERG', loanAmount: '5', repayAmount: '5.25', days: '30', schedule: 'onClose', collateralErg: '10', collateralTokens: [], fee: '.05', height: 1500000 };
async function main() {
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
    {height:null},{fee:'.049'},{loanAmount:'.0009'}, {collateralErg:'-1'}, {days:'.001'},
    {asset:token,collateralTokens:[{tokenId:token,amount:'1'}]},
    {collateralTokens:[{tokenId:collateral,amount:'1'},{tokenId:collateral,amount:'1'}]},
    {collateralTokens:[{tokenId:collateral,amount:'2'}],wallet:{nanoErgs:'20000000000',tokens:[{tokenId:collateral,amount:'1'}]}},
  ]) assert.ok(buildOrder({ ...base,...patch }).why,JSON.stringify(patch));
  assert.equal(buildOrder({ ...base,days:'0.004',schedule:'onClose' }).body,undefined);
  assert.equal(buildOrder({ ...base,days:'0.004',schedule:'fixed' }).body.maturityHeight,1500003);
  // The entered collateral excludes reserves; the wire amount includes them exactly once.
  assert.equal(order.collateralNanoErgs,'10051000000');
  assert.equal(collateralOf(order).collateral,10000000000n);
  assert.equal(collateralOf(order).fee,50000000n);
  assert.equal(collateralOf(order).minimum,1000000n);
  assert.equal(collateralOf({collateralNanoErgs:'50000000',batchingFee:'50000000'}).shortfall,true);
  assert.equal(units('0',9,true),0n);
  assert.equal(units('0',9),null);
  const nftOrder = buildOrder({...base,collateralErg:'0',collateralTokens:[{tokenId:collateral,amount:''}],nftIds:new Set([collateral])}).body;
  assert.equal(nftOrder.collateralNanoErgs,'51000000');
  assert.deepEqual(nftOrder.collateralTokens,[{tokenId:collateral,amount:'1'}]);
  assert.ok(buildOrder({...base,asset:token,nftIds:new Set([token])}).why);
  assert.ok(buildOrder({...base,wallet:{nanoErgs:'10051999999',tokens:[]}}).why);
  assert.ok(buildOrder({...base,wallet:{nanoErgs:'10052000000',tokens:[]}}).body);
  assert.ok(buildOrder({...base,collateralErg:'9223372036.854775807'}).why);
  assert.equal(isNftAsset({amount:'1',decimals:0,verified:false}),true);
  assert.equal(isNftAsset({amount:'1',decimals:0,verified:true}),false);
  assert.equal(isNftAsset({amount:'100',decimals:0}, {nft:{provisionNft:true}}),true);
  assert.equal(bondState({verified:true,bond:{status:'open'},vault:[]}), 'active');
  assert.equal(bondState({verified:true,bond:{status:'matured'},vault:[]}), 'matured');
  // A 5.25 ERG vault could be repayment or liquidation of 5.30 ERG less a 0.05 fee.
  assert.equal(bondState({verified:true,bond:null,vault:[{nanoErgs:'5250000000',tokens:[]}]}), 'settled');
  assert.equal(bondState({verified:false,bond:{status:'open'}}),'unverified');
  const calls = [];
  global.fetch = async (url, options) => { calls.push({url, ...options}); return {ok:true,status:200,text:async()=>JSON.stringify({ok:true})}; };
  await api.getOrders({offset:100,collateral,loan:token});
  assert.equal(new URL(calls.at(-1).url).pathname,'/sigmafi/orders');
  assert.equal(new URL(calls.at(-1).url).searchParams.get('collateral'),collateral);
  await api.getBonds({all:true});
  assert.equal(new URL(calls.at(-1).url).searchParams.get('all'),'true');
  await api.lookupAssets([token]);
  assert.deepEqual(JSON.parse(calls.at(-1).body),{tokenIds:[token]});
  await api.checkCreateOrder(huge);
  assert.deepEqual(JSON.parse(calls.at(-1).body),huge);
  for(const action of Object.values(api.ACTIONS)) { await action.check(token); assert.ok(calls.at(-1).url.endsWith('/check')); assert.equal(calls.at(-1).headers.api_key,undefined); }
  const before=calls.length;
  await assert.rejects(()=>api.createOrder(order),e=>e.status===401);
  assert.equal(calls.length,before);
  api.setApiKey('fixture-key');
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
  console.log('SigmaFi V2: exact amounts, request validation, principal/maturity variants, every action route, API-key gates, pagination and refresh checks passed.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
