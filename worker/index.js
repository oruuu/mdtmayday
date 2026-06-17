export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return json({ ok: true });

    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, service: "Mayday Police MDT API" });
      }

      if (url.pathname === "/api/settings" && request.method === "POST") {
        await requireBotSecret(request, env);
        const body = await request.json();
        await env.DB.prepare(`
          INSERT INTO guild_settings (guild_id, setting_key, setting_value, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(guild_id, setting_key)
          DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
        `).bind(body.guild_id, body.key, body.value).run();

        return json({ ok: true });
      }

      if (url.pathname === "/api/settings" && request.method === "GET") {
        const guildId = url.searchParams.get("guild_id");
        const rows = await env.DB.prepare("SELECT setting_key, setting_value FROM guild_settings WHERE guild_id = ?")
          .bind(guildId).all();
        return json({ ok: true, settings: rows.results || [] });
      }

      if (url.pathname === "/api/absensi" && request.method === "POST") {
        const body = await request.json();
        const guildId = body.guild_id || env.DEFAULT_GUILD_ID || "default";
        const insert = await env.DB.prepare(`
          INSERT INTO attendance (guild_id, discord_id, nama, jabatan, divisi, type, note, evidence_url, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `).bind(
          guildId,
          body.discord_id || "",
          body.nama || "-",
          body.jabatan || "-",
          body.divisi || "CASIS",
          body.type || "HADIR",
          body.note || "-",
          body.evidence_url || ""
        ).run();

        const recordId = insert.meta.last_row_id;
        const botPayload = {
          type: "attendance_created",
          record_id: recordId,
          guild_id: guildId,
          data: { ...body, id: recordId }
        };

        await notifyBot(env, botPayload);
        return json({ ok: true, id: recordId, status: "PENDING" });
      }

      if (url.pathname === "/api/approval" && request.method === "POST") {
        await requireBotSecret(request, env);
        const body = await request.json();
        const table = body.type === "absensi" ? "attendance" : null;
        if (!table) return json({ error: "Invalid approval type" }, 400);

        await env.DB.prepare(`UPDATE ${table} SET status = ?, approved_by = ? WHERE id = ?`)
          .bind(body.status, body.approved_by || "", body.record_id).run();

        await env.DB.prepare(`
          INSERT INTO audit_logs (guild_id, actor_discord_id, action, target_type, target_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          body.guild_id || "default",
          body.approved_by || "",
          `${body.status}_${body.type}`.toUpperCase(),
          body.type,
          String(body.record_id),
          JSON.stringify(body)
        ).run();

        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bot-Secret"
    }
  });
}

async function requireBotSecret(request, env) {
  const secret = request.headers.get("X-Bot-Secret");
  if (!env.BOT_API_SECRET || secret !== env.BOT_API_SECRET) {
    throw new Error("Unauthorized bot request");
  }
}

async function notifyBot(env, payload) {
  if (!env.BOT_WEBHOOK_URL) return;
  const res = await fetch(env.BOT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bot-Secret": env.BOT_API_SECRET || ""
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    console.log("Bot notify failed", res.status);
  }
}
