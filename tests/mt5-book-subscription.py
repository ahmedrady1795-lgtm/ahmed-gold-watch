"""Exercise genuine MarketBookGet subscription lifecycle without installing MT5."""
import ast,time,types
from pathlib import Path

source=ast.parse(Path("mt5_bridge/bridge.py").read_text("utf-8"))
wanted={"order_book_snapshot","close_market_book"}
methods=[item for item in source.body if isinstance(item,ast.FunctionDef) and item.name in wanted]
assert {m.name for m in methods}==wanted

class FakeMT5:
    BOOK_TYPE_BUY=2
    BOOK_TYPE_SELL=1
    def __init__(self):
        self.adds=[];self.releases=[];self.rows=self.valid_book()
    def market_book_add(self,symbol):
        self.adds.append(symbol);return True
    def market_book_get(self,symbol):
        return self.rows
    def market_book_release(self,symbol):
        self.releases.append(symbol);return True
    def valid_book(self):
        row=lambda p,v,k:types.SimpleNamespace(price=p,volume_dbl=v,type=k)
        return [row(4100,5,2),row(4099.9,4,2),
                row(4100.1,6,1),row(4100.2,3,1)]
book=FakeMT5()
ns={"mt5":book,"SYMBOL":"XAUUSDm","time":time,
    "BOOK_SUBSCRIBED_SYMBOL":None,"BOOK_MISSING_READS":0}
exec(compile(ast.Module(body=methods,type_ignores=[]),
             "mt5_book_extract","exec"),ns)
read,close=ns["order_book_snapshot"],ns["close_market_book"]
assert read()["available"] is True
assert read()["available"] is True
assert book.adds==["XAUUSDm"],"subscription must persist on repeated reads"
assert book.releases==[],"do not destroy depth data after each read"
book.rows=[]
assert [read()["reason"] for _ in range(3)]==[
    "broker_book_warming_or_empty"]*3
assert book.releases==["XAUUSDm"],"release only after persistently empty stream"
book.rows=book.valid_book()
assert read()["available"] is True
assert book.adds==["XAUUSDm","XAUUSDm"],"resubscribe once after disconnection"
close()
assert book.releases==["XAUUSDm","XAUUSDm"],"release on shutdown"
print("PASS: MT5 depth subscribes once, persists, resubscribes on empty stream and releases only on shutdown")
