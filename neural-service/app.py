import gc, json, math, os, threading, time
from collections import deque
from pathlib import Path

import numpy as np
import requests
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI

APP_VERSION="predator-neural-v3-calibrated-l2"
MODEL_DIR=Path(os.getenv("MODEL_DIR","/data")); MODEL_DIR.mkdir(parents=True,exist_ok=True)
DATA_PATH=MODEL_DIR/"l2_neural.jsonl"
MODEL_PATH=MODEL_DIR/"l2_neural.pt"
PATH_MODEL_PATH=MODEL_DIR/"l2_price_path.pt"
PORT=int(os.getenv("PORT","8000"))
INTERVAL=float(os.getenv("NEURAL_DEPTH_INTERVAL","2.0"))
SEQ_LEN=int(os.getenv("NEURAL_SEQ_LEN","32"))
HORIZON=int(os.getenv("NEURAL_HORIZON_STEPS","30"))
LABEL_BPS=float(os.getenv("NEURAL_LABEL_BPS","0.9"))
MIN_SNAPSHOTS=int(os.getenv("NEURAL_MIN_SNAPSHOTS","1800"))
MAX_SNAPSHOTS=int(os.getenv("NEURAL_MAX_SNAPSHOTS","24000"))
RETRAIN_SECONDS=int(os.getenv("NEURAL_RETRAIN_SECONDS","1800"))
TRAIN_MAX_SAMPLES=int(os.getenv("NEURAL_TRAIN_MAX_SAMPLES","12000"))
TRAIN_BATCH=int(os.getenv("NEURAL_TRAIN_BATCH","32"))
EVAL_BATCH=int(os.getenv("NEURAL_EVAL_BATCH","128"))
MEMORY_TRAIN_START_MB=float(os.getenv("NEURAL_TRAIN_START_MAX_RSS_MB","620"))
RUNTIME_REVISION="memorysafe-r3.1"
LEVELS=10
FEAT_DIM=50
PATH_END_SCALE_BPS=8.0
PATH_RANGE_SCALE_BPS=12.0
DEVICE=torch.device("cpu")
torch.set_num_threads(max(1,min(2,int(os.getenv("NEURAL_TORCH_THREADS","2")))))

app=FastAPI(title="Predator Neural Microstructure",version=APP_VERSION)
LOCK=threading.Lock()
ROWS=deque(maxlen=MAX_SNAPSHOTS)
PENDING=[]
MODEL=None
METRICS=None
NORM_MEAN=None
NORM_STD=None
TRAINING=False
LAST_TRAIN_AT=0
PATH_MODEL=None
PATH_METRICS=None
PATH_NORM_MEAN=None
PATH_NORM_STD=None
PATH_TRAINING=False
PATH_LAST_TRAIN_AT=0
PATH_LAST_ERROR=None
LAST_SNAPSHOT_AT=0
LAST_ERROR=None
SESSION=requests.Session()
SESSION.headers.update({"User-Agent":"PredatorNeural/1.0","Accept":"application/json"})

def cap(x,a,b): return max(a,min(b,x))

def _rss_mb():
    try:
        with open("/proc/self/status","r",encoding="utf-8") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return round(float(line.split()[1])/1024,1)
    except Exception:
        pass
    return 0.0


def _load_rows():
    global LAST_ERROR
    if not DATA_PATH.exists(): return
    try:
        tail=deque(maxlen=MAX_SNAPSHOTS)
        with DATA_PATH.open("r",encoding="utf-8") as f:
            for line in f:
                try:
                    j=json.loads(line)
                    if len(j.get("f",[]))==FEAT_DIM: tail.append(j)
                except Exception: pass
        ROWS.extend(tail)
    except Exception as e:
        LAST_ERROR=f"load_rows:{type(e).__name__}:{e}"

def _flush():
    global PENDING
    if not PENDING:return
    DATA_PATH.parent.mkdir(parents=True,exist_ok=True)
    with DATA_PATH.open("a",encoding="utf-8") as f:
        for r in PENDING:f.write(json.dumps(r,separators=(",",":"))+"\n")
    PENDING=[]

def _load_model():
    global MODEL,METRICS,NORM_MEAN,NORM_STD,LAST_TRAIN_AT,LAST_ERROR
    if not MODEL_PATH.exists():return
    try:
        obj=torch.load(MODEL_PATH,map_location="cpu",weights_only=False)
        if obj.get("version")!=APP_VERSION:return
        m=HybridMicroNet()
        m.load_state_dict(obj["state_dict"]);m.eval()
        nm=np.asarray(obj.get("normMean",[]),dtype=np.float32)
        ns=np.asarray(obj.get("normStd",[]),dtype=np.float32)
        if nm.shape!=(FEAT_DIM,) or ns.shape!=(FEAT_DIM,):return
        MODEL=m;METRICS=obj.get("metrics");NORM_MEAN=nm;NORM_STD=ns;LAST_TRAIN_AT=int(obj.get("trainedAt",0))
    except Exception as e:
        LAST_ERROR=f"load_model:{type(e).__name__}:{e}"

