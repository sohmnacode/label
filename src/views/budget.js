import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

const CATEGORIES = ['recording','mixing','mastering','artwork','marketing','promo','distribution','other'];
const CAT_COLORS  = { recording:'var(--a3)', mixing:'var(--a)', mastering:'var(--a4)', artwork:'var(--a2)', marketing:'var(--a4)', promo:'var(--a3)', distribution:'var(--t2)', other:'var(--t3)' };

export async function renderBudget(container, { profile }) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const { data: releases } = await supabase.from('releases').select('id, title').order('title');
  if (!releases?.length) {
    container.innerHTML = `<div style="text-align:center;padding:80px;color:var(--t3)">No releases yet — create releases first.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>Budget</h1>
        <p>Per-release cost tracking &amp; P&amp;L</p>
      </div>
    </div>
    <div style="margin-bottom:24px">
      <select id="release-picker" style="background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-pill);padding:9px 16px;color:var(--t);font-family:var(--mono);font-size:12px;outline:none;cursor:pointer;min-width:240px">
        ${releases.map(r => `<option value="${r.id}">${r.title}</option>`).join('')}
      </select>
    </div>
    <div id="budget-panel"></div>
  `;

  const panel = container.querySelector('#budget-panel');
  const picker = container.querySelector('#release-picker');

  const loadRelease = (releaseId) => {
    const release = releases.find(r => r.id === releaseId);
    renderBudgetPanel(panel, release, () => loadRelease(releaseId));
  };

  picker.addEventListener('change', e => loadRelease(e.target.value));
  loadRelease(releases[0].id);
}

async function renderBudgetPanel(container, release, onRefresh) {
  const [{ data: entries }, { data: ledger }] = await Promise.all([
    supabase.from('budget_entries').select('*').eq('release_id', release.id).order('date', { ascending: false }),
    supabase.from('ledger').select('amount, type').eq('release_id', release.id),
  ]);

  const totalSpent    = (entries || []).reduce((s, e) => s + parseFloat(e.amount), 0);
  const totalRoyalties = (ledger || []).filter(l => l.type === 'royalty' || l.type === 'payment').reduce((s, l) => s + parseFloat(l.amount), 0);
  const plNet          = totalRoyalties - totalSpent;

  // Category breakdown
  const byCat = {};
  (entries || []).forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + parseFloat(e.amount);
  });

  container.innerHTML = `
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat-card pink">
        <div class="stat-val">$${totalSpent.toFixed(2)}</div>
        <div class="stat-label">Total Spent</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">$${totalRoyalties.toFixed(2)}</div>
        <div class="stat-label">Royalties In</div>
      </div>
      <div class="stat-card ${plNet >= 0 ? '' : 'pink'}">
        <div class="stat-val">${plNet >= 0 ? '+' : ''}$${plNet.toFixed(2)}</div>
        <div class="stat-label">Net P&amp;L</div>
      </div>
    </div>

    ${Object.keys(byCat).length ? `
      <div class="table-wrap" style="margin-bottom:20px">
        <div class="table-header">
          <span class="table-title">By Category</span>
        </div>
        <div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">
          ${Object.entries(byCat).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => {
            const pct = totalSpent > 0 ? (amt / totalSpent) * 100 : 0;
            return `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
                  <span style="color:${CAT_COLORS[cat]}">${cat}</span>
                  <span style="color:var(--t3);font-family:var(--mono)">$${amt.toFixed(2)} · ${pct.toFixed(0)}%</span>
                </div>
                <div style="height:3px;background:var(--glass-2);border-radius:2px;overflow:hidden">
                  <div style="height:100%;width:${pct.toFixed(1)}%;background:${CAT_COLORS[cat]};transition:width .4s"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">Expenses — ${release.title}</span>
        <button class="btn btn-secondary btn-sm" id="add-expense">+ Add Expense</button>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style="text-align:right">Amount</th><th></th></tr></thead>
        <tbody>
          ${entries?.length ? entries.map(e => `
            <tr>
              <td class="td-mono" style="color:var(--t3);font-size:11px">${e.date}</td>
              <td><span style="font-size:10px;color:${CAT_COLORS[e.category]}">${e.category}</span></td>
              <td style="font-size:12px">${e.description || '—'}</td>
              <td class="td-mono" style="text-align:right;color:var(--a2)">-$${parseFloat(e.amount).toFixed(2)}</td>
              <td class="td-actions">
                <button class="btn btn-danger btn-sm btn-icon del-expense" data-id="${e.id}">✕</button>
              </td>
            </tr>
          `).join('') : `<tr class="empty-row"><td colspan="5">No expenses yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#add-expense')?.addEventListener('click', () => openExpenseModal(release.id, onRefresh));
  container.querySelectorAll('.del-expense').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this expense?')) return;
      const { error } = await supabase.from('budget_entries').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Expense deleted'); onRefresh(); }
    });
  });
}

function openExpenseModal(releaseId, onSave) {
  const body = openModal({
    title: 'Add Expense',
    body: `
      <form id="expense-form">
        <div class="form-row cols-2">
          <div class="field"><label>Category</label>
            <select name="category">
              ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
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
            <input name="description" placeholder="Studio session, designer fee…">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="exp-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Expense</button>
        </div>
      </form>
    `,
  });
  body.querySelector('#exp-cancel').addEventListener('click', closeModal);
  body.querySelector('#expense-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await supabase.from('budget_entries').insert({
      release_id:  releaseId,
      category:    fd.get('category'),
      description: fd.get('description') || null,
      amount:      parseFloat(fd.get('amount')),
      date:        fd.get('date'),
    });
    if (error) toast(error.message, 'error');
    else { toast('Expense added'); closeModal(); onSave(); }
  });
}
