import { supabase } from './supabase.js';

export async function uploadFile(bucket, file, pathPrefix = '') {
  const ext  = file.name.split('.').pop();
  const name = `${pathPrefix}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(name, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw error;

  if (bucket === 'covers') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(name);
    return data.publicUrl;
  }

  // Private bucket — return the path; caller creates signed URL as needed
  return name;
}

export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// Renders a drag-and-drop file input that resolves with the uploaded URL
export function fileUploadField({ label, accept, hint, currentUrl, bucket, prefix = '' }) {
  const id = `fu-${Math.random().toString(36).slice(2)}`;
  return `
    <div class="field" data-upload-field="${id}">
      <label>${label}</label>
      <div class="upload-zone" id="${id}-zone" data-bucket="${bucket}" data-prefix="${prefix}">
        ${currentUrl
          ? `<div class="upload-preview">
               <img src="${currentUrl}" onerror="this.style.display='none'">
               <span class="upload-filename">${currentUrl.split('/').pop()}</span>
             </div>`
          : `<span class="upload-placeholder">Drop file or click to browse</span>`
        }
        <input type="file" id="${id}-input" accept="${accept}" style="display:none">
        <input type="hidden" id="${id}-value" name="${id}" value="${currentUrl || ''}">
      </div>
      ${hint ? `<span class="field-hint">${hint}</span>` : ''}
      <div id="${id}-progress" style="display:none;margin-top:6px">
        <div style="height:2px;background:var(--glass-2);border-radius:2px;overflow:hidden">
          <div id="${id}-bar" style="height:100%;width:0%;background:var(--a);transition:width .3s"></div>
        </div>
        <span style="font-size:11px;color:var(--t3);margin-top:4px;display:block">Uploading…</span>
      </div>
    </div>
  `;
}

export function bindFileUploads(container) {
  container.querySelectorAll('.upload-zone').forEach(zone => {
    const id      = zone.id.replace('-zone', '');
    const input   = container.querySelector(`#${id}-input`);
    const hidden  = container.querySelector(`#${id}-value`);
    const progress = container.querySelector(`#${id}-progress`);
    const bar     = container.querySelector(`#${id}-bar`);
    const bucket  = zone.dataset.bucket;
    const prefix  = zone.dataset.prefix;

    zone.style.cursor = 'pointer';
    zone.addEventListener('click', () => input.click());

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    });

    input.addEventListener('change', () => {
      if (input.files[0]) handleUpload(input.files[0]);
    });

    async function handleUpload(file) {
      progress.style.display = 'block';
      bar.style.width = '30%';
      try {
        const url = await uploadFile(bucket, file, prefix);
        bar.style.width = '100%';
        hidden.value = url;
        zone.innerHTML = `
          <div class="upload-preview">
            <img src="${url}" onerror="this.style.display='none'" style="max-height:60px;border-radius:6px;margin-right:8px">
            <span class="upload-filename">${file.name}</span>
          </div>
          <input type="file" id="${id}-input" accept="${input.accept}" style="display:none">
          <input type="hidden" id="${id}-value" name="${id}" value="${url}">
        `;
        container.querySelector(`#${id}-input`).addEventListener('change', e => {
          if (e.target.files[0]) handleUpload(e.target.files[0]);
        });
        setTimeout(() => { progress.style.display = 'none'; }, 800);
      } catch (err) {
        progress.style.display = 'none';
        bar.style.width = '0%';
        alert('Upload failed: ' + err.message);
      }
    }
  });
}
