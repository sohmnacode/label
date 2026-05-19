import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseDuration(str) {
  if (!str) return null;
  if (/^\d+$/.test(str)) return parseInt(str);
  const [m, s] = str.split(':').map(Number);
  return m * 60 + (s || 0);
}

export async function renderTracklist(container, release, isOwner) {
  const { data: tracks, error } = await supabase
    .from('tracks')
    .select('*')
    .eq('release_id', release.id)
    .order('track_number');

  if (error) { container.innerHTML = `<p style="color:var(--a2);font-size:12px">${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="table-wrap" style="margin-top:16px">
      <div class="table-header">
        <span class="table-title">Tracklist</span>
        ${isOwner ? `<button class="btn btn-secondary btn-sm" id="add-track">+ Add Track</button>` : ''}
      </div>
      <table>
        <thead><tr>
          <th style="width:40px">#</th>
          <th>Title</th>
          <th>ISRC</th>
          <th>Duration</th>
          <th>Explicit</th>
          ${isOwner ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${tracks?.length ? tracks.map(t => `
            <tr data-id="${t.id}">
              <td class="td-mono" style="color:var(--t3)">${t.track_number ?? '—'}</td>
              <td><strong>${t.title}</strong></td>
              <td class="td-mono" style="color:var(--t3);font-size:11px">${t.isrc || '—'}</td>
              <td class="td-mono">${fmtDuration(t.duration_sec)}</td>
              <td>${t.explicit ? `<span class="badge badge-pink">E</span>` : '—'}</td>
              ${isOwner ? `<td class="td-actions">
                <button class="btn btn-ghost btn-sm btn-icon edit-track" data-id="${t.id}" title="Edit">✎</button>
                <button class="btn btn-danger btn-sm btn-icon del-track" data-id="${t.id}" title="Delete">✕</button>
              </td>` : ''}
            </tr>
          `).join('') : `<tr class="empty-row"><td colspan="${isOwner ? 6 : 5}">No tracks yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#add-track')?.addEventListener('click', () => {
    const nextNum = (tracks?.length || 0) + 1;
    openTrackModal(null, release.id, nextNum, () => renderTracklist(container, release, isOwner));
  });

  container.querySelectorAll('.edit-track').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { data } = await supabase.from('tracks').select('*').eq('id', btn.dataset.id).single();
      if (data) openTrackModal(data, release.id, data.track_number, () => renderTracklist(container, release, isOwner));
    });
  });

  container.querySelectorAll('.del-track').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this track?')) return;
      const { error } = await supabase.from('tracks').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Track deleted'); renderTracklist(container, release, isOwner); }
    });
  });
}

function openTrackModal(track, releaseId, defaultNum, onSave) {
  const isEdit = !!track;
  const body = openModal({
    title: isEdit ? 'Edit Track' : 'Add Track',
    body: `
      <form id="track-form">
        <div class="form-row cols-2">
          <div class="field"><label>Track # </label>
            <input name="track_number" type="number" min="1" value="${track?.track_number ?? defaultNum}">
          </div>
          <div class="field"><label>Title *</label>
            <input name="title" required value="${track?.title || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>ISRC</label>
            <input name="isrc" placeholder="USRC17607839" value="${track?.isrc || ''}">
          </div>
          <div class="field"><label>Duration (m:ss or seconds)</label>
            <input name="duration" placeholder="3:42" value="${track?.duration_sec ? fmtDuration(track.duration_sec) : ''}">
          </div>
        </div>
        <div class="form-row">
          <div class="field" style="flex-direction:row;align-items:center;gap:10px">
            <input name="explicit" type="checkbox" id="explicit-cb" style="width:auto" ${track?.explicit ? 'checked' : ''}>
            <label for="explicit-cb" style="text-transform:none;font-size:13px;color:var(--t);cursor:pointer">Explicit content</label>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="track-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add Track'}</button>
        </div>
      </form>
    `,
  });

  body.querySelector('#track-cancel').addEventListener('click', closeModal);

  body.querySelector('#track-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      release_id:   releaseId,
      title:        fd.get('title'),
      track_number: parseInt(fd.get('track_number')) || null,
      isrc:         fd.get('isrc') || null,
      duration_sec: parseDuration(fd.get('duration')),
      explicit:     !!fd.get('explicit'),
    };

    const { error } = isEdit
      ? await supabase.from('tracks').update(payload).eq('id', track.id)
      : await supabase.from('tracks').insert(payload);

    if (error) toast(error.message, 'error');
    else { toast(isEdit ? 'Track updated' : 'Track added'); closeModal(); onSave(); }
  });
}
