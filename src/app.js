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
  currentReport: "PATROLI",
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
const fmt = d => d ? new Date(d).toLocaleString("id-ID") : "-";
const monthKey = () => new Date().toISOString().slice(0,7);
const onlineLimit = () => Date.now() - 5 * 60 * 1000;
const isOnline = m => m.last_seen && new Date(m.last_seen).getTime() >= onlineLimit();

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
  return `<main class="app">${top(title)}<main class="page"><section class="card skeleton-card"><div class="skeleton sk-title"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line short"></div></section><section class="grid">${Array.from({length:6}).map(()=>`<div class="tile skeleton-tile"><div class="skeleton sk-icon"></div><div class="skeleton sk-line"></div></div>`).join("")}</section></main></main>`;
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
  const [m,a,r,p,pay,au,rh,dh] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending:false }),
    supabase.from("attendance").select("*").order("created_at", { ascending:false }).limit(400),
    supabase.from("reports").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("disciplinary_records").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("payrolls").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("audit_logs").select("*").order("created_at", { ascending:false }).limit(250),
    supabase.from("role_history").select("*").order("created_at", { ascending:false }).limit(300),
    supabase.from("division_history").select("*").order("created_at", { ascending:false }).limit(300)
  ]);

  S.members = m.data || [];
  S.attendance = a.data || [];
  S.reports = r.data || [];
  S.propam = p.data || [];
  S.payrolls = pay.data || [];
  S.audit = au.data || [];
  S.roleHistory = rh.data || [];
  S.divisionHistory = dh.data || [];
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
        <h2>AKUN ${e(p.status)}</h2>
        <p>Menunggu ACC PATI / SUPER ADMIN.</p>
        <button class="btn red" onclick="logout()">LOGOUT</button>
      </section>

      <section class="card">
        <div class="profile-head">
          <img src="${e(p.avatar_url || "/logo.png")}"/>
          <div>
            <h2>${e(userDisplayName(p))}</h2>
            <span class="status ${e(p.status)}">${e(p.status)}</span>
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
  const todayAbs = S.attendance.filter(x => (x.created_at || "").slice(0,10) === today);
  const monthAbs = S.attendance.filter(x => (x.created_at || "").slice(0,7) === mkey);
  const pendingAbs = S.attendance.filter(x => x.status === "PENDING").length;
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
            <div><small>SP AKTIF</small><h2>${S.propam.filter(x => x.status === "ACTIVE").length}</h2></div>
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

      ${commandStatsCard()}
      ${leaderboardCard()}
      ${liveMemberCard()}
      ${!p.badge_number ? `<section class="card red"><h2>BADGE BELUM DISET</h2><p>Badge bisa diedit oleh perwira/admin.</p></section>` : ""}
    </main>${nav()}
  </main>`;
}

function leaderboardCard(){
  const mkey = monthKey();
  const approved = S.attendance.filter(a => a.status === "APPROVED" && (a.created_at || "").slice(0,7) === mkey);
  const map = {};
  for(const a of approved){
    const key = a.user_id || a.nama;
    map[key] ??= { nama:a.nama || "Unknown", divisi:a.divisi || "-", total:0 };
    map[key].total++;
  }
  const rows = Object.values(map).sort((a,b) => b.total - a.total).slice(0,10);

  return `<section class="card">
    <h2>LEADERBOARD ABSENSI BULAN INI</h2>
    ${rows.length ? rows.map((r,i) => `<div class="leader-row"><b>#${i+1} ${e(r.nama)}</b><span>${e(r.divisi)} • ${r.total}x</span></div>`).join("") : `<div class="empty">Belum ada absensi approved bulan ini.</div>`}
  </section>`;
}


function commandStatsCard(){
  const divMap = {};
  for(const m of S.members){ const key = m.divisi || "LAINNYA"; divMap[key] = (divMap[key] || 0) + 1; }
  const max = Math.max(1, ...Object.values(divMap));
  const rows = Object.entries(divMap).sort((a,b)=>b[1]-a[1]);
  return `<section class="card command-panel"><div class="section-head"><div><h2>DASHBOARD PETINGGI</h2><p class="mini">Statistik anggota, divisi, absensi, laporan, dan pelanggaran.</p></div><button class="btn small" onclick="syncDiscord()">SYNC DISCORD</button></div><div class="stats-grid"><div><small>TOTAL ANGGOTA</small><b>${S.members.length}</b></div><div><small>AKTIF</small><b>${S.members.filter(x=>x.status==="ACTIVE").length}</b></div><div><small>LAPORAN</small><b>${S.reports.length}</b></div><div><small>PAYROLL</small><b>${S.payrolls.filter(x=>x.status==="PENDING").length}</b></div></div><h3>STATISTIK DIVISI</h3><div class="chart-list">${rows.map(([name,total])=>`<div class="chart-row"><span>${e(name)}</span><div class="chart-track"><i style="width:${Math.max(8, Math.round((total/max)*100))}%"></i></div><b>${total}</b></div>`).join("") || `<div class="empty">Belum ada data divisi.</div>`}</div></section>`;
}
function liveMemberCard(){
  const online = S.members.filter(isOnline).slice(0,12);
  return `<section class="card"><div class="section-head"><div><h2>LIVE MEMBER</h2><p class="mini">Anggota yang aktif dalam 5 menit terakhir.</p></div><span class="status ACTIVE">${online.length} ONLINE</span></div><div class="live-grid">${online.map(m=>`<div class="live-member"><img src="${e(m.avatar_url || "/logo.png")}"/><div><b>${e(userDisplayName(m))}</b><span>${e(m.rank_detail || m.jabatan || "-")} • ${e(m.divisi || "-")}</span></div></div>`).join("") || `<div class="empty">Belum ada anggota online.</div>`}</div></section>`;
}
function setupRealtimeWeb(){
  if(S.realtimeReady) return; S.realtimeReady = true;
  const reloadAndToast = async msg => { await loadAll(); toast(msg, "success"); render(); };
  supabase.channel("web-profiles-live").on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, () => reloadAndToast("Data personel diperbarui")).subscribe();
  supabase.channel("web-attendance-live").on("postgres_changes", { event:"*", schema:"public", table:"attendance" }, () => reloadAndToast("Data absensi diperbarui")).subscribe();
  supabase.channel("web-reports-live").on("postgres_changes", { event:"*", schema:"public", table:"reports" }, () => reloadAndToast("Laporan baru masuk")).subscribe();
  supabase.channel("web-propam-live").on("postgres_changes", { event:"*", schema:"public", table:"disciplinary_records" }, () => reloadAndToast("Data Propam diperbarui")).subscribe();
  supabase.channel("web-payroll-live").on("postgres_changes", { event:"*", schema:"public", table:"payrolls" }, () => reloadAndToast("Payroll diperbarui")).subscribe();
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

function attendanceForm(){
  const p = S.profile;
  return `<section class="card">
    <h2>FORM ABSENSI</h2>
    <div class="kv">
      <div><small>NAMA</small><strong>${e(p.display_name)}</strong></div>
      <div><small>JABATAN</small><strong>${e(p.jabatan || "-")}</strong></div>
      <div><small>DIVISI</small><strong>${e(p.divisi || "-")}</strong></div>
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
      <label>Bukti Foto Bisa Lebih Dari 1</label>
      <input id="abs_file" type="file" accept="image/*" multiple/>
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
            ${r.approval_note ? `<br><span class="mini">ACC: ${e(r.approval_note)}</span>` : ""}
            ${r.reject_reason ? `<br><span class="mini">Alasan Tolak: ${e(r.reject_reason)}</span>` : ""}
            ${renderEvidenceLinks(r)}
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
    const files = document.querySelector("#abs_file").files;
    const evidenceUrls = await uploadMany(files, "attendance");

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
      evidence_url: evidenceUrls[0] || null,
      evidence_urls: evidenceUrls,
      status: "PENDING"
    };

    const { error } = await supabase.from("attendance").insert(item);
    if(error) throw error;

    await audit("CREATE_ATTENDANCE", "attendance", "", item);
    await loadAll();

    toast("Absensi masuk ke log dan menunggu ACC.", "success");
    go("log");
    S.tab = "attendance";
    render();
  }catch(err){
    alert(err.message);
  }
}

