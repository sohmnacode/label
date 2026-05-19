import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';
import { renderTracklist } from './tracks.js';
import { fileUploadField, bindFileUploads } from '../upload.js';
import { spotifySearchRelease, spotifyGetAlbumTracks, isSpotifyConfigured } from '../v4.js';
import { checkGhostStatus, ghostCatalogVerify, ghostISRCIntel } from '../ghostClient.js';
import { geniusSampleSearch, isGeniusConfigured } from '../v4.js';

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

  // Expand row to show tracklist + Ghost/V4 panel
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
      expandRow.innerHTML = `
        <td colspan="${colCount}" style="padding:0 18px 20px;background:rgba(255,255,255,0.015)">
          <div id="tracklist-inner-${id}"></div>
          <div id="ecosystem-panel-${id}" style="margin-top:4px"></div>
        </td>`;
      row.insertAdjacentElement('afterend', expandRow);

      const release = releases.find(r => r.id === id);
      if (release) {
        await renderTracklist(
          document.getElementById(`tracklist-inner-${id}`),
          release,
          isOwner
        );
        renderEcosystemPanel(
          document.getElementById(`ecosystem-panel-${id}`),
          release
        );
      }
    });
  });
}

async function renderEcosystemPanel(container, release) {
  const ghostAlive  = await checkGhostStatus();
  const hasGenius   = isGeniusConfigured();
  if (!ghostAlive && !hasGenius) return;

  container.innerHTML = `
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      ${ghostAlive ? `
        <button class="btn btn-secondary btn-sm" id="ghost-verify-btn">
          👻 Ghost Verify
        </button>
        <button class="btn btn-secondary btn-sm" id="ghost-isrc-btn" ${!release.platform_links?.spotify ? 'style="opacity:.4"' : ''}>
          🔍 ISRC Intel
        </button>
      ` : ''}
      ${hasGenius ? `
        <button class="btn btn-secondary btn-sm" id="genius-sample-btn">
          🎵 Sample Chain
        </button>
      ` : ''}
    </div>
    <div id="ecosystem-result" style="margin-top:12px"></div>
  `;

  const resultEl = container.querySelector('#ecosystem-result');

  container.querySelector('#ghost-verify-btn')?.addEventListener('click', async () => {
    const artists = (release.release_artists || []).map(ra => ra.artists?.stage_name).filter(Boolean);
    const artist  = artists[0] || '';
    resultEl.innerHTML = '<div style="font-size:12px;color:var(--t3)"><span class="spinner"></span> Verifying with Ghost…</div>';
    try {
      const data = await ghostCatalogVerify(artist, release.title);
      resultEl.innerHTML = renderGhostResult('Ghost Catalog Verify', data);
    } catch (err) {
      resultEl.innerHTML = `<div style="font-size:12px;color:var(--a2)">${err.message}</div>`;
    }
  });

  container.querySelector('#ghost-isrc-btn')?.addEventListener('click', async () => {
    const isrc = (release.release_artists || []).flatMap(ra => []).find(Boolean);
    resultEl.innerHTML = '<div style="font-size:12px;color:var(--t3)"><span class="spinner"></span> Fetching ISRC intel from Ghost…</div>';
    // Get ISRC from the first track if available
    const { data: tracks } = await supabase.from('tracks').select('isrc').eq('release_id', release.id).not('isrc', 'is', null).limit(1);
    const trackISRC = tracks?.[0]?.isrc;
    if (!trackISRC) {
      resultEl.innerHTML = '<div style="font-size:12px;color:var(--a4)">No ISRC found on tracks. Add ISRC to tracks first.</div>';
      return;
    }
    try {
      const data = await ghostISRCIntel(trackISRC);
      resultEl.innerHTML = renderGhostResult(`ISRC Intel — ${trackISRC}`, data);
    } catch (err) {
      resultEl.innerHTML = `<div style="font-size:12px;color:var(--a2)">${err.message}</div>`;
    }
  });

  container.querySelector('#genius-sample-btn')?.addEventListener('click', async () => {
    const artists = (release.release_artists || []).map(ra => ra.artists?.stage_name).filter(Boolean);
    const artist  = artists[0] || '';
    resultEl.innerHTML = '<div style="font-size:12px;color:var(--t3)"><span class="spinner"></span> Fetching sample chain from Genius…</div>';
    try {
      const results = await geniusSampleSearch(artist, release.title);
      if (!results.length) {
        resultEl.innerHTML = '<div style="font-size:12px;color:var(--t3)">No results found on Genius.</div>';
        return;
      }
      const r = results[0];
      resultEl.innerHTML = `
        <div style="background:var(--glass-1);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;font-size:12px">
          <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:10px">Sample Chain — ${r.title}</div>
          ${r.sampledFrom.length ? `
            <div style="margin-bottom:10px">
              <div style="font-size:10px;color:var(--a3);letter-spacing:.08em;margin-bottom:6px">SAMPLES FROM</div>
              ${r.sampledFrom.map(s => `
                <div style="padding:4px 0;border-bottom:1px solid var(--border)">
                  <strong>${s.title}</strong> <span style="color:var(--t3)">— ${s.artist}</span>
                  ${s.url ? `<a href="${s.url}" target="_blank" style="color:var(--a);font-size:10px;margin-left:8px">Genius ↗</a>` : ''}
                </div>`).join('')}
            </div>` : ''}
          ${r.sampledBy.length ? `
            <div>
              <div style="font-size:10px;color:var(--a2);letter-spacing:.08em;margin-bottom:6px">SAMPLED BY</div>
              ${r.sampledBy.map(s => `
                <div style="padding:4px 0;border-bottom:1px solid var(--border)">
                  <strong>${s.title}</strong> <span style="color:var(--t3)">— ${s.artist}</span>
                  ${s.url ? `<a href="${s.url}" target="_blank" style="color:var(--a);font-size:10px;margin-left:8px">Genius ↗</a>` : ''}
                </div>`).join('')}
            </div>` : ''}
          ${!r.sampledFrom.length && !r.sampledBy.length ? '<div style="color:var(--t3)">No sample relationships found.</div>' : ''}
        </div>
      `;
    } catch (err) {
      resultEl.innerHTML = `<div style="font-size:12px;color:var(--a2)">${err.message}</div>`;
    }
  });
}

