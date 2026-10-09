"""Regression checks for causal model training. Synthetic data is not a profitability test."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import warnings
import numpy as np
import pandas as pd
import torch

ROOT=Path(__file__).resolve().parents[1]
TMP=tempfile.TemporaryDirectory()
os.environ['MODEL_DIR']=TMP.name
sys.path.insert(0,str(ROOT/'ml-service'))
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
ml=load('ml_engine',ROOT/'ml-service/app.py')
neural=load('neural_engine',ROOT/'neural-service/app.py')

class Estimator:
    instances=[]
    def __init__(self,classes):
        self.classes_=np.arange(classes);self.fits=[];self.__class__.instances.append(self)
    def fit(self,X,y):self.fits.append((X.copy(),y.copy()));return self
    def predict_proba(self,X):
        sign=(np.asarray(X)[:,0]>.0)
        if len(self.classes_)==2:return np.column_stack([np.where(sign,.2,.8),np.where(sign,.8,.2)])
        return np.column_stack([np.where(sign,.12,.80),np.full(len(X),.08),np.where(sign,.80,.12)])

class CausalTrainingTests(unittest.TestCase):
    def dataset(self,n=10000):
        t=pd.date_range('2026-01-01',periods=n,freq='min',tz='UTC')
        x=np.sin(np.arange(n)*.13)
        return pd.DataFrame({'f':x,'target':np.where(x>0,2,0)},index=t)

    def test_purge_uses_clock_on_filtered_rows(self):
        ds=self.dataset().iloc[::3]
        train,val,test=ml.purged_splits(ds,5)
        self.assertLess(ds.index[train[-1]]+pd.Timedelta(minutes=5),ds.index[val[0]])
        self.assertLess(ds.index[val[-1]]+pd.Timedelta(minutes=5),ds.index[test[0]])

    def test_no_refit_and_holdout_never_tunes_m5(self):
        ds=self.dataset();Estimator.instances=[]
        factory=lambda seed:(Estimator(3),Estimator(3))
        with patch.object(ml,'new_m5_models',factory),patch.object(ml,'choose_m5_multiclass',return_value=(.5,.5,.5,.1)):
            first=ml.train_m5_multiclass(ds,['f'])
            changed=ds.copy();changed.iloc[8500:,changed.columns.get_loc('target')]=1
            second=ml.train_m5_multiclass(changed,['f'])
        for model in [first,second]:
            self.assertEqual(len(model['xgb'].fits),1)
            self.assertEqual(len(model['lgb'].fits),1)
            self.assertLess(len(model['xgb'].fits[0][0]),7000)
            self.assertEqual(model['metrics']['evaluationProtocol'],ml.EVALUATION_PROTOCOL)
            self.assertEqual(model['metrics']['purgeMinutes'],5)
        self.assertEqual(first['temperature'],second['temperature'])
        self.assertEqual(first['weights'],second['weights'])
        self.assertEqual(first['signalThreshold'],second['signalThreshold'])
        self.assertEqual(first['metrics']['validation'],second['metrics']['validation'])
        self.assertFalse(second['metrics']['ready'])
        self.assertNotEqual(first['metrics']['ensemble']['selectiveAccuracy'],second['metrics']['ensemble']['selectiveAccuracy'])

    def test_binary_serves_the_tested_estimators(self):
        ds=self.dataset(6000);ds['target']=(ds['f']>0).astype(int)
        with patch.object(ml,'new_models',lambda *args:(Estimator(2),Estimator(2))):
            model=ml.train_horizon(ds,1,['f'])
        self.assertEqual(len(model['xgb'].fits),1)
        self.assertEqual(len(model['lgb'].fits),1)
        self.assertEqual(model['metrics']['purgeMinutes'],1)

    def test_unqualified_model_must_return_wait(self):
        e=Estimator(3)
        model={'xgb':e,'lgb':e,'weights':{'xgb':.5,'lgb':.5},'features':['f'],
            'metrics':{'ready':False},'mode':'m5_multiclass','signalThreshold':.44,'flatMargin':.05}
        pred=ml.predict_m5(model,np.array([[1.0]]))
        self.assertEqual(pred['side'],'WAIT');self.assertFalse(pred['ready'])
        model['metrics']['ready']=True # Legacy/refitted artifacts still fail closed.
        self.assertEqual(ml.predict_m5(model,np.array([[1.0]]))['side'],'WAIT')
        model['metrics']['evaluationProtocol']=ml.EVALUATION_PROTOCOL
        self.assertEqual(ml.predict_m5(model,np.array([[1.0]]))['side'],'BUY')

    def rows(self,n=210,spacing=3000):
        return [{'t':i*spacing,'mid':100+(.04 if i>=60 else 0),'f':[0.0]*neural.FEAT_DIM} for i in range(n)]

    def test_price_features_ignore_future_and_migrate_old_history(self):
        rows=self.rows()
        at=rows[90]['t'];mid=rows[90]['mid']
        features=neural._price_context(mid,at,rows[:90])
        future={'t':at+60000,'mid':999999,'f':[0.0]*neural.FEAT_DIM}
        self.assertEqual(features,neural._price_context(mid,at,rows[:90]+[future]))
        neural.DATA_PATH.write_text('\n'.join(__import__('json').dumps({**r,'f':[0.0]*50}) for r in rows))
        neural.ROWS.clear();neural._load_rows()
        self.assertEqual(len(neural.ROWS),len(rows))
        self.assertEqual(len(neural.ROWS[-1]['f']),56)
        self.assertEqual(neural.ROWS[90]['f'][-6:],features)

    def test_neural_label_is_sixty_seconds_not_thirty_polls(self):
        rows=self.rows()
        neural.ROWS.clear();neural.ROWS.extend(rows)
        X,y,starts,ends=neural._dataset()
        self.assertEqual(ends[0]-rows[neural.SEQ_LEN-1]['t'],60000)
        # Sequence ending at poll 31 targets poll 51, before the price jump at 60.
        self.assertEqual(y[0],1)
        path=neural._path_dataset()[1]
        self.assertEqual(path[0,0],0)

    def test_neural_rejects_gaps_and_invalid_features(self):
        rows=self.rows();rows[100]['f'][2]=float('nan')
        for start,i,end in neural._sample_indices(rows):self.assertFalse(start<=100<=end)
        rows=self.rows()
        for row in rows[100:]:row['t']+=120000
        for start,i,end in neural._sample_indices(rows):self.assertFalse(start<100<=end)

    def test_neural_split_prevents_shared_sequence_and_future(self):
        starts=np.arange(3000)*2000;ends=starts+122000
        parts=neural._time_splits(starts,ends)
        self.assertEqual(len(parts),5)
        for left,right in zip(parts[:-1],parts[1:]):self.assertLess(ends[left[-1]],starts[right[0]])

    def test_temperature_softens_overconfident_bad_predictions(self):
        y=np.tile([0,1,2],100);p=np.tile([.98,.01,.01],(len(y),1))
        t=neural._fit_temperature(y,p)
        self.assertGreater(t,1)
        calibrated=neural._temperature_probs(p,t)
        self.assertTrue(np.allclose(calibrated.sum(1),1))
        self.assertLess(calibrated[0,0],p[0,0])

    def test_retry_backoff_survives_restart_and_requires_new_data(self):
        neural.SCHEDULE={'classifier':{},'path':{}}
        neural.LAST_SNAPSHOT_AT=900000
        neural._record_attempt('classifier',False)
        schedule=neural.SCHEDULE['classifier'].copy()
        self.assertEqual(schedule['failures'],1)
        self.assertFalse(neural._training_due('classifier',schedule['nextAttemptAt']+1,900000))
        self.assertTrue(neural._training_due('classifier',schedule['nextAttemptAt']+1,1200001))
        neural._record_attempt('classifier',False)
        self.assertEqual(neural.SCHEDULE['classifier']['failures'],2)
        self.assertIn('classifier',__import__('json').loads(neural.SCHEDULE_PATH.read_text()))

    def test_stale_l2_never_reports_ready(self):
        neural.ROWS.clear();neural.ROWS.extend(self.rows())
        pred=neural._predict()
        self.assertFalse(pred['ready']);self.assertEqual(pred['side'],'WAIT');self.assertEqual(pred['status'],'STALE')

    def test_classifier_training_pipeline_saves_audited_checkpoint(self):
        rng=np.random.default_rng(18)
        X=rng.normal(size=(3000,neural.SEQ_LEN,neural.FEAT_DIM)).astype(np.float32)
        y=np.arange(3000)%3
        starts=np.arange(3000)*2000;ends=starts+122000
        neural.MODEL=None;neural.METRICS=None
        neural.LAST_SNAPSHOT_AT=int(__import__('time').time()*1000)
        with patch.object(neural,'_dataset',return_value=(X,y,starts,ends)), \
             patch.object(neural,'_fit_once',return_value=neural.HybridMicroNet()), \
             patch.object(neural,'_rss_mb',return_value=100):
            neural._train()
        self.assertIsNone(neural.LAST_ERROR)
        self.assertEqual(neural.METRICS['horizonSeconds'],60)
        self.assertIn('temperature',neural.METRICS)
        self.assertTrue(neural.MODEL_PATH.exists())
        self.assertFalse(neural.TRAIN_LOCK.locked())
        self.assertFalse(neural.METRICS['ready'])

    def test_real_neural_forward_and_fit_smoke(self):
        rng=np.random.default_rng(32)
        X=rng.normal(size=(120,neural.SEQ_LEN,neural.FEAT_DIM)).astype(np.float32)
        y=np.arange(120)%3
        model=neural._fit_once(X[:90],y[:90],X[90:],y[90:])
        p=neural._probs(model,X[90:])
        self.assertEqual(p.shape,(30,3));self.assertTrue(np.isfinite(p).all())
        self.assertTrue(np.allclose(p.sum(1),1,atol=1e-6))

if __name__=='__main__':
    warnings.filterwarnings('ignore',category=FutureWarning)
    unittest.main(verbosity=2)
