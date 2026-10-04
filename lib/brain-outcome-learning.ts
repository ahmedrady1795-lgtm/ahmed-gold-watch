import fs from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Regime='EXPANSION'|'COMPRESSION'|'REVERSAL'|'RANGE'|'TRANSITION';
type BrainName='MICRO'|'TREND'|'REVERSAL'|'RANGE';

type Stat={wins:number;losses:number;flat:number;sumMoveAtr:number;updatedAt:number};
type Pending={
  id:string;at:number;price:number;atr:number;regime:Regime;
  brains:Partial<Record<BrainName,Side>>;
};
type State={
  version:string;
  assets:Record<string,{
    stats:Partial<Record<Regime,Partial<Record<BrainName,Stat>>>>;
    global:Partial<Record<BrainName,Stat>>;
    pending:Pending[];
    lastRecordedBucket:number;
  }>;
};

const FILE='/data/predator-brain-outcomes.json';
const FALLBACK='/tmp/predator-brain-outcomes.json';
const NAMES:BrainName[]=['MICRO','TREND','REVERSAL','RANGE'];
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const safeRegime=(x:any):Regime=>{
  const s=String(x||'TRANSITION').toUpperCase();
  return s==='EXPANSION'||s==='COMPRESSION'||s==='REVERSAL'||s==='RANGE'?s:'TRANSITION';
};
const side=(x:any):Side=>x==='BUY'||x==='SELL'?x:'WAIT';
const blank=():State=>({version:'brain-outcome-v1',assets:{}});
let cache:State|null=null;
let dirty=false;
let lastSave=0;

function load():State{
  if(cache)return cache;
  for(const f of [FILE,FALLBACK]){
    try{
      const j=JSON.parse(fs.readFileSync(f,'utf8'));
      if(j&&typeof j==='object'&&j.assets){cache=j;return j;}
    }catch{}
  }
  cache=blank();
  return cache;
}
function targetFile(){
  try{
    const dir=path.dirname(FILE);
    if(fs.existsSync(dir))return FILE;
  }catch{}
  return FALLBACK;
}
function save(force=false){
  if(!cache||!dirty)return;
  const now=Date.now();
  if(!force&&now-lastSave<4000)return;
  try{
    fs.writeFileSync(targetFile(),JSON.stringify(cache));
    dirty=false;lastSave=now;
  }catch{}
}
function ensureAsset(asset:string){
  const st=load();
  if(!st.assets[asset])st.assets[asset]={stats:{},global:{},pending:[],lastRecordedBucket:0};
  return st.assets[asset];
}
function statOf(assetState:any,regime:Regime,name:BrainName){
  assetState.stats[regime] ||= {};
  assetState.stats[regime][name] ||= {wins:0,losses:0,flat:0,sumMoveAtr:0,updatedAt:0};
  assetState.global[name] ||= {wins:0,losses:0,flat:0,sumMoveAtr:0,updatedAt:0};
  return {local:assetState.stats[regime][name] as Stat,global:assetState.global[name] as Stat};
}
function horizonMs(name:BrainName){
  if(name==='TREND')return 5*60000;
  if(name==='MICRO')return 60000;
  return 2*60000;
}
function settle(asset:string,price:number,now:number){
  if(!Number.isFinite(price)||price<=0)return;
  const a=ensureAsset(asset),keep:Pending[]=[];
  for(const p of a.pending||[]){
    let unresolved=false;
    for(const name of NAMES){
      const pred=side(p.brains?.[name]);
      if(pred==='WAIT')continue;
      const age=now-p.at,h=horizonMs(name);
      if(age<h){unresolved=true;continue;}
      const atr=Math.max(Number(p.atr||0),Math.abs(p.price)*.00005,1e-9);
      const moveAtr=(price-p.price)/atr;
      const dir:Side=moveAtr>=.08?'BUY':moveAtr<=-.08?'SELL':'WAIT';
      const {local,global}=statOf(a,p.regime,name);
      const update=(s:Stat)=>{
        if(dir==='WAIT')s.flat++;
        else if(dir===pred)s.wins++;
        else s.losses++;
        s.sumMoveAtr+=pred==='BUY'?moveAtr:-moveAtr;
        s.updatedAt=now;
      };
      update(local);update(global);
    }
    const maxH=5*60000;
    if(unresolved&&now-p.at<maxH+90000)keep.push(p);
  }
  if(keep.length!==(a.pending||[]).length){a.pending=keep;dirty=true;}
}
function posterior(stat?:Stat){
  const wins=Number(stat?.wins||0),losses=Number(stat?.losses||0),n=wins+losses;
  const accuracy=(wins+4)/(n+8);
  const sample=Math.min(1,n/30);
  const raw=(accuracy-.5)*2;
  const multiplier=cap(1+raw*.62*sample,.58,1.42);
  return {
    wins,losses,flat:Number(stat?.flat||0),samples:n,
    accuracy:Math.round(accuracy*100),
    multiplier:Number(multiplier.toFixed(3)),
    edgeAtr:n?Number((Number(stat?.sumMoveAtr||0)/n).toFixed(3)):0
  };
}

