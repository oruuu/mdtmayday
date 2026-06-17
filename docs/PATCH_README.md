# Mayday MDT V2.1 Patch

Update ini memenuhi request:
- Buku Saku dihapus dari menu/navigasi.
- Tombol `KELUAR KE MENU` di semua halaman selain dashboard.
- BIDPROPAM SP/PTDH punya tombol keluar ke menu.
- PATI dan SUPER ADMIN bisa ACC/TOLAK absensi dari web.
- Log absensi menampilkan keterangan, lokasi, bukti, dan status.
- Username/display name anggota bisa diedit dari Admin > Anggota.
- Admin panel punya tab `ACC ABSENSI`.

## 1. Supabase
Jalankan file:
`supabase/patch_v2_1.sql`

## 2. CSS
Copy isi:
`src/style_patch.css`

Lalu paste di paling bawah file `src/style.css` web kamu.

## 3. src/app.js
Ikuti snippet di `src/app_patch_snippets.md`.
Kalau mau cepat, kirim file `src/app.js` kamu yang terbaru, nanti bisa dibuatkan replacement full yang 100% cocok.
