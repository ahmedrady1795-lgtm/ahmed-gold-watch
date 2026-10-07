import {promises as fs} from 'node:fs';
import path from 'node:path';

type Side='BUY'|'SELL'|'WAIT';
type Weights={
  learning:number;structure:number;accumulation:number;liquidity:number;motion:number;behavior:number;scalp:number;stateGraph:number;wave:number;
};
type Thresholds={
  minLearningConfidence:number;minLearningSamples:number;structurePathConfidence:number;strongMoveReadiness:number;modelConflictPenalty:number;
};
type AdaptiveControls={
  fastGap:number;fastMinFamilies:number;fastStrongConfidence:number;fastEvidenceMinScore:number;
  m2Gate:number;m2RangeGate:number;m5Gate:number;m5RangeGate:number;m15Gate:number;m15RangeGate:number;
  leadArmedConfidence:number;leadBuildingConfidence:number;leadArmedWeight:number;leadBuildingWeight:number;
  neuralWeight:number;ml1Weight:number;ml5Weight:number;newsWeightCap:number;
  newsRiskGate:number;newsPenaltyScale:number;confidenceCeiling:number;
  m5CapOne:number;m5CapTwo:number;m5CapThree:number;m15CapOne:number;m15CapTwo:number;m15CapThree:number;
  forwardMinShare:number;forwardMinSupport:number;forwardMinConfidence:number;conditionalMinConfidence:number;
  h4OppositionPenalty:number;m5OppositionPenalty:number;m15OppositionPenalty:number;
};
type FeatureRecipe={
  id:string;
  kind:'AGREEMENT'|'CONTRADICTION'|'BURST'|'REGIME'|'ABLATION';
  sources:string[];
  weight:number;
  enabled:boolean;
};
export type EvolutionPolicy={
  id:string;generation:number;createdAt:number;fitness:number;reason:string;regime:string;
  weights:Weights;thresholds:Thresholds;controls:AdaptiveControls;features:FeatureRecipe[];disabledComponents:string[];
};
type CandidateRow={id:string;fitness:number;createdAt:number;promoted:boolean;codePath:string;generation:number;regime:string;variant:string};
type EvolutionStore={
  version:number;asset:string;generation:number;active:EvolutionPolicy;champion:EvolutionPolicy;
  championByRegime:Record<string,EvolutionPolicy>;
  previous:EvolutionPolicy|null;lastPromotionAt:number;lastEvalAt:number;lastResolved:number;
  candidates:CandidateRow[];
  failureFocus:Record<string,number>;
  recentAutopsy:{at:number;issues:string[];focus:string[]}|null;
  history:{at:number;action:string;from?:string;to?:string;fitness?:number;reason:string}[];
};
export type EvolutionStatus={
  ok:boolean;asset:string;generation:number;active:EvolutionPolicy;champion:EvolutionPolicy;
  promoted:boolean;rolledBack:boolean;candidate:EvolutionPolicy|null;
  tournament:{generated:number;winner:string|null;winnerFitness:number|null;variants:string[]};
  permissions:{candidateCode:boolean;developmentSourceWrite:boolean;runtimePolicyWrite:boolean;featureSynthesis:boolean;multiCandidate:boolean;ablation:boolean;failureAutopsy:boolean;regimeChampions:boolean;autoPromotion:boolean;autoRollback:boolean;walkForwardGuard:boolean;driftKillSwitch:boolean;productionSourceWrite:boolean;executionCodeWrite:boolean};
  performance:{directional:number;posterior:number;oosN:number;oosAccuracy:number|null;coverage:number|null;drift:string;promotionReady:boolean;killSwitch:boolean};
  runtimePlugin:{enabled:boolean;activePath:string;activeId:string;lastActivatedAt:number|null;transport:'RAILWAY_VOLUME'};
  samples:number;selfReliability:number;storage:string;codePath:string|null;developmentPath:string|null;reason:string;regime:string;
};
export type AutopsyResult={ok:boolean;asset:string;issues:string[];focus:string[];storedAt:string};

const ROOT=process.env.PREDATOR_EVOLUTION_DIR||'/data/evolution';
const FALLBACK='/tmp/evolution';
const cap=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round=(n:number,d=2)=>Number(n.toFixed(d));

function performanceSnapshot(v:any){
  const g=v?.global||{};
  const hits=Number(g?.hits||0),fails=Number(g?.fails||0),directional=hits+fails;
  const posterior=Number.isFinite(Number(g?.posteriorAccuracy))?Number(g.posteriorAccuracy):50;
  const wf=v?.walkForward||{};
  const oosN=Number(wf?.oos?.n||0);
  const oosAccuracy=Number.isFinite(Number(wf?.oos?.accuracy))?Number(wf.oos.accuracy):null;
  const coverage=Number.isFinite(Number(wf?.oos?.coverage))?Number(wf.oos.coverage):null;
  const drift=String(wf?.drift?.status||'COLLECTING');
  const promotionReady=Boolean(
    directional>=30&&posterior>=52&&
    (oosN<10||(oosAccuracy!=null&&oosAccuracy>=50))&&
    drift!=='DEGRADING'
  );
  const killSwitch=Boolean(
    directional>=25&&(
      posterior<44||
      (oosN>=10&&oosAccuracy!=null&&oosAccuracy<44)||
      (drift==='DEGRADING'&&oosN>=15&&oosAccuracy!=null&&oosAccuracy<48)
    )
  );
  return {directional,posterior,oosN,oosAccuracy,coverage,drift,promotionReady,killSwitch};
}


