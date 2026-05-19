import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';
import { exportRoyaltyStatementPDF } from '../pdf.js';

const TYPE_CONFIG = {
  advance:  { sign: -1, color: 'var(--a2)', badge: 'badge-pink' },
  expense:  { sign: -1, color: 'var(--a2)', badge: 'badge-pink' },
  royalty:  { sign:  1, color: 'var(--a)',  badge: 'badge-green' },
  payment:  { sign:  1, color: 'var(--a)',  badge: 'badge-green' },
};

// ── CSV helpers ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows = lines.slice(1)
    .map(l => splitCSVLine(l))
    .filter(vals => vals.some(v => v))
    .map(vals => Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').trim()])));
  return { headers, rows };
}

function splitCSVLine(line) {
  const vals = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
    else cur += ch;
  }
  vals.push(cur);
  return vals.map(v => v.replace(/^"|"$/g, '').trim());
}

function detectCol(headers, candidates) {
  for (const c of candidates) {
    const f = headers.find(h => h.includes(c.toLowerCase()));
    if (f !== undefined) return f;
  }
  return null;
}

function detectFormat(headers) {
  // DistroKid: "royalties earned"
  if (headers.some(h => h.includes('royalties earned'))) return 'distrokid';
  // TuneCore: "net sales"
  if (headers.some(h => h.includes('net sales'))) return 'tunecore';
  // CD Baby: "digital download net"
  if (headers.some(h => h.includes('digital download'))) return 'cdbaby';
  return 'generic';
}

function extractAmount(row, headers) {
  const amtCol = detectCol(headers, [
    'royalties earned', 'royalties earned (usd)', 'net sales', 'net sales (usd)',
    'earnings', 'amount', 'revenue', 'gross sales', 'digital download net',
    'net revenue', 'total',
  ]);
  if (!amtCol) return 0;
  const raw = (row[amtCol] || '0').replace(/[$,\s]/g, '');
  return parseFloat(raw) || 0;
}

function extractDate(row, headers) {
  const col = detectCol(headers, [
    'reporting date', 'start date', 'date', 'period', 'sales date', 'transaction date',
  ]);
  if (!col || !row[col]) return new Date().toISOString().split('T')[0];
  // Try to parse various formats
  const raw = row[col].split(/[ T]/)[0];
  const d = new Date(raw + 'T00:00:00');
  return isNaN(d) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
}

function extractArtist(row, headers) {
  const col = detectCol(headers, ['artists', 'artist name', 'artist', 'primary artist']);
  return col ? (row[col] || '') : '';
}

function extractStore(row, headers) {
  const col = detectCol(headers, ['store', 'store name', 'platform', 'service', 'dsp']);
  return col ? (row[col] || '') : '';
}

function extractTitle(row, headers) {
  const col = detectCol(headers, ['title', 'track title', 'release title', 'album', 'song']);
  return col ? (row[col] || '') : '';
}

// Group CSV rows into per-artist totals
function groupByArtist(rows, headers) {
  const map = {};
  for (const row of rows) {
    const artist = extractArtist(row, headers);
    const amount = extractAmount(row, headers);
    const date   = extractDate(row, headers);
    const store  = extractStore(row, headers);
    if (!map[artist]) map[artist] = { artist, amount: 0, rows: 0, date, stores: new Set() };
    map[artist].amount += amount;
    map[artist].rows++;
    if (store) map[artist].stores.add(store);
    // Use earliest date
    if (date < map[artist].date) map[artist].date = date;
  }
  return Object.values(map).filter(g => g.amount !== 0);
}

// ── Main view ─────────────────────────────────────────────────────────────────

