// ==UserScript==
// @name         ERIE_TO_Progressive_Quote_Filler
// @namespace    https://middlecreekinsurance.com/
// @version      1.0.0
// @description  Consolidated Progressive quote filler for Named Insured, Products/Vehicles, and Household Members from MCI/Erie payloads.
// @match        https://*.foragentsonly.com/*
// @match        https://quoting.foragentsonly.com/*
// @match        https://quoting.foragentsonly.com/Quote/Index/*
// @match        https://www.foragentsonly.com/Quote/Index/*
// @grant        GM_getValue
// @grant        unsafeWindow
// ==/UserScript==
// ============================================================
// PROGRESSIVE - SHARED / COMMON
// =============================
(function () {
  'use strict';

  const APP_NAME = 'MCI - Progressive Quote Filler';
  const ROOT = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  function tryParseJson(value) {
    if (!value) return null;
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (_) {
      return null;
    }
  }

  function defaultValidPayload(value) {
    return !!(value && typeof value === 'object');
  }

  function loadPayload(options) {
    const settings = options || {};
    const appName = settings.appName || APP_NAME;
    const isValidPayload = settings.isValidPayload || defaultValidPayload;

    function accept(source, value) {
      const parsed = tryParseJson(value);
      if (isValidPayload(parsed)) {
        if (settings.debug) console.log('[' + appName + '] Loaded payload from ' + source);
        return parsed;
      }
      return null;
    }

    try {
      if (ROOT && typeof ROOT.getMciSharedPayload === 'function') {
        const bridged = accept('getMciSharedPayload()', ROOT.getMciSharedPayload());
        if (bridged) return bridged;
      }
    } catch (e) {
      console.warn('[' + appName + '] getMciSharedPayload() failed', e);
    }

    try {
      const sharedGlobal = accept('unsafeWindow.__MCI_SHARED_PAYLOAD', ROOT && ROOT.__MCI_SHARED_PAYLOAD);
      if (sharedGlobal) return sharedGlobal;
    } catch (_) { }

    try {
      const erieGlobal = accept('unsafeWindow.__eriePayload', ROOT && ROOT.__eriePayload);
      if (erieGlobal) return erieGlobal;
    } catch (_) { }

    const keys = ['mciMasterPayload', 'erieMasterPayload'];
    const stores = [
      { name: 'localStorage', store: typeof localStorage !== 'undefined' ? localStorage : null },
      { name: 'sessionStorage', store: typeof sessionStorage !== 'undefined' ? sessionStorage : null }
    ];

    for (let i = 0; i < stores.length; i += 1) {
      const current = stores[i];
      if (!current.store) continue;
      for (let k = 0; k < keys.length; k += 1) {
        try {
          const loaded = accept(current.name + '.' + keys[k], current.store.getItem(keys[k]));
          if (loaded) return loaded;
        } catch (_) { }
      }
    }

    if (typeof GM_getValue === 'function') {
      for (let k = 0; k < keys.length; k += 1) {
        try {
          const loaded = accept('GM_getValue(' + keys[k] + ')', GM_getValue(keys[k], null));
          if (loaded) return loaded;
        } catch (_) { }
      }
    }

    return null;
  }

  ROOT.__MCI_PROGRESSIVE_COMMON = {
    loadPayload: loadPayload
  };
})();

