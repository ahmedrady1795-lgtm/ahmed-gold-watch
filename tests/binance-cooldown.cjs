const assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/binance-cooldown.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports:out});
const now=Date.parse('2026-10-22T00:00:00Z');
assert.equal(out.spotBackoffMs(418,'120',now),120000);
assert.equal(out.spotBackoffMs(429,'2',now),2000);
assert.equal(out.spotBackoffMs(418,'invalid',now),600000);
assert.equal(out.spotBackoffMs(429,null,now),90000);
assert.equal(out.spotBackoffMs(200,'120',now),0);
assert.equal(out.spotBackoffMs(418,new Date(now+300000).toUTCString(),now),300000);
assert.equal(out.spotBackoffMs(418,'99999999',now),259200000);
const src=fs.readFileSync('app/api/spot-radar/route.ts','utf8');
assert.ok(src.includes('binanceBlockedUntil'),'API must preserve cooling interval across requests');
assert.ok(src.includes('spotBackoffMs'),'API must respect Retry-After');
assert.ok(src.includes("status:'binance_cooldown'"),'UI must receive explicit cooldown status');
console.log('PASS: Binance 418/429 retry-after backoff and no repeat IP probes');
