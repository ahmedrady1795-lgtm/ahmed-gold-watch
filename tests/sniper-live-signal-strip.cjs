const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-live-signal-strip.ts','utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{module:mod,exports:mod.exports});
const get=mod.exports.visibleSniperSignal;
const now=Date.parse('2026-11-06T17:00:00Z');
const opp={phase:'WATCH',side:'WAIT',trigger:null,invalidation:null,targets:[],
  sourceAt:null,strength:0,reason:'لا كسر مرصود',tradeEligible:false};
const prior={ready:true,side:'SELL',pressureScore:60,anchorTime:now-60000,
  reason:'ضغط بيع M1'};
const common={now,marketOpen:true,priceFresh:true,providerTransition:false,
 opportunity:opp,priority:prior};
const bias=get(common);
assert.equal(bias.kind,'BIAS');
assert.equal(bias.side,'SELL');
assert.equal(bias.trigger,null,'M1 bias never fabricates an entry');
assert.equal(bias.executionConfirmed,false);
const brk={...opp,phase:'BREAK_CONFIRMED',side:'SELL',sourceAt:now-20000,
 trigger:4040,invalidation:4050,targets:[4028],strength:69,
 reason:'كسر إغلاق M1'};
const fresh=get({...common,opportunity:brk});
assert.equal(fresh.kind,'BREAK');
assert.equal(fresh.side,'SELL');
assert.equal(fresh.trigger,4040);
assert.equal(fresh.executionConfirmed,false);
assert.equal(get({...common,opportunity:{...brk,sourceAt:now-180000}}).kind,
 'EXPIRED','old break cannot keep claiming new sell signal');
assert.equal(get({...common,opportunity:{...brk,phase:'CANCELLED'}}).side,'WAIT',
 'cancellation may never silently fall back to SELL priority');
assert.equal(get({...common,opportunity:{...brk,phase:'PREPARE'}}).kind,'PREPARE');
assert.equal(get({...common,opportunity:{...brk,phase:'TESTING'}}).kind,'TESTING');
assert.equal(get({...common,marketOpen:false}).kind,'OFFLINE');
assert.equal(get({...common,priceFresh:false}).side,'WAIT');
assert.equal(get({...common,providerTransition:true}).side,'WAIT');
assert.equal(get({...common,opportunity:{...opp,phase:'OFFLINE'}}).kind,'OFFLINE');
assert.equal(get({...common,priority:{...prior,ready:false,side:'WAIT'}}).kind,'WAIT');
const minute={issuedAt:now-25000,side:'SELL',pressure:16,weak:true,
  atr:1.15,anchorTime:now-85000,pattern:'MOMENTUM',
  directionReason:'ملاحظة من شموع مقفولة'};
assert.equal(get({...common,minute}).kind,'FORECAST');
assert.equal(get({...common,minute}).executionConfirmed,false);
assert.equal(get({...common,minute,
  opportunity:{...brk,sourceAt:now-180000}}).kind,'FORECAST');
assert.equal(get({...common,minute,
  opportunity:{...brk,phase:'CANCELLED',sourceAt:now-180000}}).kind,'FORECAST');
assert.equal(get({...common,minute:{...minute,issuedAt:now-90000},
  opportunity:{...brk,sourceAt:now-180000}}).kind,'EXPIRED');
const plan={ready:true,issuedAt:minute.issuedAt,
  expiresAt:minute.issuedAt+60000,tradeEligible:false,
  buy:{side:'BUY',trigger:4120,target:4122,stop:4115,grossRewardRisk:.4},
  sell:{side:'SELL',trigger:4100,target:4098,stop:4105,grossRewardRisk:.4}};
const watch=get({...common,minute,plan});
assert.equal(watch.kind,'FORECAST');
assert.equal(watch.side,'SELL');
assert.equal(watch.trigger,4100,'forecast links only exact M1 issued breakout');
assert.equal(watch.invalidation,4105);
assert.equal(watch.targets[0],4098);
assert.equal(watch.levelsAreWatchOnly,true);
assert.equal(watch.executionConfirmed,false);
assert.equal(get({...common,minute,plan:{...plan,issuedAt:plan.issuedAt-60000}}).trigger,
 null,'do not borrow levels from a previous minute');
assert.equal(get({...common,minute,plan:{...plan,expiresAt:now-1}}).trigger,
 null,'expired watch levels cannot appear in live card');
const buyMinute={...minute,side:'BUY'};
const buyWatch=get({...common,minute:buyMinute,plan});
assert.equal(buyWatch.trigger,4120,'watch levels must follow forecast side');
const panel=fs.readFileSync('components/SniperM15Panel.tsx','utf8');
assert.match(panel,/<SniperLiveSignalStrip /);
assert.match(panel,/minute=\{everyMinuteForecast\}/);
assert.match(panel,/plan=\{minuteWatch\}/);
assert.match(panel,/buildCandleHunter\(\{bars:m\.candles,now/);
assert.ok(panel.indexOf('<SniperLiveSignalStrip ')>
 panel.indexOf('className="sniper-m15-compact-status"'));
assert.ok(panel.indexOf('<SniperLiveSignalStrip ')<
 panel.indexOf('className="sniper-m15-chart-box"'),
 'signal must be visible above the chart, not inside collapsed details');
const css=fs.readFileSync('app/hunter-cockpit-layout.css','utf8');
assert.match(css,/\.sniper-m15-live-signal-strip/);
console.log('PASS: persistent source-gated SELL BUY WAIT card, future-only expiry and no fake broker execution');
