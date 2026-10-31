// The anon key is meant to be public: row-level security (supabase/migrations/)
// is what keeps each user's data private.
export const SUPABASE_URL = 'https://ncqppzpfnvlrtqhbftnx.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jcXBwenBmbnZscnRxaGJmdG54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjY3NDUsImV4cCI6MjEwODYwMjc0NX0.pYgzWa01xhAOCjM2pZNFOFz95MeA0ccLGokAfr8AxRU';

export const MATERIALS_BUCKET = 'materials';
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Who runs Alma, shown on the privacy and terms pages. CONTACT_EMAIL is required:
// EU law requires a way to contact the person in charge of the data.
export const OWNER_NAME = 'Sharonne Gunasena';
export const CONTACT_EMAIL = 'sharonnegunasena@gmail.com';
export const SOURCE_URL = 'https://github.com/Sharonne-Gunasena/Alma';
