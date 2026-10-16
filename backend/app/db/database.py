"""Tiny SQLite persistence layer (stdlib only).

Orders and trades are real tables (history); everything else is small JSON
documents in a key/value table.
"""
import json
from contextlib import contextmanager
from datetime import datetime, timezone
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
        self._depth = 0
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
            CREATE TABLE IF NOT EXISTS execution_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                strategy_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS logs_strategy ON execution_logs(strategy_id, id);
            CREATE TABLE IF NOT EXISTS trades (
                id TEXT PRIMARY KEY,
                trade_date TEXT NOT NULL,
                data TEXT NOT NULL,
                created_seq INTEGER NOT NULL
            );
            """
        )
        self._commit()

    def _commit(self):
        if not self._depth:
            self.conn.commit()

    @contextmanager
    def transaction(self):
        outer = self._depth == 0
        savepoint = f"engine_tx_{self._depth}"
        self.conn.execute("BEGIN IMMEDIATE" if outer else f"SAVEPOINT {savepoint}")
        self._depth += 1
        try:
            yield
            if outer:
                self.conn.commit()
            else:
                self.conn.execute(f"RELEASE SAVEPOINT {savepoint}")
        except BaseException:
            if outer:
                self.conn.rollback()
            else:
                self.conn.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
                self.conn.execute(f"RELEASE SAVEPOINT {savepoint}")
            raise
        finally:
            self._depth -= 1

    def add_execution_log(self, sid: str, kind: str, data: dict):
        self.conn.execute(
            "INSERT INTO execution_logs(strategy_id,kind,timestamp,data) VALUES(?,?,?,?)",
            (sid, kind, datetime.now(timezone.utc).isoformat(), json.dumps(data, allow_nan=False)),
        )
        self._commit()

    def execution_logs(self, sid: str, limit: int = 200) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM execution_logs WHERE strategy_id=? ORDER BY id DESC LIMIT ?",
            (sid, max(1, min(limit, 1000))),
        ).fetchall()
        return [{"id": r["id"], "kind": r["kind"], "timestamp": r["timestamp"], "data": json.loads(r["data"])} for r in rows]

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
        self._commit()

    # --- orders ---
    def upsert_order(self, order: dict, seq: int) -> None:
        self.conn.execute(
            "INSERT INTO orders(id,data,created_seq) VALUES(?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            (order["id"], json.dumps(order), seq),
        )
        self._commit()

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
        self._commit()

    def recent_trades(self, limit: int = 500) -> list[dict]:
        rows = self.conn.execute(
            "SELECT data, trade_date FROM trades ORDER BY created_seq DESC LIMIT ?", (limit,)
        ).fetchall()
        return [{**json.loads(r["data"]), "tradeDate": r["trade_date"]} for r in rows]

    def strategy_stats(self, trade_date: str) -> dict:
        """Aggregate the complete persisted history, independently of the recent-trade cap."""
        rows = self.conn.execute(
            """SELECT COALESCE(json_extract(data, '$.strategyId'), '') AS sid,
                COUNT(*) AS trades,
                SUM(CASE WHEN json_extract(data, '$.pnl') > 0 THEN 1 ELSE 0 END) AS wins,
                SUM(json_extract(data, '$.pnl')) AS realized,
                SUM(CASE WHEN trade_date = ? THEN json_extract(data, '$.pnl') ELSE 0 END) AS day_realized
            FROM trades GROUP BY sid""", (trade_date,)
        ).fetchall()
        return {r["sid"]: {"trades": r["trades"], "wins": r["wins"],
                "realizedPnl": round(r["realized"] or 0, 2),
                "dayRealizedPnl": round(r["day_realized"] or 0, 2)} for r in rows}

    def analytics_trades(self, date_from: str | None, date_to: str, strategy_id: str | None) -> list[dict]:
        clauses, values = ["trade_date <= ?"], [date_to]
        if date_from:
            clauses.append("trade_date >= ?")
            values.append(date_from)
        if strategy_id is not None:
            clauses.append("COALESCE(json_extract(data, '$.strategyId'), '') = ?")
            values.append(strategy_id)
        rows = self.conn.execute(
            "SELECT data, trade_date FROM trades WHERE " + " AND ".join(clauses) +
            " ORDER BY trade_date, json_extract(data, '$.closedAt'), created_seq", values
        ).fetchall()
        return [{**json.loads(r["data"]), "tradeDate": r["trade_date"]} for r in rows]

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
