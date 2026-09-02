// ==UserScript==
// @name         ERIE_TO_NATGEN_Quote_Filler
// @namespace    https://middlecreekinsurance.com/
// @version      1.0.1
// @description  Master combined NatGen filler script (Named Insured, Drivers, Vehicle Selector Probe, Coverages).
// @match        https://natgenagency.com/Quote/QuoteNamedInsured.aspx*
// @match        https://natgenagency.com/Quote/QuoteDriver.aspx*
// @match        https://natgenagency.com/Quote/QuoteAuto.aspx*
// @match        https://natgenagency.com/Quote/QuoteCoveragesV2.aspx*
// @match        https://natgenagency.com/Quote/QuoteCoverages.aspx*
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_NATGEN_MASTER_COPY_PASTE.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_NATGEN_MASTER_COPY_PASTE.user.js
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
     ERIE TO NATGEN - SHARED HELPERS
     ========================================================= */

  function getNatGenRootWindow() {
    return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  }

  function getNatGenSharedPayload() {
    const root = getNatGenRootWindow();

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
      console.error('[NatGenMaster] Failed loading shared payload via getMciSharedPayload', e);
    }

    try {
      const raw = localStorage.getItem('mciMasterPayload');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('[NatGenMaster] Failed loading mciMasterPayload from localStorage', e);
      return null;
    }
  }

  /* =========================================================
     MODULE: NAMED INSURED FILLER
     Source: ERIE_TO_NATGEN_NAMED_INSURED_FILLER_V1.js
     ========================================================= */

// ERIE_TO_NATGEN_NAMED_INSURED_FILLER_V1.js

(function () {
  'use strict';

  const TARGET_PAGE_HINT = 'QuoteNamedInsured.aspx';

  const STATE_ABBR_BY_NAME = {
    ALABAMA: 'AL',
    ALASKA: 'AK',
    ARIZONA: 'AZ',
    ARKANSAS: 'AR',
    CALIFORNIA: 'CA',
    COLORADO: 'CO',
    CONNECTICUT: 'CT',
    DELAWARE: 'DE',
    FLORIDA: 'FL',
    GEORGIA: 'GA',
    HAWAII: 'HI',
    IDAHO: 'ID',
    ILLINOIS: 'IL',
    INDIANA: 'IN',
    IOWA: 'IA',
    KANSAS: 'KS',
    KENTUCKY: 'KY',
    LOUISIANA: 'LA',
    MAINE: 'ME',
    MARYLAND: 'MD',
    MASSACHUSETTS: 'MA',
    MICHIGAN: 'MI',
    MINNESOTA: 'MN',
    MISSISSIPPI: 'MS',
    MISSOURI: 'MO',
    MONTANA: 'MT',
    NEBRASKA: 'NE',
    NEVADA: 'NV',
    'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM',
    'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC',
    'NORTH DAKOTA': 'ND',
    OHIO: 'OH',
    OKLAHOMA: 'OK',
    OREGON: 'OR',
    PENNSYLVANIA: 'PA',
    'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD',
    TENNESSEE: 'TN',
    TEXAS: 'TX',
    UTAH: 'UT',
    VERMONT: 'VT',
    VIRGINIA: 'VA',
    WASHINGTON: 'WA',
    'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI',
    WYOMING: 'WY',
    'DISTRICT OF COLUMBIA': 'DC'
  };

  function safeGet(obj, path, defaultValue) {
    if (!obj || typeof path !== 'string' || !path) return defaultValue;

    const parts = path.split('.');
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

  function cleanString(value) {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function digitsOnly(value) {
    return cleanString(value).replace(/\D/g, '');
  }

  function splitPhone(value) {
    const digits = digitsOnly(value);
    const ten = digits.length > 10 ? digits.slice(-10) : digits;

    if (!ten) return ['', '', ''];

    if (ten.length <= 3) return [ten, '', ''];
    if (ten.length <= 6) return [ten.slice(0, 3), ten.slice(3), ''];

    return [ten.slice(0, 3), ten.slice(3, 6), ten.slice(6, 10)];
  }

  function splitSSN(value) {
    const digits = digitsOnly(value);
    const nine = digits.length > 9 ? digits.slice(-9) : digits;

    if (!nine) return ['', '', ''];

    return [
      nine.slice(0, Math.min(3, nine.length)),
      nine.length > 3 ? nine.slice(3, Math.min(5, nine.length)) : '',
      nine.length > 5 ? nine.slice(5, 9) : ''
    ];
  }

  function splitZip(value) {
    const digits = digitsOnly(value);
    const nine = digits.length > 9 ? digits.slice(0, 9) : digits;

    if (!nine) return ['', ''];

    return [nine.slice(0, 5), nine.length > 5 ? nine.slice(5, 9) : ''];
  }

  function triggerInputEvents(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setInputValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, reason: 'not_found' };

    const next = cleanString(value);
    if (el.value !== next) {
      el.value = next;
    }

    triggerInputEvents(el);
    return { ok: true, selector, value: next };
  }

  function setSelectValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, reason: 'not_found' };

    const desiredRaw = cleanString(value);
    const desired = desiredRaw.toLowerCase();
    const options = Array.prototype.slice.call(el.options || []);
    let selectedOption = null;

    for (let i = 0; i < options.length; i += 1) {
      if (cleanString(options[i].value) === desiredRaw) {
        selectedOption = options[i];
        break;
      }
    }

    if (!selectedOption) {
      for (let i = 0; i < options.length; i += 1) {
        if (cleanString(options[i].value).toLowerCase() === desired) {
          selectedOption = options[i];
          break;
        }
      }
    }

    if (!selectedOption) {
      for (let i = 0; i < options.length; i += 1) {
        if (cleanString(options[i].text).toLowerCase() === desired) {
          selectedOption = options[i];
          break;
        }
      }
    }

    if (!selectedOption && (desired === 'true' || desired === 'false')) {
      const trueTokens = ['true', 'yes', 'y', '1'];
      const falseTokens = ['false', 'no', 'n', '0'];
      const tokens = desired === 'true' ? trueTokens : falseTokens;

      for (let i = 0; i < options.length; i += 1) {
        const val = cleanString(options[i].value).toLowerCase();
        const txt = cleanString(options[i].text).toLowerCase();
        if (tokens.indexOf(val) >= 0 || tokens.indexOf(txt) >= 0) {
          selectedOption = options[i];
          break;
        }
      }
    }

    if (!selectedOption) {
      return { ok: false, selector, reason: 'option_not_found', attempted: desiredRaw };
    }

    if (el.value !== selectedOption.value) {
      el.value = selectedOption.value;
    }

    triggerInputEvents(el);
    return { ok: true, selector, value: selectedOption.value };
  }

  function firstNonEmpty(values) {
    for (let i = 0; i < values.length; i += 1) {
      const v = cleanString(values[i]);
      if (v) return v;
    }
    return '';
  }

  function normalizeState(value) {
    const raw = cleanString(value);
    if (!raw) return '';

    const upper = raw.toUpperCase();
    if (upper.length === 2) return upper;

    return STATE_ABBR_BY_NAME[upper] || upper;
  }

  function normalizeSuffix(value) {
    const raw = cleanString(value);
    if (!raw) return 'NONE';

    const normalized = raw.replace(/\./g, '').toUpperCase();
    if (!normalized || normalized === 'NONE' || normalized === 'N/A' || normalized === 'NA') {
      return 'NONE';
    }

    const allowed = {
      JR: 'JR',
      SR: 'SR',
      II: 'II',
      III: 'III',
      IV: 'IV',
      V: 'V',
      VI: 'VI',
      RD: 'RD'
    };

    return allowed[normalized] || normalized;
  }

  function normalizeMove60(value) {
    const raw = cleanString(value).toLowerCase();
    if (!raw) return 'False';

    if (raw === 'true' || raw === 'yes' || raw === 'y' || raw === '1') return 'True';
    if (raw === 'false' || raw === 'no' || raw === 'n' || raw === '0') return 'False';

    return 'False';
  }

  function pickPhone(customer, namedInsured) {
    const sources = [
      { value: safeGet(customer, 'phone.mobile', ''), type: '2' },
      { value: safeGet(customer, 'phone.home', ''), type: '1' },
      { value: safeGet(customer, 'phone.work', ''), type: '3' },
      { value: safeGet(namedInsured, 'phone.mobile', ''), type: '2' },
      { value: safeGet(namedInsured, 'phone.home', ''), type: '1' },
      { value: safeGet(namedInsured, 'phone.work', ''), type: '3' }
    ];

    for (let i = 0; i < sources.length; i += 1) {
      if (digitsOnly(sources[i].value)) {
        return sources[i];
      }
    }

    return { value: '', type: '2' };
  }

  function bestSSN(customer, namedInsured) {
    return firstNonEmpty([
      safeGet(customer, 'ssn', ''),
      safeGet(customer, 'socialSecurityNumber', ''),
      safeGet(customer, 'socialSecurityNum', ''),
      safeGet(customer, 'social.securityNumber', ''),
      safeGet(namedInsured, 'ssn', ''),
      safeGet(namedInsured, 'socialSecurityNumber', ''),
      safeGet(namedInsured, 'socialSecurityNum', ''),
      safeGet(namedInsured, 'social.securityNumber', '')
    ]);
  }

  function recordFill(result, writeResult) {
    if (writeResult.ok) {
      result.filled.push(writeResult.selector);
    } else {
      result.warnings.push('Could not fill field: ' + writeResult.selector);
    }
  }

  function loadStoredPayload() {
    try {
      const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      if (root && typeof root.getMciSharedPayload === 'function') {
        const shared = root.getMciSharedPayload();
        if (shared && typeof shared === 'object') return shared;
        if (typeof shared === 'string') {
          const parsedShared = JSON.parse(shared);
          if (parsedShared && typeof parsedShared === 'object') return parsedShared;
        }
      }
    } catch (e) {
      console.error('Failed to load shared payload', e);
    }

    try {
      const raw = localStorage.getItem('mciMasterPayload');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to load stored payload', e);
      return null;
    }
  }

  function fillNatGenNamedInsuredFromErie(payload, options) {
    const result = {
      ok: true,
      errors: [],
      warnings: [],
      filled: []
    };

    if (!payload || typeof payload !== 'object') {
      result.ok = false;
      result.errors.push('Payload is missing or invalid');
      return result;
    }

    const settings = options || {};

    if (typeof window !== 'undefined' && window.location && String(window.location.pathname).indexOf(TARGET_PAGE_HINT) === -1) {
      result.warnings.push('Current page does not appear to be ' + TARGET_PAGE_HINT);
    }

    const customer = safeGet(payload, 'customer', {}) || {};
    const namedInsureds = Array.isArray(payload.namedInsureds) ? payload.namedInsureds : [];
    const primaryNamedInsured = namedInsureds[0] || {};

    const effectiveDate = firstNonEmpty([
      safeGet(payload, 'coverages.policy.effectiveDate', ''),
      safeGet(payload, 'meta.effectiveDate', '')
    ]);

    const firstName = firstNonEmpty([customer.firstName, primaryNamedInsured.firstName]);
    const middleName = firstNonEmpty([customer.middleName, primaryNamedInsured.middleName]);
    const lastName = firstNonEmpty([customer.lastName, primaryNamedInsured.lastName]);
    const suffix = normalizeSuffix(firstNonEmpty([customer.suffix, primaryNamedInsured.suffix]));

    const phonePick = pickPhone(customer, primaryNamedInsured);
    const phoneParts = splitPhone(phonePick.value);

    const email = firstNonEmpty([customer.email, primaryNamedInsured.email]);
    const dob = firstNonEmpty([customer.dob, primaryNamedInsured.dob]);

    const ssn = bestSSN(customer, primaryNamedInsured);
    const ssnParts = splitSSN(ssn);

    const mailingAddress = safeGet(customer, 'mailingAddress', {}) || safeGet(primaryNamedInsured, 'mailingAddress', {}) || {};

    const addressLine1 = firstNonEmpty([
      safeGet(mailingAddress, 'line1', ''),
      safeGet(mailingAddress, 'address1', ''),
      customer.addressLine1,
      primaryNamedInsured.addressLine1
    ]);

    const addressLine2 = firstNonEmpty([
      safeGet(mailingAddress, 'line2', ''),
      safeGet(mailingAddress, 'address2', ''),
      customer.addressLine2,
      primaryNamedInsured.addressLine2
    ]);

    const city = firstNonEmpty([
      safeGet(mailingAddress, 'city', ''),
      customer.city,
      primaryNamedInsured.city
    ]);

    const state = normalizeState(firstNonEmpty([
      safeGet(mailingAddress, 'state', ''),
      customer.state,
      primaryNamedInsured.state
    ]));

    const zipRaw = firstNonEmpty([
      safeGet(mailingAddress, 'zip', ''),
      safeGet(mailingAddress, 'postalCode', ''),
      customer.zip,
      primaryNamedInsured.zip
    ]);

    const zipParts = splitZip(zipRaw);

    const moved60Value = normalizeMove60(firstNonEmpty([
      safeGet(customer, 'movedInLast60Days', ''),
      safeGet(customer, 'recentMove60', ''),
      safeGet(customer, 'movedRecently', ''),
      safeGet(primaryNamedInsured, 'movedInLast60Days', ''),
      safeGet(payload, 'meta.movedInLast60Days', '')
    ]));

    if (!effectiveDate) result.warnings.push('Missing effective date');
    if (!firstName) result.warnings.push('Missing applicant first name');
    if (!lastName) result.warnings.push('Missing applicant last name');
    if (!dob) result.warnings.push('Missing DOB');
    if (!addressLine1) result.warnings.push('Missing mailing address');
    if (!zipParts[0]) result.warnings.push('Missing zip');

    if (settings.dryRun === true) {
      return result;
    }

    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtDateEff', effectiveDate));

    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsFirstName', firstName));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsMiddleName', middleName));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsLastName', lastName));
    recordFill(result, setSelectValue('#ctl00_MainContent_InsuredNamed1_ddlInsSuffix', suffix));

    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_ucPhonesV2_PhoneNumber1_txtPhone1', phoneParts[0]));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_ucPhonesV2_PhoneNumber1_txtPhone2', phoneParts[1]));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_ucPhonesV2_PhoneNumber1_txtPhone3', phoneParts[2]));
    recordFill(result, setSelectValue('#ctl00_MainContent_InsuredNamed1_ucPhonesV2_PhoneNumber1_ddlPhoneType', phonePick.type));

    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsEmail', email));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsDOB', dob));

    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtSocialSecurityNum1', ssnParts[0]));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtSocialSecurityNum2', ssnParts[1]));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtSocialSecurityNum3', ssnParts[2]));

    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsAdr', addressLine1));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsAdr2', addressLine2));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsCity', city));
    recordFill(result, setSelectValue('#ctl00_MainContent_InsuredNamed1_ddlInsState', state));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsZip', zipParts[0]));
    recordFill(result, setInputValue('#ctl00_MainContent_InsuredNamed1_txtInsZip2', zipParts[1]));

    recordFill(result, setSelectValue('#ctl00_MainContent_InsuredNamed1_ddlInsRecentMove60', moved60Value));

    return result;
  }

  const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  root.fillNatGenNamedInsuredFromErie = fillNatGenNamedInsuredFromErie;
  root.testNatGenNamed = function (opts) {
    const payload = loadStoredPayload();
    if (!payload) {
      alert('No stored payload found');
      return { ok: false, errors: ['No stored payload found'], warnings: [], filled: [] };
    }
    return fillNatGenNamedInsuredFromErie(payload, opts || {});
  };

  window.fillNatGenNamedInsuredFromErie = fillNatGenNamedInsuredFromErie;
})();

  /* =========================================================
     MODULE: DRIVERS FILLER
     Source: ERIE_TO_NATGEN_DRIVERS_FILLER_V1.js
     ========================================================= */

// ERIE_TO_NATGEN_DRIVERS_FILLER_V1.js

