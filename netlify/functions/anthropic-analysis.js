// AI financial analysis — sends financial model data to Claude, returns analysis

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function fmtVal(val, key) {
  if (val === null || val === undefined) return 'N/A';
  if (key === 'epsBasic' || key === 'epsDiluted') return `$${Number(val).toFixed(2)}`;
  if (key === 'sharesOutstanding') return `${(val / 1e6).toFixed(1)}M shares`;
  const abs = Math.abs(val);
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  return `$${Number(val).toLocaleString()}`;
}

function buildPrompt(ticker, company, quarters, metrics, stockData) {
  const ROWS = {
    totalRevenue: 'Total Revenue',
    grossProfit: 'Gross Profit',
    operatingIncome: 'Operating Income',
    netIncome: 'Net Income',
    epsBasic: 'EPS (Basic)',
    epsDiluted: 'EPS (Diluted)',
    researchAndDevelopment: 'R&D Expense',
    sellingGeneralAdministrative: 'SG&A',
    incomeTax: 'Income Tax',
    sharesOutstanding: 'Shares Outstanding',
  };

  const useQuarters = (quarters || []).slice(-8);
  const offset = (quarters || []).length - useQuarters.length;

  const tableRows = Object.entries(ROWS)
    .filter(([k]) => metrics[k] && metrics[k].some(v => v !== null))
    .map(([key, label]) => {
      const vals = (metrics[key] || []).slice(offset);
      const cells = useQuarters.map((q, i) => `${q}: ${fmtVal(vals[i], key)}`).join(' | ');
      return `  ${label}: ${cells}`;
    })
    .join('\n');

  const stockSummary = stockData ? `
Current Snapshot:
  Price: $${stockData.price || 'N/A'} (${stockData.changePercent || 'N/A'} today)
  Market Cap: ${stockData.marketCap ? '$' + (Number(stockData.marketCap) / 1e9).toFixed(2) + 'B' : 'N/A'}
  P/E Ratio: ${stockData.pe || 'N/A'}
  Beta: ${stockData.beta || 'N/A'}
  52-Week Range: $${stockData.fiftyTwoWeekLow || 'N/A'} – $${stockData.fiftyTwoWeekHigh || 'N/A'}` : '';

  return `You are a financial analyst assistant for S&M Investments, a private investment club. Analyze the following quarterly financial data for ${company} (${ticker}) and write a structured analysis.

Financial Model (last 8 quarters):
${tableRows}
${stockSummary}

Write your analysis with these four sections, using markdown headers:

## Summary
2–3 paragraphs in plain English: What does this financial model reveal about the business? How has performance trended?

## Notable Trends
Bullet points highlighting the most important trends — revenue growth rate, margin expansion/compression, earnings trajectory, expense changes. Be specific with numbers.

## What This Means for Investors
Explain what Revenue, Gross Profit, Operating Income, and Net Income each mean and why they matter. Assume the reader is learning to analyze stocks for the first time.

## Key Watch Items
3–5 bullet points on what an investor should monitor based on these numbers. What could positively or negatively impact the stock going forward?

---
⚠️ This is data interpretation only, not financial advice. Past performance does not indicate future results.`;
}

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
    const { ticker, company, quarters, metrics, stockData } = JSON.parse(event.body || '{}');
    if (!ticker) throw new Error('ticker required in request body');

    const prompt = buildPrompt(ticker, company, quarters, metrics, stockData);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const analysis = data.content?.[0]?.text || '';

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ analysis }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
