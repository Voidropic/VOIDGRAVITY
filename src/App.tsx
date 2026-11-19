import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import {
  Activity, Archive, ArrowDown, ArrowLeft, ArrowUp, Atom, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, Code2, Command, Copy, Database, Download, ExternalLink, Eye, EyeOff, File,
  FileArchive, FileCode2, FileImage, FileText, FolderOpen, Github, Globe2, HardDrive, ImagePlus, KeyRound,
  LayoutDashboard, LoaderCircle, LogOut, Menu, MessageSquarePlus, MoreHorizontal, Paperclip, Plus, Search,
  Send, Settings, ShieldCheck, Sparkles, SquarePen, Trash2, Upload, UserRound, X, Zap,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import JSZip from 'jszip';
import type { User } from 'firebase/auth';
import { getSettings, saveSettings, isFirebaseReady, isSupabaseReady, type ServiceSettings } from './lib/config';
import {
  firebaseAvailable, loginWithGoogle, logout, watchAuth, resolveGoogleRedirect, createConversation, deleteEncryptedVault,
  listConversations, removeConversation, addMessage, watchMessages, saveEncryptedVault, readEncryptedVault,
  saveMemory, listMemories, deleteMemory, loadProfile, saveProfile,
} from './lib/firebase';
import { encryptApiKey, decryptApiKey } from './lib/vault';
import { listGeminiModels, generateGeminiResponse, extractGeminiText, supportsThinkingEffort, supportsXHighThinking, type GeminiModel, type ThinkingEffort, type GeminiPart } from './lib/gemini';
import { prepareFile, readableSize, type PreparedAttachment } from './lib/files';
import { uploadUserFile } from './lib/supabase';

type View = 'chat' | 'studio' | 'memory' | 'plugins' | 'settings' | 'profile' | 'usage';
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; attachments?: any[] };
type Conversation = { id: string; title?: string };
type Notice = { id: number; kind: 'success' | 'error' | 'info'; text: string };

const navItems: Array<{ id: View; label: string; icon: any; group: string }> = [
  { id: 'chat', label: 'Workspace', icon: MessageSquarePlus, group: 'WORKSPACE' },
  { id: 'studio', label: 'VOID Studio', icon: Code2, group: 'WORKSPACE' },
  { id: 'memory', label: 'Memory', icon: Database, group: 'SYSTEM' },
  { id: 'plugins', label: 'Plugin Center', icon: Globe2, group: 'SYSTEM' },
  { id: 'usage', label: 'Usage & Activity', icon: Activity, group: 'SYSTEM' },
];
const welcomePrompts = [
  { title: 'Build something', text: 'Help me plan and build a polished web project. Start with the architecture and a clear file tree.' },
  { title: 'Understand a file', text: 'Analyze the file I attach. Explain its structure, key details, and anything I should check.' },
  { title: 'Explore an idea', text: 'Help me turn an idea into a practical product plan with milestones and technical decisions.' },
  { title: 'Debug a problem', text: 'Help me investigate a bug systematically. Ask for the relevant details and explain each proposed fix.' },
];

function Logo({ size = 'normal' }: { size?: 'normal' | 'large' }) {
  return <div className={`brand-lockup ${size}`}><img src={`${import.meta.env.BASE_URL}voidgravity-icon.png`} alt=""/><div><strong>VOIDGRAVITY</strong><span>BEYOND EVERY BOUNDARY</span></div></div>;
}
function Core({ state = 'idle', small = false }: { state?: 'idle' | 'thinking' | 'done' | 'error'; small?: boolean }) {
  return <div className={`core-mark ${state} ${small ? 'small' : ''}`} aria-label={`VOID Core ${state}`}><span className="core-orbit orbit-a"/><span className="core-orbit orbit-b"/><span className="core-sphere"/><span className="core-glint"/></div>;
}
function NoticeStack({ notices, dismiss }: { notices: Notice[]; dismiss: (id: number) => void }) {
  return <div className="notice-stack">{notices.map((n) => <button key={n.id} className={`notice ${n.kind}`} onClick={() => dismiss(n.id)}><span>{n.kind === 'success' ? <CheckCircle2 size={16}/> : n.kind === 'error' ? <CircleHelp size={16}/> : <Activity size={16}/>}</span><span>{n.text}</span><X size={14}/></button>)}</div>;
}
function Avatar({ user }: { user: User }) {
  return user.photoURL ? <img className="avatar" src={user.photoURL} alt="Profile" referrerPolicy="no-referrer"/> : <span className="avatar fallback">{(user.displayName || user.email || 'V').slice(0, 1).toUpperCase()}</span>;
}

