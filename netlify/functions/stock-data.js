// Stock data proxy — Alpha Vantage company overview + current quote

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ticker } = event.queryStringParameters || {};
  if (!ticker) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticker param required' }) };
  }

  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ALPHA_VANTAGE_API_KEY not configured' }) };
  }

  const base = 'https://www.alphavantage.co/query';
  const sym = encodeURIComponent(ticker.toUpperCase());

  try {
    const [ovRes, qRes] = await Promise.all([
      fetch(`${base}?function=OVERVIEW&symbol=${sym}&apikey=${key}`),
      fetch(`${base}?function=GLOBAL_QUOTE&symbol=${sym}&apikey=${key}`),
    ]);

    const [ov, qData] = await Promise.all([ovRes.json(), qRes.json()]);

    // Alpha Vantage rate-limit returns { Information: "..." } or { Note: "..." }
    if (ov.Information || ov.Note) {
      throw new Error('Alpha Vantage daily rate limit reached (25 calls/day). Market data will be available tomorrow.');
    }
    if (!ov.Symbol && !ov.Name) {
      throw new Error(`No market data found for ${ticker}. The ticker may be invalid or delisted.`);
    }

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
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
