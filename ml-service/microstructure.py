import json, os, threading, time
from collections import deque
from bisect import bisect_left
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import requests
from sklearn.metrics import accuracy_score
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

class MicrostructureCore:
    def __init__(self, model_dir:Path):
        self.model_dir=Path(model_dir)
        self.data_path=self.model_dir/"l2_microstructure.jsonl"
        self.model_path=self.model_dir/"microstructure_mlp.joblib"
        self.interval=float(os.getenv("MICRO_DEPTH_INTERVAL","2.0"))
        self.seq_len=int(os.getenv("MICRO_SEQ_LEN","12"))
        self.horizon=int(os.getenv("MICRO_HORIZON_STEPS","15"))
        self.horizon_ms=int(float(os.getenv("MICRO_HORIZON_SECONDS",str(self.interval*self.horizon)))*1000)
        self.max_gap_ms=max(5000,int(self.interval*3000))
        self.train_lock=threading.Lock()
        self.min_train=int(os.getenv("MICRO_MIN_TRAIN","1600"))
        self.max_mem=int(os.getenv("MICRO_MAX_MEMORY","18000"))
        self.threshold_bps=float(os.getenv("MICRO_LABEL_BPS","0.8"))
        self.rows=deque(maxlen=self.max_mem)
        self.pending=[]
        self.lock=threading.Lock()
        self.training=False
        self.started=False
        self.last_error=None
        self.last_snapshot_at=0
        self.last_train_at=0
        self.model=None
        self.metrics=None
        self.version="micro-neural-v2-causal"
        self._load_rows()
        self._load_model()

    def _load_rows(self):
        try:
            if not self.data_path.exists(): return
            tail=deque(maxlen=self.max_mem)
            with self.data_path.open("r",encoding="utf-8") as f:
                for line in f:
                    try: tail.append(json.loads(line))
                    except Exception: pass
            self.rows=tail
        except Exception as e:
            self.last_error=f"load_rows:{e}"

    def _load_model(self):
        try:
            if not self.model_path.exists(): return
            obj=joblib.load(self.model_path)
            if obj.get("version")!=self.version:return
            self.model=obj.get("model");self.metrics=obj.get("metrics");self.last_train_at=int(obj.get("trainedAt",0))
        except Exception as e:
            self.last_error=f"load_model:{e}"

    def start(self):
        if self.started:return
        self.started=True
        threading.Thread(target=self._loop,daemon=True,name="l2-micro-collector").start()

    def _fetch_depth(self):
        r=requests.get(
            "https://data-api.binance.vision/api/v3/depth",
            params={"symbol":"BTCUSDT","limit":"100"},
            timeout=5,
            headers={"User-Agent":"PredatorMicrostructure/1.0","Accept":"application/json"}
        )
        r.raise_for_status()
        j=r.json()
        bids=[(float(p),float(q)) for p,q in (j.get("bids") or [])[:10]]
        asks=[(float(p),float(q)) for p,q in (j.get("asks") or [])[:10]]
        if len(bids)<10 or len(asks)<10: raise RuntimeError("depth_short")
        return bids,asks

    def _features(self,bids,asks):
        bid,ask=bids[0][0],asks[0][0]
        mid=(bid+ask)/2
        spread=(ask-bid)/mid*10000
        bq=np.array([q for _,q in bids],dtype=float); aq=np.array([q for _,q in asks],dtype=float)
        bp=np.array([(p-mid)/mid*10000 for p,_ in bids],dtype=float)
        ap=np.array([(p-mid)/mid*10000 for p,_ in asks],dtype=float)
        bsum=float(bq.sum()); asum=float(aq.sum()); total=max(1e-9,bsum+asum)
        def imb(n):
            b=float(bq[:n].sum());a=float(aq[:n].sum());return (b-a)/max(1e-9,b+a)
        micro=(ask*bq[0]+bid*aq[0])/max(1e-9,bq[0]+aq[0])
        micro_bps=(micro-mid)/mid*10000
        # normalize depth quantities by total visible top-10 depth
        bqn=bq/total;aqn=aq/total
        prev=self.rows[-1] if self.rows else None
        prevf=(prev or {}).get("f") or []
        prev_bid_depth=float(prevf[46]) if len(prevf)>47 else bsum/total
        prev_ask_depth=float(prevf[47]) if len(prevf)>47 else asum/total
        bid_depth=bsum/total;ask_depth=asum/total
        pull_bid=bid_depth-prev_bid_depth;pull_ask=ask_depth-prev_ask_depth
        vec=list(bp)+list(bqn)+list(ap)+list(aqn)+[
            float(spread),float(micro_bps),float(imb(1)),float(imb(3)),float(imb(5)),float(imb(10)),
            float(bid_depth),float(ask_depth),float(pull_bid),float(pull_ask)
        ]
        return mid,vec

    def _append(self,row):
        with self.lock:
            self.rows.append(row);self.pending.append(row)
            if len(self.pending)>=20:
                self.data_path.parent.mkdir(parents=True,exist_ok=True)
                with self.data_path.open("a",encoding="utf-8") as f:
                    for x in self.pending:f.write(json.dumps(x,separators=(",",":"))+"\n")
                self.pending.clear()
                try:
                    if self.data_path.stat().st_size>120*1024*1024:
                        tmp=self.data_path.with_suffix(".tmp")
                        with tmp.open("w",encoding="utf-8") as out:
                            for x in list(self.rows)[-100000:]:out.write(json.dumps(x,separators=(",",":"))+"\n")
                        os.replace(tmp,self.data_path)
                except Exception: pass

    def _loop(self):
        while True:
            try:
                bids,asks=self._fetch_depth()
                mid,vec=self._features(bids,asks)
                now=int(time.time()*1000)
                self._append({"t":now,"mid":mid,"f":vec})
                self.last_snapshot_at=now;self.last_error=None
                if len(self.rows)>=self.min_train and not self.training and (now-self.last_train_at>15*60*1000):
                    threading.Thread(target=self._train,daemon=True,name="l2-micro-trainer").start()
            except Exception as e:
                self.last_error=f"{type(e).__name__}:{e}"
            time.sleep(max(.8,self.interval))

    def _dataset(self):
        with self.lock: rows=list(self.rows)
        times=[int(r["t"]) for r in rows]
        xs=[];ys=[];starts=[];ends=[]
        for i in range(self.seq_len-1,len(rows)):
            j=bisect_left(times,times[i]+self.horizon_ms,lo=i+1)
            if j>=len(rows):break
            start=i-self.seq_len+1
            window=rows[start:j+1]
            if times[j]-(times[i]+self.horizon_ms)>self.max_gap_ms:continue
            if any(b<=a or b-a>self.max_gap_ms for a,b in zip(times[start:j],times[start+1:j+1])):continue
            if any(not np.isfinite(float(z["mid"])) or float(z["mid"])<=0 or
                   len(z["f"])!=50 or not np.isfinite(z["f"]).all() for z in window):continue
            mid=float(rows[i]["mid"]);fm=float(rows[j]["mid"])
            move=(fm-mid)/mid*10000
            y=2 if move>=self.threshold_bps else 0 if move<=-self.threshold_bps else 1
            seq=rows[start:i+1];x=[]
            for z in seq:x.extend(z["f"])
            x.extend([(float(z["mid"])-mid)/mid*10000 for z in seq])
            xs.append(x);ys.append(y);starts.append(times[start]);ends.append(times[j])
        return (np.asarray(xs,dtype=np.float32),np.asarray(ys,dtype=np.int64),
                np.asarray(starts,dtype=np.int64),np.asarray(ends,dtype=np.int64))

    @staticmethod
    def _time_splits(starts,ends):
        n=len(starts);a=int(n*.70);b=int(n*.85)
        if n<10:raise ValueError("insufficient chronological samples")
        # Purge the complete feature sequence AND target interval at each boundary.
        train=np.flatnonzero((np.arange(n)<a)&(ends<starts[a]))
        valid=np.flatnonzero((np.arange(n)>=a)&(np.arange(n)<b)&(ends<starts[b]))
        test=np.arange(b,n)
        if min(len(train),len(valid),len(test))<30:raise ValueError("insufficient purged samples")
        return train,valid,test

    @staticmethod
    def _class_probs(model,X):
        raw=model.predict_proba(X)
        out=np.zeros((len(X),3),dtype=float)
        for i,k in enumerate(model.classes_):
            if 0<=int(k)<=2:out[:,int(k)]=raw[:,i]
        return out

    def _selective_metrics(self,y,p,threshold=.50,margin=.06):
        pred=np.argmax(p,axis=1);down,noise,up=p[:,0],p[:,1],p[:,2]
        direction=np.maximum(down,up)
        mask=(direction>=threshold)&((direction-noise)>=margin)
        sn=int(mask.sum())
        acc=float(accuracy_score(y[mask],pred[mask])) if sn else 0.0
        return {"selectiveAccuracy":acc,"selectiveCoverage":float(mask.mean()) if len(mask) else 0.0,"selectiveN":sn,"n":int(len(y))}

    def _train(self):
        if not self.train_lock.acquire(blocking=False):return
        self.training=True
        try:
            X,y,starts,ends=self._dataset()
            if len(y)<self.min_train:return
            it,iv,ie=self._time_splits(starts,ends)
            Xtr,Xv,Xte=X[it],X[iv],X[ie];ytr,yv,yte=y[it],y[iv],y[ie]
            if len(np.unique(ytr))<2:raise ValueError("insufficient training classes")
            model=Pipeline([
                ("scale",StandardScaler()),
                ("mlp",MLPClassifier(hidden_layer_sizes=(72,36),activation="relu",solver="adam",alpha=.002,
                    batch_size=128,learning_rate_init=.001,max_iter=45,early_stopping=False,shuffle=False,
                    n_iter_no_change=6,random_state=77))
            ])
            model.fit(Xtr,ytr)
            pv=self._class_probs(model,Xv);pt=self._class_probs(model,Xte)
            vm=self._selective_metrics(yv,pv);tm=self._selective_metrics(yte,pt)
            baseline=int(np.argmax(np.bincount(ytr,minlength=3)))
            for labels,prob,metric in ((yv,pv,vm),(yte,pt,tm)):
                direction=np.maximum(prob[:,0],prob[:,2])
                mask=(direction>=.50)&(direction-prob[:,1]>=.06)
                base=float(np.mean(labels[mask]==baseline)) if mask.any() else 0.0
                metric["pairedBaselineAccuracy"]=base
                metric["edgeVsBaseline"]=metric["selectiveAccuracy"]-base
            ready=bool(vm["edgeVsBaseline"]>=.02 and tm["edgeVsBaseline"]>=.02 and vm["selectiveN"]>=70 and tm["selectiveN"]>=70 and vm["selectiveAccuracy"]>=.55 and tm["selectiveAccuracy"]>=.57 and vm["selectiveCoverage"]>=.04 and tm["selectiveCoverage"]>=.04)
            metrics={"validation":vm,"holdout":tm,"ready":ready,"samples":int(len(y)),
                     "evaluationProtocol":"purged-sequence-holdout-v1","horizonSeconds":self.horizon_ms/1000,
                     "splitRows":{"train":len(it),"validation":len(iv),"holdout":len(ie)}}
            # Persist exactly the estimator scored on untouched data; no full-data refit.
            obj={"version":self.version,"model":model,"metrics":metrics,"trainedAt":int(time.time()*1000)}
            tmp=self.model_path.with_suffix(".tmp");joblib.dump(obj,tmp);os.replace(tmp,self.model_path)
            self.model=model;self.metrics=metrics;self.last_train_at=obj["trainedAt"];self.last_error=None
        except Exception as e:
            self.last_error=f"train:{type(e).__name__}:{e}"
        finally:
            self.last_train_at=int(time.time()*1000)
            self.training=False
            self.train_lock.release()

    def predict(self):
        with self.lock: rows=list(self.rows)
        if len(rows)<self.seq_len:
            return {"ok":True,"version":self.version,"status":"COLLECTING","ready":False,"samples":len(rows),"side":"WAIT"}
        if self.model is None:
            return {"ok":True,"version":self.version,"status":"COLLECTING" if len(rows)<self.min_train else "TRAINING","ready":False,"samples":len(rows),"side":"WAIT","metrics":self.metrics}
        seq=rows[-self.seq_len:]
        now=int(time.time()*1000)
        times=[int(z["t"]) for z in seq]
        if (now-times[-1]>max(15000,self.max_gap_ms) or times[-1]>now or
            any(b<=a or b-a>self.max_gap_ms for a,b in zip(times,times[1:])) or
            any(float(z["mid"])<=0 or not np.isfinite(float(z["mid"])) or
                len(z["f"])!=50 or not np.isfinite(z["f"]).all() for z in seq)):
            return {"ok":True,"version":self.version,"status":"STALE","ready":False,
                    "samples":len(rows),"side":"WAIT","metrics":self.metrics}
        seq=rows[-self.seq_len:];base=float(seq[-1]["mid"]);x=[]
        for z in seq:x.extend(z["f"])
        x.extend([(float(z["mid"])-base)/base*10000 for z in seq])
        p=self.model.predict_proba(np.asarray([x],dtype=np.float32))[0]
        classes=list(getattr(self.model.named_steps["mlp"],"classes_",range(len(p))))
        out=np.zeros(3)
        for i,k in enumerate(classes):
            if 0<=int(k)<=2:out[int(k)]=float(p[i])
        if out.sum()>0:out/=out.sum()
        down,noise,up=map(float,out)
        lean="BUY" if up>=down else "SELL"
        d=max(up,down);active=d>=.50 and d-noise>=.06 and bool(self.metrics and self.metrics.get("ready"))
        conf=round(min(90,max(45,50+(d-noise)*80+abs(up-down)*30)))
        return {"ok":True,"version":self.version,"status":"READY" if active else "SHADOW","ready":bool(self.metrics and self.metrics.get("ready")),
            "side":lean if active else "WAIT","leanSide":lean,"confidence":conf,"probUp":round(up*100,2),"probDown":round(down*100,2),
            "probNoise":round(noise*100,2),"edge":round(abs(up-down)*100,2),"samples":len(rows),"metrics":self.metrics,
            "snapshotAgeMs":max(0,int(time.time()*1000)-self.last_snapshot_at)}

    def status(self):
        try:size=self.data_path.stat().st_size
        except Exception:size=0
        p=self.predict()
        return {"version":self.version,"started":self.started,"training":self.training,"storedSnapshots":len(self.rows),
            "persistedBytes":size,"lastSnapshotAt":self.last_snapshot_at,"lastTrainAt":self.last_train_at,"lastError":self.last_error,
            "prediction":p}
