"""Model-audit regression: M1 training holds out a paired, training-only baseline.
No data downloads, no training, no future labels in threshold selection.
"""
import ast
from pathlib import Path
import unittest
import numpy as np

tree=ast.parse(Path("ml-service/app.py").read_text(encoding="utf-8"))
names={"paired_binary_baseline","live_training_source_matches"}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
assert len(nodes)==2, "expected both auditable ML provenance helpers"
namespace={"np":np}
exec(compile(ast.Module(body=nodes,type_ignores=[]),"ml-service/app.py","exec"),namespace)
baseline=namespace["paired_binary_baseline"]
coherent=namespace["live_training_source_matches"]

class MlPairedBaselineTests(unittest.TestCase):
 def test_evaluate_exact_selected_rows(self):
  y=np.array([0,1,1,0,1,1])
  p=np.array([.49,.91,.51,.08,.12,.52])
  # .91/.08/.12 are the ONLY selected rows; train-majority 0 -> one win.
  self.assertAlmostEqual(baseline(y,p,.56,0),1/3)
  self.assertAlmostEqual(baseline(y,p,.56,1),2/3)
  agree=np.array([True,True,True,False,False,True])
  self.assertEqual(baseline(y,p,.56,0,agree),0)
  self.assertEqual(baseline(y,p,.56,1,agree),1)
 def test_invalid_reference_never_counts(self):
  with self.assertRaises(ValueError):baseline([1,0],[.9],.56,1)
  with self.assertRaises(ValueError):baseline([1,0],[.9,.1],.56,2)
  with self.assertRaises(ValueError):baseline([1,0],[.9,.1],.56,0,[True])
  self.assertEqual(baseline([1,0],[.5,.5],.56,0),0)
 def test_source_matching_not_synthetic(self):
  train="Binance Vision BTCUSDT 1m + taker flow"
  self.assertTrue(coherent(train,"Binance Vision live taker flow"))
  self.assertTrue(coherent(train,"Binance Vision cached taker flow"))
  self.assertFalse(coherent(train,"main-app candle fallback · neutral micro"))
  self.assertFalse(coherent("Coinbase Exchange BTC-USD 1m · neutral micro fallback","Binance Vision live taker flow"))
  self.assertFalse(coherent(train,None))
  self.assertFalse(coherent(None,"Binance Vision live taker flow"))
 def test_integration_keeps_oos_untouched_and_vetoes_cross_venue(self):
  methods={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
  h=ast.unparse(methods["train_horizon"])
  p=ast.unparse(methods["predict"])
  self.assertIn("train_majority = int(np.mean(ytr)",h)
  self.assertIn("paired_binary_baseline(labels, pred, signal_threshold, train_majority, agreement)",h)
  self.assertIn('report["pairedBaselineAccuracy"]',h)
  self.assertIn('me["edgeVsBaseline"] >= 0.02',h)
  self.assertIn('live_training_source_matches(MODELS.get("source"), live_source)',p)
  self.assertIn('horizon["side"] = "WAIT"',p)
  self.assertIn('"liveSourceCoherent": source_coherent',p)

if __name__=="__main__":unittest.main()
