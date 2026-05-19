import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

const TYPE_BADGE   = { blog:'badge-blue', radio:'badge-gold', editorial:'badge-green', podcast:'badge-blue', playlist:'badge-green', tv:'badge-pink', other:'badge-dim' };
const STATUS_BADGE = { sent:'badge-blue', pending:'badge-gold', covered:'badge-green', declined:'badge-pink' };

export async function renderPress(container, { profile }) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const [{ data: pitches, error }, { data: releases }] = await Promise.all([
    supabase.from('press_pitches').select('*, releases(title)').order('sent_at', { ascending: false }),
    supabase.from('releases').select('id, title').order('title'),
  ]);

  if (error) { container.innerHTML = `<p style="color:var(--a2)">${error.message}</p>`; return; }

  const total   = pitches?.length || 0;
  const covered = (pitches || []).filter(p => p.status === 'covered').length;
  const pending = (pitches || []).filter(p => p.status === 'sent' || p.status === 'pending').length;
  const rate    = total > 0 ? Math.round((covered / total) * 100) : 0;

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>Press &amp; Radio</h1>
        <p>Media outreach tracker</p>
      </div>
      <button class="btn btn-primary" id="add-press">+ Add Pitch</button>
    </div>
    <div class="stat-grid" style="margin-bottom:28px">
      <div class="stat-card">
        <div class="stat-val">${total}</div>
        <div class="stat-label">Total Pitches</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:var(--a)">${covered}</div>
        <div class="stat-label">Covered</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-val">${pending}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-val">${rate}%</div>
        <div class="stat-label">Coverage Rate</div>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">All Press Pitches</span>
        <select id="type-filter" style="background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-pill);padding:6px 12px;color:var(--t);font-family:var(--mono);font-size:11px;outline:none;cursor:pointer">
          <option value="">All Types</option>
          ${['blog','radio','editorial','podcast','playlist','tv','other'].map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Release</th><th>Outlet</th><th>Type</th><th>Contact</th>
          <th>Status</th><th>Coverage</th><th></th>
        </tr></thead>
        <tbody id="press-rows">
          ${renderRows(pitches || [])}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#add-press')?.addEventListener('click', () => {
    openPressModal(null, releases || [], () => renderPress(container, { profile }));
  });

  container.querySelector('#type-filter')?.addEventListener('change', e => {
    const filtered = e.target.value ? (pitches || []).filter(p => p.type === e.target.value) : (pitches || []);
    container.querySelector('#press-rows').innerHTML = renderRows(filtered);
    bindActions(container, releases || [], pitches || [], () => renderPress(container, { profile }));
  });

  bindActions(container, releases || [], pitches || [], () => renderPress(container, { profile }));
}

function renderRows(pitches) {
  if (!pitches.length) return `<tr class="empty-row"><td colspan="8">No press pitches yet</td></tr>`;
  return pitches.map(p => `
    <tr>
      <td class="td-mono" style="color:var(--t3);font-size:11px">${p.sent_at || '—'}</td>
      <td style="font-size:12px">${p.releases?.title || '—'}</td>
      <td><strong>${p.outlet}</strong></td>
      <td><span class="badge ${TYPE_BADGE[p.type] || 'badge-dim'}">${p.type}</span></td>
      <td style="color:var(--t3);font-size:12px">${p.contact || '—'}</td>
      <td><span class="badge ${STATUS_BADGE[p.status] || 'badge-dim'}">${p.status}</span></td>
      <td>${p.coverage_url ? `<a href="${p.coverage_url}" target="_blank" class="link" style="font-size:11px">View ↗</a>` : '—'}</td>
      <td class="td-actions">
        <button class="btn btn-ghost btn-sm btn-icon edit-press" data-id="${p.id}" title="Edit">✎</button>
        <button class="btn btn-danger btn-sm btn-icon del-press" data-id="${p.id}" title="Delete">✕</button>
      </td>
    </tr>
  `).join('');
}

function bindActions(container, releases, pitches, onRefresh) {
  container.querySelectorAll('.edit-press').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const p = pitches.find(x => x.id === btn.dataset.id);
      if (p) openPressModal(p, releases, onRefresh);
    });
  });
  container.querySelectorAll('.del-press').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this pitch?')) return;
      const { error } = await supabase.from('press_pitches').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Pitch deleted'); onRefresh(); }
    });
  });
}

function openPressModal(pitch, releases, onSave) {
  const isEdit = !!pitch;
  const body = openModal({
    title: isEdit ? 'Edit Press Pitch' : 'Add Press Pitch',
    body: `
      <form id="press-form">
        <div class="form-row cols-2">
          <div class="field"><label>Release *</label>
            <select name="release_id" required>
              <option value="">Select release…</option>
              ${releases.map(r => `<option value="${r.id}" ${pitch?.release_id === r.id ? 'selected' : ''}>${r.title}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Type</label>
            <select name="type">
              ${['blog','radio','editorial','podcast','playlist','tv','other'].map(t => `<option value="${t}" ${pitch?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Outlet *</label>
            <input name="outlet" required placeholder="Pitchfork, Hot 97, KEXP…" value="${pitch?.outlet || ''}">
          </div>
          <div class="field"><label>Contact</label>
            <input name="contact" placeholder="editor@outlet.com" value="${pitch?.contact || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Status</label>
            <select name="status">
              ${['sent','pending','covered','declined'].map(s => `<option value="${s}" ${pitch?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Date Sent</label>
            <input name="sent_at" type="date" value="${pitch?.sent_at || new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Coverage URL</label>
            <input name="coverage_url" placeholder="https://…" value="${pitch?.coverage_url || ''}">
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Notes</label>
            <textarea name="notes" rows="2">${pitch?.notes || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="press-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add Pitch'}</button>
        </div>
      </form>
    `,
  });
  body.querySelector('#press-cancel').addEventListener('click', closeModal);
  body.querySelector('#press-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      release_id:   fd.get('release_id'),
      outlet:       fd.get('outlet'),
      type:         fd.get('type'),
      contact:      fd.get('contact') || null,
      status:       fd.get('status'),
      sent_at:      fd.get('sent_at') || null,
      coverage_url: fd.get('coverage_url') || null,
      notes:        fd.get('notes') || null,
    };
    const { error } = isEdit
      ? await supabase.from('press_pitches').update(payload).eq('id', pitch.id)
      : await supabase.from('press_pitches').insert(payload);
    if (error) toast(error.message, 'error');
    else { toast(isEdit ? 'Pitch updated' : 'Pitch added'); closeModal(); onSave(); }
  });
}