function renderGhostResult(title, data) {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return `<div style="font-size:12px;color:var(--t3)">No data returned from Ghost.</div>`;
  }
  return `
    <div style="background:var(--glass-1);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;font-size:12px">
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:10px">${title}</div>
      <pre style="font-family:var(--mono);font-size:11px;color:var(--t2);white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto">${JSON.stringify(data, null, 2)}</pre>
    </div>
  `;
}

function openReleaseModal(release, state, onSave) {
  const isEdit = !!release;
  const links = release?.platform_links || {};

  const body = openModal({
    title: isEdit ? 'Edit Release' : 'New Release',
    body: `
      <form id="release-form">
        ${isSpotifyConfigured() ? `
        <div style="margin-bottom:18px">
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <input id="v4-search-input" placeholder="Search Spotify — paste release name…"
              style="flex:1;background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;color:var(--t);font-family:var(--mono);font-size:12px;outline:none">
            <button type="button" class="btn btn-secondary btn-sm" id="v4-search-btn">🔍 Search V4</button>
          </div>
          <div id="v4-results" style="display:none;background:var(--glass-1);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;max-height:220px;overflow-y:auto"></div>
        </div>` : ''}
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

  // ── Spotify / V4 search ────────────────────────────────────────────────────
  const v4Btn = body.querySelector('#v4-search-btn');
  const v4Input = body.querySelector('#v4-search-input');
  const v4Results = body.querySelector('#v4-results');

  if (v4Btn) {
    v4Btn.addEventListener('click', async () => {
      const q = v4Input.value.trim();
      if (!q) return;
      v4Btn.disabled = true;
      v4Btn.innerHTML = '<span class="spinner"></span>';
      v4Results.style.display = 'block';
      v4Results.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--t3)">Searching…</div>';
      try {
        const results = await spotifySearchRelease(q);
        if (!results.length) {
          v4Results.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--t3)">No results</div>';
        } else {
          v4Results.innerHTML = results.map(r => `
            <div class="v4-result-row" data-result='${JSON.stringify(r).replace(/'/g, '&#39;')}' style="
              display:flex;align-items:center;gap:10px;padding:10px 14px;
              cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s">
              ${r.cover_url ? `<img src="${r.cover_url}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0">` : '<div style="width:36px;height:36px;border-radius:4px;background:var(--glass-2);flex-shrink:0"></div>'}
              <div style="min-width:0">
                <div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.title}</div>
                <div style="font-size:11px;color:var(--t3)">${r.artist} · ${r.release_type} · ${r.release_date?.split('-')[0] || ''}</div>
              </div>
            </div>
          `).join('');

          v4Results.querySelectorAll('.v4-result-row').forEach(row => {
            row.addEventListener('mouseenter', () => row.style.background = 'var(--glass-2)');
            row.addEventListener('mouseleave', () => row.style.background = '');
            row.addEventListener('click', async () => {
              const r = JSON.parse(row.dataset.result);
              // Fill form fields
              body.querySelector('[name="title"]').value = r.title;
              body.querySelector('[name="release_date"]').value = r.release_date || '';
              const typeMap = { album: 'album', single: 'single', ep: 'ep', compilation: 'album' };
              body.querySelector('[name="release_type"]').value = typeMap[r.release_type] || 'single';
              if (r.spotify_url) body.querySelector('[name="spotify"]').value = r.spotify_url;
              // Cover art: set hidden upload field value
              const coverHidden = body.querySelector('[type="hidden"][name^="fu-"]');
              if (coverHidden && r.cover_url) {
                coverHidden.value = r.cover_url;
                const zone = coverHidden.closest('.upload-zone') || body.querySelector('.upload-zone');
                if (zone) zone.innerHTML = `
                  <div class="upload-preview">
                    <img src="${r.cover_url}" style="max-height:60px;border-radius:6px;margin-right:8px">
                    <span class="upload-filename">From Spotify</span>
                  </div>
                  <input type="hidden" name="${coverHidden.name}" value="${r.cover_url}">
                `;
              }
              v4Results.style.display = 'none';
              toast(`Filled from Spotify: ${r.title}`, 'success');

              // Auto-import tracks for albums/EPs
              if (r.total_tracks > 1 && r.id) {
                try {
                  const tracks = await spotifyGetAlbumTracks(r.id);
                  row.closest('[id^="v4-results"]') && (v4Results.innerHTML = `
                    <div style="padding:10px 14px;font-size:11px;color:var(--a)">
                      ✓ ${tracks.length} tracks ready to import after saving the release
                    </div>
                  `);
                  v4Results.style.display = 'block';
                  // Store on form for post-save import
                  body.querySelector('#release-form').dataset.spotifyTracks = JSON.stringify(tracks);
                  body.querySelector('#release-form').dataset.spotifyAlbumId = r.id;
                } catch (_) {}
              }
            });
          });
        }
      } catch (err) {
        v4Results.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:var(--a2)">${err.message}</div>`;
      }
      v4Btn.disabled = false;
      v4Btn.textContent = '🔍 Search V4';
    });
  }

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

    if (error) { toast(error.message, 'error'); return; }

    // Auto-import Spotify tracks if flagged
    const spotifyTracks = e.target.dataset.spotifyTracks;
    if (!isEdit && spotifyTracks) {
      try {
        const { data: newRelease } = await supabase
          .from('releases').select('id').eq('title', payload.title).eq('label_id', state.profile.id)
          .order('created_at', { ascending: false }).limit(1).single();
        if (newRelease) {
          const tracks = JSON.parse(spotifyTracks);
          await supabase.from('tracks').insert(tracks.map((t, i) => ({
            release_id:   newRelease.id,
            title:        t.title,
            isrc:         t.isrc,
            duration_sec: t.duration_sec,
            explicit:     t.explicit,
            track_number: t.track_number || i + 1,
          })));
          toast(`Release created + ${tracks.length} tracks imported from Spotify`, 'success');
        }
      } catch (_) {
        toast('Release created (track import failed)', 'info');
      }
    } else {
      toast(isEdit ? 'Release updated' : 'Release created');
    }

    closeModal();
    onSave();
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
