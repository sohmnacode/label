import { supabase } from '../supabase.js';
import { navigate } from '../router.js';

export async function renderArtistPortal(container, { profile }) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const [
    { data: releases },
    { data: splits },
    { data: contracts },
  ] = await Promise.all([
    supabase.from('releases').select('*, release_artists(artists(name))').order('release_date', { ascending: false }).limit(20),
    supabase.from('release_artists').select('*, releases(id, title, release_date, cover_url, status)'),
    supabase.from('contracts').select('*').order('expires_at'),
  ]);

  const upcomingReleases = (releases || []).filter(r => r.release_date && new Date(r.release_date) > new Date());
  const activeContracts  = (contracts || []).filter(c => !c.expires_at || new Date(c.expires_at) > new Date());
  const expiringSoon     = (contracts || []).filter(c => {
    if (!c.expires_at) return false;
    const days = (new Date(c.expires_at) - new Date()) / 86400000;
    return days > 0 && days <= 60;
  });

  const name = profile?.full_name || profile?.email?.split('@')[0] || 'Artist';

  container.innerHTML = `
    <div style="margin-bottom:32px">
      <div style="font-family:var(--display);font-size:36px;letter-spacing:.1em;background:linear-gradient(135deg,var(--t) 0%,var(--t2) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${name}</div>
      <div style="font-size:12px;color:var(--t3);margin-top:4px;letter-spacing:.08em">Artist Portal</div>
    </div>

    ${expiringSoon.length ? `
      <div style="background:rgba(244,201,122,0.07);border:1px solid rgba(244,201,122,0.2);border-radius:var(--radius);padding:14px 18px;margin-bottom:24px;font-size:12px;color:var(--a4)">
        ⚠ ${expiringSoon.length} contract${expiringSoon.length > 1 ? 's' : ''} expiring within 60 days
      </div>
    ` : ''}

    <div class="stat-grid" style="margin-bottom:32px">
      <div class="stat-card">
        <div class="stat-val">${releases?.length || 0}</div>
        <div class="stat-label">Releases</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-val">${upcomingReleases.length}</div>
        <div class="stat-label">Upcoming</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${splits?.length || 0}</div>
        <div class="stat-label">Split Sheets</div>
      </div>
      <div class="stat-card ${expiringSoon.length ? 'gold' : ''}">
        <div class="stat-val">${activeContracts.length}</div>
        <div class="stat-label">Active Contracts</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px">
      <!-- Recent Releases -->
      <div class="table-wrap">
        <div class="table-header">
          <span class="table-title">Your Releases</span>
          <button class="btn btn-ghost btn-sm" data-route="/releases">View All →</button>
        </div>
        ${(releases || []).length ? `
          <div style="padding:8px">
            ${(releases || []).slice(0, 6).map(r => {
              const artists = (r.release_artists || []).map(ra => ra.artists?.name).filter(Boolean).join(', ');
              return `
                <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--radius-sm);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--glass-2)'" onmouseout="this.style.background=''">
                  ${r.cover_url
                    ? `<img src="${r.cover_url}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--border)">`
                    : `<div style="width:40px;height:40px;border-radius:6px;background:var(--glass-2);border:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:16px">◎</div>`}
                  <div style="min-width:0;flex:1">
                    <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</div>
                    <div style="font-size:11px;color:var(--t3);margin-top:1px">${r.release_date ? new Date(r.release_date + 'T00:00:00').toLocaleDateString('en-US',{month:'short',year:'numeric'}) : '—'}</div>
                  </div>
                  <span class="badge ${r.status === 'live' ? 'badge-green' : r.status === 'scheduled' ? 'badge-blue' : 'badge-dim'}" style="font-size:9px">${r.status}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : `<div style="padding:32px;text-align:center;color:var(--t3);font-size:12px">No releases yet</div>`}
      </div>

      <!-- Contracts -->
      <div class="table-wrap">
        <div class="table-header">
          <span class="table-title">Contracts</span>
          <button class="btn btn-ghost btn-sm" data-route="/contracts">View All →</button>
        </div>
        ${(contracts || []).length ? `
          <table>
            <thead><tr><th>Title</th><th>Type</th><th>Expires</th></tr></thead>
            <tbody>
              ${(contracts || []).slice(0, 6).map(c => {
                const expiring = c.expires_at && (new Date(c.expires_at) - new Date()) / 86400000 <= 60;
                return `<tr>
                  <td style="font-size:12px"><strong>${c.title || '—'}</strong></td>
                  <td><span class="badge badge-dim" style="font-size:9px">${c.type || '—'}</span></td>
                  <td style="font-size:11px;color:${expiring ? 'var(--a4)' : 'var(--t3)'}">
                    ${c.expires_at ? new Date(c.expires_at + 'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : `<div style="padding:32px;text-align:center;color:var(--t3);font-size:12px">No contracts</div>`}
      </div>
    </div>

    <!-- Splits -->
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">Split Sheets</span>
        <button class="btn btn-ghost btn-sm" data-route="/splits">View All →</button>
      </div>
      ${(splits || []).length ? `
        <table>
          <thead><tr><th>Release</th><th>Your Role</th><th>Split %</th></tr></thead>
          <tbody>
            ${(splits || []).slice(0, 8).map(s => `
              <tr>
                <td style="font-size:12px"><strong>${s.releases?.title || '—'}</strong></td>
                <td style="color:var(--t3);font-size:12px">${s.role || '—'}</td>
                <td style="font-family:var(--mono);color:var(--a)">${s.split_pct != null ? s.split_pct + '%' : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `<div style="padding:32px;text-align:center;color:var(--t3);font-size:12px">No splits yet</div>`}
    </div>
  `;

  container.querySelectorAll('[data-route]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });
}
