import { supabase } from '../supabase.js';

export async function renderDashboard(container, state) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading</div>`;

  const isOwner = state.profile?.role === 'owner';
  const isOwnerOrTeam = isOwner || state.profile?.role === 'team';

  const [artistsRes, releasesRes, contractsRes] = await Promise.all([
    isOwnerOrTeam ? supabase.from('artists').select('id,status') : Promise.resolve({ data: [] }),
    isOwnerOrTeam
      ? supabase.from('releases').select('id,status,release_date,title,release_type').order('release_date', { ascending: false })
      : supabase.from('releases').select('id,status,release_date,title,release_type').order('release_date', { ascending: false }),
    isOwner ? supabase.from('contracts').select('id,status,expiry_date,title').order('expiry_date', { ascending: true }) : Promise.resolve({ data: [] }),
  ]);

  const artists   = artistsRes.data   || [];
  const releases  = releasesRes.data  || [];
  const contracts = contractsRes.data || [];

  const activeArtists = artists.filter(a => a.status === 'active').length;
  const liveReleases  = releases.filter(r => r.status === 'live').length;
  const upcomingReleases = releases.filter(r => r.status === 'scheduled' || r.status === 'distributed').length;
  const pendingContracts = contracts.filter(c => c.status === 'sent' || c.status === 'draft').length;

  const recentReleases = releases.slice(0, 5);

  const expiringContracts = contracts.filter(c => {
    if (!c.expiry_date || c.status === 'expired' || c.status === 'terminated') return false;
    const days = (new Date(c.expiry_date) - new Date()) / 86400000;
    return days >= 0 && days <= 60;
  });

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <p style="color:var(--t3);font-size:12px">Welcome back${state.profile?.full_name ? ', <span style="color:var(--t)">' + state.profile.full_name + '</span>' : ''}</p>
      </div>
    </div>

    <div class="stat-grid">
      ${isOwnerOrTeam ? `
      <div class="stat-card">
        <div class="stat-val">${activeArtists}</div>
        <div class="stat-label">Active Artists</div>
      </div>` : ''}
      <div class="stat-card blue">
        <div class="stat-val">${liveReleases}</div>
        <div class="stat-label">Live Releases</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-val">${upcomingReleases}</div>
        <div class="stat-label">Upcoming</div>
      </div>
      ${isOwner ? `
      <div class="stat-card pink">
        <div class="stat-val">${pendingContracts}</div>
        <div class="stat-label">Pending Contracts</div>
      </div>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:${isOwner && expiringContracts.length ? '1fr 1fr' : '1fr'};gap:16px">
      <div class="table-wrap">
        <div class="table-header">
          <span class="table-title">Recent Releases</span>
          <button class="btn btn-ghost btn-sm" id="view-all-releases">View all →</button>
        </div>
        <table>
          <thead><tr>
            <th>Title</th><th>Type</th><th>Date</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${recentReleases.length ? recentReleases.map(r => `
              <tr>
                <td>${r.title}</td>
                <td><span class="badge badge-dim">${r.release_type}</span></td>
                <td class="td-mono">${r.release_date ? formatDate(r.release_date) : '—'}</td>
                <td>${statusBadge(r.status)}</td>
              </tr>
            `).join('') : `<tr class="empty-row"><td colspan="4">No releases yet</td></tr>`}
          </tbody>
        </table>
      </div>

      ${isOwner && expiringContracts.length ? `
      <div class="table-wrap">
        <div class="table-header">
          <span class="table-title" style="color:var(--a4)">⚠ Contracts Expiring Soon</span>
        </div>
        <table>
          <thead><tr><th>Contract</th><th>Expires</th><th>Status</th></tr></thead>
          <tbody>
            ${expiringContracts.map(c => `
              <tr>
                <td>${c.title}</td>
                <td class="td-mono" style="color:var(--a4)">${formatDate(c.expiry_date)}</td>
                <td>${statusBadge(c.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>
  `;

  container.querySelector('#view-all-releases')?.addEventListener('click', () => {
    window.location.hash = '/releases';
  });
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function statusBadge(status) {
  const map = {
    active: 'badge-green', live: 'badge-green', signed: 'badge-green',
    draft: 'badge-dim', inactive: 'badge-dim', archived: 'badge-dim', terminated: 'badge-dim',
    scheduled: 'badge-blue', distributed: 'badge-blue', sent: 'badge-blue',
    unsigned: 'badge-pink', expired: 'badge-pink',
  };
  return `<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}
