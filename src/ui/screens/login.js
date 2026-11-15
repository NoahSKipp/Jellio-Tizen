// Login screen with Multi-Step Flow: SERVER_ENTRY, PROFILE_PICKER, MANUAL, QUICK_CONNECT, FORGOT_USERNAME, FORGOT_PIN.
// 1:1 port of Jellio-TV LoginScreen.kt.
import {
  cleanServerAddress,
  getSession,
  setSession,
  getSavedAccounts,
  removeAccount,
  getOrCreateDeviceId,
} from '../../data/session.js';
import {
  authenticateByName,
  getPublicUsers,
  resolveServerAddress,
  initiateQuickConnect,
  checkQuickConnect,
  authenticateWithQuickConnect,
  requestPasswordReset,
  redeemPasswordResetPin,
  getUserImageUrl,
} from '../../data/api.js';
import { DisplayPreferences } from '../../data/prefs.js';
import { setDisplayLanguage, getDisplayLanguage, t } from '../../runtime/i18n.js';
import { focusFirstIn, focusElement, pushFocusTrap, popFocusTrap } from '../../input/spatialNav.js';

// Ensure DisplayPreferences has setDisplayLanguage wired to i18n
if (typeof DisplayPreferences.setDisplayLanguage !== 'function') {
  DisplayPreferences.setDisplayLanguage = (code) => setDisplayLanguage(code);
}

export const LoginMode = Object.freeze({
  SERVER_ENTRY: 'SERVER_ENTRY',
  PROFILE_PICKER: 'PROFILE_PICKER',
  MANUAL: 'MANUAL',
  QUICK_CONNECT: 'QUICK_CONNECT',
  FORGOT_USERNAME: 'FORGOT_USERNAME',
  FORGOT_PIN: 'FORGOT_PIN',
});

export const SUPPORTED_LANGUAGES = [
  'EN', 'DE', 'ES', 'FR', 'IT', 'JA', 'NL', 'PL', 'PT', 'RU', 'TR', 'ZH'
];

export function getLastServerAddress() {
  const current = getSession();
  if (current && current.serverAddress) return current.serverAddress;
  const accounts = getSavedAccounts();
  if (accounts.length > 0 && accounts[0].serverAddress) return accounts[0].serverAddress;
  return '';
}

export function getAccountsForServer(server) {
  const cleaned = cleanServerAddress(server);
  if (!cleaned) return [];
  return getSavedAccounts().filter((acc) => cleanServerAddress(acc.serverAddress) === cleaned);
}

export async function switchToAccount(account, onLoginSuccess) {
  if (!account || !account.userId || !account.serverAddress) return false;
  if (account.accessToken) {
    setSession(account);
    if (typeof onLoginSuccess === 'function') {
      onLoginSuccess(account);
    }
    return true;
  }
  return false;
}

