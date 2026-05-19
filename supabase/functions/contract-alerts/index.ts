import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL      = Deno.env.get('ALERT_FROM_EMAIL') || 'alerts@sohmna.com';

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const today = new Date();
  const in30  = new Date(today); in30.setDate(today.getDate() + 30);
  const in60  = new Date(today); in60.setDate(today.getDate() + 60);

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('*, artists(stage_name)')
    .not('expiry_date', 'is', null)
    .not('status', 'in', '("expired","terminated")')
    .lte('expiry_date', in60.toISOString().split('T')[0])
    .gte('expiry_date', today.toISOString().split('T')[0])
    .order('expiry_date');

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!contracts?.length) return new Response(JSON.stringify({ sent: 0 }));

  // Get owner profile email
  const { data: owner } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('role', 'owner')
    .limit(1)
    .single();

  if (!owner?.email) return new Response(JSON.stringify({ error: 'No owner email found' }), { status: 400 });

  const urgent  = contracts.filter(c => daysBetween(today, c.expiry_date) <= 30);
  const warning = contracts.filter(c => daysBetween(today, c.expiry_date) > 30);

  const contractRows = (list: any[], highlight: string) =>
    list.map(c => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #1e2240;font-size:13px;color:#e8eaf6">${c.title}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1e2240;font-size:13px;color:#9094b8">${c.artists?.stage_name || '—'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1e2240;font-size:13px;color:${highlight};font-family:monospace">${formatDate(c.expiry_date)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #1e2240;font-size:12px;color:${highlight}">${daysBetween(today, c.expiry_date)} days</td>
      </tr>
    `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#05080a;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px">

    <!-- Header -->
    <div style="background:#0e1530;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:24px 28px;margin-bottom:24px">
      <div style="font-size:22px;font-weight:700;color:#64d2ff;letter-spacing:.08em">SOHMNA</div>
      <div style="font-size:10px;color:#6070a0;letter-spacing:.16em;text-transform:uppercase;margin-top:2px">Label Hub — Contract Alerts</div>
    </div>

    <!-- Summary -->
    <div style="margin-bottom:20px">
      <p style="font-size:15px;color:#c8ccee;line-height:1.6;margin:0">
        Hi ${owner.full_name || 'there'}, you have <strong style="color:#fff">${contracts.length} contract${contracts.length > 1 ? 's' : ''}</strong> expiring within the next 60 days.
      </p>
    </div>

    ${urgent.length ? `
    <!-- Urgent (≤30 days) -->
    <div style="background:#1a0820;border:1px solid rgba(255,95,138,0.25);border-radius:12px;overflow:hidden;margin-bottom:16px">
      <div style="padding:12px 16px;background:rgba(255,95,138,0.08);border-bottom:1px solid rgba(255,95,138,0.15)">
        <span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#ff5f8a;font-weight:600">⚠ Expiring Within 30 Days</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid #1e2240">
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">Contract</th>
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">Artist</th>
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">Expires</th>
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">In</th>
        </tr></thead>
        <tbody>${contractRows(urgent, '#ff5f8a')}</tbody>
      </table>
    </div>
    ` : ''}

    ${warning.length ? `
    <!-- Warning (31–60 days) -->
    <div style="background:#131830;border:1px solid rgba(244,201,122,0.20);border-radius:12px;overflow:hidden;margin-bottom:16px">
      <div style="padding:12px 16px;background:rgba(244,201,122,0.06);border-bottom:1px solid rgba(244,201,122,0.12)">
        <span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#f4c97a;font-weight:600">Expiring Within 60 Days</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="border-bottom:1px solid #1e2240">
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">Contract</th>
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">Artist</th>
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">Expires</th>
          <th style="padding:8px 14px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#6070a0;text-align:left">In</th>
        </tr></thead>
        <tbody>${contractRows(warning, '#f4c97a')}</tbody>
      </table>
    </div>
    ` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin:28px 0">
      <a href="${SUPABASE_URL.replace('supabase.co', 'vercel.app') || 'https://label.sohmna.com'}/#/contracts"
         style="display:inline-block;background:linear-gradient(135deg,rgba(100,210,255,0.85),rgba(80,160,255,0.75));color:#030d18;padding:12px 28px;border-radius:100px;font-size:13px;font-weight:700;letter-spacing:.06em;text-decoration:none">
        View Contracts →
      </a>
    </div>

    <!-- Footer -->
    <p style="font-size:11px;color:#404870;text-align:center;margin-top:32px">Sohmna Label Hub · Automated contract alert</p>
  </div>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to:   owner.email,
      subject: `⚠ ${urgent.length ? `${urgent.length} contract${urgent.length > 1 ? 's' : ''} expiring in 30 days` : `${contracts.length} contracts expiring soon`} — Sohmna Label Hub`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: err }), { status: 500 });
  }

  return new Response(JSON.stringify({ sent: 1, contracts: contracts.length }));
});

function daysBetween(from: Date, dateStr: string) {
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - from.getTime()) / 86400000);
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
