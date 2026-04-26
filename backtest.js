// ─── STRATEGY DESCRIPTIONS ───────────────────────────────────────────────────
const STRATEGY_DESC = {
  rsi:      '📌 Buy CE/PE when RSI drops below 30 (oversold).\nSell when RSI rises above 70 (overbought).\nBest for range-bound markets.',
  macd:     '📌 Buy CE when MACD line crosses above Signal line.\nBuy PE when MACD crosses below Signal line.\nBest for trending markets.',
  breakout: '📌 Buy CE when price breaks above previous session high.\nBuy PE when price breaks below previous session low.\nBest for volatile days.',
  straddle: '📌 Buy both ATM Call + Put simultaneously.\nProfit when market moves sharply in either direction.\nBest before major events (RBI, Budget, Results).',
  strangle: '📌 Buy OTM Call + OTM Put (1-2 strikes away from ATM).\nCheaper than straddle, needs bigger move to profit.\nBest for high IV environments.'
};

// ─── TOGGLE HELPER ────────────────────────────────────────────────────────────
let optType = 'CE';
function setToggle(btn, group) {
  btn.closest('.bt-toggle-group').querySelectorAll('.bt-toggle').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (group === 'opt-type') optType = btn.dataset.val;
}

// ─── CLOCK ────────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}
setInterval(updateClock, 1000);
updateClock();

// Update strategy description on change
document.getElementById('bt-strategy').addEventListener('change', updateStrategyDesc);
function updateStrategyDesc() {
  const s = document.getElementById('bt-strategy').value;
  document.getElementById('strategy-desc').textContent = STRATEGY_DESC[s] || '';
}
updateStrategyDesc();

