// ==UserScript==
// MCI internal tooling
// Copyright (c) 2025 Middle Creek Insurance. All rights reserved.
// Not authorized for redistribution or resale.
// @name         QQ Catalyst - Contact Importer (MCI)
// @namespace    mci-tools
// @version      1.0.1
// @description  Reads payload created by carrier extractors and autofills QQ Catalyst (New Contact popup + Details). (Legacy mini UI removed.)
// @match        https://app.qqcatalyst.com/*
// @match        https://*.qqcatalyst.com/*
// @all-frames   true
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const PAGE_WINDOW = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  // Payload storage keys (written by carrier extractors / Master Menu bridge)
  const STORAGE_KEY = 'QQC_PAYLOAD_V2';
  const PENDING_KEY = 'QQC_PENDING_V1';

  // ------------------------ small helpers ------------------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const onQQ = () => /qqcatalyst\.com$/i.test(location.hostname);
  const isVisible = (el) => !!el && el.offsetParent !== null;

  async function waitFor(fn, opts) {
    opts = opts || {};
    const timeout = (opts.timeout == null) ? 10000 : opts.timeout;
    const interval = (opts.interval == null) ? 100 : opts.interval;
    const end = Date.now() + timeout;
    let lastErr = null;
    while (Date.now() < end) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {
        lastErr = e;
      }
      await sleep(interval);
    }
    try { return fn(); } catch (e2) { lastErr = e2; }
    if (lastErr) throw lastErr;
    return null;
  }

  async function waitForSelector(sel, opts) {
    opts = opts || {};
    const root = opts.root || document;
    return waitFor(() => root.querySelector(sel), opts);
  }

  async function waitForText(el, predicate, opts) {
    opts = opts || {};
    return waitFor(() => {
      if (!el) return null;
      const t = (el.textContent || '').trim();
      return predicate(t) ? t : null;
    }, opts);
  }

  function toMMDDYYYY(s) {
    if (!s) return '';
    const m = String(s).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return String(s);
    const mm = String(m[1]).padStart(2, '0');
    const dd = String(m[2]).padStart(2, '0');
    let yyyy = String(m[3]);
    if (yyyy.length === 2) yyyy = (parseInt(yyyy, 10) > 30 ? '19' : '20') + yyyy;
    return mm + '/' + dd + '/' + yyyy;
  }

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
    if (normalized === 'na' || normalized === 'none' || normalized === 'notapplicable' || normalized === 'notavailable') return '';
    return trimmed;
  }

  function sanitizePayloadObject(data) {
    if (data == null) return data;
    if (typeof data === 'string') return cleanPlaceholderString(data);
    if (Array.isArray(data)) return data.map(item => sanitizePayloadObject(item));
    if (typeof data === 'object') {
      for (const k of Object.keys(data)) data[k] = sanitizePayloadObject(data[k]);
    }
    return data;
  }

  function noteTextForPayload(payload) {
    if (!payload) return '';
    const carrier = String(payload.carrier || '').toLowerCase();
    const sourceUrl = String(payload.sourceUrl || '').toLowerCase();
    if (carrier.includes('torrentflood') || sourceUrl.includes('nationalgeneral.torrentflood.com')) return 'NFIP & Excess Floods';
    if (carrier.includes('beyondfloods') || sourceUrl.includes('natgen.beyondfloods.com')) return 'Beyond Floods';
    return '';
  }

  // ------------------------ HUD (center status bubble) ------------------------
  let hudEl = null, hudIco = null, hudTxt = null, hudHideTid = null;

  function clearHudHideTimer() { if (hudHideTid) { clearTimeout(hudHideTid); hudHideTid = null; } }
  function hideHud() { clearHudHideTimer(); try { hudEl && hudEl.remove(); } catch (e) {} hudEl = hudIco = hudTxt = null; }
  function scheduleHudHide(ms) { clearHudHideTimer(); if (ms > 0) hudHideTid = setTimeout(hideHud, ms); }

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
    el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483646;background:#111827;color:#fff;padding:8px 10px;border:1px solid #374151;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;gap:8px;align-items:center;font:12px system-ui;';
    const ico = document.createElement('span');
    ico.id = 'qqc-hud-ico';
    ico.style.cssText = 'display:inline-block;width:12px;height:12px;border:2px solid #fff;border-right-color:transparent;border-radius:50%;animation:qqcspin .8s linear infinite;';
    const txt = document.createElement('span');
    txt.id = 'qqc-hud-txt';
    txt.textContent = 'Working...';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Dismiss QQC status');
    closeBtn.style.cssText = 'margin-left:6px;background:transparent;border:none;color:#9ca3af;font-size:14px;line-height:1;cursor:pointer;padding:0 4px;';
    closeBtn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); hideHud(); });
    el.appendChild(ico); el.appendChild(txt); el.appendChild(closeBtn);
    document.body.appendChild(el);
    hudEl = el; hudIco = ico; hudTxt = txt;
    return el;
  }

  function hudInfo(msg) {
    if (!onQQ()) return;
    ensureHud();
    if (hudTxt) hudTxt.textContent = msg || 'Working...';
    if (hudIco) {
      hudIco.style.animation = 'qqcspin .8s linear infinite';
      hudIco.style.border = '2px solid #fff';
      hudIco.style.borderRightColor = 'transparent';
      hudIco.style.width = '12px';
      hudIco.style.height = '12px';
      hudIco.textContent = '';
      hudIco.style.color = '';
    }
    clearHudHideTimer();
  }

  function hudOk(msg) {
    if (!onQQ()) return;
    ensureHud();
    if (hudTxt) hudTxt.textContent = msg || 'Done';
    if (hudIco) {
      hudIco.style.animation = '';
      hudIco.style.border = '';
      hudIco.style.width = 'auto';
      hudIco.style.height = 'auto';
      hudIco.textContent = '✔';
      hudIco.style.color = '#10b981';
    }
    scheduleHudHide(3000);
  }

  function hudError(msg) {
    if (!onQQ()) return;
    ensureHud();
    if (hudTxt) hudTxt.textContent = msg || 'Error';
    if (hudIco) {
      hudIco.style.animation = '';
      hudIco.style.border = '';
      hudIco.style.width = 'auto';
      hudIco.style.height = 'auto';
      hudIco.textContent = '✖';
      hudIco.style.color = '#ef4444';
    }
    scheduleHudHide(6000);
  }

  // Keep old callsites harmless
  function pasteStatus(msg) { hudInfo(msg || 'Working...'); }

  // ------------------------ QQC-specific helpers ------------------------
  function onDetailsPage() { return /\/Contacts\/Customer\/Details\/\d+/i.test(location.pathname); }

  function setVal(el, val) {
    if (!el) return;
    try { el.focus(); } catch (e) {}
    const proto = (el instanceof HTMLInputElement) ? HTMLInputElement.prototype
      : (el instanceof HTMLSelectElement) ? HTMLSelectElement.prototype
      : HTMLTextAreaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectByText(select, desired) {
    if (!select || !desired) return false;
    const opts = Array.from(select.options || []);
    const dn = String(desired).trim().toLowerCase();
    let v = (opts.find(o => o.textContent.trim().toLowerCase() === dn) || {}).value;
    if (!v) v = (opts.find(o => o.textContent.trim().toLowerCase().includes(dn)) || {}).value;
    if (v != null) { select.value = v; select.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    return false;
  }

  function setDateValue(input, mmddyyyy) {
    if (!input || !mmddyyyy) return;
    try { input.focus(); } catch (e) {}
    const proto = Object.getPrototypeOf(input) || HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(input, mmddyyyy);
    else input.value = mmddyyyy;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    try { input.blur(); } catch (e2) {}
  }

  function hasPossibleDuplicateWarning(root) {
    root = root || document;
    return Array.from(root.querySelectorAll('.title, .modal-title, .dialog-title, .warning, .section-title'))
      .some(el => /possible duplicate/i.test(String(el.textContent || '').trim()));
  }

  async function waitForPossibleDuplicateWarning(timeout, interval) {
    timeout = timeout == null ? 2500 : timeout;
    interval = interval == null ? 200 : interval;
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (hasPossibleDuplicateWarning()) return true;
      await sleep(interval);
    }
    return hasPossibleDuplicateWarning();
  }

  function desiredPhoneCategory(payload) {
    const t = String(payload.phoneType || '').toLowerCase();
    const known = ['cell', 'home', 'work', 'mobile', 'business cell', 'other'];
    if (known.some(k => t.includes(k))) {
      if (t.includes('mobile')) return 'Cell';
      return payload.phoneType;
    }
    return payload.businessName ? 'Business Cell' : 'Cell';
  }

  async function ensurePopupOpen() {
    hudInfo('Opening New Contact popup...');
    const pop0 = document.querySelector('#add-contact-pop');
    if (pop0 && isVisible(pop0)) return pop0;

    const triggers = Array.from(document.querySelectorAll('a,button'))
      .filter(e => /new contact|add contact|create contact/i.test(e.textContent || ''));
    for (const t of triggers) {
      try { t.click(); } catch (e) {}
      await sleep(300);
      const pop = document.querySelector('#add-contact-pop');
      if (pop && isVisible(pop)) return pop;
    }

    const found = document.querySelector('#add-contact-pop') || null;
    if (!found) hudError('Could not open popup');
    return found;
  }

  async function fillPopup(payload) {
    const pop = await ensurePopupOpen();
    if (!pop) { hudError('Could not open "Add Contact" popup'); return false; }

    await waitForSelector('#txtFirst', { root: pop, timeout: 8000, interval: 100 });
    hudInfo('Filling popup...');

    selectByText(pop.querySelector('#selContactType'), payload.contactType || 'Customers');
    const custTypeSel = pop.querySelector('#selCustomerType select, #selCustomerType .sel-sub-type, select[name="selCustomerType"]');
    selectByText(custTypeSel, payload.customerType || (payload.businessName ? 'Commercial' : 'Personal'));
    selectByText(pop.querySelector('#selCurrStat'), payload.status || 'Active');
    await sleep(150);

    if (payload.businessName) setVal(pop.querySelector('#txtBusiness'), payload.businessName || '');
    setVal(pop.querySelector('#txtFirst'), payload.firstName || '');
    setVal(pop.querySelector('#txtLast'), payload.lastName || '');
    setVal(pop.querySelector('#txtPhone'), payload.primaryPhone || '');
    selectByText(pop.querySelector('#selPhoneType'), desiredPhoneCategory(payload));

    const emailEl = await waitForSelector('#txtEmail', { root: pop, timeout: 8000, interval: 100 });
    if (emailEl) {
      try { emailEl.focus(); } catch (e) {}
      setVal(emailEl, String(payload.primaryEmail || '').toLowerCase());
      emailEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      emailEl.dispatchEvent(new Event('change', { bubbles: true }));
      try { emailEl.blur(); } catch (e2) {}
      await sleep(120);
    }
    selectByText(pop.querySelector('#selEmailType'), payload.businessName ? 'Professional' : 'Personal');

    const add = pop.querySelector('#addcontactbtn');
    if (!add) { hudError('Add Contact button not found'); return false; }
    add.click();

    const duplicateDetected = await waitForPossibleDuplicateWarning();
    if (duplicateDetected) {
      hudError('Duplicate contact detected');
      try { await GM_setValue(PENDING_KEY, {}); } catch (e) {}
      return false;
    }

    hudInfo('Popup submitted. Waiting for details...');
    try { await GM_setValue(PENDING_KEY, { payload: payload, ts: Date.now(), stage: 'details' }); } catch (e2) {}
    return true;
  }

  function fillBasicContactInfo(payload) {
    const basic = document.querySelector('form#BasicContactInfo');
    if (!basic) return false;

    const phoneInput = basic.querySelector('[data-section="phone"] input[name="Value"]') ||
                       basic.querySelector('.PhoneTemplateContainer input[name="Value"]');
    if (phoneInput) setVal(phoneInput, payload.primaryPhone || '');

    const phoneType = basic.querySelector('.PhoneTypes');
    if (phoneType) selectByText(phoneType, desiredPhoneCategory(payload));

    const emailInput = basic.querySelector('.EmailTemplateContainer input[name="Value"]');
    if (emailInput) setVal(emailInput, String(payload.primaryEmail || '').toLowerCase());

    const save = basic.querySelector('.SectionButtons .section_save');
    if (save) {
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch (e) {}
      save.click();
    }
    return true;
  }

  async function ensureAddressEditorOpen() {
    let link = await waitFor(() =>
      Array.from(document.querySelectorAll('a.h2AddRecordLink'))
        .find(a => /add an address/i.test(a.textContent || '') && isVisible(a)),
      { timeout: 8000, interval: 150 }
    );
    if (!link) {
      link = await waitFor(() =>
        Array.from(document.querySelectorAll('a,button'))
          .find(a => /add an address/i.test(a.textContent || '') && isVisible(a)),
        { timeout: 8000, interval: 150 }
      );
    }
    if (link) {
      try { link.scrollIntoView({ block: 'center' }); } catch (e) {}
      link.click();
      const editor = await waitForSelector('.AddressesDetailContainer .section-detaildata input[name="Line1"]', { timeout: 15000, interval: 150 });
      return !!editor;
    }
    return !!document.querySelector('.AddressesDetailContainer .section-detaildata input[name="Line1"]');
  }

  async function fillAddress(payload) {
    const opened = await ensureAddressEditorOpen();
    if (!opened) return false;

    const detail = Array.from(document.querySelectorAll('.AddressesDetailContainer .section-detaildata'))
      .find(d => isVisible(d)) || document.querySelector('.AddressesDetailContainer .section-detaildata');
    if (!detail) return false;

    const setField = (sel, val) => {
      const el = detail.querySelector(sel);
      if (!el) return;
      setVal(el, val || '');
      try { el.blur(); } catch (e) {}
    };

    const selectIn = (sel, txt) => {
      const el = detail.querySelector(sel);
      if (!el || !txt) return;
      const dn = String(txt).trim().toLowerCase();
      let opt = Array.from(el.options).find(o => o.textContent.trim().toLowerCase() === dn) ||
                Array.from(el.options).find(o => o.textContent.trim().toLowerCase().includes(dn)) ||
                Array.from(el.options).find(o => String(o.value || '').trim().toLowerCase() === dn);
      if (opt) {
        el.value = opt.value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    // Country
    const countrySel = detail.querySelector('select[name="CountryID"]');
    if (countrySel) {
      let val = Array.from(countrySel.options).find(o => String(o.value || '').toUpperCase() === 'USA')?.value;
      if (!val) val = Array.from(countrySel.options).find(o => o.textContent.trim().toLowerCase() === 'united states')?.value;
      if (val && countrySel.value !== val) {
        countrySel.value = val;
        countrySel.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(150);
      }
    }

    const addr = payload.address || {};
    setField('input[name="Line1"]', addr.line1 || '');
    setField('input[name="Line2"]', addr.line2 || '');
    setField('input[name="City"]', addr.city || '');

    const stateCode = String(addr.state || '').trim();
    if (stateCode) selectIn('select[name="StateID"]', stateCode);

    setField('input[name="Zip"]', String(addr.zip || '').slice(0, 5));
    selectIn('select[name="AddressTypeID"]', addr.addressType || 'Mailing');

    const addrForm = document.querySelector('form#Addresses') || detail.closest('form');
    const save = addrForm?.querySelector('.SectionButtons .section_save') || document.querySelector('form#Addresses .SectionButtons .section_save');
    if (save) {
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch (e) {}
      save.click();
      await sleep(300);
    }
    return true;
  }

  async function fillPersonalInfo(payload) {
    const pf = document.querySelector('form#PersonalInfo');
    if (!pf) return false;

    const btnVisible = (el) => el && isVisible(el) && !el.classList.contains('hide');

    // Ensure edit mode
    const saveBtn0 = pf.querySelector('.SectionButtons .section_save');
    if (!btnVisible(saveBtn0)) {
      const editBtn = pf.querySelector('.SectionButtons .section_edit');
      if (editBtn) {
        editBtn.click();
        await waitFor(() => btnVisible(pf.querySelector('.SectionButtons .section_save')), { timeout: 5000, interval: 150 });
      }
    }

    const setField = (sel, val) => {
      const el = pf.querySelector(sel);
      if (!el) return;
      setVal(el, val || '');
      try { el.blur(); } catch (e) {}
    };

    setField('input[name="FirstName"]', payload.firstName || '');
    setField('input[name="MiddleName"]', payload.middleName || '');
    setField('input[name="LastName"]', payload.lastName || '');

    const dobEl = pf.querySelector('input[name="DateOfBirthString"]');
    const dobStr = toMMDDYYYY(payload.dob || '');
    if (dobEl && dobStr) setDateValue(dobEl, dobStr);

    if (String(payload.customerType || '').toLowerCase() === 'commercial' || payload.businessName) {
      if (payload.ein) setField('input[name="FEIN"]', payload.ein);
    }

    const save = pf.querySelector('.SectionButtons .section_save');
    if (save) {
      await sleep(150);
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch (e) {}
      save.click();
      await sleep(250);
    }
    return true;
  }

  async function ensureAdditionalContactsEditorOpen() {
    const section = await waitFor(() => document.querySelector('.section-container[data-sectionkey="AdditionalContacts"]'), { timeout: 15000, interval: 150 });
    if (!section) return false;

    const btnVisible = (el) => el && isVisible(el) && !el.classList.contains('hide');

    const sectionSave = section.querySelector('.SectionButtons .section_save');
    if (!btnVisible(sectionSave)) {
      const sectionEdit = section.querySelector('.SectionButtons .section_edit');
      if (sectionEdit) {
        sectionEdit.click();
        await waitFor(() => btnVisible(section.querySelector('.SectionButtons .section_save')), { timeout: 8000, interval: 120 });
      }
    }

    const form = document.querySelector('form#AdditionalContacts');
    const already = form && isVisible(form.querySelector('.AdditionalContactsDetailContainer')) &&
      form.querySelector('.AdditionalContactsDetailContainer .section-detaildata input[name="FirstName"]');
    if (already) return true;

    let link = Array.from(section.querySelectorAll('span.h2AddRecord a.add-another-row'))
      .find(a => /add a contact/i.test(a.textContent || '') && isVisible(a));
    if (!link) link = Array.from(section.querySelectorAll('a.add-another-row'))
      .find(a => /add a contact/i.test(a.textContent || '') && isVisible(a));

    if (link) {
      link.click();
      const editor = await waitForSelector('form#AdditionalContacts .AdditionalContactsDetailContainer .section-detaildata input[name="FirstName"]', { timeout: 20000, interval: 150 });
      return !!editor;
    }
    return false;
  }

  async function fillAdditionalContact(contact) {
    const opened = await ensureAdditionalContactsEditorOpen();
    if (!opened) return false;

    const form = document.querySelector('form#AdditionalContacts');
    if (!form) return false;

    const detail = Array.from(form.querySelectorAll('.AdditionalContactsDetailContainer .section-detaildata')).find(d => isVisible(d)) ||
                   form.querySelector('.AdditionalContactsDetailContainer .section-detaildata');
    if (!detail) return false;

    const btnVisible = (el) => el && isVisible(el) && !(el.classList?.contains('hide'));

    const saveBtn = form.querySelector('.SectionButtons .section_save');
    if (!btnVisible(saveBtn)) {
      const editBtn = form.querySelector('.SectionButtons .section_edit');
      if (editBtn) {
        editBtn.click();
        await waitFor(() => btnVisible(form.querySelector('.SectionButtons .section_save')), { timeout: 8000, interval: 120 });
      }
    }

    const setField = (sel, val) => {
      const el = detail.querySelector(sel);
      if (!el) return;
      setVal(el, val || '');
      try { el.blur(); } catch (e) {}
    };

    const selectIn = (sel, txt) => {
      const el = detail.querySelector(sel);
      if (!el || !txt) return;
      const dn = String(txt).trim().toLowerCase();
      let opt = Array.from(el.options).find(o => o.textContent.trim().toLowerCase() === dn) ||
                Array.from(el.options).find(o => o.textContent.trim().toLowerCase().includes(dn)) ||
                Array.from(el.options).find(o => String(o.value || '').trim().toLowerCase() === dn);
      if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
    };

    setField('input[name="FirstName"]', toNameCase(contact.firstName));
    setField('input[name="MiddleName"]', contact.middleName || '');
    setField('input[name="LastName"]', toNameCase(contact.lastName));

    const dobStr = toMMDDYYYY(contact.dob || '');
    if (dobStr) setField('input[name="DateOfBirthString"]', dobStr);

    const rel = String(contact.relationship || '');
    if (rel) {
      const isRelative = /(spouse|husband|wife|child|parent|relative|domestic|partner|brother|sister|roommate|resident)/i.test(rel);
      selectIn('select[name="RelationCategoryID"]', isRelative ? 'Relative' : 'Non Relative');
      await sleep(120);
      selectIn('select[name="RelationID"]', rel);
    }

    if (contact.address) {
      const countrySel = detail.querySelector('select[name="CountryID"]');
      if (countrySel) {
        let val = Array.from(countrySel.options).find(o => String(o.value || '').toUpperCase() === 'USA')?.value;
        if (!val) val = Array.from(countrySel.options).find(o => o.textContent.trim().toLowerCase() === 'united states')?.value;
        if (val) { countrySel.value = val; countrySel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(120); }
      }
      setField('input[name="Line1"]', contact.address.line1 || '');
      setField('input[name="Line2"]', contact.address.line2 || '');
      setField('input[name="City"]', contact.address.city || '');
      const st = String(contact.address.state || '').trim();
      if (st) selectIn('select[name="StateID"]', st);
      setField('input[name="Zip"]', String(contact.address.zip || '').slice(0, 5));
    }

    const phoneInput = detail.querySelector('.PhoneTemplateContainer [data-section="phone"] input[name="Value"], .PhoneTemplateContainer input[name="Value"]');
    if (phoneInput) {
      setField('[data-section="phone"] input[name="Value"], .PhoneTemplateContainer input[name="Value"]', String(contact.primaryPhone || '').replace(/[^\d]/g, ''));
      const phoneTypeSel = detail.querySelector('.PhoneTemplateContainer .PhoneTypes');
      if (phoneTypeSel) selectIn('.PhoneTemplateContainer .PhoneTypes', String(contact.phoneType || '').toLowerCase().includes('mobile') ? 'Cell' : (contact.phoneType || ''));
    }

    const emailInput = detail.querySelector('.EmailTemplateContainer input[name="Value"]');
    if (emailInput) setField('.EmailTemplateContainer input[name="Value"]', String(contact.primaryEmail || '').toLowerCase());

    const save = form.querySelector('.SectionButtons .section_save');
    if (save) {
      try { save.classList.remove('hide'); save.style.removeProperty('display'); } catch (e) {}
      save.click();
      await sleep(350);
    }
    return true;
  }

  async function clickSaveAllChanges() {
    const btn = document.querySelector('.submit.section_saveall');
    if (!btn) return false;
    try { btn.scrollIntoView({ block: 'center' }); } catch (e) {}
    btn.click();
    const saving = document.querySelector('.section_saving');
    if (saving) {
      for (let i = 0; i < 30; i++) {
        if (saving.style.display === 'none' || saving.classList.contains('hide')) break;
        await sleep(150);
      }
    } else {
      await sleep(350);
    }
    return true;
  }

  async function addCarrierNoteIfNeeded(payload) {
    const noteText = noteTextForPayload(payload);
    if (!noteText) return false;
    const trigger = document.querySelector('button.button.AddNote, .button.AddNote');
    if (!trigger) return false;
    try { trigger.scrollIntoView({ block: 'center' }); } catch (e) {}
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

  async function runFillDetails(payload) {
    if (!onDetailsPage()) { hudError('Not on details page'); return; }
    if (hasPossibleDuplicateWarning()) { hudError('Duplicate contact detected'); try { await GM_setValue(PENDING_KEY, {}); } catch (e) {} return; }

    payload = sanitizePayloadObject(payload || {});

    hudInfo('Filling Basic Contact...');
    await waitFor(() => document.querySelector('form#BasicContactInfo'), { timeout: 15000, interval: 150 });
    const ok1 = fillBasicContactInfo(payload);

    hudInfo('Filling Address...');
    await waitFor(() => document.querySelector('form#Addresses'), { timeout: 15000, interval: 150 });
    const ok2 = await fillAddress(payload);

    hudInfo('Filling Personal Info...');
    await waitFor(() => document.querySelector('form#PersonalInfo'), { timeout: 15000, interval: 150 });
    const ok3 = await fillPersonalInfo(payload);

    let ok4 = true;
    if (Array.isArray(payload.additionalContacts) && payload.additionalContacts.length) {
      hudInfo('Adding Additional Contacts...');
      for (const c of payload.additionalContacts) ok4 = (await fillAdditionalContact(c)) && ok4;
    }

    if (ok1 && ok2 && ok3 && (!payload.additionalContacts || ok4)) hudOk('QQC fill complete');
    else hudError('QQC fill incomplete');

    try { await clickSaveAllChanges(); } catch (e) {}
    try { await addCarrierNoteIfNeeded(payload); } catch (e2) {}
  }

  // ------------------------ Orchestration ------------------------
  async function runFromPayload(payload) {
    payload = sanitizePayloadObject(payload || {});
    if (!payload || (!payload.firstName && !payload.lastName && !payload.businessName)) {
      hudError('No payload found');
      return;
    }

    // If we're already on a details page, just fill.
    if (onDetailsPage()) {
      await runFillDetails(payload);
      return;
    }

    // Otherwise, try to create via popup (works from contacts index and most other QQ pages).
    const ok = await fillPopup(payload);
    if (!ok) return;

    // Wait for details navigation / forms.
    const ready = await waitFor(() =>
      onDetailsPage() ||
      document.querySelector('form#BasicContactInfo') ||
      document.querySelector('form#PersonalInfo') ||
      document.querySelector('form#Addresses'),
      { timeout: 45000, interval: 300 }
    );

    if (ready && onDetailsPage()) {
      await GM_setValue(PENDING_KEY, {});
      await runFillDetails(payload);
    } else if (ready) {
      // Some tenants render forms without a URL change; try anyway.
      await GM_setValue(PENDING_KEY, {});
      await runFillDetails(payload);
    } else {
      hudError('Timed out waiting for details page');
    }
  }

  // Master Menu / bridge trigger (silent)
  PAGE_WINDOW.addEventListener('mci-run-contact-mapper', async (ev) => {
    try {
      if (!onQQ()) return;
      const d = (ev && ev.detail) || {};
      const mode = d.mode || 'auto';
      if (mode === 'extract') return; // carrier-only

      // Prefer explicit payload in event detail; fallback to stored payload.
      const payload = d.payload || await GM_getValue(STORAGE_KEY);
      if (d.payload) { try { await GM_setValue(STORAGE_KEY, d.payload); } catch (e0) {} }

      hudInfo('Importing into QQ Catalyst...');
      await runFromPayload(payload);
    } catch (e) {
      console.error('[MCI QQC Importer] Error:', e);
      hudError('Importer error (see console)');
    }
  });

  // Auto-run pending details fill after navigation
  (async () => {
    try {
      if (!onQQ()) return;
      const pending = await GM_getValue(PENDING_KEY);
      if (!pending || !pending.payload) return;

      const fresh = (Date.now() - (pending.ts || 0)) < 3 * 60 * 1000; // 3 minutes
      if (!fresh) { await GM_setValue(PENDING_KEY, {}); return; }

      if (onDetailsPage()) {
        hudInfo('Filling details...');
        await waitFor(() =>
          document.querySelector('form#BasicContactInfo') ||
          document.querySelector('form#PersonalInfo') ||
          document.querySelector('form#Addresses'),
          { timeout: 20000, interval: 200 }
        );
        await GM_setValue(PENDING_KEY, {});
        await runFillDetails(pending.payload);
      }
    } catch (e) {}
  })();

})();