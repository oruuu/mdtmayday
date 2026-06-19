import { supabase } from "./supabase.js";

const app = document.querySelector("#app");

const S = {
  user: null,
  profile: null,
  page: "dashboard",
  tab: "today",
  search: "",
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
  loadingText: "Memuat data MDT...",
  realtimeReady: false,
  notifications: [],
  theme: localStorage.getItem("mayday_theme") || "light"
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


const REPORT_TYPES = [
  { id:"PATROLI", label:"PATROLI" },
  { id:"KRIMINAL", label:"LAPORAN PENANGKAPAN" },
  { id:"PENYITAAN_KENDARAAN", label:"LAPORAN PENYITAAN KENDARAAN" }
];

const ACTIVITY_CAP_BY_RANK = {
  "CASIS": 20,
  "Bharada": 30,
  "Bharatu": 50,
  "Bharaka": 65,
  "Bripda": 75,
  "Briptu": 85,
  "Brigpol": 95,
  "Bripka": 110,
  "Aipda": 130,
  "Aiptu": 150,
  "Ipda": 180,
  "Iptu": 220,
  "AKP": 260,
  "Kompol": 300,
  "AKBP": 350,
  "Kombes": 400,
  "Brigjen": 999999,
  "Irjen": 999999,
  "Komjen": 999999,
  "Jenderal Polisi": 999999,
  "PATI": 999999,
  "Super Admin": 999999
};

const REPORT_ACTIVITY_POINTS = {
  "PATROLI": 2,
  "PENYITAAN_KENDARAAN": 2,
  "KRIMINAL": 3
};

function reportPointValue(type){
  return REPORT_ACTIVITY_POINTS[type] || 1;
}

function rankIndex(rank){
  return RANK.findIndex(x => String(x).toLowerCase() === String(rank || "").toLowerCase());
}

function nextRank(rank){
  const idx = rankIndex(rank);
  if(idx < 0 || idx >= RANK.length - 1) return "";
  const next = RANK[idx + 1];
  return next === "Super Admin" ? "" : next;
}

function isUnlimitedRank(rank){
  return ["PATI","SUPER ADMIN","Brigjen","Irjen","Komjen","Jenderal Polisi","Super Admin"].includes(rank);
}

function rankProgress(member = S.profile){
  const rank = member?.rank_detail || member?.jabatan || "CASIS";
  const point = Number(member?.activity_points_month || 0);
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

function reportVisibleInMain(r){
  return REPORT_TYPES.some(t => t.id === r.type) && !["ARCHIVED","DELETED"].includes(String(r.status || "").toUpperCase());
}

function reportVisibleInArchive(r){
  const st = String(r.status || "").toUpperCase();
  return high() && ["ARCHIVED","DELETED"].includes(st);
}

function reportArchiveStats(month = S.archiveMonth){
  const rows = S.reports.filter(r => reportVisibleInArchive(r) && reportMonthKey(r) === month);
  return {
    patrol: rows.filter(r => r.type === "PATROLI").length,
    arrest: rows.filter(r => r.type === "KRIMINAL").length,
    seizure: rows.filter(r => r.type === "PENYITAAN_KENDARAAN").length,
    total: rows.length
  };
}

function reportArchiveMonths(){
  const months = new Set();
  S.reports
    .filter(r => reportVisibleInArchive(r))
    .forEach(r => months.add(reportMonthKey(r)));
  months.add(S.archiveMonth || monthKey());
  return [...months].filter(Boolean).sort().reverse();
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

function reportArchivePanel(){
  if(!high()){
    return `<section class="card red">
      <h2>ARSIP LAPORAN BULANAN</h2>
      <p>Arsip laporan bulanan hanya bisa dilihat PATI dan SUPER ADMIN.</p>
    </section>`;
  }

  const month = S.archiveMonth || monthKey();
  const stats = reportArchiveStats(month);
  const months = reportArchiveMonths();
  const rows = S.reports.filter(r => reportVisibleInArchive(r) && reportMonthKey(r) === month);

  return `<section class="card archive-panel">
    <div class="section-head">
      <div>
        <h2>ARSIP LAPORAN BULANAN</h2>
        <p class="mini">Contoh: Arsip Juni berisi laporan bulan Juni, Arsip Juli berisi laporan bulan Juli.</p>
      </div>
      <span class="status APPROVED">${stats.total} ARSIP</span>
    </div>

    <div class="archive-month-tabs">
      ${months.map(m => `<button class="${month === m ? "active" : ""}" onclick="setArchiveMonth('${m}')">${e(monthNameID(m))}</button>`).join("")}
    </div>

    <div class="row">
      <div class="field">
        <label>Pilih Bulan Manual</label>
        <input type="month" value="${e(month)}" onchange="setArchiveMonth(this.value)"/>
      </div>
      <div class="field">
        <label>Isi Arsip ${e(monthNameID(month))}</label>
        <input readonly value="Patroli ${stats.patrol} | Penangkapan ${stats.arrest} | Penyitaan ${stats.seizure}"/>
      </div>
    </div>

    <div class="split-actions">
      <button class="btn small yellow" onclick="archiveMonthlyReports()">ARSIPKAN LAPORAN APPROVED BULAN INI</button>
      <button class="btn small red" onclick="deleteArchivedMonth()">HAPUS ARSIP BULAN INI</button>
    </div>

    <div class="archive-list">
      ${rows.map(r => `<div class="list-item">
        <h3>${e(reportTypeLabel(r.type))} - ${e(r.nama)}</h3>
        <div class="mini">${e(monthNameID(reportMonthKey(r)))} • <span class="status ${e(r.status)}">${e(statusLabel(r.status))}</span></div>
        ${r.type === "KRIMINAL" ? `<pre class="report-archive-pre">${e(formatArrestReport(r))}</pre>` : `<p>${e((r.payload || {}).chronology || (r.payload || {}).summary || (r.payload || {}).area || "-")}</p>`}
        ${renderEvidenceLinks(r)}
        <div class="split-actions">
          ${String(r.status).toUpperCase() === "DELETED" ? `<button class="btn small green" onclick="restoreReport(${r.id})">RESTORE KE ARSIP</button>` : `<button class="btn small red" onclick="softDeleteReport(${r.id})">HAPUS DARI ARSIP</button>`}
        </div>
      </div>`).join("") || `<div class="empty">Belum ada arsip laporan untuk ${e(monthNameID(month))}.</div>`}
    </div>
  </section>`;
}

function reportTypeLabel(type){
  return REPORT_TYPES.find(x => x.id === type)?.label || type || "LAPORAN";
}

function activityCapFor(member){
  return ACTIVITY_CAP_BY_RANK[member?.rank_detail] ?? ACTIVITY_CAP_BY_RANK[member?.jabatan] ?? 10;
}

function reportColleagueOptions(selected = []){
  const set = new Set((selected || []).map(String));
  return S.members
    .filter(m => m.status === "ACTIVE" && m.id !== S.profile?.id)
    .map(m => `<option value="${m.id}" ${set.has(String(m.id)) ? "selected" : ""}>${e(userDisplayName(m))} - ${e(m.rank_detail || m.jabatan || "-")} - ${e(m.divisi || "-")}</option>`)
    .join("");
}

function getSelectedColleagues(){
  const el = document.querySelector("#rep_colleagues");
  return Array.from(el?.selectedOptions || []).map(o => Number(o.value)).filter(Boolean);
}

function canManageReports(){
  return can(["PATI","SUPER ADMIN"]);
}

function canEditReport(r){
  return r.user_id === S.profile?.id && ["PENDING","REJECTED"].includes(r.status);
}

function canDeleteReport(r){
  return canManageReports();
}

async function addActivityPoint(userId, reason = "REPORT_APPROVED", amount = 1){
  const member = S.members.find(x => x.id === userId);
  if(!member) return;

  const period = monthKey();
  const currentPeriod = member.activity_points_period || period;
  const current = currentPeriod === period ? Number(member.activity_points_month || 0) : 0;
  const cap = activityCapFor(member);
  const unlimited = isUnlimitedRank(member.rank_detail || member.jabatan) || cap >= 999999;
  const add = Number(amount || 1);
  const next = unlimited ? current + add : Math.min(cap, current + add);
  const gained = Math.max(0, next - current);
  const total = Number(member.activity_points_total || 0) + gained;

  await supabase.from("profiles").update({
    activity_points_period: period,
    activity_points_month: next,
    activity_points_total: total
  }).eq("id", userId);

  const local = S.members.find(x => x.id === userId);
  if(local){
    local.activity_points_period = period;
    local.activity_points_month = next;
    local.activity_points_total = total;
  }

  await audit("ADD_ACTIVITY_POINT", "profiles", userId, { reason, before: current, after: next, cap, amount:add, gained });
}

async function grantReportActivityPoints(report){
  const payload = report.payload || {};
  const amount = reportPointValue(report.type);
  const ids = new Set([report.user_id, ...(payload.colleagues || []).map(Number)].filter(Boolean));
  for(const id of ids){
    await addActivityPoint(id, `REPORT_${report.id}_${report.type}_APPROVED`, amount);
  }
}

const HIGH = ["PATI","SUPER ADMIN"];
const MAN = ["PATI","SUPER ADMIN"];
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
function fmt(d){
  if(!d) return "-";
  return new Date(d).toLocaleString("id-ID", {
    day:"2-digit",
    month:"2-digit",
    year:"numeric",
    hour:"2-digit",
    minute:"2-digit",
    hour12:false
  }).replace(".", ":");
}
const monthKey = () => new Date().toISOString().slice(0,7);
const onlineLimit = () => Date.now() - 5 * 60 * 1000;
const isOnline = m => m.last_seen && new Date(m.last_seen).getTime() >= onlineLimit();
const PERSONNEL_REFRESH_INTERVAL = 10 * 60 * 1000;
let lastPersonnelRefreshAt = 0;
const POINTS_PER_HOUR = 10;
const PAYROLL_PER_POINT = 1000;
const MIN_DUTY_MINUTES = 30;

function money(v){
  return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(Number(v || 0));
}
function roundPoint(v){ return Math.round(Number(v || 0) * 100) / 100; }
function dutyPointFromMinutes(minutes){ return roundPoint((Number(minutes || 0) / 60) * POINTS_PER_HOUR); }
function payrollFromPoints(points){ return Math.round(Number(points || 0) * PAYROLL_PER_POINT); }
function combineDateTime(date, time){
  if(!date || !time) return null;
  return new Date(`${date}T${time}:00`);
}
function calcDutyFromInputs(){
  const sd = document.querySelector("#duty_start_date")?.value;
  const st = document.querySelector("#duty_start_time")?.value;
  const ed = document.querySelector("#duty_end_date")?.value;
  const et = document.querySelector("#duty_end_time")?.value;
  const start = combineDateTime(sd, st);
  const end = combineDateTime(ed, et);
  if(!start || !end || isNaN(start) || isNaN(end)) return null;
  const minutes = Math.floor((end.getTime() - start.getTime()) / 60000);
  const points = dutyPointFromMinutes(minutes);
  const payroll = payrollFromPoints(points);
  return { start, end, minutes, hours: Math.round((minutes / 60) * 100) / 100, points, payroll };
}
function updateDutyPreview(){
  const type = document.querySelector("#abs_type")?.value || "ABSENSI";
  const preview = document.querySelector("#duty_preview");
  if(!preview) return;
  if(type !== "ABSENSI"){ preview.innerHTML = ""; return; }
  const d = calcDutyFromInputs();
  if(!d){
    preview.innerHTML = `<div class="payroll-preview warning-soft">Isi tanggal dan jam ONDUTY / OFFDUTY.</div>`;
    return;
  }
  const valid = d.minutes >= MIN_DUTY_MINUTES;
  preview.innerHTML = `<div class="payroll-preview ${valid ? "ok" : "bad"}">
    <div><small>TOTAL DURASI</small><b>${d.minutes > 0 ? `${Math.floor(d.minutes/60)}j ${d.minutes%60}m` : "Tidak valid"}</b></div>
    <div><small>TOTAL MENIT</small><b>${Math.max(0, d.minutes)}</b></div>
    <div><small>POINT</small><b>${d.minutes > 0 ? d.points : 0}</b></div>
    <div><small>ESTIMASI GAJI</small><b>${d.minutes > 0 ? money(d.payroll) : money(0)}</b></div>
    ${valid ? "" : `<p>Minimal duty ${MIN_DUTY_MINUTES} menit.</p>`}
  </div>`;
}
function refreshAbsensiFormMode(){
  const type = document.querySelector("#abs_type")?.value || "ABSENSI";
  const duty = document.querySelector("#duty_fields");
  const izin = document.querySelector("#izin_fields");
  const cuti = document.querySelector("#cuti_fields");
  const lokasi = document.querySelector("#location_field");
  const fileLabel = document.querySelector("#abs_file_label");
  if(duty) duty.style.display = type === "ABSENSI" ? "block" : "none";
  if(izin) izin.style.display = type === "IZIN" ? "block" : "none";
  if(cuti) cuti.style.display = type === "CUTI" ? "block" : "none";
  if(lokasi) lokasi.style.display = type === "ABSENSI" ? "block" : "none";
  if(fileLabel) fileLabel.textContent = type === "ABSENSI" ? "Bukti Foto Wajib Bisa Lebih Dari 1" : "Bukti Foto Opsional Bisa Lebih Dari 1";
  updateDutyPreview();
}


const STATUS_LABEL = {
  PENDING: "MENUNGGU VERIFIKASI",
  ACTIVE: "TERVERIFIKASI",
  SUSPENDED: "DIBEKUKAN",
  PTDH: "PTDH",
  REJECTED: "DITOLAK",
  DELETED: "DIHAPUS",
  ARCHIVED: "DIARSIPKAN"
};

function statusLabel(status){
  return STATUS_LABEL[status] || status || "-";
}

function statusOptions(current){
  return ["PENDING","ACTIVE","SUSPENDED","PTDH","REJECTED"].map(x =>
    `<option value="${x}" ${current === x ? "selected" : ""}>${STATUS_LABEL[x]}</option>`
  ).join("");
}

function canDeleteMember(){
  return can(["PATI","SUPER ADMIN"]);
}


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function pageTitle(page = S.page){
  const map = { dashboard:"Dashboard", attendance:"Absensi", log:"Activity Log", reports:"Laporan", propam:"Propam", payroll:"Payroll", admin:"Admin Panel", members:"Data Personel" };
  return map[page] || "Mayday MDT";
}

function userDisplayName(p = S.profile){
  return p?.discord_nickname || p?.server_nickname || p?.display_name || p?.discord_username || "Unknown";
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
  return S.loading ? `<div class="loading-screen"><div class="loading-card"><img src="/logo.png"/><h2>MAYDAY MDT</h2><p>${e(S.loadingText || "Loading...")}</p><div class="loader-line"><span></span></div></div></div>` : "";
}
function skeletonPage(title = "MEMUAT"){
  return `<main class="app">${top(title)}<main class="page">
      ${promotionAdminPanel()}<section class="card skeleton-card"><div class="skeleton sk-title"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line short"></div></section><section class="grid">${Array.from({length:6}).map(()=>`<div class="tile skeleton-tile"><div class="skeleton sk-icon"></div><div class="skeleton sk-line"></div></div>`).join("")}</section></main></main>`;
}
async function withLoading(text, fn){
  try{ S.loading = true; S.loadingText = text || "Memproses..."; render(); await sleep(140); return await fn(); }
  finally{ S.loading = false; }
}
function sidebar(){
  if(!S.profile || S.profile.status !== "ACTIVE") return "";
  const items = [["dashboard","🏠","Dashboard"],["attendance","📋","Absensi"],["log","↺","Activity Log"],["reports","📄","Laporan"],["members","👮","Personel"],["propam","⚖️","Propam"],["payroll","💵","Payroll"],...(high() ? [["admin","⚙","Admin"]] : [])];
  return `<aside class="sidebar"><div class="sidebar-brand"><img src="/logo.png"/><div><b>MAYDAY MDT</b><span>Command Center</span></div></div><div class="sidebar-user"><img src="${e(S.profile.avatar_url || "/logo.png")}"/><div><b>${e(userDisplayName())}</b><span>${e(S.profile.rank_detail || S.profile.jabatan || "-")} • ${e(S.profile.divisi || "-")}</span></div></div><nav class="sidebar-nav">${items.map(([id,ic,tx])=>`<button class="${S.page===id ? "active" : ""}" onclick="go('${id}')"><span>${ic}</span>${tx}</button>`).join("")}</nav><div class="sidebar-footer"><button class="theme-toggle" onclick="toggleTheme()">${S.theme === "dark" ? "☀️ Light Mode" : "🌙 Dark Mode"}</button><button class="theme-toggle" onclick="syncDiscord()">Sync Discord</button><button class="theme-toggle danger" onclick="logout()">Logout</button></div></aside>`;
}
function shell(content){
  return `<div class="layout-shell ${S.theme === "dark" ? "dark-mode" : ""}">${sidebar()}<div class="layout-main page-anim">${content}</div>${loadingOverlay()}</div>`;
}


async function init(){
  document.documentElement.dataset.theme = S.theme;
  S.loading = true;
  S.loadingText = "Membuka Mayday MDT...";
  render();
  const { data } = await supabase.auth.getUser();
  S.user = data.user;

  if(S.user){
    await ensureProfile();
    await markOnline(true);
    await loadAll();
    setupRealtimeWeb();
    setInterval(() => markOnline(false), 60_000);
  }

  S.loading = false;
  render();
}

async function loginDiscord(){
  await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo: location.origin }
  });
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
      discord_username: meta.user_name || meta.preferred_username || meta.name || "",
      discord_nickname: meta.full_name || meta.name || "",
      avatar_url: meta.avatar_url || "/logo.png",
      badge_number: "",
      jabatan: "CASIS",
      rank_detail: "CASIS",
      divisi: "CASIS",
      status: "PENDING",
      last_login: new Date().toISOString(),
      last_seen: new Date().toISOString()
    }).select("*").single();

    if(ins.error) throw ins.error;
    profile = ins.data;
  } else {
    await supabase.from("profiles").update({
      discord_username: meta.user_name || meta.preferred_username || profile.discord_username || "",
      avatar_url: meta.avatar_url || profile.avatar_url || "/logo.png",
      last_login: new Date().toISOString(),
      last_seen: new Date().toISOString()
    }).eq("id", profile.id);
  }

  S.profile = profile;
}

