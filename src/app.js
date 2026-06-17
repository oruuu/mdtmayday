const API_BASE = ""; // kalau beda domain worker, isi: "https://nama-worker.workers.dev"

const state = {
  page: "home",
  isLoggedIn: false,
  user: {
    id: 1,
    name: "Krisdian",
    discord: "@zeroviverday",
    avatar: "/logo.png",
    badge: "#0001",
    jabatan: "CASIS",
    divisi: "CASIS",
    status: "PENDING"
  },
  members: [
    { id:1, name:"Krisdian", jabatan:"CASIS", divisi:"CASIS", status:"PENDING" },
    { id:2, name:"Ardi Sumartomo", jabatan:"TAMTAMA - Bharada", divisi:"SABHARA", status:"ACTIVE" }
  ],
  absensi: [],
  laporan: [],
  propam: [],
  payroll: []
};

const divisions = ["CASIS","SABHARA","SATBRIMOB","SATLANTAS","POLAIRUD","BARESKRIM","SETUM","BIDPROPAM"];
const jabatan = [
  "CASIS",
  "TAMTAMA - Bharada","TAMTAMA - Bharatu","TAMTAMA - Bharaka",
  "BINTARA - Bripda","BINTARA - Briptu","BINTARA - Brigpol","BINTARA - Bripka","BINTARA - Aipda","BINTARA - Aiptu",
  "PAMA - Ipda","PAMA - Iptu","PAMA - AKP",
  "PAMEN - Kompol","PAMEN - AKBP","PAMEN - Kombes",
  "PATI - Brigjen","PATI - Irjen","PATI - Komjen","PATI - Jenderal",
  "SUPER ADMIN"
];

const app = document.querySelector("#app");

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function setPage(page){ state.page = page; render(); }
function selectOptions(items, selected){ return items.map(v => `<option ${v===selected?"selected":""}>${v}</option>`).join(""); }

function top(title){
  return `<header class="topbar"><h1>${title}</h1><img class="avatar" src="${state.user.avatar}" /></header>`;
}

function nav(){
  const items = [["home","🏠","HOME"],["log","↺","LOG"],["payroll","💵","GAJI"],["book","▣","BUKU"],["admin","⚙","ADMIN"]];
  return `<nav class="nav">${items.map(([id,ic,tx]) => `<button class="${state.page===id?'active':''}" onclick="setPage('${id}')"><span>${ic}</span>${tx}</button>`).join("")}</nav>`;
}

function renderLogin(){
  app.innerHTML = `
  <main class="app login-screen">
    <section class="login-frame">
      <div class="login-head">OFFICIAL MDT V2.0</div>
      <div class="logo-wrap">
        <img src="/logo.png" class="logo" />
        <h2 class="big-title">MAYDAY<br><span style="color:#2563eb">POLICE</span></h2>
        <div class="badge">MOBILE DATA TERMINAL</div>
      </div>
      <button class="btn" onclick="loginDiscord()">LOGIN DISCORD</button>
      <p class="notice">Production: tombol ini diarahkan ke Discord OAuth. Demo ini memakai login simulasi.</p>
      <div class="warning">AKSES TANPA IZIN AKAN DILACAK OLEH BIDPROPAM.</div>
    </section>
  </main>`;
}

function loginDiscord(){
  state.isLoggedIn = true;
  state.user.status = "PENDING";
  render();
}

function pendingPage(){
  return `
  ${top("ACCOUNT VERIFICATION")}
  <main class="page">
    <section class="card yellow">
      <h2>AKUN PENDING</h2>
      <p>Akun Discord kamu sudah masuk sistem, tapi masih menunggu ACC dari PAMA/PAMEN/PATI/Admin.</p>
      <button class="btn" onclick="demoApproveSelf()">DEMO ACC AKUN</button>
    </section>
    <section class="card">
      <div class="kv">
        <div><small>NAMA</small><strong>${state.user.name}</strong></div>
        <div><small>JABATAN</small><strong>${state.user.jabatan}</strong></div>
        <div><small>DIVISI</small><strong>${state.user.divisi}</strong></div>
      </div>
      <p class="notice">Production: ketika login pertama, bot kirim embed ke channel verifikasi. Perwira/admin klik ACC/TOLAK.</p>
    </section>
  </main>`;
}