function regimeOf(stateGraph:any){
  const s=String(stateGraph?.current||'TRANSITION');
  if(/BREAKOUT|IMPULSE/.test(s))return 'EXPANSION';
  if(/ACCUMULATION|DISTRIBUTION|COMPRESSION/.test(s))return 'COMPRESSION';
  if(/EXHAUSTION|PULLBACK/.test(s))return 'REVERSAL';
  if(/RANGE/.test(s))return 'RANGE';
  return 'TRANSITION';
}
function basePolicy(asset:string,regime='TRANSITION'):EvolutionPolicy{
  return {
    id:'genesis-'+asset.toLowerCase(),generation:0,createdAt:Date.now(),fitness:50,reason:'baseline',regime,
    weights:{learning:1,structure:1,accumulation:1,liquidity:1,motion:1,behavior:1,scalp:1,stateGraph:1,wave:1},
    thresholds:{minLearningConfidence:48,minLearningSamples:10,structurePathConfidence:48,strongMoveReadiness:60,modelConflictPenalty:8},
    controls:{
      fastGap:18,fastMinFamilies:2,fastStrongConfidence:48,fastEvidenceMinScore:28,
      m2Gate:9,m2RangeGate:3.5,m5Gate:10,m5RangeGate:5,m15Gate:10,m15RangeGate:6,
      leadArmedConfidence:60,leadBuildingConfidence:48,leadArmedWeight:1.55,leadBuildingWeight:.82,
      neuralWeight:.34,ml1Weight:.30,ml5Weight:.28,newsWeightCap:.18,
      newsRiskGate:70,newsPenaltyScale:.55,confidenceCeiling:86,
      m5CapOne:54,m5CapTwo:70,m5CapThree:82,m15CapOne:56,m15CapTwo:72,m15CapThree:84,
      forwardMinShare:58,forwardMinSupport:3,forwardMinConfidence:52,conditionalMinConfidence:45,
      h4OppositionPenalty:8,m5OppositionPenalty:6,m15OppositionPenalty:7
    },
    features:[],disabledComponents:[]
  };
}
function normalizePolicy(p:any,asset:string,regime:string):EvolutionPolicy{
  const b=basePolicy(asset,regime);
  return {
    ...b,...p,regime:p?.regime||regime,
    weights:{...b.weights,...(p?.weights||{})},
    thresholds:{...b.thresholds,...(p?.thresholds||{})},
    controls:{...b.controls,...(p?.controls||{})},
    features:Array.isArray(p?.features)?p.features:[],
    disabledComponents:Array.isArray(p?.disabledComponents)?p.disabledComponents:[]
  };
}
function safeName(s:string){return s.replace(/[^a-zA-Z0-9_-]/g,'_');}
async function ensureDir(root:string){
  await fs.mkdir(root,{recursive:true});
  await fs.mkdir(path.join(root,'candidates'),{recursive:true});
  await fs.mkdir(path.join(root,'champions'),{recursive:true});
  await fs.mkdir(path.join(root,'autopsy'),{recursive:true});
  await fs.mkdir(path.join(root,'development'),{recursive:true});
  await fs.mkdir(path.join(root,'runtime'),{recursive:true});
  await fs.mkdir(path.join(root,'runtime','candidates'),{recursive:true});
  await fs.mkdir(path.join(root,'runtime','history'),{recursive:true});
}