export function getBrainOutcomeLearning(args:{asset:string;price:number|null;now?:number}){
  const asset=String(args.asset||'').toUpperCase(),now=Number(args.now||Date.now()),price=Number(args.price);
  if(Number.isFinite(price)&&price>0)settle(asset,price,now);
  const a=ensureAsset(asset);
  const regimes:Record<string,any>={};
  for(const r of ['EXPANSION','COMPRESSION','REVERSAL','RANGE','TRANSITION'] as Regime[]){
    regimes[r]={};
    for(const n of NAMES){
      const local=(a.stats?.[r] as any)?.[n] as Stat|undefined;
      const global=a.global?.[n] as Stat|undefined;
      const lp=posterior(local),gp=posterior(global);
      const localShare=Math.min(.82,lp.samples/18);
      const multiplier=Number((lp.multiplier*localShare+gp.multiplier*(1-localShare)).toFixed(3));
      const accuracy=Math.round(lp.accuracy*localShare+gp.accuracy*(1-localShare));
      regimes[r][n]={...lp,globalSamples:gp.samples,globalAccuracy:gp.accuracy,multiplier,blendedAccuracy:accuracy};
    }
  }
  save();
  return {
    ok:true,asset,version:'brain-outcome-v1',regimes,
    pending:(a.pending||[]).length,
    storage:targetFile()
  };
}

export function recordBrainOutcomeObservation(args:{asset:string;price:number|null;atr:number|null;now?:number;multiBrain:any}){
  const asset=String(args.asset||'').toUpperCase(),now=Number(args.now||Date.now()),price=Number(args.price),atr=Number(args.atr);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(atr)||atr<=0)return {ok:false,recorded:false,reason:'invalid_price_or_atr'};
  const a=ensureAsset(asset),bucket=Math.floor(now/30000);
  if(a.lastRecordedBucket===bucket)return {ok:true,recorded:false,reason:'deduped'};
  const regime=safeRegime(args.multiBrain?.regime);
  const brains:Partial<Record<BrainName,Side>>={};
  let directional=0;
  for(const n of NAMES){
    const bside=side(args.multiBrain?.brains?.[n]?.side);
    brains[n]=bside;
    if(bside!=='WAIT')directional++;
  }
  if(!directional)return {ok:true,recorded:false,reason:'no_directional_brains'};
  a.pending.push({
    id:asset+'-'+now,
    at:now,price,atr,regime,brains
  });
  if(a.pending.length>700)a.pending=a.pending.slice(-700);
  a.lastRecordedBucket=bucket;
  dirty=true;save(true);
  return {ok:true,recorded:true,regime,directional,pending:a.pending.length};
}
