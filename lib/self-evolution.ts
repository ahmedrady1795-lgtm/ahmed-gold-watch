import {promises as fs} from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Weights={
  learning:number;structure:number;accumulation:number;liquidity:number;motion:number;behavior:number;scalp:number;stateGraph:number;wave:number;
};
type Thresholds={
  minLearningConfidence:number;minLearningSamples:number;structurePathConfidence:number;strongMoveReadiness:number;modelConflictPenalty:number;
};
export type EvolutionPolicy={
  id:string;generation:number;createdAt:number;fitness:number;reason:string;
  weights:Weights;thresholds:Thresholds;
};
type EvolutionStore={
  version:number;asset:string;generation:number;active:EvolutionPolicy;champion:EvolutionPolicy;
  previous:EvolutionPolicy|null;lastPromotionAt:number;lastEvalAt:number;lastResolved:number;
  candidates:{id:string;fitness:number;createdAt:number;promoted:boolean;codePath:string}[];
  history:{at:number;action:string;from?:string;to?:string;fitness?:number;reason:string}[];
};
export type EvolutionStatus={
  ok:boolean;asset:string;generation:number;active:EvolutionPolicy;champion:EvolutionPolicy;
  promoted:boolean;rolledBack:boolean;candidate:EvolutionPolicy|null;
  samples:number;selfReliability:number;storage:string;codePath:string|null;reason:string;
};

const ROOT=process.env.PREDATOR_EVOLUTION_DIR||'/data/evolution';
const FALLBACK='/tmp/evolution';
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round=(n:number,d=2)=>Number(n.toFixed(d));

function basePolicy(asset:string):EvolutionPolicy{
  return {
    id:'genesis-'+asset.toLowerCase(),generation:0,createdAt:Date.now(),fitness:50,reason:'baseline',
    weights:{learning:1,structure:1,accumulation:1,liquidity:1,motion:1,behavior:1,scalp:1,stateGraph:1,wave:1},
    thresholds:{minLearningConfidence:48,minLearningSamples:10,structurePathConfidence:48,strongMoveReadiness:60,modelConflictPenalty:8}
  };
}
function safeName(s:string){return s.replace(/[^a-zA-Z0-9_-]/g,'_');}
async function ensureDir(root:string){await fs.mkdir(root,{recursive:true});await fs.mkdir(path.join(root,'candidates'),{recursive:true});}
async function resolveRoot(){
  try{await ensureDir(ROOT);return ROOT;}catch{await ensureDir(FALLBACK);return FALLBACK;}
}
async function load(asset:string){
  const root=await resolveRoot(),file=path.join(root,'evolution-'+asset.toLowerCase()+'.json');
  try{
    const j=JSON.parse(await fs.readFile(file,'utf8'));
    if(j?.version>=1&&j?.active&&j?.champion)return {root,file,store:j as EvolutionStore};
  }catch{}
  const p=basePolicy(asset);
  const store:EvolutionStore={version:1,asset,generation:0,active:p,champion:p,previous:null,lastPromotionAt:0,lastEvalAt:0,lastResolved:0,candidates:[],history:[]};
  await fs.writeFile(file,JSON.stringify(store,null,2));
  return {root,file,store};
}
async function save(file:string,store:EvolutionStore){const tmp=file+'.tmp';await fs.writeFile(tmp,JSON.stringify(store,null,2));await fs.rename(tmp,file);}

