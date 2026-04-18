// ================================================================
// Dashboard Page
// ================================================================

(async () => {
  await requireAuth();

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

  // ---- Load all data in parallel ----
  const [historyRes, postsRes, membersRes] = await Promise.allSettled([
    loadHistory(),
    loadRecentPosts(),
    loadMembers(),
  ]);

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

})();