// On-screen keyboard helper that binds to TV inputs and remote D-pad
export function openOnScreenKeyboard(options = {}) {
  const {
    title = 'Enter Text',
    initialValue = '',
    placeholder = '',
    isPassword = false,
    onConfirm = () => {},
    onCancel = () => {},
  } = options;

  const overlay = document.createElement('div');
  overlay.className = 'jellio-osk-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(0, 0, 0, 0.88)';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';
  overlay.setAttribute('data-focus-group', 'osk-dialog');

  let currentValue = String(initialValue || '');

  const box = document.createElement('div');
  box.style.background = '#1A1A1A';
  box.style.border = '1px solid rgba(255, 255, 255, 0.12)';
  box.style.borderRadius = '20px';
  box.style.padding = '32px 40px';
  box.style.width = '780px';
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.alignItems = 'center';
  box.style.gap = '20px';

  const titleEl = document.createElement('div');
  titleEl.style.fontSize = '20px';
  titleEl.style.fontWeight = '700';
  titleEl.style.color = '#FFFFFF';
  titleEl.textContent = title;
  box.appendChild(titleEl);

  const displayEl = document.createElement('input');
  displayEl.type = isPassword ? 'password' : 'text';
  displayEl.className = 'jellio-search-input-box';
  displayEl.style.width = '100%';
  displayEl.style.height = '48px';
  displayEl.style.fontSize = '18px';
  displayEl.style.textAlign = 'center';
  displayEl.style.background = '#111111';
  displayEl.style.border = '1px solid rgba(255, 255, 255, 0.2)';
  displayEl.style.borderRadius = '12px';
  displayEl.style.color = '#FFFFFF';
  displayEl.placeholder = placeholder;
  displayEl.value = currentValue;
  displayEl.readOnly = false;
  box.appendChild(displayEl);

  const keyboardGrid = document.createElement('div');
  keyboardGrid.style.display = 'flex';
  keyboardGrid.style.flexDirection = 'column';
  keyboardGrid.style.gap = '8px';
  keyboardGrid.style.width = '100%';
  keyboardGrid.style.alignItems = 'center';

  const KEYBOARD_ROWS = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '.'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', ':', '/'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '@', '_'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACKSPACE', 'CLEAR'],
    ['SPACE', 'DONE', 'CANCEL'],
  ];

  const updateDisplay = () => {
    displayEl.value = currentValue;
  };

  KEYBOARD_ROWS.forEach((rowKeys) => {
    const rowEl = document.createElement('div');
    rowEl.style.display = 'flex';
    rowEl.style.gap = '8px';
    rowEl.style.justifyContent = 'center';

    rowKeys.forEach((key) => {
      const btn = document.createElement('button');
      btn.className = 'jellio-btn';
      btn.setAttribute('data-focusable', 'true');
      btn.textContent = key;
      btn.style.minWidth = '46px';
      btn.style.height = '42px';
      btn.style.padding = '0 12px';
      btn.style.fontSize = '15px';
      btn.style.fontWeight = '600';
      btn.style.justifyContent = 'center';

      if (key === 'SPACE') {
        btn.style.minWidth = '140px';
      } else if (key === 'BACKSPACE' || key === 'CLEAR') {
        btn.style.minWidth = '96px';
      } else if (key === 'DONE') {
        btn.className = 'jellio-btn jellio-btn-primary';
        btn.style.minWidth = '110px';
      } else if (key === 'CANCEL') {
        btn.style.minWidth = '90px';
      }

      btn.onclick = () => {
        if (key === 'BACKSPACE') {
          currentValue = currentValue.slice(0, -1);
          updateDisplay();
        } else if (key === 'CLEAR') {
          currentValue = '';
          updateDisplay();
        } else if (key === 'SPACE') {
          currentValue += ' ';
          updateDisplay();
        } else if (key === 'DONE') {
          closeDialog(true);
        } else if (key === 'CANCEL') {
          closeDialog(false);
        } else {
          currentValue += key.toLowerCase();
          updateDisplay();
        }
      };

      rowEl.appendChild(btn);
    });

    keyboardGrid.appendChild(rowEl);
  });

  box.appendChild(keyboardGrid);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const closeDialog = (confirmed) => {
    popFocusTrap(overlay);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (confirmed) {
      onConfirm(currentValue);
    } else {
      onCancel();
    }
  };

  pushFocusTrap(overlay, () => closeDialog(false));
  focusFirstIn(box);

  displayEl.addEventListener('input', (e) => {
    currentValue = e.target.value;
  });

  displayEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      closeDialog(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog(false);
    }
  });

  return overlay;
}

export function bindTvInput(inputEl, options = {}) {
  if (!inputEl) return;
  inputEl.setAttribute('data-focusable', 'true');

  const openOsk = () => {
    openOnScreenKeyboard({
      title: options.title || inputEl.placeholder || 'Enter text',
      initialValue: inputEl.value,
      placeholder: inputEl.placeholder || '',
      isPassword: inputEl.type === 'password',
      onConfirm: (val) => {
        inputEl.value = val;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        focusElement(inputEl);
      },
      onCancel: () => {
        focusElement(inputEl);
      },
    });
  };

  inputEl.addEventListener('click', (e) => {
    if (options.useOsk !== false) {
      e.preventDefault();
      openOsk();
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && options.useOsk !== false && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      openOsk();
    }
  });
}

