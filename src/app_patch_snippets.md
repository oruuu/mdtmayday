# Patch snippets untuk src/app.js

## A. Tambahkan helper akses
Cari bagian `const HIGH...` / `const CAN_MANAGE...`, lalu tambahkan:

```js
const COMMAND = ["PATI", "SUPER ADMIN"];
function canApproveAttendance(){ return COMMAND.includes(STATE.profile?.jabatan); }
```

## B. Ganti function `top(title)` menjadi:

```js
function top(title, showExit = true){
  const p = STATE.profile;
  return `<header class="topbar">
    <div class="top-title">
      <img src="/logo.png"/>
      <div><h1>${title}</h1><small>MAYDAY POLICE MDT V2</small></div>
    </div>
    <div class="top-actions">
      ${showExit && STATE.page !== "dashboard" ? `<button class="exit-btn" onclick="go('dashboard')">← KELUAR KE MENU</button>` : ""}
      ${p ? `<img class="avatar" src="${esc(p.avatar_url || "/logo.png")}"/>` : ""}
    </div>
  </header>`;
}
```

## C. Ganti function `nav()` supaya Buku Saku hilang:

```js
function nav(){
  const items = [
    ["dashboard","🏠","HOME"],
    ["attendance","📋","ABSENSI"],
    ["log","↺","LOG"],
    ["reports","📄","LAPORAN"],
    ["propam","⚖️","PROPAM"],
    ["payroll","💵","GAJI"],
    ["admin","⚙","ADMIN"]
  ];
  return `<nav class="nav nav-seven">${items.map(([id,ic,tx])=>`
    <button class="${STATE.page===id?'active':''}" onclick="go('${id}')"><span>${ic}</span>${tx}</button>
  `).join("")}</nav>`;
}
```

## D. Tambahkan function ACC/Tolak Absensi:

```js
async function approveAttendance(id){
  const { error } = await supabase
    .from("attendance")
    .update({ status:"APPROVED", approved_by:STATE.profile.display_name })
    .eq("id", id);
  if(error) return alert(error.message);
  await audit("APPROVE_ATTENDANCE", "attendance", id, {});
  await loadAll();
  render();
}

async function rejectAttendance(id){
  const reason = prompt("Alasan ditolak?") || "Ditolak oleh admin";
  const { error } = await supabase
    .from("attendance")
    .update({ status:"REJECTED", approved_by:STATE.profile.display_name, reject_reason:reason })
    .eq("id", id);
  if(error) return alert(error.message);
  await audit("REJECT_ATTENDANCE", "attendance", id, { reason });
  await loadAll();
  render();
}
```

## E. Di `Object.assign(window,{...})` tambahkan:

```js
approveAttendance,
rejectAttendance,
```

## F. Ganti isi `attendanceAdminPanel()` menjadi:

```js
function attendanceAdminPanel(){
  let rows = STATE.attendance;
  if(STATE.tab === "pending") rows = rows.filter(x=>x.status==="PENDING");
  if(STATE.tab === "approved") rows = rows.filter(x=>x.status==="APPROVED");
  if(STATE.tab === "rejected") rows = rows.filter(x=>x.status==="REJECTED");
  if(!canApproveAttendance()) rows = rows.filter(x=>x.user_id === STATE.profile.id);

  return `<section class="card">
    <h2>${canApproveAttendance() ? "PANEL ACC / TOLAK ABSENSI" : "RIWAYAT ABSENSI"}</h2>
    ${rows.length ? `<table class="table">
      <thead><tr><th>Anggota</th><th>Status</th><th>Waktu</th><th>Keterangan</th>${canApproveAttendance()?`<th>Aksi</th>`:""}</tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td><b>${esc(r.nama)}</b><br><span class="mini">${esc(r.badge_number||"NO BADGE")} • ${esc(r.divisi||"-")}</span></td>
        <td><span class="status ${esc(r.status)}">${esc(r.status)}</span><br><span class="mini">${esc(r.type)}</span></td>
        <td>${fmt(r.created_at)}</td>
        <td>${esc(r.note || "-")}<br><span class="mini">${esc(r.location || "")}</span>${r.evidence_url?`<br><a href="${esc(r.evidence_url)}" target="_blank">Lihat Bukti</a>`:""}</td>
        ${canApproveAttendance()?`<td>
          ${r.status==="PENDING"?`<button class="btn small green" onclick="approveAttendance(${r.id})">ACC</button><button class="btn small red" onclick="rejectAttendance(${r.id})">TOLAK</button>`:`<span class="mini">oleh ${esc(r.approved_by || "-")}</span>`}
        </td>`:""}
      </tr>`).join("")}</tbody>
    </table>` : `<div class="empty">Tidak ada data.</div>`}
  </section>`;
}
```

## G. Untuk edit username di modal anggota
Di function `openMemberEditor(id)`, tambahkan field ini di atas Badge:

```html
<div class="field"><label>Username / Nama Display</label><input id="edit_name" value="${esc(m.display_name||"")}"/></div>
```

Lalu di `saveMember(id)`, tambahkan:

```js
display_name: document.querySelector("#edit_name").value,
```

## H. Di function `propamPage()`, tambahkan tombol ini setelah tombol KIRIM PROPAM LOG:

```html
<button class="btn" onclick="go('dashboard')">KELUAR KE MENU</button>
```
