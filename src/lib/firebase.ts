import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, updateProfile, type User } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, serverTimestamp, onSnapshot, type Firestore } from 'firebase/firestore';
import { getSettings, isFirebaseReady } from './config';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
export function firebaseAvailable() { return isFirebaseReady(); }
export function getFirebase() {
  const settings = getSettings();
  if (!isFirebaseReady(settings)) throw new Error('Firebase belum dikonfigurasi. Lengkapi Firebase Web App config di Setup.');
  if (!app) app = getApps().length ? getApp() : initializeApp(settings.firebase!);
  if (!db) db = getFirestore(app);
  return { app, auth: getAuth(app), db };
}
export async function loginWithGoogle() {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithRedirect(auth, provider);
}
export async function resolveGoogleRedirect() { const { auth } = getFirebase(); return getRedirectResult(auth); }
export function watchAuth(callback: (user: User | null) => void) { return onAuthStateChanged(getFirebase().auth, callback); }
export async function logout() { await signOut(getFirebase().auth); }
export async function updateUserProfile(user: User, displayName: string) {
  await updateProfile(user, { displayName });
  await setDoc(doc(getFirebase().db, 'users', user.uid), { displayName, email: user.email, photoURL: user.photoURL, updatedAt: serverTimestamp() }, { merge: true });
}
export async function saveProfile(uid: string, data: Record<string, unknown>) {
  await setDoc(doc(getFirebase().db, 'users', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function loadProfile(uid: string) {
  const snapshot = await getDoc(doc(getFirebase().db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : {};
}
export async function createConversation(uid: string, title = 'New conversation') {
  const ref = await addDoc(collection(getFirebase().db, 'users', uid, 'conversations'), { title, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}
export async function renameConversation(uid: string, id: string, title: string) {
  await setDoc(doc(getFirebase().db, 'users', uid, 'conversations', id), { title, updatedAt: serverTimestamp() }, { merge: true });
}
export async function removeConversation(uid: string, id: string) {
  const msgs = await getDocs(collection(getFirebase().db, 'users', uid, 'conversations', id, 'messages'));
  await Promise.all(msgs.docs.map((item) => deleteDoc(item.ref)));
  await deleteDoc(doc(getFirebase().db, 'users', uid, 'conversations', id));
}
export async function listConversations(uid: string) {
  const q = query(collection(getFirebase().db, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'), limit(100));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; title?: string; createdAt?: unknown; updatedAt?: unknown }));
}
export async function addMessage(uid: string, conversationId: string, message: { role: 'user' | 'assistant'; content: string; attachments?: unknown[] }) {
  const parent = doc(getFirebase().db, 'users', uid, 'conversations', conversationId);
  await addDoc(collection(parent, 'messages'), { ...message, createdAt: serverTimestamp() });
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (message.role === 'user') update.title = message.content.slice(0, 52) || 'New conversation';
  await setDoc(parent, update, { merge: true });
}
export function watchMessages(uid: string, conversationId: string, callback: (messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; attachments?: unknown[] }>) => void) {
  const q = query(collection(getFirebase().db, 'users', uid, 'conversations', conversationId, 'messages'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; role: 'user' | 'assistant'; content: string; attachments?: unknown[] }))));
}
export async function saveEncryptedVault(uid: string, payload: { ciphertext: string; salt: string; iv: string }) {
  await setDoc(doc(getFirebase().db, 'users', uid, 'private', 'geminiVault'), { ...payload, algorithm: 'AES-GCM/PBKDF2-SHA256', updatedAt: serverTimestamp() });
}
export async function readEncryptedVault(uid: string) {
  const snapshot = await getDoc(doc(getFirebase().db, 'users', uid, 'private', 'geminiVault'));
  return snapshot.exists() ? snapshot.data() as { ciphertext: string; salt: string; iv: string } : null;
}
export async function deleteEncryptedVault(uid: string) {
  await deleteDoc(doc(getFirebase().db, 'users', uid, 'private', 'geminiVault'));
}
export async function saveMemory(uid: string, content: string) {
  return addDoc(collection(getFirebase().db, 'users', uid, 'memories'), { content, createdAt: serverTimestamp() });
}
export async function listMemories(uid: string) {
  const q = query(collection(getFirebase().db, 'users', uid, 'memories'), orderBy('createdAt', 'desc'), limit(100));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, content: String(d.data().content || '') }));
}
export async function deleteMemory(uid: string, id: string) { await deleteDoc(doc(getFirebase().db, 'users', uid, 'memories', id)); }
