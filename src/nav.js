import { navigate } from './router.js';
import { supabase } from './supabase.js';
import { toast } from './toast.js';

export function renderNav(profile) {
  const role = profile?.role || 'artist';
  const isOwnerOrTeam = role === 'owner' || role === 'team';
  const isOwner = role === 'owner';
  const initials = (profile?.full_name || profile?.email || '?').slice(0, 2).toUpperCase();

  const links = [
    { route: '/dashboard', icon: iconDash, label: 'Dashboard', show: true },
    { route: '/roster',    icon: iconRoster, label: 'Roster',    show: isOwnerOrTeam },
    { route: '/releases',  icon: iconRelease, label: 'Releases', show: true },
    { route: '/splits',    icon: iconSplit,  label: 'Splits',    show: true },
    { route: '/contracts', icon: iconContract, label: 'Contracts', show: isOwner || role === 'artist' },
  ];

  return `
    <nav class="nav">
      <div class="nav-logo">
        <div class="nav-logo-text"><span>S</span>ohmna</div>
        <div class="nav-logo-sub">Label Hub</div>
      </div>
      <div class="nav-links">
        ${links.filter(l => l.show).map(l => `
          <button class="nav-link" data-route="${l.route}">
            <span class="nav-icon">${l.icon}</span>
            ${l.label}
          </button>
        `).join('')}
      </div>
      <div class="nav-bottom">
        <div class="nav-user">
          <div class="nav-avatar">${initials}</div>
          <div class="nav-user-info">
            <div class="nav-user-name">${profile?.full_name || profile?.email || 'User'}</div>
            <div class="nav-user-role">${role}</div>
          </div>
        </div>
        <button class="nav-signout" id="nav-signout">Sign out</button>
      </div>
    </nav>
  `;
}

export function bindNav() {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.route));
  });

  const signout = document.getElementById('nav-signout');
  if (signout) {
    signout.addEventListener('click', async () => {
      await supabase.auth.signOut();
      toast('Signed out', 'info');
    });
  }
}

const iconDash = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`;
const iconRoster = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5s5 2 5 5"/><path d="M11 7c1.5 0 3 1 3 3.5"/><circle cx="12" cy="4" r="2"/></svg>`;
const iconRelease = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/><line x1="8" y1="2" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="14"/></svg>`;
const iconSplit = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8h12M8 2l-6 6 6 6"/></svg>`;
const iconContract = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="1" width="10" height="14" rx="1"/><line x1="6" y1="5" x2="10" y2="5"/><line x1="6" y1="8" x2="10" y2="8"/><line x1="6" y1="11" x2="8" y2="11"/></svg>`;
