import WebSocket from "ws";
global.WebSocket = WebSocket;

import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  REST,
  Routes
} from "discord.js";
import { createClient } from "@supabase/supabase-js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const choices = [
  "log_website",
  "log_patroli",
  "log_penangkapan",
  "log_penyitaan_kendaraan",
  "log_absensi",
  "log_izin_cuti",
  "log_payroll",
  "log_audit",
  "log_verifikasi_user",
  "log_propam",

  "verifikasi_user",
  "laporan_operasi",
  "payroll",
  "audit_log",
  "propam_log",
  "absensi_log",
  "izin_cuti_log",
  "absensi_casis",
  "absensi_sabhara",
  "absensi_satbrimob",
  "absensi_satlantas",
  "absensi_polairud",
  "absensi_bareskrim",
  "absensi_setum",
  "absensi_bidpropam"
];

const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set channel/thread Mayday MDT")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o
        .setName("tipe")
        .setDescription("Jenis log/thread")
        .setRequired(true)
        .addChoices(...choices.map(v => ({ name: v, value: v })))
    )
    .addChannelOption(o =>
      o
        .setName("channel")
        .setDescription("Pilih channel atau thread")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread)
    ),

  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Lihat setting channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.toJSON());

async function register() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.DISCORD_GUILD_ID
    ),
    { body: commands }
  );

  console.log("✅ Slash command registered");
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot online: ${client.user.tag}`);

  await register();

  watchAttendance();
  watchReports();
  watchPropam();
  watchPayroll();
  watchPendingUsers();
  watchBotEvents();

  await syncPendingUsers();
  await syncPendingAttendance();

  console.log("✅ Semua realtime listener aktif");
});

client.on(Events.InteractionCreate, async i => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === "setup") {
        const tipe = i.options.getString("tipe", true);
        const ch = i.options.getChannel("channel", true);

        const { error } = await supabase.from("bot_settings").upsert(
          {
            guild_id: i.guildId,
            setting_key: tipe,
            setting_value: ch.id
          },
          { onConflict: "guild_id,setting_key" }
        );

        if (error) throw error;

        return i.reply({
          content: `✅ **${tipe}** diset ke ${ch}`,
          ephemeral: true
        });
      }

      if (i.commandName === "settings") {
        const { data } = await supabase
          .from("bot_settings")
          .select("*")
          .eq("guild_id", i.guildId);

        const desc =
          (data || [])
            .map(s => `• **${s.setting_key}** → <#${s.setting_value}>`)
            .join("\n") || "Belum ada setting.";

        return i.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚙️ MAYDAY MDT SETTINGS")
              .setDescription(desc)
              .setColor(0x2563eb)
          ],
          ephemeral: true
        });
      }
    }

    if (i.isButton()) {
      return i.reply({
        content: "Approval dari Discord sudah dinonaktifkan. Semua ACC / TOLAK sekarang hanya lewat Website MDT.",
        ephemeral: true
      });
    }
  } catch (err) {
    console.error(err);

    if (!i.replied && !i.deferred) {
      await i.reply({
        content: `❌ ${err.message}`,
        ephemeral: true
      });
    }
  }
});

async function setting(key) {
  const { data } = await supabase
    .from("bot_settings")
    .select("setting_value")
    .eq("guild_id", process.env.DISCORD_GUILD_ID)
    .eq("setting_key", key)
    .maybeSingle();

  return data?.setting_value;
}

const LOG_FALLBACK = {
  log_patroli: ["laporan_operasi", "log_website", "audit_log"],
  log_penangkapan: ["laporan_operasi", "log_website", "audit_log"],
  log_penyitaan_kendaraan: ["laporan_operasi", "log_website", "audit_log"],
  log_absensi: ["absensi_log", "log_website", "audit_log"],
  log_izin_cuti: ["izin_cuti_log", "log_website", "audit_log"],
  log_payroll: ["payroll", "log_website", "audit_log"],
  log_audit: ["audit_log", "log_website"],
  log_verifikasi_user: ["verifikasi_user", "log_website", "audit_log"],
  log_propam: ["propam_log", "log_website", "audit_log"]
};

