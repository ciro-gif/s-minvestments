// Stock data proxy — Alpha Vantage primary, Yahoo Finance fallback

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function fetchYahoo(ticker) {
  const sym = encodeURIComponent(ticker.toUpperCase());
  const modules = 'price,summaryDetail,defaultKeyStatistics,assetProfile';
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=${modules}&corsDomain=finance.yahoo.com`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Origin': 'https://finance.yahoo.com',
      'Referer': 'https://finance.yahoo.com/',
    },
  });

  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);
  const json = await res.json();

  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error('Yahoo Finance: no data returned');

  const p = result.price || {};
  const d = result.summaryDetail || {};
  const k = result.defaultKeyStatistics || {};
  const a = result.assetProfile || {};

  const pct = p.regularMarketChangePercent?.raw;

  return {
    symbol: ticker.toUpperCase(),
    name: p.longName || p.shortName,
    sector: a.sector,
    industry: a.industry,
    description: a.longBusinessSummary,
    marketCap: p.marketCap?.raw,
    pe: d.trailingPE?.raw ?? p.trailingPE?.raw,
    eps: k.trailingEps?.raw,
    dividendYield: d.dividendYield?.raw,
    beta: k.beta?.raw ?? d.beta?.raw,
    fiftyTwoWeekHigh: d.fiftyTwoWeekHigh?.raw,
    fiftyTwoWeekLow: d.fiftyTwoWeekLow?.raw,
    sharesFloat: k.floatShares?.raw,
    sharesOutstanding: k.sharesOutstanding?.raw ?? p.sharesOutstanding?.raw,
    shortPercentFloat: k.shortPercentOfFloat?.raw,
    nextEarnings: null,
    analystTarget: k.targetMeanPrice?.raw,
    avgVolume: d.averageVolume?.raw,
    price: p.regularMarketPrice?.raw,
    open: p.regularMarketOpen?.raw,
    high: p.regularMarketDayHigh?.raw,
    low: p.regularMarketDayLow?.raw,
    volume: p.regularMarketVolume?.raw,
    change: p.regularMarketChange?.raw,
    changePercent: pct != null ? `${(pct * 100).toFixed(2)}%` : null,
    source: 'yahoo',
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ticker } = event.queryStringParameters || {};
  if (!ticker) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticker param required' }) };
  }

  const key = process.env.ALPHA_VANTAGE_API_KEY;
  const sym = encodeURIComponent(ticker.toUpperCase());

  // Try Alpha Vantage first
  if (key) {
    try {
      const base = 'https://www.alphavantage.co/query';
      const [ovRes, qRes] = await Promise.all([
        fetch(`${base}?function=OVERVIEW&symbol=${sym}&apikey=${key}`),
        fetch(`${base}?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${key}`),
      ]);

      const [ov, qData] = await Promise.all([ovRes.json(), qRes.json()]);

      // If AV is rate-limited or has no data, fall through to Yahoo
      if (!ov.Information && !ov.Note && (ov.Symbol || ov.Name)) {
        const quote = qData['Global Quote'] || {};
        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({
            symbol: ov.Symbol || ticker.toUpperCase(),
            name: ov.Name,
            sector: ov.Sector,
            industry: ov.Industry,
            description: ov.Description,
            marketCap: ov.MarketCapitalization,
            pe: ov.PERatio,
            eps: ov.EPS,
            dividendYield: ov.DividendYield,
            beta: ov.Beta,
            fiftyTwoWeekHigh: ov['52WeekHigh'],
            fiftyTwoWeekLow: ov['52WeekLow'],
            sharesFloat: ov.SharesFloat,
            sharesOutstanding: ov.SharesOutstanding,
            shortPercentFloat: ov.ShortPercentFloat,
            nextEarnings: ov.NextEarningsDate,
            analystTarget: ov.AnalystTargetPrice,
            avgVolume: ov.SharesFloat,
            price: quote['05. price'],
            open: quote['02. open'],
            high: quote['03. high'],
            low: quote['04. low'],
            volume: quote['06. volume'],
            change: quote['09. change'],
            changePercent: quote['10. change percent'],
            source: 'alphavantage',
          }),
        };
      }
    } catch { /* fall through to Yahoo */ }
  }

  // Yahoo Finance fallback
  try {
    const yahooData = await fetchYahoo(ticker);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(yahooData) };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: `Market data unavailable for ${ticker}. Both Alpha Vantage and Yahoo Finance failed: ${err.message}` }),
    };
  }
};
