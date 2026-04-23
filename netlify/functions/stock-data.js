// Stock data proxy — Yahoo Finance (fundamentals) + Massive/Polygon (real-time price overlay)
// Strategy: always run Yahoo first so P/E, EPS, beta, 52W range, etc. are populated.
// Then optionally enrich the live price with Massive if a key is configured.
const { retryFetch } = require('./_utils');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// ── Yahoo Finance ─────────────────────────────────────────────────────────────
// Returns ALL fundamental fields: P/E, EPS, beta, dividend yield, 52W range,
// float, sector, description, analyst target, etc.
async function fetchYahoo(ticker) {
  const yahooTicker = ticker.replace(/\./g, '-'); // BRK.B → BRK-B
  const sym = encodeURIComponent(yahooTicker.toUpperCase());
  const modules = 'price,summaryDetail,defaultKeyStatistics,assetProfile';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${modules}&corsDomain=finance.yahoo.com`;

  const res = await retryFetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Origin': 'https://finance.yahoo.com',
      'Referer': 'https://finance.yahoo.com/',
    },
  });

  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error('Yahoo Finance: no data returned');

  const p = result.price || {};
  const d = result.summaryDetail || {};
  const k = result.defaultKeyStatistics || {};
  const a = result.assetProfile || {};

  // Price: prefer live, fall back to previous close
  const rawPrice = p.regularMarketPrice?.raw ?? p.regularMarketPreviousClose?.raw ?? null;
  const marketState = p.regularMarketPrice?.raw ? 'OPEN' : 'CLOSED';

  const rawChange = p.regularMarketChange?.raw ?? 0;
  const rawPct = p.regularMarketChangePercent?.raw;

  let changePercent = null;
  if (rawPct != null) {
    changePercent = `${(rawPct * 100).toFixed(2)}%`;
  } else if (rawPrice && rawChange) {
    const base = rawPrice - rawChange;
    if (base !== 0) changePercent = `${((rawChange / base) * 100).toFixed(2)}%`;
  }

  // Yahoo returns dividend yield as a decimal (0.0044 = 0.44%) — multiply by 100
  const dividendYield = d.dividendYield?.raw != null ? d.dividendYield.raw * 100 : null;

  // Beta only from defaultKeyStatistics — summaryDetail.beta doesn't exist in Yahoo
  const beta = k.beta?.raw ?? null;

  return {
    symbol: ticker.toUpperCase(),
    name: p.longName || p.shortName || null,
    sector: a.sector || null,
    industry: a.industry || null,
    description: a.longBusinessSummary || null,
    marketCap: p.marketCap?.raw || null,
    pe: d.trailingPE?.raw ?? p.trailingPE?.raw ?? null,
    eps: k.trailingEps?.raw ?? null,
    dividendYield,
    beta,
    fiftyTwoWeekHigh: d.fiftyTwoWeekHigh?.raw ?? null,
    fiftyTwoWeekLow: d.fiftyTwoWeekLow?.raw ?? null,
    sharesFloat: k.floatShares?.raw ?? null,
    sharesOutstanding: k.sharesOutstanding?.raw ?? p.sharesOutstanding?.raw ?? null,
    shortPercentFloat: k.shortPercentOfFloat?.raw ?? null,
    nextEarnings: null,
    analystTarget: k.targetMeanPrice?.raw ?? null,
    avgVolume: d.averageVolume?.raw ?? null,
    price: rawPrice,
    open: p.regularMarketOpen?.raw ?? null,
    high: p.regularMarketDayHigh?.raw ?? null,
    low: p.regularMarketDayLow?.raw ?? null,
    volume: p.regularMarketVolume?.raw ?? null,
    change: rawChange,
    changePercent,
    marketState,
    source: 'yahoo',
  };
}

// ── Massive/Polygon price overlay ─────────────────────────────────────────────
// Only used for the live price/change fields — Massive doesn't provide fundamentals
// on the free tier, so we never use it as the sole data source.
async function overlayMassivePrice(data, key) {
  try {
    const sym = encodeURIComponent(data.symbol);
    const base = 'https://api.massive.com';

    const snapRes = await retryFetch(
      `${base}/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${key}`,
    );
    const snap = await snapRes.json();
    const t = snap?.ticker;

    if (!t) return data; // no snapshot available

    const livePrice = t.day?.c || null;
    const prevClose = t.prevDay?.c || null;
    const todayChange = t.todaysChange ?? null;
    const todayChangePct = t.todaysChangePerc ?? null;

    if (livePrice) {
      data.price = livePrice;
      data.open = t.day?.o ?? data.open;
      data.high = t.day?.h ?? data.high;
      data.low = t.day?.l ?? data.low;
      data.volume = t.day?.v ?? data.volume;
      data.change = todayChange ?? data.change;
      data.changePercent = todayChangePct != null
        ? `${todayChangePct.toFixed(2)}%`
        : data.changePercent;
      data.marketState = 'OPEN';
      data.source = 'yahoo+massive';
    } else if (prevClose && !data.price) {
      // Market closed — use prevDay close if Yahoo also had no price
      data.price = prevClose;
      data.source = 'yahoo+massive';
    }
  } catch {
    // Massive failed — Yahoo data is still complete, just continue
  }
  return data;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ticker } = event.queryStringParameters || {};
  if (!ticker) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticker param required' }) };

  try {
    // 1. Always fetch Yahoo Finance — this gives us all the fundamental fields
    const data = await fetchYahoo(ticker);

    // 2. Optionally enrich live price with Massive (doesn't affect fundamentals)
    const massiveKey = process.env.POLYGON_API_KEY;
    if (massiveKey) await overlayMassivePrice(data, massiveKey);

    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  } catch {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({
        error: `Couldn't find data for ${ticker}. Check the spelling, try the primary share class (e.g. BRK.B → BRK-B), or confirm the ticker is still listed.`,
      }),
    };
  }
};
