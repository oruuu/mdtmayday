// src/components/personalCharges.js
import { PersonalChargesService } from '../services/personalChargesService.js';

export function personalChargesPage(){
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
function debounce(fn, ms = 300){
  if(pcSearchTimeout) clearTimeout(pcSearchTimeout);
  pcSearchTimeout = setTimeout(fn, ms);
}

export function mountPersonalCharges(appEl = document){
  const btn = appEl.getElementById('pc_search_btn');
  const inputs = ['pc_q_nama','pc_q_citizen','pc_q_phone','pc_q_discord'].map(id => appEl.getElementById(id));

  async function doSearch(){
    const qNama = appEl.getElementById('pc_q_nama')?.value.trim() || '';
    const qCitizen = appEl.getElementById('pc_q_citizen')?.value.trim() || '';
    const qPhone = appEl.getElementById('pc_q_phone')?.value.trim() || '';
    const qDiscord = appEl.getElementById('pc_q_discord')?.value.trim() || '';

    const payload = { qNama, qCitizenId: qCitizen, qPhone, qDiscordId: qDiscord };

    debounce(async () => {
      try{
        const container = appEl.getElementById('pc_cards_container');
        container.innerHTML = `<div class="mini">Mencari...</div>`;
        const items = await PersonalChargesService.search(payload);
        renderSearchResults(items);
      }catch(e){
        console.error('Search error', e);
        const container = appEl.getElementById('pc_cards_container');
        container.innerHTML = `<div class="error">Terjadi kesalahan saat mencari</div>`;
      }
    }, 300);
  }

  inputs.forEach(i => i && i.addEventListener('input', doSearch));
  btn && btn.addEventListener('click', doSearch);

  const container = appEl.getElementById('pc_cards_container');
  if(container) container.innerHTML = `<div class="mini">Gunakan kotak pencarian untuk menemukan warga.</div>`;
}

function renderSearchResults(items){
  const container = document.getElementById('pc_cards_container');
  if(!container) return; 
  if(!items || items.length === 0){
    container.innerHTML = `<div class="empty">Tidak ada hasil.</div>`;
    return;
  }

  container.innerHTML = items.map(it => cardFor(it)).join('\n');

  items.forEach(it => {
    const el = document.getElementById(`pc_detail_${escapeId(it.citizen_id)}`);
    if(el) el.addEventListener('click', async () => { await showDetails(it.citizen_id); });
  });
}

function escapeId(s){ return String(s || '').replace(/[^a-z0-9_-]/gi, '_'); }

function cardFor(it){
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

function badgeFor(status){
  if(!status) return `<span class="badge muted">UNKNOWN</span>`;
  const s = String(status).toUpperCase();
  switch(s){
    case 'ACTIVE': return `<span class="badge badge-active">ACTIVE</span>`;
    case 'RELEASED': return `<span class="badge badge-released">RELEASED</span>`;
    case 'WANTED': return `<span class="badge badge-wanted">WANTED</span>`;
    case 'CLEARED': return `<span class="badge badge-cleared">CLEARED</span>`;
    default: return `<span class="badge">${e(status)}</span>`;
  }
}

function e(v){ return String(v ?? '').replace(/[&<>\"]+/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;' }[m] || m)); }

async function showDetails(citizen_id){
  const existing = document.getElementById('pc_detail_modal');
  if(existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pc_detail_modal';
  modal.className = 'modal';
  modal.style.zIndex = 9999;
  modal.innerHTML = `<div class="modal-panel"><button class="modal-close" id="pc_modal_close">&times;</button><div id="pc_modal_content"><div class="mini">Memuat detail...</div></div></div>`;
  document.body.appendChild(modal);

  document.getElementById('pc_modal_close').addEventListener('click', () => modal.remove());

  try{
    const { personal, reports } = await PersonalChargesService.getDetails(citizen_id);
    const content = document.getElementById('pc_modal_content');
    const p = personal || {};

    const rowsHtml = (reports || []).map(r => {
      const payload = r.payload || {};
      const law = payload.law || payload.pasal || '-';
      const sentence = payload.sentence || payload.duration || r.payload?.duration || '-';
      const fine = payload.fine || '-';
      const evidence = (r.evidence_urls || r.evidence_url) ? (Array.isArray(r.evidence_urls) ? r.evidence_urls.join(', ') : r.evidence_url) : '-';
      return `<tr>
        <td>${e(r.id)}</td>
        <td>${r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
        <td>${e(r.nama || r.approved_by || '-')}</td>
        <td>${e(law)}</td>
        <td>${e(sentence)}</td>
        <td>${e(fine)}</td>
        <td>${e(evidence)}</td>
        <td>${badgeFor(r.status)}</td>
        <td>${e(r.approval_note || r.reject_reason || r.payload?.summary || r.payload?.chronology || '-')}</td>
      </tr>`;
    }).join('');

    const html = `
      <div class="pc-detail">
        <div class="pc-detail-header" style="display:flex;gap:12px;align-items:flex-start">
          <div class="pc-detail-photo">${p.photo_url ? `<img src="${e(p.photo_url)}" style="width:140px;height:140px;object-fit:cover;border-radius:8px"/>` : '<div style="width:140px;height:140px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center">No Photo</div>'}</div>
          <div style="flex:1">
            <h3 style="margin-top:0">${e(p.nama || '-')}</h3>
            <div>Citizen ID: <strong>${e(p.citizen_id || '-')}</strong></div>
            <div>Phone: ${e(p.phone || '-')}</div>
            <div>Alamat: ${e(p.address || '-')}</div>
            <div>Jenis Kelamin: ${e(p.gender || '-')}</div>
            <div>Tanggal Lahir: ${p.birth_date ? new Date(p.birth_date).toLocaleDateString() : '-'}</div>
            <div>Pekerjaan: ${e(p.job || '-')}</div>
            <div>Jumlah Penangkapan: <strong>${p.arrests_count || 0}</strong></div>
            <div>Jumlah Kasus: <strong>${p.cases_count || 0}</strong></div>
            <div>Status Terakhir: ${badgeFor(p.last_status)}</div>
            <div>Tanggal Penangkapan Terakhir: ${p.last_arrest_at ? new Date(p.last_arrest_at).toLocaleString() : '-'}</div>
          </div>
        </div>

        <div style="margin-top:14px">
          <h4>Riwayat Kriminal</h4>
          <div style="overflow:auto">
            <table class="pc-table" style="width:100%;border-collapse:collapse">
              <thead><tr>
                <th>Nomor Laporan</th><th>Tanggal</th><th>Petugas</th><th>Pasal</th><th>Hukuman</th><th>Denda</th><th>Barang Bukti</th><th>Status</th><th>Catatan</th>
              </tr></thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="9" class="empty">Belum ada riwayat kriminal ditemukan.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top:12px;text-align:right"><button class="btn" id="pc_modal_close_btn">TUTUP</button></div>
      </div>
    `;

    content.innerHTML = html;
    document.getElementById('pc_modal_close_btn').addEventListener('click', () => modal.remove());
    document.getElementById('pc_modal_close').addEventListener('click', () => modal.remove());
  }catch(err){
    const content = document.getElementById('pc_modal_content');
    content.innerHTML = `<div class="error">Tidak dapat memuat detail: ${e(err.message || err)}</div>`;
  }
}
