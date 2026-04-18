// ================================================================
// Supabase client config — replace with your project values
// These are public/safe to expose (RLS policies protect the data)
// ================================================================

const SUPABASE_URL = 'https://rzmpzlchcbxrcgjtqrgm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_evUg05rU0xHqxsQecrYi6Q_VLmq1WSo';

window.SM = {
  supabase: supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
  user: null,
  profile: null,
};
