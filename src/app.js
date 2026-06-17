import { supabase } from "./supabase.js";

const app = document.querySelector("#app");

const S = {
  user: null,
  profile: null,
  page: "dashboard",
  tab: "today",
  members: [],
  attendance: [],
  reports: [],
  propam: [],
  payrolls: [],
  audit: [],
  currentReport: "PATROLI"
};

const DIV = ["CASIS","SABHARA","SATBRIMOB","SATLANTAS","POLAIRUD","BARESKRIM","SETUM","BIDPROPAM"];
const JAB = ["CASIS","TAMTAMA","BINTARA","PAMA","PAMEN","PATI","SUPER ADMIN"];
const RANK = [
  "CASIS",
  "Bharada","Bharatu","Bharaka",
  "Bripda","Briptu","Brigpol","Bripka","Aipda","Aiptu",
  "Ipda","Iptu","AKP",
  "Kompol","AKBP","Kombes",
  "Brigjen","Irjen","Komjen","Jenderal Polisi",
  "Super Admin"
];

const HIGH = ["PAMA","PAMEN","PATI","SUPER ADMIN"];
const MAN = ["PAMEN","PATI","SUPER ADMIN"];
const ATTENDANCE_APPROVER = ["PATI","SUPER ADMIN"];

const e = v => String(v ?? "").replace(/[&<>"']/g, m => ({
  "&":"&amp;",
  "<":"&lt;",
  ">":"&gt;",
  '"':"&quot;",
  "'":"&#39;"
}[m]));

const can = roles => roles.includes(S.profile?.jabatan);
const high = () => can(HIGH);
const admin = () => can(MAN);
const canApproveAttendance = () => can(ATTENDANCE_APPROVER);
const propam = () => S.profile?.divisi === "BIDPROPAM" || can(["PATI","SUPER ADMIN"]);
const fmt = d => d ? new Date(d).toLocaleString("id-ID") : "-";

async function init(){
  const { data } = await supabase.auth.getUser();
  S.user = data.user;

  if(S.user){
    await ensureProfile();
    await loadAll();
  }

  render();
}

async function loginDiscord(){
  await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: location.origin }
  });
}

async function logout(){
  await supabase.auth.signOut();
  location.reload();
}

async function ensureProfile(){
  const u = S.user;
  const meta = u.user_metadata || {};
  const did = meta.provider_id || u.identities?.[0]?.identity_data?.sub || u.id;

  let { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", u.id)
    .maybeSingle();

  if(error) throw error;

  if(!profile){
    const ins = await supabase.from("profiles").insert({
      auth_user_id: u.id,
      discord_id: did,
      display_name: meta.full_name || meta.name || u.email || "Unknown",
      avatar_url: meta.avatar_url || "/logo.png",
      badge_number: "",
      jabatan: "CASIS",
      rank_detail: "CASIS",
      divisi: "CASIS",
      status: "PENDING"
    }).select("*").single();

    if(ins.error) throw ins.error;
    profile = ins.data;
  }

  S.profile = profile;
}

async function loadAll(){
  const [m,a,r,p,pay,au] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending:false }),
    supabase.from("attendance").select("*").order("created_at", { ascending:false }).limit(250),
    supabase.from("reports").select("*").order("created_at", { ascending:false }).limit(250),
    supabase.from("disciplinary_records").select("*").order("created_at", { ascending:false }).limit(250),
    supabase.from("payrolls").select("*").order("created_at", { ascending:false }).limit(250),
    supabase.from("audit_logs").select("*").order("created_at", { ascending:false }).limit(150)
  ]);

  S.members = m.data || [];
  S.attendance = a.data || [];
  S.reports = r.data || [];
  S.propam = p.data || [];
  S.payrolls = pay.data || [];
  S.audit = au.data || [];
}

async function audit(action, target_type, target_id, metadata = {}){
  try{
    await supabase.from("audit_logs").insert({
      actor_user_id: S.profile?.id || null,
      actor_name: S.profile?.display_name || "SYSTEM",
      action,
      target_type,
      target_id: String(target_id || ""),
      metadata
    });
  }catch{}
}

