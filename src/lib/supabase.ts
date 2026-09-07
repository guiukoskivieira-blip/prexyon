import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

const getEnvVar = (name: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
      return import.meta.env[name];
    }
  } catch {
    // ignore
  }

  try {
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return process.env[name] as string;
    }
  } catch {
    // ignore
  }

  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabasePublishableKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');
const supabasePublicKey = supabasePublishableKey || supabaseAnonKey;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabasePublicKey &&
    supabaseUrl.trim() !== '' &&
    supabasePublicKey.trim() !== '' &&
    !supabaseUrl.includes('placeholder')
  );
};

// Safe storage reference for browser vs test environment
const getStorage = () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return undefined;
};

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabasePublicKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: typeof window !== 'undefined',
      storage: getStorage(),
    },
  }
);