function reportLogKey(type) {
  if (type === "PATROLI") return "log_patroli";
  if (type === "KRIMINAL") return "log_penangkapan";
  if (type === "PENYITAAN_KENDARAAN") return "log_penyitaan_kendaraan";
  return "log_website";
}

async function settingWithFallback(key) {
  const direct = await setting(key);
  if (direct) return direct;

  for (const alt of LOG_FALLBACK[key] || []) {
    const value = await setting(alt);
    if (value) return value;
  }

  return null;
}

async function sendTo(key, embed, components = []) {
  const chId =
    (await settingWithFallback(key)) ||
    (await setting("log_website")) ||
    (await setting("audit_log"));

  if (!chId) {
    console.log("Channel/thread belum diset:", key);
    return null;
  }

  const ch = await client.channels.fetch(chId);

  if (!ch || !ch.send) {
    console.log("Target bukan channel/thread yang bisa dikirim:", key, chId);
    return null;
  }

  return ch.send({
    embeds: [embed],
    components
  });
}

function rowButtons(type, id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve:${type}:${id}`)
        .setLabel("ACC")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`reject:${type}:${id}`)
        .setLabel("TOLAK")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function normalizeRank(rank) {
  const r = String(rank || "").trim();
  if (["Bharada", "Bharatu", "Bharaka", "BHARADA", "BHARATU", "BHARAKA", "Tamtama"].includes(r)) return "TAMTAMA";
  return r;
}

function normalizeDivisi(divisi) {
  const d = String(divisi || "").trim();
  if (d.toUpperCase() === "CASIS" || d.toUpperCase() === "NON DEVISI") return "NON DIVISI";
  return d || "NON DIVISI";
}

async function profileNameById(id) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, discord_nickname, server_nickname, discord_username")
    .eq("id", Number(id))
    .maybeSingle();
  return data?.server_nickname || data?.discord_nickname || data?.display_name || data?.discord_username || String(id);
}

async function colleagueNames(ids = []) {
  const arr = Array.isArray(ids) ? ids : [];
  if (!arr.length) return "-";
  const names = [];
  for (const id of arr) names.push(await profileNameById(id));
  return names.join(", ");
}

function evidenceText(row) {
  const urls = [];

  if (Array.isArray(row.evidence_urls)) {
    urls.push(...row.evidence_urls);
  }

  if (row.evidence_url && !urls.includes(row.evidence_url)) {
    urls.push(row.evidence_url);
  }

  if (!urls.length) return "-";

  return urls.map((u, i) => `[Bukti ${i + 1}](${u})`).join("\n");
}

function watchAttendance() {
  supabase
    .channel("attendance-watch")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "attendance" },
      async p => {
        const r = p.new;
        const kind = String(r.type || "ABSENSI").toUpperCase();

        if (kind === "ABSENSI") {
          const embed = new EmbedBuilder()
            .setTitle("📋 ABSENSI ANGGOTA")
            .setColor(0x22c55e)
            .addFields(
              { name: "Nama", value: r.nama || "-", inline: true },
              { name: "Badge", value: r.badge_number || "NO BADGE", inline: true },
              { name: "Jabatan", value: r.jabatan || "-", inline: true },
              { name: "Divisi", value: normalizeDivisi(r.divisi), inline: true },
              { name: "Lokasi", value: r.location || "-", inline: true },
              { name: "Keterangan", value: r.note || "-", inline: false },
              { name: "Bukti", value: evidenceText(r), inline: false },
              { name: "Catatan", value: "ACC / TOLAK hanya lewat Website MDT.", inline: false }
            )
            .setFooter({ text: `Record ID: ${r.id}` })
            .setTimestamp();

          if (r.evidence_url) embed.setImage(r.evidence_url);

          const msg = await sendTo("log_absensi", embed, []);
          if (!msg) return;

          await supabase
            .from("attendance")
            .update({ discord_message_id: msg.id })
            .eq("id", r.id);

          return;
        }

        if (kind === "IZIN" || kind === "CUTI") {
          const mentionRole = "<@&1491453968138895431>";
          const tanggalMulai = r.leave_start_date || "-";
          const tanggalAkhir = r.leave_end_date || r.leave_start_date || "-";

          const embed = new EmbedBuilder()
            .setColor(0xfbbf24)
            .setDescription(
`${mentionRole}

**SURAT PERMOHONAN IZIN KEPOLISIAN MAYDAY**
\`\`\`
Dengan hormat bapak JENDRAL/KOMJEN.

Dengan ini saya : ${kind}

Nama      : ${r.nama || "-"}
Pangkat  : ${normalizeRank(r.rank_detail || r.jabatan || "-")}
Satuan   : ${normalizeDivisi(r.divisi || "-")}
Alasan   : ${r.note || "-"}

Tanggal Izin      : ${tanggalMulai}
Tanggal berakhir  : ${tanggalAkhir}

Demikian surat permohonan izin ini kami sampaikan agar para petinggi dapat memaklumkan dan saya ucapkan terimakasih.
\`\`\``)
            .addFields(
              { name: "Bukti", value: evidenceText(r), inline: false },
              { name: "Catatan", value: "ACC / TOLAK hanya lewat Website MDT.", inline: false }
            )
            .setFooter({ text: `Record ID: ${r.id}` })
            .setTimestamp();

          if (r.evidence_url) embed.setImage(r.evidence_url);

          const msg = await sendTo("log_izin_cuti", embed, []);
          if (!msg) return;

          await supabase
            .from("attendance")
            .update({ discord_message_id: msg.id })
            .eq("id", r.id);

          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`PENGAJUAN ${kind}`)
          .setColor(0x22c55e)
          .addFields(
            { name: "Nama", value: r.nama || "-", inline: true },
            { name: "Badge", value: r.badge_number || "NO BADGE", inline: true },
            { name: "Jabatan", value: r.jabatan || "-", inline: true },
            { name: "Divisi", value: normalizeDivisi(r.divisi), inline: true },
            { name: "Status", value: r.type || "-", inline: true },
            { name: "Lokasi", value: r.location || "-", inline: true },
            { name: "Keterangan", value: r.note || "-", inline: false },
            { name: "Bukti", value: evidenceText(r), inline: false },
            { name: "Catatan", value: "ACC / TOLAK hanya lewat Website MDT.", inline: false }
          )
          .setFooter({ text: `Record ID: ${r.id}` })
          .setTimestamp();

        if (r.evidence_url) embed.setImage(r.evidence_url);

        const msg = await sendTo("log_izin_cuti", embed, []);
        if (!msg) return;

        await supabase
          .from("attendance")
          .update({ discord_message_id: msg.id })
          .eq("id", r.id);
      }
    )
    .subscribe(s => console.log("attendance realtime:", s));
}


