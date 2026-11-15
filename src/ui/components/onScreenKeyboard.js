// On-screen keyboard for 10-foot remote control input on Tizen Smart TVs.
import { pushFocusTrap, popFocusTrap, focusElement, focusFirstIn } from '../../input/spatialNav.js';

const KEYBOARD_LAYOUT = {
  lower: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '_', '/'],
    ['Shift', 'Space', 'Backspace', 'Clear', 'Done'],
  ],
  upper: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '_'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ':'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '?', '&', '='],
    ['Shift', 'Space', 'Backspace', 'Clear', 'Done'],
  ],
  symbols: [
    ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-'],
    ['~', '`', '+', '=', '[', ']', '{', '}', '\\', '|'],
    [':', ';', '"', '\'', '<', '>', ',', '.', '?', '/'],
    ['_', '-', '.', '@', ':', '/', '=', '?', '&', '%'],
    ['Shift', 'Space', 'Backspace', 'Clear', 'Done'],
  ],
};

export function openOnScreenKeyboard(options = {}) {
  const {
    title = 'Enter Text',
    initialValue = '',
    placeholder = 'Type here...',
    isPassword = false,
    onSubmit = () => {},
    onCancel = () => {},
  } = options;

  const overlayRoot = document.getElementById('jellio-overlay-root');
  if (!overlayRoot) return null;

  let currentValue = String(initialValue || '');
  let currentMode = 'lower'; // 'lower' | 'upper' | 'symbols'

  const modal = document.createElement('div');
  modal.className = 'jellio-osk-scrim';
  modal.setAttribute('data-focus-group', 'osk-modal');

  function renderKeyboard() {
    const keys = KEYBOARD_LAYOUT[currentMode] || KEYBOARD_LAYOUT.lower;
    const displayValue = isPassword ? '•'.repeat(currentValue.length) : currentValue;

    let rowsHtml = '';
    for (let r = 0; r < keys.length; r++) {
      const row = keys[r];
      let keysHtml = '';
      for (let c = 0; c < row.length; c++) {
        const key = row[c];
        let specialClass = '';
        if (key === 'Shift') specialClass = currentMode === 'upper' ? ' jellio-osk-key-shift active' : ' jellio-osk-key-shift';
        else if (key === 'Space') specialClass = ' jellio-osk-key-space';
        else if (key === 'Backspace') specialClass = ' jellio-osk-key-action';
        else if (key === 'Clear') specialClass = ' jellio-osk-key-action';
        else if (key === 'Done') specialClass = ' jellio-osk-key-done jellio-btn-primary';

        keysHtml += `
          <button class="jellio-osk-key${specialClass}" data-focusable="true" data-key="${key}">
            ${key === 'Backspace' ? '⌫' : key}
          </button>
        `;
      }
      rowsHtml += `<div class="jellio-osk-row">${keysHtml}</div>`;
    }

    modal.innerHTML = `
      <div class="jellio-osk-container">
        <div class="jellio-osk-header">
          <h2 class="jellio-osk-title">${title}</h2>
          <button class="jellio-osk-close-btn" data-focusable="true" data-action="cancel">✕</button>
        </div>
        <div class="jellio-osk-input-display">
          <span class="jellio-osk-text">${displayValue || `<span class="jellio-osk-placeholder">${placeholder}</span>`}</span>
          <span class="jellio-osk-caret"></span>
        </div>
        <div class="jellio-osk-keypad">
          ${rowsHtml}
        </div>
      </div>
    `;
  }

  renderKeyboard();

  function closeModal() {
    popFocusTrap(modal);
    modal.remove();
  }

  function handleKey(key) {
    if (key === 'Shift') {
      currentMode = currentMode === 'lower' ? 'upper' : (currentMode === 'upper' ? 'symbols' : 'lower');
      const prevFocusedKey = modal.querySelector('.jellio-osk-key.jellio-focused');
      const keyVal = prevFocusedKey ? prevFocusedKey.getAttribute('data-key') : null;
      renderKeyboard();
      if (keyVal) {
        const nextTarget = modal.querySelector(`[data-key="${keyVal}"]`) || modal.querySelector('[data-key="Shift"]');
        if (nextTarget) focusElement(nextTarget);
      }
      return;
    }

    if (key === 'Space') {
      currentValue += ' ';
      updateDisplay();
      return;
    }

    if (key === 'Backspace') {
      if (currentValue.length > 0) {
        currentValue = currentValue.slice(0, -1);
        updateDisplay();
      }
      return;
    }

    if (key === 'Clear') {
      currentValue = '';
      updateDisplay();
      return;
    }

    if (key === 'Done') {
      closeModal();
      onSubmit(currentValue);
      return;
    }

    currentValue += key;
    updateDisplay();
  }

  function updateDisplay() {
    const textEl = modal.querySelector('.jellio-osk-text');
    if (textEl) {
      const displayValue = isPassword ? '•'.repeat(currentValue.length) : currentValue;
      textEl.innerHTML = displayValue || `<span class="jellio-osk-placeholder">${placeholder}</span>`;
    }
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
      onCancel();
      return;
    }

    const closeBtn = e.target.closest('[data-action="cancel"]');
    if (closeBtn) {
      closeModal();
      onCancel();
      return;
    }

    const keyBtn = e.target.closest('[data-key]');
    if (keyBtn) {
      const key = keyBtn.getAttribute('data-key');
      handleKey(key);
    }
  });

  // Physical keyboard typing listener while OSK is open
  const physicalKeyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      onCancel();
      return;
    }
    if (e.key === 'Enter') {
      // If currently focused on a button inside OSK, let click handler run
      if (document.activeElement && modal.contains(document.activeElement)) {
        return;
      }
      e.preventDefault();
      closeModal();
      onSubmit(currentValue);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      handleKey('Backspace');
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      currentValue += e.key;
      updateDisplay();
    }
  };

  window.addEventListener('keydown', physicalKeyHandler);

  const cleanup = () => {
    window.removeEventListener('keydown', physicalKeyHandler);
  };

  overlayRoot.appendChild(modal);
  pushFocusTrap(modal, () => {
    cleanup();
    closeModal();
    onCancel();
  });

  // Focus the first key or Space
  const initialKey = modal.querySelector('[data-key="h"]') || modal.querySelector('[data-key="Space"]') || modal.querySelector('[data-focusable="true"]');
  if (initialKey) focusElement(initialKey);

  return {
    close: () => {
      cleanup();
      closeModal();
    },
    getValue: () => currentValue,
  };
}

export function bindTvInput(inputElement, options = {}) {
  if (!inputElement) return;

  const isPassword = inputElement.type === 'password' || Boolean(options.isPassword);
  const title = options.title || inputElement.getAttribute('placeholder') || 'Enter Text';

  inputElement.setAttribute('readonly', 'readonly');
  inputElement.setAttribute('data-focusable', 'true');

  inputElement.addEventListener('click', () => {
    openOnScreenKeyboard({
      title,
      initialValue: inputElement.value,
      placeholder: inputElement.getAttribute('placeholder') || '',
      isPassword,
      onSubmit: (val) => {
        inputElement.value = val;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        if (typeof options.onChange === 'function') {
          options.onChange(val);
        }
        focusElement(inputElement);
      },
      onCancel: () => {
        focusElement(inputElement);
      },
    });
  });
}
