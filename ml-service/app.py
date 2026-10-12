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
from microstructure import MicrostructureCore

APP_VERSION="predator-ml-v12-purged-calibrated"
EVALUATION_PROTOCOL="purged-chronological-served-estimators-v1"
MODEL_DIR=Path(os.getenv("MODEL_DIR","/data")); MODEL_DIR.mkdir(parents=True,exist_ok=True)
MODEL_PATH=MODEL_DIR/"btc_ml_ensemble.joblib"
META_PATH=MODEL_DIR/"btc_ml_meta.json"
MICRO=MicrostructureCore(MODEL_DIR)
TRAIN_CANDLES=int(os.getenv("ML_TRAINING_CANDLES","30000"))
RETRAIN_SECONDS=int(os.getenv("ML_RETRAIN_SECONDS",str(6*3600)))
MIN_TRAIN_ROWS=int(os.getenv("ML_MIN_TRAIN_ROWS","5000"))
REQUEST_TIMEOUT=float(os.getenv("ML_HTTP_TIMEOUT","10"))

app=FastAPI(title="Predator ML Engine",version=APP_VERSION)
LOCK=threading.Lock()
STATE={"status":"BOOTING","trainedAt":0,"lastError":None,"modelLoaded":False,"training":False,"metrics":None,"historyRows":0,"source":None}
MODELS:dict[str,Any]={}

M1_FEATURES=[
"ret1","ret2","ret3","ret5","ret10","ret20","body","upper_wick","lower_wick","range_atr","atr_pct",
"ema5_gap","ema10_gap","ema20_gap","ema50_gap","ema20_slope","ema50_slope","rsi14","stoch14","bb_pos","bb_width",
"vol5","vol10","vol20","volume_z20","volume_ratio5_20","break_high10","break_low10","eff5","eff10","compression",
"m5_ret1","m5_ret3","m5_ema5_gap","m5_ema20_gap","m5_rsi14",
"m15_ret1","m15_ret3","m15_ema5_gap","m15_ema20_gap","m15_rsi14","m15_range_atr",
"quote_volume_z20","trades_z20","trades_ratio5_20","avg_trade_size_z20",
"taker_buy_ratio","taker_quote_ratio","taker_delta","taker_delta3","taker_delta5",
"cvd3","cvd10","flow_price_agreement","flow_price_divergence",
"hour_sin","hour_cos"
]
M5_EXTRA_FEATURES=[
"m5_body","m5_range_atr","m5_volume_z20","m5_trades_z20","m5_taker_delta","m5_taker_delta3","m5_cvd3","m5_eff3",
"m5_m15_alignment","phase5_sin","phase5_cos"
]
M5_FEATURES=M1_FEATURES+M5_EXTRA_FEATURES
FEATURE_SIGNATURE={"m1":M1_FEATURES,"m5":M5_FEATURES}

class Candle(BaseModel):
    time:int
    open:float
    high:float
    low:float
    close:float
    volume:float|None=None
    quote_volume:float|None=None
    trades:float|None=None
    taker_buy_base:float|None=None
    taker_buy_quote:float|None=None

class PredictBody(BaseModel):
    candles:list[Candle]

def rsi(close,n=14):
    d=close.diff(); up=d.clip(lower=0).ewm(alpha=1/n,adjust=False).mean(); dn=(-d.clip(upper=0)).ewm(alpha=1/n,adjust=False).mean()
    rs=up/dn.replace(0,np.nan)
    return 100-100/(1+rs)

def eff(close,n):
    return (close-close.shift(n)).abs()/close.diff().abs().rolling(n).sum().replace(0,np.nan)

def zscore(s,n=20):
    m=s.rolling(n).mean(); sd=s.rolling(n).std().replace(0,np.nan)
    return ((s-m)/sd).replace([np.inf,-np.inf],np.nan).fillna(0)

def ensure_micro_columns(df):
    d=df.copy()
    d["quote_volume"]=pd.to_numeric(d.get("quote_volume",d["volume"]*d["close"]),errors="coerce").fillna(d["volume"]*d["close"])
    d["trades"]=pd.to_numeric(d.get("trades",pd.Series(0,index=d.index)),errors="coerce").fillna(0)
    d["taker_buy_base"]=pd.to_numeric(d.get("taker_buy_base",d["volume"]*.5),errors="coerce").fillna(d["volume"]*.5)
    d["taker_buy_quote"]=pd.to_numeric(d.get("taker_buy_quote",d["quote_volume"]*.5),errors="coerce").fillna(d["quote_volume"]*.5)
    return d