export async function renderRoyalties(container, { profile }) {
  const canEdit = profile.role === 'owner' || profile.role === 'team';

  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const { data: artists } = await supabase.from('artists').select('id, stage_name').order('stage_name');
  const { data: allEntries } = await supabase.from('ledger').select('*');

  const entryMap = {};
  (allEntries || []).forEach(e => {
    (entryMap[e.artist_id] = entryMap[e.artist_id] || []).push(e);
  });

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>Royalties</h1>
        <p>Advance tracking &amp; recoupment</p>
      </div>
      ${canEdit ? `
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" id="import-csv-btn">↑ Import CSV</button>
      </div>
      ` : ''}
    </div>
    ${!artists?.length ? `<div style="text-align:center;padding:80px;color:var(--t3)">No artists yet — add artists in Roster first.</div>` : `
    <div class="stat-grid" style="margin-bottom:28px" id="artist-cards">
      ${(artists || []).map(a => artistCard({ ...a, name: a.stage_name }, entryMap[a.id] || [])).join('')}
    </div>
    <div id="ledger-panel"></div>
    `}
  `;

  if (!artists?.length) return;

  container.querySelector('#import-csv-btn')?.addEventListener('click', () => {
    openImportModal(artists, () => renderRoyalties(container, { profile }));
  });

  const ledgerPanel = container.querySelector('#ledger-panel');

  const selectArtist = async (artistId, artistName) => {
    container.querySelectorAll('.artist-balance-card').forEach(c => {
      c.style.outline = c.dataset.id === artistId ? '1px solid var(--border-a)' : '';
    });
    await renderLedger(ledgerPanel, artistId, artistName, canEdit, () => renderRoyalties(container, { profile }));
  };

  container.querySelectorAll('.artist-balance-card').forEach(card => {
    card.addEventListener('click', () => selectArtist(card.dataset.id, card.dataset.name));
  });

  if (artists.length) selectArtist(artists[0].id, artists[0].stage_name || artists[0].name);
}

// ── Artist balance card ───────────────────────────────────────────────────────

function artistCard(artist, entries) {
  const balance = entries.reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalAdvanced = entries.filter(e => e.type === 'advance').reduce((s, e) => s + Math.abs(parseFloat(e.amount)), 0);
  const recouped = balance >= 0;
  const pct = totalAdvanced > 0 ? Math.min(100, Math.max(0, ((totalAdvanced + balance) / totalAdvanced) * 100)) : 100;

  return `
    <div class="stat-card artist-balance-card ${recouped ? '' : 'pink'}" style="cursor:pointer" data-id="${artist.id}" data-name="${artist.name}">
      <div style="font-size:10px;color:var(--t3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">${artist.name}</div>
      <div class="stat-val" style="font-size:26px">${balance < 0 ? '-' : '+'}$${Math.abs(balance).toFixed(2)}</div>
      <div class="stat-label">${recouped ? 'recouped' : 'unrecouped'}</div>
      ${totalAdvanced > 0 ? `
        <div style="margin-top:10px;height:3px;background:var(--glass-2);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct.toFixed(1)}%;background:${recouped ? 'var(--a)' : 'var(--a2)'};transition:width .4s"></div>
        </div>
        <div style="font-size:10px;color:var(--t4);margin-top:4px">${pct.toFixed(0)}% recouped</div>
      ` : ''}
    </div>
  `;
}

// ── Ledger panel ──────────────────────────────────────────────────────────────

async function renderLedger(container, artistId, artistName, canEdit, onRefresh) {
  const { data: entries } = await supabase
    .from('ledger')
    .select('*, releases(title)')
    .eq('artist_id', artistId)
    .order('date', { ascending: false });

  // Quarter presets for statement
  const now = new Date();
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().split('T')[0];
  const qEnd   = now.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">${artistName} — Ledger</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" id="statement-btn">↓ Statement PDF</button>
          ${canEdit ? `<button class="btn btn-secondary btn-sm" id="add-entry">+ Add Entry</button>` : ''}
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Date</th><th>Type</th><th>Description</th><th>Release</th>
          <th style="text-align:right">Amount</th>
          ${canEdit ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${entries?.length ? entries.map(e => {
            const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG.royalty;
            const abs = Math.abs(parseFloat(e.amount));
            return `
              <tr>
                <td class="td-mono" style="color:var(--t3);font-size:11px">${e.date}</td>
                <td><span class="badge ${cfg.badge}">${e.type}</span></td>
                <td>${e.description || '—'}</td>
                <td style="color:var(--t3);font-size:12px">${e.releases?.title || '—'}</td>
                <td class="td-mono" style="text-align:right;color:${cfg.color}">
                  ${cfg.sign > 0 ? '+' : '-'}$${abs.toFixed(2)}
                </td>
                ${canEdit ? `<td class="td-actions">
                  <button class="btn btn-danger btn-sm btn-icon del-entry" data-id="${e.id}">✕</button>
                </td>` : ''}
              </tr>
            `;
          }).join('') : `<tr class="empty-row"><td colspan="${canEdit ? 6 : 5}">No entries yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#statement-btn').addEventListener('click', () => {
    openStatementModal(artistId, artistName, entries || []);
  });

  container.querySelector('#add-entry')?.addEventListener('click', () => openEntryModal(artistId, onRefresh));

  container.querySelectorAll('.del-entry').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this entry?')) return;
      const { error } = await supabase.from('ledger').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Entry deleted'); onRefresh(); }
    });
  });
}

// ── Statement PDF modal ───────────────────────────────────────────────────────