function demoApproveSelf(){
  state.user.status = "ACTIVE";
  state.user.jabatan = "CASIS";
  state.user.divisi = "CASIS";
  state.members[0].status = "ACTIVE";
  render();
}

function home(){
  return `
  ${top("PERSONNEL TERMINAL")}
  <main class="page">
    <section class="card blue">
      <span class="badge">AKSES TERVERIFIKASI</span>
      <h2 class="big-title">${state.user.name.toUpperCase()}</h2>
      <button class="btn yellow">${state.user.jabatan}</button>
      <button class="btn" style="margin-top:12px">${state.user.divisi} • ${state.user.badge}</button>
    </section>
    <section class="grid">
      <div class="card yellow"><h3>REPUTATION</h3><div class="big-title">0</div><p>POINTS</p></div>
      <div class="card green"><h3>DUTY</h3><div class="big-title">${state.absensi.length}</div><p>RECORDS</p></div>
    </section>
    <section class="grid">
      <button class="tile" onclick="setPage('absensi')"><div class="icon">📷</div>ABSENSI</button>
      <button class="tile" onclick="setPage('laporan')"><div class="icon">📄</div>LAPORAN</button>
      <button class="tile" onclick="setPage('propam')"><div class="icon">⚖️</div>BIDPROPAM</button>
      <button class="tile" onclick="setPage('anggota')"><div class="icon">👮</div>ANGGOTA</button>
    </section>
  </main>${nav()}`;
}

function absensi(){
  return `
  ${top("ABSENSI")}
  <main class="page">
    <section class="card">
      <div class="kv">
        <div><small>NAMA</small><strong>${state.user.name}</strong></div>
        <div><small>JABATAN</small><strong>${state.user.jabatan}</strong></div>
        <div><small>DIVISI</small><strong>${state.user.divisi}</strong></div>
      </div>
      <div class="field"><label>Jenis Absensi</label><select id="absType"><option>HADIR</option><option>IZIN</option><option>CUTI</option></select></div>
      <div class="field"><label>Keterangan</label><textarea id="absNote" placeholder="Tulis keterangan..."></textarea></div>
      <div class="field"><label>Bukti Foto</label><input id="absFile" type="file" accept="image/*" /></div>
      <button class="btn green" onclick="submitAbsensi()">KIRIM ABSENSI</button>
    </section>
  </main>`;
}

async function submitAbsensi(){
  const file = document.querySelector("#absFile").files[0];
  const item = {
    nama: state.user.name,
    jabatan: state.user.jabatan,
    divisi: state.user.divisi,
    type: document.querySelector("#absType").value,
    note: document.querySelector("#absNote").value || "-",
    fileName: file ? file.name : "",
    status: "PENDING",
    created_at: new Date().toLocaleString("id-ID")
  };
  state.absensi.unshift(item);
  try {
    await api("/absensi", { method:"POST", body: JSON.stringify(item) });
  } catch (e) {
    console.warn("Demo fallback:", e.message);
  }
  alert("Absensi masuk. Bot akan kirim ke channel absensi sesuai divisi yang sudah di-set.");
  setPage("log");
}

function laporanMenu(){
  const cards = [["PENANGKAPAN","+3 PRP","🛡"],["KASUS BESAR","+10 PRP","🎯"],["PATROLI","+5 PRP","🔎"],["BACKUP","+3 PRP","⚡"],["PENILANGAN","+2 PRP","🎫"],["ADMINISTRASI","+6 PRP","📋"]];
  return `${top("LAPORAN OPS")}<main class="page"><section class="grid">${cards.map(([n,p,i])=>`<button class="tile" onclick="openLaporan('${n}')"><div class="icon">${i}</div>${n}<small>${p}</small></button>`).join("")}</section></main>`;
}