def build_features(df):
    d=ensure_micro_columns(df).sort_index(); c,o,h,l,v=d.close,d.open,d.high,d.low,d.volume.fillna(0)
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

    five=d.resample("5min").agg({
        "open":"first","high":"max","low":"min","close":"last","volume":"sum",
        "quote_volume":"sum","trades":"sum","taker_buy_base":"sum","taker_buy_quote":"sum"
    }).dropna()
    fc=five.close
    fivef=pd.DataFrame(index=five.index)
    fivef["m5_ret1"]=fc.pct_change(1); fivef["m5_ret3"]=fc.pct_change(3)
    ftr=pd.concat([(five.high-five.low),(five.high-fc.shift(1)).abs(),(five.low-fc.shift(1)).abs()],axis=1).max(axis=1)
    fatr=ftr.ewm(alpha=1/14,adjust=False).mean()
    fivef["m5_ema5_gap"]=(fc-fc.ewm(span=5,adjust=False).mean())/fatr.replace(0,np.nan)
    fivef["m5_ema20_gap"]=(fc-fc.ewm(span=20,adjust=False).mean())/fatr.replace(0,np.nan)
    fivef["m5_rsi14"]=rsi(fc,14)/100
    five_rng=(five.high-five.low).replace(0,np.nan)
    fivef["m5_body"]=(five.close-five.open)/five_rng
    fivef["m5_range_atr"]=(five.high-five.low)/fatr.replace(0,np.nan)
    fivef["m5_volume_z20"]=zscore(five.volume,20)
    fivef["m5_trades_z20"]=zscore(five.trades,20)
    five_taker=((2*five.taker_buy_base-five.volume)/five.volume.replace(0,np.nan)).clip(-1,1).fillna(0)
    five_signed=(2*five.taker_buy_base-five.volume).fillna(0)
    fivef["m5_taker_delta"]=five_taker
    fivef["m5_taker_delta3"]=five_taker.rolling(3).mean().fillna(0)
    fivef["m5_cvd3"]=(five_signed.rolling(3).sum()/five.volume.rolling(3).sum().replace(0,np.nan)).clip(-1,1).fillna(0)
    fivef["m5_eff3"]=eff(fc,3)
    # A 5m bar is only legal after it has fully closed. Shift availability forward
    # so an M1 training row can never see the future minutes of its own 5m bucket.
    fivef.index=fivef.index+pd.Timedelta(minutes=5)
    f=f.join(fivef.reindex(f.index,method="ffill"))

    # Closed 15m context helps the 5m horizon without peeking into the active bar.
    fifteen=d.resample("15min").agg({"open":"first","high":"max","low":"min","close":"last","volume":"sum"}).dropna()
    tc=fifteen.close
    fifteenf=pd.DataFrame(index=fifteen.index)
    fifteenf["m15_ret1"]=tc.pct_change(1); fifteenf["m15_ret3"]=tc.pct_change(3)
    ttr=pd.concat([(fifteen.high-fifteen.low),(fifteen.high-tc.shift(1)).abs(),(fifteen.low-tc.shift(1)).abs()],axis=1).max(axis=1)
    tatr=ttr.ewm(alpha=1/14,adjust=False).mean()
    fifteenf["m15_ema5_gap"]=(tc-tc.ewm(span=5,adjust=False).mean())/tatr.replace(0,np.nan)
    fifteenf["m15_ema20_gap"]=(tc-tc.ewm(span=20,adjust=False).mean())/tatr.replace(0,np.nan)
    fifteenf["m15_rsi14"]=rsi(tc,14)/100
    fifteenf["m15_range_atr"]=(fifteen.high-fifteen.low)/tatr.replace(0,np.nan)
    fifteenf.index=fifteenf.index+pd.Timedelta(minutes=15)
    f=f.join(fifteenf.reindex(f.index,method="ffill"))
    f["m5_m15_alignment"]=np.sign(f["m5_ema20_gap"].fillna(0))*np.sign(f["m15_ema20_gap"].fillna(0))
    phase=(f.index.minute%5)/5
    f["phase5_sin"]=np.sin(2*np.pi*phase)
    f["phase5_cos"]=np.cos(2*np.pi*phase)

    # Aggregated microstructure available directly in Binance 1m klines.
    qv=d["quote_volume"].clip(lower=0)
    trades=d["trades"].clip(lower=0)
    tb=d["taker_buy_base"].clip(lower=0)
    tbq=d["taker_buy_quote"].clip(lower=0)
    total=v.replace(0,np.nan); qtotal=qv.replace(0,np.nan)
    taker_ratio=(tb/total).clip(0,1).fillna(.5)
    taker_quote_ratio=(tbq/qtotal).clip(0,1).fillna(.5)
    taker_delta=((2*tb-v)/total).clip(-1,1).fillna(0)
    signed_volume=(2*tb-v).fillna(0)
    f["quote_volume_z20"]=zscore(qv,20)
    f["trades_z20"]=zscore(trades,20)
    f["trades_ratio5_20"]=(trades.rolling(5).mean()/trades.rolling(20).mean().replace(0,np.nan)).replace([np.inf,-np.inf],np.nan).fillna(1)
    avg_size=(v/trades.replace(0,np.nan)).replace([np.inf,-np.inf],np.nan)
    f["avg_trade_size_z20"]=zscore(avg_size.fillna(avg_size.rolling(20).median()).fillna(0),20)
    f["taker_buy_ratio"]=taker_ratio
    f["taker_quote_ratio"]=taker_quote_ratio
    f["taker_delta"]=taker_delta
    f["taker_delta3"]=taker_delta.rolling(3).mean().fillna(0)
    f["taker_delta5"]=taker_delta.rolling(5).mean().fillna(0)
    f["cvd3"]=(signed_volume.rolling(3).sum()/v.rolling(3).sum().replace(0,np.nan)).clip(-1,1).fillna(0)
    f["cvd10"]=(signed_volume.rolling(10).sum()/v.rolling(10).sum().replace(0,np.nan)).clip(-1,1).fillna(0)
    ret1=c.pct_change().fillna(0)
    ret_norm=(ret1/ret1.rolling(20).std().replace(0,np.nan)).clip(-3,3).fillna(0)/3
    price_sign=np.sign(ret1)
    f["flow_price_agreement"]=(taker_delta*price_sign).fillna(0)
    f["flow_price_divergence"]=(taker_delta-ret_norm).clip(-2,2).fillna(0)

    hour=f.index.hour+f.index.minute/60
    f["hour_sin"]=np.sin(2*np.pi*hour/24); f["hour_cos"]=np.cos(2*np.pi*hour/24)
    return f.replace([np.inf,-np.inf],np.nan)

def make_dataset(df,horizon,deadzone_atr,feature_names):
    f=build_features(df); c=df.close.reindex(f.index); prev=df.close.shift(1)
    tr=pd.concat([(df.high-df.low),(df.high-prev).abs(),(df.low-prev).abs()],axis=1).max(axis=1)
    atr1=tr.ewm(alpha=1/14,adjust=False).mean().reindex(f.index)
    if horizon==5:
        # M5 learns a persistent 4-5 minute move, normalized by CLOSED 5m ATR.
        five=df.resample("5min").agg({"open":"first","high":"max","low":"min","close":"last"}).dropna()
        fc=five.close
        ftr=pd.concat([(five.high-five.low),(five.high-fc.shift(1)).abs(),(five.low-fc.shift(1)).abs()],axis=1).max(axis=1)
        fatr=ftr.ewm(alpha=1/14,adjust=False).mean()
        fatr.index=fatr.index+pd.Timedelta(minutes=5)
        atr=fatr.reindex(f.index,method="ffill")
        future=(c.shift(-4)+c.shift(-5))/2
        move_atr=(future-c)/atr.replace(0,np.nan)
    else:
        move_atr=(c.shift(-horizon)-c)/atr1.replace(0,np.nan)
    stamps=pd.Series(f.index,index=f.index)
    contiguous=(stamps.shift(-horizon)-stamps)==pd.Timedelta(minutes=horizon)
    move_atr=move_atr.where(contiguous)
    ds=f.copy(); ds["target"]=(move_atr>0).astype(int); ds["move_atr"]=move_atr
    return ds.loc[move_atr.abs()>=deadzone_atr].dropna(subset=feature_names+["target"])

