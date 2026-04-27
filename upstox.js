// ─── UPSTOX CONFIG ────────────────────────────────────────────────────────────
const UPSTOX_API_KEY  = '56ea2483-6af9-4745-9eb7-4fbe948bcbf5';
const UPSTOX_REDIRECT = 'https://kiranpattem.github.io/MarketDashboard';
const UPSTOX_AUTH_URL = 'https://api.upstox.com/v2/login/authorization/dialog';
const UPSTOX_TOKEN_URL= 'https://api.upstox.com/v2/login/authorization/token';
const NIFTY_KEY       = 'NSE_INDEX|Nifty 50';
const SENSEX_KEY      = 'BSE_INDEX|SENSEX';

// ─── TOKEN MANAGEMENT ─────────────────────────────────────────────────────────
function getToken()  { return localStorage.getItem('upstox_token'); }
function setToken(t) { localStorage.setItem('upstox_token', t); localStorage.setItem('upstox_token_time', Date.now()); }
function clearToken(){ localStorage.removeItem('upstox_token'); localStorage.removeItem('upstox_token_time'); }
function getSecret() { return localStorage.getItem('upstox_secret'); }
function setSecret(s){ localStorage.setItem('upstox_secret', s); }

function isTokenExpired() {
  const t = localStorage.getItem('upstox_token_time');
  if (!t) return true;
  return (Date.now() - parseInt(t)) > 8 * 60 * 60 * 1000;
}

// ─── OAUTH CALLBACK ───────────────────────────────────────────────────────────
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  if (!code) return false;
  const secret = getSecret();
  if (!secret) { showSecretPrompt(() => exchangeToken(code)); return true; }
  await exchangeToken(code);
  return true;
}

async function exchangeToken(code) {
  try {
    const res  = await fetch(UPSTOX_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: UPSTOX_API_KEY, client_secret: getSecret(),
        redirect_uri: UPSTOX_REDIRECT, grant_type: 'authorization_code'
      })
    });
    const data = await res.json();
    if (data.access_token) {
      setToken(data.access_token);
      window.history.replaceState({}, document.title, UPSTOX_REDIRECT);
      showDashboard();
    } else {
      showError('Token exchange failed. Please login again.');
    }
  } catch { showError('Could not connect to Upstox.'); }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function loginWithUpstox() {
  if (!getSecret()) { showSecretPrompt(loginWithUpstox); return; }
  window.location.href = `${UPSTOX_AUTH_URL}?response_type=code&client_id=${UPSTOX_API_KEY}&redirect_uri=${encodeURIComponent(UPSTOX_REDIRECT)}`;
}

function showSecretPrompt(callback) {
  const overlay = document.getElementById('secret-overlay');
  overlay.style.display = 'flex';
  document.getElementById('secret-save-btn').onclick = () => {
    const val = document.getElementById('secret-input').value.trim();
    if (!val) return;
    setSecret(val);
    overlay.style.display = 'none';
    if (callback) callback();
  };
}

// ─── LIVE DATA ────────────────────────────────────────────────────────────────
let liveData = { nifty: null, sensex: null };
let ws = null;

async function startWebSocket() {
  const token = getToken();
  if (!token) return;
  try {
    // v3 endpoint — Upstox updated from v2
    const res   = await fetch('https://api.upstox.com/v3/feed/market-data-feed/authorize', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    const data  = await res.json();
    const wsUrl = data?.data?.authorizedRedirectUri;
    if (!wsUrl) { fallbackToPolling(); return; }

    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        guid: 'market-dashboard', method: 'sub',
        data: { mode: 'ltpc', instrumentKeys: [NIFTY_KEY, SENSEX_KEY] }
      }));
    };
    ws.onmessage = (evt) => {
      try {
        const feeds  = JSON.parse(evt.data)?.feeds || {};
        const nifty  = feeds[NIFTY_KEY]?.ff?.marketFF?.ltpc;
        const sensex = feeds[SENSEX_KEY]?.ff?.marketFF?.ltpc;
        if (nifty)  { liveData.nifty  = nifty;  updateTickerCard('nifty-ticker',  nifty,  true); }
        if (sensex) { liveData.sensex = sensex; updateTickerCard('sensex-ticker', sensex, true); }
        if (nifty || sensex) {
          updatePrediction(liveData.nifty, liveData.sensex);
          if (typeof onLiveTick === 'function')
            onLiveTick(nifty?.ltp ?? null, sensex?.ltp ?? null);
        }
      } catch { }
    };
    ws.onerror = () => fallbackToPolling();
    ws.onclose = () => setTimeout(startWebSocket, 5000);
  } catch { fallbackToPolling(); }
}

