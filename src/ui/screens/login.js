// Login screen with QuickConnect, user picker, and manual credentials.
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
  isQuickConnectEnabled,
  initiateQuickConnect,
  checkQuickConnect,
  authenticateWithQuickConnect,
  getUserImageUrl,
} from '../../data/api.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';
import { t } from '../../runtime/i18n.js';

export class LoginScreen {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.quickConnectTimer = null;
    this.quickConnectSecret = null;
  }

  render(container) {
    this.container = container;
    this.container.innerHTML = '';
    this.destroy();

    const currentSession = getSession();
    const savedAccounts = getSavedAccounts();

    const screenEl = document.createElement('div');
    screenEl.className = 'jellio-screen jellio-login-screen';
    screenEl.setAttribute('data-focus-group', 'login-screen');

    // Left pane: QuickConnect code box
    const qcBox = document.createElement('div');
    qcBox.className = 'jellio-quickconnect-box';
    qcBox.innerHTML = `
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Quick Connect</h2>
      <p style="color: var(--jellio-text-secondary); text-align: center; max-width: 300px; font-size: 14px;">
        Open Jellio or Jellyfin on another device and enter this code:
      </p>
      <div class="jellio-quickconnect-code" id="qc-code">------</div>
      <button class="jellio-btn" data-focusable="true" id="qc-refresh-btn">Get New Code</button>
    `;

    // Right pane: Server & Accounts or Manual Login
    const formBox = document.createElement('div');
    formBox.className = 'jellio-login-form';
    formBox.innerHTML = `
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">Sign In</h2>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 13px; color: var(--jellio-text-secondary);">Server Address</label>
        <input type="text" class="jellio-search-input-box" style="width: 100%; height: 44px; font-size: 15px;" id="login-server-input" placeholder="http://192.168.1.100:8096" />
      </div>

      <div id="login-profiles-container" style="display: none; flex-direction: column; gap: 8px; margin-top: 8px;">
        <label style="font-size: 13px; color: var(--jellio-text-secondary);">Saved Profiles</label>
        <div id="login-profiles-list" style="display: flex; gap: 12px; overflow-x: auto; padding: 4px 0;"></div>
      </div>

      <div id="login-manual-container" style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 13px; color: var(--jellio-text-secondary);">Username</label>
          <input type="text" class="jellio-search-input-box" style="width: 100%; height: 44px; font-size: 15px;" id="login-username-input" placeholder="Username" />
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 13px; color: var(--jellio-text-secondary);">Password</label>
          <input type="password" class="jellio-search-input-box" style="width: 100%; height: 44px; font-size: 15px;" id="login-password-input" placeholder="Password" />
        </div>
        <div id="login-error-msg" style="color: var(--jellio-danger); font-size: 13px; min-height: 18px;"></div>
        <button class="jellio-btn jellio-btn-primary" data-focusable="true" id="login-submit-btn" style="justify-content: center; margin-top: 8px;">Sign In</button>
      </div>
    `;

    screenEl.appendChild(qcBox);
    screenEl.appendChild(formBox);
    this.container.appendChild(screenEl);

    const serverInput = formBox.querySelector('#login-server-input');
    const profilesContainer = formBox.querySelector('#login-profiles-container');
    const profilesList = formBox.querySelector('#login-profiles-list');
    const usernameInput = formBox.querySelector('#login-username-input');
    const passwordInput = formBox.querySelector('#login-password-input');
    const errorMsg = formBox.querySelector('#login-error-msg');
    const submitBtn = formBox.querySelector('#login-submit-btn');
    const qcCodeEl = qcBox.querySelector('#qc-code');
    const qcRefreshBtn = qcBox.querySelector('#qc-refresh-btn');

    if (savedAccounts.length > 0) {
      serverInput.value = savedAccounts[0].serverAddress;
      profilesContainer.style.display = 'flex';
      savedAccounts.forEach((acc) => {
        const item = document.createElement('button');
        item.className = 'jellio-btn';
        item.setAttribute('data-focusable', 'true');
        item.style.padding = '8px 16px';
        item.textContent = acc.userName || 'User';
        item.onclick = async () => {
          if (acc.accessToken) {
            setSession(acc);
            if (this.options.onLoginSuccess) this.options.onLoginSuccess(acc);
          } else {
            usernameInput.value = acc.userName;
            focusElement(passwordInput);
          }
        };
        profilesList.appendChild(item);
      });
    } else if (currentSession && currentSession.serverAddress) {
      serverInput.value = currentSession.serverAddress;
    }

    const startQc = async () => {
      const server = cleanServerAddress(serverInput.value);
      if (!server) {
        qcCodeEl.textContent = 'NO SRV';
        return;
      }
      try {
        const res = await initiateQuickConnect(server);
        if (res && res.Code && res.Secret) {
          qcCodeEl.textContent = res.Code;
          this.quickConnectSecret = res.Secret;
          this.pollQuickConnect(server, res.Secret);
        } else {
          qcCodeEl.textContent = 'OFF';
        }
      } catch (err) {
        qcCodeEl.textContent = 'ERR';
      }
    };

    qcRefreshBtn.onclick = () => {
      this.stopPolling();
      startQc();
    };

    serverInput.addEventListener('change', () => {
      this.stopPolling();
      startQc();
    });

    submitBtn.onclick = async () => {
      errorMsg.textContent = '';
      const server = cleanServerAddress(serverInput.value);
      const user = usernameInput.value.trim();
      const pwd = passwordInput.value;

      if (!server) {
        errorMsg.textContent = 'Please enter a server address.';
        return;
      }
      if (!user) {
        errorMsg.textContent = 'Please enter a username.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in...';

      try {
        const authResult = await authenticateByName(server, user, pwd);
        const newSession = {
          serverAddress: server,
          userId: authResult.User ? authResult.User.Id : authResult.UserId,
          userName: authResult.User ? authResult.User.Name : user,
          accessToken: authResult.AccessToken,
          deviceId: getOrCreateDeviceId(),
        };
        setSession(newSession);
        this.stopPolling();
        if (this.options.onLoginSuccess) {
          this.options.onLoginSuccess(newSession);
        }
      } catch (err) {
        errorMsg.textContent = (err && err.message) || 'Sign in failed. Check credentials.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    };

    startQc();
    focusFirstIn(screenEl);
  }

  pollQuickConnect(server, secret) {
    this.stopPolling();
    this.quickConnectTimer = setInterval(async () => {
      try {
        const authed = await checkQuickConnect(secret);
        if (authed) {
          this.stopPolling();
          const sessRes = await authenticateWithQuickConnect(server, secret);
          if (sessRes && sessRes.AccessToken) {
            const sess = {
              serverAddress: server,
              userId: sessRes.User ? sessRes.User.Id : sessRes.UserId,
              userName: sessRes.User ? sessRes.User.Name : '',
              accessToken: sessRes.AccessToken,
              deviceId: getOrCreateDeviceId(),
            };
            setSession(sess);
            if (this.options.onLoginSuccess) {
              this.options.onLoginSuccess(sess);
            }
          }
        }
      } catch (_) {}
    }, 2500);
  }

  stopPolling() {
    if (this.quickConnectTimer) {
      clearInterval(this.quickConnectTimer);
      this.quickConnectTimer = null;
    }
  }

  destroy() {
    this.stopPolling();
  }
}
