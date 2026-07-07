import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Valores integrados como respaldo: la anon key es pública por diseño
// (la seguridad la aporta Row Level Security). Así, un build u OTA
// publicado sin variables de entorno nunca deja la app rota.
const FALLBACK_URL = 'https://bvfayigcaaixhrruoqqh.supabase.co';
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2ZmF5aWdjYWFpeGhycnVvcXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzU5MzMsImV4cCI6MjA5ODg1MTkzM30.JjFCQOPdi1UiYULUhJBUEBUhYF6bHX7kZ0oG7IIKCMI';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // En web (y durante el build) el adaptador por defecto ya usa
    // localStorage con guardas para SSR; AsyncStorage es solo nativo
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