def _load_path_model():
    global PATH_MODEL,PATH_METRICS,PATH_NORM_MEAN,PATH_NORM_STD,PATH_LAST_TRAIN_AT,PATH_LAST_ERROR
    if not PATH_MODEL_PATH.exists():return
    try:
        obj=torch.load(PATH_MODEL_PATH,map_location="cpu",weights_only=False)
        if obj.get("version")!=APP_VERSION:return
        m=PricePathNet()
        m.load_state_dict(obj["state_dict"]);m.eval()
        nm=np.asarray(obj.get("normMean",[]),dtype=np.float32)
        ns=np.asarray(obj.get("normStd",[]),dtype=np.float32)
        if nm.shape!=(FEAT_DIM,) or ns.shape!=(FEAT_DIM,):return
        PATH_MODEL=m;PATH_METRICS=obj.get("metrics");PATH_NORM_MEAN=nm;PATH_NORM_STD=ns;PATH_LAST_TRAIN_AT=int(obj.get("trainedAt",0))
    except Exception as e:
        PATH_LAST_ERROR=f"load_path_model:{type(e).__name__}:{e}"

def _fetch_depth():
    r=SESSION.get(
        "https://data-api.binance.vision/api/v3/depth",
        params={"symbol":"BTCUSDT","limit":"100"},timeout=5
    )
    r.raise_for_status()
    j=r.json()
    bids=[(float(p),float(q)) for p,q in (j.get("bids") or [])[:LEVELS]]
    asks=[(float(p),float(q)) for p,q in (j.get("asks") or [])[:LEVELS]]
    if len(bids)<LEVELS or len(asks)<LEVELS:raise RuntimeError("depth_short")
    return bids,asks

def _features(bids,asks):
    bp=np.array([p for p,_ in bids],dtype=np.float64)
    ap=np.array([p for p,_ in asks],dtype=np.float64)
    bq=np.array([q for _,q in bids],dtype=np.float64)
    aq=np.array([q for _,q in asks],dtype=np.float64)
    bid,ask=bp[0],ap[0];mid=(bid+ask)/2
    total=max(1e-12,float(bq.sum()+aq.sum()))
    bp_bps=(bp-mid)/mid*10000
    ap_bps=(ap-mid)/mid*10000
    bqn=bq/total;aqn=aq/total
    def imb(n):
        b=float(bq[:n].sum());a=float(aq[:n].sum())
        return (b-a)/max(1e-12,b+a)
    micro=(ask*bq[0]+bid*aq[0])/max(1e-12,bq[0]+aq[0])
    spread=(ask-bid)/mid*10000
    bid_depth=float(bq.sum()/total);ask_depth=float(aq.sum()/total)
    with LOCK:
        prev=ROWS[-1] if ROWS else None
    pf=(prev or {}).get("f") or []
    prev_bid=float(pf[46]) if len(pf)>47 else bid_depth
    prev_ask=float(pf[47]) if len(pf)>47 else ask_depth
    vec=list(bp_bps)+list(bqn)+list(ap_bps)+list(aqn)+[
        float(spread),float((micro-mid)/mid*10000),
        float(imb(1)),float(imb(3)),float(imb(5)),float(imb(10)),
        bid_depth,ask_depth,bid_depth-prev_bid,ask_depth-prev_ask
    ]
    return mid,[float(x) for x in vec]

class CausalBlock(nn.Module):
    def __init__(self,c,dilation):
        super().__init__()
        k=3;pad=(k-1)*dilation
        self.pad=pad
        self.conv1=nn.Conv1d(c,c,k,dilation=dilation)
        self.conv2=nn.Conv1d(c,c,k,dilation=dilation)
        self.norm1=nn.GroupNorm(8,c);self.norm2=nn.GroupNorm(8,c)
        self.drop=nn.Dropout(.10)
    def forward(self,x):
        y=F.pad(x,(self.pad,0));y=self.conv1(y);y=self.drop(F.gelu(self.norm1(y)))
        y=F.pad(y,(self.pad,0));y=self.conv2(y);y=self.drop(F.gelu(self.norm2(y)))
        return x+y

