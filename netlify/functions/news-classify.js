// News sentiment classifier — uses Claude Haiku to label headlines bullish/bearish/neutral

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    const { headlines } = JSON.parse(event.body || '{}');
    if (!headlines || !Array.isArray(headlines) || headlines.length === 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'headlines array required' }) };
    }

    const numbered = headlines.map((h, i) => `${i + 1}. ${h}`).join('\n');

    const prompt = `You are a financial news sentiment classifier. For each headline below, classify it as exactly one of: Bullish, Bearish, or Neutral — from the perspective of a stock investor in that company.

Bullish: good news for the company or its stock (earnings beat, revenue growth, new products, market expansion, buybacks, upgrades)
Bearish: bad news (earnings miss, losses, lawsuits, layoffs, downgrades, debt issues, regulatory problems)
Neutral: factual updates without clear directional impact, general industry news, price targets maintained

Headlines:
${numbered}

Respond with ONLY valid JSON — an array with one object per headline:
[{"index": 1, "sentiment": "Bullish"}, {"index": 2, "sentiment": "Bearish"}, ...]`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) throw new Error(`Claude API error ${resp.status}`);

    const data = await resp.json();
    const text = data.content?.[0]?.text || '[]';

    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    const classifications = match ? JSON.parse(match[0]) : [];

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ classifications }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message, classifications: [] }) };
  }
};
