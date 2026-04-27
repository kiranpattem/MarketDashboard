// ─── CLOCK ───────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
}
setInterval(updateClock, 1000);
updateClock();

// ─── TRADINGVIEW CHARTS ───────────────────────────────────────────────────────
function initCharts() {
  new TradingView.widget({
    autosize: true, symbol: 'NSE:NIFTY', interval: '5',
    timezone: 'Asia/Kolkata', theme: 'dark', style: '1', locale: 'en',
    toolbar_bg: '#161b22', enable_publishing: false,
    hide_top_toolbar: false, hide_legend: false, save_image: false,
    studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
    container_id: 'nifty-chart'
  });
  new TradingView.widget({
    autosize: true, symbol: 'BSE:SENSEX', interval: 'D',
    timezone: 'Asia/Kolkata', theme: 'dark', style: '1', locale: 'en',
    toolbar_bg: '#161b22', enable_publishing: false,
    hide_top_toolbar: false, hide_legend: false, save_image: false,
    studies: [], container_id: 'sensex-chart'
  });
}

// ─── NEWS FEED ────────────────────────────────────────────────────────────────
// Uses rss2json.com with cache-busting timestamp — rotates 3 ET Markets feeds
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

  // Rotate feeds to avoid rate limiting
  const rssUrl = NEWS_FEEDS[newsFeedIndex % NEWS_FEEDS.length];
  newsFeedIndex++;

  // Cache-bust with timestamp so browser never serves stale response
  const bust = Date.now();
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&api_key=&count=20&_=${bust}`;

  try {
    const res  = await fetch(apiUrl, { cache: 'no-store' });
    const data = await res.json();

    if (data.status !== 'ok' || !data.items?.length) throw new Error('bad response');

    feed.innerHTML = '';
    data.items.forEach(item => {
      const title     = item.title || '';
      const link      = item.link  || '#';
      const pubDate   = item.pubDate || '';
      const sentiment = sentimentTag(title);
      const timeStr   = pubDate
        ? new Date(pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        : '';

      const div = document.createElement('div');
      div.className = `news-item ${sentiment}`;
      div.innerHTML = `
        <a href="${link}" target="_blank" rel="noopener">${title}</a>
        <div class="news-meta">${timeStr} &nbsp;·&nbsp; ${
          sentiment === 'bullish' ? '🟢 Bullish' :
          sentiment === 'bearish' ? '🔴 Bearish' : '🟡 Neutral'}</div>
      `;
      feed.appendChild(div);
    });

    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const timeEl = document.getElementById('news-time');
    if (timeEl) timeEl.textContent = `Updated ${now}`;

  } catch {
    // Silent fail — keep existing news visible, try again next cycle
    const timeEl = document.getElementById('news-time');
    if (timeEl) timeEl.textContent = 'Retrying...';
  }
}

// Fetch immediately then every 2 minutes
fetchNews();
setInterval(fetchNews, 2 * 60 * 1000);
