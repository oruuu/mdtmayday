# Mayday Police MDT V2 Full

1. Supabase → SQL Editor → run `supabase/schema.sql`.
2. Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Deploy Vercel: build `npm run build`, output `dist`.
4. Super Admin: Supabase → profiles → set `status=ACTIVE`, `jabatan=SUPER ADMIN`, `rank_detail=Super Admin`, `divisi=SETUM`.
5. Bot Wispbyte: root perlu `index.js`, `package.json`, `.env`. Startup: `npm install && npm start`.
6. Aktifkan Discord Developer Portal → Bot → SERVER MEMBERS INTENT.
7. Setup channel: `/setup tipe:absensi_sabhara channel:#absensi-sabhara`, dst.