function runtimeActivePath(root:string,asset:string){return path.join(root,'runtime',asset.toLowerCase()+'-active.json');}
function sanitizeRuntimePolicy(p:any,asset:string,regime:string):EvolutionPolicy{
  const n=normalizePolicy(p,asset,regime),b=basePolicy(asset,regime);
  const weights:any={};
  for(const k of Object.keys(b.weights))weights[k]=round(cap(Number((n.weights as any)?.[k]??1),.15,2.50));
  const thresholds:Thresholds={
    minLearningConfidence:Math.round(cap(Number(n.thresholds?.minLearningConfidence||48),25,85)),
    minLearningSamples:Math.round(cap(Number(n.thresholds?.minLearningSamples||10),3,80)),
    structurePathConfidence:Math.round(cap(Number(n.thresholds?.structurePathConfidence||48),25,85)),
    strongMoveReadiness:Math.round(cap(Number(n.thresholds?.strongMoveReadiness||60),30,92)),
    modelConflictPenalty:Math.round(cap(Number(n.thresholds?.modelConflictPenalty||8),0,30))
  };
  const c=n.controls||{},d=b.controls;
  const controls:AdaptiveControls={
    fastGap:cap(Number(c.fastGap??d.fastGap),4,45),
    fastMinFamilies:Math.round(cap(Number(c.fastMinFamilies??d.fastMinFamilies),1,6)),
    fastStrongConfidence:cap(Number(c.fastStrongConfidence??d.fastStrongConfidence),20,85),
    fastEvidenceMinScore:cap(Number(c.fastEvidenceMinScore??d.fastEvidenceMinScore),5,65),
    m2Gate:cap(Number(c.m2Gate??d.m2Gate),1,30),m2RangeGate:cap(Number(c.m2RangeGate??d.m2RangeGate),0,20),
    m5Gate:cap(Number(c.m5Gate??d.m5Gate),1,35),m5RangeGate:cap(Number(c.m5RangeGate??d.m5RangeGate),0,25),
    m15Gate:cap(Number(c.m15Gate??d.m15Gate),1,35),m15RangeGate:cap(Number(c.m15RangeGate??d.m15RangeGate),0,25),
    leadArmedConfidence:cap(Number(c.leadArmedConfidence??d.leadArmedConfidence),25,90),
    leadBuildingConfidence:cap(Number(c.leadBuildingConfidence??d.leadBuildingConfidence),20,85),
    leadArmedWeight:cap(Number(c.leadArmedWeight??d.leadArmedWeight),0,3),
    leadBuildingWeight:cap(Number(c.leadBuildingWeight??d.leadBuildingWeight),0,2.5),
    neuralWeight:cap(Number(c.neuralWeight??d.neuralWeight),0,1.5),ml1Weight:cap(Number(c.ml1Weight??d.ml1Weight),0,1.5),ml5Weight:cap(Number(c.ml5Weight??d.ml5Weight),0,1.5),
    newsWeightCap:cap(Number(c.newsWeightCap??d.newsWeightCap),0,.60),
    newsRiskGate:cap(Number(c.newsRiskGate??d.newsRiskGate),30,95),newsPenaltyScale:cap(Number(c.newsPenaltyScale??d.newsPenaltyScale),0,1.5),
    confidenceCeiling:cap(Number(c.confidenceCeiling??d.confidenceCeiling),45,96),
    m5CapOne:cap(Number(c.m5CapOne??d.m5CapOne),25,80),m5CapTwo:cap(Number(c.m5CapTwo??d.m5CapTwo),35,90),m5CapThree:cap(Number(c.m5CapThree??d.m5CapThree),45,96),
    m15CapOne:cap(Number(c.m15CapOne??d.m15CapOne),25,82),m15CapTwo:cap(Number(c.m15CapTwo??d.m15CapTwo),35,92),m15CapThree:cap(Number(c.m15CapThree??d.m15CapThree),45,96),
    forwardMinShare:cap(Number(c.forwardMinShare??d.forwardMinShare),50,80),forwardMinSupport:Math.round(cap(Number(c.forwardMinSupport??d.forwardMinSupport),1,7)),
    forwardMinConfidence:cap(Number(c.forwardMinConfidence??d.forwardMinConfidence),25,85),conditionalMinConfidence:cap(Number(c.conditionalMinConfidence??d.conditionalMinConfidence),20,80),
    h4OppositionPenalty:cap(Number(c.h4OppositionPenalty??d.h4OppositionPenalty),0,25),m5OppositionPenalty:cap(Number(c.m5OppositionPenalty??d.m5OppositionPenalty),0,25),m15OppositionPenalty:cap(Number(c.m15OppositionPenalty??d.m15OppositionPenalty),0,25)
  };
  return {...n,weights,thresholds,controls,features:(n.features||[]).slice(0,32),disabledComponents:(n.disabledComponents||[]).slice(0,12)};
}
async function readRuntimePolicy(root:string,asset:string,regime:string){
  const file=runtimeActivePath(root,asset);
  try{
    const j=JSON.parse(await fs.readFile(file,'utf8'));
    const raw=j?.policy||j;
    if(!raw?.id||!raw?.weights||!raw?.thresholds)return null;
    return {policy:sanitizeRuntimePolicy(raw,asset,regime),file,activatedAt:Number(j?.activatedAt||0)||null};
  }catch{return null;}
}
async function writeRuntimePolicy(root:string,asset:string,p:EvolutionPolicy,reason:string,active=false){
  const safe=sanitizeRuntimePolicy(p,asset,p.regime||'TRANSITION'),now=Date.now();
  const payload={version:'runtime-policy-v1',asset,activatedAt:active?now:null,createdAt:now,reason,policy:safe};
  const candidate=path.join(root,'runtime','candidates',safeName(safe.id)+'.json');
  const ctmp=candidate+'.tmp';await fs.writeFile(ctmp,JSON.stringify(payload,null,2));await fs.rename(ctmp,candidate);
  if(active){
    const file=runtimeActivePath(root,asset),tmp=file+'.tmp';
    await fs.writeFile(tmp,JSON.stringify({...payload,activatedAt:now},null,2));await fs.rename(tmp,file);
    const hist=path.join(root,'runtime','history',asset.toLowerCase()+'.jsonl');
    await fs.appendFile(hist,JSON.stringify({at:now,asset,policyId:safe.id,generation:safe.generation,reason})+'\n').catch(()=>{});
    return file;
  }
  return candidate;
}
async function resolveRoot(){try{await ensureDir(ROOT);return ROOT;}catch{await ensureDir(FALLBACK);return FALLBACK;}}
async function load(asset:string,stateGraph:any){
  const root=await resolveRoot(),file=path.join(root,'evolution-'+asset.toLowerCase()+'.json'),regime=regimeOf(stateGraph);
  try{
    const j=JSON.parse(await fs.readFile(file,'utf8'));
    if(j?.version>=1&&j?.active&&j?.champion){
      const active=normalizePolicy(j.active,asset,regime),champion=normalizePolicy(j.champion,asset,regime);
      const champions:Record<string,EvolutionPolicy>={};
      for(const [k,v] of Object.entries(j.championByRegime||{}))champions[k]=normalizePolicy(v,asset,k);
      const store:EvolutionStore={version:2,asset,generation:Number(j.generation||0),active,champion,championByRegime:champions,previous:j.previous?normalizePolicy(j.previous,asset,regime):null,lastPromotionAt:Number(j.lastPromotionAt||0),lastEvalAt:Number(j.lastEvalAt||0),lastResolved:Number(j.lastResolved||0),candidates:Array.isArray(j.candidates)?j.candidates:[],failureFocus:j.failureFocus||{},recentAutopsy:j.recentAutopsy||null,history:Array.isArray(j.history)?j.history:[]};
      const runtime=await readRuntimePolicy(root,asset,regime);
      if(runtime?.policy){
        store.active=runtime.policy;
        store.generation=Math.max(store.generation,Number(runtime.policy.generation||0));
      }
      return {root,file,store,regime,runtime};
    }
  }catch{}
  const p=basePolicy(asset,regime);
  const store:EvolutionStore={version:2,asset,generation:0,active:p,champion:p,championByRegime:{[regime]:p},previous:null,lastPromotionAt:0,lastEvalAt:0,lastResolved:0,candidates:[],failureFocus:{},recentAutopsy:null,history:[]};
  await fs.writeFile(file,JSON.stringify(store,null,2));
  const activePath=await writeRuntimePolicy(root,asset,p,'genesis runtime policy',true);
  return {root,file,store,regime,runtime:{policy:p,file:activePath,activatedAt:Date.now()}};
}
const saveQueues=new Map<string,Promise<void>>();
async function save(file:string,store:EvolutionStore){
  const snapshot=JSON.stringify(store,null,2);
  const prev=saveQueues.get(file)||Promise.resolve();
  const next=prev.catch(()=>{}).then(async()=>{
    const tmp=file+'.'+process.pid+'.'+Date.now()+'.'+Math.random().toString(36).slice(2)+'.tmp';
    await fs.writeFile(tmp,snapshot);
    await fs.rename(tmp,file);
  });
  saveQueues.set(file,next);
  try{await next;}finally{if(saveQueues.get(file)===next)saveQueues.delete(file);}
}

