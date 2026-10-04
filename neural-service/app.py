import json, math, os, threading, time
from collections import deque
from pathlib import Path

import numpy as np
import requests
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI

APP_VERSION="predator-neural-v1-deeplob-tcn-ssm"
MODEL_DIR=Path(os.getenv("MODEL_DIR","/data")); MODEL_DIR.mkdir(parents=True,exist_ok=True)
DATA_PATH=MODEL_DIR/"l2_neural.jsonl"
MODEL_PATH=MODEL_DIR/"l2_neural.pt"
PORT=int(os.getenv("PORT","8000"))
INTERVAL=float(os.getenv("NEURAL_DEPTH_INTERVAL","2.0"))
SEQ_LEN=int(os.getenv("NEURAL_SEQ_LEN","32"))
HORIZON=int(os.getenv("NEURAL_HORIZON_STEPS","30"))
LABEL_BPS=float(os.getenv("NEURAL_LABEL_BPS","0.9"))
MIN_SNAPSHOTS=int(os.getenv("NEURAL_MIN_SNAPSHOTS","1800"))
MAX_SNAPSHOTS=int(os.getenv("NEURAL_MAX_SNAPSHOTS","60000"))
RETRAIN_SECONDS=int(os.getenv("NEURAL_RETRAIN_SECONDS","1800"))
LEVELS=10
FEAT_DIM=50
DEVICE=torch.device("cpu")
torch.set_num_threads(max(1,min(2,int(os.getenv("NEURAL_TORCH_THREADS","2")))))

app=FastAPI(title="Predator Neural Microstructure",version=APP_VERSION)
LOCK=threading.Lock()
ROWS=deque(maxlen=MAX_SNAPSHOTS)
PENDING=[]
MODEL=None
METRICS=None
TRAINING=False
LAST_TRAIN_AT=0
LAST_SNAPSHOT_AT=0
LAST_ERROR=None
SESSION=requests.Session()
SESSION.headers.update({"User-Agent":"PredatorNeural/1.0","Accept":"application/json"})

def cap(x,a,b): return max(a,min(b,x))

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
    global MODEL,METRICS,LAST_TRAIN_AT,LAST_ERROR
    if not MODEL_PATH.exists():return
    try:
        obj=torch.load(MODEL_PATH,map_location="cpu",weights_only=False)
        if obj.get("version")!=APP_VERSION:return
        m=HybridMicroNet()
        m.load_state_dict(obj["state_dict"]);m.eval()
        MODEL=m;METRICS=obj.get("metrics");LAST_TRAIN_AT=int(obj.get("trainedAt",0))
    except Exception as e:
        LAST_ERROR=f"load_model:{type(e).__name__}:{e}"

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

def _dataset():
    with LOCK: rows=list(ROWS)
    xs=[];ys=[]
    for i in range(SEQ_LEN-1,len(rows)-HORIZON):
        seq=rows[i-SEQ_LEN+1:i+1]
        if any(len(r.get("f",[]))!=FEAT_DIM for r in seq):continue
        cur=float(rows[i]["mid"]);fut=float(rows[i+HORIZON]["mid"])
        move=(fut-cur)/cur*10000
        y=2 if move>=LABEL_BPS else 0 if move<=-LABEL_BPS else 1
        xs.append([r["f"] for r in seq]);ys.append(y)
    if not xs:return None,None
    return np.asarray(xs,dtype=np.float32),np.asarray(ys,dtype=np.int64)

def _selected_metrics(y,prob,threshold=.48,margin=.05):
    p=np.asarray(prob);pred=p.argmax(1)
    direction=np.maximum(p[:,0],p[:,2]);noise=p[:,1]
    mask=(direction>=threshold)&((direction-noise)>=margin)
    n=int(mask.sum())
    acc=float((pred[mask]==y[mask]).mean()) if n else 0.0
    cov=float(mask.mean()) if len(mask) else 0.0
    overall=float((pred==y).mean()) if len(y) else 0.0
    return {"selectiveAccuracy":acc,"selectiveCoverage":cov,"selectiveN":n,"overallAccuracy":overall,"n":int(len(y))}

