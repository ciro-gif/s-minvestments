// ================================================================
// Profile Page — edit profile, research history, private notes
// ================================================================

(async () => {
  await requireAuth();

  // ---- Tab switching ----
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

      // Lazy load tab content
      if (btn.dataset.tab === 'history' && !historyLoaded) loadHistory();
      if (btn.dataset.tab === 'notes' && !notesLoaded) loadNotes();
    });
  });

  let historyLoaded = false;
  let notesLoaded = false;

  // ---- Render profile card ----
  function renderProfileCard(profile) {
    const avatarEl = document.getElementById('profile-avatar-big');
    avatarEl.textContent = Utils.avatarInitial(profile.display_name);
    avatarEl.style.background = profile.avatar_color;
    avatarEl.style.color = '#000';

    document.getElementById('profile-name-display').textContent = profile.display_name || 'Member';
    document.getElementById('profile-bio-display').textContent = profile.bio || 'No bio yet.';

    // Pre-fill edit form
    document.getElementById('edit-name').value = profile.display_name || '';
    document.getElementById('edit-bio').value = profile.bio || '';
  }

  if (SM.profile) renderProfileCard(SM.profile);

  // Load stats
  loadStats();

  async function loadStats() {
    const [histCount, postCount, noteCount] = await Promise.all([
      SM.supabase.from('research_history').select('id', { count: 'exact', head: true }).eq('user_id', SM.user.id),
      SM.supabase.from('forum_posts').select('id', { count: 'exact', head: true }).eq('user_id', SM.user.id),
      SM.supabase.from('private_notes').select('id', { count: 'exact', head: true }).eq('user_id', SM.user.id),
    ]);

    document.getElementById('stat-researched').textContent = histCount.count ?? '—';
    document.getElementById('stat-posts').textContent = postCount.count ?? '—';
    document.getElementById('stat-notes').textContent = noteCount.count ?? '—';
  }

  // ---- Edit profile form ----
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('profile-msg');
    const name = document.getElementById('edit-name').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();

    if (!name) { msgEl.innerHTML = '<div class="alert alert-error">Display name required.</div>'; return; }

    const { error } = await SM.supabase
      .from('profiles')
      .update({ display_name: name, bio, updated_at: new Date().toISOString() })
      .eq('id', SM.user.id);

    if (error) {
      msgEl.innerHTML = `<div class="alert alert-error">${Utils.escHtml(error.message)}</div>`;
    } else {
      msgEl.innerHTML = '<div class="alert alert-success">Profile updated!</div>';
      SM.profile = { ...SM.profile, display_name: name, bio };
      renderProfileCard(SM.profile);
      // Update nav
      document.getElementById('nav-username').textContent = name;
      document.getElementById('nav-avatar').textContent = Utils.avatarInitial(name);
      setTimeout(() => { msgEl.innerHTML = ''; }, 3000);
    }
  });

  // ---- Research History ----
  async function loadHistory() {
    historyLoaded = true;
    const el = document.getElementById('history-content');
    const countEl = document.getElementById('history-count');

    const { data, error } = await SM.supabase
      .from('research_history')
      .select('ticker, company_name, pulled_at, metrics_snapshot')
      .eq('user_id', SM.user.id)
      .order('pulled_at', { ascending: false })
      .limit(100);

    if (error || !data || data.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">No research history yet.</div>';
      return;
    }

    countEl.textContent = `${data.length} pulls`;

    el.innerHTML = `
      <div style="overflow-x:auto">
        <table class="history-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Company</th>
              <th>Date</th>
              <th>Price</th>
              <th>Market Cap</th>
              <th>P/E</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(row => {
              const snap = row.metrics_snapshot || {};
              return `
                <tr>
                  <td><span class="history-ticker" onclick="window.location.href='/research.html?ticker=${encodeURIComponent(row.ticker)}'">$${Utils.escHtml(row.ticker)}</span></td>
                  <td style="color:var(--text-muted)">${Utils.escHtml(row.company_name || '—')}</td>
                  <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-muted)">${Utils.fmtDate(row.pulled_at)}</td>
                  <td style="font-family:var(--font-mono)">${snap.price ? `$${parseFloat(snap.price).toFixed(2)}` : '—'}</td>
                  <td style="font-family:var(--font-mono)">${snap.marketCap ? Utils.fmtMoney(Number(snap.marketCap)) : '—'}</td>
                  <td style="font-family:var(--font-mono)">${snap.pe || '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---- Private Notes ----
  document.getElementById('new-note-btn').addEventListener('click', () => {
    const form = document.getElementById('new-note-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('note-cancel').addEventListener('click', () => {
    document.getElementById('new-note-form').style.display = 'none';
  });

  document.getElementById('note-save').addEventListener('click', async () => {
    const content = document.getElementById('new-note-content').value.trim();
    const ticker  = Utils.normalizeTicker(document.getElementById('new-note-ticker').value);

    if (!content) return;

    const { error } = await SM.supabase.from('private_notes').insert({
      user_id: SM.user.id,
      ticker: ticker || null,
      content,
    });

    if (!error) {
      document.getElementById('new-note-content').value = '';
      document.getElementById('new-note-ticker').value = '';
      document.getElementById('new-note-form').style.display = 'none';
      loadNotes();
    }
  });

  async function loadNotes() {
    notesLoaded = true;
    const el = document.getElementById('notes-grid');

    const { data, error } = await SM.supabase
      .from('private_notes')
      .select('*')
      .eq('user_id', SM.user.id)
      .order('updated_at', { ascending: false });

    if (error || !data || data.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem">No private notes yet.</div>';
      return;
    }

    el.innerHTML = data.map(note => `
      <div class="note-card" id="note-card-${note.id}">
        <div class="note-card-header">
          <div>
            ${note.ticker ? `<span class="note-card-ticker">$${Utils.escHtml(note.ticker)}</span>` : '<span style="color:var(--text-muted);font-size:0.78rem">General Note</span>'}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:0.65rem;color:var(--amber)">🔒 Private</span>
            <span class="note-card-date">${Utils.fmtDate(note.updated_at)}</span>
          </div>
        </div>
        <div class="note-card-content" id="note-content-${note.id}">${Utils.escHtml(note.content)}</div>
        <div class="note-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="editNote('${note.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteNote('${note.id}')">Delete</button>
          ${note.ticker ? `<button class="btn btn-ghost btn-sm" onclick="window.location.href='/research.html?ticker=${encodeURIComponent(note.ticker)}'">View $${Utils.escHtml(note.ticker)}</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  window.deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    await SM.supabase.from('private_notes').delete().eq('id', id);
    loadNotes();
  };

  window.editNote = (id) => {
    const card = document.getElementById(`note-card-${id}`);
    const contentEl = document.getElementById(`note-content-${id}`);
    const currentText = contentEl.textContent;

    contentEl.innerHTML = `
      <textarea class="textarea" id="edit-content-${id}" style="min-height:80px">${Utils.escHtml(currentText)}</textarea>
      <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="cancelEdit('${id}', \`${currentText.replace(/`/g, '\\`')}\`)">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="saveEdit('${id}')">Save</button>
      </div>
    `;
  };

  window.cancelEdit = (id, originalText) => {
    const contentEl = document.getElementById(`note-content-${id}`);
    contentEl.innerHTML = Utils.escHtml(originalText);
    contentEl.className = 'note-card-content';
  };

  window.saveEdit = async (id) => {
    const newContent = document.getElementById(`edit-content-${id}`).value.trim();
    if (!newContent) return;

    const { error } = await SM.supabase
      .from('private_notes')
      .update({ content: newContent, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) loadNotes();
  };

})();
