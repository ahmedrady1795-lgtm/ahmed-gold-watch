import fs from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type H='M1'|'M3'|'M5';
type Outcome='HIT'|'FAIL'|'NEUTRAL';
type Stat={hits:number;fails:number;neutral:number;updatedAt:number};
type Pending={id:string;horizon:H;at:number;dueAt:number;side:'BUY'|'SELL';confidence:number;entry:number;barrier:number};
type Recent=Pending&{settledAt:number;exit:number;outcome:Outcome;signedMove:number};
type AssetState={stats:Record<H,Stat>;pending:Pending[];recent:Recent[];lastBucket:Record<H,number>};
type Store={version:string;assets:Record<string,AssetState>};

const FILE='/data/horizon-brain-learning.json';
const FALLBACK='/tmp/horizon-brain-learning.json';
const VERSION='horizon-brain-learning-v1';
const HORIZONS:H[]=['M1','M3','M5'];
const MS:Record<H,number>={M1:60000,M3:180000,M5:300000};
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const blankStat=():Stat=>({hits:0,fails:0,neutral:0,updatedAt:0});
let cache:Store|null=null,dirty=false,lastSave=0;

function blankAsset():AssetState{
  return {
    stats:{M1:blankStat(),M3:blankStat(),M5:blankStat()},
    pending:[],recent:[],lastBucket:{M1:0,M3:0,M5:0}
  };
}
function load():Store{
  if(cache)return cache;
  for(const f of [FILE,FALLBACK]){
    try{
      const j=JSON.parse(fs.readFileSync(f,'utf8'));
      if(j?.version===VERSION&&j?.assets){cache=j;return j;}
    }catch{}
  }
  cache={version:VERSION,assets:{}};return cache;
}
function file(){
  try{if(fs.existsSync(path.dirname(FILE)))return FILE;}catch{}
  return FALLBACK;
}
function save(force=false){
  if(!cache||!dirty)return;
  const now=Date.now();if(!force&&now-lastSave<3000)return;
  try{
    const f=file(),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(cache));fs.renameSync(tmp,f);
    dirty=false;lastSave=now;
  }catch{}
}
function ensure(asset:string){
  const s=load(),k=String(asset||'ASSET').toUpperCase();
  s.assets[k] ||= blankAsset();
  const a=s.assets[k];
  a.stats ||= {M1:blankStat(),M3:blankStat(),M5:blankStat()};
  for(const h of HORIZONS)a.stats[h] ||= blankStat();
  a.pending ||= [];a.recent ||= [];a.lastBucket ||= {M1:0,M3:0,M5:0};
  return a;
}
function update(st:Stat,o:Outcome,now:number){
  if(o==='HIT')st.hits++;else if(o==='FAIL')st.fails++;else st.neutral++;
  st.updatedAt=now;
}
function settle(asset:string,price:number,now:number){
  if(!Number.isFinite(price)||price<=0)return;
  const a=ensure(asset),keep:Pending[]=[];
  for(const p of a.pending){
    if(now<p.dueAt){keep.push(p);continue;}
    const raw=price-p.entry,signed=p.side==='BUY'?raw:-raw;
    const outcome:Outcome=signed>=p.barrier?'HIT':signed<=-p.barrier?'FAIL':'NEUTRAL';
    update(a.stats[p.horizon],outcome,now);
    a.recent.unshift({...p,settledAt:now,exit:price,outcome,signedMove:Number(signed.toFixed(4))});
    if(a.recent.length>240)a.recent=a.recent.slice(0,240);
    dirty=true;
  }
  if(keep.length!==a.pending.length){a.pending=keep;dirty=true;}
}
function failureStreak(rows:Recent[],h:H){
  let n=0;
  for(const r of rows){
    if(r.horizon!==h)continue;
    if(r.outcome==='FAIL')n++;
    else if(r.outcome==='HIT')break;
  }
  return n;
}
function view(st:Stat){
  const directional=st.hits+st.fails,resolved=directional+st.neutral;
  return {
    hits:st.hits,fails:st.fails,neutral:st.neutral,directional,resolved,
    accuracy:directional?Number((st.hits/directional*100).toFixed(1)):null,
    posterior:Number(((st.hits+6)/(directional+12)*100).toFixed(1))
  };
}
function summary(asset:string){
  const a=ensure(asset);
  return {
    ok:true,version:VERSION,asset:String(asset).toUpperCase(),
    horizons:Object.fromEntries(HORIZONS.map(h=>{
      const v=view(a.stats[h]),streak=failureStreak(a.recent,h);
      return [h,{...v,failureStreak:streak,ready:v.directional>=20,quality:
        v.directional<12?'COLLECTING':
        v.posterior>=58&&streak<3?'STRONG':
        v.posterior>=52&&streak<4?'USABLE':'WEAK'}];
    })),
    pending:a.pending.length,recent:a.recent.slice(0,24),storage:file()
  };
}

