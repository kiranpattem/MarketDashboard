# India Market Dashboard

Live Nifty 50 & Sensex dashboard with candlestick charts, market news, pattern prediction, and an options backtesting engine — powered by the Upstox API.

## Prerequisites

- An [Upstox](https://upstox.com) trading account
- An Upstox Developer App (see setup below)
- A modern browser (Chrome, Firefox, Edge)

## Upstox Developer App Setup

1. Go to [Upstox Developer Console](https://developer.upstox.com) and log in
2. Click **Create App**
3. Fill in the details:
   - **App Name**: anything (e.g. `MarketDashboard`)
   - **Redirect URL**: `https://kiranpattem.github.io/MarketDashboard` (or your hosted URL)
4. After creation, note down:
   - **API Key** (Client ID) — already set in `upstox.js`
   - **API Secret** (Client Secret) — you will enter this in the browser on first login

> The API Secret is never stored in code. It is entered once in the browser prompt and kept only in your browser's localStorage.

## Running Locally

```bash
git clone https://github.com/kiranpattem/MarketDashboard.git
cd MarketDashboard
```

Open `index.html` directly in a browser, or serve with any static server:

```bash
npx serve .
# then open http://localhost:3000
```

> If running locally, update `UPSTOX_REDIRECT` in `upstox.js` to `http://localhost:3000` and set the same as the Redirect URL in your Upstox Developer App.

## First Login

1. Open the app — you will see the login screen
2. Click **Login with Upstox**
3. A prompt will ask for your **API Secret** — paste it and click Save
4. You will be redirected to Upstox to authorize — log in with your Upstox credentials
5. After approval you are redirected back and the dashboard loads automatically

## Features

- **Live Charts** — Nifty 50 & Sensex 30-min candlestick charts via Upstox WebSocket
- **Market News** — Auto-refreshing headlines from gnews.io with sentiment tagging
- **Pattern Prediction** — Composite signal based on price, RSI, session time, and day-of-week bias
- **Options Backtester** — Test RSI, MACD, Breakout, Straddle, and Strangle strategies on real historical data

## Notes

- The gnews.io API key in `app.js` has a free-tier limit of 100 requests/day. For production use, proxy it through a backend or serverless function.
- Token expiry is set to 8 hours, matching Upstox's access token lifetime. You will be logged out automatically after that.
