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
  "CASIS": 20,
  "TAMTAMA": 65,
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

const PAYROLL_RATE_BY_JABATAN = {
  "CASIS": 14285,
  "TAMTAMA": 21428,
  "BINTARA": 35714,
  "PAMA": 42900,
  "PAMEN": 50000,
  "PATI": 60000,
  "SUPER ADMIN": 35714
};

const LEAVE_PAYROLL_DEDUCTION = 4000;

function payrollJabatan(member = S.profile){
  return String(member?.jabatan || member?.rank_detail || "").trim().toUpperCase();
}

function salaryRateForMember(member = S.profile){
  return PAYROLL_RATE_BY_JABATAN[payrollJabatan(member)] ?? 0;
}

function attendancePayrollValue(member = S.profile, type = "ABSENSI"){
  const kind = String(type || "ABSENSI").toUpperCase();
  if(kind === "ABSENSI") return salaryRateForMember(member);
  if(kind === "IZIN" || kind === "CUTI") return -LEAVE_PAYROLL_DEDUCTION;
  return 0;
}

function payrollPeriodValue(){
  return document.querySelector("#payroll_research_period")?.value || monthKey();
}

function payrollRowsForPeriod(period = monthKey()){
  return S.members.map(member => {
    const rows = S.attendance.filter(a =>
      Number(a.user_id) === Number(member.id) &&
      String(a.status || "").toUpperCase() === "APPROVED" &&
      String(a.created_at || a.duty_start_at || "").slice(0,7) === period
    );

    const hadir = rows.filter(a => String(a.type || "").toUpperCase() === "ABSENSI").length;
    const izin = rows.filter(a => String(a.type || "").toUpperCase() === "IZIN").length;
    const cuti = rows.filter(a => String(a.type || "").toUpperCase() === "CUTI").length;
    const rate = salaryRateForMember(member);
    const gross = hadir * rate;
    const deduction = (izin + cuti) * LEAVE_PAYROLL_DEDUCTION;
    const total = Math.max(0, gross - deduction);
    const paid = S.payrolls.some(p => Number(p.user_id) === Number(member.id) && String(p.period || "").includes(period) && ["PAID","APPROVED"].includes(String(p.status || "").toUpperCase()));

    return { member, hadir, izin, cuti, rate, gross, deduction, total, paid };
  });
}

function payrollStatsForMember(member = S.profile, period = monthKey()){
  const row = payrollRowsForPeriod(period).find(x => Number(x.member.id) === Number(member?.id));
  return row || { member, hadir:0, izin:0, cuti:0, rate:salaryRateForMember(member), gross:0, deduction:0, total:0, paid:false };
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
          ${String(r.status).toUpperCase() === "DELETED" ? `<button class="btn small green" onclick="restoreReport(${r.id})">RESTORE KE ARSIP</button>` : `<button class="btn small red" onclick="softDeleteReport(${r.id})">HAPUS</button>`}
        </div>
      </div>`).join("") || `<div class="empty">Belum ada arsip laporan untuk ${e(monthNameID(month))}.</div>`}
    </div>
  </section>`;
}

function reportTypeLabel(type){
  return REPORT_TYPES.find(x => x.id === type)?.label || type || "LAPORAN";
}

