/** Local-only UI fixtures. No proxy, signing or blockchain calls. Run: node scripts/preview-sigmafi.js */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PORT = Number(process.env.PORT || 9100);
const build = path.resolve(__dirname, '../build');
const id = (n) => n.toString(16).padStart(64, '0');
const USD = '03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04';
const RSV = '003bd19d0187117f130b62e1bcab0939929ff5c7709f843c5c4dd158949285d0';
const LIT = 'c1980d829988229516430a47a5eca376060b6ce859616db0936e78ab25cb6de7';
const FIRO='581d7df25808881b2b8b9b4e03e2f637c46a94f74a69a5da36434125bacb4e08';
const FAKU='f0cac602d618081f46db086726d3c4da53006b646b50e382989054dcf3c93bd8';
const NFT = id(900), ASSET = id(901);
const height = 1500000;
const verified = [{tokenId:USD,ticker:'SigUSD',name:'SigmaUSD',decimals:2,verified:true},{tokenId:RSV,ticker:'SigRSV',name:'SigmaRSV',decimals:0,verified:true},{tokenId:LIT,ticker:'LIT',name:'Lithos',decimals:9,verified:true},{tokenId:FIRO,ticker:'rsFIRO',name:'Rosen Firo',decimals:8,verified:true},{tokenId:FAKU,ticker:'FAKU',name:'FAKU',decimals:2,verified:true}];
const terms = (n=0) => ({kind:'zero-coupon',principalNanoErgs:n%2?'1000000':'5000000000',principalToken:n%2?{tokenId:USD,amount:String(10000+n*1000)}:null,repayment:n%2?String(10500+n*1050):'5250000000',repayToken:n%2?USD:null,collateralNanoErgs:n%2?'80000000000':'1000000000',collateralTokens:n%2?[{tokenId:RSV,amount:'10000'}]:[{tokenId:n===2?NFT:LIT,amount:n===2?'1':'5000000000000'}],durationBlocks:n%3?null:21600,maturityHeight:n%3?height+720*(7+n):null,batchingFee:'50000000',liquidation:'MaturityLiquidation',liquidationHash:id(55)});
let orders = Array.from({length:9},(_,n)=>({boxId:id(100+n),terms:terms(n),borrower:'9hPreviewBorrower',mine:n===8,refusal:n===7?'This order uses an unsupported liquidation script.':null,creationHeight:height-n*20}));
const bond = (n) => ({boxId:id(200+n),assetId:n===0?ASSET:id(901+n),terms:{...terms(n+1),durationBlocks:null,maturityHeight:height+(n===1?-30:7200)},verified:n!==2,verification:n===2?'The live bond does not match the asset’s genesis order.':null,status:n===1?'matured':'open',blocksLeft:n===1?0:7200,borrowerIsMe:n===0,creationHeight:height-3000});
let bonds = [bond(0),bond(1),bond(2)];
bonds[0].terms.collateralTokens.push({tokenId:NFT,amount:'1'},{tokenId:id(902),amount:'1'});
let mode='populated';
const calls=[];
const limits={minWindowStart:Math.floor(height/128)+2,minWindowLength:2,maxWindowLength:128,maxWindowEnd:Math.floor(height/128)+256,minNotional:'1000000000',defaultLastFillHeight:height+120,shortWindowEpochs:8,shortWindowMaxNotionalLit:'1000000000000',maxOffers:200};
const pool={poolNFT:id(777),kind:'n2t',tokenX:{tokenId:'ERG',ticker:'ERG',decimals:9},tokenY:verified[0],verified:true,unsafe:false};
const provision={tokenId:NFT,provisionNft:true,redeemed:false,pool,provision:{shares:'1000',shareOfSupply:.035,value:'1000000',claimableX:'75000000',claimableY:'12',awaitingFlush:false},amountX:'20000000000',amountY:'3500',lastClaimedHeight:height-720,refreshableHeight:height+10000,refreshBountyNanoErg:'1000000'};
const pricedPool=(n,x,y,reservesX,reservesY)=>({poolNFT:id(n),kind:x==='ERG'?'n2t':'t2t',tokenX:{tokenId:x},tokenY:{tokenId:y},reservesX,reservesY,verified:true,genesisChecked:true,problems:[]});
const pricingPools=[pricedPool(701,'ERG',LIT,'1000000000000','200000000000000'),pricedPool(702,LIT,USD,'2000000000000000','500000'),pricedPool(703,RSV,USD,'1000000','2000000'),pricedPool(704,'ERG',FIRO,'1000000000000','2000000000000'),pricedPool(705,FAKU,LIT,'100000000','1000000000000000')];
function lookupAsset(tokenId){
 const b=bonds.find(b=>b.assetId===tokenId),paid=tokenId===id(950),liquidated=tokenId===id(951),settled=paid||liquidated;
 const vault=paid?{boxId:id(960),assetId:tokenId,bondId:id(970),nanoErgs:'1000000',tokens:[{tokenId:USD,amount:'10250'}]}:{boxId:id(961),assetId:tokenId,bondId:id(971),nanoErgs:'950000000',tokens:[{tokenId:NFT,amount:'1'}]};
 return {tokenId,bondAsset:settled||!!b,verified:settled||!!b?.verified,verification:b?.verification??null,bond:b??null,vault:settled?[vault]:[],status:paid?'Repaid':liquidated?'Liquidated':!b?.verified?'Unverified':b.status==='matured'?'Matured':'Open',settlement:settled?{txId:id(paid?980:981),height:height-20,timestamp:1794000000000,bondBoxId:vault.bondId,vault,returnedCollateral:paid?{boxId:id(990),nanoErgs:'1000000000',tokens:[{tokenId:NFT,amount:'1'}]}:null,liquidationHash:liquidated?id(55):null}:null};
}
const page=(rows,key,u)=>({height,[key]:rows.slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||100)),total:rows.length,truncated:false});
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.ico':'image/x-icon','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost:'+PORT),p=u.pathname;
  if(p==='/__fixtures'){if(u.searchParams.has('mode'))mode=u.searchParams.get('mode');return json(res,{mode,calls});}
  if(p.startsWith('/assets')){
   let rel=decodeURIComponent(p.slice(7)).replace(/^\/+/,''),file=path.resolve(build,rel);
   if(file!==build&&!file.startsWith(build+path.sep))return json(res,{detail:'Invalid path'},400);
   if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
   if(!fs.existsSync(file)&&fs.existsSync(file+'.html'))file+='.html';
   if(!fs.existsSync(file)&&rel.startsWith('assets/'))file=path.resolve(build,rel.slice(7));
   if(!fs.existsSync(file))return json(res,{detail:'Preview file not found: '+rel},404);
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);return;
  }
  let text='';for await(const chunk of req)text+=chunk;
  const body=text?JSON.parse(text):null;
  calls.push({method:req.method,path:p,body,keyed:!!req.headers.api_key});
  if(mode==='error'&&p.startsWith('/sigmafi'))return json(res,{detail:'Fixture: the client is temporarily unavailable.'},503);
  if(p==='/oracles/erg-usd')return mode==='no-oracle'?json(res,{detail:'Oracle unavailable'},503):json(res,{feed:{id:'erg-usd',baseAsset:'ERG',quoteAsset:'USD',maxAgeBlocks:30},height,blockId:id(height),indexedHeight:height,current:{boxId:id(333),creationHeight:height-2,price:'2',priceNumerator:'2',priceDenominator:'1'},ageBlocks:mode==='stale'?100:2,stale:mode==='stale',history:[],limit:0,offset:0,timestampsComplete:true});
  if(p==='/dex/pools')return json(res,{status:'ready',height,pools:mode==='no-pools'?[]:pricingPools,truncated:false});
  if(p==='/wallet/tokens/verified')return json(res,{tokens:verified});
  if(p==='/wallet/balances')return req.headers.api_key?json(res,{primaryAddress:'9hPreviewWallet',nanoErgs:'250000000000',reservedNanoErgs:'0',reservedBoxes:0,tokens:[...verified.map(t=>({...t,amount:t.tokenId===LIT?'123456789000000':t.tokenId===USD?'50000':'25000'})),{tokenId:NFT,name:`LD-NFT-${NFT.slice(0,6)}`,amount:'1',decimals:0,verified:false},...[ASSET,id(902),id(950),id(951)].map(tokenId=>({tokenId,name:`SigmaFi-ZC-Bond-${tokenId.slice(0,6)}`,amount:'1',decimals:0,verified:false}))]}):json(res,{detail:'Fixture API key required'},403);
  if(p==='/wallet/rewards')return json(res,{boxes:0,unlockedBoxes:0,unlockedNanoErgs:'0',lockedNanoErgs:'0',nanoErgs:'0'});
  if(p==='/dex/provisions/nft')return json(res,{nfts:body.tokenIds.map(tokenId=>tokenId===NFT?provision:{tokenId,provisionNft:false,redeemed:false})});
  if(p==='/sigmafi/assets')return json(res,body.tokenIds.map(lookupAsset));
  if(p==='/sigmafi/bonds')return json(res,page(mode==='empty'?[]:bonds.filter(b=>u.searchParams.get('all')==='true'||b.verified),'bonds',u));
  if(p==='/sigmafi/portfolio')return req.headers.api_key?json(res,{height,orders:mode==='empty'?[]:orders.filter(o=>o.mine),borrowing:mode==='empty'?[]:[bonds[0]],lending:mode==='empty'?[]:[{assetId:ASSET,bond:bonds[0],vault:[],claimable:false},{assetId:bonds[1].assetId,bond:bonds[1],vault:[],claimable:false},...[id(950),id(951)].map(assetId=>({assetId,bond:null,vault:lookupAsset(assetId).vault,claimable:true}))],truncated:false}):json(res,{detail:'Fixture API key required'},403);
  if(p==='/sigmafi/orders'&&req.method==='GET')return json(res,page(mode==='empty'?[]:orders,'orders',u));
  if(p.startsWith('/sigmafi/')&&req.method==='POST'){
   const check=p.endsWith('/check');
   const creates=p==='/sigmafi/orders'||p==='/sigmafi/orders/check';
   const boxId=p.split('/')[3],row=orders.find(o=>o.boxId===boxId),b=bonds.find(b=>b.boxId===boxId);
   if(check){
    if(row?.refusal&&p.includes('/fill'))return json(res,{detail:row.refusal},422);
    const t=creates?{...body,kind:'zero-coupon',principalNanoErgs:body.principalNanoErgs??'1000000',principalToken:body.principalToken??null,repayToken:body.principalToken?.tokenId??null,maturityHeight:body.maturityHeight??null,durationBlocks:body.durationBlocks??null}:row?.terms??b?.terms??null;
    return json(res,{action:creates?'createOrder':p.split('/').at(-2),boxId:creates?null:boxId,terms:t,paysNanoErgs:creates?(BigInt(body.collateralNanoErgs)+1000000n).toString():row?.terms.principalNanoErgs??'1000000',paysTokens:creates?body.collateralTokens??[]:row?.terms.principalToken?[row.terms.principalToken]:[],receivesNanoErgs:'0',receivesTokens:p.includes('/fill')?[{tokenId:boxId,amount:'1'}]:[],feeNanoErgs:'1000000',notes:['Local preview only. This fixture never signs or broadcasts.'],warnings:[]});
   }
   if(!req.headers.api_key)return json(res,{detail:'Fixture API key required'},403);
   if(creates)orders.unshift({boxId:id(500+orders.length),terms:{...body,kind:'zero-coupon',repayToken:body.principalToken?.tokenId??null},mine:true,refusal:null,creationHeight:height});
   return json(res,{txId:id(999),outcome:'accepted',boxId:id(500),assetId:p.includes('/fill')?boxId:null});
  }
  if(p==='/forwards/accumulator')return json(res,{height,deployed:true,boxId:id(88),currentEpoch:Math.floor(height/128),blocksLeftInEpoch:32,currentDifficulty:'120000000000000',lastEpoch:Math.floor(height/128)-1,limits,recent:[],nextDifficulty:{epoch:Math.floor(height/128)+1,difficulty:'124000000000000',change:.033,exact:false}});
  if(p==='/forwards/market')return json(res,{height,waiting:2,inWindow:3,settleable:1,refundable:0,positions:6,openInterest:'12000000000000',epochsFunded:128,longs:{offers:3,notional:'2500000000000'},shorts:{offers:2,notional:'1800000000000'},truncated:false});
  if(p==='/forwards/offers')return json(res,{height,currentEpoch:Math.floor(height/128),offers:[],total:0,truncated:false});
  if(p==='/stats/mining/difficulty')return json(res,{epochs:Array.from({length:128},(_,i)=>({index:Math.floor(height/128)-128+i,difficulty:String(110000000000000+Math.round(Math.sin(i/8)*12000000000000))})),previous:null});
  return json(res,{detail:'No fixture for '+p},404);
 }catch(e){console.error(e);json(res,{detail:e.message},500);}
}).listen(PORT,'127.0.0.1',()=>console.log(`Fixture preview: http://localhost:${PORT}/assets/extensions/sigmafi (no blockchain connection)`));