function reliability(learning:any,name:string){
  const r=learning?.componentReliability?.[name];if(!r)return 50;
  const n1=Number(r.samples1||0),n5=Number(r.samples5||0);if(n1+n5<6)return 50;
  return Number(r.h1||50)*.4+Number(r.h5||50)*.6;
}
function componentSamples(learning:any,name:string){
  const r=learning?.componentReliability?.[name];return Number(r?.samples1||0)+Number(r?.samples5||0);
}
function synthesizeFeatures(asset:string,learning:any,stateGraph:any,focus:Record<string,number>):FeatureRecipe[]{
  const out:FeatureRecipe[]=[];
  const rel=(n:string)=>reliability(learning,n);
  const pairs=[['liquidity','motion'],['structure','accumulation'],['stateGraph','behavior'],['scalp','m1']];
  for(const [a,b] of pairs){
    const score=(rel(a)+rel(b))/2;
    if(score>=55)out.push({id:'agree-'+a+'-'+b,kind:'AGREEMENT',sources:[a,b],weight:round(cap(1+(score-55)/100,.95,1.18)),enabled:true});
  }
  if(learning?.strongMoveMemory?.side&&learning.strongMoveMemory.side!=='WAIT'){
    out.push({id:'burst-memory',kind:'BURST',sources:['learning','accumulation','stateGraph'],weight:1.12,enabled:true});
  }
  if(Number(stateGraph?.sequenceMatches||0)>=8){
    out.push({id:'regime-sequence',kind:'REGIME',sources:['stateGraph','structure'],weight:round(cap(1+Number(stateGraph?.nextSideProbability||50)/500,1,1.18)),enabled:true});
  }
  const focusEntries=Object.entries(focus).sort((a,b)=>b[1]-a[1]).slice(0,2);
  for(const [name,count] of focusEntries){
    if(count>=3)out.push({id:'autopsy-'+name,kind:'CONTRADICTION',sources:[name],weight:.88,enabled:true});
  }
  if(asset!=='BTC')out.push({id:'no-central-book',kind:'ABLATION',sources:['liquidity'],weight:0,enabled:false});
  return out.slice(0,8);
}
function disabledFromReliability(asset:string,learning:any){
  const names=['structure','accumulation','liquidity','motion','behavior','scalp','stateGraph'];
  const out:string[]=[];
  for(const n of names){
    if(asset!=='BTC'&&n==='liquidity')continue;
    if(componentSamples(learning,n)>=24&&reliability(learning,n)<=40)out.push(n);
  }
  return out.slice(0,7);
}
function featureMultiplier(features:FeatureRecipe[],name:string){
  let m=1;
  for(const f of features){
    if(!f.enabled||!f.sources.includes(name))continue;
    m*=f.weight;
  }
  return cap(m,.72,1.28);
}
function mutate(asset:string,active:EvolutionPolicy,learning:any,stateGraph:any,focus:Record<string,number>,now:number,jump=1,variant='balanced'):EvolutionPolicy{
  const rel=(name:string)=>reliability(learning,name),jumpPower=Math.max(1,Math.min(3,jump)),features=synthesizeFeatures(asset,learning,stateGraph,focus),disabled=disabledFromReliability(asset,learning);
  const adjust=(name:keyof Weights,current:number)=>{
    const r=rel(name==='stateGraph'?'stateGraph':name),sampleScale=Math.min(1,componentSamples(learning,name)/45),target=1+(r-50)/100*.5*sampleScale;
    let blend=Math.min(.55,.30+.10*(jumpPower-1));
    if(variant==='explorer')blend=Math.min(.62,blend+.08);
    if(variant==='conservative')blend=Math.max(.22,blend-.08);
    let v=current*(1-blend)+target*blend;
    v*=featureMultiplier(features,name);
    if(disabled.includes(name))v=.52;
    if(variant==='state-heavy'&&name==='stateGraph')v*=1.08;
    if(variant==='micro-heavy'&&['liquidity','motion','wave'].includes(name))v*=1.07;
    return round(cap(v,.50,1.34));
  };
  const self=Number(learning?.selfCalibration?.reliability||50),matches=Number(stateGraph?.sequenceMatches||0),sgProb=Number(stateGraph?.nextSideProbability||0);
  const w:Weights={
    learning:round(cap((active.weights.learning*.70+(1+(self-50)/100*.35)*.30)*featureMultiplier(features,'learning'),.72,1.30)),
    structure:adjust('structure',active.weights.structure),
    accumulation:adjust('accumulation',active.weights.accumulation),
    liquidity:asset==='BTC'?adjust('liquidity',active.weights.liquidity):.5,
    motion:adjust('motion',active.weights.motion),
    behavior:adjust('behavior',active.weights.behavior),
    scalp:adjust('scalp',active.weights.scalp),
    stateGraph:round(cap((active.weights.stateGraph*.70+(matches>=8?(1+(sgProb-50)/100*.30):1)*.30)*featureMultiplier(features,'stateGraph'),.58,1.32)),
    wave:adjust('wave',active.weights.wave)
  };
  if(variant==='ablation'&&disabled.length===0){
    const ranked=['structure','accumulation','liquidity','motion','behavior','scalp','stateGraph'].filter(n=>asset==='BTC'||n!=='liquidity').sort((a,b)=>reliability(learning,a)-reliability(learning,b));
    const weakest=ranked[0] as keyof Weights|undefined;if(weakest)w[weakest]=.55;
  }
  const conflictBoost=Number(focus.modelConflict||0)+Number(focus.pathConflict||0);
  const t:Thresholds={
    minLearningConfidence:Math.round(cap(active.thresholds.minLearningConfidence+(self<45?2:self>58?-1:0)+(variant==='conservative'?2:0),30,78)),
    minLearningSamples:Math.round(cap(active.thresholds.minLearningSamples+(self<45?2:self>60?-1:0)+(variant==='explorer'?-1:0),4,55)),
    structurePathConfidence:Math.round(cap(active.thresholds.structurePathConfidence+(rel('structure')<47?2:rel('structure')>58?-1:0)+Math.min(4,conflictBoost),30,78)),
    strongMoveReadiness:Math.round(cap(active.thresholds.strongMoveReadiness+(self<45?3:self>60?-1:0)+(Number(focus.strongMoveFalse||0)>=3?4:0),35,88)),
    modelConflictPenalty:Math.round(cap(8+(65-self)*.16+(matches<5?2:0)+Math.min(5,conflictBoost),0,26))
  };
  const baseC=active.controls||basePolicy(asset).controls;
  const poor=self<46,good=self>60,conflict=conflictBoost>=4;
  const delta=(variant==='explorer'?-2:variant==='conservative'?2:0);
  const controls:AdaptiveControls={
    ...baseC,
    fastGap:round(cap(baseC.fastGap+(poor?2:good?-1:0)+delta,5,40)),
    fastMinFamilies:Math.round(cap(baseC.fastMinFamilies+(poor?1:good&&variant==='explorer'?-1:0),1,5)),
    fastStrongConfidence:round(cap(baseC.fastStrongConfidence+(poor?3:good?-1:0)+(variant==='conservative'?3:variant==='micro-heavy'?-2:0),25,82)),
    fastEvidenceMinScore:round(cap(baseC.fastEvidenceMinScore+(poor?2:good?-1:0),8,60)),
    m2Gate:round(cap(baseC.m2Gate+(poor?1:good?-.5:0)+delta*.25,1,26)),
    m2RangeGate:round(cap(baseC.m2RangeGate+(poor?.5:good?-.25:0),0,18)),
    m5Gate:round(cap(baseC.m5Gate+(poor?1.5:good?-.5:0)+(variant==='state-heavy'?-1:0),2,30)),
    m5RangeGate:round(cap(baseC.m5RangeGate+(poor?1:good?-.5:0),0,22)),
    m15Gate:round(cap(baseC.m15Gate+(poor?1.5:good?-.5:0)+(conflict?1:0),2,30)),
    m15RangeGate:round(cap(baseC.m15RangeGate+(poor?1:good?-.5:0),0,22)),
    leadArmedConfidence:round(cap(baseC.leadArmedConfidence+(poor?3:good?-1:0)+(variant==='micro-heavy'?-2:0),30,85)),
    leadBuildingConfidence:round(cap(baseC.leadBuildingConfidence+(poor?2:good?-1:0),25,80)),
    leadArmedWeight:round(cap(baseC.leadArmedWeight+(variant==='micro-heavy'?.08:poor?-.06:good?.03:0),0,2.7)),
    leadBuildingWeight:round(cap(baseC.leadBuildingWeight+(variant==='micro-heavy'?.06:poor?-.04:0),0,2.1)),
    neuralWeight:round(cap(baseC.neuralWeight+(variant==='micro-heavy'?.05:poor?-.03:good?.02:0),0,1.2)),
    ml1Weight:round(cap(baseC.ml1Weight+(variant==='micro-heavy'?.04:poor?-.03:good?.02:0),0,1.2)),
    ml5Weight:round(cap(baseC.ml5Weight+(variant==='state-heavy'?.03:poor?-.02:good?.01:0),0,1.2)),
    newsWeightCap:round(cap(baseC.newsWeightCap+(Number(focus.newsFalse||0)>=3?-.03:good?.01:0),0,.45)),
    newsRiskGate:round(cap(baseC.newsRiskGate+(poor?-2:good?1:0),35,92)),
    newsPenaltyScale:round(cap(baseC.newsPenaltyScale+(Number(focus.newsFalse||0)>=3?.08:poor?.03:good?-.02:0),0,1.25)),
    confidenceCeiling:round(cap(baseC.confidenceCeiling+(poor?-2:good?1:0),55,94)),
    m5CapOne:round(cap(baseC.m5CapOne+(poor?-2:good?1:0),30,75)),m5CapTwo:round(cap(baseC.m5CapTwo+(poor?-1:good?1:0),40,88)),m5CapThree:round(cap(baseC.m5CapThree+(poor?-1:good?1:0),50,94)),
    m15CapOne:round(cap(baseC.m15CapOne+(poor?-2:good?1:0),30,78)),m15CapTwo:round(cap(baseC.m15CapTwo+(poor?-1:good?1:0),40,90)),m15CapThree:round(cap(baseC.m15CapThree+(poor?-1:good?1:0),50,95)),
    forwardMinShare:round(cap(baseC.forwardMinShare+(poor?2:good?-1:0),52,76)),
    forwardMinSupport:Math.round(cap(baseC.forwardMinSupport+(poor?1:good&&variant==='explorer'?-1:0),1,6)),
    forwardMinConfidence:round(cap(baseC.forwardMinConfidence+(poor?3:good?-1:0),30,80)),
    conditionalMinConfidence:round(cap(baseC.conditionalMinConfidence+(poor?2:good?-1:0),25,75)),
    h4OppositionPenalty:round(cap(baseC.h4OppositionPenalty+(conflict?2:poor?1:good?-1:0),0,22)),
    m5OppositionPenalty:round(cap(baseC.m5OppositionPenalty+(conflict?1:poor?1:good?-1:0),0,22)),
    m15OppositionPenalty:round(cap(baseC.m15OppositionPenalty+(conflict?1:poor?1:good?-1:0),0,22))
  };
  const generation=active.generation+jumpPower,regime=regimeOf(stateGraph);
  return {id:'g'+generation+'-'+asset.toLowerCase()+'-'+variant+'-'+now,generation,createdAt:now,fitness:0,reason:'self-generated '+variant+' candidate',regime,weights:w,thresholds:t,controls,features,disabledComponents:disabled};
}
function fitness(policy:EvolutionPolicy,learning:any,stateGraph:any){
  const self=Number(learning?.selfCalibration?.reliability||50),samples=Number(learning?.selfCalibration?.samples1||0)+Number(learning?.selfCalibration?.samples5||0);
  const compNames=['structure','accumulation','liquidity','motion','behavior','scalp','stateGraph'];
  let relScore=0,relWeight=0;
  for(const n of compNames){
    if(n==='liquidity'&&learning?.asset!=='BTC')continue;
    const r=reliability(learning,n),w=Number((policy.weights as any)[n]||1);relScore+=r*w;relWeight+=w;
  }
  const component=relWeight?relScore/relWeight:50,sgSamples=Number(stateGraph?.sequenceMatches||0),sgProb=Number(stateGraph?.nextSideProbability||0);
  const graph=sgSamples>=5?cap(50+(sgProb-50)*Math.min(1,sgSamples/20),35,72):48;
  const drift=Object.values(policy.weights).reduce((s,v)=>s+Math.abs(Number(v)-1),0),thresholdDrift=Math.abs(policy.thresholds.minLearningConfidence-48)/10+Math.abs(policy.thresholds.structurePathConfidence-48)/12+Math.abs(policy.thresholds.strongMoveReadiness-60)/12;
  const b=basePolicy(policy.id.includes('btc')?'BTC':'GOLD',policy.regime),controlDrift=Object.keys(b.controls).reduce((sum,k)=>sum+Math.abs(Number((policy.controls as any)?.[k]??(b.controls as any)[k])-Number((b.controls as any)[k]))/Math.max(1,Math.abs(Number((b.controls as any)[k]))),0);
  const sampleConfidence=Math.min(1,samples/60),featureBonus=Math.min(4,policy.features.filter(f=>f.enabled).length*.28),ablationPenalty=policy.disabledComponents.length*.18;
  return round((self*.42+component*.36+graph*.22)*(.72+.28*sampleConfidence)-drift*.85-thresholdDrift*.35-controlDrift*.10+featureBonus-ablationPenalty);
}
function codeFor(asset:string,p:EvolutionPolicy){
  return `// Auto-generated by Predator Self-Evolution Lab.
// Asset: ${asset}
// Regime: ${p.regime}
// Generation: ${p.generation}
// Fitness: ${p.fitness}
// Development-only candidate generated by the self-evolution lab.
// Never imported into production automatically.
// No order execution, secrets, or production source mutation.
export const policy = ${JSON.stringify({id:p.id,generation:p.generation,regime:p.regime,weights:p.weights,thresholds:p.thresholds,controls:p.controls,features:p.features,disabledComponents:p.disabledComponents},null,2)} as const;
export default policy;
`;
}
async function writeCandidate(root:string,asset:string,p:EvolutionPolicy,champion=false){
  const name=champion?'champion-'+asset.toLowerCase()+'-'+p.regime.toLowerCase()+'.ts':'candidate-'+safeName(p.id)+'.ts';
  const file=path.join(root,champion?'champions':'candidates',name);await fs.writeFile(file,codeFor(asset,p));return file;
}