def _probs(model,X,batch=256):
    model.eval();outs=[]
    with torch.no_grad():
        for i in range(0,len(X),batch):
            z=torch.from_numpy(X[i:i+batch]).to(DEVICE)
            outs.append(torch.softmax(model(z),dim=1).cpu().numpy())
    return np.concatenate(outs,axis=0) if outs else np.empty((0,3))

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
        for i in range(0,len(idx),64):
            bi=idx[i:i+64]
            xb=torch.from_numpy(Xtr[bi]).to(DEVICE);yb=torch.from_numpy(ytr[bi]).to(DEVICE)
            opt.zero_grad(set_to_none=True)
            loss=loss_fn(model(xb),yb);loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),1.0)
            opt.step()
        model.eval();losses=[]
        with torch.no_grad():
            for i in range(0,len(Xv),256):
                xb=torch.from_numpy(Xv[i:i+256]).to(DEVICE);yb=torch.from_numpy(yv[i:i+256]).to(DEVICE)
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
    global MODEL,METRICS,TRAINING,LAST_TRAIN_AT,LAST_ERROR
    if TRAINING:return
    TRAINING=True
    try:
        X,y=_dataset()
        if X is None or len(y)<MIN_SNAPSHOTS:return
        a=int(len(y)*.70);b=int(len(y)*.85)
        Xtr,Xv,Xte=X[:a],X[a:b],X[b:];ytr,yv,yte=y[:a],y[a:b],y[b:]
        model=_fit_once(Xtr,ytr,Xv,yv)
        pv=_probs(model,Xv);pt=_probs(model,Xte)
        vm=_selected_metrics(yv,pv);tm=_selected_metrics(yte,pt)
        ready=bool(
            vm["selectiveN"]>=80 and tm["selectiveN"]>=80 and
            vm["selectiveCoverage"]>=.05 and tm["selectiveCoverage"]>=.05 and
            vm["selectiveAccuracy"]>=.56 and tm["selectiveAccuracy"]>=.58
        )
        metrics={"validation":vm,"holdout":tm,"ready":ready,"samples":int(len(y))}
        trained=int(time.time()*1000)
        # Holdout remains untouched for qualification; production artifact keeps the qualified weights.
        obj={"version":APP_VERSION,"state_dict":model.state_dict(),"metrics":metrics,"trainedAt":trained}
        tmp=MODEL_PATH.with_suffix(".tmp");torch.save(obj,tmp);os.replace(tmp,MODEL_PATH)
        MODEL=model.eval();METRICS=metrics;LAST_TRAIN_AT=trained;LAST_ERROR=None
        print("[NEURAL-TRAIN] "+json.dumps({"version":APP_VERSION,"metrics":metrics}),flush=True)
    except Exception as e:
        LAST_ERROR=f"train:{type(e).__name__}:{e}"
        print("[NEURAL-TRAIN-ERROR] "+json.dumps({"error":LAST_ERROR}),flush=True)
    finally:
        TRAINING=False

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
            if n>=MIN_SNAPSHOTS and not TRAINING and row["t"]-LAST_TRAIN_AT>RETRAIN_SECONDS*1000:
                threading.Thread(target=_train,daemon=True,name="neural-trainer").start()
        except Exception as e:
            LAST_ERROR=f"collector:{type(e).__name__}:{e}"
        time.sleep(max(.8,INTERVAL))

def _predict():
    with LOCK: rows=list(ROWS)
    if MODEL is None or len(rows)<SEQ_LEN:
        return {"ok":True,"version":APP_VERSION,"status":"COLLECTING" if len(rows)<MIN_SNAPSHOTS else "TRAINING",
                "ready":False,"side":"WAIT","samples":len(rows),"metrics":METRICS}
    x=np.asarray([[r["f"] for r in rows[-SEQ_LEN:]]],dtype=np.float32)
    p=_probs(MODEL,x)[0];down,noise,up=map(float,p)
    lean="BUY" if up>=down else "SELL"
    direction=max(up,down);active=bool(METRICS and METRICS.get("ready") and direction>=.48 and direction-noise>=.05)
    conf=round(cap(50+(direction-noise)*85+abs(up-down)*30,45,91))
    return {"ok":True,"version":APP_VERSION,"status":"READY" if active else "SHADOW","ready":bool(METRICS and METRICS.get("ready")),
            "side":lean if active else "WAIT","leanSide":lean,"probUp":round(up*100,2),"probDown":round(down*100,2),
            "probNoise":round(noise*100,2),"confidence":conf,"edge":round(abs(up-down)*100,2),
            "samples":len(rows),"metrics":METRICS,"snapshotAgeMs":max(0,int(time.time()*1000)-LAST_SNAPSHOT_AT)}

@app.on_event("startup")
def startup():
    _load_rows();_load_model()
    threading.Thread(target=_collector,daemon=True,name="neural-l2-collector").start()

@app.get("/health")
def health():
    return {"ok":True,"version":APP_VERSION,"training":TRAINING,"storedSnapshots":len(ROWS),"lastSnapshotAt":LAST_SNAPSHOT_AT,
            "lastTrainAt":LAST_TRAIN_AT,"lastError":LAST_ERROR,"prediction":_predict()}

@app.get("/predict")
def predict():
    return _predict()
