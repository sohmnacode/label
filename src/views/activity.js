import { supabase } from '../supabase.js';

export async function renderActivity(container) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const [
    { data: releases },
    { data: contracts },
    { data: pitches },
    { data: press },
    { data: demos },
    { data: ledger },
    { data: checklist },
  ] = await Promise.all([
    supabase.from('releases').select('id,title,created_at,status').order('created_at',{ascending:false}).limit(6),
    supabase.from('contracts').select('id,title,created_at').order('created_at',{ascending:false}).limit(6),
    supabase.from('pitches').select('id,platform,target,created_at,releases(title)').order('created_at',{ascending:false}).limit(6),
    supabase.from('press_pitches').select('id,outlet,type,created_at').order('created_at',{ascending:false}).limit(6),
    supabase.from('anr_demos').select('id,artist_name,status,created_at').order('created_at',{ascending:false}).limit(6),
    supabase.from('ledger').select('id,type,amount,created_at').order('created_at',{ascending:false}).limit(6),
    supabase.from('checklist_items').select('id,title,completed_at,releases(title)').eq('completed',true).not('completed_at','is',null).order('completed_at',{ascending:false}).limit(6),
  ]);

  const events = [
    ...(releases||[]).map(r=>({ date:r.created_at, icon:'◎', color:'var(--a)',  label:`Release added`, text:r.title,      badge:r.status })),
    ...(contracts||[]).map(c=>({ date:c.created_at, icon:'▤', color:'var(--a3)', label:`Contract`,      text:c.title||'Untitled' })),
    ...(pitches||[]).map(p=>({ date:p.created_at,  icon:'↗', color:'var(--a3)', label:`DSP Pitch`,     text:`${p.platform}${p.releases?.title?' — '+p.releases.title:''}` })),
    ...(press||[]).map(p=>({ date:p.created_at,    icon:'◈', color:'var(--a4)', label:`Press Pitch`,   text:p.outlet })),
    ...(demos||[]).map(d=>({ date:d.created_at,    icon:'★', color:'var(--a4)', label:`A&R Demo`,      text:d.artist_name, badge:d.status })),
    ...(ledger||[]).map(l=>({ date:l.created_at,   icon:'$', color:parseFloat(l.amount)>=0?'var(--a)':'var(--a2)', label:l.type, text:`$${Math.abs(parseFloat(l.amount)).toFixed(2)}` })),
    ...(checklist||[]).map(c=>({ date:c.completed_at, icon:'✓', color:'var(--a)', label:`Completed`, text:`${c.title}${c.releases?.title?' ('+c.releases.title+')':''}` })),
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,40);

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>Activity</h1>
        <p>Recent label events</p>
      </div>
    </div>
    <div class="table-wrap">
      ${events.length ? `
        <div>
          ${events.map(e=>`
            <div style="display:flex;align-items:center;gap:14px;padding:13px 20px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background .12s" onmouseover="this.style.background='var(--glass-1)'" onmouseout="this.style.background=''">
              <div style="width:30px;height:30px;border-radius:50%;background:${e.color}15;border:1px solid ${e.color}28;display:flex;align-items:center;justify-content:center;font-size:11px;color:${e.color};flex-shrink:0">${e.icon}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--t4);margin-bottom:2px">${e.label}</div>
                <div style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.text}</div>
              </div>
              ${e.badge ? `<span class="badge badge-dim" style="font-size:9px">${e.badge}</span>` : ''}
              <div style="font-size:10px;color:var(--t4);white-space:nowrap;flex-shrink:0">${timeAgo(e.date)}</div>
            </div>
          `).join('')}
        </div>
      ` : `<div style="padding:64px;text-align:center;color:var(--t3);font-size:12px">No activity yet</div>`}
    </div>
  `;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