async function writeDevelopmentExperiment(root:string,asset:string,p:EvolutionPolicy,performance:any,reason:string){
  const devDir=path.join(root,'development');
  const name='experiment-'+safeName(p.id)+'.ts';
  const file=path.join(devDir,name);
  const body=`// AUTOGENERATED DEVELOPMENT EXPERIMENT — NOT PRODUCTION CODE.
// Asset: ${asset}
// Created: ${new Date(p.createdAt).toISOString()}
// Reason: ${reason}
// Real-market guard: ${JSON.stringify(performance)}
// This file can be evaluated in shadow/tournament mode only.
${codeFor(asset,p)}
`;
  await fs.writeFile(file,body);
  await fs.writeFile(path.join(devDir,asset.toLowerCase()+'-latest.json'),JSON.stringify({
    asset,updatedAt:Date.now(),candidate:p,performance,reason,experimentPath:file
  },null,2));
  return file;
}


export async function evolveAnalysisPolicy(args:{asset:string;learning:any;stateGraph:any;performance?:any;now?:number}):Promise<EvolutionStatus>{
  const runtimePromotionEnabled=!['0','false','off','no'].includes(String(process.env.AUTONOMOUS_RUNTIME_PROMOTION??'1').toLowerCase());
  const productionSourceWriteEnabled=!['0','false','off','no'].includes(String(process.env.AUTONOMOUS_PRODUCTION_SOURCE_WRITE??'0').toLowerCase());
  const githubCredentialPresent=Boolean(process.env.GITHUB_TOKEN||process.env.AUTONOMOUS_GITHUB_TOKEN);
  const now=args.now||Date.now(),loaded=await load(args.asset,args.stateGraph),{root,file,store,regime}=loaded;
  let runtimeActivePathValue=loaded.runtime?.file||runtimeActivePath(root,args.asset);
  let runtimeActivatedAt=loaded.runtime?.activatedAt||null;
  const performance=performanceSnapshot(args.performance);
  const resolved=Number(args.learning?.totals?.resolved1||0)+Number(args.learning?.totals?.resolved5||0),self=Number(args.learning?.selfCalibration?.reliability||50),samples=Number(args.learning?.selfCalibration?.samples1||0)+Number(args.learning?.selfCalibration?.samples5||0);
  const previousEvalAt=Number(store.lastEvalAt||0),regimeChampion=store.championByRegime[regime]||store.champion;
  const activeFitness=fitness(store.active,args.learning,args.stateGraph);store.active.fitness=activeFitness;store.lastEvalAt=now;
  regimeChampion.fitness=fitness(regimeChampion,args.learning,args.stateGraph);store.champion.fitness=fitness(store.champion,args.learning,args.stateGraph);

  let rolledBack=false,promoted=false,candidate:EvolutionPolicy|null=null,reason='monitoring',developmentPath:string|null=null;
  const rollbackReady=Boolean(store.previous&&samples>=18&&((self<40)||(activeFitness+5<regimeChampion.fitness)||performance.killSwitch));
  if(rollbackReady){
    const from=store.active.id;store.active=regimeChampion;rolledBack=true;reason='automatic rollback to regime champion';
    runtimeActivePathValue=await writeRuntimePolicy(root,args.asset,store.active,reason,true);runtimeActivatedAt=Date.now();
    store.history.push({at:now,action:'ROLLBACK',from,to:store.active.id,fitness:activeFitness,reason});
  }

  const newOutcomes=Math.max(0,resolved-store.lastResolved),cooldown=now-store.lastPromotionAt>=30*60*1000,sgMatches=Number(args.stateGraph?.sequenceMatches||0);
  const jump=samples>=55&&self>=64&&sgMatches>=12?3:samples>=32&&self>=58&&sgMatches>=8?2:1,requiredNewOutcomes=jump===3?14:jump===2?10:8;
  // Bootstrap exactly once: if this asset has never produced candidates, run the tournament immediately.
  // After candidates exist, revert to the normal outcome/time cadence so the learning worker cannot spam generations.
  const bootstrapEvolution=store.candidates.length===0;
  const canEvolve=samples>=20&&(bootstrapEvolution||newOutcomes>=requiredNewOutcomes||!previousEvalAt||now-previousEvalAt>=30*60*1000);
  const variants=['balanced','state-heavy','micro-heavy','conservative','ablation'];
  let winner:EvolutionPolicy|null=null;
  if(!rolledBack&&canEvolve){
    const generated:EvolutionPolicy[]=[];
    for(const variant of variants){
      const p=mutate(args.asset,store.active,args.learning,args.stateGraph,store.failureFocus,now,jump,variant);p.fitness=fitness(p,args.learning,args.stateGraph);
      const codePath=await writeCandidate(root,args.asset,p,false);
      await writeRuntimePolicy(root,args.asset,p,'shadow candidate '+variant,false);
      store.candidates.push({id:p.id,fitness:p.fitness,createdAt:now,promoted:false,codePath,generation:p.generation,regime:p.regime,variant});generated.push(p);
    }
    generated.sort((a,b)=>b.fitness-a.fitness);winner=generated[0]||null;candidate=winner;
    const minGain=(samples<40?3.5:2.0)+(jump-1)*1.25,minSelf=jump===3?64:jump===2?58:43;
    developmentPath=winner?await writeDevelopmentExperiment(root,args.asset,winner,performance,'shadow tournament candidate'):null;
    const autonomousPromotionReady=runtimePromotionEnabled&&!performance.killSwitch&&(performance.promotionReady||performance.directional<30);
    if(winner&&cooldown&&winner.fitness>=store.active.fitness+minGain&&self>=minSelf&&autonomousPromotionReady){
      const from=store.active.id;store.previous=store.active;store.active=winner;store.generation=winner.generation;store.lastPromotionAt=now;promoted=true;
      reason=jump>1?('tournament winner jump x'+jump+' promoted after live Walk-Forward gate'):'tournament winner promoted after live Walk-Forward gate';
      const row=store.candidates.find(x=>x.id===winner!.id);if(row)row.promoted=true;
      const oldRegime=store.championByRegime[regime];
      if(!oldRegime||winner.fitness>=fitness(oldRegime,args.learning,args.stateGraph)){store.championByRegime[regime]=winner;await writeCandidate(root,args.asset,winner,true);}
      if(winner.fitness>=store.champion.fitness)store.champion=winner;
      runtimeActivePathValue=await writeRuntimePolicy(root,args.asset,winner,reason,true);runtimeActivatedAt=Date.now();
      store.history.push({at:now,action:'PROMOTE',from,to:winner.id,fitness:winner.fitness,reason});
    }else{
      reason=performance.killSwitch?'performance kill-switch: candidates remain shadow':!performance.promotionReady?'live Walk-Forward gate not passed; candidates remain shadow':bootstrapEvolution?'bootstrap tournament completed; winner stayed shadow':'5-candidate tournament stayed in shadow';
      if(winner)store.history.push({at:now,action:'SHADOW',to:winner.id,fitness:winner.fitness,reason});
    }
    store.lastResolved=resolved;
  }

  store.candidates=store.candidates.slice(-60);store.history=store.history.slice(-160);await save(file,store);
  return {
    ok:true,asset:args.asset,generation:store.generation,active:store.active,champion:store.champion,promoted,rolledBack,candidate,samples,selfReliability:self,storage:file,
    codePath:candidate?path.join(root,'candidates','candidate-'+safeName(candidate.id)+'.ts'):null,developmentPath,reason,regime,performance,
    runtimePlugin:{enabled:true,activePath:runtimeActivePathValue,activeId:store.active.id,lastActivatedAt:runtimeActivatedAt,transport:'RAILWAY_VOLUME'},
    tournament:{generated:canEvolve?variants.length:0,winner:winner?.id||null,winnerFitness:winner?.fitness??null,variants:canEvolve?variants:[]},
    permissions:{candidateCode:true,developmentSourceWrite:true,runtimePolicyWrite:true,featureSynthesis:true,multiCandidate:true,ablation:true,failureAutopsy:true,regimeChampions:true,autoPromotion:runtimePromotionEnabled,autoRollback:true,walkForwardGuard:true,driftKillSwitch:true,productionSourceWrite:productionSourceWriteEnabled&&githubCredentialPresent,executionCodeWrite:false}
  };
}

