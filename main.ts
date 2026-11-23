// Peak Rider — a BTC trading bot for make.fun's btc-race-24h-20261123-0511.
//
// The race is one 24-hour window of 1-minute cbBTC/USDC bars, long only, no
// leverage, paper money ($1,000 start). A full-size round trip costs about
// 26 bps in fees, slippage and price impact, while a 1-minute bar moves
// about 8 bps (one standard deviation) — so any bot that trades on
// 1-minute signals bleeds itself dry. The kit's own baselines prove it on
// the dev window: EMA-cross (8/21, 76 trades) lost $114.83, RSI-Bollinger
// lost $9.32, ADX-momentum lost $11.20, while buy-and-hold made $32.17 and
// the momentum baseline (buy at bar 24, hold) made $34.94.
//
// This bot therefore trades at most twice in the whole window:
//
//   1. Buy the full cash balance on the first tradable batch.
//   2. Sell everything the first time a bar closes 1.25% (125 bps) below
//      the highest close seen since entry, and never buy again.
//
// The trailing stop is the whole strategy. In an up window it banks most
// of the rally (dev window: +$26.56 vs buy-and-hold's +$32.17). In a down
// window it caps the loss near the stop instead of riding the asset down
// (the dev window played backwards: -$7.68 vs buy-and-hold's -$38.38).
// In a flat window it keeps the bot near cash instead of churning
// (dev window with its drift removed: +$15.69 vs buy-and-hold's -$4.01).
// A 125 bps trail was picked by backtesting the dev window, its mirror
// image, its detrended copy, and 12-hour halves of both: it beat a
// 100 bps trail (which exits on ordinary early noise and misses the
// rally) and 150/200/250 bps trails (which exit later and lose more on
// the way down) on every cut. Re-entry after a stop was tested too and
// rejected: it never fires on the realistic windows and only adds
// whipsaw losses on noisy ones.
//
// Determinism: all decisions use bigint arithmetic on the bar closes
// alone. No clock, no environment, no randomness — the two graded runs
// produce byte-identical action logs.
//
// Protocol: agent-fun/bars-replay/v1, spoken through the kit's SDK shim
// (vendor/makefun-bars.ts, a byte-identical copy of the kit's
// sdk/makefun-bars.ts). One reply per batch, echoing its seq; orders
// decided on a bar's close fill at the next bar's open.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

/** Sell when a close falls this far below the running peak, in bps. */
const TRAIL_BPS = 125n;
/** How far a buy fill may move from the latest close, in bps (1-minute
 *  bars in the dev window never moved more than ~72 bps, so 200 leaves
 *  room while still refusing to chase a gap up). */
const MAX_SLIPPAGE_BPS_BUY = 200;
/** How far a sell fill may move from the latest close, in bps. Exits
 *  prioritise getting out over price protection: in a falling market a
 *  sell refused for slippage leaves the bot holding the drop, so the
 *  stop-out is allowed a much wider move than an entry. */
const MAX_SLIPPAGE_BPS_SELL = 500;

const SYMBOL = 'CBBTC';

let entered = false; // a buy order has been sent at least once
let exited = false; // a sell order has been sent at least once
let peak = 0n; // highest close seen while holding

await runBars({
  onBatch(state: BarsState, batch) {
    // While warming up every order would be rejected; wait for the window.
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return []; // no bar for the symbol on this batch

    // A fill the market refused (e.g. slippage) comes back in the next
    // batch's fills: allow the order to be sent again instead of giving
    // up on the trade for the whole window.
    for (const fill of batch.fills) {
      if (fill.status !== 'rejected') continue;
      if (fill.side === 'buy') entered = false;
      if (fill.side === 'sell') exited = false;
    }

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      if (close > peak) peak = close;
      // Trailing stop, in exact integer arithmetic: sell when
      // close < peak * (10000 - 125) / 10000.
      if (close * 10_000n < peak * (10_000n - TRAIL_BPS)) {
        exited = true;
        const sell: SellInput = { side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS_SELL };
        return [sell];
      }
      return [];
    }

    // Flat. After the stop has fired the bot stays in cash: re-entry was
    // backtested and only added whipsaw losses.
    if (exited || entered) return [];
    entered = true;
    peak = close;
    const buy: BuyInput = {
      side: 'buy',
      symbol: SYMBOL,
      notional_quote_units: state.cash,
      max_slippage_bps: MAX_SLIPPAGE_BPS_BUY,
    };
    return [buy];
  },
});
