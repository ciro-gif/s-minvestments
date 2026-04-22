// ================================================================
// Research Page — orchestrates all data fetching and rendering
// ================================================================

(async () => {
  await requireAuth();
  I18n.init();

  // ---- Tooltip definitions ----
  const TIPS = {
    'Market Cap':       'Total market value of all outstanding shares. Large-cap (>$10B) = established company; Mid-cap ($2–10B) = growing; Small-cap (<$2B) = higher risk/reward.',
    '52W High':         'The highest price traded in the last 52 weeks. Price near this level means the stock is at a peak — watch for potential pullback.',
    '52W Low':          'The lowest price in the last 52 weeks. Price near its low may be a bargain or a sign of trouble — always understand WHY before buying.',
    'P/E Ratio':        'Price-to-Earnings: what investors pay per $1 of profit. High P/E = growth expectations priced in. Low P/E = may be undervalued or a declining business. Compare to industry peers.',
    'EPS':              'Earnings Per Share: net profit divided by shares outstanding. Shows profitability on a per-share basis. Growing EPS over time is a healthy sign.',
    'Dividend Yield':   'Annual dividend payment as % of stock price. Example: 3% yield on a $100 stock = $3/year income per share. Attractive for income-focused investors.',
    'Beta':             'Volatility vs. the broader market. Beta >1 = swings more than market (higher risk AND reward). Beta <1 = more stable than market. Beta 0 = uncorrelated.',
    'Avg Volume':       'Average number of shares traded daily. High volume = liquid market, easy to buy/sell at fair price. Low volume = harder to trade without moving the price.',
    'Float':            'Shares actually available for public trading (excludes insider/restricted shares). Low float = fewer shares to trade = more volatile price swings.',
    'Short Float %':    '% of float being sold short (investors betting the price will fall). >10% = notable bearish sentiment. >20% = high short interest, potential for a short squeeze if stock rises.',
    'Next Earnings':    'Date of next quarterly earnings report. Stock prices often move sharply (±5–20%) after earnings — know this date before holding through it.',
    'Analyst Target':   'Average 12-month price target from Wall Street analysts. Compare to current price to estimate implied upside or downside from professional coverage.',
  };

  const FINVIZ_TIPS = {
    'Analyst Consensus': 'Aggregated Wall Street analyst recommendation on a 1–5 scale. 1 = Strong Buy, 2 = Buy, 3 = Hold, 4 = Sell, 5 = Strong Sell.',
    'Price Target':      'Consensus analyst price target — where Wall Street collectively expects the stock price in 12 months.',
    'Short Float':       '% of float sold short. High short interest = many investors betting the price falls. Can cause a "short squeeze" rally if the stock rises.',
    'Insider Own':       '% of shares owned by executives and board members. High insider ownership (>10%) often signals strong confidence in the company\'s future.',
    'Inst Own':          '% owned by institutional investors (mutual funds, pension funds, hedge funds). High institutional ownership = strong professional conviction.',
    'RSI (14)':          'Relative Strength Index over 14 days. Scale of 0–100: >70 = overbought (possible pullback), <30 = oversold (possible bounce). Momentum indicator.',
    'Forward P/E':       'P/E ratio based on next year\'s expected earnings. If lower than current P/E, analysts expect earnings to grow — generally a positive sign.',
    'Debt/Eq':           'Debt-to-Equity ratio. Measures financial leverage. >1 means more debt than equity — amplifies both gains and losses. >2 = aggressive leverage.',
    'EPS next Y':        'Expected earnings-per-share growth rate for the next full year. Analysts\' consensus forecast for profit improvement.',
    'Perf Week':         'Stock price change over the past 5 trading days.',
    'Perf Month':        'Stock price change over the past 30 calendar days.',
    'Perf YTD':          'Stock price change since January 1st of the current year.',
  };

  const FIN_TIPS = {
    'Total Revenue':          'All money earned from sales before any expenses. The "top line" — consistent growth here is the foundation of a healthy business.',
    'Revenue Growth QoQ':     'Quarter-over-quarter revenue change. Accelerating growth = business expanding. Negative = revenue shrinking, which is a warning sign.',
    'Gross Profit':           'Revenue minus the direct cost of making the product/service. Shows basic profitability before overhead costs like salaries and marketing.',
    'Gross Margin %':         'Gross Profit as % of Revenue. Higher % = more efficient at delivering the product. Software companies often >70%; retailers 20–30%. Compare to industry.',
    'R&D':                    'Research & Development spending. Investment in future products and technology. High R&D can hurt short-term profits but build long-term competitive advantage.',
    'SG&A':                   'Selling, General & Administrative costs — sales teams, marketing, executive salaries. If SG&A grows faster than revenue, efficiency is declining.',
    'Operating Income':       'Profit from core business operations after all operating expenses. Positive = business is self-sustaining. Negative = burning cash to operate.',
    'Operating Margin %':     'Operating Income as % of Revenue. Rising margin over time = getting more efficient. Compressing margin = costs growing faster than sales.',
    'Net Income':             'Final profit after ALL expenses: operations, interest, and taxes. The "bottom line" — what actually flows to shareholders.',
    'Net Margin %':           'Net Income as % of Revenue. How much of every dollar of sales becomes actual profit. A net margin of 20%+ is considered strong in most industries.',
    'EPS (Basic)':            'Basic earnings per share using all common shares. Rising EPS over time = company is growing profit per share — a key driver of stock price.',
    'EPS (Diluted)':          'EPS including all potential shares from options and convertibles — more conservative than basic. This is the standard version analysts use.',
    'Shares Outstanding':     'Total shares issued by the company. Increasing count = dilution (each share worth a smaller %). Decreasing = share buybacks, which is usually bullish.',
    'Interest Income':        'Money earned from cash and investments held by the company. Relevant for cash-rich businesses — Tesla and Apple earn billions here.',
    'Interest Expense':       'Cost of debt — interest paid on loans and bonds. High and rising interest expense eats into profits and signals heavy debt reliance.',
    'Pre-tax Income':         'Profit before income taxes. Shows operational profitability before government tax treatment — useful for comparing companies across countries.',
    'Income Tax':             'Taxes paid to governments. Effective tax rate = income tax / pre-tax income. Unusually low tax rates may reflect one-time benefits and may not persist.',
    'Automotive Revenue':     'Revenue specifically from vehicle sales — the core hardware business.',
    'Services Revenue':       'Revenue from software, subscriptions, and services — typically higher-margin than hardware and more recurring.',
    'Total COGS':             'Total cost of goods sold — direct costs of production. Lower COGS relative to revenue = improving gross margins.',
    'Automotive COGS':        'Direct costs of manufacturing vehicles: materials, labor, factory overhead.',
    'Services COGS':          'Direct costs of delivering services: hosting, support, content costs.',
    'Total OpEx':             'Total operating expenses including R&D and SG&A. Measures total cost of running the business beyond production.',
  };

  function tipHtml(label, tipsMap) {
    const tip = tipsMap[label];
    if (!tip) return '';
    return `<span class="info-tip" data-tip="${Utils.escHtml(tip)}">i</span>`;
  }

  // ---- Routing: read ticker from URL ----
  const params = new URLSearchParams(window.location.search);
  let currentTicker = Utils.normalizeTicker(params.get('ticker') || '');

  // ---- Search bar ----
  const tickerInput = document.getElementById('ticker-input');
  const searchBtn = document.getElementById('search-btn');

  if (currentTicker) {
    tickerInput.value = currentTicker;
    runResearch(currentTicker);
  }

  searchBtn.addEventListener('click', () => doSearch());
  tickerInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  function doSearch() {
    const t = Utils.normalizeTicker(tickerInput.value);
    if (!t) return;
    currentTicker = t;
    const url = new URL(window.location);
    url.searchParams.set('ticker', t);
    window.history.pushState({}, '', url);
    runResearch(t);
  }

  // ---- AI panel toggle ----
  document.getElementById('ai-panel-toggle').addEventListener('click', () => {
    const body = document.getElementById('ai-panel-body');
    const chevron = document.getElementById('ai-chevron');
    const open = body.classList.toggle('open');
    chevron.classList.toggle('open', open);
  });

  // ---- Note button ----
  const noteBtn = document.getElementById('note-btn');
  const noteForm = document.getElementById('note-form');
  const noteCancel = document.getElementById('note-cancel');
  const noteSave = document.getElementById('note-save');

  noteBtn.addEventListener('click', () => {
    noteForm.style.display = noteForm.style.display === 'none' ? 'block' : 'none';
  });
  noteCancel.addEventListener('click', () => { noteForm.style.display = 'none'; });
  noteSave.addEventListener('click', () => savePrivateNote(currentTicker));

  // ---- Forum share button ----
  const forumBtn = document.getElementById('forum-btn');
  const forumForm = document.getElementById('forum-form');
  const forumCancel = document.getElementById('forum-cancel');
  const forumSave = document.getElementById('forum-save');

  forumBtn.addEventListener('click', () => {
    forumForm.style.display = forumForm.style.display === 'none' ? 'block' : 'none';
  });
  forumCancel.addEventListener('click', () => { forumForm.style.display = 'none'; });
  forumSave.addEventListener('click', () => shareToForum(currentTicker));

  document.querySelectorAll('.type-select').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-select').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ================================================================
  // Main research orchestrator
  // ================================================================

  async function runResearch(ticker, forceRefresh = false) {
    document.getElementById('research-empty').style.display = 'none';
    document.getElementById('research-content').style.display = 'block';

    document.getElementById('r-ticker').textContent = `$${ticker}`;
    document.getElementById('r-company').textContent = '';
    document.getElementById('ai-ticker-label').textContent = ticker;

    // Check for a fresh auto-processed snapshot (< 24h) before hitting live APIs
    if (!forceRefresh) {
      try {
        const { data: snap } = await SM.supabase
          .from('ticker_snapshots')
          .select('*')
          .eq('ticker', ticker)
          .maybeSingle();

        if (snap) {
          const ageHours = (Date.now() - new Date(snap.snapped_at)) / 3600000;
          if (ageHours < 24) {
            renderFromSnapshot(snap, ticker);
            return;
          }
        }
      } catch { /* fall through to live fetch */ }
    }

    // Reset sections to loading state
    resetToLoading();

    // Fetch all data sources in parallel (graceful degradation)
    const [stockResult, edgarResult, finvizResult] = await Promise.allSettled([
      fetchStockData(ticker),
      fetchEdgarData(ticker),
      fetchFinvizData(ticker),
    ]);

    const stockData  = stockResult.status  === 'fulfilled' ? stockResult.value  : null;
    const edgarData  = edgarResult.status  === 'fulfilled' ? edgarResult.value  : null;
    const finvizData = finvizResult.status === 'fulfilled' ? finvizResult.value : null;

    // Log Alpha Vantage usage (stock-data = 2 calls) only when AV was the source
    if (stockData?.source === 'alphavantage' && SM.user) {
      SM.supabase.from('api_usage_log').insert({ ticker, calls_consumed: 2 }).then(() => {});
    }

    // Render company name — prefer stockData.name (Title Case) over EDGAR (ALL CAPS)
    const companyName = stockData?.name || edgarData?.company || ticker;
    document.getElementById('r-company').textContent = companyName;
    document.title = `$${ticker} — S&M Investments`;

    // Render sections
    renderSnapshot(stockData, ticker);
    renderAnalystSection(finvizData);
    renderFinTable(edgarData);
    renderMetricsCards(edgarData);

    // Log to history
    logHistory(ticker, companyName, stockData);

    // Load private notes
    loadPrivateNotes(ticker);

    // Fetch news (depends on company name)
    fetchAndRenderNews(ticker, companyName);

    // AI analysis (depends on edgar + stock data)
    fetchAndRenderAI(ticker, companyName, edgarData, stockData);
  }

  function renderFromSnapshot(snap, ticker) {
    document.getElementById('r-company').textContent = snap.company_name || ticker;
    document.title = `$${ticker} — S&M Investments`;

    renderSnapshot(snap.stock_data, ticker);
    // Hide analyst section for snapshots (live Finviz not cached)
    document.getElementById('analyst-section').style.display = 'none';
    renderFinTable(snap.financial_data);
    renderMetricsCards(snap.financial_data);
    loadPrivateNotes(ticker);

    // News from cache
    const newsEl = document.getElementById('news-list');
    const articles = snap.news_data?.articles || [];
    newsEl.innerHTML = articles.length
      ? articles.map((a, i) => renderNewsItem(a, i, a.sentiment || 'Neutral')).join('')
      : `<div class="alert alert-info">No news cached for ${ticker}.</div>`;

    // AI from cache with refresh option
    const aiBody = document.getElementById('ai-panel-body');

    // Detect language mismatch between cached analysis and current UI language
    const hasSpanishChars = /[áéíóúñ¿¡]/.test(snap.ai_analysis || '');
    const currentLang = typeof I18n !== 'undefined' ? I18n.getLang() : 'en';
    const langMismatch = snap.ai_analysis && (
      (hasSpanishChars && currentLang === 'en') ||
      (!hasSpanishChars && currentLang === 'es')
    );
    const langLabel = currentLang === 'es' ? 'Español' : 'English';

    if (snap.ai_analysis && !langMismatch) {
      aiBody.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border-radius:var(--radius);margin-bottom:12px;font-size:0.75rem;color:var(--text-muted)">
          <span style="color:var(--amber)">●</span>
          Pre-computed snapshot · ${Utils.fmtRelative(snap.snapped_at)}
          <button id="snap-refresh-btn" class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:0.72rem">Refresh live data</button>
        </div>
        <div class="ai-content">${Utils.renderMarkdown(snap.ai_analysis)}</div>
      `;
      aiBody.classList.add('open');
      document.getElementById('ai-chevron').classList.add('open');
      document.getElementById('snap-refresh-btn').addEventListener('click', () => runResearch(ticker, true));
    } else if (snap.ai_analysis && langMismatch) {
      aiBody.innerHTML = `
        <div style="padding:20px;text-align:center">
          <p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:12px">
            AI analysis was generated in a different language.
          </p>
          <button class="btn btn-primary btn-sm" id="snap-lang-refresh">
            Re-generate in ${langLabel}
          </button>
          <button class="btn btn-ghost btn-sm" id="snap-show-cached" style="margin-left:8px">
            Show cached anyway
          </button>
        </div>
      `;
      aiBody.classList.add('open');
      document.getElementById('ai-chevron').classList.add('open');
      document.getElementById('snap-lang-refresh')?.addEventListener('click', () => runResearch(ticker, true));
      document.getElementById('snap-show-cached')?.addEventListener('click', () => {
        aiBody.innerHTML = `<div class="ai-content">${Utils.renderMarkdown(snap.ai_analysis)}</div>`;
      });
    } else {
      aiBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:12px">No AI analysis cached.</div>';
    }
  }

  function resetToLoading() {
    document.getElementById('snapshot-card').innerHTML =
      '<div class="loading-block"><div class="spinner"></div> Loading market data…</div>';
    document.getElementById('analyst-section').style.display = 'none';
    document.getElementById('fin-table-wrap').innerHTML =
      '<div class="loading-block"><div class="spinner"></div> Fetching SEC EDGAR data…</div>';
    document.getElementById('ai-panel-body').innerHTML =
      '<div class="loading-block"><div class="spinner"></div> Generating AI analysis…</div>';
    document.getElementById('ai-panel-body').classList.remove('open');
    document.getElementById('ai-chevron').classList.remove('open');
    document.getElementById('metrics-cards').innerHTML =
      '<div class="loading-block"><div class="spinner"></div></div>';
    document.getElementById('news-list').innerHTML =
      '<div class="loading-block"><div class="spinner"></div> Fetching news…</div>';
  }

  // ================================================================
  // Data fetchers
  // ================================================================

  async function fetchStockData(ticker) {
    return Utils.apiFetch(`/api/stock-data?ticker=${encodeURIComponent(ticker)}`);
  }

  async function fetchEdgarData(ticker) {
    return Utils.apiFetch(`/api/sec-edgar?ticker=${encodeURIComponent(ticker)}`);
  }

  async function fetchFinvizData(ticker) {
    return Utils.apiFetch(`/api/finviz-data?ticker=${encodeURIComponent(ticker)}`);
  }

  // ================================================================
  // Renderers
  // ================================================================

  function renderSnapshot(d, ticker) {
    const el = document.getElementById('snapshot-card');
    if (!d) {
      el.innerHTML = `
        <div class="alert alert-warning">
          <strong>No data found for ${Utils.escHtml(ticker)}</strong><br>
          <span style="font-size:0.8rem;display:block;margin-top:6px">
            Suggestions: check spelling · use primary share class (e.g. BRK.B → BRK-B) ·
            confirm the ticker is actively traded on US exchanges.
          </span>
        </div>
      `;
      return;
    }

    const changeVal = parseFloat(d.change) || 0;
    const changeSign = changeVal > 0 ? '+' : '';
    const changeCls = changeVal > 0 ? 'pos' : changeVal < 0 ? 'neg' : 'zero';
    const price = d.price ? `$${parseFloat(d.price).toFixed(2)}` : '—';
    const mktCap = d.marketCap ? Utils.fmtMoney(Number(d.marketCap)) : '—';

    let changeDisplay;
    if (!d.price && d.marketState === 'CLOSED') {
      changeDisplay = '<span style="color:var(--text-dim);font-size:0.8rem">Market closed</span>';
    } else if (!d.changePercent && Math.abs(changeVal) < 0.005) {
      changeDisplay = '—';
    } else {
      changeDisplay = `${changeSign}${changeVal.toFixed(2)} (${d.changePercent || '—'})`;
    }

    const grid = [
      ['Market Cap',     mktCap],
      ['52W High',       d.fiftyTwoWeekHigh ? `$${parseFloat(d.fiftyTwoWeekHigh).toFixed(2)}` : '—'],
      ['52W Low',        d.fiftyTwoWeekLow  ? `$${parseFloat(d.fiftyTwoWeekLow).toFixed(2)}`  : '—'],
      ['P/E Ratio',      d.pe || '—'],
      ['EPS',            d.eps ? `$${parseFloat(d.eps).toFixed(2)}` : '—'],
      ['Dividend Yield', d.dividendYield ? Utils.fmtPct(parseFloat(d.dividendYield)/100) : '—'],
      ['Beta',           d.beta ? parseFloat(d.beta).toFixed(2) : '—'],
      ['Avg Volume',     d.avgVolume ? Utils.fmtMoneyShort(Number(d.avgVolume)).replace(/\$/g, '') : '—'],
      ['Float',          d.sharesFloat ? Utils.fmtMoney(Number(d.sharesFloat)) : '—'],
      ['Short Float %',  d.shortPercentFloat ? Utils.fmtPct(parseFloat(d.shortPercentFloat)/100) : '—'],
      ['Next Earnings',  d.nextEarnings ? Utils.fmtDate(d.nextEarnings) : '—'],
      ['Analyst Target', d.analystTarget ? `$${parseFloat(d.analystTarget).toFixed(2)}` : '—'],
    ];

    const sourceTag = d.source === 'yahoo'
      ? `<span class="tag tag-amber" style="font-size:0.62rem;margin-left:6px">Yahoo Finance</span>`
      : '';

    el.innerHTML = `
      <div class="snapshot-sector">
        ${d.sector ? `<span class="tag tag-blue">${Utils.escHtml(d.sector)}</span>` : ''}
        ${d.industry ? `<span class="tag" style="background:var(--surface3);color:var(--text-muted);border:1px solid var(--border2)">${Utils.escHtml(d.industry)}</span>` : ''}
        ${sourceTag}
      </div>
      <div class="snapshot-price-row">
        <div class="snapshot-price">${price}</div>
        <div class="snapshot-change ${changeCls}">${changeDisplay}</div>
      </div>
      <div class="snapshot-grid">
        ${grid.map(([label, val]) => `
          <div class="snapshot-item">
            <div class="label">${label}${tipHtml(label, TIPS)}</div>
            <div class="value">${Utils.escHtml(String(val))}</div>
          </div>
        `).join('')}
      </div>
      ${d.description ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
          <p style="font-size:0.78rem;color:var(--text-muted);line-height:1.65">${Utils.escHtml(d.description.slice(0, 400))}${d.description.length > 400 ? '…' : ''}</p>
        </div>
      ` : ''}
    `;
  }

  function renderAnalystSection(d) {
    const section = document.getElementById('analyst-section');
    const card = document.getElementById('analyst-card');

    if (!d || (!d.analystRecom && !d.targetPrice)) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    // Consensus pill color
    const score = d.analystRecomScore;
    let recommColor = 'var(--text-muted)';
    if (score <= 1.5) recommColor = '#00C48C';
    else if (score <= 2.5) recommColor = '#4ADB9E';
    else if (score <= 3.5) recommColor = '#F5A623';
    else if (score <= 4.5) recommColor = '#FF7A7A';
    else if (score)        recommColor = '#FF4D4D';

    // Build gauge bar (1=left=buy, 5=right=sell)
    const gaugePct = score ? ((score - 1) / 4) * 100 : 50;

    const rows = [
      ['Price Target',     d.targetPrice,       FINVIZ_TIPS['Price Target']],
      ['Short Float',      d.shortFloat,        FINVIZ_TIPS['Short Float']],
      ['Insider Own',      d.insiderOwn,        FINVIZ_TIPS['Insider Own']],
      ['Inst Own',         d.institutionalOwn,  FINVIZ_TIPS['Inst Own']],
      ['RSI (14)',         d.rsi14,             FINVIZ_TIPS['RSI (14)']],
      ['Forward P/E',      d.forwardPE,         FINVIZ_TIPS['Forward P/E']],
      ['Debt/Eq',          d.debtEquity,        FINVIZ_TIPS['Debt/Eq']],
      ['EPS next Y',       d.epsNextY,          FINVIZ_TIPS['EPS next Y']],
    ].filter(([, val]) => val);

    const perfRows = [
      ['Perf Week',  d.perfWeek,  FINVIZ_TIPS['Perf Week']],
      ['Perf Month', d.perfMonth, FINVIZ_TIPS['Perf Month']],
      ['Perf YTD',   d.perfYTD,   FINVIZ_TIPS['Perf YTD']],
    ].filter(([, val]) => val);

    function perfColor(val) {
      if (!val) return 'var(--text-muted)';
      return val.startsWith('-') ? 'var(--red)' : 'var(--green)';
    }

    card.innerHTML = `
      <div class="card" style="display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:start">
        <!-- Consensus pill -->
        <div style="text-align:center;min-width:140px">
          ${d.analystRecomLabel ? `
            <div style="font-size:1.3rem;font-weight:700;color:${recommColor};font-family:var(--font-mono);margin-bottom:4px">
              ${Utils.escHtml(d.analystRecomLabel)}
            </div>
            <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:10px">
              Score: ${score ? score.toFixed(2) : '—'} / 5.0
              <span class="info-tip" data-tip="${Utils.escHtml(FINVIZ_TIPS['Analyst Consensus'])}">i</span>
            </div>
            <div style="height:6px;background:var(--surface3);border-radius:3px;position:relative;overflow:hidden;margin-bottom:4px">
              <div style="position:absolute;left:0;top:0;bottom:0;width:${gaugePct.toFixed(1)}%;background:linear-gradient(90deg,var(--green),var(--amber),var(--red));border-radius:3px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-dim)">
              <span>Buy</span><span>Hold</span><span>Sell</span>
            </div>
          ` : '<div style="color:var(--text-muted);font-size:0.8rem">No consensus data</div>'}
          ${d.earnings ? `<div style="margin-top:12px;font-size:0.72rem;color:var(--text-muted)">Earnings: <span style="color:var(--amber)">${Utils.escHtml(d.earnings)}</span></div>` : ''}
        </div>

        <!-- Stats grid -->
        <div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px">
            ${rows.map(([label, val, tip]) => `
              <div class="snapshot-item">
                <div class="label">${label}${tip ? `<span class="info-tip" data-tip="${Utils.escHtml(tip)}">i</span>` : ''}</div>
                <div class="value">${Utils.escHtml(String(val))}</div>
              </div>
            `).join('')}
          </div>
          ${perfRows.length ? `
            <div style="display:flex;gap:16px;padding-top:10px;border-top:1px solid var(--border)">
              ${perfRows.map(([label, val, tip]) => `
                <div>
                  <div style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">
                    ${label}${tip ? `<span class="info-tip" data-tip="${Utils.escHtml(tip)}">i</span>` : ''}
                  </div>
                  <div style="font-family:var(--font-mono);font-weight:700;font-size:0.85rem;color:${perfColor(val)}">${Utils.escHtml(val)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      <div style="font-size:0.65rem;color:var(--text-dim);margin-top:6px;padding:0 4px">Source: Finviz</div>
    `;
  }

  function renderFinTable(d) {
    const el = document.getElementById('fin-table-wrap');
    if (!d || !d.quarters || d.quarters.length === 0) {
      el.innerHTML = `<div class="alert alert-warning" style="margin:16px">SEC EDGAR data unavailable or no quarterly filings found.</div>`;
      return;
    }

    const { quarters, metrics } = d;
    const m = metrics;

    const grossMarginPct = calcPctOf(m.grossProfit, m.totalRevenue);
    const opMarginPct    = calcPctOf(m.operatingIncome, m.totalRevenue);
    const netMarginPct   = calcPctOf(m.netIncome, m.totalRevenue);
    const revenueGrowth  = calcQoQGrowth(m.totalRevenue);

    const sections = [
      {
        label: 'Revenue',
        rows: [
          { label: 'Automotive Revenue',  key: 'automotiveRevenue',  vals: m.automotiveRevenue },
          { label: 'Services Revenue',    key: 'servicesRevenue',    vals: m.servicesRevenue },
          { label: 'Total Revenue',       key: 'totalRevenue',       vals: m.totalRevenue,       bold: true },
          { label: 'Revenue Growth QoQ',  key: 'revenueGrowth',      vals: revenueGrowth,        pct: true, calc: true },
        ],
      },
      {
        label: 'Cost of Revenue',
        rows: [
          { label: 'Automotive COGS',     key: 'automotiveCOGS',     vals: m.automotiveCOGS },
          { label: 'Services COGS',       key: 'servicesCOGS',       vals: m.servicesCOGS },
          { label: 'Total COGS',          key: 'costOfRevenue',      vals: m.costOfRevenue,       bold: true },
        ],
      },
      {
        label: 'Profitability',
        rows: [
          { label: 'Gross Profit',        key: 'grossProfit',        vals: m.grossProfit,         bold: true },
          { label: 'Gross Margin %',      key: 'grossMarginPct',     vals: grossMarginPct,         pct: true, calc: true },
        ],
      },
      {
        label: 'Operating Expenses',
        rows: [
          { label: 'R&D',                 key: 'researchAndDevelopment',       vals: m.researchAndDevelopment },
          { label: 'SG&A',               key: 'sellingGeneralAdministrative', vals: m.sellingGeneralAdministrative },
          { label: 'Total OpEx',         key: 'operatingExpenses',   vals: m.operatingExpenses },
          { label: 'Operating Income',   key: 'operatingIncome',     vals: m.operatingIncome,     bold: true },
          { label: 'Operating Margin %', key: 'opMarginPct',         vals: opMarginPct,            pct: true, calc: true },
        ],
      },
      {
        label: 'Bottom Line',
        rows: [
          { label: 'Interest Income',    key: 'interestIncome',      vals: m.interestIncome },
          { label: 'Interest Expense',   key: 'interestExpense',     vals: m.interestExpense },
          { label: 'Pre-tax Income',     key: 'pretaxIncome',        vals: m.pretaxIncome },
          { label: 'Income Tax',         key: 'incomeTax',           vals: m.incomeTax },
          { label: 'Net Income',         key: 'netIncome',           vals: m.netIncome,            bold: true },
          { label: 'Net Margin %',       key: 'netMarginPct',        vals: netMarginPct,            pct: true, calc: true },
          { label: 'EPS (Basic)',        key: 'epsBasic',            vals: m.epsBasic,              eps: true },
          { label: 'EPS (Diluted)',      key: 'epsDiluted',          vals: m.epsDiluted,            eps: true },
        ],
      },
      {
        label: 'Shares',
        rows: [
          { label: 'Shares Outstanding', key: 'sharesOutstanding',   vals: m.sharesOutstanding,    shares: true },
        ],
      },
    ];

    const thCells = quarters.map(q => `<th>${Utils.escHtml(q)}</th>`).join('');

    let tableHTML = `
      <table class="fin-table">
        <thead>
          <tr>
            <th>Metric</th>
            ${thCells}
            <th class="trend-col" title="Overall trend across all quarters">Trend</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const section of sections) {
      const hasData = section.rows.some(r => r.vals && r.vals.some(v => v !== null));
      if (!hasData) continue;

      tableHTML += `
        <tr class="section-header">
          <td colspan="${quarters.length + 2}">${section.label}</td>
        </tr>
      `;

      for (const row of section.rows) {
        if (!row.vals || row.vals.every(v => v === null)) continue;

        const cells = quarters.map((_, i) => {
          const val = row.vals ? row.vals[i] : null;
          return renderCell(val, row);
        }).join('');

        const rowCls = ['metric-row', row.bold ? 'bold-row' : '', row.calc ? 'calc-row' : ''].filter(Boolean).join(' ');

        tableHTML += `
          <tr class="${rowCls}">
            <td>${Utils.escHtml(row.label)}${tipHtml(row.label, FIN_TIPS)}</td>
            ${cells}
            ${trendCell(row.vals, row)}
          </tr>
        `;
      }
    }

    tableHTML += `</tbody></table>`;
    el.innerHTML = tableHTML;
  }

  function trendCell(vals, row) {
    const clean = (vals || []).filter(v => v !== null && !isNaN(v));
    if (clean.length < 2) return '<td class="trend-col"></td>';

    const first = clean[0];
    const last  = clean[clean.length - 1];
    const isUp  = last > first;
    const color = isUp ? 'var(--green)' : 'var(--red)';
    const arrow = isUp ? '▲' : '▼';

    let label;
    if (row.pct) {
      const pp = ((last - first) * 100).toFixed(1);
      label = `${isUp ? '+' : ''}${pp}pp`;
    } else if (row.eps || row.shares) {
      const pct = first !== 0 ? ((last - first) / Math.abs(first) * 100).toFixed(0) : '—';
      label = `${isUp ? '+' : ''}${pct}%`;
    } else {
      const pct = first !== 0 ? ((last - first) / Math.abs(first) * 100).toFixed(0) : '—';
      label = `${isUp ? '+' : ''}${pct}%`;
    }

    const svg = Utils.sparkline(clean, { color: isUp ? '#00C48C' : '#FF4D4D', width: 64, height: 22, fill: true });

    return `
      <td class="trend-col">
        <div class="trend-cell-inner">
          ${svg}
          <span style="color:${color}">${arrow} ${label}</span>
        </div>
      </td>
    `;
  }

  function renderCell(val, row) {
    if (val === null || val === undefined) return `<td class="null-val">—</td>`;

    let text, colorStyle = '';

    if (row.eps) {
      text = `$${parseFloat(val).toFixed(2)}`;
      colorStyle = val >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    } else if (row.pct) {
      text = `${(val * 100).toFixed(1)}%`;
      colorStyle = val >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    } else if (row.shares) {
      text = `${(val / 1e6).toFixed(1)}M`;
    } else {
      const abs = Math.abs(val);
      if (abs >= 1e9)      text = `${(val / 1e9).toFixed(2)}B`;
      else if (abs >= 1e6) text = `${(val / 1e6).toFixed(1)}M`;
      else if (abs >= 1e3) text = `${(val / 1e3).toFixed(0)}K`;
      else                 text = val.toLocaleString();
      colorStyle = val >= 0 ? 'color:var(--text)' : 'color:var(--red)';
    }

    return `<td style="${colorStyle}">${text}</td>`;
  }

  function calcPctOf(numerator, denominator) {
    if (!numerator || !denominator) return [];
    const len = Math.max(numerator.length, denominator.length);
    return Array.from({ length: len }, (_, i) => {
      const n = numerator[i], d = denominator[i];
      if (n === null || d === null || d === 0) return null;
      return n / d;
    });
  }

  function calcQoQGrowth(arr) {
    if (!arr || arr.length < 2) return [];
    return arr.map((v, i) => {
      if (i === 0) return null;
      const prev = arr[i - 1];
      if (v === null || prev === null || prev === 0) return null;
      return (v - prev) / Math.abs(prev);
    });
  }

  function renderMetricsCards(d) {
    const el = document.getElementById('metrics-cards');
    if (!d || !d.quarters || d.quarters.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">Metrics unavailable.</div>';
      return;
    }

    const { metrics: m } = d;

    const cards = [
      { label: 'Revenue',            key: 'totalRevenue',     vals: m.totalRevenue,     color: '#00C48C', format: 'money' },
      { label: 'Gross Margin',       key: 'grossMarginPct',   vals: calcPctOf(m.grossProfit, m.totalRevenue), color: '#4A9EFF', format: 'pct' },
      { label: 'Net Income',         key: 'netIncome',        vals: m.netIncome,         color: '#A78BFA', format: 'money' },
      { label: 'EPS (Diluted)',      key: 'epsDiluted',       vals: m.epsDiluted,        color: '#F5A623', format: 'eps' },
      { label: 'Operating Expenses', key: 'operatingExpenses',vals: m.operatingExpenses, color: '#FF4D4D', format: 'money' },
      { label: 'R&D Spend',         key: 'researchAndDevelopment', vals: m.researchAndDevelopment, color: '#4A9EFF', format: 'money' },
    ];

    el.innerHTML = cards.map(card => {
      const clean = (card.vals || []).filter(v => v !== null);
      if (clean.length === 0) return '';

      const latest = clean[clean.length - 1];
      const prev   = clean[clean.length - 2];
      let latestFmt, change = '';

      if (card.format === 'money') latestFmt = Utils.fmtMoney(latest);
      else if (card.format === 'pct') latestFmt = `${(latest * 100).toFixed(1)}%`;
      else if (card.format === 'eps') latestFmt = `$${parseFloat(latest).toFixed(2)}`;
      else latestFmt = String(latest);

      if (prev !== null && prev !== undefined) {
        const cls = latest >= prev ? 'pos' : 'neg';

        if (card.format === 'eps') {
          const absDelta = Math.abs(latest - prev).toFixed(2);
          const prefix = latest >= prev ? '+' : '-';
          change = `<div class="metric-change ${cls}">${prefix}$${absDelta} QoQ</div>`;
        } else if (card.format === 'pct') {
          const delta = ((latest - prev) * 100).toFixed(1) + 'pp';
          const sign = latest >= prev ? '+' : '';
          change = `<div class="metric-change ${cls}">${sign}${delta} QoQ</div>`;
        } else {
          const delta = Utils.fmtMoneyShort(latest - prev);
          const sign = latest >= prev ? '+' : '';
          change = `<div class="metric-change ${cls}">${sign}${delta} QoQ</div>`;
        }
      }

      return `
        <div class="metric-card">
          <div class="metric-label">${card.label}</div>
          <div class="metric-value" style="${Utils.colorStyle(latest)}">${latestFmt}</div>
          ${change}
          <div class="sparkline-wrap">
            ${Utils.sparkline(clean, { color: card.color, fill: true })}
          </div>
        </div>
      `;
    }).filter(Boolean).join('');

    if (!el.innerHTML) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">Metrics unavailable.</div>';
    }
  }

  async function fetchAndRenderNews(ticker, company) {
    const newsEl = document.getElementById('news-list');
    try {
      const { articles } = await Utils.apiFetch(
        `/api/news-fetch?ticker=${encodeURIComponent(ticker)}`
      );

      if (!articles || articles.length === 0) {
        newsEl.innerHTML = `<div class="alert alert-info">No recent news found for ${ticker}.</div>`;
        return;
      }

      if (SM.user) SM.supabase.from('api_usage_log').insert({ ticker, calls_consumed: 1 }).then(() => {});

      newsEl.innerHTML = articles.map((a, i) => renderNewsItem(a, i, a.sentiment || 'Neutral')).join('');
    } catch (err) {
      newsEl.innerHTML = `<div class="alert alert-error">News fetch failed: ${Utils.escHtml(err.message)}</div>`;
    }
  }

  function renderNewsItem(article, index, sentiment) {
    const sentimentConfig = {
      Bullish: { color: 'var(--green)', bg: 'rgba(0,196,140,0.12)', dot: 'var(--green)' },
      Bearish: { color: 'var(--red)',   bg: 'rgba(255,77,77,0.12)',  dot: 'var(--red)' },
      Neutral: { color: 'var(--text-muted)', bg: 'var(--surface3)', dot: 'var(--border2)' },
    };

    const s = sentimentConfig[sentiment] || sentimentConfig.Neutral;
    const date = article.publishedAt ? Utils.fmtRelative(article.publishedAt) : '';

    const sentimentBadge = sentiment
      ? `<span class="news-sentiment-label" style="background:${s.bg};color:${s.color}">${sentiment}</span>`
      : '';

    return `
      <div class="news-item">
        <div class="news-sentiment">
          <div class="news-sentiment-dot" style="background:${s.dot}"></div>
        </div>
        <div class="news-content">
          <div class="news-headline">
            <a href="${Utils.escHtml(article.url || '#')}" target="_blank" rel="noopener noreferrer">
              ${Utils.escHtml(article.title)}
            </a>
          </div>
          <div class="news-meta">
            ${sentimentBadge}
            <span>${Utils.escHtml(article.source || '')}</span>
            <span>${date}</span>
          </div>
        </div>
      </div>
    `;
  }

  async function fetchAndRenderAI(ticker, company, edgarData, stockData) {
    const aiBody = document.getElementById('ai-panel-body');
    try {
      const { analysis } = await Utils.apiFetch('/api/anthropic-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          company,
          quarters: edgarData?.quarters,
          metrics: edgarData?.metrics,
          stockData,
          lang: typeof I18n !== 'undefined' ? I18n.getLang() : 'en',
        }),
      });

      aiBody.innerHTML = `<div class="ai-content">${Utils.renderMarkdown(analysis)}</div>`;
      aiBody.classList.add('open');
      document.getElementById('ai-chevron').classList.add('open');
    } catch (err) {
      const isNotReachable = err.message.includes('not reachable') || err.message.includes('Function not reachable');
      aiBody.innerHTML = `
        <div class="alert alert-error">
          AI analysis failed: ${Utils.escHtml(err.message)}
          ${isNotReachable ? '<br><br><strong>Fix:</strong> Go to Netlify → Site → Deploys → Trigger deploy. Env vars only apply after a fresh deploy.' : ''}
        </div>
        <div class="ai-disclaimer">⚠️ This is data interpretation only, not financial advice.</div>
      `;
      aiBody.classList.add('open');
      document.getElementById('ai-chevron').classList.add('open');
    }
  }

  // ================================================================
  // Supabase — history logging + private notes
  // ================================================================

  async function logHistory(ticker, companyName, stockData) {
    if (!SM.user) return;
    try {
      const metricsSnapshot = stockData ? {
        price: stockData.price,
        marketCap: stockData.marketCap,
        pe: stockData.pe,
        changePercent: stockData.changePercent,
      } : null;

      await SM.supabase.from('research_history').insert({
        user_id: SM.user.id,
        ticker,
        company_name: companyName,
        metrics_snapshot: metricsSnapshot,
      });
    } catch { /* non-critical */ }
  }

  async function loadPrivateNotes(ticker) {
    if (!SM.user) return;
    const el = document.getElementById('notes-list');

    const { data: notes } = await SM.supabase
      .from('private_notes')
      .select('*')
      .eq('user_id', SM.user.id)
      .eq('ticker', ticker)
      .order('created_at', { ascending: false });

    if (!notes || notes.length === 0) {
      el.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim)">No private notes for this ticker yet.</div>';
      return;
    }

    el.innerHTML = notes.map(n => `
      <div class="note-item" data-note-id="${n.id}">
        <div class="note-meta">
          <span class="note-private-badge">🔒 Private</span>
          <span>${Utils.fmtRelative(n.created_at)}</span>
        </div>
        <div class="note-content">${Utils.escHtml(n.content)}</div>
        <div style="margin-top:8px">
          <button class="btn btn-ghost btn-sm delete-note-btn" data-id="${n.id}">Delete</button>
        </div>
      </div>
    `).join('');

    el.querySelectorAll('.delete-note-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await SM.supabase.from('private_notes').delete().eq('id', btn.dataset.id);
        loadPrivateNotes(ticker);
      });
    });
  }

  async function savePrivateNote(ticker) {
    const content = document.getElementById('note-content').value.trim();
    if (!content) return;

    const { error } = await SM.supabase.from('private_notes').insert({
      user_id: SM.user.id,
      ticker,
      content,
    });

    if (!error) {
      document.getElementById('note-content').value = '';
      document.getElementById('note-form').style.display = 'none';
      loadPrivateNotes(ticker);
    }
  }

  async function shareToForum(ticker) {
    const content = document.getElementById('forum-content').value.trim();
    if (!content) return;

    const activeTypeBtn = document.querySelector('.type-select.active');
    const postType = activeTypeBtn ? activeTypeBtn.dataset.type : 'Analysis Share';

    const { error } = await SM.supabase.from('forum_posts').insert({
      user_id: SM.user.id,
      post_type: postType,
      content,
      ticker_tag: ticker,
    });

    if (!error) {
      document.getElementById('forum-content').value = '';
      document.getElementById('forum-form').style.display = 'none';
      window.location.href = '/forum.html';
    }
  }

})();