function reportTypeLabel(type) {
  const map = {
    PATROLI: "PATROLI",
    KRIMINAL: "PENANGKAPAN",
    PENYITAAN_KENDARAAN: "PENYITAAN KENDARAAN"
  };
  return map[type] || type || "LAPORAN";
}

async function reportTextBlock(row) {
  const p = row.payload || {};
  const type = row.type;
  const rekan = await colleagueNames(p.colleagues || []);

  if (type === "KRIMINAL") {
    return `LAPORAN PENANGKAPAN

I. Informasi Penahanan.
- Tanggal dan Waktu Penahanan: ${p.arrest_datetime || p.report_date || "-"}
- Lokasi Penahanan            : ${p.detention_location || "-"}
- Deskripsi Singkat           : ${p.summary || p.chronology || "-"}

II. Informasi Tersangka:
- Nama Tersangka             : ${p.suspect_name || p.subject_info || "-"}
- Pasal                      : ${p.law || "-"}
- Denda                      : ${p.fine || "-"}
- Hukuman/Masa Tahanan       : ${p.sentence || p.duration || "-"}

III. Identitas Petugas yang Menahan.
- Nama Petugas               : ${row.nama || "-"}
- Divisi                     : ${normalizeDivisi(row.divisi) || "-"}
- Pangkat                    : ${normalizeRank(row.rank_detail) || "-"}
- Jabatan                    : ${row.jabatan || "-"}
- Rekan                      : ${rekan}
- Jenis Barang Bukti         : ${p.evidence_type || "-"}

Note: Bukti KTP & Barang Bukti wajib diunggah melalui tombol lampiran media di bawah.`;
  }

  if (type === "PATROLI") {
    return `LAPORAN PATROLI

I. Informasi Patroli.
- Tanggal Patroli            : ${p.report_date || "-"}
- Jam Patroli                : ${p.report_time || "-"}
- Area Patroli               : ${p.area || "-"}

II. Identitas Petugas.
- Nama Petugas               : ${row.nama || "-"}
- Divisi                     : ${normalizeDivisi(row.divisi) || "-"}
- Pangkat                    : ${normalizeRank(row.rank_detail) || "-"}
- Jabatan                    : ${row.jabatan || "-"}
- Rekan                      : ${rekan}

III. Laporan Singkat.
${p.chronology || p.report || "-"}

Note: Bukti patroli wajib diunggah melalui tombol lampiran media di bawah.`;
  }

  return `LAPORAN PENYITAAN KENDARAAN

I. Informasi Penyitaan.
- Tanggal Penyitaan          : ${p.report_date || "-"}
- Kronologi                  : ${p.chronology || p.report || "-"}

II. Informasi Kendaraan.
- Informasi Kendaraan        : ${p.subject_info || "-"}
- Nomor Plate                : ${p.plate || "-"}
- Pasal                      : ${p.law || "-"}
- Denda                      : ${p.fine || "-"}
- Masa Sita                  : ${p.duration || "-"}

III. Identitas Petugas.
- Nama Petugas               : ${row.nama || "-"}
- Divisi                     : ${normalizeDivisi(row.divisi) || "-"}
- Pangkat                    : ${normalizeRank(row.rank_detail) || "-"}
- Jabatan                    : ${row.jabatan || "-"}
- Rekan                      : ${rekan}

Note: Bukti kendaraan wajib diunggah melalui tombol lampiran media di bawah.`;
}

