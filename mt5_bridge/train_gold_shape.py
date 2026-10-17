"""Train a light GOLD-only conditional OHLC shape model from genuine MT5 M1.

No fabricated labels, cross-provider mixing, random train/test split or future
bars in features. Strict time holdout. An unqualified model is never served as
a directional forecast. The output is a small public JSON model, NEVER raw data.

Run locally, *after* export_gold_history.py:
python mt5_bridge/train_gold_shape.py --input local-data/gold-history
"""
import argparse
import csv
import gzip
import hashlib
import json
import math
from collections import deque, defaultdict
from datetime import datetime, timezone
from pathlib import Path

CONTEXT=60
HORIZON=3
MIN_DATA=100000
MIN_TRAIN=250
MIN_OOS=100
FIELDS=("time","open","high","low","close")


def valid_rows(folder, manifest):
    # Verify every archived file against its import manifest before training.
    files=manifest.get("frames",{}).get("M1",{}).get("files",[])
    if not files: raise ValueError("Missing genuine M1 broker files")
    last_time=-1
    for item in sorted(files,key=lambda v:v["name"]):
        name=item["name"]
        if Path(name).name!=name or not name.endswith(".csv.gz"):
            raise ValueError("Invalid archive filename")
        path=folder/name
        if not path.is_file(): raise ValueError(f"Missing {name}")
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest!=item["sha256"]: raise ValueError(f"Archive checksum mismatch: {name}")
        with gzip.open(path,"rt",encoding="utf-8",newline="") as f:
            for d in csv.DictReader(f):
                t=int(d["time"])
                if t<=last_time: raise ValueError("Duplicate/out-of-order broker minute across files")
                last_time=t
                vals=[float(d[k]) for k in FIELDS[1:]]
                o,h,l,c=vals
                if not (1000000000 <= t < 10000000000): raise ValueError("Expected MT5 time in Unix SECONDS")
                if t%60 or not all(math.isfinite(x) for x in vals) or l<=0 or l>min(o,c) or h<max(o,c):
                    raise ValueError(f"Invalid OHLC at {t}")
                yield (t,o,h,l,c)


def atr(rows):
    tr=[]
    for i in range(len(rows)-15,len(rows)):
        curr,prior=rows[i],rows[i-1]
        tr.append(max(curr[2]-curr[3],abs(curr[2]-prior[4]),abs(curr[3]-prior[4])))
    tr.sort()
    return (tr[6]+tr[7])/2


def context_key(rows,a):
    last=rows[-1]
    diff6=(last[4]-rows[-7][4])/a
    diff12=(last[4]-rows[-13][4])/a
    direction="UP" if diff6>.32 and diff12>.4 else "DOWN" if diff6<-.32 and diff12<-.4 else "FLAT"
    body=(last[4]-last[1])/a
    body_state="UP" if body>.18 else "DOWN" if body<-.18 else "SMALL"
    tod=datetime.fromtimestamp(last[0],timezone.utc).hour
    session="ASIA" if tod<7 else "EU" if tod<13 else "US" if tod<21 else "ROLL"
    volatility="FAST" if (last[2]-last[3])/a>1.55 else "NORMAL"
    return "|".join((session,direction,body_state,volatility)),direction


def samples(folder,manifest):
    # Rolling 63 contiguous closed M1 bars; 60 context + next 3 actual
    # bars. Step 3 ensures outcomes never overlap; missing weekends break
    # the sequence automatically and are NOT filled synthetically.
    window=deque(maxlen=CONTEXT+HORIZON)
    num=0
    for row in valid_rows(folder,manifest):
        if window and row[0]-window[-1][0]!=60:
            window.clear()
        window.append(row)
        if len(window)<CONTEXT+HORIZON: continue
        if num%HORIZON:
            num+=1
            continue
        num+=1
        past=list(window)[:CONTEXT]
        future=list(window)[CONTEXT:]
        a=atr(past)
        if a<=past[-1][4]*1e-6 or a>past[-1][4]*.025:continue
        if past[-1][2]-past[-1][3]>3.8*a:continue
        key,baseline=context_key(past,a)
        origin=past[-1][4]
        vector=[]
        for bar in future:
            vector.append([(bar[j]-origin)/a for j in range(1,5)])
        observed=(future[-1][4]-origin)/a
        if not all(math.isfinite(v) and abs(v)<45 for one in vector for v in one):continue
        yield {"at":past[-1][0],"key":key,"baseline":baseline,
               "path":vector,"observed":observed}


def lower_wilson(hits,n):
    if not n:return 0.0
    z=1.96;p=hits/n;z2=z*z
    return (p+z2/(2*n)-z*math.sqrt((p*(1-p)+z2/(4*n*n))/n))/(1+z2/n)