async function openStatementModal(artistId, artistName, entries) {
  const now = new Date();
  const qIdx = Math.floor(now.getMonth() / 3);
  const quarters = [0,1,2,3].map(q => {
    const yr = q > qIdx ? now.getFullYear() - 1 : now.getFullYear();
    const start = new Date(yr, q * 3, 1).toISOString().split('T')[0];
    const end   = new Date(yr, q * 3 + 3, 0).toISOString().split('T')[0];
    return { label: `Q${q+1} ${yr}`, start, end };
  }).reverse();

  // Fetch label name
  const { data: lp } = await supabase.from('label_profile').select('label_name').limit(1).single();
  const labelName = lp?.label_name || 'Sohmna';

  const body = openModal({
    title: 'Royalty Statement',
    body: `
      <form id="stmt-form">
        <div style="margin-bottom:16px;font-size:12px;color:var(--t3)">
          Generate a PDF statement for <strong style="color:var(--t)">${artistName}</strong>
        </div>
        <div class="form-row">
          <div class="field"><label>Quick Period</label>
            <select id="stmt-preset">
              <option value="">Custom range…</option>
              ${quarters.map(q => `<option value="${q.start}|${q.end}">${q.label}</option>`).join('')}
              <option value="ytd|ytd">Year to Date</option>
              <option value="all|all">All Time</option>
            </select>
          </div>
        </div>
        <div class="form-row cols-2" id="stmt-custom">
          <div class="field"><label>From</label>
            <input name="from" type="date" value="${quarters[0].start}">
          </div>
          <div class="field"><label>To</label>
            <input name="to" type="date" value="${now.toISOString().split('T')[0]}">
          </div>
        </div>
        <div style="font-size:11px;color:var(--t3);background:var(--glass-1);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:4px" id="stmt-preview">
          Select a period to preview entry count.
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="stmt-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">↓ Download PDF</button>
        </div>
      </form>
    `,
  });

  const fromInput  = body.querySelector('[name="from"]');
  const toInput    = body.querySelector('[name="to"]');
  const preset     = body.querySelector('#stmt-preset');
  const preview    = body.querySelector('#stmt-preview');
  const customRow  = body.querySelector('#stmt-custom');

  function updatePreview() {
    const from = fromInput.value;
    const to   = toInput.value;
    if (!from || !to) return;
    const count = entries.filter(e => e.date >= from && e.date <= to).length;
    preview.textContent = `${count} entr${count === 1 ? 'y' : 'ies'} in this period`;
  }

  preset.addEventListener('change', () => {
    const v = preset.value;
    if (!v) { customRow.style.display = ''; return; }
    customRow.style.display = 'none';
    if (v === 'ytd|ytd') {
      fromInput.value = `${now.getFullYear()}-01-01`;
      toInput.value   = now.toISOString().split('T')[0];
    } else if (v === 'all|all') {
      const dates = entries.map(e => e.date).filter(Boolean).sort();
      fromInput.value = dates[0] || `${now.getFullYear()}-01-01`;
      toInput.value   = dates[dates.length - 1] || now.toISOString().split('T')[0];
    } else {
      const [s, e] = v.split('|');
      fromInput.value = s;
      toInput.value   = e;
    }
    updatePreview();
  });

  fromInput.addEventListener('change', updatePreview);
  toInput.addEventListener('change', updatePreview);
  updatePreview();

  body.querySelector('#stmt-cancel').addEventListener('click', closeModal);
  body.querySelector('#stmt-form').addEventListener('submit', e => {
    e.preventDefault();
    exportRoyaltyStatementPDF({
      artistName,
      entries,
      periodStart: fromInput.value,
      periodEnd:   toInput.value,
      labelName,
    });
    closeModal();
    toast('Statement downloaded');
  });
}

// ── Distributor CSV Import modal ──────────────────────────────────────────────

