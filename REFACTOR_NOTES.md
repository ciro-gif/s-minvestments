# S&M Investments — Refactor Notes
_Last updated: April 2026_

---

## 1. Bug → Fix Mapping

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | Stock price shows `+0.00 (—)` | Yahoo Finance omits `regularMarketChangePercent` when market is closed | Compute `changePercent` from `(rawChange / base) * 100` when rawPct is null |
| 2 | "Market closed" banner on live data | `marketState` check fired when `changePercent` was null, not `price` | Only show banner when `!d.price && d.marketState === 'CLOSED'` |
| 3 | Dividend yield showing 0.44% as 0.004% | Yahoo returns decimal (0.0044); old code divided by 100 again | Multiply by 100: `dividendYield = d.dividendYield?.raw * 100` |
| 4 | Beta showing same value for every stock | Was using `d.beta?.raw` which doesn't exist in Yahoo response | Use only `k.beta?.raw` (defaultKeyStatistics) |
| 5 | avgVolume shows `$23.3B` (wrong unit) | Volume is in shares, not dollars — fmtMoney added `$` prefix | Apply `.replace(/\$/g, '')` on `fmtMoneyShort` output |
| 6 | AI response starts with company title header | Claude adds preamble despite instruction | Post-process: `analysis.slice(analysis.indexOf('## '))` strips everything before first `## ` |
| 7 | `ReferenceError: _processing is not defined` | TDZ — `let _processing = false` declared after `autoProcess()` call inside IIFE | Move declaration to top of IIFE (before any function call) |
| 8 | BRK.B CIK lookup returns "not found" | SEC stores as `BRKB` without dots | Retry `getCIK()` with `ticker.replace(/\./g, '')` when initial lookup fails |
| 9 | AAPL shows no revenue rows | Wrong XBRL concept priority in CONCEPT_MAP — Apple uses non-standard concept | Moved `RevenueFromContractWithCustomerExcludingAssessedTax` to first position in `totalRevenue` array |
| 10 | Quarters missing from fin-table for some metrics | `alignMetrics()` built dates from longest single series, dropping shorter ones | Replaced with UNION of all end-dates across all metric series |
| 11 | EPS QoQ shows `+1 QoQ` (rounded) | `fmtMoneyShort` rounds to 0 decimal places for values < 1000 | Use `.toFixed(2)` for eps values in QoQ display |
| 12 | Numbered lists in AI output rendered as plain text | `renderMarkdown()` didn't handle `1. item` patterns | Added `inOrderedList` state + regex `numMatch` branch |
| 13 | Tooltips clipped by fin-table overflow | CSS `::after` tooltips clipped by `overflow-x: auto` on `.fin-table-wrap` | Switched to JS `position:fixed` tooltip via `#global-tip` div managed by event delegation |
| 14 | Snapshot cached in wrong language | AI analysis generated in English cached, served when user switches to Spanish | Added language mismatch detection in `renderFromSnapshot()` — re-fetches AI when lang doesn't match |
| 15 | Company name shows in ALL-CAPS from ticker fallback | `id="r-company"` set to raw ticker when name missing | Added casing: `stockData?.name || edgarData?.company || ticker` |
| 16 | Finviz scraping blocked in Netlify production | Cloudflare blocks server-side requests from Netlify IPs | Replaced with Financial Modeling Prep (FMP) API |
| 17 | Alpha Vantage rate-limit messages shown to users | AV 25 call/day limit hit; API returns rate-limit string as JSON body | Replaced with Polygon.io (primary) + Yahoo Finance (fallback) for stock data; NewsAPI for news |
| 18 | autoProcess runs on every page load | No throttle — wasteful when nothing's pending | Added 10-min localStorage throttle + early exit when queue is empty |
| 19 | `anthropic-analysis.js` crashes when no SEC data | `metrics` or `quarters` can be null when EDGAR lookup fails | Added `metrics = metrics || {}; quarters = quarters || [];` guard; uses short overview prompt |
| 20 | Analyst sentiment section always hidden | Section not shown when FMP returns data | `renderAnalystSection()` now toggles `#analyst-section` display |

---

## 2. API Keys You Need to Sign Up For

| Service | Key Name | Where to Get | Free Tier |
|---------|---------|-------------|-----------|
| **Anthropic** | `ANTHROPIC_API_KEY` | https://console.anthropic.com | Pay-per-token (very cheap for Haiku) |
| **Massive** (formerly Polygon.io) | `POLYGON_API_KEY` | https://massive.com | Free: unlimited requests, 5 req/min |
| **Financial Modeling Prep** | `FMP_API_KEY` | https://financialmodelingprep.com | Free: 250 requests/day |
| **NewsAPI** | `NEWS_API_KEY` | https://newsapi.org | Free: 1,000 requests/day (dev plan) |
| **Supabase** | `SUPABASE_URL` + `SUPABASE_ANON_KEY` | https://supabase.com | Free tier included |

> **No longer required:** Alpha Vantage (`ALPHA_VANTAGE_API_KEY`) is legacy-only. Set it in `.env.example` only if you want backward-compatible `api_usage_log` entries.