export function getHorizonBrainLearning(asset:string,price?:number|null,now=Date.now()){
  const p=Number(price);if(Number.isFinite(p)&&p>0)settle(asset,p,now);save();
  return summary(asset);
}

export function calibrateHorizonBrain(horizon:H,brain:any,learning:any){
  if(!brain)return brain;
  const row=learning?.horizons?.[horizon]||{};
  const side:Side=brain?.side==='BUY'||brain?.side==='SELL'?brain.side:'WAIT';
  const raw=Number(brain?.confidence||0);
  if(side==='WAIT')return {...brain,learning:row};
  const n=Number(row?.directional||0),posterior=Number(row?.posterior||50),streak=Number(row?.failureStreak||0);
  const maturity=Math.min(1,n/45);
  let confidence=raw*(1-.58*maturity)+posterior*(.58*maturity);
  if(streak>=5)confidence-=15;else if(streak===4)confidence-=10;else if(streak===3)confidence-=6;else if(streak===2)confidence-=3;
  if(n>=20&&posterior<50)confidence=Math.min(confidence,46);
  const weak=Boolean(n>=20&&(posterior<50||streak>=5));
  confidence=Math.round(cap(confidence,18,86));
  return {
    ...brain,
    side:weak&&confidence<48?'WAIT':side,
    confidence,
    uncertainty:Math.round(cap(100-confidence,0,100)),
    learning:row
  };
}

export function recordHorizonBrainOutcome(args:{
  asset:string;price:number|null;atr:number|null;now?:number;
  horizons:{oneMinute?:any;threeMinute?:any;fiveMinute?:any};
}){
  const now=Number(args.now||Date.now()),price=Number(args.price),atr=Number(args.atr);
  if(!Number.isFinite(price)||price<=0)return {ok:false,reason:'invalid_price'};
  settle(args.asset,price,now);
  const a=ensure(args.asset);
  const map:{h:H;b:any}[]=[
    {h:'M1',b:args.horizons?.oneMinute},
    {h:'M3',b:args.horizons?.threeMinute},
    {h:'M5',b:args.horizons?.fiveMinute}
  ];
  for(const {h,b} of map){
    const side:Side=b?.side==='BUY'||b?.side==='SELL'?b.side:'WAIT';
    const confidence=Number(b?.confidence||0);
    const families=Number(b?.independentFamilies||b?.familySupport||0);
    if(side==='WAIT'||confidence<42||families<2)continue;
    const bucket=Math.floor(now/MS[h]);
    if(a.lastBucket[h]===bucket)continue;
    const same=a.pending.some(x=>x.horizon===h&&x.side===side&&now-x.at<MS[h]*.55);
    if(same)continue;
    const baseAtr=Number.isFinite(atr)&&atr>0?atr:price*.0008;
    const scale=h==='M1'?.18:h==='M3'?.32:.48;
    const barrier=Math.max(baseAtr*scale,price*(h==='M1'?.00008:h==='M3'?.00014:.00020));
    a.pending.push({
      id:[String(args.asset).toUpperCase(),h,bucket,side].join(':'),
      horizon:h,at:now,dueAt:now+MS[h],side:side as 'BUY'|'SELL',confidence,entry:price,barrier
    });
    a.lastBucket[h]=bucket;dirty=true;
  }
  if(a.pending.length>60)a.pending=a.pending.slice(-60);
  save(true);return summary(args.asset);
}
