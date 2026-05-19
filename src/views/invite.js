import { supabase } from '../supabase.js';
import { toast } from '../toast.js';

// Rendered when URL is /#/invite?token=xxx — no auth required
export async function renderInviteAccept(container) {
  const token = new URLSearchParams(window.location.hash.split('?')[1] || '').get('token');

  if (!token) {
    container.innerHTML = inviteError('Invalid invite link.');
    return;
  }

  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Checking invite…</div>`;

  const { data: invite, error } = await supabase
    .from('invites')
    .select('*, profiles(full_name)')
    .eq('token', token)
    .single();

  if (error || !invite) {
    container.innerHTML = inviteError('This invite link is invalid or has expired.');
    return;
  }

  if (invite.used) {
    container.innerHTML = inviteError('This invite has already been used.');
    return;
  }

  if (new Date(invite.expires_at) < new Date()) {
    container.innerHTML = inviteError('This invite link has expired. Ask your label to send a new one.');
    return;
  }

  const labelName = invite.profiles?.full_name || 'Sohmna Label Hub';

  container.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-box">
        <div class="auth-logo"><span>S</span>ohmna</div>
        <div class="auth-sub">Label Hub</div>
        <p style="font-size:12px;color:var(--t2);margin-bottom:28px;line-height:1.6">
          You've been invited to join <strong style="color:var(--t)">${labelName}</strong> as
          <span class="badge badge-green" style="margin:0 4px">${invite.role}</span>
        </p>

        <form id="invite-form">
          <div class="field" style="margin-bottom:14px">
            <label>Full Name</label>
            <input name="name" type="text" required placeholder="Your name">
          </div>
          <div class="field" style="margin-bottom:14px">
            <label>Email</label>
            <input name="email" type="email" required value="${invite.email || ''}" placeholder="you@email.com">
          </div>
          <div class="field" style="margin-bottom:22px">
            <label>Password</label>
            <input name="password" type="password" required minlength="6" placeholder="••••••••">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center" id="invite-submit">
            Accept Invite & Create Account
          </button>
          <div id="invite-error" style="margin-top:12px;font-size:12px;color:var(--a2);display:none"></div>
        </form>
      </div>
    </div>
  `;

  container.querySelector('#invite-form').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = container.querySelector('#invite-submit');
    const errEl = container.querySelector('#invite-error');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    errEl.style.display = 'none';

    const { data: authData, error: signupError } = await supabase.auth.signUp({
      email:    fd.get('email'),
      password: fd.get('password'),
      options: {
        data: {
          full_name: fd.get('name'),
          role: invite.role,
        },
      },
    });

    if (signupError) {
      errEl.textContent = signupError.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Accept Invite & Create Account';
      return;
    }

    // Mark invite as used
    await supabase.from('invites').update({ used: true }).eq('token', token);

    toast('Account created! Check your email to confirm, then sign in.', 'success', 6000);
    window.location.hash = '/';
  });
}

function inviteError(msg) {
  return `
    <div class="auth-wrap">
      <div class="auth-box" style="text-align:center">
        <div class="auth-logo"><span>S</span>ohmna</div>
        <div class="auth-sub">Label Hub</div>
        <p style="color:var(--a2);font-size:13px;margin-top:8px">${msg}</p>
        <button class="btn btn-secondary" style="margin-top:24px;width:100%;justify-content:center"
          onclick="window.location.hash='/'">Go to Sign In</button>
      </div>
    </div>
  `;
}