---

## 3. Per-Ticker API Call Budget

Each time a user searches a ticker on the Research page, the following calls are made:

| Step | Service | Calls | Notes |
|------|---------|-------|-------|
| Stock snapshot | Polygon.io | 2 | `/reference/tickers` + `/snapshot` |
| Stock snapshot (fallback) | Yahoo Finance | 0 | No key required; auto-fallback if Polygon fails or no key |
| SEC financials | SEC EDGAR | 2 | `/company_tickers.json` + `/companyfacts/CIK*.json` (free, no key) |
| Analyst data | FMP | 4 | `analyst-recommendations` + `price-target-consensus` + `key-metrics-ttm` + `financial-growth` |
| News | NewsAPI | 1 | `everything` endpoint, 20 articles |
| News sentiment | Anthropic (Haiku) | 1 | Classifies up to 15 headlines in one call |
| AI analysis | Anthropic (Haiku) | 1 | Full analyst note, max_tokens=2500 |
| **Total per ticker** | | **~11** | Polygon free tier: 5/min — stay under this |

**Daily caps (free tiers):**
- Polygon: unlimited calls/day, but 5/min rate limit
- FMP: 250 calls/day → ~62 tickers/day before hitting limit
- NewsAPI: 1,000 calls/day → ~1,000 tickers/day
- Anthropic: no hard daily limit; pay-per-token

---

## 4. Remaining Limitations

1. **Polygon free tier is US-only.** International tickers (e.g., `BABA` on HK exchange) may return no snapshot data — Yahoo Finance fallback covers most of these.
2. **NewsAPI dev plan blocks production domains.** On the free plan, NewsAPI only allows `localhost`. You must upgrade to the paid plan ($449/mo) or use a proxy for production. _Workaround:_ pre-populate news via the Analysis Queue (which runs server-side where the domain restriction doesn't apply).
3. **FMP 250 req/day limit.** If the club researches 60+ tickers per day, FMP analyst ratings will stop working. The frontend degrades gracefully — analyst section stays hidden rather than showing an error.
4. **SEC EDGAR has no data for ETFs or foreign-listed stocks.** The fin-table will show "No quarterly data found" for `SPY`, `QQQ`, `BABA`, etc. The AI analysis still runs with just the market snapshot.
5. **No real-time prices.** Polygon free tier doesn't include WebSocket streaming. Prices are as-of last market close or current delayed quote.
6. **`news-classify.js`** is a standalone Netlify function kept for potential future use. It is not called by the current frontend — sentiment classification is now inlined inside `news-fetch.js`.

---

## 5. Manual Test Checklist

### Core Research Flow
- [ ] Search `AAPL` → snapshot card loads with price, change %, market cap
- [ ] Search `AAPL` → financial table shows 8 quarters of revenue, gross profit, net income, EPS
- [ ] Search `AAPL` → AI analyst notes section populates (not blank, starts with `## Executive Summary`)
- [ ] Search `AAPL` → Analyst Sentiment section appears with recommendation label and price target
- [ ] Search `AAPL` → News section shows 5+ articles with Bullish/Bearish/Neutral badges
- [ ] Search `AAPL` → Key Metrics cards show P/E, market cap, beta, dividend yield (no `$` on volume)
- [ ] Search `BRK.B` → resolves correctly (no "ticker not found" error)
- [ ] Search `SPY` → gracefully shows snapshot + AI overview; fin-table shows "No quarterly data"
- [ ] Search a fake ticker (e.g., `ZZZZZ`) → friendly error message, not raw JSON

### Change Display
- [ ] During market hours: price shows green/red `+X.XX (X.XX%)` — not `+0.00 (—)`
- [ ] After market close: price shows last close; no false "Market closed" banner if price exists

### Language Toggle
- [ ] Click `ES` toggle → all nav, section headers, and button labels switch to Spanish
- [ ] Research an AAPL → click `ES` → AI analysis re-generates in Spanish (not served from English cache)
- [ ] Click `EN` → reverts to English; page doesn't reload

### Queue & Auto-Processor
- [ ] Submit a ticker to the queue → status shows `pending`
- [ ] After ≤10 minutes, queue auto-processes → status shows `done`, clicking opens research page
- [ ] Dashboard loads on second visit within 10 min → autoProcess skips (throttle working)

### Private Notes
- [ ] Click `+ Private Note` → form appears; type note → Save → note appears in "My Notes" section
- [ ] Note is not visible when logged in as a different user

### Forum
- [ ] Click `Share to Forum` from research page → creates forum post with ticker tag
- [ ] Forum post appears on dashboard "Recent Forum Activity"

### Tooltips
- [ ] Hover over `ⓘ` next to "Revenue" in fin-table → tooltip appears above the icon, fully visible (not clipped)
- [ ] Hover over snapshot metrics (P/E, EPS, Beta, etc.) → tooltip appears correctly

### Mobile
- [ ] Dashboard, Research, Forum, Profile pages load without horizontal overflow on 375px viewport
- [ ] Mobile nav icons visible and tappable at bottom of screen
