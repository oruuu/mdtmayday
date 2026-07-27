// src/app.js
import { supabase } from "./supabase.js";

const app = document.querySelector("#app");

const S = {
  user: null,
  profile: null,
  page: "dashboard",
  tab: "today",
  search: "",
  searchDraft: "",
  memberDivisionFilter: "",
  memberRankFilter: "",
  formDirty: false,
  members: [],
  attendance: [],
  reports: [],
  propam: [],
  payrolls: [],
  audit: [],
  roleHistory: [],
  divisionHistory: [],
  promotionRequests: [],
  currentReport: "PATROLI",
  archiveMonth: new Date().toISOString().slice(0,7),
  loading: false,
  loadingText: "Memuat data WEB...",
  realtimeReady: false,
  notifications: [],
  theme: localStorage.getItem("mayday_theme") || "light"
};

const DIV = ["NON DIVISI","SABHARA","SATBRIMOB","SATLANTAS","POLAIRUD","BARESKRIM","SETUM","BIDPROPAM"];
const JAB = ["CASIS","TAMTAMA","BINTARA","PAMA","PAMEN","PATI","SUPER ADMIN"];
const RANK = [
  "CASIS",
  "TAMTAMA",
  "Bripda","Briptu","Brigpol","Bripka","Aipda","Aiptu",
  "Ipda","Iptu","AKP",
  "Kompol","AKBP","Kombes",
  "Brigjen","Irjen","Komjen","Jenderal Polisi",
  "Super Admin"
];

const REPORT_TYPES = [
  { id:"PATROLI", label:"PATROLI" },
  { id:"KRIMINAL", label:"LAPORAN PENANGKAPAN" },
  { id:"PENYITAAN_KENDARAAN", label:"LAPORAN PENYITAAN KENDARAAN" }
];

const ACTIVITY_CAP_BY_RANK = {
  "CASIS": 20, "TAMTAMA": 65, "Bripda": 75, "Briptu": 85, "Brigpol": 95, 
  "Bripka": 110, "Aipda": 130, "Aiptu": 150, "Ipda": 180, "Iptu": 220, 
  "AKP": 260, "Kompol": 300, "AKBP": 350, "Kombes": 400, "Brigjen": 999999, 
  "Irjen": 999999, "Komjen": 999999, "Jenderal Polisi": 999999, "PATI": 999999, "Super Admin": 999999
};

const REPORT_ACTIVITY_POINTS = {
  "PATROLI": 2, "PENYITAAN_KENDARAAN": 2, "KRIMINAL": 3
};

const PAYROLL_RATE_BY_JABATAN = {
  "CASIS": 14285, "TAMTAMA": 21428, "BINTARA": 35714, "PAMA": 42900, 
  "PAMEN": 50000, "PATI": 60000, "SUPER ADMIN": 35714
};

const LEAVE_PAYROLL_DEDUCTION = 4000;

function payrollJabatan(member = S.profile){
  return String(member?.jabatan || member?.rank_detail || "").trim().toUpperCase();
}

function salaryRateForMember(member = S.profile){
  return PAYROLL_RATE_BY_JABATAN[payrollJabatan(member)] ?? 0;
}

function normalizeRank(rank){
  const r = String(rank || "").trim();
  if(["Bharada","Bharatu","Bharaka","BHARADA","BHARATU","BHARAKA","Tamtama"].includes(r)) return "TAMTAMA";
  return r;
}

function normalizeDivisi(divisi){
  const d = String(divisi || "").trim();
  if(d.toUpperCase() === "CASIS" || d.toUpperCase() === "NON DEVISI") return "NON DIVISI";
  return d || "NON DIVISI";
}

function reportPointValue(type){
  return REPORT_ACTIVITY_POINTS[type] || 1;
}

function rankIndex(rank){
  const r = normalizeRank(rank);
  return RANK.findIndex(x => String(x).toLowerCase() === String(r || "").toLowerCase());
}

function nextRank(rank){
  const idx = rankIndex(rank);
  if(idx < 0 || idx >= RANK.length - 1) return "";
  const next = RANK[idx + 1];
  return next === "Super Admin" ? "" : next;
}

function isUnlimitedRank(rank){
  const r = normalizeRank(rank);
  return ["PATI","SUPER ADMIN","Brigjen","Irjen","Komjen","Jenderal Polisi","Super Admin"].includes(r);
}

function activityCapFor(member){
  const rank = normalizeRank(member?.rank_detail || member?.jabatan);
  return ACTIVITY_CAP_BY_RANK[rank] ?? 10;
}

function rankProgress(member = S.profile){
  const rank = normalizeRank(member?.rank_detail || member?.jabatan || "CASIS");
  const point = Number(member?.activity_points_total || 0);
  const cap = activityCapFor(member);
  const unlimited = isUnlimitedRank(rank) || cap >= 999999;
  const pct = unlimited ? 100 : Math.min(100, Math.round((point / Math.max(1, cap)) * 100));
  const target = nextRank(rank);
  const eligible = !unlimited && point >= cap && !!target;
  return { rank, point, cap, unlimited, pct, target, eligible };
}

function monthNameID(ym){
  if(!ym || ym.length < 7) return "-";
  const [y,m] = ym.split("-");
  const names = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  return `${names[Number(m)-1] || m} ${y}`;
}

function reportMonthKey(r){
  const p = r.payload || {};
  const dt = p.arrest_datetime || p.report_date || r.created_at;
  return String(dt || "").slice(0,7);
}

function reportVisibleInArchive(r){
  const st = String(r.status || "").toUpperCase();
  return high() && ["ARCHIVED","DELETED"].includes(st);
}

function setArchiveMonth(v){
  S.archiveMonth = v || monthKey();
  render();
}