async function reportDescription(row) {
  const title = `📁 **ARSIP LAPORAN BARU DITERIMA - KATEGORI: ${reportTypeLabel(row.type)}**`;
  const body = await reportTextBlock(row);
  return `${title}\n\`\`\`text\n${body}\n\`\`\``;
}

function watchReports() {
  supabase
    .channel("reports-watch")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "reports" },
      async p => {
        const r = p.new;
        const key = reportLogKey(r.type);

        const embed = new EmbedBuilder()
          .setDescription(await reportDescription(r))
          .setColor(0x2f313f)
          .addFields(
            { name: "Bukti", value: evidenceText(r), inline: false },
            { name: "Catatan", value: "ACC / TOLAK laporan hanya lewat Website MDT.", inline: false }
          )
          .setFooter({ text: `Record ID: ${r.id}` })
          .setTimestamp();

        if (r.evidence_url) embed.setImage(r.evidence_url);

        await sendTo(key, embed, []);
      }
    )
    .subscribe(s => console.log("reports realtime:", s));
}

function watchPropam() {
  supabase
    .channel("propam-watch")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "disciplinary_records" },
      async p => {
        const r = p.new;

        const embed = new EmbedBuilder()
          .setTitle(r.sp_level === 99 ? "⚖️ PTDH" : "⚖️ SURAT PERINGATAN")
          .setColor(0xef4444)
          .addFields(
            { name: "Target", value: r.target_name || "-", inline: true },
            {
              name: "Level",
              value: r.sp_level === 99 ? "PTDH" : `SP${r.sp_level}`,
              inline: true
            },
            { name: "Dikeluarkan oleh", value: r.issued_by || "-", inline: true },
            { name: "Alasan", value: r.reason || "-", inline: false },
            { name: "Bukti", value: evidenceText(r), inline: false }
          )
          .setFooter({ text: `Record ID: ${r.id}` })
          .setTimestamp();

        if (r.evidence_url) embed.setImage(r.evidence_url);

        await sendTo("log_propam", embed, []);
      }
    )
    .subscribe(s => console.log("propam realtime:", s));
}

