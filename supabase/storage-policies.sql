-- 1) Create a PRIVATE bucket named `void-files` in Supabase Storage.
-- 2) Add Firebase as a Third-party Auth provider in Supabase Authentication settings.
-- 3) Replace YOUR_FIREBASE_PROJECT_ID below with the exact Firebase project ID.
-- Firebase default ID tokens do not include Supabase's `role: authenticated` claim,
-- so these policies apply to the `anon` database role BUT only when the signed JWT
-- issuer and audience prove it came from this exact Firebase project.

create policy "Firebase users upload only into their own folder"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'void-files'
  and (select auth.jwt() ->> 'iss') = 'https://securetoken.google.com/YOUR_FIREBASE_PROJECT_ID'
  and (select auth.jwt() ->> 'aud') = 'YOUR_FIREBASE_PROJECT_ID'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "Firebase users read only their own files"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'void-files'
  and (select auth.jwt() ->> 'iss') = 'https://securetoken.google.com/YOUR_FIREBASE_PROJECT_ID'
  and (select auth.jwt() ->> 'aud') = 'YOUR_FIREBASE_PROJECT_ID'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "Firebase users delete only their own files"
on storage.objects for delete to anon, authenticated
using (
  bucket_id = 'void-files'
  and (select auth.jwt() ->> 'iss') = 'https://securetoken.google.com/YOUR_FIREBASE_PROJECT_ID'
  and (select auth.jwt() ->> 'aud') = 'YOUR_FIREBASE_PROJECT_ID'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);

create policy "Firebase users update only their own files"
on storage.objects for update to anon, authenticated
using (
  bucket_id = 'void-files'
  and (select auth.jwt() ->> 'iss') = 'https://securetoken.google.com/YOUR_FIREBASE_PROJECT_ID'
  and (select auth.jwt() ->> 'aud') = 'YOUR_FIREBASE_PROJECT_ID'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
)
with check (
  bucket_id = 'void-files'
  and (select auth.jwt() ->> 'iss') = 'https://securetoken.google.com/YOUR_FIREBASE_PROJECT_ID'
  and (select auth.jwt() ->> 'aud') = 'YOUR_FIREBASE_PROJECT_ID'
  and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
);