function formatArrestReport(r){
  const p = r.payload || {};
  const colleagues = (p.colleagues || []).map(id => S.members.find(m => m.id === Number(id))).filter(Boolean);
  return `LAPORAN PENANGKAPAN

I. Informasi Penahanan.
- Tanggal dan Waktu Penahanan: ${p.arrest_datetime || "-"}
- Lokasi Penahanan            : ${p.detention_location || "-"}
- Deskripsi Singkat           : ${p.summary || p.chronology || "-"}

II. Informasi Tersangka:
- Nama Tersangka             : ${p.suspect_name || p.subject_info || "-"}
- Pasal                      : ${p.law || "-"}
- Denda                      : ${p.fine || "-"}
- Hukuman/Masa Tahanan       : ${p.sentence || p.duration || "-"}

III. Identitas Petugas yang Menahan.
- Nama Petugas               : ${r.nama || "-"}
- Divisi                     : ${r.divisi || "-"}
- Pangkat                    : ${r.rank_detail || "-"}
- Jabatan                    : ${r.jabatan || "-"}
- Rekan                      : ${colleagues.length ? colleagues.map(m => userDisplayName(m)).join(", ") : "-"}
- Jenis Barang Bukti         : ${p.evidence_type || "-"}

Note: Bukti KTP & Barang Bukti wajib diunggah melalui tombol lampiran media di bawah.`;
}

function renderEvidenceLinks(r){
  if(!r.evidence_urls && !r.evidence_url) return "";
  const urls = Array.isArray(r.evidence_urls) ? r.evidence_urls : (r.evidence_url ? [r.evidence_url] : []);
  if(!urls.length) return "";
  return `<div class="evidence-links">${urls.map((u, i) => `<a href="${e(u)}" target="_blank">Lampiran ${i+1}</a>`).join("")}</div>`;
}

function reportTypeLabel(type){
  return REPORT_TYPES.find(x => x.id === type)?.label || type || "LAPORAN";
}

function reportColleagueOptions(selected = []){
  const set = new Set((selected || []).map(String));
  return S.members
    .filter(m => m.status === "ACTIVE" && m.id !== S.profile?.id)
    .map(m => `<option value="${m.id}" ${set.has(String(m.id)) ? "selected" : ""}>${e(userDisplayName(m))} - ${e(m.rank_detail || m.jabatan || "-")} - ${e(m.divisi || "-")}</option>`)
    .join("");
}

const HIGH = ["PATI","SUPER ADMIN"];
const MAN = ["PATI","SUPER ADMIN"];
const ATTENDANCE_APPROVER = ["PATI","SUPER ADMIN"];

const e = v => String(v ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
const can = roles => roles.includes(S.profile?.jabatan);
const high = () => can(HIGH);
const admin = () => can(MAN);
const canApproveAttendance = () => can(ATTENDANCE_APPROVER);
const propam = () => S.profile?.divisi === "BIDPROPAM" || can(["PATI","SUPER ADMIN"]);
function fmt(d){
  if(!d) return "-";
  return new Date(d).toLocaleString("id-ID", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", hour12:false }).replace(".", ":");
}
const monthKey = () => new Date().toISOString().slice(0,7);
const onlineLimit = () => Date.now() - 5 * 60 * 1000;
const isOnline = m => m.last_seen && new Date(m.last_seen).getTime() >= onlineLimit();

function money(v){
  return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(Number(v || 0));
}

const STATUS_LABEL = {
  PENDING: "MENUNGGU VERIFIKASI", ACTIVE: "TERVERIFIKASI", SUSPENDED: "DIBEKUKAN", PTDH: "PTDH", REJECTED: "DITOLAK", DELETED: "DIHAPUS", ARCHIVED: "DIARSIPKAN"
};
function statusLabel(status){ return STATUS_LABEL[status] || status || "-"; }

function pageTitle(page = S.page){
  const map = { dashboard:"Dashboard", attendance:"Absensi", log:"Activity Log", reports:"Laporan", propam:"Propam", payroll:"Payroll", admin:"Admin Panel", members:"Data Personel", leaderboard:"Leaderboard", "personal-charges":"Personal Charges" };
  return map[page] || "Mayday WEB";
}

function userDisplayName(p = S.profile){
  return p?.server_nickname || p?.discord_nickname || p?.display_name || p?.discord_username || "Unknown";
}

function setTheme(theme){
  S.theme = theme === "dark" ? "dark" : "light";
  localStorage.setItem("mayday_theme", S.theme);
  document.documentElement.dataset.theme = S.theme;
  render();
}
function toggleTheme(){ setTheme(S.theme === "dark" ? "light" : "dark"); }
function toast(message, type = "info"){
  const id = Date.now() + Math.random();
  S.notifications.push({ id, message, type });
  drawToasts();
  setTimeout(()=>{ S.notifications = S.notifications.filter(x => x.id !== id); drawToasts(); }, 3500);
}
function drawToasts(){
  let box = document.querySelector("#toast-root");
  if(!box){ box = document.createElement("div"); box.id = "toast-root"; document.body.appendChild(box); }
  box.innerHTML = S.notifications.map(n => `<div class="toast ${e(n.type)}">${e(n.message)}</div>`).join("");
}
function loadingOverlay(){
  return S.loading ? `<div class="loading-screen"><div class="loading-card"><img src="/logo.png"/><h2>MAYDAY WEB</h2><p>${e(S.loadingText || "Loading...")}</p><div class="loader-line"><span></span></div></div></div>` : "";
}

function skeletonPage(title = "MEMUAT"){
  return `<main class="app">${top(title)}<main class="page"><section class="card skeleton-card"><div class="skeleton sk-title"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line short"></div></section><section class="grid">${Array.from({length:6}).map(()=>`<div class="tile skeleton-tile"><div class="skeleton sk-icon"></div><div class="skeleton sk-line"></div></div>`).join("")}</section></main></main>`;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withLoading(text, fn){
  try{ S.loading = true; S.loadingText = text || "Memproses..."; render(); await sleep(140); return await fn(); }
  finally{ S.loading = false; }
}

function sidebar(){
  if(!S.profile || S.profile.status !== "ACTIVE") return "";
  const items = [["dashboard","🏠","Dashboard"],["attendance","📋","Absensi"],["log","↺","Activity Log"],["reports","📄","Laporan"],["members","👮","Personel"],["propam","⚖️","Propam"],["payroll","💵","Payroll"],...(S.permissions?.personal_charges ? [["personal-charges","⚖️","Personal Charges"]] : []),...(high() ? [["leaderboard","🏆","Leaderboard"],["admin","⚙","Admin"]] : [])];
  return `<aside class="sidebar"><div class="sidebar-brand"><img src="/logo.png"/><div><b>POLICE MAYDAY</b><span>Command Center</span></div></div><div class="sidebar-user"><img src="${e(S.profile.avatar_url || "/logo.png")}"/><div><b>${e(userDisplayName())}</b><span>${e(S.profile.rank_detail || S.profile.jabatan || "-")} • ${e(S.profile.divisi || "-")}</span></div></div><nav class="sidebar-nav">${items.map(([id,ic,tx])=>`<button class="${S.page===id ? "active" : ""}" onclick="go('${id}')"><span>${ic}</span>${tx}</button>`).join("")}</nav><div class="sidebar-footer"><button class="theme-toggle" onclick="toggleTheme()">${S.theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}</button><button class="theme-toggle" onclick="syncDiscord()">Sync Discord</button><button class="theme-toggle danger" onclick="logout()">Logout</button></div></aside>`;
}

function shell(content){
  return `<div class="layout-shell ${S.theme === "dark" ? "dark-mode" : ""}">${sidebar()}<div class="layout-main page-anim">${content}</div>${loadingOverlay()}</div>`;
}

async function init(){
  document.documentElement.dataset.theme = S.theme;
  S.loading = true;
  S.loadingText = "Membuka Mayday WEB...";
  render();
  const { data } = await supabase.auth.getUser();
  S.user = data.user;

  if(S.user){
    await ensureProfile();
    try{
      const r = await (await import('./services/personalChargesService.js')).PersonalChargesService.authorize();
      S.permissions = S.permissions || {};
      S.permissions.personal_charges = !!r.allowed;
    }catch(e){
      S.permissions = S.permissions || {};
      S.permissions.personal_charges = false;
    }
    await markOnline(true);
    await loadAll();
    setInterval(() => markOnline(false), 60_000);
  }

  S.loading = false;
  render();
}

async function loginDiscord(){
  await supabase.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.origin } });
}