function fallbackToPolling() {
  fetchLiveQuotes();
  setInterval(fetchLiveQuotes, 5000);
}

async function fetchLiveQuotes() {
  const token = getToken();
  if (!token) return;
  try {
    const res  = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(NIFTY_KEY)},${encodeURIComponent(SENSEX_KEY)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    if (res.status === 401) { clearToken(); showLogin(); return; }
    const json = await res.json();
    const d    = json.data || {};
    const nifty  = d[NIFTY_KEY]  || d['NSE_INDEX:Nifty 50'];
    const sensex = d[SENSEX_KEY] || d['BSE_INDEX:SENSEX'];
    if (nifty)  { liveData.nifty  = nifty;  updateTickerCard('nifty-ticker',  nifty); }
    if (sensex) { liveData.sensex = sensex; updateTickerCard('sensex-ticker', sensex); }
    updatePrediction(nifty, sensex);
    if (typeof onLiveTick === 'function')
      onLiveTick(nifty?.last_price ?? null, sensex?.last_price ?? null);
  } catch (e) { console.warn('Quote fetch error', e); }
}

function updateTickerCard(id, q, isWs = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const ltp    = q.ltp ?? q.last_price ?? 0;
  const close  = q.cp  ?? q.ohlc?.close ?? ltp;
  const change = ltp - close;
  const pct    = close ? ((change / close) * 100).toFixed(2) : '0.00';
  const color  = change >= 0 ? '#3fb950' : '#f85149';
  const arrow  = change >= 0 ? '&#9650;' : '&#9660;';
  const dot    = isWs ? ' <span style="color:#3fb950;font-size:8px">&#9679; LIVE</span>' : '';
  el.innerHTML = `<span class="ticker-price" style="color:${color}">${ltp.toLocaleString('en-IN',{maximumFractionDigits:2})}</span>
    <span class="ticker-change" style="color:${color}">${arrow} ${Math.abs(change).toFixed(2)} (${Math.abs(pct)}%)${dot}</span>`;
}

// ─── PREDICTION ───────────────────────────────────────────────────────────────
function marketSessionBias() {
  const ist      = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const totalMin = ist.getHours() * 60 + ist.getMinutes();
  if (totalMin < 555) return { label: 'Pre-Market',       bias: 0,    note: 'Market not open yet' };
  if (totalMin > 930) return { label: 'After-Market',      bias: 0,    note: 'Market closed for today' };
  if (totalMin < 600) return { label: 'Opening Bell',      bias: 0.6,  note: 'High volatility — opening 45 mins' };
  if (totalMin < 690) return { label: 'Morning Session',   bias: 0.3,  note: 'Trend usually establishes here' };
  if (totalMin < 780) return { label: 'Midday Lull',       bias: -0.1, note: 'Low volume, sideways likely' };
  if (totalMin < 870) return { label: 'Afternoon Session', bias: 0.2,  note: 'FII activity picks up' };
  return               { label: 'Power Hour',              bias: 0.5,  note: 'High volume close — watch for reversals' };
}

function dayOfWeekBias() {
  const day    = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  const biases = { Monday: -0.1, Tuesday: 0.1, Wednesday: 0.2, Thursday: 0.1, Friday: -0.2 };
  return { day, bias: biases[day] ?? 0 };
}

