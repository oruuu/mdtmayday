# Mayday Police MDT - Vercel + Supabase

## 1. Pasang Supabase
Supabase → SQL Editor → paste `supabase/schema.sql` → Run.

## 2. Discord OAuth di Supabase
Authentication → Providers → Discord → Enable.
Redirect URL di Discord Developer Portal:
https://PROJECT_ID.supabase.co/auth/v1/callback

## 3. Vercel Environment
Vercel → Project Settings → Environment Variables:
VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=anon_public_key

## 4. Deploy Vercel
Build command: npm run build
Output directory: dist

## 5. Test User
Login Discord pertama status PENDING.
Buka Supabase → Table Editor → profiles → ubah status jadi ACTIVE.

## 6. Bot
Isi `bot/.env`, lalu:
npm run bot

## 7. Setup Channel Discord
/setup tipe:absensi_sabhara channel:#absensi-sabhara
/setup tipe:absensi_satbrimob channel:#absensi-satbrimob
/setup tipe:absensi_satlantas channel:#absensi-satlantas
/setup tipe:absensi_polairud channel:#absensi-polairud
/setup tipe:absensi_bareskrim channel:#absensi-bareskrim
/setup tipe:absensi_setum channel:#absensi-setum
/setup tipe:absensi_bidpropam channel:#absensi-bidpropam
/setup tipe:absensi_casis channel:#absensi-casis
/setup tipe:audit_log channel:#audit-log
/settings
