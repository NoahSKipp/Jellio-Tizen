// Toast and announcement alerts management.

let toastTimeout = null;
let announcementTimeout = null;

export function showToast(message, durationMs = 3500) {
  const toastRoot = document.getElementById('jellio-toast-root');
  if (!toastRoot) return;

  const existingToast = toastRoot.querySelector('.jellio-toast:not(.jellio-toast-announcement)');
  if (existingToast) existingToast.remove();
  if (toastTimeout) clearTimeout(toastTimeout);

  const toastEl = document.createElement('div');
  toastEl.className = 'jellio-toast';
  toastEl.textContent = String(message || '');
  toastRoot.appendChild(toastEl);

  toastTimeout = setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transition = 'opacity 200ms ease';
    setTimeout(() => toastEl.remove(), 200);
  }, durationMs);
}

export function showAnnouncement(announcement, durationMs = 8000) {
  const toastRoot = document.getElementById('jellio-toast-root');
  if (!toastRoot || !announcement) return;

  const existingAnnouncement = toastRoot.querySelector('.jellio-toast-announcement');
  if (existingAnnouncement) existingAnnouncement.remove();
  if (announcementTimeout) clearTimeout(announcementTimeout);

  const text = typeof announcement === 'string' ? announcement : (announcement.text || announcement.Name || '');
  const imageUrl = typeof announcement === 'object' ? (announcement.imageUrl || null) : null;

  const toastEl = document.createElement('div');
  toastEl.className = 'jellio-toast jellio-toast-announcement';
  toastEl.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <div style="font-size: 11px; text-transform: uppercase; color: var(--jellio-trending); font-weight: 700;">Announcement</div>
      ${imageUrl ? `<img src="${imageUrl}" style="max-height: 120px; border-radius: 8px; object-fit: contain; margin-bottom: 4px;" alt="Announcement">` : ''}
      <div style="font-size: 15px; font-weight: 600;">${text}</div>
    </div>
  `;
  toastRoot.appendChild(toastEl);

  announcementTimeout = setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transition = 'opacity 250ms ease';
    setTimeout(() => toastEl.remove(), 250);
  }, durationMs);
}

export const showAnnouncementToast = showToast;

