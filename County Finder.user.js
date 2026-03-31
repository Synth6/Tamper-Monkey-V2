// ==UserScript==
// @name         MCI County Finder
// @namespace    mci-tools
// @version      1.3.0
// @description  Alt+C county lookup helper using Nominatim/OpenStreetMap. Copies county to clipboard and autofills county fields when possible.
// @author       MCI
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/County%20Finder.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/County%20Finder.user.js
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
  let lastHoverEl = null;

  document.addEventListener('mouseover', function (e) {
    lastHoverEl = e.target;
  }, true);

  document.addEventListener('keydown', function (e) {
    if (!isHotkey(e)) return;
    e.preventDefault();
    e.stopPropagation();

    runCountyLookup().catch(function (err) {
      log('County helper error:', err);
      showBigToast('County lookup failed');
    });
  }, true);

  async function runCountyLookup() {
    const ctx = getBestAddressContext();
    let address = ctx.address || '';

    if (!address) {
      address = window.prompt('Enter address to look up county:', '') || '';
      address = normalizeAddress(address);
      if (!address) {
        showBigToast('No address found on page');
        return;
      }
    }

    log('Address source:', ctx.source);
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
        const county = await lookupCountyNominatim(tries[i]);
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
        // full formats
        add(parts.street + ', ' + parts.city + ', ' + parts.state + ' ' + parts.zip);
        add(parts.street + ', ' + parts.city + ', ' + parts.state);
        add(parts.street + ' ' + parts.city + ', ' + parts.state + ' ' + parts.zip);

        // new fallbacks that mimic what worked for you
        add(parts.street);
        add(parts.street + ', ' + parts.city);
        add(parts.street + ', ' + parts.city + ', ' + parts.state);
    } else {
        // generic comma-split fallback if parseAddressParts fails
        const firstPart = normalizeAddress(String(address).split(',')[0] || '');
        if (firstPart) {
        add(firstPart);
        }
    }

    return list;
    }

  async function lookupCountyNominatim(address) {
    const url =
      'https://nominatim.openstreetmap.org/search' +
      '?format=jsonv2' +
      '&addressdetails=1' +
      '&limit=1' +
      '&countrycodes=us' +
      '&q=' + encodeURIComponent(address);

    try {
      log('Trying Nominatim lookup:', address);

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        log('Nominatim HTTP error:', res.status);
        return '';
      }

      const data = await res.json();
      log('Nominatim response:', data);

      if (!Array.isArray(data) || !data.length) return '';

      const addr = data[0] && data[0].address ? data[0].address : {};
      let county =
        addr.county ||
        addr.state_district ||
        addr.region ||
        '';

      if (!county) return '';

      county = cleanCountyName(county);
      return county;
    } catch (e) {
      log('lookupCountyNominatim failed:', e);
      return '';
    }
  }

  function parseAddressParts(text) {
    const s = normalizeAddress(text);
    const m = s.match(/^(.*?)(?:,\s*|\s+)([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);

    if (m) {
      return {
        street: m[1].trim(),
        city: m[2].trim(),
        state: m[3].trim().toUpperCase(),
        zip: m[4].trim()
      };
    }

    return null;
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
    if (CONFIG.USE_CACHE && county) {
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