function updatePrediction(nifty, sensex) {
  const panel   = document.getElementById('prediction-panel');
  if (!panel) return;
  const session = marketSessionBias();
  const dayBias = dayOfWeekBias();
  let priceSignal = 0, rsiVal = 50, rsiSignal = 0;
  const indicators = [];

  if (nifty) {
    const ltp   = nifty.last_price ?? nifty.ltp ?? 0;
    const open  = nifty.ohlc?.open  ?? ltp;
    const high  = nifty.ohlc?.high  ?? ltp;
    const low   = nifty.ohlc?.low   ?? ltp;
    const close = nifty.ohlc?.close ?? ltp;
    priceSignal = ltp > open ? 0.3 : -0.3;
    const range = high - low;
    const pos   = range > 0 ? (ltp - low) / range : 0.5;
    rsiVal      = 30 + (pos * 40);
    rsiSignal   = rsiVal > 60 ? 0.3 : rsiVal < 40 ? -0.3 : 0;
    indicators.push(
      { label: 'Nifty LTP',  val: ltp.toLocaleString('en-IN'),  cls: ltp > close ? 'green' : 'red' },
      { label: 'Open',       val: open.toLocaleString('en-IN'),  cls: 'yellow' },
      { label: 'High',       val: high.toLocaleString('en-IN'),  cls: 'green' },
      { label: 'Low',        val: low.toLocaleString('en-IN'),   cls: 'red' },
      { label: 'RSI (est.)', val: rsiVal.toFixed(1), cls: rsiVal > 60 ? 'red' : rsiVal < 40 ? 'green' : 'yellow' }
    );
  }
  if (sensex) {
    const ltp   = sensex.last_price ?? sensex.ltp ?? 0;
    const close = sensex.ohlc?.close ?? ltp;
    indicators.push({ label: 'Sensex LTP', val: ltp.toLocaleString('en-IN'), cls: ltp > close ? 'green' : 'red' });
  }

  const composite = (priceSignal * 0.4) + (rsiSignal * 0.2) + (session.bias * 0.25) + (dayBias.bias * 0.15);
  let direction, dirClass, confidence;
  if (composite > 0.1)       { direction = '&#9650; BULLISH';  dirClass = 'up';      confidence = Math.min(95, 50 + composite * 80); }
  else if (composite < -0.1) { direction = '&#9660; BEARISH';  dirClass = 'down';    confidence = Math.min(95, 50 + Math.abs(composite) * 80); }
  else                       { direction = '&#9670; SIDEWAYS'; dirClass = 'neutral'; confidence = 50; }

  indicators.push(
    { label: 'Session',         val: session.label,        cls: 'yellow' },
    { label: 'Day',             val: dayBias.day,          cls: dayBias.bias >= 0 ? 'green' : 'red' },
    { label: 'Composite Score', val: composite.toFixed(2), cls: composite > 0 ? 'green' : composite < 0 ? 'red' : 'yellow' }
  );

  panel.innerHTML = `
    <div class="prediction-card">
      <h4>Predicted Direction</h4>
      <div class="signal ${dirClass}">${direction}</div>
      <div class="signal-detail">${session.note}</div>
      <div class="confidence-bar-wrap">
        <div class="confidence-bar ${dirClass}" style="width:${confidence}%"></div>
      </div>
      <div class="signal-detail" style="margin-top:4px">Confidence: ${confidence.toFixed(0)}%</div>
    </div>
    <div class="prediction-card">
      <h4>Live Indicators</h4>
      ${indicators.map(i => `<div class="indicator-row"><span class="ind-label">${i.label}</span><span class="ind-val ${i.cls}">${i.val}</span></div>`).join('')}
    </div>
    <div class="prediction-card">
      <h4>Signal Weights</h4>
      <div class="signal-detail">
        &bull; 40% &rarr; Live price vs open<br/>
        &bull; 20% &rarr; Estimated RSI<br/>
        &bull; 25% &rarr; Market session<br/>
        &bull; 15% &rarr; Day-of-week bias<br/>
        <br/>&#9888;&#65039; Not financial advice.
      </div>
    </div>`;
}

// ─── UI STATES ────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('dashboard').style.display     = 'none';
}

function showDashboard() {
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('dashboard').style.display     = 'flex';

  // initCharts is in app.js — call directly, no TradingView dependency
  if (typeof initCharts === 'function') initCharts();

  // Immediate data load then WebSocket
  fetchLiveQuotes().then(() => startWebSocket());

  // Heartbeat every 10s if WebSocket drops
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) fetchLiveQuotes();
  }, 10000);

  // Token expiry check every minute
  setInterval(() => {
    if (isTokenExpired()) { clearToken(); showLogin(); }
  }, 60000);
}

function showError(msg) {
  const el = document.getElementById('login-error');
  if (el) el.textContent = msg;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  const isCallback = await handleOAuthCallback();
  if (!isCallback) {
    if (getToken() && !isTokenExpired()) showDashboard();
    else { clearToken(); showLogin(); }
  }
});
