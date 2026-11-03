"""Exercise production HTTP handling without loading models or contacting providers."""
import ast
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime, formatdate
import math
from pathlib import Path
import threading
import unittest
from unittest.mock import Mock

source=Path('ml-service/app.py').read_text()
tree=ast.parse(source)
names={'fetch_history_page','fetch_coinbase_history','fetch_binance_vision_history'}
code=compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),'ml-service/app.py','exec')

class HistoryCooldownTests(unittest.TestCase):
    def setUp(self):
        self.clock=Mock()
        self.clock.monotonic.return_value=1000
        self.clock.time.return_value=1800000000
        self.session=Mock()
        self.response=Mock(status_code=429,headers={})
        self.session.get.return_value=self.response
        self.env=dict(time=self.clock,math=math,threading=threading,
            parsedate_to_datetime=parsedate_to_datetime,datetime=datetime,timezone=timezone,
            HISTORY_COOLDOWNS={},HISTORY_COOLDOWN_LOCK=threading.Lock(),REQUEST_TIMEOUT=10,
            requests=Mock(Session=Mock(return_value=self.session)))
        exec(code,self.env)
    def call(self,url='provider-a'):
        return self.env['fetch_history_page'](self.session,url,{})
    def test_throttle_exits_both_pagination_loops_without_sleep(self):
        for name in ('fetch_coinbase_history','fetch_binance_vision_history'):
            with self.subTest(name=name),self.assertRaisesRegex(RuntimeError,'HTTP 429'):
                self.env[name](30000)
        self.assertEqual(self.session.get.call_count,2)
        self.clock.sleep.assert_not_called()
    def test_retry_after_and_expiry(self):
        self.response.headers={'Retry-After':'600'}
        with self.assertRaisesRegex(RuntimeError,'600s'):self.call()
        self.clock.monotonic.return_value=1599
        with self.assertRaisesRegex(RuntimeError,'cooling down'):self.call()
        self.assertEqual(self.session.get.call_count,1)
        self.clock.monotonic.return_value=1600
        self.response.status_code=200
        self.assertIs(self.call(),self.response)
    def test_http_date_and_provider_isolation(self):
        self.response.headers={'Retry-After':formatdate(1800000900,usegmt=True)}
        with self.assertRaisesRegex(RuntimeError,'900s'):self.call()
        self.response.status_code=200
        self.assertIs(self.call('provider-b'),self.response)
        with self.assertRaisesRegex(RuntimeError,'cooling down'):self.call()
    def test_invalid_headers_and_ban_have_safe_default(self):
        for value in ('invalid','nan','inf','-1'):
            self.env['HISTORY_COOLDOWNS'].clear()
            self.response.headers={'Retry-After':value}
            self.response.status_code=418
            with self.subTest(value=value),self.assertRaisesRegex(RuntimeError,'120s'):self.call()
    def test_other_http_errors_propagate(self):
        self.response.status_code=500
        self.response.raise_for_status.side_effect=ValueError('HTTP 500')
        with self.assertRaisesRegex(ValueError,'HTTP 500'):self.call()
        self.assertEqual(self.env['HISTORY_COOLDOWNS'],{})

if __name__=='__main__':unittest.main()
