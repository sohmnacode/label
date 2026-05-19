import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

const TYPE_CONFIG = {
  advance:  { sign: -1, color: 'var(--a2)', badge: 'badge-pink' },
  expense:  { sign: -1, color: 'var(--a2)', badge: 'badge-pink' },
  royalty:  { sign:  1, color: 'var(--a)',  badge: 'badge-green' },
  payment:  { sign:  1, color: 'var(--a)',  badge: 'badge-green' },
};

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
    </div>
    ${!artists?.length ? `<div style="text-align:center;padding:80px;color:var(--t3)">No artists yet — add artists in Roster first.</div>` : `
    <div class="stat-grid" style="margin-bottom:28px" id="artist-cards">
      ${(artists || []).map(a => artistCard({ ...a, name: a.stage_name }, entryMap[a.id] || [])).join('')}
    </div>
    <div id="ledger-panel"></div>
    `}
  `;

  if (!artists?.length) return;

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

async function renderLedger(container, artistId, artistName, canEdit, onRefresh) {
  const { data: entries } = await supabase
    .from('ledger')
    .select('*, releases(title)')
    .eq('artist_id', artistId)
    .order('date', { ascending: false });

  container.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">${artistName} — Ledger</span>
        ${canEdit ? `<button class="btn btn-secondary btn-sm" id="add-entry">+ Add Entry</button>` : ''}
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
