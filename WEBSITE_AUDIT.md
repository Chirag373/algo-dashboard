# Website audit — 26 October 2026

**Result: the main terminal passes the checks below, but the entire website is not fully functional.** Legacy views and broker settings still contain incomplete features.

## Confirmed issues

| Priority | Area                                    | Finding and effect                                                                                                                                                                           | Source                                                                                                                                                                                                             |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High     | Terminal Settings                       | “Save API Settings” only sets a success flag in React. It does not send a request or persist the edited key, so the message is misleading.                                                   | [settings/page.tsx](/Users/rohan/Documents/algo-dashboard/src/app/terminal/settings/page.tsx:28)                                                                                                                   |
| High     | Legacy ORB dashboard and opening ranges | P&L, trade counts, closed trades and opening ranges are hardcoded. The opening-ranges badge says 213 stocks while only three fixture rows are defined. These are not current engine results. | [OrbDashboardContent.tsx](/Users/rohan/Documents/algo-dashboard/src/components/OrbDashboardContent.tsx:22), [opening-ranges/page.tsx](/Users/rohan/Documents/algo-dashboard/src/app/orb/opening-ranges/page.tsx:4) |
| Medium   | Legacy ORB settings and open trades     | Save All Settings has no handler or persistence. Open Trades is a placeholder and cannot display actual positions.                                                                           | [settings/page.tsx](/Users/rohan/Documents/algo-dashboard/src/app/orb/settings/page.tsx:111), [open-trades/page.tsx](/Users/rohan/Documents/algo-dashboard/src/app/orb/open-trades/page.tsx:7)                     |
| High     | Legacy FinBaba analytics                | Summary values and rows are examples. Apply Filter, Reset and Download CSV have no action handlers. The strategy selector does not filter a backend dataset.                                 | [analytics/page.tsx](/Users/rohan/Documents/algo-dashboard/src/app/finbaba/analytics/page.tsx:13)                                                                                                                  |
| Medium   | Access screen                           | Any nonempty passcode other than the two legacy routing keywords opens the terminal. Passcode validation is explicitly unfinished; this screen is a navigation gate, not authentication.     | [page.tsx](/Users/rohan/Documents/algo-dashboard/src/app/page.tsx:11)                                                                                                                                              |

## Checks that passed

- Production build (`npm run build`).
- Repository lint (`npm run lint`).
- TypeScript (`tsc --noEmit --incremental false`).
- All 141 backend regression tests.
- All 19 listed page routes and 10 core API requests returned HTTP 200.
- Browser navigation across all terminal sections and the seven legacy ORB/FinBaba pages showed no captured JavaScript console errors.
- Dashboard connected to the engine and rendered persisted strategies, positions and trade history.
- WebSocket `/ws/terminal` delivered a snapshot with data.
- Kite option-chain request returned real contracts and quotes; the page displayed a refreshed timestamp and 41 NIFTY strikes.
- Trading stock selection and timeframe switching updated the displayed instrument and chart; order-history tabs rendered persisted complete/rejected orders.
- History strategy filtering changed the displayed trade count and pagination consistently.
- Forward Put Builder selector and expiry-month controls were verified in the browser during their implementation; 19 dedicated regression tests cover expiry boundaries, month rollover, isolated selections, lot sizing, liquidity/freshness, short fills, exits, risk and persistence.
- A read-only seven-calendar-day historical backtest of an existing saved Custom strategy returned HTTP 200, five trades, and Kite-sourced history. Provider coverage disclosed one missing weekday rather than fabricating data.

## Correction made during this audit

The full suite initially failed the VIX and USDINR variants of one reference-indicator backtest test. It required signal time to be strictly before the next candle open, although a candle close and the following candle open share the same timestamp. The fixture now gives the following candle a distinct opening price and asserts that exact fill price as well as the shared boundary time. This verifies causal next-candle execution without inventing a timestamp delay. The full suite then passed: 141 tests. Production backtest logic was not changed.

[Corrected regression test](/Users/rohan/Documents/algo-dashboard/backend/tests/test_reference_indicators.py:122)

## HTTP coverage

| Type | Route                                             | Status |
| ---- | ------------------------------------------------- | ------ |
| page | `/`                                               | 200    |
| page | `/terminal`                                       | 200    |
| page | `/terminal/trading`                               | 200    |
| page | `/terminal/option-chain`                          | 200    |
| page | `/terminal/strategies`                            | 200    |
| page | `/terminal/strategies/new`                        | 200    |
| page | `/terminal/history`                               | 200    |
| page | `/terminal/backtest`                              | 200    |
| page | `/terminal/analytics`                             | 200    |
| page | `/terminal/risk`                                  | 200    |
| page | `/terminal/settings`                              | 200    |
| page | `/orb/dashboard`                                  | 200    |
| page | `/orb/opening-ranges`                             | 200    |
| page | `/orb/open-trades`                                | 200    |
| page | `/orb/trade-history`                              | 200    |
| page | `/orb/settings`                                   | 200    |
| page | `/finbaba/dashboard`                              | 200    |
| page | `/finbaba/analytics`                              | 200    |
| page | `/callback`                                       | 200    |
| api  | `/health`                                         | 200    |
| api  | `/state`                                          | 200    |
| api  | `/analytics`                                      | 200    |
| api  | `/strategies`                                     | 200    |
| api  | `/assets?limit=20`                                | 200    |
| api  | `/quotes?symbols=ITC%2CNIFTY%2050`                | 200    |
| api  | `/kite/status`                                    | 200    |
| api  | `/kite/option-underlyings`                        | 200    |
| api  | `/kite/option-chain?symbol=NIFTY`                 | 200    |
| api  | `/history/ITC?timeframe=1d&limit=10&days_back=30` | 200    |

## Limits and interpretation

- HTTP 200 confirms that a route responds, not that every button on it works; the source-level gaps above remain open.
- Order creation, protective exits, strategy lifecycle and risk mutations were exercised through deterministic tests with isolated databases. Browser checks of the running account covered navigation, read controls and filtering.
- Real broker order routing is disabled by the engine. Live orders and the external interactive Zerodha sign-in flow were not exercised.
- Forward Put Builder historical backtesting is explicitly unsupported. Missing expiry months, strikes or executable fresh depth skip entries with logged reasons.
- Market data is polled; chart OHLCV and option-chain snapshots have their configured refresh intervals rather than tick-stream guarantees.
- The backend is currently running using `/private/tmp/algo-dashboard-forward-put-venv` with a fresh bytecode cache. The original Python environment had iCloud-offloaded files; its ordinary startup path was not certified by this audit.

Both frontend (port 3000) and backend (port 8000) were running when the audit finished.
