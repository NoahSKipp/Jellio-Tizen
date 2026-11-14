// Contextual action menu modal matching CardOptionsMenu and CardDialog.
import { pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';

export function openCardDialog({ title = 'Options', actions = [], onDismiss = () => {} }) {
  const overlayRoot = document.getElementById('jellio-overlay-root');
  if (!overlayRoot) return null;

  const scrim = document.createElement('div');
  scrim.className = 'jellio-card-dialog-scrim';

  let actionsHtml = '';
  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    const dangerClass = act.danger ? ' jellio-card-options-item-danger' : '';
    actionsHtml += `
      <button class="jellio-card-options-item${dangerClass}" data-focusable="true" data-index="${i}">
        ${act.label}
      </button>
    `;
  }

  scrim.innerHTML = `
    <div class="jellio-card-dialog" data-focus-group="card-dialog">
      <div class="jellio-card-dialog-header">${title}</div>
      <div class="jellio-card-dialog-body">
        ${actionsHtml}
      </div>
    </div>
  `;

  const closeDialog = () => {
    popFocusTrap(scrim);
    scrim.remove();
    onDismiss();
  };

  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) {
      closeDialog();
      return;
    }

    const btn = e.target.closest('button[data-index]');
    if (btn) {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      const action = actions[idx];
      if (action && typeof action.onClick === 'function') {
        action.onClick();
      }
      closeDialog();
    }
  });

  overlayRoot.appendChild(scrim);
  pushFocusTrap(scrim, closeDialog);

  return { close: closeDialog };
}
