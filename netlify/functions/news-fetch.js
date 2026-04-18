// News proxy — Alpha Vantage NEWS_SENTIMENT (same key as stock data, sentiment pre-scored)
// Docs: https://www.alphavantage.co/documentation/#news-sentiment

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function mapSentiment(label) {
  if (!label) return 'Neutral';
  const l = label.toLowerCase();
  if (l.includes('bearish')) return 'Bearish';
  if (l.includes('bullish')) return 'Bullish';
  return 'Neutral';
}

function parseAVDate(str) {
  // Alpha Vantage format: "20231201T123456"
  if (!str || str.length < 8) return null;
  try {
    return new Date(
      `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}T${str.slice(9,11)}:${str.slice(11,13)}:${str.slice(13,15)}Z`
    ).toISOString();
  } catch { return null; }
}

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

  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(ticker.toUpperCase())}&limit=15&sort=LATEST&apikey=${key}`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    // Alpha Vantage returns { Information: "..." } on rate limit
    if (data.Information || data.Note) {
      throw new Error(data.Information || data.Note);
    }

    const feed = data.feed || [];
    const articles = feed.slice(0, 10).map(item => ({
      title: item.title,
      description: item.summary?.slice(0, 200),
      source: item.source,
      url: item.url,
      publishedAt: parseAVDate(item.time_published),
      sentiment: mapSentiment(item.overall_sentiment_label),
      sentimentScore: item.overall_sentiment_score,
    }));

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ articles }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message, articles: [] }) };
  }
};