async function markOnline(updateProfileState=false, offline=false){
  if(!S.profile?.id) return;
  const payload = {
    last_seen: new Date().toISOString(),
    online_status: offline ? "OFFLINE" : "ONLINE"
  };
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

  S.members = m.data || [];
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

async function botEvent(event_type, payload = {}){
  try{
    await supabase.from("bot_events").insert({
      event_type,
      payload,
      status: "PENDING"
    });
  }catch(err){
    console.warn("bot event failed:", err.message);
  }
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
  for(const file of arr){
    urls.push(await uploadOne(file, folder));
  }
  return urls;
}

function top(title){
  const p = S.profile;
  const exit = S.page !== "dashboard" ? `<button class="exit-btn" onclick="go('dashboard')">← KELUAR KE MENU</button>` : "";
  return `<header class="topbar">
    <div class="top-title">
      <img src="/logo.png"/>
      <div>
        <h1>${title}</h1>
        <small>MAYDAY POLICE MDT V2.2</small>
      </div>
    </div>
    <div class="top-actions">
      ${exit}
      ${p ? `<button class="exit-btn theme-mini" onclick="toggleTheme()">${S.theme === "dark" ? "☀️" : "🌙"}</button>` : ""}
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
    ["members","👮","PERSONEL"],
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
  S.loading = true;
  S.loadingText = `Membuka ${pageTitle(page)}...`;
  render();
  setTimeout(() => {
    S.page = page;
    if(page === "attendance") S.tab = canApproveAttendance() ? "pending" : "form";
    else if(page === "admin") S.tab = "today";
    else if(page === "members") S.tab = "list";
    else S.tab = "today";
    S.loading = false;
    render();
  }, 180);
}

function setTab(tab){
  S.tab = tab;
  render();
}

function setSearch(v){
  S.search = v;
  render();
}

function filteredMembers(){
  const q = S.search.trim().toLowerCase();
  if(!q) return S.members;
  return S.members.filter(m => [
    m.display_name, m.badge_number, m.jabatan, m.rank_detail, m.divisi, m.status, m.discord_id
  ].some(x => String(x || "").toLowerCase().includes(q)));
}

function loginPage(){
  return `<main class="app login-screen">
    <section class="login-frame">
      <div class="login-head">OFFICIAL MDT V2.2</div>
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
        <h2>AKUN ${e(statusLabel(p.status))}</h2>
        <p>Menunggu ACC PATI / SUPER ADMIN.</p>
        <button class="btn red" onclick="logout()">LOGOUT</button>
      </section>

      <section class="card">
        <div class="profile-head">
          <img src="${e(p.avatar_url || "/logo.png")}"/>
          <div>
            <h2>${e(userDisplayName(p))}</h2>
            <span class="status ${e(statusLabel(p.status))}">${e(statusLabel(p.status))}</span>
          </div>
        </div>

        <div class="kv">
        <div><small>BADGE</small><strong>${e(p.badge_number || "BELUM ADA")}</strong></div>
        <div><small>JABATAN</small><strong>${e(p.jabatan || "BELUM SET")}</strong></div>
       <div><small>DIVISI</small><strong>${e(p.divisi || "BELUM SET")}</strong></div>
        </div>
      </section>
    </main>
  </main>`;
}

function dashboard(){
  const p = S.profile;
  const today = new Date().toISOString().slice(0,10);
  const mkey = monthKey();
  const todayAbs = S.attendance.filter(x => (x.created_at || "").slice(0,10) === today && String(x.type || "").toUpperCase() === "ABSENSI");
  const monthAbs = S.attendance.filter(x => (x.created_at || "").slice(0,7) === mkey && String(x.type || "").toUpperCase() === "ABSENSI");
  const pendingAbs = S.attendance.filter(x => x.status === "PENDING" && String(x.type || "").toUpperCase() === "ABSENSI").length;
  const pendingIzinCuti = S.attendance.filter(x => x.status === "PENDING" && ["IZIN","CUTI"].includes(String(x.type || "").toUpperCase())).length;
  const online = S.members.filter(isOnline).length;

  return `<main class="app">
    ${top("PERSONNEL TERMINAL")}
    <main class="page">
      <div class="desktop-grid">
        <section class="card blue">
          <div class="profile-head">
            <img src="${e(p.avatar_url || "/logo.png")}"/>
            <div>
              <span class="badge">AKSES TERVERIFIKASI</span>
              <h2 class="big-title">${e(userDisplayName(p)).toUpperCase()}</h2>
            </div>
          </div>
          <div class="profile-info">
           <div class="profile-box">
            <span>BADGE</span>
             <b>${e((p.badge_number || p.badge || "#0000").trim?.() || "#0000")}</b>
             </div>
            <div class="profile-box">
           <span>RANK</span>
             <b>${e((p.rank_detail || "BELUM SET").trim?.() || "BELUM SET")}</b>
          </div>
            <div class="profile-box">
           <span>DIVISI</span>
             <b>${e((p.divisi || "BELUM SET").trim?.() || "BELUM SET")}</b>
         </div>
      </div>
          <p class="mini white-mini">Last login: ${fmt(p.last_login)} • Last seen: ${fmt(p.last_seen)}</p>
          <div class="payroll-mini">
            <div><small>DUTY POINT</small><b>${Number(p.duty_points || 0)}</b></div>
            <div><small>ESTIMASI GAJI</small><b>${money(p.pending_payroll || 0)}</b></div>
          </div>
        </section>

        <section class="card yellow">
          <h2>COMMAND DASHBOARD</h2>
          <div class="grid3">
            <div><small>ONLINE</small><h2>${online}</h2></div>
            <div><small>PENDING USER</small><h2>${S.members.filter(x => x.status === "PENDING").length}</h2></div>
            <div><small>PENDING ABSENSI</small><h2>${pendingAbs}</h2></div>
          </div>
          <div class="grid3">
            <div><small>ABSENSI HARI INI</small><h2>${todayAbs.length}</h2></div>
            <div><small>ABSENSI BULAN INI</small><h2>${monthAbs.length}</h2></div>
            <div><small>IZIN/CUTI PENDING</small><h2>${pendingIzinCuti}</h2></div>
          </div>
        </section>
      </div>

      <section class="grid">
        <button class="tile" onclick="go('attendance')"><div class="icon">📋</div>ABSENSI<small>Input / ACC absensi</small></button>
        <button class="tile" onclick="go('reports')"><div class="icon">📄</div>LAPORAN<small>OPS & export PDF</small></button>
        <button class="tile" onclick="go('members')"><div class="icon">👮</div>PERSONEL<small>Online / search / riwayat</small></button>
        <button class="tile" onclick="go('propam')"><div class="icon">⚖️</div>PROPAM<small>SP / PTDH</small></button>
        <button class="tile" onclick="go('payroll')"><div class="icon">💵</div>PAYROLL<small>Pengajuan gaji</small></button>
        <button class="tile" onclick="go('log')"><div class="icon">↺</div>LOG<small>Activity log</small></button>
        ${high() ? `<button class="tile" onclick="go('admin')"><div class="icon">⚙</div>ADMIN<small>Panel petinggi</small></button>` : ""}
      </section>

      ${activityProgressCard()}
      ${commandStatsCard()}
      ${leaderboardCard()}
      ${liveMemberCard()}
      ${!p.badge_number ? `<section class="card red"><h2>BADGE BELUM DISET</h2><p>Badge bisa diedit oleh perwira/admin.</p></section>` : ""}
    </main>${nav()}
  </main>`;
}

function activityProgressCard(){
  const p = S.profile;
  const pr = rankProgress(p);
  const pending = S.promotionRequests?.find(x => x.user_id === p.id && x.status === "PENDING");

  return `<section class="card activity-card">
    <div class="section-head">
      <div>
        <h2>ACTIVITY POINT</h2>
        <p class="mini">Syarat administrasi kenaikan pangkat.</p>
      </div>
      <span class="status ${pr.eligible ? "APPROVED" : "PENDING"}">${pr.unlimited ? "UNLIMITED" : `${pr.point}/${pr.cap}`}</span>
    </div>

    <div class="activity-rank-row">
      <div><small>RANK SAAT INI</small><b>${e(pr.rank)}</b></div>
      <div><small>RANK TUJUAN</small><b>${e(pr.target || "MAX RANK")}</b></div>
      <div><small>PROGRESS</small><b>${pr.unlimited ? "∞" : `${pr.pct}%`}</b></div>
    </div>

    <div class="activity-progress"><span style="width:${pr.pct}%"></span></div>

    ${pending ? `<div class="warning-soft-mini">Pengajuan kenaikan pangkat sedang menunggu ACC.</div>` : pr.eligible ? `<button class="btn green" onclick="submitPromotionRequest()">AJUKAN KENAIKAN PANGKAT</button>` : `<p class="notice">Belum memenuhi syarat. Butuh ${pr.unlimited ? "0" : Math.max(0, pr.cap - pr.point)} point lagi.</p>`}
  </section>`;
}

function leaderboardCard(){
  const rows = [...S.members].sort((a,b) => Number(b.duty_points || 0) - Number(a.duty_points || 0)).slice(0,10);
  return `<section class="card"><h2>LEADERBOARD DUTY POINT</h2>
    ${rows.some(r => Number(r.duty_points || 0) > 0) ? rows.map((r,i) => `<div class="leader-row"><b>#${i+1} ${e(userDisplayName(r))}</b><span>${e(r.divisi || "-")} • ${Number(r.duty_points || 0)} point • ${money(r.pending_payroll || 0)}</span></div>`).join("") : `<div class="empty">Belum ada duty point.</div>`}
  </section>`;
}


function commandStatsCard(){
  const divMap = {};
  for(const m of S.members){ const key = m.divisi || "LAINNYA"; divMap[key] = (divMap[key] || 0) + 1; }
  const max = Math.max(1, ...Object.values(divMap));
  const rows = Object.entries(divMap).sort((a,b)=>b[1]-a[1]);
  return `<section class="card command-panel"><div class="section-head"><div><h2>DASHBOARD PETINGGI</h2><p class="mini">Statistik anggota, divisi, absensi, laporan, dan pelanggaran.</p></div><button class="btn small" onclick="syncDiscord()">SYNC DISCORD</button></div><div class="stats-grid"><div><small>TOTAL ANGGOTA</small><b>${S.members.length}</b></div><div><small>TERVERIFIKASI</small><b>${S.members.filter(x=>x.status==="ACTIVE").length}</b></div><div><small>LAPORAN</small><b>${S.reports.length}</b></div><div><small>PAYROLL</small><b>${S.payrolls.filter(x=>x.status==="PENDING").length}</b></div></div><h3>STATISTIK DIVISI</h3><div class="chart-list">${rows.map(([name,total])=>`<div class="chart-row"><span>${e(name)}</span><div class="chart-track"><i style="width:${Math.max(8, Math.round((total/max)*100))}%"></i></div><b>${total}</b></div>`).join("") || `<div class="empty">Belum ada data divisi.</div>`}</div></section>`;
}
function liveMemberCard(){
  const online = S.members.filter(isOnline).slice(0,12);
  return `<section class="card"><div class="section-head"><div><h2>LIVE MEMBER</h2><p class="mini">Anggota yang aktif dalam 5 menit terakhir.</p></div><span class="status ACTIVE">${online.length} ONLINE</span></div><div class="live-grid">${online.map(m=>`<div class="live-member"><img src="${e(m.avatar_url || "/logo.png")}"/><div><b>${e(userDisplayName(m))}</b><span>${e(m.rank_detail || m.jabatan || "-")} • ${e(m.divisi || "-")}</span></div></div>`).join("") || `<div class="empty">Belum ada anggota online.</div>`}</div></section>`;
}
function setupRealtimeWeb(){
  if(S.realtimeReady) return; S.realtimeReady = true;

  const reloadAndToast = async msg => {
    await loadAll();
    toast(msg, "success");
    render();
  };

  const reloadPersonnelSlow = async () => {
    const now = Date.now();

    // profiles sering berubah karena last_seen / online_status.
    // Supaya halaman Personel tidak ganggu, data personel maksimal reload 1x per 10 menit.
    if(now - lastPersonnelRefreshAt < PERSONNEL_REFRESH_INTERVAL) return;

    lastPersonnelRefreshAt = now;
    await loadAll();

    // Toast hanya muncul kalau user sedang di halaman personel/admin/dashboard,
    // biar tidak spam saat update last_seen.
    if(["members","admin","dashboard"].includes(S.page)){
      toast("Data personel diperbarui. Refresh berikutnya maksimal 10 menit sekali.", "info");
    }

    render();
  };

  supabase
    .channel("web-profiles-live")
    .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, reloadPersonnelSlow)
    .subscribe();

  supabase.channel("web-attendance-live").on("postgres_changes", { event:"*", schema:"public", table:"attendance" }, () => reloadAndToast("Data absensi diperbarui")).subscribe();
  supabase.channel("web-reports-live").on("postgres_changes", { event:"*", schema:"public", table:"reports" }, () => reloadAndToast("Laporan baru masuk")).subscribe();
  supabase.channel("web-propam-live").on("postgres_changes", { event:"*", schema:"public", table:"disciplinary_records" }, () => reloadAndToast("Data Propam diperbarui")).subscribe();
  supabase.channel("web-payroll-live").on("postgres_changes", { event:"*", schema:"public", table:"payrolls" }, () => reloadAndToast("Payroll diperbarui")).subscribe();
  supabase.channel("web-promotion-live").on("postgres_changes", { event:"*", schema:"public", table:"promotion_requests" }, () => reloadAndToast("Pengajuan kenaikan pangkat diperbarui")).subscribe();
}
async function syncDiscord(){
  if(!S.profile?.discord_id) return toast("Discord ID belum tersedia.", "error");
  await withLoading("Sinkronisasi Discord...", async () => {
    await botEvent("SYNC_DISCORD_PROFILE", { profile_id:S.profile.id, discord_id:S.profile.discord_id, requested_by:userDisplayName() });
    toast("Request sync Discord dikirim ke bot.", "success");
  });
  S.loading = false; render();
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


function renderAbsensiTypeHint(type){
  const box = document.querySelector("#abs_type_hint");
  if(!box) return;
  const map = {
    ABSENSI:{cls:"type-hint absensi",title:"ABSENSI",text:"Isi ONDUTY dan OFFDUTY manual. Foto bukti wajib. Point masuk payroll setelah ACC."},
    IZIN:{cls:"type-hint izin",title:"IZIN",text:"Isi tanggal izin dan alasan. Menunggu ACC admin / PATI."},
    CUTI:{cls:"type-hint cuti",title:"CUTI",text:"Isi tanggal mulai sampai selesai cuti dan alasan. Menunggu ACC admin / PATI."}
  };
  const item = map[type] || map.ABSENSI;
  box.className = item.cls;
  box.innerHTML = `<b>${item.title}</b><span>${item.text}</span>`;
  refreshAbsensiFormMode();
}

function attendanceForm(){
  const p = S.profile;
  const today = new Date().toISOString().slice(0,10);
  return `<section class="card">
    <h2>FORM ABSENSI / IZIN / CUTI</h2>
    <div class="kv">
      <div><small>NAMA</small><strong>${e(userDisplayName(p))}</strong></div>
      <div><small>RANK</small><strong>${e(p.rank_detail || p.jabatan || "-")}</strong></div>
      <div><small>DIVISI</small><strong>${e(p.divisi || "-")}</strong></div>
    </div>
    <div class="row">
      <div class="field">
        <label>Jenis Pengajuan</label>
        <select id="abs_type" onchange="renderAbsensiTypeHint(this.value)">
          <option>ABSENSI</option><option>IZIN</option><option>CUTI</option>
        </select>
      </div>
      <div class="field" id="location_field"><label>Lokasi Duty</label><input id="abs_location" placeholder="Kota Mayday / Kantor"/></div>
    </div>
    <div id="abs_type_hint" class="type-hint absensi"><b>ABSENSI</b><span>Isi ONDUTY dan OFFDUTY manual. Foto bukti wajib. Point masuk payroll setelah ACC.</span></div>
    <div id="duty_fields" class="form-window absensi-window">
      <h3>DATA DUTY</h3>
      <div class="row">
        <div class="field"><label>Tanggal ONDUTY</label><input id="duty_start_date" type="date" value="${today}" onchange="updateDutyPreview()"/></div>
        <div class="field"><label>Jam ONDUTY</label><input id="duty_start_time" type="time" onchange="updateDutyPreview()"/></div>
      </div>
      <div class="row">
        <div class="field"><label>Tanggal OFFDUTY</label><input id="duty_end_date" type="date" value="${today}" onchange="updateDutyPreview()"/></div>
        <div class="field"><label>Jam OFFDUTY</label><input id="duty_end_time" type="time" onchange="updateDutyPreview()"/></div>
      </div>
      <div id="duty_preview"></div>
    </div>
    <div id="izin_fields" class="form-window izin-window" style="display:none">
      <h3>DATA IZIN</h3>
      <div class="field"><label>Tanggal Izin</label><input id="izin_date" type="date" value="${today}"/></div>
    </div>
    <div id="cuti_fields" class="form-window cuti-window" style="display:none">
      <h3>DATA CUTI</h3>
      <div class="row">
        <div class="field"><label>Tanggal Mulai Cuti</label><input id="cuti_start_date" type="date" value="${today}"/></div>
        <div class="field"><label>Tanggal Selesai Cuti</label><input id="cuti_end_date" type="date" value="${today}"/></div>
      </div>
    </div>
    <div class="field"><label>Keterangan / Alasan</label><textarea id="abs_note" placeholder="Absensi: keterangan duty. Izin/Cuti: alasan pengajuan."></textarea></div>
    <div class="field"><label id="abs_file_label">Bukti Foto Wajib Bisa Lebih Dari 1</label><input id="abs_file" type="file" accept="image/*" multiple/></div>
    <button class="btn blue" onclick="submitAttendance()">KIRIM PENGAJUAN</button>
  </section>`;
}

function attendanceAdminPanel(){
  let rows = S.attendance;

  if(S.tab === "pending") rows = rows.filter(x => x.status === "PENDING");
  if(S.tab === "approved") rows = rows.filter(x => x.status === "APPROVED");
  if(S.tab === "rejected") rows = rows.filter(x => x.status === "REJECTED");
  if(!canApproveAttendance()) rows = rows.filter(x => x.user_id === S.profile.id);

  const absensiRows = rows.filter(x => String(x.type || "").toUpperCase() === "ABSENSI");
  const izinCutiRows = rows.filter(x => ["IZIN","CUTI"].includes(String(x.type || "").toUpperCase()));

  return `<section class="attendance-split">
    ${attendanceTableBlock("ABSENSI", "absensi-block", absensiRows, "Log khusus ABSENSI / hadir duty.")}
    ${attendanceTableBlock("IZIN & CUTI", "izin-cuti-block", izinCutiRows, "Log gabungan pengajuan IZIN dan CUTI.")}
  </section>`;
}

function attendanceTableBlock(title, cls, rows, desc){
  return `<section class="card ${cls}">
    <div class="section-head"><div><h2>${title}</h2><p class="mini">${desc}</p></div><span class="status PENDING">${rows.filter(x => x.status === "PENDING").length} PENDING</span></div>
    ${rows.length ? `<table class="table"><thead><tr><th>Anggota</th><th>Jenis</th><th>Status</th><th>Detail</th><th>Keterangan</th>${canApproveAttendance() ? `<th>Aksi</th>` : ""}</tr></thead><tbody>
      ${rows.map(r => {
        const kind = String(r.type || "").toUpperCase();
        const detail = kind === "ABSENSI"
          ? `ONDUTY: ${fmt(r.duty_start_at)}<br>OFFDUTY: ${fmt(r.duty_end_at)}<br><b>${Number(r.total_minutes || 0)} menit • ${Number(r.total_points || 0)} point</b><br>${money(r.payroll_value || 0)}`
          : kind === "IZIN" ? `Tanggal izin: <b>${e(r.leave_start_date || "-")}</b>` : `Mulai: <b>${e(r.leave_start_date || "-")}</b><br>Selesai: <b>${e(r.leave_end_date || "-")}</b>`;
        return `<tr>
          <td><b>${e(r.nama)}</b><br><span class="mini">${e(r.badge_number || "NO BADGE")} • ${e(r.divisi || "-")}</span></td>
          <td><span class="type-pill ${e(String(r.type || "").toLowerCase())}">${e(r.type || "-")}</span></td>
          <td><span class="status ${e(r.status)}">${e(statusLabel(r.status))}</span></td>
          <td><span class="mini">${detail}</span></td>
          <td>${e(r.note || "-")}<br>${r.location ? `<span class="mini">${e(r.location)}</span>` : ""}${r.approval_note ? `<br><span class="mini">ACC: ${e(r.approval_note)}</span>` : ""}${r.reject_reason ? `<br><span class="mini">Alasan Tolak: ${e(r.reject_reason)}</span>` : ""}<p><b>Activity Point:</b> ${reportPointValue(r.type)} point</p>
    ${renderEvidenceLinks(r)}</td>
          ${canApproveAttendance() ? `<td>${r.status === "PENDING" ? `<button class="btn small green" onclick="approveAttendance(${r.id})">ACC</button><button class="btn small red" onclick="rejectAttendance(${r.id})">TOLAK</button>` : `<span class="mini">oleh ${e(r.approved_by || "-")}</span>`}</td>` : ""}
        </tr>`;
      }).join("")}</tbody></table>` : `<div class="empty">Tidak ada data ${title.toLowerCase()}.</div>`}
  </section>`;
}

function getEvidenceList(r){
  if(Array.isArray(r.evidence_urls) && r.evidence_urls.length) return r.evidence_urls;
  if(r.evidence_url) return [r.evidence_url];
  return [];
}

function renderEvidenceLinks(r){
  const urls = getEvidenceList(r);
  if(!urls.length) return "";
  return `<div class="evidence-links">${urls.map((u,i)=>`<a href="${e(u)}" target="_blank">Bukti ${i+1}</a>`).join(" ")}</div>`;
}

async function submitAttendance(){
  try{
    const p = S.profile;
    const type = document.querySelector("#abs_type").value;
    const files = document.querySelector("#abs_file").files;
    const note = document.querySelector("#abs_note").value || "-";
    if(type === "ABSENSI" && (!files || files.length < 1)) return alert("Absensi wajib upload minimal 1 foto bukti.");
    if(["IZIN","CUTI"].includes(type) && !note.trim()) return alert("Alasan izin/cuti wajib diisi.");

    let dutyData = {};
    let leaveData = {};

    if(type === "ABSENSI"){
      const d = calcDutyFromInputs();
      if(!d) return alert("Tanggal dan jam ONDUTY / OFFDUTY wajib diisi.");
      if(d.minutes < MIN_DUTY_MINUTES) return alert(`Minimal duty ${MIN_DUTY_MINUTES} menit.`);
      dutyData = {
        duty_start_date: document.querySelector("#duty_start_date").value,
        duty_start_time: document.querySelector("#duty_start_time").value,
        duty_end_date: document.querySelector("#duty_end_date").value,
        duty_end_time: document.querySelector("#duty_end_time").value,
        duty_start_at: d.start.toISOString(),
        duty_end_at: d.end.toISOString(),
        total_minutes: d.minutes,
        total_hours: d.hours,
        total_points: d.points,
        payroll_value: d.payroll
      };
    }

    if(type === "IZIN"){
      const izinDate = document.querySelector("#izin_date").value;
      if(!izinDate) return alert("Tanggal izin wajib diisi.");
      leaveData = { leave_start_date: izinDate, leave_end_date: izinDate };
    }

    if(type === "CUTI"){
      const start = document.querySelector("#cuti_start_date").value;
      const end = document.querySelector("#cuti_end_date").value;
      if(!start || !end) return alert("Tanggal mulai dan selesai cuti wajib diisi.");
      if(new Date(end) < new Date(start)) return alert("Tanggal selesai cuti tidak boleh sebelum tanggal mulai.");
      leaveData = { leave_start_date: start, leave_end_date: end };
    }

    const evidenceUrls = await uploadMany(files, "attendance");
    const item = {
      user_id: p.id, discord_id: p.discord_id, nama: userDisplayName(p),
      jabatan: p.jabatan, rank_detail: p.rank_detail, divisi: p.divisi,
      badge_number: p.badge_number || "", type,
      location: type === "ABSENSI" ? document.querySelector("#abs_location").value : "",
      note, evidence_url: evidenceUrls[0] || null, evidence_urls: evidenceUrls,
      status: "PENDING", ...dutyData, ...leaveData
    };
    const { error } = await supabase.from("attendance").insert(item);
    if(error) throw error;
    await audit(`CREATE_${type}`, "attendance", "", item);
    await loadAll();
    toast(`${type} masuk ke log dan menunggu ACC.`, "success");
    go("log"); S.tab = "attendance"; render();
  }catch(err){ alert(err.message); }
}

async function approveAttendance(id){
  if(!canApproveAttendance()) return alert("Akses ditolak. Hanya PATI / SUPER ADMIN yang bisa ACC absensi.");
  const row = S.attendance.find(x => x.id === id);
  if(!row) return alert("Data tidak ditemukan.");
  const note = prompt("Keterangan ACC") || "Disetujui";
  const { error } = await supabase.from("attendance").update({ status:"APPROVED", approved_by:S.profile.display_name, approval_note:note }).eq("id", id);
  if(error) return alert(error.message);

  if(String(row.type || "").toUpperCase() === "ABSENSI"){
    const member = S.members.find(x => x.id === row.user_id);
    const prof = await supabase.from("profiles").update({
      duty_minutes: Number(member?.duty_minutes || 0) + Number(row.total_minutes || 0),
      duty_points: roundPoint(Number(member?.duty_points || 0) + Number(row.total_points || 0)),
      pending_payroll: Number(member?.pending_payroll || 0) + Number(row.payroll_value || 0)
    }).eq("id", row.user_id);
    if(prof.error) return alert(prof.error.message);
  }

  await audit("APPROVE_ATTENDANCE", "attendance", id, { note, row });
  await botEvent("ATTENDANCE_APPROVED", {
    id, nama: row?.nama, divisi: row?.divisi, badge_number: row?.badge_number,
    type: row?.type, approved_by: S.profile.display_name, note,
    total_minutes: row?.total_minutes, total_points: row?.total_points, payroll_value: row?.payroll_value,
    duty_start_at: row?.duty_start_at, duty_end_at: row?.duty_end_at,
    leave_start_date: row?.leave_start_date, leave_end_date: row?.leave_end_date
  });
  await loadAll();
  toast("Pengajuan berhasil di-ACC.", "success");
  render();
}

async function rejectAttendance(id){
  if(!canApproveAttendance()) return alert("Akses ditolak. Hanya PATI / SUPER ADMIN yang bisa menolak absensi.");
  const row = S.attendance.find(x => x.id === id);
  const reason = prompt("Alasan ditolak?") || "Ditolak oleh admin";

  const { error } = await supabase
    .from("attendance")
    .update({ status:"REJECTED", approved_by:S.profile.display_name, reject_reason:reason })
    .eq("id", id);

  if(error) return alert(error.message);

  await audit("REJECT_ATTENDANCE", "attendance", id, { reason, row });
  await botEvent("ATTENDANCE_REJECTED", {
    id,
    nama: row?.nama,
    divisi: row?.divisi,
    badge_number: row?.badge_number,
    type: row?.type,
    approved_by: S.profile.display_name,
    reason
  });
  await loadAll();
  render();
}

function reportsPage(){
  if(!S.currentReport || !REPORT_TYPES.some(x => x.id === S.currentReport)) S.currentReport = "PATROLI";

  return `<main class="app">
    ${top("LAPORAN OPERASI")}
    <main class="page">
      <section class="tabs">${REPORT_TYPES.map(c => `
        <button class="${S.currentReport===c.id ? "active" : ""}" onclick="setReportCat('${c.id}')">${c.label}</button>
      `).join("")}</section>

      ${reportForm()}
      ${high() ? reportArchivePanel() : ""}

      <section class="card">
        <div class="section-head">
          <div>
            <h2>RIWAYAT LAPORAN AKTIF</h2>
            <p class="mini">Laporan aktif yang belum masuk arsip bulanan.</p>
          </div>
        </div>
        ${S.reports.filter(reportVisibleInMain).slice(0,80).map(r=>reportItem(r)).join("") || `<div class="empty">Belum ada laporan aktif.</div>`}
      </section>
    </main>${nav()}
  </main>`;
}

function reportForm(edit = null){
  const p = S.profile;
  const payload = edit?.payload || {};
  const type = edit?.type || S.currentReport || "PATROLI";
  const today = new Date().toISOString().slice(0,10);
  const nowTime = new Date().toTimeString().slice(0,5);
  const isPatrol = type === "PATROLI";
  const isArrest = type === "KRIMINAL";
  const isSeizure = type === "PENYITAAN_KENDARAAN";

  return `<section class="card report-form-card">
    <h2>${edit ? "EDIT " : ""}${e(reportTypeLabel(type))}</h2>

    <div class="kv">
      <div><small>NAMA PETUGAS</small><strong>${e(userDisplayName(p))}</strong></div>
      <div><small>RANK</small><strong>${e(p.rank_detail || p.jabatan || "-")}</strong></div>
      <div><small>DIVISI</small><strong>${e(p.divisi || "-")}</strong></div>
    </div>

    <input id="rep_type" type="hidden" value="${e(type)}"/>

    ${isPatrol ? `
      <div class="row">
        <div class="field"><label>Tanggal Patroli</label><input id="rep_date" type="date" value="${e(payload.report_date || today)}"/></div>
        <div class="field"><label>Jam Patroli</label><input id="rep_time" type="text" inputmode="numeric" maxlength="5" placeholder="20:00" value="${e(payload.report_time || nowTime)}"/></div>
      </div>
      <div class="field"><label>Area Patroli</label><input id="rep_area" placeholder="Contoh: Las Venturas / Whitewood Estates" value="${e(payload.area || "")}"/></div>
      <div class="field"><label>Laporan Singkat Patroli</label><textarea id="rep_chronology">${e(payload.chronology || payload.report || "")}</textarea></div>
      <div class="field"><label>Foto Bukti Patroli Minimal 1 Foto</label><input id="rep_file" type="file" accept="image/*" multiple/></div>
    ` : isArrest ? `
      <div class="report-template-box">
        <b>ARSIP LAPORAN BARU DITERIMA - KATEGORI: PENANGKAPAN</b>
        <span>Laporan akan disusun otomatis sesuai format arsip penangkapan.</span>
      </div>

      <h3>I. Informasi Penahanan</h3>
      <div class="row">
        <div class="field"><label>Tanggal Penahanan</label><input id="rep_date" type="date" value="${e(payload.report_date || today)}"/></div>
        <div class="field"><label>Waktu Penahanan</label><input id="rep_time" type="text" inputmode="numeric" maxlength="5" placeholder="20:00" value="${e(payload.report_time || nowTime)}"/></div>
      </div>
      <div class="field"><label>Lokasi Penahanan</label><input id="rep_detention_location" placeholder="Contoh: Pershing Square / Kantor Polisi" value="${e(payload.detention_location || "")}"/></div>
      <div class="field"><label>Deskripsi Singkat</label><textarea id="rep_summary">${e(payload.summary || payload.chronology || "")}</textarea></div>

      <h3>II. Informasi Tersangka</h3>
      <div class="field"><label>Nama Tersangka</label><input id="rep_suspect_name" placeholder="Nama lengkap tersangka" value="${e(payload.suspect_name || payload.subject_info || "")}"/></div>
      <div class="row">
        <div class="field"><label>Pasal</label><input id="rep_law" placeholder="Masukkan pasal" value="${e(payload.law || "")}"/></div>
        <div class="field"><label>Denda</label><input id="rep_fine" placeholder="Contoh: 50000" value="${e(payload.fine || "")}"/></div>
      </div>
      <div class="field"><label>Hukuman / Masa Tahanan</label><input id="rep_sentence" placeholder="Contoh: 60 menit" value="${e(payload.sentence || payload.duration || "")}"/></div>

      <h3>III. Identitas Petugas</h3>
      <div class="field"><label>Rekan Petugas</label><select id="rep_colleagues" multiple size="7">${reportColleagueOptions(payload.colleagues || [])}</select></div>

      <h3>IV. Barang Bukti</h3>
      <div class="field"><label>Jenis Barang Bukti</label><input id="rep_evidence_type" placeholder="Contoh: Senjata tajam / Narkotika / Uang tunai" value="${e(payload.evidence_type || "")}"/></div>
      <div class="field"><label>Keterangan Barang Bukti</label><textarea id="rep_evidence_desc">${e(payload.evidence_desc || "")}</textarea></div>
      <div class="field"><label>Bukti KTP & Barang Bukti Minimal 1 Foto</label><input id="rep_file" type="file" accept="image/*" multiple/></div>
    ` : `
      <div class="row">
        <div class="field"><label>Tanggal Penyitaan</label><input id="rep_date" type="date" value="${e(payload.report_date || today)}"/></div>
        <div class="field"><label>Masa Sita</label><input id="rep_duration" placeholder="Contoh: 3 hari / 7 hari" value="${e(payload.duration || "")}"/></div>
      </div>
      <div class="field"><label>Kronologi</label><textarea id="rep_chronology">${e(payload.chronology || payload.report || "")}</textarea></div>
      <div class="field"><label>Informasi Kendaraan</label><textarea id="rep_subject_info">${e(payload.subject_info || "")}</textarea></div>
      <div class="row">
        <div class="field"><label>Pasal</label><input id="rep_law" placeholder="Masukkan pasal" value="${e(payload.law || "")}"/></div>
        <div class="field"><label>Denda</label><input id="rep_fine" placeholder="Contoh: 50000" value="${e(payload.fine || "")}"/></div>
      </div>
      <div class="field"><label>Nama Plate / Nomor Plate Jika Ada</label><input id="rep_plate" placeholder="Contoh: MD 12345" value="${e(payload.plate || "")}"/></div>
      <div class="field"><label>Bukti Foto Kendaraan Minimal 1 Foto</label><input id="rep_file" type="file" accept="image/*" multiple/></div>
      <div class="field"><label>Nama Rekan</label><select id="rep_colleagues" multiple size="7">${reportColleagueOptions(payload.colleagues || [])}</select></div>
    `}

    ${isPatrol ? `<div class="field"><label>Nama Rekan</label><select id="rep_colleagues" multiple size="7">${reportColleagueOptions(payload.colleagues || [])}</select></div>` : ""}
    <p class="mini">Tahan CTRL untuk pilih lebih dari satu rekan. Rekan mendapat activity point saat laporan di-ACC.</p>

    <button class="btn blue" onclick="${edit ? `saveReport(${edit.id})` : "submitReport()"}">${edit ? "SIMPAN EDIT LAPORAN" : "KIRIM LAPORAN"}</button>
    ${edit ? `<button class="btn red" onclick="closeModal()">BATAL</button>` : ""}
  </section>`;
}

function reportItem(r){
  const payload = r.payload || {};
  const colleagues = (payload.colleagues || []).map(id => S.members.find(m => m.id === Number(id))).filter(Boolean);
  const isPatrol = r.type === "PATROLI";
  const isArrest = r.type === "KRIMINAL";
  const isSeizure = r.type === "PENYITAAN_KENDARAAN";

  return `<div class="list-item">
    <h3>${e(reportTypeLabel(r.type))} - ${e(r.nama)}</h3>
    <div class="mini">${fmt(r.created_at)} • <span class="status ${e(r.status)}">${e(statusLabel(r.status))}</span> • ${reportPointValue(r.type)} activity point</div>
    <div class="mini">${e(r.badge_number || "NO BADGE")} • ${e(r.rank_detail || "-")} • ${e(r.divisi || "-")}</div>

    ${isPatrol ? `
      <p><b>Tanggal/Jam:</b> ${e(payload.report_date || "-")} ${e(payload.report_time || "")}</p>
      <p><b>Area Patroli:</b> ${e(payload.area || "-")}</p>
      <p><b>Laporan Singkat:</b> ${e(payload.chronology || "-")}</p>
    ` : isArrest ? `
      <pre class="report-archive-pre">${e(formatArrestReport(r))}</pre>
    ` : `
      <p><b>Tanggal:</b> ${e(payload.report_date || "-")}</p>
      <p><b>Kronologi:</b> ${e(payload.chronology || "-")}</p>
      <p><b>Kendaraan:</b> ${e(payload.subject_info || "-")}</p>
      <p><b>Pasal:</b> ${e(payload.law || "-")} • <b>Masa Sita:</b> ${e(payload.duration || "-")} • <b>Denda:</b> ${e(payload.fine || "-")}</p>
      ${isSeizure ? `<p><b>Plate:</b> ${e(payload.plate || "-")}</p>` : ""}
    `}

    ${colleagues.length ? `<p><b>Rekan:</b> ${colleagues.map(m => e(userDisplayName(m))).join(", ")}</p>` : ""}
    ${renderEvidenceLinks(r)}
    <div class="split-actions">
      ${canEditReport(r) ? `<button class="btn small yellow" onclick="editReport(${r.id})">EDIT</button>` : ""}
      ${canManageReports() && r.status === "PENDING" ? `<button class="btn small green" onclick="approveReport(${r.id})">ACC</button>` : ""}
      ${canManageReports() && r.status === "PENDING" ? `<button class="btn small red" onclick="rejectReport(${r.id})">REJECT</button>` : ""}
      ${canManageReports() && r.status === "APPROVED" ? `<button class="btn small yellow" onclick="archiveReport(${r.id})">ARSIPKAN</button>` : ""}
      ${canDeleteReport(r) ? `<button class="btn small red" onclick="softDeleteReport(${r.id})">HAPUS</button>` : ""}
    </div>
  </div>`;
}

function setReportCat(c){
  S.currentReport = c;
  render();
}

async function submitReport(){
  try{
    const p = S.profile;
    const type = document.querySelector("#rep_type")?.value || S.currentReport || "PATROLI";
    const files = document.querySelector("#rep_file")?.files || [];

    if(!files || files.length < 1){
      return alert("Semua laporan operasi wajib upload minimal 1 foto bukti.");
    }

    const evidenceUrls = await uploadMany(files, "reports");
    const isPatrol = type === "PATROLI";
    const isArrest = type === "KRIMINAL";

    let payload = {
      report_date: document.querySelector("#rep_date")?.value || "",
      colleagues: getSelectedColleagues()
    };

    if(isPatrol){
      payload = {
        ...payload,
        report_time: document.querySelector("#rep_time")?.value || "",
        area: document.querySelector("#rep_area")?.value || "",
        chronology: document.querySelector("#rep_chronology")?.value || ""
      };

      if(!payload.report_date) return alert("Tanggal patroli wajib diisi.");
      if(!payload.report_time) return alert("Jam patroli wajib diisi.");
      if(!payload.area.trim()) return alert("Area patroli wajib diisi.");
      if(!payload.chronology.trim()) return alert("Laporan singkat patroli wajib diisi.");
    } else if(isArrest){
      payload = {
        ...payload,
        report_time: document.querySelector("#rep_time")?.value || "",
        arrest_datetime: `${document.querySelector("#rep_date")?.value || ""} ${document.querySelector("#rep_time")?.value || ""}`.trim(),
        detention_location: document.querySelector("#rep_detention_location")?.value || "",
        summary: document.querySelector("#rep_summary")?.value || "",
        suspect_name: document.querySelector("#rep_suspect_name")?.value || "",
        subject_info: document.querySelector("#rep_suspect_name")?.value || "",
        law: document.querySelector("#rep_law")?.value || "",
        fine: document.querySelector("#rep_fine")?.value || "",
        sentence: document.querySelector("#rep_sentence")?.value || "",
        duration: document.querySelector("#rep_sentence")?.value || "",
        evidence_type: document.querySelector("#rep_evidence_type")?.value || "",
        evidence_desc: document.querySelector("#rep_evidence_desc")?.value || ""
      };

      if(!payload.report_date) return alert("Tanggal penahanan wajib diisi.");
      if(!payload.report_time) return alert("Waktu penahanan wajib diisi.");
      if(!payload.detention_location.trim()) return alert("Lokasi penahanan wajib diisi.");
      if(!payload.summary.trim()) return alert("Deskripsi singkat wajib diisi.");
      if(!payload.suspect_name.trim()) return alert("Nama tersangka wajib diisi.");
      if(!payload.law.trim()) return alert("Pasal wajib diisi.");
      if(!payload.evidence_type.trim()) return alert("Jenis barang bukti wajib diisi.");
    } else {
      payload = {
        ...payload,
        chronology: document.querySelector("#rep_chronology")?.value || "",
        subject_info: document.querySelector("#rep_subject_info")?.value || "",
        law: document.querySelector("#rep_law")?.value || "",
        duration: document.querySelector("#rep_duration")?.value || "",
        fine: document.querySelector("#rep_fine")?.value || "",
        plate: document.querySelector("#rep_plate")?.value || ""
      };

      if(!payload.report_date) return alert("Tanggal penyitaan wajib diisi.");
      if(!payload.chronology.trim()) return alert("Kronologi wajib diisi.");
      if(!payload.subject_info.trim()) return alert("Informasi kendaraan wajib diisi.");
      if(!payload.law.trim()) return alert("Pasal wajib diisi.");
    }

    const { error } = await supabase.from("reports").insert({
      user_id: p.id,
      type,
      nama: userDisplayName(p),
      divisi: p.divisi,
      rank_detail: p.rank_detail,
      jabatan: p.jabatan,
      badge_number: p.badge_number || "",
      payload,
      evidence_url: evidenceUrls[0] || null,
      evidence_urls: evidenceUrls,
      status: "PENDING"
    });

    if(error) throw error;

    await audit("CREATE_REPORT", "reports", "", { type, payload });
    await loadAll();
    toast("Laporan masuk dan menunggu ACC.", "success");
    go("log");
    S.tab = "reports";
    render();
  }catch(err){
    alert(err.message);
  }
}


function editReport(id){
  const r = S.reports.find(x => x.id === id);
  if(!r) return alert("Laporan tidak ditemukan.");
  if(!canEditReport(r)) return alert("Laporan hanya bisa diedit oleh pengisi saat PENDING/REJECTED, atau oleh PATI/SUPER ADMIN.");
  const modal = document.createElement("div");
  modal.id = "modal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto";
  modal.innerHTML = `<section style="max-width:820px;width:100%">${reportForm(r)}</section>`;
  document.body.appendChild(modal);
}

async function saveReport(id){
  const r = S.reports.find(x => x.id === id);
  if(!r) return alert("Laporan tidak ditemukan.");
  if(!canEditReport(r)) return alert("Akses edit ditolak.");

  const files = document.querySelector("#rep_file")?.files || [];
  const evidenceUrls = await uploadMany(files, "reports");
  const oldUrls = getEvidenceList(r);
  const type = r.type;
  const isPatrol = type === "PATROLI";
  const isArrest = type === "KRIMINAL";

  let payload = {
    report_date: document.querySelector("#rep_date")?.value || "",
    colleagues: getSelectedColleagues()
  };

  if(isPatrol){
    payload = {
      ...payload,
      report_time: document.querySelector("#rep_time")?.value || "",
      area: document.querySelector("#rep_area")?.value || "",
      chronology: document.querySelector("#rep_chronology")?.value || ""
    };
  }else if(isArrest){
    payload = {
      ...payload,
      report_time: document.querySelector("#rep_time")?.value || "",
      arrest_datetime: `${document.querySelector("#rep_date")?.value || ""} ${document.querySelector("#rep_time")?.value || ""}`.trim(),
      detention_location: document.querySelector("#rep_detention_location")?.value || "",
      summary: document.querySelector("#rep_summary")?.value || "",
      suspect_name: document.querySelector("#rep_suspect_name")?.value || "",
      subject_info: document.querySelector("#rep_suspect_name")?.value || "",
      law: document.querySelector("#rep_law")?.value || "",
      fine: document.querySelector("#rep_fine")?.value || "",
      sentence: document.querySelector("#rep_sentence")?.value || "",
      duration: document.querySelector("#rep_sentence")?.value || "",
      evidence_type: document.querySelector("#rep_evidence_type")?.value || "",
      evidence_desc: document.querySelector("#rep_evidence_desc")?.value || ""
    };
  }else{
    payload = {
      ...payload,
      chronology: document.querySelector("#rep_chronology")?.value || "",
      subject_info: document.querySelector("#rep_subject_info")?.value || "",
      law: document.querySelector("#rep_law")?.value || "",
      duration: document.querySelector("#rep_duration")?.value || "",
      fine: document.querySelector("#rep_fine")?.value || "",
      plate: document.querySelector("#rep_plate")?.value || ""
    };
  }

  if(!payload.report_date) return alert("Tanggal laporan wajib diisi.");
  if(isPatrol && !payload.area.trim()) return alert("Area patroli wajib diisi.");
  if(isPatrol && !payload.chronology.trim()) return alert("Laporan singkat patroli wajib diisi.");
  if(isArrest && !payload.detention_location.trim()) return alert("Lokasi penahanan wajib diisi.");
  if(isArrest && !payload.summary.trim()) return alert("Deskripsi singkat wajib diisi.");
  if(isArrest && !payload.suspect_name.trim()) return alert("Nama tersangka wajib diisi.");
  if(isArrest && !payload.law.trim()) return alert("Pasal wajib diisi.");
  if(isArrest && !payload.evidence_type.trim()) return alert("Jenis barang bukti wajib diisi.");
  if(!isPatrol && !isArrest && !payload.subject_info.trim()) return alert("Informasi kendaraan wajib diisi.");
  if(!isPatrol && !isArrest && !payload.law.trim()) return alert("Pasal wajib diisi.");

  const finalEvidence = evidenceUrls.length ? evidenceUrls : oldUrls;
  if(!finalEvidence.length) return alert("Semua laporan operasi wajib punya minimal 1 foto bukti.");

  const update = {
    payload,
    evidence_urls: finalEvidence,
    evidence_url: finalEvidence[0] || null
  };

  const { error } = await supabase.from("reports").update(update).eq("id", id);
  if(error) return alert(error.message);

  await audit("EDIT_REPORT", "reports", id, { before:r, after:update });
  closeModal();
  await loadAll();
  toast("Laporan berhasil diedit.", "success");
  render();
}

async function approveReport(id){
  if(!canManageReports()) return alert("Hanya PATI / SUPER ADMIN yang bisa ACC laporan.");
  const r = S.reports.find(x => x.id === id);
  if(!r) return alert("Laporan tidak ditemukan.");
  const note = prompt("Catatan ACC laporan") || "Disetujui";
  const { error } = await supabase.from("reports").update({
    status:"APPROVED",
    approved_by:S.profile.display_name,
    approval_note:note
  }).eq("id", id);

  if(error) return alert(error.message);

  await grantReportActivityPoints(r);
  await audit("APPROVE_REPORT", "reports", id, { note, report:r });
  await botEvent("REPORT_APPROVED", {
    id,
    type:r.type,
    nama:r.nama,
    divisi:r.divisi,
    approved_by:S.profile.display_name,
    note
  });

  await loadAll();
  toast("Laporan di-ACC. Activity point diberikan ke petugas dan rekan.", "success");
  render();
}

async function rejectReport(id){
  if(!canManageReports()) return alert("Hanya PATI / SUPER ADMIN yang bisa reject laporan.");
  const r = S.reports.find(x => x.id === id);
  const reason = prompt("Alasan reject laporan") || "Ditolak";
  const { error } = await supabase.from("reports").update({
    status:"REJECTED",
    approved_by:S.profile.display_name,
    reject_reason:reason
  }).eq("id", id);

  if(error) return alert(error.message);

  await audit("REJECT_REPORT", "reports", id, { reason, report:r });
  await botEvent("REPORT_REJECTED", {
    id,
    type:r?.type,
    nama:r?.nama,
    divisi:r?.divisi,
    rejected_by:S.profile.display_name,
    reason
  });

  await loadAll();
  toast("Laporan ditolak. Pengisi masih bisa edit ulang.", "info");
  render();
}

async function deleteReport(id){
  return softDeleteReport(id);
}


function exportReportPDF(id){
  const r = S.reports.find(x => x.id === id);
  if(!r) return alert("Laporan tidak ditemukan.");

  const urls = getEvidenceList(r);
  const payload = r.payload || {};
  const isPatrol = r.type === "PATROLI";
  const isCriminal = r.type === "KRIMINAL";

  const detailRows = isPatrol ? `
    <tr><th>Tanggal/Jam Patroli</th><td>${e(payload.report_date || "-")} ${e(payload.report_time || "")}</td></tr>
    <tr><th>Area Patroli</th><td>${e(payload.area || "-")}</td></tr>
    <tr><th>Laporan Singkat</th><td>${e(payload.chronology || "-")}</td></tr>
  ` : `
    <tr><th>Tanggal</th><td>${e(payload.report_date || "-")}</td></tr>
    <tr><th>Kronologi</th><td>${e(payload.chronology || "-")}</td></tr>
    <tr><th>${isCriminal ? "Informasi Tersangka" : "Informasi Kendaraan"}</th><td>${e(payload.subject_info || "-")}</td></tr>
    <tr><th>Pasal</th><td>${e(payload.law || "-")}</td></tr>
    <tr><th>${isCriminal ? "Masa Hukuman" : "Masa Sita"}</th><td>${e(payload.duration || "-")}</td></tr>
    <tr><th>Denda</th><td>${e(payload.fine || "-")}</td></tr>
    ${r.type === "PENYITAAN_KENDARAAN" ? `<tr><th>Plate</th><td>${e(payload.plate || "-")}</td></tr>` : ""}
  `;

  const html = `<!doctype html>
<html>
<head>
  <title>${e(reportTypeLabel(r.type))} #${r.id}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:30px;color:#111}
    h1{border-bottom:3px solid #000;padding-bottom:10px}
    table{width:100%;border-collapse:collapse;margin-top:18px}
    td,th{border:1px solid #000;padding:8px;text-align:left;vertical-align:top}
    img{max-width:100%;margin:10px 0;border:2px solid #000}
    .muted{color:#555}
  </style>
</head>
<body>
  <h1>MAYDAY POLICE - ${e(reportTypeLabel(r.type))}</h1>
  <p class="muted">Generated: ${fmt(new Date())}</p>
  <table>
    <tr><th>Nama Petugas</th><td>${e(r.nama)}</td></tr>
    <tr><th>Badge</th><td>${e(r.badge_number || "NO BADGE")}</td></tr>
    <tr><th>Rank</th><td>${e(r.rank_detail || "-")}</td></tr>
    <tr><th>Divisi</th><td>${e(r.divisi)}</td></tr>
    <tr><th>Status</th><td>${e(statusLabel(r.status))}</td></tr>
    ${detailRows}
    <tr><th>Waktu Input</th><td>${fmt(r.created_at)}</td></tr>
  </table>
  <h2>Bukti Visual</h2>
  ${urls.length ? urls.map(u=>`<img src="${e(u)}"/>`).join("") : "<p>Tidak ada bukti.</p>"}
  <script>window.print()</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
}

async function forceRefreshPersonnel(){
  lastPersonnelRefreshAt = Date.now();
  await withLoading("Refresh data personel...", async () => {
    await loadAll();
    toast("Data personel diperbarui manual.", "success");
  });
  render();
}

function membersPage(){
  const rows = filteredMembers();

  return `<main class="app">
    ${top("DATA PERSONEL")}
    <main class="page">
      <section class="card">
        <div class="section-head"><div><h2>SEARCH ANGGOTA</h2><p class="mini">Auto update personel maksimal 10 menit sekali.</p></div><button class="btn small" onclick="forceRefreshPersonnel()">REFRESH</button></div>
        <input value="${e(S.search)}" oninput="setSearch(this.value)" placeholder="Cari nama / badge / divisi / jabatan..." />
      </section>

      <section class="card">
        <h2>ANGGOTA ONLINE</h2>
        ${S.members.filter(isOnline).map(m=>memberMini(m)).join("") || `<div class="empty">Belum ada anggota online.</div>`}
      </section>

      <section class="card">
        <h2>DATA ANGGOTA</h2>
        ${rows.map(m => memberMini(m, true)).join("") || `<div class="empty">Tidak ditemukan.</div>`}
      </section>
    </main>${nav()}
  </main>`;
}

function memberMini(m, showActions=false){
  const monthTotal = S.attendance.filter(a => a.user_id === m.id && (a.created_at || "").slice(0,7) === monthKey()).length;
  const spTotal = S.propam.filter(x => x.target_user_id === m.id).length;
  return `<div class="list-item">
    <h3>
      <span class="online-dot ${isOnline(m) ? "on" : "off"}"></span>
      ${e(m.display_name)}
      <span class="status ${e(statusLabel(m.status))}">${e(statusLabel(m.status))}</span>
    </h3>
    <div class="mini">${e(m.badge_number || "NO BADGE")} • ${e(m.jabatan || "-")} • ${e(m.divisi || "-")}</div>
    <div class="mini">Last login: ${fmt(m.last_login)} • Last seen: ${fmt(m.last_seen)}</div>
    <div class="mini">Absensi bulan ini: ${monthTotal} • Riwayat SP: ${spTotal} • Activity: ${Number(m.activity_points_month || 0)}/${activityCapFor(m)}</div>
    ${showActions ? `<button class="btn small" onclick="openMemberDetail(${m.id})">DETAIL RIWAYAT</button>` : ""}
    ${admin() && showActions ? `<button class="btn small yellow" onclick="openMemberEditor(${m.id})">EDIT USERNAME / BADGE / JABATAN</button>` : ""}
  </div>`;
}

function openMemberDetail(id){
  const m = S.members.find(x => x.id === id);
  if(!m) return;

  const roles = S.roleHistory.filter(x => x.user_id === id);
  const divs = S.divisionHistory.filter(x => x.user_id === id);
  const sps = S.propam.filter(x => x.target_user_id === id);
  const abs = S.attendance.filter(x => x.user_id === id).slice(0,20);

  const modal = document.createElement("div");
  modal.id = "modal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto";

  modal.innerHTML = `<section class="card" style="max-width:720px;width:100%">
    <h2>DETAIL ANGGOTA</h2>
    <div class="profile-head">
      <img src="${e(m.avatar_url || "/logo.png")}"/>
      <div>
        <h2>${e(m.display_name)}</h2>
        <p class="mini">${e(m.badge_number || "NO BADGE")} • ${e(m.jabatan)} • ${e(m.divisi)}</p>
      </div>
    </div>

    <h3>Riwayat Jabatan</h3>
    ${roles.map(x=>`<div class="mini">• ${fmt(x.created_at)}: ${e(x.old_jabatan || "-")} → ${e(x.new_jabatan || "-")} oleh ${e(x.changed_by || "-")}</div>`).join("") || `<div class="mini">Belum ada.</div>`}

    <h3>Riwayat Mutasi Divisi</h3>
    ${divs.map(x=>`<div class="mini">• ${fmt(x.created_at)}: ${e(x.old_divisi || "-")} → ${e(x.new_divisi || "-")} oleh ${e(x.changed_by || "-")}</div>`).join("") || `<div class="mini">Belum ada.</div>`}

    <h3>Riwayat SP</h3>
    ${sps.map(x=>`<div class="mini">• ${fmt(x.created_at)}: ${x.sp_level==99?"PTDH":"SP"+x.sp_level} - ${e(x.reason)} oleh ${e(x.issued_by)}</div>`).join("") || `<div class="mini">Belum ada.</div>`}

    <h3>Absensi Terakhir</h3>
    ${abs.map(x=>`<div class="mini">• ${fmt(x.created_at)}: ${e(x.type)} / ${e(statusLabel(x.status))} - ${e(x.note || "-")}</div>`).join("") || `<div class="mini">Belum ada.</div>`}

    <button class="btn red" onclick="closeModal()">TUTUP</button>
  </section>`;

  document.body.appendChild(modal);
}

function propamPage(){
  if(!propam()) return blocked("BIDPROPAM ONLY");

  return `<main class="app">
    ${top("BIDPROPAM CENTER")}
    <main class="page">
      <section class="card dark">
        <h2>SP / PTDH</h2>
        <p class="notice">SP1 → SP2 → SP3 → PTDH. SP bisa dihapus oleh BIDPROPAM/PATI/SUPER ADMIN.</p>
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
        <div class="field"><label>Bukti Bisa Lebih Dari 1</label><input id="sp_file" type="file" accept="image/*" multiple/></div>
        <button class="btn red" onclick="submitSP()">KIRIM PROPAM LOG</button>
        <button class="btn" onclick="go('dashboard')">KELUAR KE MENU</button>
      </section>

      <section class="card">
        <h2>RIWAYAT SP / PTDH</h2>
        ${S.propam.length ? `<table class="table">
          <thead><tr><th>Target</th><th>Tindakan</th><th>Alasan</th><th>Oleh</th><th>Aksi</th></tr></thead>
          <tbody>${S.propam.map(x => `<tr>
            <td>${e(x.target_name)}</td>
            <td>${x.sp_level == 99 ? "PTDH" : "SP" + x.sp_level}</td>
            <td>${e(x.reason)}${renderEvidenceLinks(x)}</td>
            <td>${e(x.issued_by)}<br><span class="mini">${fmt(x.created_at)}</span></td>
            <td><button class="btn small red" onclick="deleteSP(${x.id})">HAPUS</button></td>
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
    const evidenceUrls = await uploadMany(document.querySelector("#sp_file").files, "propam");
    const reason = document.querySelector("#sp_reason").value;

    const { error } = await supabase.from("disciplinary_records").insert({
      target_user_id: id,
      target_name: target?.display_name,
      issued_by: S.profile.display_name,
      sp_level: level,
      reason,
      evidence_url: evidenceUrls[0] || null,
      evidence_urls: evidenceUrls,
      status: "ACTIVE"
    });

    if(error) throw error;

    if(level === 99){
      await supabase.from("profiles").update({ status:"PTDH" }).eq("id", id);
    }

    await audit(level === 99 ? "PTDH" : "CREATE_SP", "disciplinary_records", id, { level, reason });
    await loadAll();
    toast("Propam log tersimpan.", "success");
    render();
  }catch(err){
    alert(err.message);
  }
}

async function deleteSP(id){
  if(!confirm("Yakin hapus SP/PTDH ini? Data akan tercatat di audit log.")) return;
  const row = S.propam.find(x => x.id === id);
  const { error } = await supabase.from("disciplinary_records").delete().eq("id", id);
  if(error) return alert(error.message);
  await audit("DELETE_SP", "disciplinary_records", id, row || {});
  await botEvent("SP_DELETED", { id, row, deleted_by:S.profile.display_name });
  await loadAll();
  render();
}

function payrollPage(){
  const p = S.profile;
  const points = Number(p.duty_points || 0);
  const minutes = Number(p.duty_minutes || 0);
  const payroll = Number(p.pending_payroll || 0);
  const hoursText = `${Math.floor(minutes / 60)}j ${minutes % 60}m`;
  return `<main class="app">${top("FINANCIAL GATEWAY")}<main class="page">
    <section class="card blue"><span class="badge">PAYROLL SYSTEM</span><h2 class="big-title">GAJI</h2><p>${e(userDisplayName(p))} • ${e(p.badge_number || "NO BADGE")}</p>
      <div class="payroll-summary"><div><small>DUTY TIME</small><b>${hoursText}</b></div><div><small>DUTY POINT</small><b>${points}</b></div><div><small>ESTIMASI GAJI</small><b>${money(payroll)}</b></div></div>
    </section>
    <section class="card"><h2>AJUKAN PENGAMBILAN GAJI</h2><p class="notice">Point hanya reset setelah payroll di-ACC / dibayar.</p>
      <div class="row"><div class="field"><label>Periode</label><input id="pay_period" placeholder="Juni 2026" value="${new Date().toLocaleDateString("id-ID", { month:"long", year:"numeric" })}"/></div><div class="field"><label>Nominal Otomatis</label><input id="pay_amount" type="number" value="${payroll}" readonly/></div></div>
      <div class="row"><div class="field"><label>Point</label><input id="pay_points" type="number" value="${points}" readonly/></div><div class="field"><label>Total Menit</label><input id="pay_minutes" type="number" value="${minutes}" readonly/></div></div>
      <div class="field"><label>Rekening / E-Wallet / Keterangan</label><textarea id="pay_note"></textarea></div>
      <button class="btn green" onclick="submitPayroll()">AJUKAN GAJI</button>
    </section>
    ${high() ? `<section class="card yellow"><h2>PENDING PAYROLL</h2>${S.payrolls.filter(x => x.status === "PENDING").map(p => `<div class="list-item"><h3>${e(p.nama)} - ${money(p.requested_amount || p.amount || 0)}</h3><div class="mini">${e(p.period || "-")} • ${Number(p.requested_points || 0)} point • ${Number(p.requested_minutes || 0)} menit</div><div class="split-actions"><button class="btn small green" onclick="approvePayroll(${p.id})">BAYAR</button><button class="btn small red" onclick="rejectPayroll(${p.id})">TOLAK</button></div></div>`).join("") || "<p>Tidak ada pending.</p>"}</section>` : ""}
  </main>${nav()}</main>`;
}

async function submitPayroll(){
  const points = Number(S.profile.duty_points || 0);
  const minutes = Number(S.profile.duty_minutes || 0);
  const amount = Number(S.profile.pending_payroll || 0);
  if(points <= 0 || amount <= 0) return alert("Belum ada duty point yang bisa diajukan.");
  const { error } = await supabase.from("payrolls").insert({
    user_id: S.profile.id, nama: userDisplayName(S.profile), period: document.querySelector("#pay_period").value,
    amount, requested_points: points, requested_minutes: minutes, requested_amount: amount, approved_amount: 0,
    note: document.querySelector("#pay_note").value, status: "PENDING"
  });
  if(error) return alert(error.message);
  await audit("CREATE_PAYROLL", "payrolls", "", { points, minutes, amount });
  await loadAll(); toast("Pengajuan payroll terkirim.", "success"); render();
}

async function approvePayroll(id){
  const row = S.payrolls.find(x => x.id === id);
  if(!row) return alert("Data payroll tidak ditemukan.");
  const amount = Number(row.requested_amount || row.amount || 0);
  const pay = await supabase.from("payrolls").update({ status:"PAID", approved_by:S.profile.display_name, approved_amount: amount }).eq("id", id);
  if(pay.error) return alert(pay.error.message);
  const member = S.members.find(x => x.id === row.user_id);
  const prof = await supabase.from("profiles").update({
    duty_minutes: 0, duty_points: 0, pending_payroll: 0,
    total_payroll_received: Number(member?.total_payroll_received || 0) + amount
  }).eq("id", row.user_id);
  if(prof.error) return alert(prof.error.message);
  await audit("APPROVE_PAYROLL", "payrolls", id, { row, amount });
  await botEvent("PAYROLL_PAID", { id, nama: row.nama, requested_points: row.requested_points, requested_amount: amount, approved_by: S.profile.display_name });
  await loadAll(); toast("Payroll dibayar dan point duty anggota direset.", "success"); render();
}

async function rejectPayroll(id){
  const row = S.payrolls.find(x => x.id === id);
  await supabase.from("payrolls").update({ status:"REJECTED", approved_by:S.profile.display_name }).eq("id", id);
  await audit("REJECT_PAYROLL", "payrolls", id, { row });
  await botEvent("PAYROLL_REJECTED", { id, nama: row?.nama, requested_points: row?.requested_points, requested_amount: row?.requested_amount || row?.amount, rejected_by: S.profile.display_name });
  await loadAll(); toast("Payroll ditolak. Point duty tidak direset.", "info"); render();
}

function logPage(){
  const tabs = ["today","attendance","reports","propam", ...(high() ? ["audit"] : []), "leaderboard"];
  if(S.tab === "audit" && !high()) S.tab = "today";

  return `<main class="app">
    ${top("ACTIVITY LOG")}
    <main class="page">
      <section class="tabs">${tabs.map(t => `<button class="${S.tab===t ? "active" : ""}" onclick="setTab('${t}')">${t.toUpperCase()}</button>`).join("")}</section>

      ${S.tab === "today" ? `<section class="grid">
        <div class="card green"><h3>ABSENSI</h3><h2>${S.attendance.length}</h2></div>
        <div class="card yellow"><h3>LAPORAN</h3><h2>${S.reports.length}</h2></div>
        <div class="card red"><h3>SP</h3><h2>${S.propam.length}</h2></div>
        ${high() ? `<div class="card blue"><h3>AUDIT</h3><h2>${S.audit.length}</h2></div>` : ""}
      </section>` : ""}

      ${S.tab === "attendance" ? logTable("Absensi", S.attendance, "attendance") : ""}
      ${S.tab === "reports" ? logTable("Laporan", S.reports, "reports") : ""}
      ${S.tab === "propam" ? logTable("Propam", S.propam, "propam") : ""}
      ${S.tab === "audit" ? auditLog() : ""}
      ${S.tab === "leaderboard" ? leaderboardCard() : ""}
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
          ${type === "reports" ? `<th>Export</th>` : ""}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>
            ${e(r.nama || r.target_name || r.type)}<br>
            <span class="mini">${e(r.divisi || r.badge_number || "")}</span>
          </td>
          <td><span class="status ${e(statusLabel(r.status))}">${e(statusLabel(r.status))}</span></td>
          <td>
            ${e(r.note || r.reason || r.payload?.report || "-")}<br>
            <span class="mini">${e(r.location || r.payload?.location || "")}</span>
            ${r.approval_note ? `<br><span class="mini">ACC: ${e(r.approval_note)}</span>` : ""}
            ${r.reject_reason ? `<br><span class="mini">Alasan Tolak: ${e(r.reject_reason)}</span>` : ""}
            ${renderEvidenceLinks(r)}
          </td>
          <td>${fmt(r.created_at)}</td>
          ${type === "attendance" && canApproveAttendance() ? `<td>
            ${r.status === "PENDING" ? `
              <button class="btn small green" onclick="approveAttendance(${r.id})">ACC</button>
              <button class="btn small red" onclick="rejectAttendance(${r.id})">TOLAK</button>
            ` : `<span class="mini">${e(r.approved_by || "-")}</span>`}
          </td>` : ""}
          ${type === "reports" ? `<td><button class="btn small" onclick="exportReportPDF(${r.id})">PDF</button></td>` : ""}
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty">Kosong.</div>`}
  </section>`;
}

function auditLog(){
  if(!high()){
    return `<section class="card red">
      <h2>AKSES DITOLAK</h2>
      <p>Audit Log hanya bisa dilihat oleh PATI dan SUPER ADMIN.</p>
    </section>`;
  }

  return `<section class="card">
    <h2>AUDIT LENGKAP</h2>
    ${S.audit.map(a => `<div class="list-item">
      <h3>${e(a.action)}</h3>
      <div class="mini">${e(a.actor_name)} • ${fmt(a.created_at)}</div>
      <pre class="audit-pre">${e(JSON.stringify(a.metadata || {}, null, 2))}</pre>
    </div>`).join("") || `<div class="empty">Belum ada audit.</div>`}
  </section>`;
}


async function submitPromotionRequest(){
  const p = S.profile;
  const pr = rankProgress(p);
  if(!pr.eligible) return alert("Activity point belum memenuhi syarat kenaikan pangkat.");
  const pending = S.promotionRequests?.find(x => x.user_id === p.id && x.status === "PENDING");
  if(pending) return alert("Kamu masih punya pengajuan kenaikan pangkat yang pending.");

  const note = prompt("Catatan pengajuan kenaikan pangkat") || "Mengajukan kenaikan pangkat berdasarkan activity point.";
  const item = {
    user_id: p.id,
    nama: userDisplayName(p),
    badge_number: p.badge_number || "",
    divisi: p.divisi || "",
    current_rank: pr.rank,
    target_rank: pr.target,
    activity_points: pr.point,
    required_points: pr.cap,
    note,
    status: "PENDING"
  };

  const { error } = await supabase.from("promotion_requests").insert(item);
  if(error) return alert(error.message);

  await audit("CREATE_PROMOTION_REQUEST", "promotion_requests", "", item);
  await botEvent("PROMOTION_REQUESTED", item);
  await loadAll();
  toast("Pengajuan kenaikan pangkat dikirim.", "success");
  render();
}

async function approvePromotionRequest(id){
  if(!can(["PATI","SUPER ADMIN"])) return alert("Hanya PATI / SUPER ADMIN yang bisa ACC kenaikan pangkat.");
  const req = S.promotionRequests.find(x => x.id === id);
  if(!req) return alert("Pengajuan tidak ditemukan.");

  const note = prompt("Catatan ACC kenaikan pangkat") || "Disetujui";
  const member = S.members.find(x => x.id === req.user_id);
  const oldRank = member?.rank_detail || req.current_rank;
  const newRank = req.target_rank;

  const upProfile = await supabase.from("profiles").update({
    rank_detail: newRank,
    activity_points_month: 0,
    activity_points_period: monthKey()
  }).eq("id", req.user_id);
  if(upProfile.error) return alert(upProfile.error.message);

  await supabase.from("promotion_requests").update({
    status:"APPROVED",
    approved_by:S.profile.display_name,
    approval_note:note
  }).eq("id", id);

  await supabase.from("role_history").insert({
    user_id: req.user_id,
    nama: req.nama,
    old_role: oldRank,
    new_role: newRank,
    changed_by: S.profile.display_name,
    note: `Kenaikan pangkat via activity point. ${note}`
  });

  await audit("APPROVE_PROMOTION_REQUEST", "promotion_requests", id, { req, oldRank, newRank, note });
  await botEvent("PROMOTION_APPROVED", { id, nama:req.nama, old_rank:oldRank, new_rank:newRank, approved_by:S.profile.display_name, note });
  await loadAll();
  toast("Kenaikan pangkat di-ACC. Activity point direset ke 0.", "success");
  render();
}

async function rejectPromotionRequest(id){
  if(!can(["PATI","SUPER ADMIN"])) return alert("Hanya PATI / SUPER ADMIN yang bisa reject kenaikan pangkat.");
  const req = S.promotionRequests.find(x => x.id === id);
  const reason = prompt("Alasan reject kenaikan pangkat") || "Ditolak";
  const { error } = await supabase.from("promotion_requests").update({
    status:"REJECTED",
    approved_by:S.profile.display_name,
    reject_reason:reason
  }).eq("id", id);
  if(error) return alert(error.message);

  await audit("REJECT_PROMOTION_REQUEST", "promotion_requests", id, { req, reason });
  await botEvent("PROMOTION_REJECTED", { id, nama:req?.nama, rejected_by:S.profile.display_name, reason });
  await loadAll();
  toast("Pengajuan kenaikan pangkat ditolak. Activity point tetap tersimpan.", "info");
  render();
}

function promotionAdminPanel(){
  if(!can(["PATI","SUPER ADMIN"])) return "";
  const rows = S.promotionRequests.filter(x => x.status === "PENDING");
  return `<section class="card">
    <div class="section-head">
      <div><h2>PENGAJUAN KENAIKAN PANGKAT</h2><p class="mini">ACC akan menaikkan rank dan reset activity point bulanan ke 0.</p></div>
      <span class="status PENDING">${rows.length} PENDING</span>
    </div>
    ${rows.map(r => `<div class="list-item">
      <h3>${e(r.nama)} - ${e(r.current_rank)} → ${e(r.target_rank)}</h3>
      <div class="mini">${e(r.badge_number || "NO BADGE")} • ${e(r.divisi || "-")} • ${Number(r.activity_points || 0)}/${Number(r.required_points || 0)} point</div>
      <p>${e(r.note || "-")}</p>
      <div class="split-actions">
        <button class="btn small green" onclick="approvePromotionRequest(${r.id})">ACC</button>
        <button class="btn small red" onclick="rejectPromotionRequest(${r.id})">REJECT</button>
      </div>
    </div>`).join("") || `<div class="empty">Tidak ada pengajuan pending.</div>`}
  </section>`;
}


async function archiveReport(id){
  if(!high()) return alert("Hanya PATI / SUPER ADMIN yang bisa arsipkan laporan.");
  const r = S.reports.find(x => x.id === id);
  if(!r) return alert("Laporan tidak ditemukan.");
  const period = reportMonthKey(r);
  const { error } = await supabase.from("reports").update({
    status:"ARCHIVED",
    archived_by:S.profile.display_name,
    archived_at:new Date().toISOString(),
    archive_period:period
  }).eq("id", id);
  if(error) return alert(error.message);
  await audit("ARCHIVE_REPORT", "reports", id, { period, report:r });
  await botEvent("REPORT_ARCHIVED", { id, type:r.type, nama:r.nama, period, archived_by:S.profile.display_name });
  await loadAll();
  toast(`Laporan masuk arsip ${monthNameID(period)}.`, "success");
  render();
}

async function archiveMonthlyReports(){
  if(!high()) return alert("Hanya PATI / SUPER ADMIN yang bisa arsipkan laporan bulanan.");
  const period = S.archiveMonth || monthKey();
  if(!confirm(`Arsipkan semua laporan APPROVED bulan ${monthNameID(period)}?`)) return;

  const rows = S.reports.filter(r => reportVisibleInMain(r) && r.status === "APPROVED" && reportMonthKey(r) === period);
  if(!rows.length) return alert(`Tidak ada laporan APPROVED pada ${monthNameID(period)}.`);

  const ids = rows.map(r => r.id);
  const { error } = await supabase.from("reports").update({
    status:"ARCHIVED",
    archived_by:S.profile.display_name,
    archived_at:new Date().toISOString(),
    archive_period:period
  }).in("id", ids);

  if(error) return alert(error.message);

  await audit("ARCHIVE_MONTHLY_REPORTS", "reports", period, { ids, total:ids.length });
  await botEvent("REPORT_MONTH_ARCHIVED", { period, total:ids.length, archived_by:S.profile.display_name });
  await loadAll();
  toast(`${ids.length} laporan ${monthNameID(period)} berhasil diarsipkan.`, "success");
  render();
}

async function softDeleteReport(id){
  if(!high()) return alert("Hanya PATI / SUPER ADMIN yang bisa hapus laporan.");
  const r = S.reports.find(x => x.id === id);
  if(!r) return alert("Laporan tidak ditemukan.");
  if(!confirm("Yakin hapus laporan ini dari tampilan arsip? Data tetap tercatat di audit.")) return;

  const { error } = await supabase.from("reports").update({
    status:"DELETED",
    deleted_by:S.profile.display_name,
    deleted_at:new Date().toISOString()
  }).eq("id", id);

  if(error) return alert(error.message);

  await audit("SOFT_DELETE_REPORT", "reports", id, r);
  await botEvent("REPORT_DELETED", { id, report:r, deleted_by:S.profile.display_name });
  await loadAll();
  toast("Laporan dihapus dari arsip.", "success");
  render();
}

async function deleteArchivedMonth(){
  if(!high()) return alert("Hanya PATI / SUPER ADMIN yang bisa hapus arsip bulanan.");
  const period = S.archiveMonth || monthKey();
  if(!confirm(`Hapus semua arsip laporan bulan ${monthNameID(period)}?`)) return;

  const rows = S.reports.filter(r => reportVisibleInArchive(r) && reportMonthKey(r) === period && String(r.status).toUpperCase() === "ARCHIVED");
  if(!rows.length) return alert(`Tidak ada arsip aktif pada ${monthNameID(period)}.`);

  const ids = rows.map(r => r.id);
  const { error } = await supabase.from("reports").update({
    status:"DELETED",
    deleted_by:S.profile.display_name,
    deleted_at:new Date().toISOString()
  }).in("id", ids);

  if(error) return alert(error.message);

  await audit("DELETE_MONTHLY_ARCHIVE", "reports", period, { ids, total:ids.length });
  await botEvent("REPORT_MONTH_DELETED", { period, total:ids.length, deleted_by:S.profile.display_name });
  await loadAll();
  toast(`${ids.length} arsip ${monthNameID(period)} dihapus.`, "success");
  render();
}

async function restoreReport(id){
  if(!high()) return alert("Hanya PATI / SUPER ADMIN yang bisa restore laporan.");
  const r = S.reports.find(x => x.id === id);
  const { error } = await supabase.from("reports").update({
    status:"ARCHIVED",
    deleted_by:null,
    deleted_at:null
  }).eq("id", id);
  if(error) return alert(error.message);
  await audit("RESTORE_REPORT", "reports", id, r || {});
  await loadAll();
  toast("Laporan berhasil direstore ke arsip.", "success");
  render();
}

function adminPage(){
  if(!high()) return blocked("PANEL PETINGGI ONLY");

  return `<main class="app">
    ${top("ADMIN PANEL")}
    <main class="page">
      ${promotionAdminPanel()}
      <section class="tabs">
        ${[
          ["today","MENU"],
          ["members","ANGGOTA"],
          ["pending","PENDING USER"],
          ["attendance","ACC ABSENSI"],
          ["badge","BADGE GEN"],
          ["archive","ARSIP"],
          ["settings","SETTING"]
        ].map(([id,label]) => `<button class="${S.tab===id ? "active" : ""}" onclick="setTab('${id}')">${label}</button>`).join("")}
      </section>

      ${S.tab === "today" ? adminHome() : ""}
      ${S.tab === "pending" ? pendingUsers() : ""}
      ${S.tab === "members" ? adminMembers() : ""}
      ${S.tab === "attendance" ? attendanceAdminPanel() : ""}
      ${S.tab === "badge" ? badgeGeneratorPanel() : ""}
      ${S.tab === "archive" ? reportArchivePanel() : ""}
      ${S.tab === "settings" ? `<section class="card yellow"><h2>SETTING DISCORD</h2><p>Channel Discord diset lewat bot /setup.</p></section>` : ""}
    </main>${nav()}
  </main>`;
}

function adminHome(){
  return `<section class="grid">
    <button class="tile" onclick="setTab('pending')"><div class="icon">✅</div>ACC USER<small>${S.members.filter(m => m.status === "PENDING").length} pending</small></button>
    <button class="tile" onclick="setTab('members')"><div class="icon">🎖️</div>SET ANGGOTA<small>Username / badge / jabatan</small></button>
    <button class="tile" onclick="setTab('attendance')"><div class="icon">📋</div>ACC ABSENSI<small>${S.attendance.filter(a => a.status === "PENDING").length} pending</small></button>
    <button class="tile" onclick="setTab('badge')"><div class="icon">#️⃣</div>BADGE GEN<small>Auto number</small></button>
    <button class="tile" onclick="go('propam')"><div class="icon">⚖️</div>PROPAM<small>SP / PTDH</small></button>
    <button class="tile" onclick="go('members')"><div class="icon">🔍</div>SEARCH<small>Anggota realtime</small></button>
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
  const rows = filteredMembers();
  return `<section class="card">
    <h2>KELOLA ANGGOTA</h2>
    <input value="${e(S.search)}" oninput="setSearch(this.value)" placeholder="Cari anggota..."/>
    ${rows.map(m => `<div class="list-item">
      <h3><span class="online-dot ${isOnline(m) ? "on" : "off"}"></span>${e(m.display_name)} <span class="status ${e(statusLabel(m.status))}">${e(statusLabel(m.status))}</span></h3>
      <div class="mini">${e(m.badge_number || "NO BADGE")} • ${e(m.jabatan)} • ${e(m.divisi)}</div>
      <button class="btn small" onclick="openMemberDetail(${m.id})">DETAIL</button>
      <button class="btn small yellow" onclick="openMemberEditor(${m.id})">EDIT</button>
      ${canDeleteMember() ? `<button class="btn small red" onclick="deleteMember(${m.id})">HAPUS</button>` : ""}
    </div>`).join("") || `<div class="empty">Tidak ditemukan.</div>`}
  </section>`;
}

function badgeGeneratorPanel(){
  return `<section class="card">
    <h2>BADGE GENERATOR OTOMATIS</h2>
    <div class="row">
      <div class="field"><label>Prefix</label><input id="badge_prefix" value="MDP"/></div>
      <div class="field"><label>Mulai Nomor</label><input id="badge_start" type="number" value="1"/></div>
    </div>
    <div class="field">
      <label>Target</label>
      <select id="badge_target">
        ${S.members.filter(m => !m.badge_number || m.badge_number === "#0000").map(m => `<option value="${m.id}">${e(m.display_name)} - ${e(m.divisi)}</option>`).join("")}
      </select>
    </div>
    <button class="btn green" onclick="generateBadgeForSelected()">GENERATE UNTUK TARGET</button>
    <button class="btn yellow" onclick="generateBadgeForAll()">GENERATE SEMUA YANG KOSONG</button>
  </section>`;
}

function makeBadge(prefix, number){
  return `${prefix}-${String(number).padStart(4, "0")}`;
}

function usedBadges(){
  return new Set(S.members.map(m => m.badge_number).filter(Boolean));
}

function nextBadge(prefix, start){
  const used = usedBadges();
  let n = Number(start || 1);
  while(used.has(makeBadge(prefix, n))) n++;
  return makeBadge(prefix, n);
}

async function generateBadgeForSelected(){
  const id = Number(document.querySelector("#badge_target").value);
  const prefix = document.querySelector("#badge_prefix").value || "MDP";
  const start = Number(document.querySelector("#badge_start").value || 1);
  const badge = nextBadge(prefix, start);
  await updateMemberWithHistory(id, { badge_number:badge }, "GENERATE_BADGE");
  await loadAll();
  toast(`Badge dibuat: ${badge}`, "success");
  render();
}

async function generateBadgeForAll(){
  const prefix = document.querySelector("#badge_prefix").value || "MDP";
  let start = Number(document.querySelector("#badge_start").value || 1);
  const rows = S.members.filter(m => !m.badge_number || m.badge_number === "#0000");
  for(const m of rows){
    const badge = nextBadge(prefix, start);
    await supabase.from("profiles").update({ badge_number:badge }).eq("id", m.id);
    await audit("GENERATE_BADGE", "profiles", m.id, { badge_number:badge });
    start++;
    await loadAll();
  }
  toast(`Generate badge selesai: ${rows.length} anggota.`, "success");
  render();
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
    <div class="field"><label>Status</label><select id="edit_status">${statusOptions(m.status)}</select></div>
    <button class="btn green" onclick="saveMember(${m.id})">SIMPAN</button>
    ${canDeleteMember() ? `<button class="btn red danger-delete" onclick="deleteMember(${m.id})">HAPUS ANGGOTA</button>` : ""}
    <button class="btn" onclick="closeModal()">BATAL</button>
  </section>`;

  document.body.appendChild(modal);
}

function closeModal(){
  document.getElementById("modal")?.remove();
}

async function updateMemberWithHistory(id, data, action="UPDATE_MEMBER"){
  const old = S.members.find(x => x.id === id);
  const { error } = await supabase.from("profiles").update(data).eq("id", id);
  if(error) throw error;

  if(old && data.jabatan && data.jabatan !== old.jabatan){
    await supabase.from("role_history").insert({
      user_id:id,
      old_jabatan:old.jabatan,
      new_jabatan:data.jabatan,
      old_rank_detail:old.rank_detail,
      new_rank_detail:data.rank_detail || old.rank_detail,
      changed_by:S.profile.display_name
    });
  }

  if(old && data.divisi && data.divisi !== old.divisi){
    await supabase.from("division_history").insert({
      user_id:id,
      old_divisi:old.divisi,
      new_divisi:data.divisi,
      changed_by:S.profile.display_name
    });
  }

  await audit(action, "profiles", id, { old, data });
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

  try{
    await updateMemberWithHistory(id, data, "UPDATE_MEMBER");
    closeModal();
    await loadAll();
    render();
  }catch(err){
    alert(err.message);
  }
}

async function approveUser(id){
  if(!can(["PATI","SUPER ADMIN"])) return alert("Akses ditolak. Hanya PATI / SUPER ADMIN yang bisa ACC user.");
  await updateMemberWithHistory(id, {
    status:"ACTIVE",
    jabatan:"CASIS",
    rank_detail:"CASIS",
    divisi:"CASIS"
  }, "APPROVE_USER");

  await botEvent("USER_APPROVED", { id, approved_by:S.profile.display_name });
  await loadAll();
  render();
}

async function rejectUser(id){
  if(!can(["PATI","SUPER ADMIN"])) return alert("Akses ditolak. Hanya PATI / SUPER ADMIN yang bisa menolak user.");
  await updateMemberWithHistory(id, { status:"REJECTED" }, "REJECT_USER");
  await botEvent("USER_REJECTED", { id, rejected_by:S.profile.display_name });
  await loadAll();
  render();
}


async function deleteMember(id){
  if(!canDeleteMember()) return alert("Akses ditolak. Hanya PATI / SUPER ADMIN yang bisa menghapus anggota.");

  const target = S.members.find(x => x.id === id);
  if(!target) return alert("Anggota tidak ditemukan.");

  if(target.id === S.profile.id) return alert("Tidak bisa menghapus akun sendiri.");

  if(target.jabatan === "SUPER ADMIN" && S.profile.jabatan !== "SUPER ADMIN"){
    return alert("Hanya SUPER ADMIN yang bisa menghapus SUPER ADMIN.");
  }

  const reason = prompt(`Alasan menghapus anggota ${target.display_name}?`);
  if(!reason || !reason.trim()) return alert("Alasan penghapusan wajib diisi.");

  if(!confirm(`Yakin hapus anggota ${target.display_name}? Tindakan ini akan masuk audit log.`)) return;

  try{
    await audit("DELETE_MEMBER", "profiles", id, {
      target,
      deleted_by: S.profile.display_name,
      reason
    });

    await botEvent("MEMBER_DELETED", {
      id,
      nama: target.display_name,
      badge_number: target.badge_number || "NO BADGE",
      divisi: target.divisi || "-",
      jabatan: target.jabatan || "-",
      rank_detail: target.rank_detail || "-",
      deleted_by: S.profile.display_name,
      reason
    });

    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if(error) throw error;

    closeModal();
    await loadAll();
    toast("Anggota berhasil dihapus.", "success");
    render();
  }catch(err){
    alert("Gagal hapus anggota: " + err.message);
  }
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
  if(!S.user){ app.innerHTML = loginPage() + loadingOverlay(); drawToasts(); return; }
  if(!S.profile){ app.innerHTML = skeletonPage("MEMUAT PROFIL") + loadingOverlay(); drawToasts(); return; }
  if(S.profile?.status !== "ACTIVE" && S.profile?.jabatan !== "SUPER ADMIN"){ app.innerHTML = pending() + loadingOverlay(); drawToasts(); return; }
  const map = { dashboard, attendance:attendancePage, reports:reportsPage, members:membersPage, propam:propamPage, log:logPage, payroll:payrollPage, admin:adminPage };
  const content = (map[S.page] || dashboard)();
  app.innerHTML = shell(content);
  drawToasts();
}

Object.assign(window, {
  loginDiscord,
  logout,
  go,
  setTab,
  setSearch,
  submitAttendance,
  renderAbsensiTypeHint,
  updateDutyPreview,
  refreshAbsensiFormMode,
  approveAttendance,
  rejectAttendance,
  setReportCat,
  submitReport,
  exportReportPDF,
  deleteReport,
  restoreReport,
  softDeleteReport,
  deleteArchivedMonth,
  archiveMonthlyReports,
  archiveReport,
  setArchiveMonth,
  rejectPromotionRequest,
  approvePromotionRequest,
  submitPromotionRequest,
  rejectReport,
  approveReport,
  saveReport,
  editReport,
  submitSP,
  deleteSP,
  submitPayroll,
  approvePayroll,
  rejectPayroll,
  openMemberEditor,
  openMemberDetail,
  closeModal,
  saveMember,
  approveUser,
  rejectUser,
  deleteMember,
  generateBadgeForSelected,
  generateBadgeForAll,
  toggleTheme,
  setTheme,
  syncDiscord
});

init().catch(err => {
  console.error(err);
  app.innerHTML = `<main class="app page"><section class="card red"><h2>ERROR</h2><p>${e(err.message)}</p></section></main>`;
});

window.setArchiveMonth = setArchiveMonth;
window.archiveReport = archiveReport;
window.archiveMonthlyReports = archiveMonthlyReports;
window.deleteArchivedMonth = deleteArchivedMonth;
window.softDeleteReport = softDeleteReport;
window.restoreReport = restoreReport;
