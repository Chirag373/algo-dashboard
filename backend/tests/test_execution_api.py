"""Real ASGI route integration tests, no external APIs or network required."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from app.db.database import Database
from app.main import get_application
from app.services.broker import PaperBroker
from app.services.engine import TradingEngine
from tests.test_execution import setup, payload, rule

class RecordingHub:
    def __init__(self): self.messages = []
    async def broadcast(self, message): self.messages.append(message)

class ExecutionApiTests(unittest.TestCase):
    def setUp(self):
        self.engine,self.tape = setup()
        self.app = get_application()
        self.app.state.engine = self.engine
        self.app.state.hub = RecordingHub()
    def request(self, method, path, data=None):
        body = b"" if data is None else json.dumps(data).encode()
        messages = []
        async def receive(): return {"type":"http.request","body":body,"more_body":False}
        async def send(message): messages.append(message)
        scope = dict(type="http",asgi={"version":"3.0"},http_version="1.1",method=method,scheme="http",path=path,raw_path=path.encode(),query_string=b"",root_path="",headers=[(b"content-type",b"application/json")],client=("127.0.0.1",1234),server=("test",80))
        asyncio.run(self.app(scope,receive,send))
        status = next(m["status"] for m in messages if m["type"]=="http.response.start")
        body = b"".join(m.get("body",b"") for m in messages if m["type"]=="http.response.body")
        return status,json.loads(body)
    def test_creation_through_automatic_stop_and_target(self):
        for price,reason in [(98,"Stop-loss hit"),(104,"Target hit")]:
            with self.subTest(reason=reason):
                self.setUp()
                config = payload([rule(right="200"),rule("SMA 2","greater than","0",connector="OR")]).model_dump()
                code,res = self.request("POST","/api/v1/strategies",config)
                self.assertEqual(code,201)
                s = res["result"]
                self.assertEqual(s["status"],"running")
                self.assertEqual(s["entryRules"][1]["connector"],"OR")
                self.assertEqual(res["state"]["mode"],"paper")
                self.assertFalse(res["state"]["liveEnabled"])
                self.assertTrue(self.app.state.hub.messages)
                self.engine.on_tick(self.tape.tick(101))
                self.assertFalse(self.engine.positions)
                self.engine.on_tick(self.tape.tick(101))
                _,state = self.request("GET","/api/v1/state")
                self.assertEqual(state["positions"][0]["qty"],7)
                self.assertEqual(state["positions"][0]["avg"],101)
                self.engine.on_tick(self.tape.tick(price))
                _,state = self.request("GET","/api/v1/state")
                self.assertFalse(state["positions"])
                self.assertEqual(len(state["orders"]),2)
                self.assertEqual(state["closed"][0]["reason"],reason)
                self.assertEqual(state["dayPnl"],state["closed"][0]["pnl"])
                code,logs = self.request("GET",f"/api/v1/strategies/{s['id']}/logs")
                self.assertEqual(code,200)
                self.assertTrue({"created","evaluation","signal","entry","exit"} <= {x["kind"] for x in logs["logs"]})
    def test_validation_controls_edit_and_live_rejection(self):
        config = payload().model_dump()
        self.assertEqual(self.request("POST","/api/v1/strategies",{**config,"entryRules":[rule("Bogus")]})[0],422)
        self.assertEqual(self.request("POST","/api/v1/strategies",{**config,"params":{"quantity":1.5}})[0],422)
        _,res = self.request("POST","/api/v1/strategies",config)
        sid = res["result"]["id"]
        base = f"/api/v1/strategies/{sid}"
        self.assertEqual(self.request("PUT",base,config)[0],409)
        for status in ["paused","running","stopped"]:
            code,res = self.request("PUT",base+"/status",{"status":status})
            self.assertEqual(code,200)
            self.assertEqual(next(s for s in res["state"]["strategies"] if s["id"]==sid)["status"],status)
        code,res = self.request("PUT",base,{**config,"timeframe":"7m"})
        self.assertEqual(code,200)
        self.assertEqual(res["result"]["version"],2)
        self.assertEqual(res["result"]["status"],"running")
        self.assertEqual(self.request("PUT","/api/v1/mode",{"mode":"live"})[0],403)
        self.assertEqual(self.request("GET","/api/v1/strategies/missing/logs")[0],404)
    def test_rejected_orders_remain_in_history(self):
        self.engine.on_tick(self.tape.tick(101))
        self.engine.set_kill(True)
        code,_ = self.request("POST","/api/v1/orders",{"symbol":"TCS","side":"BUY","qty":7})
        self.assertEqual(code,400)
        self.assertEqual(self.engine.db.recent_orders()[0]["status"],"REJECTED")
    def test_reopen_sqlite_restores_positions_signals_and_controls(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory)/"state.db")
            db = Database(path)
            e = TradingEngine(db,self.tape,PaperBroker(0))
            s = e.create_strategy(payload())
            e.on_tick(self.tape.tick(101)); e.set_strategy_status(s["id"],"paused")
            db.conn.close()
            restored = TradingEngine(Database(path),self.tape,PaperBroker(0))
            self.assertEqual(restored.positions[0]["qty"],7)
            self.assertEqual(restored._find_strategy(s["id"])["status"],"paused")
            self.assertTrue(restored.runtime[s["id"]]["symbols"]["TCS"]["matched"])
            restored.on_tick(self.tape.tick(104))
            self.assertFalse(restored.positions)
            self.assertEqual(restored.db.recent_trades()[0]["reason"],"Target hit")
            restored.db.conn.close()

if __name__ == "__main__": unittest.main()
