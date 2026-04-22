// ================================================================
// Dashboard Page
// ================================================================

(async () => {
  await requireAuth();
  let _processing = false;
  I18n.init();
  setTimeout(() => document.getElementById('ticker-input')?.focus(), 50);

  // ---- Search ----
  const tickerInput = document.getElementById('ticker-input');
  const searchBtn   = document.getElementById('search-btn');

  searchBtn.addEventListener('click', doSearch);
  tickerInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  function doSearch() {
    const t = Utils.normalizeTicker(tickerInput.value);
    if (!t) return;
    window.location.href = `/research.html?ticker=${encodeURIComponent(t)}`;
  }

  // ---- Queue submit ----
  document.getElementById('queue-submit-btn').addEventListener('click', submitToQueue);
  document.getElementById('queue-ticker-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitToQueue(); });

  // ---- Load all data in parallel ----
  const [historyRes, postsRes, membersRes] = await Promise.allSettled([
    loadHistory(),
    loadRecentPosts(),
    loadMembers(),
    loadApiUsage(),
    loadQueue(),
  ]);

  // Run auto-processor in background (uses spare daily API budget)
  autoProcess();

  // ---- History ----
  async function loadHistory() {
    const el = document.getElementById('history-grid');
    const countEl = document.getElementById('history-count');

    const { data, error } = await SM.supabase
      .from('research_history')
      .select('ticker, company_name, pulled_at, user_id, profiles(display_name, avatar_color)')
      .order('pulled_at', { ascending: false })
      .limit(60);

    if (error || !data || data.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">No research history yet. Search a ticker to start.</div>';
      return;
    }

    // Deduplicate: keep only the most recent pull per ticker
    const seen = new Set();
    const unique = data.filter(row => {
      if (seen.has(row.ticker)) return false;
      seen.add(row.ticker);
      return true;
    }).slice(0, 20);

    countEl.textContent = `${unique.length} unique tickers`;

    el.innerHTML = unique.map(row => `
      <div class="history-chip" onclick="window.location.href='/research.html?ticker=${encodeURIComponent(row.ticker)}'">
        <div class="h-ticker">$${Utils.escHtml(row.ticker)}</div>
        <div class="h-company">${Utils.escHtml(row.company_name || '—')}</div>
        <div class="h-meta">
          ${Utils.fmtRelative(row.pulled_at)}
          · ${Utils.escHtml(row.profiles?.display_name || '?')}
        </div>
      </div>
    `).join('');
  }

  // ---- Recent Forum Posts ----
  async function loadRecentPosts() {
    const el = document.getElementById('recent-posts');

    const { data, error } = await SM.supabase
      .from('forum_posts')
      .select('id, post_type, content, ticker_tag, created_at, profiles(display_name, avatar_color)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !data || data.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">No forum posts yet.</div>';
      return;
    }

    const typeColors = {
      'Analysis Share':    'var(--green)',
      'Watchlist Add':     'var(--amber)',
      'General Discussion':'var(--blue)',
    };

    el.innerHTML = data.map(p => {
      const color = typeColors[p.post_type] || 'var(--text-muted)';
      const initial = Utils.avatarInitial(p.profiles?.display_name);
      const avatarColor = p.profiles?.avatar_color || '#4A9EFF';
      const preview = (p.content || '').slice(0, 100);

      return `
        <div class="mini-post" onclick="window.location.href='/forum.html'">
          <div class="mp-header">
            <div class="nav-avatar" style="background:${avatarColor};color:#000;width:22px;height:22px;font-size:0.6rem">${initial}</div>
            <span style="font-size:0.78rem;font-weight:600">${Utils.escHtml(p.profiles?.display_name || '?')}</span>
            <span style="font-size:0.65rem;color:${color};font-weight:700;margin-left:2px">${Utils.escHtml(p.post_type)}</span>
            ${p.ticker_tag ? `<span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--green);font-weight:700">$${Utils.escHtml(p.ticker_tag)}</span>` : ''}
            <span style="font-size:0.68rem;color:var(--text-dim);margin-left:auto">${Utils.fmtRelative(p.created_at)}</span>
          </div>
          <div class="mp-preview">${Utils.escHtml(preview)}${p.content?.length > 100 ? '…' : ''}</div>
        </div>
      `;
    }).join('');
  }

  // ---- Members ----
  async function loadMembers() {
    const memberEl = document.getElementById('members-list');

    const { data, error } = await SM.supabase
      .from('profiles')
      .select('id, display_name, bio, avatar_color')
      .order('created_at', { ascending: true });

    if (error || !data) {
      memberEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">Could not load members.</div>';
      return;
    }

    memberEl.innerHTML = data.map(p => `
      <div class="member-row">
        <div class="nav-avatar" style="background:${p.avatar_color};color:#000;width:32px;height:32px;font-size:0.75rem">
          ${Utils.avatarInitial(p.display_name)}
        </div>
        <div class="info">
          <div class="name">${Utils.escHtml(p.display_name)}</div>
          ${p.bio ? `<div class="bio">${Utils.escHtml(p.bio.slice(0, 60))}</div>` : ''}
        </div>
      </div>
    `).join('');

    // Top tickers
    loadTopTickers();
  }

  async function loadTopTickers() {
    const el = document.getElementById('top-tickers');

    // Get this month's history
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data } = await SM.supabase
      .from('research_history')
      .select('ticker, company_name, profiles(display_name)')
      .gte('pulled_at', startOfMonth.toISOString())
      .order('pulled_at', { ascending: false });

    if (!data || data.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.78rem">No research this month yet.</div>';
      return;
    }

    // Count frequency
    const counts = {};
    const names = {};
    data.forEach(row => {
      counts[row.ticker] = (counts[row.ticker] || 0) + 1;
      names[row.ticker] = row.company_name;
    });

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px">
        ${sorted.map(([ticker, count]) => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.78rem">
            <span
              style="font-family:var(--font-mono);font-weight:700;color:var(--green);cursor:pointer"
              onclick="window.location.href='/research.html?ticker=${encodeURIComponent(ticker)}'"
            >$${Utils.escHtml(ticker)}</span>
            <span style="color:var(--text-dim);font-family:var(--font-mono)">${count}x</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ================================================================
  // API Usage
  // ================================================================

  async function loadApiUsage() {
    const el = document.getElementById('api-usage-wrap');
    const today = new Date().toISOString().split('T')[0];

    const { data } = await SM.supabase
      .from('api_usage_log')
      .select('calls_consumed')
      .gte('called_at', `${today}T00:00:00Z`);

    const used = (data || []).reduce((sum, r) => sum + r.calls_consumed, 0);

    el.innerHTML = `
      <div style="font-size:0.78rem;color:var(--text-muted)">
        Today: ${used} request${used !== 1 ? 's' : ''} across all providers.
      </div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:4px">
        Resets midnight UTC
      </div>
    `;
  }

  // ================================================================
  // Queue
  // ================================================================

  async function loadQueue() {
    const el = document.getElementById('queue-list');
    const countEl = document.getElementById('queue-count');

    const { data } = await SM.supabase
      .from('ticker_queue')
      .select('*, profiles(display_name)')
      .order('submitted_at', { ascending: false })
      .limit(40);

    if (!data || data.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:4px 0">Queue is empty — submit a ticker above.</div>';
      countEl.textContent = '';
      return;
    }

    const pending = data.filter(r => r.status === 'pending' || r.status === 'processing').length;
    const done = data.filter(r => r.status === 'done').length;
    countEl.textContent = `${pending} pending · ${done} done`;

    const dotColor = { pending: 'var(--amber)', processing: 'var(--blue)', done: 'var(--green)', failed: 'var(--red)' };

    el.innerHTML = data.map(item => {
      const isOwn = SM.user && item.submitted_by === SM.user.id;
      const isDone = item.status === 'done';
      const color = dotColor[item.status] || 'var(--text-muted)';

      return `
        <div class="queue-item${isDone ? ' queue-done-link' : ''}"
             ${isDone ? `onclick="window.location.href='/research.html?ticker=${encodeURIComponent(item.ticker)}'"` : ''}>
          <div class="queue-status-dot" style="background:${color}"></div>
          <div class="queue-item-body">
            <div class="queue-ticker">$${Utils.escHtml(item.ticker)}
              <span style="font-family:var(--font-sans);font-weight:400;font-size:0.67rem;color:var(--text-dim);margin-left:6px">${item.status}</span>
              ${isDone ? '<span style="font-size:0.67rem;color:var(--green);margin-left:4px">· tap to view</span>' : ''}
            </div>
            ${item.notes ? `<div class="queue-notes">${Utils.escHtml(item.notes)}</div>` : ''}
            <div class="queue-meta">
              ${Utils.escHtml(item.profiles?.display_name || '?')} · ${Utils.fmtRelative(item.submitted_at)}
              ${item.error_msg ? `<span style="color:var(--red)"> · ${Utils.escHtml(item.error_msg.slice(0, 80))}</span>` : ''}
            </div>
          </div>
          ${isOwn && (item.status === 'pending') ? `
            <button class="btn btn-ghost btn-sm queue-del-btn" data-id="${item.id}"
                    style="padding:2px 8px;font-size:0.7rem;flex-shrink:0" onclick="event.stopPropagation()">✕</button>
          ` : ''}
        </div>
      `;
    }).join('');

    el.querySelectorAll('.queue-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await SM.supabase.from('ticker_queue').delete().eq('id', btn.dataset.id);
        loadQueue();
      });
    });
  }

  async function submitToQueue() {
    const ticker = Utils.normalizeTicker(document.getElementById('queue-ticker-input').value);
    const notes = document.getElementById('queue-notes-input').value.trim();
    if (!ticker) return;

    const btn = document.getElementById('queue-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    const { error } = await SM.supabase.from('ticker_queue').insert({
      ticker,
      notes: notes || null,
      submitted_by: SM.user.id,
      status: 'pending',
    });

    btn.disabled = false;
    btn.textContent = 'Add to Queue';

    if (!error) {
      document.getElementById('queue-ticker-input').value = '';
      document.getElementById('queue-notes-input').value = '';
      loadQueue();
    }
  }

  // ================================================================
  // Auto-processor — runs on page load, uses spare daily API budget
  // ================================================================

  async function autoProcess() {
    // Throttle: skip if ran within last 10 minutes
    const lastRun = parseInt(localStorage.getItem('sm_autoprocess_last') || '0');
    if (Date.now() - lastRun < 10 * 60 * 1000) return;

    if (_processing) return;
    _processing = true;

    try {
      // Early exit if no pending items
      const { count } = await SM.supabase
        .from('ticker_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!count || count === 0) { _processing = false; return; }

      const today = new Date().toISOString().split('T')[0];
      const { data: usageRows } = await SM.supabase
        .from('api_usage_log')
        .select('calls_consumed')
        .gte('called_at', `${today}T00:00:00Z`);

      const callsUsed = (usageRows || []).reduce((sum, r) => sum + r.calls_consumed, 0);
      const canProcess = Math.floor((25 - callsUsed) / 3);
      if (canProcess <= 0) return;

      const { data: pending } = await SM.supabase
        .from('ticker_queue')
        .select('*')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true })
        .limit(canProcess);

      if (!pending || pending.length === 0) return;

      const toast = document.getElementById('queue-process-toast');
      const toastMsg = document.getElementById('queue-process-msg');
      toast.style.display = 'flex';

      for (const item of pending) {
        toastMsg.textContent = `Processing $${item.ticker}…`;

        try {
          await SM.supabase.from('ticker_queue').update({ status: 'processing' }).eq('id', item.id);

          // Stock data (2 AV calls)
          let stockData = null;
          try {
            stockData = await Utils.apiFetch(`/api/stock-data?ticker=${item.ticker}`);
            await SM.supabase.from('api_usage_log').insert({ ticker: item.ticker, calls_consumed: 2 });
          } catch { /* optional */ }

          // SEC EDGAR (free)
          let edgarData = null;
          try { edgarData = await Utils.apiFetch(`/api/sec-edgar?ticker=${item.ticker}`); } catch { /* optional */ }

          // News (1 AV call)
          let newsData = null;
          try {
            newsData = await Utils.apiFetch(`/api/news-fetch?ticker=${item.ticker}`);
            await SM.supabase.from('api_usage_log').insert({ ticker: item.ticker, calls_consumed: 1 });
          } catch { /* optional */ }

          const companyName = edgarData?.company || stockData?.name || item.ticker;

          // AI analysis (free — Anthropic)
          let aiAnalysis = null;
          try {
            const r = await Utils.apiFetch('/api/anthropic-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ticker: item.ticker, company: companyName, quarters: edgarData?.quarters, metrics: edgarData?.metrics, stockData, lang: I18n.getLang() }),
            });
            aiAnalysis = r.analysis;
          } catch { /* optional */ }

          // Save snapshot
          await SM.supabase.from('ticker_snapshots').upsert({
            ticker: item.ticker, company_name: companyName,
            stock_data: stockData, financial_data: edgarData,
            ai_analysis: aiAnalysis, news_data: newsData,
            snapped_at: new Date().toISOString(), snapped_by: SM.user.id,
          }, { onConflict: 'ticker' });

          // Log to shared research history
          try {
            await SM.supabase.from('research_history').insert({
              user_id: SM.user.id, ticker: item.ticker, company_name: companyName,
              metrics_snapshot: stockData ? { price: stockData.price, marketCap: stockData.marketCap, pe: stockData.pe, changePercent: stockData.changePercent } : null,
            });
          } catch { /* non-critical */ }

          await SM.supabase.from('ticker_queue').update({ status: 'done', processed_at: new Date().toISOString(), error_msg: null }).eq('id', item.id);

        } catch (err) {
          await SM.supabase.from('ticker_queue').update({ status: 'failed', error_msg: err.message?.slice(0, 200) }).eq('id', item.id);
        }
      }

      toast.style.display = 'none';
      await Promise.all([loadApiUsage(), loadQueue(), loadHistory()]);
      localStorage.setItem('sm_autoprocess_last', String(Date.now()));
    } finally {
      _processing = false;
    }
  }

})();
