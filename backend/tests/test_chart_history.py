import unittest
from app.services.chart_history import aggregate_chart


def bar(time, value):
    return dict(time=time, open=value, high=value+2, low=value-1, close=value+1, volume=10)


class ChartHistoryTests(unittest.TestCase):
    def test_four_hour_exchange_session_buckets(self):
        rows = [bar(f"2026-10-23 {hour:02}:15:00", hour) for hour in range(9, 16)]
        result = aggregate_chart(rows, "4h", "TCS")
        self.assertEqual(len(result), 2)
        self.assertEqual((result[0]["open"], result[0]["close"], result[0]["volume"]), (9, 13, 40))
        self.assertIn("13:15:00+05:30", result[1]["time"])

    def test_calendar_candles(self):
        rows = [bar("2024-12-31 09:15:00", 10), bar("2025-01-02 09:15:00", 20), bar("2025-01-03 09:15:00", 30), bar("2025-02-03 09:15:00", 40)]
        for tf, count in [("1M", 3), ("1Y", 2), ("5Y", 2)]:
            result = aggregate_chart(list(reversed(rows)), tf, "TCS")
            self.assertEqual(len(result), count)
            self.assertEqual(result[-1]["close"], 41)
            self.assertEqual(sum(b["volume"] for b in result), 40)
        year = aggregate_chart(rows, "1Y", "TCS")[-1]
        self.assertEqual((year["open"], year["high"], year["low"], year["close"]), (20, 42, 19, 41))
