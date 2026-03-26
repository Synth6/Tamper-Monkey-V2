// ==UserScript==
// @name         ERIE_TO_PROGRESSIVE_NAMED_INSURED_FILLER_V1
// @namespace    https://middlecreekinsurance.com/
// @version      1.2.0
// @description  Fill Progressive Named Insured page from stored Erie master payload.
// @match        https://*.foragentsonly.com/*
// @match        https://quoting.foragentsonly.com/*
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const APP = {
    name: 'ERIE_TO_PROGRESSIVE_NAMED_INSURED_FILLER_V1',
    version: '1.2.0'
  };

  const IDS = {
    firstName: 'NamedInsured_Embedded_Questions_List_FirstName',
    middleInitial: 'NamedInsured_Embedded_Questions_List_MiddleInitial',
    lastName: 'NamedInsured_Embedded_Questions_List_LastName',
    suffix: 'NamedInsured_Embedded_Questions_List_Suffix',
    dob: 'NamedInsured_Embedded_Questions_List_DateOfBirth',
    gender: 'NamedInsured_Embedded_Questions_List_Gender',
    email: 'NamedInsured_Embedded_Questions_List_PrimaryEmailAddress',
    phoneType: 'NamedInsured_PhoneNumbers_List_0_Embedded_Questions_List_PhoneType',
    phoneNumber: 'NamedInsured_PhoneNumbers_List_0_Embedded_Questions_List_PhoneNumber',
    address1: 'NamedInsured_Embedded_Questions_List_MailingAddress',
    address2: 'NamedInsured_Embedded_Questions_List_ApartmentUnit',
    city: 'NamedInsured_Embedded_Questions_List_City',
    state: 'NamedInsured_Embedded_Questions_List_State',
    zip: 'NamedInsured_Embedded_Questions_List_ZipCode',
    poBoxMilitary: 'NamedInsured_Embedded_Questions_List_MailingZipType',
    recentlyMoved: 'NamedInsured_Embedded_Questions_List_RecentlyMoved',
    disclosureProvided: 'NamedInsured_Embedded_Questions_List_DisclosureProvided'
  };

  const STABLE_WATCH_IDS = [
    IDS.firstName,
    IDS.middleInitial,
    IDS.lastName,
    IDS.dob,
    IDS.gender,
    IDS.email,
    IDS.phoneType,
    IDS.phoneNumber,
    IDS.address1,
    IDS.city,
    IDS.state,
    IDS.zip,
    IDS.recentlyMoved,
    IDS.disclosureProvided
  ];

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function firstNonEmpty(values) {
    if (!Array.isArray(values)) return '';
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return '';
  }

  function safeGet(obj, path, defaultValue) {
    if (!obj || !path) return defaultValue;
    const parts = String(path).split('.');
    let cursor = obj;
    for (let i = 0; i < parts.length; i += 1) {
      const key = parts[i];
      if (cursor == null || !Object.prototype.hasOwnProperty.call(cursor, key)) {
        return defaultValue;
      }
      cursor = cursor[key];
    }
    return cursor == null ? defaultValue : cursor;
  }

  function getPayload() {
    const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    try {
      if (root && typeof root.getMciSharedPayload === 'function') {
        const shared = root.getMciSharedPayload();
        if (shared && typeof shared === 'object') return shared;
        if (typeof shared === 'string') {
          const parsed = JSON.parse(shared);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      }
    } catch (e) {
      console.error('[' + APP.name + '] Failed to load shared payload', e);
    }

    try {
      const raw = localStorage.getItem('mciMasterPayload');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error('[' + APP.name + '] Failed to load stored payload', e);
    }

    return null;
  }

  function normalizeDob(value) {
    const s = String(value || '').trim();
    if (!s) return '';

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return iso[2] + '/' + iso[3] + '/' + iso[1];

    return s;
  }

  function cleanPhone(num) {
    return String(num || '').replace(/\D+/g, '');
  }

  function pickPhone(source) {
    const phone = source && source.phone ? source.phone : {};
    if (phone.mobile) return { type: 'M', number: phone.mobile };
    if (phone.home) return { type: 'H', number: phone.home };
    if (phone.work) return { type: 'W', number: phone.work };
    return { type: 'M', number: '' };
  }

  function mapGender(value) {
    const v = String(value || '').trim().toUpperCase();
    if (v === 'M' || v === 'MALE') return 'M';
    if (v === 'F' || v === 'FEMALE') return 'F';
    return '';
  }

  function mapSuffix(value) {
    const v = String(value || '').trim().toUpperCase();
    if (!v) return '';
    if (v === 'JR.' || v === 'JR') return 'JR';
    if (v === 'SR.' || v === 'SR') return 'SR';
    return v;
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function getValueSetter(el) {
    if (!el) return null;
    if (el.tagName === 'TEXTAREA') {
      return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set || null;
    }
    if (el.tagName === 'SELECT') {
      return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set || null;
    }
    return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set || null;
  }

  function dispatchFieldEvents(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setInput(id, value) {
    const el = getElement(id);
    if (!el) return false;
    if (value === undefined || value === null) return false;

    const stringValue = String(value);
    const setter = getValueSetter(el);
    if (setter) setter.call(el, stringValue);
    else el.value = stringValue;

    dispatchFieldEvents(el);
    return true;
  }

  function setSelect(id, value) {
    const el = getElement(id);
    if (!el || el.tagName !== 'SELECT') return false;
    if (value === undefined || value === null) return false;

    const wanted = String(value).trim().toUpperCase();

    let matched = null;
    for (let i = 0; i < el.options.length; i += 1) {
      const opt = el.options[i];
      const optValue = String(opt.value || '').trim().toUpperCase();
      const optText = String(opt.text || '').trim().toUpperCase();
      if (optValue === wanted || optText === wanted) {
        matched = opt;
        break;
      }
    }

    if (!matched) return false;

    const setter = getValueSetter(el);
    if (setter) setter.call(el, matched.value);
    else el.value = matched.value;

    dispatchFieldEvents(el);
    return true;
  }

  function setCheckbox(id, checked) {
    const el = getElement(id);
    if (!el || el.type !== 'checkbox') return false;

    const shouldCheck = !!checked;
    if (el.checked !== shouldCheck) {
      el.click();
    } else {
      dispatchFieldEvents(el);
    }

    return true;
  }

  function readFieldValue(id) {
    const el = getElement(id);
    if (!el) return '';
    if (el.type === 'checkbox') return !!el.checked;
    return String(el.value || '').trim();
  }

  function normalizeForCompare(value) {
    return String(value == null ? '' : value).trim().toUpperCase();
  }

  function valuesEqual(actual, expected) {
    return normalizeForCompare(actual) === normalizeForCompare(expected);
  }

  function snapshotFields(ids) {
    const snap = {};
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      snap[id] = readFieldValue(id);
    }
    return JSON.stringify(snap);
  }

  async function waitForDomStability(ids, stableMs, timeoutMs, pollMs) {
    const stableWindow = stableMs || 1000;
    const timeout = timeoutMs || 7000;
    const poll = pollMs || 150;

    const start = Date.now();
    let lastSnap = snapshotFields(ids);
    let lastChange = Date.now();

    while (Date.now() - start < timeout) {
      await sleep(poll);
      const currentSnap = snapshotFields(ids);
      if (currentSnap !== lastSnap) {
        lastSnap = currentSnap;
        lastChange = Date.now();
      }
      if (Date.now() - lastChange >= stableWindow) {
        return true;
      }
    }

    return false;
  }

  function buildData(payload) {
    const customer = payload && payload.customer ? payload.customer : {};
    const primaryNamedInsured = payload && payload.namedInsureds && payload.namedInsureds[0]
      ? payload.namedInsureds[0]
      : {};

    const phonePick = pickPhone(primaryNamedInsured.phone && firstNonEmpty([
      primaryNamedInsured.phone.mobile,
      primaryNamedInsured.phone.home,
      primaryNamedInsured.phone.work
    ]) ? primaryNamedInsured : customer);

    const state = firstNonEmpty([
      safeGet(customer, 'mailingAddress.state', ''),
      safeGet(primaryNamedInsured, 'mailingAddress.state', ''),
      safeGet(customer, 'residenceAddress.state', '')
    ]);

    return {
      firstName: firstNonEmpty([
        primaryNamedInsured.firstName,
        customer.firstName
      ]),
      middle: firstNonEmpty([
        primaryNamedInsured.middleName,
        customer.middleName
      ]).slice(0, 1),
      lastName: firstNonEmpty([
        primaryNamedInsured.lastName,
        customer.lastName
      ]),
      suffix: mapSuffix(firstNonEmpty([
        primaryNamedInsured.suffix,
        customer.suffix
      ])),
      dob: normalizeDob(firstNonEmpty([
        primaryNamedInsured.dob,
        primaryNamedInsured.dateOfBirth,
        customer.dob,
        customer.dateOfBirth
      ])),
      gender: mapGender(firstNonEmpty([
        primaryNamedInsured.gender,
        customer.gender
      ])),
      email: firstNonEmpty([
        primaryNamedInsured.email,
        customer.email
      ]),
      phoneType: phonePick.type,
      phoneNumber: cleanPhone(phonePick.number),
      address1: firstNonEmpty([
        safeGet(customer, 'mailingAddress.line1', ''),
        safeGet(customer, 'residenceAddress.line1', '')
      ]),
      address2: firstNonEmpty([
        safeGet(customer, 'mailingAddress.line2', ''),
        safeGet(customer, 'residenceAddress.line2', '')
      ]),
      city: firstNonEmpty([
        safeGet(customer, 'mailingAddress.city', ''),
        safeGet(customer, 'residenceAddress.city', '')
      ]),
      state: state,
      zip: firstNonEmpty([
        safeGet(customer, 'mailingAddress.zip', ''),
        safeGet(customer, 'mailingAddress.zipCode', ''),
        safeGet(customer, 'mailingAddress.postalCode', ''),
        safeGet(customer, 'residenceAddress.zip', '')
      ]),
      poBoxMilitary: false,
      recentlyMoved: 'N',
      disclosureProvided: 'Y'
    };
  }

  function collectWarnings(data) {
    const warnings = [];
    if (!data.firstName) warnings.push('Missing first name');
    if (!data.lastName) warnings.push('Missing last name');
    if (!data.dob) warnings.push('Missing DOB');
    if (!data.address1) warnings.push('Missing mailing address line 1');
    if (!data.city) warnings.push('Missing city');
    if (!data.state) warnings.push('Missing state');
    if (!data.zip) warnings.push('Missing zip');
    if (!data.email) warnings.push('Missing email');
    if (!data.phoneNumber) warnings.push('Missing phone');
    return warnings;
  }

  async function runActions(result, phaseName, actions) {
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      try {
        const ok = action.run();
        result.steps.push({
          phase: phaseName,
          id: action.id,
          value: action.value,
          ok: !!ok
        });
      } catch (e) {
        result.steps.push({
          phase: phaseName,
          id: action.id,
          value: action.value,
          ok: false,
          error: String(e && e.message ? e.message : e)
        });
      }
      await sleep(80);
    }
  }

  function buildRepairActions(data) {
    const repairs = [];

    function maybeInput(id, value) {
      if (!valuesEqual(readFieldValue(id), value)) {
        repairs.push({
          id: id,
          value: value,
          run: function () { return setInput(id, value); }
        });
      }
    }

    function maybeSelect(id, value) {
      if (!valuesEqual(readFieldValue(id), value)) {
        repairs.push({
          id: id,
          value: value,
          run: function () { return setSelect(id, value); }
        });
      }
    }

    function maybeCheckbox(id, value) {
      if (!!readFieldValue(id) !== !!value) {
        repairs.push({
          id: id,
          value: value,
          run: function () { return setCheckbox(id, value); }
        });
      }
    }

    maybeInput(IDS.firstName, data.firstName);
    maybeInput(IDS.middleInitial, data.middle);
    maybeInput(IDS.lastName, data.lastName);
    maybeSelect(IDS.suffix, data.suffix);
    maybeInput(IDS.dob, data.dob);
    maybeSelect(IDS.gender, data.gender);
    maybeInput(IDS.email, data.email);
    maybeSelect(IDS.phoneType, data.phoneType);
    maybeInput(IDS.phoneNumber, data.phoneNumber);
    maybeInput(IDS.address1, data.address1);
    maybeInput(IDS.address2, data.address2);
    maybeInput(IDS.city, data.city);
    maybeSelect(IDS.state, data.state);
    maybeInput(IDS.zip, data.zip);
    maybeCheckbox(IDS.poBoxMilitary, data.poBoxMilitary);
    maybeSelect(IDS.recentlyMoved, data.recentlyMoved);
    maybeSelect(IDS.disclosureProvided, data.disclosureProvided);

    return repairs;
  }

  async function fillProgressiveNamedInsuredFromErie(payload, options) {
    const settings = options || {};
    const result = {
      ok: true,
      dryRun: settings.dryRun === true,
      warnings: [],
      errors: [],
      steps: [],
      data: null
    };

    if (!payload || typeof payload !== 'object') {
      result.ok = false;
      result.errors.push('No payload found');
      return result;
    }

    const data = buildData(payload);
    result.data = data;
    result.warnings = collectWarnings(data);

    if (settings.dryRun === true) {
      return result;
    }

    await runActions(result, 'phase_1_identity', [
      { id: IDS.firstName, value: data.firstName, run: function () { return setInput(IDS.firstName, data.firstName); } },
      { id: IDS.middleInitial, value: data.middle, run: function () { return setInput(IDS.middleInitial, data.middle); } },
      { id: IDS.lastName, value: data.lastName, run: function () { return setInput(IDS.lastName, data.lastName); } },
      { id: IDS.suffix, value: data.suffix, run: function () { return setSelect(IDS.suffix, data.suffix); } },
      { id: IDS.dob, value: data.dob, run: function () { return setInput(IDS.dob, data.dob); } },
      { id: IDS.gender, value: data.gender, run: function () { return setSelect(IDS.gender, data.gender); } }
    ]);

    await waitForDomStability(STABLE_WATCH_IDS, 900, 7000, 150);

    await runActions(result, 'phase_2_contact', [
      { id: IDS.email, value: data.email, run: function () { return setInput(IDS.email, data.email); } },
      { id: IDS.phoneType, value: data.phoneType, run: function () { return setSelect(IDS.phoneType, data.phoneType); } },
      { id: IDS.phoneNumber, value: data.phoneNumber, run: function () { return setInput(IDS.phoneNumber, data.phoneNumber); } }
    ]);

    await waitForDomStability(STABLE_WATCH_IDS, 1100, 8000, 150);

    await runActions(result, 'phase_3_address', [
      { id: IDS.address1, value: data.address1, run: function () { return setInput(IDS.address1, data.address1); } },
      { id: IDS.address2, value: data.address2, run: function () { return setInput(IDS.address2, data.address2); } },
      { id: IDS.city, value: data.city, run: function () { return setInput(IDS.city, data.city); } },
      { id: IDS.state, value: data.state, run: function () { return setSelect(IDS.state, data.state); } }
    ]);

    await waitForDomStability(STABLE_WATCH_IDS, 1200, 9000, 150);

    await runActions(result, 'phase_4_finishers', [
      { id: IDS.zip, value: data.zip, run: function () { return setInput(IDS.zip, data.zip); } },
      { id: IDS.poBoxMilitary, value: data.poBoxMilitary, run: function () { return setCheckbox(IDS.poBoxMilitary, data.poBoxMilitary); } },
      { id: IDS.recentlyMoved, value: data.recentlyMoved, run: function () { return setSelect(IDS.recentlyMoved, data.recentlyMoved); } },
      { id: IDS.disclosureProvided, value: data.disclosureProvided, run: function () { return setSelect(IDS.disclosureProvided, data.disclosureProvided); } }
    ]);

    await waitForDomStability(STABLE_WATCH_IDS, 1500, 10000, 150);

    const repair1 = buildRepairActions(data);
    if (repair1.length) {
      await runActions(result, 'repair_pass_1', repair1);
      await waitForDomStability(STABLE_WATCH_IDS, 1200, 9000, 150);
    }

    const repair2 = buildRepairActions(data);
    if (repair2.length) {
      await runActions(result, 'repair_pass_2', repair2);
      await waitForDomStability(STABLE_WATCH_IDS, 1200, 9000, 150);
    }

    return result;
  }

  async function testProgressiveNamedInsured(opts) {
    const payload = getPayload();
    if (!payload) {
      console.warn('[' + APP.name + '] No Erie payload found');
      return {
        ok: false,
        dryRun: !!(opts && opts.dryRun),
        warnings: [],
        errors: ['No Erie payload found'],
        steps: [],
        data: null
      };
    }

    const result = await fillProgressiveNamedInsuredFromErie(payload, opts || {});
    console.log('[' + APP.name + ']', result);
    return result;
  }

  const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  root.fillProgressiveNamedInsuredFromErie = fillProgressiveNamedInsuredFromErie;
  root.testProgressiveNamedInsured = testProgressiveNamedInsured;

  console.log('Loaded: ' + APP.name + ' v' + APP.version);
})();