function watchPayroll() {
  supabase
    .channel("payroll-watch")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "payrolls" },
      async p => {
        const r = p.new;

        const embed = new EmbedBuilder()
          .setTitle("💵 PENGAJUAN PAYROLL")
          .setColor(0xffd400)
          .addFields(
            { name: "Nama", value: r.nama || "-", inline: true },
            { name: "Periode", value: r.period || "-", inline: true },
            { name: "Nominal", value: String(r.amount || 0), inline: true },
            { name: "Keterangan", value: r.note || "-", inline: false }
          )
          .setFooter({ text: `Record ID: ${r.id}` })
          .setTimestamp();

        await sendTo("log_payroll", embed, []);
      }
    )
    .subscribe(s => console.log("payroll realtime:", s));
}

function watchPendingUsers() {
  supabase
    .channel("profiles-watch")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "profiles" },
      async p => {
        const r = p.new;

        const embed = new EmbedBuilder()
          .setTitle("👤 USER BARU MENUNGGU ACC")
          .setColor(0xffd400)
          .addFields(
            { name: "Nama", value: r.display_name || "-", inline: true },
            { name: "Discord ID", value: r.discord_id || "-", inline: true },
            { name: "Status", value: r.status || "-", inline: true }
          )
          .setFooter({ text: `User ID: ${r.id}` })
          .setTimestamp();

        const row = [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`approve_user:${r.id}`)
              .setLabel("ACC CASIS")
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId(`reject_user:${r.id}`)
              .setLabel("TOLAK")
              .setStyle(ButtonStyle.Danger)
          )
        ];

        await sendTo("log_verifikasi_user", embed, []);
      }
    )
    .subscribe(s => console.log("profiles realtime:", s));
}

