# Mayday MDT V2.1 Full Update

## Pasang
1. Timpa file lama `src/app.js` dengan file ini.
2. Paste isi `src/style_patch.css` ke bagian PALING BAWAH `src/style.css`.
3. Jalankan `supabase/patch_v2_1.sql` di Supabase SQL Editor.
4. Commit & push ke GitHub.
5. Vercel redeploy otomatis.

## Update fitur
- Buku Saku dihapus dari menu/navigasi.
- Tombol KELUAR KE MENU di halaman selain dashboard.
- BIDPROPAM SP/PTDH punya tombol keluar ke menu.
- PATI dan SUPER ADMIN bisa ACC/TOLAK absensi di web.
- Log absensi menampilkan keterangan, lokasi, bukti, dan alasan tolak.
- Username/display name bisa diedit dari Admin > Anggota.
- Admin punya tab ACC ABSENSI.
