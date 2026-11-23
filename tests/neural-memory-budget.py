"""Regress safe training limits for 512 MB Render free-tier CPU web services.
No torch import, collector startup, provider network or live model execution.
"""
import ast
from pathlib import Path
import unittest
import tempfile
import os
import json
from types import SimpleNamespace

source=Path("neural-service/app.py").read_text(encoding="utf-8")
tree=ast.parse(source)
names={"_training_budget_from_limit"}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert len(nodes)==1
ns={"MEMORY_TRAIN_START_MB":620.0}
exec(compile(ast.Module(body=nodes,type_ignores=[]),"neural-service/app.py","exec"),ns)
budget=ns["_training_budget_from_limit"]
MIB=1024*1024
class NeuralBudgetTests(unittest.TestCase):
 def test_free_512_mb_caps_training_start(self):
  self.assertAlmostEqual(budget(512*MIB),332.0)
  self.assertLessEqual(budget(512*MIB)+180,512)
  self.assertEqual(budget(1024*MIB),620.0)
  self.assertEqual(budget(None),620.0)
  self.assertEqual(budget(2**63-1),620.0)
 def test_explicit_ceiling_not_raised(self):
  ns["MEMORY_TRAIN_START_MB"]=240.0
  self.assertEqual(budget(512*MIB),240.0)
  ns["MEMORY_TRAIN_START_MB"]=620.0
 def test_collector_and_both_training_modes_share_guard(self):
  self.assertIn('NEURAL_TRAIN_MAX_SAMPLES","5000"',source)
  self.assertIn('NEURAL_TORCH_THREADS","1"',source)
  self.assertEqual(source.count("_rss_mb()>_memory_training_budget_mb()"),2)
  self.assertEqual(source.count("_rss_mb()<=_memory_training_budget_mb()"),2)
  self.assertIn('"trainingStartRssLimitMb"',source)
  self.assertIn('RUNTIME_REVISION="bounded-free-tier-training-r4.2"',source)
 def test_once_per_revision_retry_for_failed_neural_training_only(self):
  method=next(n for n in tree.body if isinstance(n,ast.FunctionDef)
              and n.name=="_recover_training_schedule")
  with tempfile.TemporaryDirectory() as d:
   schedule={"classifier":{"ready":False,"failures":4,"nextAttemptAt":999999999,
     "dataEndAt":90000},"path":{"ready":True,"failures":0,"nextAttemptAt":678901}}
   ns={"SCHEDULE":schedule,"RUNTIME_REVISION":"bounded-free-tier-training-r4.2",
       "SCHEDULE_PATH":Path(d)/"training_schedule.json",
       "time":SimpleNamespace(time=lambda:1000),"os":os,"json":json}
   exec(compile(ast.Module(body=[method],type_ignores=[]),
                "neural-service/app.py","exec"),ns)
   recover=ns["_recover_training_schedule"]
   self.assertTrue(recover())
   self.assertEqual(schedule["classifier"]["nextAttemptAt"],1120000)
   self.assertEqual(schedule["classifier"]["failures"],0)
   self.assertEqual(schedule["classifier"]["dataEndAt"],0)
   self.assertEqual(schedule["path"]["nextAttemptAt"],678901,
                    "preserve already successful champion schedule")
   self.assertFalse(recover(),"idempotent across health checks and restarts")
   self.assertEqual(json.loads(ns["SCHEDULE_PATH"].read_text())["runtimeRevision"],
                    "bounded-free-tier-training-r4.2")
 def test_prediction_still_has_closed_snapshot_age_and_causal_training(self):
  self.assertIn("snapshot_age_ms=int(time.time()*1000)-int(rows[-1][\"t\"])",source)
  self.assertIn('if bad[j+1]!=bad[start] or gap[j]!=gap[start]:continue',source)

if __name__=="__main__":unittest.main()