def build(folder,split=0.70):
    manifest=json.loads((folder/"manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format")!="qannas-mt5-history-v1" or manifest.get("source")!="USER_MT5_TERMINAL":
        raise ValueError("Unrecognized broker-history format")
    symbol=manifest["symbol"]
    if "XAUUSD" not in symbol.upper():raise ValueError("Not a gold XAUUSD instrument")
    total=sum(1 for _ in samples(folder,manifest))
    if total<MIN_DATA//3:raise ValueError(f"Historical data insufficient: {total} distinct 3-minute outcomes")
    split_index=int(total*split)
    grouped=defaultdict(lambda:{"n":0,"sums":[[0.0]*4 for _ in range(HORIZON)]})
    # Pass 2: train on earlier, strictly contiguous outcomes.
    for i,row in enumerate(samples(folder,manifest)):
        if i>=split_index-4:break  # purge near holdout boundary
        g=grouped[row["key"]];g["n"]+=1
        for t in range(HORIZON):
            for j in range(4):g["sums"][t][j]+=row["path"][t][j]
    expected={}
    for k,g in grouped.items():
        if g["n"]<MIN_TRAIN:continue
        expected[k]={"n":g["n"],"path":[[round(v/g["n"],6) for v in x] for x in g["sums"]]}
    checks=defaultdict(lambda:{"n":0,"hits":0,"baseN":0,"baseHits":0,"maeSum":0.0,"months":set()})
    for i,row in enumerate(samples(folder,manifest)):
        if i<split_index+4:continue
        model=expected.get(row["key"])
        if not model:continue
        estimate=model["path"][-1][3]
        if abs(estimate)<.09:continue
        direction=1 if estimate>0 else -1
        y=row["observed"]
        result=checks[row["key"]]
        result["n"]+=1
        result["hits"]+=int(direction*y>0)
        base=1 if row["baseline"]=="UP" else -1 if row["baseline"]=="DOWN" else 0
        if base:
            result["baseN"]+=1
            result["baseHits"]+=int(base*y>0)
        result["maeSum"]+=abs(estimate-y)
        result["months"].add(datetime.fromtimestamp(row["at"],timezone.utc).strftime("%Y-%m"))
    qualified={}
    audit={"qualifiedBuckets":0,"scoredBuckets":0,"holdoutSamples":0,"totalSamples":total}
    for key,model in expected.items():
        stat=checks.get(key)
        if not stat:continue
        n=stat["n"];audit["scoredBuckets"]+=1;audit["holdoutSamples"]+=n
        baseRate=stat["baseHits"]/stat["baseN"] if stat["baseN"] else .5
        rate=stat["hits"]/n if n else 0
        lower=lower_wilson(stat["hits"],n)
        mae=stat["maeSum"]/n if n else float("inf")
        ready=(n>=MIN_OOS and len(stat["months"])>=3 and lower>max(.5,baseRate)
               and rate>=baseRate+.04 and mae<=1.30)
        if not ready:continue
        qualified[key]={**model,"holdout":{"n":n,"wins":stat["hits"],
                            "accuracy":round(rate,4),"wilsonLower":round(lower,4),
                            "pairedMomentumBaseline":round(baseRate,4),
                            "maeAtr":round(mae,4),"months":len(stat["months"])}}
        audit["qualifiedBuckets"]+=1
    return {"schema":"qannas-gold-shape-v1","status":"QUALIFIED" if qualified else "SHADOW",
            "source":"MT5_XAUUSD_MONTHLY_ARCHIVE",
            "symbol":symbol,"frame":"M1","horizon":HORIZON,
            "training":{"origin":"USER_MT5_TERMINAL","nonOverlapping":True,
                        "chronologicalTrainFraction":split,"purgedSampleGap":4,
                        **audit},"patterns":qualified}


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",default="local-data/gold-history")
    p.add_argument("--output",default="local-data/gold-shape-result.json")
    p.add_argument("--activate",action="store_true",help="Copy ONLY verified qualified aggregates to public model path")
    a=p.parse_args()
    result=build(Path(a.input))
    target=Path(a.output);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(result,sort_keys=True,separators=(",",":"))+"\n",encoding="utf-8")
    print("Training complete:",result["status"],"gold-only outcome groups:",
          result["training"]["qualifiedBuckets"],"of",result["training"]["scoredBuckets"])
    print("Output:",target.resolve())
    if a.activate:
        if result["status"]!="QUALIFIED":
            raise SystemExit("Activation refused: independent holdout did not qualify a GOLD pattern")
        live=Path("public/models/gold-shape-model.json")
        live.parent.mkdir(parents=True,exist_ok=True)
        live.write_text(target.read_text(encoding="utf-8"),encoding="utf-8")
        print("Qualified public MODEL PARAMETERS installed at",live,
              "- commit and redeploy manually. Raw archive stays local.")
    print("No model can trade until separately certified and deployed.")


if __name__=="__main__":main()
