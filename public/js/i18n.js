// ================================================================
// Bilingual support — English / Spanish
// Usage: add data-i18n="key" to any element; I18n.init() on page load
// ================================================================

const _STRINGS = {
  en: {
    // Nav
    'nav.dashboard':  'Dashboard',
    'nav.research':   'Research',
    'nav.forum':      'Forum',
    'nav.education':  'Education',
    'nav.profile':    'Profile',
    'nav.logout':     'Logout',
    // Dashboard hero
    'dash.hero.title': 'Member Research Portal',
    'dash.hero.sub':   'Search any ticker to pull financials, AI analysis, and news.',
    'dash.search.btn': 'Research',
    // Dashboard sections
    'dash.history.title':  'Recently Researched',
    'dash.forum.title':    'Recent Forum Activity',
    'dash.forum.viewall':  'View all →',
    'dash.members.title':  'Members',
    'dash.toptickers':     'Top Tickers This Month',
    'dash.usage.title':    'Alpha Vantage API Usage',
    'dash.queue.title':    'Analysis Queue',
    'dash.queue.sub':      'Submit tickers here — the app automatically analyzes them using spare daily API calls, so results are ready before your next meeting.',
    'dash.queue.btn':      'Add to Queue',
    'dash.queue.empty':    'Queue is empty — submit a ticker above.',
    // Research page
    'research.snapshot':   'Company Snapshot',
    'research.finmodel':   'Quarterly Financial Model',
    'research.ainotes':    'AI Analyst Notes',
    'research.metrics':    'Key Metrics',
    'research.news':       'Recent News',
    'research.privnotes':  'Private Notes',
    'research.addnote':    '+ Private Note',
    'research.shareforum': 'Share to Forum',
    // Forum
    'forum.newpost':       'New Post',
    'forum.placeholder':   'Share your analysis, watchlist pick, or discussion…',
    'forum.tickertag':     '$TICKER (optional)',
    'forum.postbtn':       'Post',
    // Education
    'edu.hero.title':      'Education Hub',
    'edu.hero.sub':        'Learn the fundamentals of stocks, options, and how markets work.',
    'edu.coming':          'Content coming soon',
    // Common buttons
    'btn.save':            'Save',
    'btn.cancel':          'Cancel',
    'btn.refresh':         'Refresh live data',
    'loading':             'Loading…',
  },
  es: {
    // Nav
    'nav.dashboard':  'Panel',
    'nav.research':   'Investigación',
    'nav.forum':      'Foro',
    'nav.education':  'Educación',
    'nav.profile':    'Perfil',
    'nav.logout':     'Salir',
    // Dashboard hero
    'dash.hero.title': 'Portal de Investigación',
    'dash.hero.sub':   'Busca cualquier ticker para ver estados financieros, análisis IA y noticias.',
    'dash.search.btn': 'Investigar',
    // Dashboard sections
    'dash.history.title':  'Investigado Recientemente',
    'dash.forum.title':    'Actividad Reciente del Foro',
    'dash.forum.viewall':  'Ver todo →',
    'dash.members.title':  'Miembros',
    'dash.toptickers':     'Tickers del Mes',
    'dash.usage.title':    'Uso de API Alpha Vantage',
    'dash.queue.title':    'Cola de Análisis',
    'dash.queue.sub':      'Agrega tickers aquí — la app los analiza automáticamente usando las llamadas disponibles del día, para que los resultados estén listos antes de tu próxima reunión.',
    'dash.queue.btn':      'Agregar',
    'dash.queue.empty':    'Cola vacía — agrega un ticker arriba.',
    // Research page
    'research.snapshot':   'Resumen del Mercado',
    'research.finmodel':   'Modelo Financiero Trimestral',
    'research.ainotes':    'Análisis del Analista IA',
    'research.metrics':    'Métricas Clave',
    'research.news':       'Noticias Recientes',
    'research.privnotes':  'Notas Privadas',
    'research.addnote':    '+ Nota Privada',
    'research.shareforum': 'Compartir en Foro',
    // Forum
    'forum.newpost':       'Nueva Publicación',
    'forum.placeholder':   'Comparte tu análisis, lista de seguimiento o discusión…',
    'forum.tickertag':     '$TICKER (opcional)',
    'forum.postbtn':       'Publicar',
    // Education
    'edu.hero.title':      'Centro de Educación',
    'edu.hero.sub':        'Aprende los fundamentos de acciones, opciones y cómo funcionan los mercados.',
    'edu.coming':          'Contenido próximamente',
    // Common buttons
    'btn.save':            'Guardar',
    'btn.cancel':          'Cancelar',
    'btn.refresh':         'Actualizar datos en vivo',
    'loading':             'Cargando…',
  },
};

window.I18n = {
  _lang: localStorage.getItem('sm_lang') || 'en',

  t(key) {
    return _STRINGS[this._lang]?.[key] ?? _STRINGS['en']?.[key] ?? key;
  },

  getLang() { return this._lang; },

  setLang(lang) {
    this._lang = lang;
    localStorage.setItem('sm_lang', lang);
    this.apply();
  },

  apply() {
    document.documentElement.lang = this._lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const val = this.t(key);
      if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder !== undefined) {
        el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });

    const toggle = document.getElementById('lang-toggle');
    if (toggle) {
      toggle.textContent = this._lang === 'en' ? 'ES' : 'EN';
      toggle.title = this._lang === 'en' ? 'Cambiar a Español' : 'Switch to English';
    }
  },

  init() {
    this.apply();
    document.getElementById('lang-toggle')?.addEventListener('click', () => {
      this.setLang(this._lang === 'en' ? 'es' : 'en');
    });
  },
};