function openImportModal(artists, onSave) {
  const body = openModal({
    title: 'Import Distributor CSV',
    size:  'modal-lg',
    body: `
      <div style="margin-bottom:16px;font-size:12px;color:var(--t3)">
        Supports DistroKid, TuneCore, CD Baby, and most distributor exports.
        Each artist row becomes a <strong style="color:var(--t)">royalty</strong> ledger entry.
      </div>
      <div class="field" style="margin-bottom:16px">
        <label>CSV File</label>
        <input type="file" id="csv-file" accept=".csv,text/csv" style="background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;color:var(--t);font-family:var(--mono);font-size:12px;width:100%">
      </div>
      <div id="csv-preview"></div>
      <div class="form-actions" style="margin-top:16px">
        <button type="button" class="btn btn-secondary" id="import-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="import-confirm" style="display:none">Import Entries</button>
      </div>
    `,
  });

  body.querySelector('#import-cancel').addEventListener('click', closeModal);

  let pendingImports = [];

  body.querySelector('#csv-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const { headers, rows } = parseCSV(text);
    if (!rows.length) {
      body.querySelector('#csv-preview').innerHTML = `<p style="color:var(--a2)">Could not parse CSV — check format.</p>`;
      return;
    }

    const fmt = detectFormat(headers);
    const groups = groupByArtist(rows, headers);

    if (!groups.length) {
      body.querySelector('#csv-preview').innerHTML = `<p style="color:var(--a2)">No rows with earnings found. Check that the file has an amount column.</p>`;
      return;
    }

    // Build artist mapping UI
    const artistOptions = artists.map(a => `<option value="${a.id}">${a.stage_name}</option>`).join('');
    pendingImports = groups;

    body.querySelector('#csv-preview').innerHTML = `
      <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--t4);margin-bottom:10px">
        Detected: <span style="color:var(--a3)">${fmt.toUpperCase()}</span> — ${rows.length} rows → ${groups.length} artist group${groups.length > 1 ? 's' : ''}
      </div>
      <div style="max-height:280px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--t4);text-align:left">CSV Artist Name</th>
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--t4);text-align:left">Map to Artist</th>
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--t4);text-align:right">Amount</th>
            <th style="padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--t4);text-align:left">Date</th>
          </tr></thead>
          <tbody>
            ${groups.map((g, i) => {
              // Try to auto-match
              const match = artists.find(a =>
                a.stage_name.toLowerCase() === g.artist.toLowerCase()
              );
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
                  <td style="padding:8px 12px;font-size:12px;color:var(--t)">${g.artist || '(blank)'}</td>
                  <td style="padding:8px 12px">
                    <select class="artist-map" data-idx="${i}" style="background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 8px;color:var(--t);font-family:var(--mono);font-size:11px;outline:none;width:100%">
                      <option value="">— skip —</option>
                      ${artists.map(a => `<option value="${a.id}" ${match?.id === a.id ? 'selected' : ''}>${a.stage_name}</option>`).join('')}
                    </select>
                  </td>
                  <td style="padding:8px 12px;font-size:12px;color:var(--a);text-align:right;font-family:var(--mono)">+$${g.amount.toFixed(2)}</td>
                  <td style="padding:8px 12px;font-size:11px;color:var(--t3);font-family:var(--mono)">${g.date}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    body.querySelector('#import-confirm').style.display = '';
  });

  body.querySelector('#import-confirm').addEventListener('click', async () => {
    const maps = [...body.querySelectorAll('.artist-map')];
    const toInsert = [];

    for (const sel of maps) {
      const artistId = sel.value;
      if (!artistId) continue;
      const g = pendingImports[parseInt(sel.dataset.idx)];
      const stores = g.stores ? [...g.stores].join(', ') : '';
      toInsert.push({
        artist_id:   artistId,
        type:        'royalty',
        amount:      parseFloat(g.amount.toFixed(2)),
        date:        g.date,
        description: stores ? `Distributor import — ${stores}` : 'Distributor import',
      });
    }

    if (!toInsert.length) { toast('No artists mapped — nothing to import', 'error'); return; }

    const { error } = await supabase.from('ledger').insert(toInsert);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Imported ${toInsert.length} entr${toInsert.length === 1 ? 'y' : 'ies'}`);
    closeModal();
    onSave();
  });
}

// ── Add entry modal ───────────────────────────────────────────────────────────

function openEntryModal(artistId, onSave) {
  const body = openModal({
    title: 'Add Ledger Entry',
    body: `
      <form id="entry-form">
        <div class="form-row cols-2">
          <div class="field"><label>Type</label>
            <select name="type">
              <option value="advance">Advance (debit)</option>
              <option value="royalty">Royalty (credit)</option>
              <option value="payment">Payment (credit)</option>
              <option value="expense">Expense (debit)</option>
            </select>
          </div>
          <div class="field"><label>Date</label>
            <input name="date" type="date" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Amount ($) *</label>
            <input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>
          </div>
          <div class="field"><label>Description</label>
            <input name="description" placeholder="e.g. Album advance, Q1 streaming…">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="entry-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Entry</button>
        </div>
      </form>
    `,
  });

  body.querySelector('#entry-cancel').addEventListener('click', closeModal);
  body.querySelector('#entry-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const raw = parseFloat(fd.get('amount'));
    const cfg = TYPE_CONFIG[type];
    const { error } = await supabase.from('ledger').insert({
      artist_id:   artistId,
      type,
      amount:      cfg.sign * Math.abs(raw),
      date:        fd.get('date'),
      description: fd.get('description') || null,
    });
    if (error) toast(error.message, 'error');
    else { toast('Entry added'); closeModal(); onSave(); }
  });
}
