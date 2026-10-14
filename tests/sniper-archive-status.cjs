const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const out={};let reply,requests=0;
const code=ts.transpileModule(fs.readFileSync('lib/sniper-archive-status.ts','utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}
}).outputText;
vm.runInNewContext(code,{exports:out,AbortSignal,Date,fetch:async()=>{
 requests++;if(reply instanceof Error)throw reply;
 return {ok:true,text:async()=>JSON.stringify(reply)};
},require:name=>name==='node:fs'?{readFileSync:()=>{throw Error('no local checkpoint');}}:
 {ARCHIVE_URL:'https://example.test/archive',cleanArchive:x=>x}});
(async()=>{
 const now=Date.now();reply={savedAt:now-1000,records:[{},{}]};
 const first=await out.sniperArchiveStatus(now);assert.equal(first.records,2);
 await out.sniperArchiveStatus(now+1000);assert.equal(requests,1,'cache prevents polling bursts');
 reply={savedAt:now-10000,records:[{}]};
 const delayed=await out.sniperArchiveStatus(now+61000);
 assert.equal(delayed.savedAt,first.savedAt,'older CDN response cannot roll back the saved checkpoint');
 assert.equal(delayed.records,2);
 reply=Error('network unavailable');const failed=await out.sniperArchiveStatus(now+122000);
 assert.equal(failed.reachable,false);assert.equal(failed.savedAt,first.savedAt,'outage preserves last known checkpoint');
 reply={savedAt:now+150000,records:[{},{},{}]};
 const recovered=await out.sniperArchiveStatus(now+183000);
 assert.equal(recovered.reachable,true);assert.equal(recovered.records,3);
 console.log('PASS: archive cache, monotonic checkpoint, outage and recovery');
})().catch(e=>{console.error(e);process.exit(1);});
