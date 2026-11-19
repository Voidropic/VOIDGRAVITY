# Panduan pemasangan VOIDGRAVITY (HP Android + GitHub)

Panduan ini dibuat supaya repository bisa disiapkan dari HP. Tidak ada API key atau service-role key yang perlu ditulis ke source code.

## 0. Sebelum mulai

Siapkan akun GitHub, Google, Firebase, dan Supabase. Buat project Firebase dan Supabase milikmu sendiri. Project cloud dan API key tidak ikut di dalam ZIP ini; memang harus dibuat dari akun pemilik aplikasi.

**Penting:** GitHub Pages hanya meng-host file frontend statis. Karena itu Gemini API key diproses melalui Supabase Edge Function, bukan ditanam di JavaScript publik. Edge Function memverifikasi Firebase ID token sebelum meneruskan request.

## 1. Upload ZIP ke GitHub

1. Download `VOIDGRAVITY-VOIDROP-C.zip` ke HP lalu ekstrak dengan file manager atau Termux.
2. Buat repository baru di GitHub bernama **VOIDGRAVITY**. Pilih Private kalau source project tidak ingin langsung terlihat publik. GitHub Pages untuk akun/repository tertentu bisa memiliki aturan plan dan visibility yang berbeda; ikuti pengaturan Pages yang ditampilkan di akunmu.
3. Di Termux, masuk ke folder hasil ekstrak. Jalankan:

   ```bash
   cd /path/ke/VOIDGRAVITY-VOIDROP-C
   git init
   git branch -M main
   git add .
   git commit -m "Initial VOIDGRAVITY workspace"
   git remote add origin https://github.com/USERNAME/VOIDGRAVITY.git
   git push -u origin main
   ```

   Ganti `USERNAME` dengan username GitHub milikmu. Saat Git meminta autentikasi, gunakan flow GitHub yang resmi; jangan menaruh token ke source code atau file ZIP.
4. Pastikan struktur repository terlihat seperti ini: `src/`, `public/`, `supabase/`, `firestore.rules`, `.github/`, `package.json`.
5. Jangan mengunggah folder `node_modules` atau `dist`. Keduanya dibuat saat build dan sudah masuk `.gitignore`.

6. Setelah project Firebase dan Supabase dibuat (langkah 3 dan 4 di bawah), buka repository → Settings → Secrets and variables → Actions → **Variables**. Tambahkan variable berikut agar semua pengguna mendapat konfigurasi project yang sama pada hasil deploy:
   - `FIREBASE_WEB_CONFIG` = objek `firebaseConfig` satu baris JSON dari Firebase Web App.
   - `SUPABASE_URL` = Project URL Supabase.
   - `SUPABASE_PUBLISHABLE_KEY` = Supabase publishable key (atau legacy anon key).
   - `SUPABASE_BUCKET` = `void-files`.
   - Opsional `VITE_BASE` = `/` bila memakai custom domain pada root; tanpa ini workflow otomatis memakai `/<nama-repo>/`.

   Nilai tersebut adalah identifier client-side yang memang terlihat di browser. Jangan masukkan Supabase service-role/secret key atau Firebase Admin service-account JSON. Jika variables ini belum diisi, halaman akan meminta konfigurasi lokal pada browser dan setiap browser harus mengaturnya sendiri.

> Kalau tidak memakai Termux, kamu bisa mengunggah file melalui GitHub web `Add file → Upload files`, tetapi untuk banyak folder bertingkat lebih mudah memakai Git/Termux.

## 2. Firebase Authentication + Firestore

