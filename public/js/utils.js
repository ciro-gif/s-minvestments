// ================================================================
// Shared utilities: formatting, sparklines, markdown, etc.
// ================================================================

const Utils = {

  // ---- Number formatting ----

  fmtMoney(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const abs = Math.abs(val);
    if (abs >= 1e12) return `$${(val / 1e12).toFixed(decimals)}T`;
    if (abs >= 1e9)  return `$${(val / 1e9).toFixed(decimals)}B`;
    if (abs >= 1e6)  return `$${(val / 1e6).toFixed(decimals)}M`;
    if (abs >= 1e3)  return `$${(val / 1e3).toFixed(decimals)}K`;
    return `$${val.toFixed(decimals)}`;
  },

  fmtMoneyShort(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    const abs = Math.abs(val);
    if (abs >= 1e9)  return `${(val / 1e9).toFixed(1)}B`;
    if (abs >= 1e6)  return `${(val / 1e6).toFixed(1)}M`;
    if (abs >= 1e3)  return `${(val / 1e3).toFixed(0)}K`;
    return String(Math.round(val));
  },

  fmtPct(val, decimals = 1) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return `${(val * 100).toFixed(decimals)}%`;
  },

  fmtNum(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return Number(val).toFixed(decimals);
  },

  fmtLargeNum(val) {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return Number(val).toLocaleString();
  },

  // ---- Color helpers ----

  colorClass(val) {
    if (!val && val !== 0) return '';
    if (val > 0) return 'pos';
    if (val < 0) return 'neg';
    return 'zero';
  },

  colorStyle(val) {
    if (!val && val !== 0) return '';
    if (val > 0) return 'color:var(--green)';
    if (val < 0) return 'color:var(--red)';
    return 'color:var(--text-muted)';
  },

  // ---- Date formatting ----

  fmtDate(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  fmtDateShort(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  fmtRelative(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return this.fmtDate(isoStr);
  },

  // ---- SVG Sparkline ----

  sparkline(data, opts = {}) {
    const clean = (data || []).filter(v => v !== null && !isNaN(v));
    if (clean.length < 2) return '<svg width="120" height="40"></svg>';

    const { color = '#00C48C', width = 120, height = 40, fill = false } = opts;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = max - min || 1;

    const pts = clean.map((v, i) => {
      const x = (i / (clean.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return [x.toFixed(1), y.toFixed(1)];
    });

    const polyline = pts.map(p => p.join(',')).join(' ');

    let fillPath = '';
    if (fill) {
      const d = [
        `M ${pts[0][0]},${height}`,
        ...pts.map(p => `L ${p[0]},${p[1]}`),
        `L ${pts[pts.length - 1][0]},${height}`,
        'Z',
      ].join(' ');
      fillPath = `<path d="${d}" fill="${color}" opacity="0.1"/>`;
    }

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">
      ${fillPath}
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  },

  // ---- Simple markdown renderer (subset) ----
  // Renders ## headings, **bold**, bullet lists, paragraphs

  renderMarkdown(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const html = [];
    let inList = false;

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (line.startsWith('# ') && !line.startsWith('## ')) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<h2>${this._inline(line.slice(2))}</h2>`);
        continue;
      }
      if (line.startsWith('## ')) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<h2>${this._inline(line.slice(3))}</h2>`);
        continue;
      }
      if (line.startsWith('### ')) {
        if (inList) { html.push('</ul>'); inList = false; }
        html.push(`<h3>${this._inline(line.slice(4))}</h3>`);
        continue;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push(`<li>${this._inline(line.slice(2))}</li>`);
        continue;
      }
      if (line === '' || line === '---') {
        if (inList) { html.push('</ul>'); inList = false; }
        if (line === '---') html.push('<hr style="border-color:var(--border);margin:12px 0">');
        continue;
      }
      if (inList) { html.push('</ul>'); inList = false; }
      html.push(`<p>${this._inline(line)}</p>`);
    }

    if (inList) html.push('</ul>');
    return html.join('\n');
  },

  _inline(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, `<code style="font-family:var(--font-mono);background:var(--surface3);padding:1px 5px;border-radius:3px">$1</code>`)
      .replace(/⚠️/g, '<span style="color:var(--amber)">⚠️</span>');
  },

  // ---- Avatar helpers ----

  avatarInitial(name) {
    return (name || '?')[0].toUpperCase();
  },

  // ---- Ticker normalization ----

  normalizeTicker(raw) {
    return raw.replace(/[$\s]/g, '').toUpperCase();
  },

  // ---- API fetch wrapper ----

  async apiFetch(path, opts = {}) {
    const resp = await fetch(path, opts);
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const text = await resp.text();
      // HTML response = Netlify function not found or crashed
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        throw new Error(`Function not reachable at ${path} (HTTP ${resp.status}). Check Netlify Functions tab — you may need to redeploy after adding env vars.`);
      }
      throw new Error(`Non-JSON response (HTTP ${resp.status}): ${text.slice(0, 120)}`);
    }
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `Request failed: ${resp.status}`);
    return data;
  },

  // ---- Escape HTML ----

  escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};
