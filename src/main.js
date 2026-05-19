import './style.css';
import { supabase } from './supabase.js';
import { renderNav, bindNav } from './nav.js';
import { initRouter, registerRoute, navigate } from './router.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderRoster } from './views/roster.js';
import { renderReleases } from './views/releases.js';
import { renderSplits } from './views/splits.js';
import { renderContracts } from './views/contracts.js';
import { renderInviteAccept } from './views/invite.js';
import { renderPipeline } from './views/pipeline.js';
import { renderRoyalties } from './views/royalties.js';
import { renderANR } from './views/anr.js';
import { renderPitches } from './views/pitches.js';
import { renderCalendar } from './views/calendar.js';
import { renderBudget } from './views/budget.js';
import { renderPress } from './views/press.js';
import { renderArtistPortal } from './views/artist_portal.js';

const app = document.getElementById('app');

async function bootstrap() {
  // Handle invite links before auth check
  if (window.location.hash.startsWith('#/invite')) {
    renderInviteAccept(app);
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    renderLogin(app);
    supabase.auth.onAuthStateChange((_event, s) => {
      if (s) initApp(s);
    });
    return;
  }

  initApp(session);
}

async function initApp(session) {
  // Fetch or create profile
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile) {
    await supabase.from('profiles').insert({
      id:        session.user.id,
      email:     session.user.email,
      full_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
      role:      session.user.user_metadata?.role || 'artist',
    });
    ({ data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single());
  }

  const state = { session, profile };

  // Build shell
  app.innerHTML = `
    ${renderNav(profile)}
    <div class="main">
      <div class="topbar">
        <span class="topbar-title" id="topbar-title">Dashboard</span>
        <div class="topbar-actions" id="topbar-actions"></div>
      </div>
      <div class="content" id="view-content"></div>
    </div>
  `;
  bindNav();

  const content = document.getElementById('view-content');

  // Register routes
  registerRoute('/dashboard', s => s.profile?.role === 'artist' ? renderArtistPortal(content, s) : renderDashboard(content, s));
  registerRoute('/roster',    s => renderRoster(content, s));
  registerRoute('/releases',  s => renderReleases(content, s));
  registerRoute('/pipeline',  s => renderPipeline(content, s));
  registerRoute('/splits',    s => renderSplits(content, s));
  registerRoute('/contracts', s => renderContracts(content, s));
  registerRoute('/royalties', s => renderRoyalties(content, s));
  registerRoute('/budget',    s => renderBudget(content, s));
  registerRoute('/anr',       s => renderANR(content, s));
  registerRoute('/pitches',   s => renderPitches(content, s));
  registerRoute('/calendar',  s => renderCalendar(content, s));
  registerRoute('/press',     s => renderPress(content, s));

  initRouter(state);

  // Re-init on sign-out
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      app.innerHTML = '';
      renderLogin(app);
      supabase.auth.onAuthStateChange((_e, s) => { if (s) initApp(s); });
    }
  });
}

bootstrap();