class SelectiveSSM(nn.Module):
    """CPU-friendly selective state-space branch inspired by Mamba gating."""
    def __init__(self,din=FEAT_DIM,d=64):
        super().__init__()
        self.inp=nn.Linear(din,d)
        self.dt=nn.Linear(din,d)
        self.b=nn.Linear(din,d)
        self.gate=nn.Linear(din,d)
        self.out=nn.Linear(d,d)
        self.norm=nn.LayerNorm(d)
    def forward(self,x):
        u=torch.tanh(self.inp(x));dt=torch.sigmoid(self.dt(x))
        b=torch.tanh(self.b(x));g=torch.sigmoid(self.gate(x))
        h=torch.zeros(x.size(0),u.size(-1),device=x.device,dtype=x.dtype)
        outs=[]
        for t in range(x.size(1)):
            h=(1-dt[:,t])*h+dt[:,t]*b[:,t]
            y=g[:,t]*h+(1-g[:,t])*u[:,t]
            outs.append(y)
        y=torch.stack(outs,dim=1)
        return self.norm(self.out(y[:,-1]))

class DeepLOBBranch(nn.Module):
    def __init__(self):
        super().__init__()
        self.cnn=nn.Sequential(
            nn.Conv2d(1,16,kernel_size=(2,3),padding=(0,1)),
            nn.GELU(),
            nn.Conv2d(16,24,kernel_size=(2,3),padding=(0,1)),
            nn.GELU(),
            nn.AdaptiveAvgPool2d((1,5))
        )
        self.extra=nn.Sequential(nn.Linear(10,16),nn.GELU())
        self.gru=nn.GRU(24*5+16,64,batch_first=True)
    def forward(self,x):
        b,t,_=x.shape
        lob=x[:,:,:40].reshape(b*t,4,10).unsqueeze(1)
        z=self.cnn(lob).reshape(b,t,-1)
        ex=self.extra(x[:,:,40:])
        seq=torch.cat([z,ex],dim=-1)
        _,h=self.gru(seq)
        return h[-1]

class TCNBranch(nn.Module):
    def __init__(self):
        super().__init__()
        self.proj=nn.Conv1d(FEAT_DIM,64,1)
        self.blocks=nn.Sequential(CausalBlock(64,1),CausalBlock(64,2),CausalBlock(64,4),CausalBlock(64,8))
        self.norm=nn.LayerNorm(64)
    def forward(self,x):
        y=self.blocks(self.proj(x.transpose(1,2)))
        return self.norm(y[:,:,-1])

class HybridMicroNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.deep=DeepLOBBranch()
        self.tcn=TCNBranch()
        self.ssm=SelectiveSSM()
        self.meta=nn.Sequential(
            nn.Linear(64*3+10,128),nn.GELU(),nn.Dropout(.12),
            nn.Linear(128,48),nn.GELU(),nn.Dropout(.08),
            nn.Linear(48,3)
        )
    def forward(self,x):
        d=self.deep(x);t=self.tcn(x);s=self.ssm(x)
        latest=x[:,-1,40:]
        return self.meta(torch.cat([d,t,s,latest],dim=-1))

class PricePathNet(nn.Module):
    """Separate price-path head: terminal move, upside excursion, downside excursion, first-hit time."""
    def __init__(self):
        super().__init__()
        self.deep=DeepLOBBranch()
        self.tcn=TCNBranch()
        self.ssm=SelectiveSSM()
        self.head=nn.Sequential(
            nn.Linear(64*3+10,128),nn.GELU(),nn.Dropout(.12),
            nn.Linear(128,64),nn.GELU(),nn.Dropout(.08),
            nn.Linear(64,4)
        )
    def forward(self,x):
        d=self.deep(x);t=self.tcn(x);s=self.ssm(x);latest=x[:,-1,40:]
        raw=self.head(torch.cat([d,t,s,latest],dim=-1))
        end=torch.tanh(raw[:,0:1])
        positive=torch.sigmoid(raw[:,1:4])
        return torch.cat([end,positive],dim=1)

def _dataset():
    with LOCK: rows=list(ROWS)
    end=len(rows)-HORIZON
    start=max(SEQ_LEN-1,end-TRAIN_MAX_SAMPLES)
    count=max(0,end-start)
    if count<=0:return None,None
    X=np.empty((count,SEQ_LEN,FEAT_DIM),dtype=np.float32)
    y=np.empty((count,),dtype=np.int64)
    used=0
    for i in range(start,end):
        seq=rows[i-SEQ_LEN+1:i+1]
        if any(len(r.get("f",[]))!=FEAT_DIM for r in seq):continue
        cur=float(rows[i]["mid"]);fut=float(rows[i+HORIZON]["mid"])
        move=(fut-cur)/cur*10000
        X[used]=np.asarray([r["f"] for r in seq],dtype=np.float32)
        y[used]=2 if move>=LABEL_BPS else 0 if move<=-LABEL_BPS else 1
        used+=1
    if used<=0:return None,None
    return X[:used],y[:used]

