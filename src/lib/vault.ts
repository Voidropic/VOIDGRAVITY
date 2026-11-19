const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function derive(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptApiKey(apiKey: string, passphrase: string) {
  if (passphrase.length < 10) throw new Error('Vault passphrase minimal 10 karakter.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(apiKey));
  return { ciphertext: toBase64(new Uint8Array(encrypted)), salt: toBase64(salt), iv: toBase64(iv) };
}
export async function decryptApiKey(payload: { ciphertext: string; salt: string; iv: string }, passphrase: string) {
  const key = await derive(passphrase, fromBase64(payload.salt));
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.ciphertext));
  return decoder.decode(raw);
}