async function approveAttendance(id){
  if(!canApproveAttendance()) return alert("Akses ditolak. Hanya PATI / SUPER ADMIN yang bisa ACC absensi.");
  const row = S.attendance.find(x => x.id === id);
  const note = prompt("Keterangan ACC") || "Disetujui";

  const { error } = await supabase
    .from("attendance")
    .update({ status:"APPROVED", approved_by:S.profile.display_name, approval_note:note })
    .eq("id", id);

  if(error) return alert(error.message);

  await audit("APPROVE_ATTENDANCE", "attendance", id, { note, row });
  await botEvent("ATTENDANCE_APPROVED", {
    id,
    nama: row?.nama,
    divisi: row?.divisi,
    badge_number: row?.badge_number,
    approved_by: S.profile.display_name,
    note
  });
  await loadAll();
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
    approved_by: S.profile.display_name,
    reason
  });
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
        <div class="field"><label>Bukti Foto Bisa Lebih Dari 1</label><input id="rep_file" type="file" accept="image/*" multiple/></div>
        <button class="btn blue" onclick="submitReport()">KIRIM LAPORAN</button>
      </section>

      <section class="card">
        <h2>RIWAYAT LAPORAN</h2>
        ${S.reports.slice(0,30).map(r=>`<div class="list-item">
          <h3>${e(r.type)} - ${e(r.nama)}</h3>
          <div class="mini">${fmt(r.created_at)} • ${e(r.status)}</div>
          <p>${e(r.payload?.report || "-")}</p>
          <button class="btn small" onclick="exportReportPDF(${r.id})">EXPORT PDF</button>
        </div>`).join("") || `<div class="empty">Belum ada laporan.</div>`}
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
    const files = document.querySelector("#rep_file").files;
    const evidenceUrls = await uploadMany(files, "reports");

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
      evidence_url: evidenceUrls[0] || null,
      evidence_urls: evidenceUrls,
      status: "PENDING"
    });

    if(error) throw error;

    await audit("CREATE_REPORT", "reports", "", { type:S.currentReport, payload });
    await loadAll();
    toast("Laporan masuk.", "success");
    go("log");
    S.tab = "reports";
    render();
  }catch(err){
    alert(err.message);
  }
}

