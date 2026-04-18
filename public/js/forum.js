// ================================================================
// Forum Page — posts, replies, private notes sidebar, image uploads
// ================================================================

(async () => {
  await requireAuth();

  let currentFilter = 'all';
  let uploadedImageUrl = null;
  let currentPostType = 'Analysis Share';

  // ---- Type tabs ----
  document.querySelectorAll('.type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPostType = btn.dataset.type;
    });
  });

  // ---- Filter buttons ----
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      loadPosts();
    });
  });

  // ---- Image upload ----
  const imgInput = document.getElementById('img-upload-input');
  const imgPreviewWrap = document.getElementById('img-preview-wrap');
  const imgPreview = document.getElementById('img-preview');
  const imgRemove = document.getElementById('img-remove');

  imgInput.addEventListener('change', async () => {
    const file = imgInput.files[0];
    if (!file) return;

    // Show local preview immediately
    imgPreview.src = URL.createObjectURL(file);
    imgPreviewWrap.style.display = 'block';

    // Upload to Supabase Storage
    try {
      const ext = file.name.split('.').pop();
      const path = `${SM.user.id}/${Date.now()}.${ext}`;
      const { data, error } = await SM.supabase.storage
        .from('forum-images')
        .upload(path, file, { contentType: file.type });

      if (error) throw error;

      const { data: urlData } = SM.supabase.storage
        .from('forum-images')
        .getPublicUrl(path);

      uploadedImageUrl = urlData.publicUrl;
    } catch (err) {
      document.getElementById('composer-error').textContent = `Image upload failed: ${err.message}`;
      imgPreviewWrap.style.display = 'none';
      uploadedImageUrl = null;
    }
  });

  imgRemove.addEventListener('click', () => {
    imgInput.value = '';
    imgPreview.src = '';
    imgPreviewWrap.style.display = 'none';
    uploadedImageUrl = null;
  });

  // ---- Post submission ----
  document.getElementById('post-submit').addEventListener('click', async () => {
    const content = document.getElementById('post-content').value.trim();
    const ticker = Utils.normalizeTicker(document.getElementById('post-ticker').value);
    const errEl = document.getElementById('composer-error');

    if (!content) { errEl.textContent = 'Post content cannot be empty.'; return; }
    errEl.textContent = '';

    const btn = document.getElementById('post-submit');
    btn.disabled = true;
    btn.textContent = 'Posting…';

    const { error } = await SM.supabase.from('forum_posts').insert({
      user_id: SM.user.id,
      post_type: currentPostType,
      content,
      image_url: uploadedImageUrl || null,
      ticker_tag: ticker || null,
    });

    btn.disabled = false;
    btn.textContent = 'Post';

    if (error) {
      errEl.textContent = error.message;
      return;
    }

    // Reset form
    document.getElementById('post-content').value = '';
    document.getElementById('post-ticker').value = '';
    uploadedImageUrl = null;
    imgPreviewWrap.style.display = 'none';
    imgInput.value = '';

    loadPosts();
  });

  // ---- Load posts ----
  async function loadPosts() {
    const el = document.getElementById('posts-list');
    el.innerHTML = '<div class="loading-block"><div class="spinner"></div></div>';

    let query = SM.supabase
      .from('forum_posts')
      .select('*, profiles(id, display_name, avatar_color)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (currentFilter !== 'all') {
      query = query.eq('post_type', currentFilter);
    }

    const { data: posts, error } = await query;

    if (error) {
      el.innerHTML = `<div class="alert alert-error">${Utils.escHtml(error.message)}</div>`;
      return;
    }

    if (!posts || posts.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:20px 0">No posts yet. Be the first!</div>';
      return;
    }

    el.innerHTML = posts.map(post => renderPost(post)).join('');

    // Attach reply toggle listeners
    el.querySelectorAll('.reply-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const postId = btn.dataset.postId;
        const repliesSection = document.getElementById(`replies-${postId}`);
        if (repliesSection) {
          const isOpen = repliesSection.classList.toggle('open');
          if (isOpen) loadReplies(postId);
        }
      });
    });

    // Attach delete listeners
    el.querySelectorAll('.post-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this post?')) return;
        await SM.supabase.from('forum_posts').delete().eq('id', btn.dataset.id);
        loadPosts();
      });
    });

    // Attach reply submit listeners
    el.querySelectorAll('.reply-submit-btn').forEach(btn => {
      btn.addEventListener('click', () => submitReply(btn.dataset.postId));
    });
  }

  function renderPost(post) {
    const p = post.profiles || {};
    const avatarColor = p.avatar_color || '#4A9EFF';
    const initial = Utils.avatarInitial(p.display_name);
    const isOwn = SM.user?.id === post.user_id;

    return `
      <div class="post-card" id="post-${post.id}">
        <div class="post-header">
          <div class="post-avatar" style="background:${avatarColor};color:#000">${initial}</div>
          <div class="post-meta">
            <div class="post-author-row">
              <span class="post-author">${Utils.escHtml(p.display_name || 'Member')}</span>
              <span class="post-type-tag" data-type="${Utils.escHtml(post.post_type)}">${Utils.escHtml(post.post_type)}</span>
              ${post.ticker_tag ? `
                <span class="post-ticker-tag" onclick="window.location.href='/research.html?ticker=${encodeURIComponent(post.ticker_tag)}'">
                  $${Utils.escHtml(post.ticker_tag)}
                </span>
              ` : ''}
            </div>
            <div class="post-time">${Utils.fmtRelative(post.created_at)}</div>
          </div>
        </div>

        <div class="post-content">${Utils.escHtml(post.content)}</div>

        ${post.image_url ? `<img class="post-image" src="${Utils.escHtml(post.image_url)}" alt="Post image" loading="lazy">` : ''}

        <div class="post-footer">
          <button class="reply-toggle-btn" data-post-id="${post.id}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Reply
          </button>
          ${isOwn ? `<button class="post-delete-btn" data-id="${post.id}">Delete</button>` : ''}
        </div>

        <div class="replies-section" id="replies-${post.id}">
          <div class="reply-list" id="reply-list-${post.id}">
            <div class="loading-block" style="padding:8px 0"><div class="spinner"></div></div>
          </div>
          <div class="reply-composer">
            <textarea class="textarea" id="reply-input-${post.id}" placeholder="Write a reply…" rows="2"></textarea>
            <button class="btn btn-primary btn-sm reply-submit-btn" data-post-id="${post.id}">Reply</button>
          </div>
        </div>
      </div>
    `;
  }

  async function loadReplies(postId) {
    const el = document.getElementById(`reply-list-${postId}`);

    const { data: replies } = await SM.supabase
      .from('forum_replies')
      .select('*, profiles(display_name, avatar_color)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!replies || replies.length === 0) {
      el.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim);padding:4px 0">No replies yet.</div>';
      return;
    }

    el.innerHTML = replies.map(r => {
      const rp = r.profiles || {};
      const avatarColor = rp.avatar_color || '#4A9EFF';
      const initial = Utils.avatarInitial(rp.display_name);
      const isOwn = SM.user?.id === r.user_id;

      return `
        <div class="reply-item" id="reply-${r.id}">
          <div class="reply-avatar" style="background:${avatarColor};color:#000">${initial}</div>
          <div class="reply-body">
            <div class="reply-header">
              <span class="reply-author">${Utils.escHtml(rp.display_name || 'Member')}</span>
              <span class="reply-time">${Utils.fmtRelative(r.created_at)}</span>
              ${isOwn ? `<button onclick="deleteReply('${r.id}', '${postId}')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.7rem;margin-left:auto">Delete</button>` : ''}
            </div>
            <div class="reply-content">${Utils.escHtml(r.content)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  async function submitReply(postId) {
    const input = document.getElementById(`reply-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;

    const { error } = await SM.supabase.from('forum_replies').insert({
      post_id: postId,
      user_id: SM.user.id,
      content,
    });

    if (!error) {
      input.value = '';
      loadReplies(postId);
    }
  }

  // Expose deleteReply globally (called from inline onclick)
  window.deleteReply = async (replyId, postId) => {
    await SM.supabase.from('forum_replies').delete().eq('id', replyId);
    loadReplies(postId);
  };

  // ---- Sidebar ----
  async function loadSidebar() {
    // Members
    const { data: members } = await SM.supabase
      .from('profiles')
      .select('id, display_name, bio, avatar_color')
      .order('created_at', { ascending: true });

    const membersEl = document.getElementById('sidebar-members');
    if (members) {
      membersEl.innerHTML = members.map(m => `
        <div class="sidebar-member">
          <div class="nav-avatar" style="background:${m.avatar_color};color:#000;width:28px;height:28px;font-size:0.65rem">
            ${Utils.avatarInitial(m.display_name)}
          </div>
          <div class="member-info">
            <div class="member-name">${Utils.escHtml(m.display_name)}</div>
            ${m.bio ? `<div class="member-bio">${Utils.escHtml(m.bio.slice(0, 40))}</div>` : ''}
          </div>
        </div>
      `).join('');
    }

    // Recent tickers from history
    const { data: history } = await SM.supabase
      .from('research_history')
      .select('ticker, pulled_at, profiles(display_name)')
      .order('pulled_at', { ascending: false })
      .limit(20);

    const tickersEl = document.getElementById('sidebar-tickers');
    if (history && history.length > 0) {
      const seen = new Set();
      const unique = history.filter(h => {
        if (seen.has(h.ticker)) return false;
        seen.add(h.ticker);
        return true;
      }).slice(0, 8);

      tickersEl.innerHTML = unique.map(h => `
        <div class="sidebar-ticker-item">
          <span class="sidebar-ticker-sym" onclick="window.location.href='/research.html?ticker=${encodeURIComponent(h.ticker)}'">
            $${Utils.escHtml(h.ticker)}
          </span>
          <span class="sidebar-ticker-who">${Utils.escHtml(h.profiles?.display_name || '?')}</span>
        </div>
      `).join('');
    } else {
      tickersEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim)">No tickers yet.</div>';
    }
  }

  // ---- Initialize ----
  loadPosts();
  loadSidebar();

})();
