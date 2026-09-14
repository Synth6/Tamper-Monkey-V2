// ==UserScript==
// @name         ERIE_TO_ORION180_Quote_Filler
// @namespace    https://middlecreekinsurance.com/
// @version      1.0.2
// @description  Erie shared-payload filler for Orion 180 HO3. Fills only the current page and never clicks Proceed, Next, Create Quote, Buy Now, Save, or other navigation/confirmation controls.
// @match        https://app.orion180.com/quote/*
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_ORION180_Quote_Filler.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_ORION180_Quote_Filler.user.js
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.0.2';
  const PREFIX = '[MCI Orion 180 HO3]';
  const ROOT = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  /* =========================================================
     SHARED PAYLOAD
     ========================================================= */

  function tryParse(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function getSharedPayload() {
    try {
      if (ROOT && typeof ROOT.getMciSharedPayload === 'function') {
        const p = tryParse(ROOT.getMciSharedPayload());
        if (p) return p;
      }
    } catch (e) {
      console.warn(PREFIX, 'getMciSharedPayload failed', e);
    }

    try {
      const p = tryParse(ROOT && ROOT.__MCI_SHARED_PAYLOAD);
      if (p) return p;
    } catch (_) {}

    try {
      const p = tryParse(ROOT && ROOT.__eriePayload);
      if (p) return p;
    } catch (_) {}

    for (const store of [localStorage, sessionStorage]) {
      for (const key of ['mciMasterPayload', 'erieMasterPayload']) {
        try {
          const p = tryParse(store.getItem(key));
          if (p) return p;
        } catch (_) {}
      }
    }

    try {
      if (typeof GM_getValue === 'function') {
        for (const key of ['mciMasterPayload', 'erieMasterPayload']) {
          const p = tryParse(GM_getValue(key, null));
          if (p) return p;
        }
      }
    } catch (_) {}

    return null;
  }

  function clean(v) {
    return v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  }

  function lower(v) {
    return clean(v).toLowerCase();
  }

  function digits(v) {
    return clean(v).replace(/\D/g, '');
  }

  function safeGet(obj, path, fallback) {
    let cur = obj;
    for (const part of String(path || '').split('.')) {
      if (!part || cur == null || !Object.prototype.hasOwnProperty.call(cur, part)) return fallback;
      cur = cur[part];
    }
    return cur == null ? fallback : cur;
  }

  function firstValue(obj, paths) {
    for (const path of paths) {
      const v = safeGet(obj, path, '');
      if (Array.isArray(v)) {
        if (v.length) return v;
      } else if (clean(v)) {
        return v;
      }
    }
    return '';
  }

  function firstNamed(payload) {
    return Array.isArray(payload && payload.namedInsureds) && payload.namedInsureds.length
      ? payload.namedInsureds[0]
      : {};
  }

  function bestPerson(payload) {
    const c = payload && payload.customer || {};
    const n = firstNamed(payload);
    const raw = payload && payload.raw || {};
    return {
      first: firstValue({ c, n }, ['c.firstName', 'n.firstName']),
      last: firstValue({ c, n }, ['c.lastName', 'n.lastName']),
      dob: firstValue({ c, n }, ['c.dob', 'c.dateOfBirth', 'n.dob', 'n.dateOfBirth']),
      phone: firstValue({ c, n }, [
        'c.phone.mobile', 'n.phone.mobile',
        'c.phone.home', 'n.phone.home',
        'c.phone.work', 'n.phone.work'
      ]),
      ssn: firstValue({ c, n, raw }, [
        'c.ssn', 'c.SSN', 'c.socialSecurityNumber',
        'n.ssn', 'n.SSN', 'n.socialSecurityNumber',
        'raw.customer.customerVM.FirstNamedInsured.SSNForm.SSN'
      ])
    };
  }

  function bestPropertyAddress(payload) {
    const d = payload && payload.dwelling || {};
    const c = payload && payload.customer || {};
    const candidates = [
      safeGet(d, 'address', {}),
      safeGet(c, 'residenceAddress', {}),
      safeGet(c, 'mailingAddress', {})
    ];
    return candidates.find(a => a && typeof a === 'object' && (
      clean(a.line1) || clean(a.street) || clean(a.full) || clean(a.zip)
    )) || {};
  }

  function fullAddress(a) {
    if (!a) return '';
    if (clean(a.full)) return clean(a.full);
    const line1 = firstValue(a, ['line1', 'address1', 'street']);
    const line2 = firstValue(a, ['line2', 'address2']);
    const city = clean(a.city);
    const state = firstValue(a, ['state', 'stateCode']);
    const zip = firstValue(a, ['zip', 'postalCode']);
    return [line1, line2, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }

  function normalizeDateForHtmlDate(value) {
    const s = clean(value);
    if (!s) return '';
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    return '';
  }

  function normalizeDateForDisplay(value) {
    const s = clean(value);
    if (!s) return '';
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[2].padStart(2, '0') + '/' + m[3].padStart(2, '0') + '/' + m[1];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[1].padStart(2, '0') + '/' + m[2].padStart(2, '0') + '/' + m[3];
    return s;
  }

  /* =========================================================
     DOM / VUE HELPERS
     ========================================================= */

  function byId(id) { return document.getElementById(id); }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  function fire(el, type, extra) {
    if (!el) return;
    let ev;
    try {
      ev = new Event(type, { bubbles: true, cancelable: true });
    } catch (_) {
      ev = document.createEvent('Event');
      ev.initEvent(type, true, true);
    }
    if (extra) Object.assign(ev, extra);
    el.dispatchEvent(ev);
  }

  function setNativeValue(el, value) {
    if (!el || el.disabled || el.readOnly) return false;
    const v = clean(value);
    if (!v) return false;
    if (clean(el.value) === v) return false;

    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, v);
    else el.value = v;

    fire(el, 'input');
    fire(el, 'change');
    return true;
  }

  function commitByTab(el, nextEl) {
    if (!el) return;
    try { el.focus(); } catch (_) {}
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
    } catch (_) {}
    fire(el, 'blur');
    try { if (nextEl && !nextEl.disabled) nextEl.focus(); } catch (_) {}
  }

  function waitFor(test, timeoutMs, intervalMs) {
    const timeout = timeoutMs || 8000;
    const interval = intervalMs || 120;
    return new Promise(resolve => {
      const started = Date.now();
      (function check() {
        let value = null;
        try { value = test(); } catch (_) {}
        if (value) return resolve(value);
        if (Date.now() - started >= timeout) return resolve(null);
        setTimeout(check, interval);
      })();
    });
  }

  function findLabelLike(text) {
    const wanted = lower(text);
    return Array.from(document.querySelectorAll('label')).find(l => lower(l.textContent).includes(wanted)) || null;
  }

  function controlNearLabel(text, selector) {
    const label = findLabelLike(text);
    if (!label) return null;
    const forId = label.getAttribute('for');
    if (forId && byId(forId)) return byId(forId);
    let root = label.parentElement;
    for (let i = 0; root && i < 4; i += 1, root = root.parentElement) {
      const hit = root.querySelector(selector || 'input,select,textarea');
      if (hit) return hit;
    }
    return null;
  }

  function multiselectNearLabel(text) {
    const label = findLabelLike(text);
    if (!label) return null;
    let root = label.parentElement;
    for (let i = 0; root && i < 5; i += 1, root = root.parentElement) {
      const hit = root.querySelector('.multiselect');
      if (hit) return hit;
    }
    return null;
  }

  async function chooseVueOptionByLabel(labelText, wanted) {
    const target = clean(wanted);
    if (!target) return false;
    const box = multiselectNearLabel(labelText);
    if (!box || !isVisible(box)) return false;

    const current = box.querySelector('.multiselect__single');
    if (current && lower(current.textContent) === lower(target)) return false;

    const input = box.querySelector('input.multiselect__input');
    if (!input) return false;

    try { box.click(); } catch (_) {}
    try { input.focus(); } catch (_) {}
    setNativeValue(input, target);
    await new Promise(r => setTimeout(r, 120));

    const options = Array.from(box.querySelectorAll('.multiselect__option'));
    let hit = options.find(o => lower(o.textContent) === lower(target));
    if (!hit) hit = options.find(o => lower(o.textContent).includes(lower(target)));
    if (!hit) {
      setNativeValue(input, ' ');
      fire(input, 'blur');
      return false;
    }
    hit.click();
    return true;
  }

  function selectedVueTextByLabel(text) {
    const box = multiselectNearLabel(text);
    if (!box) return '';
    return clean((box.querySelector('.multiselect__single') || {}).textContent);
  }

  function toast(msg, ms) {
    const old = byId('mci-orion180-filler-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'mci-orion180-filler-toast';
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', zIndex: '2147483647', left: '50%', top: '72px',
      transform: 'translateX(-50%)', background: '#111827', color: '#fff',
      padding: '8px 12px', borderRadius: '8px', boxShadow: '0 4px 18px rgba(0,0,0,.35)',
      font: '12px/1.35 system-ui,Segoe UI,Arial,sans-serif', pointerEvents: 'none'
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms || 2400);
  }

  function resultCounter() {
    return { changed: 0, skipped: 0, add(ok) { ok ? this.changed++ : this.skipped++; } };
  }

  /* =========================================================
     PAGE DETECTION
     ========================================================= */

  function currentPageKind() {
    if (!location.pathname.toLowerCase().startsWith('/quote/')) return '';
    const page = lower(new URLSearchParams(location.search).get('page'));
    if (page === 'start') return 'start';
    if (page === 'general') return 'general';
    if (page === 'property') return 'property';
    if (page === 'coverage') return 'coverage';

    if (byId('effectivedate') || byId('toggleAddressFields')) return 'start';
    if (byId('fname') || byId('dtquoteGeneral_BirthDate')) return 'general';
    if (byId('numHouse0') || lower(document.body.innerText).includes('property attributes')) return 'property';
    if (lower(document.body.innerText).includes('coverage a - dwelling')) return 'coverage';
    return '';
  }

  /* =========================================================
     STEP 1 - GENERAL INFO
     ========================================================= */

  function findZipInput() {
    return document.querySelector('input[placeholder*="zip" i]') ||
      controlNearLabel('Zip Code', 'input') ||
      Array.from(document.querySelectorAll('input')).find(x => /zip/i.test(x.id || '') && isVisible(x)) || null;
  }

  function countyReady() {
    const text = selectedVueTextByLabel('County');
    if (text && !/select/i.test(text)) return text;

    const direct = byId('county');
    if (direct) {
      const box = direct.closest('.multiselect') || direct.parentElement;
      const single = box && box.querySelector('.multiselect__single');
      const t = clean(single && single.textContent);
      if (t && !/select/i.test(t)) return t;
    }
    return '';
  }

  async function fillStartPage(payload) {
    const r = resultCounter();
    const addr = bestPropertyAddress(payload);
    const line1 = firstValue(addr, ['line1', 'address1', 'street']) || clean(addr.full).split(',')[0];
    const zip = digits(firstValue(addr, ['zip', 'postalCode'])).slice(0, 5);
    const city = firstValue(addr, ['city']);
    const eff = firstValue(payload || {}, ['meta.effectiveDate', 'coverages.policy.effectiveDate']);

    const effectiveEl = byId('effectivedate');
    if (effectiveEl && eff) {
      r.add(setNativeValue(effectiveEl, effectiveEl.type === 'date' ? normalizeDateForHtmlDate(eff) : normalizeDateForDisplay(eff)));
      fire(effectiveEl, 'blur');
    }

    let streetEl = byId('street');
    let cityEl = byId('city');
    let zipEl = findZipInput();

    const manualVisible = !!((streetEl && isVisible(streetEl)) || (zipEl && isVisible(zipEl)));
    if (!manualVisible) {
      const toggle = byId('toggleAddressFields');
      if (toggle && isVisible(toggle)) {
        toggle.click(); // UI expansion only; does not navigate or submit.
        await waitFor(() => {
          streetEl = byId('street');
          cityEl = byId('city');
          zipEl = findZipInput();
          return zipEl && isVisible(zipEl) && streetEl;
        }, 3000, 80);
      }
    }

    streetEl = byId('street');
    cityEl = byId('city');
    zipEl = findZipInput();

    if (zipEl && zip) {
      r.add(setNativeValue(zipEl, zip));
      commitByTab(zipEl, streetEl);
      const county = await waitFor(countyReady, 10000, 120);
      if (!county) toast('ZIP filled, but Orion county lookup did not finish. Review this page before Proceed.', 3800);
    }

    if (streetEl && line1) {
      r.add(setNativeValue(streetEl, line1));
      commitByTab(streetEl, cityEl);
      await new Promise(resolve => setTimeout(resolve, 250));
      await waitFor(() => clean((byId('city') || {}).value) || countyReady(), 6000, 120);
    }

    cityEl = byId('city');
    if (cityEl && city && !clean(cityEl.value)) {
      r.add(setNativeValue(cityEl, city));
      fire(cityEl, 'blur');
    }

    return r;
  }

  /* =========================================================
     STEP 2 - INSURED INFO
     ========================================================= */

  function creditModalVisible() {
    return Array.from(document.querySelectorAll('[role="dialog"], .modal, .modal-dialog, .fixed, .popup'))
      .some(el => isVisible(el) && /consent to use credit/i.test(el.textContent || ''));
  }

  function addressesEqual(a, b) {
    const norm = x => clean(x).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const av = [a.line1 || a.street, a.city, a.state || a.stateCode, a.zip || a.postalCode].map(norm).filter(Boolean).join('|');
    const bv = [b.line1 || b.street, b.city, b.state || b.stateCode, b.zip || b.postalCode].map(norm).filter(Boolean).join('|');
    return !!av && av === bv;
  }

  async function chooseYesNoByQuestion(questionText, yes) {
    const wanted = yes ? 'Yes' : 'No';
    const needle = lower(questionText);
    const candidates = Array.from(document.querySelectorAll('label,div,span,p'))
      .filter(el => lower(el.textContent).includes(needle));
    for (const el of candidates) {
      let root = el;
      for (let i = 0; root && i < 5; i += 1, root = root.parentElement) {
        const buttons = Array.from(root.querySelectorAll('button')).filter(isVisible);
        const btn = buttons.find(b => lower(b.textContent) === lower(wanted));
        if (btn) { btn.click(); return true; }
        const labels = Array.from(root.querySelectorAll('label')).filter(isVisible);
        const lbl = labels.find(l => lower(l.textContent) === lower(wanted));
        if (lbl) { lbl.click(); return true; }
      }
    }
    return false;
  }

  async function fillGeneralPage(payload) {
    if (creditModalVisible()) {
      toast('Click Acknowledge on Orion\'s credit consent first, then use Fill Page.', 3600);
      return resultCounter();
    }

    const r = resultCounter();
    const p = bestPerson(payload);
    const phone = digits(p.phone).slice(-10);
    const ssn = digits(p.ssn);

    r.add(setNativeValue(byId('fname'), p.first));
    r.add(setNativeValue(byId('lname'), p.last));
    if (phone.length === 10) r.add(setNativeValue(byId('phone'), phone));

    const dobEl = byId('dtquoteGeneral_BirthDate');
    if (dobEl && p.dob) {
      const dob = dobEl.type === 'date' ? normalizeDateForHtmlDate(p.dob) : normalizeDateForDisplay(p.dob);
      r.add(setNativeValue(dobEl, dob));
      fire(dobEl, 'blur');
    }

    // Orion requests only the last four SSN digits. Erie can carry the full
    // SSN in the shared payload, so never place more than the final 4 digits
    // into Orion's #ssn field.
    if (ssn.length >= 4) {
      r.add(setNativeValue(byId('ssn'), ssn.slice(-4)));
    }

    // Intentionally leave trust, prior-address, existing-coverage,
    // recent-home-purchase, household-member, and business-entity questions alone
    // unless the Erie payload gives us an unambiguous answer.
    const c = payload && payload.customer || {};
    const d = payload && payload.dwelling || {};
    const mailing = safeGet(c, 'mailingAddress', {});
    const property = safeGet(d, 'address', {});
    if (addressesEqual(mailing, property)) {
      r.add(await chooseYesNoByQuestion('mailing address same as the property address', true));
    }

    return r;
  }

  /* =========================================================
     STEP 3 - PROPERTY INFO
     ========================================================= */

  function mapConstruction(v) {
    const s = lower(v);
    if (!s) return '';
    if (s.includes('masonry veneer')) return 'Masonry Veneer';
    if (s.includes('masonry')) return 'Masonry';
    if (s.includes('frame')) return 'Frame';
    if (s.includes('brick')) return 'Brick';
    if (s.includes('stucco')) return 'Stucco';
    if (s.includes('log')) return 'Log';
    return clean(v);
  }

  function mapRoofMaterial(v) {
    const s = lower(v);
    if (!s) return '';
    if (s.includes('architect') || s.includes('composition') || s.includes('asphalt')) return 'Asphalt';
    if (s.includes('metal')) return 'Metal';
    if (s.includes('slate')) return 'Slate';
    if (s.includes('tile')) return 'Tile';
    if (s.includes('wood') || s.includes('shake')) return 'Wood';
    return clean(v);
  }

  function explicitYesNo(v) {
    if (v === true) return true;
    if (v === false) return false;
    const s = lower(v);
    if (['yes', 'true', 'y', '1'].includes(s)) return true;
    if (['no', 'false', 'n', '0'].includes(s)) return false;
    return null;
  }

  async function fillPropertyPage(payload) {
    const r = resultCounter();
    const d = payload && payload.dwelling || {};
    const st = safeGet(d, 'structure', {});
    const roof = safeGet(d, 'roof', {});
    const opts = safeGet(d, 'options', {});

    const sqft = firstValue(st, ['squareFeet', 'livingArea']);
    const sqftEl = byId('numHouse0') || controlNearLabel('Square Footage', 'input');
    if (sqftEl && sqft) r.add(setNativeValue(sqftEl, digits(sqft)));

    // Preserve values Orion already populated. Fill only blanks/high-confidence fields.
    const yearEl = controlNearLabel('Year Built', 'input');
    if (yearEl && !clean(yearEl.value) && clean(st.yearBuilt)) r.add(setNativeValue(yearEl, st.yearBuilt));

    const units = clean(st.numberOfFamilies);
    if (units && !selectedVueTextByLabel('Number of Dwelling Units')) {
      r.add(await chooseVueOptionByLabel('Number of Dwelling Units', units));
    }

    const construction = mapConstruction(st.constructionType);
    if (construction && !selectedVueTextByLabel('Construction Type')) {
      r.add(await chooseVueOptionByLabel('Construction Type', construction));
    }

    const roofMaterial = mapRoofMaterial(roof.material);
    if (roofMaterial && !selectedVueTextByLabel('Roof Covering')) {
      r.add(await chooseVueOptionByLabel('Roof Covering', roofMaterial));
    }

    const pool = explicitYesNo(opts.swimmingPool);
    if (pool !== null && !selectedVueTextByLabel('Swimming Pool')) {
      r.add(await chooseVueOptionByLabel('Swimming Pool', pool ? 'Yes' : 'No'));
    }

    // Do not guess mortgage, occupancy, dog/plumbing answers, claims,
    // roof-replacement status, alarms, discounts, or other underwriting answers.
    return r;
  }

  /* =========================================================
     STEP 4 - COVERAGES
     ========================================================= */

  function fillCoveragePage() {
    // Orion calculates/defaults this page from its own rating flow. Leave it alone.
    toast('Orion already populated the coverage page. Review the values; nothing was changed.', 3200);
    return resultCounter();
  }

  /* =========================================================
     CURRENT PAGE RUNNER
     ========================================================= */

  async function runCurrentPage() {
    const kind = currentPageKind();
    if (!kind) {
      toast('This Orion 180 page is not mapped yet.');
      return false;
    }

    const payload = getSharedPayload();
    if (!payload || typeof payload !== 'object') {
      toast('No Erie shared payload found. Open/export the Erie customer first.', 3400);
      return false;
    }

    let r;
    try {
      if (kind === 'start') r = await fillStartPage(payload);
      else if (kind === 'general') r = await fillGeneralPage(payload);
      else if (kind === 'property') r = await fillPropertyPage(payload);
      else r = fillCoveragePage(payload);
    } catch (e) {
      console.error(PREFIX, 'Fill Page failed', e);
      toast('Orion Fill Page hit an error. Review the page and console.', 3600);
      return false;
    }

    if (kind !== 'coverage') {
      toast('Orion ' + kind + ': filled ' + r.changed + ' field' + (r.changed === 1 ? '' : 's') + '. Review before continuing.', 3000);
    }
    return true;
  }

  /* =========================================================
     ADDRESS LOOKUP
     ========================================================= */

  function currentPropertyAddress() {
    const street = clean((byId('street') || {}).value);
    const city = clean((byId('city') || {}).value);
    const stateBox = multiselectNearLabel('State');
    const state = clean(stateBox && (stateBox.querySelector('.multiselect__single') || {}).textContent);
    const zipEl = findZipInput();
    const zip = clean(zipEl && zipEl.value);
    const onPage = [street, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (street && (city || zip)) return onPage;

    const payload = getSharedPayload();
    return fullAddress(bestPropertyAddress(payload || {}));
  }

  function currentStreetOnly() {
    const street = clean((byId('street') || {}).value);
    if (street) return street;
    const payload = getSharedPayload();
    const a = bestPropertyAddress(payload || {});
    return firstValue(a, ['line1', 'address1', 'street']) || clean(a.full).split(',')[0];
  }

  function normalizeWakeAddress(street) {
    const s = clean(street).replace(/\s+(APT|UNIT|STE|SUITE|#)\s+.*$/i, '');
    const m = s.match(/^(\d+[A-Z]?)\s+(.+)$/i);
    if (!m) return null;
    let name = clean(m[2]);
    name = name.replace(/\s+\b(RD|ROAD|DR|DRIVE|ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|CT|COURT|TRL|TRAIL|LN|LANE|WAY|PKWY|PARKWAY|CIR|CIRCLE|TER|TERRACE|PL|PLACE|HWY|HIGHWAY)\b\.?$/i, '');
    return { stnum: m[1], stname: name };
  }

  function openAddressLookup(mode) {
    const address = currentPropertyAddress();
    if (!address) {
      toast('Could not find a property address in Orion or the Erie payload.');
      return;
    }

    const ts = Date.now();
    if (mode === 'wake') {
      const w = normalizeWakeAddress(currentStreetOnly());
      if (!w) {
        toast('Could not split this address for Wake County lookup.');
        return;
      }
      window.open(
        'https://services.wake.gov/realestate/ValidateAddress.asp?stnum=' + encodeURIComponent(w.stnum) +
        '&stname=' + encodeURIComponent(w.stname) + '&locidList=&spg=&mci=1&ts=' + encodeURIComponent(String(ts)),
        '_blank', 'noopener'
      );
      return;
    }

    if (mode === 'maps') {
      window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address), '_blank', 'noopener');
      return;
    }

    if (mode === 'vexcel') {
      window.open('https://app.vexcelgroup.com/#/app/home?address=' + encodeURIComponent(address) + '&mci=1&ts=' + encodeURIComponent(String(ts)), '_blank', 'noopener');
    }
  }

  /* =========================================================
     EMBEDDED ORION HEADER CONTROLS
     ========================================================= */

  function mountHeaderControls() {
    if (!location.pathname.toLowerCase().startsWith('/quote/')) return false;

    const header = document.querySelector('nav[aria-label="header"]');
    if (!header) return false;

    // Orion is a Vue SPA and may replace the header contents after the
    // userscript first runs. Mount into the header's live inner wrapper
    // instead of relying on the nav node itself.
    const headerInner =
      header.querySelector(':scope > div.flex.justify-between.items-center') ||
      header.querySelector(':scope > div') ||
      header;

    const existing = byId('mci-orion-ho3-controls');
    if (existing) {
      if (existing.parentElement === headerInner) return true;
      existing.remove();
    }

    if (!byId('mci-orion-ho3-style')) {
      const style = document.createElement('style');
      style.id = 'mci-orion-ho3-style';
      style.textContent = `
        #mci-orion-ho3-controls{
          position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
          display:flex;align-items:center;gap:8px;z-index:100;
          font-family:Open Sans,system-ui,Segoe UI,Arial,sans-serif;
          pointer-events:auto;
        }
        #mci-orion-fill-page,#mci-orion-address-lookup{
          height:32px;border-radius:6px;border:1px solid #D50032;
          background:#D50032;color:#fff;font-size:13px;font-weight:700;
          cursor:pointer;white-space:nowrap;box-shadow:none;
        }
        #mci-orion-fill-page{padding:0 14px}
        #mci-orion-address-lookup{padding:0 28px 0 12px;min-width:142px}
        #mci-orion-fill-page:hover,#mci-orion-address-lookup:hover{
          background:#b9002b;border-color:#b9002b
        }
        #mci-orion-address-lookup option{background:#fff;color:#111}
        @media(max-width:800px){#mci-orion-ho3-controls{display:none}}
      `;
      document.head.appendChild(style);
    }

    // Give the live inner wrapper a positioning context without disturbing
    // Orion's left/right flex layout.
    if (getComputedStyle(headerInner).position === 'static') {
      headerInner.style.position = 'relative';
    }

    const wrap = document.createElement('div');
    wrap.id = 'mci-orion-ho3-controls';
    wrap.innerHTML = `
      <button id="mci-orion-fill-page" type="button">Fill Page</button>
      <select id="mci-orion-address-lookup" title="Open property address lookup">
        <option value="">Address Lookup</option>
        <option value="wake">Wake County</option>
        <option value="maps">Google Maps</option>
        <option value="vexcel">Vexcel</option>
      </select>
    `;
    headerInner.appendChild(wrap);

    byId('mci-orion-fill-page').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      runCurrentPage();
    });

    byId('mci-orion-address-lookup').addEventListener('change', function (e) {
      const mode = clean(e.target.value);
      e.target.value = '';
      if (mode) openAddressLookup(mode);
    });

    return true;
  }

  function keepHeaderControlsMounted() {
    // Retry during Orion's initial Vue render because the header can appear
    // and then be replaced a moment later.
    let attempts = 0;
    const retryTimer = setInterval(function () {
      attempts += 1;
      mountHeaderControls();
      if (attempts >= 30) clearInterval(retryTimer);
    }, 250);

    mountHeaderControls();

    if (!document.body || typeof MutationObserver === 'undefined') return;

    let queued = false;
    const observer = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () {
        queued = false;
        mountHeaderControls();
      }, 100);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* =========================================================
     GLOBAL HOOKS FOR MASTER MENU
     ========================================================= */

  ROOT.runOrion180CurrentPage = runCurrentPage;
  ROOT.openOrion180AddressLookup = openAddressLookup;
  try {
    window.runOrion180CurrentPage = runCurrentPage;
    window.openOrion180AddressLookup = openAddressLookup;
  } catch (_) {}

  ROOT.__mciOrion180QuoteFiller = {
    version: VERSION,
    getPayload: getSharedPayload,
    currentPageKind,
    runCurrentPage,
    openAddressLookup,
    mountHeaderControls
  };

  keepHeaderControlsMounted();
  console.log(PREFIX, 'Loaded v' + VERSION, ROOT.__mciOrion180QuoteFiller);
})();
