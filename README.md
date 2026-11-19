# VOIDGRAVITY

**Beyond Every Boundary.**  
A connected AI workspace by **VOIDROP/C**.

This repository contains the initial working foundation for VOIDGRAVITY: a responsive chat workspace, Firebase account and chat persistence, an encrypted BYOK Gemini key vault, dynamic Gemini model discovery, a real Gemini proxy Edge Function, file processing, private Supabase Storage integration, a lightweight file studio, saved memories, profile personalization, and a live GitHub public-repository explorer.

## Architecture

- **Frontend:** React + TypeScript + Vite. Static output is deployed to GitHub Pages.
- **Identity & history:** Firebase Authentication (Google redirect sign-in) + Cloud Firestore.
- **File storage:** Supabase Storage private bucket. Firebase ID tokens are trusted through Supabase Third-party Auth; Storage RLS checks Firebase issuer, audience, and UID folder.
- **Gemini:** Supabase Edge Function verifies Firebase ID tokens and forwards BYOK requests to the Gemini Developer API. The user's key is not stored in the function and is not written to logs by this code.
- **Key vault:** AES-GCM with a key derived through PBKDF2-SHA256 in the browser. Firestore receives only ciphertext, salt, and IV. The passphrase is never stored.

GitHub Pages is static hosting; it must never contain server secrets. Vite needs the correct `base` for a repository subpath. The included GitHub Actions workflow sets it automatically. See [Vite's GitHub Pages deployment guide](https://vite.dev/guide/static-deploy).

## Important boundaries

- Google sign-in, Firestore history, Gemini requests, Storage uploads, and the GitHub public search become live only after you configure your own Firebase/Supabase/Gemini credentials and deploy the Edge Function.
- The GitHub plugin in this starter searches public repositories and links to their pages/downloads. Private repository access, commits, and pull requests are **not** included; they require a proper GitHub App/OAuth backend.
- The Studio provides real local text-file editing, an HTML preview sandbox, and ZIP export. It is not a cloud IDE, server runtime, Android build environment, or dependency installer.
- Uploaded ZIP archives are inspected in browser memory. Supported text files are decoded and passed to Gemini as extracted context. Binary entries are listed but not executed or decoded. No archive entry is extracted to the device filesystem.
- Images and PDFs are passed as actual Gemini inline media for supported models and within the app's 25 MB upload ceiling. DOCX/XLSX/text files are parsed in-browser. Unsupported binary formats are stored as attachments but are not claimed to be understood by Gemini.
- Token usage/quota is not fabricated. This starter does not yet expose the complete usage metadata dashboard.
- Thinking levels are mapped to documented API levels. `Ultra` maps to `XHIGH` only on the Gemini 4 Neon/Hydrogen model families; other supported reasoning models receive their documented `HIGH` maximum. It is not a made-up higher parameter.

## Run locally

```bash
npm install
VITE_BASE=/ npm run dev
```

Open the local address printed by Vite. The application requires a Firebase Web App config to sign in. You can paste it in the setup panel, or configure it from the Settings view after the app loads. The service config can be preloaded at build time with GitHub Actions repository variables (`FIREBASE_WEB_CONFIG`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_BUCKET`). The setup form stores overrides in this browser's local storage. Firebase client config and Supabase publishable keys are public client identifiers, not service secrets.

## Build

```bash
npm run build
```

## Setup guide

Read [docs/SETUP_ID.md](docs/SETUP_ID.md) for the exact Firebase, Supabase, Gemini, and GitHub Pages steps.

## Security files

- `firestore.rules` — owner-only Firestore access.
- `supabase/storage-policies.sql` — private-bucket Storage rules. Replace the Firebase project ID placeholder before running.
- `supabase/functions/gemini-proxy/index.ts` — Firebase JWT verification + Gemini proxy.
- `.github/workflows/deploy-supabase.yml` — deploys the Edge Function after GitHub repository secrets/variables are configured.

Never add Firebase Admin service-account JSON, Supabase service-role keys, Supabase access tokens, or Gemini API keys to this repository.
