"""Tiny SQLite persistence layer (stdlib only).

Orders and trades are real tables (history); everything else is small JSON
documents in a key/value table.
"""
import json
import sqlite3
from pathlib import Path
from typing import Any


class Database:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_seq INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                trade_date TEXT NOT NULL,
                data TEXT NOT NULL,
                created_seq INTEGER NOT NULL
            );
            """
        )
        self.conn.commit()

    # --- kv ---
    def get(self, key: str, default: Any = None) -> Any:
        row = self.conn.execute("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set(self, key: str, value: Any) -> None:
        self.conn.execute(
            "INSERT INTO kv(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value)),
        )
        self.conn.commit()

    # --- orders ---
    def upsert_order(self, order: dict, seq: int) -> None:
        self.conn.execute(
            "INSERT INTO orders(id,data,created_seq) VALUES(?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            (order["id"], json.dumps(order), seq),
        )
        self.conn.commit()

    def recent_orders(self, limit: int = 200) -> list[dict]:
        rows = self.conn.execute(
            "SELECT data FROM orders ORDER BY created_seq DESC LIMIT ?", (limit,)
        ).fetchall()
        return [json.loads(r["data"]) for r in rows]

    # --- trades ---
    def add_trade(self, trade: dict, trade_date: str, seq: int) -> None:
        self.conn.execute(
            "INSERT INTO trades(id,trade_date,data,created_seq) VALUES(?,?,?,?)",
            (trade["id"], trade_date, json.dumps(trade), seq),
        )
        self.conn.commit()

    def recent_trades(self, limit: int = 500) -> list[dict]:
        rows = self.conn.execute(
            "SELECT data FROM trades ORDER BY created_seq DESC LIMIT ?", (limit,)
        ).fetchall()
        return [json.loads(r["data"]) for r in rows]

    def trades_for_date(self, trade_date: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT data FROM trades WHERE trade_date=? ORDER BY created_seq DESC",
            (trade_date,),
        ).fetchall()
        return [json.loads(r["data"]) for r in rows]

    def max_seq(self) -> int:
        a = self.conn.execute("SELECT COALESCE(MAX(created_seq),0) m FROM orders").fetchone()["m"]
        b = self.conn.execute("SELECT COALESCE(MAX(created_seq),0) m FROM trades").fetchone()["m"]
        return max(a, b)
