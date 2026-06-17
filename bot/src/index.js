import "dotenv/config";
import http from "node:http";
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

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const WORKER_API_URL = process.env.WORKER_API_URL;
const WORKER_API_SECRET = process.env.WORKER_API_SECRET;
const PORT = Number(process.env.BOT_PORT || 3001);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const settingChoices = [
  "verifikasi_user",
  "laporan_operasi",
  "payroll",
  "audit_log",
  "propam_log",
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
    .setDescription("Set channel Mayday MDT")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName("tipe")
        .setDescription("Jenis channel yang ingin di-set")
        .setRequired(true)
        .addChoices(...settingChoices.map(v => ({ name: v, value: v })))
    )
    .addChannelOption(opt =>
      opt.setName("channel")
        .setDescription("Pilih channel Discord")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    ),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Lihat setting channel Mayday MDT")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("Slash commands registered.");
}

client.once(Events.ClientReady, async () => {
  console.log(`Mayday Police Bot online as ${client.user.tag}`);
  await registerCommands().catch(console.error);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        const tipe = interaction.options.getString("tipe", true);
        const channel = interaction.options.getChannel("channel", true);

        await workerPost("/settings", {
          guild_id: interaction.guildId,
          key: tipe,
          value: channel.id
        });

        return interaction.reply({
          content: `✅ Channel **${tipe}** berhasil di-set ke ${channel}.`,
          ephemeral: true
        });
      }

      if (interaction.commandName === "settings") {
        const data = await workerGet(`/settings?guild_id=${interaction.guildId}`);
        const desc = (data.settings || []).map(s => `• **${s.setting_key}** → <#${s.setting_value}>`).join("\n") || "Belum ada setting.";
        const embed = new EmbedBuilder()
          .setTitle("⚙️ MAYDAY MDT SETTINGS")
          .setDescription(desc)
          .setColor(0x2563eb);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      const [action, type, recordId] = interaction.customId.split(":");
      if (!["approve", "reject"].includes(action)) return;

      const status = action === "approve" ? "APPROVED" : "REJECTED";
      await workerPost("/approval", {
        guild_id: interaction.guildId,
        type,
        record_id: Number(recordId),
        status,
        approved_by: interaction.user.id
      });

      await interaction.update({
        content: `${status === "APPROVED" ? "✅" : "❌"} ${type.toUpperCase()} #${recordId} ${status} oleh ${interaction.user}.`,
        embeds: interaction.message.embeds,
        components: []
      });
    }
  } catch (err) {
    console.error(err);
    const msg = `❌ Error: ${err.message}`;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

async function handleWorkerEvent(payload) {
  if (payload.type === "attendance_created") {
    const guild = await client.guilds.fetch(payload.guild_id);
    const key = `absensi_${String(payload.data.divisi || "CASIS").toLowerCase()}`;
    const settings = await workerGet(`/settings?guild_id=${payload.guild_id}`);
    const channelId = findSetting(settings.settings, key) || findSetting(settings.settings, "audit_log");

    if (!channelId) {
      console.log("No Discord channel configured for", key);
      return;
    }

    const channel = await guild.channels.fetch(channelId);
    const data = payload.data;

    const embed = new EmbedBuilder()
      .setTitle("📋 ABSENSI ANGGOTA")
      .setColor(0x22c55e)
      .addFields(
        { name: "Nama", value: data.nama || "-", inline: true },
        { name: "Jabatan", value: data.jabatan || "-", inline: true },
        { name: "Divisi", value: data.divisi || "-", inline: true },
        { name: "Status", value: data.type || "HADIR", inline: true },
        { name: "Keterangan", value: data.note || "-", inline: false }
      )
      .setFooter({ text: `Record ID: ${payload.record_id}` })
      .setTimestamp();

    if (data.evidence_url) embed.setImage(data.evidence_url);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`approve:absensi:${payload.record_id}`).setLabel("ACC").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject:absensi:${payload.record_id}`).setLabel("TOLAK").setStyle(ButtonStyle.Danger)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });

    // Optional: create per-user thread inside division channel.
    try {
      await msg.startThread({
        name: `${data.nama || "Anggota"} - ${data.divisi || "DIVISI"}`,
        autoArchiveDuration: 10080
      });
    } catch {}
  }
}

function findSetting(settings, key) {
  return (settings || []).find(s => s.setting_key === key)?.setting_value;
}

async function workerPost(path, body) {
  const res = await fetch(`${WORKER_API_URL}/api${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bot-Secret": WORKER_API_SECRET
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function workerGet(path) {
  const res = await fetch(`${WORKER_API_URL}/api${path}`, {
    headers: { "X-Bot-Secret": WORKER_API_SECRET }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/worker-event") {
    res.writeHead(404);
    return res.end("Not found");
  }

  let raw = "";
  req.on("data", chunk => raw += chunk);
  req.on("end", async () => {
    try {
      if (req.headers["x-bot-secret"] !== WORKER_API_SECRET) {
        res.writeHead(401);
        return res.end("Unauthorized");
      }
      await handleWorkerEvent(JSON.parse(raw));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end(err.message);
    }
  });
}).listen(PORT, () => {
  console.log(`Bot HTTP listener on port ${PORT}`);
});

client.login(TOKEN);
