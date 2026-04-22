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

function buildPrompt(ticker, company, quarters, metrics, stockData, lang) {
  metrics = metrics || {};
  quarters = quarters || [];

  // If no financial data available, use shorter overview prompt
  if (Object.keys(metrics).length === 0 || quarters.length === 0) {
    const langInstr = lang === 'es' ? 'IMPORTANTE: Escribe TODA tu respuesta en español.\n\n' : '';
    const stockSummary = stockData
      ? `Price: $${stockData.price || 'N/A'}, Market Cap: ${stockData.marketCap ? '$' + (Number(stockData.marketCap)/1e9).toFixed(1) + 'B' : 'N/A'}, P/E: ${stockData.pe || 'N/A'}, Sector: ${stockData.sector || 'N/A'}`
      : 'No market data available.';
    return `${langInstr}You are a senior financial analyst writing for S&M Investments, an investment club of beginners. No quarterly SEC filing data is available for ${ticker} (${company || ticker}). Write a 2–3 paragraph educational overview based only on the market data below. Explain what type of company/fund this is, its market context, and 2–3 key things a beginner should know before investing. Be clear and jargon-free.\n\n${stockSummary}\n\n## Executive Summary\n`;
  }

  const inSpanish = lang === 'es';

  const ROWS = {
    totalRevenue:               'Total Revenue',
    grossProfit:                'Gross Profit',
    operatingIncome:            'Operating Income',
    netIncome:                  'Net Income',
    epsBasic:                   'EPS (Basic)',
    epsDiluted:                 'EPS (Diluted)',
    researchAndDevelopment:     'R&D Expense',
    sellingGeneralAdministrative: 'SG&A',
    costOfRevenue:              'Cost of Revenue',
    incomeTax:                  'Income Tax',
    sharesOutstanding:          'Shares Outstanding',
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

  // Derive margin trends for the prompt context
  const rev = (metrics.totalRevenue || []).slice(offset);
  const gp  = (metrics.grossProfit || []).slice(offset);
  const oi  = (metrics.operatingIncome || []).slice(offset);
  const ni  = (metrics.netIncome || []).slice(offset);
  const computeMargin = (num, den) => num && den && den !== 0 ? ((num / den) * 100).toFixed(1) + '%' : 'N/A';

  const latestIdx = rev.length - 1;
  const earliestIdx = 0;
  const marginContext = rev[latestIdx] ? `
Derived Margins (latest quarter):
  Gross Margin: ${computeMargin(gp[latestIdx], rev[latestIdx])}
  Operating Margin: ${computeMargin(oi[latestIdx], rev[latestIdx])}
  Net Margin: ${computeMargin(ni[latestIdx], rev[latestIdx])}
Derived Margins (earliest quarter in dataset):
  Gross Margin: ${computeMargin(gp[earliestIdx], rev[earliestIdx])}
  Operating Margin: ${computeMargin(oi[earliestIdx], rev[earliestIdx])}
  Net Margin: ${computeMargin(ni[earliestIdx], rev[earliestIdx])}` : '';

  const stockSummary = stockData ? `
Current Market Snapshot:
  Price: $${stockData.price || 'N/A'} (${stockData.changePercent || 'N/A'} today)
  Market Cap: ${stockData.marketCap ? '$' + (Number(stockData.marketCap) / 1e9).toFixed(2) + 'B' : 'N/A'}
  P/E Ratio: ${stockData.pe || 'N/A'}
  EPS: ${stockData.eps ? '$' + stockData.eps : 'N/A'}
  Beta: ${stockData.beta || 'N/A'}
  52-Week Range: $${stockData.fiftyTwoWeekLow || 'N/A'} – $${stockData.fiftyTwoWeekHigh || 'N/A'}
  Analyst Price Target: ${stockData.analystTarget ? '$' + stockData.analystTarget : 'N/A'}
  Dividend Yield: ${stockData.dividendYield || 'N/A'}
  Sector: ${stockData.sector || 'N/A'}` : '';

  const langInstruction = inSpanish
    ? 'IMPORTANTE: Escribe TODA tu respuesta en español. Usa terminología financiera en español cuando sea posible, pero puedes mantener los términos técnicos en inglés si no tienen traducción directa (ej. "earnings", "P/E ratio").\n\n'
    : '';

  return `${langInstruction}You are a senior financial analyst writing a research note for S&M Investments, a private investment club whose members are beginners learning to analyze stocks. Your goal is twofold: give a genuinely expert analysis AND teach the members what each concept means as you go.

Company: ${company} (${ticker})

Quarterly Financial Data (last 8 quarters):
${tableRows}
${marginContext}
${stockSummary}

CRITICAL FORMATTING RULE: Your response MUST start with the literal text '## Executive Summary' as the very first characters. Do NOT include a title, company header, 'RESEARCH NOTE:' line, ticker symbol, or any introductory text before it.

Write a complete analyst research note with the following sections. Use ## for section headers.

## Executive Summary
Write 2–3 paragraphs that tell the full story of this business. What has happened to revenue, profitability, and efficiency over this period? Is the trend improving or deteriorating? What is the single most important thing an investor should know about this company right now? Be specific with numbers.

## Business Health: What the Numbers Say
Analyze these areas with specific data points:
- **Revenue trend**: Is growth accelerating, decelerating, or reversing? What does the growth rate tell us?
- **Gross margin**: Is the company getting better or worse at making money on each sale? What does this mean competitively?
- **Operating leverage**: Are expenses growing faster or slower than revenue? What does that mean for future profitability?
- **Net income & EPS trajectory**: Where is actual profit going? Is EPS expanding or compressing and why?
- **R&D and SG&A**: Are these investments in the future or signs of bloated costs?

## Valuation Context
${stockData ? `Using the available market data (P/E: ${stockData.pe || 'N/A'}, Market Cap: ${stockData.marketCap ? '$' + (Number(stockData.marketCap)/1e9).toFixed(1)+'B' : 'N/A'}):
- Is the current P/E ratio high, low, or reasonable given the earnings trend?
- What would the company need to deliver to justify its current price?
- How does the 52-week range ($${stockData.fiftyTwoWeekLow || 'N/A'}–$${stockData.fiftyTwoWeekHigh || 'N/A'}) reflect investor sentiment shifts?
- What is Beta (${stockData.beta || 'N/A'}) telling us about this stock's risk profile?` : 'Market data was unavailable for this analysis. Discuss what valuation metrics investors should look for when researching this company.'}

## Beginner's Glossary: Understanding These Numbers
Briefly explain what each of these means in plain language (2–3 sentences each) — write this as if explaining to someone who just started learning about stocks:
- **Revenue** (Ingresos): What it is and why it matters
- **Gross Profit & Gross Margin**: The difference between selling and profiting
- **Operating Income**: What's left after running the business
- **Net Income & EPS**: The bottom line — what shareholders actually earn
- **P/E Ratio**: How to think about whether a stock is "expensive"

## Key Watch Items for Investors
Give 4–6 specific, actionable bullet points. For each one, explain: (1) what to watch, (2) why it matters, and (3) whether the current data is a green flag, yellow flag, or red flag. Be direct with your opinion.

---
⚠️ This is data interpretation and education only — not financial advice. Past performance does not indicate future results. Always do your own research before investing.`;
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
    const { ticker, company, quarters, metrics, stockData, lang } = JSON.parse(event.body || '{}');
    if (!ticker) throw new Error('ticker required in request body');

    const prompt = buildPrompt(ticker, company, quarters, metrics, stockData, lang || 'en');

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const analysis = data.content?.[0]?.text || '';

    // Strip any content before the first ## heading (AI sometimes adds a title despite instruction)
    let processedAnalysis = analysis;
    const firstH2 = processedAnalysis.indexOf('## ');
    if (firstH2 > 0) processedAnalysis = processedAnalysis.slice(firstH2);

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ analysis: processedAnalysis }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
