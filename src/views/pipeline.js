import { supabase } from '../supabase.js';
import { toast } from '../toast.js';

const STAGES = [
  { key: 'idea',        label: 'Idea',        color: 'var(--t3)' },
  { key: 'in_progress', label: 'In Progress',  color: 'var(--a3)' },
  { key: 'mastering',   label: 'Mastering',    color: 'var(--a4)' },
  { key: 'submitted',   label: 'Submitted',    color: 'var(--a2)' },
  { key: 'live',        label: 'Live',         color: 'var(--a)'  },
];

export async function renderPipeline(container, { profile }) {
  const canEdit = profile.role === 'owner' || profile.role === 'team';

  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const { data: releases, error } = await supabase
    .from('releases')
    .select('id, title, release_date, release_type, cover_url, pipeline_status, release_artists(artists(name))')
    .order('created_at', { ascending: false });

  if (error) { container.innerHTML = `<p style="color:var(--a2)">${error.message}</p>`; return; }

  const grouped = {};
  STAGES.forEach(s => { grouped[s.key] = []; });
  (releases || []).forEach(r => {
    const key = r.pipeline_status || 'in_progress';
    if (grouped[key]) grouped[key].push(r);
    else grouped['in_progress'].push(r);
  });

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>Pipeline</h1>
        <p>${releases?.length || 0} releases tracked</p>
      </div>
    </div>
    <div class="kanban">
      ${STAGES.map(s => `
        <div class="kanban-col">
          <div class="kanban-col-head">
            <span style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${s.color}">${s.label}</span>
            <span style="font-size:10px;color:var(--t4);background:var(--glass-2);border:1px solid var(--border);padding:2px 8px;border-radius:var(--radius-pill)">${grouped[s.key].length}</span>
          </div>
          <div class="kanban-cards" data-stage="${s.key}">
            ${grouped[s.key].length ? grouped[s.key].map(r => renderCard(r, s, canEdit)).join('') :
              `<div style="padding:20px 14px;font-size:11px;color:var(--t4);text-align:center">Empty</div>`}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  if (canEdit) {
    container.querySelectorAll('.pipeline-status-sel').forEach(sel => {
      sel.addEventListener('change', async e => {
        e.stopPropagation();
        const releaseId = sel.dataset.id;
        const newStatus = sel.value;
        const { error } = await supabase.from('releases').update({ pipeline_status: newStatus }).eq('id', releaseId);
        if (error) { toast(error.message, 'error'); return; }
        toast('Status updated');
        renderPipeline(container, { profile });
      });
    });
  }
}

function renderCard(r, currentStage, canEdit) {
  const artists = (r.release_artists || []).map(ra => ra.artists?.name).filter(Boolean).join(', ') || '—';
  const date = r.release_date ? new Date(r.release_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;

  return `
    <div class="kanban-card">
      <div style="display:flex;gap:10px;align-items:flex-start">
        ${r.cover_url ? `<img src="${r.cover_url}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--border)">` :
          `<div style="width:36px;height:36px;border-radius:6px;background:var(--glass-2);border:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px">◎</div>`}
        <div style="min-width:0;flex:1">
          <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.title}</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${artists}</div>
          ${date ? `<div style="font-size:10px;color:var(--t4);margin-top:4px">${date}</div>` : ''}
        </div>
      </div>
      ${canEdit ? `
        <div style="margin-top:10px">
          <select class="pipeline-status-sel" data-id="${r.id}"
            style="width:100%;background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 8px;color:var(--t);font-family:var(--mono);font-size:10px;letter-spacing:.06em;outline:none;cursor:pointer">
            ${STAGES.map(s => `<option value="${s.key}" ${r.pipeline_status === s.key || (!r.pipeline_status && s.key === 'in_progress') ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>
      ` : ''}
    </div>
  `;
}
