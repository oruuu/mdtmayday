// src/services/personalChargesService.js
import { supabase } from '../supabase.js';

export const PersonalChargesService = {
  async authorize() {
    try {
      const { data, error } = await supabase
        .from('personal_charges')
        .select('citizen_id')
        .limit(1);

      if (error) {
        console.warn('personalCharges.authorize error', error);
        return { allowed: false, error };
      }
      return { allowed: true };
    } catch (e) {
      console.error('authorize exception', e);
      return { allowed: false, error: e };
    }
  },

  async search({ qNama, qCitizenId, qPhone, qDiscordId, limit = 20 } = {}) {
    // Build query
    let qb = supabase.from('personal_charges').select('*, report_ids').limit(limit);

    // Apply filters (Supabase JS doesn't allow dynamic where chaining easily; use query builder approach)
    const clauses = [];
    if (qNama) clauses.push({ col: 'nama', val: `%${qNama}%` });
    if (qCitizenId) clauses.push({ col: 'citizen_id', val: `%${qCitizenId}%` });
    if (qPhone) clauses.push({ col: 'phone', val: `%${qPhone}%` });

    // Start query with supabase.filter style
    try {
      if (qNama) qb = supabase.from('personal_charges').select('*, report_ids').ilike('nama', `%${qNama}%`).limit(limit);
      else if (qCitizenId) qb = supabase.from('personal_charges').select('*, report_ids').ilike('citizen_id', `%${qCitizenId}%`).limit(limit);
      else if (qPhone) qb = supabase.from('personal_charges').select('*, report_ids').ilike('phone', `%${qPhone}%`).limit(limit);
      else qb = supabase.from('personal_charges').select('*, report_ids').limit(limit);

      // Discord ID fallback: search reports that reference discord_id
      if (qDiscordId) {
        // fetch reports with discord_id and map to citizen_ids
        const { data: rdata, error: rerr } = await supabase.from('reports').select('citizen_id').ilike('payload::text', `%${qDiscordId}%`).limit(200);
        if (!rerr && rdata && rdata.length) {
          const cids = [...new Set(rdata.map(x => x.citizen_id).filter(Boolean))];
          if (cids.length) {
            const { data: pc, error: pcerr } = await supabase.from('personal_charges').select('*').in('citizen_id', cids).limit(limit);
            if (pcerr) throw pcerr;
            return pc || [];
          }
        }
      }

      const { data, error } = await qb.order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('search error', err);
      throw err;
    }
  },

  async getDetails(citizen_id) {
    const { data: pcData, error: pcError } = await supabase
      .from('personal_charges')
      .select('*')
      .eq('citizen_id', citizen_id)
      .maybeSingle();

    if (pcError) {
      console.error('getDetails pc error', pcError);
      throw pcError;
    }

    let reports = [];
    try {
      if (pcData && pcData.report_ids && Array.isArray(pcData.report_ids) && pcData.report_ids.length) {
        const ids = pcData.report_ids;
        const { data: r, error: rErr } = await supabase
          .from('reports')
          .select('*')
          .in('id', ids)
          .order('created_at', { ascending: false });
        if (rErr) console.warn('getDetails reports fetch warn', rErr);
        else reports = r || [];
      } else {
        const { data: r2, error: r2Err } = await supabase
          .from('reports')
          .select('*')
          .eq('citizen_id', citizen_id)
          .order('created_at', { ascending: false });
        if (r2Err) console.warn('getDetails fallback reports fetch warn', r2Err);
        else reports = r2 || [];
      }
    } catch (e) {
      console.warn('getDetails reports fetch exception', e);
    }

    return { personal: pcData, reports };
  },

  async getHistory(citizen_id, { limit = 50, offset = 0 } = {}) {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('type', 'ARREST')
      .eq('citizen_id', citizen_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  }
};
