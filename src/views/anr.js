import { supabase } from '../supabase.js';
import { openModal, closeModal } from '../modal.js';
import { toast } from '../toast.js';

const STAGES = [
  { key: 'received',   label: 'Received',  color: 'var(--t3)' },
  { key: 'reviewing',  label: 'Reviewing', color: 'var(--a3)' },
  { key: 'in_talks',   label: 'In Talks',  color: 'var(--a4)' },
  { key: 'signed',     label: 'Signed',    color: 'var(--a)'  },
  { key: 'passed',     label: 'Passed',    color: 'var(--t4)' },
];

const STARS = n => Array.from({ length: 5 }, (_, i) =>
  `<span style="color:${i < n ? 'var(--a4)' : 'var(--t4)'};font-size:11px">★</span>`
).join('');

export async function renderANR(container, { profile }) {
  const canEdit = profile.role === 'owner' || profile.role === 'team';

  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const { data: demos, error } = await supabase
    .from('anr_demos')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error) { container.innerHTML = `<p style="color:var(--a2)">${error.message}</p>`; return; }

  const grouped = {};
  STAGES.forEach(s => { grouped[s.key] = []; });
  (demos || []).forEach(d => {
    if (grouped[d.status]) grouped[d.status].push(d);
  });

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>A&amp;R Pipeline</h1>
        <p>${demos?.length || 0} demos tracked</p>
      </div>
      ${canEdit ? `<button class="btn btn-primary" id="add-demo">+ Add Demo</button>` : ''}
    </div>
    <div class="kanban">
      ${STAGES.map(s => `
        <div class="kanban-col">
          <div class="kanban-col-head">
            <span style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${s.color}">${s.label}</span>
            <span style="font-size:10px;color:var(--t4);background:var(--glass-2);border:1px solid var(--border);padding:2px 8px;border-radius:var(--radius-pill)">${grouped[s.key].length}</span>
          </div>
          <div class="kanban-cards">
            ${grouped[s.key].length ? grouped[s.key].map(d => demoCard(d, canEdit)).join('') :
              `<div style="padding:20px 14px;font-size:11px;color:var(--t4);text-align:center">Empty</div>`}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelector('#add-demo')?.addEventListener('click', () => {
    openDemoModal(null, () => renderANR(container, { profile }));
  });

  if (canEdit) {
    container.querySelectorAll('.demo-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.dataset.id;
        const { data } = await supabase.from('anr_demos').select('*').eq('id', id).single();
        if (data) openDemoModal(data, () => renderANR(container, { profile }));
      });
    });
  }
}

function demoCard(demo, canEdit) {
  return `
    <div class="kanban-card demo-card" data-id="${demo.id}" style="${canEdit ? 'cursor:pointer' : ''}">
      <div style="font-size:12px;font-weight:700;margin-bottom:2px">${demo.artist_name}</div>
      ${demo.title ? `<div style="font-size:11px;color:var(--t3)">${demo.title}</div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap">
        ${demo.genre ? `<span style="font-size:10px;color:var(--t4);background:var(--glass-2);border:1px solid var(--border);padding:2px 7px;border-radius:var(--radius-pill)">${demo.genre}</span>` : ''}
        ${demo.rating ? `<span>${STARS(demo.rating)}</span>` : ''}
      </div>
      ${demo.submitted_by ? `<div style="font-size:10px;color:var(--t4);margin-top:6px">via ${demo.submitted_by}</div>` : ''}
    </div>
  `;
}

function openDemoModal(demo, onSave) {
  const isEdit = !!demo;
  const body = openModal({
    title: isEdit ? 'Edit Demo' : 'Add Demo',
    body: `
      <form id="demo-form">
        <div class="form-row cols-2">
          <div class="field"><label>Artist Name *</label>
            <input name="artist_name" required value="${demo?.artist_name || ''}">
          </div>
          <div class="field"><label>Track / Project Title</label>
            <input name="title" value="${demo?.title || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Genre</label>
            <input name="genre" placeholder="Hip-Hop, R&B…" value="${demo?.genre || ''}">
          </div>
          <div class="field"><label>Submitted By</label>
            <input name="submitted_by" placeholder="Manager, email…" value="${demo?.submitted_by || ''}">
          </div>
        </div>
        <div class="form-row cols-2">
          <div class="field"><label>Status</label>
            <select name="status">
              ${STAGES.map(s => `<option value="${s.key}" ${demo?.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Rating (1–5)</label>
            <select name="rating">
              <option value="">—</option>
              ${[1,2,3,4,5].map(n => `<option value="${n}" ${demo?.rating === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Notes</label>
            <textarea name="notes" rows="3" placeholder="First impressions, context…">${demo?.notes || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          ${isEdit ? `<button type="button" class="btn btn-danger" id="del-demo">Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" id="demo-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add Demo'}</button>
        </div>
      </form>
    `,
  });

  body.querySelector('#demo-cancel').addEventListener('click', closeModal);

  body.querySelector('#del-demo')?.addEventListener('click', async () => {
    if (!confirm('Delete this demo?')) return;
    const { error } = await supabase.from('anr_demos').delete().eq('id', demo.id);
    if (error) toast(error.message, 'error');
    else { toast('Demo deleted'); closeModal(); onSave(); }
  });

  body.querySelector('#demo-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      artist_name:  fd.get('artist_name'),
      title:        fd.get('title') || null,
      genre:        fd.get('genre') || null,
      status:       fd.get('status'),
      rating:       fd.get('rating') ? parseInt(fd.get('rating')) : null,
      notes:        fd.get('notes') || null,
      submitted_by: fd.get('submitted_by') || null,
    };
    const { error } = isEdit
      ? await supabase.from('anr_demos').update(payload).eq('id', demo.id)
      : await supabase.from('anr_demos').insert(payload);
    if (error) toast(error.message, 'error');
    else { toast(isEdit ? 'Demo updated' : 'Demo added'); closeModal(); onSave(); }
  });
}
