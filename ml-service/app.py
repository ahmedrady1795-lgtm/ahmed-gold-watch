import os, json, time, threading, traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sklearn.metrics import accuracy_score, balanced_accuracy_score, log_loss, brier_score_loss
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier

APP_VERSION="predator-ml-v1"
MODEL_DIR=Path(os.getenv("MODEL_DIR","/data")); MODEL_DIR.mkdir(parents=True,exist_ok=True)
MODEL_PATH=MODEL_DIR/"btc_ml_ensemble.joblib"
META_PATH=MODEL_DIR/"btc_ml_meta.json"
TRAIN_CANDLES=int(os.getenv("ML_TRAINING_CANDLES","30000"))
RETRAIN_SECONDS=int(os.getenv("ML_RETRAIN_SECONDS",str(6*3600)))
MIN_TRAIN_ROWS=int(os.getenv("ML_MIN_TRAIN_ROWS","5000"))
REQUEST_TIMEOUT=float(os.getenv("ML_HTTP_TIMEOUT","10"))

app=FastAPI(title="Predator ML Engine",version=APP_VERSION)
LOCK=threading.Lock()
STATE={"status":"BOOTING","trainedAt":0,"lastError":None,"modelLoaded":False,"training":False,"metrics":None,"historyRows":0,"source":None}
MODELS:dict[str,Any]={}

FEATURES=[
"ret1","ret2","ret3","ret5","ret10","ret20","body","upper_wick","lower_wick","range_atr","atr_pct",
"ema5_gap","ema10_gap","ema20_gap","ema50_gap","ema20_slope","ema50_slope","rsi14","stoch14","bb_pos","bb_width",
"vol5","vol10","vol20","volume_z20","volume_ratio5_20","break_high10","break_low10","eff5","eff10","compression",
"m5_ret1","m5_ret3","m5_ema5_gap","m5_ema20_gap","m5_rsi14","hour_sin","hour_cos"
]

class Candle(BaseModel):
    time:int
    open:float
    high:float
    low:float
    close:float
    volume:float|None=None

class PredictBody(BaseModel):
    candles:list[Candle]

def rsi(close,n=14):
    d=close.diff(); up=d.clip(lower=0).ewm(alpha=1/n,adjust=False).mean(); dn=(-d.clip(upper=0)).ewm(alpha=1/n,adjust=False).mean()
    rs=up/dn.replace(0,np.nan)
    return 100-100/(1+rs)

def eff(close,n):
    return (close-close.shift(n)).abs()/close.diff().abs().rolling(n).sum().replace(0,np.nan)