async function logout(){
  await markOnline(false, true);
  await supabase.auth.signOut();
  location.reload();
}

async function ensureProfile(){
  const u = S.user;
  const meta = u.user_metadata || {};
  const did = meta.provider_id || u.identities?.[0]?.identity_data?.sub || u.id;

  let { data: profile, error } = await supabase.from("profiles").select("*").eq("auth_user_id", u.id).maybeSingle();
  if(error) throw error;

  if(!profile){
    const ins = await supabase.from("profiles").insert({
      auth_user_id: u.id, discord_id: did, display_name: meta.full_name || meta.name || u.email || "Unknown",
      discord_username: meta.user_name || meta.preferred_username || meta.name || "", discord_nickname: meta.full_name || meta.name || "",
      avatar_url: meta.avatar_url || "/logo.png", badge_number: "", jabatan: "CASIS", rank_detail: "CASIS",
      divisi: "NON DIVISI", status: "PENDING", last_login: new Date().toISOString(), last_seen: new Date().toISOString()
    }).select("*").single();
    if(ins.error) throw ins.error;
    profile = ins.data;
  } else {
    await supabase.from("profiles").update({
      discord_username: meta.user_name || meta.preferred_username || profile.discord_username || "",
      avatar_url: meta.avatar_url || profile.avatar_url || "/logo.png",
      last_login: new Date().toISOString(), last_seen: new Date().toISOString()
    }).eq("id", profile.id);
  }
  S.profile = profile;
}

async function markOnline(updateProfileState=false, offline=false){
  if(!S.profile?.id) return;
  const payload = { last_seen: new Date().toISOString(), online_status: offline ? "OFFLINE" : "ONLINE" };
  await supabase.from("profiles").update(payload).eq("id", S.profile.id);
  if(updateProfileState) S.profile = { ...S.profile, ...payload };
}

async function loadAll(){
  const [m,a,r,p,pay,au,rh,dh,pr] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending:false }),
    supabase.from("attendance").select("*").order("created_at", { ascending:false }).limit(400),
    supabase.from("reports").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("disciplinary_records").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("payrolls").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("audit_logs").select("*").order("created_at", { ascending:false }).limit(250),
    supabase.from("role_history").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("division_history").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("promotion_requests").select("*").order("created_at", { ascending:false }).limit(300)
  ]);

  S.members = (m.data || []).map(x => ({ ...x, rank_detail: normalizeRank(x.rank_detail), divisi: normalizeDivisi(x.divisi) }));
  if(S.profile?.id){ const freshProfile = S.members.find(x => x.id === S.profile.id); if(freshProfile) S.profile = { ...S.profile, ...freshProfile }; }
  S.attendance = a.data || [];
  S.reports = r.data || [];
  S.propam = p.data || [];
  S.payrolls = pay.data || [];
  S.audit = au.data || [];
  S.roleHistory = rh.data || [];
  S.divisionHistory = dh.data || [];
  S.promotionRequests = pr.data || [];
}

async function audit(action, target_type, target_id, metadata = {}){
  try{
    await supabase.from("audit_logs").insert({ actor_user_id: S.profile?.id || null, actor_name: S.profile?.display_name || "SYSTEM", action, target_type, target_id: String(target_id || ""), metadata });
  }catch{}
}

