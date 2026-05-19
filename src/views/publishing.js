import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

export async function renderPublishing(container, { profile }) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const { data: releases } = await supabase.from('releases').select('id,title').order('title');

  if (!releases?.length) {
    container.innerHTML = `<div style="text-align:center;padding:80px;color:var(--t3)">No releases yet.</div>`;
    return;
  }

  let activeTab = 'splits';
  let selectedRelease = releases[0];

  function render() {
    container.innerHTML = `
      <div class="page-head">
        <div class="page-head-left">
          <h1>Publishing</h1>
          <p>Composition splits &amp; sync licensing</p>
        </div>
        <button class="btn btn-primary" id="pub-add">+ Add</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:20px;align-items:center;flex-wrap:wrap">
        <select id="release-picker" style="background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-pill);padding:8px 14px;color:var(--t);font-family:var(--mono);font-size:12px;outline:none;cursor:pointer">
          ${releases.map(r=>`<option value="${r.id}" ${r.id===selectedRelease.id?'selected':''}>${r.title}</option>`).join('')}
        </select>
        <div style="display:flex;background:var(--glass-1);border:1px solid var(--border);border-radius:var(--radius-pill);padding:3px;gap:3px">
          <button class="tab-btn btn btn-sm ${activeTab==='splits'?'btn-primary':'btn-ghost'}" data-tab="splits" style="border-radius:var(--radius-pill)">Publishing Splits</button>
          <button class="tab-btn btn btn-sm ${activeTab==='sync'?'btn-primary':'btn-ghost'}" data-tab="sync" style="border-radius:var(--radius-pill)">Sync Licenses</button>
        </div>
      </div>
      <div id="pub-panel"></div>
    `;

    const panel = container.querySelector('#pub-panel');
    const picker = container.querySelector('#release-picker');

    picker.addEventListener('change', e => {
      selectedRelease = releases.find(r => r.id === e.target.value);
      loadPanel();
    });

    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    container.querySelector('#pub-add')?.addEventListener('click', () => {
      if (activeTab === 'splits') openSplitModal(null, selectedRelease, loadPanel);
      else openSyncModal(null, selectedRelease, releases, loadPanel);
    });

    function loadPanel() {
      if (activeTab === 'splits') renderSplitsPanel(panel, selectedRelease, loadPanel);
      else renderSyncPanel(panel, selectedRelease, releases, loadPanel);
    }
    loadPanel();
  }

  render();
}

