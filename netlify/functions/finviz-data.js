// Finviz data proxy — analyst ratings, sentiment, key stats

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function parseFinviz(html) {
  const data = {};
  // Finviz snapshot table alternates: <b>Label</b> cell then value cell
  const regex = /<b>([^<]+)<\/b><\/td>\s*<td[^>]*class="[^"]*snapshot-td2-cp[^"]*"[^>]*>([^<]*)<\/td>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    data[m[1].trim()] = m[2].trim();
  }
  return data;
}

function getRecomLabel(score) {
  const v = parseFloat(score);
  if (isNaN(v)) return score;
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

  try {
    const res = await fetch(
      `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker.toUpperCase())}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://finviz.com/',
          'Cache-Control': 'no-cache',
        },
      }
    );

    if (!res.ok) throw new Error(`Finviz returned HTTP ${res.status}`);
    const html = await res.text();

    if (html.includes('ticker was not found') || html.includes('No results found')) {
      throw new Error('Ticker not found on Finviz');
    }

    const raw = parseFinviz(html);
    if (Object.keys(raw).length === 0) throw new Error('Finviz data parse failed — site structure may have changed');

    const recom = raw['Recom'];

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        analystRecom: recom || null,
        analystRecomLabel: recom ? getRecomLabel(recom) : null,
        analystRecomScore: recom ? parseFloat(recom) : null,
        targetPrice: raw['Target Price'] || null,
        shortFloat: raw['Short Float'] || null,
        insiderOwn: raw['Insider Own'] || null,
        institutionalOwn: raw['Inst Own'] || null,
        rsi14: raw['RSI (14)'] || null,
        avgVolume: raw['Avg Volume'] || null,
        forwardPE: raw['Fwd P/E'] || null,
        epsNextY: raw['EPS next Y'] || null,
        debtEquity: raw['Debt/Eq'] || null,
        currentRatio: raw['Current Ratio'] || null,
        earnings: raw['Earnings'] || null,
        perfWeek: raw['Perf Week'] || null,
        perfMonth: raw['Perf Month'] || null,
        perfYTD: raw['Perf YTD'] || null,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