function exportReportPDF(id){
  const r = S.reports.find(x => x.id === id);
  if(!r) return alert("Laporan tidak ditemukan.");

  const urls = getEvidenceList(r);
  const html = `<!doctype html>
<html>
<head>
  <title>Laporan ${e(r.type)} #${r.id}</title>
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
  <h1>MAYDAY POLICE - LAPORAN ${e(r.type)}</h1>
  <p class="muted">Generated: ${fmt(new Date())}</p>
  <table>
    <tr><th>Nama</th><td>${e(r.nama)}</td></tr>
    <tr><th>Badge</th><td>${e(r.badge_number || "NO BADGE")}</td></tr>
    <tr><th>Divisi</th><td>${e(r.divisi)}</td></tr>
    <tr><th>Status</th><td>${e(r.status)}</td></tr>
    <tr><th>Lokasi</th><td>${e(r.payload?.location || "-")}</td></tr>
    <tr><th>Shift</th><td>${e(r.payload?.shift || "-")}</td></tr>
    <tr><th>Kronologi</th><td>${e(r.payload?.report || "-")}</td></tr>
    <tr><th>Video</th><td>${e(r.payload?.video || "-")}</td></tr>
    <tr><th>Waktu</th><td>${fmt(r.created_at)}</td></tr>
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

function membersPage(){
  const rows = filteredMembers();

  return `<main class="app">
    ${top("DATA PERSONEL")}
    <main class="page">
      <section class="card">
        <h2>SEARCH ANGGOTA REALTIME</h2>
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
      <span class="status ${e(m.status)}">${e(m.status)}</span>
    </h3>
    <div class="mini">${e(m.badge_number || "NO BADGE")} • ${e(m.jabatan || "-")} • ${e(m.divisi || "-")}</div>
    <div class="mini">Last login: ${fmt(m.last_login)} • Last seen: ${fmt(m.last_seen)}</div>
    <div class="mini">Absensi bulan ini: ${monthTotal} • Riwayat SP: ${spTotal}</div>
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
    ${abs.map(x=>`<div class="mini">• ${fmt(x.created_at)}: ${e(x.type)} / ${e(x.status)} - ${e(x.note || "-")}</div>`).join("") || `<div class="mini">Belum ada.</div>`}

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
  return `<main class="app">
    ${top("FINANCIAL GATEWAY")}
    <main class="page">
      <section class="card blue">
        <span class="badge">PAYROLL SYSTEM</span>
        <h2 class="big-title">GAJI</h2>
        <p>${e(userDisplayName(S.profile))} • ${e(S.profile.badge_number || "NO BADGE")}</p>
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
  const tabs = ["today","attendance","reports","propam","audit","leaderboard"];

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
          <td><span class="status ${e(r.status)}">${e(r.status)}</span></td>
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
  return `<section class="card">
    <h2>AUDIT LENGKAP</h2>
    ${S.audit.map(a => `<div class="list-item">
      <h3>${e(a.action)}</h3>
      <div class="mini">${e(a.actor_name)} • ${fmt(a.created_at)}</div>
      <pre class="audit-pre">${e(JSON.stringify(a.metadata || {}, null, 2))}</pre>
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
          ["badge","BADGE GEN"],
          ["settings","SETTING"]
        ].map(([id,label]) => `<button class="${S.tab===id ? "active" : ""}" onclick="setTab('${id}')">${label}</button>`).join("")}
      </section>

      ${S.tab === "today" ? adminHome() : ""}
      ${S.tab === "pending" ? pendingUsers() : ""}
      ${S.tab === "members" ? adminMembers() : ""}
      ${S.tab === "attendance" ? attendanceAdminPanel() : ""}
      ${S.tab === "badge" ? badgeGeneratorPanel() : ""}
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
      <h3><span class="online-dot ${isOnline(m) ? "on" : "off"}"></span>${e(m.display_name)} <span class="status ${e(m.status)}">${e(m.status)}</span></h3>
      <div class="mini">${e(m.badge_number || "NO BADGE")} • ${e(m.jabatan)} • ${e(m.divisi)}</div>
      <button class="btn small" onclick="openMemberDetail(${m.id})">DETAIL</button>
      <button class="btn small yellow" onclick="openMemberEditor(${m.id})">EDIT</button>
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
    <div class="field"><label>Status</label><select id="edit_status">${["PENDING","ACTIVE","SUSPENDED","PTDH","REJECTED"].map(x => `<option ${m.status===x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
    <button class="btn green" onclick="saveMember(${m.id})">SIMPAN</button>
    <button class="btn red" onclick="closeModal()">BATAL</button>
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
  approveAttendance,
  rejectAttendance,
  setReportCat,
  submitReport,
  exportReportPDF,
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