1. Buka [Firebase Console](https://console.firebase.google.com/) dan buat project.
2. Di Project Overview, tambahkan aplikasi Web (`</>`). Beri nama misalnya `VOIDGRAVITY Web`.
3. Salin objek `firebaseConfig` dari Firebase. Isinya berupa `apiKey`, `authDomain`, `projectId`, `appId`, dan mungkin `storageBucket`, `messagingSenderId`.
4. Di VOIDGRAVITY, buka Settings → Service connections. Tempel seluruh objek JSON itu pada bagian **Firebase Web App config JSON**.
5. Di Firebase Console → Authentication → Sign-in method / Sign-in providers, aktifkan **Google**.
6. Di Authentication → Settings → Authorized domains, tambahkan domain website yang akan dipakai, misalnya `USERNAME.github.io`. Jangan tambahkan URL project path; masukkan host/domain saja.
7. Buka Firestore Database → Create database. Pilih lokasi yang sesuai. Setelah database dibuat, buka Rules.
8. Ganti rules dengan isi file `firestore.rules` dari repository, lalu Publish.
9. Simpan konfigurasi di VOIDGRAVITY, lalu muat ulang halaman. Setelah itu tombol **Continue with Google** akan aktif.

Firestore rules yang disertakan membatasi dokumen `/users/{uid}` beserta subcollection-nya hanya untuk pemilik UID tersebut. Jangan mengganti rules ini menjadi `allow read, write: if true`.

## 3. Supabase Storage

1. Buat project di [Supabase](https://supabase.com/dashboard/).
2. Buka Storage → New bucket. Nama bucket harus **`void-files`**, dan pastikan **Public bucket** dimatikan.
3. Buka Authentication → Third-party Auth → Add integration → Firebase. Masukkan Firebase Project ID dari Firebase Console (bukan Web API key).
4. Buka SQL Editor di Supabase. Buka file repository `supabase/storage-policies.sql`, ganti semua teks `YOUR_FIREBASE_PROJECT_ID` dengan Project ID Firebase yang tepat, lalu jalankan SQL tersebut satu kali.
5. Policies menggunakan role `anon` dengan syarat issuer, audience, dan folder UID cocok dengan Firebase project. Ini disengaja: Firebase ID token default tidak otomatis membawa claim Supabase `role: authenticated`. Policy tetap menolak token publik biasa karena issuer/audience harus cocok.
6. Buka Supabase Project Settings → API. Salin **Project URL** dan **publishable key** (atau legacy anon key). Jangan pernah menggunakan `service_role` / secret key di aplikasi web.
7. Masukkan Project URL, publishable/anon key, dan bucket `void-files` ke Settings → Service connections di VOIDGRAVITY. Simpan.

Supabase Third-party Auth resmi mendukung Firebase JWT untuk akses Storage. Lihat [panduan Firebase Auth Supabase](https://supabase.com/docs/guides/auth/third-party/firebase-auth). Storage RLS wajib aktif agar pengguna hanya bisa membaca dan menulis folder miliknya.

## 4. Deploy Gemini Edge Function lewat GitHub Actions

Function ini menerima Firebase ID token, memverifikasinya terhadap Firebase project kamu, lalu meneruskan request ke Gemini menggunakan key yang diberikan saat runtime. Kode function ini tidak menyimpan atau mencatat Gemini key.

1. Di Supabase Dashboard, buka Account → Access Tokens, buat Personal Access Token khusus deployment, dan salin sementara.
2. Di GitHub repository → Settings → Secrets and variables → Actions:
   - Tambahkan **Repository secret** `SUPABASE_ACCESS_TOKEN` = token Supabase tadi.
   - Tambahkan **Repository secret** `FIREBASE_PROJECT_ID` = Firebase Project ID.
   - Tambahkan **Repository variable** `SUPABASE_PROJECT_REF` = project ref Supabase (bagian awal hostname `https://PROJECT_REF.supabase.co`).
3. Buka tab Actions di repository. Pilih workflow **Deploy VOIDGRAVITY Gemini Edge Function**, lalu tekan Run workflow. Workflow juga akan berjalan saat file dalam `supabase/` berubah dan di-push ke `main`.
4. Pastikan job selesai dengan status hijau. Di Supabase → Edge Functions, harus muncul function `gemini-proxy`.
5. Workflow mengatur secret function `FIREBASE_PROJECT_ID` di Supabase dan deploy dengan `verify_jwt` platform dimatikan. Jangan mengaktifkannya kembali: function melakukan verifikasi Firebase JWT sendiri. Jika fungsi belum ter-deploy, pemanggilan Gemini akan menampilkan error, bukan status sukses palsu.

Supabase mendokumentasikan deployment Edge Functions via GitHub Actions. Lihat [Deploy to Production](https://supabase.com/docs/guides/functions/deploy) dan [GitHub Actions](https://supabase.com/docs/guides/functions/examples/github-actions).

## 5. GitHub Pages (website)

1. Pastikan workflow `.github/workflows/deploy.yml` ikut ter-upload.
2. Repository → Settings → Pages.
3. Pada **Build and deployment**, pilih **GitHub Actions** sebagai Source.
4. Buka tab Actions. Workflow **Build and deploy VOIDGRAVITY to GitHub Pages** akan install dependencies, build, dan publish folder `dist`.
5. Tunggu job selesai. URL biasanya `https://USERNAME.github.io/VOIDGRAVITY/`.
6. Pastikan domain `USERNAME.github.io` sudah di Authorized domains Firebase.
7. Jika nama repository bukan `VOIDGRAVITY`, workflow tetap menyetel `VITE_BASE` otomatis sesuai nama repo pada build berikutnya.

Dokumentasi Vite menjelaskan bahwa project path GitHub Pages memerlukan `base` yang sesuai dan deployment via GitHub Actions: [Vite static deployment](https://vite.dev/guide/static-deploy).

## 6. Tambahkan Gemini API key

1. Buka website VOIDGRAVITY dan login dengan Google.
2. Buka Settings → Gemini API Key Vault.
3. Tempel Gemini API key yang dibuat dari [Google AI Studio](https://aistudio.google.com/apikey).
4. Buat passphrase vault minimal 10 karakter. Simpan passphrase itu di tempat aman; passphrase tidak disimpan oleh aplikasi dan tidak bisa dipulihkan oleh server.
5. Tekan **Encrypt and save key**. App akan mengenkripsi key di browser dengan AES-GCM dan PBKDF2, lalu menyimpan ciphertext, salt, dan IV ke Firestore milik UID tersebut.
6. App mencoba mengambil daftar model dari endpoint Gemini. Model hanya tampil jika API mengembalikan dukungan `generateContent`.
7. Setelah logout atau membuka perangkat lain, buka Vault dan masukkan passphrase untuk dekripsi di browser. Key plaintext hanya dipakai di memori sesi dan dikirim lewat HTTPS ke Edge Function ketika request AI dibuat.

**Keamanan BYOK:** browser aktif tetap perlu memegang key yang telah dibuka untuk membuat request. Jangan memasang ekstensi browser yang tidak dipercaya. Jika key terpapar, revoke key itu di Google AI Studio lalu ganti di vault.

Gemini API model list dapat berubah. Aplikasi mengambil daftar live dari API, bukan menyimpan daftar nama model fiktif. Kontrol thinking diadaptasikan: `Ultra` berarti maksimum yang didukung oleh model (Gemini 4 Neon/Hydrogen dapat memakai `xhigh`; keluarga model lain yang didukung memakai `high`). Tidak semua model mempunyai level identik.

## 7. Uji fitur satu per satu

- **Login:** Google redirect sign-in dan sign-out. Untuk switch account, login meminta pemilih akun Google.
- **Chat:** kirim prompt pendek. Percakapan dan pesan muncul kembali setelah reload dan login ulang dengan akun yang sama.
- **Model selector:** Settings harus berhasil mengambil model dari Gemini API. Jika kosong, periksa API key, API enablement, quota, dan Edge Function deployment.
- **Thinking:** pilih Low / Medium / High / Ultra lalu kirim pesan; parameter dipetakan ke thinking config model, bukan hanya animasi.
- **Image:** lampirkan PNG/JPG/WEBP kecil dan minta deskripsi. Gemini harus menerima media inline.
- **PDF:** lampirkan PDF dan tanyakan isinya. App mencoba mengekstrak text di browser serta mengirim PDF asli sebagai media jika ukuran sesuai.
- **ZIP:** lampirkan ZIP. App membaca daftar entry dan mengekstrak file teks yang didukung (maksimal 200 entry dan batas teks), lalu menyertakan hasil itu ke prompt. Binary hanya dicantumkan. Isi ZIP tidak dieksekusi.
- **Supabase:** setelah upload, cek Storage → `void-files` → folder UID. Pastikan file berada di folder UID pengguna yang benar.
- **Memory:** simpan satu memori, mulai chat baru, dan cek apakah konteks itu relevan digunakan.
- **Profile:** ubah display name/about, reload, dan cek apakah tersimpan.
- **Studio:** ubah `index.html`, pilih Preview, lalu Export project. Hasil unduhan adalah ZIP file yang benar.
- **GitHub Public Explorer:** cari nama repository publik dan buka hasilnya.

## 8. Batasan yang perlu diketahui

- GitHub Pages tidak menjalankan backend/Node server. Supabase Edge Function adalah bagian serverless yang terpisah.
- Build workflow perlu mengunduh paket npm. Jika GitHub Actions gagal karena dependency/network, lihat log job dan perbaiki di repository; build belum dapat dinyatakan sukses sampai job hijau.
- Firebase/Supabase free tier memiliki kuota, batas ukuran, jeda proyek tidak aktif, dan kebijakan yang bisa berubah. Tidak ada jaminan tanpa batas atau selalu gratis.
- Supabase free storage memiliki batas file/bandwidth; aplikasi ini membatasi file lokal hingga 25 MB untuk pemrosesan.
- Gemini Developer API mempunyai batas model, kuota, billing, dan dukungan media yang mengikuti project/key Google kamu.
- Web search, GitHub private access, cloud terminal, dependency build, native APK build, collaborative editing, and full task automation are not implemented in this starter. They are not shown as connected features.

## 9. Troubleshooting singkat

**Continue with Google tidak jalan:** cek Google provider enabled, authorized domain, `authDomain`, `projectId`, dan reload setelah menyimpan config.

**Firestore permission denied:** publish `firestore.rules`, pastikan login, dan jangan ganti UID atau project ID secara acak.

**Supabase upload 401 / RLS denied:** pastikan third-party Firebase integration aktif, Firebase project ID benar, storage bucket `void-files` private, SQL policies sudah disesuaikan, dan ID token terbaru dipakai.

**Gemini Edge Function 401:** pastikan GitHub secret `FIREBASE_PROJECT_ID` dan Supabase secret function cocok dengan project ID Firebase. Pastikan function dideploy dengan `--no-verify-jwt` karena function memverifikasi Firebase JWT di dalam kode.

**Gemini model list kosong:** validasi key di Google AI Studio, pastikan Gemini API aktif, periksa kuota, dan lihat log function di Supabase. Model list hanya menampilkan model dengan `generateContent`.

**Halaman GitHub Pages blank:** periksa workflow Pages, nama repository, path URL, serta build log. Workflow sudah set `VITE_BASE` otomatis; jika deploy manual di tempat lain, set base sesuai path host.
