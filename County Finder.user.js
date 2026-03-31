// ==UserScript==
// @name         MCI County Helper (Geocodify)
// @namespace    mci-tools
// @version      1.3.0
// @description  Alt+C county lookup helper using Geocodify. Copies county to clipboard and autofills county fields when possible.
// @author       MCI
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    HOTKEY_ALT: true,
    HOTKEY_SHIFT: false,
    HOTKEY_CTRL: false,
    HOTKEY_KEY: 'c',
    TOAST_MS: 2800,
    COPY_WITH_SUFFIX: false, // false = "Wake", true = "Wake County"
    DEBUG: true,
    USE_CACHE: true
  };

  const CACHE_KEY = 'mciCountyHelperCacheV4';
  const GEOCODIFY_API_KEY = 'GET_API_CODE';
  const EVENT_COUNTY_RUN = 'mci-county-run';
  const EVENT_COUNTY_MANUAL = 'mci-county-manual';
  const MANUAL_BOX_ID = 'mci-county-manual-entry-overlay';
  let lastHoverEl = null;

  const STATE_CODE_TO_NAME = {
    AL: 'ALABAMA', AK: 'ALASKA', AZ: 'ARIZONA', AR: 'ARKANSAS', CA: 'CALIFORNIA', CO: 'COLORADO',
    CT: 'CONNECTICUT', DE: 'DELAWARE', FL: 'FLORIDA', GA: 'GEORGIA', HI: 'HAWAII', ID: 'IDAHO',
    IL: 'ILLINOIS', IN: 'INDIANA', IA: 'IOWA', KS: 'KANSAS', KY: 'KENTUCKY', LA: 'LOUISIANA',
    ME: 'MAINE', MD: 'MARYLAND', MA: 'MASSACHUSETTS', MI: 'MICHIGAN', MN: 'MINNESOTA',
    MS: 'MISSISSIPPI', MO: 'MISSOURI', MT: 'MONTANA', NE: 'NEBRASKA', NV: 'NEVADA',
    NH: 'NEW HAMPSHIRE', NJ: 'NEW JERSEY', NM: 'NEW MEXICO', NY: 'NEW YORK',
    NC: 'NORTH CAROLINA', ND: 'NORTH DAKOTA', OH: 'OHIO', OK: 'OKLAHOMA', OR: 'OREGON',
    PA: 'PENNSYLVANIA', RI: 'RHODE ISLAND', SC: 'SOUTH CAROLINA', SD: 'SOUTH DAKOTA',
    TN: 'TENNESSEE', TX: 'TEXAS', UT: 'UTAH', VT: 'VERMONT', VA: 'VIRGINIA', WA: 'WASHINGTON',
    WV: 'WEST VIRGINIA', WI: 'WISCONSIN', WY: 'WYOMING', DC: 'DISTRICT OF COLUMBIA'
  };
  const STATE_NAME_TO_CODE = {};
  Object.keys(STATE_CODE_TO_NAME).forEach(function (code) {
    STATE_NAME_TO_CODE[normalizeCompareText(STATE_CODE_TO_NAME[code])] = code;
  });
  STATE_NAME_TO_CODE.washingtondc = 'DC';

  document.addEventListener('mouseover', function (e) {
    lastHoverEl = e.target;
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!isHotkey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    safeRunCountyLookup({ source: 'hotkey' });
  }, true);

  window.addEventListener(EVENT_COUNTY_RUN, function (event) {
    const detail = event && event.detail ? event.detail : {};
    safeRunCountyLookup({
      source: detail.source || 'event-auto',
      address: normalizeAddress(detail.address || '')
    });
  });

  window.addEventListener(EVENT_COUNTY_MANUAL, function (event) {
    const detail = event && event.detail ? event.detail : {};
    const address = normalizeAddress(detail.address || '');

    if (address) {
      safeRunCountyLookup({
        source: detail.source || 'event-manual',
        address: address,
        usePrompt: false,
        ctx: getManualContext()
      });
      return;
    }

    openManualEntryBox();
  });

  function safeRunCountyLookup(opts) {
    return runCountyLookup(opts).catch(function (err) {
      log('County helper error:', err);
      showBigToast('County lookup failed');
    });
  }

  async function runCountyLookup(opts) {
    opts = opts || {};

    const ctx = opts.ctx || getBestAddressContext();
    const source = opts.source || ctx.source || 'unknown';
    const usePrompt = opts.usePrompt !== false;
    let address = normalizeAddress(opts.address || '') || normalizeAddress(ctx.address || '');

    if (!address) {
      if (!usePrompt) {
        showBigToast('No address entered');
        return;
      }

      address = window.prompt('Enter address to look up county:', '') || '';
      address = normalizeAddress(address);
      if (!address) {
        showBigToast('No address found on page');
        return;
      }
    }

    log('Address source:', source);
    log('Address text:', address);

    showBigToast('Looking up county...', 1100);

    const county = await lookupCounty(address);
    if (!county) {
      showBigToast('Address found, county lookup failed');
      return;
    }

    const countyText = CONFIG.COPY_WITH_SUFFIX ? county + ' County' : county;
    copyCounty(countyText);

    const fillResult = tryFillCounty(county, ctx);

    if (fillResult.filled) {
      showBigToast(countyText + ' copied + filled');
    } else {
      showBigToast(countyText + ' copied to clipboard');
    }

    log('County:', county);
    log('Fill result:', fillResult);
  }

  function getManualContext() {
    const anchor = document.activeElement || lastHoverEl || document.body;
    return {
      address: '',
      source: 'manual-entry',
      root: anchor || document.body,
      countyField: findNearestCountyField(anchor || document.body)
    };
  }

  function closeManualEntryBox() {
    const existing = document.getElementById(MANUAL_BOX_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function openManualEntryBox(initialValue) {
    closeManualEntryBox();

    const overlay = document.createElement('div');
    overlay.id = MANUAL_BOX_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      background: 'rgba(2, 6, 23, 0.64)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      width: 'min(680px, 92vw)',
      borderRadius: '14px',
      background: 'linear-gradient(180deg, #111827 0%, #0f172a 60%, #0b1222 100%)',
      border: '1px solid rgba(255,255,255,0.14)',
      boxShadow: '0 24px 60px rgba(0,0,0,0.48)',
      padding: '18px 18px 14px',
      color: '#e5e7eb',
      fontFamily: 'system-ui, -apple-system, Segoe UI, Arial, sans-serif'
    });

    const title = document.createElement('div');
    title.textContent = 'County Finder';
    Object.assign(title.style, {
      fontSize: '20px',
      fontWeight: '700',
      lineHeight: '1.1',
      marginBottom: '6px'
    });

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Type or paste an address to look up county';
    Object.assign(subtitle.style, {
      fontSize: '13px',
      color: 'rgba(229,231,235,0.82)',
      marginBottom: '10px'
    });

    const textarea = document.createElement('textarea');
    textarea.value = normalizeAddress(initialValue || getSelectedText() || '');
    textarea.placeholder = '665 FOSTERTON COTTAGE WAY, RALEIGH, NC 27603';
    textarea.spellcheck = false;
    textarea.rows = 4;
    Object.assign(textarea.style, {
      width: '100%',
      minHeight: '108px',
      resize: 'vertical',
      borderRadius: '10px',
      border: '1px solid rgba(148,163,184,0.44)',
      background: 'rgba(15,23,42,0.92)',
      color: '#f8fafc',
      padding: '10px 12px',
      fontSize: '14px',
      lineHeight: '1.4',
      outline: 'none',
      boxSizing: 'border-box'
    });

    const footer = document.createElement('div');
    Object.assign(footer.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '10px',
      marginTop: '12px'
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
      border: '1px solid rgba(255,255,255,0.24)',
      background: 'rgba(51,65,85,0.8)',
      color: '#fff',
      borderRadius: '9px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      padding: '8px 12px'
    });

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.textContent = 'Lookup County';
    Object.assign(runBtn.style, {
      border: '1px solid rgba(248,250,252,0.18)',
      background: 'linear-gradient(180deg, #2563eb 0%, #1d4ed8 55%, #1e3a8a 100%)',
      color: '#fff',
      borderRadius: '9px',
      fontSize: '13px',
      fontWeight: '700',
      cursor: 'pointer',
      padding: '8px 14px'
    });

    function submitManualLookup() {
      const address = normalizeAddress(textarea.value || '');
      if (!address) {
        showBigToast('Enter an address first', 1200);
        textarea.focus();
        return;
      }

      closeManualEntryBox();
      safeRunCountyLookup({
        source: 'manual-box',
        address: address,
        usePrompt: false,
        ctx: getManualContext()
      });
    }

    cancelBtn.addEventListener('click', closeManualEntryBox);
    runBtn.addEventListener('click', submitManualLookup);

    overlay.addEventListener('mousedown', function (event) {
      if (event.target === overlay) closeManualEntryBox();
    });

    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeManualEntryBox();
      }
    });

    textarea.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeManualEntryBox();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitManualLookup();
      }
    });

    box.appendChild(title);
    box.appendChild(subtitle);
    box.appendChild(textarea);
    footer.appendChild(cancelBtn);
    footer.appendChild(runBtn);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(function () {
      textarea.focus();
      try {
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
      } catch (e) {}
    }, 0);
  }

  window.runMciCountyFinder = function () {
    safeRunCountyLookup({ source: 'window-api' });
  };

  window.openMciCountyFinderManual = function (address) {
    const normalized = normalizeAddress(address || '');
    if (normalized) {
      safeRunCountyLookup({
        source: 'window-api-manual',
        address: normalized,
        usePrompt: false,
        ctx: getManualContext()
      });
      return;
    }
    openManualEntryBox('');
  };

  function isHotkey(e) {
    const key = String(e.key || '').toLowerCase();
    if (key !== CONFIG.HOTKEY_KEY.toLowerCase()) return false;
    if (!!e.altKey !== !!CONFIG.HOTKEY_ALT) return false;
    if (!!e.shiftKey !== !!CONFIG.HOTKEY_SHIFT) return false;
    if (!!e.ctrlKey !== !!CONFIG.HOTKEY_CTRL) return false;
    return true;
  }

  function getBestAddressContext() {
    const selected = getSelectedText();
    if (selected) {
      return {
        address: selected,
        source: 'selection',
        root: lastHoverEl || document.body,
        countyField: findNearestCountyField(lastHoverEl || document.body)
      };
    }

    const erie = getErieAddressContext();
    if (erie && erie.address) return erie;

    const hovered = getGenericHoveredAddressContext();
    if (hovered && hovered.address) return hovered;

    return {
      address: '',
      source: 'none',
      root: lastHoverEl || document.body,
      countyField: null
    };
  }

  function getErieAddressContext() {
    if (lastHoverEl) {
      const mailingWrap = lastHoverEl.closest('.mailing-address-wrapper, .address-questions, td.ContentBlock');
      if (mailingWrap) {
        const mailingText = document.querySelector('#mailing-address-text');
        const countySel = document.querySelector('#selMailingCountyList');
        if (mailingText && textOf(mailingText)) {
          return {
            address: normalizeAddress(textOf(mailingText)),
            source: 'erie-mailing-hover',
            root: mailingWrap,
            countyField: countySel
          };
        }
      }

      const addrWrap = lastHoverEl.closest('.address-wrapper');
      if (addrWrap) {
        const fullAddressEl =
          addrWrap.querySelector('[data-bind*="ResidenceAddress.fullAddress"]') ||
          addrWrap.querySelector('[data-bind*="LocationAddress.fullAddress"]') ||
          addrWrap.querySelector('.address-content .bold');

        if (fullAddressEl && textOf(fullAddressEl)) {
          return {
            address: normalizeAddress(textOf(fullAddressEl)),
            source: 'erie-address-wrapper-hover',
            root: addrWrap,
            countyField: findNearestCountyField(addrWrap) || document.querySelector('#selMailingCountyList')
          };
        }
      }
    }

    const mailingText = document.querySelector('#mailing-address-text');
    if (mailingText && textOf(mailingText)) {
      return {
        address: normalizeAddress(textOf(mailingText)),
        source: 'erie-mailing-direct',
        root: mailingText.closest('.mailing-address-wrapper, td.ContentBlock, .address-questions') || document.body,
        countyField: document.querySelector('#selMailingCountyList')
      };
    }

    const residenceText = document.querySelector('.address-wrapper [data-bind*="ResidenceAddress.fullAddress"], .address-wrapper .address-content .bold');
    if (residenceText && textOf(residenceText) && looksLikeAddress(textOf(residenceText))) {
      return {
        address: normalizeAddress(textOf(residenceText)),
        source: 'erie-residence-direct',
        root: residenceText.closest('.address-wrapper') || document.body,
        countyField: findNearestCountyField(residenceText.closest('.address-wrapper')) || document.querySelector('#selMailingCountyList')
      };
    }

    const locationText = document.querySelector('.address-wrapper [data-bind*="LocationAddress.fullAddress"]');
    if (locationText && textOf(locationText) && looksLikeAddress(textOf(locationText))) {
      return {
        address: normalizeAddress(textOf(locationText)),
        source: 'erie-location-direct',
        root: locationText.closest('.address-wrapper') || document.body,
        countyField: findNearestCountyField(locationText.closest('.address-wrapper')) || document.querySelector('#selMailingCountyList')
      };
    }

    return null;
  }

  function getGenericHoveredAddressContext() {
    if (!lastHoverEl) return null;

    let el = lastHoverEl;
    let depth = 0;

    while (el && depth < 7) {
      const txt = normalizeAddress(textOf(el));
      if (looksLikeAddress(txt)) {
        return {
          address: txt,
          source: 'generic-hover',
          root: el,
          countyField: findNearestCountyField(el)
        };
      }
      el = el.parentElement;
      depth++;
    }

    return null;
  }

  async function lookupCounty(address) {
    const normalized = normalizeAddress(address);
    if (!normalized) return '';

    if (CONFIG.USE_CACHE) {
      const cached = getCache()[normalized];
      if (cached) {
        log('Cache hit:', normalized, '=>', cached);
        return cached;
      }
    }

    const tries = buildLookupCandidates(normalized);

    for (let i = 0; i < tries.length; i++) {
      const county = await lookupCountyGeocodify(tries[i], parseAddressParts(tries[i]));
      if (county) {
        log('Lookup success with candidate:', tries[i], '=>', county);
        return cacheCounty(normalized, county);
      }
    }

    return '';
  }

  function buildLookupCandidates(address) {
    const list = [];
    const seen = {};

    function add(s) {
      s = normalizeAddress(s);
      if (!s || seen[s]) return;
      seen[s] = true;
      list.push(s);
    }

    add(address);

    const parts = parseAddressParts(address);
    if (parts) {
      // full and reasonably specific formats
      add(parts.street + ', ' + parts.city + ', ' + parts.state + ' ' + parts.zip);
      add(parts.street + ', ' + parts.city + ', ' + parts.state);
      add(parts.street + ' ' + parts.city + ', ' + parts.state + ' ' + parts.zip);
    }

    return list;
  }

  async function lookupCountyGeocodify(address, inputParts) {
    if (!GEOCODIFY_API_KEY || GEOCODIFY_API_KEY === 'REPLACE_ME_LOCAL_ONLY') {
      log('Geocodify API key missing. Set GEOCODIFY_API_KEY locally.');
      return '';
    }

    const url =
      'https://api.geocodify.com/v2/geocode' +
      '?api_key=' + encodeURIComponent(GEOCODIFY_API_KEY) +
      '&q=' + encodeURIComponent(address);

    try {
      log('Trying Geocodify lookup:', address);

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        log('Geocodify HTTP error:', res.status);
        return '';
      }

      const data = await res.json();
      log('Geocodify response:', data);

      const countyRaw = parseCountyFromGeocodify(data, inputParts);
      if (!countyRaw) {
        log('No acceptable Geocodify county result for:', address);
        return '';
      }
      return cleanCountyName(countyRaw);
    } catch (e) {
      log('lookupCountyGeocodify failed:', e);
      return '';
    }
  }

  function parseCountyFromGeocodify(data, inputParts) {
    const features =
      (data && Array.isArray(data.features) && data.features) ||
      (data && data.response && Array.isArray(data.response.features) && data.response.features) ||
      [];
    if (!features.length) return '';

    for (let i = 0; i < features.length; i++) {
      const feature = features[i] || {};
      const props = feature.properties || {};

      const county =
        props.county ||
        props.county_name ||
        props.county_a ||
        props.county_name_long ||
        extractCountyFromText(feature.formatted || feature.label || props.label || '');

      if (!county) continue;
      if (!isAcceptableGeocodifyResult(inputParts, props, feature)) continue;

      return county;
    }

    return '';
  }

  function isAcceptableGeocodifyResult(inputParts, props, feature) {
    if (!inputParts) return true;

    const inputState = toStateCode(inputParts.state || '');
    const inputZip = normalizeZip(inputParts.zip || '');
    const inputCity = normalizeCompareText(inputParts.city || '');

    const resultState = toStateCode(
      props.state_code ||
      props.state ||
      props.province ||
      props.region ||
      ''
    );
    const resultZip = normalizeZip(
      props.postcode ||
      props.zip ||
      props.postal_code ||
      ''
    );
    const resultCity = normalizeCompareText(
      props.city ||
      props.locality ||
      props.town ||
      props.village ||
      props.municipality ||
      props.postal_city ||
      ''
    );

    const stateMatch = !!(inputState && resultState && inputState === resultState);
    const zipMatch = !!(inputZip && resultZip && inputZip === resultZip);

    if (inputState && resultState && !stateMatch) {
      log('Rejected Geocodify result: state mismatch', inputState, resultState);
      return false;
    }

    if (inputZip && resultZip && !zipMatch) {
      log('Rejected Geocodify result: zip mismatch', inputZip, resultZip);
      return false;
    }

    if (inputCity && resultCity && inputCity !== resultCity) {
      if (!(stateMatch && zipMatch)) {
        log('Rejected Geocodify result: city mismatch', inputCity, resultCity);
        return false;
      }
    }

    const formatted = normalizeCompareText(feature && (feature.formatted || feature.label) || '');
    if (inputCity && !resultCity && formatted && formatted.indexOf(inputCity) === -1 && !(stateMatch && zipMatch)) {
      log('Rejected Geocodify result: weak city match');
      return false;
    }

    return true;
  }

  function extractCountyFromText(text) {
    const s = String(text || '');
    if (!s) return '';

    const m = s.match(/([A-Za-z .'-]+?)\s+County\b/i);
    return m && m[1] ? m[1] : '';
  }

  function parseAddressParts(text) {
    const s = normalizeAddress(text);
    if (!s) return null;

    const tail = s.match(/^(.*?)(?:,\s*|\s+)([A-Za-z]{2}|[A-Za-z]+(?:\s+[A-Za-z]+){0,2})\s+(\d{5}(?:-\d{4})?)$/i);
    if (!tail) return null;

    const before = normalizeAddress(tail[1] || '');
    const state = toStateCode(tail[2] || '');
    const zip = normalizeZip(tail[3] || '');

    if (!before || !state || !zip) return null;

    let street = '';
    let city = '';

    if (before.indexOf(',') >= 0) {
      const parts = before.split(',').map(function (p) { return normalizeAddress(p); }).filter(Boolean);
      if (parts.length < 2) return null;
      city = parts.pop();
      street = parts.join(', ');
    } else {
      const tokens = before.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) return null;

      const suffixIdx = findStreetSuffixIndex(tokens);
      if (suffixIdx >= 1 && suffixIdx < tokens.length - 1) {
        street = tokens.slice(0, suffixIdx + 1).join(' ');
        city = tokens.slice(suffixIdx + 1).join(' ');
      } else {
        const cityWordCount = tokens.length >= 5 ? 2 : 1;
        street = tokens.slice(0, tokens.length - cityWordCount).join(' ');
        city = tokens.slice(tokens.length - cityWordCount).join(' ');
      }
    }

    street = normalizeAddress(street);
    city = normalizeAddress(city);

    if (!street || !city) return null;

    return { street: street, city: city, state: state, zip: zip };
  }

  function findStreetSuffixIndex(tokens) {
    if (!Array.isArray(tokens) || !tokens.length) return -1;

    const suffixes = {
      st: 1, street: 1, rd: 1, road: 1, ln: 1, lane: 1, dr: 1, drive: 1,
      ave: 1, avenue: 1, blvd: 1, boulevard: 1, ct: 1, court: 1, cir: 1, circle: 1,
      way: 1, trl: 1, trail: 1, hwy: 1, highway: 1, pkwy: 1, parkway: 1,
      pl: 1, place: 1, ter: 1, terrace: 1
    };

    for (let i = tokens.length - 1; i >= 1; i--) {
      const t = String(tokens[i] || '').toLowerCase().replace(/\./g, '');
      if (suffixes[t]) return i;
    }

    return -1;
  }

  function toStateCode(value) {
    let s = String(value || '').trim();
    if (!s) return '';

    s = s.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    const upper = s.toUpperCase();
    if (STATE_CODE_TO_NAME[upper]) return upper;

    const key = normalizeCompareText(s);
    return STATE_NAME_TO_CODE[key] || '';
  }

  function cleanCountyName(name) {
    if (!name) return '';

    let s = String(name).trim();
    s = s.replace(/\s+County$/i, '').trim();
    s = s.replace(/,.*$/, '').trim();

    if (!s) return '';
    return titleCase(s);
  }

  function tryFillCounty(county, ctx) {
    const result = { filled: false, method: '', element: null };

    const erieCounty = document.querySelector('#selMailingCountyList');
    if (erieCounty && setCountyFieldValue(erieCounty, county)) {
      result.filled = true;
      result.method = 'erie-mailing';
      result.element = erieCounty;
      return result;
    }

    if (ctx && ctx.countyField && setCountyFieldValue(ctx.countyField, county)) {
      result.filled = true;
      result.method = 'context-field';
      result.element = ctx.countyField;
      return result;
    }

    const nearby = findNearestCountyField((ctx && ctx.root) || lastHoverEl || document.body);
    if (nearby && setCountyFieldValue(nearby, county)) {
      result.filled = true;
      result.method = 'nearby-field';
      result.element = nearby;
      return result;
    }

    const allFields = findAllCountyFields();
    for (let i = 0; i < allFields.length; i++) {
      if (setCountyFieldValue(allFields[i], county)) {
        result.filled = true;
        result.method = 'global-scan';
        result.element = allFields[i];
        return result;
      }
    }

    return result;
  }

  function findNearestCountyField(startEl) {
    if (!startEl) startEl = document.body;

    let el = startEl;
    let depth = 0;

    while (el && depth < 7) {
      if (el.querySelector) {
        const found =
          el.querySelector('#selMailingCountyList') ||
          el.querySelector('select[id*="County" i], select[name*="County" i]') ||
          el.querySelector('input[id*="County" i], input[name*="County" i]');
        if (found) return found;

        const labelBased = findCountyFieldByLabel(el);
        if (labelBased) return labelBased;
      }

      el = el.parentElement;
      depth++;
    }

    return document.querySelector('#selMailingCountyList') || null;
  }

  function findCountyFieldByLabel(root) {
    if (!root || !root.querySelectorAll) return null;

    const labels = root.querySelectorAll('label, span, div, td');
    for (let i = 0; i < labels.length; i++) {
      const txt = textOf(labels[i]).toLowerCase();
      if (txt === 'county' || txt.indexOf('county') !== -1) {
        const parent = labels[i].closest('div, td, tr, .editor-block, .question-wrapper') || labels[i].parentElement;
        if (!parent) continue;

        const field = parent.querySelector('select, input');
        if (field) return field;
      }
    }

    return null;
  }

  function findAllCountyFields() {
    const list = [];
    const selectors = [
      '#selMailingCountyList',
      'select[id*="County" i]',
      'select[name*="County" i]',
      'input[id*="County" i]',
      'input[name*="County" i]'
    ];

    for (let i = 0; i < selectors.length; i++) {
      const els = document.querySelectorAll(selectors[i]);
      for (let j = 0; j < els.length; j++) {
        if (list.indexOf(els[j]) === -1) list.push(els[j]);
      }
    }

    return list;
  }

  function setCountyFieldValue(el, county) {
    if (!el || !county) return false;
    const countyOnly = county.replace(/\s+County$/i, '').trim();

    if (el.tagName === 'SELECT') {
      const opts = Array.from(el.options || []);
      const match = opts.find(function (o) {
        return normalizeSimple(o.value) === normalizeSimple(countyOnly) ||
               normalizeSimple(o.textContent) === normalizeSimple(countyOnly) ||
               normalizeSimple(o.value) === normalizeSimple(countyOnly + ' County') ||
               normalizeSimple(o.textContent) === normalizeSimple(countyOnly + ' County');
      });

      if (!match) return false;

      el.value = match.value;
      fireFieldEvents(el);
      return true;
    }

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.focus();
      el.value = countyOnly;
      fireFieldEvents(el);
      return true;
    }

    return false;
  }

  function fireFieldEvents(el) {
    ['input', 'change', 'blur'].forEach(function (type) {
      try {
        el.dispatchEvent(new Event(type, { bubbles: true }));
      } catch (e) {}
    });
  }

  function copyCounty(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {});
      } else {
        fallbackCopy(text);
      }
    } catch (e) {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch (e) {}
  }

  function showBigToast(message, duration) {
    duration = duration || CONFIG.TOAST_MS;

    const old = document.getElementById('mci-county-helper-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'mci-county-helper-toast';
    toast.textContent = message;

    Object.assign(toast.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(15, 23, 42, 0.95)',
      color: '#fff',
      padding: '22px 34px',
      borderRadius: '14px',
      fontSize: '28px',
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: '1.2',
      minWidth: '320px',
      maxWidth: '82vw',
      zIndex: '2147483647',
      boxShadow: '0 18px 45px rgba(0,0,0,0.45)',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.18s ease'
    });

    document.body.appendChild(toast);

    requestAnimationFrame(function () {
      toast.style.opacity = '1';
    });

    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 220);
    }, duration);
  }

  function getSelectedText() {
    try {
      return normalizeAddress((window.getSelection && window.getSelection().toString()) || '');
    } catch (e) {
      return '';
    }
  }

  function looksLikeAddress(text) {
    if (!text) return false;
    const s = text.replace(/\s+/g, ' ').trim();
    const hasNumber = /\b\d{1,6}\b/.test(s);
    const hasStateZip = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i.test(s);
    const hasStreetWord = /\b(st|street|rd|road|ln|lane|dr|drive|ave|avenue|blvd|boulevard|ct|court|cir|circle|way|trl|trail|hwy|highway|pkwy|parkway|pl|place)\b/i.test(s);
    return (hasNumber && hasStateZip) || (hasNumber && hasStreetWord);
  }

  function normalizeAddress(s) {
    return String(s || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
  }

  function normalizeCompareText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]/g, '');
  }

  function normalizeZip(value) {
    const m = String(value || '').match(/\b(\d{5})(?:-\d{4})?\b/);
    return m && m[1] ? m[1] : '';
  }

  function normalizeSimple(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+county$/i, '')
      .replace(/[^a-z]/g, '');
  }

  function textOf(el) {
    if (!el) return '';

    let html = String(el.innerHTML || '');
    html = html.replace(/<br\s*\/?>/gi, ', ');

    const div = document.createElement('div');
    div.innerHTML = html;

    return String(div.textContent || div.innerText || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
  }

  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m) {
      return m.toUpperCase();
    });
  }

  function cacheCounty(address, county) {
    if (CONFIG.USE_CACHE && county && county.length > 2) {
      const cache = getCache();
      cache[address] = county;
      setCache(cache);
    }
    return county;
  }

  function getCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function setCache(obj) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(obj || {}));
    } catch (e) {}
  }

  function log() {
    if (!CONFIG.DEBUG) return;
    console.log.apply(console, ['[MCI County Helper]'].concat([].slice.call(arguments)));
  }
})();
