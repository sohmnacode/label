const routes = {};
let currentRoute = null;
let appState = null;

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

export function initRouter(state) {
  appState = state;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/calendar':  'Calendar',
  '/roster':    'Roster',
  '/releases':  'Releases',
  '/pipeline':  'Pipeline',
  '/splits':    'Split Sheets',
  '/royalties': 'Royalties',
  '/budget':    'Budget',
  '/contracts': 'Contracts',
  '/anr':       'A&R',
  '/pitches':   'Pitches',
  '/press':     'Press & Radio',
};

function handleRoute() {
  const hash = window.location.hash.slice(1) || '/dashboard';
  const [path] = hash.split('?');
  const handler = routes[path] || routes['/dashboard'];
  if (handler) {
    currentRoute = path;
    updateNavActive(path);
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = ROUTE_TITLES[path] || '';
    handler(appState);
  }
}

function updateNavActive(path) {
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.route === path);
  });
}

export function getCurrentRoute() {
  return currentRoute;
}