function openLaporan(type){ state.currentReport = type; state.page = "laporanForm"; render(); }

function laporanForm(){
  return `${top(state.currentReport)}
  <main class="page">
    <section class="card">
      <div class="kv"><div><small>NAMA</small><strong>${state.user.name}</strong></div><div><small>JABATAN</small><strong>${state.user.jabatan}</strong></div><div><small>BADGE</small><strong>${state.user.badge}</strong></div></div>
      <div class="row"><div class="field"><label>Tanggal</label><input id="repDate" type="date"></div><div class="field"><label>Shift</label><select id="repShift"><option>PAGI</option><option>SIANG</option><option>MALAM</option></select></div></div>
      <div class="field"><label>Lokasi / Detail</label><input id="repLocation" placeholder="Area / Nama Jalan..."></div>
      <div class="field"><label>Kronologi / Laporan</label><textarea id="repText" placeholder="Ceritakan detail operasi..."></textarea></div>
      <div class="field"><label>Bukti Visual</label><input id="repFile" type="file" accept="image/*"></div>
      <button class="btn" onclick="submitReport()">KIRIM LAPORAN</button>
    </section>
  </main>`;
}

function submitReport(){
  state.laporan.unshift({ type: state.currentReport, nama: state.user.name, divisi: state.user.divisi, status:"PENDING", created_at:new Date().toLocaleString("id-ID") });
  alert("Laporan masuk. Bot akan kirim ke channel laporan-operasi.");
  setPage("log");
}

function propam(){
  return `${top("BIDPROPAM CENTER")}
  <main class="page">
    <section class="card dark">
      <h2>SP / PTDH</h2>
      <p class="notice">SP terkunci urut: SP1 → SP2 → SP3 → PTDH.</p>
    </section>
    <section class="card">
      <div class="field"><label>Target Anggota</label><select id="spTarget">${state.members.map(m=>`<option>${m.name}</option>`).join("")}</select></div>
      <div class="field"><label>Level</label><select id="spLevel"><option>SP1</option><option>SP2</option><option>SP3</option><option>PTDH</option></select></div>
      <div class="field"><label>Alasan</label><textarea id="spReason"></textarea></div>
      <div class="field"><label>Bukti</label><input type="file" accept="image/*"></div>
      <button class="btn red" onclick="submitSP()">KIRIM PROPAM LOG</button>
    </section>
  </main>`;
}

function submitSP(){
  state.propam.unshift({ target:document.querySelector("#spTarget").value, level:document.querySelector("#spLevel").value, status:"ACTIVE" });
  alert("Propam log masuk. Production: dikirim ke #propam-log.");
  setPage("log");
}

function anggota(){
  return `${top("DATA ANGGOTA")}<main class="page"><section class="card">${tableMembers()}</section></main>`;
}

function tableMembers(){
  return `<table class="table"><thead><tr><th>Nama</th><th>Jabatan</th><th>Divisi</th></tr></thead><tbody>${state.members.map(m=>`<tr><td>${m.name}<br><span class="status ${m.status.toLowerCase()}">${m.status}</span></td><td>${m.jabatan}</td><td>${m.divisi}</td></tr>`).join("")}</tbody></table>`;
}

function logPage(){
  return `${top("ACTIVITY LOG")}<main class="page">
    <section class="card"><h2>Absensi</h2>${state.absensi.length? table(state.absensi): empty()}</section>
    <section class="card"><h2>Laporan</h2>${state.laporan.length? table(state.laporan): empty()}</section>
    <section class="card"><h2>Propam</h2>${state.propam.length? table(state.propam): empty()}</section>
  </main>${nav()}`;
}

