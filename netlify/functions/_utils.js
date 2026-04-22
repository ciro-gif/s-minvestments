// Shared retry helper — underscore prefix keeps Netlify from treating as endpoint
async function retryFetch(url, options = {}, retries = 2, delayMs = 600) {
  const NO_RETRY = new Set([401, 403, 404]);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (NO_RETRY.has(res.status)) {
        const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
        err.status = res.status;
        throw err;
      }
      if (attempt < retries && (res.status === 429 || res.status === 503)) {
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      const body = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
      err.status = res.status; err.statusText = res.statusText; err.body = body;
      throw err;
    } catch (e) {
      lastErr = e;
      if (e.status && NO_RETRY.has(e.status)) throw e;
      if (attempt < retries) await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

module.exports = { retryFetch };
