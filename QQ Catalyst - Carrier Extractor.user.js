// ==UserScript==
// MCI internal tooling
// Copyright (c) 2025 Middle Creek Insurance. All rights reserved.
// Not authorized for redistribution or resale.
// @name         QQ Catalyst - Carrier Extractor
// @namespace    qqc-tools
// @version      1.6.6
// @description  Extract from carriers and build QQC payload. Alt+Q: Extractor. (Erie Commercial Mendix fixed v2 + Website)
// @match        https://natgenagency.com/*
// @match        https://*.natgenagency.com/*
// @match        https://agentexchange.com/*
// @match        https://*.agentexchange.com/*
// @match        https://customerdatamanagement.agentexchange.com/*
// @match        https://*.qqcatalyst.com/*
// @match        https://natgen.beyondfloods.com/*
// @match        https://nationalgeneral.torrentflood.com/*
// @match        https://quoting.foragentsonly.com/*
// @all-frames   true
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ%20Catalyst%20-%20Carrier%20Extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ%20Catalyst%20-%20Carrier%20Extractor.user.js
// ==/UserScript==

(function () {
  'use strict';

  const PAGE_WINDOW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const STORAGE_KEY = 'QQC_PAYLOAD_V2';
  const PENDING_KEY = 'QQC_PENDING_V1';
  const QQ_SAFE_URLS = [
      'https://app.qqcatalyst.com/Contacts/CustomerList',
      'https://app.qqcatalyst.com/Contacts/Customer/Index',
      'https://app.qqcatalyst.com/'
  ];

      // ---------- Master Menu Bridge (exporter registry + message listener) ----------
  const QQ_CONTACTS_URL = QQ_SAFE_URLS[0]; // fix undefined reference in your existing send code

  function detectCarrierKeyFromHost(host) {
    host = (host || location.hostname || '').toLowerCase();
    if (host.includes('agentexchange.com')) return 'erie';
    if (host.includes('customerdatamanagement.agentexchange.com')) return 'erie';
    if (host.includes('natgenagency.com') || host.includes('nationalgeneral.torrentflood.com')) return 'natgen';
    if (host.includes('natgen.beyondfloods.com') || host.includes('beyondfloods.com')) return 'beyondfloods';
    if (host.includes('quoting.foragentsonly.com') || host.includes('foragentsonly.com')) return 'progressive';
    if (host.includes('ncjuanciua.org') || host.includes('ncjua-nciua.org') || host.includes('insure.ncjuanciua.org')) return 'ncjua';
    return null;
  }

  const THIS_EXPORTER_KEY = detectCarrierKeyFromHost(location.hostname);

  function ensureExporterPanelOpen() {
    try { mountExtractorPanel(); } catch (e) { console.warn('[QQC Extractor] mountExtractorPanel failed', e); }
  }

  async function exporterGetCustomerData() {
    ensureExporterPanelOpen();
    // trigger the same auto-detect flow your panel uses
    try {
      const p = sanitizePayloadObject((await autoDetect()) || {});
      lastExtracted = p;
      try { await GM_setValue(STORAGE_KEY, p); } catch {}
      try { extractorSetUI(p); } catch {}
      extractorStatus(`Detected from ${p.carrier || 'page'}.`);
      return p;
    } catch (e) {
      console.error('[QQC Extractor] getCustomerData error', e);
      extractorStatus('Auto-detect failed.');
      return null;
    }
  }

  async function exporterSendToQQ() {
    // mimic clicking "Send to QQ Catalyst" (but without relying on undefined vars)
    const p = await exporterGetCustomerData();
    if (!p) return false;
    try {
      await GM_setValue(STORAGE_KEY, p);
      await GM_setValue(PENDING_KEY, { payload: p, ts: Date.now(), stage: 'popup' });
    } catch {}
    openQQSafe();
    extractorStatus('Sending to QQ...');
    return true;
  }

  // Expose a shared registry the Master Menu expects
  try {
    const w = PAGE_WINDOW || window;
    w.MCI_EXPORTERS = w.MCI_EXPORTERS || {};
    if (THIS_EXPORTER_KEY) {
      w.MCI_EXPORTERS[THIS_EXPORTER_KEY] = {
        openUI: () => ensureExporterPanelOpen(),
        getCustomerData: () => exporterGetCustomerData(),
        sendToQQ: () => exporterSendToQQ()
      };
      // helpful debug
      w.MCI_EXPORTERS[THIS_EXPORTER_KEY].__mci = { version: 'bridge-1', host: location.hostname };
    }
  } catch (e) {
    console.warn('[QQC Extractor] Failed to attach MCI_EXPORTERS bridge', e);
  }

  // Listen for the Menu's postMessage fallback
  window.addEventListener('message', async (ev) => {
    const d = ev && ev.data;
    if (!d || typeof d !== 'object') return;

    // Menu sends: { mci:"mciExporter", carrier:key, action:"openUI|getCustomerData|sendToQQ" }
    if (d.mci === 'mciExporter') {
      const key = d.carrier;
      const action = d.action;
      if (!key || !action) return;
      if (THIS_EXPORTER_KEY && key !== THIS_EXPORTER_KEY) return;

      if (action === 'openUI') ensureExporterPanelOpen();
      if (action === 'getCustomerData') await exporterGetCustomerData();
      if (action === 'sendToQQ') await exporterSendToQQ();
    }
  }, false);

    function openQQSafe() {
        // Always try the safest first
        const url = QQ_SAFE_URLS[0];
        try { window.open(url, '_blank', 'noopener'); }
        catch { window.open(url, '_blank'); }
    }

  // State
  let extractorPanel = null;
  let pastePanel = null;
  let extractorHost = null;
  let pasteHost = null;
  let lastExtracted = null; // preserves full detected payload (incl. additionalContacts)

  function closeExtractorPanel() {
    if (extractorHost) {
      extractorHost.remove();
      extractorHost = null;
    }
    extractorPanel = null;
  }

  function closePastePanel() {
    if (pasteHost) {
      pasteHost.remove();
      pasteHost = null;
    }
    pastePanel = null;
  }

  // ---------- Lightweight HUD (QQ visual status) ----------
  let hudEl = null, hudTxt = null, hudIco = null, hudHideTid = null;
  function clearHudHideTimer() {
    if (hudHideTid) {
      clearTimeout(hudHideTid);
      hudHideTid = null;
    }
  }
  function hideHud() {
    clearHudHideTimer();
    try { hudEl && hudEl.remove(); } catch { }
    hudEl = null;
    hudIco = null;
    hudTxt = null;
  }
  function scheduleHudHide(ms) {
    clearHudHideTimer();
    if (ms > 0) {
      hudHideTid = setTimeout(hideHud, ms);
    }
  }
  function onQQ() { return /qqcatalyst\.com$/i.test(location.hostname); }
  function ensureHudStyles() {
    if (document.getElementById('qqc-hud-styles')) return;
    const st = document.createElement('style');
    st.id = 'qqc-hud-styles';
    st.textContent = '@keyframes qqcspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }
  function ensureHud() {
    if (!onQQ()) return null;
    if (hudEl && document.body.contains(hudEl)) return hudEl;
    ensureHudStyles();
    const el = document.createElement('div');
    el.id = 'qqc-hud';
    el.style.cssText = 'position:fixed;left:50%; top:50%; transform:translate(-50%, -50%);z-index:2147483646;background:#111827;color:#fff;padding:8px 10px;border:1px solid #374151;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;gap:8px;align-items:center;font:12px system-ui;';
    const ico = document.createElement('span');
    ico.id = 'qqc-hud-ico';
    ico.style.cssText = 'display:inline-block;width:12px;height:12px;border:2px solid #fff;border-right-color:transparent;border-radius:50%;animation:qqcspin .8s linear infinite;';
    const txt = document.createElement('span');
    txt.id = 'qqc-hud-txt';
    txt.textContent = 'Working...';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'qqc-hud-close';
    closeBtn.textContent = 'Ã—';
    closeBtn.setAttribute('aria-label', 'Dismiss QQC status');
    closeBtn.style.cssText = 'margin-left:6px;background:transparent;border:none;color:#9ca3af;font-size:14px;line-height:1;cursor:pointer;padding:0 4px;';
    closeBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideHud();
    });
    el.appendChild(ico); el.appendChild(txt); el.appendChild(closeBtn);
    document.body.appendChild(el);
    hudEl = el; hudIco = ico; hudTxt = txt; return el;
  }
  function hudInfo(msg) { if (!onQQ()) return; ensureHud(); if (hudTxt) hudTxt.textContent = msg || 'Working...'; if (hudIco) { hudIco.style.animation = 'qqcspin .8s linear infinite'; hudIco.style.borderColor = '#fff'; hudIco.style.borderRightColor = 'transparent'; hudIco.textContent = ''; } clearHudHideTimer(); }
  function hudOk(msg) {
    if (!onQQ()) return; ensureHud(); if (hudTxt) hudTxt.textContent = msg || 'Done'; if (hudIco) { hudIco.style.animation = ''; hudIco.style.border = ''; hudIco.style.width = 'auto'; hudIco.style.height = 'auto'; hudIco.textContent = 'âœ”'; hudIco.style.color = '#10b981'; }
    scheduleHudHide(3000);
  }
  function hudError(msg) { if (!onQQ()) return; ensureHud(); if (hudTxt) hudTxt.textContent = msg || 'Error'; if (hudIco) { hudIco.style.animation = ''; hudIco.style.border = ''; hudIco.style.width = 'auto'; hudIco.style.height = 'auto'; hudIco.textContent = 'âœ–'; hudIco.style.color = '#ef4444'; } scheduleHudHide(5000); }

  // ---------- Shared Utils ----------
  const S = sel => document.querySelector(sel);
  const SA = sel => Array.from(document.querySelectorAll(sel));
  const T = el => (el?.textContent || '').trim();
  const V = el => (el?.value || '').trim();
  function isVisible(el) { return !!el && el.offsetParent !== null; }
  async function waitFor(fn, { timeout = 10000, interval = 100 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = fn();
      if (v) return v;
      await new Promise(r => setTimeout(r, interval));
    }
    return null;
  }
  async function waitForSelector(sel, { root = document, timeout = 10000, interval = 100 } = {}) {
    return waitFor(() => {
      const el = root.querySelector(sel);
      return (el && isVisible(el)) ? el : null;
    }, { timeout, interval });
  }
  async function waitForText(el, predicate, opts = {}) {
    return waitFor(() => {
      const txt = T(el);
      return predicate(txt) ? txt : null;
    }, opts);
  }
  function parseCityStateZip(line) {
    const m = (line || '').trim().match(/^(.+?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/);
    return m ? { city: m[1], state: m[2], zip: m[3] } : { city: '', state: '', zip: '' };
  }
  function toMMDDYYYY(s) {
    if (!s) return '';
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return s;
    const mm = String(m[1]).padStart(2, '0');
    const dd = String(m[2]).padStart(2, '0');
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (parseInt(yyyy, 10) > 30 ? '19' : '20') + yyyy;
    return `${mm}/${dd}/${yyyy}`;
  }

  function formatPhone(digits) {
    const d = (digits || '').replace(/[^\d]/g, '');
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return digits || '';
  }

  // Proper-case names: capitalize first letter of each word/segment, preserve hyphens/apostrophes
  function toNameCase(s) {
    if (!s) return '';
    const str = String(s).trim().toLowerCase();
    let out = '', upperNext = true;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (/[a-z]/.test(ch) && upperNext) { out += ch.toUpperCase(); upperNext = false; }
      else { out += ch; upperNext = /[\s\-']/.test(ch); }
    }
    return out;
  }

  function cleanPlaceholderString(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/[^a-z]/gi, '').toLowerCase();
    if (!normalized) return trimmed;
    if (normalized === 'na' || normalized === 'none' || normalized === 'notapplicable' || normalized === 'notavailable') {
      return '';
    }
    return trimmed;
  }

  function sanitizePayloadObject(data) {
    if (data == null) return data;
    if (typeof data === 'string') return cleanPlaceholderString(data);
    if (Array.isArray(data)) return data.map(item => sanitizePayloadObject(item));
    if (typeof data === 'object') {
      for (const key of Object.keys(data)) {
        data[key] = sanitizePayloadObject(data[key]);
      }
    }
    return data;
  }

  function hasPossibleDuplicateWarning(root = document) {
    return Array.from(root.querySelectorAll('.title, .modal-title, .dialog-title, .warning, .section-title'))
      .some(el => /possible duplicate/i.test((el.textContent || '').trim()));
  }

  async function waitForPossibleDuplicateWarning(timeout = 2500, interval = 200) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (hasPossibleDuplicateWarning()) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    return hasPossibleDuplicateWarning();
  }

  function noteTextForPayload(payload) {
    if (!payload) return '';
    const carrier = (payload.carrier || '').toLowerCase();
    const sourceUrl = (payload.sourceUrl || '').toLowerCase();
    if (carrier.includes('torrentflood') || sourceUrl.includes('nationalgeneral.torrentflood.com')) {
      return 'NFIP & Excess Floods';
    }
    if (carrier.includes('beyondfloods') || sourceUrl.includes('natgen.beyondfloods.com')) {
      return 'Beyond Floods';
    }
    return '';
  }

  async function clickSaveAllChanges() {
    const btn = document.querySelector('.submit.section_saveall');
    if (!btn) return false;
    try { btn.scrollIntoView({ block: 'center' }); } catch { }
    btn.click();
    const saving = document.querySelector('.section_saving');
    if (saving) {
      for (let i = 0; i < 30; i++) {
        if (saving.style.display === 'none' || saving.classList.contains('hide')) break;
        await new Promise(r => setTimeout(r, 150));
      }
    } else {
      await new Promise(r => setTimeout(r, 350));
    }
    return true;
  }

  async function addCarrierNoteIfNeeded(payload) {
    const noteText = noteTextForPayload(payload);
    if (!noteText) return false;
    const trigger = document.querySelector('button.button.AddNote, .button.AddNote');
    if (!trigger) return false;
    try { trigger.scrollIntoView({ block: 'center' }); } catch { }
    trigger.click();
    const popup = await waitForSelector('#div-add-note', { timeout: 10000, interval: 200 });
    if (!popup) return false;
    const textarea = await waitForSelector('#txtNote', { root: popup, timeout: 8000, interval: 150 });
    if (!textarea) return false;
    textarea.value = noteText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    const addBtn = popup.querySelector('.add-note-button');
    if (addBtn) {
      addBtn.classList.remove('disable');
      addBtn.click();
      return true;
    }
    return false;
  }

  // ---------- Draggable ----------
  function makeDraggable(container, handle, opts = {}) {
    let dragging = false, ox = 0, oy = 0;
    const excludeSel = opts.exclude || '';
    const onDown = (e) => {
      if (excludeSel && e.target && e.target.closest && e.target.closest(excludeSel)) {
        return; // don't start drag when clicking excluded elements (e.g., close button)
      }
      dragging = true;
      const r = container.getBoundingClientRect();
      container.style.left = r.left + 'px';
      container.style.top = r.top + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      container.style.left = Math.max(0, e.clientX - ox) + 'px';
      container.style.top = Math.max(0, e.clientY - oy) + 'px';
    };
    const onUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', onDown);
  }

  // ---------- Extractor Panel (Alt+E) ----------
  function extractorStatus(msg) {
    if (!extractorPanel) return;
    const s = extractorPanel.querySelector('#qqc-status');
    s.textContent = msg;
    setTimeout(() => s.textContent = '', 5000);
  }
  function buildExtractorPanel() {
    if (extractorPanel && extractorHost?.isConnected) return extractorPanel;
    closeExtractorPanel();
    extractorHost = document.createElement('div');
    extractorHost.id = '__qqc_extractor_host';
    extractorHost.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    extractorHost.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(extractorHost);
    const shadow = extractorHost.shadowRoot;
    shadow.innerHTML = `
      <style>
        :host{ all:initial; }
        *{ box-sizing:border-box; font-family:system-ui,Segoe UI,Arial,sans-serif; }
        button,select,input,textarea{ font:inherit; }
      </style>
      <div id="qqc-extractor-panel" style="width:405px;background:#729cf7;color:#000;border:1px solid #374151;border-radius:8px;font:12px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.35)">
      <div id="qqc-header-ex" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#758cad;border-bottom:1px solid #374151;border-radius:8px 8px 0 0;gap:8px;">
        <button id="qqc-save" style="background:#10b981;border:none;color:#062026;padding:6px 8px;border-radius:6px;cursor:pointer">Send to QQ Catalyst</button>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <label style="color:#fff;font-size:11px;">Contact</label>
          <select id="qqc-ct-ex" style="height:22px;">
            <option>Customers</option>
            <option>Prospects</option>
          </select>
          <label style="color:#fff;font-size:11px;">Customer</label>
          <select id="qqc-cust-ex" style="height:22px;">
            <option>Personal</option>
            <option>Commercial</option>
          </select>
          <span id="qqc-status" style="color:#f2ec41;font-size:11px;"></span>
          <button id="qqc-close" style="background:#dc2626;border:1px solid #991b1b;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer">X</button>
        </div>
      </div>
      <div style="padding:10px;max-height:65vh;overflow:auto;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label>First<input id="qqc-first" style="width:100%"></label>
          <label>Middle<input id="qqc-middle" style="width:100%"></label>
          <label>Last<input id="qqc-last" style="width:100%"></label>
          <label>Suffix<input id="qqc-suffix" style="width:100%"></label>
          <label>Business Name<input id="qqc-biz" style="width:100%" placeholder="if Commercial"></label>
          <label>Phone<input id="qqc-phonetype" placeholder="(###) ###-#### or label" style="width:100%"></label>
          <label>Email<input id="qqc-email" style="width:100%"></label>
          <label>DOB<input id="qqc-dob" placeholder="mm/dd/yyyy" style="width:100%"></label>
          <label>DL Number<input id="qqc-dln" style="width:100%"></label>
          <label>DL State<input id="qqc-dlstate" style="width:100%"></label>
          <label>EIN<input id="qqc-ein" style="width:100%" placeholder="business"></label>
        </div>
        <hr style="border-color:#374151;margin:10px 0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <label>Street<input id="qqc-addr1" style="width:100%"></label>
          <label>Line 2<input id="qqc-addr2" style="width:100%"></label>
          <label>City<input id="qqc-city" style="width:100%"></label>
          <label>State<input id="qqc-state" style="width:100%"></label>
          <label>Zip<input id="qqc-zip" style="width:100%"></label>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button id="qqc-detect" style="background:#2563eb;border:none;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer">Auto Detect</button>
          <button id="qqc-save" style="background:#10b981;border:none;color:#062026;padding:6px 8px;border-radius:6px;cursor:pointer;display:none">Send to QQ</button>
          <button id="qqc-copy" style="background:#2563eb;border:none;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer;display:none">Copy JSON</button>
        </div>
        <textarea id="qqc-json" placeholder="Payload (view/edit)" style="width:100%;height:140px;margin-top:8px"></textarea>
      </div>
      </div>
    `;
    const el = shadow.querySelector('#qqc-extractor-panel');
    extractorPanel = el;
    el.querySelector('#qqc-close')?.addEventListener('click', closeExtractorPanel);
    // Fix any mojibake in header text and close label
    try {
      const htxt = extractorPanel.querySelector('#qqc-header-ex strong');
      if (htxt) htxt.textContent = 'Carrier -> QQC';
      const cbtn = extractorPanel.querySelector('#qqc-close');
      if (cbtn) cbtn.textContent = 'X';
    } catch { }
    // Make entire header draggable, but ignore clicks on the close button
    const headerHandle = extractorPanel.querySelector('#qqc-header-ex');
    if (headerHandle) {
      makeDraggable(extractorHost, headerHandle, { exclude: '#qqc-close' });
    }
    // Move Contact/Customer selectors out of header into own row below header
    try {
      const header = extractorPanel.querySelector('#qqc-header-ex');
      const oldCt = header?.querySelector('#qqc-ct-ex');
      if (oldCt) {
        const prev = oldCt.previousElementSibling;
        oldCt.remove();
        if (prev && prev.tagName === 'LABEL') prev.remove();
      }
      const oldCu = header?.querySelector('#qqc-cust-ex');
      if (oldCu) {
        const prev = oldCu.previousElementSibling;
        oldCu.remove();
        if (prev && prev.tagName === 'LABEL') prev.remove();
      }
      const row = document.createElement('div');
      row.id = 'qqc-type-row';
      row.style.cssText = 'display:flex;gap:10px;align-items:center;margin-bottom:8px;background:#84aef2;padding:6px 8px;border-radius:6px;';
      row.innerHTML = `
        <label style="min-width:64px;">Contact</label>
        <select id="qqc-ct-ex" style="height:24px;">
          <option>Customers</option>
          <option>Prospects</option>
        </select>
        <label style="margin-left:12px;min-width:76px;">Customer</label>
        <select id="qqc-cust-ex" style="height:24px;">
          <option>Personal</option>
          <option>Commercial</option>
        </select>
      `;
      const content = extractorPanel.querySelector('#qqc-header-ex')?.nextElementSibling;
      if (content) content.insertBefore(row, content.firstChild);
      // Set default Contact type to Prospects
      try {
        const ctDefault = extractorPanel.querySelector('#qqc-ct-ex');
        if (ctDefault) ctDefault.value = 'Prospects';
      } catch { }
    } catch { }
    // Hide deprecated inputs/buttons
    try {
      extractorPanel.querySelector('#qqc-dln')?.closest('label')?.style?.setProperty('display', 'none', 'important');
      extractorPanel.querySelector('#qqc-dlstate')?.closest('label')?.style?.setProperty('display', 'none', 'important');
      extractorPanel.querySelector('#qqc-copy')?.style?.setProperty('display', 'none', 'important');
      extractorPanel.querySelector('#qqc-json')?.style?.setProperty('display', 'none', 'important');
    } catch { }
    return el;
  }
  function extractorReadUI() {
    const get = id => extractorPanel.querySelector(id).value.trim();
    return sanitizePayloadObject({
      carrier: location.hostname, sourceUrl: location.href,
      firstName: toNameCase(get('#qqc-first')), middleName: get('#qqc-middle'), lastName: toNameCase(get('#qqc-last')), suffix: get('#qqc-suffix'),
      businessName: get('#qqc-biz'),
      primaryPhone: get('#qqc-phonetype').replace(/[^\d]/g, ''), phoneType: get('#qqc-phonetype'),
      primaryEmail: get('#qqc-email').toLowerCase(),
      dob: get('#qqc-dob'),
      ein: get('#qqc-ein'),
      contactType: 'Customers',
      customerType: get('#qqc-biz') ? 'Commercial' : 'Personal',
      status: 'Active',
      address: { line1: get('#qqc-addr1'), line2: get('#qqc-addr2'), city: get('#qqc-city'), state: get('#qqc-state'), zip: get('#qqc-zip') }
    });
  }
  function extractorSetUI(p) {
    if (!extractorPanel) { console.warn('[QQC Extractor] extractorPanel missing; cannot set UI'); return; }
    const set = (id, v) => { const n = extractorPanel.querySelector(id); if (n) n.value = v || ''; };
    set('#qqc-first', toNameCase(p.firstName));
    set('#qqc-middle', p.middleName);
    set('#qqc-last', toNameCase(p.lastName));
    set('#qqc-suffix', p.suffix);
    set('#qqc-biz', p.businessName);
    // Show formatted phone in single phone field
    set('#qqc-phonetype', p.phoneType || formatPhone(p.primaryPhone));
    set('#qqc-email', p.primaryEmail);
    set('#qqc-dob', p.dob);
    set('#qqc-ein', p.ein);
    set('#qqc-addr1', p.address?.line1);
    set('#qqc-addr2', p.address?.line2);
    set('#qqc-city', p.address?.city);
    set('#qqc-state', p.address?.state);
    set('#qqc-zip', p.address?.zip);
    const box = extractorPanel.querySelector('#qqc-json'); if (box) box.value = JSON.stringify(p, null, 2);
  }

  // ---------- NFIP / National General TorrentFlood ----------
  function isNFIPInsuredPanel() {
    return /torrentflood\.com$/i.test(location.hostname) &&
      !!document.getElementById('InsuredInformationPanel');
  }

  async function extractNFIPInsuredPanel() {
    const panel = await waitFor(() => document.getElementById('InsuredInformationPanel'), { timeout: 8000, interval: 150 });
    const root = panel || document;
    await waitFor(() => {
      const span = root.querySelector('.display_value_Insured1_DisplayName');
      return span && span.textContent.trim() ? span : null;
    }, { timeout: 6000, interval: 150 });
    const getInput = sel => (root.querySelector(sel)?.value || '').trim();
    const getDisplay = sel => (root.querySelector(sel)?.textContent || '').trim();

    // --- Name (use inputs if available, fall back to display span) ---
    let firstName = getInput('#InlinePolicyUpdateView_Insured1_FirstName');
    let lastName = getInput('#InlinePolicyUpdateView_Insured1_LastName');

    if (!firstName || !lastName) {
      const displayName = getDisplay('.display_value_Insured1_DisplayName');
      if (displayName) {
        const parts = displayName.split(/\s+/).filter(Boolean);
        firstName = firstName || parts[0] || '';
        if (!lastName && parts.length > 1) {
          lastName = parts.slice(1).join(' ');
        }
      }
    }

    // --- Email ---
    let primaryEmail =
      getDisplay('.display_value_Insured1_EMail') ||
      getInput('#InlinePolicyUpdateView_Insured1_EMail');

    // --- Phone: prefer Cell, then Home, then Work ---
    let phoneRaw =
      getDisplay('.display_value_Insured1_PhoneCell') ||
      getDisplay('.display_value_Insured1_PhoneHome') ||
      getDisplay('.display_value_Insured1_PhoneWork') ||
      getInput('#InlinePolicyUpdateView_Insured1_PhoneCell') ||
      getInput('#InlinePolicyUpdateView_Insured1_PhoneHome') ||
      getInput('#InlinePolicyUpdateView_Insured1_PhoneWork');

    const digits = (phoneRaw || '').replace(/[^\d]/g, '');
    const primaryPhone = digits;
    const phoneType = formatPhone(primaryPhone);

    // --- Mailing address ---
    let line1 = '', line2 = '', city = '', state = '', zip = '';

    // Easiest: use the display UL
    const addrUl = root.querySelector('#UpdateMailingAddressRegion ul.addressLabelView');
    if (addrUl) {
      const lines = Array.from(addrUl.querySelectorAll('li'))
        .map(li => (li.textContent || '').trim())
        .filter(Boolean);

      if (lines[0]) line1 = lines[0]; // "1921 SANDHURST DR"

      if (lines[1]) {
        // "CHARLOTTE, NC 28205"
        const csz = parseCityStateZip(lines[1]);
        city = csz.city;
        state = csz.state;
        zip = csz.zip;
      }
    } else {
      // Fallback to the editable fields if the UL isn't there
      line1 = getInput('#InlinePolicyUpdateView_MailingAddress_Address1');
      line2 = getInput('#InlinePolicyUpdateView_MailingAddress_Address2');
      city = getInput('#InlinePolicyUpdateView_MailingAddress_City');

      // State: first two letters of the selected option text ("NC - NORTH CAROLINA")
      const stateSel = root.querySelector('#InlinePolicyUpdateView_MailingAddress_State');
      if (stateSel) {
        const opt = stateSel.selectedOptions?.[0] || stateSel.options[stateSel.selectedIndex];
        if (opt && opt.textContent) {
          const t = opt.textContent.trim();
          const m = t.match(/^([A-Z]{2})\s*-/);
          if (m) state = m[1];
        }
      }

      zip =
        getInput('#InlinePolicyUpdateView_MailingAddress_ZipPostalCode') ||
        getInput('.USZipCode');
    }

    const additionalContacts = [];
    ['2', '3', '4'].forEach(idx => {
      const name = getDisplay(`.display_value_Insured${idx}_DisplayName`);
      if (name && !/^\s*(n\/a|na)$/i.test(name)) {
        const parts = name.split(/\s+/).filter(Boolean);
        additionalContacts.push({
          firstName: toNameCase(parts[0] || ''),
          middleName: '',
          lastName: toNameCase(parts.slice(1).join(' ')),
          relationship: 'Additional Insured'
        });
      }
    });

    return {
      carrier: 'NFIP-TorrentFlood',
      sourceUrl: location.href,
      firstName,
      lastName,
      primaryPhone,
      phoneType,
      primaryEmail,
      contactType: 'Customers',
      customerType: 'Personal',
      address: { line1, line2, city, state, zip },
      additionalContacts: additionalContacts.length ? additionalContacts : undefined
    };
  }

  // ---------- Beyond Floods (natgen.beyondfloods.com) ----------
  function isBeyondFloodsSummary() {
    return /natgen\.beyondfloods\.com$/i.test(location.hostname) &&
      !!document.querySelector('.col-xs-12.col-md-8.col-lg-8 table.table.table-bordered');
  }

  function extractBeyondFloodsSummary() {
    const root = document.querySelector('.col-xs-12.col-md-8.col-lg-8') || document;
    const rows = Array.from(root.querySelectorAll('table.table.table-bordered tr'));

    const getVal = (label) => {
      const row = rows.find(r => {
        const th = r.querySelector('th');
        return th && (th.textContent || '').trim().toLowerCase().startsWith(label.toLowerCase());
      });
      if (!row) return '';
      const td = row.querySelector('td');
      return (td?.textContent || '').trim();
    };

    // Name
    const rawName = getVal('Customer Name');
    const nameParts = rawName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Email
    const primaryEmail = getVal('Customer Email');

    // Phone
    const phoneRaw = getVal('Customer Phone');
    const primaryPhone = phoneRaw.replace(/[^\d]/g, '');
    const phoneDisplay = formatPhone(primaryPhone);

    // Insured Dwelling Address
    let line1 = '', city = '', state = '', zip = '';

    const addrRow = rows.find(r => {
      const th = r.querySelector('th');
      return th && /Insured Dwelling Address/i.test((th.textContent || '').trim());
    });

    if (addrRow) {
      const divs = Array.from(addrRow.querySelectorAll('td div'))
        .map(d => (d.textContent || '').trim())
        .filter(Boolean);

      if (divs.length > 0) {
        line1 = divs[0]; // street
      }
      if (divs.length > 1) {
        const csz = parseCityStateZip(divs[1]);
        city = csz.city;
        state = csz.state;
        zip = csz.zip;
      }
    }

    return {
      carrier: 'BeyondFloods',
      sourceUrl: location.href,
      firstName,
      lastName,
      primaryPhone,
      phoneType: phoneDisplay,
      primaryEmail,
      contactType: 'Customers',
      customerType: 'Personal',
      address: { line1, line2: '', city, state, zip }
    };
  }

  // ---------- Extractors (NatGen + Erie) ----------
  function isNatGenNamedInsured() {
    return /natgenagency\.com$/i.test(location.hostname) && /QuoteNamedInsured\.aspx$/i.test(location.pathname);
  }
  function extractNatGenNamedInsured() {
    const gv = id => (S('#' + id)?.value || '').trim();
    const tv = sel => (S(sel)?.value || '').trim();
    const firstName = gv('ctl00_MainContent_InsuredNamed1_txtInsFirstName');
    const middleName = gv('ctl00_MainContent_InsuredNamed1_txtInsMiddleName');
    const lastName = gv('ctl00_MainContent_InsuredNamed1_txtInsLastName');
    const suffix = tv('#ctl00_MainContent_InsuredNamed1_ddlInsSuffix');
    const p1 = gv('ctl00_MainContent_InsuredNamed1_ucPhonesV2_PhoneNumber1_txtPhone1');
    const p2 = gv('ctl00_MainContent_InsuredNamed1_ucPhonesV2_PhoneNumber1_txtPhone2');
    const p3 = gv('ctl00_MainContent_InsuredNamed1_ucPhonesV2_PhoneNumber1_txtPhone3');
    const primaryPhone = (p1 + p2 + p3).replace(/[^\d]/g, '');
    const phoneDisplay = (p1 && p2 && p3) ? `(${p1}) ${p2}-${p3}` : '';
    const primaryEmail = gv('ctl00_MainContent_InsuredNamed1_txtInsEmail');
    const dob = gv('ctl00_MainContent_InsuredNamed1_txtInsDOB');
    const addr1 = gv('ctl00_MainContent_InsuredNamed1_txtInsAdr');
    const addr2 = gv('ctl00_MainContent_InsuredNamed1_txtInsAdr2');
    const city = gv('ctl00_MainContent_InsuredNamed1_txtInsCity');
    const state = tv('#ctl00_MainContent_InsuredNamed1_ddlInsState');
    const zip = gv('ctl00_MainContent_InsuredNamed1_txtInsZip');
    return {
      carrier: 'NatGen', sourceUrl: location.href,
      firstName, middleName, lastName, suffix,
      primaryPhone, phoneType: phoneDisplay,
      primaryEmail, dob,
      address: { line1: addr1, line2: addr2, city, state, zip }
    };
  }
  function isNatGenSummary() {
    return /natgenagency\.com$/i.test(location.hostname) && !!S('#ctl00_MainContent_InsuredInfo1_lblInsName');
  }
  function extractNatGenSummary() {
    const name = T(S('#ctl00_MainContent_InsuredInfo1_lblInsName'));
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(' ');
    const addr1 = T(S('#ctl00_MainContent_InsuredInfo1_lblInsAdr'));
    const csz = T(S('#ctl00_MainContent_InsuredInfo1_lblInsCityStateZip'));
    let city = '', state = '', zip = '';
    const m = csz.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/);
    if (m) { city = m[1]; state = m[2]; zip = m[3]; }
    const phoneRaw = T(S('#ctl00_MainContent_InsuredInfo1_lblInsPhone')); // "(919) 228 - 0924 | Cell"
    const parts = phoneRaw.split('|').map(s => s.trim());
    const phoneDisplay = (parts[0] || '').replace(/\s{2,}/g, ' ').replace(/\s-\s/g, '-');
    const primaryPhone = phoneDisplay.replace(/[^\d]/g, '');
    const primaryEmail = T(S('#ctl00_MainContent_InsuredInfo1_lblInsEmail'));
    return {
      carrier: 'NatGen', sourceUrl: location.href,
      firstName, lastName,
      primaryPhone, phoneType: phoneDisplay,
      primaryEmail,
      address: { line1: addr1, line2: '', city, state, zip }
    };
  }