def build_features(df):
    d=df.copy().sort_index(); c,o,h,l,v=d.close,d.open,d.high,d.low,d.volume.fillna(0)
    prev=c.shift(1); tr=pd.concat([(h-l),(h-prev).abs(),(l-prev).abs()],axis=1).max(axis=1); atr=tr.ewm(alpha=1/14,adjust=False).mean()
    rng=(h-l).replace(0,np.nan); f=pd.DataFrame(index=d.index)
    for n in [1,2,3,5,10,20]: f[f"ret{n}"]=c.pct_change(n)
    f["body"]=(c-o)/rng
    f["upper_wick"]=(h-pd.concat([o,c],axis=1).max(axis=1))/rng
    f["lower_wick"]=(pd.concat([o,c],axis=1).min(axis=1)-l)/rng
    f["range_atr"]=(h-l)/atr.replace(0,np.nan); f["atr_pct"]=atr/c
    for n in [5,10,20,50]:
        ema=c.ewm(span=n,adjust=False).mean(); f[f"ema{n}_gap"]=(c-ema)/atr.replace(0,np.nan)
    f["ema20_slope"]=c.ewm(span=20,adjust=False).mean().diff(3)/atr.replace(0,np.nan)
    f["ema50_slope"]=c.ewm(span=50,adjust=False).mean().diff(5)/atr.replace(0,np.nan)
    f["rsi14"]=rsi(c,14)/100
    lo14,hi14=l.rolling(14).min(),h.rolling(14).max()
    f["stoch14"]=(c-lo14)/(hi14-lo14).replace(0,np.nan)
    mid,sd=c.rolling(20).mean(),c.rolling(20).std()
    f["bb_pos"]=(c-(mid-2*sd))/(4*sd).replace(0,np.nan); f["bb_width"]=(4*sd)/c
    for n in [5,10,20]: f[f"vol{n}"]=c.pct_change().rolling(n).std()
    vm,vs=v.rolling(20).mean(),v.rolling(20).std()
    f["volume_z20"]=(v-vm)/vs.replace(0,np.nan); f["volume_ratio5_20"]=v.rolling(5).mean()/vm.replace(0,np.nan)
    f["break_high10"]=(c-h.shift(1).rolling(10).max())/atr.replace(0,np.nan)
    f["break_low10"]=(c-l.shift(1).rolling(10).min())/atr.replace(0,np.nan)
    f["eff5"]=eff(c,5); f["eff10"]=eff(c,10)
    f["compression"]=tr.rolling(5).mean()/tr.rolling(20).mean().replace(0,np.nan)

    five=d.resample("5min").agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna()
    fc=five.close
    fivef=pd.DataFrame(index=five.index)
    fivef["m5_ret1"]=fc.pct_change(1); fivef["m5_ret3"]=fc.pct_change(3)
    ftr=pd.concat([(five.high-five.low),(five.high-fc.shift(1)).abs(),(five.low-fc.shift(1)).abs()],axis=1).max(axis=1)
    fatr=ftr.ewm(alpha=1/14,adjust=False).mean()
    fivef["m5_ema5_gap"]=(fc-fc.ewm(span=5,adjust=False).mean())/fatr.replace(0,np.nan)
    fivef["m5_ema20_gap"]=(fc-fc.ewm(span=20,adjust=False).mean())/fatr.replace(0,np.nan)
    fivef["m5_rsi14"]=rsi(fc,14)/100
    # A 5m bar is only legal after it has fully closed. Shift availability forward
    # so an M1 training row can never see the future minutes of its own 5m bucket.
    fivef.index=fivef.index+pd.Timedelta(minutes=5)
    f=f.join(fivef.reindex(f.index,method="ffill"))
    hour=f.index.hour+f.index.minute/60
    f["hour_sin"]=np.sin(2*np.pi*hour/24); f["hour_cos"]=np.cos(2*np.pi*hour/24)
    return f.replace([np.inf,-np.inf],np.nan)

def make_dataset(df,horizon,deadzone_atr):
    f=build_features(df); c=df.close.reindex(f.index); prev=df.close.shift(1)
    tr=pd.concat([(df.high-df.low),(df.high-prev).abs(),(df.low-prev).abs()],axis=1).max(axis=1)
    atr=tr.ewm(alpha=1/14,adjust=False).mean().reindex(f.index)
    move_atr=(c.shift(-horizon)-c)/atr.replace(0,np.nan)
    ds=f.copy(); ds["target"]=(move_atr>0).astype(int); ds["move_atr"]=move_atr
    return ds.loc[move_atr.abs()>=deadzone_atr].dropna(subset=FEATURES+["target"])

