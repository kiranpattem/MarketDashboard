// ─── CLOCK ───────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}
setInterval(updateClock, 1000);
updateClock();

// ─── LIVE CANVAS CHARTS via Upstox ───────────────────────────────────────────
const chartState = {
  nifty:  { candles: [], label: 'Nifty 50', color: '#58a6ff', key: 'NSE_INDEX|Nifty 50' },
  sensex: { candles: [], label: 'Sensex',   color: '#f0883e', key: 'BSE_INDEX|SENSEX'   }
};

async function loadHistoricalCandles(symbol) {
  const token = getToken();
  if (!token) return;
  const state = chartState[symbol];
  const to   = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  try {
    const res  = await fetch(
      `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(state.key)}/30minute/${to}/${from}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
    );
    const json = await res.json();
    state.candles = (json.data?.candles || [])
      .map(c => ({ t: new Date(c[0]), o: c[1], h: c[2], l: c[3], c: c[4] }))
      .reverse();
    drawChart(symbol);
  } catch (e) { console.warn('Historical fetch error', symbol, e); }
}

function updateLiveCandle(symbol, ltp) {
  const state = chartState[symbol];
  if (!state.candles.length) return;
  const last = state.candles[state.candles.length - 1];
  last.c = ltp;
  if (ltp > last.h) last.h = ltp;
  if (ltp < last.l) last.l = ltp;
  drawChart(symbol);
}

function drawChart(symbol) {
  const state  = chartState[symbol];
  const canvas = document.getElementById(`${symbol}-canvas`);
  if (!canvas || !state.candles.length) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  canvas.width = W; canvas.height = H;

  const candles = state.candles.slice(-60);
  const prices  = candles.flatMap(c => [c.h, c.l]);
  const maxP = Math.max(...prices), minP = Math.min(...prices);
  const range = maxP - minP || 1;
  const padT = 20, padB = 30, padL = 60, padR = 10;
  const cW  = (W - padL - padR) / candles.length;
  const toY = p => padT + (H - padT - padB) * (1 - (p - minP) / range);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#21262d'; ctx.fillStyle = '#6e7681';
  ctx.font = '10px Segoe UI'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (H - padT - padB) * i / 4;
    const val = maxP - (range * i / 4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillText(val.toFixed(0), 2, y + 4);
  }

  // Candles
  candles.forEach((c, i) => {
    const x = padL + i * cW + cW * 0.1, cWidth = cW * 0.8;
    const color = c.c >= c.o ? '#3fb950' : '#f85149';
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + cWidth / 2, toY(c.h));
    ctx.lineTo(x + cWidth / 2, toY(c.l));
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.min(toY(c.o), toY(c.c)), cWidth, Math.max(1, Math.abs(toY(c.c) - toY(c.o))));
  });

  // Price line
  const lastClose = candles[candles.length - 1].c;
  const lineY = toY(lastClose);
  ctx.strokeStyle = state.color; ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(padL, lineY); ctx.lineTo(W - padR, lineY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = state.color; ctx.font = 'bold 11px Segoe UI';
  ctx.fillText(lastClose.toLocaleString('en-IN'), W - padR - 55, lineY - 3);

  // Time labels
  ctx.fillStyle = '#6e7681'; ctx.font = '9px Segoe UI';
  [0, Math.floor(candles.length / 2), candles.length - 1].forEach(i => {
    if (!candles[i]) return;
    ctx.fillText(candles[i].t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), padL + i * cW, H - 5);
  });
}

function initCharts() {
  ['nifty', 'sensex'].forEach(sym => {
    const container = document.getElementById(`${sym}-chart`);
    if (!container) return;
    container.innerHTML = `<canvas id="${sym}-canvas" style="width:100%;height:100%;display:block;"></canvas>`;
    loadHistoricalCandles(sym);
  });
  setInterval(() => { loadHistoricalCandles('nifty'); loadHistoricalCandles('sensex'); }, 30 * 60 * 1000);
}

function onLiveTick(niftyLtp, sensexLtp) {
  if (niftyLtp)  updateLiveCandle('nifty',  niftyLtp);
  if (sensexLtp) updateLiveCandle('sensex', sensexLtp);
}

// ─── NEWS FEED ────────────────────────────────────────────────────────────────
// Uses feedrapp.info — free, no API key required, CORS-safe
const NEWS_FEEDS = [
  'https://economictimes.indiatimes.com/markets/stocks/rss.cms',
  'https://economictimes.indiatimes.com/markets/rss.cms',
  'https://economictimes.indiatimes.com/news/economy/rss.cms'
];
let newsFeedIndex = 0;

function sentimentTag(title) {
  const t = title.toLowerCase();
  const bull = ['rise','gain','surge','rally','high','bull','up','positive','growth','record','boost','jump','soar','climb'];
  const bear = ['fall','drop','crash','decline','low','bear','down','negative','loss','sell','weak','slip','plunge','tumble'];
  if (bull.some(w => t.includes(w))) return 'bullish';
  if (bear.some(w => t.includes(w))) return 'bearish';
  return 'neutral';
}

async function fetchNews() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;

  const rssUrl = NEWS_FEEDS[newsFeedIndex % NEWS_FEEDS.length];
  newsFeedIndex++;
  const apiUrl = `https://feedrapp.info/?url=${encodeURIComponent(rssUrl)}&size=20&_=${Date.now()}`;

  try {
    const res   = await fetch(apiUrl, { cache: 'no-store' });
    const data  = await res.json();
    const items = data?.responseData?.feed?.entries || [];
    if (!items.length) throw new Error('empty');

    feed.innerHTML = '';
    items.forEach(item => {
      const title     = item.title || '';
      const link      = item.link  || '#';
      const pubDate   = item.publishedDate || '';
      const sentiment = sentimentTag(title);
      const timeStr   = pubDate ? new Date(pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
      const div = document.createElement('div');
      div.className = `news-item ${sentiment}`;
      div.innerHTML = `
        <a href="${link}" target="_blank" rel="noopener">${title}</a>
        <div class="news-meta">${timeStr} &nbsp;&middot;&nbsp; ${
          sentiment === 'bullish' ? '&#x1F7E2; Bullish' :
          sentiment === 'bearish' ? '&#x1F534; Bearish' : '&#x1F7E1; Neutral'}</div>
      `;
      feed.appendChild(div);
    });

    const timeEl = document.getElementById('news-time');
    if (timeEl) timeEl.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  } catch {
    const timeEl = document.getElementById('news-time');
    if (timeEl) timeEl.textContent = 'Retrying...';
  }
}

fetchNews();
setInterval(fetchNews, 2 * 60 * 1000);
