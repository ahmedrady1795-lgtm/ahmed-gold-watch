'use client';
import {useEffect,useRef,useState} from 'react';
import type {GoldOpeningCall} from '../lib/gold-opening-call';
import {advanceDisplayObservation,startDisplayObservation,type DisplayObservation} from '../lib/gold-display-observation';

const key='qannas-gold-visible-openings-v1';
export function useGoldDisplayObservations(call:GoldOpeningCall|null,quote:any,now:number){
  const marker=useRef<HTMLDivElement>(null);
  const [chartLabel,setChartLabel]=useState<SVGTextElement|null>(null);
  const latestQuote=useRef(quote);
  useEffect(()=>{latestQuote.current=quote;},[quote]);
  const [rows,setRows]=useState<DisplayObservation[]>([]);
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    try{
      const data=JSON.parse(localStorage.getItem(key)||'[]');
      if(Array.isArray(data))setRows(data.slice(-144).filter(r=>r&&Number.isFinite(r.shown)&&Number.isFinite(r.target))
        .map(r=>r.outcome==='قيد الرصد'?{...r,outcome:'غير محسومة'}:r));
    }catch{}
    setLoaded(true);
  },[]);
  useEffect(()=>{
    if(loaded)try{localStorage.setItem(key,JSON.stringify(rows));}catch{}
  },[loaded,rows]);
  useEffect(()=>{
    const elements=[marker.current,chartLabel].filter((el):el is HTMLDivElement|SVGTextElement=>el!==null);
    if(!loaded||!elements.length||!call)return;
    const observe=new IntersectionObserver(entries=>{
      const shown=Date.now();
      if(!entries.some(e=>e.isIntersecting)||document.hidden||shown<call.issued||shown>=call.target+300000)return;
      const row=startDisplayObservation(call,shown,latestQuote.current);
      setRows(old=>old.some(r=>r.target===row.target&&r.issued===row.issued)?old:[...old.slice(-143),row]);
    });
    const resume=()=>{for(const el of elements){observe.unobserve(el);if(!document.hidden)observe.observe(el);}};
    resume();document.addEventListener('visibilitychange',resume);
    return ()=>{observe.disconnect();document.removeEventListener('visibilitychange',resume);};
  },[call,loaded,chartLabel]);
  useEffect(()=>{
    if(!loaded)return;
    setRows(old=>{
      const next=old.map(r=>advanceDisplayObservation(r,Date.now(),document.hidden?null:quote));
      return next.some((r,i)=>r!==old[i])?next:old;
    });
  },[loaded,now,quote]);
  return {marker,setChartLabel,rows};
}
