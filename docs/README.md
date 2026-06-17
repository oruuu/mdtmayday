# Mayday Police MDT V2

Ini starter full project untuk:
- Website MDT
- Cloudflare Worker API
- Cloudflare D1 database
- Cloudflare R2 storage placeholder
- Discord Bot 24/7
- Setting channel dari Discord command `/setup`

## Fitur yang sudah disusun
- Login Discord simulasi
- Pending akun
- ACC/Tolak user baru
- Default ACC jadi CASIS
- Jabatan dan Divisi terpisah
- Absensi Hadir/Izin/Cuti
- Bot kirim absensi ke channel berdasarkan divisi
- Tombol ACC/Tolak di Discord
- Database schema D1
- Setting channel dari bot Discord
- BIDPROPAM SP1/SP2/SP3/PTDH starter
- Laporan OPS starter
- Payroll starter
- Buku Saku starter

## Struktur Divisi
- CASIS
- SABHARA
- SATBRIMOB
- SATLANTAS
- POLAIRUD
- BARESKRIM
- SETUM
- BIDPROPAM

## Struktur Jabatan
- CASIS
- TAMTAMA
- BINTARA
- PAMA
- PAMEN
- PATI
- SUPER ADMIN

## Install lokal
```bash
npm install
npm run dev
```

## Deploy Cloudflare D1
```bash
npx wrangler login
npx wrangler d1 create mayday-police-mdt
```

Copy `database_id` hasil command ke `wrangler.toml`.

Lalu jalankan schema:
```bash
npx wrangler d1 execute mayday-police-mdt --file=database/schema.sql
```

## Deploy Worker
Edit `wrangler.toml`:
```toml
DEFAULT_GUILD_ID = "ID_SERVER_DISCORD"
BOT_WEBHOOK_URL = "https://domain-bot-kamu.com/worker-event"
BOT_API_SECRET = "secret_sama_dengan_env_bot"
```

Deploy:
```bash
npm run worker:deploy
```

## Deploy Website ke Cloudflare Pages
1. Push project ke GitHub.
2. Buka Cloudflare Dashboard.
3. Workers & Pages.
4. Create Pages.
5. Connect GitHub.
6. Build command:
```bash
npm run build
```
7. Output directory:
```bash
dist
```

## Setup Bot Discord
Masuk folder project, buat env:
```bash
cp bot/.env.example bot/.env
```

Isi:
```env
DISCORD_BOT_TOKEN=token_bot
DISCORD_CLIENT_ID=client_id_bot
DISCORD_GUILD_ID=id_server

WORKER_API_URL=https://worker-kamu.workers.dev
WORKER_API_SECRET=secret_sama_dengan_worker
BOT_PORT=3001
```

Jalankan:
```bash
npm run bot
```

## Setup Channel dari Discord
Di Discord, gunakan command:

```bash
/setup tipe:absensi_sabhara channel:#absensi-sabhara
/setup tipe:absensi_satbrimob channel:#absensi-satbrimob
/setup tipe:absensi_satlantas channel:#absensi-satlantas
/setup tipe:absensi_polairud channel:#absensi-polairud
/setup tipe:absensi_bareskrim channel:#absensi-bareskrim
/setup tipe:absensi_setum channel:#absensi-setum
/setup tipe:absensi_bidpropam channel:#absensi-bidpropam
/setup tipe:absensi_casis channel:#absensi-casis
/setup tipe:laporan_operasi channel:#laporan-operasi
/setup tipe:payroll channel:#payroll
/setup tipe:audit_log channel:#audit-log
/setup tipe:propam_log channel:#propam-log
/setup tipe:verifikasi_user channel:#verifikasi-user
```

Lihat setting:
```bash
/settings
```

## Catatan Penting
- Upload foto ke R2 belum dibuat full di starter ini. Saat production, form upload harus diarahkan ke endpoint upload R2.
- Discord OAuth production belum dibuat full. UI saat ini masih simulasi.
- Worker sudah punya database dan event ke bot.
- Bot sudah bisa menerima event dari Worker dan kirim embed absensi ke channel yang diset dari `/setup`.

## Lanjutan yang perlu dikerjakan
1. Discord OAuth asli.
2. Upload foto ke R2.
3. Admin role permission asli.
4. CRUD buku saku.
5. Payroll approval penuh.
6. Verifikasi user baru dari Discord embed.
