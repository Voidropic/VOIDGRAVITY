import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSettings, isSupabaseReady } from './config';
export function getSupabase(firebaseIdToken: string): SupabaseClient {
  const config = getSettings();
  if (!isSupabaseReady(config)) throw new Error('Supabase belum dikonfigurasi.');
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => firebaseIdToken,
  });
}
export async function uploadUserFile(file: File, uid: string, firebaseIdToken: string) {
  const config = getSettings();
  const client = getSupabase(firebaseIdToken);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'file';
  const path = `${uid}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await client.storage.from(config.bucket).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return { path: data.path, bucket: config.bucket, name: file.name, size: file.size, type: file.type };
}