// ============================================================
// PROGRESSIVE - NAMED INSURED
// ===========================
(function () {
  'use strict';

  const APP = {
    name: 'MCI - Progressive Quote Filler / Named Insured',
    version: '1.0.0'
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
    const common = root && root.__MCI_PROGRESSIVE_COMMON;

    if (common && typeof common.loadPayload === 'function') {
      return common.loadPayload({
        appName: APP.name,
        isValidPayload: function (obj) {
          return !!(obj && typeof obj === 'object');
        }
      });
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

// ============================================================
// PROGRESSIVE - PRODUCTS / VEHICLES
// =================================
(function () {
    'use strict';

    const APP = {
        name: 'MCI - Progressive Quote Filler / Products',
        version: '1.0.0',
        debug: true
    };

    const STATE = {
        running: false
    };

    const PAGE = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    const U = {
        log: function () {
            if (!APP.debug) return;
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[' + APP.name + ']');
            console.log.apply(console, args);
        },

        warn: function () {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[' + APP.name + '] Warning:');
            console.warn.apply(console, args);
        },

        safeString: function (v) {
            return v == null ? '' : String(v);
        },

        clean: function (v) {
            return U.safeString(v).replace(/\s+/g, ' ').trim();
        },

        upper: function (v) {
            return U.clean(v).toUpperCase();
        },

        asArray: function (v) {
            return Array.isArray(v) ? v : [];
        },

        tryParseJson: function (v) {
            if (!v) return null;
            try {
                return typeof v === 'string' ? JSON.parse(v) : v;
            } catch (e) {
                return null;
            }
        },

        delay: function (ms) {
            return new Promise(function (resolve) {
                setTimeout(resolve, ms);
            });
        },

        query: function (sel, root) {
            try {
                return (root || document).querySelector(sel);
            } catch (e) {
                return null;
            }
        },

        queryAll: function (sel, root) {
            try {
                return Array.prototype.slice.call((root || document).querySelectorAll(sel));
            } catch (e) {
                return [];
            }
        },

        isVisible: function (el) {
            if (!el || !document.contains(el)) return false;
            var cs = window.getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        },

        dispatch: function (el, type) {
            if (!el) return;
            el.dispatchEvent(new Event(type, { bubbles: true }));
        },

        setNativeValue: function (el, value) {
            if (!el) return false;
            var proto = Object.getPrototypeOf(el);
            var desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
            if (desc && desc.set) {
                desc.set.call(el, value);
            } else {
                el.value = value;
            }
            return true;
        },

        setInputValue: function (el, value) {
            if (!el) return false;
            value = U.clean(value);
            U.setNativeValue(el, value);
            U.dispatch(el, 'input');
            U.dispatch(el, 'change');
            U.dispatch(el, 'blur');
            return true;
        },

        getSelectedText: function (el) {
            if (!el) return '';
            if (typeof el.selectedIndex === 'number' && el.options && el.options[el.selectedIndex]) {
                return U.clean(el.options[el.selectedIndex].text);
            }
            return U.clean(el.value);
        },

        setSelectByText: function (el, wantedText) {
            if (!el) return false;
            wantedText = U.clean(wantedText);
            if (!wantedText) return false;

            var options = Array.prototype.slice.call(el.options || []);
            var match = null;

            options.some(function (opt) {
                if (U.clean(opt.text) === wantedText) {
                    match = opt;
                    return true;
                }
                return false;
            });

            if (!match) {
                options.some(function (opt) {
                    if (U.upper(opt.text) === U.upper(wantedText)) {
                        match = opt;
                        return true;
                    }
                    return false;
                });
            }

            if (!match) {
                options.some(function (opt) {
                    if (U.upper(opt.text).indexOf(U.upper(wantedText)) !== -1) {
                        match = opt;
                        return true;
                    }
                    return false;
                });
            }

            if (!match) return false;

            el.value = match.value;
            U.dispatch(el, 'input');
            U.dispatch(el, 'change');
            U.dispatch(el, 'blur');
            return true;
        },

        setSelectByValue: function (el, wantedValue) {
            if (!el) return false;
            wantedValue = U.clean(wantedValue);
            var options = Array.prototype.slice.call(el.options || []);
            var match = options.find(function (opt) {
                return U.clean(opt.value) === wantedValue;
            });
            if (!match) return false;

            el.value = match.value;
            U.dispatch(el, 'input');
            U.dispatch(el, 'change');
            U.dispatch(el, 'blur');
            return true;
        },

        click: function (el) {
            if (!el) return false;
            el.click();
            return true;
        },

        waitFor: function (fn, timeoutMs, intervalMs) {
            timeoutMs = timeoutMs || 8000;
            intervalMs = intervalMs || 200;

            return new Promise(function (resolve) {
                var start = Date.now();

                (function poll() {
                    var out = null;
                    try {
                        out = fn();
                    } catch (e) { }

                    if (out) {
                        resolve(out);
                        return;
                    }

                    if (Date.now() - start >= timeoutMs) {
                        resolve(null);
                        return;
                    }

                    setTimeout(poll, intervalMs);
                })();
            });
        },

        normalizeMilesLabel: function (v) {
            var n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10);
            if (isNaN(n)) return '';

            if (n <= 3999) return '0 - 3,999';
            if (n <= 5999) return '4,000 - 5,999';
            if (n <= 7999) return '6,000 - 7,999';
            if (n <= 9999) return '8,000 - 9,999';
            if (n <= 11999) return '10,000 - 11,999';
            if (n <= 13999) return '12,000 - 13,999';
            if (n <= 15999) return '14,000 - 15,999';
            if (n <= 17999) return '16,000 - 17,999';
            if (n <= 19999) return '18,000 - 19,999';
            if (n <= 21999) return '20,000 - 21,999';
            if (n <= 23999) return '22,000 - 23,999';
            if (n <= 26999) return '24,000 - 26,999';
            if (n <= 29999) return '27,000 - 29,999';
            return '30,000 - 99,999';
        },

        mapVehicleUse: function (useText) {
            var s = U.upper(useText);
            if (!s) return '1A - Pleasure';
            if (s.indexOf('BUSINESS') !== -1) return '3 - Business (Incidental)';
            if (s.indexOf('FARM') !== -1) return '1AF - Farm';
            if (s.indexOf('WORK') !== -1 || s.indexOf('COMMUTE') !== -1 || s.indexOf('SCHOOL') !== -1) {
                return '1B - Commute < 10 miles';
            }
            return '1A - Pleasure';
        },

        inferOwnedDuration: function (vehicle, payload) {
            var eff = U.clean(
                payload &&
                payload.coverages &&
                payload.coverages.policy &&
                payload.coverages.policy.effectiveDate
            );

            var match = eff.match(/^\d{2}\/\d{2}\/(\d{4})$/);
            var effYear = match ? parseInt(match[1], 10) : null;
            var modelYear = parseInt(U.clean(vehicle && vehicle.year), 10);

            if (!effYear || isNaN(modelYear)) return '';

            var diff = effYear - modelYear;
            if (diff <= 0) return 'Less than 1 month';
            if (diff === 1) return 'At least 6 months but less than 1 year';
            if (diff <= 3) return 'At least 1 year but less than 3 years';
            if (diff <= 5) return 'At least 3 years but less than 5 years';
            return '5 years or more';
        },

        toast: function (message, ms) {
            ms = ms || 2200;
            var el = document.getElementById('mci-progressive-products-toast');

            if (!el) {
                el = document.createElement('div');
                el.id = 'mci-progressive-products-toast';
                el.style.cssText = [
                    'position:fixed',
                    'top:18px',
                    'left:50%',
                    'transform:translateX(-50%)',
                    'z-index:2147483647',
                    'background:#111',
                    'color:#fff',
                    'padding:8px 12px',
                    'border-radius:8px',
                    'font:12px/1.35 system-ui,Segoe UI,Arial,sans-serif',
                    'box-shadow:0 6px 18px rgba(0,0,0,.35)',
                    'pointer-events:none'
                ].join(';');
                document.body.appendChild(el);
            }

            el.textContent = message;
            el.style.display = 'block';
            clearTimeout(el._hideTimer);
            el._hideTimer = setTimeout(function () {
                el.style.display = 'none';
            }, ms);
        }
    };

    const Payload = {
        load: function () {
            function isValidPayload(obj) {
                return !!(obj && obj.meta && Array.isArray(obj.vehicles));
            }

            if (PAGE && PAGE.__MCI_PROGRESSIVE_COMMON && typeof PAGE.__MCI_PROGRESSIVE_COMMON.loadPayload === 'function') {
                return PAGE.__MCI_PROGRESSIVE_COMMON.loadPayload({
                    appName: APP.name,
                    debug: APP.debug,
                    isValidPayload: isValidPayload
                });
            }

            return null;
        }
    };

    const Progressive = {
        policyEffectiveDate: function () {
            return U.query('#ProductsAA_Embedded_Questions_List_PolicyEffectiveDate');
        },

        namedOperatorNo: function () {
            return U.query('#ProductsAA_Embedded_Questions_List_NamedOperatorIndicator_N');
        },

        nextButton: function () {
            return U.query('#btnNextId');
        },

        fieldId: function (index, suffix) {
            return '#ProductsAA_Vehicles_List_' + index + '_Embedded_Questions_List_' + suffix;
        },

        radioId: function (index, suffix, code) {
            return '#ProductsAA_Vehicles_List_' + index + '_Embedded_Questions_List_' + suffix + '_' + code;
        },

        vehicleCount: function () {
            var vinInputs = U.queryAll('input[id^="ProductsAA_Vehicles_List_"][id$="_Embedded_Questions_List_Vin"]')
                .filter(function (el) {
                    return U.isVisible(el);
                });

            return vinInputs.length;
        },

        addVehicleButton: function () {
            var nodes = U.queryAll('button, [role="button"], a, div');
            return nodes.find(function (el) {
                return U.upper(el.textContent) === 'ADD A NEW VEHICLE';
            }) || null;
        },

        vinSearchButton: function (index) {
            var vinEl = U.query(this.fieldId(index, 'Vin'));
            if (!vinEl) return null;

            var node = vinEl;
            for (var i = 0; i < 6 && node; i++, node = node.parentElement) {
                var candidates = U.queryAll('button, [role="button"], a, mat-icon, i, svg, span', node)
                    .filter(function (el) {
                        if (!U.isVisible(el)) return false;

                        var t = U.upper(el.textContent);
                        var aria = U.upper(el.getAttribute('aria-label') || '');
                        var title = U.upper(el.getAttribute('title') || '');
                        var cls = U.upper(String(el.className || ''));

                        if (t.indexOf('SEARCH') !== -1) return true;
                        if (aria.indexOf('SEARCH') !== -1) return true;
                        if (title.indexOf('SEARCH') !== -1) return true;
                        if (cls.indexOf('SEARCH') !== -1) return true;
                        if (cls.indexOf('MAGN') !== -1) return true;
                        if (cls.indexOf('ICON') !== -1) return true;
                        if (t.indexOf('ZOOM_IN') !== -1) return true;

                        return false;
                    });

                if (candidates.length) return candidates[0];
            }

            return null;
        }
    };

    const Data = {
        getEffectiveDate: function (payload) {
            return U.clean(
                payload &&
                payload.coverages &&
                payload.coverages.policy &&
                payload.coverages.policy.effectiveDate
            );
        },

        getVehicles: function (payload) {
            return U.asArray(payload && payload.vehicles);
        },

        getGaragingZip: function (payload, vehicle) {
            return U.clean(
                vehicle &&
                vehicle.garagingAddress &&
                vehicle.garagingAddress.zip
            ) || U.clean(
                payload &&
                payload.customer &&
                payload.customer.residenceAddress &&
                payload.customer.residenceAddress.zip
            ) || U.clean(
                payload &&
                payload.customer &&
                payload.customer.mailingAddress &&
                payload.customer.mailingAddress.zip
            ) || '';
        }
    };

    const Fill = {
        fillTopSection: async function (payload) {
            var effectiveDate = Data.getEffectiveDate(payload);

            if (!effectiveDate) {
                U.warn('No policy effective date found in payload.coverages.policy.effectiveDate');
                U.toast('No Erie effective date found - skipped Policy Effective Date', 2600);
            } else {
                var effEl = Progressive.policyEffectiveDate();
                if (!effEl) {
                    U.warn('Progressive policy effective date field not found; skipping Policy Effective Date');
                    U.toast('Policy Effective Date field not found - skipped', 2600);
                } else {
                    U.setInputValue(effEl, effectiveDate);
                    U.log('Set policy effective date:', effectiveDate);
                    await U.delay(400);
                }
            }

            var namedOperatorNo = Progressive.namedOperatorNo();
            if (namedOperatorNo) {
                U.click(namedOperatorNo);
                U.log('Set Named Operator Policy = No');
                await U.delay(300);
            }
        },

        ensureVehicleSlots: async function (countNeeded) {
            var guard = 0;

            while (Progressive.vehicleCount() < countNeeded && guard < 12) {
                var btn = Progressive.addVehicleButton();

                if (!btn) {
                    U.warn('Add A New Vehicle button not found; skipping vehicle slot creation', {
                        countNeeded: countNeeded,
                        currentVehicleCount: Progressive.vehicleCount()
                    });
                    U.toast('Could not add vehicle ' + countNeeded + ' - Add button not found', 2600);
                    return false;
                }

                U.click(btn);
                guard += 1;
                U.log('Clicked Add A New Vehicle, attempt', guard);

                await U.waitFor(function () {
                    var vinEl = U.query(Progressive.fieldId(countNeeded - 1, 'Vin'));
                    return Progressive.vehicleCount() >= countNeeded && !!vinEl;
                }, 8000, 250);

                await U.delay(800);
            }

            var finalVin = U.query(Progressive.fieldId(countNeeded - 1, 'Vin'));

            if (Progressive.vehicleCount() < countNeeded || !finalVin) {
                U.warn('Could not create enough vehicle slots', {
                    countNeeded: countNeeded,
                    currentVehicleCount: Progressive.vehicleCount(),
                    finalVinFound: !!finalVin
                });
                U.toast('Could not create vehicle slot ' + countNeeded + ' - skipped', 2600);
                return false;
            }

            return true;
        },

        waitForVehicleDecode: async function (index, timeoutMs) {
            timeoutMs = timeoutMs || 12000;

            return U.waitFor(function () {
                var yearEl = U.query(Progressive.fieldId(index, 'Year'));
                var makeEl = U.query(Progressive.fieldId(index, 'Make'));
                var modelEl = U.query(Progressive.fieldId(index, 'Model'));
                var bodyEl = U.query(Progressive.fieldId(index, 'BodyStyle'));

                var yearVal = yearEl ? U.getSelectedText(yearEl) : '';
                var makeVal = makeEl ? U.getSelectedText(makeEl) : '';
                var modelVal = modelEl ? U.getSelectedText(modelEl) : '';
                var bodyVal = bodyEl ? U.getSelectedText(bodyEl) : '';

                return !!(yearVal || makeVal || modelVal || bodyVal);
            }, timeoutMs, 250);
        },

        setVehicleNoFieldSafe: function (index, fieldSuffixes, timeoutMs) {
            timeoutMs = timeoutMs || 2500;
            fieldSuffixes = Array.isArray(fieldSuffixes) ? fieldSuffixes : [fieldSuffixes];

            return new Promise(function (resolve) {
                var settled = false;
                var timer = setTimeout(function () {
                    if (settled) return;
                    settled = true;
                    U.log('Warning: Timed out setting vehicle field to No', {
                        index: index,
                        fieldSuffixes: fieldSuffixes,
                        timeoutMs: timeoutMs
                    });
                    resolve(false);
                }, timeoutMs);

                (async function () {
                    try {
                        for (var i = 0; i < fieldSuffixes.length; i++) {
                            var fieldSuffix = U.clean(fieldSuffixes[i]);
                            if (!fieldSuffix) continue;

                            await U.waitFor(function () {
                                return U.query(Progressive.fieldId(index, fieldSuffix)) ||
                                    U.query(Progressive.radioId(index, fieldSuffix, 'N'));
                            }, 650, 120);

                            var radioNo = U.query(Progressive.radioId(index, fieldSuffix, 'N'));
                            if (radioNo) {
                                U.click(radioNo);
                                U.dispatch(radioNo, 'input');
                                U.dispatch(radioNo, 'change');
                                U.dispatch(radioNo, 'blur');
                                await U.delay(120);

                                if (!settled) {
                                    settled = true;
                                    clearTimeout(timer);
                                    U.log('Set vehicle field to No via radio', {
                                        index: index,
                                        fieldSuffix: fieldSuffix
                                    });
                                    resolve(true);
                                }
                                return;
                            }

                            var selectEl = U.query(Progressive.fieldId(index, fieldSuffix));
                            if (selectEl) {
                                var setOk = U.setSelectByValue(selectEl, 'N') || U.setSelectByText(selectEl, 'No');
                                await U.delay(120);

                                if (setOk) {
                                    if (!settled) {
                                        settled = true;
                                        clearTimeout(timer);
                                        U.log('Set vehicle field to No via select', {
                                            index: index,
                                            fieldSuffix: fieldSuffix
                                        });
                                        resolve(true);
                                    }
                                    return;
                                }
                            }
                        }

                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            U.log('Warning: Vehicle No field not found or not set', {
                                index: index,
                                fieldSuffixes: fieldSuffixes
                            });
                            resolve(false);
                        }
                    } catch (e) {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            U.log('Warning: Failed to set vehicle field to No', {
                                index: index,
                                fieldSuffixes: fieldSuffixes,
                                error: e
                            });
                            resolve(false);
                        }
                    }
                })();
            });
        },

        fillVehicle: async function (index, vehicle, payload) {
            U.log('Filling vehicle', index, vehicle);

            var typeEl = U.query(Progressive.fieldId(index, 'TypeCode'));
            var vinEl = U.query(Progressive.fieldId(index, 'Vin'));
            var zipEl = U.query(Progressive.fieldId(index, 'GaragingZip'));
            var ownedEl = U.query(Progressive.fieldId(index, 'HowLongOwned'));
            var useEl = U.query(Progressive.fieldId(index, 'VehicleUse'));
            var annualMilesEl = U.query(Progressive.fieldId(index, 'AnnualMiles'));

            if (typeEl) {
                U.setSelectByValue(typeEl, 'A') ||
                    U.setSelectByText(typeEl, '1981 & Newer - Autos, Pickups, Vans, and Utility Vehicles');
                await U.delay(300);
            }

            if (!vinEl) {
                U.warn('VIN field not found for vehicle index ' + index);
                U.toast('Vehicle ' + (index + 1) + ' skipped - VIN field not found', 2600);
                return false;
            }

            if (!vehicle || !U.clean(vehicle.vin)) {
                U.warn('Payload vehicle VIN missing for vehicle index ' + index);
                U.toast('Vehicle ' + (index + 1) + ' skipped - Erie VIN missing', 2600);
                return false;
            }

            U.setInputValue(vinEl, vehicle.vin);
            U.log('Set VIN for vehicle', index, vehicle.vin);
            await U.delay(300);

            var vinSearchBtn = Progressive.vinSearchButton(index);
            if (vinSearchBtn) {
                U.click(vinSearchBtn);
                U.log('Clicked VIN search button for vehicle', index);
                await Fill.waitForVehicleDecode(index, 12000);
                await U.delay(400);
            } else {
                U.log('VIN search button not found for vehicle', index);
            }

            var garagingZip = Data.getGaragingZip(payload, vehicle);
            U.log('Garaging ZIP lookup for vehicle', index, {
                zipFieldFound: !!zipEl,
                garagingZip: garagingZip
            });

            if (zipEl && garagingZip) {
                U.setInputValue(zipEl, garagingZip);
                U.log('Set garaging ZIP for vehicle', index, garagingZip);
                await U.delay(250);
            }

            var ownedDuration = U.inferOwnedDuration(vehicle, payload);
            if (ownedEl && ownedDuration) {
                U.setSelectByText(ownedEl, ownedDuration);
                await U.delay(200);
            }

            var vehicleUse = U.clean(vehicle && vehicle.use) ? U.mapVehicleUse(vehicle.use) : '';
            if (useEl && vehicleUse) {
                U.setSelectByText(useEl, vehicleUse);
                await U.delay(200);
            }

            await Fill.setVehicleNoFieldSafe(index, [
                'VehicleTransportNetworkCompanyIndicator',
                'UsedForRideshareTncIndicator'
            ], 2500);
            await Fill.setVehicleNoFieldSafe(index, [
                'VehicleUseDelivery',
                'DeliveryVehicleIndicator'
            ], 2500);

            var annualMiles = U.normalizeMilesLabel(vehicle && vehicle.annualMiles);
            if (annualMilesEl && annualMiles) {
                U.setSelectByText(annualMilesEl, annualMiles);
                await U.delay(200);
            }

            await U.delay(400);
            return true;
        },

        run: async function () {
            if (STATE.running) {
                U.toast('Products filler is already running');
                return false;
            }

            var payload = Payload.load();
            if (!payload || !payload.meta) {
                throw new Error('No Erie master payload found. Checked bridge, page globals, localStorage, sessionStorage, and GM storage.');
            }

            var vehicles = Data.getVehicles(payload);
            if (!vehicles.length) {
                throw new Error('Payload has no vehicles');
            }

            STATE.running = true;

            try {
                U.toast('Starting Progressive Products fill...');
                U.log('Loaded payload:', payload);

                await Fill.fillTopSection(payload);

                var filledCount = 0;
                var skippedCount = 0;

                for (var i = 0; i < vehicles.length; i++) {
                    var filled = false;

                    try {
                        if (i > 0) {
                            var slotReady = await Fill.ensureVehicleSlots(i + 1);
                            await U.delay(500);

                            if (!slotReady) {
                                U.warn('Vehicle slot not ready; skipping vehicle', {
                                    index: i,
                                    vehicle: vehicles[i]
                                });
                                U.toast('Vehicle ' + (i + 1) + ' skipped - slot not ready', 2600);
                                skippedCount += 1;
                                filled = false;
                                continue;
                            }
                        }

                        filled = await Fill.fillVehicle(i, vehicles[i], payload);
                    } catch (e) {
                        U.warn('Vehicle fill failed; continuing with remaining vehicles', {
                            index: i,
                            vehicle: vehicles[i],
                            error: e
                        });
                        U.toast('Vehicle ' + (i + 1) + ' skipped - fill error', 2600);
                    }

                    if (filled) {
                        filledCount += 1;
                        U.toast('Vehicle ' + (i + 1) + ' of ' + vehicles.length + ' filled', 1200);
                    } else {
                        skippedCount += 1;
                    }
                }

                U.toast('Products fill complete: ' + filledCount + ' filled, ' + skippedCount + ' skipped', 4000);
                U.log('Done', {
                    filled: filledCount,
                    skipped: skippedCount
                });
                return true;
            } finally {
                STATE.running = false;
            }
        }
    };

    PAGE.testProgressiveProducts = async function () {
        return Fill.run();
    };

    PAGE.goNextProgressiveProducts = function () {
        var nextBtn = Progressive.nextButton();
        if (nextBtn) {
            nextBtn.click();
            return true;
        }
        return false;
    };

    U.log('Loaded. No UI mounted. Run testProgressiveProducts() from console.');
})();

// ============================================================
// PROGRESSIVE - HOUSEHOLD MEMBERS
// ===============================
(function () {
    'use strict';

    const APP = {
        key: 'mciMasterPayload',
        version: '1.0.0',
        pageId: 'HouseholdMembers',
        debugPrefix: '[MCI - Progressive Quote Filler / Household Members]'
    };

    const U = {
        log(...args) { console.log(APP.debugPrefix, ...args); },
        warn(...args) { console.warn(APP.debugPrefix, ...args); },
        err(...args) { console.error(APP.debugPrefix, ...args); },

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        q(sel, root) {
            return (root || document).querySelector(sel);
        },

        qa(sel, root) {
            return Array.from((root || document).querySelectorAll(sel));
        },

        byId(id) {
            return document.getElementById(id);
        },

        cleanText(v) {
            return String(v || '').replace(/\s+/g, ' ').trim();
        },

        upper(v) {
            return U.cleanText(v).toUpperCase();
        },

        digits(v) {
            return String(v || '').replace(/\D+/g, '');
        },

        titleCase(v) {
            const s = U.cleanText(v).toLowerCase();
            if (!s) return '';
            return s.replace(/\b[a-z]/g, c => c.toUpperCase());
        },

        normalizeName(v) {
            return U.upper(v).replace(/\s+/g, ' ');
        },

        normalizeVehicleText(v) {
            return U.upper(v)
                .replace(/\bCHEV\b/g, 'CHEVROLET')
                .replace(/\bVW\b/g, 'VOLKSWAGEN')
                .replace(/\bMERC\b/g, 'MERCEDES')
                .replace(/\s+/g, ' ')
                .trim();
        },

        isVisible(el) {
            if (!el) return false;
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            return !!(r.width || r.height);
        },

        fire(el, type, opts) {
            if (!el) return;
            const cfg = Object.assign({ bubbles: true, cancelable: true }, opts || {});
            let ev;
            if (type === 'input' || type === 'change' || type === 'blur' || type === 'focus') {
                ev = new Event(type, cfg);
            } else {
                ev = new MouseEvent(type, cfg);
            }
            el.dispatchEvent(ev);
        },

        setNativeValue(el, value) {
            if (!el) return false;
            const val = value == null ? '' : String(value);
            const proto = Object.getPrototypeOf(el);
            const desc =
                Object.getOwnPropertyDescriptor(proto, 'value') ||
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

            if (desc && typeof desc.set === 'function') {
                desc.set.call(el, val);
            } else {
                el.value = val;
            }

            U.fire(el, 'input');
            U.fire(el, 'change');
            return true;
        },

        setInput(el, value) {
            if (!el) return false;
            el.focus();
            U.setNativeValue(el, value);
            U.fire(el, 'blur');
            return true;
        },

        setSelect(selectEl, wantedValue, wantedText) {
            if (!selectEl) return false;

            const options = Array.from(selectEl.options || []);
            const wantVal = U.cleanText(wantedValue);
            const wantTxt = U.cleanText(wantedText);
            const wantTxtUpper = wantTxt.toUpperCase();

            let match = null;

            if (wantVal) {
                match = options.find(o => U.cleanText(o.value) === wantVal);
            }

            if (!match && wantTxt) {
                match = options.find(o => U.cleanText(o.textContent) === wantTxt);
            }

            if (!match && wantTxt) {
                match = options.find(o => U.upper(o.textContent) === wantTxtUpper);
            }

            if (!match && wantTxt) {
                match = options.find(o => U.upper(o.textContent).includes(wantTxtUpper));
            }

            if (!match) return false;

            selectEl.focus();
            selectEl.value = match.value;
            U.fire(selectEl, 'input');
            U.fire(selectEl, 'change');
            U.fire(selectEl, 'blur');
            return true;
        },

        async waitFor(fn, opts) {
            const timeout = (opts && opts.timeout) || 4000;
            const interval = (opts && opts.interval) || 60;
            const start = Date.now();

            while (Date.now() - start < timeout) {
                try {
                    const value = fn();
                    if (value) return value;
                } catch (_) { }
                await U.sleep(interval);
            }

            return null;
        },

        async click(el) {
            if (!el) return false;
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.focus();
            el.click();
            return true;
        },

        openersForReadonlyInput(inputEl) {
            if (!inputEl) return [];
            return [
                inputEl.closest('.dropdown'),
                inputEl.parentElement,
                inputEl.closest('select-input'),
                inputEl
            ].filter(Boolean);
        },

        getVisibleOverlayOptions() {
            return U.qa([
                '.cdk-overlay-pane [role="option"]',
                '.cdk-overlay-pane mat-option',
                '.cdk-overlay-pane .mat-mdc-option',
                '.cdk-overlay-pane .mdc-list-item',
                '.cdk-overlay-pane li',
                '.cdk-overlay-pane button',
                '.cdk-overlay-pane [role="button"]',
                'body > .dropdown-menu li',
                'body > .dropdown-menu button'
            ].join(',')).filter(U.isVisible);
        },

        scoreVehicleOptionText(candidateText, wanted) {
            const cand = U.normalizeVehicleText(candidateText);
            const year = U.cleanText(wanted.year);
            const make = U.normalizeVehicleText(wanted.make);
            const model = U.normalizeVehicleText(wanted.model);
            const vinTail = U.upper(wanted.vinTail || '').replace(/^\.\.\./, '');

            let score = 0;
            if (year && cand.includes(year)) score += 5;
            if (make && cand.includes(make)) score += 4;
            if (model && cand.includes(model)) score += 4;
            if (vinTail && cand.includes(vinTail)) score += 3;
            return score;
        }
    };

    const Payload = {
        getBridgeRoot() {
            try {
                return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            } catch (_) {
                return window;
            }
        },

        getRaw() {
            const root = Payload.getBridgeRoot();
            const common = root && root.__MCI_PROGRESSIVE_COMMON;

            if (common && typeof common.loadPayload === 'function') {
                return common.loadPayload({
                    appName: APP.debugPrefix.replace(/^\[|\]$/g, ''),
                    isValidPayload: function (obj) {
                        return !!(obj && typeof obj === 'object');
                    }
                });
            }

            return null;
        },

        require() {
            const payload = Payload.getRaw();
            if (!payload) {
                throw new Error('No shared payload found. Expected getMciSharedPayload() / mciMasterPayload.');
            }
            return payload;
        }
    };

    const Data = {
        stateCodeToName(code) {
            const map = {
                AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
                CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Dist Of Columbia',
                FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
                IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
                ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
                MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
                NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
                NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
                OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
                SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
                VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
                AB: 'Alberta', BC: 'British Columbia'
            };
            return map[String(code || '').toUpperCase()] || String(code || '');
        },

        mapGender(g) {
            const s = U.upper(g);
            if (s === 'M' || s === 'MALE') return { value: 'M', text: 'Male' };
            if (s === 'F' || s === 'FEMALE') return { value: 'F', text: 'Female' };
            return { value: '', text: '' };
        },

        mapMaritalStatus(ms) {
            const s = U.upper(ms);
            if (s === 'MARRIED' || s === 'M') return { value: 'M', text: 'Married' };
            if (s === 'SINGLE' || s === 'S') return { value: 'S', text: 'Single' };
            if (s === 'SEPARATED' || s === 'P') return { value: 'P', text: 'Separated' };
            if (s === 'WIDOWED' || s === 'W') return { value: 'W', text: 'Widowed' };
            if (s === 'DIVORCED' || s === 'D') return { value: 'D', text: 'Divorced' };
            return { value: '', text: '' };
        },

        mapRelationship(rel, isPrimaryNamedInsured) {
            const s = U.upper(rel);

            if (isPrimaryNamedInsured || s === 'INSURED' || s === 'SELF' || s === 'NAMED INSURED') {
                return '';
            }
            if (s === 'SPOUSE') return 'Spouse';
            if (s === 'CHILD' || s === 'SON' || s === 'DAUGHTER') return 'Child';
            if (s === 'PARENT' || s === 'MOTHER' || s === 'FATHER') return 'Parent';
            return 'Other';
        },

        inferEducation(person, payload) {
            const raw = U.cleanText(person.education || '');
            if (raw) return raw;

            const ageAtEff = Data.calcAgeOnDate(
                person.dob,
                payload && payload.meta && payload.meta.effectiveDate
            );

            if (ageAtEff != null) {
                if (ageAtEff <= 22) return 'Currently in college';
                if (ageAtEff >= 23) return 'High school diploma or GED';
            }

            return 'High school diploma or GED';
        },

        mapEducationToText(v) {
            const s = U.upper(v);
            if (!s) return '';
            if (s.includes('NO HIGH SCHOOL')) return 'No high school diploma or GED';
            if (s.includes('HIGH SCHOOL') || s.includes('GED')) return 'High school diploma or GED';
            if (s.includes('VOCATIONAL') || s.includes('TRADE') || s.includes('MILITARY')) return 'Vocational / trade school degree or military training';
            if (s.includes('COMPLETED SOME COLLEGE') || s === 'SOME COLLEGE') return 'Completed some college';
            if (s.includes('CURRENTLY IN COLLEGE')) return 'Currently in college';
            if (s.includes('COLLEGE DEGREE') || s === 'COLLEGE') return 'College degree';
            if (s.includes('GRADUATE')) return 'Graduate work or graduate degree';
            return v;
        },

        parseMmDdYyyy(s) {
            const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (!m) return null;
            const month = Number(m[1]);
            const day = Number(m[2]);
            const year = Number(m[3]);
            if (!month || !day || !year) return null;
            return new Date(year, month - 1, day);
        },

        parseMmYyyy(s) {
            const m = String(s || '').match(/^(\d{1,2})\/(\d{4})$/);
            if (!m) return null;
            return { month: Number(m[1]), year: Number(m[2]) };
        },

        calcAgeOnDate(dobStr, onDateStr) {
            const dob = Data.parseMmDdYyyy(dobStr);
            const onDate = Data.parseMmDdYyyy(onDateStr);
            if (!dob || !onDate) return null;

            let age = onDate.getFullYear() - dob.getFullYear();
            const monthDiff = onDate.getMonth() - dob.getMonth();

            if (monthDiff < 0 || (monthDiff === 0 && onDate.getDate() < dob.getDate())) {
                age -= 1;
            }
            return age;
        },

        calcAgeFirstLicensed(dobStr, firstLicensedMmYyyy) {
            const dob = Data.parseMmDdYyyy(dobStr);
            const fl = Data.parseMmYyyy(firstLicensedMmYyyy);
            if (!dob || !fl) return null;

            let age = fl.year - dob.getFullYear();
            if ((fl.month - 1) < dob.getMonth()) age -= 1;
            if (age < 0) age = 0;
            return String(age);
        },

        calcMonthsLicensedBucket(firstLicensedMmYyyy, policyEffectiveDate) {
            const fl = Data.parseMmYyyy(firstLicensedMmYyyy);
            const eff = Data.parseMmDdYyyy(policyEffectiveDate);
            if (!fl || !eff) return '';

            let months = (eff.getFullYear() - fl.year) * 12 + ((eff.getMonth() + 1) - fl.month);
            if (months < 0) months = 0;

            if (months <= 11) return '0';
            if (months <= 23) return '1';
            if (months <= 35) return '2';
            return '3';
        },

        buildVehicleLookup(payload) {
            const vehicles = Array.isArray(payload && payload.vehicles) ? payload.vehicles.slice() : [];
            const byOperator = new Map();

            for (const v of vehicles) {
                const opKey = U.normalizeName(v.primaryOperator || '');
                if (!opKey) continue;

                const entry = {
                    year: U.cleanText(v.year),
                    make: U.cleanText(v.make),
                    model: U.cleanText(v.model),
                    vin: U.cleanText(v.vin),
                    vinTail: U.cleanText(v.vinMaskedTail || '').replace(/^\.\.\./, ''),
                    raw: v
                };

                if (!byOperator.has(opKey)) byOperator.set(opKey, []);
                byOperator.get(opKey).push(entry);
            }

            return byOperator;
        },

        findPrimaryVehicleForDriver(driver, vehicleLookup) {
            const possibleNames = [
                driver.fullName,
                [driver.firstName, driver.middleName, driver.lastName].filter(Boolean).join(' '),
                [driver.firstName, driver.lastName].filter(Boolean).join(' ')
            ].map(U.normalizeName).filter(Boolean);

            for (const key of possibleNames) {
                const matches = vehicleLookup.get(key);
                if (matches && matches.length) return matches[0];
            }

            return null;
        },

        normalizeHousehold(payload) {
            const allDrivers = Array.isArray(payload && payload.drivers) ? payload.drivers.slice() : [];
            const effectiveDate = payload && payload.meta && payload.meta.effectiveDate
                ? payload.meta.effectiveDate
                : (payload && payload.coverages && payload.coverages.policy && payload.coverages.policy.effectiveDate) || '';

            const vehicleLookup = Data.buildVehicleLookup(payload);

            const people = allDrivers
                .filter(d => d && d.isHouseholdMember !== false && d.isExcluded !== true)
                .map((d, idx) => {
                    const isPrimary = !!(d.isNamedInsured && U.upper(d.relationshipToNamedInsured) === 'INSURED') || idx === 0;
                    const gender = Data.mapGender(d.gender);
                    const marital = Data.mapMaritalStatus(d.maritalStatus);
                    const relationshipText = Data.mapRelationship(d.relationshipToNamedInsured, isPrimary);
                    const licenseStateCode = U.upper(d.license && d.license.state);
                    const licenseStateText = Data.stateCodeToName(licenseStateCode);
                    const ageFirstLicensed = Data.calcAgeFirstLicensed(d.dob, d.license && d.license.dateFirstLicensed);
                    const monthsLicensedBucket = Data.calcMonthsLicensedBucket(d.license && d.license.dateFirstLicensed, effectiveDate);
                    const primaryVehicle = Data.findPrimaryVehicleForDriver(d, vehicleLookup);

                    return {
                        source: d,
                        firstName: d.firstName || '',
                        middleInitial: U.cleanText(d.middleName || '').charAt(0),
                        lastName: d.lastName || '',
                        suffix: d.suffix || '',
                        maritalStatusText: marital.text,
                        maritalStatusValue: marital.value,
                        relationshipText: relationshipText,
                        dob: d.dob || '',
                        ssn: U.digits(d.ssn || ''),
                        genderText: gender.text,
                        genderValue: gender.value,
                        educationText: Data.mapEducationToText(Data.inferEducation(d, payload)),
                        driverIncludedText: d.isExcluded ? 'Non-Rated' : 'Rated',
                        licenseTypeText: (d.license && d.license.number) ? 'Personal Auto' : 'Not Licensed/State ID',
                        licenseStatusText: (d.license && d.license.number) ? 'Valid' : 'Not Licensed/State ID',
                        licenseStateText,
                        licenseStateCode,
                        licenseNumber: d.license && d.license.number ? U.cleanText(d.license.number) : '',
                        previousLicenseStateText: 'None',
                        stateFilingValue: U.upper(d.sr22) === 'Y' ? 'Y' : 'N',
                        ageFirstLicensed: ageFirstLicensed || '',
                        monthsLicensedValue: monthsLicensedBucket || '',
                        internationalYearsLicensedText: 'None',
                        occupationText: 'Not currently employed',
                        primaryVehicle
                    };
                });

            return {
                effectiveDate,
                people
            };
        }
    };

    const Progressive = {
        isOnPage() {
            const main = U.q('main[aria-labelledby="HouseholdMembers"]');
            const h1 = U.qa('h1').find(el => U.cleanText(el.textContent) === 'Household Members');
            const nextBtn = U.byId('btnNextId');
            return !!(main || (h1 && nextBtn));
        },

        getNextButton() {
            return U.byId('btnNextId');
        },

        getAddMorePeopleButton() {
            return U.q('[analytics-id="AddMorePeople 0 Quote"]');
        },

        fieldId(index, tail) {
            return `People_Drivers_List_${index}_${tail}`;
        },

        input(index, tail) {
            return U.byId(Progressive.fieldId(index, tail));
        },

        select(index, tail) {
            return U.byId(Progressive.fieldId(index, tail));
        },

        getPersonIndexes() {
            const ids = U.qa([
                'input[id^="People_Drivers_List_"][id$="_Embedded_Questions_List_FirstName"]',
                'select[id^="People_Drivers_List_"][id*="_Embedded_Questions_List_Suffix"]'
            ].join(','))
                .map(el => {
                    const m = el.id.match(/^People_Drivers_List_(\d+)_/);
                    return m ? Number(m[1]) : null;
                })
                .filter(v => v != null);

            return Array.from(new Set(ids)).sort((a, b) => a - b);
        },

        async waitForPersonIndex(index, timeout) {
            return U.waitFor(() => {
                return (
                    U.byId(`People_Drivers_List_${index}_Embedded_Questions_List_FirstName`) ||
                    U.byId(`People_Drivers_List_${index}_Embedded_Questions_List_LastName`)
                );
            }, { timeout: timeout || 5000, interval: 60 });
        },

        async ensurePersonCount(targetCount) {
            let indexes = Progressive.getPersonIndexes();
            let tries = 0;

            while (indexes.length < targetCount && tries < 12) {
                const addBtn = Progressive.getAddMorePeopleButton();
                if (!addBtn) throw new Error('ADD MORE PEOPLE button not found.');

                const nextIndex = indexes.length;
                await U.click(addBtn);

                const added = await Progressive.waitForPersonIndex(nextIndex, 7000);
                if (!added) {
                    throw new Error(`Timed out waiting for household member block ${nextIndex}.`);
                }

                indexes = Progressive.getPersonIndexes();
                tries += 1;
            }

            if (indexes.length < targetCount) {
                throw new Error(`Unable to create enough household member blocks. Have ${indexes.length}, need ${targetCount}.`);
            }

            return indexes;
        },

        async pickReadonlyDropdownByText(inputEl, wantedTexts) {
            if (!inputEl) return false;

            const wants = (Array.isArray(wantedTexts) ? wantedTexts : [wantedTexts])
                .map(v => U.cleanText(v))
                .filter(Boolean);

            if (!wants.length) return false;

            for (const opener of U.openersForReadonlyInput(inputEl)) {
                await U.click(opener);
                await U.sleep(70);

                const picked = await U.waitFor(() => {
                    const candidates = U.getVisibleOverlayOptions();
                    for (const candidate of candidates) {
                        const txt = U.cleanText(candidate.textContent);
                        if (!txt) continue;

                        for (const want of wants) {
                            if (txt === want || U.upper(txt) === U.upper(want)) {
                                return candidate;
                            }
                        }
                    }
                    return null;
                }, { timeout: 1200, interval: 40 });

                if (picked) {
                    await U.click(picked);
                    await U.sleep(80);
                    return true;
                }
            }

            return false;
        },

        async pickPrimaryVehicle(inputEl, vehicleInfo) {
            if (!inputEl || !vehicleInfo) return false;

            for (const opener of U.openersForReadonlyInput(inputEl)) {
                await U.click(opener);
                await U.sleep(70);

                const picked = await U.waitFor(() => {
                    const candidates = U.getVisibleOverlayOptions();
                    let best = null;
                    let bestScore = 0;

                    for (const candidate of candidates) {
                        const txt = U.cleanText(candidate.textContent);
                        if (!txt) continue;

                        const score = U.scoreVehicleOptionText(txt, vehicleInfo);
                        if (score > bestScore) {
                            bestScore = score;
                            best = candidate;
                        }
                    }

                    return bestScore >= 8 ? best : null;
                }, { timeout: 1400, interval: 40 });

                if (picked) {
                    await U.click(picked);
                    await U.sleep(80);
                    return true;
                }
            }

            return false;
        },

        hasStateFilingRadio(index) {
            const radios = U.qa(`input[type="radio"][name="${CSS.escape(Progressive.fieldId(index, 'Embedded_Questions_List_StateFiling'))}"]`);
            return radios.length > 0;
        },

        async setStateFiling(index, value) {
            const groupName = Progressive.fieldId(index, 'Embedded_Questions_List_StateFiling');
            const radios = U.qa(`input[type="radio"][name="${CSS.escape(groupName)}"]`);
            if (!radios.length) return false;

            const target = radios.find(r => {
                const val = U.upper(r.value);
                return val === U.upper(value) || (U.upper(value) === 'Y' && val === 'YES') || (U.upper(value) === 'N' && val === 'NO');
            });

            if (!target) return false;

            target.click();
            U.fire(target, 'change');
            await U.sleep(40);
            return true;
        },

        async fillPerson(index, person, opts) {
            const dryRun = !!(opts && opts.dryRun);
            const prefix = `[#${index}] ${person.firstName} ${person.lastName}`.trim();

            const doInput = async (idTail, value) => {
                if (value == null || value === '') return;
                const el = Progressive.input(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'INPUT', idTail, value);
                    return;
                }

                U.setInput(el, value);
                await U.sleep(10);
            };

            const doSelect = async (idTail, value, text) => {
                if ((!value && !text) || (value == null && text == null)) return;
                const el = Progressive.select(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'SELECT', idTail, value || text);
                    return;
                }

                const ok = U.setSelect(el, value, text);
                if (!ok) {
                    U.warn(prefix, 'No select option match for', idTail, value || text);
                }
                await U.sleep(15);
            };

            const doReadonlyDropdown = async (idTail, texts) => {
                const list = (Array.isArray(texts) ? texts : [texts]).map(U.cleanText).filter(Boolean);
                if (!list.length) return;

                const el = Progressive.input(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'READONLY DROPDOWN', idTail, list);
                    return;
                }

                const ok = await Progressive.pickReadonlyDropdownByText(el, list);
                if (!ok) {
                    U.warn(prefix, 'Readonly dropdown selection failed for', idTail, list);
                }
            };

            const doVehicleDropdown = async (idTail, vehicleInfo) => {
                if (!vehicleInfo) return;

                const el = Progressive.input(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'VEHICLE DROPDOWN', idTail, {
                        year: vehicleInfo.year,
                        make: vehicleInfo.make,
                        model: vehicleInfo.model,
                        vinTail: vehicleInfo.vinTail
                    });
                    return;
                }

                const ok = await Progressive.pickPrimaryVehicle(el, vehicleInfo);
                if (!ok) {
                    U.warn(prefix, 'Primary vehicle selection failed for', idTail, vehicleInfo);
                }
            };

            await doInput('Embedded_Questions_List_FirstName', person.firstName);
            await doInput('Embedded_Questions_List_MiddleInitial', person.middleInitial);
            await doInput('Embedded_Questions_List_LastName', person.lastName);
            await doSelect('Embedded_Questions_List_Suffix', person.suffix, person.suffix);
            await doSelect('Embedded_Questions_List_MaritalStatus', person.maritalStatusValue, person.maritalStatusText);

            if (person.relationshipText) {
                await doReadonlyDropdown('Embedded_Questions_List_Relationship', [person.relationshipText]);
            }

            await doInput('Embedded_Questions_List_DateOfBirth', person.dob);
            await doInput('Embedded_Questions_List_SocialSecurityNumber', person.ssn);
            await doSelect('Embedded_Questions_List_Gender', person.genderValue, person.genderText);
            await doSelect('Embedded_Questions_List_HighestLevelOfEducation', '', person.educationText);

            await doSelect('ProductSpecificInformation_List_0_Embedded_Questions_List_DriverIncluded', '', person.driverIncludedText);
            await doSelect('Embedded_Questions_List_LicenseType', '', person.licenseTypeText);
            await doSelect('Embedded_Questions_List_LicenseStatus', '', person.licenseStatusText);

            await doReadonlyDropdown('Embedded_Questions_List_LicenseState', [
                person.licenseStateText,
                person.licenseStateCode
            ]);

            await doInput('Embedded_Questions_List_LicenseNumber', person.licenseNumber);
            await doSelect('Embedded_Questions_List_DriverPreviousLicenseState', '', person.previousLicenseStateText);

            if (Progressive.hasStateFilingRadio(index)) {
                const sfOk = dryRun ? true : await Progressive.setStateFiling(index, person.stateFilingValue);
                if (dryRun) {
                    U.log(prefix, 'RADIO', 'Embedded_Questions_List_StateFiling', person.stateFilingValue);
                } else if (!sfOk) {
                    U.warn(prefix, 'State Filing radio not set:', person.stateFilingValue);
                }
            }

            await doInput('ProductSpecificInformation_List_0_Embedded_Questions_List_AgeFirstLicensed', person.ageFirstLicensed);
            await doSelect('ProductSpecificInformation_List_0_Embedded_Questions_List_DriverMonthsLicensed', person.monthsLicensedValue, person.monthsLicensedValue);
            await doSelect('ProductSpecificInformation_List_0_Embedded_Questions_List_DrvrYearsLicIntl', '', person.internationalYearsLicensedText);

            await doVehicleDropdown('ProductSpecificInformation_List_0_Embedded_Questions_List_VehicleUseMost', person.primaryVehicle);
        }
    };

    const Fill = {
        async run(opts) {
            const options = Object.assign({ dryRun: true }, opts || {});

            if (!Progressive.isOnPage()) {
                throw new Error('Not on Progressive Household Members page.');
            }

            const payload = Payload.require();
            const data = Data.normalizeHousehold(payload);

            if (!data.people.length) {
                throw new Error('No household members found in Erie payload.');
            }

            U.log('Starting fill.', {
                dryRun: options.dryRun,
                effectiveDate: data.effectiveDate,
                householdCount: data.people.length,
                names: data.people.map(p => `${p.firstName} ${p.lastName}`)
            });

            await Progressive.ensurePersonCount(data.people.length);

            for (let i = 0; i < data.people.length; i += 1) {
                await Progressive.waitForPersonIndex(i, 5000);
                await Progressive.fillPerson(i, data.people[i], options);
            }

            return {
                ok: true,
                dryRun: !!options.dryRun,
                page: APP.pageId,
                householdCount: data.people.length,
                effectiveDate: data.effectiveDate,
                people: data.people.map((p, idx) => ({
                    index: idx,
                    name: `${p.firstName} ${p.lastName}`.trim(),
                    relationship: p.relationshipText,
                    dob: p.dob,
                    driverStatus: p.driverIncludedText,
                    licenseState: p.licenseStateText,
                    ageFirstLicensed: p.ageFirstLicensed,
                    monthsLicensedValue: p.monthsLicensedValue,
                    primaryVehicle: p.primaryVehicle ? `${p.primaryVehicle.year} ${p.primaryVehicle.make} ${p.primaryVehicle.model}` : ''
                }))
            };
        },

        async goNext(opts) {
            const options = Object.assign({ dryRun: false, skipFill: false }, opts || {});

            if (!Progressive.isOnPage()) {
                throw new Error('Not on Progressive Household Members page.');
            }

            let fillResult = null;

            if (!options.skipFill) {
                fillResult = await Fill.run({ dryRun: false });
            }

            const nextBtn = Progressive.getNextButton();
            if (!nextBtn) throw new Error('Next button (#btnNextId) not found.');

            await U.click(nextBtn);

            return {
                ok: true,
                clickedNext: true,
                fillResult
            };
        }
    };

    async function testProgressiveHouseholdMembers(opts) {
        return Fill.run(Object.assign({ dryRun: true }, opts || {}));
    }

    async function goNextProgressiveHouseholdMembers(opts) {
        return Fill.goNext(Object.assign({ dryRun: false }, opts || {}));
    }

    const root = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    root.testProgressiveHouseholdMembers = testProgressiveHouseholdMembers;
    root.goNextProgressiveHouseholdMembers = goNextProgressiveHouseholdMembers;

    U.log(`Loaded v${APP.version}. Run testProgressiveHouseholdMembers({ dryRun: true|false }) or goNextProgressiveHouseholdMembers().`);
})();

// ============================================================
// PROGRESSIVE - MASTER MENU ENTRY POINTS
// ======================================
// The section scripts above expose the existing Master Menu function names:
// testProgressiveNamedInsured, testProgressiveProducts, and testProgressiveHouseholdMembers.

