const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
let now=Date.parse('2026-11-24T19:30:00Z'),calls=[],failBinance=false;
class Clock extends Date{static now(){return now;}}
const book={bids:Array.from({length:5},(_,i)=>[100-i,4]),asks:Array.from({length:5},(_,i)=>[101+i,1])};
const ctx=vm.createContext({Date:Clock,URL,AbortSignal,Response,console,fetch:async(url)=>{
 calls.push(String(url));const binance=String(url).includes('binance.vision');
 const depth=/depth\?|Depth\?/.test(String(url));
 if(binance&&failBinance)return {ok:false,status:429,headers:{get:()=> '90'}};
 const data=binance?(depth?book:Array.from({length:6},(_,i)=>({a:i,p:'100',q:'1',T:now-i*1000,m:false}))):
 {error:[],result:{PAXGUSD:depth?book:Array.from({length:6},(_,i)=>['100','1',(now-i*1000)/1000,'s','m','',String(i)])}};
 return {ok:true,status:200,headers:{get:k=>k==='date'?new Date(now).toUTCString():null},json:async()=>data};
}});
const modules={};
function load(file){if(modules[file])return modules[file];const ex={};modules[file]=ex;
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInContext('(function(exports,require){'+js+'\n})',ctx)(ex,id=>load(path.normalize(path.join(path.dirname(file),id+'.ts'))));return ex;}
(async()=>{
 const {GET}=load('app/api/paxg-flow/route.ts');
 const responses=await Promise.all([GET(),GET(),GET()]);
 const first=await responses[0].json();
 assert.equal(calls.length,4,'one concurrent request per venue endpoint');
 assert.equal(first.venueSamples.length,2);
 assert.equal(first.venueSamples[0].source,'Binance PAXG/USDT proxy');
 assert.equal(first.venueSamples[1].source,'Kraken PAXG/USD proxy');
 assert.equal(first.venueSamples[0].tradeDeltaPct,100);
 assert.equal(first.venueSamples[1].tradeDeltaPct,-100);
 assert.equal(first.venueSamples[0].executionHistory.count,6);
 now+=1000;await GET();assert.equal(calls.length,4,'cache shared across viewers');
 now+=5000;failBinance=true;
 const second=await (await GET()).json();assert.equal(second.venueSamples.length,1);assert.match(second.source,/Kraken/);
 assert.equal(calls.length,8);
 now+=6000;await GET();assert.equal(calls.length,10,'Binance retry-after does not stop Kraken');
 console.log('PASS real route: dual venues, concurrent cache, separate deltas and independent cooldown');
})().catch(e=>{console.error(e);process.exitCode=1;});