// ---------- Extractor (Progressive FAO) ----------
function isProgressiveFAO() {
  return /quoting\.foragentsonly\.com$/i.test(location.hostname);
}
function extractProgressiveFAO() {
  const gv = (id) => (S('#' + id)?.value || '').trim();

  // Principal Named Insured
  const firstName = gv('NamedInsured_Embedded_Questions_List_FirstName');
  const middleName = gv('NamedInsured_Embedded_Questions_List_MiddleInitial');
  const lastName = gv('NamedInsured_Embedded_Questions_List_LastName');
  const suffix = (S('#NamedInsured_Embedded_Questions_List_Suffix')?.value || '').trim();
  const dob = gv('NamedInsured_Embedded_Questions_List_DateOfBirth');

  // Contact Information
  const primaryEmail = gv('NamedInsured_Embedded_Questions_List_PrimaryEmailAddress');

  // Phone
  const phoneTypeCode = (S('#NamedInsured_PhoneNumbers_List_0_Embedded_Questions_List_PhoneType')?.value || '').trim(); // M/H/W/O
  const phoneRaw = gv('NamedInsured_PhoneNumbers_List_0_Embedded_Questions_List_PhoneNumber');
  const primaryPhone = (phoneRaw || '').replace(/[^\d]/g, '');
  const phoneDisplay = formatPhone(primaryPhone);

  // Mailing Address
  const addr1 = gv('NamedInsured_Embedded_Questions_List_MailingAddress');
  const addr2 = gv('NamedInsured_Embedded_Questions_List_ApartmentUnit');
  const city = gv('NamedInsured_Embedded_Questions_List_City');
  const state = (S('#NamedInsured_Embedded_Questions_List_State')?.value || '').trim();
  const zip = gv('NamedInsured_Embedded_Questions_List_ZipCode');

  // map phone type if you ever need it later
  const phoneKind =
    phoneTypeCode === 'M' ? 'Cell' :
    phoneTypeCode === 'H' ? 'Home' :
    phoneTypeCode === 'W' ? 'Work' :
    phoneTypeCode === 'O' ? 'Other' : '';

  return {
    carrier: 'Progressive-FAO',
    sourceUrl: location.href,
    firstName,
    middleName,
    lastName,
    suffix,
    dob: toMMDDYYYY(dob),
    primaryPhone,
    phoneType: phoneDisplay,
    phoneKind,
    primaryEmail: (primaryEmail || '').toLowerCase(),
    contactType: 'Customers',
    customerType: 'Personal',
    address: { line1: addr1, line2: addr2, city, state, zip }
  };
}


  function isEriePLW() {
    return /agentexchange\.com$/i.test(location.hostname) && /\/PersonalLinesWeb\/?/i.test(location.pathname);
  }
  async function revealEriePLWDob() {
    const isMasked = (s) => !s || s.includes('*') || (s.replace(/[^\d]/g, '').length < 6);
    const grabDobText = () => {
      // Prefer the DOB shown within the First Named Insured column
      const container = S('.Column-Customer') || document;
      const spans = Array.from(container.querySelectorAll('.named-insured-value span, .named-insured-value .obscured-text-field-container span')).filter(isVisible);
      for (const el of spans) {
        const txt = (el.textContent || '').trim();
        const m = txt.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
        if (m) return `${m[1]}/${m[2]}/${m[3]}`;
      }
      return '';
    };

    const clickRevealNearDob = async () => {
      const container = S('.Column-Customer') || document;
      // Find a toggle button near a label containing "Date of Birth"
      const dobBlocks = Array.from(container.querySelectorAll('.editor-block')).filter(b => /date\s*of\s*birth/i.test((b.textContent || '')));
      for (const block of dobBlocks) {
        const btn = block.querySelector('.reveal-data-btn');
        if (btn && isVisible(btn)) {
          btn.click();
          // wait for unmask to apply
          for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 150)); const v = grabDobText(); if (!isMasked(v)) return; }
        }
      }
      // Fallback: any visible reveal button
      const any = Array.from(document.querySelectorAll('.reveal-data-btn')).find(isVisible);
      if (any) {
        any.click();
        for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 150)); const v = grabDobText(); if (!isMasked(v)) return; }
      }
    };

    let dob = grabDobText();
    if (isMasked(dob)) {
      await clickRevealNearDob();
      dob = grabDobText();
    }
    if (isMasked(dob)) {
      const dobInput = S('#txtDateOfBirth_1');
      if (dobInput && V(dobInput)) dob = V(dobInput);
    }
    if (isMasked(dob)) return '';
    return toMMDDYYYY(dob);
  }
  function parseEriePLWPhone() {
    const ro = SA('.Column-Customer .named-insured-value').find(e => /\(\d{3}\)\s*\d{3}-\d{4}/.test(T(e)));
    if (ro) {
      const num = T(ro).replace(/[^\d]/g, '');
      const display = formatPhone(num);
      return { primaryPhone: num, phoneType: display };
    }
    const inp = S('#FirstNamedInsuredNumber_0');
    const primaryPhone = inp ? V(inp).replace(/[^\d]/g, '') : '';
    const phoneType = formatPhone(primaryPhone);
    return { primaryPhone, phoneType };
  }
  function parseEriePLWEmail() {
    const ro = S('.Column-Customer .customer-lockdown-email');
    if (ro && T(ro)) return T(ro);
    const inp = S('#FirstNamedInsured_EmailAddress');
    return inp ? V(inp) : '';
  }
  function parseEriePLWName() {
    const first = V(S('#FirstNamedInsured_FirstName'));
    const middle = V(S('#FirstNamedInsured_MiddleName'));
    const last = V(S('#FirstNamedInsured_LastName'));
    if (first && last) return { firstName: first, middleName: middle, lastName: last };
    const opt = S('#ddlFirstNamedInsured option:checked');
    const text = T(opt);
    if (text) {
      const parts = text.split(/\s+/);
      return { firstName: parts[0] || '', middleName: '', lastName: parts.slice(1).join(' ') || '' };
    }
    return { firstName: '', middleName: '', lastName: '' };
  }
  function parseEriePLWAddress() {
    const el = S('#mailing-address-text');
    if (!el) return { line1: '', line2: '', city: '', state: '', zip: '' };
    const html = el.innerHTML || '';
    const parts = html.split(/<br\s*\/?>/i).map(s => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    const line1 = parts[0] || '';
    let city = '', state = '', zip = '';
    if (parts[1]) {
      const csz = parseCityStateZip(parts[1]);
      city = csz.city; state = csz.state; zip = csz.zip;
    }
    return { line1, line2: '', city, state, zip };
  }
  function parseEriePLWSecondContact() {
    const root = S('.Column.Col2.Column-Customer') || S('#ddlSecondNamedInsured')?.closest('.Column') || document;
    if (!root) return null;
    // Read name
    let firstName = V(root.querySelector('#SecondNamedInsured_FirstName'));
    let middleName = V(root.querySelector('#SecondNamedInsured_MiddleName'));
    let lastName = V(root.querySelector('#SecondNamedInsured_LastName'));
    if (!firstName || !lastName) {
      const opt = root.querySelector('#ddlSecondNamedInsured option:checked');
      const text = (opt?.textContent || '').trim();
      if (text && !/^\-\s*None\s*\-$/i.test(text)) {
        const parts = text.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }
    }
    if (!(firstName || lastName)) return null;
    // Phone
    let phoneDisplay = '';
    let primaryPhone = '';
    const roPhone = (root !== document) && Array.from(root.querySelectorAll('.named-insured-value')).find(e => /\(\d{3}\)\s*\d{3}-\d{4}/.test((e.textContent || '').trim()));
    if (roPhone) {
      phoneDisplay = (roPhone.textContent || '').trim();
      primaryPhone = phoneDisplay.replace(/[^\d]/g, '');
    } else {
      const inp = root.querySelector('#SecondNamedInsuredNumber_0');
      if (inp) {
        primaryPhone = V(inp).replace(/[^\d]/g, '');
        phoneDisplay = formatPhone(primaryPhone);
      }
    }
    // Email
    let primaryEmail = (root !== document ? (root.querySelector('.customer-lockdown-email')?.textContent || '').trim() : '');
    if (!primaryEmail) {
      const ei = root.querySelector('#SecondNamedInsured_EmailAddress');
      primaryEmail = V(ei);
    }
    // DOB (try masked read-only span or editable input)
    const grabDob = () => {
      const cands = [
        '.named-insured-value .obscured-text-field-container span',
        '.named-insured-value span',
        '.named-insured-value'
      ];
      for (const sel of cands) {
        const el = Array.from(root.querySelectorAll(sel)).find(isVisible);
        const txt = (el?.textContent || '').trim();
        const m = txt && txt.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
        if (m) return `${m[1]}/${m[2]}/${m[3]}`;
      }
      const inp = root.querySelector('#txtDateOfBirth_2');
      return V(inp);
    };
    let dob = grabDob();
    if (dob && /\*/.test(dob)) dob = '';
    dob = toMMDDYYYY(dob || '');
    return {
      firstName, middleName, lastName,
      primaryPhone, phoneType: phoneDisplay,
      primaryEmail,
      dob,
      relationship: 'Spouse'
    };
  }
  async function extractEriePLW() {
    const { firstName, middleName, lastName } = parseEriePLWName();
    const { primaryPhone, phoneType } = parseEriePLWPhone();
    const primaryEmail = parseEriePLWEmail();
    const dob = await revealEriePLWDob();
    const licenseNumber = V(S('#licenseNumber1')) || '';
    const licenseState = V(S('#selLicenseState1')) || T(S('#selLicenseState1 option:checked')) || '';
    const address = parseEriePLWAddress();
    const suffix = V(S('#FirstNamedInsured_Suffix')) || '';
    const second = parseEriePLWSecondContact();
    return {
      carrier: 'Erie-PLW', sourceUrl: location.href,
      firstName, middleName, lastName, suffix,
      primaryPhone, phoneType, primaryEmail, dob,
      licenseNumber, licenseState,
      contactType: 'Customers', customerType: 'Personal',
      address,
      additionalContacts: second ? [second] : []
    };
  }

  // Erie Profile page (Customer/Profile) â€” email is an anchor
  function isErieProfile() {
    return /agentexchange\.com$/i.test(location.hostname) && /^\/Customer\/Profile\/?/i.test(location.pathname);
  }
  async function extractErieProfile() {
    // Email: anchor text contains the email (not mailto)
    const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    let primaryEmail = '';
    // Wait briefly for the anchor to be present
    const emailAnchor = await waitFor(() => document.querySelector('a.party-view-email-value, .email-container a.mx-link, a.mx-link.mx-name-actionButton4.party-view-email-value'), { timeout: 3000, interval: 100 });
    const emailText = (emailAnchor?.textContent || '').trim();
    if (emailRe.test(emailText)) primaryEmail = emailText.match(emailRe)[0];
    if (!primaryEmail) {
      const anchors = Array.from(document.querySelectorAll('a'));
      for (const a of anchors) {
        const m = (a.textContent || '').match(emailRe);
        if (m) { primaryEmail = m[0]; break; }
      }
    }

    const businessName = (document.querySelector('span.mx-name-txt_legalName2')?.textContent || '').trim();

    // Reveal EIN via eye icon if masked, then read full value
    async function readProfileEIN() {
      const span = document.querySelector('span.mx-name-lbl_SsnValue4');
      const eye = document.querySelector('a.mx-link.mx-name-actionButton3.organization-view-eye-icon-link');
      if (!span) return '';
      let val = (span.textContent || '').trim();
      const isMasked = (t) => /\*/.test(t) || t.replace(/[^\d]/g, '').length < 9;
      if (isMasked(val) && eye) {
        eye.click();
        await waitForText(span, t => !isMasked(t), { timeout: 4000, interval: 150 });
        val = (span.textContent || '').trim();
      }
      const m = val.match(/\d{2}-\d{7}/);
      return m ? m[0] : val;
    }

    const phoneText = (document.querySelector('.phone-list .mx-name-lbl_MailAddress2')?.textContent || '').trim();
    const primaryPhone = phoneText.replace(/[^\d]/g, '');

    const addrText = (document.querySelector('.address-list .mx-name-lbl_MailAddress2')?.textContent || '').replace(/\r/g, '');
    const lines = (addrText || '').split('\n').map(s => s.trim()).filter(Boolean);
    let line1 = '', city = '', state = '', zip = '';
    if (lines.length) {
      line1 = lines[0];
      const tail = lines[lines.length - 1];
      const csz = tail && tail.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?/);
      if (csz) { city = csz[1]; state = csz[2]; zip = csz[3]; }
    }

    const ein = await readProfileEIN();

    return {
      carrier: 'Erie-Profile', sourceUrl: location.href,
      businessName,
      primaryPhone, phoneType: formatPhone(primaryPhone),
      primaryEmail,
      ein,
      dob: '', licenseNumber: '', licenseState: '',
      contactType: 'Customers', customerType: businessName ? 'Commercial' : 'Personal',
      address: { line1, line2: '', city, state, zip }
    };
  }
  function hasErieProfileEmailAnchor() {
    return !!document.querySelector('a.party-view-email-value, a.mx-link.mx-name-actionButton4.party-view-email-value');
  }
  function isErieMendix() {
    // Erie Commercial (Mendix SPA) and related Mendix customer data apps
    return /commercial\.agentexchange\.com$/i.test(location.hostname) ||
           /customerdatamanagement\.agentexchange\.com$/i.test(location.hostname) ||
           (/(?:^|\.)agentexchange\.com$/i.test(location.hostname) && !!document.querySelector('.mx-dataview, .mx-layoutgrid, .mx-name-txt_TellAboutCustomer'));
  }
  async function extractErieMendix() {
    // Erie Commercial Mendix SPA (commercial.agentexchange.com) & related Mendix views.
    // URL often stays at /index.html while customer data swaps in the DOM, so we extract
    // from the currently-rendered "Tell us about the Customer" card.
    // NOTE: This page is a SPA; do NOT rely on URL changes.

    function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
    function q(root, sel) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
    function qa(root, sel) { try { return Array.from((root || document).querySelectorAll(sel)); } catch (e) { return []; } }

    // Scope everything to the visible customer card so we don't grab hidden templates or other widgets.
    var root = q(document, '.named-insured-data');
    if (!root) root = q(document, '.mx-name-dvw_Customer .named-insured-data');
    if (!root) root = q(document, '.mx-name-dvw_Customer');
    if (!root) return null;

    // Ensure sensitive fields are unmasked if available
    try {
      var eye = q(root, 'a.mx-link[cssselectorhelper="UnMask"]') || q(document, 'a.mx-link[cssselectorhelper="UnMask"]');
      if (eye) eye.click();
    } catch (e) {}

    // Business name (Legal name)
    var businessName = norm(q(root, '.mx-name-txt_BusinessName2 .form-control-static') && q(root, '.mx-name-txt_BusinessName2 .form-control-static').textContent);

    // EIN (Federal ID)
    var ein = norm(q(root, '.mx-name-txt_TaxNumber .form-control-static') && q(root, '.mx-name-txt_TaxNumber .form-control-static').textContent);
    if (ein && ein !== '--') {
      var digits = ein.replace(/[^0-9]/g, '');
      if (digits.length === 9) ein = digits.substring(0, 2) + '-' + digits.substring(2);
    } else {
      ein = '';
    }

    // Address
    var line1 = norm(q(root, '.mx-name-txt_AddressLine1 .form-control-static') && q(root, '.mx-name-txt_AddressLine1 .form-control-static').textContent);
    var csz = norm(q(root, 'span.mx-name-text1') && q(root, 'span.mx-name-text1').textContent); // e.g. DURHAM, North Carolina 27703-6049
    var city = '', state = '', zip = '';
    if (csz) {
      var parts = csz.split(',');
      city = norm(parts[0] || '');
      var rest = norm(parts.slice(1).join(','));
      var mZip = rest.match(/(\d{5})(?:-\d{4})?\b/);
      if (mZip) zip = mZip[1];

      var restNoZip = norm(rest.replace(/\d{5}(?:-\d{4})?\b/, '').replace(/\s+/g, ' '));
      var map = {
        'North Carolina': 'NC', 'South Carolina': 'SC', 'Virginia': 'VA', 'Georgia': 'GA', 'Tennessee': 'TN',
        'Alabama': 'AL', 'Florida': 'FL', 'Kentucky': 'KY', 'West Virginia': 'WV', 'Maryland': 'MD',
        'Pennsylvania': 'PA', 'Ohio': 'OH'
      };
      if (/^[A-Z]{2}$/.test(restNoZip)) state = restNoZip;
      else {
        var cap = restNoZip.split(/\s+/).map(function (x) { return x ? (x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()) : x; }).join(' ');
        state = map[cap] || map[restNoZip] || restNoZip;
      }
    }

    // Phone + Email: pick list items by label text inside the contact list (more reliable than global selectors)
    var primaryPhone = '';
    var primaryEmail = '';
    try {
      var lis = qa(root, '.mx-name-lst_CustomerContactPoint2 li');
      lis.forEach(function (li) {
        var label = norm(q(li, 'span.form-related-label') && q(li, 'span.form-related-label').textContent).toLowerCase();
        var val = norm(q(li, '.form-control-static') && q(li, '.form-control-static').textContent);
        if (!val || val === '--') return;
        if (!primaryPhone && label.indexOf('phone') >= 0) primaryPhone = val;
        if (!primaryEmail && label.indexOf('email') >= 0) primaryEmail = val;
      });
      // Fallbacks if list structure changes
      if (!primaryPhone) primaryPhone = norm(q(root, '.mx-name-cnt_ContactTypeCode2 .form-control-static') && q(root, '.mx-name-cnt_ContactTypeCode2 .form-control-static').textContent);
      if (!primaryEmail) primaryEmail = norm(q(root, '.mx-name-cnt_ContactTypeCodeEmail2 .form-control-static') && q(root, '.mx-name-cnt_ContactTypeCodeEmail2 .form-control-static').textContent);
      if (primaryEmail === '--') primaryEmail = '';
    } catch (e) {}

    // Website (input value if present)
    var website = '';
    try {
      var w = q(document, '.mx-name-txt_CustomerWebsite input') || q(document, 'input[id*="txt_CustomerWebsite"]');
      if (w && w.value) website = norm(w.value);
      if (!website) {
        var wr = q(document, '.mx-name-txt_CustomerWebsite .form-control-static');
        if (wr) website = norm(wr.textContent);
      }
    } catch (e) {}


    // Audit contact (workers comp) — contains a real person name + direct phone/email.
    // Katy may not always fill this out, but when present it's perfect for QQ's required First/Last
    // and for QQ "Additional Contacts".
    var auditFirst = '', auditMiddle = '', auditLast = '', auditPhone = '', auditEmail = '', auditTitle = '';
    try {
      var aroot = q(document, '.mx-name-cnt_AuditContactTile_WC') || q(document, '.mx-name-cnt_AuditContact');
      if (aroot) {
        var af = q(aroot, '.mx-name-txt_AuditContact_FirstName input');
        var am = q(aroot, '.mx-name-txt_AuditContact_MiddleName input');
        var al = q(aroot, '.mx-name-txt_AuditContact_LastName input');
        var at = q(aroot, '.mx-name-txt_AuditContact_Title input');
        auditFirst = norm(af && (af.value || af.getAttribute('value')));
        auditMiddle = norm(am && (am.value || am.getAttribute('value')));
        auditLast = norm(al && (al.value || al.getAttribute('value')));
        auditTitle = norm(at && (at.value || at.getAttribute('value')));

        // Phone/email in audit contact are inputs, not form-control-static
        var ap = q(aroot, '.mx-name-txt_PhoneContactPoint input');
        var ae = q(aroot, '.mx-name-txt_EmailContactPoint input');
        auditPhone = norm(ap && (ap.value || ap.getAttribute('value')));
        auditEmail = norm(ae && (ae.value || ae.getAttribute('value')));
      }
    } catch (e) {}

    // If the "business contact points" didn't provide phone/email, fall back to audit contact
    if (!primaryPhone && auditPhone) primaryPhone = auditPhone;
    if (!primaryEmail && auditEmail) primaryEmail = auditEmail;

    // Provide a real person name when available (QQ popup can require First + Last)
    var firstName = auditFirst || '';
    var middleName = auditMiddle || '';
    var lastName = auditLast || '';

    // Fallback placeholders if QQ requires names and we truly have none.
    if (!firstName && !lastName && businessName) { firstName = '.'; lastName = 'Business'; }
    // If we still don't have core fields, it's likely not the customer page yet
    if (!businessName && !ein && !primaryPhone && !primaryEmail && !line1 && !csz) return null;

    // Return payload using the keys the rest of the system expects (primaryPhone/primaryEmail).
    return {
      carrier: 'Erie',
      source: 'erie-mendix',
      contactType: 'Customers',
      customerType: 'Commercial',
      firstName: firstName,
      middleName: middleName,
      lastName: lastName,
      businessName: businessName,
      primaryPhone: primaryPhone,
      primaryEmail: primaryEmail,
      // keep legacy aliases for older consumers (harmless)
      phone: primaryPhone,
      email: primaryEmail,
      website: website,
      ein: ein,
      additionalContacts: (auditFirst || auditLast || auditPhone || auditEmail) ? [{
        firstName: auditFirst,
        middleName: auditMiddle,
        lastName: auditLast,
        relationship: 'Audit Contact',
        phoneType: 'Work',
        primaryPhone: auditPhone,
        primaryEmail: auditEmail,
        title: auditTitle
      }] : [],
      address: { line1: line1, line2: '', city: city, state: state, zip: zip }
    };
  }


  async function autoDetect() {
    if (hasErieProfileEmailAnchor()) return await extractErieProfile();
    if (isProgressiveFAO()) return extractProgressiveFAO();
    if (isNatGenNamedInsured()) return extractNatGenNamedInsured();
    if (isNatGenSummary()) return extractNatGenSummary();
    if (isEriePLW()) return await extractEriePLW();
    if (isErieProfile()) return await extractErieProfile();
    if (isErieMendix()) return await extractErieMendix();
    if (isNFIPInsuredPanel()) return await extractNFIPInsuredPanel();
    if (isBeyondFloodsSummary()) return extractBeyondFloodsSummary();

    return { carrier: location.hostname, sourceUrl: location.href, address: {} };
  }

  function mountExtractorPanel() {
    const el = buildExtractorPanel();

    el.querySelector('#qqc-detect').onclick = async () => {
      try {
        const p = sanitizePayloadObject((await autoDetect()) || {});
        lastExtracted = p;
        try { await GM_setValue(STORAGE_KEY, p); } catch { }
        extractorSetUI(p);
        // reflect to header selectors (do not override Contact type; keep user's choice/default)
        const ct = extractorPanel.querySelector('#qqc-ct-ex');
        const cu = extractorPanel.querySelector('#qqc-cust-ex');
        if (cu) cu.value = p.customerType || (p.businessName ? 'Commercial' : 'Personal');
        extractorStatus(`Detected from ${p.carrier || 'page'}.`);
      } catch (e) {
        console.error(e);
        extractorStatus('Auto-detect failed.');
      }
    };

    // Auto-run detection on panel open
    (async () => {
      try {
        const p = sanitizePayloadObject((await autoDetect()) || {});
        lastExtracted = p;
        try { await GM_setValue(STORAGE_KEY, p); } catch { }
        extractorSetUI(p);
        // reflect to header selectors (do not override Contact type; keep user's choice/default)
        const ct = extractorPanel.querySelector('#qqc-ct-ex');
        const cu = extractorPanel.querySelector('#qqc-cust-ex');
        if (cu) cu.value = p.customerType || (p.businessName ? 'Commercial' : 'Personal');
        extractorStatus(`Detected from ${p.carrier || 'page'}.`);
      } catch (e) {
        console.error(e);
        extractorStatus('Auto-detect failed.');
      }
    })();

    el.querySelector('#qqc-save').onclick = async () => {
      try {
        const uiPayload = extractorReadUI();
        // pull type selections from header
        const ct = extractorPanel.querySelector('#qqc-ct-ex');
        const cu = extractorPanel.querySelector('#qqc-cust-ex');
        if (ct) uiPayload.contactType = ct.value;
        if (cu) uiPayload.customerType = cu.value;
        // merge UI-overrides onto last extracted so we keep additionalContacts and other parsed fields
        const payload = sanitizePayloadObject(Object.assign({}, lastExtracted || {}, uiPayload));
        await GM_setValue(STORAGE_KEY, payload);
        // mark pending to open popup on QQ and fill
        await GM_setValue(PENDING_KEY, { payload, ts: Date.now(), stage: 'popup' });
        extractorStatus('Sending to QQ...');
        // Navigate to QQ Contacts page (same tab)
        try { window.open(QQ_CONTACTS_URL, '_blank', 'noopener'); }
        catch { window.open(QQ_CONTACTS_URL, '_blank'); }
      } catch (e) {
        console.error(e);
        extractorStatus('Send failed (invalid JSON?).');
      }
    };

    el.querySelector('#qqc-copy').onclick = () => {
      const txt = extractorPanel.querySelector('#qqc-json').value.trim() || JSON.stringify(extractorReadUI(), null, 2);
      GM_setClipboard(txt);
      extractorStatus('Copied JSON to clipboard.');
    };
  }

  // ---------- Paste/Autofill Panel (Alt+Q) ----------
  function pasteStatus(msg) {
    if (!pastePanel) return;
    const s = pastePanel.querySelector('#qqc-status');
    s.textContent = msg;
    setTimeout(() => s.textContent = '', 6000);
  }
  function buildPastePanel() {
    if (pastePanel && pasteHost?.isConnected) return pastePanel;
    closePastePanel();
    pasteHost = document.createElement('div');
    pasteHost.id = '__qqc_paste_host';
    pasteHost.style.cssText = 'all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483647;';
    pasteHost.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(pasteHost);
    const shadow = pasteHost.shadowRoot;
    shadow.innerHTML = `
      <style>
        :host{ all:initial; }
        *{ box-sizing:border-box; font-family:system-ui,Segoe UI,Arial,sans-serif; }
        button,select,input,textarea{ font:inherit; }
      </style>
      <div id="qqc-paste-panel" style="width:360px;background:#729cf7;color:#000;border:1px solid #374151;border-radius:8px;font:12px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.35)">
      <div id="qqc-header-pa" style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#758cad;border-bottom:1px solid #374151;border-radius:8px 8px 0 0;">
        <strong>QQC Autofill</strong>
        <div style="display:flex;gap:6px;align-items:center;">
          <span id="qqc-status" style="color:#f2ec41;font-size:11px;"></span>
          <button id="qqc-close" style="background:#6d8cb7;border:none;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer">X</button>
        </div>
      </div>
      <div style="padding:10px;max-height:64vh;overflow:auto;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;align-items:end;">
          <label>Contact Type<br>
            <select id="qqc-ct" style="width:100%">
              <option>Customers</option>
              <option>Prospects</option>
            </select>
          </label>
          <label>Customer Type<br>
            <select id="qqc-cust" style="width:100%">
              <option>Personal</option>
              <option>Commercial</option>
            </select>
          </label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button id="qqc-load" style="background:#2563eb;border:none;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer">Load</button>
          <button id="qqc-clip" style="background:#2563eb;border:none;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer">Load Clipboard</button>
          <button id="qqc-openfill" style="background:#2563eb;border:none;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer">Open Popup + Fill + Add</button>
          <button id="qqc-fill-details" style="background:#2563eb;border:none;color:#fff;padding:6px 8px;border-radius:6px;cursor:pointer">Fill Details Page</button>
        </div>
        <textarea id="qqc-json" placeholder="Payload JSON" style="width:100%;height:140px;"></textarea>
        <div style="margin-top:8px;color:#000">Hotkeys: Alt+P toggle panel.</div>
      </div>
      </div>
    `;
    const el = shadow.querySelector('#qqc-paste-panel');
    pastePanel = el;
    el.querySelector('#qqc-close')?.addEventListener('click', closePastePanel);
    // Fix mojibake in close text if present
    try { const c = pastePanel.querySelector('#qqc-close'); if (c) c.textContent = 'X'; } catch { }
    // Make entire paste header draggable, excluding its close button
    const pasteHeader = pastePanel.querySelector('#qqc-header-pa');
    if (pasteHeader) {
      makeDraggable(pasteHost, pasteHeader, { exclude: '#qqc-close' });
    }
    // Ensure selector defaults when no payload is loaded
    try {
      const ct = pastePanel.querySelector('#qqc-ct');
      const cu = pastePanel.querySelector('#qqc-cust');
      if (ct && !ct.value) ct.value = 'Customers';
      if (cu && !cu.value) cu.value = 'Personal';
    } catch { }
    return el;
  }

  function parsePayload(text) { try { return JSON.parse(text); } catch { return null; } }
  function setSelectToText(selectEl, text) { if (!selectEl || !text) return; const dn = text.toLowerCase(); const opt = Array.from(selectEl.options).find(o => o.textContent.trim().toLowerCase() === dn) || Array.from(selectEl.options).find(o => o.textContent.trim().toLowerCase().includes(dn)); if (opt) selectEl.value = opt.textContent.trim(); }
  async function getPayloadFromUI_Storage_Clipboard() {
    const box = pastePanel.querySelector('#qqc-json').value.trim();
    if (box) {
      const p = sanitizePayloadObject(parsePayload(box));
      if (p) return p;
      pasteStatus('Invalid JSON in box.'); return null;
    }
    const stored = sanitizePayloadObject(await GM_getValue(STORAGE_KEY));
    if (stored) {
      pastePanel.querySelector('#qqc-json').value = JSON.stringify(stored, null, 2);
      // Reflect into selectors
      setSelectToText(pastePanel.querySelector('#qqc-ct'), stored.contactType || 'Customers');
      setSelectToText(pastePanel.querySelector('#qqc-cust'), stored.customerType || (stored.businessName ? 'Commercial' : 'Personal'));
      pasteStatus('Loaded from storage.');
      return stored;
    }
    try {
      const txt = await navigator.clipboard.readText();
      const p = sanitizePayloadObject(parsePayload(txt));
      if (p) {
        pastePanel.querySelector('#qqc-json').value = JSON.stringify(p, null, 2);
        setSelectToText(pastePanel.querySelector('#qqc-ct'), p.contactType || 'Customers');
        setSelectToText(pastePanel.querySelector('#qqc-cust'), p.customerType || (p.businessName ? 'Commercial' : 'Personal'));
        pasteStatus('Loaded from clipboard.');
        return p;
      }
      pasteStatus('Clipboard JSON invalid.');
    } catch {
      pasteStatus('Clipboard blocked. Click page and try again.');
    }
    return null;
  }

  // ---------- QQ Autofill logic ----------
  function setVal(el, val) {
    if (!el) return;
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
        : HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc && desc.set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function selectByText(select, desired) {
    if (!select || !desired) return false;
    const opts = Array.from(select.options || []);
    const dn = desired.toLowerCase();
    let v = opts.find(o => o.textContent.trim().toLowerCase() === dn)?.value;
    if (!v) v = opts.find(o => o.textContent.trim().toLowerCase().includes(dn))?.value;
    if (v != null) { select.value = v; select.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    return false;
  }
  function setDateValue(input, mmddyyyy) {
    if (!input) return;
    input.focus();
    const proto = Object.getPrototypeOf(input) || HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, mmddyyyy);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }
  function onDetailsPage() { return /\/Contacts\/Customer\/Details\/\d+/i.test(location.pathname); }

  async function ensurePopupOpen() {
    hudInfo('Opening New Contact popup...');
    const pop = document.querySelector('#add-contact-pop');
    if (pop && pop.offsetParent !== null) return pop;
    const triggers = Array.from(document.querySelectorAll('a,button'))
      .filter(e => /new contact|add contact|create contact/i.test(e.textContent || ''));
    for (const t of triggers) { t.click(); await new Promise(r => setTimeout(r, 300)); const p = document.querySelector('#add-contact-pop'); if (p && p.offsetParent !== null) return p; }
    const found = document.querySelector('#add-contact-pop') || null;
    if (!found) hudError('Could not open popup');
    return found;
  }

  function desiredPhoneCategory(payload) {
    const t = (payload.phoneType || '').toLowerCase();
    const known = ['cell', 'home', 'work', 'mobile', 'business cell', 'other'];
    if (known.some(k => t.includes(k))) {
      if (t.includes('mobile')) return 'Cell';
      return payload.phoneType;
    }
    return payload.businessName ? 'Business Cell' : 'Cell';
  }

  async function fillPopup(payload) {
    const pop = await ensurePopupOpen();
    if (!pop) { pasteStatus('Could not open "Add Contact" popup.'); return false; }

    // Ensure inputs exist before filling
    await waitForSelector('#txtFirst', { root: pop, timeout: 8000, interval: 100 });
    hudInfo('Filling popup...');

    // Select types first so the form renders the correct fields
    selectByText(pop.querySelector('#selContactType'), payload.contactType || 'Customers');
    const custTypeSel = pop.querySelector('#selCustomerType select, #selCustomerType .sel-sub-type, select[name="selCustomerType"]');
    selectByText(custTypeSel, payload.customerType || (payload.businessName ? 'Commercial' : 'Personal'));
    selectByText(pop.querySelector('#selCurrStat'), payload.status || 'Active');

    // Brief pause to let UI update after selects
    await new Promise(r => setTimeout(r, 150));

    if (payload.businessName) setVal(pop.querySelector('#txtBusiness'), payload.businessName || '');
    setVal(pop.querySelector('#txtFirst'), payload.firstName || '');
    setVal(pop.querySelector('#txtLast'), payload.lastName || '');
    setVal(pop.querySelector('#txtPhone'), payload.primaryPhone || '');
    const phoneCat = desiredPhoneCategory(payload);
    selectByText(pop.querySelector('#selPhoneType'), phoneCat);

    // Wait for email input to be present then set
    const emailEl = await waitForSelector('#txtEmail', { root: pop, timeout: 8000, interval: 100 });
    if (emailEl) {
      try { emailEl.focus(); } catch { }
      setVal(emailEl, (payload.primaryEmail || '').toLowerCase());
      // Some instances validate on key events + blur; add both for reliability
      emailEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      emailEl.dispatchEvent(new Event('change', { bubbles: true }));
      try { emailEl.blur(); } catch { }
      await new Promise(r => setTimeout(r, 120));
    }
    selectByText(pop.querySelector('#selEmailType'), payload.businessName ? 'Professional' : 'Personal');

    const add = pop.querySelector('#addcontactbtn');
    if (!add) { pasteStatus('Add Contact button not found'); return false; }
    add.click();

    const duplicateDetected = await waitForPossibleDuplicateWarning();
    if (duplicateDetected) {
      pasteStatus('Possible duplicate found. Stopping automation.');
      hudError('Duplicate contact detected.');
      try { await GM_setValue(PENDING_KEY, {}); } catch { }
      return false;
    }

    hudInfo('Popup submitted. Waiting for details...');
    // Persist a pending instruction to proceed with details on next page
    try { await GM_setValue(PENDING_KEY, { payload, ts: Date.now(), stage: 'details' }); } catch { }
    pasteStatus('Submitted popup. Waiting for details page...');
    return true;
  }

  function fillBasicContactInfo(payload) {
    const basic = document.querySelector('form#BasicContactInfo');
    if (!basic) return false;
    const phoneInput = basic.querySelector('[data-section="phone"] input[name="Value"]') || basic.querySelector('.PhoneTemplateContainer input[name="Value"]');
    if (phoneInput) setVal(phoneInput, payload.primaryPhone || '');
    const phoneType = basic.querySelector('.PhoneTypes');
    if (phoneType) selectByText(phoneType, desiredPhoneCategory(payload));
    const emailInput = basic.querySelector('.EmailTemplateContainer input[name="Value"]');
    if (emailInput) setVal(emailInput, (payload.primaryEmail || '').toLowerCase());
    const save = basic.querySelector('.SectionButtons .section_save');
    if (save) {
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch { }
      save.click();
    }
    return true;
  }

  async function ensureAddressEditorOpen() {
    // Wait for the link to appear
    let link = await waitFor(() => Array.from(document.querySelectorAll('a.h2AddRecordLink')).find(a => /add an address/i.test(a.textContent || '') && a.offsetParent !== null), { timeout: 8000, interval: 150 });
    if (!link) link = await waitFor(() => Array.from(document.querySelectorAll('a,button')).find(a => /add an address/i.test(a.textContent || '') && a.offsetParent !== null), { timeout: 8000, interval: 150 });
    if (link) {
      try { link.scrollIntoView({ block: 'center' }); } catch { }
      link.click();
      const editor = await waitForSelector('.AddressesDetailContainer .section-detaildata input[name="Line1"]', { timeout: 15000, interval: 150 });
      return !!editor;
    }
    // If an editor is already open
    const already = document.querySelector('.AddressesDetailContainer .section-detaildata input[name="Line1"]');
    return !!already;
  }

  async function fillAddress(payload) {
    hudInfo('Filling Address...');
    const opened = await ensureAddressEditorOpen();
    if (!opened) return false;
    const detail = Array.from(document.querySelectorAll('.AddressesDetailContainer .section-detaildata')).find(d => d.offsetParent !== null)
      || document.querySelector('.AddressesDetailContainer .section-detaildata');
    if (!detail) return false;

    const setField = (sel, val) => { const el = detail.querySelector(sel); if (!el) return; el.focus(); el.value = val || ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); };
    const selectIn = (sel, txt) => {
      const el = detail.querySelector(sel);
      if (!el || !txt) return;
      const dn = (txt || '').trim().toLowerCase();
      let opt = Array.from(el.options).find(o => o.textContent.trim().toLowerCase() === dn)
        || Array.from(el.options).find(o => o.textContent.trim().toLowerCase().includes(dn));
      // Fallback: try exact value match (e.g., "NC")
      if (!opt) opt = Array.from(el.options).find(o => (o.value || '').trim().toLowerCase() === dn);
      if (opt) {
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    // Ensure Country is United States so State/Province select is visible and correct
    const countrySel = detail.querySelector('select[name="CountryID"]');
    if (countrySel) {
      const preferUSA = Array.from(countrySel.options).find(o => (o.value || '').toUpperCase() === 'USA');
      const preferText = Array.from(countrySel.options).find(o => o.textContent.trim().toLowerCase() === 'united states');
      const val = (preferUSA?.value) || (preferText?.value) || '';
      if (val && countrySel.value !== val) {
        countrySel.value = val;
        countrySel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 150));
      }
    }

    setField('input[name="Line1"]', payload.address?.line1 || '');
    setField('input[name="Line2"]', payload.address?.line2 || '');
    setField('input[name="City"]', payload.address?.city || '');
    // Prefer matching by exact value when a 2-letter state code is provided
    const stateCode = (payload.address?.state || '').trim();
    if (stateCode.length === 2) {
      const el = detail.querySelector('select[name="StateID"]');
      if (el) {
        const desired = stateCode.toUpperCase();
        let opt = Array.from(el.options).find(o => (o.value || '').toUpperCase() === desired);
        if (!opt) opt = Array.from(el.options).find(o => o.textContent.trim().toLowerCase() === desired.toLowerCase());
        if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
        else { selectIn('select[name="StateID"]', stateCode); }
      }
    } else {
      selectIn('select[name="StateID"]', stateCode);
    }
    setField('input[name="Zip"]', (payload.address?.zip || '').slice(0, 5));
    selectIn('select[name="AddressTypeID"]', payload.address?.addressType || 'Mailing');

    // Click the section-level Save for Addresses form
    const addrForm = document.querySelector('form#Addresses') || detail.closest('form');
    const save = addrForm?.querySelector('.SectionButtons .section_save') || document.querySelector('form#Addresses .SectionButtons .section_save');
    if (save) {
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch { }
      save.click();
      // Give QQ time to persist and collapse the editor
      await new Promise(r => setTimeout(r, 300));
    }
    return true;
  }

  async function fillPersonalInfo(payload) {
    const pf = document.querySelector('form#PersonalInfo');
    if (!pf) return false;
    hudInfo('Filling Personal Info...');

    // Ensure section is in edit mode
    const ensureEdit = async () => {
      try { pf.scrollIntoView({ block: 'center' }); } catch { }
      const saveBtn = pf.querySelector('.SectionButtons .section_save');
      const isVisible = (el) => el && el.offsetParent !== null && !el.classList.contains('hide');
      if (!isVisible(saveBtn)) {
        const editBtn = pf.querySelector('.SectionButtons .section_edit');
        if (editBtn) {
          editBtn.click();
          await waitFor(() => {
            const sb = pf.querySelector('.SectionButtons .section_save');
            return sb && sb.offsetParent !== null && !sb.classList.contains('hide');
          }, { timeout: 5000, interval: 150 });
        }
      }
    };
    await ensureEdit();

    const setField = (sel, val) => { const el = pf.querySelector(sel); if (!el) return; el.focus(); el.value = val || ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); };
    const selectIn = (sel, txt) => {
      const el = pf.querySelector(sel);
      if (!el || !txt) return;
      const dn = (txt || '').trim().toLowerCase();
      let opt = Array.from(el.options).find(o => o.textContent.trim().toLowerCase() === dn)
        || Array.from(el.options).find(o => o.textContent.trim().toLowerCase().includes(dn));
      if (!opt) opt = Array.from(el.options).find(o => (o.value || '').trim().toLowerCase() === dn);
      if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
    };

    // Fill fields
    setField('input[name="FirstName"]', payload.firstName || '');
    setField('input[name="MiddleName"]', payload.middleName || '');
    setField('input[name="LastName"]', payload.lastName || '');
    const dobEl = pf.querySelector('input[name="DateOfBirthString"]');
    const dobStr = toMMDDYYYY(payload.dob || '');
    if (dobEl && dobStr) setDateValue(dobEl, dobStr);
    // License info not required per current workflow
    // If applicable, populate FEIN for commercial accounts
    if ((payload.customerType || '').toLowerCase() === 'commercial' || payload.businessName) {
      if (payload.ein) {
        setField('input[name="FEIN"]', payload.ein);
      }
    }
    const save = pf.querySelector('.SectionButtons .section_save');
    if (save) {
      // Small delay to allow any datepicker/validators to settle
      await new Promise(r => setTimeout(r, 150));
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch { }
      save.click();
      await new Promise(r => setTimeout(r, 250));
    }
    return true;
  }

  async function ensureAdditionalContactsEditorOpen() {
    // Ensure the section container is present
    const section = await waitFor(() => document.querySelector('.section-container[data-sectionkey="AdditionalContacts"]'), { timeout: 15000, interval: 150 });
    if (!section) return false;
    // Ensure section is in edit mode (some tenants hide Add link until editing)
    const sectionSave = section.querySelector('.SectionButtons .section_save');
    const sectionEdit = section.querySelector('.SectionButtons .section_edit');
    const __isBtnVisible = (el) => el && el.offsetParent !== null && !el.classList.contains('hide');
    if (!__isBtnVisible(sectionSave) && sectionEdit) {
      try { sectionEdit.scrollIntoView({ block: 'center' }); } catch { }
      sectionEdit.click();
      await waitFor(() => {
        const sb = section.querySelector('.SectionButtons .section_save');
        return sb && __isBtnVisible(sb);
      }, { timeout: 8000, interval: 120 });
    }
    // Find the header "Add A Contact" action
    let link = section && Array.from(section.querySelectorAll('span.h2AddRecord a.add-another-row')).find(a => /add a contact/i.test((a.textContent || '')) && isVisible(a));
    if (!link) {
      // Fallback: any visible Add A Contact link inside this section
      link = section && Array.from(section.querySelectorAll('a.add-another-row')).find(a => /add a contact/i.test((a.textContent || '')) && isVisible(a));
    }
    // If detail editor already visible, weâ€™re good
    const form = document.querySelector('form#AdditionalContacts');
    const detailVisible = form && isVisible(form.querySelector('.AdditionalContactsDetailContainer')) && form.querySelector('.AdditionalContactsDetailContainer .section-detaildata input[name="FirstName"]');
    if (detailVisible) return true;
    if (link) {
      try { link.scrollIntoView({ block: 'center' }); } catch { }
      link.click();
      const editor = await waitForSelector('form#AdditionalContacts .AdditionalContactsDetailContainer .section-detaildata input[name="FirstName"]', { timeout: 20000, interval: 150 });
      return !!editor;
    }
    return false;
  }

  async function fillAdditionalContact(contact) {
    hudInfo('Adding Additional Contact...');
    const opened = await ensureAdditionalContactsEditorOpen();
    if (!opened) return false;
    const form = document.querySelector('form#AdditionalContacts');
    const detail = Array.from(form.querySelectorAll('.AdditionalContactsDetailContainer .section-detaildata')).find(d => d.offsetParent !== null) || form.querySelector('.AdditionalContactsDetailContainer .section-detaildata');
    if (!detail) return false;
    // Ensure the Additional Contacts section is in edit mode
    const isVisible = (el) => el && el.offsetParent !== null && !(el.classList?.contains('hide'));
    const saveBtn = form.querySelector('.SectionButtons .section_save');
    if (!isVisible(saveBtn)) {
      const editBtn = form.querySelector('.SectionButtons .section_edit');
      if (editBtn) {
        try { editBtn.scrollIntoView({ block: 'center' }); } catch { }
        editBtn.click();
        await waitFor(() => {
          const sb = form.querySelector('.SectionButtons .section_save');
          return sb && isVisible(sb);
        }, { timeout: 8000, interval: 120 });
      }
    }
    const setField = (sel, val) => { const el = detail.querySelector(sel); if (!el) return; el.focus(); el.value = val || ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); };
    const selectIn = (sel, txt) => { const el = detail.querySelector(sel); if (!el || !txt) return; const dn = (txt || '').trim().toLowerCase(); let opt = Array.from(el.options).find(o => o.textContent.trim().toLowerCase() === dn) || Array.from(el.options).find(o => o.textContent.trim().toLowerCase().includes(dn)); if (!opt) opt = Array.from(el.options).find(o => (o.value || '').trim().toLowerCase() === dn); if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); } };

    setField('input[name="FirstName"]', toNameCase(contact.firstName));
    setField('input[name="MiddleName"]', contact.middleName || '');
    setField('input[name="LastName"]', toNameCase(contact.lastName));
    const dobStr = toMMDDYYYY(contact.dob || '');
    if (dobStr) setField('input[name="DateOfBirthString"]', dobStr);

    // Relationship (Category + Specific)
    const rel = (contact.relationship || '').toLowerCase();
    const relCatSel = 'select[name="RelationCategoryID"]';
    const relSel = 'select[name="RelationID"]';
    if (rel) {
      // Heuristic: set Relation Type first so Relationship list is correct
      const isRelative = /(spouse|husband|wife|child|parent|relative|domestic|partner|brother|sister|roommate|resident)/i.test(contact.relationship || '');
      selectIn(relCatSel, isRelative ? 'Relative' : 'Non Relative');
      // Brief pause to allow dependent list to refresh
      await new Promise(r => setTimeout(r, 120));
      selectIn(relSel, contact.relationship);
    }

    // Address (optional)
    if (contact.address) {
      // Set country first
      const countrySel = detail.querySelector('select[name="CountryID"]');
      if (countrySel) {
        let val = Array.from(countrySel.options).find(o => (o.value || '').toUpperCase() === 'USA')?.value;
        if (!val) val = Array.from(countrySel.options).find(o => o.textContent.trim().toLowerCase() === 'united states')?.value;
        if (val) { countrySel.value = val; countrySel.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 120)); }
      }
      setField('input[name="Line1"]', contact.address.line1 || '');
      setField('input[name="Line2"]', contact.address.line2 || '');
      setField('input[name="City"]', contact.address.city || '');
      const st = (contact.address.state || '').trim();
      if (st) selectIn('select[name="StateID"]', st);
      setField('input[name="Zip"]', (contact.address.zip || '').slice(0, 5));
    }

    // Phone
    const phoneInput = detail.querySelector('.PhoneTemplateContainer [data-section="phone"] input[name="Value"], .PhoneTemplateContainer input[name="Value"]');
    if (phoneInput) {
      setField('[data-section="phone"] input[name="Value"], .PhoneTemplateContainer input[name="Value"]', (contact.primaryPhone || '').replace(/[^\d]/g, ''));
      const phoneTypeSel = detail.querySelector('.PhoneTemplateContainer .PhoneTypes');
      if (phoneTypeSel) selectIn('.PhoneTemplateContainer .PhoneTypes', (contact.phoneType || '').toLowerCase().includes('mobile') ? 'Cell' : (contact.phoneType || ''));
    }

    // Email
    const emailInput = detail.querySelector('.EmailTemplateContainer input[name="Value"]');
    if (emailInput) setField('.EmailTemplateContainer input[name="Value"]', (contact.primaryEmail || '').toLowerCase());

    // Save
    const save = form.querySelector('.SectionButtons .section_save');
    if (save) {
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch { }
      save.click();
      // Wait for save to complete (spinner or detail collapse)
      const spinner = form.querySelector('.SectionButtons .section_saving');
      for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 150)); if (!spinner || spinner.style.display === 'none') break; }
      await new Promise(r => setTimeout(r, 200));
    }
    return true;
  }

  async function runFillDetails(payload) {
    if (!onDetailsPage()) { pasteStatus("Not on details page."); return; }
    if (hasPossibleDuplicateWarning()) {
      pasteStatus('Possible duplicate found. Automation halted.');
      hudError('Duplicate contact detected.');
      try { await GM_setValue(PENDING_KEY, {}); } catch { }
      return;
    }
    // Wait for Basic Contact Info section
    hudInfo('Filling Basic Contact...');
    await waitFor(() => document.querySelector("form#BasicContactInfo"), { timeout: 15000, interval: 150 });
    const ok1 = fillBasicContactInfo(payload);
    // Addresses
    hudInfo('Filling Address...');
    await waitFor(() => document.querySelector("form#Addresses"), { timeout: 15000, interval: 150 });
    const ok2 = await fillAddress(payload);
    // Personal Info
    hudInfo('Filling Personal Info...');
    await waitFor(() => document.querySelector("form#PersonalInfo"), { timeout: 15000, interval: 150 });
    const ok3 = await fillPersonalInfo(payload);
    // Additional Contacts (e.g., Second Named Insured)
    let ok4 = true;
    if (Array.isArray(payload.additionalContacts) && payload.additionalContacts.length) {
      hudInfo('Adding Additional Contact...');
      for (const c of payload.additionalContacts) {
        const r = await fillAdditionalContact(c);
        ok4 = ok4 && !!r;
      }
    }
    let __status = `Filled: Basic ${ok1 ? 'OK' : '-'}, Address ${ok2 ? 'OK' : '-'}, Personal ${ok3 ? 'OK' : '-'}`;
    if (Array.isArray(payload.additionalContacts) && payload.additionalContacts.length) {
      __status += `, Extra Contacts ${ok4 ? 'OK' : '-'}`;
    }
    pasteStatus(__status);
    if (ok1 && ok2 && ok3 && (!Array.isArray(payload.additionalContacts) || !payload.additionalContacts.length || ok4)) {
      hudOk('QQC fill complete');
    } else {
      hudError('QQC fill incomplete');
    }
    try { await clickSaveAllChanges(); } catch { }
    try { await addCarrierNoteIfNeeded(payload); } catch { }
  }
  function mountPastePanel() {
    const ui = buildPastePanel();

    ui.querySelector('#qqc-load').onclick = async () => {
      const p = sanitizePayloadObject(await GM_getValue(STORAGE_KEY));
      if (!p) return pasteStatus('No stored payload.');
      ui.querySelector('#qqc-json').value = JSON.stringify(p, null, 2);
      setSelectToText(pastePanel.querySelector('#qqc-ct'), p.contactType || 'Customers');
      setSelectToText(pastePanel.querySelector('#qqc-cust'), p.customerType || (p.businessName ? 'Commercial' : 'Personal'));
      pasteStatus('Loaded from storage.');
    };

    ui.querySelector('#qqc-clip').onclick = async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (!txt) return pasteStatus('Clipboard empty.');
        ui.querySelector('#qqc-json').value = txt;
        pasteStatus('Loaded from clipboard.');
      } catch {
        pasteStatus('Clipboard blocked. Click inside page and try again.');
      }
    };

    ui.querySelector('#qqc-openfill').onclick = async () => {
      const p = await getPayloadFromUI_Storage_Clipboard();
      if (!p) return;
      // Override from UI selectors
      const ctSel = pastePanel.querySelector('#qqc-ct');
      const custSel = pastePanel.querySelector('#qqc-cust');
      if (ctSel) p.contactType = ctSel.value;
      if (custSel) p.customerType = custSel.value;
      const ok = await fillPopup(p);
      if (ok) {
        pasteStatus('Waiting for customer details to load...');
        // Wait for either URL change to details page or presence of any details form
        const ready = await waitFor(() => onDetailsPage() || document.querySelector('form#BasicContactInfo') || document.querySelector('form#PersonalInfo'), { timeout: 45000, interval: 300 });
        if (ready) {
          runFillDetails(p);
        } else {
          pasteStatus('Timed out waiting for details page. Try "Fill Details Page".');
        }
      } else {
        pasteStatus('Stopped due to duplicate warning.');
      }
    };

    ui.querySelector('#qqc-fill-details').onclick = async () => {
      const p = await getPayloadFromUI_Storage_Clipboard();
      if (!p) return;
      const ctSel = pastePanel.querySelector('#qqc-ct');
      const custSel = pastePanel.querySelector('#qqc-cust');
      if (ctSel) p.contactType = ctSel.value;
      if (custSel) p.customerType = custSel.value;
      runFillDetails(p);
    };
  }

  // ---------- Hotkeys ----------
  PAGE_WINDOW.addEventListener('keydown', (e) => {
    // Alt+Q â†’ Extractor (primary)
    if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      extractorPanel ? closeExtractorPanel() : mountExtractorPanel();
      return;
    }
    // Alt+P â†’ Paste/Autofill (legacy)
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      pastePanel ? closePastePanel() : mountPastePanel();
      return;
    }
  });

  // ---------- Integration with MCI Master Menu ----------
  // Listen for menu-triggered events so "Get Customer Data" can live in the slide-out menu