function reliability(learning:any,name:string){
  const r=learning?.componentReliability?.[name];
  if(!r)return 50;
  const n1=Number(r.samples1||0),n5=Number(r.samples5||0),n=n1+n5;
  if(n<6)return 50;
  return Number(r.h1||50)*.4+Number(r.h5||50)*.6;
}
function mutate(asset:string,active:EvolutionPolicy,learning:any,stateGraph:any,now:number):EvolutionPolicy{
  const rel=(name:string)=>reliability(learning,name);
  const adjust=(name:keyof Weights,current:number)=>{
    const r=rel(name==='stateGraph'?'stateGraph':name);
    const sampleScale=Math.min(1,(Number(learning?.componentReliability?.[name]?.samples1||0)+Number(learning?.componentReliability?.[name]?.samples5||0))/45);
    const target=1+(r-50)/100*.5*sampleScale;
    return round(cap(current*.7+target*.3,.72,1.28));
  };
  const self=Number(learning?.selfCalibration?.reliability||50),matches=Number(stateGraph?.sequenceMatches||0),sgProb=Number(stateGraph?.nextSideProbability||0);
  const w:Weights={
    learning:round(cap(active.weights.learning*.72+(1+(self-50)/100*.35)*.28,.78,1.22)),
    structure:adjust('structure',active.weights.structure),
    accumulation:adjust('accumulation',active.weights.accumulation),
    liquidity:asset==='BTC'?adjust('liquidity',active.weights.liquidity):1,
    motion:adjust('motion',active.weights.motion),
    behavior:adjust('behavior',active.weights.behavior),
    scalp:adjust('scalp',active.weights.scalp),
    stateGraph:round(cap(active.weights.stateGraph*.72+(matches>=8?(1+(sgProb-50)/100*.30):1)*.28,.80,1.22)),
    wave:round(cap(active.weights.wave*.8+(rel('motion')>=55?1.06:.98)*.2,.82,1.18))
  };
  const t:Thresholds={
    minLearningConfidence:Math.round(cap(active.thresholds.minLearningConfidence+(self<45?2:self>58?-1:0),44,58)),
    minLearningSamples:Math.round(cap(active.thresholds.minLearningSamples+(self<45?2:self>60?-1:0),8,24)),
    structurePathConfidence:Math.round(cap(active.thresholds.structurePathConfidence+(rel('structure')<47?2:rel('structure')>58?-1:0),44,62)),
    strongMoveReadiness:Math.round(cap(active.thresholds.strongMoveReadiness+(self<45?3:self>60?-1:0),56,72)),
    modelConflictPenalty:Math.round(cap(8+(65-self)*.16+(matches<5?2:0),6,14))
  };
  return {id:'g'+(active.generation+1)+'-'+asset.toLowerCase()+'-'+now,generation:active.generation+1,createdAt:now,fitness:0,reason:'self-generated candidate',weights:w,thresholds:t};
}
function fitness(policy:EvolutionPolicy,learning:any,stateGraph:any){
  const self=Number(learning?.selfCalibration?.reliability||50),samples=Number(learning?.selfCalibration?.samples1||0)+Number(learning?.selfCalibration?.samples5||0);
  const compNames=['structure','accumulation','liquidity','motion','behavior','scalp','stateGraph'];
  let relScore=0,relWeight=0;
  for(const n of compNames){
    if(n==='liquidity'&&learning?.asset!=='BTC')continue;
    const r=reliability(learning,n),w=Number((policy.weights as any)[n]||1);relScore+=r*w;relWeight+=w;
  }
  const component=relWeight?relScore/relWeight:50;
  const sgSamples=Number(stateGraph?.sequenceMatches||0),sgProb=Number(stateGraph?.nextSideProbability||0);
  const graph=sgSamples>=5?cap(50+(sgProb-50)*Math.min(1,sgSamples/20),35,72):48;
  const drift=Object.values(policy.weights).reduce((s,v)=>s+Math.abs(Number(v)-1),0);
  const thresholdDrift=Math.abs(policy.thresholds.minLearningConfidence-48)/10+Math.abs(policy.thresholds.structurePathConfidence-48)/12+Math.abs(policy.thresholds.strongMoveReadiness-60)/12;
  const sampleConfidence=Math.min(1,samples/60);
  return round((self*.42+component*.36+graph*.22)*(.72+.28*sampleConfidence)-drift*1.6-thresholdDrift*.8);
}
function codeFor(asset:string,p:EvolutionPolicy){
  return `// Auto-generated by Predator Self-Evolution Lab.
// Asset: ${asset}
// Generation: ${p.generation}
// Fitness: ${p.fitness}
// This module is analysis-only; it contains no order execution.
export const policy = ${JSON.stringify({id:p.id,generation:p.generation,weights:p.weights,thresholds:p.thresholds},null,2)} as const;
export default policy;
`;
}
async function writeCandidate(root:string,asset:string,p:EvolutionPolicy,champion=false){
  const name=champion?'champion-'+asset.toLowerCase()+'.ts':'candidate-'+safeName(p.id)+'.ts';
  const file=path.join(root,champion?'': 'candidates',name);
  await fs.writeFile(file,codeFor(asset,p));
  return file;
}