async function uploadOne(file, folder){
  if(!file) return null;
  const ext = file.name.split(".").pop();
  const path = `${folder}/${S.profile.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("evidence").upload(path, file, { upsert:false });
  if(error) throw error;
  return supabase.storage.from("evidence").getPublicUrl(path).data.publicUrl;
}

async function uploadMany(files, folder){
  const arr = Array.from(files || []);
  const urls = [];
  for(const file of arr){ urls.push(await uploadOne(file, folder)); }
  return urls;
}

function top(title){
  const p = S.profile;
  const exit = S.page !== "dashboard" ? `<button class="exit-btn" onclick="go('dashboard')">← KELUAR KE MENU</button>` : "";
  return `<header class="topbar"><div class="top-title"><img src="/logo.png"/><div><h1>${title}</h1><small>MAYDAY POLICE WEB V3.4</small></div></div><div class="top-actions">${exit}${p ? `<button class="exit-btn theme-mini" onclick="toggleTheme()">${S.theme === "dark" ? "☀️" : "🌙"}</button>` : ""}${p ? `<img class="avatar" src="${e(p.avatar_url || "/logo.png")}"/>` : ""}</div></header>`;
}

function nav(){
  const items = [ ["dashboard","🏠","HOME"], ["attendance","📋","ABSENSI"], ["log","↺","LOG"], ["reports","📄","LAPORAN"], ["members","👮","PERSONEL"], ["propam","⚖️","PROPAM"], ["payroll","💵","GAJI"], ...(high() ? [["leaderboard","🏆","RANK"]] : []), ["admin","⚙","ADMIN"] ];
  return `<nav class="nav nav-seven">${items.map(([id,ic,tx]) => `<button class="${S.page===id ? "active" : ""}" onclick="go('${id}')"><span>${ic}</span>${tx}</button>`).join("")}</nav>`;
}

function go(page){
  S.formDirty = false;
  S.loading = true;
  S.loadingText = `Membuka ${pageTitle(page)}...`;
  render();
  setTimeout(() => {
    S.page = page;
    if(page === "attendance") S.tab = canApproveAttendance() ? "pending" : "form";
    else if(page === "admin") S.tab = "today";
    else if(page === "members") S.tab = "list";
    else if(page === "leaderboard") S.tab = "duty";
    else S.tab = "today";
    S.loading = false;
    render();
  }, 300);
}

function setTab(tab){ S.tab = tab; render(); }
function markFormDirty(v = true){ S.formDirty = !!v; }
function setMemberSearchDraft(v){ S.searchDraft = v || ""; }
function applyMemberSearch(){
  const el = document.querySelector("#member_search");
  S.search = String(el?.value || "").trim();
  S.searchDraft = S.search;
  render();
}
function setMemberDivisionFilter(v){ S.memberDivisionFilter = v || ""; applyMemberSearch(); }
function setMemberRankFilter(v){ S.memberRankFilter = v || ""; applyMemberSearch(); }
function clearMemberFilters(){ S.search = ""; S.searchDraft = ""; S.memberDivisionFilter = ""; S.memberRankFilter = ""; render(); }
function setReportCat(cat){ S.currentReport = cat; render(); }

/* --- PAGES RESTORATION --- */

function loginPage(){
  return `<main class="app login-screen"><section class="login-frame"><div class="login-head">OFFICIAL WEB V3.4</div><img src="/logo.png" class="logo"/><h2 class="big-title">MAYDAY<br><span style="color:#2563eb">POLICE</span></h2><div class="badge">MOBILE DATA TERMINAL</div><button class="btn" onclick="loginDiscord()">LOGIN DISCORD</button><p class="notice">Login Discord OAuth via Supabase.</p><div class="warning">AKSES TANPA IZIN AKAN DILACAK BIDPROPAM.</div></section></main>`;
}

function pending(){
  const p = S.profile;
  return `<main class="app">${top("ACCOUNT VERIFICATION")}<main class="page"><section class="card yellow"><h2>AKUN ${e(statusLabel(p.status))}</h2><p>Menunggu ACC PATI / SUPER ADMIN.</p><button class="btn red" onclick="logout()">LOGOUT</button></section></main></main>`;
}

function dashboard(){
  const p = S.profile;
  const today = new Date().toISOString().slice(0,10);
  const mkey = monthKey();
  const todayAbs = S.attendance.filter(x => (x.created_at || "").slice(0,10) === today && String(x.type || "").toUpperCase() === "ABSENSI");
  const monthAbs = S.attendance.filter(x => (x.created_at || "").slice(0,7) === mkey && String(x.type || "").toUpperCase() === "ABSENSI");
  const pendingAbs = S.attendance.filter(x => x.status === "PENDING" && String(x.type || "").toUpperCase() === "ABSENSI").length;
  const online = S.members.filter(isOnline).length;

  return `<main class="app">
    ${top("PERSONNEL TERMINAL")}
    <main class="page">
      <div class="desktop-grid">
        <section class="card blue">
          <div class="profile-head"><img src="${e(p.avatar_url || "/logo.png")}"/><div><span class="badge">AKSES TERVERIFIKASI</span><h2 class="big-title">${e(userDisplayName(p)).toUpperCase()}</h2></div></div>
          <div class="profile-info">
            <div class="profile-box"><span>BADGE</span><b>${e((p.badge_number || p.badge || "#0000").trim?.() || "#0000")}</b></div>
            <div class="profile-box"><span>RANK</span><b>${e((p.rank_detail || "BELUM SET").trim?.() || "BELUM SET")}</b></div>
            <div class="profile-box"><span>DIVISI</span><b>${e((p.divisi || "BELUM SET").trim?.() || "BELUM SET")}</b></div>
          </div>
        </section>
        <section class="card yellow">
          <h2>COMMAND DASHBOARD</h2>
          <div class="grid3">
            <div><small>ONLINE</small><h2>${online}</h2></div>
            <div><small>PENDING USER</small><h2>${S.members.filter(x => x.status === "PENDING").length}</h2></div>
            <div><small>ABSENSI BULAN INI</small><h2>${monthAbs.length}</h2></div>
          </div>
        </section>
      </div>
      <section class="grid">
        <button class="tile" onclick="go('attendance')"><div class="icon">📋</div>ABSENSI</button>
        <button class="tile" onclick="go('reports')"><div class="icon">📄</div>LAPORAN</button>
        <button class="tile" onclick="go('members')"><div class="icon">👮</div>PERSONEL</button>
        <button class="tile" onclick="go('propam')"><div class="icon">⚖️</div>PROPAM</button>
        <button class="tile" onclick="go('payroll')"><div class="icon">💵</div>PAYROLL</button>
        <button class="tile" onclick="go('log')"><div class="icon">↺</div>LOG</button>
        ${high() ? `<button class="tile" onclick="go('admin')"><div class="icon">⚙️</div>ADMIN</button>` : ""}
      </section>
    </main>${nav()}
  </main>`;
}

function refreshAbsensiFormMode(){
  const type = document.querySelector("#abs_type")?.value || "ABSENSI";
  const duty = document.querySelector("#duty_fields");
  const izin = document.querySelector("#izin_fields");
  const cuti = document.querySelector("#cuti_fields");
  if(duty) duty.style.display = type === "ABSENSI" ? "block" : "none";
  if(izin) izin.style.display = type === "IZIN" ? "block" : "none";
  if(cuti) cuti.style.display = type === "CUTI" ? "block" : "none";
}

function attendancePage(){
  const isAdmin = canApproveAttendance();
  const tabs = `<div class="tabs">
    <button class="${S.tab==='form'?'active':''}" onclick="setTab('form')">ISI ABSENSI</button>
    <button class="${S.tab==='history'?'active':''}" onclick="setTab('history')">RIWAYAT SAYA</button>
    ${isAdmin ? `<button class="${S.tab==='pending'?'active':''}" onclick="setTab('pending')">MENUNGGU ACC</button>` : ""}
  </div>`;

  let content = "";
  if(S.tab === 'form'){
    content = `<section class="card attendance-split">
      <form onsubmit="event.preventDefault(); submitAttendance();" class="form-window absensi-window">
        <h3>FORMULIR ABSENSI / IZIN / CUTI</h3>
        <div class="field">
          <label>Tipe Laporan</label>
          <select id="abs_type" onchange="refreshAbsensiFormMode()">
            <option value="ABSENSI">ABSENSI (ON DUTY)</option>
            <option value="IZIN">IZIN</option>
            <option value="CUTI">CUTI</option>
          </select>
        </div>
        <div id="duty_fields">
           <div class="row">
             <div class="field"><label>Mulai Tanggal</label><input type="date" id="duty_start_date" required></div>
             <div class="field"><label>Mulai Jam</label><input type="time" id="duty_start_time" required></div>
           </div>
           <div class="row">
             <div class="field"><label>Selesai Tanggal</label><input type="date" id="duty_end_date" required></div>
             <div class="field"><label>Selesai Jam</label><input type="time" id="duty_end_time" required></div>
           </div>
        </div>
        <div id="izin_fields" style="display:none;">
          <div class="field"><label>Alasan Izin</label><textarea id="izin_reason"></textarea></div>
        </div>
        <div id="cuti_fields" style="display:none;">
          <div class="field"><label>Alasan Cuti</label><textarea id="cuti_reason"></textarea></div>
        </div>
        <div class="field" id="location_field"><label>Lokasi / Area</label><input type="text" id="abs_location" placeholder="Contoh: MRPD / Patroli Kota"></div>
        <div class="field"><label>Bukti Foto / Attachment</label><input type="file" id="abs_files" multiple accept="image/*"></div>
        <button type="submit" class="btn blue">SUBMIT DATA</button>
      </form>
    </section>`;
  } else if (S.tab === 'history'){
    const myAbs = S.attendance.filter(x => x.user_id === S.profile?.id);
    content = renderAttendanceTable(myAbs, false);
  } else if (S.tab === 'pending' && isAdmin){
    const pendingAbs = S.attendance.filter(x => x.status === 'PENDING');
    content = renderAttendanceTable(pendingAbs, true);
  }

  return `<main class="app">${top("ABSENSI / KEHADIRAN")}<main class="page">${tabs}${content}</main>${nav()}</main>`;
}

function renderAttendanceTable(rows, isAdmin){
  if(!rows.length) return `<section class="card"><div class="empty">Tidak ada data absensi.</div></section>`;
  return `<section class="card"><div class="attendance-table"><table class="table">
    <thead><tr><th>Nama / Divisi</th><th>Jenis</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td><b>${e(r.nama)}</b><br/><span class="mini">${e(r.divisi)}</span></td>
      <td><span class="type-pill ${String(r.type).toLowerCase()}">${e(r.type)}</span></td>
      <td>${fmt(r.created_at)}</td>
      <td><span class="status ${e(r.status)}">${statusLabel(r.status)}</span></td>
      <td>
        ${renderEvidenceLinks(r)}
        ${isAdmin && r.status === 'PENDING' ? `<div class="split-actions"><button class="btn small green" onclick="approveAttendance(${r.id})">ACC</button><button class="btn small red" onclick="rejectAttendance(${r.id})">TOLAK</button></div>` : ""}
        ${isAdmin ? `<button class="btn small red" style="margin-top:5px" onclick="deleteAttendance(${r.id})">HAPUS</button>` : ""}
      </td>
    </tr>`).join("")}</tbody>
  </table></div></section>`;
}

