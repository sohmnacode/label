import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';
import { exportSplitSheetPDF } from '../pdf.js';

const SPLIT_COLORS = ['#3ecf8e','#90c8f8','#f4a0b0','#f4c97a','#c4b5fd','#fdba74'];

export async function renderSplits(container, state) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading</div>`;
  const isOwner = state.profile?.role === 'owner';
  await loadSplits(container, state, isOwner);
}

async function loadSplits(container, state, isOwner) {
  const { data: releases, error } = await supabase
    .from('releases')
    .select('id, title, release_type, release_date, release_artists(id, role, split_pct, artists(id, stage_name))')
    .order('release_date', { ascending: false });

  if (error) { container.innerHTML = `<p style="color:var(--a2)">Error: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <p style="color:var(--t3);font-size:12px">Royalty splits per release</p>
      </div>
    </div>

    ${!releases?.length ? `
      <div class="table-wrap" style="padding:40px;text-align:center;color:var(--t3)">
        No releases found. Create a release first, then assign splits.
      </div>
    ` : releases.map(r => {
      const splits = r.release_artists || [];
      const total  = splits.reduce((s, ra) => s + Number(ra.split_pct), 0);
      const balanced = Math.abs(total - 100) < 0.01;
      return `
        <div class="table-wrap section-gap" data-release-id="${r.id}">
          <div class="table-header">
            <div>
              <span class="table-title">${r.title}</span>
              <span class="badge badge-dim" style="margin-left:8px">${r.release_type}</span>
              ${!balanced && splits.length ? `<span class="badge badge-gold" style="margin-left:6px">splits: ${total.toFixed(1)}%</span>` : ''}
              ${balanced ? `<span class="badge badge-green" style="margin-left:6px">✓ 100%</span>` : ''}
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm export-pdf" data-release-id="${r.id}" title="Export PDF">↓ PDF</button>
              ${isOwner ? `<button class="btn btn-secondary btn-sm add-split" data-release-id="${r.id}" data-release-title="${r.title}">+ Add Split</button>` : ''}
            </div>
          </div>

          ${splits.length ? `
            <div style="padding:12px 20px 0">
              <div class="split-bar">
                ${splits.map((ra, i) => `
                  <div class="split-segment" style="width:${ra.split_pct}%;background:${SPLIT_COLORS[i % SPLIT_COLORS.length]}"></div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <table>
            <thead><tr>
              <th>Artist</th><th>Role</th><th>Split %</th>${isOwner ? '<th></th>' : ''}
            </tr></thead>
            <tbody>
              ${splits.length ? splits.map((ra, i) => `
                <tr>
                  <td>
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${SPLIT_COLORS[i % SPLIT_COLORS.length]};margin-right:8px"></span>
                    ${ra.artists?.stage_name || 'Unknown'}
                  </td>
                  <td><span class="badge badge-dim">${ra.role}</span></td>
                  <td>
                    <span style="font-family:var(--mono);color:var(--a);font-size:15px;font-weight:700">${Number(ra.split_pct).toFixed(1)}%</span>
                  </td>
                  ${isOwner ? `<td class="td-actions">
                    <button class="btn btn-ghost btn-sm btn-icon edit-split" data-id="${ra.id}" data-release-id="${r.id}" data-release-title="${r.title}" title="Edit">✎</button>
                    <button class="btn btn-danger btn-sm btn-icon del-split" data-id="${ra.id}" title="Remove">✕</button>
                  </td>` : ''}
                </tr>
              `).join('') : `<tr class="empty-row"><td colspan="${isOwner ? 4 : 3}">No splits assigned yet</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }).join('')}
  `;

  container.querySelectorAll('.export-pdf').forEach(btn => {
    btn.addEventListener('click', () => {
      const release = releases.find(r => r.id === btn.dataset.releaseId);
      if (!release) return;
      const splits = release.release_artists || [];
      if (!splits.length) { toast('No splits to export', 'info'); return; }
      exportSplitSheetPDF(release, splits);
      toast('Split sheet downloaded', 'success');
    });
  });

  container.querySelectorAll('.add-split').forEach(btn => {
    btn.addEventListener('click', () => {
      openSplitModal(null, btn.dataset.releaseId, btn.dataset.releaseTitle, state, () => loadSplits(container, state, isOwner));
    });
  });

  container.querySelectorAll('.edit-split').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data } = await supabase.from('release_artists').select('*').eq('id', btn.dataset.id).single();
      if (data) openSplitModal(data, btn.dataset.releaseId, btn.dataset.releaseTitle, state, () => loadSplits(container, state, isOwner));
    });
  });

  container.querySelectorAll('.del-split').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this split?')) return;
      const { error } = await supabase.from('release_artists').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Split removed'); loadSplits(container, state, isOwner); }
    });
  });
}

async function openSplitModal(split, releaseId, releaseTitle, state, onSave) {
  const { data: artists } = await supabase.from('artists').select('id, stage_name').order('stage_name');
  const isEdit = !!split;

  const body = openModal({
    title: `${isEdit ? 'Edit' : 'Add'} Split — ${releaseTitle}`,
    body: `
      <form id="split-form">
        <div class="form-row">
          <div class="field"><label>Artist *</label>
            <select name="artist_id" required ${isEdit ? 'disabled' : ''}>
              <option value="">Select artist…</option>
              ${(artists || []).map(a =>
                `<option value="${a.id}" ${split?.artist_id === a.id ? 'selected' : ''}>${a.stage_name}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Role</label>
            <select name="role">
              ${['primary','featured','producer','writer'].map(r =>
                `<option value="${r}" ${split?.role === r ? 'selected' : ''}>${r}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field"><label>Split % *</label>
            <input name="split_pct" type="number" min="0" max="100" step="0.01" required
              value="${split?.split_pct ?? ''}" placeholder="e.g. 50">
            <span class="field-hint">Total across all artists should equal 100%</span>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="split-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add Split'}</button>
        </div>
      </form>
    `,
  });

  body.querySelector('#split-cancel').addEventListener('click', closeModal);

  body.querySelector('#split-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      release_id: releaseId,
      artist_id:  isEdit ? split.artist_id : fd.get('artist_id'),
      role:       fd.get('role'),
      split_pct:  parseFloat(fd.get('split_pct')),
    };

    const { error } = isEdit
      ? await supabase.from('release_artists').update({ role: payload.role, split_pct: payload.split_pct }).eq('id', split.id)
      : await supabase.from('release_artists').insert(payload);

    if (error) toast(error.message, 'error');
    else { toast(isEdit ? 'Split updated' : 'Split added'); closeModal(); onSave(); }
  });
}
