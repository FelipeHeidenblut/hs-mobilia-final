import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* =========================================================
   CONFIGURE AQUI
   ========================================================= */
const SUPABASE_URL = 'https://kuymrkdcjejhhjtsrnaa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eW1ya2RjamVqaGhqdHNybmFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTYxMzcsImV4cCI6MjA5Mjg5MjEzN30.WiQ1Tc_VGOyWTnRUpfiDZy0ERYq3-clP7wmWdN5irqY';
/* ========================================================= */

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  // AuthSessionMissingError é comportamento normal quando não há sessão ativa
  if (error) {
    if (error.name === 'AuthSessionMissingError') return null;
    throw error;
  }

  return data.user ?? null;
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  return getProfile(user.id);
}

export async function fetchPublicProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, dimensions, image_url')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchArchitectProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, brand, dimensions, image_url, file_2d_url, file_3d_url')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp({ full_name, email, password }) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name }
    }
  });

  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function formatError(error) {
  if (!error) return 'Ocorreu um erro inesperado.';
  return error.message || 'Ocorreu um erro inesperado.';
}