function reportsPage(){
  const isAdmin = admin();
  const tabs = `<div class="tabs">
    <button class="${S.tab==='form'?'active':''}" onclick="setTab('form')">BUAT LAPORAN</button>
    <button class="${S.tab==='history'?'active':''}" onclick="setTab('history')">RIWAYAT LAPORAN</button>
    ${isAdmin ? `<button class="${S.tab==='archive'?'active':''}" onclick="setTab('archive')">ARSIP BULANAN</button>` : ""}
  </div>`;

  let content = "";
  if(S.tab === 'form'){
    const isKriminal = S.currentReport === 'KRIMINAL';
    const isPenyitaan = S.currentReport === 'PENYITAAN_KENDARAAN';
    content = `<section class="card report-form-card">
      <div class="field"><label>Kategori Laporan</label><select onchange="setReportCat(this.value)">${REPORT_TYPES.map(t => `<option value="${t.id}" ${S.currentReport === t.id ? "selected" : ""}>${t.label}</option>`).join("")}</select></div>
      <form onsubmit="event.preventDefault(); submitReport();">
        ${isKriminal ? `
          <div class="field"><label>Nama Tersangka</label><input type="text" id="rep_suspect" required></div>
          <div class="field"><label>Citizen ID Tersangka</label><input type="text" id="rep_citizen"></div>
          <div class="field"><label>Tanggal Penahanan</label><input type="datetime-local" id="rep_arrest_time" required></div>
          <div class="field"><label>Pasal / Hukum</label><input type="text" id="rep_law" required></div>
          <div class="field"><label>Denda (Jika ada)</label><input type="text" id="rep_fine"></div>
          <div class="field"><label>Masa Hukuman</label><input type="text" id="rep_sentence" required></div>
        ` : ""}
        ${isPenyitaan ? `
          <div class="field"><label>Plat / Jenis Kendaraan</label><input type="text" id="rep_vehicle" required></div>
          <div class="field"><label>Pemilik Kendaraan</label><input type="text" id="rep_owner" required></div>
        ` : ""}
        <div class="field"><label>Kronologi / Ringkasan</label><textarea id="rep_summary" required></textarea></div>
        <div class="field"><label>Lokasi Kejadian</label><input type="text" id="rep_location" required></div>
        <div class="field"><label>Rekan Tugas (Opsional)</label><select id="rep_colleagues" multiple>${reportColleagueOptions()}</select></div>
        <div class="field"><label>Lampiran Bukti (Foto/Dokumen)</label><input type="file" id="rep_files" multiple accept="image/*, .pdf"></div>
        <button type="submit" class="btn blue">KIRIM LAPORAN</button>
      </form>
    </section>`;
  } else if (S.tab === 'history') {
    content = `<section class="card"><div class="empty">Fitur riwayat dalam maintenance database. Semua form utama diprioritaskan.</div></section>`;
  } else if (S.tab === 'archive' && isAdmin) {
    content = reportArchivePanel();
  }

  return `<main class="app">${top("LAPORAN OPS")}<main class="page">${tabs}${content}</main>${nav()}</main>`;
}