def _path_dataset():
    with LOCK: rows=list(ROWS)
    end=len(rows)-HORIZON
    start=max(SEQ_LEN-1,end-TRAIN_MAX_SAMPLES)
    count=max(0,end-start)
    if count<=0:return None,None
    X=np.empty((count,SEQ_LEN,FEAT_DIM),dtype=np.float32)
    y=np.empty((count,4),dtype=np.float32)
    used=0
    for i in range(start,end):
        seq=rows[i-SEQ_LEN+1:i+1]
        if any(len(r.get("f",[]))!=FEAT_DIM for r in seq):continue
        cur=float(rows[i]["mid"])
        future=np.asarray([float(rows[k]["mid"]) for k in range(i+1,i+HORIZON+1)],dtype=np.float32)
        moves=(future-cur)/cur*10000
        end_move=float(moves[-1]);up=max(0.0,float(moves.max()));down=max(0.0,float(-moves.min()))
        hit=np.where(np.abs(moves)>=LABEL_BPS)[0]
        hit_frac=float((int(hit[0])+1)/HORIZON) if len(hit) else 1.0
        X[used]=np.asarray([r["f"] for r in seq],dtype=np.float32)
        y[used]=[
            float(np.clip(end_move/PATH_END_SCALE_BPS,-1,1)),
            float(np.clip(up/PATH_RANGE_SCALE_BPS,0,1)),
            float(np.clip(down/PATH_RANGE_SCALE_BPS,0,1)),
            float(np.clip(hit_frac,0,1))
        ]
        used+=1
    if used<=0:return None,None
    return X[:used],y[:used]

def _selected_metricsdef _selected_metrics(y,prob,threshold=.55,margin=.10):
    p=np.asarray(prob);pred=p.argmax(1)
    direction=np.maximum(p[:,0],p[:,2]);noise=p[:,1]
    mask=(direction>=threshold)&((direction-noise)>=margin)
    n=int(mask.sum())
    acc=float((pred[mask]==y[mask]).mean()) if n else 0.0
    cov=float(mask.mean()) if len(mask) else 0.0
    overall=float((pred==y).mean()) if len(y) else 0.0
    return {"selectiveAccuracy":acc,"selectiveCoverage":cov,"selectiveN":n,"overallAccuracy":overall,"n":int(len(y)),
            "threshold":float(threshold),"margin":float(margin)}