async function upload(file, folder){
  if(!file) return null;
  const ext = file.name.split(".").pop();
  const path = `${folder}/${S.profile.id}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("evidence").upload(path, file, { upsert:false });
  if(error) throw error;
  return supabase.storage.from("evidence").getPublicUrl(path).data.publicUrl;
}

function top(title){
  const p = S.profile;
  const exit = S.page !== "dashboard" ? `<button class="exit-btn" onclick="go('dashboard')">← KELUAR KE MENU</button>` : "";
  return `<header class="topbar">
    <div class="top-title">
      <img src="/logo.png"/>
      <div>
        <h1>${title}</h1>
        <small>MAYDAY POLICE MDT V2.1</small>
      </div>
    </div>
    <div class="top-actions">
      ${exit}
      ${p ? `<img class="avatar" src="${e(p.avatar_url || "/logo.png")}"/>` : ""}
    </div>
  </header>`;
}

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

  return `<nav class="nav nav-seven">${items.map(([id,ic,tx]) => `
    <button class="${S.page===id ? "active" : ""}" onclick="go('${id}')">
      <span>${ic}</span>${tx}
    </button>
  `).join("")}</nav>`;
}

function go(page){
  S.page = page;
  if(page === "attendance") S.tab = canApproveAttendance() ? "pending" : "form";
  else if(page === "admin") S.tab = "today";
  else S.tab = "today";
  render();
}

function setTab(tab){
  S.tab = tab;
  render();
}

function loginPage(){
  return `<main class="app login-screen">
    <section class="login-frame">
      <div class="login-head">OFFICIAL MDT V2.1</div>
      <img src="/logo.png" class="logo"/>
      <h2 class="big-title">MAYDAY<br><span style="color:#2563eb">POLICE</span></h2>
      <div class="badge">MOBILE DATA TERMINAL</div>
      <button class="btn" onclick="loginDiscord()">LOGIN DISCORD</button>
      <p class="notice">Login Discord OAuth via Supabase.</p>
      <div class="warning">AKSES TANPA IZIN AKAN DILACAK BIDPROPAM.</div>
    </section>
  </main>`;
}

function pending(){
  const p = S.profile;
  return `<main class="app">
    ${top("ACCOUNT VERIFICATION")}
    <main class="page">
      <section class="card yellow">
        <h2>AKUN ${e(p.status)}</h2>
        <p>Menunggu ACC PAMA/PAMEN/PATI/Admin.</p>
        <button class="btn red" onclick="logout()">LOGOUT</button>
      </section>

      <section class="card">
        <div class="profile-head">
          <img src="${e(p.avatar_url || "/logo.png")}"/>
          <div>
            <h2>${e(p.display_name)}</h2>
            <span class="status ${e(p.status)}">${e(p.status)}</span>
          </div>
        </div>

        <div class="kv">
          <div><small>JABATAN</small><strong>${e(p.jabatan)}</strong></div>
          <div><small>DIVISI</small><strong>${e(p.divisi)}</strong></div>
          <div><small>BADGE</small><strong>${e(p.badge_number || "BELUM ADA")}</strong></div>
        </div>
      </section>
    </main>
  </main>`;
}

function dashboard(){
  const p = S.profile;
  const today = new Date().toISOString().slice(0,10);
  const todayAbs = S.attendance.filter(x => (x.created_at || "").slice(0,10) === today);
  const pendingAbs = S.attendance.filter(x => x.status === "PENDING").length;

  return `<main class="app">
    ${top("PERSONNEL TERMINAL")}
    <main class="page">
      <div class="desktop-grid">
        <section class="card blue">
          <div class="profile-head">
            <img src="${e(p.avatar_url || "/logo.png")}"/>
            <div>
              <span class="badge">AKSES TERVERIFIKASI</span>
              <h2 class="big-title">${e(p.display_name).toUpperCase()}</h2>
            </div>
          </div>
          <div class="kv">
            <div><small>BADGE</small><strong>${e(p.badge_number || "BELUM SET")}</strong></div>
            <div><small>JABATAN</small><strong>${e(p.jabatan)}</strong></div>
            <div><small>DIVISI</small><strong>${e(p.divisi)}</strong></div>
          </div>
        </section>

        <section class="card yellow">
          <h2>COMMAND DASHBOARD</h2>
          <div class="grid3">
            <div><small>ANGGOTA</small><h2>${S.members.filter(x => x.status === "ACTIVE").length}</h2></div>
            <div><small>PENDING USER</small><h2>${S.members.filter(x => x.status === "PENDING").length}</h2></div>
            <div><small>PENDING ABSENSI</small><h2>${pendingAbs}</h2></div>
          </div>
          <div class="grid3">
            <div><small>ABSENSI HARI INI</small><h2>${todayAbs.length}</h2></div>
            <div><small>LAPORAN</small><h2>${S.reports.length}</h2></div>
            <div><small>SP AKTIF</small><h2>${S.propam.filter(x => x.status === "ACTIVE").length}</h2></div>
          </div>
        </section>
      </div>

      <section class="grid">
        <button class="tile" onclick="go('attendance')"><div class="icon">📋</div>ABSENSI<small>Input / ACC absensi</small></button>
        <button class="tile" onclick="go('reports')"><div class="icon">📄</div>LAPORAN<small>OPS & administrasi</small></button>
        <button class="tile" onclick="go('members')"><div class="icon">👮</div>PERSONEL<small>Data anggota</small></button>
        <button class="tile" onclick="go('propam')"><div class="icon">⚖️</div>PROPAM<small>SP / PTDH</small></button>
        <button class="tile" onclick="go('payroll')"><div class="icon">💵</div>PAYROLL<small>Pengajuan gaji</small></button>
        <button class="tile" onclick="go('log')"><div class="icon">↺</div>LOG<small>Activity log</small></button>
        ${high() ? `<button class="tile" onclick="go('admin')"><div class="icon">⚙</div>ADMIN<small>Panel petinggi</small></button>` : ""}
      </section>

      ${!p.badge_number ? `<section class="card red"><h2>BADGE BELUM DISET</h2><p>Badge bisa diedit oleh perwira/admin.</p></section>` : ""}
    </main>${nav()}
  </main>`;
}

function attendancePage(){
  const tabs = canApproveAttendance()
    ? [["pending","PENDING"],["approved","DISETUJUI"],["rejected","DITOLAK"],["all","SEMUA"],["form","FORM ABSENSI"]]
    : [["form","FORM ABSENSI"],["all","RIWAYAT"]];

  return `<main class="app">
    ${top("ABSENSI")}
    <main class="page">
      <section class="tabs">${tabs.map(([id,label]) => `
        <button class="${S.tab===id ? "active" : ""}" onclick="setTab('${id}')">${label}</button>
      `).join("")}</section>
      ${S.tab === "form" ? attendanceForm() : attendanceAdminPanel()}
    </main>${nav()}
  </main>`;
}

function attendanceForm(){
  const p = S.profile;
  return `<section class="card">
    <h2>FORM ABSENSI</h2>
    <div class="kv">
      <div><small>NAMA</small><strong>${e(p.display_name)}</strong></div>
      <div><small>JABATAN</small><strong>${e(p.jabatan)}</strong></div>
      <div><small>DIVISI</small><strong>${e(p.divisi)}</strong></div>
    </div>

    <div class="row">
      <div class="field">
        <label>Status Absensi</label>
        <select id="abs_type">
          <option>HADIR</option>
          <option>IZIN</option>
          <option>CUTI</option>
          <option>ONDUTY</option>
          <option>OFFDUTY</option>
        </select>
      </div>
      <div class="field">
        <label>Lokasi</label>
        <input id="abs_location" placeholder="Kota Mayday / Kantor"/>
      </div>
    </div>

    <div class="field">
      <label>Keterangan</label>
      <textarea id="abs_note" placeholder="Contoh: Hadir patroli area kota / izin sebentar..."></textarea>
    </div>

    <div class="field">
      <label>Bukti Foto</label>
      <input id="abs_file" type="file" accept="image/*"/>
    </div>

    <button class="btn blue" onclick="submitAttendance()">KIRIM ABSENSI</button>
  </section>`;
}

function attendanceAdminPanel(){
  let rows = S.attendance;

  if(S.tab === "pending") rows = rows.filter(x => x.status === "PENDING");
  if(S.tab === "approved") rows = rows.filter(x => x.status === "APPROVED");
  if(S.tab === "rejected") rows = rows.filter(x => x.status === "REJECTED");
  if(!canApproveAttendance()) rows = rows.filter(x => x.user_id === S.profile.id);

  return `<section class="card">
    <h2>${canApproveAttendance() ? "PANEL ACC / TOLAK ABSENSI" : "RIWAYAT ABSENSI"}</h2>

    ${rows.length ? `<table class="table">
      <thead>
        <tr>
          <th>Anggota</th>
          <th>Status</th>
          <th>Waktu</th>
          <th>Keterangan</th>
          ${canApproveAttendance() ? `<th>Aksi</th>` : ""}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>
            <b>${e(r.nama)}</b><br>
            <span class="mini">${e(r.badge_number || "NO BADGE")} • ${e(r.divisi || "-")}</span>
          </td>
          <td>
            <span class="status ${e(r.status)}">${e(r.status)}</span><br>
            <span class="mini">${e(r.type)}</span>
          </td>
          <td>${fmt(r.created_at)}</td>
          <td>
            ${e(r.note || "-")}<br>
            <span class="mini">${e(r.location || "")}</span>
            ${r.reject_reason ? `<br><span class="mini">Alasan Tolak: ${e(r.reject_reason)}</span>` : ""}
            ${r.evidence_url ? `<br><a href="${e(r.evidence_url)}" target="_blank">Lihat Bukti</a>` : ""}
          </td>
          ${canApproveAttendance() ? `<td>
            ${r.status === "PENDING" ? `
              <button class="btn small green" onclick="approveAttendance(${r.id})">ACC</button>
              <button class="btn small red" onclick="rejectAttendance(${r.id})">TOLAK</button>
            ` : `<span class="mini">oleh ${e(r.approved_by || "-")}</span>`}
          </td>` : ""}
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Tidak ada data.</div>`}
  </section>`;
}

async function submitAttendance(){
  try{
    const p = S.profile;
    const file = document.querySelector("#abs_file").files[0];
    const evidence = await upload(file, "attendance");

    const item = {
      user_id: p.id,
      discord_id: p.discord_id,
      nama: p.display_name,
      jabatan: p.jabatan,
      rank_detail: p.rank_detail,
      divisi: p.divisi,
      badge_number: p.badge_number || "",
      type: document.querySelector("#abs_type").value,
      location: document.querySelector("#abs_location").value,
      note: document.querySelector("#abs_note").value || "-",
      evidence_url: evidence,
      status: "PENDING"
    };

    const { error } = await supabase.from("attendance").insert(item);
    if(error) throw error;

    await audit("CREATE_ATTENDANCE", "attendance", "", item);
    await loadAll();

    alert("Absensi masuk ke log dan menunggu ACC.");
    go("log");
    S.tab = "attendance";
    render();
  }catch(err){
    alert(err.message);
  }
}

async function approveAttendance(id){
  const { error } = await supabase
    .from("attendance")
    .update({ status:"APPROVED", approved_by:S.profile.display_name })
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
    .update({ status:"REJECTED", approved_by:S.profile.display_name, reject_reason:reason })
    .eq("id", id);

  if(error) return alert(error.message);

  await audit("REJECT_ATTENDANCE", "attendance", id, { reason });
  await loadAll();
  render();
}

function reportsPage(){
  const cats = ["PATROLI","PENANGKAPAN","PENGEJARAN","PENEMBAKAN","BACKUP","PERAMPOKAN","PENILANGAN","ADMINISTRASI"];
  if(!S.currentReport) S.currentReport = cats[0];

  return `<main class="app">
    ${top("LAPORAN OPERASI")}
    <main class="page">
      <section class="tabs">${cats.map(c => `
        <button class="${S.currentReport===c ? "active" : ""}" onclick="setReportCat('${c}')">${c}</button>
      `).join("")}</section>

      <section class="card">
        <h2>${e(S.currentReport)}</h2>
        <div class="row">
          <div class="field"><label>Lokasi</label><input id="rep_location"/></div>
          <div class="field"><label>Shift</label><select id="rep_shift"><option>PAGI</option><option>SIANG</option><option>MALAM</option></select></div>
        </div>
        <div class="field"><label>Kronologi</label><textarea id="rep_text"></textarea></div>
        <div class="field"><label>Video Link</label><input id="rep_video"/></div>
        <div class="field"><label>Bukti Foto</label><input id="rep_file" type="file" accept="image/*"/></div>
        <button class="btn blue" onclick="submitReport()">KIRIM LAPORAN</button>
      </section>
    </main>${nav()}
  </main>`;
}

function setReportCat(c){
  S.currentReport = c;
  render();
}

async function submitReport(){
  try{
    const p = S.profile;
    const file = document.querySelector("#rep_file").files[0];
    const evidence = await upload(file, "reports");

    const payload = {
      location: document.querySelector("#rep_location").value,
      shift: document.querySelector("#rep_shift").value,
      report: document.querySelector("#rep_text").value,
      video: document.querySelector("#rep_video").value
    };

    const { error } = await supabase.from("reports").insert({
      user_id: p.id,
      type: S.currentReport,
      nama: p.display_name,
      divisi: p.divisi,
      badge_number: p.badge_number || "",
      payload,
      evidence_url: evidence,
      status: "PENDING"
    });

    if(error) throw error;

    await audit("CREATE_REPORT", "reports", "", { type:S.currentReport });
    await loadAll();
    alert("Laporan masuk.");
    go("log");
    S.tab = "reports";
    render();
  }catch(err){
    alert(err.message);
  }
}

function membersPage(){
  return `<main class="app">
    ${top("DATA PERSONEL")}
    <main class="page">
      <section class="card">
        <h2>ANGGOTA</h2>
        ${S.members.map(m => `<div class="list-item">
          <h3>${e(m.display_name)} <span class="status ${e(m.status)}">${e(m.status)}</span></h3>
          <div class="mini">${e(m.badge_number || "NO BADGE")} • ${e(m.jabatan)} • ${e(m.divisi)}</div>
          ${admin() ? `<button class="btn small yellow" onclick="openMemberEditor(${m.id})">EDIT USERNAME / BADGE / JABATAN</button>` : ""}
        </div>`).join("")}
      </section>
    </main>${nav()}
  </main>`;
}

function propamPage(){
  if(!propam()) return blocked("BIDPROPAM ONLY");

  return `<main class="app">
    ${top("BIDPROPAM CENTER")}
    <main class="page">
      <section class="card dark">
        <h2>SP / PTDH</h2>
        <p class="notice">SP1 → SP2 → SP3 → PTDH.</p>
      </section>

      <section class="card">
        <h2>BUAT SP / PTDH</h2>
        <div class="row">
          <div class="field">
            <label>Target</label>
            <select id="sp_target">
              ${S.members.filter(m => m.status === "ACTIVE").map(m => `<option value="${m.id}">${e(m.display_name)} - ${e(m.divisi)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Tindakan</label>
            <select id="sp_level">
              <option value="1">SP1</option>
              <option value="2">SP2</option>
              <option value="3">SP3</option>
              <option value="99">PTDH</option>
            </select>
          </div>
        </div>

        <div class="field"><label>Alasan</label><textarea id="sp_reason"></textarea></div>
        <div class="field"><label>Bukti</label><input id="sp_file" type="file" accept="image/*"/></div>
        <button class="btn red" onclick="submitSP()">KIRIM PROPAM LOG</button>
        <button class="btn" onclick="go('dashboard')">KELUAR KE MENU</button>
      </section>

      <section class="card">
        <h2>RIWAYAT</h2>
        ${S.propam.length ? `<table class="table">
          <thead><tr><th>Target</th><th>Tindakan</th><th>Alasan</th><th>Oleh</th><th>Waktu</th></tr></thead>
          <tbody>${S.propam.map(x => `<tr>
            <td>${e(x.target_name)}</td>
            <td>${x.sp_level == 99 ? "PTDH" : "SP" + x.sp_level}</td>
            <td>${e(x.reason)}</td>
            <td>${e(x.issued_by)}</td>
            <td>${fmt(x.created_at)}</td>
          </tr>`).join("")}</tbody>
        </table>` : `<div class="empty">Belum ada data.</div>`}
      </section>
    </main>${nav()}
  </main>`;
}

async function submitSP(){
  try{
    const id = Number(document.querySelector("#sp_target").value);
    const target = S.members.find(m => m.id === id);
    const level = Number(document.querySelector("#sp_level").value);
    const file = document.querySelector("#sp_file").files[0];
    const evidence = await upload(file, "propam");
    const reason = document.querySelector("#sp_reason").value;

    const { error } = await supabase.from("disciplinary_records").insert({
      target_user_id: id,
      target_name: target?.display_name,
      issued_by: S.profile.display_name,
      sp_level: level,
      reason,
      evidence_url: evidence,
      status: "ACTIVE"
    });

    if(error) throw error;

    if(level === 99){
      await supabase.from("profiles").update({ status:"PTDH" }).eq("id", id);
    }

    await audit(level === 99 ? "PTDH" : "CREATE_SP", "disciplinary_records", id, { level, reason });
    await loadAll();
    alert("Propam log tersimpan.");
    render();
  }catch(err){
    alert(err.message);
  }
}

function payrollPage(){
  return `<main class="app">
    ${top("FINANCIAL GATEWAY")}
    <main class="page">
      <section class="card blue">
        <span class="badge">PAYROLL SYSTEM</span>
        <h2 class="big-title">GAJI</h2>
        <p>${e(S.profile.display_name)} • ${e(S.profile.badge_number || "NO BADGE")}</p>
      </section>

      <section class="card">
        <div class="row">
          <div class="field"><label>Periode</label><input id="pay_period" placeholder="Juni 2026"/></div>
          <div class="field"><label>Nominal</label><input id="pay_amount" type="number" value="100000"/></div>
        </div>
        <div class="field"><label>Keterangan</label><textarea id="pay_note"></textarea></div>
        <button class="btn green" onclick="submitPayroll()">AJUKAN GAJI</button>
      </section>

      ${high() ? `<section class="card yellow">
        <h2>PENDING PAYROLL</h2>
        ${S.payrolls.filter(x => x.status === "PENDING").map(p => `<div class="list-item">
          <h3>${e(p.nama)} - $${p.amount}</h3>
          <div class="mini">${e(p.period)}</div>
          <div class="split-actions">
            <button class="btn small green" onclick="approvePayroll(${p.id})">BAYAR</button>
            <button class="btn small red" onclick="rejectPayroll(${p.id})">TOLAK</button>
          </div>
        </div>`).join("") || "<p>Tidak ada pending.</p>"}
      </section>` : ""}
    </main>${nav()}
  </main>`;
}

async function submitPayroll(){
  const { error } = await supabase.from("payrolls").insert({
    user_id: S.profile.id,
    nama: S.profile.display_name,
    period: document.querySelector("#pay_period").value,
    amount: Number(document.querySelector("#pay_amount").value || 0),
    note: document.querySelector("#pay_note").value,
    status: "PENDING"
  });

  if(error) return alert(error.message);

  await audit("CREATE_PAYROLL", "payrolls", "", {});
  await loadAll();
  render();
}

async function approvePayroll(id){
  await supabase.from("payrolls").update({ status:"PAID", approved_by:S.profile.display_name }).eq("id", id);
  await audit("APPROVE_PAYROLL", "payrolls", id, {});
  await loadAll();
  render();
}

async function rejectPayroll(id){
  await supabase.from("payrolls").update({ status:"REJECTED", approved_by:S.profile.display_name }).eq("id", id);
  await audit("REJECT_PAYROLL", "payrolls", id, {});
  await loadAll();
  render();
}

function logPage(){
  const tabs = ["today","attendance","reports","propam","audit"];

  return `<main class="app">
    ${top("ACTIVITY LOG")}
    <main class="page">
      <section class="tabs">${tabs.map(t => `<button class="${S.tab===t ? "active" : ""}" onclick="setTab('${t}')">${t.toUpperCase()}</button>`).join("")}</section>

      ${S.tab === "today" ? `<section class="grid">
        <div class="card green"><h3>ABSENSI</h3><h2>${S.attendance.length}</h2></div>
        <div class="card yellow"><h3>LAPORAN</h3><h2>${S.reports.length}</h2></div>
        <div class="card red"><h3>SP</h3><h2>${S.propam.length}</h2></div>
        <div class="card blue"><h3>AUDIT</h3><h2>${S.audit.length}</h2></div>
      </section>` : ""}

      ${S.tab === "attendance" ? logTable("Absensi", S.attendance, "attendance") : ""}
      ${S.tab === "reports" ? logTable("Laporan", S.reports, "reports") : ""}
      ${S.tab === "propam" ? logTable("Propam", S.propam, "propam") : ""}
      ${S.tab === "audit" ? auditLog() : ""}
    </main>${nav()}
  </main>`;
}

function logTable(title, rows, type){
  return `<section class="card">
    <h2>${title}</h2>
    ${rows.length ? `<table class="table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Status</th>
          <th>Keterangan</th>
          <th>Waktu</th>
          ${type === "attendance" && canApproveAttendance() ? `<th>Aksi</th>` : ""}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>
            ${e(r.nama || r.target_name || r.type)}<br>
            <span class="mini">${e(r.divisi || r.badge_number || "")}</span>
          </td>
          <td><span class="status ${e(r.status)}">${e(r.status)}</span></td>
          <td>
            ${e(r.note || r.reason || r.payload?.report || "-")}<br>
            <span class="mini">${e(r.location || r.payload?.location || "")}</span>
            ${r.reject_reason ? `<br><span class="mini">Alasan Tolak: ${e(r.reject_reason)}</span>` : ""}
            ${r.evidence_url ? `<br><a href="${e(r.evidence_url)}" target="_blank">Lihat Bukti</a>` : ""}
          </td>
          <td>${fmt(r.created_at)}</td>
          ${type === "attendance" && canApproveAttendance() ? `<td>
            ${r.status === "PENDING" ? `
              <button class="btn small green" onclick="approveAttendance(${r.id})">ACC</button>
              <button class="btn small red" onclick="rejectAttendance(${r.id})">TOLAK</button>
            ` : `<span class="mini">${e(r.approved_by || "-")}</span>`}
          </td>` : ""}
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Kosong.</div>`}
  </section>`;
}

function auditLog(){
  return `<section class="card">
    <h2>AUDIT</h2>
    ${S.audit.map(a => `<div class="list-item">
      <h3>${e(a.action)}</h3>
      <div class="mini">${e(a.actor_name)} • ${fmt(a.created_at)}</div>
    </div>`).join("") || `<div class="empty">Belum ada audit.</div>`}
  </section>`;
}

function adminPage(){
  if(!high()) return blocked("PANEL PETINGGI ONLY");

  return `<main class="app">
    ${top("ADMIN PANEL")}
    <main class="page">
      <section class="tabs">
        ${[
          ["today","MENU"],
          ["members","ANGGOTA"],
          ["pending","PENDING USER"],
          ["attendance","ACC ABSENSI"],
          ["settings","SETTING"]
        ].map(([id,label]) => `<button class="${S.tab===id ? "active" : ""}" onclick="setTab('${id}')">${label}</button>`).join("")}
      </section>

      ${S.tab === "today" ? adminHome() : ""}
      ${S.tab === "pending" ? pendingUsers() : ""}
      ${S.tab === "members" ? adminMembers() : ""}
      ${S.tab === "attendance" ? attendanceAdminPanel() : ""}
      ${S.tab === "settings" ? `<section class="card yellow"><h2>SETTING DISCORD</h2><p>Channel Discord diset lewat bot /setup.</p></section>` : ""}
    </main>${nav()}
  </main>`;
}

function adminHome(){
  return `<section class="grid">
    <button class="tile" onclick="setTab('pending')"><div class="icon">✅</div>ACC USER<small>${S.members.filter(m => m.status === "PENDING").length} pending</small></button>
    <button class="tile" onclick="setTab('members')"><div class="icon">🎖️</div>SET ANGGOTA<small>Username / badge / jabatan</small></button>
    <button class="tile" onclick="setTab('attendance')"><div class="icon">📋</div>ACC ABSENSI<small>${S.attendance.filter(a => a.status === "PENDING").length} pending</small></button>
    <button class="tile" onclick="go('propam')"><div class="icon">⚖️</div>PROPAM<small>SP / PTDH</small></button>
  </section>`;
}

function pendingUsers(){
  const rows = S.members.filter(m => m.status === "PENDING");
  return `<section class="card dark">
    <h2>USER BARU MENUNGGU ACC</h2>
    ${rows.map(m => `<div class="list-item">
      <h3>${e(m.display_name)}</h3>
      <div class="mini">${e(m.discord_id || "")}</div>
      <div class="split-actions">
        <button class="btn small green" onclick="approveUser(${m.id})">ACC CASIS</button>
        <button class="btn small red" onclick="rejectUser(${m.id})">TOLAK</button>
      </div>
    </div>`).join("") || "<p>Tidak ada pending.</p>"}
  </section>`;
}

function adminMembers(){
  return `<section class="card">
    <h2>KELOLA ANGGOTA</h2>
    ${S.members.map(m => `<div class="list-item">
      <h3>${e(m.display_name)} <span class="status ${e(m.status)}">${e(m.status)}</span></h3>
      <div class="mini">${e(m.badge_number || "NO BADGE")} • ${e(m.jabatan)} • ${e(m.divisi)}</div>
      <button class="btn small yellow" onclick="openMemberEditor(${m.id})">EDIT</button>
    </div>`).join("")}
  </section>`;
}

function openMemberEditor(id){
  const m = S.members.find(x => x.id === id);
  if(!m) return;

  const modal = document.createElement("div");
  modal.id = "modal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto";

  modal.innerHTML = `<section class="card" style="max-width:480px;width:100%">
    <h2>EDIT ANGGOTA</h2>
    <div class="field"><label>Username / Nama Display</label><input id="edit_name" value="${e(m.display_name || "")}"/></div>
    <div class="field"><label>Badge</label><input id="edit_badge" value="${e(m.badge_number || "")}"/></div>
    <div class="field"><label>Jabatan</label><select id="edit_jabatan">${JAB.map(x => `<option ${m.jabatan===x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Rank Detail</label><select id="edit_rank">${RANK.map(x => `<option ${m.rank_detail===x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Divisi</label><select id="edit_divisi">${DIV.map(x => `<option ${m.divisi===x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
    <div class="field"><label>Status</label><select id="edit_status">${["PENDING","ACTIVE","SUSPENDED","PTDH","REJECTED"].map(x => `<option ${m.status===x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
    <button class="btn green" onclick="saveMember(${m.id})">SIMPAN</button>
    <button class="btn red" onclick="closeModal()">BATAL</button>
  </section>`;

  document.body.appendChild(modal);
}

function closeModal(){
  document.getElementById("modal")?.remove();
}

async function saveMember(id){
  const data = {
    display_name: document.querySelector("#edit_name").value,
    badge_number: document.querySelector("#edit_badge").value,
    jabatan: document.querySelector("#edit_jabatan").value,
    rank_detail: document.querySelector("#edit_rank").value,
    divisi: document.querySelector("#edit_divisi").value,
    status: document.querySelector("#edit_status").value
  };

  const { error } = await supabase.from("profiles").update(data).eq("id", id);
  if(error) return alert(error.message);

  await audit("UPDATE_MEMBER", "profiles", id, data);
  closeModal();
  await loadAll();
  render();
}

async function approveUser(id){
  await supabase.from("profiles").update({
    status:"ACTIVE",
    jabatan:"CASIS",
    rank_detail:"CASIS",
    divisi:"CASIS"
  }).eq("id", id);

  await audit("APPROVE_USER", "profiles", id, {});
  await loadAll();
  render();
}

async function rejectUser(id){
  await supabase.from("profiles").update({ status:"REJECTED" }).eq("id", id);
  await audit("REJECT_USER", "profiles", id, {});
  await loadAll();
  render();
}

function blocked(msg){
  return `<main class="app">
    ${top("ACCESS DENIED")}
    <main class="page">
      <section class="card red">
        <h2>${e(msg)}</h2>
        <button class="btn" onclick="go('dashboard')">KEMBALI</button>
      </section>
    </main>${nav()}
  </main>`;
}

function render(){
  if(!S.user){
    app.innerHTML = loginPage();
    return;
  }

  if(S.profile?.status !== "ACTIVE" && S.profile?.jabatan !== "SUPER ADMIN"){
    app.innerHTML = pending();
    return;
  }

  const map = {
    dashboard,
    attendance: attendancePage,
    reports: reportsPage,
    members: membersPage,
    propam: propamPage,
    log: logPage,
    payroll: payrollPage,
    admin: adminPage
  };

  app.innerHTML = (map[S.page] || dashboard)();
}

Object.assign(window, {
  loginDiscord,
  logout,
  go,
  setTab,
  submitAttendance,
  approveAttendance,
  rejectAttendance,
  setReportCat,
  submitReport,
  submitSP,
  submitPayroll,
  approvePayroll,
  rejectPayroll,
  openMemberEditor,
  closeModal,
  saveMember,
  approveUser,
  rejectUser
});

init().catch(err => {
  console.error(err);
  app.innerHTML = `<main class="app page"><section class="card red"><h2>ERROR</h2><p>${e(err.message)}</p></section></main>`;
});