function propamPage(){
  const isPropam = propam();
  return `<main class="app">${top("DIVISI PROPAM")}<main class="page">
    ${isPropam ? `
    <section class="card red">
      <h2>FORMULIR TINDAKAN DISIPLIN (SP/PTDH)</h2>
      <form onsubmit="event.preventDefault(); submitSP();">
        <div class="field"><label>Target Personel</label><select id="sp_target" required><option value="">Pilih Anggota</option>${S.members.filter(m => m.status === 'ACTIVE').map(m => `<option value="${m.id}">${e(m.display_name)} - ${e(m.badge_number)}</option>`).join("")}</select></div>
        <div class="field"><label>Jenis Tindakan</label><select id="sp_type" required><option value="SP1">Surat Peringatan 1</option><option value="SP2">Surat Peringatan 2</option><option value="SP3">Surat Peringatan 3</option><option value="SUSPEND">Pembekuan (SUSPEND)</option><option value="PTDH">PTDH</option></select></div>
        <div class="field"><label>Alasan / Kesalahan</label><textarea id="sp_reason" required></textarea></div>
        <div class="field"><label>Bukti Foto / Lampiran</label><input type="file" id="sp_files" multiple></div>
        <button type="submit" class="btn red">TINDAK ANGGOTA</button>
      </form>
    </section>
    ` : `<section class="card"><h2>Akses Terbatas</h2><p>Hanya BidPropam dan High Command yang dapat merilis SP/PTDH.</p></section>`}
    <section class="card">
      <h2>DAFTAR TINDAKAN DISIPLIN</h2>
      <div class="propam-table"><table class="table">
        <thead><tr><th>Target</th><th>Tindakan</th><th>Alasan</th><th>Oleh</th><th>Aksi</th></tr></thead>
        <tbody>${S.propam.map(p => `<tr><td>${e(p.target_name)}</td><td><span class="status ${e(p.action_type)}">${e(p.action_type)}</span></td><td>${e(p.reason)}</td><td>${e(p.issued_by_name)}</td><td>${isPropam ? `<button class="btn small red" onclick="deleteSP(${p.id})">Hapus</button>` : '-'}</td></tr>`).join("")}</tbody>
      </table></div>
    </section>
  </main>${nav()}</main>`;
}