export class LoginScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.mode = LoginMode.SERVER_ENTRY;
    this.serverAddress = getLastServerAddress() || 'http://192.168.1.100:8096';
    this.publicUsers = [];
    this.rememberedAccounts = [];
    this.manualPrefillUsername = '';
    this.quickConnectTimer = null;
    this.quickConnectSecret = null;
    this.quickConnectCode = null;
    this.errorMessage = '';
    this.statusMessage = '';
    this.isLoading = false;
  }

  destroy() {
    this.stopPolling();
    this.container = null;
  }

  stopPolling() {
    if (this.quickConnectTimer) {
      clearInterval(this.quickConnectTimer);
      this.quickConnectTimer = null;
    }
  }

  render(container) {
    this.stopPolling();
    this.container = container;
    this.renderCurrentMode();
  }

  getCurrentLanguageCode() {
    const lang = (getDisplayLanguage() || 'en').toUpperCase();
    return SUPPORTED_LANGUAGES.includes(lang) ? lang : 'EN';
  }

  cycleLanguage() {
    const current = this.getCurrentLanguageCode();
    const idx = SUPPORTED_LANGUAGES.indexOf(current);
    const nextIdx = (idx + 1) % SUPPORTED_LANGUAGES.length;
    const nextCode = SUPPORTED_LANGUAGES[nextIdx];

    DisplayPreferences.setDisplayLanguage(nextCode.toLowerCase());
    this.renderCurrentMode();
  }

  renderCurrentMode() {
    if (!this.container) return;
    this.container.innerHTML = '';

    const screenEl = document.createElement('div');
    screenEl.className = 'jellio-screen jellio-screen-full';
    screenEl.style.background = '#0D0D0D';
    screenEl.style.display = 'flex';
    screenEl.style.alignItems = 'center';
    screenEl.style.justifyContent = 'center';
    screenEl.style.width = '100vw';
    screenEl.style.height = '100vh';
    screenEl.setAttribute('data-focus-group', 'login-screen');

    const card = document.createElement('div');
    card.style.width = '460px';
    card.style.background = '#1A1A1A';
    card.style.borderRadius = '20px';
    card.style.padding = '36px 40px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.boxShadow = '0 16px 40px rgba(0, 0, 0, 0.6)';
    card.style.border = '1px solid rgba(255, 255, 255, 0.08)';

    card.appendChild(this.buildHeaderRow());

    switch (this.mode) {
      case LoginMode.SERVER_ENTRY:
        card.appendChild(this.buildServerEntryForm());
        break;
      case LoginMode.PROFILE_PICKER:
        card.style.width = '640px';
        card.appendChild(this.buildProfilePickerView());
        break;
      case LoginMode.MANUAL:
        card.appendChild(this.buildManualLoginForm());
        break;
      case LoginMode.QUICK_CONNECT:
        card.appendChild(this.buildQuickConnectView());
        break;
      case LoginMode.FORGOT_USERNAME:
        card.appendChild(this.buildForgotUsernameForm());
        break;
      case LoginMode.FORGOT_PIN:
        card.appendChild(this.buildForgotPinForm());
        break;
      default:
        card.appendChild(this.buildServerEntryForm());
        break;
    }

    screenEl.appendChild(card);
    this.container.appendChild(screenEl);

    focusFirstIn(card);
  }

  buildHeaderRow() {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.width = '100%';
    row.style.marginBottom = '24px';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '14px';

    const iconBox = document.createElement('div');
    iconBox.style.width = '44px';
    iconBox.style.height = '44px';
    iconBox.style.borderRadius = '12px';
    iconBox.style.background = 'rgba(255, 255, 255, 0.12)';
    iconBox.style.display = 'flex';
    iconBox.style.alignItems = 'center';
    iconBox.style.justifyContent = 'center';
    iconBox.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: #FFFFFF;">
        <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
      </svg>
    `;

    const titles = document.createElement('div');
    titles.style.display = 'flex';
    titles.style.flexDirection = 'column';

    const titleEl = document.createElement('div');
    titleEl.style.fontSize = '26px';
    titleEl.style.fontWeight = '700';
    titleEl.style.color = '#FFFFFF';
    titleEl.textContent = 'Jellio TV';

    const stepEl = document.createElement('div');
    stepEl.style.fontSize = '14px';
    stepEl.style.color = '#B3B3B3';

    switch (this.mode) {
      case LoginMode.SERVER_ENTRY:
        stepEl.textContent = 'Welcome : Connect Server';
        break;
      case LoginMode.PROFILE_PICKER:
        stepEl.textContent = 'Select Profile';
        break;
      case LoginMode.MANUAL:
        stepEl.textContent = 'Sign In';
        break;
      case LoginMode.QUICK_CONNECT:
        stepEl.textContent = 'Quick Connect';
        break;
      case LoginMode.FORGOT_USERNAME:
      case LoginMode.FORGOT_PIN:
        stepEl.textContent = 'Reset Password';
        break;
      default:
        stepEl.textContent = 'Sign In';
        break;
    }

    titles.appendChild(titleEl);
    titles.appendChild(stepEl);

    left.appendChild(iconBox);
    left.appendChild(titles);
    row.appendChild(left);

    // Language Cycler Pill Button
    const langBtn = document.createElement('button');
    langBtn.className = 'jellio-btn';
    langBtn.setAttribute('data-focusable', 'true');
    langBtn.style.padding = '6px 14px';
    langBtn.style.borderRadius = '999px';
    langBtn.style.background = 'rgba(255, 255, 255, 0.08)';
    langBtn.style.display = 'flex';
    langBtn.style.alignItems = 'center';
    langBtn.style.gap = '6px';
    langBtn.style.color = '#FFFFFF';
    langBtn.style.fontSize = '14px';
    langBtn.style.fontWeight = '600';

    langBtn.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: var(--jellio-secondary, #2196F3);">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
      <span>${this.getCurrentLanguageCode()}</span>
    `;

    langBtn.onclick = () => {
      this.cycleLanguage();
    };

    row.appendChild(langBtn);
    return row;
  }

  buildServerEntryForm() {
    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '14px';

    const heading = document.createElement('div');
    heading.style.fontSize = '20px';
    heading.style.fontWeight = '700';
    heading.style.color = '#FFFFFF';
    heading.textContent = 'Connect to Server';
    form.appendChild(heading);

    const desc = document.createElement('div');
    desc.style.fontSize = '14px';
    desc.style.color = '#B3B3B3';
    desc.textContent = 'Enter your Jellyfin or Jellio server address:';
    form.appendChild(desc);

    const inputWrap = document.createElement('div');
    inputWrap.style.display = 'flex';
    inputWrap.style.flexDirection = 'column';
    inputWrap.style.gap = '6px';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'jellio-search-input-box';
    input.style.width = '100%';
    input.style.height = '48px';
    input.style.fontSize = '15px';
    input.placeholder = 'http://192.168.1.100:8096';
    input.value = this.serverAddress || '';
    bindTvInput(input, { title: 'Server Address' });

    inputWrap.appendChild(input);
    form.appendChild(inputWrap);

    // Tip Box
    const tip = document.createElement('div');
    tip.style.background = 'rgba(255, 255, 255, 0.04)';
    tip.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    tip.style.borderRadius = '12px';
    tip.style.padding = '10px 14px';
    tip.style.display = 'flex';
    tip.style.alignItems = 'center';
    tip.style.gap = '10px';
    tip.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: var(--jellio-secondary, #2196F3); flex-shrink: 0;">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
      </svg>
      <span style="font-size: 13px; color: #B3B3B3;">If no protocol is given, http:// is tried first then https://</span>
    `;
    form.appendChild(tip);

    if (this.errorMessage) {
      const err = document.createElement('div');
      err.style.color = '#FF5252';
      err.style.fontSize = '13px';
      err.textContent = this.errorMessage;
      form.appendChild(err);
    }

    const connectBtn = document.createElement('button');
    connectBtn.className = 'jellio-btn jellio-btn-primary';
    connectBtn.setAttribute('data-focusable', 'true');
    connectBtn.style.height = '46px';
    connectBtn.style.justifyContent = 'center';
    connectBtn.style.fontSize = '16px';
    connectBtn.style.fontWeight = '600';
    connectBtn.style.marginTop = '8px';
    connectBtn.textContent = this.isLoading ? 'Connecting...' : 'Connect';
    connectBtn.disabled = this.isLoading;

    connectBtn.onclick = async () => {
      const rawUrl = input.value.trim();
      if (!rawUrl) {
        this.errorMessage = 'Please enter a server address.';
        this.renderCurrentMode();
        return;
      }

      this.isLoading = true;
      this.errorMessage = '';
      connectBtn.textContent = 'Connecting...';
      connectBtn.disabled = true;

      try {
        const resolved = await resolveServerAddress(rawUrl);
        this.serverAddress = resolved;

        const [publicUsers, serverAccounts] = await Promise.all([
          getPublicUsers(resolved).catch(() => []),
          Promise.resolve(getAccountsForServer(resolved)),
        ]);

        this.publicUsers = publicUsers || [];
        this.rememberedAccounts = serverAccounts || [];

        if (this.rememberedAccounts.length > 0 || this.publicUsers.length > 0) {
          this.mode = LoginMode.PROFILE_PICKER;
        } else {
          this.mode = LoginMode.MANUAL;
        }
      } catch (err) {
        this.errorMessage = (err && err.message) || 'Could not connect to server.';
      } finally {
        this.isLoading = false;
        this.renderCurrentMode();
      }
    };

    form.appendChild(connectBtn);
    return form;
  }

  buildProfilePickerView() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '20px';

    const title = document.createElement('div');
    title.style.fontSize = '22px';
    title.style.fontWeight = '700';
    title.style.color = '#FFFFFF';
    title.textContent = 'Who is watching?';
    wrap.appendChild(title);

    if (this.errorMessage) {
      const err = document.createElement('div');
      err.style.color = '#FF5252';
      err.style.fontSize = '13px';
      err.textContent = this.errorMessage;
      wrap.appendChild(err);
    }

    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '20px';
    grid.style.justifyContent = 'center';
    grid.style.width = '100%';
    grid.style.maxHeight = '320px';
    grid.style.overflowY = 'auto';
    grid.style.padding = '8px';

    // 1. Remembered accounts
    this.rememberedAccounts.forEach((acc) => {
      const card = document.createElement('div');
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'center';
      card.style.position = 'relative';

      const avatarBtn = document.createElement('button');
      avatarBtn.className = 'jellio-btn';
      avatarBtn.setAttribute('data-focusable', 'true');
      avatarBtn.style.width = '100px';
      avatarBtn.style.height = '100px';
      avatarBtn.style.borderRadius = '50%';
      avatarBtn.style.padding = '0';
      avatarBtn.style.overflow = 'hidden';
      avatarBtn.style.border = '2px solid transparent';
      avatarBtn.style.justifyContent = 'center';
      avatarBtn.style.background = '#222222';

      const avatarUrl = getUserImageUrl(acc.userId, null, 200, { serverAddress: this.serverAddress });
      avatarBtn.innerHTML = `
        <img src="${avatarUrl}" alt="${acc.userName}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; color: #FFFFFF;">
          ${(acc.userName || 'U').charAt(0).toUpperCase()}
        </div>
      `;

      avatarBtn.onclick = async () => {
        if (acc.accessToken) {
          const success = await switchToAccount(acc, this.options.onLoginSuccess);
          if (success) return;
        }
        this.manualPrefillUsername = acc.userName || '';
        this.mode = LoginMode.MANUAL;
        this.renderCurrentMode();
      };

      // Forget/Remove account button
      const forgetBtn = document.createElement('button');
      forgetBtn.className = 'jellio-btn';
      forgetBtn.setAttribute('data-focusable', 'true');
      forgetBtn.style.position = 'absolute';
      forgetBtn.style.top = '-4px';
      forgetBtn.style.right = '-4px';
      forgetBtn.style.width = '28px';
      forgetBtn.style.height = '28px';
      forgetBtn.style.borderRadius = '50%';
      forgetBtn.style.background = 'rgba(0, 0, 0, 0.8)';
      forgetBtn.style.padding = '0';
      forgetBtn.style.justifyContent = 'center';
      forgetBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
      forgetBtn.innerHTML = `
        <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: #FFFFFF;">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      `;

      forgetBtn.onclick = (e) => {
        e.stopPropagation();
        removeAccount(acc.userId, this.serverAddress);
        this.rememberedAccounts = getAccountsForServer(this.serverAddress);
        this.renderCurrentMode();
      };

      const nameLabel = document.createElement('div');
      nameLabel.style.fontSize = '14px';
      nameLabel.style.color = '#FFFFFF';
      nameLabel.style.marginTop = '8px';
      nameLabel.style.maxWidth = '100px';
      nameLabel.style.overflow = 'hidden';
      nameLabel.style.textOverflow = 'ellipsis';
      nameLabel.style.whiteSpace = 'nowrap';
      nameLabel.style.textAlign = 'center';
      nameLabel.textContent = acc.userName || 'User';

      card.appendChild(avatarBtn);
      card.appendChild(forgetBtn);
      card.appendChild(nameLabel);
      grid.appendChild(card);
    });

    // 2. Public users without saved accounts
    const rememberedIds = new Set(this.rememberedAccounts.map((a) => a.userId));
    this.publicUsers.forEach((user) => {
      if (rememberedIds.has(user.Id)) return;

      const card = document.createElement('div');
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'center';

      const avatarBtn = document.createElement('button');
      avatarBtn.className = 'jellio-btn';
      avatarBtn.setAttribute('data-focusable', 'true');
      avatarBtn.style.width = '100px';
      avatarBtn.style.height = '100px';
      avatarBtn.style.borderRadius = '50%';
      avatarBtn.style.padding = '0';
      avatarBtn.style.overflow = 'hidden';
      avatarBtn.style.border = '2px solid transparent';
      avatarBtn.style.justifyContent = 'center';
      avatarBtn.style.background = '#222222';

      const avatarUrl = getUserImageUrl(user.Id, user.PrimaryImageTag, 200, { serverAddress: this.serverAddress });
      avatarBtn.innerHTML = `
        <img src="${avatarUrl}" alt="${user.Name}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; color: #FFFFFF;">
          ${(user.Name || 'U').charAt(0).toUpperCase()}
        </div>
      `;

      avatarBtn.onclick = () => {
        this.manualPrefillUsername = user.Name || '';
        this.mode = LoginMode.MANUAL;
        this.renderCurrentMode();
      };

      const nameLabel = document.createElement('div');
      nameLabel.style.fontSize = '14px';
      nameLabel.style.color = '#FFFFFF';
      nameLabel.style.marginTop = '8px';
      nameLabel.style.maxWidth = '100px';
      nameLabel.style.overflow = 'hidden';
      nameLabel.style.textOverflow = 'ellipsis';
      nameLabel.style.whiteSpace = 'nowrap';
      nameLabel.style.textAlign = 'center';
      nameLabel.textContent = user.Name || 'User';

      card.appendChild(avatarBtn);
      card.appendChild(nameLabel);
      grid.appendChild(card);
    });

    wrap.appendChild(grid);

    // Action buttons row below
    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.gap = '12px';
    actionsRow.style.marginTop = '12px';

    const qcBtn = document.createElement('button');
    qcBtn.className = 'jellio-btn';
    qcBtn.setAttribute('data-focusable', 'true');
    qcBtn.textContent = 'Quick Connect';
    qcBtn.onclick = () => {
      this.mode = LoginMode.QUICK_CONNECT;
      this.renderCurrentMode();
    };

    const manualBtn = document.createElement('button');
    manualBtn.className = 'jellio-btn';
    manualBtn.setAttribute('data-focusable', 'true');
    manualBtn.textContent = 'Sign in manually';
    manualBtn.onclick = () => {
      this.manualPrefillUsername = '';
      this.mode = LoginMode.MANUAL;
      this.renderCurrentMode();
    };

    const changeServerBtn = document.createElement('button');
    changeServerBtn.className = 'jellio-btn';
    changeServerBtn.setAttribute('data-focusable', 'true');
    changeServerBtn.textContent = 'Change Server';
    changeServerBtn.onclick = () => {
      this.mode = LoginMode.SERVER_ENTRY;
      this.renderCurrentMode();
    };

    actionsRow.appendChild(qcBtn);
    actionsRow.appendChild(manualBtn);
    actionsRow.appendChild(changeServerBtn);
    wrap.appendChild(actionsRow);

    return wrap;
  }

  buildManualLoginForm() {
    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '14px';

    const heading = document.createElement('div');
    heading.style.fontSize = '20px';
    heading.style.fontWeight = '700';
    heading.style.color = '#FFFFFF';
    heading.textContent = 'Sign In';
    form.appendChild(heading);

    const userWrap = document.createElement('div');
    userWrap.style.display = 'flex';
    userWrap.style.flexDirection = 'column';
    userWrap.style.gap = '6px';

    const userLabel = document.createElement('label');
    userLabel.style.fontSize = '13px';
    userLabel.style.color = '#B3B3B3';
    userLabel.textContent = 'Username';

    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.className = 'jellio-search-input-box';
    userInput.style.width = '100%';
    userInput.style.height = '46px';
    userInput.style.fontSize = '15px';
    userInput.placeholder = 'Username';
    userInput.value = this.manualPrefillUsername || '';
    bindTvInput(userInput, { title: 'Username' });

    userWrap.appendChild(userLabel);
    userWrap.appendChild(userInput);
    form.appendChild(userWrap);

    const passWrap = document.createElement('div');
    passWrap.style.display = 'flex';
    passWrap.style.flexDirection = 'column';
    passWrap.style.gap = '6px';

    const passLabel = document.createElement('label');
    passLabel.style.fontSize = '13px';
    passLabel.style.color = '#B3B3B3';
    passLabel.textContent = 'Password';

    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.className = 'jellio-search-input-box';
    passInput.style.width = '100%';
    passInput.style.height = '46px';
    passInput.style.fontSize = '15px';
    passInput.placeholder = 'Password';
    bindTvInput(passInput, { title: 'Password' });

    passWrap.appendChild(passLabel);
    passWrap.appendChild(passInput);
    form.appendChild(passWrap);

    if (this.errorMessage) {
      const err = document.createElement('div');
      err.style.color = '#FF5252';
      err.style.fontSize = '13px';
      err.textContent = this.errorMessage;
      form.appendChild(err);
    }

    const signInBtn = document.createElement('button');
    signInBtn.className = 'jellio-btn jellio-btn-primary';
    signInBtn.setAttribute('data-focusable', 'true');
    signInBtn.style.height = '46px';
    signInBtn.style.justifyContent = 'center';
    signInBtn.style.fontSize = '16px';
    signInBtn.style.fontWeight = '600';
    signInBtn.style.marginTop = '6px';
    signInBtn.textContent = this.isLoading ? 'Signing In...' : 'Sign In';
    signInBtn.disabled = this.isLoading;

    signInBtn.onclick = async () => {
      const user = userInput.value.trim();
      const pwd = passInput.value;
      if (!user) {
        this.errorMessage = 'Please enter a username.';
        this.renderCurrentMode();
        return;
      }

      this.isLoading = true;
      this.errorMessage = '';
      signInBtn.textContent = 'Signing In...';
      signInBtn.disabled = true;

      try {
        const auth = await authenticateByName(this.serverAddress, user, pwd);
        const sess = {
          serverAddress: this.serverAddress,
          userId: auth.User ? auth.User.Id : auth.UserId,
          userName: auth.User ? auth.User.Name : user,
          accessToken: auth.AccessToken,
          deviceId: getOrCreateDeviceId(),
        };
        setSession(sess);
        if (typeof this.options.onLoginSuccess === 'function') {
          this.options.onLoginSuccess(sess);
        }
      } catch (err) {
        this.errorMessage = (err && err.message) || 'Sign in failed. Check credentials.';
      } finally {
        this.isLoading = false;
        this.renderCurrentMode();
      }
    };

    form.appendChild(signInBtn);

    const extraRow = document.createElement('div');
    extraRow.style.display = 'flex';
    extraRow.style.justifyContent = 'space-between';
    extraRow.style.alignItems = 'center';
    extraRow.style.marginTop = '8px';

    const qcBtn = document.createElement('button');
    qcBtn.className = 'jellio-btn';
    qcBtn.setAttribute('data-focusable', 'true');
    qcBtn.style.fontSize = '13px';
    qcBtn.textContent = 'Quick Connect';
    qcBtn.onclick = () => {
      this.mode = LoginMode.QUICK_CONNECT;
      this.renderCurrentMode();
    };

    const forgotBtn = document.createElement('button');
    forgotBtn.className = 'jellio-btn';
    forgotBtn.setAttribute('data-focusable', 'true');
    forgotBtn.style.fontSize = '13px';
    forgotBtn.textContent = 'Forgot Password?';
    forgotBtn.onclick = () => {
      this.mode = LoginMode.FORGOT_USERNAME;
      this.renderCurrentMode();
    };

    extraRow.appendChild(qcBtn);
    extraRow.appendChild(forgotBtn);
    form.appendChild(extraRow);

    const backBtn = document.createElement('button');
    backBtn.className = 'jellio-btn';
    backBtn.setAttribute('data-focusable', 'true');
    backBtn.style.justifyContent = 'center';
    backBtn.textContent = 'Back';
    backBtn.onclick = () => {
      if (this.rememberedAccounts.length > 0 || this.publicUsers.length > 0) {
        this.mode = LoginMode.PROFILE_PICKER;
      } else {
        this.mode = LoginMode.SERVER_ENTRY;
      }
      this.renderCurrentMode();
    };
    form.appendChild(backBtn);

    return form;
  }

  buildQuickConnectView() {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '18px';

    const title = document.createElement('div');
    title.style.fontSize = '22px';
    title.style.fontWeight = '700';
    title.style.color = '#FFFFFF';
    title.textContent = 'Quick Connect';
    wrap.appendChild(title);

    const desc = document.createElement('div');
    desc.style.fontSize = '14px';
    desc.style.color = '#B3B3B3';
    desc.style.textAlign = 'center';
    desc.style.lineHeight = '1.4';
    desc.textContent = 'Open Jellio or Jellyfin on another device, go to Quick Connect, and enter this code:';
    wrap.appendChild(desc);

    const codeBox = document.createElement('div');
    codeBox.style.fontSize = '44px';
    codeBox.style.fontWeight = '800';
    codeBox.style.letterSpacing = '8px';
    codeBox.style.color = 'var(--jellio-secondary, #2196F3)';
    codeBox.style.background = 'rgba(255, 255, 255, 0.05)';
    codeBox.style.border = '1px solid rgba(33, 150, 243, 0.4)';
    codeBox.style.borderRadius = '16px';
    codeBox.style.padding = '16px 28px';
    codeBox.style.textAlign = 'center';
    codeBox.textContent = this.quickConnectCode || '------';
    wrap.appendChild(codeBox);

    const waitingRow = document.createElement('div');
    waitingRow.style.display = 'flex';
    waitingRow.style.alignItems = 'center';
    waitingRow.style.gap = '8px';
    waitingRow.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: var(--jellio-secondary, #2196F3); animation: jellio-spin 1.5s linear infinite;">
        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
      </svg>
      <span style="font-size: 13px; color: #B3B3B3;">Waiting for authorization...</span>
    `;
    wrap.appendChild(waitingRow);

    if (this.errorMessage) {
      const err = document.createElement('div');
      err.style.color = '#FF5252';
      err.style.fontSize = '13px';
      err.textContent = this.errorMessage;
      wrap.appendChild(err);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'jellio-btn';
    cancelBtn.setAttribute('data-focusable', 'true');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      this.stopPolling();
      if (this.rememberedAccounts.length > 0 || this.publicUsers.length > 0) {
        this.mode = LoginMode.PROFILE_PICKER;
      } else {
        this.mode = LoginMode.MANUAL;
      }
      this.renderCurrentMode();
    };
    wrap.appendChild(cancelBtn);

    // Start Quick Connect request if not running
    this.startQuickConnectFlow(codeBox);

    return wrap;
  }

  async startQuickConnectFlow(codeBox) {
    this.stopPolling();
    try {
      const qc = await initiateQuickConnect(this.serverAddress);
      if (qc && qc.Code && qc.Secret) {
        this.quickConnectCode = qc.Code;
        this.quickConnectSecret = qc.Secret;
        if (codeBox) {
          codeBox.textContent = qc.Code;
        }

        this.quickConnectTimer = setInterval(async () => {
          try {
            const isAuthed = await checkQuickConnect(this.quickConnectSecret);
            if (isAuthed) {
              this.stopPolling();
              const authRes = await authenticateWithQuickConnect(this.serverAddress, this.quickConnectSecret);
              if (authRes && authRes.AccessToken) {
                const sess = {
                  serverAddress: this.serverAddress,
                  userId: authRes.User ? authRes.User.Id : authRes.UserId,
                  userName: authRes.User ? authRes.User.Name : '',
                  accessToken: authRes.AccessToken,
                  deviceId: getOrCreateDeviceId(),
                };
                setSession(sess);
                if (typeof this.options.onLoginSuccess === 'function') {
                  this.options.onLoginSuccess(sess);
                }
              }
            }
          } catch (_) {}
        }, 3000);
      } else {
        this.errorMessage = 'Quick Connect is not enabled on this server.';
        this.renderCurrentMode();
      }
    } catch (err) {
      this.errorMessage = (err && err.message) || 'Failed to start Quick Connect.';
      this.renderCurrentMode();
    }
  }

  buildForgotUsernameForm() {
    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '14px';

    const title = document.createElement('div');
    title.style.fontSize = '20px';
    title.style.fontWeight = '700';
    title.style.color = '#FFFFFF';
    title.textContent = 'Reset Password';
    form.appendChild(title);

    const desc = document.createElement('div');
    desc.style.fontSize = '14px';
    desc.style.color = '#B3B3B3';
    desc.textContent = 'Enter your username to request a reset code:';
    form.appendChild(desc);

    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.className = 'jellio-search-input-box';
    userInput.style.width = '100%';
    userInput.style.height = '46px';
    userInput.style.fontSize = '15px';
    userInput.placeholder = 'Username';
    userInput.value = this.manualPrefillUsername || '';
    bindTvInput(userInput, { title: 'Username' });
    form.appendChild(userInput);

    if (this.statusMessage) {
      const st = document.createElement('div');
      st.style.color = '#4CAF50';
      st.style.fontSize = '13px';
      st.textContent = this.statusMessage;
      form.appendChild(st);
    }

    if (this.errorMessage) {
      const err = document.createElement('div');
      err.style.color = '#FF5252';
      err.style.fontSize = '13px';
      err.textContent = this.errorMessage;
      form.appendChild(err);
    }

    const sendBtn = document.createElement('button');
    sendBtn.className = 'jellio-btn jellio-btn-primary';
    sendBtn.setAttribute('data-focusable', 'true');
    sendBtn.style.justifyContent = 'center';
    sendBtn.textContent = 'Send Reset Code';
    sendBtn.onclick = async () => {
      const user = userInput.value.trim();
      if (!user) {
        this.errorMessage = 'Please enter a username.';
        this.renderCurrentMode();
        return;
      }
      this.isLoading = true;
      try {
        await requestPasswordReset(this.serverAddress, user);
        this.statusMessage = 'Reset code generated. Check your server admin or console.';
        this.mode = LoginMode.FORGOT_PIN;
      } catch (err) {
        this.errorMessage = (err && err.message) || 'Password reset request failed.';
      } finally {
        this.isLoading = false;
        this.renderCurrentMode();
      }
    };
    form.appendChild(sendBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'jellio-btn';
    backBtn.setAttribute('data-focusable', 'true');
    backBtn.style.justifyContent = 'center';
    backBtn.textContent = 'Cancel';
    backBtn.onclick = () => {
      this.mode = LoginMode.MANUAL;
      this.renderCurrentMode();
    };
    form.appendChild(backBtn);

    return form;
  }

  buildForgotPinForm() {
    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '14px';

    const title = document.createElement('div');
    title.style.fontSize = '20px';
    title.style.fontWeight = '700';
    title.style.color = '#FFFFFF';
    title.textContent = 'Enter Reset Code';
    form.appendChild(title);

    const pinInput = document.createElement('input');
    pinInput.type = 'text';
    pinInput.className = 'jellio-search-input-box';
    pinInput.style.width = '100%';
    pinInput.style.height = '46px';
    pinInput.style.fontSize = '15px';
    pinInput.placeholder = 'Reset PIN';
    bindTvInput(pinInput, { title: 'Reset PIN' });
    form.appendChild(pinInput);

    if (this.errorMessage) {
      const err = document.createElement('div');
      err.style.color = '#FF5252';
      err.style.fontSize = '13px';
      err.textContent = this.errorMessage;
      form.appendChild(err);
    }

    const redeemBtn = document.createElement('button');
    redeemBtn.className = 'jellio-btn jellio-btn-primary';
    redeemBtn.setAttribute('data-focusable', 'true');
    redeemBtn.style.justifyContent = 'center';
    redeemBtn.textContent = 'Redeem PIN';
    redeemBtn.onclick = async () => {
      const pin = pinInput.value.trim();
      if (!pin) {
        this.errorMessage = 'Please enter the reset PIN.';
        this.renderCurrentMode();
        return;
      }
      this.isLoading = true;
      try {
        await redeemPasswordResetPin(this.serverAddress, pin);
        this.mode = LoginMode.MANUAL;
        this.errorMessage = 'PIN accepted. Please sign in.';
      } catch (err) {
        this.errorMessage = (err && err.message) || 'Invalid reset PIN.';
      } finally {
        this.isLoading = false;
        this.renderCurrentMode();
      }
    };
    form.appendChild(redeemBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'jellio-btn';
    backBtn.setAttribute('data-focusable', 'true');
    backBtn.style.justifyContent = 'center';
    backBtn.textContent = 'Cancel';
    backBtn.onclick = () => {
      this.mode = LoginMode.MANUAL;
      this.renderCurrentMode();
    };
    form.appendChild(backBtn);

    return form;
  }
}
