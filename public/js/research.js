// ================================================================
// Research Page — orchestrates all data fetching and rendering
// ================================================================

(async () => {
  await requireAuth();
  I18n.init();

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
    const [stockResult, edgarResult] = await Promise.allSettled([
      fetchStockData(ticker),
      fetchEdgarData(ticker),
    ]);

    const stockData = stockResult.status === 'fulfilled' ? stockResult.value : null;
    const edgarData = edgarResult.status === 'fulfilled' ? edgarResult.value : null;

    // Log Alpha Vantage usage (stock-data = 2 calls)
    if (stockData && SM.user) {
      SM.supabase.from('api_usage_log').insert({ ticker, calls_consumed: 2 }).then(() => {});
    }

    // Render company name
    const companyName = edgarData?.company || stockData?.name || ticker;
    document.getElementById('r-company').textContent = companyName;
    document.title = `$${ticker} — S&M Investments`;

    // Render sections
    renderSnapshot(stockData, ticker);
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
    if (snap.ai_analysis) {
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
    } else {
      aiBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:12px">No AI analysis cached.</div>';
    }
  }

  function resetToLoading() {
    document.getElementById('snapshot-card').innerHTML =
      '<div class="loading-block"><div class="spinner"></div> Loading market data…</div>';
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
    const data = await Utils.apiFetch(`/api/stock-data?ticker=${encodeURIComponent(ticker)}`);
    return data;
  }

  async function fetchEdgarData(ticker) {
    const data = await Utils.apiFetch(`/api/sec-edgar?ticker=${encodeURIComponent(ticker)}`);
    return data;
  }

  // ================================================================
  // Renderers
  // ================================================================

  function renderSnapshot(d, ticker) {
    const el = document.getElementById('snapshot-card');
    if (!d) {
      el.innerHTML = `<div class="alert alert-warning">Market data unavailable for ${ticker}. Check your Alpha Vantage API key.</div>`;
      return;
    }

    const changeVal = parseFloat(d.change) || 0;
    const changeSign = changeVal >= 0 ? '+' : '';
    const changeCls = changeVal >= 0 ? 'pos' : 'neg';
    const price = d.price ? `$${parseFloat(d.price).toFixed(2)}` : '—';
    const mktCap = d.marketCap ? Utils.fmtMoney(Number(d.marketCap)) : '—';

    const grid = [
      ['Market Cap',      mktCap],
      ['52W High',        d.fiftyTwoWeekHigh ? `$${parseFloat(d.fiftyTwoWeekHigh).toFixed(2)}` : '—'],
      ['52W Low',         d.fiftyTwoWeekLow  ? `$${parseFloat(d.fiftyTwoWeekLow).toFixed(2)}`  : '—'],
      ['P/E Ratio',       d.pe || '—'],
      ['EPS',             d.eps ? `$${parseFloat(d.eps).toFixed(2)}` : '—'],
      ['Dividend Yield',  d.dividendYield ? Utils.fmtPct(parseFloat(d.dividendYield)/100) : '—'],
      ['Beta',            d.beta ? parseFloat(d.beta).toFixed(2) : '—'],
      ['Avg Volume',      d.avgVolume ? Utils.fmtMoneyShort(Number(d.avgVolume)) : '—'],
      ['Float',           d.sharesFloat ? Utils.fmtMoney(Number(d.sharesFloat)) : '—'],
      ['Short Float %',   d.shortPercentFloat ? Utils.fmtPct(parseFloat(d.shortPercentFloat)/100) : '—'],
      ['Next Earnings',   d.nextEarnings ? Utils.fmtDate(d.nextEarnings) : '—'],
      ['Analyst Target',  d.analystTarget ? `$${parseFloat(d.analystTarget).toFixed(2)}` : '—'],
    ];

    el.innerHTML = `
      <div class="snapshot-sector">
        ${d.sector ? `<span class="tag tag-blue">${Utils.escHtml(d.sector)}</span>` : ''}
        ${d.industry ? `<span class="tag" style="background:var(--surface3);color:var(--text-muted);border:1px solid var(--border2)">${Utils.escHtml(d.industry)}</span>` : ''}
      </div>
      <div class="snapshot-price-row">
        <div class="snapshot-price">${price}</div>
        <div class="snapshot-change ${changeCls}">
          ${changeSign}${changeVal.toFixed(2)} (${d.changePercent || '—'})
        </div>
      </div>
      <div class="snapshot-grid">
        ${grid.map(([label, val]) => `
          <div class="snapshot-item">
            <div class="label">${label}</div>
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

  function renderFinTable(d) {
    const el = document.getElementById('fin-table-wrap');
    if (!d || !d.quarters || d.quarters.length === 0) {
      el.innerHTML = `<div class="alert alert-warning" style="margin:16px">SEC EDGAR data unavailable or no quarterly filings found.</div>`;
      return;
    }

    const { quarters, metrics } = d;
    const m = metrics;

    // Calculate derived rows
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
          { label: 'R&D',                 key: 'researchAndDevelopment', vals: m.researchAndDevelopment },
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

    const thCells = quarters.map(q =>
      `<th>${Utils.escHtml(q)}</th>`
    ).join('');

    let tableHTML = `
      <table class="fin-table">
        <thead>
          <tr>
            <th>Metric</th>
            ${thCells}
          </tr>
        </thead>
        <tbody>
    `;

    for (const section of sections) {
      // Check if section has any data at all
      const hasData = section.rows.some(r => r.vals && r.vals.some(v => v !== null));
      if (!hasData) continue;

      tableHTML += `
        <tr class="section-header">
          <td colspan="${quarters.length + 1}">${section.label}</td>
        </tr>
      `;

      for (const row of section.rows) {
        if (!row.vals || row.vals.every(v => v === null)) continue;

        const cells = quarters.map((_, i) => {
          const val = row.vals ? row.vals[i] : null;
          return renderCell(val, row);
        }).join('');

        const rowCls = [
          'metric-row',
          row.bold ? 'bold-row' : '',
          row.calc ? 'calc-row' : '',
        ].filter(Boolean).join(' ');

        tableHTML += `
          <tr class="${rowCls}">
            <td>${Utils.escHtml(row.label)}</td>
            ${cells}
          </tr>
        `;
      }
    }

    tableHTML += `</tbody></table>`;
    el.innerHTML = tableHTML;
  }

  function renderCell(val, row) {
    if (val === null || val === undefined) {
      return `<td class="null-val">—</td>`;
    }

    let text;
    let colorStyle = '';

    if (row.eps) {
      text = `$${parseFloat(val).toFixed(2)}`;
      colorStyle = val >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    } else if (row.pct) {
      text = `${(val * 100).toFixed(1)}%`;
      colorStyle = val >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    } else if (row.shares) {
      text = `${(val / 1e6).toFixed(1)}M`;
      colorStyle = '';
    } else {
      // Money value in thousands display
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

    const { quarters, metrics: m } = d;

    const cards = [
      { label: 'Revenue',           key: 'totalRevenue',     vals: m.totalRevenue,     color: '#00C48C', format: 'money' },
      { label: 'Gross Margin',      key: 'grossMarginPct',   vals: calcPctOf(m.grossProfit, m.totalRevenue), color: '#4A9EFF', format: 'pct' },
      { label: 'Net Income',        key: 'netIncome',        vals: m.netIncome,         color: '#A78BFA', format: 'money' },
      { label: 'EPS (Diluted)',     key: 'epsDiluted',       vals: m.epsDiluted,        color: '#F5A623', format: 'eps' },
      { label: 'Operating Expenses',key: 'operatingExpenses',vals: m.operatingExpenses, color: '#FF4D4D', format: 'money' },
      { label: 'R&D Spend',        key: 'researchAndDevelopment', vals: m.researchAndDevelopment, color: '#4A9EFF', format: 'money' },
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
        const delta = card.format === 'pct'
          ? ((latest - prev) * 100).toFixed(1) + 'pp'
          : Utils.fmtMoneyShort(latest - prev);
        const sign = latest >= prev ? '+' : '';
        const cls = latest >= prev ? 'pos' : 'neg';
        change = `<div class="metric-change ${cls}">${sign}${delta} QoQ</div>`;
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
      // Alpha Vantage NEWS_SENTIMENT returns articles with sentiment pre-scored
      const { articles } = await Utils.apiFetch(
        `/api/news-fetch?ticker=${encodeURIComponent(ticker)}`
      );

      if (!articles || articles.length === 0) {
        newsEl.innerHTML = `<div class="alert alert-info">No recent news found for ${ticker}. Alpha Vantage may not have news coverage for this ticker.</div>`;
        return;
      }

      // Log Alpha Vantage usage (news-fetch = 1 call)
      if (SM.user) SM.supabase.from('api_usage_log').insert({ ticker, calls_consumed: 1 }).then(() => {});

      // Sentiment already attached from Alpha Vantage — render immediately
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

      aiBody.innerHTML = `
        <div class="ai-content">${Utils.renderMarkdown(analysis)}</div>
      `;

      // Auto-open the panel when analysis is ready
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

      // Upsert-style: insert new row each time (history log, not deduplicated)
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
        const id = btn.dataset.id;
        await SM.supabase.from('private_notes').delete().eq('id', id);
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
