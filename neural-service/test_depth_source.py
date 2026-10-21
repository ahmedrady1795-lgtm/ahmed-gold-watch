"""Offline tests: truthful alternate-venue L2 feed and model isolation."""
import json
import tempfile
import time
from pathlib import Path

import requests
import app as neural

class FakeResponse:
    def __init__(self, status, body, headers=None):
        self.status_code=status
        self.body=body
        self.headers=headers or {}
    def raise_for_status(self):
        if self.status_code>=400:
            raise requests.HTTPError("HTTP "+str(self.status_code),response=self)
    def json(self):return self.body

class FakeSession:
    def __init__(self):self.urls=[]
    def get(self,url,params=None,timeout=None):
        self.urls.append(url)
        if "binance" in url:
            return FakeResponse(418,{},{"Retry-After":"600"})
        if "coinbase" in url:
            bids=[[str(100-i*.1),"1","1"] for i in range(10)]
            asks=[[str(100.1+i*.1),"2","1"] for i in range(10)]
            return FakeResponse(200,{"bids":bids,"asks":asks})
        raise RuntimeError(url)

neural.SESSION=FakeSession()
neural.COINBASE_PINNED=False
neural.DEPTH_COOLDOWN_UNTIL=0
neural.LAST_DEPTH_HOST=None
bids,asks=neural._fetch_depth()
assert len(bids)==10 and len(asks)==10 and bids[0][0]<asks[0][0]
assert neural.COINBASE_PINNED
assert neural.LAST_DEPTH_HOST==neural.COINBASE_HOST
assert len(neural.SESSION.urls)==2, "Binance ban cannot rotate to another Binance hostname"
assert neural.DEPTH_COOLDOWN_UNTIL>time.time()
neural._fetch_depth()
assert neural.SESSION.urls[-1].startswith(neural.COINBASE_HOST)
assert len(neural.SESSION.urls)==3, "once Coinbase pinned, do not hammer Binance"
with tempfile.TemporaryDirectory() as d:
    neural.DATA_PATH=Path(d)/"test.jsonl"
    at=int(time.time()*1000)-1000
    venues=["BINANCE","BINANCE","COINBASE","COINBASE"]
    neural.DATA_PATH.write_text("".join(json.dumps({
        "venue":venue,"mid":100+i,"t":at+i,"f":[0.1]*neural.FEAT_DIM
    })+"\n" for i,venue in enumerate(venues)))
    neural.ROWS.clear()
    neural.ACTIVE_DEPTH_SOURCE="NONE"
    neural._load_rows()
    assert len(neural.ROWS)==2, "do not reload mixed venue features"
    assert neural.ACTIVE_DEPTH_SOURCE=="COINBASE"
    assert all(r["venue"]=="COINBASE" for r in neural.ROWS)
    neural.MODEL_DEPTH_SOURCE="BINANCE"
    x=neural._predict()
    assert x["ready"] is False
    assert x["reason"]=="neural_model_venue_mismatch",x
print("PASS: Binance 418 stops same-IP host cycling, Coinbase L2 alternate, venue-isolated restoration and prediction gating")
