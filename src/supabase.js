import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Read before the client starts: it handles a password-reset link from the URL straight
// away, which can happen before App is listening for the PASSWORD_RECOVERY event.
export const openedRecoveryLink = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash + window.location.search);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