export async function evolveAnalysisPolicy(args:{asset:string;learning:any;stateGraph:any;now?:number}):Promise<EvolutionStatus>{
  const now=args.now||Date.now(),{root,file,store}=await load(args.asset);
  const resolved=Number(args.learning?.totals?.resolved1||0)+Number(args.learning?.totals?.resolved5||0);
  const self=Number(args.learning?.selfCalibration?.reliability||50);
  const samples=Number(args.learning?.selfCalibration?.samples1||0)+Number(args.learning?.selfCalibration?.samples5||0);
  const previousEvalAt=Number(store.lastEvalAt||0);
  const currentFitness=fitness(store.active,args.learning,args.stateGraph);
  store.active.fitness=currentFitness;
  store.lastEvalAt=now;

  let rolledBack=false,promoted=false,candidate:EvolutionPolicy|null=null,reason='monitoring';
  const championFitness=fitness(store.champion,args.learning,args.stateGraph);
  store.champion.fitness=championFitness;

  const rollbackReady=store.previous&&samples>=18&&((self<40)||(currentFitness+5<championFitness));
  if(rollbackReady){
    const from=store.active.id;store.active=store.champion;rolledBack=true;reason='automatic rollback: reliability/fitness deteriorated';
    store.history.push({at:now,action:'ROLLBACK',from,to:store.active.id,fitness:currentFitness,reason});
  }

  const newOutcomes=Math.max(0,resolved-store.lastResolved);
  const cooldown=now-store.lastPromotionAt>=30*60*1000;
  const canEvolve=samples>=20&&(newOutcomes>=8||!previousEvalAt||now-previousEvalAt>=60*60*1000);
  if(!rolledBack&&canEvolve){
    candidate=mutate(args.asset,store.active,args.learning,args.stateGraph,now);
    candidate.fitness=fitness(candidate,args.learning,args.stateGraph);
    const codePath=await writeCandidate(root,args.asset,candidate,false);
    store.candidates.push({id:candidate.id,fitness:candidate.fitness,createdAt:now,promoted:false,codePath});
    const minGain=samples<40?3.5:2.0;
    if(cooldown&&candidate.fitness>=store.active.fitness+minGain&&self>=43){
      const from=store.active.id;store.previous=store.active;store.active=candidate;store.generation=candidate.generation;store.lastPromotionAt=now;promoted=true;reason='candidate promoted after measured improvement';
      store.candidates.at(-1)!.promoted=true;
      if(candidate.fitness>=championFitness){store.champion=candidate;await writeCandidate(root,args.asset,candidate,true);}
      store.history.push({at:now,action:'PROMOTE',from,to:candidate.id,fitness:candidate.fitness,reason});
    }else{
      reason='candidate kept in shadow: insufficient measured gain';
      store.history.push({at:now,action:'SHADOW',to:candidate.id,fitness:candidate.fitness,reason});
    }
    store.lastResolved=resolved;
  }
  store.candidates=store.candidates.slice(-30);store.history=store.history.slice(-100);
  await save(file,store);
  return {ok:true,asset:args.asset,generation:store.generation,active:store.active,champion:store.champion,promoted,rolledBack,candidate,samples,selfReliability:self,storage:file,codePath:candidate?path.join(root,'candidates','candidate-'+safeName(candidate.id)+'.ts'):null,reason};
}
