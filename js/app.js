(function () {
  'use strict';
  const B = Cardstack.barcode, SCAN = Cardstack.scanner, DRIVE = Cardstack.drive;

  const LS_CARDS = 'cardstack.cards.v1';
  const SWATCHES = ['#2B6CB0','#1E88A8','#2C7A7B','#00838F','#2F855A','#3AA76D','#6B46C1','#8E44AD','#5C6BC0','#B83280','#D64592','#C53030','#C05621','#E0663A','#D69E2E','#7A4E2D','#4A5568','#455A64','#546E7A','#1A202C','#FFFFFF','#EDE6D8','#DCE6EF','#D7E8DE','#F3E1C6','#F3D9DE','#E4DAF0'];
  const VIEW_KEY = 'cardstack.view';
  const GRID_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  const LIST_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';

  let cards = [];
  let editingId = null;
  let currentId = null;      // card shown in detail
  let draftColor = SWATCHES[0];
  let wakeLock = null;
  let domainTouched = false;
  let viewMode = localStorage.getItem(VIEW_KEY) || 'list';

  /* ---------- storage ---------- */
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'c' + Date.now() + Math.random().toString(16).slice(2));
  function load() {
    try { cards = JSON.parse(localStorage.getItem(LS_CARDS)) || []; }
    catch (e) { cards = []; }
  }
  function save() { localStorage.setItem(LS_CARDS, JSON.stringify(cards)); }
  const byId = (id) => cards.find((c) => c.id === id);

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  // choose readable text colour for a given card background
  function textOn(hex) {
    const c = hex.replace('#',''); const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
    return (0.299*r + 0.587*g + 0.114*b) > 150 ? '#1a1a1a' : '#ffffff';
  }

  /* ---------- rendering the grid ---------- */
  function render(filter) {
    const grid = $('#card-grid'), empty = $('#empty');
    const q = (filter || '').trim().toLowerCase();
    const list = q ? cards.filter((c) => c.name.toLowerCase().includes(q) || c.number.includes(q)) : cards;

    grid.innerHTML = '';
    empty.hidden = cards.length !== 0;
    if (cards.length === 0) return;

    if (list.length === 0) {
      grid.innerHTML = '<p style="color:var(--sand);grid-column:1/-1;text-align:center;padding:30px 0;">No cards match \u201C' + escapeHtml(filter) + '\u201D.</p>';
      return;
    }
    list.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.style.background = c.color;
      btn.style.color = textOn(c.color);
      btn.dataset.id = c.id;
      btn.setAttribute('aria-label', 'Open ' + c.name);
      const mini = miniBars();
      btn.innerHTML =
        '<div class="c-head">' + logoSpan(c.domain) + '<span class="c-name">' + escapeHtml(c.name) + '</span></div>' +
        '<div class="c-num">' + escapeHtml(formatNumber(c.number)) + '</div>' +
        mini;
      grid.appendChild(btn);
    });
    $('#count-note') && ($('#count-note').textContent = cards.length + (cards.length === 1 ? ' card stored.' : ' cards stored.'));
  }
  function miniBars() {
    let bars = '';
    for (let i = 0; i < 16; i++) bars += '<i style="height:' + (8 + ((i * 7) % 14)) + 'px"></i>';
    return '<div class="c-mini">' + bars + '</div>';
  }
  function formatNumber(n) { return n.length > 20 ? n.slice(0, 20) + '\u2026' : n; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

  /* ---------- company logo (favicon by domain) ---------- */
  function slugDomain(name) {
    const s = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    return s ? s + '.com' : '';
  }
  function iconUrl(domain) {
    return domain ? 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128' : '';
  }
  function logoSpan(domain) {
    return domain
      ? '<span class="c-logo"><img src="' + iconUrl(domain) + '" alt="" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></span>'
      : '';
  }

  /* ---------- list / grid view ---------- */
  function applyView() {
    const grid = $('#card-grid');
    if (grid) grid.classList.toggle('grid', viewMode === 'grid');
    const btn = $('#btn-view');
    if (btn) {
      btn.innerHTML = viewMode === 'grid' ? LIST_ICON : GRID_ICON;
      btn.setAttribute('aria-label', viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view');
    }
  }
  function toggleView() {
    viewMode = viewMode === 'grid' ? 'list' : 'grid';
    localStorage.setItem(VIEW_KEY, viewMode);
    applyView();
  }

  /* ---------- overlay / hardware back button ---------- */
  let pendingAfterPop = null;
  function pushOverlay() { history.pushState({ cs: true }, ''); }
  function closeTopOverlayDom() {
    if ($('#scanner').classList.contains('is-active')) { closeScanner(); return true; }
    if ($('#editor').classList.contains('is-open')) { closeSheet('#editor'); editingId = null; return true; }
    if ($('#settings').classList.contains('is-open')) { closeSheet('#settings'); return true; }
    if ($('#detail').classList.contains('is-active')) { closeDetail(); return true; }
    return false;
  }
  function anyOverlayOpen() {
    return $('#scanner').classList.contains('is-active')
      || $('#editor').classList.contains('is-open')
      || $('#settings').classList.contains('is-open')
      || $('#detail').classList.contains('is-active');
  }

  /* ---------- editor sheet ---------- */
  function buildSwatches() {
    const wrap = $('#swatches'); wrap.innerHTML = '';
    SWATCHES.forEach((hex) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.style.background = hex;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', 'colour ' + hex);
      b.setAttribute('aria-checked', hex === draftColor ? 'true' : 'false');
      b.addEventListener('click', () => { draftColor = hex; syncSwatches(); updatePreview(); });
      wrap.appendChild(b);
    });
  }
  function syncSwatches() { $$('#swatches .swatch').forEach((s, i) => s.setAttribute('aria-checked', SWATCHES[i] === draftColor ? 'true' : 'false')); }

  function openEditor(card) {
    editingId = card ? card.id : null;
    $('#editor-title').textContent = card ? 'Edit card' : 'Add card';
    $('#f-name').value = card ? card.name : '';
    $('#f-number').value = card ? card.number : '';
    $('#f-format').value = card ? card.format : 'CODE128';
    $('#f-domain').value = card ? (card.domain || '') : '';
    domainTouched = !!(card && card.domain);
    draftColor = card ? card.color : SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
    $('#format-warn').hidden = true;
    buildSwatches();
    updatePreview();
    openSheet('#editor');
    setTimeout(() => $('#f-name').focus(), 300);
  }
  function updatePreview() {
    const name = $('#f-name').value.trim() || 'Store name';
    const num = $('#f-number').value.trim();
    const domain = $('#f-domain').value.trim();
    const wrap = $('#preview-wrap'), el = $('#card-preview');
    wrap.hidden = !num && !$('#f-name').value.trim();
    el.style.background = draftColor; el.style.color = textOn(draftColor);
    el.innerHTML = '<div class="c-head">' + logoSpan(domain) + '<span class="c-name">' + escapeHtml(name) + '</span></div>' +
      '<div class="c-num">' + escapeHtml(num || '\u2014') + '</div>' + miniBars();
    $('#logo-preview').innerHTML = domain ? '<img src="' + iconUrl(domain) + '" alt="" onerror="this.style.display=\'none\'">' : '';
  }

  function saveFromEditor(e) {
    e.preventDefault();
    const name = $('#f-name').value.trim();
    const number = $('#f-number').value.trim();
    const domain = $('#f-domain').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    let format = $('#f-format').value;
    if (!name || !number) { toast('Add a name and a number.'); return; }

    // validate the barcode renders; fall back to CODE128 if not
    const probe = document.createElement('div');
    const res = B.render(probe, number, format, { small: true });
    if (!res.ok) { $('#format-warn').hidden = false; $('#format-warn').textContent = 'That number can\u2019t be shown as a barcode. Check it and try again.'; return; }
    if (res.fellBack) { format = 'CODE128'; toast('Switched to Code 128 for this number.'); }

    if (editingId) {
      const c = byId(editingId);
      Object.assign(c, { name, number, format, color: draftColor, domain, updatedAt: Date.now() });
    } else {
      cards.unshift({ id: uid(), name, number, format, color: draftColor, domain, createdAt: Date.now(), updatedAt: Date.now() });
    }
    save(); render($('#search').value); history.back();
    toast(editingId ? 'Card updated.' : 'Card added.');
    editingId = null;
    maybeAutoBackup();
  }

  /* ---------- detail / present mode ---------- */
  async function openDetail(id) {
    const c = byId(id); if (!c) return;
    currentId = id;
    const d = $('#detail');
    d.style.setProperty('--card-bg', c.color);
    $('#detail-name').textContent = c.name;
    $('#detail-name').style.color = '';
    d.style.setProperty('--on-card', textOn(c.color));
    $('#detail-logo').innerHTML = c.domain ? '<img src="' + iconUrl(c.domain) + '" alt="" onerror="this.parentNode.style.display=\'none\'">' : '';
    $('#detail-number').textContent = spaceOut(c.number);
    B.render($('#barcode-holder'), c.number, c.format, {});
    d.classList.add('is-active'); d.setAttribute('aria-hidden', 'false');
    requestWakeLock();
    pushOverlay();
  }
  function spaceOut(n) { return n.length > 6 && /^\d+$/.test(n) ? n.replace(/(.{4})/g, '$1 ').trim() : n; }
  function closeDetail() {
    $('#detail').classList.remove('is-active'); $('#detail').setAttribute('aria-hidden', 'true');
    currentId = null; releaseWakeLock();
  }
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch (e) {} wakeLock = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentId) requestWakeLock();
  });

  /* ---------- scanner ---------- */
  function openScanner() {
    const s = $('#scanner'); s.classList.add('is-active'); s.setAttribute('aria-hidden', 'false');
    $('#scanner-msg').textContent = 'Line the barcode up inside the frame.';
    pushOverlay();
    SCAN.start('reader',
      (text, fmt) => {
        $('#f-number').value = text;
        if (fmt) $('#f-format').value = fmt;
        history.back(); updatePreview();
        toast('Scanned. Check the number looks right.');
      },
      (err) => { $('#scanner-msg').textContent = err; }
    );
  }
  async function closeScanner() {
    await SCAN.stop();
    $('#scanner').classList.remove('is-active'); $('#scanner').setAttribute('aria-hidden', 'true');
  }

  /* ---------- sheets ---------- */
  function openSheet(sel) {
    $('#sheet-backdrop').hidden = false;
    const el = $(sel); el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => el.classList.add('is-open'));
    pushOverlay();
  }
  function closeSheet(sel) {
    const el = $(sel); el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!$('#editor').classList.contains('is-open') && !$('#settings').classList.contains('is-open'))
        $('#sheet-backdrop').hidden = true;
    }, 280);
  }

  /* ---------- settings + drive ---------- */
  function openSettings() { refreshDriveUI(); $('#f-clientid').value = DRIVE.clientId(); openSheet('#settings'); render(); }
  function refreshDriveUI() {
    const status = $('#drive-status');
    const connected = DRIVE.isConnected();
    if (!DRIVE.isConfigured()) status.textContent = 'Add your Google client ID below to enable Drive backup.';
    else if (connected) status.textContent = 'Connected. Back up or restore your cards anytime.';
    else status.textContent = 'Client ID saved. Tap Connect to sign in to Google.';
    $('#drive-backup').disabled = !connected;
    $('#drive-restore').disabled = !connected;
    $('#drive-disconnect').hidden = !connected;
    $('#drive-connect').textContent = connected ? 'Reconnect' : 'Connect Drive';
  }
  function payload() { return { app: 'cardstack', version: 1, exportedAt: new Date().toISOString(), cards }; }
  function applyPayload(data) {
    if (!data || !Array.isArray(data.cards)) throw new Error('Not a Cardstack backup.');
    cards = data.cards; save(); render($('#search').value);
  }

  async function driveConnect() {
    try { await DRIVE.getToken(true); toast('Connected to Google Drive.'); }
    catch (e) { toast(e.message || 'Could not connect.'); }
    refreshDriveUI();
  }
  async function driveBackup() {
    try { const r = await DRIVE.backup(payload()); toast(r.updated ? 'Backup updated in Drive.' : 'Backup saved to Drive.'); }
    catch (e) { toast(e.message || 'Backup failed.'); }
    refreshDriveUI();
  }
  async function driveRestore() {
    try {
      const data = await DRIVE.restore();
      if (!data) { toast('No backup found in Drive yet.'); return; }
      if (!confirm('Replace the cards on this device with your Drive backup?')) return;
      applyPayload(data); toast('Restored from Drive.');
    } catch (e) { toast(e.message || 'Restore failed.'); }
  }
  let autoBackupTimer;
  function maybeAutoBackup() {
    if (!DRIVE.isConnected()) return;
    clearTimeout(autoBackupTimer);
    autoBackupTimer = setTimeout(() => DRIVE.backup(payload()).catch(() => {}), 4000);
  }

  /* ---------- file export / import ---------- */
  function exportFile() {
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cardstack-backup.json';
    a.click(); URL.revokeObjectURL(a.href);
    toast('Backup file downloaded. Move it into Drive to keep it safe.');
  }
  function importFile() { $('#import-input').click(); }
  function onImport(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!confirm('Replace the cards on this device with this backup?')) return;
        applyPayload(data); toast('Cards imported.');
      } catch (err) { toast('That file isn\u2019t a valid backup.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* ---------- event wiring ---------- */
  function actions(e) {
    const el = e.target.closest('[data-action]'); if (!el) return;
    const a = el.dataset.action;
    const map = {
      'add': () => openEditor(null),
      'close-editor': () => history.back(),
      'scan': () => openScanner(),
      'close-scanner': () => history.back(),
      'close-detail': () => history.back(),
      'edit-current': () => { const c = byId(currentId); pendingAfterPop = () => openEditor(c); history.back(); },
      'delete-current': () => {
        if (!confirm('Delete this card?')) return;
        cards = cards.filter((c) => c.id !== currentId); save(); render($('#search').value); toast('Card deleted.'); maybeAutoBackup(); history.back();
      },
      'close-settings': () => history.back(),
      'drive-connect': driveConnect,
      'drive-backup': driveBackup,
      'drive-restore': driveRestore,
      'drive-disconnect': () => { DRIVE.disconnect(); refreshDriveUI(); toast('Disconnected.'); },
      'save-clientid': () => { DRIVE.setClientId($('#f-clientid').value); refreshDriveUI(); toast('Client ID saved.'); },
      'export-file': exportFile,
      'import-file': importFile,
    };
    if (map[a]) { e.preventDefault(); map[a](); }
  }

  function init() {
    load();
    render();
    document.addEventListener('click', actions);
    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-view').addEventListener('click', toggleView);
    applyView();
    $('#editor-form').addEventListener('submit', saveFromEditor);
    $('#f-name').addEventListener('input', () => {
      if (!domainTouched) $('#f-domain').value = slugDomain($('#f-name').value.trim());
      updatePreview();
    });
    $('#f-number').addEventListener('input', updatePreview);
    $('#f-format').addEventListener('change', updatePreview);
    $('#f-domain').addEventListener('input', () => { domainTouched = true; updatePreview(); });
    $('#import-input').addEventListener('change', onImport);
    $('#search').addEventListener('input', (e) => render(e.target.value));
    $('#card-grid').addEventListener('click', (e) => {
      const card = e.target.closest('.card'); if (card) openDetail(card.dataset.id);
    });
    $('#sheet-backdrop').addEventListener('click', () => { if (anyOverlayOpen()) history.back(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && anyOverlayOpen()) history.back();
    });
    window.addEventListener('popstate', () => {
      closeTopOverlayDom();
      if (pendingAfterPop) { const fn = pendingAfterPop; pendingAfterPop = null; fn(); }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