function watchBotEvents() {
  supabase
    .channel("bot-events-watch")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bot_events" },
      async p => {
        const ev = p.new;
        const payload = ev.payload || {};

        if (ev.event_type === "SYNC_DISCORD_PROFILE") {
          const discordId = String(payload.discord_id || "").trim();
          const profileId = payload.profile_id;

          try {
            if (!discordId) throw new Error("discord_id kosong.");
            if (!profileId) throw new Error("profile_id kosong.");

            const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
            const member = await guild.members.fetch(discordId);

            const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256, forceStatic: false });
            const serverName = member.displayName || member.nickname || member.user.globalName || member.user.username;
            const nickName = member.nickname || member.displayName || member.user.globalName || member.user.username;

            const { data: updated, error: updateError } = await supabase
              .from("profiles")
              .update({
                display_name: serverName,
                discord_username: member.user.username,
                server_nickname: serverName,
                discord_nickname: nickName,
                avatar_url: avatarUrl,
                discord_last_sync: new Date().toISOString()
              })
              .eq("id", profileId)
              .select("id, display_name, server_nickname, discord_nickname, discord_username, avatar_url")
              .maybeSingle();

            if (updateError) throw updateError;
            if (!updated) throw new Error(`Profile ID ${profileId} tidak ditemukan / tidak terupdate.`);

            await createAuditLog("BOT", "SYNC_DISCORD_PROFILE", "profiles", profileId, {
              discord_id: discordId,
              username: member.user.username,
              server_nickname: serverName,
              discord_nickname: nickName,
              avatar_url: avatarUrl
            });

            await sendTo(
              "log_audit",
              new EmbedBuilder()
                .setTitle("🔄 DISCORD PROFILE SYNC")
                .setColor(0x2563eb)
                .setDescription("Profil Discord berhasil disinkronkan ke Website Mayday MDT.")
                .addFields(
                  { name: "Profile ID", value: String(profileId || "-"), inline: true },
                  { name: "Discord", value: member.user.tag || member.user.username, inline: true },
                  { name: "Nickname Server", value: serverName || "-", inline: true },
                  { name: "Username", value: member.user.username || "-", inline: true }
                )
                .setThumbnail(avatarUrl)
                .setTimestamp(),
              []
            );

            await supabase.from("bot_events").update({ status: "DONE", processed_at: new Date().toISOString(), error_message: null }).eq("id", ev.id);
            return;
          } catch (err) {
            console.log("SYNC_DISCORD_PROFILE error:", err.message);

            await sendTo(
              "log_audit",
              new EmbedBuilder()
                .setTitle("❌ DISCORD PROFILE SYNC GAGAL")
                .setColor(0xef4444)
                .addFields(
                  { name: "Profile ID", value: String(profileId || "-"), inline: true },
                  { name: "Discord ID", value: String(discordId || "-"), inline: true },
                  { name: "Error", value: String(err.message || "-"), inline: false }
                )
                .setTimestamp(),
              []
            );

            await supabase.from("bot_events").update({ status: "ERROR", processed_at: new Date().toISOString(), error_message: err.message }).eq("id", ev.id);
            return;
          }
        }

        let title = "📡 MAYDAY MDT EVENT";
        let color = 0x2563eb;
        const targetKey = "log_audit";

        if (ev.event_type === "ATTENDANCE_DELETED") { title = "ABSENSI DIHAPUS"; color = 0xef4444; }
        if (ev.event_type === "REPORT_DELETED") { title = "LAPORAN DIHAPUS"; color = 0xef4444; }
        if (ev.event_type === "PAYROLL_PAID") { title = "PAYROLL DIBAYAR"; color = 0x22c55e; }
        if (ev.event_type === "PROMOTION_REQUESTED") { title = "PENGAJUAN KENAIKAN PANGKAT"; color = 0xf59e0b; }
        if (ev.event_type === "MEMBER_UPDATED") { title = "DATA ANGGOTA DIPERBARUI"; color = 0x2563eb; }

        if (ev.event_type === "ATTENDANCE_APPROVED") { const kind = String(payload.type || "ABSENSI").toUpperCase(); title = kind === "ABSENSI" ? "✅ ABSENSI DI-ACC" : `✅ ${kind} DI-ACC`; color = 0x22c55e; }
        if (ev.event_type === "ATTENDANCE_REJECTED") { const kind = String(payload.type || "ABSENSI").toUpperCase(); title = kind === "ABSENSI" ? "❌ ABSENSI DITOLAK" : `❌ ${kind} DITOLAK`; color = 0xef4444; }
        if (ev.event_type === "MEMBER_DELETED") { title = "🗑️ ANGGOTA DIHAPUS"; color = 0xef4444; }
        if (ev.event_type === "SP_DELETED") { title = "🗑️ SP / PTDH DIHAPUS"; color = 0xf97316; }
        if (ev.event_type === "USER_APPROVED") { title = "✅ USER DI-ACC"; color = 0x22c55e; }
        if (ev.event_type === "USER_REJECTED") { title = "❌ USER DITOLAK"; color = 0xef4444; }
        if (ev.event_type === "REPORT_APPROVED") { title = "✅ LAPORAN DI-ACC"; color = 0x22c55e; }
        if (ev.event_type === "REPORT_REJECTED") { title = "❌ LAPORAN DITOLAK"; color = 0xef4444; }
        if (ev.event_type === "REPORT_ARCHIVED") { title = "📁 LAPORAN DIARSIPKAN"; color = 0x2563eb; }
        if (ev.event_type === "REPORT_MONTH_ARCHIVED") { title = "📁 ARSIP LAPORAN BULANAN"; color = 0x2563eb; }
        if (ev.event_type === "REPORT_MONTH_DELETED") { title = "🗑️ ARSIP BULANAN DIHAPUS"; color = 0xef4444; }
        if (ev.event_type === "PAYROLL_APPROVED") { title = "✅ PAYROLL DI-ACC"; color = 0x22c55e; }
        if (ev.event_type === "PAYROLL_REJECTED") { title = "❌ PAYROLL DITOLAK"; color = 0xef4444; }
        if (ev.event_type === "PROMOTION_APPROVED") { title = "✅ KENAIKAN PANGKAT DI-ACC"; color = 0x22c55e; }
        if (ev.event_type === "PROMOTION_REJECTED") { title = "❌ KENAIKAN PANGKAT DITOLAK"; color = 0xef4444; }

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor(color)
          .setDescription("Update dari Website Mayday MDT")
          .addFields(
            { name: "Record ID", value: String(payload.id || payload.profile_id || ev.id || "-"), inline: true },
            { name: "Nama", value: String(payload.nama || payload.name || payload.report?.nama || payload.row?.target_name || "-"), inline: true },
            { name: "Divisi", value: String(normalizeDivisi(payload.divisi || payload.division || payload.report?.divisi || "-")), inline: true },
            { name: "Jenis", value: String(payload.type || payload.report?.type || ev.event_type || "-"), inline: true },
            { name: "Diproses oleh", value: String(payload.approved_by || payload.deleted_by || payload.rejected_by || payload.archived_by || payload.requested_by || "-"), inline: true },
            { name: "Keterangan", value: String(payload.note || payload.reason || payload.row?.reason || payload.report?.status || "-"), inline: false }
          )
          .setTimestamp();

        await sendTo(targetKey, embed, []);
        await supabase.from("bot_events").update({ status: "DONE", processed_at: new Date().toISOString() }).eq("id", ev.id);
      }
    )
    .subscribe(s => console.log("bot_events realtime:", s));
}

