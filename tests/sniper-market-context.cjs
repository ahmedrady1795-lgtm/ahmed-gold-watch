const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const load=path=>{const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,
 {module:mod,exports:mod.exports});return mod.exports;};
const {assessSniperMarketContext:context}=load('lib/sniper-market-context.ts');
const {parseSentiment:parse}=load('lib/market-sentiment.ts');
const {advanceEarlySetup:step,earlySetupOpportunity:signal}=load('lib/sniper-early-setup.ts');
const now=Date.parse('2026-11-17T10:00:00Z')+1000;
const n={ok:true,asset:'GOLD',checkedAt:now-1000,directional:true,surprise:1,
 side:'BUY',risk:90,phase:'RELEASED',event:{time:now-60000}};
const input={now,asset:'GOLD',news:n,newsReady:true,newsObservedAt:now-1000};
assert.equal(context(input).newsSide,'BUY');
assert.equal(context({...input,news:{...n,event:{time:now+60000},phase:'PRE_EVENT'}}).newsSide,'WAIT');
assert.equal(context({...input,news:{...n,surprise:null}}).newsSide,'WAIT');
assert.equal(context({...input,newsObservedAt:now-200000}).newsSide,'WAIT');
assert.equal(context({...input,news:{...n,asset:'BTC'}}).newsSide,'WAIT');
assert.equal(context({...input,sentiment:{asset:'BTC',kind:'CRYPTO_FEAR_GREED',available:true,value:10,asOf:now-1000}}).stress,false);
assert.equal(parse('GOLD','<html>rate limited</html>',now).available,false);
const csv='DATE,OPEN,HIGH,LOW,CLOSE\n11/16/2026,24,27,24,26\n11/17/2026,99,99,99,99';
const vix=parse('GOLD',csv,now);
assert.equal(vix.value,26,'future session close is never used');
assert.equal(context({...input,sentiment:vix}).stress,true);
assert.equal(parse('BTC',{data:[{value:'12',timestamp:(now-3600000)/1000}]},now).available,true);
assert.equal(parse('BTC',{data:[{value:'',timestamp:now/1000}]},now).available,false);
assert.equal(parse('BTC',{data:[{value:'12',timestamp:(now-40*3600000)/1000}]},now).available,false);
const bars=Array.from({length:18},(_,i)=>({time:now-1000-(18-i)*60000,open:100,close:100,high:100.5,low:99.5}));
for(let i=14;i<17;i++)bars[i]={...bars[i],open:99.4,close:99.4,high:99.7,low:99.3};
bars[17]={...bars[17],open:99.25,close:99.45,high:99.6,low:99.05};
const idle={phase:'WATCH',side:'WAIT',trigger:null,invalidation:null,sourceAt:null,targets:[]};
const base={prior:null,scope:'GOLD:venue',now,price:99.45,ready:true,bars,opportunity:idle,
 lean:{side:'WAIT'},m1Side:'BUY',m15Side:'BUY'};
const profile={ready:false,side:'WAIT',profileReady:true,profileBasis:'QUOTE_UPDATES',
 quality:'INDICATIVE_BROKER',asOf:now-1000,observedAt:now-500,poc:100.2,val:99.2,vah:100.8};
const plan=step({...base,flow:profile});
assert.equal(plan.setupKind,'PROFILE');assert.equal(plan.phase,'ARMED');
assert.equal(plan.side,'BUY');assert.equal(plan.flowAligned,false,'quotes cannot masquerade as executed order flow');
assert.ok(plan.trigger>base.price);assert.ok(plan.targets.includes(profile.poc));
assert.notEqual(step({...base,flow:{...profile,asOf:now-20000}})?.setupKind,'PROFILE');
assert.notEqual(step({...base,flow:{...profile,observedAt:now+1}})?.setupKind,'PROFILE');
const mirrored=bars.map(b=>({...b,open:200-b.open,close:200-b.close,high:200-b.low,low:200-b.high}));
const sell=step({...base,bars:mirrored,price:200-base.price,m1Side:'SELL',m15Side:'SELL',
 flow:{...profile,poc:99.8,val:99.2,vah:100.8}});
assert.equal(sell.setupKind,'PROFILE');assert.equal(sell.side,'SELL');
const without=step({...base,flow:profile});
const opposed=step({...base,flow:profile,marketContext:{newsSide:'SELL',newsRisk:90,stress:true,asOf:now,reason:'news context'}});
assert.equal(opposed.phase,'ARMED','news stress does not stop the analysis');
assert.equal(opposed.trigger,without.trigger,'context never moves the frozen entry');
const fakeNewsOnly=step({...base,bars:bars.slice(0,17).concat({...bars[16],time:bars[17].time}),
 marketContext:{newsSide:'BUY',newsRisk:0,stress:false,asOf:now,reason:'news'}});
assert.equal(fakeNewsOnly,null,'news alone cannot fabricate a price setup');
const eligible={...plan,phase:'TRIGGERED',trendSide:'WAIT',localStructureAligned:true,score:6,
 priceAt:100,invalidation:99,atr:1,targets:[102]};
assert.equal(signal(eligible).quality,'SETUP','strong independent local structure can qualify with neutral M15');
assert.notEqual(signal({...eligible,localStructureAligned:false}).quality,'SETUP');
assert.notEqual(signal({...eligible,trendSide:'SELL'}).quality,'SETUP','explicit contrary M15 is still reported');
console.log('PASS context: stale/future/cross-asset rejection, no news gate, profile BUY/SELL and neutral-M15 local evidence');
