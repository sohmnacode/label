import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

const STATUS_BADGE = {
  pitched:  'badge-blue',
  accepted: 'badge-green',
  declined: 'badge-pink',
  pending:  'badge-gold',
};

const PLATFORMS = ['Spotify', 'Apple Music', 'Tidal', 'Amazon Music', 'YouTube Music', 'Pandora', 'Sync / TV', 'Sync / Film', 'Sync / Ad', 'Playlist Blog', 'Radio', 'Other'];

export async function renderPitches(container, { profile }) {
  const canEdit = profile.role === 'owner' || profile.role === 'team';

  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const [{ data: pitches, error }, { data: releases }] = await Promise.all([
    supabase.from('pitches').select('*, releases(title)').order('pitched_at', { ascending: false }),
    supabase.from('releases').select('id, title').order('title'),
  ]);

  if (error) { container.innerHTML = `<p style="color:var(--a2)">${error.message}</p>`; return; }

  // Stats
  const total    = pitches?.length || 0;
  const accepted = (pitches || []).filter(p => p.status === 'accepted').length;
  const pending  = (pitches || []).filter(p => p.status === 'pitched' || p.status === 'pending').length;
  const rate     = total > 0 ? Math.round((accepted / total) * 100) : 0;

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>Pitches</h1>
        <p>Playlist &amp; sync pitch tracker</p>
      </div>
      ${canEdit ? `<button class="btn btn-primary" id="add-pitch">+ Add Pitch</button>` : ''}
    </div>
    <div class="stat-grid" style="margin-bottom:28px">
      <div class="stat-card">
        <div class="stat-val">${total}</div>
        <div class="stat-label">Total Pitches</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:var(--a)">${accepted}</div>
        <div class="stat-label">Accepted</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-val">${pending}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-val">${rate}%</div>
        <div class="stat-label">Success Rate</div>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">All Pitches</span>
        <div style="display:flex;align-items:center;gap:8px">
          <select id="release-filter" style="background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-pill);padding:6px 12px;color:var(--t);font-family:var(--mono);font-size:11px;outline:none;cursor:pointer">
            <option value="">All Releases</option>
            ${(releases || []).map(r => `<option value="${r.id}">${r.title}</option>`).join('')}
          </select>
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Release</th><th>Platform</th><th>Target</th>
          <th>Status</th><th>Result Date</th>
          ${canEdit ? '<th></th>' : ''}
        </tr></thead>
        <tbody id="pitch-rows">
          ${renderPitchRows(pitches || [], canEdit)}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#add-pitch')?.addEventListener('click', () => {
    openPitchModal(null, releases || [], () => renderPitches(container, { profile }));
  });

  container.querySelector('#release-filter')?.addEventListener('change', e => {
    const filterVal = e.target.value;
    const filtered = filterVal ? (pitches || []).filter(p => p.release_id === filterVal) : (pitches || []);
    container.querySelector('#pitch-rows').innerHTML = renderPitchRows(filtered, canEdit);
    bindPitchActions(container, releases || [], pitches || [], canEdit, () => renderPitches(container, { profile }));
  });

  bindPitchActions(container, releases || [], pitches || [], canEdit, () => renderPitches(container, { profile }));
}

function renderPitchRows(pitches, canEdit) {
  if (!pitches.length) return `<tr class="empty-row"><td colspan="${canEdit ? 7 : 6}">No pitches yet</td></tr>`;
  return pitches.map(p => `
    <tr>
      <td class="td-mono" style="color:var(--t3);font-size:11px">${p.pitched_at || '—'}</td>
      <td style="font-size:12px">${p.releases?.title || '—'}</td>
      <td><strong>${p.platform}</strong></td>
      <td style="color:var(--t3);font-size:12px">${p.target || '—'}</td>
      <td><span class="badge ${STATUS_BADGE[p.status] || 'badge-dim'}">${p.status}</span></td>
      <td class="td-mono" style="color:var(--t3);font-size:11px">${p.result_at || '—'}</td>
      ${canEdit ? `<td class="td-actions">
        <button class="btn btn-ghost btn-sm btn-icon edit-pitch" data-id="${p.id}" title="Edit">✎</button>
        <button class="btn btn-danger btn-sm btn-icon del-pitch" data-id="${p.id}" title="Delete">✕</button>
      </td>` : ''}
    </tr>
  `).join('');
}

function bindPitchActions(container, releases, pitches, canEdit, onRefresh) {
  if (!canEdit) return;
  container.querySelectorAll('.edit-pitch').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const pitch = pitches.find(p => p.id === btn.dataset.id);
      if (pitch) openPitchModal(pitch, releases, onRefresh);
    });
  });
  container.querySelectorAll('.del-pitch').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this pitch?')) return;
      const { error } = await supabase.from('pitches').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Pitch deleted'); onRefresh(); }
    });
  });
}

function openPitchModal(pitch, releases, onSave) {
  const isEdit = !!pitch;
  const body = openModal({
    title: isEdit ? 'Edit Pitch' : 'Add Pitch',
    body: `
      <form id="pitch-form">
        <div class="form-row cols-2">
          <div class="field"><label>Release *</label>
            <select name="release_id" required>
              <option value="">Select release…</option>
              ${releases.map(r => `<option value="${r.id}" ${pitch?.release_id === r.id ? 'selected' : ''}>${r.title}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Platform *</label>
            <select name="platform" required>
              ${PLATFORMS.map(p => `<option value="${p}" ${pitch?.platform === p ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Target (playlist / placement)</label>
            <input name="target" placeholder="Today's Top Hits, Netflix series…" value="${pitch?.target || ''}">
          </div>
          <div class="field"><label>Status</label>
            <select name="status">
              <option value="pitched"  ${pitch?.status === 'pitched'  ? 'selected' : ''}>Pitched</option>
              <option value="pending"  ${pitch?.status === 'pending'  ? 'selected' : ''}>Pending</option>
              <option value="accepted" ${pitch?.status === 'accepted' ? 'selected' : ''}>Accepted</option>
              <option value="declined" ${pitch?.status === 'declined' ? 'selected' : ''}>Declined</option>
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Pitched Date</label>
            <input name="pitched_at" type="date" value="${pitch?.pitched_at || new Date().toISOString().split('T')[0]}">
          </div>
          <div class="field"><label>Result Date</label>
            <input name="result_at" type="date" value="${pitch?.result_at || ''}">
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Notes</label>
            <textarea name="notes" rows="2" placeholder="Contact, context…">${pitch?.notes || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="pitch-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add Pitch'}</button>
        </div>
      </form>
    `,
  });

  body.querySelector('#pitch-cancel').addEventListener('click', closeModal);
  body.querySelector('#pitch-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      release_id: fd.get('release_id'),
      platform:   fd.get('platform'),
      target:     fd.get('target') || null,
      status:     fd.get('status'),
      pitched_at: fd.get('pitched_at') || null,
      result_at:  fd.get('result_at') || null,
      notes:      fd.get('notes') || null,
    };
    const { error } = isEdit
      ? await supabase.from('pitches').update(payload).eq('id', pitch.id)
      : await supabase.from('pitches').insert(payload);
    if (error) toast(error.message, 'error');
    else { toast(isEdit ? 'Pitch updated' : 'Pitch added'); closeModal(); onSave(); }
  });
}