def _fit_normalizer(X):
    # Memory-safe train-only scaling. Sample temporal rows instead of materializing
    # a float64 copy / percentile workspace for the whole overlapping L2 tensor.
    flat=X.reshape(-1,X.shape[-1])
    stride=max(1,len(flat)//200000)
    sample=flat[::stride].astype(np.float32,copy=False)
    center=np.mean(sample,axis=0,dtype=np.float64).astype(np.float32)
    scale=np.std(sample,axis=0,dtype=np.float64).astype(np.float32)
    scale=np.where(np.isfinite(scale)&(scale>1e-5),scale,1.0).astype(np.float32)
    return center,scale

def _normalize(X,center,scale):
    out=X.astype(np.float32,copy=True)
    out-=center.reshape(1,1,-1);out/=scale.reshape(1,1,-1)
    np.clip(out,-8.0,8.0,out=out)
    return out

def _normalize_inplace(X,center,scale):
    X-=center.reshape(1,1,-1)
    X/=scale.reshape(1,1,-1)
    np.clip(X,-8.0,8.0,out=X)
    return X

def _choose_selective_gate(y,prob):
    best=None;n=len(y)
    thirds=[(0,n//3),(n//3,2*n//3),(2*n//3,n)]
    for threshold in [.50,.54,.58,.62,.66,.70]:
        for margin in [.05,.08,.12,.16,.20]:
            m=_selected_metrics(y,prob,threshold,margin)
            if m["selectiveN"]<80 or m["selectiveCoverage"]<.04:continue
            windows=[];valid=True
            for a,b in thirds:
                w=_selected_metrics(y[a:b],prob[a:b],threshold,margin)
                if w["selectiveN"]<18 or w["selectiveCoverage"]<.025:
                    valid=False;break
                windows.append(w["selectiveAccuracy"])
            if not valid:continue
            worst=min(windows);spread=max(windows)-min(windows)
            score=.62*worst+.30*m["selectiveAccuracy"]+.08*min(.20,m["selectiveCoverage"])-.14*spread
            if best is None or score>best[0]:best=(score,threshold,margin,m,worst,spread)
    if best:return float(best[1]),float(best[2])
    return .62,.12

def _probs(model,X,batch=EVAL_BATCH):
    model.eval();outs=[]
    with torch.no_grad():
        for i in range(0,len(X),batch):
            z=torch.from_numpy(X[i:i+batch]).to(DEVICE)
            outs.append(torch.softmax(model(z),dim=1).cpu().numpy())
    return np.concatenate(outs,axis=0) if outs else np.empty((0,3))

def _path_decode(y):
    a=np.asarray(y,dtype=np.float32)
    return np.column_stack([
        a[:,0]*PATH_END_SCALE_BPS,
        a[:,1]*PATH_RANGE_SCALE_BPS,
        a[:,2]*PATH_RANGE_SCALE_BPS,
        a[:,3]*HORIZON*INTERVAL
    ])

def _path_metrics(y_true,y_pred,baseline):
    yt=_path_decode(y_true);yp=_path_decode(y_pred)
    end_mae=float(np.mean(np.abs(yt[:,0]-yp[:,0])))
    up_mae=float(np.mean(np.abs(yt[:,1]-yp[:,1])))
    down_mae=float(np.mean(np.abs(yt[:,2]-yp[:,2])))
    time_mae=float(np.mean(np.abs(yt[:,3]-yp[:,3])))
    end_base=float(np.mean(np.abs(yt[:,0]-baseline["end"]))) or 1e-9
    up_base=float(np.mean(np.abs(yt[:,1]-baseline["up"]))) or 1e-9
    down_base=float(np.mean(np.abs(yt[:,2]-baseline["down"]))) or 1e-9
    time_base=float(np.mean(np.abs(yt[:,3]-baseline["time"]))) or 1e-9
    range_mae=(up_mae+down_mae)/2
    range_base=(up_base+down_base)/2
    return {
        "endMaeBps":end_mae,"upMaeBps":up_mae,"downMaeBps":down_mae,"rangeMaeBps":range_mae,
        "timeMaeSeconds":time_mae,
        "endSkill":1-end_mae/end_base,
        "rangeSkill":1-range_mae/max(range_base,1e-9),
        "timeSkill":1-time_mae/time_base,
        "n":int(len(yt))
    }

def _path_predict_batch(model,X,batch=EVAL_BATCH):
    model.eval();outs=[]
    with torch.no_grad():
        for i in range(0,len(X),batch):
            z=torch.from_numpy(X[i:i+batch]).to(DEVICE)
            outs.append(model(z).cpu().numpy())
    return np.concatenate(outs,axis=0) if outs else np.empty((0,4),dtype=np.float32)

def _fit_path(Xtr,ytr,Xv,yv):
    model=PricePathNet().to(DEVICE)
    loss_fn=nn.SmoothL1Loss(beta=.08)
    opt=torch.optim.AdamW(model.parameters(),lr=7e-4,weight_decay=2.5e-3)
    best=None;best_loss=1e9;bad=0
    rng=np.random.default_rng(177)
    for epoch in range(22):
        model.train();idx=np.arange(len(Xtr));rng.shuffle(idx)
        for i in range(0,len(idx),TRAIN_BATCH):
            bi=idx[i:i+TRAIN_BATCH]
            xb=torch.from_numpy(Xtr[bi]).to(DEVICE);yb=torch.from_numpy(ytr[bi]).to(DEVICE)
            opt.zero_grad(set_to_none=True);loss=loss_fn(model(xb),yb);loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),1.0);opt.step()
        model.eval();losses=[]
        with torch.no_grad():
            for i in range(0,len(Xv),EVAL_BATCH):
                xb=torch.from_numpy(Xv[i:i+EVAL_BATCH]).to(DEVICE);yb=torch.from_numpy(yv[i:i+EVAL_BATCH]).to(DEVICE)
                losses.append(float(loss_fn(model(xb),yb).cpu()))
        vl=float(np.mean(losses)) if losses else 9
        if vl<best_loss-1e-4:
            best_loss=vl;bad=0
            best={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
        else:
            bad+=1
            if bad>=5:break
    if best:model.load_state_dict(best)
    return model

def _train_path():
    global PATH_MODEL,PATH_METRICS,PATH_NORM_MEAN,PATH_NORM_STD,PATH_TRAINING,PATH_LAST_TRAIN_AT,PATH_LAST_ERROR
    if PATH_TRAINING:return
    PATH_TRAINING=True
    try:
        if _rss_mb()>MEMORY_TRAIN_START_MB:
            raise RuntimeError(f"memory_guard rss={_rss_mb()}MB")
        X,y=_path_dataset()
        if X is None or len(y)<MIN_SNAPSHOTS:return
        a=int(len(y)*.70);b=int(len(y)*.85);purge=HORIZON+2
        train_stop=max(1,a-purge)
        center,scale=_fit_normalizer(X[:train_stop])
        _normalize_inplace(X,center,scale)
        Xtr,Xv,Xte=X[:train_stop],X[a:max(a+1,b-purge)],X[b:]
        ytr,yv,yte=y[:train_stop],y[a:max(a+1,b-purge)],y[b:]
        decoded=_path_decode(ytr)
        baseline={
            "end":float(np.median(decoded[:,0])),
            "up":float(np.median(decoded[:,1])),
            "down":float(np.median(decoded[:,2])),
            "time":float(np.median(decoded[:,3]))
        }
        model=_fit_path(Xtr,ytr,Xv,yv)
        pv=_path_predict_batch(model,Xv);pt=_path_predict_batch(model,Xte)
        vm=_path_metrics(yv,pv,baseline);tm=_path_metrics(yte,pt,baseline)
        ready=bool(
            vm["n"]>=150 and tm["n"]>=150 and
            vm["endSkill"]>=.02 and tm["endSkill"]>=.03 and
            vm["rangeSkill"]>=.03 and tm["rangeSkill"]>=.04 and
            vm["timeSkill"]>=0 and tm["timeSkill"]>=0
        )
        metrics={"validation":vm,"holdout":tm,"baseline":baseline,"ready":ready,"samples":int(len(y))}
        trained=int(time.time()*1000)
        obj={"version":APP_VERSION,"state_dict":model.state_dict(),"metrics":metrics,"normMean":center.tolist(),"normStd":scale.tolist(),"trainedAt":trained}
        tmp=PATH_MODEL_PATH.with_suffix(".tmp");torch.save(obj,tmp);os.replace(tmp,PATH_MODEL_PATH)
        PATH_MODEL=model.eval();PATH_METRICS=metrics;PATH_NORM_MEAN=center;PATH_NORM_STD=scale;PATH_LAST_TRAIN_AT=trained;PATH_LAST_ERROR=None
        print("[PRICE-PATH-TRAIN] "+json.dumps({"version":APP_VERSION,"metrics":metrics}),flush=True)
    except Exception as e:
        PATH_LAST_ERROR=f"train:{type(e).__name__}:{e}"
        print("[PRICE-PATH-ERROR] "+json.dumps({"error":PATH_LAST_ERROR}),flush=True)
    finally:
        PATH_TRAINING=False
        gc.collect()

def _fit_once(Xtr,ytr,Xv,yv):
    model=HybridMicroNet().to(DEVICE)
    counts=np.bincount(ytr,minlength=3).astype(np.float32)
    weights=(counts.sum()/np.maximum(counts,1));weights=weights/weights.mean()
    loss_fn=nn.CrossEntropyLoss(weight=torch.tensor(weights,dtype=torch.float32,device=DEVICE))
    opt=torch.optim.AdamW(model.parameters(),lr=8e-4,weight_decay=2e-3)
    best=None;best_loss=1e9;bad=0
    rng=np.random.default_rng(77)
    for epoch in range(24):
        model.train()
        idx=np.arange(len(Xtr));rng.shuffle(idx)
        for i in range(0,len(idx),TRAIN_BATCH):
            bi=idx[i:i+TRAIN_BATCH]
            xb=torch.from_numpy(Xtr[bi]).to(DEVICE);yb=torch.from_numpy(ytr[bi]).to(DEVICE)
            opt.zero_grad(set_to_none=True)
            loss=loss_fn(model(xb),yb);loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),1.0)
            opt.step()
        model.eval();losses=[]
        with torch.no_grad():
            for i in range(0,len(Xv),EVAL_BATCH):
                xb=torch.from_numpy(Xv[i:i+EVAL_BATCH]).to(DEVICE);yb=torch.from_numpy(yv[i:i+EVAL_BATCH]).to(DEVICE)
                losses.append(float(loss_fn(model(xb),yb).cpu()))
        vl=float(np.mean(losses)) if losses else 9
        if vl<best_loss-1e-4:
            best_loss=vl;bad=0
            best={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
        else:
            bad+=1
            if bad>=5:break
    if best:model.load_state_dict(best)
    return model

def _train():
    global MODEL,METRICS,NORM_MEAN,NORM_STD,TRAINING,LAST_TRAIN_AT,LAST_ERROR
    if TRAINING:return
    TRAINING=True
    try:
        if _rss_mb()>MEMORY_TRAIN_START_MB:
            raise RuntimeError(f"memory_guard rss={_rss_mb()}MB")
        X,y=_dataset()
        if X is None or len(y)<MIN_SNAPSHOTS:return
        a=int(len(y)*.70);b=int(len(y)*.85);purge=HORIZON+2
        train_stop=max(1,a-purge)
        center,scale=_fit_normalizer(X[:train_stop])
        _normalize_inplace(X,center,scale)
        Xtr,Xv,Xte=X[:train_stop],X[a:max(a+1,b-purge)],X[b:]
        ytr,yv,yte=y[:train_stop],y[a:max(a+1,b-purge)],y[b:]
        model=_fit_once(Xtr,ytr,Xv,yv)
        pv=_probs(model,Xv)
        threshold,margin=_choose_selective_gate(yv,pv)
        pt=_probs(model,Xte)
        vm=_selected_metrics(yv,pv,threshold,margin);tm=_selected_metrics(yte,pt,threshold,margin)
        class_rates=np.bincount(y,minlength=3)/max(1,len(y))
        ready=bool(
            vm["selectiveN"]>=80 and tm["selectiveN"]>=80 and
            vm["selectiveCoverage"]>=.04 and tm["selectiveCoverage"]>=.04 and
            vm["selectiveAccuracy"]>=.57 and tm["selectiveAccuracy"]>=.59
        )
        metrics={"validation":vm,"holdout":tm,"ready":ready,"samples":int(len(y)),
                 "threshold":threshold,"margin":margin,
                 "classRates":{"down":float(class_rates[0]),"noise":float(class_rates[1]),"up":float(class_rates[2])},
                 "purge":purge,"normalization":"train-only robust median/IQR"}
        trained=int(time.time()*1000)
        obj={"version":APP_VERSION,"state_dict":model.state_dict(),"metrics":metrics,
             "normMean":center.tolist(),"normStd":scale.tolist(),"trainedAt":trained}
        tmp=MODEL_PATH.with_suffix(".tmp");torch.save(obj,tmp);os.replace(tmp,MODEL_PATH)
        MODEL=model.eval();METRICS=metrics;NORM_MEAN=center;NORM_STD=scale;LAST_TRAIN_AT=trained;LAST_ERROR=None
        print("[NEURAL-TRAIN] "+json.dumps({"version":APP_VERSION,"metrics":metrics}),flush=True)
        # Price-path training starts on a later collector tick, after this function
        # releases the classifier dataset/model optimizer memory.
    except Exception as e:
        LAST_ERROR=f"train:{type(e).__name__}:{e}"
        print("[NEURAL-TRAIN-ERROR] "+json.dumps({"error":LAST_ERROR}),flush=True)
    finally:
        TRAINING=False
        gc.collect()

def _collector():
    global LAST_SNAPSHOT_AT,LAST_ERROR,PENDING
    while True:
        try:
            bids,asks=_fetch_depth();mid,feat=_features(bids,asks)
            row={"t":int(time.time()*1000),"mid":mid,"f":feat}
            with LOCK:
                ROWS.append(row);PENDING.append(row)
                if len(PENDING)>=10:_flush()
                n=len(ROWS)
            LAST_SNAPSHOT_AT=row["t"];LAST_ERROR=None
            if n>=MIN_SNAPSHOTS and not TRAINING and row["t"]-LAST_TRAIN_AT>RETRAIN_SECONDS*1000 and _rss_mb()<=MEMORY_TRAIN_START_MB:
                threading.Thread(target=_train,daemon=True,name="neural-trainer").start()
            elif n>=MIN_SNAPSHOTS and not PATH_TRAINING and PATH_MODEL is None and _rss_mb()<=MEMORY_TRAIN_START_MB:
                threading.Thread(target=_train_path,daemon=True,name="price-path-trainer").start()
        except Exception as e:
            LAST_ERROR=f"collector:{type(e).__name__}:{e}"
        time.sleep(max(.8,INTERVAL))

def _predict_path(rows):
    if PATH_MODEL is None or len(rows)<SEQ_LEN:
        return {"status":"COLLECTING" if len(rows)<MIN_SNAPSHOTS else "TRAINING","ready":False,"samples":len(rows),"metrics":PATH_METRICS}
    x=np.asarray([[r["f"] for r in rows[-SEQ_LEN:]]],dtype=np.float32)
    if PATH_NORM_MEAN is None or PATH_NORM_STD is None:
        return {"status":"SHADOW","ready":False,"samples":len(rows),"metrics":PATH_METRICS,"reason":"normalizer_unavailable"}
    x=_normalize(x,PATH_NORM_MEAN,PATH_NORM_STD)
    pred=_path_predict_batch(PATH_MODEL,x)[0]
    end_bps=float(pred[0]*PATH_END_SCALE_BPS)
    up_bps=float(pred[1]*PATH_RANGE_SCALE_BPS)
    down_bps=float(pred[2]*PATH_RANGE_SCALE_BPS)
    hit_seconds=float(pred[3]*HORIZON*INTERVAL)
    mid=float(rows[-1]["mid"])
    score=(up_bps-down_bps)+end_bps*.8
    side="BUY" if score>=0 else "SELL"
    target_bps=max(LABEL_BPS,min(up_bps,max(LABEL_BPS,abs(end_bps)))) if side=="BUY" else max(LABEL_BPS,min(down_bps,max(LABEL_BPS,abs(end_bps))))
    direction=1 if side=="BUY" else -1
    ready=bool(PATH_METRICS and PATH_METRICS.get("ready"))
    return {
        "status":"READY" if ready else "SHADOW","ready":ready,"side":side,
        "currentPrice":round(mid,2),
        "expectedPrice":round(mid*(1+end_bps/10000),2),
        "firstTarget":round(mid*(1+direction*target_bps/10000),2),
        "rangeHigh":round(mid*(1+up_bps/10000),2),
        "rangeLow":round(mid*(1-down_bps/10000),2),
        "expectedMoveBps":round(end_bps,3),
        "upExcursionBps":round(up_bps,3),
        "downExcursionBps":round(down_bps,3),
        "firstHitSeconds":round(max(INTERVAL,hit_seconds),1),
        "horizonSeconds":round(HORIZON*INTERVAL,1),
        "metrics":PATH_METRICS
    }

def _predict():
    with LOCK: rows=list(ROWS)
    price_path=_predict_path(rows)
    if MODEL is None or len(rows)<SEQ_LEN:
        return {"ok":True,"version":APP_VERSION,"status":"COLLECTING" if len(rows)<MIN_SNAPSHOTS else "TRAINING",
                "ready":False,"side":"WAIT","samples":len(rows),"metrics":METRICS,"pricePath":price_path}
    x=np.asarray([[r["f"] for r in rows[-SEQ_LEN:]]],dtype=np.float32)
    if NORM_MEAN is None or NORM_STD is None:
        return {"ok":True,"version":APP_VERSION,"status":"SHADOW","ready":False,"side":"WAIT","samples":len(rows),"metrics":METRICS,"pricePath":price_path,"reason":"normalizer_unavailable"}
    x=_normalize(x,NORM_MEAN,NORM_STD)
    p=_probs(MODEL,x)[0];down,noise,up=map(float,p)
    lean="BUY" if up>=down else "SELL"
    direction=max(up,down)
    threshold=float((METRICS or {}).get("threshold",.62));margin=float((METRICS or {}).get("margin",.12))
    active=bool(METRICS and METRICS.get("ready") and direction>=threshold and direction-noise>=margin)
    conf=round(cap(50+(direction-noise)*85+abs(up-down)*30,45,91))
    return {"ok":True,"version":APP_VERSION,"status":"READY" if active else "SHADOW","ready":bool(METRICS and METRICS.get("ready")),
            "side":lean if active else "WAIT","leanSide":lean,"probUp":round(up*100,2),"probDown":round(down*100,2),
            "probNoise":round(noise*100,2),"confidence":conf,"edge":round(abs(up-down)*100,2),
            "samples":len(rows),"metrics":METRICS,"pricePath":price_path,"snapshotAgeMs":max(0,int(time.time()*1000)-LAST_SNAPSHOT_AT)}

@app.on_event("startup")
def startup():
    _load_rows();_load_model();_load_path_model()
    threading.Thread(target=_collector,daemon=True,name="neural-l2-collector").start()

@app.get("/health")
def health():
    return {"ok":True,"version":APP_VERSION,"runtimeRevision":RUNTIME_REVISION,"training":TRAINING,"pathTraining":PATH_TRAINING,
            "storedSnapshots":len(ROWS),"trainingMaxSamples":TRAIN_MAX_SAMPLES,"rssMb":_rss_mb(),"lastSnapshotAt":LAST_SNAPSHOT_AT,
            "lastTrainAt":LAST_TRAIN_AT,"pathLastTrainAt":PATH_LAST_TRAIN_AT,"lastError":LAST_ERROR,"pathLastError":PATH_LAST_ERROR,"prediction":_predict()}

@app.get("/predict")
def predict():
    return _predict()
