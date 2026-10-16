This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Automated paper strategies

Run the API from `backend/` with `venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001`, and the frontend with `npm run dev` from the repository root.

Saving a **Custom** strategy automatically starts it in Paper Trading. The builder's instrument, exact quantity, timeframe, stop percentage, target percentage, entry conditions and optional exit conditions are saved to SQLite. Existing ORB strategies keep their dedicated execution path. Real-money execution is refused regardless of the `LIVE_ENABLED` setting.

- Supported operands on either side: EMA (default 9), SMA (20), Wilder RSI (14), close price, fixed numbers, opening range high/low, session VWAP, and Supertrend (Wilder ATR 10, multiplier 3). Periods for EMA/SMA/RSI are configurable from 1 to 500.
- Opening range means the first completed candle of the selected timeframe in that instrument's exchange session. VWAP requires genuine volume and the beginning of the session; missing or zero total volume leaves it unavailable.
- Comparisons include all builder operators and crossover/crossunder. Crosses compare both operands on consecutive completed candles, including equality at the previous candle. AND takes precedence over OR. An unknown required operand waits for data; a known true OR branch may satisfy an expression.
- Timeframes include 1m, 5m, 15m, 30m, 1h, 4h and custom positive minute/hour intervals up to 1440 minutes (for example `7m` or `2h`). Exchange-session alignment, completed candles, genuine OHLCV, and short final session candles are respected. Missing intraday bars break the indicator calculation window.
- Each strategy/instrument has a persisted candle cursor and signal latch. A continuously true expression produces one entry; it must become false before another entry. Signals observed while a position is open or the strategy is paused are consumed. Restarting or repeatedly clicking Start cannot replay an already consumed signal. Activation/resume waits for a newly completed candle.
- Pause and Stop suppress entries. Stop-loss and target monitoring continues for existing paper positions. Paused strategies also evaluate optional exit conditions. Close positions before editing or deleting their strategy; saving edits starts the new version.
- Stop and target levels derive from the actual paper fill. Quotes update unrealized P&L; exits write orders, net trades (including fees), realized P&L and the shared dashboard/analytics snapshot atomically. A gap fills at the observed opening price when worse than the stop. If a completed bar touches both stop and target, the stop takes precedence. Pre-entry candle extremes cannot close a newly opened position.

The default `FEED=real_market` polls historical/market OHLCV in background workers. Selected instruments are subscribed automatically; 4h and custom intervals are aggregated locally from a supported divisor. Network calls have timeouts, and data older than 120 seconds is ineligible for execution. Provider availability, coverage and history limits apply: this is a polled feed, and strategies wait when candles, volume or indicator warmup are insufficient. NSE/BSE symbols use Indian sessions; the builder preserves US market metadata for US assets. The backend must remain running for execution and protective exits.

For an offline compressed simulation, set `FEED=simulated` before starting the backend. This uses explicitly simulated prices/volumes for the built-in symbol universe; unavailable instruments wait for data. Simulation and paper execution are separate concepts: both feed modes always use the local PaperBroker.

Expand a strategy to see every evaluated condition and its execution messages. Persistent evaluation, signal, entry, exit, control and error logs are available at `GET /api/v1/strategies/{id}/logs?limit=200` and in the expanded execution log. State, orders, trades, candle cursors and latches are committed together; a failed strategy evaluation rolls back its changes independently, and database failures roll back the tick.

Validation (no external market APIs or real orders):

```bash
cd backend
venv/bin/python -m unittest discover -s tests -v
```

The suite exercises indicator reference values, every builder operand/operator, AND/OR, crosses, timeframe aggregation, save-to-entry-to-stop/target through the actual ASGI routes, fees/P&L, independent controls, duplicate callbacks, SQLite reopen, rejected orders, stale data and transaction rollback.

## Historical Backtest page

`/terminal/backtest` lists the actual saved strategies. `POST /api/v1/kite/backtest` accepts `strategy_id`, `days_back` (1–3650 calendar days), `capital`, `slippage_pct`, and optional `fee_per_order`. The server snapshots the saved version and does not accept replacement rules, symbols, timeframes or quantities. Historical runs never call a broker or modify the trading engine, positions, orders or persisted trades.

The requested interval runs from midnight `days_back` days ago to midnight today, exclusive, in the instrument’s exchange timezone. Earlier data is used only for indicator warmup. Authenticated Indian history uses Kite REST minute candles in date-bounded chunks, with instrument tokens resolved from the instrument master. See the official [historical candle contract](https://kite.trade/docs/connect/v3/historical/) and [instrument master](https://kite.trade/docs/connect/v3/market-quotes/). The existing login and token exchange use the documented [Kite authentication flow](https://kite.trade/docs/connect/v3/user/) without requiring an optional SDK. Provider failures do not silently switch an authenticated Kite run to a different source. Without a Kite session, the explicitly labeled Yahoo historical fallback is used within its supported retention; unsupported ranges fail with an explanation rather than returning an invented or silently shortened test.

Custom strategies use the same registered indicators, comparisons, crossover semantics and AND/OR evaluation as paper execution. Native ORB uses its saved opening range, budget/quantity, per-stock trade limit and trailing-stop settings. FinBaba has no execution model and is rejected explicitly. Incomplete timeframe candles are excluded and indicator series restart after intraday gaps. Exchange holidays and unknown days without candles are reported as unobserved sessions; no prices are filled in.

Backtest signals fill at the **next available source candle open**, with adverse percentage slippage on both sides. Protective stops/targets use source OHLC; stop first when both touch, with gap-aware fills. Threshold exit timestamps use the source candle close because intrabar touch times are unavailable. Square-off follows the saved cutoff; remaining positions are liquidated at the final available close. Modeled costs are a fixed fee per order plus slippage; exchange taxes and other charges are excluded. Test capital controls affordability without reducing saved quantity (10% index margin, 100% equity margin). These assumptions and any data limitations appear alongside each result.

All statistics, monthly returns, trade rows and charts come from that run. Equity includes marked open positions and incurred fees. Drawdown is measured at source-candle observations; Sharpe uses observed-session equity returns, sample standard deviation, zero risk-free rate and annualization by `sqrt(252)`, returning null when undefined. Profit factor uses winning versus losing net trade P&L, with infinity shown only for positive profits and no losses. No result preview, hardcoded metrics or example trades are displayed. Changing strategy/version, horizon or costs hides mismatched results and aborts obsolete browser requests.

Backtest regression coverage: `venv/bin/python -m unittest tests.test_backtest -v` from `backend/`. It covers every builder indicator and supported timeframe, next-open fills, gaps, fees, slippage, stop/target ordering, end-of-period exits, native ORB directions, monthly/Sharpe/profit-factor calculations, Kite chunking, provider errors, history horizons, and the saved-ID API contract with unchanged trading state.

Basket backtests continue past per-instrument missing listings or empty histories and return `coverageComplete`, `requestedInstruments` and `excludedInstruments`. The page prominently labels these as partial basket results and names each exclusion; no substitute symbol is used. If all instruments are unavailable, or authentication, retention or general provider errors occur, the run fails explicitly. Single-instrument tests never silently omit the requested instrument.
