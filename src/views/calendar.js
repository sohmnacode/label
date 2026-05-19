import { supabase } from '../supabase.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export async function renderCalendar(container, { profile }) {
  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const safe = q => q.then(r => r).catch(() => ({ data: null }));

  const [r1, r2, r3, r4] = await Promise.all([
    safe(supabase.from('releases').select('id, title, release_date')),
    safe(supabase.from('contracts').select('id, title, expiry_date')),
    safe(supabase.from('pitches').select('id, platform, target, pitched_at')),
    safe(supabase.from('press_pitches').select('id, outlet, sent_at')),
  ]);

  const releases     = r1.data || [];
  const contracts    = r2.data || [];
  const pitches      = r3.data || [];
  const pressPitches = r4.data || [];

  let year  = new Date().getFullYear();
  let month = new Date().getMonth();

  function draw() {
    drawMonth(container, { releases, contracts, pitches, pressPitches }, year, month);
    container.querySelector('#cal-prev')?.addEventListener('click', () => {
      month--; if (month < 0) { month = 11; year--; } draw();
    });
    container.querySelector('#cal-next')?.addEventListener('click', () => {
      month++; if (month > 11) { month = 0; year++; } draw();
    });
    container.querySelector('#cal-today')?.addEventListener('click', () => {
      year = new Date().getFullYear(); month = new Date().getMonth(); draw();
    });
  }

  draw();
}

function drawMonth(container, data, year, month) {
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build event map: 'YYYY-MM-DD' → [{label, color, type}]
  const eventMap = {};
  const addEvent = (dateStr, ev) => {
    if (!dateStr) return;
    const key = dateStr.split('T')[0];
    (eventMap[key] = eventMap[key] || []).push(ev);
  };

  (data.releases || []).forEach(r =>
    addEvent(r.release_date, { label: r.title, color: 'var(--a)', type: 'release' }));
  (data.contracts || []).forEach(c =>
    addEvent(c.expiry_date, { label: c.title || 'Contract', color: 'var(--a2)', type: 'contract' }));
  (data.pitches || []).forEach(p =>
    addEvent(p.pitched_at, { label: p.target || p.platform, color: 'var(--a3)', type: 'pitch' }));
  (data.pressPitches || []).forEach(p =>
    addEvent(p.sent_at, { label: p.outlet, color: 'var(--a4)', type: 'press' }));

  // Build grid cells (null = empty padding)
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>${MONTHS[month]} ${year}</h1>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="cal-today">Today</button>
        <button class="btn btn-secondary btn-sm" id="cal-prev">← Prev</button>
        <button class="btn btn-secondary btn-sm" id="cal-next">Next →</button>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap">
      ${[
        { color: 'var(--a)',  label: 'Release' },
        { color: 'var(--a2)', label: 'Contract Expiry' },
        { color: 'var(--a3)', label: 'DSP Pitch' },
        { color: 'var(--a4)', label: 'Press Pitch' },
      ].map(l => `
        <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--t3)">
          <span style="width:8px;height:8px;border-radius:50%;background:${l.color};flex-shrink:0"></span>
          ${l.label}
        </span>
      `).join('')}
    </div>
    <div class="cal-grid">
      ${DAYS.map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells.map(day => {
        if (day === null) return `<div class="cal-cell cal-empty"></div>`;
        const key    = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const events = eventMap[key] || [];
        const isToday = key === todayStr;
        return `
          <div class="cal-cell ${isToday ? 'cal-today' : ''}">
            <div class="cal-day-num">${day}</div>
            ${events.slice(0, 3).map(e => `
              <div class="cal-event" style="background:${e.color}18;color:${e.color};border-left:2px solid ${e.color}">
                ${e.label}
              </div>
            `).join('')}
            ${events.length > 3 ? `<div style="font-size:9px;color:var(--t4);padding:1px 4px">+${events.length - 3} more</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}
