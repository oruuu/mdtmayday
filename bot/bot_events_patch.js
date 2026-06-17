// Tambahkan ke bot/index.js agar notifikasi Discord jalan saat ACC/Tolak Absensi dari web.
// Paste function ini ke bawah, lalu panggil watchBotEvents() di dalam ClientReady.

function watchBotEvents(){
  supabase.channel("bot-events-watch")
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"bot_events" }, async p => {
      const ev = p.new;
      const payload = ev.payload || {};

      let title = "📡 MAYDAY MDT EVENT";
      let color = 0x2563eb;
      let targetKey = "audit_log";

      if(ev.event_type === "ATTENDANCE_APPROVED"){
        title = "✅ ABSENSI DI-ACC";
        color = 0x22c55e;
        targetKey = `absensi_${String(payload.divisi || "CASIS").toLowerCase()}`;
      }

      if(ev.event_type === "ATTENDANCE_REJECTED"){
        title = "❌ ABSENSI DITOLAK";
        color = 0xef4444;
        targetKey = `absensi_${String(payload.divisi || "CASIS").toLowerCase()}`;
      }

      if(ev.event_type === "SP_DELETED"){
        title = "🗑️ SP / PTDH DIHAPUS";
        color = 0xf97316;
        targetKey = "propam_log";
      }

      if(ev.event_type === "USER_APPROVED"){
        title = "✅ USER DI-ACC";
        color = 0x22c55e;
        targetKey = "verifikasi_user";
      }

      if(ev.event_type === "USER_REJECTED"){
        title = "❌ USER DITOLAK";
        color = 0xef4444;
        targetKey = "verifikasi_user";
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setDescription("Update dari Website Mayday MDT")
        .addFields(
          { name:"Record ID", value:String(payload.id || ev.id || "-"), inline:true },
          { name:"Nama", value:String(payload.nama || payload.row?.target_name || "-"), inline:true },
          { name:"Divisi", value:String(payload.divisi || "-"), inline:true },
          { name:"Diproses oleh", value:String(payload.approved_by || payload.deleted_by || payload.rejected_by || "-"), inline:true },
          { name:"Keterangan", value:String(payload.note || payload.reason || payload.row?.reason || "-"), inline:false }
        )
        .setTimestamp();

      await sendTo(targetKey, embed, []);
      await supabase.from("bot_events").update({
        status:"DONE",
        processed_at:new Date().toISOString()
      }).eq("id", ev.id);
    })
    .subscribe(s => console.log("bot_events realtime:", s));
}

// Di ClientReady tambahkan baris ini:
// watchBotEvents();
