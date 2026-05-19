import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

async function openInviteModal(state) {
  const body = openModal({
    title: 'Invite Artist',
    body: `
      <form id="invite-form">
        <div class="form-row">
          <div class="field">
            <label>Email (optional)</label>
            <input name="email" type="email" placeholder="artist@email.com">
            <span class="field-hint">Leave blank to generate a generic invite link</span>
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Role</label>
            <select name="role">
              <option value="artist">Artist</option>
              <option value="team">Team</option>
            </select>
          </div>
        </div>
        <div id="invite-result" style="display:none;margin-top:16px">
          <div class="field"><label>Invite Link</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input id="invite-link-input" readonly style="flex:1;cursor:pointer;color:var(--a)">
              <button type="button" class="btn btn-secondary btn-sm" id="copy-invite">Copy</button>
            </div>
            <span class="field-hint" style="color:var(--a4)">Expires in 7 days</span>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="invite-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="invite-submit">Generate Link</button>
        </div>
      </form>
    `,
  });

  body.querySelector('#invite-cancel').addEventListener('click', closeModal);

  body.querySelector('#invite-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = body.querySelector('#invite-submit');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    const { data: invite, error } = await supabase
      .from('invites')
      .insert({ label_id: state.profile.id, email: fd.get('email') || null, role: fd.get('role') })
      .select()
      .single();

    if (error) { toast(error.message, 'error'); btn.disabled = false; btn.textContent = 'Generate Link'; return; }

    const base = window.location.origin + window.location.pathname;
    const link = `${base}#/invite?token=${invite.token}`;

    const resultEl = body.querySelector('#invite-result');
    resultEl.style.display = 'block';
    body.querySelector('#invite-link-input').value = link;
    btn.style.display = 'none';

    body.querySelector('#copy-invite').addEventListener('click', () => {
      navigator.clipboard.writeText(link);
      toast('Invite link copied', 'success');
    });
  });
}

