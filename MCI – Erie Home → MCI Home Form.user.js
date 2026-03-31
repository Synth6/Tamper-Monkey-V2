// ==UserScript==
// @name         MCI – Erie Home → MCI Home Form
// @namespace    http://tampermonkey.net/
// @version      0.8.1
// @description  Export Erie Home quote data to the MCI Home Quote HTML form, walking Customer -> Dwelling -> Coverages, then opening the form.
// @author       Ron / MCI
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*/Customer*
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*/Dwelling*
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*/Coverages*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      geocoding.geo.census.gov
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/MCI%20%E2%80%93%20Erie%20Home%20%E2%86%92%20MCI%20Home%20Form.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/MCI%20%E2%80%93%20Erie%20Home%20%E2%86%92%20MCI%20Home%20Form.user.js
// ==/UserScript==

(function () {
  'use strict';

  const HOME_FORM_URL = 'https://middlecreekins.com/wp-content/uploads/JonesForms/HomeQuoteForm.html';
  const STORAGE_KEY = 'mci_erie_home_data_v1';
  const FLOW_KEY = 'mci_erie_home_flow_v1';

  function wait(ms) {
    return new Promise(function (res) { res(ms ? setTimeout(res, ms) : res()); });
  }

  function cleanString(v) {
    return v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  }

  function getSelectedText(selector) {
    const sel = document.querySelector(selector);
    if (!sel) {
      console.warn('[MCI Home] No <select> found for', selector);
      return '';
    }
    const opt = sel.options[sel.selectedIndex];
    const value = opt ? cleanString(opt.text || opt.innerText || '') : '';
    console.log('[MCI Home] Selected text for', selector, '->', value);
    return value;
  }

  function getValue(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      console.warn('[MCI Home] No input/select found for', selector);
      return '';
    }
    const value = cleanString(el.value || '');
    console.log('[MCI Home] Value for', selector, '->', value);
    return value;
  }

  function getText(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      console.warn('[MCI Home] No element found for', selector);
      return '';
    }
    const value = cleanString(el.innerText || el.textContent || '');
    console.log('[MCI Home] Text for', selector, '->', value);
    return value;
  }

  function getCurrentHomeInsurerText() {
    const sel = document.querySelector('#CurrentHomeInsurer');
    if (!sel) {
      console.warn('[MCI Home] #CurrentHomeInsurer select not found.');
      return '';
    }

    const idx = sel.selectedIndex;
    if (idx < 0) {
      console.warn('[MCI Home] CurrentHomeInsurer has no selected option.');
      return '';
    }

    const opt = sel.options[idx];
    const text = opt ? cleanString(opt.text || opt.innerText || '') : '';
    const value = sel.value != null ? cleanString(sel.value) : '';

    console.log('[MCI Home] CurrentHomeInsurer -> value =', value, ', text =', text);
    return value || text;
  }

  function getCounty() {
    const sel = document.querySelector('#selMailingCountyList');
    if (sel) {
      const txt = cleanString(sel.value || '');
      console.log('[MCI Home] County from #selMailingCountyList ->', txt);
      return txt;
    }

    const boldSpan = document.querySelector('.editor-block span.bold');
    if (boldSpan) {
      const txt = cleanString(boldSpan.innerText || boldSpan.textContent || '');
      console.log('[MCI Home] County from bold span ->', txt);
      return txt;
    }

    console.warn('[MCI Home] County not found');
    return '';
  }

  function getNamedInsuredEmail() {
    const label = document.querySelector('label.named-insured-value.customer-lockdown-email');
    if (!label) {
      console.warn('[MCI Home] Email label not found');
      return '';
    }
    const raw = cleanString(label.innerText || label.textContent || '');
    return /^none entered$/i.test(raw) ? '' : raw;
  }

  function parseAddressText(raw) {
    const text = cleanString(raw || '');
    if (!text) {
      return {
        full: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        zip: '',
        zipPlus4: ''
      };
    }

    const lines = String(raw || '')
      .split(/\n+/)
      .map(function (s) { return cleanString(s); })
      .filter(Boolean);

    let line1 = '';
    let line2 = '';
    let city = '';
    let state = '';
    let zip = '';
    let zipPlus4 = '';

    if (lines.length) {
      line1 = lines[0] || '';
    }

    if (lines.length >= 2) {
      const joined = cleanString(lines.slice(1).join(' '));
      let m = joined.match(/^(.*?),\s*([A-Z]{2})\s+(\d{5})(?:\s*-\s*(\d{4}))?$/i);
      if (m) {
        city = cleanString(m[1]);
        state = cleanString(m[2]).toUpperCase();
        zip = cleanString(m[3]);
        zipPlus4 = cleanString(m[4] || '');
      } else {
        m = text.match(/^(.*?)(?:,|\s)\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\s*(\d{4}))?$/i);
        if (m) {
          line1 = cleanString(m[1]);
          city = cleanString(m[2]);
          state = cleanString(m[3]).toUpperCase();
          zip = cleanString(m[4]);
          zipPlus4 = cleanString(m[5] || '');
        }
      }
    } else {
      const m = text.match(/^(.*?)(?:,|\s)\s*([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})(?:-\s*(\d{4}))?$/i);
      if (m) {
        line1 = cleanString(m[1]);
        city = cleanString(m[2]);
        state = cleanString(m[3]).toUpperCase();
        zip = cleanString(m[4]);
        zipPlus4 = cleanString(m[5] || '');
      }
    }

    const cityStateZip = city && state && zip
      ? city + ', ' + state + ' ' + zip + (zipPlus4 ? '-' + zipPlus4 : '')
      : [city, state, zip].filter(Boolean).join(' ');

    const full = cleanString(
      [line1, line2, cityStateZip].filter(Boolean).join(' ')
    );

    return {
      full: full || text,
      line1: line1,
      line2: line2,
      city: city,
      state: state,
      zip: zip,
      zipPlus4: zipPlus4
    };
  }

  function parseMailingAddress() {
    const addrDiv = document.querySelector('#mailing-address-text');
    if (!addrDiv) {
      console.warn('[MCI Home] No #mailing-address-text found');
      return {
        full: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        zip: '',
        zipPlus4: ''
      };
    }

    const parsed = parseAddressText(addrDiv.innerText || addrDiv.textContent || '');
    console.log('[MCI Home] Parsed mailing address:', parsed);
    return parsed;
  }

  function parseDwellingLocationAddress() {
    let host = document.querySelector('#LocationAddress');

    if (!host) {
      const rows = document.querySelectorAll('table.FormTable tr');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const firstCell = row.querySelector('td');
        if (!firstCell) continue;

        const labelText = cleanString(firstCell.textContent || firstCell.innerText || '');
        if (labelText.indexOf('Location Address') !== -1) {
          const cells = row.querySelectorAll('td');
          if (cells.length > 1) {
            host = cells[1].querySelector('.dataDisplay') || cells[1];
            break;
          }
        }
      }
    }

    if (!host) {
      console.warn('[MCI Home] Dwelling location address host not found.');
      return {
        full: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        zip: '',
        zipPlus4: ''
      };
    }

    const parsed = parseAddressText(host.innerText || host.textContent || '');
    console.log('[MCI Home] Parsed dwelling location address:', parsed);
    return parsed;
  }

  function grabObscuredValue(paramSubstring, index) {
    if (index == null) index = 0;
    const comps = document.querySelectorAll('obscured-text-with-toggle[params*="' + paramSubstring + '"]');
    const comp = comps[index];
    if (!comp) {
      console.warn('[MCI Home] No obscured-text-with-toggle found for', paramSubstring, 'at index', index);
      return '';
    }
    const span = comp.querySelector('obscured-text-field-container span');
    if (!span) {
      console.warn('[MCI Home] No span inside obscured component for', paramSubstring, 'at index', index);
      return '';
    }
    const txt = cleanString(span.innerText || span.textContent || '');
    console.log('[MCI Home] Obscured value for', paramSubstring, '[' + index + '] ->', txt);
    return txt;
  }

  async function getFullDateOfBirth(index, allowReveal) {
    if (index == null) index = 0;
    if (allowReveal == null) allowReveal = true;

    const comps = document.querySelectorAll('obscured-text-with-toggle[params*="dates.obscure"]');
    const comp = comps[index];
    if (!comp) {
      console.warn('[MCI Home] DOB component not found at index', index);
      return '';
    }

    const span = comp.querySelector('obscured-text-field-container span');
    const toggle = allowReveal ? comp.querySelector('obscured-text-toggle .reveal-data-btn') : null;

    if (!span) {
      console.warn('[MCI Home] DOB span not found at index', index);
      return '';
    }

    let txt = cleanString(span.innerText || span.textContent || '');

    if (allowReveal && /\*/.test(txt) && toggle) {
      console.log('[MCI Home] DOB appears masked at index', index, '- clicking eye icon...');
      toggle.click();
      await new Promise(function (resolve) { setTimeout(resolve, 300); });
      txt = cleanString(span.innerText || span.textContent || '');
      console.log('[MCI Home] DOB after reveal at index', index, '->', txt);
    } else {
      console.log('[MCI Home] DOB at index', index, '->', txt);
    }

    return txt;
  }

  function normalizeDateToISO(text) {
    const s = cleanString(text);
    if (!s || /^none entered$/i.test(s)) return '';

    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return s;

    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return '';

    let mm = m[1].padStart(2, '0');
    let dd = m[2].padStart(2, '0');
    let yy = m[3];

    if (yy.length === 2) {
      yy = (parseInt(yy, 10) >= 50 ? '19' : '20') + yy;
    }

    return yy + '-' + mm + '-' + dd;
  }

  function normalizeDateToDisplay(text) {
    const s = cleanString(text);
    if (!s || /^none entered$/i.test(s)) return '';

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      return iso[2] + '/' + iso[3] + '/' + iso[1];
    }

    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return s;

    let mm = m[1].padStart(2, '0');
    let dd = m[2].padStart(2, '0');
    let yy = m[3];
    if (yy.length === 2) {
      yy = (parseInt(yy, 10) >= 50 ? '19' : '20') + yy;
    }

    return mm + '/' + dd + '/' + yy;
  }

  function tryEvalObjectLiteral(str) {
    try {
      // eslint-disable-next-line no-new-func
      return Function('"use strict"; return (' + str + ');')();
    } catch (e) {
      return null;
    }
  }

  function getInlineScriptText() {
    const scripts = Array.from(document.scripts || []);
    return scripts.map(function (s) { return s.textContent || ''; }).join('\n');
  }

  function findBalancedObjectEnd(text, openIndex) {
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    for (let i = openIndex; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (inSingle) {
        if (ch === "'") inSingle = false;
        continue;
      }
      if (inDouble) {
        if (ch === '"') inDouble = false;
        continue;
      }
      if (inTemplate) {
        if (ch === '`') inTemplate = false;
        continue;
      }

      if (ch === "'") {
        inSingle = true;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        continue;
      }
      if (ch === '`') {
        inTemplate = true;
        continue;
      }

      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }

    return -1;
  }

  function parseCustomerViewModelFromPage() {
    const pageText = getInlineScriptText();
    if (!pageText) {
      console.warn('[MCI Home] No inline script text found while searching for Erie customer VM.');
      return null;
    }

    const needles = [
      'new plw.customer.ViewModel(',
      'plw.customer.ViewModel(',
      'CustomerViewModel('
    ];

    for (let n = 0; n < needles.length; n++) {
      const needle = needles[n];
      let start = 0;

      while (true) {
        const idx = pageText.indexOf(needle, start);
        if (idx === -1) break;

        const openBrace = pageText.indexOf('{', idx + needle.length);
        if (openBrace === -1) break;

        const closeBrace = findBalancedObjectEnd(pageText, openBrace);
        if (closeBrace === -1) break;

        const objText = pageText.slice(openBrace, closeBrace + 1);
        const parsed = tryEvalObjectLiteral(objText);

        if (parsed && typeof parsed === 'object') {
          console.log('[MCI Home] Parsed Erie inline customer VM using needle:', needle, parsed);
          return parsed;
        }

        start = closeBrace + 1;
      }
    }

    console.warn('[MCI Home] Could not parse Erie inline customer VM from page.');
    return null;
  }

  function normalizeEriePerson(form, flags) {
    if (!form || typeof form !== 'object') return null;

    const firstName = cleanString(form.FirstName || '');
    const middleName = cleanString(form.MiddleName || '');
    const lastName = cleanString(form.LastName || '');
    const displayName = cleanString(form.DisplayName || [firstName, middleName, lastName].join(' '));

    let dob = cleanString(
      form.DateOfBirth ||
      (form.DateOfBirthForm && form.DateOfBirthForm.DateOfBirth) ||
      ''
    );

    if (/^none entered$/i.test(dob)) dob = '';

    let ssn = cleanString(
      form.ExistingSSN ||
      form.SSN ||
      (form.SSNForm && (form.SSNForm.ExistingSSN || form.SSNForm.SSN)) ||
      ''
    );

    if (/^none entered$/i.test(ssn)) ssn = '';

    let dl = cleanString(form.DriverLicenseNumber || '');
    if (/^none entered$/i.test(dl)) dl = '';

    return {
      fullName: displayName,
      firstName: firstName,
      middleName: middleName,
      lastName: lastName,
      suffix: cleanString(form.Suffix || ''),
      email: cleanString(form.EmailAddress || ''),
      dob: dob,
      dobIso: normalizeDateToISO(dob),
      dobDisplay: normalizeDateToDisplay(dob),
      ssn: ssn,
      licenseNumber: dl,
      licenseState: cleanString(form.DriverLicenseState || ''),
      isPrimary: !!(flags && flags.isPrimary),
      isSecondary: !!(flags && flags.isSecondary)
    };
  }

  function getCustomerPeopleFromInlineVm() {
    const vm = parseCustomerViewModelFromPage();
    if (!vm || typeof vm !== 'object') {
      return { primary: null, secondary: null, rawVm: vm };
    }

    const primaryRaw =
      vm.FirstNamedInsured ||
      vm.NamedInsured ||
      vm.Customer ||
      null;

    const secondaryRaw =
      vm.SecondNamedInsured ||
      vm.SecondaryNamedInsured ||
      vm.CoApplicant ||
      null;

    const primary = normalizeEriePerson(primaryRaw, { isPrimary: true, isSecondary: false });
    const secondary = normalizeEriePerson(secondaryRaw, { isPrimary: false, isSecondary: true });

    console.log('[MCI Home] Inline VM normalized people:', { primary: primary, secondary: secondary });
    return { primary: primary, secondary: secondary, rawVm: vm };
  }

  function normalizeSecondNamedValue(v) {
    const s = cleanString(v);
    if (!s || /^none entered$/i.test(s)) return '';
    return s;
  }

  async function collectCustomerData() {
    console.log('[MCI Home] Collecting Customer-tab data...');

    const mailing = parseMailingAddress();
    const people = getCustomerPeopleFromInlineVm();
    const primary = people.primary;
    const secondary = people.secondary;

    const namedInsuredUi = getSelectedText('#ddlFirstNamedInsured');
    const insuredEmailUi = getNamedInsuredEmail();
    const currentCarrier = getCurrentHomeInsurerText();

    const dobRawPrimary = await getFullDateOfBirth(0, true);
    const dobRawSecond = await getFullDateOfBirth(1, false);

    const fallbackPrimaryDobIso = normalizeDateToISO(dobRawPrimary);
    const fallbackSecondDobDisplay = normalizeDateToDisplay(dobRawSecond);

    const fallbackPrimarySsn = grabObscuredValue('ssn.obscure', 0);
    const fallbackSecondSsn = grabObscuredValue('ssn.obscure', 1);
    const fallbackPrimaryDl = grabObscuredValue('licenseNumbers.obscure', 0);
    const fallbackSecondDl = grabObscuredValue('licenseNumbers.obscure', 1);

    const insuredBirthdate = cleanString(
      (primary && primary.dobIso) ||
      fallbackPrimaryDobIso ||
      ''
    );

    const secondNamedBirthdate = normalizeSecondNamedValue(
      (secondary && (secondary.dobDisplay || secondary.dob)) ||
      fallbackSecondDobDisplay ||
      ''
    );

    const insuredSSN = cleanString(
      (primary && primary.ssn) ||
      fallbackPrimarySsn ||
      ''
    );

    const secondNamedSSN = normalizeSecondNamedValue(
      (secondary && secondary.ssn) ||
      fallbackSecondSsn ||
      ''
    );

    const insuredLicenseNumber = cleanString(
      (primary && primary.licenseNumber) ||
      fallbackPrimaryDl ||
      ''
    );

    const secondNamedLicenseNumber = normalizeSecondNamedValue(
      (secondary && secondary.licenseNumber) ||
      fallbackSecondDl ||
      ''
    );

    let county = getCounty();

    if (!county) {
      county = await resolveCountyFromAddress(
        mailing.line1 || mailing.full || '',
        mailing.city || '',
        mailing.state || '',
        mailing.zip || ''
      );
    }

    const data = {
      namedInsured: cleanString((primary && primary.fullName) || namedInsuredUi || ''),
      insuredEmail: cleanString((primary && primary.email) || insuredEmailUi || ''),
      currentCarrier: currentCarrier,

      insuredBirthdate: insuredBirthdate,
      insuredSSN: insuredSSN,
      insuredLicenseNumber: insuredLicenseNumber,

      secondNamedBirthdate: secondNamedBirthdate,
      secondNamedSSN: secondNamedSSN,
      secondNamedLicenseNumber: secondNamedLicenseNumber,

      propertyAddress: mailing.line1 || '',
      city: mailing.city || '',
      state: mailing.state || '',
      zip: mailing.zip ? (mailing.zip + (mailing.zipPlus4 ? '-' + mailing.zipPlus4 : '')) : '',
      county: county,

      policyEffDate: '',
      cancelDate: '',
      hoForm: '',
      dwellingValue: '',
      liabilityLimit: '',
      medPayLimit: '',
      protectionClass: '',
      yearBuilt: '',
      squareFootage: '',
      constructionFrame: '',
      constructionBV: '',
      deductible: '',
      fireExtinguishers: '',
      deadBolts: '',
      smokeDetectors: '',
      centralHeat: '',
      centralAlarm: '',
      localAlarm: '',
      swimmingPool: '',
      poolFenced: '',
      trampoline: '',
      dogs: '',
      dogBreeds: '',
      dogBiteHistory: '',
      anyLosses3yrs: '',
      lossDescription: '',
      anySpecialEndorsements: '',
      specialEndorsementDetails: '',
      autoWithAgency: '',
      autoCompany: '',
      hasMortgage: '',
      paymentMethod: '',
      notes: ''
    };

    console.log('[MCI Home] Customer data object:', data);
    return data;
  }

  async function handleCustomerClick() {
    try {
      console.log('[MCI Home] Step 1 - collecting and storing Customer data...');
      const data = await collectCustomerData();
      GM_setValue(STORAGE_KEY, data);
      GM_setValue(FLOW_KEY, 'after_customer');

      const href = window.location.href;
      const idx = href.indexOf('/Customer');
      if (idx > -1) {
        const base = href.substring(0, idx);
        const targetUrl = base.replace(/\/$/, '') + '/Dwelling';
        console.log('[MCI Home] Navigating to Dwelling:', targetUrl);
        window.location.href = targetUrl;
      } else {
        alert('Saved Customer data, but could not find /Customer in URL to navigate to Dwelling.');
      }
    } catch (e) {
      console.error('[MCI Home] Error in Customer step:', e);
      alert('Error capturing Customer data. Check the console for [MCI Home] messages.');
      GM_setValue(FLOW_KEY, 'idle');
    }
  }

  function getYesNoFromRadioName(name) {
    const checked = document.querySelector('input[name="' + name + '"]:checked');
    if (!checked) return '';
    const value = cleanString(checked.value || '');
    if (/^(true|yes|y|1)$/i.test(value)) return 'Yes';
    if (/^(false|no|n|0)$/i.test(value)) return 'No';
    return value;
  }

  function collectDwellingData() {
    console.log('[MCI Home] Collecting Dwelling-tab data...');

    const data = {};

    const location = parseDwellingLocationAddress();
    if (location.line1 || location.city || location.state || location.zip) {
      data.propertyAddress = location.line1 || '';
      data.city = location.city || '';
      data.state = location.state || '';
      data.zip = location.zip ? (location.zip + (location.zipPlus4 ? '-' + location.zipPlus4 : '')) : '';
    }

    const dwellingAmount = getValue('#DwellingAmount');
    data.dwellingValue = dwellingAmount;

    const pcSel = document.querySelector('#ProtectionClass');
    if (pcSel) {
      let pcVal = '';
      const idx = pcSel.selectedIndex;

      if (idx >= 0) {
        const opt = pcSel.options[idx];
        pcVal = cleanString((opt && (opt.text || opt.value)) || '');
      } else {
        pcVal = cleanString(pcSel.value || '');
      }

      data.protectionClass = pcVal;
      console.log('[MCI Home] ProtectionClass ->', pcVal);
    } else {
      console.warn('[MCI Home] #ProtectionClass not found on Dwelling tab.');
    }

    data.yearBuilt = getValue('#ConstructionYear');
    data.squareFootage = getValue('#txtLivingArea');

    const consSel = document.querySelector('#ConstructionType');
    if (consSel) {
      data.constructionFrame = cleanString(consSel.value || '');
    }

    data.swimmingPool = getYesNoFromRadioName('HasSwimmingPool') || getYesNoFromRadioName('SwimmingPool');

    console.log('[MCI Home] Dwelling data object:', data);
    return data;
  }

  function goToCoveragesTab(autoMode) {
    const covTabLink = document.querySelector('#CoveragesHeaderTab a');
    if (covTabLink) {
      console.log('[MCI Home] Clicking Coverages tab link...');
      covTabLink.click();
      return true;
    }

    console.warn('[MCI Home] Coverages tab link (#CoveragesHeaderTab a) not found.');
    if (!autoMode) {
      alert('Captured Dwelling data, but could not find the Coverages tab to click. Please click it manually.');
    }
    return false;
  }

  async function handleDwelling(autoMode) {
    if (autoMode == null) autoMode = false;

    try {
      console.log('[MCI Home] Step 2 - Dwelling step starting...');
      const baseData = GM_getValue(STORAGE_KEY, null);
      if (!baseData) {
        console.warn('[MCI Home] No stored Customer data - aborting Dwelling step.');
        GM_setValue(FLOW_KEY, 'idle');
        if (!autoMode) {
          alert('No stored Customer data found. Start from the Customer step first.');
        }
        return;
      }

      const dwellingData = collectDwellingData();
      const merged = Object.assign({}, baseData, dwellingData);
      GM_setValue(STORAGE_KEY, merged);
      GM_setValue(FLOW_KEY, 'after_dwelling');

      const clicked = goToCoveragesTab(autoMode);

      if (!clicked && autoMode) {
        const href = window.location.href;
        const idx = href.indexOf('/Dwelling');
        if (idx > -1) {
          const base = href.substring(0, idx);
          const targetUrl = base.replace(/\/$/, '') + '/Coverages';
          console.log('[MCI Home] Fallback - navigating to Coverages via URL:', targetUrl);
          window.location.href = targetUrl;
        } else {
          console.warn('[MCI Home] Could not find /Dwelling in URL to navigate to Coverages.');
        }
      }
    } catch (e) {
      console.error('[MCI Home] Error in Dwelling step:', e);
      if (!autoMode) {
        alert('There was an error in the Dwelling step. Check the console for [MCI Home] messages.');
      }
      GM_setValue(FLOW_KEY, 'idle');
    }
  }

  function collectCoveragesData() {
    console.log('[MCI Home] Collecting Coverages-tab data...');

    const data = {};
    data.liabilityLimit = getValue('#LiabilityLimit');
    data.medPayLimit = getValue('#MedicalPayment');

    console.log('[MCI Home] Coverages data object:', data);
    return data;
  }

  function exportToHomeForm(data, autoMode) {
    const json = JSON.stringify(data);
    const base64 = btoa(json);
    const param = encodeURIComponent(base64);

    const url = HOME_FORM_URL + (HOME_FORM_URL.indexOf('?') !== -1 ? '&' : '?') + 'mci=' + param;

    console.log('[MCI Home] Opening Home form with payload URL:', url);

    if (typeof GM_openInTab === 'function') {
      GM_openInTab(url, { active: true });
    } else {
      window.open(url, '_blank');
    }

    if (!autoMode) {
      alert('Home data exported to MCI Home Quote form (Customer + Dwelling + Coverages).');
    }

    GM_setValue(STORAGE_KEY, null);
    GM_setValue(FLOW_KEY, 'idle');
  }

  async function ensureHomeCoveragesPanel() {
    function fieldsPresent() {
      return document.querySelector('#LiabilityLimit') || document.querySelector('#MedicalPayment');
    }

    if (fieldsPresent()) {
      console.log('[MCI Home] Coverages fields already present.');
      return true;
    }

    const homeLink =
      document.querySelector('#HomeCoveragesMenuItem a') ||
      document.querySelector('#HomeCoverages-link');

    if (!homeLink) {
      console.warn('[MCI Home] Home coverages tab not found.');
      return false;
    }

    console.log('[MCI Home] Clicking Home coverages sub-tab...');
    homeLink.click();

    for (let i = 0; i < 15; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, 300); });
      if (fieldsPresent()) {
        console.log('[MCI Home] Home coverages fields detected after tab click.');
        return true;
      }
    }

    console.warn('[MCI Home] Home coverages fields did not appear after clicking tab.');
    return false;
  }

  async function handleCoverages(autoMode) {
    if (autoMode == null) autoMode = false;

    try {
      console.log('[MCI Home] Step 3 - Coverages/export step starting...');
      const baseData = GM_getValue(STORAGE_KEY, null);
      if (!baseData) {
        console.warn('[MCI Home] No stored data - aborting Coverages step.');
        GM_setValue(FLOW_KEY, 'idle');
        if (!autoMode) {
          alert('No stored data found. Start from the Customer step.');
        }
        return;
      }

      const ok = await ensureHomeCoveragesPanel();
      if (!ok) {
        GM_setValue(FLOW_KEY, 'idle');
        if (!autoMode) {
          alert('Could not locate Home coverages panel. Please select the Home tab and re-run.');
        }
        return;
      }

      const coverageData = collectCoveragesData();
      const merged = Object.assign({}, baseData, coverageData);
      console.log('[MCI Home] Final merged Home data:', merged);

      exportToHomeForm(merged, autoMode);
    } catch (e) {
      console.error('[MCI Home] Error in Coverages step:', e);
      if (!autoMode) {
        alert('There was an error in the Coverages/export step. Check the console for [MCI Home] messages.');
      }
      GM_setValue(FLOW_KEY, 'idle');
    }
  }

  function resolveCountyFromAddress(street, city, state, zip) {
    return new Promise(function(resolve) {
      try {
        if (!street || !city || !state) {
          resolve('');
          return;
        }

        var zip5 = cleanString(zip || '').match(/\d{5}/);
        zip5 = zip5 ? zip5[0] : '';

        var url =
          'https://geocoding.geo.census.gov/geocoder/geographies/address?' +
          'street=' + encodeURIComponent(street) +
          '&city=' + encodeURIComponent(city) +
          '&state=' + encodeURIComponent(state) +
          '&zip=' + encodeURIComponent(zip5) +
          '&benchmark=Public_AR_Current' +
          '&vintage=Current_Current' +
          '&format=json';

        console.log('[MCI Home] County lookup URL ->', url);

        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          onload: function(resp) {
            try {
              var data = JSON.parse(resp.responseText || '{}');
              var matches = (((data || {}).result || {}).addressMatches) || [];
              if (!matches.length) {
                console.warn('[MCI Home] County lookup returned no matches.');
                resolve('');
                return;
              }

              var geos = matches[0].geographies || {};
              var counties = geos.Counties || [];
              var county = counties.length ? cleanString(counties[0].NAME || '') : '';

              county = county.replace(/\s+County$/i, '');
              console.log('[MCI Home] County lookup result ->', county);
              resolve(county);
            } catch (err) {
              console.warn('[MCI Home] County lookup parse failed:', err);
              resolve('');
            }
          },
          onerror: function(err) {
            console.warn('[MCI Home] County lookup request failed:', err);
            resolve('');
          },
          ontimeout: function() {
            console.warn('[MCI Home] County lookup timed out.');
            resolve('');
          }
        });
      } catch (err) {
        console.warn('[MCI Home] County lookup crashed:', err);
        resolve('');
      }
    });
  }

  function init() {
    const href = window.location.href;
    const flow = GM_getValue(FLOW_KEY, 'idle') || 'idle';
    console.log('[MCI Home] Init on URL:', href, 'flow state =', flow);

    if (href.indexOf('/Customer') !== -1) {
      console.log('[MCI Home] On Customer page - waiting for MCI Toolbox trigger.');
    } else if (href.indexOf('/Dwelling') !== -1) {
      if (flow === 'after_customer') {
        console.log('[MCI Home] Auto-mode: running Dwelling step.');
        handleDwelling(true);
      } else {
        console.log('[MCI Home] On Dwelling page but flow state is', flow, '- not auto-running.');
      }
    } else if (href.indexOf('/Coverages') !== -1) {
      if (flow === 'after_dwelling') {
        console.log('[MCI Home] Auto-mode: on Coverages page - ensuring Home tab, then exporting.');
        handleCoverages(true);
      } else {
        console.log('[MCI Home] On Coverages page but flow state is', flow, '- not auto-running.');
      }
    }
  }

  window.addEventListener('load', function () {
    setTimeout(init, 400);
  });

  try {
    const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    pageWin.mciRunErieHomeExport = function () {
      console.log('[MCI Home] Triggered from MCI Toolbox button.');
      GM_setValue(FLOW_KEY, 'idle');
      handleCustomerClick();
    };
  } catch (e) {
    console.warn('[MCI Home] Could not expose mciRunErieHomeExport:', e);
  }
})();