function table(rows){
  return `<table class="table"><tbody>${rows.map(r => `<tr><td>${r.type || r.level || r.nama || r.target}</td><td>${r.divisi || r.target || ""}</td><td><span class="status pending">${r.status}</span></td></tr>`).join("")}</tbody></table>`;
}
function empty(){ return `<div class="empty"><h2>NIHIL DATA</h2><p class="notice">Belum ada riwayat tercatat.</p></div>`; }

function payroll(){
  return `${top("FINANCIAL GATEWAY")}<main class="page">
    <section class="card blue"><span class="badge">FINANCE SYSTEM READY</span><h2 class="big-title">PAYROLL</h2><p>${state.user.name} • ${state.user.badge}</p></section>
    <section class="card green"><h3>BASE SALARY</h3><h2 class="big-title">$100.000</h2></section>
    <section class="card yellow"><button class="btn">KIRIM PENGAJUAN</button></section>
  </main>${nav()}`;
}

function book(){
  return `${top("DIVISIONAL HANDBOOK")}<main class="page">
    <section class="card"><h2>📘 BUKU SAKU DIVISI</h2><div class="badge">AKSES: ${state.user.divisi}</div></section>
    <section class="grid">
      <button class="tile"><div class="icon">📘</div>SOP</button>
      <button class="tile"><div class="icon">📻</div>TAC</button>
      <button class="tile"><div class="icon">🔢</div>TEN CODE</button>
      <button class="tile"><div class="icon">🔫</div>PERSENJATAAN</button>
    </section>
  </main>${nav()}`;
}

function admin(){
  return `${top("ADMIN PANEL")}<main class="page">
    <section class="card dark"><h2>USER BARU MENUNGGU ACC</h2><p class="notice">PAMA/PAMEN/PATI/Super Admin bisa ACC/Tolak. Setelah ACC default CASIS.</p>
      ${state.members.map((m,idx)=>`<div class="card"><strong>${m.name}</strong><br>${m.jabatan} • ${m.divisi}<br><span class="status ${m.status==='ACTIVE'?'approved':'pending'}">${m.status}</span>${m.status==="PENDING"?`<button class="btn green" onclick="approveMember(${idx})">ACC</button><button class="btn red" onclick="rejectMember(${idx})">TOLAK</button>`:""}</div>`).join("")}
    </section>
    <section class="card"><h2>SET JABATAN / DIVISI</h2><div class="field"><label>Jabatan</label><select>${selectOptions(jabatan, state.user.jabatan)}</select></div><div class="field"><label>Divisi</label><select>${selectOptions(divisions, state.user.divisi)}</select></div><button class="btn">SIMPAN</button></section>
    <section class="card yellow"><h2>CHANNEL DISCORD</h2><p>Channel tidak di-hardcode. Setting dilakukan dari bot Discord pakai <b>/setup</b>.</p></section>
  </main>${nav()}`;
}

function approveMember(i){ state.members[i].status="ACTIVE"; state.members[i].jabatan="CASIS"; state.members[i].divisi="CASIS"; alert("User di-ACC. Production: bot kasih role CASIS."); render(); }
function rejectMember(i){ state.members[i].status="REJECTED"; alert("User ditolak."); render(); }

function render(){
  if(!state.isLoggedIn){ renderLogin(); return; }
  if(state.user.status !== "ACTIVE"){ app.innerHTML = `<main class="app">${pendingPage()}</main>`; return; }
  let body = "";
  if(state.page==="home") body=home();
  if(state.page==="absensi") body=absensi();
  if(state.page==="laporan") body=laporanMenu();
  if(state.page==="laporanForm") body=laporanForm();
  if(state.page==="propam") body=propam();
  if(state.page==="anggota") body=anggota();
  if(state.page==="log") body=logPage();
  if(state.page==="payroll") body=payroll();
  if(state.page==="book") body=book();
  if(state.page==="admin") body=admin();
  app.innerHTML = `<main class="app">${body}</main>`;
}

Object.assign(window,{setPage,loginDiscord,demoApproveSelf,submitAbsensi,openLaporan,submitReport,submitSP,approveMember,rejectMember});
render();
