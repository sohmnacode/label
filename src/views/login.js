import { supabase } from '../supabase.js';
import { toast } from '../toast.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-box">
        <div class="auth-logo"><span>S</span>ohmna</div>
        <div class="auth-sub">Label Hub</div>
        <div class="auth-tab-row">
          <button class="auth-tab active" data-tab="signin">Sign In</button>
          <button class="auth-tab" data-tab="signup">Create Account</button>
        </div>

        <form id="auth-form">
          <div id="signup-name-field" class="field" style="display:none;margin-bottom:14px">
            <label>Full Name</label>
            <input type="text" id="auth-name" placeholder="Your name">
          </div>
          <div class="field" style="margin-bottom:14px">
            <label>Email</label>
            <input type="email" id="auth-email" placeholder="you@sohmna.com" required>
          </div>
          <div class="field" style="margin-bottom:20px">
            <label>Password</label>
            <input type="password" id="auth-password" placeholder="••••••••" required minlength="6">
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center" id="auth-submit">
            Sign In
          </button>
          <div id="auth-error" style="margin-top:12px;font-size:12px;color:var(--a2);display:none"></div>
        </form>
      </div>
    </div>
  `;

  let mode = 'signin';

  container.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.tab;
      container.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
      const nameField = container.querySelector('#signup-name-field');
      nameField.style.display = mode === 'signup' ? 'flex' : 'none';
      container.querySelector('#auth-submit').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
      container.querySelector('#auth-error').style.display = 'none';
    });
  });

  container.querySelector('#auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = container.querySelector('#auth-email').value.trim();
    const password = container.querySelector('#auth-password').value;
    const name     = container.querySelector('#auth-name').value.trim();
    const submit   = container.querySelector('#auth-submit');
    const errEl    = container.querySelector('#auth-error');

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>';
    errEl.style.display = 'none';

    let error;
    if (mode === 'signup') {
      ({ error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name, role: 'artist' } },
      }));
      if (!error) toast('Account created — check your email to confirm', 'info', 5000);
    } else {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }

    if (error) {
      errEl.textContent = error.message;
      errEl.style.display = 'block';
      submit.disabled = false;
      submit.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
    }
  });
}
