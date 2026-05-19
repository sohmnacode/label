import { supabase } from '../supabase.js';
import { toast } from '../toast.js';
import { fileUploadField, bindFileUploads } from '../upload.js';

export async function renderSettings(container, { profile }) {
  const isOwner = profile.role === 'owner';

  container.innerHTML = `<div class="loading-full"><span class="spinner"></span> Loading…</div>`;

  const [{ data: labelProfile }, { data: members }] = await Promise.all([
    supabase.from('label_profile').select('*').eq('id', profile.id).single(),
    isOwner ? supabase.from('profiles').select('id,full_name,email,role').order('role') : Promise.resolve({ data: [] }),
  ]);

  container.innerHTML = `
    <div class="page-head">
      <div class="page-head-left">
        <h1>Settings</h1>
        <p>Label profile &amp; team management</p>
      </div>
    </div>

    <!-- Label Profile (owner only) -->
    ${isOwner ? `
    <div class="table-wrap" style="margin-bottom:24px">
      <div class="table-header"><span class="table-title">Label Profile</span></div>
      <div style="padding:24px">
        <form id="label-profile-form">
          <div class="form-row cols-2">
            <div class="field"><label>Label Name</label>
              <input name="label_name" placeholder="Sohmna Records" value="${labelProfile?.label_name || ''}">
            </div>
            <div class="field"><label>Contact Email</label>
              <input name="contact_email" type="email" placeholder="info@label.com" value="${labelProfile?.contact_email || ''}">
            </div>
          </div>
          <div class="form-row cols-2">
            <div class="field"><label>Website</label>
              <input name="website" placeholder="https://label.com" value="${labelProfile?.website || ''}">
            </div>
            <div class="field"><label>Instagram</label>
              <input name="instagram" placeholder="@sohmna" value="${labelProfile?.instagram || ''}">
            </div>
          </div>
          <div class="form-row">
            ${fileUploadField({ label:'Label Logo', accept:'image/jpeg,image/png,image/webp,image/svg+xml', hint:'PNG or SVG recommended', currentUrl: labelProfile?.label_logo_url || '', bucket:'covers', prefix:'logos/' })}
          </div>
          <div class="form-actions" style="margin-top:16px">
            <button type="submit" class="btn btn-primary">Save Profile</button>
          </div>
        </form>
      </div>
    </div>
    ` : ''}

    <!-- My Account -->
    <div class="table-wrap" style="margin-bottom:24px">
      <div class="table-header"><span class="table-title">My Account</span></div>
      <div style="padding:24px">
        <form id="account-form">
          <div class="form-row cols-2">
            <div class="field"><label>Full Name</label>
              <input name="full_name" value="${profile.full_name || ''}">
            </div>
            <div class="field"><label>Email</label>
              <input name="email" value="${profile.email || ''}" disabled style="opacity:.5">
            </div>
          </div>
          <div class="form-row">
            <div class="field"><label>New Password</label>
              <input name="password" type="password" placeholder="Leave blank to keep current">
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Update Account</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Team Members (owner only) -->
    ${isOwner ? `
    <div class="table-wrap">
      <div class="table-header">
        <span class="table-title">Team Members</span>
        <span style="font-size:11px;color:var(--t3)">${members?.length || 0} members</span>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          ${(members||[]).map(m => `
            <tr>
              <td><strong>${m.full_name || '—'}</strong></td>
              <td style="color:var(--t3);font-size:12px">${m.email}</td>
              <td>
                ${m.id === profile.id
                  ? `<span class="badge badge-green">owner</span>`
                  : `<select class="member-role-sel" data-id="${m.id}" style="background:var(--glass-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 8px;color:var(--t);font-family:var(--mono);font-size:11px;outline:none;cursor:pointer">
                      <option value="team"   ${m.role==='team'   ?'selected':''}>team</option>
                      <option value="artist" ${m.role==='artist' ?'selected':''}>artist</option>
                    </select>`}
              </td>
              <td class="td-actions">
                ${m.id !== profile.id ? `<button class="btn btn-danger btn-sm btn-icon remove-member" data-id="${m.id}" title="Remove">✕</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
  `;

  bindFileUploads(container);

  // Label profile save
  container.querySelector('#label-profile-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!isOwner) return;
    const fd = new FormData(e.target);
    const logoInput = container.querySelector('[name^="fu-"][type="hidden"]');
    const payload = {
      id:            profile.id,
      label_name:    fd.get('label_name') || null,
      contact_email: fd.get('contact_email') || null,
      website:       fd.get('website') || null,
      instagram:     fd.get('instagram') || null,
      label_logo_url: logoInput?.value || labelProfile?.label_logo_url || null,
      updated_at:    new Date().toISOString(),
    };
    const { error } = await supabase.from('label_profile').upsert(payload);
    if (error) toast(error.message, 'error');
    else toast('Label profile saved');
  });

  // Account update
  container.querySelector('#account-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('full_name');
    const pass = fd.get('password');
    const updates = {};
    if (pass) updates.password = pass;
    if (Object.keys(updates).length) {
      const { error } = await supabase.auth.updateUser(updates);
      if (error) { toast(error.message, 'error'); return; }
    }
    const { error } = await supabase.from('profiles').update({ full_name: name }).eq('id', profile.id);
    if (error) toast(error.message, 'error');
    else toast('Account updated');
  });

  // Role changes
  container.querySelectorAll('.member-role-sel').forEach(sel => {
    sel.addEventListener('change', async () => {
      const { error } = await supabase.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.id);
      if (error) toast(error.message, 'error');
      else toast('Role updated');
    });
  });

  // Remove member
  container.querySelectorAll('.remove-member').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this team member? They will lose access.')) return;
      const { error } = await supabase.from('profiles').delete().eq('id', btn.dataset.id);
      if (error) toast(error.message, 'error');
      else { toast('Member removed'); renderSettings(container, { profile }); }
    });
  });
}