(function () {
  'use strict';

  const ADD_DRIVER_SELECTOR = '#ctl00_MainContent_InsuredDriverLabel1_btnAddDriver';
  const TARGET_PAGE_URL_PART = '/Quote/QuoteDriver.aspx';
  const PENDING_STORAGE_KEY = 'mciNatGenDriverPendingFillV1';
  const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

  const STATE_ABBR_BY_NAME = {
    ALABAMA: 'AL',
    ALASKA: 'AK',
    ARIZONA: 'AZ',
    ARKANSAS: 'AR',
    CALIFORNIA: 'CA',
    COLORADO: 'CO',
    CONNECTICUT: 'CT',
    DELAWARE: 'DE',
    FLORIDA: 'FL',
    GEORGIA: 'GA',
    HAWAII: 'HI',
    IDAHO: 'ID',
    ILLINOIS: 'IL',
    INDIANA: 'IN',
    IOWA: 'IA',
    KANSAS: 'KS',
    KENTUCKY: 'KY',
    LOUISIANA: 'LA',
    MAINE: 'ME',
    MARYLAND: 'MD',
    MASSACHUSETTS: 'MA',
    MICHIGAN: 'MI',
    MINNESOTA: 'MN',
    MISSISSIPPI: 'MS',
    MISSOURI: 'MO',
    MONTANA: 'MT',
    NEBRASKA: 'NE',
    NEVADA: 'NV',
    'NEW HAMPSHIRE': 'NH',
    'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM',
    'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC',
    'NORTH DAKOTA': 'ND',
    OHIO: 'OH',
    OKLAHOMA: 'OK',
    OREGON: 'OR',
    PENNSYLVANIA: 'PA',
    'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD',
    TENNESSEE: 'TN',
    TEXAS: 'TX',
    UTAH: 'UT',
    VERMONT: 'VT',
    VIRGINIA: 'VA',
    WASHINGTON: 'WA',
    'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI',
    WYOMING: 'WY',
    'DISTRICT OF COLUMBIA': 'DC'
  };

  function safeGet(obj, path, defaultValue) {
    if (!obj || typeof path !== 'string' || !path) return defaultValue;

    const parts = path.split('.');
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

  function cleanString(value) {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function digitsOnly(value) {
    return cleanString(value).replace(/\D/g, '');
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function triggerInputEvents(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setInputValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, reason: 'not_found' };

    const next = cleanString(value);
    if (el.value !== next) {
      el.value = next;
    }

    triggerInputEvents(el);
    return { ok: true, selector, value: next };
  }

  function setSelectValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, reason: 'not_found' };

    const raw = cleanString(value);
    if (!raw) return { ok: false, selector, reason: 'empty_value' };

    const desired = raw.toLowerCase();
    const options = Array.prototype.slice.call(el.options || []);
    let selected = null;

    for (let i = 0; i < options.length; i += 1) {
      if (cleanString(options[i].value) === raw) {
        selected = options[i];
        break;
      }
    }

    if (!selected) {
      for (let i = 0; i < options.length; i += 1) {
        if (cleanString(options[i].value).toLowerCase() === desired) {
          selected = options[i];
          break;
        }
      }
    }

    if (!selected) {
      for (let i = 0; i < options.length; i += 1) {
        if (cleanString(options[i].text).toLowerCase() === desired) {
          selected = options[i];
          break;
        }
      }
    }

    if (!selected && (desired === 'true' || desired === 'false')) {
      const trueTokens = ['true', 'yes', 'y', '1'];
      const falseTokens = ['false', 'no', 'n', '0'];
      const lookup = desired === 'true' ? trueTokens : falseTokens;

      for (let i = 0; i < options.length; i += 1) {
        const v = cleanString(options[i].value).toLowerCase();
        const t = cleanString(options[i].text).toLowerCase();
        if (lookup.indexOf(v) >= 0 || lookup.indexOf(t) >= 0) {
          selected = options[i];
          break;
        }
      }
    }

    if (!selected) {
      return { ok: false, selector, reason: 'option_not_found', attempted: raw };
    }

    if (el.value !== selected.value) {
      el.value = selected.value;
    }

    triggerInputEvents(el);
    return { ok: true, selector, value: selected.value };
  }

  function clickElement(selector) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector, reason: 'not_found' };

    el.click();
    return { ok: true, selector };
  }

  function isElementUsable(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.readOnly) return false;
    if (el.getAttribute && el.getAttribute('readonly') != null) return false;
    return true;
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style) return true;
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return true;
  }

  async function waitForElement(selector, timeoutMs) {
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : 5000;
    const start = Date.now();

    while (Date.now() - start <= timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(120);
    }

    return null;
  }

  async function waitForUsableElement(selector, timeoutMs) {
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : 5000;
    const start = Date.now();

    while (Date.now() - start <= timeout) {
      const el = document.querySelector(selector);
      if (el && isElementUsable(el)) return el;
      await sleep(100);
    }

    return null;
  }

  async function waitForPageStabilization(timeoutMs, idleMs) {
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : 30000;
    const idle = typeof idleMs === 'number' ? idleMs : 250;
    const start = Date.now();

    while (Date.now() - start <= timeout) {
      if (document.readyState === 'complete') {
        await sleep(idle);
        return true;
      }
      await sleep(120);
    }

    await sleep(idle);
    return document.readyState === 'complete';
  }

  function buildDriverSelector(index, suffix) {
    return '#ctl00_MainContent_Driver' + index + '_' + suffix;
  }

  function firstNonEmpty(values) {
    for (let i = 0; i < values.length; i += 1) {
      const v = cleanString(values[i]);
      if (v) return v;
    }
    return '';
  }

  function splitNameTokens(value) {
    const cleaned = cleanString(value);
    if (!cleaned) return [];
    return cleaned.split(/\s+/).filter(Boolean);
  }

  function fallbackFirstName(driver) {
    const direct = cleanString(driver && driver.firstName);
    if (direct) return direct;

    const fullNameTokens = splitNameTokens(driver && driver.fullName);
    if (fullNameTokens.length) return fullNameTokens[0];

    const nameTokens = splitNameTokens(driver && driver.name);
    if (nameTokens.length) return nameTokens[0];

    return '';
  }

  function fallbackLastName(driver) {
    const direct = cleanString(driver && driver.lastName);
    if (direct) return direct;

    const fullNameTokens = splitNameTokens(driver && driver.fullName);
    if (fullNameTokens.length) return fullNameTokens[fullNameTokens.length - 1];

    const nameTokens = splitNameTokens(driver && driver.name);
    if (nameTokens.length) return nameTokens[nameTokens.length - 1];

    return '';
  }

  function normalizeState(value) {
    const raw = cleanString(value);
    if (!raw) return '';

    const upper = raw.toUpperCase();
    if (upper.length === 2) return upper;

    return STATE_ABBR_BY_NAME[upper] || '';
  }

  function normalizeSuffix(value) {
    const raw = cleanString(value);
    if (!raw) return '';

    const upper = raw.replace(/\./g, '').toUpperCase();
    const allowed = {
      JR: 'JR',
      SR: 'SR',
      II: 'II',
      III: 'III',
      IV: 'IV',
      V: 'V',
      VI: 'VI',
      RD: 'RD'
    };

    return allowed[upper] || upper;
  }

  function normalizeGender(value) {
    const raw = cleanString(value).toLowerCase();
    if (!raw) return '';

    if (raw === 'm' || raw === 'male') return 'M';
    if (raw === 'f' || raw === 'female') return 'F';
    return '';
  }

  function normalizeMaritalStatus(value) {
    const raw = cleanString(value).toLowerCase();
    if (!raw) return '';

    const map = {
      married: 'M',
      single: 'S',
      divorced: 'D',
      separated: 'P',
      widowed: 'W',
      'married but living separate households': 'H',
      'married living separate households': 'H'
    };

    return map[raw] || '';
  }

  function normalizeRelationship(value) {
    const raw = cleanString(value).toLowerCase();
    if (!raw) return 'Other';

    if (raw === 'named insured' || raw === 'insured' || raw === 'self' || raw === 'namedins') return 'Named Insured';
    if (raw === 'spouse' || raw === 'wife' || raw === 'husband') return 'Named Insured';
    if (raw === 'child' || raw === 'son' || raw === 'daughter') return 'Child';
    if (raw === 'parent' || raw === 'father' || raw === 'mother') return 'Parent';

    return 'Other';
  }

  function parseDate(value) {
    const raw = cleanString(value);
    if (!raw) return null;

    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;

    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return null;

    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += year >= 70 ? 1900 : 2000;

    const parsed = new Date(year, month - 1, day);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed;
  }

  function calcYearsSince(date) {
    if (!date) return '';

    const now = new Date();
    if (date > now) return '0';

    let years = now.getFullYear() - date.getFullYear();
    const nowMonth = now.getMonth();
    const nowDay = now.getDate();
    const dtMonth = date.getMonth();
    const dtDay = date.getDate();

    if (nowMonth < dtMonth || (nowMonth === dtMonth && nowDay < dtDay)) {
      years -= 1;
    }

    return String(Math.max(0, years));
  }

  function getUsDrivingExperience(driver) {
    const firstLicensedDate = firstNonEmpty([
      safeGet(driver, 'license.dateFirstLicensed', ''),
      safeGet(driver, 'license.firstLicensedDate', ''),
      driver.dateFirstLicensed,
      driver.firstLicensedDate
    ]);

    const parsed = parseDate(firstLicensedDate);
    const years = calcYearsSince(parsed);
    if (years !== '') return years;

    return firstNonEmpty([
      driver.usDrivingExperience,
      driver.usDriverExp,
      driver.yearsLicensedUS,
      driver.yearsDrivingUS
    ]);
  }

  function getInternationalDrivingExperience(driver) {
    const existing = firstNonEmpty([
      driver.internationalDrivingExperience,
      driver.internationalDriverExp,
      driver.yearsDrivingInternational
    ]);

    return existing || '0';
  }

  function getDriverStatusCandidates(driver) {
    if (driver && driver.isExcluded === true) {
      return ['Does Not Drive', 'Excluded', 'Excluded Driver', 'Not Rated', 'Rated Driver'];
    }

    const explicit = firstNonEmpty([
      driver && driver.driverStatus,
      driver && driver.status
    ]);

    if (explicit) return [explicit, 'Rated Driver'];
    return ['Rated Driver'];
  }

  function recordFill(result, writeResult) {
    if (writeResult && writeResult.ok) {
      result.filled.push(writeResult.selector);
    }
  }

  function warnOnFailedWrite(result, writeResult, label) {
    if (!writeResult || writeResult.ok) return;
    result.warnings.push(label + ' field not filled: ' + writeResult.selector);
  }

  async function waitAndFillInput(result, selector, value, timeoutMs, label) {
    const next = cleanString(value);
    if (!next) return { ok: false, selector, reason: 'empty_value', skipped: true };

    const ready = await waitForUsableElement(selector, timeoutMs);
    if (!ready) {
      result.warnings.push((label || 'Input') + ' field not ready: ' + selector);
      return { ok: false, selector, reason: 'not_ready' };
    }

    const writeResult = setInputValue(selector, next);
    recordFill(result, writeResult);
    warnOnFailedWrite(result, writeResult, label || 'Input');
    return writeResult;
  }

  async function waitAndFillSelect(result, selector, value, timeoutMs, label) {
    const next = cleanString(value);
    if (!next) return { ok: false, selector, reason: 'empty_value', skipped: true };

    const ready = await waitForUsableElement(selector, timeoutMs);
    if (!ready) {
      result.warnings.push((label || 'Select') + ' field not ready: ' + selector);
      return { ok: false, selector, reason: 'not_ready' };
    }

    const writeResult = setSelectValue(selector, next);
    recordFill(result, writeResult);
    warnOnFailedWrite(result, writeResult, label || 'Select');
    return writeResult;
  }

  async function waitAndFillDriverStatus(result, selector, candidates, timeoutMs) {
    const ready = await waitForUsableElement(selector, timeoutMs);
    if (!ready) {
      result.warnings.push('Driver status field not ready: ' + selector);
      return { ok: false, selector, reason: 'not_ready' };
    }

    let finalResult = null;
    for (let i = 0; i < candidates.length; i += 1) {
      finalResult = setSelectValue(selector, candidates[i]);
      if (finalResult && finalResult.ok) {
        recordFill(result, finalResult);
        return finalResult;
      }
    }

    warnOnFailedWrite(result, finalResult, 'Driver status');
    return finalResult || { ok: false, selector, reason: 'option_not_found' };
  }

  async function waitForDriverBlockReady(index, result, options) {
    const requiredSelectors = [
      buildDriverSelector(index, 'txtFirstName'),
      buildDriverSelector(index, 'txtLastName'),
      buildDriverSelector(index, 'txtDateOfBirth'),
      buildDriverSelector(index, 'ddlSex'),
      buildDriverSelector(index, 'ddlMaritalStatus')
    ];

    for (let i = 0; i < requiredSelectors.length; i += 1) {
      const ready = await waitForUsableElement(requiredSelectors[i], options.driverFieldReadyTimeoutMs);
      if (!ready) {
        result.warnings.push('Driver block field not ready: ' + requiredSelectors[i]);
        return false;
      }
    }

    return true;
  }

  function getExistingDriverIndexes() {
    const els = Array.prototype.slice.call(
      document.querySelectorAll('[id^="ctl00_MainContent_Driver"][id$="_txtFirstName"]')
    );
    const indexSet = new Set();

    for (let i = 0; i < els.length; i += 1) {
      const el = els[i];
      if (!el || !isElementVisible(el)) continue;
      const id = cleanString(el.id || '');
      const m = id.match(/Driver(\d+)_txtFirstName$/i);
      if (!m) continue;
      indexSet.add(parseInt(m[1], 10));
    }

    return Array.from(indexSet).sort(function (a, b) { return a - b; });
  }

  function countExistingDriverBlocks() {
    return getExistingDriverIndexes().length;
  }

  async function waitForDriverBlockExists(index, timeoutMs) {
    const selector = buildDriverSelector(index, 'txtFirstName');
    return waitForElement(selector, timeoutMs);
  }

  function tryGetQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      return cleanString(url.searchParams.get(name));
    } catch (e) {
      return '';
    }
  }

  function getCurrentQuoteKey() {
    const queryKeys = [
      'quoteId', 'QuoteId', 'QuoteID',
      'quoteNumber', 'QuoteNumber', 'QuoteNo',
      'qid', 'QID'
    ];

    const queryValues = queryKeys.map(function (k) {
      return tryGetQueryParam(k);
    });

    const domCandidates = [
      '#ctl00_MainContent_hdnQuoteId',
      '#ctl00_MainContent_hdnQuoteNumber',
      '#ctl00_MainContent_lblQuoteNumber',
      'input[name*="QuoteId"]',
      'input[id*="QuoteId"]',
      'input[name*="QuoteNumber"]',
      'input[id*="QuoteNumber"]'
    ];

    const domValues = domCandidates.map(function (selector) {
      const el = document.querySelector(selector);
      if (!el) return '';
      return cleanString(el.value || el.textContent || el.innerText || '');
    });

    const explicit = firstNonEmpty(queryValues.concat(domValues));
    if (explicit) return explicit;

    return cleanString(window.location.pathname + '|' + window.location.search);
  }

  function readPendingNatGenDriverFill() {
    try {
      const raw = localStorage.getItem(PENDING_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writePendingNatGenDriverFill(state) {
    try {
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearPendingNatGenDriverFill() {
    try {
      localStorage.removeItem(PENDING_STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function isPendingExpired(pending) {
    if (!pending || !pending.expiresAt) return true;
    return Date.now() > Number(pending.expiresAt);
  }

  async function waitForResumeCheckpoint(pending, runtime, result) {
    await waitForPageStabilization(runtime.reloadReadyTimeoutMs, runtime.reloadIdleMs);

    const expectedIndex = Number(pending && pending.expectedNextIndex || 0);
    if (expectedIndex <= 0) return true;

    const start = Date.now();
    while (Date.now() - start <= runtime.addDriverTimeoutMs) {
      const count = countExistingDriverBlocks();
      const firstNameEl = document.querySelector(buildDriverSelector(expectedIndex, 'txtFirstName'));
      if (count >= expectedIndex && firstNameEl) {
        return true;
      }
      await sleep(150);
    }

    result.warnings.push('Resume wait timed out for driver block ' + expectedIndex);
    return false;
  }

  async function reinforceLateTextFields(index, driver, result, runtime) {
    const firstName = fallbackFirstName(driver);
    const middleName = cleanString(driver && driver.middleName);
    const lastName = fallbackLastName(driver);
    const licenseNumber = firstNonEmpty([
      safeGet(driver, 'license.number', ''),
      driver && driver.licenseNumber,
      driver && driver.dlNumber
    ]);

    if (runtime.postLateTextSettleDelayMs > 0) {
      await sleep(runtime.postLateTextSettleDelayMs);
    }

    await waitAndFillInput(result, buildDriverSelector(index, 'txtFirstName'), firstName, runtime.fieldFillTimeoutMs, 'First name');
    await waitAndFillInput(result, buildDriverSelector(index, 'txtMiddleName'), middleName, runtime.fieldFillTimeoutMs, 'Middle name');
    await waitAndFillInput(result, buildDriverSelector(index, 'txtLastName'), lastName, runtime.fieldFillTimeoutMs, 'Last name');
    if (licenseNumber) {
      await waitAndFillInput(result, buildDriverSelector(index, 'txtDLNumber'), digitsOnly(licenseNumber), runtime.fieldFillTimeoutMs, 'License number');
    }

    if (runtime.postLateTextSettleDelayMs > 0) {
      await sleep(runtime.postLateTextSettleDelayMs);
    }

    await waitAndFillInput(result, buildDriverSelector(index, 'txtFirstName'), firstName, runtime.fieldFillTimeoutMs, 'First name reinforce');
    await waitAndFillInput(result, buildDriverSelector(index, 'txtLastName'), lastName, runtime.fieldFillTimeoutMs, 'Last name reinforce');

    if (index === 2) {
      if (runtime.driver2FirstNameExtraDelayMs > 0) {
        await sleep(runtime.driver2FirstNameExtraDelayMs);
      }
      await waitAndFillInput(result, '#ctl00_MainContent_Driver2_txtFirstName', firstName, runtime.fieldFillTimeoutMs, 'Driver 2 first name reinforce');
    }
  }

  function loadStoredPayload() {
    try {
      const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      if (root && typeof root.getMciSharedPayload === 'function') {
        const shared = root.getMciSharedPayload();
        if (shared && typeof shared === 'object') return shared;
        if (typeof shared === 'string') {
          const parsedShared = JSON.parse(shared);
          if (parsedShared && typeof parsedShared === 'object') return parsedShared;
        }
      }
    } catch (e) {
      console.error('Failed to load shared payload', e);
    }

    try {
      const raw = localStorage.getItem('mciMasterPayload');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to load stored payload', e);
      return null;
    }
  }

  async function ensureDriverBlocksExist(targetCount, quoteKey, result, runtime, canPersistPending) {
    const needed = Math.max(0, targetCount);
    if (!needed) return { done: true, reloadTriggered: false };

    let existingCount = countExistingDriverBlocks();
    if (existingCount < 1) {
      result.warnings.push('Driver 1 block not detected on page');
    }

    if (existingCount >= needed) {
      return { done: true, reloadTriggered: false };
    }

    const nextIndex = existingCount + 1;
    if (canPersistPending) {
      writePendingNatGenDriverFill({
        version: 1,
        startedByTest: true,
        quoteKey: quoteKey,
        phase: 'ensure',
        targetCount: needed,
        expectedNextIndex: nextIndex,
        createdAt: Date.now(),
        expiresAt: Date.now() + PENDING_MAX_AGE_MS
      });
    }

    const clickResult = clickElement(ADD_DRIVER_SELECTOR);
    if (!clickResult.ok) {
      result.warnings.push('Could not click Add Driver for driver ' + nextIndex);
      clearPendingNatGenDriverFill();
      return { done: false, reloadTriggered: false };
    }

    result.warnings.push('Add Driver clicked for driver ' + nextIndex + '. Waiting for page reload to resume.');
    return { done: false, reloadTriggered: true };
  }

  async function fillNatGenDriversFromErie(payload, options) {
    const result = {
      ok: true,
      errors: [],
      warnings: [],
      filled: []
    };

    if (!payload || typeof payload !== 'object') {
      result.ok = false;
      result.errors.push('Payload is missing or invalid');
      return result;
    }

    const settings = options || {};
    const runtime = {
      enableResume: settings.enableResume === true,
      startedByTest: settings.startedByTest === true,
      resumeState: settings.resumeState || null,
      addDriverTimeoutMs: typeof settings.addDriverTimeoutMs === 'number' ? settings.addDriverTimeoutMs : 45000,
      reloadReadyTimeoutMs: typeof settings.reloadReadyTimeoutMs === 'number' ? settings.reloadReadyTimeoutMs : 45000,
      reloadIdleMs: typeof settings.reloadIdleMs === 'number' ? settings.reloadIdleMs : 300,
      driverFieldReadyTimeoutMs: typeof settings.driverFieldReadyTimeoutMs === 'number' ? settings.driverFieldReadyTimeoutMs : 3000,
      fieldFillTimeoutMs: typeof settings.fieldFillTimeoutMs === 'number' ? settings.fieldFillTimeoutMs : 2500,
      postCriticalWriteDelayMs: typeof settings.postCriticalWriteDelayMs === 'number' ? settings.postCriticalWriteDelayMs : 40,
      postSelectSettleDelayMs: typeof settings.postSelectSettleDelayMs === 'number' ? settings.postSelectSettleDelayMs : 80,
      postLateTextSettleDelayMs: typeof settings.postLateTextSettleDelayMs === 'number' ? settings.postLateTextSettleDelayMs : 80,
      driver2FirstNameExtraDelayMs: typeof settings.driver2FirstNameExtraDelayMs === 'number' ? settings.driver2FirstNameExtraDelayMs : 60,
      interDriverDelayMs: typeof settings.interDriverDelayMs === 'number' ? settings.interDriverDelayMs : 20,
      dryRun: settings.dryRun === true
    };

    if (typeof window !== 'undefined' && window.location) {
      const href = String(window.location.href || '');
      if (href.indexOf(TARGET_PAGE_URL_PART) === -1) {
        result.warnings.push('Current page does not appear to be QuoteDriver.aspx');
      }
    }

    const drivers = Array.isArray(payload.drivers) ? payload.drivers : [];

    if (!drivers.length) {
      result.warnings.push('No drivers in payload');
      return result;
    }

    const quoteKey = getCurrentQuoteKey();

    if (runtime.resumeState) {
      const resumeOk = await waitForResumeCheckpoint(runtime.resumeState, runtime, result);
      if (!resumeOk) {
        return result;
      }
    }

    if (runtime.dryRun) {
      return result;
    }

    const phase1 = await ensureDriverBlocksExist(
      drivers.length,
      quoteKey,
      result,
      runtime,
      runtime.enableResume && runtime.startedByTest
    );

    if (phase1.reloadTriggered) {
      return result;
    }

    if (runtime.enableResume && runtime.startedByTest) {
      clearPendingNatGenDriverFill();
    }

    for (let i = 0; i < drivers.length; i += 1) {
      const idx = i + 1;
      const driver = drivers[i] || {};

      const exists = await waitForDriverBlockExists(idx, runtime.addDriverTimeoutMs);
      if (!exists) {
        result.warnings.push('Driver block not found for driver ' + idx + ' during fill phase');
        continue;
      }

      const okBlock = await waitForDriverBlockReady(idx, result, runtime);
      if (!okBlock) {
        continue;
      }

      const firstName = fallbackFirstName(driver);
      const suffix = normalizeSuffix(driver.suffix);
      const dob = firstNonEmpty([driver.dob, driver.dateOfBirth]);
      const gender = normalizeGender(firstNonEmpty([driver.gender, driver.sex]));
      const maritalStatus = normalizeMaritalStatus(driver.maritalStatus);
      const relationship = normalizeRelationship(firstNonEmpty([driver.relationshipToNamedInsured, driver.relationship]));
      const driverStatusCandidates = getDriverStatusCandidates(driver);

      const licenseNumber = firstNonEmpty([
        safeGet(driver, 'license.number', ''),
        driver.licenseNumber,
        driver.dlNumber
      ]);

      const licenseState = normalizeState(firstNonEmpty([
        safeGet(driver, 'license.state', ''),
        driver.licenseState,
        driver.dlState
      ]));

      const dlStatus = licenseNumber ? 'Valid' : '';
      const usDriverExp = getUsDrivingExperience(driver);
      const intlExp = getInternationalDrivingExperience(driver);

      if (!firstName || !fallbackLastName(driver)) {
        result.warnings.push('Driver ' + idx + ' is missing first or last name');
      }

      if (!dob) {
        result.warnings.push('Driver ' + idx + ' is missing DOB');
      }

      if (!licenseNumber) {
        result.warnings.push('Driver ' + idx + ' is missing license number');
      }

      if (dob) {
        await waitAndFillInput(result, buildDriverSelector(idx, 'txtDateOfBirth'), dob, runtime.fieldFillTimeoutMs, 'DOB');
        if (runtime.postCriticalWriteDelayMs > 0) await sleep(runtime.postCriticalWriteDelayMs);
      }

      if (gender) {
        await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlSex'), gender, runtime.fieldFillTimeoutMs, 'Gender');
        if (runtime.postCriticalWriteDelayMs > 0) await sleep(runtime.postCriticalWriteDelayMs);
      }

      if (maritalStatus) {
        await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlMaritalStatus'), maritalStatus, runtime.fieldFillTimeoutMs, 'Marital status');
        if (runtime.postCriticalWriteDelayMs > 0) await sleep(runtime.postCriticalWriteDelayMs);
      }

      await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlRelationship'), relationship, runtime.fieldFillTimeoutMs, 'Relationship');
      if (runtime.postCriticalWriteDelayMs > 0) await sleep(runtime.postCriticalWriteDelayMs);

      await waitAndFillDriverStatus(result, buildDriverSelector(idx, 'ddlDriverStatus'), driverStatusCandidates, runtime.fieldFillTimeoutMs);
      if (runtime.postCriticalWriteDelayMs > 0) await sleep(runtime.postCriticalWriteDelayMs);

      if (dlStatus) {
        await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlDLStatus'), dlStatus, runtime.fieldFillTimeoutMs, 'DL status');
      }

      if (licenseState) {
        await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlLicenseState'), licenseState, runtime.fieldFillTimeoutMs, 'License state');
      }

      if (suffix) {
        await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlSuffix'), suffix, runtime.fieldFillTimeoutMs, 'Suffix');
      }

      await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlDL123'), 'False', runtime.fieldFillTimeoutMs, 'SR-22 DL123');
      await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlStudentMilitary'), 'False', runtime.fieldFillTimeoutMs, 'Student military');
      await waitAndFillSelect(result, buildDriverSelector(idx, 'ddlDynamicDrive'), 'False', runtime.fieldFillTimeoutMs, 'Dynamic drive');

      if (runtime.postSelectSettleDelayMs > 0) {
        await sleep(runtime.postSelectSettleDelayMs);
      }

      await reinforceLateTextFields(idx, driver, result, runtime);

      if (usDriverExp) {
        await waitAndFillInput(result, buildDriverSelector(idx, 'txtUSDriverExp'), usDriverExp, runtime.fieldFillTimeoutMs, 'US driver experience');
      }

      await waitAndFillInput(result, buildDriverSelector(idx, 'txtInternationalExp'), intlExp || '0', runtime.fieldFillTimeoutMs, 'International experience');

      if (runtime.interDriverDelayMs > 0) {
        await sleep(runtime.interDriverDelayMs);
      }
    }

    if (runtime.enableResume && runtime.startedByTest) {
      clearPendingNatGenDriverFill();
    }

    return result;
  }

  async function resumePendingNatGenDriverFillIfNeeded() {
    const pending = readPendingNatGenDriverFill();
    if (!pending) return;

    if (pending.startedByTest !== true) {
      clearPendingNatGenDriverFill();
      return;
    }

    if (isPendingExpired(pending)) {
      clearPendingNatGenDriverFill();
      return;
    }

    const currentQuoteKey = getCurrentQuoteKey();
    const pendingQuoteKey = cleanString(pending.quoteKey);
    if (pendingQuoteKey && currentQuoteKey && pendingQuoteKey !== currentQuoteKey) {
      clearPendingNatGenDriverFill();
      return;
    }

    const payload = loadStoredPayload();
    if (!payload) {
      clearPendingNatGenDriverFill();
      return;
    }

    await fillNatGenDriversFromErie(payload, {
      enableResume: true,
      startedByTest: true,
      resumeState: pending
    });
  }

  const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  root.fillNatGenDriversFromErie = fillNatGenDriversFromErie;
  root.clearPendingNatGenDriverFill = clearPendingNatGenDriverFill;

  root.testNatGenDrivers = async function (opts) {
    const payload = loadStoredPayload();
    if (!payload) {
      alert('No stored payload found');
      return { ok: false, errors: ['No stored payload found'], warnings: [], filled: [] };
    }

    clearPendingNatGenDriverFill();

    const nextOpts = Object.assign({}, opts || {}, {
      enableResume: true,
      startedByTest: true
    });

    return fillNatGenDriversFromErie(payload, nextOpts);
  };

  window.fillNatGenDriversFromErie = fillNatGenDriversFromErie;
  window.clearPendingNatGenDriverFill = clearPendingNatGenDriverFill;

  setTimeout(function () {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      String(window.location.href || '').indexOf(TARGET_PAGE_URL_PART) === -1
    ) {
      return;
    }
    resumePendingNatGenDriverFillIfNeeded().catch(function () {
      clearPendingNatGenDriverFill();
    });
  }, 0);
})();

  /* =========================================================
     MODULE: VEHICLE SELECTOR PROBE
     Source: ERIE_TO_NATGEN_VEHICLE_SELECTOR_PROBE_V1.js
     ========================================================= */

// ERIE_TO_NATGEN_VEHICLE_SELECTOR_PROBE_V1.js
//
// Purpose:
// - Inspect NatGen Vehicle page DOM
// - Identify reliable Add Vehicle and per-vehicle field selectors
// - Output selector templates like #ctl00_MainContent_AutoControl{n}_txtVIN

(function () {
  'use strict';

  const TARGET_PAGE_HINT = 'QuoteAuto.aspx';
  const PENDING_STORAGE_KEY = 'mciNatGenVehiclePendingFillV1';
  const PENDING_MAX_AGE_MS = 60 * 60 * 1000;
  const VIN_EXCLUDED_TOKENS = ['hdn', 'hidden', 'product', 'hdnproduct'];
  const VIN_LOOKUP_POSITIVE_TOKENS = [
    'vin',
    'verifyvin',
    'verify vin',
    'validate vin',
    'btnverifyvin',
    'vinbutton',
    'lookup',
    'search',
    'decode',
    'magnify',
    'magnifier',
    'zoom',
    'loupe',
    'glass',
    '__dopostback'
  ];
  const VIN_LOOKUP_NEGATIVE_TOKENS = [
    'delete',
    'remove',
    'trash',
    'clear',
    'cancel',
    'reset',
    'close'
  ];

  const FIELD_DEFS = {
    vin: {
      label: 'VIN',
      tokens: ['vin', 'vehicle identification', 'vehicle id number', 'vehicleidentification']
    },
    vehicleType: {
      label: 'Vehicle Type',
      tokens: ['vehicle type', 'type', 'body type']
    },
    year: {
      label: 'Year',
      tokens: ['year', 'model year', 'modelyear']
    },
    make: {
      label: 'Make',
      tokens: ['make']
    },
    model: {
      label: 'Model',
      tokens: ['model']
    },
    style: {
      label: 'Style',
      tokens: ['style', 'body style', 'body']
    },
    primaryUse: {
      label: 'Primary Use',
      tokens: ['primary use', 'vehicle use', 'use']
    }
  };

  function cleanString(value) {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function safeGet(obj, path, defaultValue) {
    if (!obj || typeof path !== 'string' || !path) return defaultValue;

    const parts = path.split('.');
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

  function lower(value) {
    return cleanString(value).toLowerCase();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  function getLabelText(el) {
    if (!el) return '';

    if (el.labels && el.labels.length) {
      for (let i = 0; i < el.labels.length; i += 1) {
        const txt = cleanString(el.labels[i].textContent || '');
        if (txt) return txt;
      }
    }

    if (el.id) {
      const byFor = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (byFor) {
        const txt = cleanString(byFor.textContent || '');
        if (txt) return txt;
      }
    }

    const td = el.closest('td');
    if (td && td.previousElementSibling) {
      const prev = cleanString(td.previousElementSibling.textContent || '');
      if (prev) return prev;
    }

    const row = el.closest('tr');
    if (row) {
      const rowLabel = row.querySelector('th, label, td');
      if (rowLabel) {
        const txt = cleanString(rowLabel.textContent || '');
        if (txt) return txt;
      }
    }

    return '';
  }

  function extractVehicleIndex(el) {
    if (!el) return null;

    const sources = [
      cleanString(el.id),
      cleanString(el.name)
    ].filter(Boolean);

    const patterns = [
      /AutoControl(\d+)/i,
      /(?:^|_)Auto(\d+)(?:_|$)/i
    ];

    for (let i = 0; i < sources.length; i += 1) {
      const src = sources[i];
      for (let p = 0; p < patterns.length; p += 1) {
        const m = src.match(patterns[p]);
        if (m) return parseInt(m[1], 10);
      }
    }

    return null;
  }

  function makeSelectorForElement(el) {
    if (!el) return '';
    if (el.id) return '#' + cssEscape(el.id);
    if (el.name) return '[name="' + el.name.replace(/"/g, '\\"') + '"]';
    return '';
  }

  function findAddVehicleButton() {
    const candidates = Array.from(
      document.querySelectorAll('button, input[type="button"], input[type="submit"], a')
    );

    let best = null;
    let bestScore = -1;

    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      const raw = [
        cleanString(el.id),
        cleanString(el.name),
        cleanString(el.value),
        cleanString(el.title),
        cleanString(el.textContent)
      ].join(' ').toLowerCase();

      if (!raw) continue;
      let score = 0;
      if (raw.indexOf('addauto') >= 0) score += 130;
      if (raw.indexOf('add auto') >= 0) score += 120;
      if (raw.indexOf('btnaddauto') >= 0) score += 110;
      if (raw.indexOf('addvehicle') >= 0) score += 60;
      if (raw.indexOf('add vehicle') >= 0) score += 50;
      if (raw.indexOf('btnaddvehicle') >= 0) score += 40;
      if (raw.indexOf('vehicle') >= 0) score += 25;
      if (raw.indexOf('auto') >= 0) score += 30;
      if (raw.indexOf('add') >= 0) score += 20;
      if (el.id && /btnAddVehicle/i.test(el.id)) score += 80;
      if (el.id && /btnAddAuto/i.test(el.id)) score += 120;

      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    const fallbackSelectors = [
      '#ctl00_MainContent_InsuredAutoLabel1_btnAddAuto',
      '[id*="btnAddAuto"]',
      '[name*="btnAddAuto"]',
      '[id*="AddAuto"]',
      '[name*="AddAuto"]'
    ];

    return {
      bestSelector: makeSelectorForElement(best),
      bestId: best ? cleanString(best.id) : '',
      fallbackSelectors: fallbackSelectors
    };
  }

  function classifyField(el) {
    const id = lower(el && el.id);
    const name = lower(el && el.name);
    const placeholder = lower(el && el.placeholder);
    const label = lower(getLabelText(el));
    const text = [id, name, placeholder, label].join(' ');

    const roleKeys = Object.keys(FIELD_DEFS);
    for (let i = 0; i < roleKeys.length; i += 1) {
      const role = roleKeys[i];
      const tokens = FIELD_DEFS[role].tokens;
      for (let t = 0; t < tokens.length; t += 1) {
        if (text.indexOf(tokens[t]) >= 0) return role;
      }
    }

    return '';
  }

  function guessTemplateFromId(id, index) {
    const raw = cleanString(id);
    if (!raw || !index) return '';

    const patterns = [
      new RegExp('^(.*?AutoControl)' + index + '(_.*)$', 'i'),
      new RegExp('^(.*?Auto)' + index + '(_.*)$', 'i')
    ];

    for (let i = 0; i < patterns.length; i += 1) {
      const m = raw.match(patterns[i]);
      if (m) {
        return '#' + m[1] + '{n}' + m[2];
      }
    }

    return '';
  }

  function collectVehicleFieldCandidates() {
    const nodes = Array.from(document.querySelectorAll('input, select, textarea'));
    const hitsByRole = {
      vin: [],
      vehicleType: [],
      year: [],
      make: [],
      model: [],
      style: [],
      primaryUse: []
    };

    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      const role = classifyField(el);
      if (!role) continue;

      const index = extractVehicleIndex(el);
      if (!index) continue;

      hitsByRole[role].push({
        index: index,
        selector: makeSelectorForElement(el),
        id: cleanString(el.id),
        name: cleanString(el.name),
        label: cleanString(getLabelText(el))
      });
    }

    Object.keys(hitsByRole).forEach(function (role) {
      hitsByRole[role].sort(function (a, b) {
        return a.index - b.index;
      });
    });

    return hitsByRole;
  }

  function buildSelectorReport() {
    const addVehicle = findAddVehicleButton();
    const hitsByRole = collectVehicleFieldCandidates();

    const allIndexes = [];
    Object.keys(hitsByRole).forEach(function (role) {
      for (let i = 0; i < hitsByRole[role].length; i += 1) {
        const idx = hitsByRole[role][i].index;
        if (allIndexes.indexOf(idx) === -1) allIndexes.push(idx);
      }
    });
    allIndexes.sort(function (a, b) { return a - b; });

    const templates = {};
    const firstColumnSelectors = {};
    const secondColumnSelectors = {};

    Object.keys(FIELD_DEFS).forEach(function (role) {
      const list = hitsByRole[role];
      const first = list[0] || null;
      const second = list[1] || null;

      templates[role] = first ? guessTemplateFromId(first.id, first.index) : '';
      firstColumnSelectors[role] = first ? first.selector : '';
      secondColumnSelectors[role] = second ? second.selector : '';
    });

    const report = {
      page: {
        href: String(window.location.href || ''),
        pathname: String(window.location.pathname || ''),
        looksLikeVehiclePage: String(window.location.pathname || '').indexOf(TARGET_PAGE_HINT) >= 0
      },
      addVehicle: addVehicle,
      vehicleIndexesDetected: allIndexes,
      templates: templates,
      firstColumnSelectors: firstColumnSelectors,
      secondColumnSelectors: secondColumnSelectors,
      rawCandidatesByRole: hitsByRole
    };

    return report;
  }

  function probeNatGenVehicleSelectors() {
    const report = buildSelectorReport();
    console.group('NatGen Vehicle Selector Probe');
    console.log(report);
    console.table(report.templates);
    console.table(report.firstColumnSelectors);
    console.table(report.secondColumnSelectors);
    console.groupEnd();
    return report;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function triggerInputEvents(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setInputValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector: selector, reason: 'not_found' };
    if (el.disabled) return { ok: false, selector: selector, reason: 'disabled' };

    const next = cleanString(value);
    if (!next) return { ok: false, selector: selector, reason: 'empty_value' };

    if (el.value !== next) {
      el.value = next;
    }
    triggerInputEvents(el);
    return { ok: true, selector: selector, value: next };
  }

  function setSelectValue(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector: selector, reason: 'not_found' };
    if (el.disabled) return { ok: false, selector: selector, reason: 'disabled' };
    if (!el.tagName || el.tagName.toUpperCase() !== 'SELECT') {
      return { ok: false, selector: selector, reason: 'not_select' };
    }

    const desiredRaw = cleanString(value);
    if (!desiredRaw) return { ok: false, selector: selector, reason: 'empty_value' };

    const desired = desiredRaw.toLowerCase();
    const options = Array.prototype.slice.call(el.options || []);
    let selected = null;

    for (let i = 0; i < options.length; i += 1) {
      if (cleanString(options[i].value) === desiredRaw) {
        selected = options[i];
        break;
      }
    }

    if (!selected) {
      for (let i = 0; i < options.length; i += 1) {
        if (cleanString(options[i].value).toLowerCase() === desired) {
          selected = options[i];
          break;
        }
      }
    }

    if (!selected) {
      for (let i = 0; i < options.length; i += 1) {
        if (cleanString(options[i].text).toLowerCase() === desired) {
          selected = options[i];
          break;
        }
      }
    }

    if (!selected) {
      for (let i = 0; i < options.length; i += 1) {
        const txt = cleanString(options[i].text).toLowerCase();
        const val = cleanString(options[i].value).toLowerCase();
        if (txt.indexOf(desired) >= 0 || val.indexOf(desired) >= 0) {
          selected = options[i];
          break;
        }
      }
    }

    if (!selected && (desired.indexOf('pleasure') >= 0 || desired.indexOf('1a') >= 0)) {
      for (let i = 0; i < options.length; i += 1) {
        const txt = cleanString(options[i].text).toLowerCase();
        const val = cleanString(options[i].value).toLowerCase();
        if ((txt.indexOf('pleasure') >= 0 || val.indexOf('pleasure') >= 0) && (txt.indexOf('1a') >= 0 || val.indexOf('1a') >= 0)) {
          selected = options[i];
          break;
        }
      }
    }

    if (!selected) {
      return { ok: false, selector: selector, reason: 'option_not_found', attempted: desiredRaw };
    }

    if (el.value !== selected.value) {
      el.value = selected.value;
    }
    triggerInputEvents(el);
    return { ok: true, selector: selector, value: selected.value };
  }

  function hasOnclickLike(el) {
    if (!el) return false;
    const attr = cleanString(el.getAttribute && el.getAttribute('onclick'));
    if (attr) return true;
    try {
      return typeof el.onclick === 'function';
    } catch (e) {
      return false;
    }
  }

  function isElementPotentiallyClickable(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    const type = lower(el.type || '');
    if (tag === 'A' || tag === 'BUTTON') return true;
    if (tag === 'INPUT' && (type === 'button' || type === 'submit' || type === 'image')) return true;
    if (tag === 'IMG') return true;
    if (cleanString(el.getAttribute && el.getAttribute('role')).toLowerCase() === 'button') return true;
    if (hasOnclickLike(el)) return true;
    return false;
  }

  function getElementDebugSummary(el, selectorHint) {
    if (!el) {
      return {
        selector: cleanString(selectorHint),
        tag: '',
        id: '',
        name: '',
        title: '',
        alt: '',
        src: '',
        href: '',
        onclick: '',
        className: ''
      };
    }

    return {
      selector: cleanString(selectorHint || makeSelectorForElement(el)),
      tag: cleanString(el.tagName).toUpperCase(),
      id: cleanString(el.id),
      name: cleanString(el.name || (el.getAttribute && el.getAttribute('name')) || ''),
      title: cleanString(el.title || (el.getAttribute && el.getAttribute('title')) || ''),
      alt: cleanString(el.alt || (el.getAttribute && el.getAttribute('alt')) || ''),
      src: cleanString(el.src || (el.getAttribute && el.getAttribute('src')) || ''),
      href: cleanString(el.href || (el.getAttribute && el.getAttribute('href')) || ''),
      onclick: cleanString(el.getAttribute && el.getAttribute('onclick')),
      className: cleanString(el.className || '')
    };
  }

  function dispatchSyntheticMouseClick(el) {
    if (!el) return false;
    const events = ['mousedown', 'mouseup', 'click'];
    for (let i = 0; i < events.length; i += 1) {
      const ev = new MouseEvent(events[i], {
        bubbles: true,
        cancelable: true,
        view: window
      });
      el.dispatchEvent(ev);
    }
    return true;
  }

  function tryInvokeAspNetPostBackFromElement(el) {
    if (!el || !el.tagName) return { ok: false, reason: 'not_anchor' };
    if (cleanString(el.tagName).toUpperCase() !== 'A') return { ok: false, reason: 'not_anchor' };

    const hrefRaw = cleanString(el.getAttribute && el.getAttribute('href')) || cleanString(el.href || '');
    if (!hrefRaw) return { ok: false, reason: 'empty_href' };
    if (!/^javascript:/i.test(hrefRaw)) return { ok: false, reason: 'href_not_javascript' };

    const js = hrefRaw.replace(/^javascript:\s*/i, '');
    if (!js) return { ok: false, reason: 'empty_javascript_href' };

    const doPostBackMatch = js.match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i);
    if (doPostBackMatch && typeof window.__doPostBack === 'function') {
      try {
        window.__doPostBack(doPostBackMatch[1], doPostBackMatch[2]);
        return { ok: true, method: 'window.__doPostBack', href: hrefRaw };
      } catch (e) {}
    }

    try {
      Function(js).call(window);
      return { ok: true, method: 'javascript_href_eval', href: hrefRaw };
    } catch (e) {
      return { ok: false, reason: 'javascript_href_eval_failed', href: hrefRaw };
    }
  }

  function clickElementNode(el, selectorHint) {
    if (!el) return { ok: false, selector: cleanString(selectorHint), reason: 'not_found' };
    if (el.disabled) return Object.assign({ ok: false, reason: 'disabled' }, getElementDebugSummary(el, selectorHint));

    let target = el;
    const targetTag = cleanString(target.tagName).toUpperCase();
    if (targetTag === 'IMG') {
      let parent = target.parentElement;
      let hops = 0;
      while (parent && hops < 4) {
        if (isElementPotentiallyClickable(parent)) {
          target = parent;
          break;
        }
        parent = parent.parentElement;
        hops += 1;
      }
    }

    const clickMethods = [];
    try {
      if (typeof target.focus === 'function') target.focus();
    } catch (e) {}

    let clicked = false;
    let nativeClicked = false;
    try {
      if (typeof target.click === 'function') {
        target.click();
        clickMethods.push('native_click');
        clicked = true;
        nativeClicked = true;
      }
    } catch (e) {}

    if (!nativeClicked) {
      try {
        if (dispatchSyntheticMouseClick(target)) {
          clickMethods.push('synthetic_mouse');
          clicked = true;
        }
      } catch (e) {}
    }

    if (!clicked && target !== el) {
      try {
        if (typeof el.click === 'function') {
          el.click();
          clickMethods.push('fallback_original_click');
          clicked = true;
        }
      } catch (e) {}
    }

    if (!clicked) {
      const aspFallback = tryInvokeAspNetPostBackFromElement(target);
      if (aspFallback.ok) {
        clickMethods.push(aspFallback.method || 'aspnet_postback');
        clicked = true;
      }
    }

    const summary = getElementDebugSummary(target, selectorHint || makeSelectorForElement(target) || makeSelectorForElement(el));
    return Object.assign({
      ok: clicked,
      reason: clicked ? '' : 'click_failed',
      clickMethods: clickMethods,
      originalSelector: makeSelectorForElement(el)
    }, summary);
  }

  function clickElement(selector) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, selector: selector, reason: 'not_found' };
    const result = clickElementNode(el, selector);
    if (!result.selector) result.selector = selector;
    return result;
  }

  async function waitForElement(selector, timeout) {
    const timeoutMs = typeof timeout === 'number' ? timeout : 5000;
    const start = Date.now();

    while (Date.now() - start <= timeoutMs) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(120);
    }

    return null;
  }

  async function waitForUsableElement(selector, timeoutMs) {
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : 5000;
    const start = Date.now();

    while (Date.now() - start <= timeout) {
      const el = document.querySelector(selector);
      if (el && isElementUsable(el)) return el;
      await sleep(120);
    }

    return null;
  }

  function isElementUsable(el) {
    if (!el) return false;
    if (el.disabled) return false;
    if (el.readOnly) return false;
    if (el.getAttribute && el.getAttribute('readonly') != null) return false;
    return true;
  }

  async function waitForPageStabilization(timeoutMs, idleOverrideMs) {
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : 12000;
    const start = Date.now();
    const idleMs = typeof idleOverrideMs === 'number' ? idleOverrideMs : 240;

    while (Date.now() - start <= timeout) {
      if (document.readyState === 'complete') {
        await sleep(idleMs);
        if (document.readyState === 'complete') {
          return true;
        }
      }
      await sleep(120);
    }

    return false;
  }

  function countMeaningfulOptions(selectEl) {
    if (!selectEl || !selectEl.options) return 0;
    let count = 0;

    for (let i = 0; i < selectEl.options.length; i += 1) {
      const opt = selectEl.options[i];
      const value = cleanString(opt.value);
      const text = cleanString(opt.text).toLowerCase();
      const placeholder = !value || text.indexOf('select') >= 0 || text.indexOf('choose') >= 0 || text === '--';
      if (!placeholder) count += 1;
    }

    return count;
  }

  async function waitForSelectOptions(selector, minOptions, timeoutMs) {
    const min = typeof minOptions === 'number' ? minOptions : 2;
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : 10000;
    const start = Date.now();

    while (Date.now() - start <= timeout) {
      const el = document.querySelector(selector);
      if (el && el.tagName && el.tagName.toUpperCase() === 'SELECT' && !el.disabled) {
        if (countMeaningfulOptions(el) >= min) {
          return el;
        }
      }
      await sleep(120);
    }

    return null;
  }

  function buildVehicleSelector(index, fieldSuffix) {
    return '#ctl00_MainContent_AutoControl' + index + '_' + fieldSuffix;
  }

  function buildAltVehicleSelector(index, fieldSuffix) {
    return '#ctl00_MainContent_Auto' + index + '_' + fieldSuffix;
  }

  function parseVehicleIndexFromId(value) {
    const s = cleanString(value);
    if (!s) return null;
    const m = s.match(/^ctl00_MainContent_AutoControl(\d+)_/i) || s.match(/^ctl00_MainContent_Auto(\d+)_/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isNaN(n) ? null : n;
  }

  function detectVehicleIndexesFromDom() {
    const nodes = Array.from(
      document.querySelectorAll('input[id^="ctl00_MainContent_"], select[id^="ctl00_MainContent_"], textarea[id^="ctl00_MainContent_"]')
    );
    const indexMap = {};

    for (let i = 0; i < nodes.length; i += 1) {
      const idx = parseVehicleIndexFromId(nodes[i].id);
      if (idx != null) indexMap[idx] = true;
    }

    return Object.keys(indexMap).map(function (k) {
      return parseInt(k, 10);
    }).sort(function (a, b) {
      return a - b;
    });
  }

  function dedupeSelectors(list) {
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const s = cleanString(list[i]);
      if (!s) continue;
      if (out.indexOf(s) === -1) out.push(s);
    }
    return out;
  }

  function firstExistingSelector(candidates) {
    const list = dedupeSelectors(candidates || []);
    for (let i = 0; i < list.length; i += 1) {
      if (document.querySelector(list[i])) return list[i];
    }
    return '';
  }

  function replaceTemplateIndex(template, index) {
    const t = cleanString(template);
    if (!t) return '';
    if (t.indexOf('{n}') >= 0) return t.replace('{n}', String(index));
    return t;
  }

  function fieldSuffixesForRole(role) {
    switch (role) {
      case 'vin':
        return ['txtVIN', 'txtVehicleIdentificationNumber'];
      case 'vehicleType':
        return ['ddlVehicleType', 'ddlType', 'txtVehicleType'];
      case 'year':
        return ['txtModelYear', 'txtYear', 'ddlModelYear', 'ddlYear'];
      case 'make':
        return ['txtMake', 'ddlMake'];
      case 'model':
        return ['txtModel', 'ddlModel'];
      case 'style':
        return ['ddlStyle', 'ddlBodyStyle', 'ddlVehicleStyle', 'txtStyle'];
      case 'primaryUse':
        return ['ddlPrimaryUse', 'ddlVehicleUse', 'ddlUse'];
      case 'deliveryCoverage':
        return ['ddlDeliveryCoverage', 'ddlDeliveryUse', 'ddlDelivery', 'ddlFoodDelivery', 'ddlRideShare'];
      case 'airbags':
        return ['ddlAirbags', 'ddlAirBags', 'ddlAirBag'];
      case 'paperFs1Needed':
        return ['ddlPaperFS1Needed', 'ddlPaperFs1Needed', 'ddlFS1Needed', 'ddlPaperFS1'];
      case 'fr2Needed':
        return ['ddlFR2Needed', 'ddlFr2Needed', 'ddlFR2', 'ddlFr2'];
      case 'state':
        return ['ddlState', 'ddlGaragingState', 'txtState'];
      case 'zip':
        return ['txtZip', 'txtGaragingZip', 'txtPostalCode', 'txtZIP'];
      case 'garagedOutState':
        return ['ddlGaragedOutOfState', 'ddlGaragedOutState', 'ddlOutOfState'];
      case 'lossPayeeAddIns':
        return ['ddlLossPayeeAddIns', 'ddlLossPayee', 'ddlAddIns'];
      case 'originalOwner':
        return ['ddlOriginalOwner'];
      default:
        return [];
    }
  }

  function buildFieldSelectorCandidates(index, role, templates) {
    const out = [];
    const template = templates && templates[role] ? templates[role] : '';

    if (template) {
      out.push(replaceTemplateIndex(template, index));
    }

    const suffixes = fieldSuffixesForRole(role);
    for (let i = 0; i < suffixes.length; i += 1) {
      out.push(buildVehicleSelector(index, suffixes[i]));
      out.push(buildAltVehicleSelector(index, suffixes[i]));
    }

    return dedupeSelectors(out);
  }

  function buildVinLookupSelectorCandidates(index) {
    return dedupeSelectors([
      '#ctl00_MainContent_AutoControl' + index + '_btnVerifyVIN',
      '#ctl00_MainContent_Auto' + index + '_btnVerifyVIN',
      '#ctl00_MainContent_AutoControl' + index + '_btnVINLookup',
      '#ctl00_MainContent_AutoControl' + index + '_btnVinLookup',
      '#ctl00_MainContent_AutoControl' + index + '_btnVIN',
      '#ctl00_MainContent_AutoControl' + index + '_btnVin',
      '#ctl00_MainContent_AutoControl' + index + '_btnVINSearch',
      '#ctl00_MainContent_AutoControl' + index + '_btnVinSearch',
      '#ctl00_MainContent_AutoControl' + index + '_btnVINDecode',
      '#ctl00_MainContent_AutoControl' + index + '_btnVinDecode',
      '#ctl00_MainContent_AutoControl' + index + '_btnLookupVIN',
      '#ctl00_MainContent_AutoControl' + index + '_btnLookup',
      '#ctl00_MainContent_AutoControl' + index + '_imgVINLookup',
      '#ctl00_MainContent_AutoControl' + index + '_imgVinLookup',
      '#ctl00_MainContent_AutoControl' + index + '_imgVIN',
      '#ctl00_MainContent_AutoControl' + index + '_imgVin',
      '#ctl00_MainContent_AutoControl' + index + '_imgLookupVIN',
      '#ctl00_MainContent_AutoControl' + index + '_lnkVINLookup',
      '#ctl00_MainContent_AutoControl' + index + '_lnkVinLookup',
      '#ctl00_MainContent_AutoControl' + index + '_lnkLookupVIN',
      '#ctl00_MainContent_Auto' + index + '_btnVINLookup',
      '#ctl00_MainContent_Auto' + index + '_btnVinLookup',
      '#ctl00_MainContent_Auto' + index + '_btnVINDecode',
      '#ctl00_MainContent_Auto' + index + '_imgVINLookup',
      '#ctl00_MainContent_Auto' + index + '_lnkVINLookup',
      '[id*="AutoControl' + index + '"][id*="VIN"][id*="Lookup"]',
      '[id*="AutoControl' + index + '"][id*="Vin"][id*="Lookup"]',
      '[id*="AutoControl' + index + '"][id*="VIN"][id*="Search"]',
      '[id*="AutoControl' + index + '"][id*="Vin"][id*="Search"]',
      '[id*="AutoControl' + index + '"][id*="Lookup"][id*="VIN"]',
      '[id*="AutoControl' + index + '"][id*="Decode"]',
      '[id*="AutoControl' + index + '"][id$="_btnVerifyVIN"]',
      '[id*="Auto' + index + '"][id$="_btnVerifyVIN"]',
      'a[id$="AutoControl' + index + '_btnVerifyVIN"]',
      'a[id$="Auto' + index + '_btnVerifyVIN"]',
      'a[href*="$AutoControl' + index + '$btnVerifyVIN"]',
      'a[href*="$Auto' + index + '$btnVerifyVIN"]'
    ]);
  }

  function buildPreferredVinLookupSelectorCandidates(index, vinEl) {
    const out = [];
    const parsedIndex = Number(index || 0);
    const vinIndex = vinEl ? extractVehicleIndex(vinEl) : null;
    if (vinIndex != null) {
      const preferredControlIndex = Math.max(1, vinIndex);
      const offByOneFallback = preferredControlIndex + 1;
      out.push('#ctl00_MainContent_AutoControl' + preferredControlIndex + '_btnVerifyVIN');
      out.push('#ctl00_MainContent_Auto' + preferredControlIndex + '_btnVerifyVIN');
      out.push('#ctl00_MainContent_AutoControl' + offByOneFallback + '_btnVerifyVIN');
      out.push('#ctl00_MainContent_Auto' + offByOneFallback + '_btnVerifyVIN');
      out.push('[id*="AutoControl' + vinIndex + '"][id$="_btnVerifyVIN"]');
      out.push('[id*="Auto' + vinIndex + '"][id$="_btnVerifyVIN"]');
    }

    if (!Number.isNaN(parsedIndex) && parsedIndex > 0) {
      out.push('#ctl00_MainContent_AutoControl' + parsedIndex + '_btnVerifyVIN');
      out.push('#ctl00_MainContent_Auto' + parsedIndex + '_btnVerifyVIN');
      out.push('#ctl00_MainContent_AutoControl' + (parsedIndex + 1) + '_btnVerifyVIN');
      out.push('#ctl00_MainContent_Auto' + (parsedIndex + 1) + '_btnVerifyVIN');
    }

    const defaults = buildVinLookupSelectorCandidates(index);
    for (let i = 0; i < defaults.length; i += 1) out.push(defaults[i]);
    return dedupeSelectors(out);
  }

  function getFieldCurrentValue(selector) {
    const el = document.querySelector(selector);
    if (!el) return '';

    if (el.tagName && el.tagName.toUpperCase() === 'SELECT') {
      const selected = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
      const selectedText = cleanString(selected && selected.text);
      const selectedValue = cleanString(el.value);
      return selectedText || selectedValue;
    }

    return cleanString(el.value || el.textContent || el.innerText || '');
  }

  function looksLikeVehicleIndexToken(text, index) {
    const s = cleanString(text);
    if (!s) return false;
    if (s.indexOf('AutoControl' + index) >= 0) return true;
    if (s.indexOf('Auto' + index + '_') >= 0) return true;
    return false;
  }

  function isElementForVehicleIndex(el, index) {
    if (!el || !index) return false;

    const id = cleanString(el.id);
    const name = cleanString(el.name || (el.getAttribute && el.getAttribute('name')) || '');
    if (looksLikeVehicleIndexToken(id, index) || looksLikeVehicleIndexToken(name, index)) {
      return true;
    }

    let cursor = el;
    let hops = 0;
    while (cursor && hops < 10) {
      const cid = cleanString(cursor.id);
      const cname = cleanString(cursor.getAttribute && cursor.getAttribute('name'));
      if (looksLikeVehicleIndexToken(cid, index) || looksLikeVehicleIndexToken(cname, index)) {
        return true;
      }
      cursor = cursor.parentElement;
      hops += 1;
    }

    return false;
  }

  function getVehicleBlockRoot(index, templates) {
    const rolePriority = ['vin', 'year', 'make', 'model', 'style', 'primaryUse'];
    for (let r = 0; r < rolePriority.length; r += 1) {
      const role = rolePriority[r];
      const selectors = buildFieldSelectorCandidates(index, role, templates);
      for (let i = 0; i < selectors.length; i += 1) {
        const el = document.querySelector(selectors[i]);
        if (!el) continue;
        if (!isElementForVehicleIndex(el, index)) continue;

        let cursor = el;
        let hops = 0;
        while (cursor && hops < 10) {
          const cid = cleanString(cursor.id);
          if (looksLikeVehicleIndexToken(cid, index)) return cursor;
          cursor = cursor.parentElement;
          hops += 1;
        }

        return el.closest('tr, table, fieldset, section, div') || el.parentElement || null;
      }
    }
    return null;
  }

  function findFieldElementForVehicle(index, role, templates) {
    const selectors = buildFieldSelectorCandidates(index, role, templates);
    for (let i = 0; i < selectors.length; i += 1) {
      const el = document.querySelector(selectors[i]);
      if (!el) continue;
      if (!isElementForVehicleIndex(el, index)) continue;
      return { selector: selectors[i], el: el };
    }
    return null;
  }

  function getNativeValueSetter(el) {
    if (!el) return null;

    const proto = Object.getPrototypeOf(el);
    const protoDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (protoDesc && typeof protoDesc.set === 'function') return protoDesc.set;

    if (window.HTMLInputElement && window.HTMLInputElement.prototype) {
      const inputDesc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (inputDesc && typeof inputDesc.set === 'function') return inputDesc.set;
    }

    if (window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype) {
      const textDesc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (textDesc && typeof textDesc.set === 'function') return textDesc.set;
    }

    return null;
  }

  function setInputValueNativeWithEvents(el, value) {
    if (!el) return { ok: false, reason: 'not_found', before: '', after: '', expected: cleanString(value), verified: false };

    const expected = cleanString(value);
    if (!expected) return { ok: false, reason: 'empty_value', before: cleanString(el.value), after: cleanString(el.value), expected: expected, verified: false };

    const before = cleanString(el.value);

    try {
      if (typeof el.focus === 'function') el.focus();
    } catch (e) {}

    try {
      const setter = getNativeValueSetter(el);
      if (setter) {
        setter.call(el, expected);
      } else {
        el.value = expected;
      }
    } catch (e) {
      try {
        el.value = expected;
      } catch (err) {}
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    try {
      if (typeof el.blur === 'function') el.blur();
    } catch (e) {}

    const after = cleanString(el.value);
    const verified = after === expected;
    return {
      ok: verified,
      reason: verified ? '' : 'verification_failed',
      before: before,
      after: after,
      expected: expected,
      verified: verified
    };
  }

  function containsExcludedVinToken(value) {
    const raw = lower(value);
    if (!raw) return false;
    for (let i = 0; i < VIN_EXCLUDED_TOKENS.length; i += 1) {
      if (raw.indexOf(VIN_EXCLUDED_TOKENS[i]) >= 0) return true;
    }
    return false;
  }

  function isStrictVinTextboxElement(el) {
    if (!el || !el.tagName || el.tagName.toUpperCase() !== 'INPUT') return false;
    const type = lower(el.type || 'text');
    if (type === 'hidden') return false;

    const id = cleanString(el.id);
    const name = cleanString(el.name || (el.getAttribute && el.getAttribute('name')) || '');
    const selector = makeSelectorForElement(el);

    if (containsExcludedVinToken(id) || containsExcludedVinToken(name) || containsExcludedVinToken(selector)) {
      return false;
    }

    const idOk = /_txtVIN$/i.test(id);
    const nameOk = /\$txtVIN$/i.test(name);
    return idOk || nameOk;
  }

  function buildVehicleVinInputSelectorCandidates(index) {
    return dedupeSelectors([
      '#ctl00_MainContent_AutoControl' + index + '_txtVIN',
      '#ctl00_MainContent_Auto' + index + '_txtVIN',
      'input[id$="AutoControl' + index + '_txtVIN"]',
      'input[id$="Auto' + index + '_txtVIN"]',
      'input[name$="$AutoControl' + index + '$txtVIN"]',
      'input[name$="$Auto' + index + '$txtVIN"]'
    ]);
  }

  function findVinInputForVehicle(index, templates) {
    const blockRoot = getVehicleBlockRoot(index, templates);
    const scopedSelectors = [
      'input[id$="_txtVIN"]',
      'input[name$="$txtVIN"]'
    ];

    if (blockRoot) {
      for (let s = 0; s < scopedSelectors.length; s += 1) {
        const scopedList = Array.from(blockRoot.querySelectorAll(scopedSelectors[s]));
        for (let i = 0; i < scopedList.length; i += 1) {
          const el = scopedList[i];
          if (!isStrictVinTextboxElement(el)) continue;
          if (!isElementForVehicleIndex(el, index)) continue;
          return { el: el, selector: makeSelectorForElement(el), source: 'block_scoped' };
        }
      }
    }

    const directCandidates = buildVehicleVinInputSelectorCandidates(index);
    for (let i = 0; i < directCandidates.length; i += 1) {
      const selector = directCandidates[i];
      const el = document.querySelector(selector);
      if (!el) continue;
      if (!isStrictVinTextboxElement(el)) continue;
      if (!isElementForVehicleIndex(el, index)) continue;
      return { el: el, selector: selector, source: 'direct_selector' };
    }

    const globalInputs = Array.from(document.querySelectorAll('input[id$="_txtVIN"], input[name$="$txtVIN"]'));
    for (let i = 0; i < globalInputs.length; i += 1) {
      const el = globalInputs[i];
      if (!isStrictVinTextboxElement(el)) continue;
      if (!isElementForVehicleIndex(el, index)) continue;
      return { el: el, selector: makeSelectorForElement(el), source: 'global_filtered' };
    }

    if (globalInputs.length >= index) {
      const fallback = globalInputs[index - 1];
      if (fallback) {
        if (!isStrictVinTextboxElement(fallback)) return null;
        return { el: fallback, selector: makeSelectorForElement(fallback), source: 'global_index_fallback' };
      }
    }

    return null;
  }

  function isMeaningfulPopulatedValue(value) {
    const raw = cleanString(value);
    if (!raw) return false;

    const lowered = raw.toLowerCase();
    if (lowered === '0' || lowered === '--') return false;
    if (lowered.indexOf('select') === 0 || lowered.indexOf('choose') === 0) return false;
    if (lowered === 'please select' || lowered === 'select an item' || lowered === 'select item') return false;
    if (lowered.indexOf('not found') >= 0) return false;
    return true;
  }

  function extractDecodedYear(value) {
    const raw = cleanString(value);
    if (!raw) return '';
    if (raw.toLowerCase().indexOf('not found') >= 0) return '';
    const m = raw.match(/\b(19|20)\d{2}\b/);
    return m ? m[0] : '';
  }

  function isElementVisibleForBusyCheck(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;

    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (!style) return true;
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0) return false;
    return true;
  }

  function isAspNetAsyncPostBackActive() {
    try {
      if (window.Sys && window.Sys.WebForms && window.Sys.WebForms.PageRequestManager) {
        const prm = window.Sys.WebForms.PageRequestManager.getInstance();
        if (prm && typeof prm.get_isInAsyncPostBack === 'function') {
          return prm.get_isInAsyncPostBack() === true;
        }
      }
    } catch (e) {}
    return false;
  }

  function isLikelyVehicleDecodeBusy() {
    if (document.readyState !== 'complete') return true;
    if (isAspNetAsyncPostBackActive()) return true;

    const busySelectors = [
      '[id*="UpdateProgress"]',
      '[class*="loading"]',
      '[class*="spinner"]',
      '[class*="progress"]',
      '[id*="loading"]',
      '[id*="spinner"]'
    ];

    for (let i = 0; i < busySelectors.length; i += 1) {
      const nodes = Array.from(document.querySelectorAll(busySelectors[i]));
      for (let n = 0; n < nodes.length; n += 1) {
        const el = nodes[n];
        if (!isElementVisibleForBusyCheck(el)) continue;
        const txt = lower(cleanString(el.textContent || '') + ' ' + cleanString(el.id || '') + ' ' + cleanString(el.className || ''));
        if (txt.indexOf('load') >= 0 || txt.indexOf('progress') >= 0 || txt.indexOf('please wait') >= 0 || txt.indexOf('spinner') >= 0) {
          return true;
        }
      }
    }

    return false;
  }

  function getVehicleDecodeSnapshot(index, templates, expectedVinRaw) {
    const expectedVin = cleanString(expectedVinRaw).toUpperCase();

    const vinFound = findVinInputForVehicle(index, templates);
    const vinSelector = vinFound && vinFound.selector ? vinFound.selector : '';
    const vinEl = vinFound && vinFound.el ? vinFound.el : null;
    const vinValue = cleanString(vinEl ? vinEl.value : '');
    const vinMatches = !expectedVin || vinValue.toUpperCase() === expectedVin;

    const yearFound = findFieldElementForVehicle(index, 'year', templates);
    const makeFound = findFieldElementForVehicle(index, 'make', templates);
    const modelFound = findFieldElementForVehicle(index, 'model', templates);
    const styleFound = findFieldElementForVehicle(index, 'style', templates);

    const yearValue = yearFound ? cleanString(getFieldCurrentValue(yearFound.selector)) : '';
    const makeValue = makeFound ? cleanString(getFieldCurrentValue(makeFound.selector)) : '';
    const modelValue = modelFound ? cleanString(getFieldCurrentValue(modelFound.selector)) : '';
    const styleValue = styleFound ? cleanString(getFieldCurrentValue(styleFound.selector)) : '';

    const year4 = extractDecodedYear(yearValue);
    const yearPopulated = !!year4;
    const makePopulated = isMeaningfulPopulatedValue(makeValue);
    const modelPopulated = isMeaningfulPopulatedValue(modelValue);
    const stylePopulated = isMeaningfulPopulatedValue(styleValue);

    const baseSuccess = vinMatches && yearPopulated && (makePopulated || modelPopulated || stylePopulated);
    const strongYearMakeModel = vinMatches && yearPopulated && makePopulated && modelPopulated;
    const strongYearMakeStyle = vinMatches && yearPopulated && makePopulated && stylePopulated;
    const decodeComplete = baseSuccess || strongYearMakeModel || strongYearMakeStyle;

    let completionReason = '';
    if (decodeComplete) {
      if (strongYearMakeModel) completionReason = 'year+make+model';
      else if (strongYearMakeStyle) completionReason = 'year+make+style';
      else completionReason = 'year+one_of_make_model_style';
    }

    return {
      index: index,
      controlNumber: index,
      expectedVin: expectedVin,
      vinSelector: vinSelector,
      vin: vinValue,
      vinMatches: vinMatches,
      yearSelector: yearFound ? yearFound.selector : '',
      year: yearValue,
      year4: year4,
      yearPopulated: yearPopulated,
      makeSelector: makeFound ? makeFound.selector : '',
      make: makeValue,
      makePopulated: makePopulated,
      modelSelector: modelFound ? modelFound.selector : '',
      model: modelValue,
      modelPopulated: modelPopulated,
      styleSelector: styleFound ? styleFound.selector : '',
      style: styleValue,
      stylePopulated: stylePopulated,
      decodeComplete: decodeComplete,
      completionReason: completionReason
    };
  }

  function scanVehicleBlock(index) {
    const requestedIndex = parseInt(index, 10);
    if (Number.isNaN(requestedIndex) || requestedIndex < 0) {
      return { ok: false, reason: 'invalid_index', requestedVehicleIndex: Number.isNaN(requestedIndex) ? null : requestedIndex };
    }

    const controlNumber = requestedIndex === 0 ? 1 : requestedIndex;
    const report = buildSelectorReport();
    const templates = report && report.templates ? report.templates : {};
    const snapshot = getVehicleDecodeSnapshot(controlNumber, templates, '');
    return {
      ok: true,
      requestedVehicleIndex: requestedIndex,
      controlNumber: controlNumber,
      snapshot: snapshot
    };
  }

  function dedupeElements(list) {
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const el = list[i];
      if (!el) continue;
      if (out.indexOf(el) === -1) out.push(el);
    }
    return out;
  }

  function hasAnyToken(text, tokens) {
    const hay = lower(text);
    if (!hay) return false;
    for (let i = 0; i < tokens.length; i += 1) {
      if (hay.indexOf(tokens[i]) >= 0) return true;
    }
    return false;
  }

  function countTokenHits(text, tokens) {
    const hay = lower(text);
    if (!hay) return 0;
    let hits = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      if (hay.indexOf(tokens[i]) >= 0) hits += 1;
    }
    return hits;
  }

  function getVinLookupContextText(vinEl) {
    if (!vinEl) return '';
    const chunks = [];
    chunks.push(cleanString(vinEl.id));
    chunks.push(cleanString(vinEl.name));
    chunks.push(cleanString(vinEl.placeholder));
    chunks.push(cleanString(getLabelText(vinEl)));

    const row = vinEl.closest('tr');
    const td = vinEl.closest('td');
    const parent = vinEl.parentElement;
    if (row) chunks.push(cleanString(row.textContent || ''));
    if (td) chunks.push(cleanString(td.textContent || ''));
    if (parent) chunks.push(cleanString(parent.textContent || ''));

    return cleanString(chunks.join(' ').slice(0, 1200));
  }

  function getLookupCandidateHaystack(el, contextText) {
    if (!el) return '';
    return lower([
      cleanString(el.id),
      cleanString(el.name || (el.getAttribute && el.getAttribute('name')) || ''),
      cleanString(el.title || (el.getAttribute && el.getAttribute('title')) || ''),
      cleanString(el.alt || (el.getAttribute && el.getAttribute('alt')) || ''),
      cleanString(el.className || ''),
      cleanString(el.value || ''),
      cleanString(el.textContent || ''),
      cleanString(el.src || (el.getAttribute && el.getAttribute('src')) || ''),
      cleanString(el.href || (el.getAttribute && el.getAttribute('href')) || ''),
      cleanString(el.getAttribute && el.getAttribute('aria-label')),
      cleanString(el.getAttribute && el.getAttribute('data-original-title')),
      cleanString(el.getAttribute && el.getAttribute('onclick')),
      cleanString(el.getAttribute && el.getAttribute('onmousedown')),
      cleanString(el.type || ''),
      cleanString(contextText || '')
    ].join(' '));
  }

  function isLikelyVinLookupControl(el, contextText) {
    if (!el) return false;
    const hay = getLookupCandidateHaystack(el, contextText);
    if (!hay) return false;

    const positive = hasAnyToken(hay, VIN_LOOKUP_POSITIVE_TOKENS);
    const negative = hasAnyToken(hay, VIN_LOOKUP_NEGATIVE_TOKENS);
    if (negative && !positive) return false;
    if (positive) return true;

    if (hay.indexOf('btnverifyvin') >= 0) return true;
    if (hay.indexOf('vinbutton') >= 0) return true;
    if (hay.indexOf('validate vin') >= 0) return true;
    if (hay.indexOf('click to validate vin') >= 0) return true;
    if (hay.indexOf('__dopostback') >= 0 && hay.indexOf('vin') >= 0) return true;

    const tag = cleanString(el.tagName).toUpperCase();
    const type = lower(el.type || '');
    if (tag === 'INPUT' && type === 'image') return true;

    if (tag === 'IMG') {
      const cls = lower(el.className || '');
      if (cls.indexOf('search') >= 0 || cls.indexOf('lookup') >= 0 || cls.indexOf('magn') >= 0 || cls.indexOf('zoom') >= 0 || cls.indexOf('loupe') >= 0) {
        return true;
      }
    }

    if (hasOnclickLike(el)) {
      const context = lower(cleanString(contextText));
      if (context.indexOf('vin') >= 0 || context.indexOf('vehicle identification') >= 0) return true;
    }

    return false;
  }

  function isAdjacentToVinElement(vinEl, candidate) {
    if (!vinEl || !candidate) return false;
    if (candidate === vinEl.previousElementSibling || candidate === vinEl.nextElementSibling) return true;
    if (candidate.parentElement && candidate.parentElement === vinEl.parentElement) {
      const siblings = Array.from(candidate.parentElement.children || []);
      const vinPos = siblings.indexOf(vinEl);
      const candPos = siblings.indexOf(candidate);
      if (vinPos >= 0 && candPos >= 0 && Math.abs(vinPos - candPos) <= 2) return true;
    }
    return false;
  }

  function getVinLookupContainerRank(vinEl, candidate) {
    if (!vinEl || !candidate) return 99;
    if (isAdjacentToVinElement(vinEl, candidate)) return 0;
    if (candidate.parentElement && candidate.parentElement === vinEl.parentElement) return 1;

    const vinTd = vinEl.closest('td');
    const vinTr = vinEl.closest('tr');
    if (vinTd && vinTd.contains(candidate)) return 2;
    if (vinTr && vinTr.contains(candidate)) return 3;
    if (vinEl.parentElement && vinEl.parentElement.contains(candidate)) return 4;
    return 8;
  }

  function buildVinLookupCandidateInfo(el, vinEl, contextText, sourceTag) {
    if (!el) return null;
    const hay = getLookupCandidateHaystack(el, contextText);
    const positiveHits = countTokenHits(hay, VIN_LOOKUP_POSITIVE_TOKENS);
    const negativeHits = countTokenHits(hay, VIN_LOOKUP_NEGATIVE_TOKENS);
    const likely = isLikelyVinLookupControl(el, contextText);
    const clickable = isElementPotentiallyClickable(el);
    const adjacency = isAdjacentToVinElement(vinEl, el);
    const rank = getVinLookupContainerRank(vinEl, el);

    let score = 0;
    if (likely) score += 220;
    if (positiveHits) score += (positiveHits * 35);
    if (clickable) score += 30;
    if (hasOnclickLike(el)) score += 30;
    if (adjacency) score += 50;
    if (rank <= 2) score += 20;
    if (cleanString(el.tagName).toUpperCase() === 'IMG') score += 10;
    if (cleanString(el.tagName).toUpperCase() === 'INPUT' && lower(el.type || '') === 'image') score += 20;
    if (negativeHits) score -= (negativeHits * 140);

    return {
      el: el,
      selector: makeSelectorForElement(el),
      source: sourceTag,
      score: score,
      likely: likely,
      clickable: clickable,
      adjacency: adjacency,
      rank: rank
    };
  }

  function chooseBestVinLookupCandidate(candidates, requireLikely) {
    const list = Array.isArray(candidates) ? candidates.slice() : [];
    const filtered = list.filter(function (c) {
      if (!c || !c.el) return false;
      if (!c.clickable && !hasOnclickLike(c.el)) return false;
      if (requireLikely && !c.likely) return false;
      return c.score > -50;
    });
    if (!filtered.length) return null;

    filtered.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.adjacency !== b.adjacency) return a.adjacency ? -1 : 1;
      return 0;
    });

    return filtered[0];
  }

  function collectVinLookupCandidatesFromContainer(container, vinEl, contextText, sourceTag) {
    if (!container) return [];
    const selectors = [
      'a',
      'a[id$="_btnVerifyVIN"]',
      'a[href*="btnVerifyVIN"]',
      'a[href*="__doPostBack"]',
      'a.VINBUTTON',
      'a[title*="validate VIN" i]',
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="image"]',
      'img',
      '[onclick]',
      '[role="button"]'
    ];
    let nodes = [];
    try {
      nodes = Array.from(container.querySelectorAll(selectors.join(', ')));
    } catch (e) {
      const fallbackSelectors = selectors.filter(function (s) {
        return s !== 'a[title*="validate VIN" i]';
      }).concat(['a[title*="validate VIN"]', 'a[title*="Validate VIN"]']);
      nodes = Array.from(container.querySelectorAll(fallbackSelectors.join(', ')));
    }
    const out = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (!el || el === vinEl) continue;
      const info = buildVinLookupCandidateInfo(el, vinEl, contextText, sourceTag);
      if (info) out.push(info);
    }
    return out;
  }

  function findBestVinLookupInContainers(containers, vinEl, contextText, sourceTag, requireLikely) {
    const uniqueContainers = dedupeElements(containers || []);
    const all = [];
    for (let i = 0; i < uniqueContainers.length; i += 1) {
      const list = collectVinLookupCandidatesFromContainer(uniqueContainers[i], vinEl, contextText, sourceTag);
      for (let n = 0; n < list.length; n += 1) all.push(list[n]);
    }
    return chooseBestVinLookupCandidate(all, requireLikely);
  }

  function findBestAdjacentVinLookup(vinEl, contextText) {
    if (!vinEl) return null;

    const targets = [];
    let prev = vinEl.previousElementSibling;
    let next = vinEl.nextElementSibling;
    let hop = 0;
    while ((prev || next) && hop < 5) {
      if (prev) {
        targets.push(prev);
        prev = prev.previousElementSibling;
      }
      if (next) {
        targets.push(next);
        next = next.nextElementSibling;
      }
      hop += 1;
    }

    const candidates = [];
    for (let i = 0; i < targets.length; i += 1) {
      const el = targets[i];
      const info = buildVinLookupCandidateInfo(el, vinEl, contextText, 'vin_adjacent');
      if (info) candidates.push(info);
      const descendants = collectVinLookupCandidatesFromContainer(el, vinEl, contextText, 'vin_adjacent_descendant');
      for (let d = 0; d < descendants.length; d += 1) candidates.push(descendants[d]);
    }

    return chooseBestVinLookupCandidate(candidates, true);
  }

  function findVinLookupElementForVehicle(index, templates) {
    const vinFound = findVinInputForVehicle(index, templates);
    const vinEl = vinFound && vinFound.el ? vinFound.el : null;
    const contextText = getVinLookupContextText(vinEl);

    // a) exact indexed selectors first
    const directSelectors = buildPreferredVinLookupSelectorCandidates(index, vinEl);
    for (let i = 0; i < directSelectors.length; i += 1) {
      const selector = directSelectors[i];
      const el = document.querySelector(selector);
      if (!el) continue;
      if (!isElementPotentiallyClickable(el) && !hasOnclickLike(el)) continue;
      return {
        el: el,
        selector: selector,
        source: 'direct_selector_indexed',
        details: getElementDebugSummary(el, selector)
      };
    }

    if (vinEl) {
      // b) same row / immediate VIN container
      const sameRow = vinEl.closest('tr');
      const immediateContainer = vinEl.parentElement || vinEl.closest('td');
      const sameContainerCandidate = findBestVinLookupInContainers(
        dedupeElements([sameRow, immediateContainer]),
        vinEl,
        contextText,
        'vin_row_container',
        true
      );
      if (sameContainerCandidate) {
        return {
          el: sameContainerCandidate.el,
          selector: sameContainerCandidate.selector || makeSelectorForElement(sameContainerCandidate.el),
          source: sameContainerCandidate.source,
          details: getElementDebugSummary(sameContainerCandidate.el, sameContainerCandidate.selector)
        };
      }

      // c) nearest sibling / adjacent controls
      const adjacentCandidate = findBestAdjacentVinLookup(vinEl, contextText);
      if (adjacentCandidate) {
        return {
          el: adjacentCandidate.el,
          selector: adjacentCandidate.selector || makeSelectorForElement(adjacentCandidate.el),
          source: adjacentCandidate.source,
          details: getElementDebugSummary(adjacentCandidate.el, adjacentCandidate.selector)
        };
      }

      // d) nearest clickable in VIN cell/container, then broader block
      const nearVinContainers = dedupeElements([
        vinEl.closest('td'),
        vinEl.closest('tr'),
        vinEl.parentElement,
        vinEl.closest('table'),
        vinEl.closest('fieldset'),
        vinEl.closest('section'),
        vinEl.closest('div')
      ]);
      const nearestClickableCandidate = findBestVinLookupInContainers(
        nearVinContainers,
        vinEl,
        contextText,
        'vin_nearest_clickable',
        false
      );
      if (nearestClickableCandidate) {
        return {
          el: nearestClickableCandidate.el,
          selector: nearestClickableCandidate.selector || makeSelectorForElement(nearestClickableCandidate.el),
          source: nearestClickableCandidate.source,
          details: getElementDebugSummary(nearestClickableCandidate.el, nearestClickableCandidate.selector)
        };
      }
    }

    // fallback: block-scoped indexed hints when VIN anchor was not enough
    const blockRoot = getVehicleBlockRoot(index, templates);
    if (blockRoot) {
      const fallbackBlock = findBestVinLookupInContainers([blockRoot], vinEl, contextText, 'block_scoped_fallback', false);
      if (fallbackBlock) {
        return {
          el: fallbackBlock.el,
          selector: fallbackBlock.selector || makeSelectorForElement(fallbackBlock.el),
          source: fallbackBlock.source,
          details: getElementDebugSummary(fallbackBlock.el, fallbackBlock.selector)
        };
      }
    }

    return null;
  }

  function scanVehicleVinInputs() {
    const vinInputs = Array.from(document.querySelectorAll('input[id$="_txtVIN"], input[name$="$txtVIN"]'));
    return vinInputs.map(function (el) {
      const idx = extractVehicleIndex(el);
      const hidden = lower(el.type) === 'hidden';
      return {
        index: idx == null ? null : idx,
        controlNumber: idx == null ? null : idx,
        id: cleanString(el.id),
        name: cleanString(el.name),
        selector: makeSelectorForElement(el),
        value: cleanString(el.value),
        isHidden: hidden,
        disabled: !!el.disabled
      };
    });
  }

  function chooseAddVehicleSelector(report) {
    const candidates = [];

    if (report && report.addVehicle) {
      if (report.addVehicle.bestSelector) candidates.push(report.addVehicle.bestSelector);
      if (Array.isArray(report.addVehicle.fallbackSelectors)) {
        for (let i = 0; i < report.addVehicle.fallbackSelectors.length; i += 1) {
          candidates.push(report.addVehicle.fallbackSelectors[i]);
        }
      }
    }

    candidates.push('#ctl00_MainContent_InsuredAutoLabel1_btnAddAuto');
    candidates.push('#ctl00_MainContent_AutoLabel1_btnAddAuto');
    candidates.push('#ctl00_MainContent_btnAddAuto');
    candidates.push('[id*="btnAddAuto"]');
    candidates.push('[name*="btnAddAuto"]');
    candidates.push('[id*="AddAuto"]');
    candidates.push('[name*="AddAuto"]');

    return firstExistingSelector(candidates);
  }

  function mapStyle(vehicle) {
    const raw = cleanString(
      safeGet(vehicle, 'style', '') ||
      safeGet(vehicle, 'bodyType', '') ||
      safeGet(vehicle, 'vehicleType', '')
    );
    if (!raw) return 'Other';

    const make = cleanString(safeGet(vehicle, 'make', '')).toLowerCase();
    const model = cleanString(safeGet(vehicle, 'model', '')).toLowerCase();
    const body = cleanString(safeGet(vehicle, 'bodyType', '')).toLowerCase();
    const style = cleanString(safeGet(vehicle, 'style', '')).toLowerCase();
    const combined = [make, model, body, style, raw.toLowerCase()].join(' ');

    if (
      combined.indexOf('suv') >= 0 ||
      combined.indexOf('sport utility') >= 0 ||
      combined.indexOf('utility') >= 0 ||
      combined.indexOf('cuv') >= 0 ||
      combined.indexOf('xc60') >= 0 ||
      combined.indexOf('xc90') >= 0 ||
      combined.indexOf('cr-v') >= 0 ||
      combined.indexOf('crv') >= 0 ||
      combined.indexOf('rav4') >= 0 ||
      combined.indexOf('rogue') >= 0 ||
      combined.indexOf('escape') >= 0 ||
      combined.indexOf('explorer') >= 0 ||
      combined.indexOf('highlander') >= 0
    ) {
      return 'SPORT UTILITY VEHICL 4 Cyl 4x4';
    }

    if (
      combined.indexOf('sedan') >= 0 ||
      combined.indexOf('civic') >= 0 ||
      combined.indexOf('accord') >= 0 ||
      combined.indexOf('camry') >= 0 ||
      combined.indexOf('corolla') >= 0 ||
      combined.indexOf('altima') >= 0 ||
      combined.indexOf('sonata') >= 0 ||
      combined.indexOf('malibu') >= 0
    ) {
      return 'SEDAN 4 Cyl';
    }

    return raw;
  }

  function firstNonEmpty(values) {
    for (let i = 0; i < values.length; i += 1) {
      const v = cleanString(values[i]);
      if (v) return v;
    }
    return '';
  }

  function uniqueNonEmpty(values) {
    const out = [];
    for (let i = 0; i < values.length; i += 1) {
      const v = cleanString(values[i]);
      if (!v) continue;
      if (out.indexOf(v) === -1) out.push(v);
    }
    return out;
  }

  function loadStoredPayload() {
    try {
      const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      if (root && typeof root.getMciSharedPayload === 'function') {
        const shared = root.getMciSharedPayload();
        if (shared && typeof shared === 'object') return shared;
        if (typeof shared === 'string') {
          const parsedShared = JSON.parse(shared);
          if (parsedShared && typeof parsedShared === 'object') return parsedShared;
        }
      }
    } catch (e) {
      console.error('Failed to load shared payload', e);
    }

    try {
      const raw = localStorage.getItem('mciMasterPayload');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to load stored payload', e);
      return null;
    }
  }

  function tryGetQueryParam(name) {
    try {
      const url = new URL(window.location.href);
      return cleanString(url.searchParams.get(name));
    } catch (e) {
      return '';
    }
  }

  function getCurrentQuoteKey() {
    const queryKeys = [
      'quoteId', 'QuoteId', 'QuoteID',
      'quoteNumber', 'QuoteNumber', 'QuoteNo',
      'qid', 'QID'
    ];

    const queryValues = queryKeys.map(function (k) {
      return tryGetQueryParam(k);
    });

    const domCandidates = [
      '#ctl00_MainContent_hdnQuoteId',
      '#ctl00_MainContent_hdnQuoteNumber',
      '#ctl00_MainContent_lblQuoteNumber',
      'input[name*="QuoteId"]',
      'input[id*="QuoteId"]',
      'input[name*="QuoteNumber"]',
      'input[id*="QuoteNumber"]'
    ];

    const domValues = domCandidates.map(function (selector) {
      const el = document.querySelector(selector);
      if (!el) return '';
      return cleanString(el.value || el.textContent || el.innerText || '');
    });

    const explicit = firstNonEmpty(queryValues.concat(domValues));
    if (explicit) return explicit;

    return cleanString(window.location.pathname + '|' + window.location.search);
  }

  function readPendingNatGenVehicleFill() {
    try {
      const raw = localStorage.getItem(PENDING_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function loadPendingNatGenVehicleFill() {
    return readPendingNatGenVehicleFill();
  }

  function writePendingNatGenVehicleFill(state) {
    try {
      localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearPendingNatGenVehicleFill() {
    try {
      localStorage.removeItem(PENDING_STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function isPendingExpired(pending) {
    if (!pending || !pending.expiresAt) return true;
    return Date.now() > Number(pending.expiresAt);
  }

  function normalizeBoolLike(value, defaultValue) {
    const raw = cleanString(value).toLowerCase();
    if (!raw) return cleanString(defaultValue);
    if (raw === 'true' || raw === 'yes' || raw === 'y' || raw === '1') return 'True';
    if (raw === 'false' || raw === 'no' || raw === 'n' || raw === '0') return 'False';
    return cleanString(value);
  }

  async function fillNatGenVehicles(payload, options) {
    const result = {
      ok: true,
      errors: [],
      warnings: [],
      filled: [],
      progress: {
        startedAt: new Date().toISOString(),
        vehicleCountRequested: 0,
        vehicleIndexesBefore: [],
        vehicleIndexesAfterEnsure: [],
        vehicles: [],
        stageTrail: []
      }
    };

    if (!payload || typeof payload !== 'object') {
      result.ok = false;
      result.errors.push('Payload is missing or invalid');
      return result;
    }

    const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
    if (!vehicles.length) {
      result.warnings.push('No vehicles found in payload');
      return result;
    }

    result.progress.vehicleCountRequested = vehicles.length;

    const settings = options || {};
    const runtime = {
      enableResume: settings.enableResume === true,
      startedByTest: settings.startedByTest === true,
      resumeState: settings.resumeState || null,
      addVehicleTimeoutMs: typeof settings.addVehicleTimeoutMs === 'number' ? settings.addVehicleTimeoutMs : 45000,
      reloadReadyTimeoutMs: typeof settings.reloadReadyTimeoutMs === 'number' ? settings.reloadReadyTimeoutMs : 45000,
      reloadIdleMs: typeof settings.reloadIdleMs === 'number' ? settings.reloadIdleMs : 300,
      stabilizationTimeoutMs: typeof settings.stabilizationTimeoutMs === 'number' ? settings.stabilizationTimeoutMs : 9000,
      decodeWaitTimeoutMs: typeof settings.decodeWaitTimeoutMs === 'number' ? settings.decodeWaitTimeoutMs : 15000,
      decodePollIntervalMs: typeof settings.decodePollIntervalMs === 'number' ? settings.decodePollIntervalMs : 200,
      selectPopulateTimeoutMs: typeof settings.selectPopulateTimeoutMs === 'number' ? settings.selectPopulateTimeoutMs : 6000,
      fieldFillTimeoutMs: typeof settings.fieldFillTimeoutMs === 'number' ? settings.fieldFillTimeoutMs : 2500,
      postFieldDelayMs: typeof settings.postFieldDelayMs === 'number' ? settings.postFieldDelayMs : 20,
      postSelectSettleMs: typeof settings.postSelectSettleMs === 'number' ? settings.postSelectSettleMs : 60,
      interVehicleDelayMs: typeof settings.interVehicleDelayMs === 'number' ? settings.interVehicleDelayMs : 20,
      dryRun: settings.dryRun === true
    };

    const vehicleStages = (function () {
      const incoming = runtime.resumeState && runtime.resumeState.vehicleStages;
      if (!incoming || typeof incoming !== 'object') return {};
      try {
        return JSON.parse(JSON.stringify(incoming));
      } catch (e) {
        return {};
      }
    })();

    let report = buildSelectorReport();
    let templates = report && report.templates ? report.templates : {};

    function refreshSelectorContext() {
      report = buildSelectorReport();
      templates = report && report.templates ? report.templates : {};
      return report;
    }

    function trackStage(stage, payloadIndex, pageIndex, extra) {
      result.progress.stageTrail.push({
        at: new Date().toISOString(),
        stage: stage,
        payloadIndex: payloadIndex || null,
        pageIndex: pageIndex || null,
        extra: extra || null
      });
    }

    function savePending(partial) {
      if (!(runtime.enableResume && runtime.startedByTest)) return;
      writePendingNatGenVehicleFill(Object.assign({
        version: 1,
        startedByTest: true,
        quoteKey: quoteKey,
        targetCount: vehicles.length,
        createdAt: Date.now(),
        expiresAt: Date.now() + PENDING_MAX_AGE_MS,
        vehicleStages: vehicleStages
      }, partial || {}));
    }

    function ensureVehicleStage(payloadVehicleIndex) {
      const key = String(payloadVehicleIndex);
      if (!vehicleStages[key] || typeof vehicleStages[key] !== 'object') {
        vehicleStages[key] = {
          vinWritten: false,
          lookupTriggered: false,
          decodeAttempted: false,
          decodeTimedOut: false,
          decodeCompleted: false,
          postFieldsStarted: false,
          postFieldsDone: false,
          failedThisRun: false,
          failureReason: '',
          vinWriteAttempts: 0,
          lookupAttempts: 0,
          decodeWaitTimeouts: 0
        };
      }
      return vehicleStages[key];
    }

    function updateVehicleStage(payloadVehicleIndex, patch) {
      const stage = ensureVehicleStage(payloadVehicleIndex);
      Object.keys(patch || {}).forEach(function (k) {
        stage[k] = patch[k];
      });
      return stage;
    }

    function incrementVehicleStageCounter(payloadVehicleIndex, key) {
      const stage = ensureVehicleStage(payloadVehicleIndex);
      const current = Number(stage[key] || 0);
      stage[key] = current + 1;
      return stage[key];
    }

    function markVehicleFailedThisRun(payloadVehicleIndex, reason, pageIndex, context) {
      const stage = updateVehicleStage(payloadVehicleIndex, {
        failedThisRun: true,
        failureReason: cleanString(reason || 'failed_this_run')
      });
      console.warn('[NatGenVehicles] Vehicle marked failed-this-run', {
        vehicleIndex: pageIndex,
        payloadVehicleIndex: payloadVehicleIndex,
        reason: stage.failureReason,
        context: context || ''
      });
      return stage;
    }

    function getVehicleIndexes() {
      const map = {};
      const freshReport = refreshSelectorContext();
      const fromReport = freshReport && Array.isArray(freshReport.vehicleIndexesDetected) ? freshReport.vehicleIndexesDetected : [];
      for (let i = 0; i < fromReport.length; i += 1) map[fromReport[i]] = true;

      const fromDom = detectVehicleIndexesFromDom();
      for (let i = 0; i < fromDom.length; i += 1) map[fromDom[i]] = true;

      const list = Object.keys(map).map(function (k) {
        return parseInt(k, 10);
      }).filter(function (n) {
        return !Number.isNaN(n);
      }).sort(function (a, b) {
        return a - b;
      });

      if (!list.length) {
        const maybeFirst = firstExistingSelector([
          buildVehicleSelector(1, 'txtVIN'),
          buildVehicleSelector(1, 'txtModelYear'),
          buildVehicleSelector(1, 'ddlMake'),
          buildAltVehicleSelector(1, 'txtVIN')
        ]);
        if (maybeFirst) list.push(1);
      }

      return list;
    }

    async function waitForExpectedVehicleAfterReload(expectedIndex, expectedCount) {
      await waitForPageStabilization(runtime.reloadReadyTimeoutMs, runtime.reloadIdleMs);
      const start = Date.now();
      const expected = Number(expectedIndex || 0);
      const countTarget = Number(expectedCount || 0);

      while (Date.now() - start <= runtime.addVehicleTimeoutMs) {
        const indexes = getVehicleIndexes();
        const countOk = !countTarget || indexes.length >= countTarget || (expected > 0 && indexes.indexOf(expected) >= 0);
        const firstFieldSelector = expected > 0
          ? firstExistingSelector(
            buildVehicleVinInputSelectorCandidates(expected)
              .concat(buildFieldSelectorCandidates(expected, 'year', templates))
              .concat(buildFieldSelectorCandidates(expected, 'make', templates))
              .concat(buildFieldSelectorCandidates(expected, 'primaryUse', templates))
          )
          : (indexes.length ? 'index-detected' : '');
        if (countOk && firstFieldSelector) return true;
        await sleep(150);
      }

      return false;
    }

    function recordFill(writeResult) {
      if (!writeResult || !writeResult.ok) return;
      if (result.filled.indexOf(writeResult.selector) === -1) {
        result.filled.push(writeResult.selector);
      }
    }

    async function ensureVehicleBlockReady(index, timeoutMs) {
      const timeout = typeof timeoutMs === 'number' ? timeoutMs : 10000;
      const start = Date.now();

      while (Date.now() - start <= timeout) {
        refreshSelectorContext();
        const markers = dedupeSelectors(
          buildVehicleVinInputSelectorCandidates(index)
            .concat(buildFieldSelectorCandidates(index, 'year', templates))
            .concat(buildFieldSelectorCandidates(index, 'make', templates))
        );

        for (let i = 0; i < markers.length; i += 1) {
          const ready = await waitForUsableElement(markers[i], runtime.fieldFillTimeoutMs);
          if (ready) return true;
        }

        await sleep(120);
      }

      return false;
    }

    async function writeField(index, role, candidateValues, label, vehicleProgress, opts) {
      opts = opts || {};
      refreshSelectorContext();
      const selectors = role === 'vin'
        ? buildVehicleVinInputSelectorCandidates(index)
        : buildFieldSelectorCandidates(index, role, templates);
      const values = uniqueNonEmpty(candidateValues);

      if (!values.length) {
        const msg = 'Vehicle ' + index + ': missing ' + label + ' value';
        result.warnings.push(msg);
        vehicleProgress.steps.push({ field: label, ok: false, reason: 'empty_value' });
        return null;
      }

      let foundControl = false;
      let wroteResult = null;

      for (let s = 0; s < selectors.length; s += 1) {
        const selector = selectors[s];
        let el = document.querySelector(selector);
        if (!el) continue;
        if (role === 'vin' && !isStrictVinTextboxElement(el)) continue;
        if (!isElementForVehicleIndex(el, index)) continue;

        if (opts.requireUsable && !isElementUsable(el)) {
          const usable = await waitForUsableElement(selector, opts.usableTimeoutMs || runtime.fieldFillTimeoutMs);
          if (!usable) continue;
          el = usable;
        }

        foundControl = true;

        if (el.tagName && el.tagName.toUpperCase() === 'SELECT') {
          if (opts.waitForOptions) {
            const withOptions = await waitForSelectOptions(
              selector,
              opts.minOptions || 2,
              opts.optionsTimeoutMs || runtime.selectPopulateTimeoutMs
            );
            if (!withOptions) continue;
          }

          for (let v = 0; v < values.length; v += 1) {
            const r = setSelectValue(selector, values[v]);
            if (r.ok) {
              recordFill(r);
              wroteResult = r;
              break;
            }
          }
          if (wroteResult) break;
        } else {
          const r = setInputValue(selector, values[0]);
          if (r.ok) {
            recordFill(r);
            wroteResult = r;
            break;
          }
        }
      }

      if (!foundControl) {
        const msg = 'Vehicle ' + index + ': no selector found for ' + label;
        result.warnings.push(msg);
        vehicleProgress.steps.push({ field: label, ok: false, reason: 'selector_not_found' });
        return null;
      }

      if (!wroteResult) {
        const msg = 'Vehicle ' + index + ': unable to fill ' + label;
        result.warnings.push(msg);
        vehicleProgress.steps.push({ field: label, ok: false, reason: 'write_failed' });
        return null;
      }

      vehicleProgress.steps.push({ field: label, ok: true, selector: wroteResult.selector });

      if (opts.stabilizeAfterWrite) {
        await waitForPageStabilization(runtime.stabilizationTimeoutMs);
      }
      if (opts.delayAfterWriteMs) {
        await sleep(opts.delayAfterWriteMs);
      } else if (runtime.postFieldDelayMs > 0) {
        await sleep(runtime.postFieldDelayMs);
      }

      return wroteResult;
    }

    function readRoleValue(index, role) {
      refreshSelectorContext();
      if (role === 'vin') {
        const vinFound = findVinInputForVehicle(index, templates);
        if (vinFound && vinFound.el) return cleanString(vinFound.el.value);
        return '';
      }
      const found = findFieldElementForVehicle(index, role, templates);
      if (found && found.selector) return cleanString(getFieldCurrentValue(found.selector));
      return '';
    }

    function hasRoleControl(index, role) {
      refreshSelectorContext();
      if (role === 'vin') {
        return !!findVinInputForVehicle(index, templates);
      }
      return !!findFieldElementForVehicle(index, role, templates);
    }

    async function setVinForVehicle(index, vin, timeoutMs) {
      const expected = cleanString(vin);
      if (!expected) {
        return { ok: false, reason: 'empty_vin' };
      }

      const timeout = typeof timeoutMs === 'number' ? timeoutMs : runtime.fieldFillTimeoutMs;
      const start = Date.now();
      const controlNumber = index;
      let lastAttempt = {
        ok: false,
        reason: 'vin_not_found',
        requestedVehicleIndex: index,
        controlNumber: controlNumber,
        selector: '',
        isHidden: false,
        before: '',
        after: '',
        verified: false
      };

      while (Date.now() - start <= timeout) {
        refreshSelectorContext();
        const found = findVinInputForVehicle(index, templates);
        if (!found || !found.el) {
          lastAttempt = {
            ok: false,
            reason: 'vin_not_found',
            requestedVehicleIndex: index,
            controlNumber: controlNumber,
            selector: '',
            isHidden: false,
            before: '',
            after: '',
            verified: false
          };
          await sleep(100);
          continue;
        }

        const el = found.el;
        if (!isElementUsable(el)) {
          lastAttempt = {
            ok: false,
            reason: 'vin_not_usable',
            requestedVehicleIndex: index,
            controlNumber: controlNumber,
            selector: found.selector,
            isHidden: lower(el.type) === 'hidden',
            before: cleanString(el.value),
            after: cleanString(el.value),
            verified: false
          };
          await sleep(100);
          continue;
        }

        const write1 = setInputValueNativeWithEvents(el, expected);
        console.log('[NatGenVehicles][VIN Set]', {
          requestedVehicleIndex: index,
          controlNumber: controlNumber,
          selector: found.selector,
          isHidden: lower(el.type) === 'hidden',
          before: write1.before,
          after: write1.after,
          verificationPassed: write1.verified
        });
        if (write1.verified) {
          recordFill({ ok: true, selector: found.selector });
          return {
            ok: true,
            requestedVehicleIndex: index,
            controlNumber: controlNumber,
            selector: found.selector,
            isHidden: lower(el.type) === 'hidden',
            value: write1.after,
            before: write1.before,
            after: write1.after,
            verified: true
          };
        }

        await sleep(60);
        refreshSelectorContext();
        const retryFound = findVinInputForVehicle(index, templates);
        if (retryFound && retryFound.el && isElementUsable(retryFound.el)) {
          const write2 = setInputValueNativeWithEvents(retryFound.el, expected);
          console.log('[NatGenVehicles][VIN Set Retry]', {
            requestedVehicleIndex: index,
            controlNumber: controlNumber,
            selector: retryFound.selector,
            isHidden: lower(retryFound.el.type) === 'hidden',
            before: write2.before,
            after: write2.after,
            verificationPassed: write2.verified
          });
          if (write2.verified) {
            recordFill({ ok: true, selector: retryFound.selector });
            return {
              ok: true,
              requestedVehicleIndex: index,
              controlNumber: controlNumber,
              selector: retryFound.selector,
              isHidden: lower(retryFound.el.type) === 'hidden',
              value: write2.after,
              before: write2.before,
              after: write2.after,
              verified: true
            };
          }

          lastAttempt = {
            ok: false,
            reason: 'vin_not_sticking',
            requestedVehicleIndex: index,
            controlNumber: controlNumber,
            selector: retryFound.selector,
            isHidden: lower(retryFound.el.type) === 'hidden',
            before: write2.before,
            after: write2.after,
            verified: write2.verified
          };
        } else {
          lastAttempt = {
            ok: false,
            reason: 'vin_not_found_on_retry',
            requestedVehicleIndex: index,
            controlNumber: controlNumber,
            selector: found.selector,
            isHidden: lower(el.type) === 'hidden',
            before: write1.before,
            after: write1.after,
            verified: write1.verified
          };
        }

        await sleep(80);
      }

      return lastAttempt;
    }

    function getVehicleSnapshot(index, vehicle, defaults) {
      const expectedVin = cleanString(firstNonEmpty([
        safeGet(vehicle, 'vin', ''),
        safeGet(vehicle, 'vehicleIdentificationNumber', '')
      ])).toUpperCase();
      const decodeSnapshot = getVehicleDecodeSnapshot(index, templates, expectedVin);

      const vin = decodeSnapshot.vin;
      const year = decodeSnapshot.year;
      const make = decodeSnapshot.make;
      const model = decodeSnapshot.model;
      const style = decodeSnapshot.style;
      const primaryUse = readRoleValue(index, 'primaryUse');
      const deliveryCoverage = readRoleValue(index, 'deliveryCoverage');
      const airbags = readRoleValue(index, 'airbags');
      const paperFs1Needed = readRoleValue(index, 'paperFs1Needed');
      const fr2Needed = readRoleValue(index, 'fr2Needed');
      const state = readRoleValue(index, 'state');
      const zip = readRoleValue(index, 'zip');
      const garagedOutState = readRoleValue(index, 'garagedOutState');
      const lossPayeeAddIns = readRoleValue(index, 'lossPayeeAddIns');
      const originalOwner = readRoleValue(index, 'originalOwner');
      const vinMatches = decodeSnapshot.vinMatches;
      const decoded = decodeSnapshot.decodeComplete;

      const checks = [
        { role: 'primaryUse', value: primaryUse, required: true },
        { role: 'deliveryCoverage', value: deliveryCoverage, required: true },
        { role: 'airbags', value: airbags, required: true },
        { role: 'paperFs1Needed', value: paperFs1Needed, required: true },
        { role: 'fr2Needed', value: fr2Needed, required: true },
        { role: 'state', value: state, required: !!defaults.state },
        { role: 'zip', value: zip, required: !!defaults.zip },
        { role: 'garagedOutState', value: garagedOutState, required: true },
        { role: 'lossPayeeAddIns', value: lossPayeeAddIns, required: true },
        { role: 'originalOwner', value: originalOwner, required: true }
      ];

      let postComplete = true;
      for (let i = 0; i < checks.length; i += 1) {
        const check = checks[i];
        if (!check.required) continue;
        if (!hasRoleControl(index, check.role)) continue;
        if (!cleanString(check.value)) {
          postComplete = false;
          break;
        }
      }

      return {
        vin: vin,
        year: year,
        make: make,
        model: model,
        style: style,
        decoded: decoded,
        vinMatches: vinMatches,
        decodeCompletionReason: decodeSnapshot.completionReason || '',
        postComplete: postComplete,
        complete: vinMatches && ((expectedVin && decoded) || !expectedVin) && postComplete
      };
    }

    function findVinLookupTarget(index) {
      refreshSelectorContext();
      return findVinLookupElementForVehicle(index, templates);
    }

    function findVinLookupSelector(index) {
      const found = findVinLookupTarget(index);
      if (!found) return '';
      return cleanString(found.selector || makeSelectorForElement(found.el));
    }

    async function waitForVinDecodeCompletion(index, expectedVin, stageLabel) {
      const timeoutMs = runtime.decodeWaitTimeoutMs;
      const pollMs = runtime.decodePollIntervalMs;
      const start = Date.now();
      let pollCount = 0;
      let stableHits = 0;
      let stableSignature = '';
      let lastSnapshot = null;
      let lastBusy = false;

      while (Date.now() - start <= timeoutMs) {
        refreshSelectorContext();
        const snapshot = getVehicleDecodeSnapshot(index, templates, expectedVin);
        const busy = isLikelyVehicleDecodeBusy();
        const signature = [
          snapshot.vin,
          snapshot.year4,
          snapshot.make,
          snapshot.model,
          snapshot.style
        ].join('|');

        lastSnapshot = snapshot;
        lastBusy = busy;
        pollCount += 1;

        if (snapshot.decodeComplete) {
          if (signature === stableSignature) {
            stableHits += 1;
          } else {
            stableSignature = signature;
            stableHits = 1;
          }
        } else {
          stableSignature = '';
          stableHits = 0;
        }

        console.log('[NatGenVehicles][VIN Decode Wait Poll]', {
          vehicleIndex: index,
          stage: stageLabel,
          poll: pollCount,
          busy: busy,
          vin: snapshot.vin,
          year: snapshot.year,
          make: snapshot.make,
          model: snapshot.model,
          style: snapshot.style,
          decodeComplete: snapshot.decodeComplete,
          completionReason: snapshot.completionReason,
          stableHits: stableHits
        });

        if (snapshot.decodeComplete && stableHits >= 2 && !busy) {
          const elapsedMs = Date.now() - start;
          console.log('[NatGenVehicles][VIN Decode Wait Complete]', {
            vehicleIndex: index,
            stage: stageLabel,
            elapsedMs: elapsedMs,
            pollCount: pollCount,
            completionReason: snapshot.completionReason,
            snapshot: snapshot
          });
          return {
            ok: true,
            vehicleIndex: index,
            stage: stageLabel,
            pollCount: pollCount,
            elapsedMs: elapsedMs,
            completionReason: snapshot.completionReason,
            snapshot: snapshot
          };
        }

        await sleep(pollMs);
      }

      const elapsedMs = Date.now() - start;
      console.warn('[NatGenVehicles][VIN Decode Wait Timeout]', {
        vehicleIndex: index,
        stage: stageLabel,
        elapsedMs: elapsedMs,
        pollCount: pollCount,
        busy: lastBusy,
        snapshot: lastSnapshot
      });

      return {
        ok: false,
        vehicleIndex: index,
        stage: stageLabel,
        reason: 'decode_timeout',
        pollCount: pollCount,
        elapsedMs: elapsedMs,
        busy: lastBusy,
        snapshot: lastSnapshot
      };
    }

    function findNextIncompleteVehicle(startPayloadIndex, pageIndexes, defaults, opts) {
      const options = opts || {};
      const start = Math.max(1, Number(startPayloadIndex || 1));
      const skippedFailed = [];
      for (let payloadIndex = start; payloadIndex <= vehicles.length; payloadIndex += 1) {
        const vehicleStage = ensureVehicleStage(payloadIndex);
        if (vehicleStage.failedThisRun) {
          skippedFailed.push(payloadIndex);
          console.warn('[NatGenVehicles] Skipping vehicle already failed this run', {
            payloadVehicleIndex: payloadIndex,
            reason: vehicleStage.failureReason || '',
            stageContext: options.context || ''
          });
          continue;
        }

        const pageIndex = pageIndexes[payloadIndex - 1] || payloadIndex;
        const vehicle = vehicles[payloadIndex - 1] || {};
        const snapshot = getVehicleSnapshot(pageIndex, vehicle, defaults);
        if (!snapshot.complete) {
          if (skippedFailed.length && options.context === 'resume') {
            console.warn('[NatGenVehicles] Resume chose later vehicle because earlier vehicle(s) failed this run', {
              startPayloadIndex: start,
              skippedFailedVehicles: skippedFailed,
              chosenPayloadVehicleIndex: payloadIndex
            });
          }
          return {
            payloadIndex: payloadIndex,
            pageIndex: pageIndex,
            snapshot: snapshot
          };
        }
      }
      return null;
    }

    async function fillManualVehicleDecodedFields(pageIndex, vehicle, vehicleProgress) {
      const vehicleType = firstNonEmpty([
        safeGet(vehicle, 'vehicleType', ''),
        safeGet(vehicle, 'bodyType', ''),
        safeGet(vehicle, 'style', '')
      ]);
      const year = firstNonEmpty([
        safeGet(vehicle, 'year', ''),
        safeGet(vehicle, 'modelYear', '')
      ]);
      const make = firstNonEmpty([
        safeGet(vehicle, 'make', '')
      ]);
      const model = firstNonEmpty([
        safeGet(vehicle, 'model', '')
      ]);
      const style = mapStyle(vehicle);

      await writeField(pageIndex, 'vehicleType', [vehicleType, safeGet(vehicle, 'bodyType', ''), safeGet(vehicle, 'style', '')], 'Vehicle Type', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 2
      });

      await writeField(pageIndex, 'year', [year], 'Model Year', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 2,
        stabilizeAfterWrite: true
      });

      await writeField(pageIndex, 'make', [make], 'Make', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 2,
        stabilizeAfterWrite: true
      });

      await writeField(pageIndex, 'model', [model], 'Model', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 2,
        stabilizeAfterWrite: true
      });

      await writeField(pageIndex, 'style', [style, safeGet(vehicle, 'style', ''), safeGet(vehicle, 'bodyType', ''), 'Other'], 'Style', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 2,
        stabilizeAfterWrite: true
      });
    }

    async function fillPostVinFields(pageIndex, vehicle, defaults, vehicleProgress) {
      const primaryUse = firstNonEmpty([
        safeGet(vehicle, 'primaryUse', ''),
        safeGet(vehicle, 'use', ''),
        safeGet(vehicle, 'vehicleUse', ''),
        'Pleasure Use - 1A'
      ]);
      const deliveryCoverage = normalizeBoolLike(firstNonEmpty([
        safeGet(vehicle, 'deliveryCoverage', ''),
        safeGet(vehicle, 'isDeliveryVehicle', ''),
        'False'
      ]), 'False');
      const airbags = normalizeBoolLike(firstNonEmpty([
        safeGet(vehicle, 'airbags', ''),
        safeGet(vehicle, 'hasAirbags', ''),
        'True'
      ]), 'True');
      const paperFs1Needed = normalizeBoolLike(firstNonEmpty([
        safeGet(vehicle, 'paperFs1Needed', ''),
        safeGet(vehicle, 'paperFS1Needed', ''),
        'False'
      ]), 'False');
      const fr2Needed = normalizeBoolLike(firstNonEmpty([
        safeGet(vehicle, 'fr2Needed', ''),
        safeGet(vehicle, 'FR2Needed', ''),
        'False'
      ]), 'False');
      const state = firstNonEmpty([
        safeGet(vehicle, 'garagingAddress.state', ''),
        defaults.state
      ]);
      const zip = firstNonEmpty([
        safeGet(vehicle, 'garagingAddress.zip', ''),
        safeGet(vehicle, 'garagingAddress.postalCode', ''),
        safeGet(vehicle, 'garagingZip', ''),
        safeGet(vehicle, 'garageZip', ''),
        safeGet(vehicle, 'zip', ''),
        safeGet(vehicle, 'postalCode', ''),
        safeGet(vehicle, 'address.zip', ''),
        safeGet(vehicle, 'address.postalCode', ''),
        defaults.zip
      ]);
      const garagedOutState = normalizeBoolLike(firstNonEmpty([
        safeGet(vehicle, 'garagedOutOfState', ''),
        safeGet(vehicle, 'garagedOutState', ''),
        'False'
      ]), 'False');
      const lossPayeeAddIns = normalizeBoolLike(firstNonEmpty([
        safeGet(vehicle, 'lossPayeeAddIns', ''),
        safeGet(vehicle, 'hasLossPayee', ''),
        'False'
      ]), 'False');
      const originalOwner = normalizeBoolLike(firstNonEmpty([
        safeGet(vehicle, 'originalOwner', ''),
        safeGet(vehicle, 'isOriginalOwner', ''),
        'True'
      ]), 'True');

      await writeField(pageIndex, 'primaryUse', [primaryUse, 'Pleasure Use - 1A', '1A', 'Pleasure Use', 'Pleasure'], 'Primary Use', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 2
      });
      await writeField(pageIndex, 'deliveryCoverage', [deliveryCoverage, 'False', 'No'], 'Delivery Coverage', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
      await writeField(pageIndex, 'airbags', [airbags, 'True', 'Yes'], 'Airbags', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
      await writeField(pageIndex, 'paperFs1Needed', [paperFs1Needed, 'False', 'No'], 'Paper FS-1 Needed', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
      await writeField(pageIndex, 'fr2Needed', [fr2Needed, 'False', 'No'], 'FR2 Needed', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
      await writeField(pageIndex, 'state', [state], 'State', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
      await writeField(pageIndex, 'zip', [zip], 'Garaging Zip Code', vehicleProgress, {
        requireUsable: true
      });
      await writeField(pageIndex, 'garagedOutState', [garagedOutState, 'False', 'No'], 'Garaged Out of State', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
      await writeField(pageIndex, 'lossPayeeAddIns', [lossPayeeAddIns, 'False', 'No'], 'Loss Payee/Add Ins', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
      await writeField(pageIndex, 'originalOwner', [originalOwner, 'True', 'Yes'], 'Original Owner', vehicleProgress, {
        requireUsable: true,
        waitForOptions: true,
        minOptions: 1
      });
    }

    async function ensureVehicleBlocksExist(targetCount, quoteKey) {
      const indexes = getVehicleIndexes();
      if (indexes.length >= targetCount) {
        return { done: true, reloadTriggered: false, indexes: indexes };
      }

      refreshSelectorContext();
      const addSelector = chooseAddVehicleSelector(report);
      if (!addSelector) {
        result.ok = false;
        result.errors.push('Could not find Add Vehicle button selector');
        return { done: false, reloadTriggered: false, indexes: indexes };
      }

      const nextIndex = indexes.length + 1;
      trackStage('ensure-blocks', nextIndex, nextIndex, { action: 'add-vehicle' });
      savePending({
        phase: 'ensure',
        stage: 'ensure-blocks',
        targetCount: targetCount,
        expectedNextIndex: nextIndex
      });

      const clickResult = clickElement(addSelector);
      if (!clickResult.ok) {
        result.ok = false;
        result.errors.push('Failed clicking Add Vehicle: ' + addSelector);
        clearPendingNatGenVehicleFill();
        return { done: false, reloadTriggered: false, indexes: indexes };
      }

      result.warnings.push('Add Vehicle clicked for vehicle ' + nextIndex + '. Waiting for page reload to resume.');
      return { done: false, reloadTriggered: true, indexes: indexes };
    }

    const quoteKey = getCurrentQuoteKey();
    if (runtime.resumeState) {
      const resumeReady = await waitForExpectedVehicleAfterReload(
        runtime.resumeState.expectedNextIndex || runtime.resumeState.pageIndex,
        runtime.resumeState.targetCount || vehicles.length
      );
      if (!resumeReady) {
        result.warnings.push('Vehicle resume checkpoint not reached in time');
        return result;
      }
    }

    if (runtime.dryRun) {
      return result;
    }

    const initialIndexes = getVehicleIndexes();
    result.progress.vehicleIndexesBefore = initialIndexes.slice();

    const phase1 = await ensureVehicleBlocksExist(vehicles.length, quoteKey);
    if (phase1.reloadTriggered) {
      return result;
    }

    const pageIndexes = getVehicleIndexes();
    result.progress.vehicleIndexesAfterEnsure = pageIndexes.slice();

    if (pageIndexes.length < vehicles.length) {
      result.ok = false;
      result.errors.push('Vehicle block count did not reach payload count (' + pageIndexes.length + '/' + vehicles.length + ')');
      return result;
    }

    const defaultState = firstNonEmpty([
      safeGet(payload, 'customer.mailingAddress.state', ''),
      safeGet(payload, 'customer.residenceAddress.state', '')
    ]);
    const defaultZip = firstNonEmpty([
      safeGet(payload, 'customer.mailingAddress.zip', ''),
      safeGet(payload, 'customer.residenceAddress.zip', ''),
      safeGet(payload, 'customer.mailingAddress.postalCode', ''),
      safeGet(payload, 'customer.residenceAddress.postalCode', ''),
      safeGet(payload, 'customer.zip', ''),
      safeGet(payload, 'customer.postalCode', ''),
      safeGet(payload, 'namedInsureds.0.mailingAddress.zip', ''),
      safeGet(payload, 'namedInsureds.0.residenceAddress.zip', '')
    ]);

    let startPayloadIndex = 1;
    if (runtime.resumeState && runtime.resumeState.phase === 'fill' && runtime.resumeState.currentVehicleIndex) {
      startPayloadIndex = Math.max(1, Number(runtime.resumeState.currentVehicleIndex) || 1);
    }
    let nextVehicle = findNextIncompleteVehicle(
      startPayloadIndex,
      pageIndexes,
      { state: defaultState, zip: defaultZip },
      { context: runtime.resumeState ? 'resume' : 'initial' }
    );
    if (runtime.resumeState && nextVehicle && nextVehicle.payloadIndex > startPayloadIndex) {
      console.warn('[NatGenVehicles] Resume choosing later vehicle due prior failed-this-run vehicle state', {
        requestedStartPayloadVehicleIndex: startPayloadIndex,
        chosenPayloadVehicleIndex: nextVehicle.payloadIndex
      });
    }

    while (nextVehicle) {
      const i = nextVehicle.payloadIndex - 1;
      const payloadVehicleIndex = i + 1;
      const vehicle = vehicles[i] || {};
      const pageIndex = nextVehicle.pageIndex;
      const vehicleStage = ensureVehicleStage(payloadVehicleIndex);
      const vehicleProgress = {
        payloadIndex: payloadVehicleIndex,
        pageIndex: pageIndex,
        steps: []
      };
      result.progress.vehicles.push(vehicleProgress);

      if (vehicleStage.failedThisRun) {
        console.warn('[NatGenVehicles] Skipping vehicle because it is already failed-this-run', {
          vehicleIndex: pageIndex,
          payloadVehicleIndex: payloadVehicleIndex,
          reason: vehicleStage.failureReason || ''
        });
        nextVehicle = findNextIncompleteVehicle(
          payloadVehicleIndex + 1,
          pageIndexes,
          { state: defaultState, zip: defaultZip },
          { context: 'loop-skip-failed' }
        );
        continue;
      }

      const blockReady = await ensureVehicleBlockReady(pageIndex, runtime.stabilizationTimeoutMs);
      if (!blockReady) {
        result.warnings.push('Vehicle ' + pageIndex + ': block not ready');
        vehicleProgress.steps.push({ field: 'Block', ok: false, reason: 'not_ready' });
        markVehicleFailedThisRun(payloadVehicleIndex, 'block_not_ready', pageIndex, 'ensure-block-ready');
        savePending({
          phase: 'fill',
          stage: 'start-vehicle',
          currentVehicleIndex: payloadVehicleIndex,
          pageIndex: pageIndex,
          expectedNextIndex: pageIndex
        });
        nextVehicle = findNextIncompleteVehicle(
          payloadVehicleIndex + 1,
          pageIndexes,
          { state: defaultState, zip: defaultZip },
          { context: 'loop-after-block-not-ready' }
        );
        continue;
      }

      const payloadVin = cleanString(firstNonEmpty([
        safeGet(vehicle, 'vin', ''),
        safeGet(vehicle, 'vehicleIdentificationNumber', '')
      ]));

      trackStage('start-vehicle', payloadVehicleIndex, pageIndex);
      savePending({
        phase: 'fill',
        stage: 'start-vehicle',
        currentVehicleIndex: payloadVehicleIndex,
        pageIndex: pageIndex,
        expectedNextIndex: pageIndex
      });

      let snapshot = getVehicleSnapshot(pageIndex, vehicle, { state: defaultState, zip: defaultZip });
      const resumedAfterLookup = !!(
        runtime.resumeState &&
        runtime.resumeState.phase === 'fill' &&
        (runtime.resumeState.stage === 'wait-after-vin-lookup' || runtime.resumeState.stage === 'trigger-vin-lookup') &&
        Number(runtime.resumeState.currentVehicleIndex) === payloadVehicleIndex
      );

      if (resumedAfterLookup) {
        trackStage('wait-after-vin-lookup', payloadVehicleIndex, pageIndex);
        savePending({
          phase: 'fill',
          stage: 'wait-after-vin-lookup',
          currentVehicleIndex: payloadVehicleIndex,
          pageIndex: pageIndex,
          expectedNextIndex: pageIndex
        });

        if (payloadVin && vehicleStage.decodeWaitTimeouts >= 1) {
          console.warn('[NatGenVehicles] Skipping repeat VIN decode wait due max timeout attempts', {
            vehicleIndex: pageIndex,
            payloadVehicleIndex: payloadVehicleIndex,
            decodeWaitTimeouts: vehicleStage.decodeWaitTimeouts
          });
          markVehicleFailedThisRun(payloadVehicleIndex, 'decode_timeout_limit_reached', pageIndex, 'resume-wait');
        } else {
          updateVehicleStage(payloadVehicleIndex, { decodeAttempted: true });
          const decodeWaitFromResume = await waitForVinDecodeCompletion(pageIndex, payloadVin, 'wait-after-vin-lookup');
          if (!decodeWaitFromResume.ok) {
            incrementVehicleStageCounter(payloadVehicleIndex, 'decodeWaitTimeouts');
            updateVehicleStage(payloadVehicleIndex, { decodeTimedOut: true, decodeCompleted: false });
            markVehicleFailedThisRun(payloadVehicleIndex, 'decode_timeout_after_resume', pageIndex, 'wait-after-vin-lookup');
            console.warn('[NatGenVehicles] VIN decode timeout; manual decoded-field fallback disabled', {
              vehicleIndex: pageIndex,
              payloadVehicleIndex: payloadVehicleIndex,
              stage: 'wait-after-vin-lookup',
              payloadVin: payloadVin
            });
            result.warnings.push(
              'Vehicle ' + pageIndex + ': VIN decode timeout after resume. Snapshot: ' + JSON.stringify(decodeWaitFromResume.snapshot || {})
            );
            vehicleProgress.steps.push({ field: 'VIN Decode', ok: false, reason: 'decode_timeout_after_resume' });
          } else {
            updateVehicleStage(payloadVehicleIndex, {
              decodeTimedOut: false,
              decodeCompleted: true,
              failedThisRun: false,
              failureReason: ''
            });
          }
        }

        snapshot = getVehicleSnapshot(pageIndex, vehicle, { state: defaultState, zip: defaultZip });
      }

      const resumeFromPostFields = !!(vehicleStage.postFieldsStarted && !vehicleStage.postFieldsDone);
      if (resumeFromPostFields) {
        console.warn('[NatGenVehicles] Resuming vehicle from post-VIN fields stage', {
          vehicleIndex: pageIndex,
          payloadVehicleIndex: payloadVehicleIndex
        });
      }

      if (payloadVin && !snapshot.vinMatches) {
        if (vehicleStage.vinWriteAttempts >= 1) {
          result.warnings.push('Vehicle ' + pageIndex + ': VIN write attempt limit reached; skipping repeat set');
          vehicleProgress.steps.push({ field: 'VIN', ok: false, reason: 'vin_write_attempt_limit_reached' });
          markVehicleFailedThisRun(payloadVehicleIndex, 'vin_write_attempt_limit_reached', pageIndex, 'set-vin');
          console.warn('[NatGenVehicles] Moving to next vehicle despite incomplete current vehicle', {
            currentPayloadVehicleIndex: payloadVehicleIndex,
            nextPayloadVehicleIndex: payloadVehicleIndex + 1,
            reason: 'vin_write_attempt_limit_reached'
          });
          savePending({
            phase: 'fill',
            stage: 'set-vin',
            currentVehicleIndex: payloadVehicleIndex,
            pageIndex: pageIndex,
            expectedNextIndex: pageIndex
          });
          nextVehicle = findNextIncompleteVehicle(
            payloadVehicleIndex + 1,
            pageIndexes,
            { state: defaultState, zip: defaultZip },
            { context: 'loop-after-vin-write-limit' }
          );
          continue;
        }

        trackStage('set-vin', payloadVehicleIndex, pageIndex);
        incrementVehicleStageCounter(payloadVehicleIndex, 'vinWriteAttempts');
        savePending({
          phase: 'fill',
          stage: 'set-vin',
          currentVehicleIndex: payloadVehicleIndex,
          pageIndex: pageIndex,
          expectedNextIndex: pageIndex
        });

        const setVinResult = await setVinForVehicle(pageIndex, payloadVin, runtime.fieldFillTimeoutMs);
        if (setVinResult && setVinResult.ok) {
          vehicleProgress.steps.push({ field: 'VIN', ok: true, selector: setVinResult.selector });
          updateVehicleStage(payloadVehicleIndex, {
            vinWritten: true,
            failedThisRun: false,
            failureReason: ''
          });
        } else {
          vehicleProgress.steps.push({ field: 'VIN', ok: false, reason: (setVinResult && setVinResult.reason) || 'write_failed' });
          result.warnings.push('Vehicle ' + pageIndex + ': unable to set VIN');
          markVehicleFailedThisRun(payloadVehicleIndex, 'vin_write_failed', pageIndex, 'set-vin');
        }

        snapshot = getVehicleSnapshot(pageIndex, vehicle, { state: defaultState, zip: defaultZip });
      }

      if (payloadVin && !snapshot.vinMatches) {
        result.warnings.push('Vehicle ' + pageIndex + ': VIN does not match payload after write');
        markVehicleFailedThisRun(payloadVehicleIndex, 'vin_mismatch_after_write', pageIndex, 'set-vin');
        savePending({
          phase: 'fill',
          stage: 'set-vin',
          currentVehicleIndex: payloadVehicleIndex,
          pageIndex: pageIndex,
          expectedNextIndex: pageIndex
        });
        console.warn('[NatGenVehicles] Moving to next vehicle despite incomplete current vehicle', {
          currentPayloadVehicleIndex: payloadVehicleIndex,
          nextPayloadVehicleIndex: payloadVehicleIndex + 1,
          reason: 'vin_mismatch_after_write'
        });
        nextVehicle = findNextIncompleteVehicle(
          payloadVehicleIndex + 1,
          pageIndexes,
          { state: defaultState, zip: defaultZip },
          { context: 'loop-after-vin-mismatch' }
        );
        continue;
      }

      if (payloadVin && snapshot.vinMatches && !snapshot.decoded && !resumedAfterLookup && !resumeFromPostFields) {
        if (vehicleStage.lookupTriggered || vehicleStage.lookupAttempts >= 1) {
          console.warn('[NatGenVehicles] Vehicle skipped VIN lookup trigger because lookup was already attempted', {
            vehicleIndex: pageIndex,
            payloadVehicleIndex: payloadVehicleIndex,
            lookupTriggered: !!vehicleStage.lookupTriggered,
            lookupAttempts: Number(vehicleStage.lookupAttempts || 0)
          });
          result.warnings.push('Vehicle ' + pageIndex + ': VIN lookup already attempted; skipping repeated trigger');
          if (!snapshot.decoded) {
            markVehicleFailedThisRun(payloadVehicleIndex, 'lookup_already_attempted_decode_incomplete', pageIndex, 'trigger-vin-lookup');
          }
        } else {
          trackStage('trigger-vin-lookup', payloadVehicleIndex, pageIndex);
          incrementVehicleStageCounter(payloadVehicleIndex, 'lookupAttempts');
          const lookupTarget = findVinLookupTarget(pageIndex);
          const lookupSelector = lookupTarget ? cleanString(lookupTarget.selector || makeSelectorForElement(lookupTarget.el)) : '';
          if (lookupTarget && lookupTarget.el) {
            savePending({
              phase: 'fill',
              stage: 'trigger-vin-lookup',
              currentVehicleIndex: payloadVehicleIndex,
              pageIndex: pageIndex,
              expectedNextIndex: pageIndex,
              lookupSelector: lookupSelector
            });

            const lookupClick = clickElementNode(lookupTarget.el, lookupSelector);
            if (lookupClick.ok) {
              updateVehicleStage(payloadVehicleIndex, { lookupTriggered: true });
              vehicleProgress.steps.push({ field: 'VIN Lookup', ok: true, selector: lookupClick.selector || lookupSelector || '' });
              console.log('[NatGenVehicles][VIN Lookup Click]', {
                vehicleIndex: pageIndex,
                payloadVehicleIndex: payloadVehicleIndex,
                source: lookupTarget.source || '',
                selector: lookupClick.selector || lookupSelector || '',
                tag: lookupClick.tag || '',
                id: lookupClick.id || '',
                name: lookupClick.name || '',
                title: lookupClick.title || '',
                alt: lookupClick.alt || '',
                src: lookupClick.src || '',
                className: lookupClick.className || '',
                clickMethods: lookupClick.clickMethods || []
              });
              savePending({
                phase: 'fill',
                stage: 'wait-after-vin-lookup',
                currentVehicleIndex: payloadVehicleIndex,
                pageIndex: pageIndex,
                expectedNextIndex: pageIndex,
                lookupSelector: lookupSelector
              });

              if (vehicleStage.decodeWaitTimeouts >= 1) {
                console.warn('[NatGenVehicles] VIN decode timeout already recorded; skipping additional decode wait', {
                  vehicleIndex: pageIndex,
                  payloadVehicleIndex: payloadVehicleIndex,
                  decodeWaitTimeouts: vehicleStage.decodeWaitTimeouts
                });
                markVehicleFailedThisRun(payloadVehicleIndex, 'decode_timeout_limit_reached', pageIndex, 'post-lookup-click');
              } else {
                updateVehicleStage(payloadVehicleIndex, { decodeAttempted: true });
                const decodeWaitAfterClick = await waitForVinDecodeCompletion(pageIndex, payloadVin, 'post-lookup-click');
                if (!decodeWaitAfterClick.ok) {
                  incrementVehicleStageCounter(payloadVehicleIndex, 'decodeWaitTimeouts');
                  updateVehicleStage(payloadVehicleIndex, { decodeTimedOut: true, decodeCompleted: false });
                  markVehicleFailedThisRun(payloadVehicleIndex, 'decode_timeout_after_lookup_click', pageIndex, 'post-lookup-click');
                  console.warn('[NatGenVehicles] VIN decode timeout; manual decoded-field fallback disabled', {
                    vehicleIndex: pageIndex,
                    payloadVehicleIndex: payloadVehicleIndex,
                    stage: 'post-lookup-click',
                    payloadVin: payloadVin
                  });
                  result.warnings.push(
                    'Vehicle ' + pageIndex + ': VIN decode timeout after lookup click. Snapshot: ' + JSON.stringify(decodeWaitAfterClick.snapshot || {})
                  );
                  vehicleProgress.steps.push({ field: 'VIN Decode', ok: false, reason: 'decode_timeout_after_lookup_click' });
                } else {
                  updateVehicleStage(payloadVehicleIndex, {
                    decodeTimedOut: false,
                    decodeCompleted: true,
                    failedThisRun: false,
                    failureReason: ''
                  });
                }
              }

              snapshot = getVehicleSnapshot(pageIndex, vehicle, { state: defaultState, zip: defaultZip });
            } else {
              result.warnings.push('Vehicle ' + pageIndex + ': VIN lookup click failed');
              console.warn('[NatGenVehicles][VIN Lookup Click Failed]', {
                vehicleIndex: pageIndex,
                payloadVehicleIndex: payloadVehicleIndex,
                source: lookupTarget.source || '',
                selector: lookupClick.selector || lookupSelector || '',
                reason: lookupClick.reason || 'click_failed',
                tag: lookupClick.tag || '',
                id: lookupClick.id || '',
                name: lookupClick.name || '',
                title: lookupClick.title || '',
                alt: lookupClick.alt || '',
                src: lookupClick.src || '',
                className: lookupClick.className || ''
              });
              markVehicleFailedThisRun(payloadVehicleIndex, 'vin_lookup_click_failed', pageIndex, 'trigger-vin-lookup');
            }
          } else {
            result.warnings.push('Vehicle ' + pageIndex + ': VIN lookup icon not found');
            markVehicleFailedThisRun(payloadVehicleIndex, 'vin_lookup_selector_not_found', pageIndex, 'trigger-vin-lookup');
          }
        }
      }

      snapshot = getVehicleSnapshot(pageIndex, vehicle, { state: defaultState, zip: defaultZip });
      const vinStepCompleteAfterResume = !!(snapshot.vinMatches || snapshot.decoded);
      if (payloadVin && !vinStepCompleteAfterResume) {
        result.warnings.push('Vehicle ' + pageIndex + ': VIN step incomplete; manual decoded-field fallback disabled');
      }

      if (payloadVin) {
        console.log('[NatGenVehicles] VIN payload present, skipping manual decoded fields', {
          vehicleIndex: pageIndex,
          payloadVehicleIndex: payloadVehicleIndex,
          payloadVin: payloadVin,
          decoded: snapshot.decoded
        });
        if (!snapshot.decoded) {
          result.warnings.push('Vehicle ' + pageIndex + ': VIN decode incomplete; manual decoded-field fallback disabled');
          vehicleProgress.steps.push({ field: 'VIN Decode', ok: false, reason: 'decode_incomplete_manual_fallback_disabled' });
          if (vehicleStage.lookupTriggered || vehicleStage.decodeAttempted) {
            markVehicleFailedThisRun(payloadVehicleIndex, 'decode_incomplete_after_lookup_attempt', pageIndex, 'post-vin-check');
          }
        }
      } else {
        await fillManualVehicleDecodedFields(pageIndex, vehicle, vehicleProgress);
      }

      trackStage('fill-post-vin-fields', payloadVehicleIndex, pageIndex);
      updateVehicleStage(payloadVehicleIndex, { postFieldsStarted: true });
      savePending({
        phase: 'fill',
        stage: 'fill-post-vin-fields',
        currentVehicleIndex: payloadVehicleIndex,
        pageIndex: pageIndex,
        expectedNextIndex: pageIndex
      });
      await fillPostVinFields(pageIndex, vehicle, { state: defaultState, zip: defaultZip }, vehicleProgress);
      updateVehicleStage(payloadVehicleIndex, { postFieldsDone: true });

      trackStage('finalize-vehicle', payloadVehicleIndex, pageIndex);
      savePending({
        phase: 'fill',
        stage: 'finalize-vehicle',
        currentVehicleIndex: payloadVehicleIndex,
        pageIndex: pageIndex,
        expectedNextIndex: pageIndex
      });

      const finalSnapshot = getVehicleSnapshot(pageIndex, vehicle, { state: defaultState, zip: defaultZip });
      if (!finalSnapshot.complete) {
        result.warnings.push('Vehicle ' + pageIndex + ': still incomplete after fill pass');
        if (payloadVin) {
          markVehicleFailedThisRun(payloadVehicleIndex, 'incomplete_after_fill_pass', pageIndex, 'finalize-vehicle');
          console.warn('[NatGenVehicles] Moving from vehicle to next despite incomplete state', {
            currentPayloadVehicleIndex: payloadVehicleIndex,
            nextPayloadVehicleIndex: payloadVehicleIndex + 1,
            currentPageVehicleIndex: pageIndex
          });
        }
      } else {
        updateVehicleStage(payloadVehicleIndex, {
          failedThisRun: false,
          failureReason: '',
          decodeCompleted: payloadVin ? true : vehicleStage.decodeCompleted
        });
      }

      if (runtime.interVehicleDelayMs > 0) await sleep(runtime.interVehicleDelayMs);
      nextVehicle = findNextIncompleteVehicle(
        payloadVehicleIndex + 1,
        pageIndexes,
        { state: defaultState, zip: defaultZip },
        { context: 'loop-next' }
      );
    }

    if (runtime.enableResume && runtime.startedByTest) {
      clearPendingNatGenVehicleFill();
    }

    if (result.errors.length) {
      result.ok = false;
    }

    return result;
  }

  async function resumePendingNatGenVehicleFillIfNeeded() {
    const pending = readPendingNatGenVehicleFill();
    if (!pending) return;

    if (pending.startedByTest !== true) {
      clearPendingNatGenVehicleFill();
      return;
    }

    if (isPendingExpired(pending)) {
      clearPendingNatGenVehicleFill();
      return;
    }

    const currentQuoteKey = getCurrentQuoteKey();
    const pendingQuoteKey = cleanString(pending.quoteKey);
    if (pendingQuoteKey && currentQuoteKey && pendingQuoteKey !== currentQuoteKey) {
      clearPendingNatGenVehicleFill();
      return;
    }

    const payload = loadStoredPayload();
    if (!payload) {
      clearPendingNatGenVehicleFill();
      return;
    }

    await fillNatGenVehicles(payload, {
      enableResume: true,
      startedByTest: true,
      resumeState: pending
    });
  }

  function testSetVinForDebug(index, vin) {
    const requestedIndex = parseInt(index, 10);
    const expected = cleanString(vin);
    if (Number.isNaN(requestedIndex) || requestedIndex < 0) {
      return { ok: false, reason: 'invalid_index', requestedVehicleIndex: Number.isNaN(requestedIndex) ? null : requestedIndex };
    }
    const controlNumber = requestedIndex === 0 ? 1 : requestedIndex;
    if (!expected) {
      return { ok: false, reason: 'empty_vin', requestedVehicleIndex: requestedIndex, controlNumber: controlNumber };
    }

    const report = buildSelectorReport();
    const templates = report && report.templates ? report.templates : {};

    const first = findVinInputForVehicle(controlNumber, templates);
    if (!first || !first.el) {
      return {
        ok: false,
        reason: 'vin_input_not_found',
        requestedVehicleIndex: requestedIndex,
        controlNumber: controlNumber,
        scan: scanVehicleVinInputs()
      };
    }

    const attempt1 = setInputValueNativeWithEvents(first.el, expected);
    let finalSelector = first.selector;
    let finalIsHidden = lower(first.el.type) === 'hidden';
    let verified = attempt1.verified === true;
    let attempt2 = null;

    console.log('[NatGenVehicles][VIN Debug Set]', {
      requestedVehicleIndex: requestedIndex,
      controlNumber: controlNumber,
      selector: first.selector,
      isHidden: lower(first.el.type) === 'hidden',
      before: attempt1.before,
      after: attempt1.after,
      verificationPassed: attempt1.verified
    });

    if (!verified) {
      const report2 = buildSelectorReport();
      const templates2 = report2 && report2.templates ? report2.templates : {};
      const second = findVinInputForVehicle(controlNumber, templates2);
      if (second && second.el) {
        attempt2 = setInputValueNativeWithEvents(second.el, expected);
        finalSelector = second.selector;
        finalIsHidden = lower(second.el.type) === 'hidden';
        verified = attempt2.verified === true;
        console.log('[NatGenVehicles][VIN Debug Set Retry]', {
          requestedVehicleIndex: requestedIndex,
          controlNumber: controlNumber,
          selector: second.selector,
          isHidden: lower(second.el.type) === 'hidden',
          before: attempt2.before,
          after: attempt2.after,
          verificationPassed: attempt2.verified
        });
      }
    }

    return {
      ok: verified,
      requestedVehicleIndex: requestedIndex,
      controlNumber: controlNumber,
      selectorUsed: finalSelector,
      isHidden: finalIsHidden,
      expected: expected,
      attempt1: {
        before: attempt1.before,
        after: attempt1.after,
        isHidden: lower(first.el.type) === 'hidden',
        verificationPassed: attempt1.verified
      },
      attempt2: attempt2 ? {
        before: attempt2.before,
        after: attempt2.after,
        isHidden: finalIsHidden,
        verificationPassed: attempt2.verified
      } : null,
      scan: scanVehicleVinInputs()
    };
  }

  function findVinLookupForDebug(index) {
    const requestedIndex = parseInt(index, 10);
    if (Number.isNaN(requestedIndex) || requestedIndex < 0) {
      return {
        ok: false,
        reason: 'invalid_index',
        requestedVehicleIndex: Number.isNaN(requestedIndex) ? null : requestedIndex
      };
    }

    const controlNumber = requestedIndex === 0 ? 1 : requestedIndex;
    const report = buildSelectorReport();
    const templates = report && report.templates ? report.templates : {};
    const vinFound = findVinInputForVehicle(controlNumber, templates);
    const lookupFound = findVinLookupElementForVehicle(controlNumber, templates);

    return {
      ok: !!(lookupFound && lookupFound.el),
      requestedVehicleIndex: requestedIndex,
      controlNumber: controlNumber,
      vinSelector: vinFound ? cleanString(vinFound.selector || makeSelectorForElement(vinFound.el)) : '',
      lookup: lookupFound ? {
        selector: cleanString(lookupFound.selector || makeSelectorForElement(lookupFound.el)),
        source: cleanString(lookupFound.source || ''),
        details: getElementDebugSummary(lookupFound.el, lookupFound.selector)
      } : null
    };
  }

  function clickVinLookupForDebug(index) {
    const requestedIndex = parseInt(index, 10);
    if (Number.isNaN(requestedIndex) || requestedIndex < 0) {
      return {
        ok: false,
        reason: 'invalid_index',
        requestedVehicleIndex: Number.isNaN(requestedIndex) ? null : requestedIndex
      };
    }

    const controlNumber = requestedIndex === 0 ? 1 : requestedIndex;
    const report = buildSelectorReport();
    const templates = report && report.templates ? report.templates : {};
    const lookupFound = findVinLookupElementForVehicle(controlNumber, templates);
    if (!lookupFound || !lookupFound.el) {
      return {
        ok: false,
        reason: 'vin_lookup_not_found',
        requestedVehicleIndex: requestedIndex,
        controlNumber: controlNumber,
        lookup: null
      };
    }

    const selector = cleanString(lookupFound.selector || makeSelectorForElement(lookupFound.el));
    const clickResult = clickElementNode(lookupFound.el, selector);
    return {
      ok: !!clickResult.ok,
      requestedVehicleIndex: requestedIndex,
      controlNumber: controlNumber,
      source: cleanString(lookupFound.source || ''),
      selector: selector,
      click: clickResult
    };
  }

  const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  root.probeNatGenVehicleSelectors = probeNatGenVehicleSelectors;
  root.fillNatGenVehicles = fillNatGenVehicles;
  root.clearPendingNatGenVehicleFill = clearPendingNatGenVehicleFill;
  root.testNatGenVehicles = async function (opts) {
    const payload = loadStoredPayload();
    if (!payload) {
      alert('No stored payload found');
      return { ok: false, errors: ['No stored payload found'], warnings: [], filled: [] };
    }

    clearPendingNatGenVehicleFill();

    const nextOpts = Object.assign({}, opts || {}, {
      enableResume: true,
      startedByTest: true
    });

    return fillNatGenVehicles(payload, nextOpts);
  };

  window.probeNatGenVehicleSelectors = probeNatGenVehicleSelectors;
  window.fillNatGenVehicles = fillNatGenVehicles;
  window.clearPendingNatGenVehicleFill = clearPendingNatGenVehicleFill;

  root.__natgenVehicleDebug = {
    getPending: function () {
      return typeof loadPendingNatGenVehicleFill === 'function' ? loadPendingNatGenVehicleFill() : null;
    },
    clearPending: function () {
      return typeof clearPendingNatGenVehicleFill === 'function' ? clearPendingNatGenVehicleFill() : null;
    },
    scanVinInputs: function () {
      return scanVehicleVinInputs();
    },
    scanVehicleBlock: function (index) {
      return scanVehicleBlock(index);
    },
    findVinLookup: function (index) {
      return findVinLookupForDebug(index);
    },
    clickVinLookup: function (index) {
      return clickVinLookupForDebug(index);
    },
    testSetVin: function (index, vin) {
      return testSetVinForDebug(index, vin);
    }
  };
  window.__natgenVehicleDebug = root.__natgenVehicleDebug;

  setTimeout(function () {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      String(window.location.pathname || '').indexOf(TARGET_PAGE_HINT) === -1
    ) {
      return;
    }
    resumePendingNatGenVehicleFillIfNeeded().catch(function () {
      clearPendingNatGenVehicleFill();
    });
  }, 0);
})();

  /* =========================================================
     MODULE: COVERAGES FILLER
     Source: ERIE_TO_NATGEN_COVERAGES_FILLER_V1.js
     ========================================================= */

(function () {
  'use strict';

  const LOG = '[NatGenCoveragesV1]';

  function text(v) {
    return v == null ? '' : String(v).trim();
  }

  function alnumUpper(v) {
    return text(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normalizeOptionText(v) {
    return text(v).toLowerCase().replace(/[$,\s]/g, '');
  }

  function normalizeLooseText(v) {
    return text(v)
      .toLowerCase()
      .replace(/[$,]/g, '')
      .replace(/\s+/g, '')
      .replace(/deductible|day|loss/g, '');
  }

  function normalizeLooseCompact(v) {
    return normalizeLooseText(v).replace(/[^a-z0-9]/g, '');
  }

  function canonicalMake(v) {
    const key = alnumUpper(v);
    const aliases = {
      CHEVROLET: 'CHEV',
      CHEVY: 'CHEV',
      CHEV: 'CHEV',
      TOYOTA: 'TOYT',
      TOYO: 'TOYT',
      TOYT: 'TOYT',
      BMW: 'BMW'
    };
    return aliases[key] || key;
  }

  function extractNumbers(v) {
    const matches = text(v).match(/\d+/g);
    if (!matches) return [];
    return matches.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return !Number.isNaN(n); });
  }

  function firstCoverageByCode(coverages, code) {
    const target = alnumUpper(code);
    for (let i = 0; i < (Array.isArray(coverages) ? coverages.length : 0); i += 1) {
      const item = coverages[i] || {};
      if (alnumUpper(item.coverageCode) === target) return item;
    }
    return null;
  }

  function getPolicyCoverageAliases(code) {
    const key = alnumUpper(code);
    const aliases = {
      BODILYINJURY: ['BodilyInjury'],
      PROPERTYDAMAGE: ['PropertyDamage'],
      UIMBODILYINJURY: ['UIMBodilyInjury', 'UnderinsuredMotoristBodilyInjury'],
      UNDERINSUREDMOTORISTBODILYINJURY: ['UIMBodilyInjury', 'UnderinsuredMotoristBodilyInjury'],
      UMPROPERTYDAMAGE: ['UMPropertyDamage', 'UninsuredMotoristPropertyDamage'],
      UNINSUREDMOTORISTPROPERTYDAMAGE: ['UMPropertyDamage', 'UninsuredMotoristPropertyDamage']
    };
    return aliases[key] || [code];
  }

  function getVehicleCoverageAliases(code) {
    const key = alnumUpper(code);
    const aliases = {
      MEDICALPAYMENTS: ['MedicalPayments', 'MedicalPayment', 'MedPay'],
      COMPREHENSIVE: ['Comprehensive', 'OtherThanCollision', 'OTC'],
      COLLISION: ['Collision', 'Coll'],
      EXTENDEDTRANSPORTATIONEXP: ['ExtendedTransportationExp', 'ExtendedTransportation', 'TransportationExpenses', 'RentalReimbursement', 'LossOfUse'],
      ROADSERVICE: ['RoadService', 'Towing', 'Tow', 'Roadside'],
      REPAIRORREPLACEMENT: ['RepairOrReplacement', 'LoanLeaseCoverage', 'AutoLoanLeaseCoverage'],
      INCRSCUSTOMIZEDEQUIPMENT: ['IncrsCustomizedEquipment', 'CustomizedEquipment', 'CustomEquipment']
    };
    return aliases[key] || [code];
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function asObjectValuesArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; });
    return [];
  }

  function safeGet(obj, path) {
    const parts = String(path || '').split('.');
    let cur = obj;
    for (let i = 0; i < parts.length; i += 1) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function firstText(values) {
    for (let i = 0; i < values.length; i += 1) {
      const v = text(values[i]);
      if (v) return v;
    }
    return '';
  }

  function readCodeToken(v) {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return text(v);
    if (typeof v === 'object') {
      const candidates = ['Code', 'code', 'Value', 'value', 'Name', 'name', 'Display', 'display', 'Id', 'id', 'Limit', 'limit'];
      for (let i = 0; i < candidates.length; i += 1) {
        const k = candidates[i];
        const out = text(v[k]);
        if (out) return out;
      }
    }
    return text(v);
  }

  function readCoverageCode(item) {
    const c = item || {};
    return firstText([
      readCodeToken(c.coverageCode),
      readCodeToken(c.CoverageCode),
      readCodeToken(safeGet(c, 'CoverageCode.Code')),
      readCodeToken(c.code),
      readCodeToken(c.Code),
      readCodeToken(safeGet(c, 'Coverage.Code'))
    ]);
  }

  function readCoverageLimit(item) {
    const c = item || {};
    return firstText([
      readCodeToken(c.coverageLimit),
      readCodeToken(c.CoverageLimit),
      readCodeToken(c.limit),
      readCodeToken(c.Limit),
      readCodeToken(c.LimitCode),
      readCodeToken(safeGet(c, 'LimitCode.Code')),
      readCodeToken(safeGet(c, 'CoverageLimit.Code'))
    ]);
  }

  function readCoverageDescription(item) {
    const c = item || {};
    return firstText([
      c.coverageDescription,
      c.CoverageDescription,
      c.description,
      c.Description,
      safeGet(c, 'CoverageCode.Description')
    ]);
  }

  function readSummaryDescription(item) {
    const c = item || {};
    return firstText([
      c.summaryDescription,
      c.SummaryDescription,
      c.summary,
      c.Summary,
      safeGet(c, 'CoverageSummary.Description')
    ]);
  }

  function parseVehicleDescription(desc) {
    const raw = text(desc);
    const parts = raw.split(/\s+/).filter(Boolean);
    if (!parts.length) return { year: '', make: '', model: '', raw: raw };
    const year = /^\d{4}$/.test(parts[0]) ? parts[0] : '';
    if (!year) return { year: '', make: parts[0] || '', model: parts.slice(1).join(' '), raw: raw };
    return { year: year, make: parts[1] || '', model: parts.slice(2).join(' '), raw: raw };
  }

  function vehicleDescriptorFromVehicle(v) {
    const vehicle = v || {};
    return {
      year: text(vehicle.year || vehicle.Year),
      make: text(vehicle.make || vehicle.Make),
      model: text(vehicle.model || vehicle.Model)
    };
  }

  function vehicleDescriptorsMatch(a, b) {
    const va = a || {};
    const vb = b || {};
    const yearA = text(va.year);
    const yearB = text(vb.year);
    if (yearA && yearB && yearA !== yearB) return false;
    if (!yearA || !yearB) return false;
    if (!makeEquivalent(va.make, vb.make)) return false;
    return modelEquivalent(va.model, vb.model);
  }

  function normalizeCoverageItem(item, sourcePath) {
    const c = item || {};
    return {
      coverageCode: readCoverageCode(c),
      coverageDescription: readCoverageDescription(c),
      summaryDescription: readSummaryDescription(c),
      coverageLimit: readCoverageLimit(c),
      premium: c.premium != null ? c.premium : c.Premium,
      premium2: c.premium2 != null ? c.premium2 : c.Premium2,
      __sourcePath: sourcePath || ''
    };
  }

  function resolvePayloadRoot(payload) {
    const candidates = [
      { path: 'payload', value: payload },
      { path: 'payload.payload', value: payload && payload.payload },
      { path: 'payload.data', value: payload && payload.data },
      { path: 'payload.erieMasterPayload', value: payload && payload.erieMasterPayload },
      { path: 'payload.mciMasterPayload', value: payload && payload.mciMasterPayload },
      { path: 'payload.masterPayload', value: payload && payload.masterPayload }
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const c = candidates[i];
      if (!c.value || typeof c.value !== 'object') continue;
      if (Array.isArray(c.value.vehicles) || c.value.coverages || (c.value.raw && c.value.raw.coverages)) {
        return c;
      }
    }

    return { path: 'payload', value: payload || {} };
  }

  function normalizeErieCoverageSources(payload) {
    const rootInfo = resolvePayloadRoot(payload);
    const root = rootInfo.value || {};

    const policyCandidates = [
      { path: rootInfo.path + '.coverages.policy.policyCoverages', list: root && root.coverages && root.coverages.policy && root.coverages.policy.policyCoverages },
      { path: rootInfo.path + '.coverages.policy.PolicyCoverages', list: root && root.coverages && root.coverages.policy && root.coverages.policy.PolicyCoverages },
      { path: rootInfo.path + '.coverages.policyCoverages', list: root && root.coverages && root.coverages.policyCoverages },
      { path: rootInfo.path + '.policyCoverages', list: root && root.policyCoverages },
      { path: rootInfo.path + '.raw.coverages.data.PolicyCoverageItems', list: root && root.raw && root.raw.coverages && root.raw.coverages.data && root.raw.coverages.data.PolicyCoverageItems }
    ];

    let policyPathUsed = policyCandidates[0].path;
    let policyRaw = [];
    for (let i = 0; i < policyCandidates.length; i += 1) {
      const list = asObjectValuesArray(policyCandidates[i].list);
      if (list.length) {
        policyRaw = list;
        policyPathUsed = policyCandidates[i].path;
        break;
      }
    }

    const normalizedPolicyCoverages = policyRaw.map(function (c, idx) {
      return normalizeCoverageItem(c, policyPathUsed + '[' + idx + ']');
    });

    const baseVehicles = asArray(root && root.vehicles);
    const vehicleGroupCandidates = [
      { path: rootInfo.path + '.coverages.vehicleCoverages', list: root && root.coverages && root.coverages.vehicleCoverages },
      { path: rootInfo.path + '.coverages.VehicleCoverages', list: root && root.coverages && root.coverages.VehicleCoverages },
      { path: rootInfo.path + '.vehicleCoverages', list: root && root.vehicleCoverages },
      { path: rootInfo.path + '.raw.coverages.data.VehicleCoverageItems', list: root && root.raw && root.raw.coverages && root.raw.coverages.data && root.raw.coverages.data.VehicleCoverageItems }
    ];

    let vehicleGroupsPathUsed = vehicleGroupCandidates[0].path;
    let vehicleGroups = [];
    for (let vg = 0; vg < vehicleGroupCandidates.length; vg += 1) {
      const list = asObjectValuesArray(vehicleGroupCandidates[vg].list);
      if (list.length) {
        vehicleGroups = list;
        vehicleGroupsPathUsed = vehicleGroupCandidates[vg].path;
        break;
      }
    }

    const normalizedVehicles = baseVehicles.map(function (v) {
      return Object.assign({}, v || {}, { coverages: asObjectValuesArray(v && v.coverages) });
    });
    const normalizedVehicleCoveragesByIndex = [];
    const vehicleCoveragePathsByIndex = [];

    const normalizedVehicleCoverageGroups = asObjectValuesArray(vehicleGroups).map(function (group, idx) {
      const g = group || {};
      const rawCoverages = asObjectValuesArray(g.coverages || g.Coverages || g.VehicleCoverages || g.CoverageItems);
      const sourcePathBase = vehicleGroupsPathUsed + '[' + idx + ']';
      return {
        vehicleIndex: idx,
        vehicleId: text(g.vehicleId || g.VehicleId || g.id || g.Id),
        vehicleDescription: text(g.vehicleDescription || g.VehicleDescription || g.description || g.Description),
        coverages: rawCoverages.map(function (c, cIdx) {
          return normalizeCoverageItem(c, sourcePathBase + '.coverages[' + cIdx + ']');
        }),
        __groupSourcePath: sourcePathBase
      };
    });

    function findGroupByVehicle(vehicle, vehicleIndex) {
      const v = vehicle || {};
      const desc = vehicleDescriptorFromVehicle(v);
      const vehicleId = text(v.vehicleId || v.VehicleId);
      const byIndex = normalizedVehicleCoverageGroups[vehicleIndex] || null;
      if (byIndex && Array.isArray(byIndex.coverages) && byIndex.coverages.length) {
        return { group: byIndex, path: byIndex.__groupSourcePath + '.coverages', method: 'group_index' };
      }

      if (vehicleId) {
        const byId = normalizedVehicleCoverageGroups.find(function (g) {
          return text(g && g.vehicleId) === vehicleId && Array.isArray(g.coverages) && g.coverages.length;
        }) || null;
        if (byId) return { group: byId, path: byId.__groupSourcePath + '.coverages', method: 'group_vehicleId' };
      }

      if (desc.year && desc.make && desc.model) {
        const byDesc = normalizedVehicleCoverageGroups.find(function (g) {
          const parsed = parseVehicleDescription(g && g.vehicleDescription);
          return vehicleDescriptorsMatch(desc, parsed) && Array.isArray(g.coverages) && g.coverages.length;
        }) || null;
        if (byDesc) return { group: byDesc, path: byDesc.__groupSourcePath + '.coverages', method: 'group_vehicleDescription' };
      }

      return null;
    }

    for (let i = 0; i < normalizedVehicles.length; i += 1) {
      const vehicle = normalizedVehicles[i] || {};
      const vehicleSelfCoverages = asObjectValuesArray(vehicle.coverages);
      let sourcePath = rootInfo.path + '.vehicles[' + i + '].coverages';
      let list = [];

      const groupMatch = findGroupByVehicle(vehicle, i);
      if (groupMatch && Array.isArray(groupMatch.group.coverages) && groupMatch.group.coverages.length) {
        list = groupMatch.group.coverages.slice();
        sourcePath = groupMatch.path;
      } else if (vehicleSelfCoverages.length) {
        list = vehicleSelfCoverages.map(function (c, cIdx) {
          return normalizeCoverageItem(c, sourcePath + '[' + cIdx + ']');
        });
      }

      normalizedVehicles[i].coverages = list;
      normalizedVehicleCoveragesByIndex[i] = list;
      vehicleCoveragePathsByIndex[i] = sourcePath;
    }

    if (!normalizedVehicles.length && normalizedVehicleCoverageGroups.length) {
      for (let i = 0; i < normalizedVehicleCoverageGroups.length; i += 1) {
        const g = normalizedVehicleCoverageGroups[i];
        const parsed = parseVehicleDescription(g.vehicleDescription);
        normalizedVehicles.push({
          vehicleId: g.vehicleId,
          year: parsed.year,
          make: parsed.make,
          model: parsed.model,
          coverages: g.coverages.slice()
        });
        normalizedVehicleCoveragesByIndex[i] = g.coverages.slice();
        vehicleCoveragePathsByIndex[i] = g.__groupSourcePath + '.coverages';
      }
    }

    const normalizedVehicleGroups = vehicleGroups.length
      ? asObjectValuesArray(vehicleGroups).map(function (g, idx) {
        const copy = Object.assign({}, g || {});
        const raw = asObjectValuesArray(copy.coverages || copy.Coverages || copy.VehicleCoverages || copy.CoverageItems);
        copy.coverages = raw.map(function (c, cIdx) {
          return normalizeCoverageItem(c, vehicleGroupsPathUsed + '[' + idx + '].coverages[' + cIdx + ']');
        });
        return copy;
      })
      : normalizedVehicles.map(function (v, idx) {
        return {
          vehicleIndex: idx,
          vehicleId: text(v && v.vehicleId),
          vin: text(v && v.vin),
          coverages: normalizedVehicleCoveragesByIndex[idx] || []
        };
      });

    const normalizedCoverages = Object.assign({}, root && root.coverages ? root.coverages : {});
    normalizedCoverages.policy = Object.assign({}, normalizedCoverages.policy || {}, {
      policyCoverages: normalizedPolicyCoverages
    });
    normalizedCoverages.vehicleCoverages = normalizedVehicleGroups;

    const normalizedPayload = Object.assign({}, root, {
      vehicles: normalizedVehicles,
      coverages: normalizedCoverages
    });

    return {
      payload: normalizedPayload,
      payloadRootPath: rootInfo.path,
      policyPathUsed: policyPathUsed,
      vehicleGroupsPathUsed: vehicleGroupsPathUsed,
      normalizedPolicyCoverages: normalizedPolicyCoverages,
      normalizedVehicleCoveragesByIndex: normalizedVehicleCoveragesByIndex,
      normalizedVehicleCoverageGroups: normalizedVehicleCoverageGroups,
      vehicleCoveragePathsByIndex: vehicleCoveragePathsByIndex
    };
  }

  function findPolicyCoverageByCode(payload, requestedCode) {
    const payloadCoverages = (payload && payload.coverages) || undefined;
    const payloadPolicy = payloadCoverages && payloadCoverages.policy;
    const list = payloadPolicy && payloadPolicy.policyCoverages;
    const policyCoverages = Array.isArray(list) ? list : [];
    const requested = text(requestedCode).toLowerCase();
    const requestedNorm = alnumUpper(requestedCode);
    const scannedCodes = [];
    let matched = null;

    for (let i = 0; i < policyCoverages.length; i += 1) {
      const item = policyCoverages[i] || {};
      const code = text(readCoverageCode(item)).toLowerCase();
      const codeNorm = alnumUpper(readCoverageCode(item));
      scannedCodes.push(code);
      if (code === requested || codeNorm === requestedNorm) {
        matched = item && item.__sourcePath ? item : normalizeCoverageItem(item, 'policyCoverages[' + i + ']');
        break;
      }
      if (codeNorm && requestedNorm && (codeNorm.indexOf(requestedNorm) >= 0 || requestedNorm.indexOf(codeNorm) >= 0)) {
        matched = item && item.__sourcePath ? item : normalizeCoverageItem(item, 'policyCoverages[' + i + ']');
        break;
      }
    }

    const returned = matched ? text(matched.coverageLimit) : '';
    console.log('Policy lookup', {
      payloadCoverages: payloadCoverages,
      payloadPolicy: payloadPolicy,
      payloadPolicyCoverages: list,
      requestedCode: requestedCode,
      listLength: policyCoverages.length,
      scannedCodes: scannedCodes,
      matched: matched,
      returned: returned
    });

    return matched;
  }

  function findPolicyCoverage(payload, code) {
    const aliases = getPolicyCoverageAliases(code);
    for (let i = 0; i < aliases.length; i += 1) {
      const found = findPolicyCoverageByCode(payload, aliases[i]);
      if (found) return found;
    }

    if (alnumUpper(code) === 'BODILYINJURY') {
      const priorBi = text(payload && payload.customer && payload.customer.currentInsurance && payload.customer.currentInsurance.autoPriorBILimits);
      if (priorBi) {
        return {
          coverageCode: 'BodilyInjury',
          coverageLimit: priorBi,
          coverageDescription: 'Bodily Injury',
          summaryDescription: '',
          __sourcePath: 'normalized.customer.currentInsurance.autoPriorBILimits'
        };
      }
    }

    return null;
  }

  function findVehicleCoverage(payload, vehicleIndex, requestedCode) {
    const vehicles = Array.isArray(payload && payload.vehicles) ? payload.vehicles : [];
    const vehicle = vehicles[vehicleIndex] || {};
    let list = asObjectValuesArray(vehicle.coverages);
    const requested = text(requestedCode).toLowerCase();
    const requestedNorm = alnumUpper(requestedCode);
    const aliases = getVehicleCoverageAliases(requestedCode).map(function (x) { return alnumUpper(x); });
    const scannedCodes = [];
    let matched = null;
    let sourcePath = 'payload.vehicles[' + vehicleIndex + '].coverages';

    if (!list.length) {
      const groups = Array.isArray((((payload || {}).coverages || {}).vehicleCoverages))
        ? payload.coverages.vehicleCoverages
        : [];
      const vehicleId = text(vehicle.vehicleId);
      let group = null;

      if (vehicleId) {
        const vehicleIdNorm = vehicleId.toLowerCase();
        group = groups.find(function (g) {
          return text((g && (g.vehicleId || g.VehicleId))).toLowerCase() === vehicleIdNorm;
        }) || null;
      }

      if (!group && groups[vehicleIndex]) {
        group = groups[vehicleIndex];
      }

      if (group) {
        list = asObjectValuesArray(group.coverages || group.Coverages || group.VehicleCoverages || group.CoverageItems);
        sourcePath = vehicleId ? 'payload.coverages.vehicleCoverages(by vehicleId).coverages' : 'payload.coverages.vehicleCoverages[' + vehicleIndex + '].coverages';
      }
    }

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i] || {};
      const code = text(readCoverageCode(item)).toLowerCase();
      const codeNorm = alnumUpper(readCoverageCode(item));
      scannedCodes.push(code);
      if (code === requested || codeNorm === requestedNorm) {
        matched = item && item.__sourcePath ? item : normalizeCoverageItem(item, sourcePath + '[' + i + ']');
        break;
      }
      for (let a = 0; a < aliases.length; a += 1) {
        const aliasNorm = aliases[a];
        if (!aliasNorm || !codeNorm) continue;
        if (codeNorm === aliasNorm || codeNorm.indexOf(aliasNorm) >= 0 || aliasNorm.indexOf(codeNorm) >= 0) {
          matched = item && item.__sourcePath ? item : normalizeCoverageItem(item, sourcePath + '[' + i + ']');
          break;
        }
      }
      if (matched) break;
    }

    const returned = matched ? text(matched.coverageLimit) : '';
    console.log('Vehicle lookup', {
      vehicleIndex: vehicleIndex,
      vehicle: vehicle,
      vehicleCoverages: vehicle && vehicle.coverages,
      sourcePath: sourcePath,
      aliases: aliases,
      requestedCode: requestedCode,
      listLength: list.length,
      scannedCodes: scannedCodes,
      matched: matched,
      returned: returned
    });

    return matched;
  }

  function makeEquivalent(a, b) {
    const x = canonicalMake(a);
    const y = canonicalMake(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length >= 3 && y.startsWith(x)) return true;
    if (y.length >= 3 && x.startsWith(y)) return true;
    return false;
  }

  function modelEquivalent(a, b) {
    const x = alnumUpper(a);
    const y = alnumUpper(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.includes(y) || y.includes(x)) return true;
    return false;
  }

  function parseVehicleName(name) {
    const parts = text(name).split(/\s+/).filter(Boolean);
    const year = parts[0] || '';
    const make = parts[1] || '';
    const model = parts.slice(2).join(' ');
    return { year: year, make: make, model: model };
  }

  function getNatGenVehicleColumns() {
    const nodes = document.querySelectorAll('[id^="ctl00_MainContent_ctl"][id$="_lblVehicleName"]');
    const out = [];

    nodes.forEach(function (el) {
      const id = el && el.id ? el.id : '';
      const match = id.match(/^ctl00_MainContent_ctl(\d+)_lblVehicleName$/);
      if (!match) return;

      const columnIndex = parseInt(match[1], 10);
      if (Number.isNaN(columnIndex)) return;

      const label = text(el.textContent);
      const parsed = parseVehicleName(label);

      out.push({
        columnIndex: columnIndex,
        label: label,
        year: parsed.year,
        make: parsed.make,
        model: parsed.model
      });
    });

    out.sort(function (a, b) { return a.columnIndex - b.columnIndex; });
    return out;
  }

  function matchVehiclesToColumns(payloadVehicles) {
    const natGenColumns = getNatGenVehicleColumns();
    const usedColumns = new Set();
    const matches = [];

    const vehicles = Array.isArray(payloadVehicles) ? payloadVehicles : [];

    for (let i = 0; i < vehicles.length; i += 1) {
      const v = vehicles[i] || {};
      const year = text(v.year);
      const make = text(v.make);
      const model = text(v.model);

      let chosen = null;
      let bestScore = -1;

      for (let j = 0; j < natGenColumns.length; j += 1) {
        const col = natGenColumns[j];
        if (usedColumns.has(col.columnIndex)) continue;

        const yearMatch = text(col.year) === year;
        if (!yearMatch) continue;

        const makeMatch = makeEquivalent(col.make, make);
        const modelMatch = modelEquivalent(col.model, model);

        let score = 0;
        if (yearMatch) score += 100;
        if (makeMatch) score += 30;
        if (modelMatch) score += 20;

        if (score > bestScore) {
          bestScore = score;
          chosen = col;
        }
      }

      if (chosen) {
        usedColumns.add(chosen.columnIndex);
        matches.push({ vehicleIndex: i, columnIndex: chosen.columnIndex });
      }

      console.log(LOG, 'vehicleMatch', {
        vehicleIndex: i,
        erieVehicle: { year: year, make: make, model: model },
        matchedColumnIndex: chosen ? chosen.columnIndex : null,
        matchedLabel: chosen ? chosen.label : ''
      });
    }

    return matches;
  }

  function mapBI(rawCoverageObject) {
    console.log('Mapping:', {
      field: 'BodilyInjury',
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    if (!rawCoverageObject) return '';
    const rawLimit = text(rawCoverageObject.coverageLimit);
    if (!rawLimit) return '';
    const nums = extractNumbers(rawLimit);
    if (nums.length < 2) return rawLimit;
    const left = nums[0] >= 1000 ? Math.round(nums[0] / 1000) : nums[0];
    const right = nums[1] >= 1000 ? Math.round(nums[1] / 1000) : nums[1];
    return left + '/' + right;
  }

  function mapPD(rawCoverageObject) {
    console.log('Mapping:', {
      field: 'PropertyDamage',
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    if (!rawCoverageObject) return '';
    const rawLimit = text(rawCoverageObject.coverageLimit);
    if (!rawLimit) return '';
    const nums = extractNumbers(rawLimit);
    if (!nums.length) return rawLimit;
    return String(nums[0] >= 1000 ? Math.round(nums[0] / 1000) : nums[0]);
  }

  function mapMP(rawCoverageObject) {
    console.log('Mapping:', {
      field: 'MedicalPayments',
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    if (!rawCoverageObject) return '';
    const rawLimit = text(rawCoverageObject.coverageLimit);
    if (!rawLimit) return '';
    const nums = extractNumbers(rawLimit);
    if (!nums.length) return rawLimit;
    return String(nums[0]);
  }

  function mapCompOrColl(rawCoverageObject, field) {
    console.log('Mapping:', {
      field: field,
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    if (!rawCoverageObject) return '';
    const rawLimit = text(rawCoverageObject.coverageLimit);
    if (!rawLimit) return '';
    const nums = extractNumbers(rawLimit);
    if (!nums.length) return rawLimit;
    return String(nums[0]);
  }

  function mapTow(rawCoverageObject) {
    console.log('Mapping:', {
      field: 'RoadService',
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    if (!rawCoverageObject) return '';
    const rawLimit = text(rawCoverageObject.coverageLimit);
    if (!rawLimit) return '';
    const nums = extractNumbers(rawLimit);
    if (!nums.length) return rawLimit;
    return String(nums[0]);
  }

  function mapRental(rawCoverageObject) {
    console.log('Mapping:', {
      field: 'ExtendedTransportationExp',
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    if (!rawCoverageObject) return '';
    const rawLimit = text(rawCoverageObject.coverageLimit);
    if (!rawLimit) return '';
    const nums = extractNumbers(rawLimit);
    if (nums.length < 2) return rawLimit;
    return String(nums[0]) + '/' + String(nums[1]);
  }

  function mapRRC(rawCoverageObject) {
    console.log('Mapping:', {
      field: 'RepairOrReplacement',
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    const exists = !!rawCoverageObject;
    if (exists) return 'True';
    return '';
  }

  function mapCust(rawCoverageObject) {
    console.log('Mapping:', {
      field: 'IncrsCustomizedEquipment',
      rawCoverageObject: rawCoverageObject,
      coverageLimit: rawCoverageObject && rawCoverageObject.coverageLimit
    });
    if (!rawCoverageObject) return '';
    const rawLimit = text(rawCoverageObject.coverageLimit);
    if (!rawLimit) return '';
    const nums = extractNumbers(rawLimit);
    if (!nums.length) return rawLimit;
    return String(nums[0]);
  }

  function findMatchingOption(selectEl, desired) {
    const want = text(desired);
    if (!want) return null;

    const options = Array.from(selectEl.options || []);

    let found = options.find(function (opt) {
      return text(opt.text) === want || text(opt.value) === want;
    });
    if (found) return found;

    const normWant = normalizeOptionText(want);
    found = options.find(function (opt) {
      return normalizeOptionText(opt.text) === normWant || normalizeOptionText(opt.value) === normWant;
    });
    if (found) return found;

    const looseWant = normalizeLooseText(want);
    found = options.find(function (opt) {
      return normalizeLooseText(opt.text) === looseWant || normalizeLooseText(opt.value) === looseWant;
    });
    if (found) return found;

    const looseCompactWant = normalizeLooseCompact(want);
    found = options.find(function (opt) {
      return normalizeLooseCompact(opt.text) === looseCompactWant || normalizeLooseCompact(opt.value) === looseCompactWant;
    });
    if (found) return found;

    const wantLower = want.toLowerCase();
    const yesTokens = ['true', 'yes', 'y', '1'];
    const noTokens = ['false', 'no', 'n', '0'];
    let tokenBucket = null;
    if (yesTokens.indexOf(wantLower) >= 0) tokenBucket = yesTokens;
    if (noTokens.indexOf(wantLower) >= 0) tokenBucket = noTokens;
    if (tokenBucket) {
      found = options.find(function (opt) {
        const ov = text(opt.value).toLowerCase();
        const ot = text(opt.text).toLowerCase();
        return tokenBucket.indexOf(ov) >= 0 || tokenBucket.indexOf(ot) >= 0;
      });
    }

    return found || null;
  }

  function setSelectById(id, sourceCoverageObject, desiredValue, dryRun, results, source) {
    const rawValue = text(sourceCoverageObject && sourceCoverageObject.coverageLimit);
    const sourcePath = text(sourceCoverageObject && sourceCoverageObject.__sourcePath);
    const el = document.getElementById(id);
    if (!el || el.tagName !== 'SELECT') {
      const notFound = {
        id: id,
        selectId: id,
        raw: rawValue,
        mapped: desiredValue,
        value: desiredValue,
        reason: 'not_found',
        source: source,
        sourcePath: sourcePath
      };
      results.skipped.push(notFound);
      console.warn(LOG, 'mapAttempt', Object.assign({}, notFound, {
        sourceCoverageObject: sourceCoverageObject || null,
        selectDisabled: false,
        optionFound: false
      }));
      return;
    }

    if (el.disabled) {
      const disabledEntry = {
        id: id,
        selectId: id,
        raw: rawValue,
        mapped: desiredValue,
        value: desiredValue,
        reason: 'disabled',
        source: source,
        sourcePath: sourcePath
      };
      results.skipped.push(disabledEntry);
      if (!Array.isArray(results.disabledFields)) results.disabledFields = [];
      results.disabledFields.push(disabledEntry);
      console.warn(LOG, 'mapAttempt', Object.assign({}, disabledEntry, {
        sourceCoverageObject: sourceCoverageObject || null,
        selectDisabled: true,
        optionFound: false
      }));
      return;
    }

    console.log(LOG, 'mapAttempt', {
      source: source,
      sourcePath: sourcePath,
      sourceCoverageObject: sourceCoverageObject || null,
      targetSelectId: id,
      rawErieValue: rawValue,
      mappedNatGenValue: text(desiredValue),
      selectDisabled: !!el.disabled,
      availableOptionCount: Array.from(el.options || []).length
    });

    if (!text(desiredValue)) {
      results.skipped.push({
        id: id,
        selectId: id,
        raw: rawValue,
        mapped: desiredValue,
        value: desiredValue,
        reason: 'empty_value',
        source: source,
        sourcePath: sourcePath
      });
      return;
    }

    const option = findMatchingOption(el, desiredValue);
    if (!option) {
      const options = Array.from(el.options || []).map(function (opt) {
        return { text: text(opt.text), value: text(opt.value) };
      });
      console.warn(LOG, 'option_not_found', {
        source: source,
        sourcePath: sourcePath,
        id: id,
        raw: rawValue,
        mapped: desiredValue,
        selectDisabled: !!el.disabled,
        optionFound: false,
        options: options
      });
      results.skipped.push({
        id: id,
        selectId: id,
        raw: rawValue,
        mapped: desiredValue,
        value: desiredValue,
        reason: 'option_not_found',
        source: source,
        sourcePath: sourcePath,
        options: options
      });
      return;
    }

    console.log(LOG, 'mapAttemptResult', {
      source: source,
      sourcePath: sourcePath,
      targetSelectId: id,
      rawErieValue: rawValue,
      mappedNatGenValue: text(desiredValue),
      selectDisabled: !!el.disabled,
      optionFound: true,
      matchedOption: { value: text(option.value), text: text(option.text) }
    });

    if (dryRun) {
      results.filled.push({
        id: id,
        selectId: id,
        raw: rawValue,
        mapped: desiredValue,
        value: option.value,
        text: text(option.text),
        source: source,
        sourcePath: sourcePath,
        dryRun: true
      });
      console.log(LOG, '[dryRun]', id, '=>', option.value, '(' + text(option.text) + ')');
      return;
    }

    if (el.value !== option.value) {
      el.value = option.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    results.filled.push({
      id: id,
      selectId: id,
      raw: rawValue,
      mapped: desiredValue,
      value: option.value,
      text: text(option.text),
      source: source,
      sourcePath: sourcePath,
      dryRun: false
    });
  }

  function vehicleFieldId(columnIndex, suffix) {
    return 'ctl00_MainContent_ctl' + String(columnIndex) + '_' + suffix;
  }

  async function testNatGenCoverages(opts) {
    const options = opts || {};
    const dryRun = options.dryRun !== false;

    const results = {
      ok: true,
      filled: [],
      skipped: [],
      disabledFields: [],
      vehicleMatches: [],
      debug: {
        payloadType: '',
        payloadRootPath: '',
        policyPathUsed: '',
        vehicleGroupsPathUsed: '',
        vehicleCoveragePathsByIndex: [],
        policyCoverageCount: 0,
        vehicleCoverageCounts: []
      }
    };

    let payload = null;
    if (typeof window.getMciSharedPayload === 'function') {
      payload = window.getMciSharedPayload();
    } else if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.getMciSharedPayload === 'function') {
      payload = unsafeWindow.getMciSharedPayload();
    }

    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        results.ok = false;
        results.error = 'Shared payload is invalid JSON';
        return results;
      }
    }

    if (!payload) {
      console.log('No payload found');
      results.ok = false;
      return results;
    }

    const normalized = normalizeErieCoverageSources(payload);
    const workingPayload = normalized && normalized.payload ? normalized.payload : payload;

    const debugPolicyCoverages = normalized && Array.isArray(normalized.normalizedPolicyCoverages)
      ? normalized.normalizedPolicyCoverages
      : ((((workingPayload || {}).coverages || {}).policy || {}).policyCoverages);
    const debugVehicles = Array.isArray((workingPayload || {}).vehicles) ? workingPayload.vehicles : [];
    const normalizedVehicleCoverageCounts = normalized && Array.isArray(normalized.normalizedVehicleCoveragesByIndex)
      ? normalized.normalizedVehicleCoveragesByIndex.map(function (list) { return Array.isArray(list) ? list.length : 0; })
      : debugVehicles.map(function (v) { return Array.isArray(v && v.coverages) ? v.coverages.length : 0; });

    results.debug = {
      payloadType: typeof workingPayload,
      payloadRootPath: normalized && normalized.payloadRootPath ? normalized.payloadRootPath : 'payload',
      policyPathUsed: normalized && normalized.policyPathUsed ? normalized.policyPathUsed : 'payload.coverages.policy.policyCoverages',
      vehicleGroupsPathUsed: normalized && normalized.vehicleGroupsPathUsed ? normalized.vehicleGroupsPathUsed : 'payload.coverages.vehicleCoverages',
      vehicleCoveragePathsByIndex: normalized && Array.isArray(normalized.vehicleCoveragePathsByIndex) ? normalized.vehicleCoveragePathsByIndex : [],
      policyCoverageCount: Array.isArray(debugPolicyCoverages) ? debugPolicyCoverages.length : 0,
      vehicleCoverageCounts: normalizedVehicleCoverageCounts
    };

    console.log(LOG, 'payload paths used', {
      payloadRootPath: results.debug.payloadRootPath,
      policyPathUsed: results.debug.policyPathUsed,
      vehicleGroupsPathUsed: results.debug.vehicleGroupsPathUsed,
      vehicleCoveragePathsByIndex: results.debug.vehicleCoveragePathsByIndex
    });
    console.log(LOG, 'normalized coverage counts', {
      policyCoverageCount: results.debug.policyCoverageCount,
      vehicleCoverageCounts: results.debug.vehicleCoverageCounts
    });
    console.log('PAYLOAD:', workingPayload);
    console.log('vehicles:', workingPayload.vehicles);
    console.log('policy:', workingPayload.coverages);

    const vehicles = Array.isArray(workingPayload.vehicles) ? workingPayload.vehicles : [];
    const vehicleMatches = matchVehiclesToColumns(vehicles);
    results.vehicleMatches = vehicleMatches.slice();

    const bi = findPolicyCoverage(workingPayload, 'BodilyInjury');
    const pd = findPolicyCoverage(workingPayload, 'PropertyDamage');
    const uimBi = findPolicyCoverage(workingPayload, 'UIMBodilyInjury');
    const umpd = findPolicyCoverage(workingPayload, 'UMPropertyDamage');

    const biMapped = mapBI(bi);
    const pdMapped = mapPD(pd);
    const uimMapped = mapBI(uimBi);
    const umpdMapped = mapPD(umpd);

    for (let i = 0; i < vehicleMatches.length; i += 1) {
      const m = vehicleMatches[i];

      setSelectById(vehicleFieldId(m.columnIndex, 'ddlBI'), bi, biMapped, dryRun, results, 'policy.BodilyInjury');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlPD'), pd, pdMapped, dryRun, results, 'policy.PropertyDamage');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlUMUIMBI'), uimBi, uimMapped, dryRun, results, 'policy.UIMBodilyInjury');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlUMP'), umpd, umpdMapped, dryRun, results, 'policy.UMPropertyDamage');

      const medPay = findVehicleCoverage(workingPayload, m.vehicleIndex, 'MedicalPayments');
      const comp = findVehicleCoverage(workingPayload, m.vehicleIndex, 'Comprehensive');
      const coll = findVehicleCoverage(workingPayload, m.vehicleIndex, 'Collision');
      const rental = findVehicleCoverage(workingPayload, m.vehicleIndex, 'ExtendedTransportationExp');
      const towing = findVehicleCoverage(workingPayload, m.vehicleIndex, 'RoadService');
      const rrc = findVehicleCoverage(workingPayload, m.vehicleIndex, 'RepairOrReplacement');
      const cust = findVehicleCoverage(workingPayload, m.vehicleIndex, 'IncrsCustomizedEquipment');

      const medPayMapped = mapMP(medPay);
      const compMapped = mapCompOrColl(comp, 'Comprehensive');
      const collMapped = mapCompOrColl(coll, 'Collision');
      const rentalMapped = mapRental(rental);
      const towingMapped = mapTow(towing);
      const rrcMapped = mapRRC(rrc);
      const custMapped = mapCust(cust);

      setSelectById(vehicleFieldId(m.columnIndex, 'ddlMP'), medPay, medPayMapped, dryRun, results, 'vehicle[' + m.vehicleIndex + '].MedicalPayments');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlCP'), comp, compMapped, dryRun, results, 'vehicle[' + m.vehicleIndex + '].Comprehensive');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlCL'), coll, collMapped, dryRun, results, 'vehicle[' + m.vehicleIndex + '].Collision');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlRR'), rental, rentalMapped, dryRun, results, 'vehicle[' + m.vehicleIndex + '].ExtendedTransportationExp');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlTW'), towing, towingMapped, dryRun, results, 'vehicle[' + m.vehicleIndex + '].RoadService');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlRRC'), rrc, rrcMapped, dryRun, results, 'vehicle[' + m.vehicleIndex + '].RepairOrReplacement');
      setSelectById(vehicleFieldId(m.columnIndex, 'ddlCust'), cust, custMapped, dryRun, results, 'vehicle[' + m.vehicleIndex + '].IncrsCustomizedEquipment');
    }

    console.log(LOG, 'Done', { dryRun: dryRun, filled: results.filled.length, skipped: results.skipped.length, vehicleMatches: results.vehicleMatches });
    return results;
  }

  window.testNatGenCoverages = testNatGenCoverages;
  console.log(LOG, 'Loaded. Run testNatGenCoverages({ dryRun: true }) or testNatGenCoverages({ dryRun: false }).');
})();

  /* =========================================================
     BOOT / INIT / EXPOSED TEST FUNCTIONS / OPTIONAL RUNNERS
     ========================================================= */

  (function initNatGenMasterExports() {
    const root = getNatGenRootWindow();

    // Preserve/bridge named insured test function naming.
    if (typeof root.testNatGenNamedInsured !== 'function' && typeof root.testNatGenNamed === 'function') {
      root.testNatGenNamedInsured = function (opts) {
        return root.testNatGenNamed(opts || {});
      };
    }

    // Preserve original name as alias if only the new name exists.
    if (typeof root.testNatGenNamed !== 'function' && typeof root.testNatGenNamedInsured === 'function') {
      root.testNatGenNamed = function (opts) {
        return root.testNatGenNamedInsured(opts || {});
      };
    }

    // Drivers naming bridge (module already uses testNatGenDrivers).
    if (typeof root.testNatGenDrivers !== 'function' && typeof window.testNatGenDrivers === 'function') {
      root.testNatGenDrivers = window.testNatGenDrivers;
    }

    // Vehicle selector probe explicit test name alias.
    if (typeof root.testNatGenVehicleSelectorProbe !== 'function') {
      if (typeof root.probeNatGenVehicleSelectors === 'function') {
        root.testNatGenVehicleSelectorProbe = function () {
          return root.probeNatGenVehicleSelectors();
        };
      } else if (typeof window.probeNatGenVehicleSelectors === 'function') {
        root.testNatGenVehicleSelectorProbe = function () {
          return window.probeNatGenVehicleSelectors();
        };
      }
    }

    // Keep original probe function alias if only test function exists.
    if (typeof root.probeNatGenVehicleSelectors !== 'function' && typeof root.testNatGenVehicleSelectorProbe === 'function') {
      root.probeNatGenVehicleSelectors = function () {
        return root.testNatGenVehicleSelectorProbe();
      };
    }

    // Coverages naming bridge (module already uses testNatGenCoverages).
    if (typeof root.testNatGenCoverages !== 'function' && typeof window.testNatGenCoverages === 'function') {
      root.testNatGenCoverages = window.testNatGenCoverages;
    }

    // Optional non-dry-run wrappers.
    if (typeof root.runNatGenNamedInsured !== 'function') {
      root.runNatGenNamedInsured = function () {
        if (typeof root.testNatGenNamedInsured === 'function') {
          return root.testNatGenNamedInsured({ dryRun: false });
        }
        if (typeof root.testNatGenNamed === 'function') {
          return root.testNatGenNamed({ dryRun: false });
        }
        return { ok: false, errors: ['Named Insured test function is not available'] };
      };
    }

    if (typeof root.runNatGenDrivers !== 'function') {
      root.runNatGenDrivers = function () {
        if (typeof root.testNatGenDrivers === 'function') {
          return root.testNatGenDrivers({ dryRun: false });
        }
        return { ok: false, errors: ['Drivers test function is not available'] };
      };
    }

    if (typeof root.runNatGenVehicleProbe !== 'function') {
      root.runNatGenVehicleProbe = function () {
        if (typeof root.testNatGenVehicleSelectorProbe === 'function') {
          return root.testNatGenVehicleSelectorProbe();
        }
        if (typeof root.probeNatGenVehicleSelectors === 'function') {
          return root.probeNatGenVehicleSelectors();
        }
        if (typeof root.testNatGenVehicles === 'function') {
          return root.testNatGenVehicles({ dryRun: false });
        }
        return { ok: false, errors: ['Vehicle probe/test function is not available'] };
      };
    }

    if (typeof root.runNatGenCoverages !== 'function') {
      root.runNatGenCoverages = function () {
        if (typeof root.testNatGenCoverages === 'function') {
          return root.testNatGenCoverages({ dryRun: false });
        }
        return { ok: false, errors: ['Coverages test function is not available'] };
      };
    }

    // Mirror aliases on window for direct console access.
    if (typeof window !== 'undefined') {
      if (typeof window.testNatGenNamedInsured !== 'function' && typeof root.testNatGenNamedInsured === 'function') {
        window.testNatGenNamedInsured = root.testNatGenNamedInsured;
      }
      if (typeof window.testNatGenDrivers !== 'function' && typeof root.testNatGenDrivers === 'function') {
        window.testNatGenDrivers = root.testNatGenDrivers;
      }
      if (typeof window.testNatGenVehicleSelectorProbe !== 'function' && typeof root.testNatGenVehicleSelectorProbe === 'function') {
        window.testNatGenVehicleSelectorProbe = root.testNatGenVehicleSelectorProbe;
      }
      if (typeof window.testNatGenCoverages !== 'function' && typeof root.testNatGenCoverages === 'function') {
        window.testNatGenCoverages = root.testNatGenCoverages;
      }

      if (typeof window.runNatGenNamedInsured !== 'function' && typeof root.runNatGenNamedInsured === 'function') {
        window.runNatGenNamedInsured = root.runNatGenNamedInsured;
      }
      if (typeof window.runNatGenDrivers !== 'function' && typeof root.runNatGenDrivers === 'function') {
        window.runNatGenDrivers = root.runNatGenDrivers;
      }
      if (typeof window.runNatGenVehicleProbe !== 'function' && typeof root.runNatGenVehicleProbe === 'function') {
        window.runNatGenVehicleProbe = root.runNatGenVehicleProbe;
      }
      if (typeof window.runNatGenCoverages !== 'function' && typeof root.runNatGenCoverages === 'function') {
        window.runNatGenCoverages = root.runNatGenCoverages;
      }
    }

    root.__natGenMaster = {
      version: '1.0.0',
      getPayload: getNatGenSharedPayload,
      modules: {
        namedInsured: typeof root.fillNatGenNamedInsuredFromErie === 'function',
        drivers: typeof root.fillNatGenDriversFromErie === 'function',
        vehicles: typeof root.fillNatGenVehicles === 'function',
        coverages: typeof root.testNatGenCoverages === 'function'
      }
    };

    console.log('[NatGenMaster] Loaded', root.__natGenMaster);
  })();

  (function initNatGenFillThisPageButton() {
    const root = getNatGenRootWindow();
    const CONTAINER_ID = 'natgenFillThisPageWrap';
    const FILL_BUTTON_ID = 'natgenFillThisPageButton';
    const CLEAR_BUTTON_ID = 'natgenFillThisPageClearButton';
    const STYLE_ID = 'natgenFillThisPageButtonStyle';
    const ERIE_EXTRACTOR_TOGGLE_KEY = 'mci_pref_erie_extractor_enabled';
    const ERIE_EXTRACTOR_TOGGLE_EVENT = 'mci:erie-extractor-toggle';

    if (root.__natGenFillThisPageButtonState && typeof root.__natGenFillThisPageButtonState.refresh === 'function') {
      root.__natGenFillThisPageButtonState.refresh();
      return;
    }

    function getErieExtractorEnabledForNatGen() {
      let raw = null;
      try {
        raw = localStorage.getItem(ERIE_EXTRACTOR_TOGGLE_KEY);
      } catch (e) {
        return true;
      }

      if (raw == null) return true;

      const normalized = String(raw).trim().toLowerCase();
      if (!normalized) return true;

      if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
        return false;
      }
      if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
        return true;
      }

      try {
        const parsed = JSON.parse(raw);
        if (parsed === false || parsed === 0) return false;
        if (parsed === true || parsed === 1) return true;
      } catch (e) {}

      return true;
    }

    function getNatGenPageFillConfig() {
      const pathname = String((window.location && window.location.pathname) || '').toLowerCase();

      if (pathname.indexOf('/quote/quotenamedinsured.aspx') >= 0) {
        return {
          runnerName: 'runNatGenNamedInsured',
          title: 'Fill Named Insured'
        };
      }
      if (pathname.indexOf('/quote/quotedriver.aspx') >= 0) {
        return {
          runnerName: 'runNatGenDrivers',
          title: 'Fill Drivers'
        };
      }
      if (pathname.indexOf('/quote/quoteauto.aspx') >= 0) {
        return {
          runnerName: 'runNatGenVehicleProbe',
          title: 'Fill Vehicle Page'
        };
      }
      if (pathname.indexOf('/quote/quotecoverages.aspx') >= 0 || pathname.indexOf('/quote/quotecoveragesv2.aspx') >= 0) {
        return {
          runnerName: 'runNatGenCoverages',
          title: 'Fill Coverages'
        };
      }

      return null;
    }

    function hasNatGenSharedPayload() {
      try {
        return !!getNatGenSharedPayload();
      } catch (e) {
        return false;
      }
    }

    function removeNatGenFillThisPageButton() {
      const existing = document.getElementById(CONTAINER_ID);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    }

    function ensureNatGenFillThisPageButton() {
      let styleEl = document.getElementById(STYLE_ID);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = [
          '#' + CONTAINER_ID + ' {',
          '  position: fixed;',
          '  right: 14px;',
          '  bottom: 14px;',
          '  z-index: 2147483647;',
          '  display: inline-flex;',
          '  align-items: stretch;',
          '  border-radius: 6px;',
          '  overflow: hidden;',
          '  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);',
          '  opacity: 0.95;',
          '}',
          '#' + CONTAINER_ID + ':hover {',
          '  opacity: 1;',
          '}',
          '#' + CLEAR_BUTTON_ID + ',',
          '#' + FILL_BUTTON_ID + ' {',
          '  border: 0;',
          '  margin: 0;',
          '  font-size: 12px;',
          '  line-height: 1.2;',
          '  color: #ffffff;',
          '  cursor: pointer;',
          '  height: 30px;',
          '}',
          '#' + CLEAR_BUTTON_ID + ' {',
          '  padding: 0 9px;',
          '  background: #b91c1c;',
          '  border-right: 1px solid rgba(255,255,255,0.18);',
          '}',
          '#' + CLEAR_BUTTON_ID + ':hover {',
          '  background: #991b1b;',
          '}',
          '#' + FILL_BUTTON_ID + ' {',
          '  padding: 0 12px;',
          '  background: #111827;',
          '}',
          '#' + FILL_BUTTON_ID + ':hover {',
          '  background: #1f2937;',
          '}',
          '#' + FILL_BUTTON_ID + ':disabled {',
          '  opacity: 0.7;',
          '  cursor: wait;',
          '}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(styleEl);
      }

      const config = getNatGenPageFillConfig();
      if (!config) return null;

      let container = document.getElementById(CONTAINER_ID);
      let clearButton = document.getElementById(CLEAR_BUTTON_ID);
      let fillButton = document.getElementById(FILL_BUTTON_ID);

      if (!container) {
        container = document.createElement('div');
        container.id = CONTAINER_ID;

        clearButton = document.createElement('button');
        clearButton.id = CLEAR_BUTTON_ID;
        clearButton.type = 'button';
        clearButton.textContent = 'X';
        clearButton.title = 'Clear Stored Data';
        clearButton.addEventListener('click', function () {
          try {
            if (typeof root.clearMciSharedPayload === 'function') {
              root.clearMciSharedPayload();
            } else if (typeof window.clearMciSharedPayload === 'function') {
              window.clearMciSharedPayload();
            } else {
              try { localStorage.removeItem('mciMasterPayload'); } catch (e) {}
            }
          } catch (e) {
            console.error('[NatGenMaster] Clear Stored Data failed', e);
          }

          removeNatGenFillThisPageButton();
        });

        fillButton = document.createElement('button');
        fillButton.id = FILL_BUTTON_ID;
        fillButton.type = 'button';
        fillButton.textContent = 'Fill This Page';
        fillButton.addEventListener('click', function () {
          const clickConfig = getNatGenPageFillConfig();
          const runnerName = clickConfig ? clickConfig.runnerName : '';
          const runner = runnerName && typeof root[runnerName] === 'function' ? root[runnerName] : null;
          if (!runner) return;

          let result;
          fillButton.disabled = true;
          try {
            result = runner();
          } catch (e) {
            console.error('[NatGenMaster] Fill This Page failed', e);
            fillButton.disabled = false;
            return;
          }

          if (result && typeof result.then === 'function') {
            result
              .catch(function (e) {
                console.error('[NatGenMaster] Fill This Page failed', e);
              })
              .finally(function () {
                fillButton.disabled = false;
              });
          } else {
            fillButton.disabled = false;
          }
        });

        container.appendChild(clearButton);
        container.appendChild(fillButton);
        (document.body || document.documentElement).appendChild(container);
      }

      fillButton.title = config.title;
      return fillButton;
    }

    function refreshNatGenFillThisPageButton() {
      const config = getNatGenPageFillConfig();
      const enabled = getErieExtractorEnabledForNatGen();
      const hasPayload = hasNatGenSharedPayload();
      const hasRunner = !!(config && typeof root[config.runnerName] === 'function');

      if (!config || !enabled || !hasPayload || !hasRunner) {
        removeNatGenFillThisPageButton();
        return;
      }

      ensureNatGenFillThisPageButton();
    }

    root.__natGenFillThisPageButtonState = {
      refresh: refreshNatGenFillThisPageButton
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(ERIE_EXTRACTOR_TOGGLE_EVENT, function () {
        window.setTimeout(refreshNatGenFillThisPageButton, 0);
      });
      window.addEventListener('storage', function (event) {
        if (!event || event.key === ERIE_EXTRACTOR_TOGGLE_KEY) {
          refreshNatGenFillThisPageButton();
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refreshNatGenFillThisPageButton, { once: true });
    } else {
      refreshNatGenFillThisPageButton();
    }
  })();
})();
