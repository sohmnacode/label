import { supabase } from '../supabase.js';
import { toast } from '../toast.js';

const DEFAULT_ITEMS = [
  'Artwork finalized',
  'Mastering complete',
  'ISRC registered',
  'DSP submission',
  'Social assets ready',
  'Splits signed',
];

export async function renderChecklist(container, release, canEdit) {
  const { data: items, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('release_id', release.id)
    .order('sort_order');

  if (error) return;

  const total    = items?.length || 0;
  const done     = (items || []).filter(i => i.completed).length;
  const pct      = total ? Math.round((done / total) * 100) : 0;

  container.innerHTML = `
    <div style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--t3)">Checklist</span>
          <span style="font-size:10px;color:var(--t4)">${done}/${total}</span>
          ${total ? `
            <div style="width:80px;height:3px;background:var(--glass-2);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${pct===100?'var(--a)':'var(--a3)'};transition:width .3s"></div>
            </div>
          ` : ''}
        </div>
        ${canEdit ? `<div style="display:flex;gap:6px">
          ${!total ? `<button class="btn btn-ghost btn-sm" id="cl-defaults">+ Defaults</button>` : ''}
          <button class="btn btn-ghost btn-sm" id="cl-add">+ Item</button>
        </div>` : ''}
      </div>
      <div id="cl-items" style="display:flex;flex-direction:column;gap:4px">
        ${(items || []).map(item => checklistItemHTML(item, canEdit)).join('')}
        ${!total ? `<div style="font-size:11px;color:var(--t4);padding:8px 0">No checklist items yet.</div>` : ''}
      </div>
    </div>
  `;

  bindChecklist(container, release, canEdit, () => renderChecklist(container, release, canEdit));
}

function checklistItemHTML(item, canEdit) {
  return `
    <div class="cl-item" data-id="${item.id}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--radius-sm);transition:background .15s;${canEdit?'cursor:pointer':''}">
      <div class="cl-check" data-id="${item.id}" style="
        width:16px;height:16px;border-radius:4px;flex-shrink:0;
        border:1px solid ${item.completed ? 'var(--a)' : 'var(--border-h)'};
        background:${item.completed ? 'var(--a)' : 'transparent'};
        display:flex;align-items:center;justify-content:center;
        transition:all .15s;${canEdit?'cursor:pointer':''}
      ">${item.completed ? `<svg viewBox="0 0 10 10" fill="none" stroke="#050a07" stroke-width="1.8" style="width:10px"><polyline points="1.5,5 4,7.5 8.5,2.5"/></svg>` : ''}</div>
      <span style="flex:1;font-size:12px;${item.completed ? 'color:var(--t3);text-decoration:line-through' : 'color:var(--t)'}">${item.title}</span>
      ${item.due_date ? `<span style="font-size:10px;color:var(--t4)">${item.due_date}</span>` : ''}
      ${canEdit ? `<button class="cl-del btn btn-ghost btn-sm btn-icon" data-id="${item.id}" style="opacity:0;width:22px;height:22px;padding:0;font-size:11px">✕</button>` : ''}
    </div>
  `;
}

function bindChecklist(container, release, canEdit, onRefresh) {
  // Toggle complete
  container.querySelectorAll('.cl-check').forEach(el => {
    if (!canEdit) return;
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const id = el.dataset.id;
      const row = el.closest('.cl-item');
      const isChecked = el.style.background.includes('var(--a)');
      await supabase.from('checklist_items').update({
        completed: !isChecked,
        completed_at: !isChecked ? new Date().toISOString() : null,
      }).eq('id', id);
      onRefresh();
    });
  });

  // Hover show delete button
  container.querySelectorAll('.cl-item').forEach(row => {
    const del = row.querySelector('.cl-del');
    if (!del) return;
    row.addEventListener('mouseenter', () => del.style.opacity = '1');
    row.addEventListener('mouseleave', () => del.style.opacity = '0');
    del.addEventListener('click', async e => {
      e.stopPropagation();
      await supabase.from('checklist_items').delete().eq('id', del.dataset.id);
      onRefresh();
    });
  });

  // Add defaults
  container.querySelector('#cl-defaults')?.addEventListener('click', async () => {
    await supabase.from('checklist_items').insert(
      DEFAULT_ITEMS.map((title, i) => ({ release_id: release.id, title, sort_order: i }))
    );
    onRefresh();
  });

  // Add single item
  container.querySelector('#cl-add')?.addEventListener('click', async () => {
    const title = prompt('Checklist item:');
    if (!title?.trim()) return;
    const { data: existing } = await supabase.from('checklist_items').select('sort_order').eq('release_id', release.id).order('sort_order', { ascending: false }).limit(1);
    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;
    const { error } = await supabase.from('checklist_items').insert({ release_id: release.id, title: title.trim(), sort_order: nextOrder });
    if (error) toast(error.message, 'error');
    else onRefresh();
  });
}
