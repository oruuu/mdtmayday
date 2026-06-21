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
        const key = kind === "ABSENSI" ? "log_absensi" : "log_izin_cuti";

        const embed = new EmbedBuilder()
          .setTitle(kind === "ABSENSI" ? "ABSENSI ANGGOTA" : `PENGAJUAN ${kind}`)
          .setColor(0x22c55e)
          .addFields(
            { name: "Nama", value: r.nama || "-", inline: true },
            { name: "Badge", value: r.badge_number || "NO BADGE", inline: true },
            { name: "Jabatan", value: r.jabatan || "-", inline: true },
            { name: "Divisi", value: r.divisi || "-", inline: true },
            { name: "Status", value: r.type || "-", inline: true },
            { name: "Lokasi", value: r.location || "-", inline: true },
            { name: "Keterangan", value: r.note || "-", inline: false },
            { name: "Bukti", value: evidenceText(r), inline: false },
            { name: "Catatan", value: "ACC / TOLAK hanya lewat Website MDT.", inline: false }
          )
          .setFooter({ text: `Record ID: ${r.id}` })
          .setTimestamp();

        if (r.evidence_url) embed.setImage(r.evidence_url);

        const msg = await sendTo(key, embed, []);
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

function reportTextBlock(row) {
  const p = row.payload || {};
  const type = row.type;

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
- Divisi                     : ${row.divisi || "-"}
- Pangkat                    : ${row.rank_detail || "-"}
- Jabatan                    : ${row.jabatan || "-"}
- Rekan                      : ${
Array.isArray(p.colleagues) && p.colleagues.length
? p.colleagues.map(id => {
    const m = S.members.find(x => Number(x.id) === Number(id));
    return m ? (m.discord_nickname || m.display_name) : id;
  }).join(", ")
: "-"
}
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
- Divisi                     : ${row.divisi || "-"}
- Pangkat                    : ${row.rank_detail || "-"}
- Jabatan                    : ${row.jabatan || "-"}

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
- Divisi                     : ${row.divisi || "-"}
- Pangkat                    : ${row.rank_detail || "-"}
- Jabatan                    : ${row.jabatan || "-"}

Note: Bukti kendaraan wajib diunggah melalui tombol lampiran media di bawah.`;
}

function reportDescription(row) {
  const title = `📁 **ARSIP LAPORAN BARU DITERIMA - KATEGORI: ${reportTypeLabel(row.type)}**`;
  const body = reportTextBlock(row);
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
          .setDescription(reportDescription(r))
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
          const discordId = payload.discord_id;
          const profileId = payload.profile_id;

          try {
            const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
            const member = await guild.members.fetch(discordId);

            const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256 });

            await supabase
              .from("profiles")
              .update({
                display_name: member.displayName || member.user.username,
                discord_username: member.user.username,
				server_nickname: member.displayName || member.user.username,
                discord_nickname: member.nickname || member.displayName || member.user.username,
                avatar_url: avatarUrl,
                discord_last_sync: new Date().toISOString()
              })
              .eq("id", profileId);

            await createAuditLog(
              "BOT",
              "SYNC_DISCORD_PROFILE",
              "profiles",
              profileId,
              {
                discord_id: discordId,
                username: member.user.username,
                nickname: member.nickname || "",
                display_name: member.displayName || ""
              }
            );

            await sendTo(
              "audit_log",
              new EmbedBuilder()
                .setTitle("🔄 DISCORD PROFILE SYNC")
                .setColor(0x2563eb)
                .addFields(
                  { name: "Profile ID", value: String(profileId || "-"), inline: true },
                  { name: "Discord", value: member.user.tag || member.user.username, inline: true },
                  { name: "Nickname Server", value: member.displayName || "-", inline: true }
                )
                .setThumbnail(avatarUrl)
                .setTimestamp(),
              []
            );

            await supabase
              .from("bot_events")
              .update({
                status: "DONE",
                processed_at: new Date().toISOString()
              })
              .eq("id", ev.id);

            return;
          } catch (err) {
            console.log("SYNC_DISCORD_PROFILE error:", err.message);

            await supabase
              .from("bot_events")
              .update({
                status: "ERROR",
                processed_at: new Date().toISOString(),
                error_message: err.message
              })
              .eq("id", ev.id);

            return;
          }
        }



        let title = "📡 MAYDAY MDT EVENT";
        let color = 0x2563eb;
        let targetKey = "log_audit";

        if (ev.event_type === "ATTENDANCE_APPROVED") {
          const kind = String(payload.type || "ABSENSI").toUpperCase();
          title = kind === "ABSENSI" ? "✅ ABSENSI DI-ACC" : `✅ ${kind} DI-ACC`;
          color = 0x22c55e;
          targetKey = kind === "ABSENSI" ? "log_absensi" : "log_izin_cuti";
        }

        if (ev.event_type === "ATTENDANCE_REJECTED") {
          const kind = String(payload.type || "ABSENSI").toUpperCase();
          title = kind === "ABSENSI" ? "❌ ABSENSI DITOLAK" : `❌ ${kind} DITOLAK`;
          color = 0xef4444;
          targetKey = kind === "ABSENSI" ? "log_absensi" : "log_izin_cuti";
        }

        if (ev.event_type === "MEMBER_DELETED") {
          title = "🗑️ ANGGOTA DIHAPUS";
          color = 0xef4444;
          targetKey = "log_audit";
        }

        if (ev.event_type === "SP_DELETED") {
          title = "🗑️ SP / PTDH DIHAPUS";
          color = 0xf97316;
          targetKey = "log_propam";
        }

        if (ev.event_type === "USER_APPROVED") {
          title = "✅ USER DI-ACC";
          color = 0x22c55e;
          targetKey = "log_verifikasi_user";
        }

        if (ev.event_type === "USER_REJECTED") {
          title = "❌ USER DITOLAK";
          color = 0xef4444;
          targetKey = "log_verifikasi_user";
        }

        if (ev.event_type === "REPORT_APPROVED") {
          title = "✅ LAPORAN DI-ACC";
          color = 0x22c55e;
          targetKey = "log_penangkapan";
        }

        if (ev.event_type === "REPORT_REJECTED") {
          title = "❌ LAPORAN DITOLAK";
          color = 0xef4444;
          targetKey = "log_penangkapan";
        }

        if (ev.event_type === "REPORT_ARCHIVED") {
          title = "📁 LAPORAN DIARSIPKAN";
          color = 0x2563eb;
          targetKey = "log_penangkapan";
        }

        if (ev.event_type === "REPORT_MONTH_ARCHIVED") {
          title = "📁 ARSIP LAPORAN BULANAN";
          color = 0x2563eb;
          targetKey = "log_penangkapan";
        }

        if (ev.event_type === "REPORT_MONTH_DELETED") {
          title = "ARSIP BULANAN DIHAPUS";
          color = 0xef4444;
          targetKey = "log_audit";
        }

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor(color)
          .setDescription("Update dari Website Mayday MDT")
          .addFields(
            { name: "Record ID", value: String(payload.id || ev.id || "-"), inline: true },
            { name: "Nama", value: String(payload.nama || payload.row?.target_name || "-"), inline: true },
            { name: "Divisi", value: String(payload.divisi || "-"), inline: true },
            { name: "Jenis", value: String(payload.type || "-"), inline: true },
            {
              name: "Diproses oleh",
              value: String(
                payload.approved_by ||
                  payload.deleted_by ||
                  payload.rejected_by ||
                  "-"
              ),
              inline: true
            },
            {
              name: "Keterangan",
              value: String(payload.note || payload.reason || payload.row?.reason || "-"),
              inline: false
            }
          )
          .setTimestamp();

        if (["REPORT_APPROVED","REPORT_REJECTED","REPORT_ARCHIVED"].includes(ev.event_type) && payload.type) {
          targetKey = reportLogKey(payload.type);
        }

        await sendTo(targetKey, embed, []);

        await supabase
          .from("bot_events")
          .update({
            status: "DONE",
            processed_at: new Date().toISOString()
          })
          .eq("id", ev.id);
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
    const key = kind === "ABSENSI" ? "log_absensi" : "log_izin_cuti";

    const embed = new EmbedBuilder()
      .setTitle(kind === "ABSENSI" ? "📋 ABSENSI PENDING BELUM DIKIRIM" : `📋 ${kind} PENDING BELUM DIKIRIM`)
      .setColor(0xffd400)
      .addFields(
        { name: "Nama", value: r.nama || "-", inline: true },
        { name: "Badge", value: r.badge_number || "NO BADGE", inline: true },
        { name: "Jabatan", value: r.jabatan || "-", inline: true },
        { name: "Divisi", value: r.divisi || "-", inline: true },
        { name: "Status", value: r.type || "-", inline: true },
        { name: "Lokasi", value: r.location || "-", inline: true },
        { name: "Keterangan", value: r.note || "-", inline: false },
        { name: "Bukti", value: evidenceText(r), inline: false }
      )
      .setFooter({ text: `Record ID: ${r.id}` })
      .setTimestamp();

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