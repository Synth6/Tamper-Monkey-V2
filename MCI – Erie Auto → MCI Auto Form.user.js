// ==UserScript==
// @name         MCI – Erie Auto → MCI Auto Form
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Export Erie Auto quote data (Customer, Drivers, Vehicles, Coverages) to MCI Auto Quote HTML form with one-click flow
// @author       Ron / MCI
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*/Customer*
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*/Coverages/Auto*
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*/Vehicle*
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*/Driver*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/MCI%20–%20Erie%20Auto%20→%20MCI%20Auto%20Form.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/MCI%20–%20Erie%20Auto%20→%20MCI%20Auto%20Form.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ===== CONFIG =====
  const AUTO_FORM_URL = 'https://middlecreekins.com/wp-content/uploads/JonesForms/AutoQuoteForm.html';
  const STORAGE_KEY   = 'mci_erie_auto_customer_v1';
  const FLOW_KEY      = 'mci_erie_auto_flow_v1';   // "idle" | "after_customer" | "after_drivers" | "after_vehicles"

  // ===== Generic helpers =====
  function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  function waitForElement(selector, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Timeout waiting for ' + selector));
        }
      }, 200);
    });
  }

  // Wait until the VIN changes from the previous one
  async function waitForVehicleChange(prevVin, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const vinInput = document.querySelector('#VIN');
      if (vinInput) {
        const v = (vinInput.value || '').trim();
        if (v && v !== prevVin) {
          return;
        }
      }
      await wait(200);
    }
    console.warn('[MCI Auto] Timeout waiting for vehicle change; continuing anyway.');
  }

  function getSelectedText(selector) {
    const sel = document.querySelector(selector);
    if (!sel) {
      console.warn('[MCI Auto] No select found for', selector);
      return '';
    }
    const opt = sel.options[sel.selectedIndex];
    const value = opt ? (opt.text || '').trim() : '';
    console.log('[MCI Auto] Selected text for', selector, 'â†’', value);
    return value;
  }

  function getValue(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      console.warn('[MCI Auto] No input/select found for', selector);
      return '';
    }
    const value = (el.value || '').trim();
    console.log('[MCI Auto] Value for', selector, 'â†’', value);
    return value;
  }

  function getText(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      console.warn('[MCI Auto] No element found for', selector);
      return '';
    }
    const value = (el.innerText || el.textContent || '').trim();
    console.log('[MCI Auto] Text for', selector, 'â†’', value);
    return value;
  }

  function parseMailingAddress() {
    const addrDiv = document.querySelector('#mailing-address-text');
    if (!addrDiv) {
      console.warn('[MCI Auto] No #mailing-address-text found');
      return { street: '', city: '', state: '', zip: '' };
    }

    const text = (addrDiv.innerText || addrDiv.textContent || '').trim();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let street = '';
    let city   = '';
    let state  = '';
    let zip    = '';

    if (lines.length > 0) {
      street = lines[0];
    }
    if (lines.length > 1) {
      const m = lines[1].match(/^([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
      if (m) {
        city  = m[1].trim();
        state = m[2].trim();
        zip   = m[3].trim();
      } else {
        console.warn('[MCI Auto] Could not parse city/state/zip from:', lines[1]);
      }
    }

    console.log('[MCI Auto] Parsed mailing address:', { street, city, state, zip });
    return { street, city, state, zip };
  }

  function getAccessibleDocuments() {
    const docs = [];
    if (document) docs.push(document);

    const iframes = Array.from(document.querySelectorAll('iframe'));
    iframes.forEach(frame => {
      try {
        const d = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (d && docs.indexOf(d) === -1) docs.push(d);
      } catch (e) {}
    });

    return docs;
  }

  function extractBalancedObjectLiteral(sourceText, marker) {
    const source = String(sourceText || '');
    const markerText = String(marker || '');
    if (!source || !markerText) return '';

    const markerIndex = source.indexOf(markerText);
    if (markerIndex === -1) return '';

    const parenIndex = source.indexOf('(', markerIndex + markerText.length);
    if (parenIndex === -1) return '';

    const braceIndex = source.indexOf('{', parenIndex);
    if (braceIndex === -1) return '';

    let depth = 0;
    let inString = false;
    let quote = '';
    let escaped = false;

    for (let i = braceIndex; i < source.length; i++) {
      const ch = source[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          inString = false;
          quote = '';
        }
        continue;
      }

      if (ch === '"' || ch === '\'' || ch === '`') {
        inString = true;
        quote = ch;
        continue;
      }

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return source.slice(braceIndex, i + 1);
        }
      }
    }

    return '';
  }

  function parsePossiblyNonStrictJson(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (e) {}

    try {
      return Function('"use strict"; return (' + text + ');')();
    } catch (e) {
      return null;
    }
  }

  function extractErieCustomerViewModel() {
    const marker = 'new plw.customer.ViewModel';
    const docs = getAccessibleDocuments();

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const scripts = Array.from(doc.querySelectorAll('script')).filter(s => !s.src);

      for (let j = 0; j < scripts.length; j++) {
        const txt = scripts[j].textContent || '';
        if (txt.indexOf(marker) === -1) continue;
        const rawObj = extractBalancedObjectLiteral(txt, marker);
        if (!rawObj) continue;
        const parsed = parsePossiblyNonStrictJson(rawObj);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    }

    return null;
  }

  function cleanStringValue(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    try {
      return String(v).trim();
    } catch (e) {
      return '';
    }
  }

  function isMaskedSensitiveValue(v) {
    return /\*/.test(cleanStringValue(v));
  }

  function normalizeGender(v) {
    const s = cleanStringValue(v).toLowerCase();
    if (s === 'female' || s === 'f') return 'F';
    if (s === 'male' || s === 'm') return 'M';
    return '';
  }

  function getErieSsnFromViewModel(namedInsured) {
    const ssnForm = namedInsured && namedInsured.SSNForm ? namedInsured.SSNForm : null;
    return cleanStringValue(
      (ssnForm && (ssnForm.ExistingSSN || ssnForm.SSN)) ||
      (namedInsured && namedInsured.SSN) ||
      ''
    );
  }

  function getErieDobFromViewModel(namedInsured) {
    const dobForm = namedInsured && namedInsured.DateOfBirthForm ? namedInsured.DateOfBirthForm : null;
    return cleanStringValue(
      (dobForm && dobForm.DateOfBirth) ||
      (namedInsured && namedInsured.DateOfBirth) ||
      ''
    );
  }

  function getEriePhoneFromViewModel(namedInsured) {
    const list = namedInsured && Array.isArray(namedInsured.PhoneNumberList) ? namedInsured.PhoneNumberList : [];
    if (!list.length) return '';
    const item = list[0] || {};
    return cleanStringValue(item.PhoneNumber || item.Number || item.phoneNumber || item.number || '');
  }

  function getEriePhoneTypeFromViewModel(namedInsured) {
    const list = namedInsured && Array.isArray(namedInsured.PhoneNumberList) ? namedInsured.PhoneNumberList : [];
    if (!list.length) return '';
    const item = list[0] || {};
    return cleanStringValue(item.PhoneType || item.Type || item.phoneType || item.type || '');
  }

  function mapErieNamedInsuredFromViewModel(namedInsured) {
    return {
      first_name: cleanStringValue(namedInsured && namedInsured.FirstName),
      middle_name: cleanStringValue(namedInsured && namedInsured.MiddleName),
      last_name: cleanStringValue(namedInsured && namedInsured.LastName),
      suffix: cleanStringValue(namedInsured && namedInsured.Suffix),
      gender: normalizeGender(namedInsured && namedInsured.Gender),
      dob: getErieDobFromViewModel(namedInsured),
      ssn: getErieSsnFromViewModel(namedInsured),
      dl_state: cleanStringValue(namedInsured && namedInsured.DriverLicenseState),
      dl_number: cleanStringValue(namedInsured && namedInsured.DriverLicenseNumber),
      email: cleanStringValue(namedInsured && namedInsured.EmailAddress),
      phone: getEriePhoneFromViewModel(namedInsured),
      phone_type: getEriePhoneTypeFromViewModel(namedInsured)
    };
  }

  function buildFullName(parts) {
    return (Array.isArray(parts) ? parts : [])
      .map(v => cleanStringValue(v))
      .filter(Boolean)
      .join(' ');
  }

  function pickPreferredValue(values, sensitive) {
    const list = Array.isArray(values) ? values : [values];
    let maskedFallback = '';

    for (let i = 0; i < list.length; i++) {
      const value = cleanStringValue(list[i]);
      if (!value) continue;

      if (sensitive && isMaskedSensitiveValue(value)) {
        if (!maskedFallback) maskedFallback = value;
        continue;
      }
      return value;
    }

    return maskedFallback;
  }

  function normalizePayloadForAutoForm(data) {
    const out = Object.assign({}, data || {});
    const topKeys = [
      'policy_eff_date',
      'named_insured',
      'insured_email',
      'garaging_address',
      'city',
      'zip_code',
      'county',
      'prior_carrier_premium',
      'prior_policy_term',
      'limit_of_liability',
      'med_pay_limit',
      'um_limit',
      'uim_limit',
      'continuous_coverage_12mo',
      'date_policy_cancelled',
      'rent_or_own',
      'home_currently_with_agency',
      'home_insurance_company',
      'claims_last_4_years'
    ];

    const vehicleFieldSuffixes = [
      'class_use_type',
      'vin',
      'year',
      'make',
      'model',
      'comp_ded',
      'coll_ded',
      'tow_limit',
      'rental_limit'
    ];

    for (let i = 0; i < topKeys.length; i++) {
      if (out[topKeys[i]] == null) out[topKeys[i]] = '';
    }

    for (let i = 1; i <= 4; i++) {
      for (let j = 0; j < vehicleFieldSuffixes.length; j++) {
        const k = 'veh' + i + '_' + vehicleFieldSuffixes[j];
        if (out[k] == null) out[k] = '';
      }
      if (out['drv' + i + '_name'] == null) out['drv' + i + '_name'] = '';
      if (out['drv' + i + '_dob'] == null) out['drv' + i + '_dob'] = '';
      if (out['drv' + i + '_dl'] == null) out['drv' + i + '_dl'] = '';
      if (out['drv' + i + '_state'] == null) out['drv' + i + '_state'] = '';
      if (out['drv' + i + '_ssn'] == null) out['drv' + i + '_ssn'] = '';
      if (out['drv' + i + '_occupation'] == null) out['drv' + i + '_occupation'] = '';
    }

    if (!cleanStringValue(out.named_insured)) {
      out.named_insured = buildFullName([
        out.insured_first_name,
        out.insured_middle_name,
        out.insured_last_name,
        out.insured_suffix
      ]);
    }

    if (!cleanStringValue(out.insured_email)) {
      out.insured_email = pickPreferredValue([
        out.insured_email,
        out.insured_primary_email,
        out.primary_email,
        out.email
      ], false);
    }

    for (let i = 1; i <= 4; i++) {
      const p = 'drv' + i + '_';

      if (!cleanStringValue(out[p + 'name'])) {
        out[p + 'name'] = buildFullName([
          out[p + 'first_name'],
          out[p + 'middle_name'],
          out[p + 'last_name'],
          out[p + 'suffix'],
          out['driver' + i + '_first_name'],
          out['driver' + i + '_last_name']
        ]);
      }

      if (!cleanStringValue(out[p + 'name'])) {
        if (i === 1) {
          out[p + 'name'] = buildFullName([
            out.insured_first_name,
            out.insured_middle_name,
            out.insured_last_name,
            out.insured_suffix
          ]);
        } else if (i === 2) {
          out[p + 'name'] = buildFullName([
            out.second_insured_first_name,
            out.second_insured_middle_name,
            out.second_insured_last_name,
            out.second_insured_suffix
          ]);
        }
      }

      out[p + 'dob'] = pickPreferredValue([
        out[p + 'dob'],
        out[p + 'date_of_birth'],
        out['driver' + i + '_dob'],
        i === 1 ? out.insured_dob : '',
        i === 2 ? out.second_insured_dob : ''
      ], true);

      out[p + 'dl'] = pickPreferredValue([
        out[p + 'dl'],
        out[p + 'dl_number'],
        out[p + 'license'],
        out[p + 'license_number'],
        out['driver' + i + '_dl'],
        out['driver' + i + '_dl_number'],
        out['driver' + i + '_license'],
        out['driver' + i + '_license_number'],
        i === 1 ? out.insured_dl_number : '',
        i === 2 ? out.second_insured_dl_number : ''
      ], true);

      out[p + 'state'] = pickPreferredValue([
        out[p + 'state'],
        out[p + 'dl_state'],
        out['driver' + i + '_state'],
        out['driver' + i + '_dl_state'],
        i === 1 ? out.insured_dl_state : '',
        i === 2 ? out.second_insured_dl_state : ''
      ], false);

      out[p + 'ssn'] = pickPreferredValue([
        out[p + 'ssn'],
        out['driver' + i + '_ssn'],
        i === 1 ? out.insured_ssn : '',
        i === 2 ? out.second_insured_ssn : ''
      ], true);

      out[p + 'occupation'] = pickPreferredValue([
        out[p + 'occupation'],
        out['driver' + i + '_occupation']
      ], false);
    }

    return out;
  }

  function getCounty() {
    const sel = document.querySelector('#selMailingCountyList');
    if (sel && sel.value) {
      const value = sel.value.trim();
      console.log('[MCI Auto] County from select â†’', value);
      return value;
    }

    const span = document.querySelector('.editor-block span.bold');
    if (span) {
      const value = (span.innerText || span.textContent || '').trim();
      console.log('[MCI Auto] County from bold span â†’', value);
      return value;
    }

    console.warn('[MCI Auto] County not found');
    return '';
  }

  // Get per-vehicle coverage texts (Comprehensive, Collision, RoadService, ExtendedTransportationExp)
  function getVehicleCoverageByCode(code) {
    const sels = Array.from(
      document.querySelectorAll(
        'select[data-coveragelevel="Vehicle"][data-coveragecode="' + code + '"]'
      )
    );
    const list = sels.map(sel => {
      const opt = sel.options[sel.selectedIndex];
      return opt ? (opt.text || '').trim() : '';
    });
    console.log('[MCI Auto] Coverage', code, 'per-vehicle =', list);
    return list;
  }

  function getPolicyEffectiveDateFromCoverages() {
    const selectors = [
      '#PolicyEffectiveDate',
      '#EffectiveDate',
      'input[name*="PolicyEffectiveDate"]',
      'input[id*="PolicyEffectiveDate"]',
      'input[name*="EffectiveDate"]',
      'input[id*="EffectiveDate"]',
      'input[name*="Effective"][name*="Date"]',
      'input[id*="Effective"][id*="Date"]'
    ];

    const toDate = (v) => {
      const text = cleanStringValue(v);
      const match = text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
      return match ? match[0] : '';
    };

    for (let i = 0; i < selectors.length; i++) {
      const el = document.querySelector(selectors[i]);
      if (!el) continue;
      const found = toDate(el.value || el.getAttribute('value') || el.textContent || '');
      if (found) return found;
    }

    const labels = Array.from(document.querySelectorAll('label'));
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      const labelText = cleanStringValue(label.innerText || label.textContent || '');
      if (!/effective/i.test(labelText) || !/date/i.test(labelText)) continue;

      const htmlFor = label.getAttribute('for');
      if (htmlFor) {
        const byFor = document.getElementById(htmlFor);
        const found = toDate(byFor && (byFor.value || byFor.getAttribute('value') || byFor.textContent || ''));
        if (found) return found;
      }

      const near = label.parentElement ? label.parentElement.querySelector('input, select') : null;
      const foundNear = toDate(near && (near.value || near.getAttribute('value') || near.textContent || ''));
      if (foundNear) return foundNear;
    }

    return '';
  }

  function extractErieDriverViewData() {
    const docs = getAccessibleDocuments();

    function extractBalancedValueAfterIndex(sourceText, startIndex) {
      const source = String(sourceText || '');
      let start = -1;
      for (let i = Math.max(0, startIndex || 0); i < source.length; i++) {
        const ch = source[i];
        if (ch === '{' || ch === '[') {
          start = i;
          break;
        }
      }
      if (start < 0) return '';

      const stack = [];
      const first = source[start];
      stack.push(first === '{' ? '}' : ']');

      let inString = false;
      let quote = '';
      let escaped = false;

      for (let i = start + 1; i < source.length; i++) {
        const ch = source[i];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === '\\') {
            escaped = true;
            continue;
          }
          if (ch === quote) {
            inString = false;
            quote = '';
          }
          continue;
        }

        if (ch === '"' || ch === '\'' || ch === '`') {
          inString = true;
          quote = ch;
          continue;
        }

        if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if ((ch === '}' || ch === ']') && stack.length) {
          const expected = stack[stack.length - 1];
          if (ch === expected) {
            stack.pop();
            if (!stack.length) return source.slice(start, i + 1);
          }
        }
      }

      return '';
    }

    for (let d = 0; d < docs.length; d++) {
      const doc = docs[d];
      const scripts = Array.from(doc.querySelectorAll('script')).filter(s => !s.src);

      for (let i = 0; i < scripts.length; i++) {
        const txt = String(scripts[i].textContent || '');
        if (!txt) continue;

        if (txt.indexOf('new plw.driver.ViewModel') > -1) {
          const rawModel = extractBalancedObjectLiteral(txt, 'new plw.driver.ViewModel');
          const parsedModel = parsePossiblyNonStrictJson(rawModel);
          if (parsedModel && typeof parsedModel === 'object') return parsedModel;
        }

        const assignmentMarkers = [
          'var viewData',
          'let viewData',
          'const viewData',
          'window.viewData',
          'viewData ='
        ];

        for (let m = 0; m < assignmentMarkers.length; m++) {
          const marker = assignmentMarkers[m];
          const idx = txt.indexOf(marker);
          if (idx < 0) continue;
          const raw = extractBalancedValueAfterIndex(txt, idx);
          if (!raw) continue;
          const parsed = parsePossiblyNonStrictJson(raw);
          if (parsed && (typeof parsed === 'object' || Array.isArray(parsed))) return parsed;
        }
      }
    }

    return null;
  }

  function getErieDriversFromViewData(viewData) {
    function findDriverFormList(node) {
      if (!node) return null;
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          const found = findDriverFormList(node[i]);
          if (found) return found;
        }
        return null;
      }
      if (typeof node !== 'object') return null;

      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (String(key).toLowerCase() === 'driverformlist' && Array.isArray(node[key])) {
          return node[key];
        }
      }
      for (let i = 0; i < keys.length; i++) {
        const found = findDriverFormList(node[keys[i]]);
        if (found) return found;
      }
      return null;
    }

    const list = findDriverFormList(viewData) || [];
    return list.map(item => {
      const src = item && (item.DriverForm || item.driverForm || item);
      const dobForm = src && src.DateOfBirthForm ? src.DateOfBirthForm : null;
      const ssnForm = src && src.SSNForm ? src.SSNForm : null;
      return {
        first_name: cleanStringValue(src && (src.FirstName || src.firstName)),
        middle_name: cleanStringValue(src && (src.MiddleName || src.middleName)),
        last_name: cleanStringValue(src && (src.LastName || src.lastName)),
        suffix: cleanStringValue(src && (src.Suffix || src.suffix)),
        gender: normalizeGender(src && (src.Gender || src.gender)),
        dob: cleanStringValue((dobForm && dobForm.DateOfBirth) || (src && (src.DateOfBirth || src.dateOfBirth)) || ''),
        ssn: cleanStringValue((ssnForm && (ssnForm.ExistingSSN || ssnForm.SSN)) || (src && (src.SSN || src.ssn)) || ''),
        dl_state: cleanStringValue(src && (src.DriverLicenseState || src.driverLicenseState)),
        dl_number: cleanStringValue(src && (src.DriverLicenseNumber || src.driverLicenseNumber))
      };
    }).filter(d => d.first_name || d.last_name || d.dob || d.ssn || d.dl_number);
  }

  function findMatchingErieDriver(viewDrivers, firstName, lastName, usedIndexes) {
    const list = Array.isArray(viewDrivers) ? viewDrivers : [];
    const used = usedIndexes || new Set();
    const fn = cleanStringValue(firstName).toLowerCase();
    const ln = cleanStringValue(lastName).toLowerCase();

    if (fn && ln) {
      for (let i = 0; i < list.length; i++) {
        if (used.has(i)) continue;
        if (cleanStringValue(list[i].first_name).toLowerCase() === fn &&
            cleanStringValue(list[i].last_name).toLowerCase() === ln) {
          used.add(i);
          return list[i];
        }
      }
    }

    if (ln) {
      for (let i = 0; i < list.length; i++) {
        if (used.has(i)) continue;
        if (cleanStringValue(list[i].last_name).toLowerCase() === ln) {
          used.add(i);
          return list[i];
        }
      }
    }

    if (fn) {
      for (let i = 0; i < list.length; i++) {
        if (used.has(i)) continue;
        if (cleanStringValue(list[i].first_name).toLowerCase() === fn) {
          used.add(i);
          return list[i];
        }
      }
    }

    return null;
  }

  // =========================
  // STEP 1  CUSTOMER TAB
  // =========================
  function collectCustomerData() {
    const mailing = parseMailingAddress();
    const customerVm = extractErieCustomerViewModel();
    const vmPrimary = customerVm && customerVm.FirstNamedInsured
      ? mapErieNamedInsuredFromViewModel(customerVm.FirstNamedInsured)
      : null;
    const vmSecondary = customerVm && customerVm.SecondNamedInsured
      ? mapErieNamedInsuredFromViewModel(customerVm.SecondNamedInsured)
      : null;

    if (customerVm) console.log('[MCI Auto] Erie ViewModel found');
    else console.log('[MCI Auto] Erie ViewModel not found, falling back to DOM');

    const data = {
      // ---- Policy & insured info ----
      named_insured: getSelectedText('#ddlFirstNamedInsured'),
      insured_email: getText('.customer-lockdown-email'),
      insured_first_name: '',
      insured_middle_name: '',
      insured_last_name: '',
      insured_suffix: '',
      insured_gender: '',
      insured_dob: '',
      insured_ssn: '',
      insured_dl_state: '',
      insured_dl_number: '',
      insured_phone: '',
      insured_phone_type: '',

      second_insured_first_name: '',
      second_insured_middle_name: '',
      second_insured_last_name: '',
      second_insured_suffix: '',
      second_insured_gender: '',
      second_insured_dob: '',
      second_insured_ssn: '',
      second_insured_dl_state: '',
      second_insured_dl_number: '',
      second_insured_email: '',
      second_insured_phone: '',
      second_insured_phone_type: '',

      garaging_address: mailing.street,
      city:             mailing.city,
      zip_code:         mailing.zip,
      county:           getCounty(),

      prior_carrier_premium: '',
      limit_of_liability:  '',
      med_pay_limit:       '',
      um_limit:            '',
      uim_limit:           '',
      prior_policy_term:         '',
      continuous_coverage_12mo:  '',
      date_policy_cancelled:     '',

      // Vehicles / Drivers placeholders
      veh1_class_use_type: '', veh1_vin: '', veh1_year: '', veh1_make: '', veh1_model: '',
      veh1_comp_ded: '',       veh1_coll_ded: '',       veh1_tow_limit: '', veh1_rental_limit: '',

      veh2_class_use_type: '', veh2_vin: '', veh2_year: '', veh2_make: '', veh2_model: '',
      veh2_comp_ded: '',       veh2_coll_ded: '',       veh2_tow_limit: '', veh2_rental_limit: '',

      veh3_class_use_type: '', veh3_vin: '', veh3_year: '', veh3_make: '', veh3_model: '',
      veh3_comp_ded: '',       veh3_coll_ded: '',       veh3_tow_limit: '', veh3_rental_limit: '',

      veh4_class_use_type: '', veh4_vin: '', veh4_year: '', veh4_make: '', veh4_model: '',
      veh4_comp_ded: '',       veh4_coll_ded: '',       veh4_tow_limit: '', veh4_rental_limit: '',

      drv1_name: '', drv1_dob: '', drv1_dl: '', drv1_state: '', drv1_ssn: '', drv1_occupation: '',
      drv2_name: '', drv2_dob: '', drv2_dl: '', drv2_state: '', drv2_ssn: '', drv2_occupation: '',
      drv3_name: '', drv3_dob: '', drv3_dl: '', drv3_state: '', drv3_ssn: '', drv3_occupation: '',
      drv4_name: '', drv4_dob: '', drv4_dl: '', drv4_state: '', drv4_ssn: '', drv4_occupation: '',

      rent_or_own: '',
      home_currently_with_agency: '',
      home_insurance_company: '',
      claims_last_4_years: ''
    };

    if (vmPrimary) {
      const vmName = buildFullName([vmPrimary.first_name, vmPrimary.middle_name, vmPrimary.last_name, vmPrimary.suffix]);
      if (vmName) data.named_insured = vmName;
      data.insured_email = vmPrimary.email || data.insured_email || '';
      data.insured_first_name = vmPrimary.first_name || '';
      data.insured_middle_name = vmPrimary.middle_name || '';
      data.insured_last_name = vmPrimary.last_name || '';
      data.insured_suffix = vmPrimary.suffix || '';
      data.insured_gender = vmPrimary.gender || '';
      data.insured_dob = vmPrimary.dob || '';
      data.insured_ssn = vmPrimary.ssn || '';
      data.insured_dl_state = vmPrimary.dl_state || '';
      data.insured_dl_number = vmPrimary.dl_number || '';
      data.insured_phone = vmPrimary.phone || '';
      data.insured_phone_type = vmPrimary.phone_type || '';
    }

    if (vmSecondary) {
      data.second_insured_first_name = vmSecondary.first_name || '';
      data.second_insured_middle_name = vmSecondary.middle_name || '';
      data.second_insured_last_name = vmSecondary.last_name || '';
      data.second_insured_suffix = vmSecondary.suffix || '';
      data.second_insured_gender = vmSecondary.gender || '';
      data.second_insured_dob = vmSecondary.dob || '';
      data.second_insured_ssn = vmSecondary.ssn || '';
      data.second_insured_dl_state = vmSecondary.dl_state || '';
      data.second_insured_dl_number = vmSecondary.dl_number || '';
      data.second_insured_email = vmSecondary.email || '';
      data.second_insured_phone = vmSecondary.phone || '';
      data.second_insured_phone_type = vmSecondary.phone_type || '';
    }

    console.log('[MCI Auto] Customer data collected:', data);
    return data;
  }

  function handleCustomerClick() {
    try {
      console.log('[MCI Auto] Step 1 â€“ Collecting Customer dataâ€¦');
      const data = collectCustomerData();
      GM_setValue(STORAGE_KEY, data);
      console.log('[MCI Auto] Stored Customer data into GM storage:', data);

      // Set flow to auto-run next step on Drivers page
      GM_setValue(FLOW_KEY, 'after_customer');

      // Navigate to Drivers tab
      const drvTab = document.querySelector('#DriverHeaderTab a');
      if (drvTab) {
        const dataUrl = drvTab.getAttribute('data-url'); // "Driver"
        if (dataUrl) {
          const href = window.location.href;
          const idx  = href.indexOf('/Customer');
          const base = idx > -1 ? href.substring(0, idx) : href;
          const targetUrl = base.replace(/\/$/, '') + '/' + dataUrl.replace(/^\//, '');
          console.log('[MCI Auto] Navigating to Drivers:', targetUrl);
          window.location.href = targetUrl;
        } else {
          alert('Saved Customer data, but could not find Drivers URL (data-url missing).');
        }
      } else {
        alert('Saved Customer data. Now click the "Drivers" tab and the script will continue automatically.');
      }
    } catch (e) {
      console.error('[MCI Auto] Error in Step 1:', e);
      alert('Error capturing Customer data. Check the console.');
      GM_setValue(FLOW_KEY, 'idle');
    }
  }

  // =========================
  // STEP 2  DRIVERS TAB
  // =========================

  async function collectDrivers() {
    const buttons = Array.from(
      document.querySelectorAll('#DriverGridTableItems .driver-view-edit-button')
    );
    const customerVm = extractErieCustomerViewModel();
    const driverViewData = extractErieDriverViewData();
    const viewDataDrivers = getErieDriversFromViewData(driverViewData);
    const usedViewDataDriverIndexes = new Set();
    const vmDrivers = [];
    if (customerVm && customerVm.FirstNamedInsured) vmDrivers.push(mapErieNamedInsuredFromViewModel(customerVm.FirstNamedInsured));
    if (customerVm && customerVm.SecondNamedInsured) vmDrivers.push(mapErieNamedInsuredFromViewModel(customerVm.SecondNamedInsured));

    if (customerVm) console.log('[MCI Auto] Erie ViewModel found');
    else console.log('[MCI Auto] Erie ViewModel not found, falling back to DOM');
    if (viewDataDrivers.length) console.log('[MCI Auto] Erie Driver viewData found');
    else console.log('[MCI Auto] Erie Driver viewData not found, falling back to DOM');

    console.log('[MCI Auto] Found', buttons.length, 'driver rows.');
    const drivers = [];

    for (let i = 0; i < buttons.length && i < 4; i++) {
      console.log(`[MCI Auto] === DRIVER LOOP START #${i + 1} ===`);
      try {
        const btn = buttons[i];
        if (!btn) {
          console.warn('[MCI Auto] No button element for driver index', i);
          continue;
        }

        console.log('[MCI Auto] Clicking driver View/Edit button for driver', i + 1);
        btn.click();

        try {
          await waitForElement('#DriverContentFrame', 15000);
          console.log('[MCI Auto] DriverContentFrame visible for driver', i + 1);
        } catch (e) {
          console.warn('[MCI Auto] Timeout waiting for DriverContentFrame for driver', i + 1, e);
        }

        await wait(300);

        const firstInput =
          document.querySelector('#DriverContentFrame #txtFirstName') ||
          document.querySelector('#txtFirstName');
        const lastInput =
          document.querySelector('#DriverContentFrame #txtLastName') ||
          document.querySelector('#txtLastName');

        const firstName = firstInput ? (firstInput.value || '').trim() : '';
        const lastName  = lastInput  ? (lastInput.value  || '').trim() : '';
        let viewDataDriver = findMatchingErieDriver(viewDataDrivers, firstName, lastName, usedViewDataDriverIndexes);
        if (!viewDataDriver && viewDataDrivers[i] && !usedViewDataDriverIndexes.has(i)) {
          viewDataDriver = viewDataDrivers[i];
          usedViewDataDriverIndexes.add(i);
        }

        const dobInput =
          document.querySelector('#DriverContentFrame #txtDateOfBirth_') ||
          document.querySelector('#txtDateOfBirth_');
        let dob = '';
        if (dobInput) {
          try {
            dobInput.focus();
            dobInput.dispatchEvent(new Event('focus', { bubbles: true }));
          } catch (e) {
            console.warn('[MCI Auto] Could not focus DOB for driver', i + 1, e);
          }
          await wait(200);
          dob = (dobInput.value || '').trim();
        }

        const dlInput =
          document.querySelector('#DriverContentFrame #txtLicenseNumber') ||
          document.querySelector('#txtLicenseNumber');
        const dlNumber = dlInput ? (dlInput.value || '').trim() : '';

        const stateSel =
          document.querySelector('#DriverContentFrame #selLicenseState') ||
          document.querySelector('#selLicenseState');
        const dlState = stateSel ? (stateSel.value || '').trim() : '';

        const ssnInput =
          document.querySelector('#DriverContentFrame #SSNText_1') ||
          document.querySelector('#SSNText_1');
        const ssn = ssnInput ? (ssnInput.value || '').trim() : '';

        const vmNamedInsured = vmDrivers[i] || null;
        const vmDriverDob = viewDataDriver ? cleanStringValue(viewDataDriver.dob) : '';
        const vmDriverDlNumber = viewDataDriver ? cleanStringValue(viewDataDriver.dl_number) : '';
        const vmDriverDlState = viewDataDriver ? cleanStringValue(viewDataDriver.dl_state) : '';
        const vmDriverSsn = viewDataDriver ? cleanStringValue(viewDataDriver.ssn) : '';
        const vmDriverGender = viewDataDriver ? cleanStringValue(viewDataDriver.gender) : '';
        const vmFirst = vmNamedInsured ? cleanStringValue(vmNamedInsured.first_name) : '';
        const vmMiddle = vmNamedInsured ? cleanStringValue(vmNamedInsured.middle_name) : '';
        const vmLast = vmNamedInsured ? cleanStringValue(vmNamedInsured.last_name) : '';
        const vmFullName = buildFullName([vmFirst, vmMiddle, vmLast]);
        const safeDob = isMaskedSensitiveValue(dob) ? '' : dob;
        const safeDlNumber = dlNumber;
        const safeSsn = isMaskedSensitiveValue(ssn) ? '' : ssn;
        const preferVmNamedInsured = !!vmNamedInsured && (
          (!firstName && !lastName) ||
          (vmFirst && firstName && vmFirst.toLowerCase() === firstName.toLowerCase()) ||
          (vmLast && lastName && vmLast.toLowerCase() === lastName.toLowerCase())
        );
        const finalFirstName = preferVmNamedInsured ? pickPreferredValue([vmFirst, firstName], false) : pickPreferredValue([firstName, vmFirst], false);
        const finalLastName = preferVmNamedInsured ? pickPreferredValue([vmLast, lastName], false) : pickPreferredValue([lastName, vmLast], false);
        const finalMiddleName = preferVmNamedInsured ? vmMiddle : '';
        const finalName = buildFullName([finalFirstName, finalMiddleName, finalLastName]) || vmFullName;
        const finalDob = preferVmNamedInsured
          ? pickPreferredValue([vmNamedInsured && vmNamedInsured.dob, vmDriverDob, safeDob], true)
          : pickPreferredValue([vmDriverDob, safeDob, vmNamedInsured && vmNamedInsured.dob], true);
        const finalDlNumber = preferVmNamedInsured
          ? pickPreferredValue([vmNamedInsured && vmNamedInsured.dl_number, vmDriverDlNumber, safeDlNumber], true)
          : pickPreferredValue([vmDriverDlNumber, safeDlNumber, vmNamedInsured && vmNamedInsured.dl_number], true);
        const finalDlState = preferVmNamedInsured
          ? pickPreferredValue([vmNamedInsured && vmNamedInsured.dl_state, vmDriverDlState, dlState], false)
          : pickPreferredValue([vmDriverDlState, dlState, vmNamedInsured && vmNamedInsured.dl_state], false);
        const finalSsn = preferVmNamedInsured
          ? pickPreferredValue([vmNamedInsured && vmNamedInsured.ssn, vmDriverSsn, safeSsn], true)
          : pickPreferredValue([vmDriverSsn, safeSsn, vmNamedInsured && vmNamedInsured.ssn], true);

        const driverObj = {
          firstName: finalFirstName,
          middleName: finalMiddleName,
          lastName: finalLastName,
          fullName: finalName,
          gender: pickPreferredValue([vmNamedInsured ? cleanStringValue(vmNamedInsured.gender) : '', vmDriverGender], false),
          dob: finalDob,
          dlNumber: finalDlNumber,
          dlState: finalDlState,
          ssn: finalSsn
        };

        console.log('[MCI Auto] Driver #' + (i + 1) + ' data:', driverObj);
        drivers.push(driverObj);

        const cancelBtn =
          document.querySelector('#DriverContentFrame #btnCancelDriver') ||
          document.querySelector('#btnCancelDriver');
        if (cancelBtn) {
          console.log('[MCI Auto] Clicking Cancel for driver', i + 1);
          cancelBtn.click();
          await wait(300);
        } else {
          console.warn('[MCI Auto] Cancel button not found for driver', i + 1);
        }
      } catch (e) {
        console.error('[MCI Auto] Error while scraping driver #', i + 1, e);
      }
      console.log(`[MCI Auto] === DRIVER LOOP END #${i + 1} ===`);
    }

    for (let i = drivers.length; i < vmDrivers.length && i < 4; i++) {
      const vmNamedInsured = vmDrivers[i];
      const firstName = cleanStringValue(vmNamedInsured.first_name);
      const lastName = cleanStringValue(vmNamedInsured.last_name);
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      if (!fullName && !vmNamedInsured.dob && !vmNamedInsured.ssn && !vmNamedInsured.dl_number) continue;

      drivers.push({
        firstName: firstName,
        middleName: cleanStringValue(vmNamedInsured.middle_name),
        lastName: lastName,
        fullName: fullName,
        gender: cleanStringValue(vmNamedInsured.gender),
        dob: cleanStringValue(vmNamedInsured.dob),
        dlNumber: cleanStringValue(vmNamedInsured.dl_number),
        dlState: cleanStringValue(vmNamedInsured.dl_state),
        ssn: cleanStringValue(vmNamedInsured.ssn)
      });
    }

    console.log('[MCI Auto] Finished collectDrivers. Total scraped:', drivers.length);
    return drivers;
  }

  async function handleDrivers(autoMode = false) {
    try {
      console.log('[MCI Auto] Step 2 â€“ loading Customer data from storageâ€¦');
      const baseData = GM_getValue(STORAGE_KEY, null);
      if (!baseData) {
        if (!autoMode) {
          alert('No stored Customer data found. Start from the Customer step first.');
        }
        console.warn('[MCI Auto] No stored Customer data â€“ aborting Drivers step.');
        GM_setValue(FLOW_KEY, 'idle');
        return;
      }

      const drivers = await collectDrivers();
      console.log('[MCI Auto] Drivers array:', drivers);

      const merged = Object.assign({}, baseData);

      drivers.forEach((d, idx) => {
        const n = idx + 1;
        const prefix = `drv${n}_`;
        merged[prefix + 'name']  = d.fullName || '';
        merged[prefix + 'first_name'] = d.firstName || '';
        merged[prefix + 'middle_name'] = d.middleName || '';
        merged[prefix + 'last_name'] = d.lastName || '';
        merged[prefix + 'dob']   = d.dob || '';
        merged[prefix + 'dl']    = d.dlNumber || '';
        merged[prefix + 'state'] = d.dlState || '';
        merged[prefix + 'ssn']   = d.ssn || '';
        merged[prefix + 'gender'] = d.gender || '';
      });

      GM_setValue(STORAGE_KEY, merged);
      console.log('[MCI Auto] Merged data with Drivers:', merged);

      // Set flow state for Vehicles
      GM_setValue(FLOW_KEY, 'after_drivers');

      // Navigate to Vehicles tab
      const vehTab = document.querySelector('#VehicleHeaderTab a');
      if (vehTab) {
        const dataUrl = vehTab.getAttribute('data-url'); // "Vehicle"
        if (dataUrl) {
          const href = window.location.href;
          const idx  = href.indexOf('/Driver');
          const base = idx > -1 ? href.substring(0, idx) : href;
          const targetUrl = base.replace(/\/$/, '') + '/' + dataUrl.replace(/^\//, '');
          console.log('[MCI Auto] Navigating to Vehicles:', targetUrl);
          window.location.href = targetUrl;
        } else if (!autoMode) {
          alert('Saved Drivers. Could not find Vehicles URL (data-url missing).');
        }
      } else if (!autoMode) {
        alert('Saved Drivers. Now click the "Vehicles" tab and the script will continue there.');
      }
    } catch (e) {
      console.error('[MCI Auto] Error in Step 2 (Drivers):', e);
      if (!autoMode) {
        alert('There was an error loading driver data. Check the console for details.');
      }
      GM_setValue(FLOW_KEY, 'idle');
    }
  }

  // =========================
  // STEP 3  VEHICLES TAB
  // =========================

  // Wait until Year / Make / Model spans have some text
  async function waitForVehicleDetails(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const yearSpan  = document.querySelector('span[data-bind*="VehicleFormContainer.VehicleForm.Year"]');
      const makeSpan  = document.querySelector('span[data-bind*="VehicleFormContainer.VehicleForm.FullMake"]');
      const modelSpan = document.querySelector('span[data-bind*="VehicleFormContainer.VehicleForm.FullModel"]');

      const year  = yearSpan  ? (yearSpan.innerText  || yearSpan.textContent  || '').trim() : '';
      const make  = makeSpan  ? (makeSpan.innerText  || makeSpan.textContent  || '').trim() : '';
      const model = modelSpan ? (modelSpan.innerText || modelSpan.textContent || '').trim() : '';

      if (year || make || model) {
        return { year, make, model };
      }
      await wait(200);
    }
    console.warn('[MCI Auto] Timeout waiting for vehicle details; returning blanks.');
    return { year: '', make: '', model: '' };
  }

  async function collectVehicles() {
    const maxVehicles = Math.min(
      4,
      document.querySelectorAll('table.DataTable.tableStyle a.vehicle-name').length
    );

    console.log('[MCI Auto] Found', maxVehicles, 'vehicle rows.');
    const vehicles = [];

    for (let i = 0; i < maxVehicles; i++) {
      console.log(`[MCI Auto] Opening vehicle #${i + 1}`);

      // Re-query links each loop so we don't use stale references
      const links = document.querySelectorAll('table.DataTable.tableStyle a.vehicle-name');
      const link = links[i];
      if (!link) {
        console.warn('[MCI Auto] No vehicle link at index', i);
        continue;
      }

      // VIN before clicking (to detect change)
      const vinInputBefore = document.querySelector('#VIN');
      const prevVin = vinInputBefore ? (vinInputBefore.value || '').trim() : '';

      // Open this vehicleâ€™s detail panel
      link.click();

      // Wait for vehicle form and for VIN to change
      await waitForElement('#VehicleType', 8000);
      await waitForVehicleChange(prevVin, 8000);

      // ---- Class Use Type ----
      let classUseType = '';
      const classUseSel = document.querySelector('#VehicleType');
      if (classUseSel) {
        const opt = classUseSel.options[classUseSel.selectedIndex];
        classUseType = opt ? (opt.text || '').trim() : '';
      }

      // ---- Full VIN from detail form ----
      let vin = '';
      const vinInput = document.querySelector('#VIN');
      if (vinInput) {
        vin = (vinInput.value || '').trim();
      }

      // ---- Year / Make / Model (wait until populated) ----
      const details = await waitForVehicleDetails(8000);
      const year  = details.year;
      const make  = details.make;
      const model = details.model;

      const vObj = { classUseType, vin, year, make, model };
      vehicles.push(vObj);
      console.log('[MCI Auto] Vehicle #' + (i + 1) + ' data:', vObj);
    }

    console.log('[MCI Auto] Finished collectVehicles. Total scraped:', vehicles.length);
    return vehicles;
  }

  async function handleVehicles(autoMode = false) {
    try {
      console.log('[MCI Auto] Step 3 â€“ Loading Customer+Drivers from storageâ€¦');
      const baseData = GM_getValue(STORAGE_KEY, null);
      if (!baseData) {
        if (!autoMode) {
          alert('No stored Customer/Driver data found. Run the earlier steps first.');
        }
        console.warn('[MCI Auto] No stored Customer/Driver data â€“ aborting Vehicles step.');
        GM_setValue(FLOW_KEY, 'idle');
        return;
      }

      const vehicles = await collectVehicles();
      console.log('[MCI Auto] Collected vehicles array:', vehicles);

      const merged = Object.assign({}, baseData);

      vehicles.forEach((v, idx) => {
        const n = idx + 1;
        merged[`veh${n}_class_use_type`] = v.classUseType || '';
        merged[`veh${n}_vin`]            = v.vin || '';
        merged[`veh${n}_year`]           = v.year || '';
        merged[`veh${n}_make`]           = v.make || '';
        merged[`veh${n}_model`]          = v.model || '';
      });

      console.log('[MCI Auto] Merged data with Vehicles:', merged);
      GM_setValue(STORAGE_KEY, merged);

      // Set flow state for Coverages
      GM_setValue(FLOW_KEY, 'after_vehicles');

      // Navigate to Coverages tab
      const covTab = document.querySelector('#CoveragesHeaderTab a');
      if (covTab) {
        const dataUrl = covTab.getAttribute('data-url'); // e.g. "Coverages/Auto?shouldRate=true"
        if (dataUrl) {
          const href = window.location.href;
          const idx  = href.indexOf('/Vehicle');
          const base = idx > -1 ? href.substring(0, idx) : href;
          const targetUrl = base.replace(/\/$/, '') + '/' + dataUrl.replace(/^\//, '');
          console.log('[MCI Auto] Navigating to Coverages:', targetUrl);
          window.location.href = targetUrl;
        } else if (!autoMode) {
          alert('Saved Vehicles. Could not find Coverages URL (data-url missing).');
        }
      } else if (!autoMode) {
        alert('Saved Vehicles. Now click the "Coverages" tab and run the final step there.');
      }
    } catch (e) {
      console.error('[MCI Auto] Error in Step 3 (Vehicles):', e);
      if (!autoMode) {
        alert('There was an error loading vehicle data. Check the console for details.');
      }
      GM_setValue(FLOW_KEY, 'idle');
    }
  }

  // =========================
  // STEP 4  COVERAGES TAB (EXPORT)
  // =========================

  async function collectCoveragesData() {
    let eff = '';
    const start = Date.now();
    const timeoutMs = 4000;
    while (Date.now() - start < timeoutMs) {
      eff = getPolicyEffectiveDateFromCoverages();
      if (eff) break;
      await wait(150);
    }
    const data = {
      policy_eff_date: eff,
      limit_of_liability: getSelectedText('#BodilyInjury_Policy'),
      med_pay_limit:      getSelectedText('#NCMedicalPayments0'),
      uim_limit:          getSelectedText('#UIMBodilyInjury_Policy'),
      um_limit:           getSelectedText('#UMBodilyInjury_Policy')
    };

    const compList   = getVehicleCoverageByCode('Comprehensive');
    const collList   = getVehicleCoverageByCode('Collision');
    const towList    = getVehicleCoverageByCode('RoadService');
    const rentalList = getVehicleCoverageByCode('ExtendedTransportationExp');

    for (let i = 0; i < 4; i++) {
      const n = i + 1;
      data['veh' + n + '_comp_ded']     = compList[i]   || '';
      data['veh' + n + '_coll_ded']     = collList[i]   || '';
      data['veh' + n + '_tow_limit']    = towList[i]    || '';
      data['veh' + n + '_rental_limit'] = rentalList[i] || '';
    }

    console.log('[MCI Auto] Coverages data collected (incl per-vehicle):', data);
    return data;
  }

  async function handleCoverages(autoMode = false) {
    try {
      console.log('[MCI Auto] Step 4 â€“ loading combined data from storageâ€¦');
      const baseData = GM_getValue(STORAGE_KEY, null);
      if (!baseData) {
        if (!autoMode) {
          alert('No stored data found. Run the earlier steps first (Customer, Drivers, Vehicles).');
        }
        console.warn('[MCI Auto] No stored data â€“ aborting Coverages step.');
        GM_setValue(FLOW_KEY, 'idle');
        return;
      }

      const cov = await collectCoveragesData();
      const merged = Object.assign({}, baseData, cov);
      console.log('[MCI Auto] Final merged data (Customer + Drivers + Vehicles + Coverages):', merged);
      console.log('[MCI Auto] Normalizing payload for Auto form');
      const normalized = normalizePayloadForAutoForm(merged);
      console.log('[MCI Auto] Payload keys:', Object.keys(normalized));

      const json   = JSON.stringify(normalized);
      const base64 = btoa(json);
      const param  = encodeURIComponent(base64);

      const url =
        AUTO_FORM_URL +
        (AUTO_FORM_URL.includes('?') ? '&' : '?') +
        'mci=' + param;

      console.log('[MCI Auto] Opening Auto form with payload URL:', url);

      if (typeof GM_openInTab === 'function') {
        GM_openInTab(url, { active: true });
      } else {
        window.open(url, '_blank');
      }

      if (!autoMode) {
        alert('Auto data exported (Customer + Drivers + Vehicles + Coverages).');
      }

      GM_setValue(STORAGE_KEY, null);
      GM_setValue(FLOW_KEY, 'idle');
    } catch (e) {
      console.error('[MCI Auto] Error in Step 4 (Coverages/export):', e);
      if (!autoMode) {
        alert('There was an error exporting data. Check the console for [MCI Auto] messages.');
      }
      GM_setValue(FLOW_KEY, 'idle');
    }
  }

  // =========================
  // INIT  state machine by URL
  // =========================
  function init() {
    const href = window.location.href;
    const flow = GM_getValue(FLOW_KEY, 'idle') || 'idle';
    console.log('[MCI Auto] Init on URL:', href, 'flow state =', flow);

    if (href.includes('/Customer')) {
      // When we land on Customer, just reset and wait for Toolbox trigger
      GM_setValue(FLOW_KEY, 'idle');
      console.log('[MCI Auto] On Customer page â€“ waiting for MCI Toolbox trigger.');

    } else if (href.includes('/Driver')) {
      if (flow === 'after_customer') {
        console.log('[MCI Auto] Auto-mode: running Drivers step.');
        handleDrivers(true);
      } else {
        console.log('[MCI Auto] On Drivers page but flow state is', flow, 'â€“ not auto-running.');
      }

    } else if (href.includes('/Vehicle')) {
      if (flow === 'after_drivers') {
        console.log('[MCI Auto] Auto-mode: running Vehicles step.');
        handleVehicles(true);
      } else {
        console.log('[MCI Auto] On Vehicles page but flow state is', flow, 'â€“ not auto-running.');
      }

    } else if (href.includes('/Coverages/Auto')) {
      if (flow === 'after_vehicles') {
        console.log('[MCI Auto] Auto-mode: running Coverages/export step.');
        handleCoverages(true);
      } else {
        console.log('[MCI Auto] On Coverages page but flow state is', flow, 'â€“ not auto-running.');
      }
    } else {
      console.log('[MCI Auto] Script loaded, but URL did not match expected paths.');
    }
  }

  window.addEventListener('load', () => {
    // tiny delay so Erieâ€™s JS has time to paint
    wait(400).then(init);
  });

  // Expose a hook so the MCI Toolbox button can kick off the Auto export
  try {
    const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    pageWin.mciRunErieAutoExport = () => {
      console.log('[MCI Auto] Triggered from MCI Toolbox button.');
      GM_setValue(FLOW_KEY, 'idle');  // reset flow just in case
      handleCustomerClick();
    };
  } catch (e) {
    console.warn('[MCI Auto] Could not expose mciRunErieAutoExport:', e);
  }

})();
