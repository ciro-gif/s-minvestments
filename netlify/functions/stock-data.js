// Stock data proxy — Massive (massive.com, formerly Polygon.io) primary, Yahoo Finance fallback
const { retryFetch } = require('./_utils');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function fetchPolygon(ticker, key) {
  const sym = encodeURIComponent(ticker.toUpperCase());
  const base = 'https://api.massive.com';

  const [refRes, snapRes] = await Promise.allSettled([
    retryFetch(`${base}/v3/reference/tickers/${sym}?apiKey=${key}`),
    retryFetch(`${base}/v2/snapshot/locale/us/markets/stocks/tickers/${sym}?apiKey=${key}`),
  ]);

  const ref = refRes.status === 'fulfilled' ? await refRes.value.json() : null;
  const snap = snapRes.status === 'fulfilled' ? await snapRes.value.json() : null;

  const r = ref?.results;
  const t = snap?.ticker;

  if (!r && !t) throw new Error('Polygon returned no data');

  const price = t?.day?.c || t?.prevDay?.c || null;
  const change = t?.todaysChange ?? null;
  const changePct = t?.todaysChangePerc ?? null;

  return {
    symbol: ticker.toUpperCase(),
    name: r?.name || null,
    sector: r?.sic_description || null,
    industry: r?.sic_description || null,
    description: r?.description || null,
    marketCap: r?.market_cap || null,
    pe: null,
    eps: null,
    dividendYield: null,
    beta: null,
    fiftyTwoWeekHigh: t?.day?.h || null,
    fiftyTwoWeekLow: t?.day?.l || null,
    sharesFloat: null,
    sharesOutstanding: r?.weighted_shares_outstanding || null,
    shortPercentFloat: null,
    nextEarnings: null,
    analystTarget: null,
    avgVolume: t?.day?.v || null,
    price,
    open: t?.day?.o || null,
    high: t?.day?.h || null,
    low: t?.day?.l || null,
    volume: t?.day?.v || null,
    change,
    changePercent: changePct != null ? `${changePct.toFixed(2)}%` : null,
    marketState: t ? 'OPEN' : 'CLOSED',
    source: 'polygon',
  };
}

async function fetchYahoo(ticker) {
  // BRK.B → BRK-B for Yahoo Finance
  const yahooTicker = ticker.replace('.', '-');
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

  // (a) Missing price fallback — use previous close if current price missing
  const rawPrice = p.regularMarketPrice?.raw ?? p.regularMarketPreviousClose?.raw ?? null;
  const marketState = p.regularMarketPrice?.raw ? 'OPEN' : 'CLOSED';

  const rawChange = p.regularMarketChange?.raw ?? 0;
  const rawPct = p.regularMarketChangePercent?.raw;

  // Compute changePercent from price/change when Yahoo omits it
  let changePercent = null;
  if (rawPct != null) {
    changePercent = `${(rawPct * 100).toFixed(2)}%`;
  } else if (rawPrice && rawChange) {
    const base = rawPrice - rawChange;
    if (base !== 0) changePercent = `${((rawChange / base) * 100).toFixed(2)}%`;
  }

  // (b) Dividend yield normalization: Yahoo returns decimal (0.0044 = 0.44%).
  // Multiply by 100 so frontend gets percent-as-decimal (0.44) matching AV format.
  const dividendYield = d.dividendYield?.raw != null ? d.dividendYield.raw * 100 : null;

  // (c) Beta: only use defaultKeyStatistics.beta — d.beta doesn't exist in Yahoo
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ticker } = event.queryStringParameters || {};
  if (!ticker) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticker param required' }) };

  const polygonKey = process.env.POLYGON_API_KEY;

  // Try Polygon first (if key configured)
  if (polygonKey) {
    try {
      const data = await fetchPolygon(ticker, polygonKey);
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
    } catch { /* fall through to Yahoo */ }
  }

  // Yahoo Finance fallback (handles BRK.B → BRK-B internally)
  try {
    const data = await fetchYahoo(ticker);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  } catch {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({
        error: `Couldn't find data for ${ticker}. Try checking spelling, the primary share class (e.g. BRK.B → BRK-B), or confirm the ticker is still listed.`,
      }),
    };
  }
};
