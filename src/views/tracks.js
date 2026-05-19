import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';
import { spotifySearchTrack, isSpotifyConfigured } from '../v4.js';

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
        ${isSpotifyConfigured() ? `
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <input id="track-search-input" placeholder="Search Spotify for this track…"
            style="flex:1;background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;color:var(--t);font-family:var(--mono);font-size:12px;outline:none" value="${track?.title || ''}">
          <button type="button" class="btn btn-secondary btn-sm" id="track-search-btn">🔍</button>
        </div>
        <div id="track-results" style="display:none;background:var(--glass-1);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;max-height:180px;overflow-y:auto;margin-bottom:14px"></div>
        ` : ''}
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

  // Spotify track search
  const tSearchBtn = body.querySelector('#track-search-btn');
  const tSearchInput = body.querySelector('#track-search-input');
  const tResults = body.querySelector('#track-results');

  if (tSearchBtn) {
    tSearchBtn.addEventListener('click', async () => {
      const q = tSearchInput.value.trim();
      if (!q) return;
      tSearchBtn.innerHTML = '<span class="spinner"></span>';
      tSearchBtn.disabled = true;
      tResults.style.display = 'block';
      tResults.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--t3)">Searching…</div>';
      try {
        const results = await spotifySearchTrack(q);
        if (!results.length) {
          tResults.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--t3)">No results</div>';
        } else {
          tResults.innerHTML = results.map(r => `
            <div class="track-result-row" data-result='${JSON.stringify(r).replace(/'/g, '&#39;')}' style="
              padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s">
              <div style="font-size:12px;font-weight:700">${r.title}</div>
              <div style="font-size:11px;color:var(--t3)">${r.artist} · ${r.album || ''} · ${r.isrc || 'no ISRC'} · ${fmtDuration(r.duration_sec)}</div>
            </div>
          `).join('');
          tResults.querySelectorAll('.track-result-row').forEach(row => {
            row.addEventListener('mouseenter', () => row.style.background = 'var(--glass-2)');
            row.addEventListener('mouseleave', () => row.style.background = '');
            row.addEventListener('click', () => {
              const r = JSON.parse(row.dataset.result);
              body.querySelector('[name="title"]').value   = r.title;
              if (r.isrc)         body.querySelector('[name="isrc"]').value     = r.isrc;
              if (r.duration_sec) body.querySelector('[name="duration"]').value = fmtDuration(r.duration_sec);
              if (r.explicit)     body.querySelector('#explicit-cb').checked    = true;
              if (r.track_number) body.querySelector('[name="track_number"]').value = r.track_number;
              tResults.style.display = 'none';
              toast(`Filled from Spotify`, 'success');
            });
          });
        }
      } catch (err) {
        tResults.innerHTML = `<div style="padding:10px 14px;font-size:12px;color:var(--a2)">${err.message}</div>`;
      }
      tSearchBtn.disabled = false;
      tSearchBtn.textContent = '🔍';
    });
  }

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
