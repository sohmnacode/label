import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';
import { fileUploadField, bindFileUploads, getSignedUrl } from '../upload.js';

const CONTRACT_TYPES   = ['recording','distribution','management','publishing','licensing'];
const CONTRACT_STATUSES = ['draft','sent','signed','expired','terminated'];

export async function renderContracts(container, state) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading</div>`;
  const isOwner = state.profile?.role === 'owner';
  await loadContracts(container, state, isOwner, '');
}

async function loadContracts(container, state, isOwner, search) {
  let query = supabase
    .from('contracts')
    .select('*, artists(stage_name)')
    .order('expiry_date', { ascending: true });

  if (search) query = query.ilike('title', `%${search}%`);

  const { data: contracts, error } = await query;
  if (error) { container.innerHTML = `<p style="color:var(--a2)">Error: ${error.message}</p>`; return; }

  const now = new Date();
  const expiringSoon = (contracts || []).filter(c => {
    if (!c.expiry_date || c.status === 'expired' || c.status === 'terminated') return false;
    const days = (new Date(c.expiry_date) - now) / 86400000;
    return days >= 0 && days <= 60;
  });

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <p style="color:var(--t3);font-size:12px">${contracts?.length || 0} total${expiringSoon.length ? ` &mdash; <span style="color:var(--a4)">${expiringSoon.length} expiring within 60 days</span>` : ''}</p>
      </div>
      ${isOwner ? `<button class="btn btn-primary" id="add-contract">+ New Contract</button>` : ''}
    </div>

    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">All Contracts</span>
        <div class="table-search">
          <input type="text" id="contract-search" placeholder="Search…" value="${search}">
        </div>
      </div>
      <table>
        <thead><tr>
          <th>Title</th><th>Artist</th><th>Type</th><th>Status</th><th>Signed</th><th>Expires</th>
          ${isOwner ? '<th></th>' : ''}
        </tr></thead>
        <tbody>
          ${contracts?.length ? contracts.map(c => {
            const expiring = c.expiry_date && c.status !== 'expired' && c.status !== 'terminated'
              && (new Date(c.expiry_date) - now) / 86400000 <= 60
              && (new Date(c.expiry_date) - now) / 86400000 >= 0;
            return `
              <tr data-id="${c.id}">
                <td><strong>${c.title}</strong></td>
                <td>${c.artists?.stage_name || '—'}</td>
                <td><span class="badge badge-dim">${c.type}</span></td>
                <td>${statusBadge(c.status)}</td>
                <td class="td-mono text-dim">${c.signed_date ? formatDate(c.signed_date) : '—'}</td>
                <td class="td-mono ${expiring ? 'text-accent' : 'text-dim'}" style="${expiring ? 'color:var(--a4)' : ''}">
                  ${c.expiry_date ? formatDate(c.expiry_date) : '—'}
                  ${expiring ? ' ⚠' : ''}
                </td>
                ${isOwner ? `<td class="td-actions">
                  <button class="btn btn-ghost btn-sm btn-icon edit-contract" data-id="${c.id}" title="Edit">✎</button>
                  <button class="btn btn-danger btn-sm btn-icon del-contract" data-id="${c.id}" title="Delete">✕</button>
                </td>` : ''}
              </tr>
            `;
          }).join('') : `<tr class="empty-row"><td colspan="${isOwner ? 7 : 6}">No contracts yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#contract-search')?.addEventListener('input', e => {
    loadContracts(container, state, isOwner, e.target.value);
  });

  container.querySelector('#add-contract')?.addEventListener('click', () => {
    openContractModal(null, state, () => loadContracts(container, state, isOwner, search));
  });

  container.querySelectorAll('.edit-contract').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { data } = await supabase.from('contracts').select('*').eq('id', btn.dataset.id).single();
      if (data) openContractModal(data, state, () => loadContracts(container, state, isOwner, search));
    });
  });

  container.querySelectorAll('.del-contract').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this contract record?')) return;
      const { error } = await supabase.from('contracts').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Contract deleted'); loadContracts(container, state, isOwner, search); }
    });
  });
}

async function openContractModal(contract, state, onSave) {
  const isEdit = !!contract;
  const { data: artists } = await supabase.from('artists').select('id, stage_name').order('stage_name');

  const body = openModal({
    title: isEdit ? 'Edit Contract' : 'New Contract',
    body: `
      <form id="contract-form">
        <div class="form-row">
          <div class="field"><label>Contract Title *</label>
            <input name="title" required value="${contract?.title || ''}" placeholder="e.g. Recording Agreement — Artist Name">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Artist *</label>
            <select name="artist_id" required>
              <option value="">Select artist…</option>
              ${(artists || []).map(a =>
                `<option value="${a.id}" ${contract?.artist_id === a.id ? 'selected' : ''}>${a.stage_name}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field"><label>Type</label>
            <select name="type">
              ${CONTRACT_TYPES.map(t =>
                `<option value="${t}" ${contract?.type === t ? 'selected' : ''}>${t}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-row cols-3">
          <div class="field"><label>Status</label>
            <select name="status">
              ${CONTRACT_STATUSES.map(s =>
                `<option value="${s}" ${contract?.status === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field"><label>Signed Date</label>
            <input name="signed_date" type="date" value="${contract?.signed_date || ''}">
          </div>
          <div class="field"><label>Expiry Date</label>
            <input name="expiry_date" type="date" value="${contract?.expiry_date || ''}">
          </div>
        </div>
        <div class="form-row">
          ${fileUploadField({ label:'Contract File', accept:'application/pdf,image/jpeg,image/png', hint:'PDF, JPEG, or PNG — max 20MB. Stored privately.', currentUrl: contract?.file_url || '', bucket:'contracts', prefix:'contracts/' })}
        </div>
        <div class="form-row">
          <div class="field"><label>Notes</label>
            <textarea name="notes">${contract?.notes || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="contract-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Contract'}</button>
        </div>
      </form>
    `,
    size: 'modal-lg',
  });

  body.querySelector('#contract-cancel').addEventListener('click', closeModal);
  bindFileUploads(body);

  body.querySelector('#contract-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fileInput = body.querySelector('[name^="fu-"][type="hidden"]');
    const payload = {
      title:       fd.get('title'),
      artist_id:   fd.get('artist_id'),
      type:        fd.get('type'),
      status:      fd.get('status'),
      signed_date: fd.get('signed_date') || null,
      expiry_date: fd.get('expiry_date') || null,
      file_url:    fileInput?.value || null,
      notes:       fd.get('notes') || null,
    };

    if (!isEdit) payload.label_id = state.profile.id;

    const { error } = isEdit
      ? await supabase.from('contracts').update(payload).eq('id', contract.id)
      : await supabase.from('contracts').insert(payload);

    if (error) toast(error.message, 'error');
    else { toast(isEdit ? 'Contract updated' : 'Contract created'); closeModal(); onSave(); }
  });
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function statusBadge(status) {
  const map = {
    signed: 'badge-green',
    sent: 'badge-blue',
    draft: 'badge-dim',
    expired: 'badge-pink',
    terminated: 'badge-pink',
  };
  return `<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}
