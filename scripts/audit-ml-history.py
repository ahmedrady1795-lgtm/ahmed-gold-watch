"""Compare history sizes on identical chronological validation/holdout windows.
Usage: python scripts/audit-ml-history.py /path/to/binance-klines.json
This is a diagnostic comparison, not a profitability test or tuning loop.
"""
import importlib.util,json,os,sys,tempfile,warnings
from pathlib import Path
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ml-service'))
tmp=tempfile.TemporaryDirectory();os.environ['MODEL_DIR']=tmp.name
spec=importlib.util.spec_from_file_location('ml',ROOT/'ml-service/app.py')
ml=importlib.util.module_from_spec(spec);spec.loader.exec_module(ml)
warnings.filterwarnings('ignore',message='X does not have valid feature names')
rows=json.loads(Path(sys.argv[1]).read_text());rows=sorted({int(x[0]):x for x in rows}.values(),key=lambda x:x[0])
df=pd.DataFrame({name:[float(x[i]) for x in rows] for name,i in [('open',1),('high',2),('low',3),('close',4),('volume',5),('quote_volume',7),('trades',8),('taker_buy_base',9),('taker_buy_quote',10)]},index=pd.to_datetime([x[0] for x in rows],unit='ms',utc=True))
df=df[df.index+pd.Timedelta(minutes=1)<=pd.Timestamp.now(tz='UTC')]
end=df.index[-1];test_start=end-pd.Timedelta(minutes=1200);valid_start=test_start-pd.Timedelta(minutes=1600)
def fixed_splits(ds,horizon):
 t=ds.index;delta=pd.Timedelta(minutes=horizon)
 return np.flatnonzero(t+delta<valid_start),np.flatnonzero((t>=valid_start)&(t+delta<test_start)),np.flatnonzero(t>=test_start)
ml.purged_splits=fixed_splits
results={}
for count in [8000,30000]:
 frame=df.tail(count)
 one=ml.train_horizon(ml.make_dataset(frame,1,.04,ml.M1_FEATURES),1,ml.M1_FEATURES)
 five=ml.train_m5_multiclass(ml.make_m5_multiclass_dataset(frame,ml.M5_FEATURES,.18),ml.M5_FEATURES)
 results[count]={k:{'validation':m['metrics']['validation'],'holdout':m['metrics']['ensemble'],'ready':m['metrics']['ready'],'overfitGap':m['metrics'].get('overfitGap')} for k,m in [('m1',one),('m5',five)]}
 print(json.dumps({'history':count,'results':results[count]}),flush=True)
print(json.dumps({'validationStart':str(valid_start),'holdoutStart':str(test_start),'end':str(end)}))