function handleMciRunContactMapper(detail) {
  try {
    const mode = (detail && detail.mode) || 'auto';

    if (mode === 'extract') {
      extractorPanel ? closeExtractorPanel() : mountExtractorPanel();
      return;
    }

    if (mode === 'paste') {
      pastePanel ? closePastePanel() : mountPastePanel();
      return;
    }

    // mode === 'auto'
    if (/qqcatalyst\.com$/i.test(location.hostname)) {
      pastePanel ? closePastePanel() : mountPastePanel();
    } else {
      extractorPanel ? closeExtractorPanel() : mountExtractorPanel();
    }
  } catch (e2) {
    console.error('[MCI Contact Mapper] Error handling mci-run-contact-mapper:', e2);
    alert('MCI Contact Mapper error â€“ see console for details.');
  }
}

// ---------- Integration with MCI Master Menu ----------
// 1) CustomEvent path (backward compatible)
try {
  PAGE_WINDOW.addEventListener('mci-run-contact-mapper', (ev) => {
    handleMciRunContactMapper(ev && ev.detail);
  });
} catch (e) {}

// 2) postMessage path (robust across Tampermonkey sandboxes)
window.addEventListener('message', (e) => {
  try {
    const d = e && e.data;
    if (!d || d.__mci !== 'run-contact-mapper') return;
    handleMciRunContactMapper(d.detail);
  } catch (err) {}
}, false);

