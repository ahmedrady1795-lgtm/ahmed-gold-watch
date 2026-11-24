'use client';
import {useEffect,useState} from 'react';
import type {BtcCrossFlow} from '../lib/btc-orderflow';
export function useBtcCrossFlow(enabled:boolean){
 const [flow,setFlow]=useState<BtcCrossFlow|null>(null);
 useEffect(()=>{
   if(!enabled){setFlow(null);return;}
   const abort=new AbortController();let busy=false;
   const poll=async()=>{
     if(busy||document.hidden)return;
     busy=true;
     try{
       const r=await fetch('/api/orderflow?venue=compare',{cache:'no-store',signal:abort.signal});
       const p=r.ok?await r.json():null;
       if(!abort.signal.aborted)setFlow(p?.actionable===false&&Array.isArray(p.venues)?p:null);
     }catch{if(!abort.signal.aborted)setFlow(null);}finally{busy=false;}
   };
   void poll();const timer=setInterval(poll,10000);
   return()=>{clearInterval(timer);abort.abort();};
 },[enabled]);
 return flow;
}