async function renderSplitsPanel(container, release, onRefresh) {
  const { data: splits } = await supabase
    .from('pub_splits').select('*').eq('release_id', release.id).order('created_at');

  const total = (splits||[]).reduce((s,x) => s + parseFloat(x.share_pct||0), 0);

  container.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">Publishing Splits — ${release.title}</span>
        <span style="font-size:11px;font-family:var(--mono);color:${Math.abs(total-100)<0.01?'var(--a)':'var(--a2)'}">${total.toFixed(1)}% total</span>
      </div>
      ${(splits||[]).length ? `
        <div style="padding:10px 20px">
          <div class="split-bar" style="height:6px;margin-bottom:4px">
            ${(splits||[]).map((s,i)=>`<div class="split-segment" style="width:${s.share_pct||0}%;background:hsl(${(i*67)%360},60%,65%)"></div>`).join('')}
          </div>
        </div>
      ` : ''}
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>PRO</th><th>IPI</th><th style="text-align:right">Share %</th><th></th></tr></thead>
        <tbody>
          ${(splits||[]).length ? (splits||[]).map(s=>`
            <tr>
              <td><strong>${s.name}</strong></td>
              <td><span class="badge badge-dim">${s.role}</span></td>
              <td style="color:var(--t3);font-size:12px">${s.pro||'—'}</td>
              <td class="td-mono" style="color:var(--t3);font-size:11px">${s.ipi||'—'}</td>
              <td class="td-mono" style="text-align:right;color:var(--a)">${s.share_pct!=null?s.share_pct+'%':'—'}</td>
              <td class="td-actions">
                <button class="btn btn-ghost btn-sm btn-icon edit-split" data-id="${s.id}">✎</button>
                <button class="btn btn-danger btn-sm btn-icon del-split" data-id="${s.id}">✕</button>
              </td>
            </tr>
          `).join('') : `<tr class="empty-row"><td colspan="6">No publishing splits yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.edit-split').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const s = splits.find(x=>x.id===btn.dataset.id);
      if (s) openSplitModal(s, release, onRefresh);
    });
  });
  container.querySelectorAll('.del-split').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this split?')) return;
      const { error } = await supabase.from('pub_splits').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Split deleted'); onRefresh(); }
    });
  });
}

async function renderSyncPanel(container, release, releases, onRefresh) {
  const { data: licenses } = await supabase
    .from('sync_licenses').select('*').eq('release_id', release.id).order('created_at', {ascending:false});

  container.innerHTML = `
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">Sync Licenses — ${release.title}</span>
        <span style="font-size:11px;color:var(--t3)">${licenses?.length||0} licenses</span>
      </div>
      <table>
        <thead><tr><th>Licensee</th><th>Usage</th><th>Territory</th><th>Term</th><th style="text-align:right">Fee</th><th></th></tr></thead>
        <tbody>
          ${(licenses||[]).length ? (licenses||[]).map(l=>`
            <tr>
              <td><strong>${l.licensee}</strong></td>
              <td><span class="badge badge-blue">${l.usage||'—'}</span></td>
              <td style="color:var(--t3);font-size:12px">${l.territory||'—'}</td>
              <td class="td-mono" style="color:var(--t3);font-size:11px">${l.term_start||'—'}${l.term_end?' → '+l.term_end:''}</td>
              <td class="td-mono" style="text-align:right;color:var(--a)">${l.fee!=null?'$'+parseFloat(l.fee).toFixed(2):'—'}</td>
              <td class="td-actions">
                <button class="btn btn-ghost btn-sm btn-icon edit-sync" data-id="${l.id}">✎</button>
                <button class="btn btn-danger btn-sm btn-icon del-sync" data-id="${l.id}">✕</button>
              </td>
            </tr>
          `).join('') : `<tr class="empty-row"><td colspan="6">No sync licenses yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.edit-sync').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const l = licenses.find(x=>x.id===btn.dataset.id);
      if (l) openSyncModal(l, release, releases, onRefresh);
    });
  });
  container.querySelectorAll('.del-sync').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this license?')) return;
      const { error } = await supabase.from('sync_licenses').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('License deleted'); onRefresh(); }
    });
  });
}

function openSplitModal(split, release, onSave) {
  const isEdit = !!split;
  const body = openModal({
    title: isEdit ? 'Edit Split' : 'Add Publishing Split',
    body: `
      <form id="split-form">
        <div class="form-row cols-2">
          <div class="field"><label>Name *</label>
            <input name="name" required placeholder="Writer / Publisher name" value="${split?.name||''}">
          </div>
          <div class="field"><label>Role</label>
            <select name="role">
              ${['writer','co-writer','publisher','co-publisher'].map(r=>`<option value="${r}" ${split?.role===r?'selected':''}>${r}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Share %</label>
            <input name="share_pct" type="number" min="0" max="100" step="0.01" placeholder="50.00" value="${split?.share_pct??''}">
          </div>
          <div class="field"><label>PRO</label>
            <select name="pro">
              <option value="">—</option>
              ${['ASCAP','BMI','SESAC','SOCAN','PRS','APRA','GEMA','SACEM','Other'].map(p=>`<option value="${p}" ${split?.pro===p?'selected':''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>IPI Number</label>
            <input name="ipi" placeholder="00123456789" value="${split?.ipi||''}">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="sp-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit?'Save':'Add Split'}</button>
        </div>
      </form>`,
  });
  body.querySelector('#sp-cancel').addEventListener('click', closeModal);
  body.querySelector('#split-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      release_id: release.id,
      name:       fd.get('name'),
      role:       fd.get('role'),
      share_pct:  fd.get('share_pct') ? parseFloat(fd.get('share_pct')) : null,
      pro:        fd.get('pro') || null,
      ipi:        fd.get('ipi') || null,
    };
    const { error } = isEdit
      ? await supabase.from('pub_splits').update(payload).eq('id', split.id)
      : await supabase.from('pub_splits').insert(payload);
    if (error) toast(error.message, 'error');
    else { toast(isEdit?'Split updated':'Split added'); closeModal(); onSave(); }
  });
}

function openSyncModal(license, release, releases, onSave) {
  const isEdit = !!license;
  const body = openModal({
    title: isEdit ? 'Edit Sync License' : 'Add Sync License',
    body: `
      <form id="sync-form">
        <div class="form-row cols-2">
          <div class="field"><label>Licensee *</label>
            <input name="licensee" required placeholder="Netflix, Adidas, A24…" value="${license?.licensee||''}">
          </div>
          <div class="field"><label>Usage</label>
            <select name="usage">
              ${['TV','Film','Ad','Game','Trailer','Other'].map(u=>`<option value="${u}" ${license?.usage===u?'selected':''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Fee ($)</label>
            <input name="fee" type="number" min="0" step="0.01" placeholder="0.00" value="${license?.fee??''}">
          </div>
          <div class="field"><label>Territory</label>
            <input name="territory" placeholder="Worldwide, US only…" value="${license?.territory||''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Term Start</label>
            <input name="term_start" type="date" value="${license?.term_start||''}">
          </div>
          <div class="field"><label>Term End</label>
            <input name="term_end" type="date" value="${license?.term_end||''}">
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Notes</label>
            <textarea name="notes" rows="2">${license?.notes||''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="sy-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit?'Save':'Add License'}</button>
        </div>
      </form>`,
  });
  body.querySelector('#sy-cancel').addEventListener('click', closeModal);
  body.querySelector('#sync-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      release_id: release.id,
      licensee:   fd.get('licensee'),
      usage:      fd.get('usage'),
      fee:        fd.get('fee') ? parseFloat(fd.get('fee')) : null,
      territory:  fd.get('territory') || null,
      term_start: fd.get('term_start') || null,
      term_end:   fd.get('term_end') || null,
      notes:      fd.get('notes') || null,
    };
    const { error } = isEdit
      ? await supabase.from('sync_licenses').update(payload).eq('id', license.id)
      : await supabase.from('sync_licenses').insert(payload);
    if (error) toast(error.message, 'error');
    else { toast(isEdit?'License updated':'License added'); closeModal(); onSave(); }
  });
}
