import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';
import { renderTracklist } from './tracks.js';
import { fileUploadField, bindFileUploads } from '../upload.js';

const STATUS_ORDER = ['draft','scheduled','distributed','live','archived'];

export async function renderReleases(container, state) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading</div>`;
  const isOwner = state.profile?.role === 'owner';
  await loadReleases(container, state, isOwner, '');
}

async function loadReleases(container, state, isOwner, search) {
  let query = supabase
    .from('releases')
    .select('*, release_artists(artist_id, role, split_pct, artists(stage_name))')
    .order('release_date', { ascending: false });
  if (search) query = query.ilike('title', `%${search}%`);

  const { data: releases, error } = await query;
  if (error) { container.innerHTML = `<p style="color:var(--a2)">Error: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <p style="color:var(--t3);font-size:12px">${releases?.length || 0} total releases</p>
      </div>
      ${isOwner ? `<button class="btn btn-primary" id="add-release">+ New Release</button>` : ''}
    </div>

    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">All Releases</span>
        <div class="table-search">
          <input type="text" id="release-search" placeholder="Search…" value="${search}">
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Title</th><th>Artists</th><th>Type</th><th>Date</th><th>Status</th><th>Distributor</th>
          ${isOwner ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${releases?.length ? releases.map(r => {
            const artists = (r.release_artists || []).map(ra => ra.artists?.stage_name).filter(Boolean);
            return `
              <tr data-id="${r.id}">
                <td><strong>${r.title}</strong></td>
                <td class="text-dim">${artists.join(', ') || '—'}</td>
                <td><span class="badge badge-dim">${r.release_type}</span></td>
                <td class="td-mono">${r.release_date ? formatDate(r.release_date) : '—'}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="text-dim">${r.distributor || '—'}</td>
                ${isOwner ? `<td class="td-actions">
                  <button class="btn btn-ghost btn-sm btn-icon edit-release" data-id="${r.id}" title="Edit">✎</button>
                  <button class="btn btn-danger btn-sm btn-icon del-release" data-id="${r.id}" title="Delete">✕</button>
                </td>` : ''}
              </tr>
            `;
          }).join('') : `<tr class="empty-row"><td colspan="${isOwner ? 7 : 6}">No releases yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#release-search')?.addEventListener('input', e => {
    loadReleases(container, state, isOwner, e.target.value);
  });

  container.querySelector('#add-release')?.addEventListener('click', () => {
    openReleaseModal(null, state, () => loadReleases(container, state, isOwner, search));
  });

  container.querySelectorAll('.edit-release').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { data } = await supabase.from('releases').select('*').eq('id', btn.dataset.id).single();
      if (data) openReleaseModal(data, state, () => loadReleases(container, state, isOwner, search));
    });
  });

  container.querySelectorAll('.del-release').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this release? This will also remove all splits.')) return;
      const { error } = await supabase.from('releases').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Release deleted'); loadReleases(container, state, isOwner, search); }
    });
  });

  // Expand row to show tracklist
  let expandedId = null;
  container.querySelectorAll('tbody tr[data-id]').forEach(row => {
    row.addEventListener('click', async () => {
      const id = row.dataset.id;
      const existing = container.querySelector('.tracklist-row');

      if (expandedId === id) {
        existing?.remove();
        expandedId = null;
        return;
      }

      existing?.remove();
      expandedId = id;

      const colCount = isOwner ? 7 : 6;
      const expandRow = document.createElement('tr');
      expandRow.className = 'tracklist-row';
      expandRow.innerHTML = `<td colspan="${colCount}" style="padding:0 18px 18px;background:rgba(255,255,255,0.02)">
        <div id="tracklist-inner-${id}"></div>
      </td>`;
      row.insertAdjacentElement('afterend', expandRow);

      const release = releases.find(r => r.id === id);
      if (release) {
        await renderTracklist(
          document.getElementById(`tracklist-inner-${id}`),
          release,
          isOwner
        );
      }
    });
  });
}

function openReleaseModal(release, state, onSave) {
  const isEdit = !!release;
  const links = release?.platform_links || {};

  const body = openModal({
    title: isEdit ? 'Edit Release' : 'New Release',
    body: `
      <form id="release-form">
        <div class="form-row cols-2">
          <div class="field"><label>Title *</label>
            <input name="title" required value="${release?.title || ''}">
          </div>
          <div class="field"><label>Type</label>
            <select name="release_type">
              ${['single','ep','album','mixtape'].map(t =>
                `<option value="${t}" ${release?.release_type === t ? 'selected' : ''}>${t}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Release Date</label>
            <input name="release_date" type="date" value="${release?.release_date || ''}">
          </div>
          <div class="field"><label>Status</label>
            <select name="status">
              ${STATUS_ORDER.map(s =>
                `<option value="${s}" ${release?.status === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Distributor</label>
            <input name="distributor" placeholder="DistroKid, TuneCore…" value="${release?.distributor || ''}">
          </div>
          <div class="field"><label>UPC</label>
            <input name="upc" placeholder="00000000000000" value="${release?.upc || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Spotify URL</label>
            <input name="spotify" placeholder="https://open.spotify.com/…" value="${links.spotify || ''}">
          </div>
          <div class="field"><label>Apple Music URL</label>
            <input name="apple" placeholder="https://music.apple.com/…" value="${links.apple || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>YouTube URL</label>
            <input name="youtube" placeholder="https://youtube.com/…" value="${links.youtube || ''}">
          </div>
        </div>
        <div class="form-row">
          ${fileUploadField({ label:'Cover Art', accept:'image/jpeg,image/png,image/webp', hint:'JPEG or PNG, max 5MB', currentUrl: release?.cover_url || '', bucket:'covers', prefix:'covers/' })}
        </div>
        <div class="form-row">
          <div class="field"><label>Notes</label>
            <textarea name="notes">${release?.notes || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="release-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Release'}</button>
        </div>
      </form>
    `,
    size: 'modal-lg',
  });

  body.querySelector('#release-cancel').addEventListener('click', closeModal);
  bindFileUploads(body);

  body.querySelector('#release-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    // Get cover URL from hidden upload field
    const coverInput = body.querySelector('[name^="fu-"][type="hidden"]');
    const payload = {
      title:        fd.get('title'),
      release_type: fd.get('release_type'),
      release_date: fd.get('release_date') || null,
      status:       fd.get('status'),
      distributor:  fd.get('distributor') || null,
      upc:          fd.get('upc') || null,
      cover_url:    (coverInput?.value) || null,
      notes:        fd.get('notes') || null,
      platform_links: {
        spotify: fd.get('spotify') || undefined,
        apple:   fd.get('apple')   || undefined,
        youtube: fd.get('youtube') || undefined,
      },
    };

    if (!isEdit) payload.label_id = state.profile.id;

    const { error } = isEdit
      ? await supabase.from('releases').update(payload).eq('id', release.id)
      : await supabase.from('releases').insert(payload);

    if (error) toast(error.message, 'error');
    else { toast(isEdit ? 'Release updated' : 'Release created'); closeModal(); onSave(); }
  });
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function statusBadge(status) {
  const map = {
    live: 'badge-green', signed: 'badge-green',
    draft: 'badge-dim', archived: 'badge-dim',
    scheduled: 'badge-blue', distributed: 'badge-blue',
  };
  return `<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}
