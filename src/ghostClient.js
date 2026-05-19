// Sohmna Ghost integration — calls the local Ghost server at localhost:3001

const GHOST_BASE = 'http://localhost:3001/v1/ghost';
let _ghostAvailable = null;
let _ghostCheckTime = 0;

export async function checkGhostStatus() {
  if (Date.now() - _ghostCheckTime < 10000) return _ghostAvailable;
  try {
    const res = await fetch(`${GHOST_BASE}/health`, { signal: AbortSignal.timeout(1500) });
    _ghostAvailable = res.ok;
  } catch {
    _ghostAvailable = false;
  }
  _ghostCheckTime = Date.now();
  return _ghostAvailable;
}

async function ghostPost(endpoint, body) {
  const res = await fetch(`${GHOST_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Ghost error ${res.status}`);
  return res.json();
}

async function ghostGet(endpoint) {
  const res = await fetch(`${GHOST_BASE}${endpoint}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Ghost error ${res.status}`);
  return res.json();
}

export async function ghostISRCIntel(isrc) {
  return ghostPost('/isrc-intel', { isrc });
}

export async function ghostCatalogVerify(artist, title, isrc = null) {
  return ghostPost('/catalog-verify', { artist, title, ...(isrc ? { isrc } : {}) });
}

export async function ghostSimilarArtists(artist) {
  return ghostPost('/similar-artist-seeds', { artist });
}

export async function ghostStats() {
  return ghostGet('/stats');
}
