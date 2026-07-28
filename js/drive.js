/* Optional Google Drive backup.
   Uses Google Identity Services for auth and the Drive REST API for a single
   backup file. Scope is drive.file: the app can ONLY see files it creates,
   and the backup is visible in your own Drive. Requires an OAuth client ID
   (set in Settings). Everything runs client-side; no server, no secrets. */
window.Cardstack = window.Cardstack || {};

Cardstack.drive = (function () {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FILE_NAME = 'Cardstack Backup.json';
  const LS_CLIENT = 'cardstack.driveClientId';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiry = 0;

  // A client ID you can override in Settings. Left blank on purpose so each
  // person uses their own Google Cloud project (see README).
  const DEFAULT_CLIENT_ID = '';

  function clientId() {
    return localStorage.getItem(LS_CLIENT) || DEFAULT_CLIENT_ID;
  }
  function setClientId(id) {
    localStorage.setItem(LS_CLIENT, (id || '').trim());
  }
  function isConfigured() { return !!clientId(); }
  function isConnected() { return !!accessToken && Date.now() < tokenExpiry; }

  function ensureClient() {
    if (!window.google || !google.accounts || !google.accounts.oauth2) {
      throw new Error('Google sign-in is still loading. Check your connection and try again.');
    }
    if (!clientId()) throw new Error('Add your Google client ID in Settings first.');
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId(),
        scope: SCOPE,
        callback: () => {}, // replaced per-request
      });
    }
  }

  function getToken(interactive) {
    return new Promise((resolve, reject) => {
      try { ensureClient(); } catch (e) { return reject(e); }
      if (isConnected()) return resolve(accessToken);
      tokenClient.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        resolve(accessToken);
      };
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  function disconnect() {
    if (accessToken && window.google && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) {}
    }
    accessToken = null; tokenExpiry = 0;
  }

  async function api(url, opts) {
    const token = await getToken(false).catch(() => getToken(true));
    const res = await fetch(url, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {}),
    }));
    if (!res.ok) throw new Error('Drive request failed (' + res.status + ')');
    return res;
  }

  async function findFileId() {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const res = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)`);
    const data = await res.json();
    return (data.files && data.files[0]) ? data.files[0].id : null;
  }

  async function backup(payloadObj) {
    await getToken(true);
    const json = JSON.stringify(payloadObj);
    const id = await findFileId();
    if (id) {
      await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      });
      return { updated: true };
    }
    const boundary = 'cardstack' + Date.now();
    const metadata = { name: FILE_NAME, mimeType: 'application/json' };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      `${json}\r\n--${boundary}--`;
    await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return { created: true };
  }

  async function restore() {
    await getToken(true);
    const id = await findFileId();
    if (!id) return null;
    const res = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    return res.json();
  }

  return { isConfigured, isConnected, setClientId, clientId, getToken, disconnect, backup, restore };
})();