def fetch_coinbase_history(limit_rows):
    url="https://api.exchange.coinbase.com/products/BTC-USD/candles"
    sess=requests.Session(); sess.headers.update({"User-Agent":"PredatorMLEngine/1.0","Accept":"application/json"})
    rows=[]; now_ms=int(time.time()*1000); end_ms=(now_ms//60000)*60000
    chunk_minutes=280
    while len(rows)<limit_rows:
        start_ms=end_ms-chunk_minutes*60000
        params={
            "granularity":"60",
            "start":datetime.fromtimestamp(start_ms/1000,tz=timezone.utc).isoformat(),
            "end":datetime.fromtimestamp(end_ms/1000,tz=timezone.utc).isoformat()
        }
        r=sess.get(url,params=params,timeout=REQUEST_TIMEOUT)
        if r.status_code==429:
            time.sleep(1.0); continue
        r.raise_for_status(); batch=r.json()
        if not isinstance(batch,list) or not batch: break
        rows.extend(batch)
        oldest=min(int(x[0]) for x in batch)*1000
        end_ms=oldest-60000
        if len(batch)<20: break
        time.sleep(.20)
    if len(rows)<1000: raise RuntimeError(f"coinbase history too short: {len(rows)}")
    dedup={int(x[0])*1000:x for x in rows}
    ordered=[dedup[k] for k in sorted(dedup)][-limit_rows:]
    idx=pd.to_datetime([int(x[0]) for x in ordered],unit="s",utc=True)
    df=pd.DataFrame({
        "open":[float(x[3]) for x in ordered],"high":[float(x[2]) for x in ordered],"low":[float(x[1]) for x in ordered],
        "close":[float(x[4]) for x in ordered],"volume":[float(x[5]) for x in ordered]
    },index=idx)
    df=df[~df.index.duplicated(keep="last")].sort_index()
    if len(df)<1000: raise RuntimeError(f"coinbase normalized history too short: {len(df)}")
    return df

def new_models(seed):
    # Intentionally conservative trees: short-horizon market data overfits very easily.
    x=XGBClassifier(n_estimators=220,max_depth=3,learning_rate=.028,subsample=.78,colsample_bytree=.72,min_child_weight=16,
                    reg_alpha=.55,reg_lambda=4.0,gamma=.10,objective="binary:logistic",eval_metric="logloss",tree_method="hist",n_jobs=1,random_state=seed)
    l=LGBMClassifier(n_estimators=240,num_leaves=15,max_depth=5,learning_rate=.025,subsample=.78,subsample_freq=1,colsample_bytree=.72,
                     min_child_samples=70,min_split_gain=.02,reg_alpha=.55,reg_lambda=3.2,objective="binary",n_jobs=1,random_state=seed,verbosity=-1)
    return x,l

def metrics(y,p):
    pred=(p>=.5).astype(int)
    return {"accuracy":float(accuracy_score(y,pred)),"balancedAccuracy":float(balanced_accuracy_score(y,pred)),
            "logLoss":float(log_loss(y,p,labels=[0,1])),"brier":float(brier_score_loss(y,p)),
            "n":int(len(y)),"positiveRate":float(np.mean(y))}

def train_horizon(ds,horizon):
    X=ds[FEATURES].astype(float).to_numpy(); y=ds.target.astype(int).to_numpy(); n=len(y)
    if n<MIN_TRAIN_ROWS: raise RuntimeError(f"not enough rows for h{horizon}: {n}")

    # Strict chronological split: oldest 70% train, next 15% validation,
    # newest 15% untouched final holdout.
    train_end=int(n*.70); val_end=int(n*.85)
    Xtr,Xv,Xte=X[:train_end],X[train_end:val_end],X[val_end:]
    ytr,yv,yte=y[:train_end],y[train_end:val_end],y[val_end:]
    x,l=new_models(42+horizon); x.fit(Xtr,ytr); l.fit(Xtr,ytr)

    # Ensemble weights are selected ONLY on validation, never final holdout.
    pxv=x.predict_proba(Xv)[:,1]; plv=l.predict_proba(Xv)[:,1]
    mxv,mlv=metrics(yv,pxv),metrics(yv,plv)
    wx,wl=1/max(mxv["logLoss"],1e-6),1/max(mlv["logLoss"],1e-6)
    wx,wl=wx/(wx+wl),wl/(wx+wl)
    pv=pxv*wx+plv*wl; mv=metrics(yv,pv)

    # Final holdout is the only number allowed to qualify production readiness.
    pxt=x.predict_proba(Xte)[:,1]; plt=l.predict_proba(Xte)[:,1]
    mxt,mlt=metrics(yte,pxt),metrics(yte,plt)
    pt=pxt*wx+plt*wl; me=metrics(yte,pt)
    trainp=x.predict_proba(Xtr)[:,1]*wx+l.predict_proba(Xtr)[:,1]*wl
    train_acc=metrics(ytr,trainp)["accuracy"]
    gap=train_acc-me["accuracy"]; stability=abs(mv["balancedAccuracy"]-me["balancedAccuracy"])
    ready=bool(
        me["n"]>=500 and mv["n"]>=500 and
        me["accuracy"]>=.53 and me["balancedAccuracy"]>=.52 and me["logLoss"]<=.705 and
        mv["accuracy"]>=.52 and mv["balancedAccuracy"]>=.515 and mv["logLoss"]<=.715 and
        gap<=.14 and stability<=.08
    )

    # Production models see all history only AFTER the untouched holdout is scored.
    xf,lf=new_models(142+horizon); xf.fit(X,y); lf.fit(X,y)
    return {"xgb":xf,"lgb":lf,"weights":{"xgb":float(wx),"lgb":float(wl)},
            "metrics":{"ensemble":me,"validation":mv,"xgb":mxt,"lightgbm":mlt,
                       "validationXgb":mxv,"validationLightgbm":mlv,
                       "trainAccuracy":float(train_acc),"overfitGap":float(gap),
                       "validationHoldoutStability":float(stability),"ready":ready},
            "rows":n,"horizon":horizon}

def train_all():
    with LOCK:
        if STATE["training"]: return
        STATE.update({"training":True,"status":"TRAINING","lastError":None})
    try:
        hist=fetch_coinbase_history(TRAIN_CANDLES)
        source="Coinbase Exchange BTC-USD 1m"
        m1=train_horizon(make_dataset(hist,1,.04),1); m5=train_horizon(make_dataset(hist,5,.10),5)
        payload={"version":APP_VERSION,"features":FEATURES,"trainedAt":int(time.time()*1000),"historyRows":len(hist),"source":source,"models":{"m1":m1,"m5":m5}}
        tmp=MODEL_PATH.with_suffix(".tmp"); joblib.dump(payload,tmp); os.replace(tmp,MODEL_PATH)
        meta={"version":APP_VERSION,"trainedAt":payload["trainedAt"],"historyRows":len(hist),"source":payload["source"],
              "metrics":{"m1":m1["metrics"],"m5":m5["metrics"]},"rows":{"m1":m1["rows"],"m5":m5["rows"]}}
        META_PATH.write_text(json.dumps(meta,indent=2))
        MODELS.clear(); MODELS.update(payload)
        STATE.update({"status":"READY" if (m1["metrics"]["ready"] and m5["metrics"]["ready"]) else "SHADOW","trainedAt":payload["trainedAt"],
                      "modelLoaded":True,"metrics":meta["metrics"],"historyRows":len(hist),"source":payload["source"],"lastError":None})
        print("[ML-TRAIN] "+json.dumps({"status":STATE["status"],"trainedAt":payload["trainedAt"],"historyRows":len(hist),"source":source,"metrics":meta["metrics"],"rows":meta["rows"]}),flush=True)
    except Exception as e:
        STATE.update({"status":"ERROR","lastError":f"{type(e).__name__}: {e}"})
        print("[ML-TRAIN-ERROR] "+json.dumps({"error":STATE["lastError"]}),flush=True); traceback.print_exc()
    finally:
        STATE["training"]=False

def load_model():
    if not MODEL_PATH.exists(): return False
    try:
        obj=joblib.load(MODEL_PATH); MODELS.clear(); MODELS.update(obj)
        m={k:v["metrics"] for k,v in obj["models"].items()}
        STATE.update({"trainedAt":obj.get("trainedAt",0),"modelLoaded":True,"metrics":m,"historyRows":obj.get("historyRows",0),"source":obj.get("source")})
        STATE["status"]="READY" if all(v.get("ready") for v in m.values()) else "SHADOW"
        return True
    except Exception as e:
        STATE["lastError"]=f"load: {e}"; return False

def start_train_if_needed():
    loaded=load_model()
    stale=(time.time()*1000-STATE.get("trainedAt",0))>RETRAIN_SECONDS*1000
    if (not loaded) or stale: threading.Thread(target=train_all,daemon=True,name="ml-trainer").start()

def frame_from_body(candles):
    if len(candles)<220: raise HTTPException(400,"need at least 220 M1 candles")
    rows=[x.model_dump() for x in candles]
    idx=pd.to_datetime([int(x["time"]) for x in rows],unit="ms",utc=True)
    df=pd.DataFrame({"open":[x["open"] for x in rows],"high":[x["high"] for x in rows],"low":[x["low"] for x in rows],
                     "close":[x["close"] for x in rows],"volume":[float(x.get("volume") or 0) for x in rows]},index=idx).sort_index()
    return df[~df.index.duplicated(keep="last")]

def predict_h(model,x):
    px=float(model["xgb"].predict_proba(x)[0,1]); pl=float(model["lgb"].predict_proba(x)[0,1]); w=model["weights"]
    raw=px*w["xgb"]+pl*w["lgb"]; acc=float(model["metrics"].get("validation",model["metrics"]["ensemble"])["accuracy"])
    shrink=max(.25,min(1,(acc-.5)/.10)); p=.5+(raw-.5)*shrink; edge=abs(p-.5)*2
    lean="BUY" if p>=.5 else "SELL"; threshold=.56 if model["horizon"]==5 else .57
    active=p>=threshold or p<=1-threshold
    return {"side":lean if active else "WAIT","leanSide":lean,"probUp":round(p*100,2),"probDown":round((1-p)*100,2),
            "confidence":round(min(90,max(0,50+edge*50))) if active else round(50+edge*30),"edge":round(edge*100,2),
            "ready":bool(model["metrics"]["ready"]),"metrics":model["metrics"],
            "component":{"xgbUp":round(px*100,2),"lightgbmUp":round(pl*100,2),"weights":w}}

@app.on_event("startup")
def startup(): start_train_if_needed()

@app.get("/health")
def health(): return {"ok":True,"version":APP_VERSION,**STATE}

@app.post("/train")
def train():
    if STATE["training"]: return {"ok":True,"started":False,"status":"already_training"}
    threading.Thread(target=train_all,daemon=True,name="ml-trainer-manual").start()
    return {"ok":True,"started":True}

@app.post("/predict")
def predict(body:PredictBody):
    if not MODELS: load_model()
    if not MODELS: return {"ok":False,"status":STATE["status"],"reason":"model_not_ready","state":STATE}
    f=build_features(frame_from_body(body.candles)).dropna(subset=FEATURES)
    if f.empty: raise HTTPException(400,"insufficient feature history")
    x=f[FEATURES].iloc[[-1]].astype(float).to_numpy()
    m1=predict_h(MODELS["models"]["m1"],x); m5=predict_h(MODELS["models"]["m5"],x)
    aligned=m1["leanSide"]==m5["leanSide"]; consensus=m1["leanSide"] if aligned else (m1["leanSide"] if m1["edge"]>=m5["edge"] else m5["leanSide"])
    return {"ok":True,"version":APP_VERSION,"status":STATE["status"],"trainedAt":MODELS.get("trainedAt"),"source":MODELS.get("source"),
            "historyRows":MODELS.get("historyRows"),"oneMinute":m1,"fiveMinute":m5,
            "consensus":{"side":consensus,"aligned":aligned,"confidence":max(0,min(90,round(m1["confidence"]*.55+m5["confidence"]*.45+(5 if aligned else -6)))),
                         "ready":bool(m1["ready"] and m5["ready"])},
            "shadow":not (m1["ready"] and m5["ready"])}
