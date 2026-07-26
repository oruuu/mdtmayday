// src/components/personalCharges.js
import { PersonalChargesService } from '../services/personalChargesService.js';

export function personalChargesPage() {
  return `
    <main class="app">
      <section class="card">
        <h2>PERSONAL CHARGES</h2>
        <p class="mini">Riwayat kriminal warga (berdasarkan Arrest Reports yang disetujui)</p>

        <div class="pc-search">
          <div class="pc-search-row">
            <input id="pc_q_nama" class="pc-input" placeholder="Nama IC (realtime search)" />
            <input id="pc_q_citizen" class="pc-input" placeholder="Citizen ID" />
            <input id="pc_q_phone" class="pc-input" placeholder="Nomor Telepon" />
            <input id="pc_q_discord" class="pc-input" placeholder="Discord ID" />
            <button id="pc_search_btn" class="btn small blue">CARI</button>
          </div>
        </div>

        <div id="pc_results" class="pc-results">
          <div class="pc-cards" id="pc_cards_container"></div>
        </div>
      </section>
    </main>
  `;
}

let pcSearchTimeout = null;

function debounce(fn, ms = 300) {
  if (pcSearchTimeout) clearTimeout(pcSearchTimeout);
  pcSearchTimeout = setTimeout(fn, ms);
}

export function mountPersonalCharges(appEl) {
  const btn = document.getElementById('pc_search_btn');
  const inputs = ['pc_q_nama','pc_q_citizen','pc_q_phone','pc_q_discord'].map(id => document.getElementById(id));

  async function doSearch() {
    const qNama = document.getElementById('pc_q_nama').value.trim();
    const qCitizen = document.getElementById('pc_q_citizen').value.trim();
    const qPhone = document.getElementById('pc_q_phone').value.trim();
    const qDiscord = document.getElementById('pc_q_discord').value.trim();

    const payload = { qNama, qCitizenId: qCitizen, qPhone, qDiscordId: qDiscord };

    debounce(async () => {
      try {
        document.getElementById('pc_cards_container').innerHTML = `<div class="mini">Mencari...</div>`;
        const items = await PersonalChargesService.search(payload);
        renderSearchResults(items);
      } catch (e) {
        console.error('Search error', e);
        document.getElementById('pc_cards_container').innerHTML = `<div class="error">Terjadi kesalahan saat mencari</div>`;
      }
    }, 300);
  }

  inputs.forEach(i => i && i.addEventListener('input', doSearch));
  btn && btn.addEventListener('click', doSearch);

  document.getElementById('pc_cards_container').innerHTML = `<div class="mini">Gunakan kotak pencarian untuk menemukan warga.</div>`;
}

function renderSearchResults(items) {
  const container = document.getElementById('pc_cards_container');
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="empty">Tidak ada hasil.</div>`;
    return;
  }

  container.innerHTML = items.map(it => cardFor(it)).join('\n');

  items.forEach(it => {
    const el = document.getElementById(`pc_detail_${escapeId(it.citizen_id)}`);
    if (el) {
      el.addEventListener('click', async () => {
        await showDetails(it.citizen_id);
      });
    }
  });
}

function escapeId(s) { return String(s).replace(/[^a-z0-9_-]/gi, '_'); }

function cardFor(it) {
  const statusBadge = badgeFor(it.last_status);
  const photo = it.photo_url ? `<img src="${e(it.photo_url)}" alt="foto" class="pc-photo">` : `<div class="pc-photo placeholder">No Photo</div>`;
  return `
    <div class="pc-card">
      <div class="pc-card-left">${photo}</div>
      <div class="pc-card-body">
        <div class="pc-card-title">${e(it.nama || '-')}</div>
        <div class="pc-card-meta">Citizen ID: ${e(it.citizen_id || '-') } • Tel: ${e(it.phone || '-')}</div>
        <div class="pc-card-stats">
          <span class="pc-stat">Penangkapan: <strong>${it.arrests_count}</strong></span>
          <span class="pc-stat">Kasus: <strong>${it.cases_count}</strong></span>
          <span class="pc-stat">Terakhir: <strong>${it.last_arrest_at ? new Date(it.last_arrest_at).toLocaleString() : '-'}</strong></span>
          <span class="pc-badge">${statusBadge}</span>
        </div>
        <div class="pc-card-actions"><button id="pc_detail_${escapeId(it.citizen_id)}" class="btn small">Lihat Detail</button></div>
      </div>
    </div>
  `;
}

function badgeFor(status) {
  if (!status) return `<span class="badge muted">UNKNOWN</span>`;
  const s = String(status).toUpperCase();
  switch(s) {
    case 'ACTIVE': return `<span class="badge badge-active">ACTIVE</span>`;
    case 'RELEASED': return `<span class="badge badge-released">RELEASED</span>`;
    case 'WANTED': return `<span class="badge badge-wanted">WANTED</span>`;
    case 'CLEARED': return `<span class="badge badge-cleared">CLEARED</span>`;
    default: return `<span class="badge">${e(status)}</span>`;
  }
}

function e(v) { return String(v ?? '').replace(/[&<>\