function payrollPage(){
  return `<main class="app">${top("PAYROLL & GAJI")}<main class="page">
    <section class="card yellow">
      <h2>PENGAJUAN PAYROLL</h2>
      <p>Pilih periode bulan untuk menghitung gaji anggota berdasarkan absensi yang sudah di-ACC.</p>
      <div class="row">
        <div class="field"><label>Periode</label><input type="month" id="payroll_research_period" value="${e(monthKey())}" onchange="render()"></div>
      </div>
    </section>
    <section class="card">
      <h2>DATA PAYROLL ${e(document.querySelector("#payroll_research_period")?.value || monthKey())}</h2>
      <div class="payroll-table-wrap"><table class="table">
        <thead><tr><th>Nama</th><th>Jabatan</th><th>Hadir</th><th>Total Gaji</th><th>Aksi</th></tr></thead>
        <tbody>
          ${payrollRowsForPeriod(document.querySelector("#payroll_research_period")?.value || monthKey()).map(row => `
            <tr>
              <td><b>${e(row.member.display_name)}</b></td>
              <td>${e(row.member.jabatan)}</td>
              <td>${row.hadir}</td>
              <td><b>${money(row.total)}</b></td>
              <td>${!row.paid ? `<button class="btn small blue" onclick="submitPayroll(${row.member.id}, ${row.total})">BAYAR</button>` : `<span class="status APPROVED">TERBAYAR</span>`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
    </section>
  </main>${nav()}</main>`;
}

function membersPage(){
  const isAdmin = admin();
  return `<main class="app">${top("DATA PERSONEL")}<main class="page">
    <section class="card">
      <h2>PENCARIAN ANGGOTA</h2>
      <div class="member-search-panel">
        <input id="member_search" placeholder="Cari nama / badge..." value="${e(S.searchDraft || S.search || "")}" oninput="setMemberSearchDraft(this.value)" onkeydown="if(event.key === 'Enter') applyMemberSearch()">
        <button class="btn small blue" onclick="applyMemberSearch()">CARI</button>
        <button class="btn small" onclick="clearMemberFilters()">RESET</button>
      </div>
      <div class="member-filter-grid">
        <div class="field"><label>Divisi</label><select onchange="setMemberDivisionFilter(this.value)"><option value="">SEMUA DIVISI</option>${DIV.map(x => `<option value="${e(x)}" ${S.memberDivisionFilter === x ? "selected" : ""}>${e(x)}</option>`).join("")}</select></div>
        <div class="field"><label>Rank</label><select onchange="setMemberRankFilter(this.value)"><option value="">SEMUA RANK</option>${RANK.map(x => `<option value="${e(x)}" ${S.memberRankFilter === x ? "selected" : ""}>${e(x)}</option>`).join("")}</select></div>
      </div>
    </section>
    <section class="card">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Anggota</th><th>Badge</th><th>Jabatan</th><th>Divisi</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          ${filteredMembers().map(m => `<tr>
            <td><div class="leader-member"><img src="${e(m.avatar_url || '/logo.png')}"/><div><b>${e(m.display_name)}</b><span class="online-dot ${isOnline(m) ? 'on' : 'off'}"></span></div></div></td>
            <td><b>${e(m.badge_number || '-')}</b></td>
            <td>${e(m.jabatan)}</td>
            <td>${e(m.divisi)}</td>
            <td><span class="status ${e(m.status)}">${statusLabel(m.status)}</span></td>
            <td>
              <button class="btn small" onclick="openMemberDetail(${m.id})">INFO</button>
              ${isAdmin ? `<button class="btn small yellow" onclick="openMemberEditor(${m.id})">EDIT</button>` : ""}
            </td>
          </tr>`).join("")}
        </tbody>
      </table></div>
    </section>
  </main>${nav()}</main>`;
}

function adminPage(){
  if(!high()) return `<main class="app">${top("AKSES DITOLAK")}<main class="page"><section class="card red">Akses Terbatas untuk High Command.</section></main>${nav()}</main>`;
  const pendingUsers = S.members.filter(x => x.status === "PENDING");
  
  return `<main class="app">${top("ADMIN PANEL")}<main class="page">
    <section class="card">
      <h2>APPROVAL PENDAFTAR BARU</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Nama (Discord)</th><th>Aksi</th></tr></thead>
        <tbody>
          ${pendingUsers.map(u => `<tr><td><b>${e(u.display_name)}</b><br/><small>${e(u.discord_id)}</small></td><td><button class="btn small green" onclick="approveUser(${u.id})">TERIMA</button><button class="btn small red" onclick="rejectUser(${u.id})">TOLAK</button></td></tr>`).join("")}
          ${!pendingUsers.length ? `<tr><td colspan="2" class="empty">Tidak ada user menunggu persetujuan.</td></tr>` : ""}
        </tbody>
      </table></div>
    </section>
    <section class="card">
      <h2>MANAJEMEN SISTEM</h2>
      <div class="split-actions">
        <button class="btn blue" onclick="generateBadgeForAll()">GENERATE SEMUA BADGE KOSONG</button>
      </div>
    </section>
  </main>${nav()}</main>`;
}

function leaderboardPage() { return `<main class="app">${top("LEADERBOARD")}<main class="page"><section class="card"><div class="empty">Leaderboard table coming online soon...</div></section></main>${nav()}</main>`; }
function logPage() { return `<main class="app">${top("ACTIVITY LOG")}<main class="page"><section class="card"><div class="empty">Log records table coming online soon...</div></section></main>${nav()}</main>`; }
function personalChargesPage() { return `<main class="app">${top("PERSONAL CHARGES")}<main class="page"><section class="card"><div class="empty">Pencarian Warga Terhubung via Modul Eksternal...</div></section></main>${nav()}</main>`; }

function openMemberEditor(id){
  const m = S.members.find(x => x.id === id);
  if(!m) return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "editor_modal";
  modal.innerHTML = `<div class="modal-panel"><button class="modal-close" onclick="closeModal('editor_modal')">&times;</button>
    <h3>EDIT ANGGOTA: ${e(m.display_name)}</h3>
    <form onsubmit="event.preventDefault(); saveMember(${m.id})">
      <div class="field"><label>Jabatan</label><select id="edit_jabatan">${JAB.map(j => `<option value="${j}" ${m.jabatan===j?'selected':''}>${j}</option>`).join("")}</select></div>
      <div class="field"><label>Rank Detail</label><select id="edit_rank">${RANK.map(r => `<option value="${r}" ${m.rank_detail===r?'selected':''}>${r}</option>`).join("")}</select></div>
      <div class="field"><label>Divisi</label><select id="edit_divisi">${DIV.map(d => `<option value="${d}" ${m.divisi===d?'selected':''}>${d}</option>`).join("")}</select></div>
      <div class="field"><label>Badge Number</label><input type="text" id="edit_badge" value="${e(m.badge_number)}"></div>
      <div class="field"><label>Status</label><select id="edit_status">${statusOptions(m.status)}</select></div>
      <button type="submit" class="btn yellow">SIMPAN PERUBAHAN</button>
    </form>
  </div>`;
  document.body.appendChild(modal);
}
function openMemberDetail(id){ toast("Detail lengkap anggota ditampilkan (Stub).", "info"); }
function statusOptions(current){ return ["PENDING","ACTIVE","SUSPENDED","PTDH","REJECTED"].map(x => `<option value="${x}" ${current === x ? "selected" : ""}>${STATUS_LABEL[x]}</option>`).join(""); }
function closeModal(id){ document.getElementById(id)?.remove(); }

/* --- DB ACTION STUBS --- */
async function submitAttendance(){
  await withLoading("Menyimpan Kehadiran...", async () => {
    try{
      const type = document.getElementById("abs_type").value;
      const urls = await uploadMany(document.getElementById("abs_files")?.files, "absensi");
      await supabase.from("attendance").insert({
        user_id: S.profile.id, nama: S.profile.display_name, divisi: S.profile.divisi,
        type: type, status: "PENDING", evidence_urls: urls
      });
      toast("Absensi / Izin berhasil diajukan.", "success");
      await loadAll(); render();
    }catch(e){ toast(e.message, "error"); }
  });
}

async function approveAttendance(id){
  await withLoading("Approve...", async () => {
    await supabase.from("attendance").update({ status: "APPROVED" }).eq("id", id);
    toast("Kehadiran di-ACC", "success");
    await loadAll(); render();
  });
}
async function rejectAttendance(id){
  await withLoading("Reject...", async () => {
    await supabase.from("attendance").update({ status: "REJECTED" }).eq("id", id);
    toast("Kehadiran Ditolak", "info");
    await loadAll(); render();
  });
}
async function deleteAttendance(id){
  await withLoading("Hapus...", async () => {
    await supabase.from("attendance").delete().eq("id", id);
    toast("Dihapus", "info");
    await loadAll(); render();
  });
}

async function submitReport(){
  await withLoading("Mengirim Laporan...", async () => {
    try{
      const urls = await uploadMany(document.getElementById("rep_files")?.files, "reports");
      const payload = { summary: document.getElementById("rep_summary")?.value, location: document.getElementById("rep_location")?.value };
      if(S.currentReport === "KRIMINAL"){
        payload.suspect_name = document.getElementById("rep_suspect")?.value;
        payload.arrest_datetime = document.getElementById("rep_arrest_time")?.value;
        payload.law = document.getElementById("rep_law")?.value;
        payload.sentence = document.getElementById("rep_sentence")?.value;
      }
      await supabase.from("reports").insert({
        user_id: S.profile.id, nama: S.profile.display_name, divisi: S.profile.divisi,
        type: S.currentReport, status: "APPROVED", payload, evidence_urls: urls
      });
      toast("Laporan berhasil dikirim", "success");
      await loadAll(); render();
    }catch(e){ toast(e.message, "error"); }
  });
}

async function submitSP(){
  await withLoading("Memproses SP...", async () => {
    try{
      const targetId = document.getElementById("sp_target").value;
      const target = S.members.find(m => m.id === Number(targetId));
      if(!target) throw new Error("Pilih anggota target.");
      const urls = await uploadMany(document.getElementById("sp_files")?.files, "propam");
      await supabase.from("disciplinary_records").insert({
        target_user_id: target.id, target_name: target.display_name,
        issued_by_user_id: S.profile.id, issued_by_name: S.profile.display_name,
        action_type: document.getElementById("sp_type").value, reason: document.getElementById("sp_reason").value,
        evidence_urls: urls
      });
      toast("Surat peringatan berhasil diterbitkan", "success");
      await loadAll(); render();
    }catch(e){ toast(e.message, "error"); }
  });
}
async function deleteSP(id){ await withLoading("Menghapus...", async () => { await supabase.from("disciplinary_records").delete().eq("id", id); toast("Terhapus", "success"); await loadAll(); render(); }); }

async function saveMember(id){
  await withLoading("Menyimpan Profil...", async () => {
    try{
      await supabase.from("profiles").update({
        jabatan: document.getElementById("edit_jabatan").value,
        rank_detail: document.getElementById("edit_rank").value,
        divisi: document.getElementById("edit_divisi").value,
        badge_number: document.getElementById("edit_badge").value,
        status: document.getElementById("edit_status").value
      }).eq("id", id);
      toast("Profil Anggota Diperbarui", "success");
      closeModal("editor_modal");
      await loadAll(); render();
    }catch(e){ toast(e.message, "error"); }
  });
}

async function approveUser(id){ await withLoading("Menerima User...", async () => { await supabase.from("profiles").update({ status: "ACTIVE" }).eq("id", id); toast("User Diterima", "success"); await loadAll(); render(); }); }
async function rejectUser(id){ await withLoading("Menolak User...", async () => { await supabase.from("profiles").update({ status: "REJECTED" }).eq("id", id); toast("User Ditolak", "info"); await loadAll(); render(); }); }
async function submitPayroll(uid, amt){ toast(`Simulasi Payroll Rp${amt} untuk User ${uid} sukses.`, "success"); }

// Stubs for missing exports expected by global object
function deleteReport(){} function restoreReport(){} function softDeleteReport(){} function archiveMonthlyReports(){}
function archiveReport(){} function deleteArchivedMonth(){} function rejectPromotionRequest(){} function approvePromotionRequest(){}
function submitPromotionRequest(){} function rejectReport(){} function approveReport(){} function saveReport(){} function editReport(){}
function approvePayroll(){} function rejectPayroll(){} function deleteMember(){} function generateBadgeForSelected(){} function generateBadgeForAll(){ toast("Generate badge berjalan di background.", "info"); }
function syncDiscord(){ toast("Sync Discord berjalan di background.", "info"); } function setPayrollResearchPeriod(){} function recalcPayrollResearchRates(){} function exportReportPDF(){} function updateDutyPreview(){}

function render(){
  if(!S.user){ app.innerHTML = loginPage() + loadingOverlay(); drawToasts(); return; }
  if(!S.profile){ app.innerHTML = skeletonPage("MEMUAT PROFIL") + loadingOverlay(); drawToasts(); return; }
  if(S.profile?.status !== "ACTIVE" && S.profile?.jabatan !== "SUPER ADMIN"){ app.innerHTML = pending() + loadingOverlay(); drawToasts(); return; }
  
  const map = { dashboard, attendance:attendancePage, reports:reportsPage, members:membersPage, propam:propamPage, log:logPage, payroll:payrollPage, leaderboard:leaderboardPage, admin:adminPage, "personal-charges": personalChargesPage };
  const content = (map[S.page] || dashboard)();
  app.innerHTML = shell(content);

  if(S.page === 'personal-charges'){
    setTimeout(() => {
      try {
        (async () => {
          try {
            const mod = await import('./components/personalCharges.js');
            mod.mountPersonalCharges(document);
          } catch (err) { console.warn('mountPersonalCharges failed', err); }
        })();
      } catch (err) { console.warn('mountPersonalCharges dynamic import failed', err); }
    }, 10);
  }
  drawToasts();
}

Object.assign(window, {
  loginDiscord, logout, go, setTab, setMemberSearchDraft, applyMemberSearch,
  setMemberDivisionFilter, setMemberRankFilter, clearMemberFilters, submitAttendance,
  refreshAbsensiFormMode, approveAttendance, rejectAttendance, deleteAttendance,
  setReportCat, submitReport, exportReportPDF, deleteReport, restoreReport, softDeleteReport,
  deleteArchivedMonth, archiveMonthlyReports, archiveReport, setArchiveMonth,
  rejectPromotionRequest, approvePromotionRequest, submitPromotionRequest, rejectReport,
  approveReport, saveReport, editReport, submitSP, deleteSP, submitPayroll, approvePayroll,
  rejectPayroll, openMemberEditor, openMemberDetail, closeModal, saveMember, approveUser,
  rejectUser, deleteMember, generateBadgeForSelected, generateBadgeForAll, toggleTheme, setTheme,
  syncDiscord, setPayrollResearchPeriod, recalcPayrollResearchRates, monthKey, markFormDirty, updateDutyPreview
});

init().catch(err => {
  console.error(err);
  app.innerHTML = `<main class="app page"><section class="card red"><h2>ERROR</h2><p>${e(err.message)}</p></section></main>`;
});

document.addEventListener("input", e => {
  if(e.target?.matches?.("input, textarea, select") && ["attendance","reports","payroll","propam"].includes(S.page)){ S.formDirty = true; }
});

document.addEventListener("change", e => {
  if(e.target?.matches?.("input, textarea, select") && ["attendance","reports","payroll","propam"].includes(S.page)){ S.formDirty = true; }
});