function activityCapFor(member){
  const rank = normalizeRank(member?.rank_detail || member?.jabatan);
  return ACTIVITY_CAP_BY_RANK[rank] ?? 10;
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
  const current = Number(member.activity_points_total || 0);
  const cap = activityCapFor(member);
  const unlimited = isUnlimitedRank(member.rank_detail || member.jabatan) || cap >= 999999;
  const add = Number(amount || 1);
  const next = unlimited ? current + add : Math.min(cap, current + add);
  const gained = Math.max(0, next - current);

  await supabase.from("profiles").update({
    activity_points_period: period,
    activity_points_total: next
  }).eq("id", userId);

  const local = S.members.find(x => x.id === userId);
  if(local){
    local.activity_points_period = period;
    local.activity_points_total = next;
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
const POINTS_PER_HOUR = 0;
const PAYROLL_PER_POINT = 0;
const MIN_DUTY_MINUTES = 0;

function money(v){
  return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR", maximumFractionDigits:0 }).format(Number(v || 0));
}
function roundPoint(v){ return Math.round(Number(v || 0) * 100) / 100; }
function dutyPointFromMinutes(minutes){ return 0; }
function payrollFromPoints(points){ return 0; }
function normalizeManualTime(value){
  const raw = String(value || "").trim();
  if(!raw) return "";
  let cleaned = raw.replace(".", ":").replace(/\s+/g, "");

  if(/^\d{1,2}$/.test(cleaned)){
    cleaned = cleaned.padStart(2, "0") + ":00";
  }else if(/^\d{3,4}$/.test(cleaned)){
    cleaned = cleaned.padStart(4, "0");
    cleaned = cleaned.slice(0,2) + ":" + cleaned.slice(2);
  }

  const match = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
  if(!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if(hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}

function combineDateTime(date, time){
  const t = normalizeManualTime(time);
  if(!date || !t) return null;
  return new Date(`${date}T${t}:00`);
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

  const rate = salaryRateForMember(S.profile);

  if(type === "ABSENSI"){
    preview.innerHTML = `<div class="payroll-preview ok">
      <div><small>SISTEM</small><b>PER ABSENSI</b></div>
      <div><small>JABATAN</small><b>${e(payrollJabatan(S.profile) || "-")}</b></div>
      <div><small>TARIF</small><b>${money(rate)}</b></div>
      <div><small>SETELAH ACC</small><b>+${money(rate)}</b></div>
      <p>Jam ON/OFF Duty disimpan sebagai data administrasi. Gaji tetap dihitung per absensi yang di-ACC.</p>
    </div>`;
    return;
  }

  preview.innerHTML = `<div class="payroll-preview danger">
    <div><small>JENIS</small><b>${e(type)}</b></div>
    <div><small>POTONGAN</small><b>-${money(LEAVE_PAYROLL_DEDUCTION)}</b></div>
    <div><small>SETELAH ACC</small><b>Payroll berkurang</b></div>
    <p>Izin/Cuti wajib isi tanggal dan jam mulai sampai selesai.</p>
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

  if(fileLabel){
    fileLabel.textContent = type === "ABSENSI"
      ? "Bukti Foto Wajib Bisa Lebih Dari 1"
      : "Bukti Foto Opsional Bisa Lebih Dari 1";
  }

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
  return `<main class="app">${top(title)}<main class="page">${promotionAdminPanel()}<section class="card skeleton-card"><div class="skeleton sk-title"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line short"></div></section><section class="grid">${Array.from({length:6}).map(()=>`<div class="tile skeleton-tile"><div class="skeleton sk-icon"></div><div class="skeleton sk-line"></div></div>`).join("")}</section></main></main>`;
}
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
    // authorize personal charges visibility
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
      divisi: "NON DIVISI",
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

  S.members = (m.data || []).map(x => ({
    ...x,
    rank_detail: normalizeRank(x.rank_detail),
    divisi: normalizeDivisi(x.divisi)
  }));
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
    const { data, error } = await supabase.from("bot_events").insert({
      event_type,
      payload,
      status: "PENDING"
    }).select("*").single();

    if(error) throw error;
    return data;
  }catch(err){
    console.warn("bot event failed:", err.message);
    toast(`Bot event gagal: ${err.message}`, "error");
    return null;
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
        <small>MAYDAY POLICE WEB V3.4</small>
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
    ...(high() ? [["leaderboard","🏆","RANK"]] : []),
    ["admin","⚙","ADMIN"]
  ];

  return `<nav class="nav nav-seven">${items.map(([id,ic,tx]) => `
    <button class="${S.page===id ? "active" : ""}" onclick="go('${id}')">
      <span>${ic}</span>${tx}
    </button>
  `).join("")}</nav>`;
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
  }, 1000);
}

function setTab(tab){
  S.tab = tab;
  render();
}

function isFormPage(){
  return ["attendance","reports","payroll","propam","members","admin"].includes(S.page);
}

