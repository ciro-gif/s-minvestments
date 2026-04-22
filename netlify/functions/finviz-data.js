// Analyst data — Financial Modeling Prep (replaces Finviz scraping)
const { retryFetch } = require('./_utils');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function getRecomLabel(score) {
  const v = parseFloat(score);
  if (isNaN(v)) return null;
  if (v <= 1.5) return 'Strong Buy';
  if (v <= 2.5) return 'Buy';
  if (v <= 3.5) return 'Hold';
  if (v <= 4.5) return 'Sell';
  return 'Strong Sell';
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ticker } = event.queryStringParameters || {};
  if (!ticker) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticker required' }) };

  const key = process.env.FMP_API_KEY;
  if (!key) {
    // Return empty shape so frontend degrades gracefully
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'FMP_API_KEY not configured', analystRecom: null, analystRecomLabel: null, analystRecomScore: null, targetPrice: null, shortFloat: null, insiderOwn: null, institutionalOwn: null, rsi14: null, avgVolume: null, forwardPE: null, epsNextY: null, debtEquity: null, currentRatio: null, earnings: null, perfWeek: null, perfMonth: null, perfYTD: null }) };
  }

  const sym = encodeURIComponent(ticker.toUpperCase());
  const base = 'https://financialmodelingprep.com/api';

  try {
    const [recRes, ptRes, kmRes, growthRes] = await Promise.allSettled([
      retryFetch(`${base}/v3/analyst-stock-recommendations/${sym}?limit=1&apikey=${key}`),
      retryFetch(`${base}/v3/price-target-consensus/${sym}?apikey=${key}`),
      retryFetch(`${base}/v3/key-metrics-ttm/${sym}?limit=1&apikey=${key}`),
      retryFetch(`${base}/v3/financial-growth/${sym}?limit=1&apikey=${key}`),
    ]);

    // Analyst recommendations → weighted 1-5 score
    let analystRecomScore = null;
    let analystRecomLabel = null;
    if (recRes.status === 'fulfilled') {
      const recs = await recRes.value.json();
      const latest = Array.isArray(recs) ? recs[0] : null;
      if (latest) {
        const sb = latest.analystRatingsStrongBuy || 0;
        const b  = latest.analystRatingsbuy || 0;
        const h  = latest.analystRatingsHold || 0;
        const s  = latest.analystRatingsSell || 0;
        const ss = latest.analystRatingsStrongSell || 0;
        const total = sb + b + h + s + ss;
        if (total > 0) {
          analystRecomScore = (sb*1 + b*2 + h*3 + s*4 + ss*5) / total;
          analystRecomLabel = getRecomLabel(analystRecomScore);
        }
      }
    }

    // Price target consensus
    let targetPrice = null;
    if (ptRes.status === 'fulfilled') {
      const pt = await ptRes.value.json();
      const row = Array.isArray(pt) ? pt[0] : pt;
      if (row?.targetConsensus != null) targetPrice = String(parseFloat(row.targetConsensus).toFixed(2));
    }

    // Key metrics TTM
    let debtEquity = null, currentRatio = null;
    if (kmRes.status === 'fulfilled') {
      const km = await kmRes.value.json();
      const m = Array.isArray(km) ? km[0] : km;
      if (m) {
        if (m.debtToEquityRatioTTM != null) debtEquity = String(parseFloat(m.debtToEquityRatioTTM).toFixed(2));
        if (m.currentRatioTTM != null) currentRatio = String(parseFloat(m.currentRatioTTM).toFixed(2));
      }
    }

    // EPS growth
    let epsNextY = null;
    if (growthRes.status === 'fulfilled') {
      const g = await growthRes.value.json();
      const row = Array.isArray(g) ? g[0] : g;
      if (row?.epsgrowth != null) {
        const pct = (parseFloat(row.epsgrowth) * 100).toFixed(1);
        epsNextY = `${parseFloat(pct) > 0 ? '+' : ''}${pct}%`;
      }
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        analystRecom: analystRecomScore != null ? analystRecomScore.toFixed(2) : null,
        analystRecomLabel,
        analystRecomScore,
        targetPrice,
        shortFloat: null,
        insiderOwn: null,
        institutionalOwn: null,
        rsi14: null,
        avgVolume: null,
        forwardPE: null,
        epsNextY,
        debtEquity,
        currentRatio,
        earnings: null,
        perfWeek: null,
        perfMonth: null,
        perfYTD: null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
