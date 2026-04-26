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
    studies: [],
    container_id: 'sensex-chart'
  });
}
