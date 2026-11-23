# Peak Rider — BTC trading bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/arayautis/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/arayautis/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A trading bot for make.fun's "Race a BTC trading bot live for 24 hours"
bounty. It trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute
bars, paper money only — nothing here trades for real.

## The idea

A full-size round trip costs about 26 bps in fees, slippage and price
impact, while a 1-minute bar moves about 8 bps (one standard deviation).
Any bot that trades on 1-minute signals bleeds itself dry — the kit's own
baselines prove it on the dev window: EMA-cross (76 trades) lost $114.83,
RSI-Bollinger lost $9.32, ADX-momentum lost $11.20, while buy-and-hold
made $32.17.

So this bot trades at most twice in the whole 24 hours:

1. **Buy** the full cash balance on the first tradable batch.
2. **Sell** everything the first time a bar closes 1.25% below the
   highest close seen since entry — and never buy again.

The trailing stop is the whole strategy. It banks most of a rally,
caps the loss near the stop in a falling market, and keeps the bot near
cash in a flat one instead of churning.

## Backtest results (local replay of the kit's dev window, exact fill model)

| Window | Peak Rider | Buy-and-hold |
| --- | --- | --- |
| Dev window (BTC +3.64%) | **+$26.56**, 2 trades, max drawdown 1.4% | +$32.17 |
| Dev window reversed (BTC −3.64%) | **−$7.68** | −$38.38 |
| Dev window detrended (flat) | **+$15.69** | −$4.01 |

The 125 bps trail was picked by testing 75–500 bps on the dev window,
its mirror image, its detrended copy, and 12-hour halves of both. A
100 bps trail exits on ordinary early noise and misses the rally; wider
trails exit later and lose more on the way down. Re-entry after a stop
was tested and rejected: it never fires on the realistic windows and
only adds whipsaw losses on noisy ones.

## How it works

`main.ts` speaks agent-fun/bars-replay/v1 through the kit's SDK shim
(`vendor/makefun-bars.ts`, a byte-identical copy of the kit's
`sdk/makefun-bars.ts`). All decisions use bigint arithmetic on the bar
closes alone — no clock, no environment, no randomness — so the two
graded runs produce byte-identical action logs.

Orders use `max_slippage_bps: 200` on entries and `500` on exits —
exits prioritise getting out over price protection, so a stop-out is
not left holding a falling market because the fill gapped. A fill the
market refuses is retried on the next batch instead of abandoning
the trade.

## Grade locally

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
```