def make_m5_multiclass_dataset(df,feature_names,neutral_atr=.18):
    f=build_features(df); c=df.close.reindex(f.index)
    five=df.resample("5min").agg({"open":"first","high":"max","low":"min","close":"last"}).dropna()
    fc=five.close
    ftr=pd.concat([(five.high-five.low),(five.high-fc.shift(1)).abs(),(five.low-fc.shift(1)).abs()],axis=1).max(axis=1)
    fatr=ftr.ewm(alpha=1/14,adjust=False).mean()
    fatr.index=fatr.index+pd.Timedelta(minutes=5)
    atr=fatr.reindex(f.index,method="ffill")
    future=(c.shift(-4)+c.shift(-5))/2
    move_atr=(future-c)/atr.replace(0,np.nan)
    stamps=pd.Series(f.index,index=f.index)
    contiguous=(stamps.shift(-5)-stamps)==pd.Timedelta(minutes=5)
    move_atr=move_atr.where(contiguous)
    target=np.where(move_atr>neutral_atr,2,np.where(move_atr<-neutral_atr,0,1))
    ds=f.copy(); ds["target"]=target; ds["move_atr"]=move_atr
    return ds.dropna(subset=feature_names+["move_atr"])

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
    df["quote_volume"]=df["volume"]*df["close"]
    df["trades"]=0.0
    df["taker_buy_base"]=df["volume"]*.5
    df["taker_buy_quote"]=df["quote_volume"]*.5
    return df[df.index+pd.Timedelta(minutes=1)<=pd.Timestamp.now(tz="UTC")]

def _binance_ms(v):
    n=int(v)
    return n//1000 if n>10**14 else n

def fetch_binance_vision_history(limit_rows):
    url="https://data-api.binance.vision/api/v3/klines"
    sess=requests.Session(); sess.headers.update({"User-Agent":"PredatorMLEngine/1.0","Accept":"application/json"})
    rows=[]; end=None
    while len(rows)<limit_rows:
        params={"symbol":"BTCUSDT","interval":"1m","limit":"1000"}
        if end is not None: params["endTime"]=str(end)
        r=sess.get(url,params=params,timeout=REQUEST_TIMEOUT)
        if r.status_code==429:
            time.sleep(.8); continue
        r.raise_for_status(); batch=r.json()
        if not isinstance(batch,list) or not batch: break
        rows.extend(batch)
        oldest=min(_binance_ms(x[0]) for x in batch)
        end=oldest-1
        if len(batch)<1000: break
        time.sleep(.04)
    if len(rows)<1000: raise RuntimeError(f"binance vision history too short: {len(rows)}")
    dedup={_binance_ms(x[0]):x for x in rows}
    ordered=[dedup[k] for k in sorted(dedup)][-limit_rows:]
    idx=pd.to_datetime([_binance_ms(x[0]) for x in ordered],unit="ms",utc=True)
    df=pd.DataFrame({
        "open":[float(x[1]) for x in ordered],
        "high":[float(x[2]) for x in ordered],
        "low":[float(x[3]) for x in ordered],
        "close":[float(x[4]) for x in ordered],
        "volume":[float(x[5]) for x in ordered],
        "quote_volume":[float(x[7]) for x in ordered],
        "trades":[float(x[8]) for x in ordered],
        "taker_buy_base":[float(x[9]) for x in ordered],
        "taker_buy_quote":[float(x[10]) for x in ordered]
    },index=idx)
    df=df[~df.index.duplicated(keep="last")].sort_index()
    required=max(220,min(int(limit_rows),1000))
    if len(df)<required: raise RuntimeError(f"binance vision normalized history too short: {len(df)} < {required}")
    # Exclude the active minute from both labels and live feature construction.
    df=df[df.index+pd.Timedelta(minutes=1)<=pd.Timestamp.now(tz="UTC")]
    return df

LIVE_FRAME={"at":0.0,"df":None,"source":"none","error":None}
def get_live_binance_frame():
    now=time.time()
    cached=LIVE_FRAME.get("df")
    age=now-float(LIVE_FRAME.get("at") or 0)
    if cached is not None and age<24:
        return cached,"Binance Vision cached taker flow",None
    try:
        fresh=fetch_binance_vision_history(900)
        if cached is not None:
            fresh=pd.concat([cached,fresh]).sort_index()
            fresh=fresh[~fresh.index.duplicated(keep="last")].tail(900)
        LIVE_FRAME.update({"at":now,"df":fresh,"source":"Binance Vision live taker flow","error":None})
        return fresh,"Binance Vision live taker flow",None
    except Exception as e:
        err=f"{type(e).__name__}: {e}"
        LIVE_FRAME["error"]=err
        # A recent Binance cache is preferable to switching feature distributions.
        if cached is not None and age<120:
            return cached,"Binance Vision cached taker flow",err
        raise

def new_models(seed,horizon=1):
    # Horizon-specific regularization: M5 is slower and gets stricter, shallower trees.
    if horizon==5:
        x=XGBClassifier(n_estimators=260,max_depth=3,learning_rate=.022,subsample=.80,colsample_bytree=.68,min_child_weight=24,
                        reg_alpha=.75,reg_lambda=5.2,gamma=.14,objective="binary:logistic",eval_metric="logloss",tree_method="hist",n_jobs=1,random_state=seed)
        l=LGBMClassifier(n_estimators=270,num_leaves=11,max_depth=4,learning_rate=.022,subsample=.80,subsample_freq=1,colsample_bytree=.68,
                         min_child_samples=95,min_split_gain=.035,reg_alpha=.75,reg_lambda=4.2,objective="binary",n_jobs=1,random_state=seed,verbosity=-1)
        return x,l
    x=XGBClassifier(n_estimators=220,max_depth=3,learning_rate=.028,subsample=.78,colsample_bytree=.72,min_child_weight=16,
                    reg_alpha=.55,reg_lambda=4.0,gamma=.10,objective="binary:logistic",eval_metric="logloss",tree_method="hist",n_jobs=1,random_state=seed)
    l=LGBMClassifier(n_estimators=240,num_leaves=15,max_depth=5,learning_rate=.025,subsample=.78,subsample_freq=1,colsample_bytree=.72,
                     min_child_samples=70,min_split_gain=.02,reg_alpha=.55,reg_lambda=3.2,objective="binary",n_jobs=1,random_state=seed,verbosity=-1)
    return x,l

