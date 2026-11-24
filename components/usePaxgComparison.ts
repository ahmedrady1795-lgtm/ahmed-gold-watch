'use client';
import {useEffect,useState} from 'react';
import type {PaxgFlow,PaxgSide} from '../lib/paxg-flow';

export function usePaxgFlow(enabled:boolean,endpoint:'/api/paxg-flow'|'/api/gold-perp-flow'='/api/paxg-flow'){
 const [flow,setFlow]=useState<PaxgFlow|null>(null);
 useEffect(()=>{
   if(!enabled){setFlow(null);return;}
   const controller=new AbortController();
   let busy=false;
   async function poll(){
     if(busy||document.hidden)return;
     busy=true;
     try{
       const r=await fetch(endpoint,{cache:'no-store',signal:controller.signal});
       const packet=r.ok?await r.json():null;
       if(!controller.signal.aborted)setFlow(packet);
     }catch{if(!controller.signal.aborted)setFlow(null);}
     finally{busy=false;}
   }
   void poll();const id=setInterval(poll,endpoint==='/api/gold-perp-flow'?3000:5000);
   return()=>{clearInterval(id);controller.abort();};
 },[enabled,endpoint]);
 return flow;
}

type Trial={target:number;issued:number;side:'BUY'|'SELL';proxy:PaxgSide;hit?:boolean};
type Candle={time:number;open:number;close:number};
export function usePaxgComparison(scope:string,trial:Trial|null,bars:readonly Candle[]){
 const [summary,setSummary]=useState('');
 useEffect(()=>{
   if(!scope){setSummary('');return;}
   const key='qannas-paxg-trials-v1:'+scope;
   try{
     const raw=JSON.parse(localStorage.getItem(key)||'[]');
     const rows:Trial[]=Array.isArray(raw)?raw.filter(r=>r&&Number.isFinite(r.target)&&
       r.issued<r.target&&(r.side==='BUY'||r.side==='SELL')):[];
     let changed=false;
     if(trial&&!rows.some(r=>r.target===trial.target)){
       rows.push(trial);if(rows.length>500)rows.shift();changed=true;
     }
     const closed=new Map(bars.map(b=>[b.time,b]));
     for(const row of rows){
       const b=closed.get(row.target);
       if(row.hit!==undefined||!b)continue;
       row.hit=row.side==='BUY'?b.close>b.open:b.close<b.open;changed=true;
     }
     if(changed)localStorage.setItem(key,JSON.stringify(rows));
     const scored=rows.filter(r=>r.hit!==undefined&&r.proxy!=='UNAVAILABLE');
     const aligned=scored.filter(r=>r.side===r.proxy);
     const ratio=(a:Trial[])=>a.filter(r=>r.hit).length+'/'+a.length;
     setSummary('قبل الافتتاح مع توفر PAXG '+ratio(scored)+' · منها بتوافق الدفتر والتنفيذ '+ratio(aligned));
   }catch{setSummary('سجل مقارنة PAXG غير متاح');}
 },[scope,trial,bars]);
 return summary;
}