export default function App() {
  const [settings, setSettings] = useState<ServiceSettings>(getSettings());
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>('chat');
  const [mobileNav, setMobileNav] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<PreparedAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [coreState, setCoreState] = useState<'idle' | 'thinking' | 'done' | 'error'>('idle');
  const [notices, setNotices] = useState<Notice[]>([]);
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(localStorage.getItem('vg.model') || '');
  const [effort, setEffort] = useState<ThinkingEffort>((localStorage.getItem('vg.effort') as ThinkingEffort) || 'medium');
  const [apiKey, setApiKey] = useState('');
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultReplace, setVaultReplace] = useState(false);
  const [vaultLocked, setVaultLocked] = useState(true);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultKeyInput, setVaultKeyInput] = useState('');
  const [vaultPassInput, setVaultPassInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [memories, setMemories] = useState<Array<{ id: string; content: string }>>([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileAbout, setProfileAbout] = useState('');
  const [githubQuery, setGithubQuery] = useState('react typescript');
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubBusy, setGithubBusy] = useState(false);
  const [studioFiles, setStudioFiles] = useState<Array<{ name: string; content: string }>>([{ name: 'index.html', content: '<main>\n  <h1>VOID Studio</h1>\n  <p>Your artifact starts here.</p>\n</main>' }, { name: 'style.css', content: 'body { font-family: system-ui; background: #101014; color: white; padding: 3rem; }\nh1 { letter-spacing: -.04em; }' }]);
  const [activeStudioFile, setActiveStudioFile] = useState('index.html');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [serviceFirebaseJson, setServiceFirebaseJson] = useState(() => getSettings().firebase ? JSON.stringify(getSettings().firebase, null, 2) : '{\n  "apiKey": "",\n  "authDomain": "",\n  "projectId": "",\n  "appId": ""\n}');
  const [serviceSupabaseUrl, setServiceSupabaseUrl] = useState(settings.supabaseUrl);
  const [serviceSupabaseKey, setServiceSupabaseKey] = useState(settings.supabaseAnonKey);
  const [serviceBucket, setServiceBucket] = useState(settings.bucket);
  const [profileBusy, setProfileBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const noticesCounter = useRef(0);

  const notify = useCallback((text: string, kind: Notice['kind'] = 'info') => {
    const id = ++noticesCounter.current;
    setNotices((current) => [...current, { id, kind, text }]);
    window.setTimeout(() => setNotices((current) => current.filter((n) => n.id !== id)), 5200);
  }, []);
  const dismissNotice = (id: number) => setNotices((current) => current.filter((n) => n.id !== id));

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let redirectResolved = false;
    let authStateReceived = false;
    let pendingUser: User | null = null;
    let fallbackTimer: number | undefined;

    const finishAuth = (nextUser: User | null) => {
      if (cancelled) return;
      setUser(nextUser);
      setAuthLoading(false);
    };

    if (!isFirebaseReady()) {
      setAuthLoading(false);
      return;
    }

    /*
     * IMPORTANT:
     * Firebase can briefly emit `null` while a Google redirect is
     * being restored. If we immediately set authLoading=false here,
     * the login screen can flash/reappear even though the Google
     * session is valid.
     *
     * Keep the app in the loading state until both:
     * 1. Firebase has reported an auth state, and
     * 2. The Google redirect result has been resolved.
     */
    try {
      unsubscribe = watchAuth((nextUser) => {
        if (cancelled) return;

        authStateReceived = true;
        pendingUser = nextUser;

        if (!redirectResolved) {
          if (nextUser) setUser(nextUser);
          return;
        }

        finishAuth(nextUser);
      });
    } catch (error) {
      setAuthLoading(false);
      notify(
        error instanceof Error
          ? error.message
          : 'Authentication initialization failed.',
        'error'
      );
      return;
    }

    void resolveGoogleRedirect()
      .then((result) => {
        if (cancelled) return;

        redirectResolved = true;

        if (result?.user) {
          pendingUser = result.user;
          finishAuth(result.user);
          return;
        }

        /*
         * If onAuthStateChanged already fired, use its latest value.
         * Otherwise let the auth listener finish initialization when
         * Firebase delivers its first state.
         */
        if (authStateReceived) {
          finishAuth(pendingUser);
        } else {
          fallbackTimer = window.setTimeout(() => {
            if (!cancelled) finishAuth(pendingUser);
          }, 3000);
        }
      })
      .catch((error) => {
        if (cancelled) return;

        redirectResolved = true;

        notify(
          error instanceof Error
            ? error.message
            : 'Google redirect resolution failed.',
          'error'
        );

        /*
         * Do not trap the app forever if redirect resolution fails.
         * Firebase's auth-state listener is still allowed to provide
         * the authenticated user.
         */
        if (authStateReceived) {
          finishAuth(pendingUser);
        } else {
          fallbackTimer = window.setTimeout(() => {
            if (!cancelled) finishAuth(pendingUser);
          }, 3000);
        }
      });

    return () => {
      cancelled = true;
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      unsubscribe?.();
    };
  }, [notify]);

  useEffect(() => {
    if (!user) { setConversations([]); setActiveId(''); setMessages([]); setMemories([]); setVaultExists(false); setVaultLocked(true); setApiKey(''); return; }
    let cancelled = false;
    (async () => {
      try {
        const [items, profile, vault] = await Promise.all([listConversations(user.uid), loadProfile(user.uid), readEncryptedVault(user.uid)]);
        if (cancelled) return;
        setConversations(items);
        setProfileName(String(profile.displayName || user.displayName || ''));
        setProfileAbout(String(profile.about || ''));
        setVaultExists(!!vault);
        if (items.length && !activeId) setActiveId(items[0].id);
        setMemories(await listMemories(user.uid));
      } catch (error) { notify(error instanceof Error ? error.message : 'Gagal memuat akun.', 'error'); }
    })();
    return () => { cancelled = true; };
    // activeId intentionally omitted: load user data once per user change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, notify]);

  useEffect(() => {
    if (!user || !activeId) { setMessages([]); return; }
    return watchMessages(user.uid, activeId, (next) => setMessages(next));
  }, [user?.uid, activeId]);

  useEffect(() => {
    if (!activeId && conversations.length && !activeId) setActiveId(conversations[0].id);
  }, [conversations, activeId]);

  const refreshConversations = useCallback(async () => {
    if (!user) return;
    const items = await listConversations(user.uid); setConversations(items);
  }, [user]);

  const handleLogin = async () => {
    try { if (!firebaseAvailable()) { setView('settings'); notify('Tambahkan konfigurasi Firebase lebih dahulu.', 'info'); return; } await loginWithGoogle(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Login gagal.', 'error'); }
  };
  const handleLogout = async () => {
    try { setApiKey(''); await logout(); setView('chat'); setVaultLocked(true); setMobileNav(false); }
    catch (error) { notify(error instanceof Error ? error.message : 'Logout gagal.', 'error'); }
  };

  const saveServiceConfig = () => {
    try {
      const firebase = JSON.parse(serviceFirebaseJson);
      if (!firebase.apiKey || !firebase.authDomain || !firebase.projectId || !firebase.appId) throw new Error('Firebase config minimal membutuhkan apiKey, authDomain, projectId, dan appId.');
      const next = { firebase, supabaseUrl: serviceSupabaseUrl.trim(), supabaseAnonKey: serviceSupabaseKey.trim(), bucket: serviceBucket.trim() || 'void-files' };
      saveSettings(next); setSettings(next); notify('Konfigurasi disimpan di browser ini. Muat ulang halaman untuk mengaktifkan Firebase.', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Format Firebase JSON tidak valid.', 'error'); }
  };

  const refreshModels = useCallback(async (key = apiKey) => {
    if (!user || !key) { notify('Unlock Gemini API key terlebih dahulu.', 'info'); return; }
    setVaultBusy(true);
    try {
      const modelsFromApi = await listGeminiModels(await user.getIdToken(), key);
      setModels(modelsFromApi);
      if (!modelsFromApi.length) throw new Error('Gemini API tidak mengembalikan model yang mendukung generateContent untuk key ini.');
      const persisted = localStorage.getItem('vg.model');
      const exists = modelsFromApi.some((m) => m.name === persisted);
      const chosen = exists ? persisted! : modelsFromApi[0].name;
      setSelectedModel(chosen); localStorage.setItem('vg.model', chosen);
      notify(`${modelsFromApi.length} model tersedia dari Gemini API.`, 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Gagal mengambil daftar model Gemini.', 'error'); }
    finally { setVaultBusy(false); }
  }, [user, apiKey, notify]);

  const storeVault = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setVaultBusy(true);
    try {
      if (!vaultKeyInput.trim()) throw new Error('Masukkan Gemini API key.');
      if (!vaultPassInput) throw new Error('Buat passphrase untuk mengenkripsi key.');
      const encrypted = await encryptApiKey(vaultKeyInput.trim(), vaultPassInput);
      await saveEncryptedVault(user.uid, encrypted);
      setVaultExists(true); setVaultReplace(false); setApiKey(vaultKeyInput.trim()); setVaultLocked(false);
      setVaultKeyInput(''); setVaultPassInput('');
      notify('Gemini key berhasil dienkripsi dan disimpan ke Firestore akun ini.', 'success');
      await refreshModels(vaultKeyInput.trim());
    } catch (error) { notify(error instanceof Error ? error.message : 'Gagal menyimpan Gemini key.', 'error'); }
    finally { setVaultBusy(false); }
  };
  const unlockVault = async (event: FormEvent) => {
    event.preventDefault(); if (!user) return;
    setVaultBusy(true);
    try {
      const encrypted = await readEncryptedVault(user.uid);
      if (!encrypted) throw new Error('Belum ada API key yang tersimpan. Simpan key terlebih dahulu.');
      const key = await decryptApiKey(encrypted, vaultPassInput);
      setApiKey(key); setVaultLocked(false); setVaultPassInput('');
      notify('Vault terbuka. Key hanya berada di memori sesi ini.', 'success');
      await refreshModels(key);
    } catch (error) { notify(error instanceof Error ? error.message : 'Gagal membuka vault. Periksa passphrase.', 'error'); }
    finally { setVaultBusy(false); }
  };
  const lockVault = () => { setApiKey(''); setModels([]); setVaultLocked(true); notify('Gemini key dikunci dan dihapus dari memori sesi.', 'info'); };
  const removeVault = async () => {
    if (!user || !window.confirm('Hapus ciphertext Gemini API key yang tersimpan untuk akun ini?')) return;
    try { await deleteEncryptedVault(user.uid); setApiKey(''); setModels([]); setVaultExists(false); setVaultLocked(true); setVaultReplace(false); notify('Gemini vault dihapus dari Firestore.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Gagal menghapus vault.', 'error'); }
  };

  const newConversation = async () => {
    if (!user) return;
    try { const id = await createConversation(user.uid); setActiveId(id); setView('chat'); setMessages([]); await refreshConversations(); setMobileNav(false); }
    catch (error) { notify(error instanceof Error ? error.message : 'Gagal membuat chat.', 'error'); }
  };
  const openConversation = (id: string) => { setActiveId(id); setView('chat'); setMobileNav(false); };
  const deleteChat = async (id: string) => {
    if (!user || !window.confirm('Hapus percakapan ini secara permanen?')) return;
    try { await removeConversation(user.uid, id); if (activeId === id) setActiveId(''); await refreshConversations(); notify('Percakapan dihapus.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Gagal menghapus chat.', 'error'); }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const chosen = Array.from(fileList).slice(0, 6);
    for (const file of chosen) {
      try {
        const prepared = await prepareFile(file);
        if (user && isSupabaseReady(settings)) {
          try {
            const uploaded = await uploadUserFile(file, user.uid, await user.getIdToken());
            prepared.cloudPath = uploaded.path; prepared.bucket = uploaded.bucket;
          } catch (error) { notify(`File diproses lokal, tetapi upload Supabase gagal: ${error instanceof Error ? error.message : 'unknown error'}`, 'error'); }
        }
        setAttachments((current) => [...current, prepared]);
        notify(`${file.name} siap dianalisis.${prepared.cloudPath ? ' Tersimpan di Supabase.' : ''}`, 'success');
      } catch (error) { notify(error instanceof Error ? error.message : `Gagal membaca ${file.name}.`, 'error'); }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removeAttachment = (index: number) => setAttachments((current) => current.filter((_, i) => i !== index));

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && !attachments.length) || isSending || !user) return;
    if (!apiKey || vaultLocked) { notify('Buka Gemini Key Vault terlebih dahulu di Settings.', 'error'); setView('settings'); return; }
    if (!selectedModel) { notify('Pilih model dari daftar Gemini API yang terdeteksi.', 'error'); setView('settings'); return; }
    let conversationId = activeId;
    try {
      if (!conversationId) { conversationId = await createConversation(user.uid, text.slice(0, 52) || 'File analysis'); setActiveId(conversationId); }
      const fileParts = attachments.flatMap((a) => a.geminiParts);
      const attachmentMetadata = attachments.map(({ name, size, type, cloudPath, bucket, note }) => ({ name, size, type, cloudPath, bucket, note }));
      const userContent = `${text}${attachments.length ? `${text ? '\n\n' : ''}${attachments.map((a) => `Attached: ${a.name} (${readableSize(a.size)}). ${a.note || ''}`).join('\n')}` : ''}`;
      await addMessage(user.uid, conversationId, { role: 'user', content: userContent, attachments: attachmentMetadata });
      const history: GeminiPart[] = messages.slice(-14).flatMap((m) => [{ text: `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}` }]);
      const contents = [
        ...messages.slice(-14).map((m) => ({ role: m.role === 'assistant' ? 'model' as const : 'user' as const, parts: [{ text: m.content }] })),
        { role: 'user' as const, parts: [{ text: text || 'Please inspect the attached file(s).' }, ...fileParts] },
      ];
      setDraft(''); setAttachments([]); setIsSending(true); setCoreState('thinking');
      const response = await generateGeminiResponse({
        idToken: await user.getIdToken(), apiKey, model: selectedModel.replace(/^models\//, ''), effort, contents,
        systemInstruction: `You are VOID, the assistant inside VOIDGRAVITY by VOIDROP/C. Be accurate, collaborative, clear, and honest. Do not claim you inspected, executed, uploaded, or tested something unless the application actually did. When a ZIP is attached, distinguish text files actually extracted from binary files only listed. Prefer useful structured answers and practical next steps.\n\nUser-approved saved memory (use only when relevant):\n${memories.slice(0, 20).map((m) => `- ${m.content}`).join('\n') || '(No saved memories.)'}`,
      });
      const answer = extractGeminiText(response);
      if (!answer) throw new Error(response?.promptFeedback?.blockReason ? `Permintaan diblokir: ${response.promptFeedback.blockReason}` : 'Gemini mengembalikan respons kosong.');
      await addMessage(user.uid, conversationId, { role: 'assistant', content: answer });
      setCoreState('done'); window.setTimeout(() => setCoreState('idle'), 1600);
      await refreshConversations();
    } catch (error) {
      setCoreState('error'); notify(error instanceof Error ? error.message : 'Gagal mengirim pesan ke Gemini.', 'error');
      window.setTimeout(() => setCoreState('idle'), 2000);
    } finally { setIsSending(false); }
  };
  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  };

  const addMemory = async (event: FormEvent) => {
    event.preventDefault(); if (!user || !memoryDraft.trim()) return;
    try { await saveMemory(user.uid, memoryDraft.trim()); setMemoryDraft(''); setMemories(await listMemories(user.uid)); notify('Memory disimpan.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Gagal menyimpan memory.', 'error'); }
  };
  const removeMemory = async (id: string) => {
    if (!user || !window.confirm('Hapus memory ini?')) return;
    try { await deleteMemory(user.uid, id); setMemories(await listMemories(user.uid)); }
    catch (error) { notify(error instanceof Error ? error.message : 'Gagal menghapus memory.', 'error'); }
  };
  const savePersonalization = async (event: FormEvent) => {
    event.preventDefault(); if (!user) return;
    setProfileBusy(true);
    try { await saveProfile(user.uid, { displayName: profileName.trim(), about: profileAbout.trim() }); notify('Profil dan personalisasi tersimpan.', 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Gagal menyimpan profil.', 'error'); }
    finally { setProfileBusy(false); }
  };

  const searchGithub = async (event?: FormEvent) => {
    event?.preventDefault(); setGithubBusy(true);
    try {
      const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(githubQuery)}&sort=stars&order=desc&per_page=8`, { headers: { Accept: 'application/vnd.github+json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `GitHub API ${response.status}`);
      setGithubRepos(data.items || []);
    } catch (error) { notify(error instanceof Error ? error.message : 'GitHub search failed.', 'error'); }
    finally { setGithubBusy(false); }
  };
  const downloadStudio = async () => {
    try {
      const zip = new JSZip(); studioFiles.forEach((file) => zip.file(file.name, file.content));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'void-studio-project.zip'; anchor.click(); URL.revokeObjectURL(url);
      notify('ZIP proyek dibuat dan diunduh.', 'success');
    } catch (error) { notify(error instanceof Error ? error.message : 'Gagal membuat ZIP.', 'error'); }
  };
  const updateStudioContent = (content: string) => setStudioFiles((current) => current.map((f) => f.name === activeStudioFile ? { ...f, content } : f));
  const sendCodeToStudio = (content: string) => {
    const matches = [...content.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)];
    if (!matches.length) { notify('Tidak ada fenced code block yang bisa diekspor.', 'info'); return; }
    const extensionMap: Record<string, string> = { html: 'html', css: 'css', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', tsx: 'tsx', jsx: 'jsx', json: 'json', python: 'py', py: 'py', lua: 'lua', sql: 'sql', markdown: 'md', md: 'md', xml: 'xml', yaml: 'yml', bash: 'sh', sh: 'sh' };
    const created = matches.map((match, index) => {
      const info = (match[1] || '').trim();
      const pieces = info.split(/\s+/).filter(Boolean);
      const namedPiece = pieces.find((piece) => piece.startsWith('filename='));
      const explicitName = namedPiece?.slice('filename='.length) || pieces.find((piece) => /\.[a-z0-9]{1,8}$/i.test(piece) && !piece.includes('='));
      const language = pieces[0]?.toLowerCase() || 'txt';
      const filename = (explicitName || `artifact-${String(index + 1).padStart(2, '0')}.${extensionMap[language] || language || 'txt'}`).replace(/\.\./g, '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9._/-]/g, '_');
      return { name: filename, content: match[2].trimEnd() };
    });
    setStudioFiles((current) => { const next = [...current]; for (const item of created) { const index = next.findIndex((f) => f.name === item.name); if (index >= 0) next[index] = item; else next.push(item); } return next; });
    setActiveStudioFile(created[0].name); setView('studio'); notify(`${created.length} code block dikirim ke VOID Studio.`, 'success');
  };
  const addStudioFile = () => {
    const name = window.prompt('Nama file baru (contoh: app.js):');
    if (!name) return;
    if (studioFiles.some((f) => f.name === name)) { notify('Nama file sudah ada.', 'error'); return; }
    setStudioFiles((current) => [...current, { name: name.replace(/[\\/]/g, '-'), content: '' }]); setActiveStudioFile(name.replace(/[\\/]/g, '-'));
  };
  const studioHtml = useMemo(() => {
    const html = studioFiles.find((f) => f.name === 'index.html')?.content || '<main><h1>No index.html</h1></main>';
    const css = studioFiles.find((f) => f.name.endsWith('.css'))?.content || '';
    const js = studioFiles.find((f) => f.name.endsWith('.js'))?.content || '';
    const withCss = html.replace('</head>', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style></head>`);
    return withCss.includes('</body>') ? withCss.replace('</body>', `<script>${js.replace(/<\/script/gi, '<\\/script')}<\/script></body>`) : `${withCss}<script>${js.replace(/<\/script/gi, '<\\/script')}<\/script>`;
  }, [studioFiles]);

  if (authLoading) return <div className="boot-screen"><Core state="thinking"/><Logo/><span>Initializing workspace</span><div className="boot-track"><i/></div></div>;

  if (!user) return <>
    <div className="auth-shell">
      <div className="auth-backdrop"><div className="backdrop-grid"/><div className="backdrop-glow glow-one"/><div className="backdrop-glow glow-two"/></div>
      <div className="auth-nav"><Logo/><span>MADE BY VOIDROP/C</span></div>
      <div className="auth-content">
        <div className="auth-showcase"><div className="eyebrow"><span className="live-dot"/> PERSONAL AI ENVIRONMENT</div><h1>Make room for<br/><em>what's next.</em></h1><p>One intelligence. Multiple workspaces. A clearer way to think, create, and build.</p><div className="auth-core-wrap"><Core state="idle"/><div className="core-caption"><span>VOID CORE</span><small>INTELLIGENCE / CONTEXT / EXECUTION</small></div></div></div>
        <div className="auth-card">
          <div className="auth-card-head"><span className="auth-overline">YOUR WORKSPACE AWAITS</span><h2>Welcome to VOIDGRAVITY</h2><p>Sign in to continue to your private workspace.</p></div>
          {!isFirebaseReady(settings) ? <div className="setup-required"><div className="setup-icon"><Settings size={18}/></div><strong>Initial setup required</strong><p>Firebase Web App config is not connected yet. Add it once in the setup panel, then sign in with Google.</p><button className="btn primary full" onClick={() => { setView('settings'); }}>Open setup <ChevronRight size={16}/></button></div> : <button className="google-button" onClick={handleLogin}><GoogleGlyph/><span>Continue with Google</span><ArrowUp size={15}/></button>}
          <div className="auth-footnote"><ShieldCheck size={14}/> Account data is separated by your Firebase user ID.</div>
        </div>
      </div>
      <div className="auth-footer"><span>VOIDGRAVITY</span><span>BEYOND EVERY BOUNDARY</span><span>© 2026 VOIDROP/C</span></div>
    </div>
    {view === 'settings' && <div className="setup-overlay"><div className="setup-modal"><button className="icon-btn close-modal" onClick={() => setView('chat')}><X size={18}/></button><h2>Connect your services</h2><p className="muted">Firebase web configuration is a public client identifier, not a server secret. Keep private keys and service-role keys out of this form.</p><ServiceForm firebaseJson={serviceFirebaseJson} setFirebaseJson={setServiceFirebaseJson} supabaseUrl={serviceSupabaseUrl} setSupabaseUrl={setServiceSupabaseUrl} supabaseKey={serviceSupabaseKey} setSupabaseKey={setServiceSupabaseKey} bucket={serviceBucket} setBucket={setServiceBucket} onSave={saveServiceConfig}/></div></div>}
    <NoticeStack notices={notices} dismiss={dismissNotice}/>
  </>;

  const activeModel = models.find((m) => m.name === selectedModel);
  const canTuneThinking = supportsThinkingEffort(selectedModel);
  const activeStudio = studioFiles.find((f) => f.name === activeStudioFile) || studioFiles[0];
  const grouped = ['WORKSPACE', 'SYSTEM'];

  return <div className="app-shell">
    <div className={`mobile-scrim ${mobileNav ? 'visible' : ''}`} onClick={() => setMobileNav(false)}/>
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="sidebar-top"><Logo/><button className="icon-btn sidebar-collapse" title="Close menu" onClick={() => setMobileNav(false)}><X size={17}/></button><button className="icon-btn new-chat-btn" title="New chat" onClick={newConversation}><SquarePen size={18}/></button></div>
      <button className="new-chat-row" onClick={newConversation}><Plus size={16}/><span>New conversation</span><kbd>⌘ K</kbd></button>
      <div className="sidebar-scroll">
        {grouped.map((group) => <div className="nav-group" key={group}><div className="nav-label">{group}</div>{navItems.filter((item) => item.group === group).map((item) => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => { setView(item.id); setMobileNav(false); }}><Icon size={17}/><span>{item.label}</span>{item.id === 'studio' && <span className="nav-tag">BETA</span>}</button>; })}</div>)}
        <div className="nav-group history-group"><div className="history-heading"><span className="nav-label">RECENT</span><span>{conversations.length}</span></div>{conversations.length ? conversations.slice(0, 30).map((chat) => <div key={chat.id} className={`history-item ${activeId === chat.id && view === 'chat' ? 'active' : ''}`}><button onClick={() => openConversation(chat.id)}><MessageSquarePlus size={15}/><span>{chat.title || 'New conversation'}</span></button><button className="history-delete" title="Delete conversation" onClick={() => void deleteChat(chat.id)}><X size={13}/></button></div>) : <div className="history-empty">Your conversations will appear here.</div>}</div>
      </div>
      <div className="sidebar-bottom"><div className={`engine-status ${apiKey && !vaultLocked ? 'ready' : ''}`}><span className="status-dot"/><span>{apiKey && !vaultLocked && models.length ? 'Gemini ready' : apiKey && !vaultLocked ? 'Gemini key unlocked' : 'Gemini not connected'}</span><button title="Open settings" onClick={() => setView('settings')}><Settings size={14}/></button></div><button className="profile-mini" onClick={() => setView('profile')}><Avatar user={user}/><span className="profile-mini-copy"><strong>{profileName || user.displayName || 'Your account'}</strong><small>{user.email}</small></span><MoreHorizontal size={17}/></button></div>
    </aside>

    <main className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)}><Menu size={19}/></button><span className="breadcrumb">{view === 'chat' ? 'Workspace' : navItems.find((n) => n.id === view)?.label || (view === 'profile' ? 'Profile' : 'Settings')}</span><span className="topbar-separator">/</span><span className="topbar-context">{view === 'chat' ? activeModel?.displayName || 'General intelligence' : 'VOIDGRAVITY'}</span></div><div className="topbar-right"><span className="secure-indicator"><span/> PRIVATE WORKSPACE</span><button className="icon-btn" title="Settings" onClick={() => setView('settings')}><Settings size={18}/></button><button className="top-avatar-button" onClick={() => setView('profile')}><Avatar user={user}/></button></div></header>

      {view === 'chat' && <div className="chat-layout">
        <div className={`chat-main ${messages.length ? 'has-messages' : ''}`}>
          {messages.length === 0 ? <div className="welcome-stage"><div className="welcome-core"><Core state={coreState}/></div><span className="eyebrow center-eyebrow"><span className="live-dot"/> VOID CORE ONLINE</span><h1>What are we <em>creating</em><br className="desktop-break"/> today?</h1><p className="welcome-subtitle">Think clearly. Build boldly. Make progress with one connected workspace.</p><div className="prompt-grid">{welcomePrompts.map((p, i) => <button key={p.title} className="prompt-card" onClick={() => { setDraft(p.text); composerRef.current?.focus(); }}><span className="prompt-index">0{i + 1}</span><strong>{p.title}</strong><span>{p.text}</span><ArrowUp size={14}/></button>)}</div></div> : <div className="message-list">{messages.map((message) => <MessageBubble key={message.id} message={message} onSendCode={sendCodeToStudio}/>)}{isSending && <div className="assistant-row"><div className="assistant-avatar"><Core state="thinking" small/></div><div className="assistant-thinking"><span>VOID is working</span><div className="thinking-dots"><i/><i/><i/></div></div></div>}<div className="message-bottom-spacer"/></div>}
          <div className="composer-dock"><form className="composer" onSubmit={sendMessage}>
            {attachments.length > 0 && <div className="attachment-strip">{attachments.map((a, i) => <div className="attachment-chip" key={`${a.name}-${i}`}>{a.type.startsWith('image/') && a.previewUrl ? <img src={a.previewUrl} alt=""/> : a.name.endsWith('.zip') ? <FileArchive size={17}/> : a.type.includes('pdf') ? <FileText size={17}/> : <File size={17}/>}<span><strong>{a.name}</strong><small>{readableSize(a.size)}{a.cloudPath ? ' · cloud saved' : ''}</small></span><button type="button" onClick={() => removeAttachment(i)}><X size={14}/></button></div>)}</div>}
            <textarea ref={composerRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onComposerKey} placeholder="Message VOID..." rows={1} aria-label="Message VOID" />
            <div className="composer-toolbar"><div className="composer-tools"><button type="button" className="tool-btn" title="Attach files" onClick={() => fileInputRef.current?.click()}><Paperclip size={17}/><span>Attach</span></button><input ref={fileInputRef} type="file" multiple hidden onChange={(e) => e.target.files && void handleFiles(e.target.files)}/><div className="toolbar-divider"/><div className="model-control"><span className="control-caption">MODEL</span><select aria-label="Model" value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); localStorage.setItem('vg.model', e.target.value); }} disabled={!models.length}>{models.length ? models.map((m) => <option key={m.name} value={m.name}>{m.displayName || m.name.replace(/^models\//, '')}</option>) : <option value="">Connect Gemini</option>}</select><ChevronDown size={12}/></div><div className="toolbar-divider"/><div className="effort-control"><span className="control-caption">THINKING</span><div className={`effort-value ${effort === 'ultra' ? 'ultra' : ''}`}>{canTuneThinking ? effort.toUpperCase() : 'AUTO'}</div><input aria-label="Thinking effort" type="range" min="0" max="3" step="1" disabled={!canTuneThinking} value={['low','medium','high','ultra'].indexOf(effort)} onChange={(e) => { const next = (['low','medium','high','ultra'] as ThinkingEffort[])[Number(e.target.value)]; setEffort(next); localStorage.setItem('vg.effort', next); if (next === 'ultra') notify(supportsXHighThinking(selectedModel) ? 'Ultra memakai XHIGH pada model ini; token dan waktu respons cenderung meningkat.' : 'Model ini tidak menyediakan XHIGH. Ultra dipetakan ke HIGH, yaitu level maksimum resminya.', 'info'); }} className={`effort-slider ${effort === 'ultra' ? 'ultra' : ''}`}/></div></div><button className={`send-button ${draft.trim() || attachments.length ? 'can-send' : ''}`} type="submit" disabled={isSending || (!draft.trim() && !attachments.length)} aria-label="Send message">{isSending ? <LoaderCircle className="spin" size={17}/> : <ArrowUp size={18}/>}</button></div>
          </form><div className="composer-disclaimer">VOID can make mistakes. Verify important information. {!canTuneThinking ? <span className="ultra-note">Thinking configuration unavailable for this model; model default is used.</span> : effort === 'ultra' && <span className="ultra-note">{supportsXHighThinking(selectedModel) ? 'Ultra uses XHIGH; token use and latency may increase.' : 'Ultra maps to HIGH, this model’s documented maximum.'}</span>}</div></div>
        </div>
      </div>}

      {view === 'studio' && <section className="page-content studio-page"><div className="page-heading"><div><span className="eyebrow">CREATION ENVIRONMENT</span><h1>VOID <em>Studio</em></h1><p>Build and preview lightweight web artifacts. Export the actual files as a ZIP project.</p></div><button className="btn primary" onClick={() => void downloadStudio()}><Download size={16}/> Export project</button></div><div className={`studio-workbench ${previewOpen ? 'preview-mode' : ''}`}><div className="studio-files"><div className="panel-title"><FolderOpen size={15}/> FILES <button className="icon-btn tiny" onClick={addStudioFile}><Plus size={15}/></button></div>{studioFiles.map((file) => <button key={file.name} className={`studio-file ${activeStudioFile === file.name ? 'active' : ''}`} onClick={() => setActiveStudioFile(file.name)}><FileCode2 size={14}/>{file.name}</button>)}</div><div className="studio-editor"><div className="editor-head"><span><Code2 size={15}/> {activeStudioFile}</span><div><button className={`seg-btn ${!previewOpen ? 'active' : ''}`} onClick={() => setPreviewOpen(false)}>Code</button><button className={`seg-btn ${previewOpen ? 'active' : ''}`} onClick={() => setPreviewOpen(true)}>Preview</button></div></div>{previewOpen ? <iframe title="VOID Studio preview" sandbox="allow-scripts" srcDoc={studioHtml} className="studio-preview"/> : <textarea className="code-editor" spellCheck={false} value={activeStudio.content} onChange={(e) => updateStudioContent(e.target.value)} aria-label={`Edit ${activeStudioFile}`}/>}<div className="editor-foot"><span>LOCAL ARTIFACT · UNSAVED TO CLOUD</span><span>{activeStudio.content.length.toLocaleString()} chars</span></div></div></div><div className="studio-note"><ShieldCheck size={16}/> Preview runs inside a sandboxed iframe. It does not execute server code, install dependencies, or build native apps.</div></section>}

      {view === 'memory' && <section className="page-content"><div className="page-heading"><div><span className="eyebrow">PERSONAL CONTEXT</span><h1>Memory <em>Engine</em></h1><p>Store useful notes that can be referenced in future conversations. You control every entry.</p></div><div className="heading-icon"><Database size={22}/></div></div><div className="memory-layout"><div className="surface-card memory-compose"><h3>Add a memory</h3><p className="muted">Write a preference, project fact, or recurring instruction. Avoid passwords and sensitive secrets.</p><form onSubmit={addMemory}><textarea value={memoryDraft} onChange={(e) => setMemoryDraft(e.target.value)} rows={4} placeholder="Example: My main development environment is Android + GitHub mobile..."/><button className="btn primary" disabled={!memoryDraft.trim()}><Plus size={16}/> Save memory</button></form></div><div className="surface-card"><div className="section-head"><h3>Saved memories</h3><span className="count-pill">{memories.length}</span></div>{memories.length ? <div className="memory-list">{memories.map((m) => <div className="memory-entry" key={m.id}><div className="memory-pin"><Atom size={16}/></div><p>{m.content}</p><button className="icon-btn danger" onClick={() => void removeMemory(m.id)} title="Delete memory"><Trash2 size={15}/></button></div>)}</div> : <div className="empty-state compact"><Database size={24}/><strong>No memories saved yet</strong><span>Add a note to start building personal context.</span></div>}</div></div></section>}

      {view === 'plugins' && <section className="page-content"><div className="page-heading"><div><span className="eyebrow">CONNECTED CAPABILITIES</span><h1>Plugin <em>Center</em></h1><p>Tools that perform real operations. Available integrations are clearly labeled.</p></div><div className="heading-icon"><Globe2 size={22}/></div></div><div className="plugin-feature surface-card"><div className="plugin-feature-icon"><Github size={24}/></div><div className="plugin-feature-copy"><div className="plugin-topline"><strong>GitHub Public Explorer</strong><span className="status-badge live">AVAILABLE</span></div><p>Search public repositories using the GitHub REST API, inspect project metadata, open source pages, and download repository ZIPs.</p></div><form className="github-search" onSubmit={searchGithub}><div className="search-input"><Search size={16}/><input value={githubQuery} onChange={(e) => setGithubQuery(e.target.value)} placeholder="Search public repositories"/></div><button className="btn primary" disabled={githubBusy}>{githubBusy ? <LoaderCircle className="spin" size={15}/> : <Search size={15}/>} Search</button></form>{githubRepos.length > 0 && <div className="repo-results">{githubRepos.map((repo) => <div className="repo-item" key={repo.id}><div className="repo-main"><strong>{repo.full_name}</strong><p>{repo.description || 'No description provided.'}</p><span><Zap size={12}/> {repo.stargazers_count.toLocaleString()} stars · {repo.language || 'Unknown language'}</span></div><div className="repo-actions"><a href={repo.html_url} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Open repository"><ExternalLink size={16}/></a><a href={repo.html_url.replace(/\/$/, '') + '/archive/refs/heads/' + encodeURIComponent(repo.default_branch) + '.zip'} className="icon-btn" aria-label="Download repository ZIP"><Download size={16}/></a></div></div>)}</div>}</div><div className="plugin-grid"><PluginCard icon={<HardDrive size={21}/>} title="Supabase Storage" description="Private file uploads scoped to the signed-in Firebase UID through third-party JWT trust and Storage policies." status={isSupabaseReady(settings) ? 'CONFIG PRESENT' : 'NEEDS SETUP'} live={isSupabaseReady(settings)}/><PluginCard icon={<Database size={21}/>} title="Firebase Cloud Firestore" description="Per-user chat history, profile, saved memories, and encrypted Gemini key vault." status={isFirebaseReady(settings) ? 'CONFIG PRESENT' : 'NEEDS SETUP'} live={isFirebaseReady(settings)}/><PluginCard icon={<Globe2 size={21}/>} title="Web search" description="Not connected yet. A search provider and secure server-side credential are required before this can run." status="NOT CONNECTED"/><PluginCard icon={<Command size={21}/>} title="GitHub account access" description="Private repository read/write, commits, and pull requests require a GitHub OAuth App or GitHub App backend. Public search above is already live." status="OAUTH REQUIRED"/></div></section>}

      {view === 'usage' && <section className="page-content"><div className="page-heading"><div><span className="eyebrow">TRANSPARENCY & CONTROL</span><h1>Usage <em>Insights</em></h1><p>Live status from configured services. Token totals are shown only when returned by the API.</p></div><div className="heading-icon"><Activity size={22}/></div></div><div className="status-grid"><StatusCard icon={<ShieldCheck size={19}/>} label="FIREBASE AUTH" value={user.email || 'Signed in'} state="Connected" good/><StatusCard icon={<Database size={19}/>} label="FIRESTORE" value="User scoped" state={isFirebaseReady(settings) ? 'Config present' : 'Missing'} good={isFirebaseReady(settings)}/><StatusCard icon={<HardDrive size={19}/>} label="SUPABASE STORAGE" value={settings.bucket} state={isSupabaseReady(settings) ? 'Config present' : 'Missing'} good={isSupabaseReady(settings)}/><StatusCard icon={<Atom size={19}/>} label="GEMINI API" value={activeModel?.displayName || selectedModel || 'No model selected'} state={apiKey && !vaultLocked ? 'Unlocked' : 'Locked'} good={!!apiKey && !vaultLocked}/></div><div className="surface-card usage-explainer"><h3>How usage is handled</h3><p>Gemini usage and quota are controlled by the Google AI account that issued your API key. This starter does not invent token totals or estimate quota remaining. The model request's usage metadata can be surfaced here in a later iteration.</p><button className="btn secondary" onClick={() => setView('settings')}><Settings size={15}/> Review connections</button></div></section>}

      {view === 'settings' && <section className="page-content settings-page"><div className="page-heading"><div><span className="eyebrow">SYSTEM CONFIGURATION</span><h1>Settings & <em>Security</em></h1><p>Connect real services, manage the Gemini key vault, and review your data boundary.</p></div><div className="heading-icon"><Settings size={22}/></div></div><div className="settings-stack"><div className="surface-card"><div className="section-head"><div><h3>Service connections</h3><p className="muted">Firebase config and Supabase publishable/anon key are client-side identifiers. Never paste a service-role key here.</p></div><span className={`status-badge ${isFirebaseReady(settings) ? 'live' : ''}`}>{isFirebaseReady(settings) ? 'FIREBASE READY' : 'NEEDS SETUP'}</span></div><ServiceForm firebaseJson={serviceFirebaseJson} setFirebaseJson={setServiceFirebaseJson} supabaseUrl={serviceSupabaseUrl} setSupabaseUrl={setServiceSupabaseUrl} supabaseKey={serviceSupabaseKey} setSupabaseKey={setServiceSupabaseKey} bucket={serviceBucket} setBucket={setServiceBucket} onSave={saveServiceConfig}/><div className="info-callout"><CircleHelp size={16}/><span>After saving or changing Firebase config, reload the page before signing in. Add your deployed domain to Firebase Authentication's authorized domains.</span></div></div>
        <div className="surface-card"><div className="section-head"><div><h3>Gemini API Key Vault</h3><p className="muted">Your key is encrypted in the browser with AES-GCM and PBKDF2 before the ciphertext is saved to your Firestore account.</p></div><span className={`status-badge ${apiKey && !vaultLocked ? 'live' : ''}`}>{apiKey && !vaultLocked ? 'UNLOCKED' : vaultExists ? 'LOCKED' : 'NOT SET'}</span></div>{!vaultExists || vaultReplace ? <form className="vault-form" onSubmit={storeVault}><label>Gemini API key<div className="secret-input"><input type={showApiKey ? 'text' : 'password'} value={vaultKeyInput} onChange={(e) => setVaultKeyInput(e.target.value)} placeholder="Paste your Gemini API key" autoComplete="off"/><button type="button" onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label><label>Vault passphrase<div className="secret-input"><input type="password" value={vaultPassInput} onChange={(e) => setVaultPassInput(e.target.value)} placeholder="Create a passphrase (10+ characters)" autoComplete="new-password"/></div></label><button className="btn primary" disabled={vaultBusy || !vaultKeyInput || !vaultPassInput}>{vaultBusy ? <LoaderCircle className="spin" size={15}/> : <KeyRound size={15}/>} Encrypt and save key</button>{vaultReplace && <button type="button" className="btn secondary" onClick={() => { setVaultReplace(false); setVaultKeyInput(''); setVaultPassInput(''); }}>Cancel replacement</button>}</form> : vaultLocked ? <form className="vault-form" onSubmit={unlockVault}><label>Vault passphrase<div className="secret-input"><input type="password" value={vaultPassInput} onChange={(e) => setVaultPassInput(e.target.value)} placeholder="Enter your vault passphrase" autoComplete="current-password"/></div></label><button className="btn primary" disabled={vaultBusy || !vaultPassInput}>{vaultBusy ? <LoaderCircle className="spin" size={15}/> : <ShieldCheck size={15}/>} Unlock vault</button><span className="field-hint">The passphrase is never uploaded. If you lose it, the encrypted key cannot be recovered.</span></form> : <div className="vault-unlocked"><div className="vault-secret"><KeyRound size={17}/><span>Gemini key decrypted in session memory</span><span className="masked">••••••••••••</span></div><div className="vault-actions"><button className="btn secondary" onClick={() => void refreshModels()} disabled={vaultBusy}>{vaultBusy ? <LoaderCircle className="spin" size={15}/> : <Activity size={15}/>} Refresh model list</button><button className="btn secondary" onClick={lockVault}><ShieldCheck size={15}/> Lock vault</button><button className="btn secondary" onClick={() => { setVaultReplace(true); setVaultKeyInput(''); setVaultPassInput(''); }}><KeyRound size={15}/> Replace key</button><button className="btn secondary" onClick={() => void removeVault()}><Trash2 size={15}/> Remove saved key</button></div><span className="field-hint">Key ciphertext is stored per account in Firestore. Plaintext is not stored in localStorage or Firestore.</span></div>}<div className="warning-callout"><ShieldCheck size={16}/><span>Browser-based BYOK still means your active page must use the decrypted key to make requests. Keep your account secure, avoid untrusted browser extensions, and revoke a key if you believe it was exposed.</span></div></div>
        <div className="surface-card"><h3>Data & account</h3><div className="security-row"><div><strong>Account isolation</strong><span>Firestore and Storage rules scope data to the authenticated UID.</span></div><span className="status-badge live">OWNER ONLY</span></div><div className="security-row"><div><strong>Switch account</strong><span>Sign out and authenticate with another Google account. Existing data remains under its original account.</span></div><button className="btn secondary" onClick={handleLogout}><LogOut size={15}/> Switch / log out</button></div></div></div></section>}

      {view === 'profile' && <section className="page-content profile-page"><div className="page-heading"><div><span className="eyebrow">YOUR IDENTITY</span><h1>Profile & <em>Personalization</em></h1><p>Control your profile details and how VOID collaborates with you.</p></div><div className="heading-icon"><UserRound size={22}/></div></div><div className="profile-layout"><div className="surface-card profile-summary"><Avatar user={user}/><h3>{profileName || user.displayName || 'Your profile'}</h3><span>{user.email}</span><div className="profile-provider"><CheckCircle2 size={14}/> Google account connected</div><button className="btn secondary full" onClick={handleLogout}><LogOut size={15}/> Switch account / Log out</button></div><div className="surface-card"><h3>Personalization</h3><p className="muted">These preferences are saved to your user profile, not mixed with another account.</p><form className="profile-form" onSubmit={savePersonalization}><label>Display name<input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your display name"/></label><label>About / collaboration preferences<textarea value={profileAbout} onChange={(e) => setProfileAbout(e.target.value)} rows={5} placeholder="How should VOID collaborate with you? Preferred languages, project style, technical context..."/></label><button className="btn primary" disabled={profileBusy}>{profileBusy ? <LoaderCircle className="spin" size={15}/> : <Check size={15}/>} Save personalization</button></form></div></div></section>}
    </main>
    <NoticeStack notices={notices} dismiss={dismissNotice}/>
  </div>;
}

function MessageBubble({ message, onSendCode }: { message: ChatMessage; onSendCode: (content: string) => void }) {
  return <div className={`message-row ${message.role}`}>
    {message.role === 'assistant' && <div className="assistant-avatar"><Core small/></div>}
    <div className="message-body"><div className="message-meta">{message.role === 'assistant' ? 'VOID' : 'YOU'} <span>·</span> {message.role === 'assistant' ? 'RESPONSE' : 'MESSAGE'}</div><div className={`message-content ${message.role}`}><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>{message.attachments?.length ? <div className="message-attachments">{message.attachments.map((a: any, i: number) => <div className="saved-attachment" key={i}><File size={14}/><span>{a.name}</span><small>{readableSize(a.size || 0)}</small>{a.cloudPath && <CheckCircle2 size={13}/>}</div>)}</div> : null}{message.role === 'assistant' && /```[\s\S]*?```/.test(message.content) && <div className="message-action-row"><button className="message-action" onClick={() => onSendCode(message.content)}><Code2 size={13}/> Send code blocks to Studio</button><button className="message-action" onClick={() => navigator.clipboard?.writeText(message.content)}><Copy size={13}/> Copy response</button></div>}</div>
    {message.role === 'user' && <div className="user-message-mark">U</div>}
  </div>;
}
function PluginCard({ icon, title, description, status, live = false }: { icon: any; title: string; description: string; status: string; live?: boolean }) {
  return <div className="plugin-card surface-card"><div className="plugin-card-icon">{icon}</div><div className="plugin-card-copy"><strong>{title}</strong><p>{description}</p></div><span className={`status-badge ${live ? 'live' : ''}`}>{status}</span></div>;
}
function StatusCard({ icon, label, value, state, good }: { icon: any; label: string; value: string; state: string; good?: boolean }) {
  return <div className="surface-card status-card"><div className="status-card-head"><span>{icon}</span><small>{label}</small></div><strong>{value}</strong><span className={`status-line ${good ? 'good' : ''}`}><i/>{state}</span></div>;
}
function ServiceForm({ firebaseJson, setFirebaseJson, supabaseUrl, setSupabaseUrl, supabaseKey, setSupabaseKey, bucket, setBucket, onSave }: {
  firebaseJson: string; setFirebaseJson: (v: string) => void; supabaseUrl: string; setSupabaseUrl: (v: string) => void;
  supabaseKey: string; setSupabaseKey: (v: string) => void; bucket: string; setBucket: (v: string) => void; onSave: () => void;
}) {
  return <div className="service-form"><label>Firebase Web App config JSON<textarea className="config-editor" rows={6} spellCheck={false} value={firebaseJson} onChange={(e) => setFirebaseJson(e.target.value)} placeholder={'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "projectId": "...",\n  "appId": "..."\n}'}/></label><div className="form-grid"><label>Supabase Project URL<input value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} placeholder="https://your-project.supabase.co"/></label><label>Supabase publishable / anon key<input value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} placeholder="sb_publishable_... or legacy anon key" autoComplete="off"/></label></div><label>Private Storage bucket name<input value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="void-files"/></label><button className="btn primary" onClick={onSave}><Check size={15}/> Save service configuration</button></div>;
}
function GoogleGlyph() { return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.09-1.92 3.27-4.75 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.28-1.93-6.15-4.53H2.16v2.87A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.85 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.35-2.11V7.02H2.16A11 11 0 0 0 1 12c0 1.78.43 3.46 1.16 4.98l3.69-2.87Z"/><path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.08 14.97 1 12 1a11 11 0 0 0-9.84 6.02l3.69 2.87C6.72 7.29 9.14 5.36 12 5.36Z"/></svg>; }