export async function recordEvolutionAutopsy(args:{asset:string;hunt:any;learning:any;stateGraph:any;master:any;now?:number}):Promise<AutopsyResult>{
  const now=args.now||Date.now(),{root,file,store}=await load(args.asset,args.stateGraph),issues:string[]=[],focus:string[]=[];
  if(store.recentAutopsy&&Math.floor(Number(store.recentAutopsy.at||0)/60000)===Math.floor(now/60000)){
    return {ok:true,asset:args.asset,issues:store.recentAutopsy.issues||[],focus:store.recentAutopsy.focus||[],storedAt:path.join(root,'autopsy',args.asset.toLowerCase()+'.jsonl')};
  }
  const side=args.hunt?.side as Side,pathSide=args.hunt?.path?.shortSide as Side,learned=args.learning?.side as Side,graph=args.stateGraph?.nextSide as Side,strong=args.hunt?.strongMove?.side as Side;
  if(side&&pathSide&&side!=='WAIT'&&pathSide!=='WAIT'&&side!==pathSide){issues.push('hunt/path contradiction');focus.push('pathConflict');}
  if(side&&learned&&side!=='WAIT'&&learned!=='WAIT'&&side!==learned){issues.push('hunt/learning contradiction');focus.push('modelConflict');}
  if(side&&graph&&side!=='WAIT'&&graph!=='WAIT'&&side!==graph){issues.push('hunt/stateGraph contradiction');focus.push('stateGraph');}
  if(strong&&learned&&strong!=='WAIT'&&learned!=='WAIT'&&strong!==learned){issues.push('strong-move disagrees with learned memory');focus.push('strongMoveFalse');}
  if(args.master?.state==='CONFLICT'){issues.push('master conflict');focus.push('modelConflict');}
  const quality=Number(args.hunt?.quality||0);if(quality<25&&side!=='WAIT'){issues.push('direction emitted with low quality');focus.push('confidenceCalibration');}
  for(const k of focus)store.failureFocus[k]=Number(store.failureFocus[k]||0)+1;
  if(issues.length===0){
    for(const k of Object.keys(store.failureFocus))store.failureFocus[k]=Math.max(0,Number(store.failureFocus[k]||0)-.15);
  }
  store.recentAutopsy={at:now,issues,focus};store.history.push({at:now,action:'AUTOPSY',reason:issues.length?issues.join(' | '):'clean cycle'});store.history=store.history.slice(-160);
  await save(file,store);
  const outFile=path.join(root,'autopsy',args.asset.toLowerCase()+'.jsonl');
  await fs.appendFile(outFile,JSON.stringify({at:now,asset:args.asset,issues,focus,side,pathSide,learned,graph,strong,quality})+'\n').catch(()=>{});
  return {ok:true,asset:args.asset,issues,focus,storedAt:outFile};
}
