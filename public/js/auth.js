// ================================================================
// Auth utilities — require auth, render nav, handle logout
// ================================================================

async function requireAuth() {
  const { data: { session } } = await SM.supabase.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }
  SM.user = session.user;

  // Load profile
  const { data: profile } = await SM.supabase
    .from('profiles')
    .select('*')
    .eq('id', SM.user.id)
    .single();

  SM.profile = profile;
  renderNav(profile);
  return profile;
}

function renderNav(profile) {
  const avatarEl = document.getElementById('nav-avatar');
  const usernameEl = document.getElementById('nav-username');
  const logoutBtn = document.getElementById('logout-btn');

  if (avatarEl && profile) {
    const initial = (profile.display_name || '?')[0].toUpperCase();
    avatarEl.textContent = initial;
    avatarEl.style.background = profile.avatar_color || '#4A9EFF';
    avatarEl.style.color = '#000';
  }

  if (usernameEl && profile) {
    usernameEl.textContent = profile.display_name || 'Member';
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await SM.supabase.auth.signOut();
      window.location.href = '/index.html';
    });
  }
}

// Initialize auth on every protected page
(async () => {
  // Only run on protected pages (not login page)
  if (window.location.pathname === '/index.html' || window.location.pathname === '/') return;
  await requireAuth();
})();
