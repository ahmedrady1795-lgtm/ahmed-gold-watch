import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decideGoldDemoSniperSignal,goldDemoSniperWire} from '../lib/mt5-gold-demo-sniper-wire.ts';

const ea=fs.readFileSync('public/downloads/AlQannas_Candle_Chaser_Gold_M1_Demo.mq5','utf8');
const endpoint=fs.readFileSync('app/api/mt5/gold-demo-chaser-signal/route.ts','utf8');
const now=Date.UTC(2026,10,9,18,0,0);
const valid={
  ok:true,ready:true,demoOnly:true,liveOrderAllowed:false,authority:'AMBUSH',
  checkedAt:now,expiresAt:now+2200,
  quote:{bid:4100.00,ask:4100.25,price:4100.125,source:'Exness/MT5 · broker'},
  ambush:{active:true,side:'BUY',confidence:82,
    plan:{authority:'AMBUSH',status:'EXECUTE',side:'BUY',
      entry:{ready:true},invalidation:{cancel:false}},
    trade:{authority:'AMBUSH',side:'buy',entry:4100.125,sl:4098.4,tp:4102.2}}
};
const yes=decideGoldDemoSniperSignal(valid,now,'XAUUSDm');
assert.equal(yes.ready,true);
assert.match(goldDemoSniperWire(yes),/^QGOLD1\|BUY\|XAUUSDm\|/);
assert.deepEqual(decideGoldDemoSniperSignal(valid,now,'BTCUSDm'),
  {ready:false,reason:'BROKER_SYMBOL_MISMATCH'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,demoOnly:false},now,'XAUUSDm'),
  {ready:false,reason:'SNIPER_DEMO_AUTHORITY_MISSING'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,liveOrderAllowed:true},now,'XAUUSDm'),
  {ready:false,reason:'SNIPER_DEMO_AUTHORITY_MISSING'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,checkedAt:now-7000},now,'XAUUSDm'),
  {ready:false,reason:'SNIPER_SIGNAL_STALE'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,expiresAt:now-1},now,'XAUUSDm'),
  {ready:false,reason:'SNIPER_SIGNAL_STALE'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,quote:{...valid.quote,source:'third-party'}},now,'XAUUSDm'),
  {ready:false,reason:'NOT_VERIFIED_EXNESS_QUOTE'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,ambush:{...valid.ambush,active:false}},now,'XAUUSDm'),
  {ready:false,reason:'AMBUSH_NOT_EXECUTABLE'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,ambush:{...valid.ambush,plan:{...valid.ambush.plan,status:'ARMED'}}},now,'XAUUSDm'),
  {ready:false,reason:'AMBUSH_NOT_EXECUTABLE'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,ambush:{...valid.ambush,plan:{...valid.ambush.plan,side:'SELL'}}},now,'XAUUSDm'),
  {ready:false,reason:'AMBUSH_SIDE_CONFLICT'});
assert.deepEqual(decideGoldDemoSniperSignal({...valid,ambush:{...valid.ambush,trade:{...valid.ambush.trade,entry:4000}}},now,'XAUUSDm'),
  {ready:false,reason:'SNIPER_PRICE_NOT_CURRENT'});
assert.equal(goldDemoSniperWire({ready:false,reason:'NO_SIGNAL'}),'QGOLD1|WAIT|NO_SIGNAL\n');

assert.match(endpoint,/getMt5BridgeStatus\(now\)/);
assert.match(endpoint,/broker\.fresh/);
assert.match(endpoint,/broker\.candlesFresh/);
assert.match(endpoint,/broker\.status\?\.symbol!=='XAUUSDm'/);
assert.match(endpoint,/equalSecret\(auth\.slice\(7\),token\)/);
assert.match(endpoint,/readGoldAmbushDemo\(request\)/);
assert.doesNotMatch(endpoint,/trade\.Buy\(|OrderSend\(/);
assert.match(ea,/#property version "1\.07"/);
assert.match(ea,/InpUseSniperAnalysis\s*= true/);
assert.match(ea,/StringLen\(InpSniperBridgeToken\)<32/);
assert.match(ea,/g_sniperExpiresAtMs<=nowMs/);
assert.match(ea,/if\(InpUseSniperAnalysis\)/);
assert.match(ea,/InpEnableDailyStop\s*= false/);
assert.match(ea,/if\(!IsDemo\(\)\)/);
console.log('PASS: Qannas GOLD AMBUSH authority, HTTPS token, broker source freshness, anti-replay, demo-only and protected STOP integration (not MQL compilation).');
