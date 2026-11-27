import fs from 'node:fs/promises';
import {observeBtcOpening,btcMemoryTick,btcOpeningSummary} from '../lib/btc-opening-memory.ts';
import {mergeBtcMarketMemory,settleMarketMemory,marketMemoryReport} from '../lib/gold-market-memory.ts';
const path='/tmp/qannas-btc-opening-memory.json';
const checkpoint='https://raw.githubusercontent.com/ahmedrady1795-lgtm/ahmed-gold-watch/render-free/archive/gold-preparation-lead.json';
const base='http://127.0.0.1:'+(process.env.PORT||'10000');
let rows=[],busy=false,finished=false,chart=null,chartAt=0,chartJob=null,chartAttempt=0;
let tape={coinbase:null,kraken:null},jobs={coinbase:null,kraken:null},attempts={coinbase:0,kraken:0},previous=null;
async function atomic(){const tmp=path+'.writing-'+process.pid;await fs.writeFile(tmp,JSON.stringify(rows),{mode:0o600});await fs.rename(tmp,path);}
async function read(url){const r=await fetch(base+url,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP_'+r.status);return r.json();}
async function init(){
 let packaged=null,remote=null,local=null;
 try{packaged=JSON.parse(await fs.readFile('archive/gold-preparation-lead.json','utf8'));}catch{}
 try{const r=await fetch(checkpoint+'?restore='+Date.now(),{signal:AbortSignal.timeout(6500),cache:'no-store'});if(r.ok){const t=await r.text();if(t.length<6e6)remote=JSON.parse(t);}}catch{}
 try{local=JSON.parse(await fs.readFile(path,'utf8'));}catch{}
 rows=mergeBtcMarketMemory(Date.now(),packaged?.btcMarketMemory,remote?.btcMarketMemory,local);await atomic();
 console.info('[BTC-M5-OPEN] observer started',rows.length);
}
async function observe(){
 if(busy||finished)return;busy=true;
 try{
   const start=Date.now(),elapsed=start%300000,opening=elapsed>=210000;
   const due=rows.some(r=>r.outcome==='PENDING'&&start>=r.target+303000);
   if(!opening&&!due){previous=null;return;}
   if(opening)for(const venue of ['coinbase','kraken']){
     if(!jobs[venue]&&start-attempts[venue]>=5000){
       attempts[venue]=start;
       jobs[venue]=read('/api/orderflow?venue='+venue).then(p=>{tape[venue]=p;}).catch(()=>{}).finally(()=>{jobs[venue]=null;});
     }
   }
   if(!chartJob&&start-chartAttempt>=15000&&(!chart||start-chartAt>=25000||Math.floor(start/60000)!==Math.floor(chartAt/60000))){
     chartAttempt=start;
     chartJob=read('/api/chart-history?asset=BTC').then(p=>{
       if(p.liveReady?.bitcoin&&p.bitcoin?.fresh){chart=p.bitcoin;chartAt=Date.now();}
     }).catch(()=>{}).finally(()=>{chartJob=null;});
   }
   if(!chart||start-chartAt>45000)await chartJob;
   const now=Date.now(),fresh=chart&&now-chartAt<=45000,source=fresh?chart.candleSource:'';
   const next=settleMarketMemory(rows,now,source,fresh?chart.chartCandles:[]);
   const target=(Math.floor(now/300000)+1)*300000;
   if(fresh&&target-now<=30000&&target-now>=1000&&!next.some(r=>r.target===target)){
     const row=observeBtcOpening(now,chart,tape.coinbase,tape.kraken,previous);
     // Retain an early qualified forecast immediately; for a weak/no setup
     // give the rest of the pre-open window a chance before freezing it.
     if(row&&(row.published||target-now<=12000)){
       next.push(row);console.info('[BTC-M5-OPEN] OBSERVED',JSON.stringify(row));
     }
   }
   if(fresh&&opening){
     const p=btcMemoryTick(source,source.startsWith('Kraken')?tape.kraken:tape.coinbase,now);
     if(p&&(!previous||previous.source!==p.source||p.at>previous.at))previous=p;
   }
   if(JSON.stringify(next)!==JSON.stringify(rows)){
     for(const row of next){const old=rows.find(r=>r.target===row.target&&r.source===row.source);
       if(old?.outcome==='PENDING'&&row.outcome!=='PENDING')console.info('[BTC-M5-OPEN] SETTLED',JSON.stringify(row));}
     rows=next.slice(-2016);await atomic();
   }
 }catch(e){console.warn('[BTC-M5-OPEN] observer error',String(e?.message??e).slice(0,150));}finally{busy=false;}
}
await init();
const timer=setInterval(()=>void observe(),4000);
setTimeout(()=>void observe(),16000);
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{finished=true;clearInterval(timer);const t=setInterval(()=>{if(!busy){clearInterval(t);process.exit(0);}},100);setTimeout(()=>process.exit(0),13000).unref();});