export async function renderRoster(container, state) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading</div>`;

  const isOwner = state.profile?.role === 'owner';
  await loadRoster(container, state, isOwner, '');
}

async function loadRoster(container, state, isOwner, search) {
  let query = supabase.from('artists').select('*').order('stage_name');
  if (search) query = query.ilike('stage_name', `%${search}%`);
  const { data: artists, error } = await query;

  if (error) { container.innerHTML = `<p style="color:var(--a2)">Error: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <p style="color:var(--t3);font-size:12px">${artists?.length || 0} artist${artists?.length !== 1 ? 's' : ''} on the roster</p>
      </div>
      ${isOwner ? `
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="invite-artist">✉ Invite</button>
          <button class="btn btn-primary" id="add-artist">+ Add Artist</button>
        </div>` : ''}
    </div>

    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">Artists</span>
        <div class="table-search">
          <input type="text" id="roster-search" placeholder="Search artists…" value="${search}">
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Artist</th><th>Legal Name</th><th>Email</th><th>Genres</th><th>Status</th>
          ${isOwner ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${artists?.length ? artists.map(a => `
            <tr data-id="${a.id}">
              <td><strong>${a.stage_name}</strong></td>
              <td class="text-dim">${a.legal_name || '—'}</td>
              <td class="td-mono">${a.email || '—'}</td>
              <td>${(a.genres || []).map(g => `<span class="badge badge-dim" style="margin-right:3px">${g}</span>`).join('') || '—'}</td>
              <td>${statusBadge(a.status)}</td>
              ${isOwner ? `<td class="td-actions">
                <button class="btn btn-ghost btn-sm btn-icon edit-artist" data-id="${a.id}" title="Edit">✎</button>
                <button class="btn btn-danger btn-sm btn-icon del-artist" data-id="${a.id}" title="Delete">✕</button>
              </td>` : ''}
            </tr>
          `).join('') : `<tr class="empty-row"><td colspan="${isOwner ? 6 : 5}">No artists on the roster yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#roster-search')?.addEventListener('input', e => {
    loadRoster(container, state, isOwner, e.target.value);
  });

  container.querySelector('#invite-artist')?.addEventListener('click', () => openInviteModal(state));

  container.querySelector('#add-artist')?.addEventListener('click', () => {
    openArtistModal(null, state, () => loadRoster(container, state, isOwner, search));
  });

  container.querySelectorAll('.edit-artist').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { data } = await supabase.from('artists').select('*').eq('id', btn.dataset.id).single();
      if (data) openArtistModal(data, state, () => loadRoster(container, state, isOwner, search));
    });
  });

  container.querySelectorAll('.del-artist').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Remove this artist from the roster?')) return;
      const { error } = await supabase.from('artists').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Artist removed'); loadRoster(container, state, isOwner, search); }
    });
  });
}

function openArtistModal(artist, state, onSave) {
  const isEdit = !!artist;
  const body = openModal({
    title: isEdit ? 'Edit Artist' : 'Add Artist',
    body: `
      <form id="artist-form">
        <div class="form-row cols-2">
          <div class="field"><label>Stage Name *</label>
            <input name="stage_name" required value="${artist?.stage_name || ''}">
          </div>
          <div class="field"><label>Legal Name</label>
            <input name="legal_name" value="${artist?.legal_name || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Email</label>
            <input name="email" type="email" value="${artist?.email || ''}">
          </div>
          <div class="field"><label>Phone</label>
            <input name="phone" value="${artist?.phone || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Genres (comma-separated)</label>
            <input name="genres" placeholder="Hip-Hop, R&B" value="${(artist?.genres || []).join(', ')}">
          </div>
          <div class="field"><label>Status</label>
            <select name="status">
              <option value="active" ${artist?.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="inactive" ${artist?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
              <option value="unsigned" ${artist?.status === 'unsigned' ? 'selected' : ''}>Unsigned</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Bio</label>
            <textarea name="bio">${artist?.bio || ''}</textarea>
          </div>
        </div>
        <div class="form-row cols-3">
          <div class="field"><label>Instagram</label>
            <input name="ig" placeholder="@handle" value="${artist?.socials?.ig || ''}">
          </div>
          <div class="field"><label>Twitter / X</label>
            <input name="tw" placeholder="@handle" value="${artist?.socials?.tw || ''}">
          </div>
          <div class="field"><label>Spotify URL</label>
            <input name="spotify" placeholder="https://open.spotify.com/…" value="${artist?.socials?.spotify || ''}">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="artist-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" id="artist-save">
            ${isEdit ? 'Save Changes' : 'Add Artist'}
          </button>
        </div>
      </form>
    `,
    size: 'modal-lg',
  });

  body.querySelector('#artist-cancel').addEventListener('click', closeModal);

  body.querySelector('#artist-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const genres = fd.get('genres').split(',').map(s => s.trim()).filter(Boolean);
    const payload = {
      stage_name: fd.get('stage_name'),
      legal_name: fd.get('legal_name') || null,
      email:      fd.get('email') || null,
      phone:      fd.get('phone') || null,
      bio:        fd.get('bio') || null,
      status:     fd.get('status'),
      genres,
      socials: {
        ig:      fd.get('ig') || undefined,
        tw:      fd.get('tw') || undefined,
        spotify: fd.get('spotify') || undefined,
      },
    };

    if (!isEdit) payload.label_id = state.profile.id;

    const btn = body.querySelector('#artist-save');
    btn.disabled = true;

    const { error } = isEdit
      ? await supabase.from('artists').update(payload).eq('id', artist.id)
      : await supabase.from('artists').insert(payload);

    if (error) { toast(error.message, 'error'); btn.disabled = false; }
    else { toast(isEdit ? 'Artist updated' : 'Artist added'); closeModal(); onSave(); }
  });
}

function statusBadge(status) {
  const map = { active: 'badge-green', inactive: 'badge-dim', unsigned: 'badge-pink' };
  return `<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}
