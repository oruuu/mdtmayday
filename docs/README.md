# Mayday MDT V2.2 Full Features

## Fitur masuk
- Dashboard anggota online
- Last login dan last seen
- Total absensi bulan ini
- Riwayat jabatan
- Riwayat SP
- Riwayat mutasi divisi
- Search anggota realtime
- Badge generator otomatis
- Approval user baru dari web
- Audit log lengkap siapa edit siapa
- Notifikasi Discord saat ACC/Tolak absensi via bot_events
- Upload bukti lebih dari 1 foto
- Export PDF laporan via browser print/save PDF
- Leaderboard absensi bulanan
- SP/PTDH bisa dihapus dan masuk audit log

## Cara pasang
1. Timpa `src/app.js` dengan file di folder `src/app.js`.
2. Paste isi `src/style_patch.css` ke paling bawah `src/style.css`.
3. Jalankan `supabase/v2_2_full_features.sql` di Supabase SQL Editor.
4. Update bot dengan snippet `bot/bot_events_patch.js`.
5. Push ke GitHub dan tunggu Vercel redeploy.

## Catatan penting
- Notifikasi Discord dari web tidak bisa langsung kirim ke Discord tanpa bot.
- Web akan insert event ke tabel `bot_events`.
- Bot harus watch tabel `bot_events` untuk mengirim notifikasi ke Discord.
