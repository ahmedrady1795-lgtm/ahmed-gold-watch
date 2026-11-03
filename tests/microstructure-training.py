"""Causal microstructure training regression checks; no external network calls."""
import importlib.util
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('micro',ROOT/'ml-service/microstructure.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class FakeModel:
    classes_=np.array([0,2])
    def __init__(self,*args):self.fits=[]
    def fit(self,X,y):self.fits.append((X.copy(),y.copy()));return self
    def predict_proba(self,X):return np.tile([.4,.6],(len(X),1))

class MicroTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.core=mod.MicrostructureCore(Path(self.tmp.name))
    def rows(self,n=300,spacing=3000):
        return [{'t':100000+i*spacing,'mid':100+(0.1 if i>=24 else 0),'f':[0.]*50} for i in range(n)]
    def test_horizon_uses_elapsed_time(self):
        self.core.rows.extend(self.rows())
        X,y,start,end=self.core._dataset()
        self.assertEqual(end[0]-(100000+11*3000),30000)
        self.assertEqual(y[0],1) # target is poll 21, exactly 30 seconds later
        self.assertEqual(X.shape[1],612)
    def test_gaps_and_nan_do_not_cross_samples(self):
        rows=self.rows();rows[80]['f'][0]=float('nan')
        for row in rows[150:]:row['t']+=120000
        self.core.rows.extend(rows)
        _,_,start,end=self.core._dataset()
        self.assertFalse(np.any((start<=rows[80]['t'])&(end>=rows[80]['t'])))
        self.assertFalse(np.any((start<rows[150]['t'])&(end>=rows[150]['t'])))
    def test_purging_separates_feature_and_target_windows(self):
        self.core.rows.extend(self.rows(2000))
        _,_,start,end=self.core._dataset()
        parts=self.core._time_splits(start,end)
        for left,right in zip(parts,parts[1:]):self.assertLess(end[left[-1]],start[right[0]])
    def test_missing_class_maps_to_noise_column(self):
        p=self.core._class_probs(FakeModel(),np.zeros((5,1)))
        np.testing.assert_allclose(p[0],[.4,0,.6])
    def test_only_evaluated_estimator_is_saved(self):
        n=2000;X=np.arange(n).reshape(-1,1);y=np.arange(n)%3
        starts=np.arange(n)*3000;ends=starts+63000
        model=FakeModel();saved=[]
        with patch.object(self.core,'_dataset',return_value=(X,y,starts,ends)),patch.object(mod,'Pipeline',return_value=model),patch.object(mod.joblib,'dump',side_effect=lambda obj,path:(saved.append(obj),Path(path).touch())):
            self.core._train()
        self.assertIsNone(self.core.last_error)
        self.assertEqual(len(model.fits),1)
        self.assertIs(saved[0]['model'],model);self.assertIs(self.core.model,model)
        self.assertLess(len(model.fits[0][0]),n*.70)
        self.assertEqual(self.core.metrics['evaluationProtocol'],'purged-sequence-holdout-v1')
        self.assertIn('edgeVsBaseline',self.core.metrics['holdout'])
        self.assertFalse(self.core.train_lock.locked())
    def test_stale_observations_cannot_emit_ready(self):
        self.core.rows.extend(self.rows())
        self.core.model=FakeModel();self.core.metrics={'ready':True}
        p=self.core.predict()
        self.assertEqual(p['status'],'STALE');self.assertFalse(p['ready']);self.assertEqual(p['side'],'WAIT')
    def test_failed_training_has_retry_delay_and_releases_lock(self):
        with patch.object(self.core,'_dataset',side_effect=ValueError('bad data')):self.core._train()
        self.assertIn('bad data',self.core.last_error)
        self.assertGreater(self.core.last_train_at,0)
        self.assertFalse(self.core.train_lock.locked())
    def test_real_estimator_fit_and_reload(self):
        rng=np.random.default_rng(77);n=650
        X=rng.normal(size=(n,6)).astype(np.float32);y=(X[:,0]>0).astype(int)*2
        starts=np.arange(n)*3000;ends=starts+63000
        self.core.min_train=400
        with patch.object(self.core,'_dataset',return_value=(X,y,starts,ends)):
            self.core._train()
        self.assertIsNone(self.core.last_error)
        self.assertTrue(self.core.model_path.exists())
        restored=mod.MicrostructureCore(Path(self.tmp.name))
        np.testing.assert_allclose(self.core._class_probs(self.core.model,X[-10:]),
                                   restored._class_probs(restored.model,X[-10:]))

    def test_old_artifact_rejected(self):
        with patch.object(mod.joblib,'load',return_value={'version':'micro-neural-v1','model':FakeModel(),'metrics':{'ready':True}}):
            self.core.model_path.touch();self.core._load_model()
        self.assertIsNone(self.core.model)

if __name__=='__main__':unittest.main(verbosity=2)
