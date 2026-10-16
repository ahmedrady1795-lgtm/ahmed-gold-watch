import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {cleanArchive,mergeArchives,restoredState} from '../scripts/sniper-archive.mjs';
const e={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/sniper-scorecard.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText,{exports:e});
const now=Date.parse('2026-10-12T12:00:00Z');
const record=e.startScenario({asset:'GOLD',side:'BUY',at:now-600000,modelAt:now-600000,price:100,stop:99,confidence:70,
 targets:[{stage:1,price:102,low:101.8,high:102.2,quality:75,kind:'STRUCTURAL'}]});
const snapshot={schema:1,savedAt:now-300000,sourceUpdatedAt:now-300000,records:[record]};
const finished={...record,status:'COMPLETED',lastCheckedAt:now-240000,resolvedAt:now-240000,resolvedPrice:102,firstHitAt:now-240000,
 targets:record.targets.map(t=>({...t,reachedAt:now-240000}))};
const archived=mergeArchives(snapshot,{...snapshot,savedAt:now,records:[finished]},now);
assert.equal(archived.records.length,1,'idempotent checkpoints deduplicate by purpose and id');
assert.equal(archived.records[0].status,'COMPLETED');
assert.equal(mergeArchives(archived,snapshot,now).records[0].status,'COMPLETED','older active record cannot overwrite a settled result');
assert.equal(mergeArchives(archived,{...snapshot,records:[]},now).records.length,1,'restarted empty source never erases archive');
const boot=restoredState(archived,now);
assert.equal(e.scorecard(boot.scenarios,'GOLD').targets[0].hits,1,'completed results survive cold restore');
const uncertain=restoredState(snapshot,now);
assert.equal(uncertain.scenarios[0].status,'ACTIVE','restore waits for historical evidence before scoring');
assert.equal(uncertain.scenarios[0].recoveryPending,true);
assert.equal(e.scorecard(uncertain.scenarios,'GOLD').observed,0);
assert.equal(uncertain.updatedAt,0,'restored data cannot impersonate a fresh market heartbeat');
assert.equal(uncertain.watch.GOLD.bias,null,'restored history never activates a trading direction');
const bars=Array.from({length:10},(_,i)=>({time:record.startedAt+i*60000,open:100,low:99.5,high:i===5?102.5:101,close:100}));
const recovered=e.advanceScenario(uncertain.scenarios[0],bars,now);
assert.equal(recovered.status,'COMPLETED','complete replay recovers an actual target hit');
assert.equal(recovered.resolvedAt,record.startedAt+6*60000,'outcome uses candle time, not restart time');
assert.equal(recovered.recoveryPending,false);
assert.equal(e.advanceScenario(uncertain.scenarios[0],bars.slice(4),now).status,'UNOBSERVED','missing replay coverage stays excluded');
const both=bars.map((b,i)=>i===5?{...b,low:98}:b);
assert.equal(e.advanceScenario(uncertain.scenarios[0],both,now).status,'AMBIGUOUS','restart must not invent intrabar order');
const observation={...record,purpose:'OBSERVATION'};
const isolated=restoredState({...snapshot,records:[record,observation]},now);
assert.equal(isolated.scenarios.length,1);assert.equal(isolated.watch.GOLD.records.length,1,'entry and watch ledgers stay separate');
assert.throws(()=>cleanArchive({...snapshot,records:[{...record,entry:NaN}]},now));
assert.throws(()=>cleanArchive({...snapshot,savedAt:now+100000},now));
assert.throws(()=>cleanArchive({...snapshot,records:[record,record]},now));
const stripped=cleanArchive({...snapshot,token:'must-not-export',records:[{...record,secret:'must-not-export'}]},now);
assert.ok(!('token' in stripped)&&!('secret' in stripped.records[0]),'unknown/private fields never enter persisted projection');
console.log('PASS: checkpoint preservation, restart scoring, gap exclusion, timestamp validation, purpose isolation and field allowlist');