async function createBotEvent(event_type, payload = {}) {
  try {
    const { error } = await supabase.from("bot_events").insert({
      event_type,
      payload,
      status: "PENDING"
    });

    if (error) console.log("createBotEvent error:", error.message);
  } catch (err) {
    console.log("createBotEvent failed:", err.message);
  }
}

async function createAuditLog(actor, action, target_type, target_id, metadata = {}) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      actor_name: actor,
      action,
      target_type,
      target_id: String(target_id || ""),
      metadata
    });

    if (error) console.log("createAuditLog error:", error.message);
  } catch (err) {
    console.log("createAuditLog failed:", err.message);
  }
}

async function syncPendingUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("status", "PENDING");

  if (error) {
    console.log("syncPendingUsers error:", error.message);
    return;
  }

  for (const r of data || []) {
    const embed = new EmbedBuilder()
      .setTitle("👤 USER PENDING BELUM DI-ACC")
      .setColor(0xffd400)
      .addFields(
        { name: "Nama", value: r.display_name || "-", inline: true },
        { name: "Discord ID", value: r.discord_id || "-", inline: true },
        { name: "Status", value: r.status || "-", inline: true }
      )
      .setFooter({ text: `User ID: ${r.id}` })
      .setTimestamp();

    const row = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_user:${r.id}`)
          .setLabel("ACC CASIS")
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`reject_user:${r.id}`)
          .setLabel("TOLAK")
          .setStyle(ButtonStyle.Danger)
      )
    ];

    await sendTo("log_verifikasi_user", embed, []);
  }

  console.log(`✅ Sync pending user: ${(data || []).length}`);
}

async function syncPendingAttendance() {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("status", "PENDING")
    .is("discord_message_id", null);

  if (error) {
    console.log("syncPendingAttendance error:", error.message);
    return;
  }

  for (const r of data || []) {
    const kind = String(r.type || "ABSENSI").toUpperCase();

    let embed;
    let key = "log_absensi";

    if (kind === "ABSENSI") {
      embed = new EmbedBuilder()
        .setTitle("📋 ABSENSI PENDING BELUM DIKIRIM")
        .setColor(0xffd400)
        .addFields(
          { name: "Nama", value: r.nama || "-", inline: true },
          { name: "Badge", value: r.badge_number || "NO BADGE", inline: true },
          { name: "Jabatan", value: r.jabatan || "-", inline: true },
          { name: "Divisi", value: normalizeDivisi(r.divisi), inline: true },
          { name: "Lokasi", value: r.location || "-", inline: true },
          { name: "Keterangan", value: r.note || "-", inline: false },
          { name: "Bukti", value: evidenceText(r), inline: false }
        )
        .setFooter({ text: `Record ID: ${r.id}` })
        .setTimestamp();
    } else if (kind === "IZIN" || kind === "CUTI") {
      key = "log_izin_cuti";
      const tanggalMulai = r.leave_start_date || "-";
      const tanggalAkhir = r.leave_end_date || r.leave_start_date || "-";

      embed = new EmbedBuilder()
        .setColor(0xfbbf24)
        .setDescription(
`<@&1491453968138895431>

**SURAT PERMOHONAN IZIN KEPOLISIAN MAYDAY**
\`\`\`
Dengan hormat bapak JENDRAL/KOMJEN.

Dengan ini saya : ${kind}

Nama      : ${r.nama || "-"}
Pangkat  : ${normalizeRank(r.rank_detail || r.jabatan || "-")}
Satuan   : ${normalizeDivisi(r.divisi || "-")}
Alasan   : ${r.note || "-"}

Tanggal Izin      : ${tanggalMulai}
Tanggal berakhir  : ${tanggalAkhir}

Demikian surat permohonan izin ini kami sampaikan agar para petinggi dapat memaklumkan dan saya ucapkan terimakasih.
\`\`\``)
        .addFields(
          { name: "Bukti", value: evidenceText(r), inline: false },
          { name: "Catatan", value: "ACC / TOLAK hanya lewat Website MDT.", inline: false }
        )
        .setFooter({ text: `Record ID: ${r.id}` })
        .setTimestamp();
    } else {
      key = "log_izin_cuti";
      embed = new EmbedBuilder()
        .setTitle(`📋 ${kind} PENDING BELUM DIKIRIM`)
        .setColor(0xffd400)
        .addFields(
          { name: "Nama", value: r.nama || "-", inline: true },
          { name: "Badge", value: r.badge_number || "NO BADGE", inline: true },
          { name: "Jabatan", value: r.jabatan || "-", inline: true },
          { name: "Divisi", value: normalizeDivisi(r.divisi), inline: true },
          { name: "Status", value: r.type || "-", inline: true },
          { name: "Lokasi", value: r.location || "-", inline: true },
          { name: "Keterangan", value: r.note || "-", inline: false },
          { name: "Bukti", value: evidenceText(r), inline: false }
        )
        .setFooter({ text: `Record ID: ${r.id}` })
        .setTimestamp();
    }

    if (r.evidence_url) embed.setImage(r.evidence_url);

    const msg = await sendTo(key, embed, []);
    if (!msg) continue;

    await supabase
      .from("attendance")
      .update({ discord_message_id: msg.id })
      .eq("id", r.id);
  }

  console.log(`✅ Sync pending absensi: ${(data || []).length}`);
}

client.login(process.env.DISCORD_BOT_TOKEN);