def metrics(y,p,signal_threshold=.56,agreement=None):
    pred=(p>=.5).astype(int)
    positive=float(np.mean(y)); baseline=max(positive,1-positive)
    mask=(p>=signal_threshold)|(p<=1-signal_threshold)
    if agreement is not None:
        mask=mask & np.asarray(agreement,dtype=bool)
    sn=int(mask.sum())
    selective=float(accuracy_score(y[mask],pred[mask])) if sn else 0.0
    coverage=float(mask.mean()) if len(mask) else 0.0
    return {"accuracy":float(accuracy_score(y,pred)),"balancedAccuracy":float(balanced_accuracy_score(y,pred)),
            "logLoss":float(log_loss(y,p,labels=[0,1])),"brier":float(brier_score_loss(y,p)),
            "n":int(len(y)),"positiveRate":positive,"baselineAccuracy":float(baseline),
            "edgeVsBaseline":float(accuracy_score(y,pred)-baseline),
            "selectiveAccuracy":selective,"selectiveCoverage":coverage,"selectiveN":sn,
            "signalThreshold":float(signal_threshold)}

def choose_blend(y,px,pl,horizon):
    if horizon!=5:
        mx,ml=metrics(y,px),metrics(y,pl)
        wx=1/max(mx["logLoss"],1e-6); wl=1/max(ml["logLoss"],1e-6)
        total=wx+wl
        return wx/total,wl/total,.56
    best=None
    agree=(px>=.5)==(pl>=.5)
    n=len(y)
    cuts=[(0,n//3),(n//3,2*n//3),(2*n//3,n)]
    for wx in [0.0,.2,.4,.6,.8,1.0]:
        p=px*wx+pl*(1-wx)
        for threshold in [.54,.55,.56,.57,.58,.59,.60]:
            overall=metrics(y,p,threshold,agree)
            if overall["selectiveN"]<220 or overall["selectiveCoverage"]<.04:
                continue
            windows=[]
            valid=True
            for a,b in cuts:
                wm=metrics(y[a:b],p[a:b],threshold,agree[a:b])
                if wm["selectiveN"]<45 or wm["selectiveCoverage"]<.025:
                    valid=False; break
                windows.append(wm["selectiveAccuracy"])
            if not valid:
                continue
            worst=min(windows); spread=max(windows)-min(windows)
            score=.58*worst+.30*overall["selectiveAccuracy"]+.05*overall["balancedAccuracy"]+.04*min(.20,overall["selectiveCoverage"])-.12*spread-.015*overall["logLoss"]
            if best is None or score>best[0]:
                best=(score,wx,1-wx,threshold,worst,spread)
    return (best[1],best[2],best[3]) if best else (.5,.5,.57)

def purged_splits(ds,horizon):
    n=len(ds);a=int(n*.70);b=int(n*.85)
    # Use timestamps because binary dead-zone filtering removes arbitrary rows.
    times=ds.index
    train=np.flatnonzero((times<times[a]) & (times+pd.Timedelta(minutes=horizon)<times[a]))
    valid=np.flatnonzero((times>=times[a]) & (times<times[b]) &
        (times+pd.Timedelta(minutes=horizon)<times[b]))
    test=np.arange(b,n)
    if min(len(train),len(valid),len(test))<80:raise RuntimeError("insufficient_purged_split")
    return train,valid,test

def _model_ready(model):
    m=model.get("metrics",{})
    return bool(m.get("ready") and m.get("evaluationProtocol")==EVALUATION_PROTOCOL)

def _temperature_probs(prob,temperature=1.0):
    logits=np.log(np.clip(prob,1e-9,1))/max(.25,float(temperature))
    logits-=logits.max(axis=1,keepdims=True)
    p=np.exp(logits);return p/p.sum(axis=1,keepdims=True)

def _fit_temperature(y,prob):
    return min([.75,1.0,1.25,1.5,2.0,3.0,4.0],key=lambda t:float(-np.log(np.clip(
        _temperature_probs(prob,t)[np.arange(len(y)),y],1e-9,1)).mean()))

def train_horizon(ds,horizon,feature_names):
    X=ds[feature_names].astype(float).to_numpy(); y=ds.target.astype(int).to_numpy(); n=len(y)
    if n<MIN_TRAIN_ROWS: raise RuntimeError(f"not enough rows for h{horizon}: {n}")

    # Strict chronological split: oldest 70% train, next 15% validation,
    # newest 15% untouched final holdout.
    it,iv,ie=purged_splits(ds,horizon)
    Xtr,Xv,Xte=X[it],X[iv],X[ie]
    ytr,yv,yte=y[it],y[iv],y[ie]
    x,l=new_models(42+horizon,horizon); x.fit(Xtr,ytr); l.fit(Xtr,ytr)

    # Weight + threshold selection is validation-only; final holdout stays untouched.
    pxv=x.predict_proba(Xv)[:,1]; plv=l.predict_proba(Xv)[:,1]
    wx,wl,signal_threshold=choose_blend(yv,pxv,plv,horizon)
    mxv,mlv=metrics(yv,pxv,signal_threshold),metrics(yv,plv,signal_threshold)
    pv=pxv*wx+plv*wl
    agreement_v=((pxv>=.5)==(plv>=.5)) if horizon==5 else None
    mv=metrics(yv,pv,signal_threshold,agreement_v)

    # Final holdout is the only number allowed to qualify production readiness.
    pxt=x.predict_proba(Xte)[:,1]; plt=l.predict_proba(Xte)[:,1]
    mxt,mlt=metrics(yte,pxt,signal_threshold),metrics(yte,plt,signal_threshold)
    pt=pxt*wx+plt*wl
    agreement_t=((pxt>=.5)==(plt>=.5)) if horizon==5 else None
    me=metrics(yte,pt,signal_threshold,agreement_t)
    trainp=x.predict_proba(Xtr)[:,1]*wx+l.predict_proba(Xtr)[:,1]*wl
    train_acc=metrics(ytr,trainp,signal_threshold)["accuracy"]
    gap=train_acc-me["accuracy"]; stability=abs(mv["balancedAccuracy"]-me["balancedAccuracy"])
    ready=bool(
        me["n"]>=800 and mv["n"]>=800 and
        me["balancedAccuracy"]>=.505 and me["logLoss"]<=.71 and
        mv["balancedAccuracy"]>=.50 and mv["logLoss"]<=.72 and
        me["selectiveN"]>=120 and mv["selectiveN"]>=100 and
        me["selectiveCoverage"]>=.035 and mv["selectiveCoverage"]>=.035 and
        me["selectiveAccuracy"]>=.57 and mv["selectiveAccuracy"]>=.56 and
        gap<=.16 and stability<=.08
    )

    # Serve precisely the fitted estimators evaluated above. A full-data refit
    # invalidates these holdout metrics, even if its recipe is identical.
    return {"xgb":x,"lgb":l,"weights":{"xgb":float(wx),"lgb":float(wl)},"signalThreshold":float(signal_threshold),"features":feature_names,
            "metrics":{"ensemble":me,"validation":mv,"xgb":mxt,"lightgbm":mlt,
                       "validationXgb":mxv,"validationLightgbm":mlv,
                       "trainAccuracy":float(train_acc),"overfitGap":float(gap),
                       "validationHoldoutStability":float(stability),"ready":ready,
                       "evaluationProtocol":EVALUATION_PROTOCOL,"purgeMinutes":horizon},
            "rows":n,"horizon":horizon}

def new_m5_models(seed):
    x=XGBClassifier(n_estimators=300,max_depth=3,learning_rate=.022,subsample=.80,colsample_bytree=.70,min_child_weight=22,
                    reg_alpha=.75,reg_lambda=5.0,gamma=.12,objective="multi:softprob",num_class=3,eval_metric="mlogloss",
                    tree_method="hist",n_jobs=1,random_state=seed)
    l=LGBMClassifier(n_estimators=300,num_leaves=13,max_depth=4,learning_rate=.022,subsample=.80,subsample_freq=1,colsample_bytree=.70,
                     min_child_samples=90,min_split_gain=.03,reg_alpha=.75,reg_lambda=4.0,objective="multiclass",num_class=3,
                     n_jobs=1,random_state=seed,verbosity=-1)
    return x,l

def m5_metrics(y,p,threshold=.44,flat_margin=.05,agreement=None):
    p=np.asarray(p,dtype=float)
    row_sum=p.sum(axis=1,keepdims=True)
    p=np.divide(p,row_sum,out=np.full_like(p,1/3),where=row_sum>0)
    p=np.clip(p,1e-9,1-1e-9)
    p=p/p.sum(axis=1,keepdims=True)
    pred_all=np.argmax(p,axis=1)
    up=p[:,2]; down=p[:,0]; flat=p[:,1]
    pred_dir=np.where(up>=down,2,0)
    dir_prob=np.maximum(up,down)
    mask=(dir_prob>=threshold)&((dir_prob-flat)>=flat_margin)
    if agreement is not None:
        mask=mask&np.asarray(agreement,dtype=bool)
    sn=int(mask.sum())
    selective=float(np.mean(y[mask]==pred_dir[mask])) if sn else 0.0
    coverage=float(mask.mean()) if len(mask) else 0.0
    counts=np.bincount(y,minlength=3)/max(1,len(y))
    baseline=float(np.max(counts))
    return {
        "accuracy":float(accuracy_score(y,pred_all)),
        "balancedAccuracy":float(balanced_accuracy_score(y,pred_all)),
        "logLoss":float(log_loss(y,p,labels=[0,1,2])),
        "n":int(len(y)),"classRates":{"down":float(counts[0]),"noise":float(counts[1]),"up":float(counts[2])},
        "baselineAccuracy":baseline,
        "selectiveAccuracy":selective,"selectiveCoverage":coverage,"selectiveN":sn,
        "signalThreshold":float(threshold),"flatMargin":float(flat_margin)
    }

def choose_m5_multiclass(y,px,pl):
    best=None; n=len(y); cuts=[(0,n//3),(n//3,2*n//3),(2*n//3,n)]
    xside=px[:,2]>=px[:,0]; lside=pl[:,2]>=pl[:,0]; agree=xside==lside
    for wx in [0.0,.2,.4,.6,.8,1.0]:
        p=px*wx+pl*(1-wx)
        for threshold in [.38,.40,.42,.44,.46,.48,.50,.52]:
            for margin in [.02,.04,.06,.08,.10]:
                overall=m5_metrics(y,p,threshold,margin,agree)
                if overall["selectiveN"]<220 or overall["selectiveCoverage"]<.035:
                    continue
                windows=[]; valid=True
                for a,b in cuts:
                    wm=m5_metrics(y[a:b],p[a:b],threshold,margin,agree[a:b])
                    if wm["selectiveN"]<45 or wm["selectiveCoverage"]<.02:
                        valid=False; break
                    windows.append(wm["selectiveAccuracy"])
                if not valid: continue
                worst=min(windows); spread=max(windows)-min(windows)
                score=.62*worst+.28*overall["selectiveAccuracy"]+.04*min(.20,overall["selectiveCoverage"])-.12*spread-.01*overall["logLoss"]
                if best is None or score>best[0]:
                    best=(score,wx,1-wx,threshold,margin,worst,spread)
    return (best[1],best[2],best[3],best[4]) if best else (.5,.5,.44,.05)

def train_m5_multiclass(ds,feature_names):
    X=ds[feature_names].astype(float).to_numpy(); y=ds.target.astype(int).to_numpy(); n=len(y)
    if n<MIN_TRAIN_ROWS: raise RuntimeError(f"not enough rows for m5 multiclass: {n}")
    it,iv,ie=purged_splits(ds,5)
    Xtr,Xv,Xte=X[it],X[iv],X[ie]
    ytr,yv,yte=y[it],y[iv],y[ie]
    x,l=new_m5_models(47); x.fit(Xtr,ytr); l.fit(Xtr,ytr)
    pxv=x.predict_proba(Xv); plv=l.predict_proba(Xv)
    # First chronological validation block calibrates; later block selects gates.
    # Purge the five-minute target before the gate block too.
    cut=len(iv)//2
    calibration=np.flatnonzero(ds.index[iv]+pd.Timedelta(minutes=5)<ds.index[iv[cut]])
    gate=np.arange(cut,len(iv))
    if len(calibration)<80 or len(gate)<120:raise RuntimeError("insufficient_m5_calibration")
    tx=_fit_temperature(yv[calibration],pxv[calibration])
    tl=_fit_temperature(yv[calibration],plv[calibration])
    pxv=_temperature_probs(pxv,tx);plv=_temperature_probs(plv,tl)
    Xv=Xv[gate];yv=yv[gate];pxv=pxv[gate];plv=plv[gate]
    wx,wl,threshold,margin=choose_m5_multiclass(yv,pxv,plv)
    agree_v=(pxv[:,2]>=pxv[:,0])==(plv[:,2]>=plv[:,0])
    pv=pxv*wx+plv*wl
    mv=m5_metrics(yv,pv,threshold,margin,agree_v)
    pxte=_temperature_probs(x.predict_proba(Xte),tx); plte=_temperature_probs(l.predict_proba(Xte),tl)
    agree_t=(pxte[:,2]>=pxte[:,0])==(plte[:,2]>=plte[:,0])
    pte=pxte*wx+plte*wl
    me=m5_metrics(yte,pte,threshold,margin,agree_t)
    trainp=_temperature_probs(x.predict_proba(Xtr),tx)*wx+_temperature_probs(l.predict_proba(Xtr),tl)*wl
    mt=m5_metrics(ytr,trainp,threshold,margin)
    stability=abs(mv["selectiveAccuracy"]-me["selectiveAccuracy"])
    baseline_class=int(np.argmax(np.bincount(ytr,minlength=3)))
    for labels,prob,agree,m in ((yv,pv,agree_v,mv),(yte,pte,agree_t,me)):
        direction=np.maximum(prob[:,0],prob[:,2])
        mask=(direction>=threshold)&(direction-prob[:,1]>=margin)&agree
        base=float(np.mean(labels[mask]==baseline_class)) if mask.any() else 0.0
        m["pairedBaselineAccuracy"]=base;m["edgeVsBaseline"]=m["selectiveAccuracy"]-base
    ready=bool(
        me["n"]>=1200 and len(iv)>=1200 and
        me["selectiveN"]>=140 and mv["selectiveN"]>=120 and
        me["selectiveCoverage"]>=.03 and mv["selectiveCoverage"]>=.03 and
        me["selectiveAccuracy"]>=.58 and mv["selectiveAccuracy"]>=.56 and
        stability<=.10 and mv["edgeVsBaseline"]>=.02 and me["edgeVsBaseline"]>=.02
    )
    return {
        "xgb":x,"lgb":l,"temperature":{"xgb":tx,"lgb":tl},"weights":{"xgb":float(wx),"lgb":float(wl)},
        "signalThreshold":float(threshold),"flatMargin":float(margin),"features":feature_names,
        "metrics":{"ensemble":me,"validation":mv,"train":mt,"validationHoldoutStability":float(stability),"ready":ready,
                       "evaluationProtocol":EVALUATION_PROTOCOL,"purgeMinutes":5,"calibrationRows":len(calibration),"validationPeriodRows":len(iv)},
        "rows":n,"horizon":5,"mode":"m5_multiclass"
    }

def train_all():
    with LOCK:
        if STATE["training"]: return
        STATE.update({"training":True,"status":"TRAINING","lastError":None})
    try:
        try:
            hist=fetch_binance_vision_history(TRAIN_CANDLES)
            source="Binance Vision BTCUSDT 1m + taker flow"
            LIVE_FRAME.update({"at":time.time(),"df":hist.tail(900).copy(),"source":"Binance Vision training tail","error":None})
        except Exception as primary_error:
            print("[ML-SOURCE-FALLBACK] "+json.dumps({"primary":"Binance Vision","error":str(primary_error),"fallback":"Coinbase"}),flush=True)
            hist=fetch_coinbase_history(TRAIN_CANDLES)
            source="Coinbase Exchange BTC-USD 1m · neutral micro fallback"
        m1=train_horizon(make_dataset(hist,1,.04,M1_FEATURES),1,M1_FEATURES)
        m5=train_m5_multiclass(make_m5_multiclass_dataset(hist,M5_FEATURES,.18),M5_FEATURES)
        # A shadow challenger must not silently replace a genuinely validated
        # production champion. Do not relax the out-of-sample acceptance gate:
        # preserve an old compatible READY model if the new challenger fails it.
        model_origins={"m1":"CHALLENGER","m5":"CHALLENGER"}
        old=MODELS.get("models",{}) if MODELS.get("features")==FEATURE_SIGNATURE else {}
        for key,candidate in (("m1",m1),("m5",m5)):
            incumbent=old.get(key) if isinstance(old,dict) else None
            compatible=bool(incumbent and incumbent.get("features")==candidate.get("features") and
                (key!="m5" or incumbent.get("mode")=="m5_multiclass"))
            if compatible and _model_ready(incumbent) and not candidate["metrics"].get("ready"):
                if key=="m1":m1=incumbent
                else:m5=incumbent
                model_origins[key]="RETAINED_READY_CHAMPION"
        trained_now=int(time.time()*1000)
        model_times={key:(int(MODELS.get("modelTrainedAt",{}).get(key) or MODELS.get("trainedAt",0))
             if model_origins[key]=="RETAINED_READY_CHAMPION" else trained_now) for key in ("m1","m5")}
        payload={"version":APP_VERSION,"features":FEATURE_SIGNATURE,"trainedAt":trained_now,"historyRows":len(hist),"source":source,
                 "models":{"m1":m1,"m5":m5},"modelOrigins":model_origins,"modelTrainedAt":model_times}
        tmp=MODEL_PATH.with_suffix(".tmp"); joblib.dump(payload,tmp); os.replace(tmp,MODEL_PATH)
        meta={"version":APP_VERSION,"trainedAt":payload["trainedAt"],"historyRows":len(hist),"source":payload["source"],
              "metrics":{"m1":m1["metrics"],"m5":m5["metrics"]},"rows":{"m1":m1["rows"],"m5":m5["rows"]}}
        META_PATH.write_text(json.dumps(meta,indent=2))
        MODELS.clear(); MODELS.update(payload)
        status="READY" if (m1["metrics"]["ready"] and m5["metrics"]["ready"]) else ("PARTIAL" if (m1["metrics"]["ready"] or m5["metrics"]["ready"]) else "SHADOW")
        STATE.update({"status":status,"trainedAt":payload["trainedAt"],
                      "modelLoaded":True,"metrics":meta["metrics"],"historyRows":len(hist),"source":payload["source"],"lastError":None})
        print("[ML-TRAIN] "+json.dumps({"status":STATE["status"],"trainedAt":payload["trainedAt"],"historyRows":len(hist),
              "source":source,"metrics":meta["metrics"],"rows":meta["rows"],
              "modelOrigins":model_origins,"modelTrainedAt":model_times}),flush=True)
    except Exception as e:
        STATE.update({"status":"ERROR","lastError":f"{type(e).__name__}: {e}"})
        print("[ML-TRAIN-ERROR] "+json.dumps({"error":STATE["lastError"]}),flush=True); traceback.print_exc()
    finally:
        STATE["training"]=False

def load_model():
    if not MODEL_PATH.exists(): return False
    try:
        obj=joblib.load(MODEL_PATH)
        # Feature schema is the hard compatibility boundary. Version changes are allowed
        # to keep the last validated model serving while the next candidate retrains.
        if obj.get("features")!=FEATURE_SIGNATURE:
            MODELS.clear()
            STATE.update({"status":"TRAINING","modelLoaded":False,"metrics":None,"lastError":"incompatible_model_features"})
            return False
        MODELS.clear(); MODELS.update(obj)
        for model in obj["models"].values():
            if not _model_ready(model):
                model["metrics"]["ready"]=False
        m={k:v["metrics"] for k,v in obj["models"].items()}
        current=bool(obj.get("version")==APP_VERSION)
        base_status="READY" if all(v.get("ready") for v in m.values()) else ("PARTIAL" if any(v.get("ready") for v in m.values()) else "SHADOW")
        STATE.update({"trainedAt":obj.get("trainedAt",0),"modelLoaded":True,"metrics":m,"historyRows":obj.get("historyRows",0),
                      "source":obj.get("source"),"lastError":None if current else "serving_previous_validated_model",
                      "status":base_status if current else "HOT_SWAP_TRAINING"})
        return True
    except Exception as e:
        MODELS.clear()
        STATE["lastError"]=f"load: {e}"; return False

def start_train_if_needed():
    loaded=load_model()
    stale=(time.time()*1000-STATE.get("trainedAt",0))>RETRAIN_SECONDS*1000
    version_mismatch=(not loaded) or MODELS.get("version")!=APP_VERSION
    # Never clear a schema-compatible validated model merely because a newer
    # training recipe is starting. train_all atomically swaps the artifact on success.
    if not loaded:
        STATE.update({"status":"TRAINING","modelLoaded":False,"metrics":None})
    elif version_mismatch:
        STATE["status"]="HOT_SWAP_TRAINING"
        STATE["training"]=False
    if version_mismatch or stale:
        threading.Thread(target=train_all,daemon=True,name="ml-trainer").start()

def frame_from_body(candles):
    if len(candles)<220: raise HTTPException(400,"need at least 220 M1 candles")
    rows=[x.model_dump() for x in candles]
    idx=pd.to_datetime([int(x["time"]) for x in rows],unit="ms",utc=True)
    df=pd.DataFrame({
        "open":[x["open"] for x in rows],"high":[x["high"] for x in rows],"low":[x["low"] for x in rows],
        "close":[x["close"] for x in rows],"volume":[float(x.get("volume") or 0) for x in rows],
        "quote_volume":[float(x.get("quote_volume") or 0) for x in rows],
        "trades":[float(x.get("trades") or 0) for x in rows],
        "taker_buy_base":[float(x.get("taker_buy_base") or 0) for x in rows],
        "taker_buy_quote":[float(x.get("taker_buy_quote") or 0) for x in rows]
    },index=idx).sort_index()
    df=df[~df.index.duplicated(keep="last")]
    # Main-app fallback candles do not carry Binance taker fields: keep them neutral,
    # never synthesize directional flow.
    missing_micro=(df["quote_volume"]<=0).all() or (df["trades"]<=0).all()
    if missing_micro:
        df["quote_volume"]=df["volume"]*df["close"]
        df["trades"]=0.0
        df["taker_buy_base"]=df["volume"]*.5
        df["taker_buy_quote"]=df["quote_volume"]*.5
    return df

def _prediction_input(estimator,x,feature_names):
    arr=np.asarray(x,dtype=np.float32)
    if arr.ndim==1: arr=arr.reshape(1,-1)
    names=None
    try:
        names=list(getattr(estimator,"feature_name_",None) or [])
    except Exception:
        names=None
    if not names:
        try:
            names=list(estimator.get_booster().feature_names or [])
        except Exception:
            names=None
    if names and len(names)==arr.shape[1]:
        return pd.DataFrame(arr,columns=names)
    if feature_names and len(feature_names)==arr.shape[1]:
        return pd.DataFrame(arr,columns=feature_names)
    return arr

def predict_h(model,x):
    features=model.get("features") or []
    xi=_prediction_input(model["xgb"],x,features)
    li=_prediction_input(model["lgb"],x,features)
    px=float(model["xgb"].predict_proba(xi)[0,1]); pl=float(model["lgb"].predict_proba(li)[0,1]); w=model["weights"]
    raw=px*w["xgb"]+pl*w["lgb"]
    val=model["metrics"].get("validation",model["metrics"]["ensemble"]); hold=model["metrics"]["ensemble"]
    acc=float(val["accuracy"])
    shrink=max(.25,min(1,(acc-.5)/.10))
    calibrated=.5+(raw-.5)*shrink
    raw_edge=abs(raw-.5)*2
    lean="BUY" if raw>=.5 else "SELL"
    threshold=float(model.get("signalThreshold",.56 if model["horizon"]==5 else .57))
    component_agree=((px>=.5)==(pl>=.5))
    # IMPORTANT: the production gate must use the same probability domain that
    # was validated on the chronological holdout. Previous code validated RAW
    # probabilities but gated the shrunken probability, silently crushing live
    # coverage and producing long periods with no M1 recommendations.
    active=_model_ready(model) and (raw>=threshold or raw<=1-threshold) and (model["horizon"]!=5 or component_agree)
    excess=max(0.0,abs(raw-.5)-max(0.0,threshold-.5))
    learned_quality=float(hold.get("selectiveAccuracy",.5))*100
    confidence=round(min(89,max(55,learned_quality+excess*120))) if active else round(min(70,max(45,50+abs(calibrated-.5)*60)))
    return {"side":lean if active else "WAIT","leanSide":lean,
            "probUp":round(calibrated*100,2),"probDown":round((1-calibrated)*100,2),
            "confidence":confidence,"edge":round(raw_edge*100,2),
            "ready":_model_ready(model),"metrics":model["metrics"],
            "component":{"xgbUp":round(px*100,2),"lightgbmUp":round(pl*100,2),"rawUp":round(raw*100,2),
                         "calibratedUp":round(calibrated*100,2),"agree":bool(component_agree),"weights":w,
                         "signalThreshold":threshold,"gateDomain":"validated_raw_probability"}}

def _class3_probs(estimator,x,feature_names=None):
    raw=estimator.predict_proba(_prediction_input(estimator,x,feature_names or []))[0]
    classes=list(getattr(estimator,"classes_",range(len(raw))))
    out=np.zeros(3,dtype=float)
    for i,cls in enumerate(classes):
        try:
            k=int(cls)
        except Exception:
            continue
        if 0<=k<=2:
            out[k]=float(raw[i])
    s=float(out.sum())
    if s<=0:
        return np.array([0.0,1.0,0.0],dtype=float)
    return out/s

def predict_m5(model,x):
    # M5 is a real 3-class model: DOWN(0) / NOISE(1) / UP(2).
    # Map estimator classes explicitly so a missing/legacy class can never crash inference.
    features=model.get("features") or []
    px=_class3_probs(model["xgb"],x,features); pl=_class3_probs(model["lgb"],x,features); w=model["weights"]
    temperature=model.get("temperature",{})
    px=_temperature_probs(px.reshape(1,-1),temperature.get("xgb",1.0))[0]
    pl=_temperature_probs(pl.reshape(1,-1),temperature.get("lgb",1.0))[0]
    p=px*w["xgb"]+pl*w["lgb"]
    down,flat,up=float(p[0]),float(p[1]),float(p[2])
    lean="BUY" if up>=down else "SELL"
    dir_prob=max(up,down); threshold=float(model.get("signalThreshold",.44)); margin=float(model.get("flatMargin",.05))
    component_agree=((px[2]>=px[0])==(pl[2]>=pl[0]))
    model_mode=str(model.get("mode") or "")
    compatible=(model_mode=="m5_multiclass")
    active=bool(compatible and _model_ready(model) and component_agree and dir_prob>=threshold and dir_prob-flat>=margin)
    directional_total=max(1e-9,up+down)
    prob_up_dir=up/directional_total; edge=abs(up-down)
    confidence=round(min(90,max(0,50+(dir_prob-flat)*85+edge*35))) if active else round(min(70,max(45,50+edge*25)))
    return {
        "side":lean if active else "WAIT","leanSide":lean,
        "probUp":round(prob_up_dir*100,2),"probDown":round((1-prob_up_dir)*100,2),"probFlat":round(flat*100,2),
        "confidence":confidence,"edge":round(edge*100,2),"ready":bool(compatible and _model_ready(model)),"metrics":model["metrics"],
        "component":{
            "xgb":{"down":round(float(px[0])*100,2),"flat":round(float(px[1])*100,2),"up":round(float(px[2])*100,2)},
            "lightgbm":{"down":round(float(pl[0])*100,2),"flat":round(float(pl[1])*100,2),"up":round(float(pl[2])*100,2)},
            "agree":bool(component_agree),"compatible":compatible,"mode":model_mode,
            "weights":w,"temperature":temperature,"gateDomain":"validated_calibrated_probability",
            "signalThreshold":threshold,"flatMargin":margin
        }
    }

@app.on_event("startup")
def startup():
    start_train_if_needed()
    MICRO.start()

@app.get("/health")
def health():
    readiness={k:_model_ready(v) for k,v in MODELS.get("models",{}).items()}
    return {"ok":True,"version":APP_VERSION,"modelReady":bool(readiness and all(readiness.values())),
        "readiness":readiness,"evaluationProtocol":EVALUATION_PROTOCOL,"microstructure":MICRO.status(),**STATE}

@app.post("/train")
def train():
    if STATE["training"]: return {"ok":True,"started":False,"status":"already_training"}
    threading.Thread(target=train_all,daemon=True,name="ml-trainer-manual").start()
    return {"ok":True,"started":True}

@app.post("/predict")
def predict(body:PredictBody):
    if not MODELS: load_model()
    if not MODELS: return {"ok":False,"status":STATE["status"],"reason":"model_not_ready","state":STATE,"microstructure":MICRO.predict()}
    live_source="Binance Vision BTCUSDT 1m + taker flow"; live_error=None
    try:
        live_df,live_source,live_error=get_live_binance_frame()
    except Exception as e:
        live_error=f"{type(e).__name__}: {e}"
        live_source="main-app candle fallback · neutral micro"
        live_df=frame_from_body(body.candles)
    f=build_features(live_df)
    if f.dropna(subset=M1_FEATURES).empty or f.dropna(subset=M5_FEATURES).empty:
        raise HTTPException(400,"insufficient feature history")
    x1=f[M1_FEATURES].dropna().iloc[[-1]].astype(float).to_numpy()
    x5=f[M5_FEATURES].dropna().iloc[[-1]].astype(float).to_numpy()
    m1=predict_h(MODELS["models"]["m1"],x1)
    m5_model=MODELS["models"]["m5"]
    m5=predict_m5(m5_model,x5) if m5_model.get("mode")=="m5_multiclass" else predict_h(m5_model,x5)
    micro=MICRO.predict()
    aligned=m1["leanSide"]==m5["leanSide"]; consensus=m1["leanSide"] if aligned else (m1["leanSide"] if m1["edge"]>=m5["edge"] else m5["leanSide"])
    return {"ok":True,"version":APP_VERSION,"status":STATE["status"],"trainedAt":MODELS.get("trainedAt"),"source":MODELS.get("source"),
            "liveSource":live_source,"liveError":live_error,"historyRows":MODELS.get("historyRows"),"oneMinute":m1,"fiveMinute":m5,"microstructure":micro,
            "consensus":{"side":consensus,"aligned":aligned,"confidence":max(0,min(90,round(m1["confidence"]*.55+m5["confidence"]*.45+(5 if aligned else -6)))),
                         "ready":bool(m1["ready"] and m5["ready"])},
            "shadow":not (m1["ready"] or m5["ready"])}
