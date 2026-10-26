// The anon key is meant to be public: row-level security in supabase/schema.sql
// is what keeps each user's data private.
export const SUPABASE_URL = 'https://ncqppzpfnvlrtqhbftnx.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcXBwenBmbnZscnRxaGJmdG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjY3NDUsImV4cCI6MjEwODYwMjc0NX0.pYgzWa01xhAOCjM2pZNFOFz95MeA0ccLGokAfr8AxRU';

export const MATERIALS_BUCKET = 'materials';
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — best quality' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — balanced' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — cheapest, fastest' },
];
export const DEFAULT_MODEL = 'claude-opus-5-5';
