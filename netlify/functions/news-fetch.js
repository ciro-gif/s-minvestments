// News fetch — NewsAPI.org with inline Claude sentiment classification
const { retryFetch } = require('./_utils');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

async function classifyNews(articles, ticker, anthropicKey) {
  if (!anthropicKey || articles.length === 0) {
    return articles.map(a => ({ ...a, sentiment: 'Neutral', sentimentScore: null }));
  }
  try {
    const titles = articles.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Classify each headline as Bullish, Bearish, or Neutral for ${ticker} investors. Reply ONLY with a JSON array of strings, one per headline in order. Example: ["Bullish","Neutral","Bearish"]\n\n${titles}`,
        }],
      }),
    });
    if (!resp.ok) return articles.map(a => ({ ...a, sentiment: 'Neutral', sentimentScore: null }));
    const data = await resp.json();
    const text = data.content?.[0]?.text || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    const labels = match ? JSON.parse(match[0]) : [];
    return articles.map((a, i) => ({ ...a, sentiment: labels[i] || 'Neutral', sentimentScore: null }));
  } catch {
    return articles.map(a => ({ ...a, sentiment: 'Neutral', sentimentScore: null }));
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { ticker, company } = event.queryStringParameters || {};
  if (!ticker) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'ticker required' }) };

  const newsKey = process.env.NEWS_API_KEY;
  if (!newsKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'NEWS_API_KEY not configured' }) };

  const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const q = company ? `${ticker} OR "${company}"` : ticker;

  try {
    const res = await retryFetch(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=20&language=en&from=${from}`,
      { headers: { 'X-Api-Key': newsKey } }
    );

    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.message || 'NewsAPI error');

    let articles = (data.articles || []).filter(a => a.title && a.title !== '[Removed]');

    // Relevance guard: keep articles mentioning ticker or company name
    const tickerLower = ticker.toLowerCase();
    const companyLower = (company || '').toLowerCase().replace(/,?\s*(inc|corp|ltd|llc|co)\.?$/i, '').trim();
    const relevant = articles.filter(a => {
      const text = `${a.title} ${a.description || ''}`.toLowerCase();
      return text.includes(tickerLower) || (companyLower.length > 2 && text.includes(companyLower));
    });

    const lowRelevance = relevant.length < 3;
    const candidates = lowRelevance ? articles.slice(0, 10) : relevant.slice(0, 15);

    // Map to clean shape before classification
    const mapped = candidates.map(a => ({
      title: a.title,
      description: a.description || '',
      source: a.source?.name || '',
      url: a.url,
      publishedAt: a.publishedAt,
      sentiment: 'Neutral',
      sentimentScore: null,
    }));

    // Classify with Claude
    const classified = await classifyNews(mapped, ticker, process.env.ANTHROPIC_API_KEY);

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ articles: classified, lowRelevance }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