// ─── FETCH HISTORICAL CANDLES from Upstox ────────────────────────────────────
async function fetchCandles(instrumentKey, interval, days) {
  const token = getToken();
  if (!token) throw new Error('Not logged in');

  const toDate   = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const fmt = d => d.toISOString().split('T')[0];

  // Upstox historical candle API
  const unit = interval === '1day' ? 'day' : 'minute';
  const mins = interval === '30minute' ? 30 : interval === '1hour' ? 60 : 1;
  const apiInterval = interval === '1day' ? '1day' : `${mins}minute`;

  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${apiInterval}/${fmt(toDate)}/${fmt(fromDate)}`;

  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (res.status === 401) { clearToken(); window.location.href = 'index.html'; }
  const json = await res.json();

  // Upstox returns: [timestamp, open, high, low, close, volume, oi]
  return (json.data?.candles || []).map(c => ({
    time:   new Date(c[0]),
    open:   c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
  })).reverse(); // oldest first
}

// ─── INDICATORS ───────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  const rsi = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  rsi[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    rsi[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return rsi;
}

function calcEMA(closes, period) {
  const ema = new Array(closes.length).fill(null);
  const k   = 2 / (period + 1);
  let sum = 0, start = -1;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { sum += closes[i]; continue; }
    if (i === period - 1) { sum += closes[i]; ema[i] = sum / period; start = i; continue; }
    ema[i] = closes[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calcMACD(closes) {
  const ema12   = calcEMA(closes, 12);
  const ema26   = calcEMA(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null);
  const validMacd = macdLine.map(v => v ?? 0);
  const signal  = calcEMA(validMacd, 9);
  return { macdLine, signal };
}

// ─── OPTION PREMIUM ESTIMATOR ─────────────────────────────────────────────────
// Simple Black-Scholes approximation for premium estimation
function estimatePremium(spotPrice, strikePrice, daysToExpiry, isCall, iv = 0.18) {
  const T  = Math.max(daysToExpiry, 1) / 365;
  const r  = 0.065; // risk-free rate
  const d1 = (Math.log(spotPrice / strikePrice) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);
  const N  = x => 0.5 * (1 + erf(x / Math.sqrt(2)));
  if (isCall) return spotPrice * N(d1) - strikePrice * Math.exp(-r * T) * N(d2);
  return strikePrice * Math.exp(-r * T) * N(-d2) - spotPrice * N(-d1);
}

function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

function getATMStrike(spot, step = 50) {
  return Math.round(spot / step) * step;
}

// ─── BACKTEST STRATEGIES ──────────────────────────────────────────────────────
function runStrategy(candles, strategy, optionType, capital, slPct, targetPct) {
  const closes = candles.map(c => c.close);
  const trades = [];
  let inTrade = false, entryPrice = 0, entryIdx = 0, entryType = '';

  const sl     = slPct / 100;
  const target = targetPct / 100;

  // Calculate indicators
  const rsi          = calcRSI(closes);
  const { macdLine, signal } = calcMACD(closes);
  const highs        = candles.map(c => c.high);
  const lows         = candles.map(c => c.low);

  for (let i = 20; i < candles.length; i++) {
    const spot    = closes[i];
    const daysLeft = Math.max(1, Math.ceil((candles[candles.length - 1].time - candles[i].time) / 86400000));
    const strike  = getATMStrike(spot);

    if (!inTrade) {
      let signal_type = null;

      if (strategy === 'rsi' && rsi[i] !== null) {
        if (rsi[i] < 30 && (optionType === 'CE' || optionType === 'BOTH')) signal_type = 'CE';
        else if (rsi[i] > 70 && (optionType === 'PE' || optionType === 'BOTH')) signal_type = 'PE';
      }

      if (strategy === 'macd' && macdLine[i] !== null && signal[i] !== null) {
        const prevM = macdLine[i - 1], prevS = signal[i - 1];
        if (prevM < prevS && macdLine[i] > signal[i] && (optionType === 'CE' || optionType === 'BOTH')) signal_type = 'CE';
        else if (prevM > prevS && macdLine[i] < signal[i] && (optionType === 'PE' || optionType === 'BOTH')) signal_type = 'PE';
      }

      if (strategy === 'breakout') {
        const prevHigh = Math.max(...highs.slice(Math.max(0, i - 5), i));
        const prevLow  = Math.min(...lows.slice(Math.max(0, i - 5), i));
        if (spot > prevHigh && (optionType === 'CE' || optionType === 'BOTH')) signal_type = 'CE';
        else if (spot < prevLow && (optionType === 'PE' || optionType === 'BOTH')) signal_type = 'PE';
      }

      if (strategy === 'straddle' || strategy === 'strangle') {
        // Enter every 5 candles for straddle/strangle
        if (i % 5 === 0) signal_type = 'STRADDLE';
      }

      if (signal_type) {
        const isCall   = signal_type === 'CE' || signal_type === 'STRADDLE';
        const strikeOTM = strategy === 'strangle' ? strike + 100 : strike;
        entryPrice = Math.max(1, estimatePremium(spot, strikeOTM, daysLeft, isCall));
        if (signal_type === 'STRADDLE') {
          entryPrice += Math.max(1, estimatePremium(spot, strike, daysLeft, false));
        }
        entryIdx  = i;
        entryType = signal_type;
        inTrade   = true;
      }

    } else {
      // Check exit conditions
      const daysHeld = i - entryIdx;
      const spot     = closes[i];
      const daysLeft = Math.max(1, Math.ceil((candles[candles.length - 1].time - candles[i].time) / 86400000));
      const isCall   = entryType === 'CE' || entryType === 'STRADDLE';
      const strikeOTM = strategy === 'strangle' ? getATMStrike(closes[entryIdx]) + 100 : getATMStrike(closes[entryIdx]);
      let currentPrice = Math.max(0.5, estimatePremium(spot, strikeOTM, daysLeft, isCall));
      if (entryType === 'STRADDLE') {
        currentPrice += Math.max(0.5, estimatePremium(spot, getATMStrike(closes[entryIdx]), daysLeft, false));
      }

      const pnlPct = (currentPrice - entryPrice) / entryPrice;
      let exitReason = null;

      if (pnlPct <= -sl)     exitReason = 'SL Hit';
      else if (pnlPct >= target) exitReason = 'Target Hit';
      else if (daysHeld >= 5)    exitReason = 'Time Exit';

      if (exitReason) {
        const lots    = Math.floor(capital / (entryPrice * 50));
        const pnl     = (currentPrice - entryPrice) * lots * 50;
        trades.push({
          date:       candles[entryIdx].time.toLocaleDateString('en-IN'),
          type:       entryType,
          entry:      entryPrice.toFixed(2),
          exit:       currentPrice.toFixed(2),
          pnl:        Math.round(pnl),
          win:        pnl > 0,
          exitReason
        });
        inTrade = false;
      }
    }
  }

  return trades;
}

// ─── DRAW EQUITY CURVE ────────────────────────────────────────────────────────
function drawEquityCurve(trades) {
  const canvas = document.getElementById('equity-chart');
  const ctx    = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth;
  canvas.height = 200;

  const equity = [0];
  trades.forEach(t => equity.push(equity[equity.length - 1] + t.pnl));

  const maxE = Math.max(...equity), minE = Math.min(...equity);
  const range = maxE - minE || 1;
  const W = canvas.width, H = canvas.height;
  const pad = 40;

  ctx.clearRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (H - 2 * pad) * i / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    const val = maxE - (range * i / 4);
    ctx.fillStyle = '#6e7681';
    ctx.font = '10px Segoe UI';
    ctx.fillText('₹' + Math.round(val).toLocaleString('en-IN'), 2, y + 4);
  }

  // Equity line
  ctx.beginPath();
  equity.forEach((v, i) => {
    const x = pad + (W - 2 * pad) * i / (equity.length - 1);
    const y = pad + (H - 2 * pad) * (1 - (v - minE) / range);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = equity[equity.length - 1] >= 0 ? '#3fb950' : '#f85149';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill under curve
  ctx.lineTo(W - pad, H - pad);
  ctx.lineTo(pad, H - pad);
  ctx.closePath();
  ctx.fillStyle = equity[equity.length - 1] >= 0 ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)';
  ctx.fill();

  // Zero line
  const zeroY = pad + (H - 2 * pad) * (1 - (0 - minE) / range);
  ctx.beginPath(); ctx.moveTo(pad, zeroY); ctx.lineTo(W - pad, zeroY);
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.stroke();
  ctx.setLineDash([]);
}

// ─── MAIN RUN BACKTEST ────────────────────────────────────────────────────────
async function runBacktest() {
  const btn = document.querySelector('.bt-run-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Running...';

  document.getElementById('bt-placeholder').style.display = 'none';
  document.getElementById('bt-summary').style.display     = 'none';
  document.getElementById('bt-chart-card').style.display  = 'none';
  document.getElementById('bt-log-card').style.display    = 'none';

  const instrument = document.getElementById('bt-instrument').value;
  const strategy   = document.getElementById('bt-strategy').value;
  const days       = parseInt(document.getElementById('bt-days').value);
  const interval   = document.getElementById('bt-interval').value;
  const capital    = parseFloat(document.getElementById('bt-capital').value);
  const sl         = parseFloat(document.getElementById('bt-sl').value);
  const target     = parseFloat(document.getElementById('bt-target').value);

  try {
    const candles = await fetchCandles(instrument, interval, days);

    if (candles.length < 30) {
      showBtError('Not enough historical data. Try a longer period or different interval.');
      return;
    }

    const trades = runStrategy(candles, strategy, optType, capital, sl, target);

    if (!trades.length) {
      showBtError('No trades generated for this strategy in the selected period. Try different settings.');
      return;
    }

    // Calculate stats
    const wins      = trades.filter(t => t.win);
    const losses    = trades.filter(t => !t.win);
    const netPnl    = trades.reduce((s, t) => s + t.pnl, 0);
    const winRate   = ((wins.length / trades.length) * 100).toFixed(1);
    const avgPnl    = (netPnl / trades.length).toFixed(0);
    const bestTrade = Math.max(...trades.map(t => t.pnl));

    // Max drawdown
    let peak = 0, equity = 0, maxDD = 0;
    trades.forEach(t => {
      equity += t.pnl;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
    });

    // Show summary
    document.getElementById('bt-summary').style.display = 'grid';
    document.getElementById('stat-trades').textContent  = trades.length;
    document.getElementById('stat-winrate').textContent = winRate + '%';
    document.getElementById('stat-winrate').className   = 'bt-stat-val ' + (parseFloat(winRate) >= 50 ? 'green' : 'red');

    const pnlEl = document.getElementById('stat-pnl');
    pnlEl.textContent = '₹' + netPnl.toLocaleString('en-IN');
    pnlEl.className   = 'bt-stat-val ' + (netPnl >= 0 ? 'green' : 'red');

    document.getElementById('stat-dd').textContent  = '₹' + Math.round(maxDD).toLocaleString('en-IN');
    document.getElementById('stat-dd').className    = 'bt-stat-val red';
    document.getElementById('stat-avg').textContent = '₹' + parseInt(avgPnl).toLocaleString('en-IN');
    document.getElementById('stat-avg').className   = 'bt-stat-val ' + (parseInt(avgPnl) >= 0 ? 'green' : 'red');
    document.getElementById('stat-best').textContent = '₹' + bestTrade.toLocaleString('en-IN');
    document.getElementById('stat-best').className   = 'bt-stat-val green';

    // Draw chart
    document.getElementById('bt-chart-card').style.display = 'block';
    setTimeout(() => drawEquityCurve(trades), 50);

    // Trade log
    document.getElementById('bt-log-card').style.display = 'block';
    const tbody = document.getElementById('trade-log');
    tbody.innerHTML = trades.map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${t.date}</td>
        <td>${t.type}</td>
        <td>₹${t.entry}</td>
        <td>₹${t.exit}</td>
        <td class="${t.win ? 'tag-win' : 'tag-loss'}">₹${t.pnl.toLocaleString('en-IN')}</td>
        <td class="${t.win ? 'tag-win' : 'tag-loss'}">${t.win ? '✅ Win' : '❌ Loss'}</td>
        <td class="${t.exitReason === 'SL Hit' ? 'tag-sl' : t.exitReason === 'Target Hit' ? 'tag-tgt' : 'tag-eod'}">${t.exitReason}</td>
      </tr>`).join('');

  } catch (e) {
    showBtError('Error: ' + e.message + '. Make sure you are logged in.');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶ Run Backtest';
  }
}

function showBtError(msg) {
  document.getElementById('bt-placeholder').style.display = 'flex';
  document.getElementById('bt-placeholder').innerHTML = `<div class="bt-error">⚠️ ${msg}</div>`;
}

// ─── INIT — check login ───────────────────────────────────────────────────────
window.addEventListener('load', () => {
  if (!getToken()) {
    window.location.href = 'index.html';
  }
});
