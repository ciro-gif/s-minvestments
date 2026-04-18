-- Run this in the Supabase SQL Editor to add the queue + usage tracking tables

-- 1. Daily API call log (Alpha Vantage — 25 calls/day free tier)
--    Each row = one API invocation. stock-data = 2 calls, news-fetch = 1 call.
CREATE TABLE IF NOT EXISTS api_usage_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  called_at      TIMESTAMPTZ NOT NULL    DEFAULT NOW(),
  ticker         TEXT,
  calls_consumed INT         NOT NULL    DEFAULT 1
);
ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view usage"   ON api_usage_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "members can insert usage" ON api_usage_log FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Ticker analysis queue
CREATE TABLE IF NOT EXISTS ticker_queue (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker       TEXT        NOT NULL,
  notes        TEXT,
  submitted_by UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT        NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  processed_at TIMESTAMPTZ,
  error_msg    TEXT
);
ALTER TABLE ticker_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view queue"       ON ticker_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY "members can insert queue"     ON ticker_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "members can update queue"     ON ticker_queue FOR UPDATE TO authenticated USING (true);
CREATE POLICY "members can delete own items" ON ticker_queue FOR DELETE TO authenticated USING (auth.uid() = submitted_by);

-- 3. Cached analysis snapshots (populated by auto-processor)
CREATE TABLE IF NOT EXISTS ticker_snapshots (
  ticker        TEXT        PRIMARY KEY,
  company_name  TEXT,
  stock_data    JSONB,
  financial_data JSONB,
  ai_analysis   TEXT,
  news_data     JSONB,
  snapped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapped_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL
);
ALTER TABLE ticker_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view snapshots"   ON ticker_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "members can insert snapshots" ON ticker_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "members can update snapshots" ON ticker_snapshots FOR UPDATE TO authenticated USING (true);