function markFormDirty(v = true){
  S.formDirty = !!v;
}

function shouldBlockAutoReload(){
  const noAutoRefreshPages = ["attendance","reports","payroll","propam"];

  return (
    S.loading ||
    S.formDirty ||
    noAutoRefreshPages.includes(S.page) ||
    !!document.querySelector(".modal-backdrop, .modal, .dialog, [data-modal='true']")
  );
}

function setMemberSearchDraft(v){
  S.searchDraft = v || "";
}

function applyMemberSearch(){
  const el = document.querySelector("#member_search");
  S.search = String(el?.value || "").trim();
  S.searchDraft = S.search;
  render();
}

function setMemberDivisionFilter(v){
  S.memberDivisionFilter = v || "";
  S.search = String(document.querySelector("#member_search")?.value || S.searchDraft || "").trim();
  S.searchDraft = S.search;
  render();
}

function setMemberRankFilter(v){
  S.memberRankFilter = v || "";
  S.search = String(document.querySelector("#member_search")?.value || S.searchDraft || "").trim();
  S.searchDraft = S.search;
  render();
}

function clearMemberFilters(){
  S.search = "";
  S.searchDraft = "";
  S.memberDivisionFilter = "";
  S.memberRankFilter = "";
  render();
}

function setSearch(v){
  S.searchDraft = v || "";
}

