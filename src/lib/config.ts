export type FirebaseSettings = {
  apiKey: string; authDomain: string; projectId: string; storageBucket?: string;
  messagingSenderId?: string; appId: string; measurementId?: string;
};
export type ServiceSettings = { firebase: FirebaseSettings | null; supabaseUrl: string; supabaseAnonKey: string; bucket: string };
const STORE_KEY = 'voidgravity.service-settings.v1';
function readBuildFirebaseConfig(): FirebaseSettings | null {
  try {
    const raw = import.meta.env.VITE_FIREBASE_CONFIG;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.apiKey && parsed?.authDomain && parsed?.projectId && parsed?.appId ? parsed : null;
  } catch { return null; }
}
const defaults: ServiceSettings = {
  firebase: readBuildFirebaseConfig(),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  bucket: import.meta.env.VITE_SUPABASE_BUCKET || 'void-files',
};
export function getSettings(): ServiceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { ...defaults, ...stored, firebase: stored.firebase ?? defaults.firebase };
  } catch { return defaults; }
}
export function saveSettings(settings: ServiceSettings) {
  localStorage.setItem(STORE_KEY, JSON.stringify(settings));
}
export function isFirebaseReady(settings = getSettings()) {
  const f = settings.firebase;
  return !!(f?.apiKey && f?.authDomain && f?.projectId && f?.appId);
}
export function isSupabaseReady(settings = getSettings()) {
  return !!(settings.supabaseUrl.startsWith('https://') && settings.supabaseAnonKey);
}