// 3) document event (some sites / frames)
try {
  document.addEventListener('mci-run-contact-mapper', (ev) => {
    handleMciRunContactMapper(ev && ev.detail);
  }, true);
} catch (e) {}

  // ---------- Auto-run pending details fill after navigation ----------
  (async () => {
    try {
      const pending = await GM_getValue(PENDING_KEY);
      if (pending && pending.payload && /qqcatalyst\.com$/i.test(location.hostname)) {
        const fresh = (Date.now() - (pending.ts || 0)) < 3 * 60 * 1000; // 3 minutes
        if (!fresh) { await GM_setValue(PENDING_KEY, {}); return; }
        if (pending.stage === 'popup' && !onDetailsPage()) {
          // We're on QQ but not on details yet: open the New Contact popup and submit
          await waitFor(() => document.readyState === 'complete' ? true : null, { timeout: 15000, interval: 200 });
          hudInfo('Opening popup and submitting...');
          const pop = await ensurePopupOpen();
          if (pop) {
            const ok = await fillPopup(pending.payload);
            if (!ok) return;
          }
          return;
        }
        if (onDetailsPage()) {
          hudInfo('Filling details...');
          await waitFor(() =>
            document.querySelector('form#BasicContactInfo') ||
            document.querySelector('form#PersonalInfo') ||
            document.querySelector('form#Addresses'),
            { timeout: 20000, interval: 200 }
          );

          try { await GM_setValue(PENDING_KEY, {}); } catch { }

          await runFillDetails(pending.payload);
        }

      }
    } catch { }
  })();
})();
