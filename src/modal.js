let overlay = null;

function ensureOverlay() {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = '<div class="modal"></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  }
}

export function openModal({ title, body, size = '' }) {
  ensureOverlay();
  const modal = overlay.querySelector('.modal');
  modal.className = `modal${size ? ' ' + size : ''}`;
  modal.innerHTML = `
    <div class="modal-head">
      <span class="modal-title">${title}</span>
      <button class="modal-close" id="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">${body}</div>
  `;
  modal.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  requestAnimationFrame(() => overlay.classList.add('open'));
  return modal.querySelector('.modal-body');
}

export function closeModal() {
  if (!overlay) return;
  overlay.classList.remove('open');
}