function memberSearchFilterPanel(){
  return `
    <div class="member-search-panel">
      <input
        id="member_search"
        placeholder="Cari nama / badge / Discord ID lalu tekan Enter..."
        value="${e(S.searchDraft || S.search || "")}"
        oninput="setMemberSearchDraft(this.value)"
        onkeydown="if(event.key === 'Enter') applyMemberSearch()"
      />

      <button class="btn small blue" onclick="applyMemberSearch()">CARI</button>
      <button class="btn small" onclick="clearMemberFilters()">RESET</button>
    </div>

    <div class="member-filter-grid">
      <div class="field">
        <label>Filter Divisi</label>
        <select onchange="setMemberDivisionFilter(this.value)">
          <option value="" ${!S.memberDivisionFilter ? "selected" : ""}>SEMUA DIVISI</option>
          ${DIV.map(x => `<option value="${e(x)}" ${S.memberDivisionFilter === x ? "selected" : ""}>${e(x)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Filter Rank</label>
        <select onchange="setMemberRankFilter(this.value)">
          <option value="" ${!S.memberRankFilter ? "selected" : ""}>SEMUA RANK</option>
          ${RANK.map(x => `<option value="${e(x)}" ${S.memberRankFilter === x ? "selected" : ""}>${e(x)}</option>`).join("")}
        </select>
      </div>
    </div>

    ${(S.search || S.memberDivisionFilter || S.memberRankFilter) ? `
      <div class="filter-summary">
        Filter aktif:
        ${S.search ? `<b>Pencarian: ${e(S.search)}</b>` : ""}
        ${S.memberDivisionFilter ? `<b>Divisi: ${e(S.memberDivisionFilter)}</b>` : ""}
        ${S.memberRankFilter ? `<b>Rank: ${e(S.memberRankFilter)}</b>` : ""}
      </div>
    ` : ""}
  `;
}

function filteredMembers(){
  const q = String(S.search || "").trim().toLowerCase();
  const div = String(S.memberDivisionFilter || "").trim().toUpperCase();
  const rank = String(S.memberRankFilter || "").trim().toUpperCase();

  return S.members.filter(m => {
    const memberName = userDisplayName(m);

    const textSource = [
      memberName,
      m.display_name,
      m.server_nickname,
      m.discord_nickname,
      m.discord_username,
      m.badge_number,
      m.jabatan,
      m.rank_detail,
      m.divisi,
      m.status,
      m.discord_id
    ].map(x => String(x || "").toLowerCase()).join(" ");

    const memberDiv = normalizeDivisi(m.divisi).toUpperCase();
    const memberRank = normalizeRank(m.rank_detail || m.jabatan).toUpperCase();
    const memberJabatan = String(m.jabatan || "").trim().toUpperCase();

    const matchText = !q || textSource.includes(q);
    const matchDiv = !div || memberDiv === div;
    const matchRank = !rank || rank === "SEMUA RANK" || memberRank === rank || memberJabatan === rank;

    return matchText && matchDiv && matchRank;
  });
}

function loginPage(){
  return `<main class="app login-screen">
    <section class="login-frame">
      <div class="login-head">OFFICIAL WEB V3.4</div>
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
            <div><small>TARIF / ABSENSI</small><b>${money(salaryRateForMember(p))}</b></div>
            <div><small>SALDO GAJI</small><b>${money(p.pending_payroll || 0)}</b></div>
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
        ${high() ? `<button class="tile" onclick="go('leaderboard')"><div class="icon">🏆</div>LEADERBOARD<small>Payroll & activity</small></button><button class="tile" onclick="go('admin')"><div class="icon">⚙️</div>ADMIN<small>Panel</small></button>` : ""}
      </section>

      ${activityProgressCard()}
      ${commandStatsCard()}
      ${leaderboardCard()}
      ${liveMemberCard()}
      ${!p.badge_number ? `<section class="card red"><h2>BADGE BELUM DISET</h2><p>Badge bisa diedit oleh perwira/admin.</p></section>` : ""}
    </main>${nav()}
  </main>`;
}

/* ... sisa file tetap sama seperti di repo (tidak ditampilkan di sini untuk ringkasan) ... */

/* PENTING: bagian render() di akhir file sekarang memasukkan route personal-charges: */
function render(){
  if(!S.user){ app.innerHTML = loginPage() + loadingOverlay(); drawToasts(); return; }
  if(!S.profile){ app.innerHTML = skeletonPage("MEMUAT PROFIL") + loadingOverlay(); drawToasts(); return; }
  if(S.profile?.status !== "ACTIVE" && S.profile?.jabatan !== "SUPER ADMIN"){ app.innerHTML = pending() + loadingOverlay(); drawToasts(); return; }
  const map = { dashboard, attendance:attendancePage, reports:reportsPage, members:membersPage, propam:propamPage, log:logPage, payroll:payrollPage, leaderboard:leaderboardPage, admin:adminPage, "personal-charges": personalChargesPage };
  const content = (map[S.page] || dashboard)();
  app.innerHTML = shell(content);
  // mount personal charges handlers if on page
  if(S.page === 'personal-charges'){
    setTimeout(() => {
      try {
        // mountPersonalCharges is imported via dynamic import earlier in init; but ensure it's available here
        (async () => {
          try {
            const mod = await import('./components/personalCharges.js');
            mod.mountPersonalCharges(document);
          } catch (err) {
            console.warn('mountPersonalCharges failed', err);
          }
        })();
      } catch (err) {
        console.warn('mountPersonalCharges dynamic import failed', err);
      }
    }, 10);
  }
  drawToasts();
}

/* Rest of file exports/window assignments remain unchanged */
Object.assign(window, {
  loginDiscord,
  logout,
  go,
  setTab,
  setSearch,
  markFormDirty,
  setMemberSearchDraft,
  applyMemberSearch,
  setMemberDivisionFilter,
  setMemberRankFilter,
  clearMemberFilters,
  forceRefreshPersonnel,
  submitAttendance,
  renderAbsensiTypeHint,
  updateDutyPreview,
  refreshAbsensiFormMode,
  approveAttendance,
  rejectAttendance,
  deleteAttendance,
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
  syncDiscord,
  setPayrollResearchPeriod,
  recalcPayrollResearchRates,
  monthKey
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

document.addEventListener("input", e => {
  if(e.target?.matches?.("input, textarea, select") && ["attendance","reports","payroll","propam"].includes(S.page)){
    S.formDirty = true;
  }
});

document.addEventListener("change", e => {
  if(e.target?.matches?.("input, textarea, select") && ["attendance","reports","payroll","propam"].includes(S.page)){
    S.formDirty = true;
  }
});
/// md
