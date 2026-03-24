// ==UserScript==
// @name         Erie Master Extractor
// @namespace    https://middlecreekinsurance.com/
// @version      0.1.0
// @description  Erie-only master extractor for Personal Lines Auto. Collects page-by-page data into one normalized JSON payload.
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const APP = {
    version: '0.1.0',
    carrier: 'Erie',
    lob: 'PersonalAuto'
  };

  const PREF_ERIE_EXTRACTOR_ENABLED_KEY = 'mci_pref_erie_extractor_enabled';

  const KEYS = {
    payload: 'erieMasterPayload',
    settings: 'erieMasterSettings'
  };

  const DEFAULT_SETTINGS = {
    autoCollect: true,
    debug: true
  };

  // -----------------------------
  // Utilities
  // -----------------------------
  const U = {
    nowIso() {
      return new Date().toISOString();
    },

    safeString(v) {
      return v == null ? '' : String(v);
    },

    cleanString(v) {
      return U.safeString(v).replace(/\s+/g, ' ').trim();
    },

    upper(v) {
      return U.cleanString(v).toUpperCase();
    },

    clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    },

    tryJsonParse(str) {
      try {
        return JSON.parse(str);
      } catch (e) {
        return null;
      }
    },

    // For trusted Erie inline data only.
    tryEvalObjectLiteral(str) {
      try {
        // eslint-disable-next-line no-new-func
        return Function('"use strict"; return (' + str + ');')();
      } catch (e) {
        return null;
      }
    },

    normalizeDate(v) {
      const s = U.cleanString(v);
      if (!s) return '';
      return s;
    },

    normalizeMoney(v) {
      const s = U.cleanString(v).replace(/[$,]/g, '');
      return s;
    },

    boolFromErie(v) {
      if (v === true || v === false) return v;
      const s = U.cleanString(v).toLowerCase();
      if (s === 'true') return true;
      if (s === 'false') return false;
      return null;
    },

    isEmpty(v) {
      if (v == null) return true;
      if (typeof v === 'string') return U.cleanString(v) === '';
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === 'object') return Object.keys(v).length === 0;
      return false;
    },

    looksMasked(v) {
      const s = U.cleanString(v);
      if (!s) return false;
      if (/[*xX•]/.test(s)) return true;
      if (/^\d{3}-\d{2}-\*{4}$/.test(s)) return true;
      if (/^\d{4,}\*+$/.test(s)) return true;
      if (/^\*+\d{2,}$/.test(s)) return true;
      return false;
    },

    betterScalar(existing, incoming, meta) {
      const a = existing;
      const b = incoming;

      if (U.isEmpty(b)) return a;
      if (U.isEmpty(a)) return b;

      const aStr = U.cleanString(a);
      const bStr = U.cleanString(b);

      const aMasked = U.looksMasked(aStr);
      const bMasked = U.looksMasked(bStr);

      if (!aMasked && bMasked) return a;
      if (aMasked && !bMasked) return b;

      const aSourceRank = meta && meta.existingSourceRank != null ? meta.existingSourceRank : 0;
      const bSourceRank = meta && meta.incomingSourceRank != null ? meta.incomingSourceRank : 0;
      if (bSourceRank > aSourceRank) {
        if (!(U.looksMasked(bStr) && !U.looksMasked(aStr))) return b;
      }

      if (bStr.length > aStr.length && !(bMasked && !aMasked)) return b;

      return a;
    },

    pushUnique(arr, value) {
      if (!value) return;
      if (!arr.includes(value)) arr.push(value);
    },

    downloadText(filename, text) {
      const blob = new Blob([text], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    },

    copyText(text) {
      return navigator.clipboard.writeText(text);
    },

    safeQuery(selector, root) {
      try {
        return (root || document).querySelector(selector);
      } catch (e) {
        return null;
      }
    },

    safeQueryAll(selector, root) {
      try {
        return Array.from((root || document).querySelectorAll(selector));
      } catch (e) {
        return [];
      }
    },

    asArray(v) {
      return Array.isArray(v) ? v : [];
    },

    delay(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    },

    waitFor(fn, timeoutMs, intervalMs) {
      timeoutMs = timeoutMs || 5000;
      intervalMs = intervalMs || 150;

      return new Promise(function (resolve) {
        const start = Date.now();

        (function check() {
          try {
            const value = fn();
            if (value) {
              resolve(value);
              return;
            }
          } catch (e) {}

          if (Date.now() - start >= timeoutMs) {
            resolve(null);
            return;
          }

          setTimeout(check, intervalMs);
        })();
      });
    },

    isJunkCoverageText(text) {
      const s = U.cleanString(text);
      if (!s) return true;
      if (s.length > 120 && /- None -/i.test(s)) return true;
      if ((s.match(/\d{1,3},?\d{0,3}\s*\/\s*\d{1,3},?\d{0,3}/g) || []).length >= 3) return true;
      if ((s.match(/- None -/g) || []).length >= 1) return true;
      return false;
    },

    selectedControlValue(row) {
      if (!row) return '';
      const select = row.querySelector('select');
      if (select) {
        if (select.selectedIndex >= 0) {
          return U.cleanString(select.options[select.selectedIndex].text || select.value || '');
        }
        return U.cleanString(select.value || '');
      }
      const input = row.querySelector('input[type="text"], input:not([type]), textarea');
      if (input) return U.cleanString(input.value || '');
      return '';
    },

    dedupeCoverageItems(items) {
      const map = new Map();

      (items || []).forEach(function (item) {
        const key = U.cleanString(item && (item.coverageCode || item.coverageDescription || '') || '').toUpperCase();
        if (!key) return;

        const existing = map.get(key);
        if (!existing) {
          map.set(key, item);
          return;
        }

        const existingScore =
          (existing.coverageLimit ? 10 : 0) +
          (!U.isJunkCoverageText(existing.coverageDescription) ? 5 : 0) +
          Math.max(0, 20 - U.cleanString(existing.coverageDescription).length);

        const incomingScore =
          (item.coverageLimit ? 10 : 0) +
          (!U.isJunkCoverageText(item.coverageDescription) ? 5 : 0) +
          Math.max(0, 20 - U.cleanString(item.coverageDescription).length);

        if (incomingScore > existingScore) {
          map.set(key, item);
        }
      });

      return Array.from(map.values());
    },

    matchVehicleByDescription(vehicleDescription, vehicles) {
      const desc = U.upper(vehicleDescription);
      if (!desc || !Array.isArray(vehicles)) return null;

      return vehicles.find(function (v) {
        const candidate = U.upper([v.year, v.make, v.model].filter(Boolean).join(' '));
        return candidate && desc.indexOf(candidate) !== -1;
      }) || null;
    },

    matchVehicleFromDescription(vehicleDescription, payloadVehicles) {
      return U.matchVehicleByDescription(vehicleDescription, payloadVehicles);
    },

    inputValue(selector) {
      const el = U.safeQuery(selector);
      return el ? U.cleanString(el.value) : '';
    },

    selectText(selector) {
      const el = U.safeQuery(selector);
      if (!el) return '';
      if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
        return U.cleanString(el.options[el.selectedIndex].text);
      }
      return U.cleanString(el.textContent || el.innerText);
    },

    text(selector) {
      const el = U.safeQuery(selector);
      return el ? U.cleanString(el.textContent || el.innerText) : '';
    },

    pageStamp() {
      const d = new Date();
      const pad = function (n) { return String(n).padStart(2, '0'); };
      return (
        d.getFullYear() + '-' +
        pad(d.getMonth() + 1) + '-' +
        pad(d.getDate()) + 'T' +
        pad(d.getHours()) + '-' +
        pad(d.getMinutes()) + '-' +
        pad(d.getSeconds())
      );
    },

    makeDriverMatchKey(d) {
      const id = U.cleanString(d.driverId || d.sourceKeys && d.sourceKeys.id || '');
      if (id) return 'DRIVER_ID|' + id;

      const erieId = U.cleanString(d.sourceKeys && d.sourceKeys.erieId || '');
      if (erieId) return 'DRIVER_ERIE|' + erieId;

      const dl = U.cleanString(d.license && d.license.number || '');
      if (dl && !U.looksMasked(dl)) return 'DRIVER_DL|' + dl;

      const first = U.upper(d.firstName);
      const last = U.upper(d.lastName);
      const dob = U.cleanString(d.dob);
      return 'DRIVER_NAME_DOB|' + [first, last, dob].join('|');
    },

    makeVehicleMatchKey(v) {
      const id = U.cleanString(v.vehicleId || '');
      if (id) return 'VEHICLE_ID|' + id;

      const vin = U.cleanString(v.vin || '');
      if (vin && !U.looksMasked(vin)) return 'VEHICLE_VIN|' + vin;

      const tail = U.cleanString(v.vinMaskedTail || '');
      return 'VEHICLE_FALLBACK|' + [tail, U.upper(v.year), U.upper(v.make), U.upper(v.model)].join('|');
    },

    sourceRank(source) {
      switch (source) {
        case 'inline-viewmodel':
          return 100;
        case 'inline-viewData':
          return 95;
        case 'inline-data':
          return 90;
        case 'dom-input':
          return 70;
        case 'dom-text':
          return 50;
        default:
          return 0;
      }
    },

    debug() {
      const settings = Storage.loadSettings();
      if (!settings.debug) return;
      console.log.apply(console, arguments);
    }
  };

  // -----------------------------
  // Storage
  // -----------------------------
  const Storage = {
    loadSettings() {
      const raw = GM_getValue(KEYS.settings, null);
      if (!raw) return U.clone(DEFAULT_SETTINGS);
      try {
        return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
      } catch (e) {
        return U.clone(DEFAULT_SETTINGS);
      }
    },

    saveSettings(settings) {
      GM_setValue(KEYS.settings, JSON.stringify(settings));
    },

    createEmptyPayload() {
      return {
        meta: {
          extractorVersion: APP.version,
          carrier: APP.carrier,
          lob: APP.lob,
          createdAt: U.nowIso(),
          updatedAt: U.nowIso(),
          currentPageType: '',
          coverageSubType: '',
          visitedPages: [],
          sourceUrls: [],
          policyNumber: '',
          effectiveDate: '',
          expirationDate: '',
          products: [],
          routeGuid: '',
          pageTitles: [],
          notes: []
        },
        customer: {
          fullName: '',
          firstName: '',
          middleName: '',
          lastName: '',
          suffix: '',
          dob: '',
          email: '',
          phone: {
            mobile: '',
            home: '',
            work: ''
          },
          maritalStatus: '',
          gender: '',
          mailingAddress: {
            line1: '',
            line2: '',
            city: '',
            state: '',
            zip: '',
            zipPlus4: '',
            county: ''
          },
          residenceAddress: {
            line1: '',
            line2: '',
            city: '',
            state: '',
            zip: '',
            zipPlus4: '',
            county: ''
          },
          currentInsurance: {
            currentAutoInsurer: '',
            priorAutoEriePolicyNumber: '',
            autoPriorBILimits: '',
            rewriteSpinoff: ''
          },
          sourceKeys: {}
        },
        namedInsureds: [],
        drivers: [],
        vehicles: [],
        coverages: {
          policy: {
            effectiveDate: '',
            payPlan: '',
            riskState: '',
            lineOfBusinessList: [],
            policyCoverages: [],
            coveragesThatOnlyAppearOncePremiums: []
          },
          vehicleCoverages: [],
          discounts: [],
          endorsements: [],
          rawCoverageFields: {}
        },
        // Reports V1 (optional/additive)
        reports: {
          rows: [],
          summary: {
            hasInsuranceScore: false,
            hasClue: false,
            hasMvr: false,
            insuranceScoreCount: 0,
            clueCount: 0,
            mvrCount: 0,
            hitCount: 0,
            noClaimsCount: 0,
            noViolationsCount: 0
          }
        },
        raw: {
          customer: {},
          drivers: {},
          vehicles: {},
          coverages: {},
          reports: {},
          dwelling: {}
        },
        sourceAudit: [],
        completeness: {}
      };
    },

    loadPayload() {
      const raw = GM_getValue(KEYS.payload, null);
      if (!raw) return Storage.createEmptyPayload();
      try {
        const parsed = JSON.parse(raw);
        return Object.assign(Storage.createEmptyPayload(), parsed);
      } catch (e) {
        return Storage.createEmptyPayload();
      }
    },

    _sharedSyncTimer: null,

    summarizePayload(payload) {
      const p = payload || {};
      const visitedPages = Array.isArray(p.meta && p.meta.visitedPages) ? p.meta.visitedPages : [];
      const policyCoverages = Array.isArray(p.coverages && p.coverages.policy && p.coverages.policy.policyCoverages)
        ? p.coverages.policy.policyCoverages
        : [];
      const vehicleCoverageGroups = Array.isArray(p.coverages && p.coverages.vehicleCoverages)
        ? p.coverages.vehicleCoverages
        : [];

      return {
        storageKey: 'mciMasterPayload',
        updatedAt: U.cleanString(p.meta && p.meta.updatedAt || p.meta && p.meta.createdAt || ''),
        visitedPages: visitedPages,
        policyCoverageCount: policyCoverages.length,
        vehicleCoverageGroupCount: vehicleCoverageGroups.length
      };
    },

    syncSharedPayload(payload, reason, attempt) {
      const tryAttempt = typeof attempt === 'number' ? attempt : 0;
      const maxAttempts = 20;
      const retryDelayMs = 300;
      const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

      try {
        if (root && typeof root.setMciSharedPayload === 'function') {
          const ok = root.setMciSharedPayload(payload);
          U.debug('Erie Master Extractor shared payload sync', {
            reason: reason || 'unknown',
            attempt: tryAttempt,
            ok: !!ok,
            summary: Storage.summarizePayload(payload)
          });
          return;
        }
      } catch (e) {
        U.debug('Erie Master Extractor shared payload sync failed:', e);
      }

      if (tryAttempt >= maxAttempts) {
        U.debug('Erie Master Extractor shared payload bridge unavailable after retries', {
          reason: reason || 'unknown',
          attempts: tryAttempt,
          summary: Storage.summarizePayload(payload)
        });
        return;
      }

      if (Storage._sharedSyncTimer) {
        clearTimeout(Storage._sharedSyncTimer);
      }

      Storage._sharedSyncTimer = setTimeout(function () {
        Storage.syncSharedPayload(payload, reason, tryAttempt + 1);
      }, retryDelayMs);
    },

    savePayload(payload) {
      payload.meta.updatedAt = U.nowIso();
      const serialized = JSON.stringify(payload);
      GM_setValue(KEYS.payload, serialized);
      Storage.syncSharedPayload(payload, 'savePayload', 0);
    },

    resetPayload() {
      GM_deleteValue(KEYS.payload);

      try {
        const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (root && typeof root.clearMciSharedPayload === 'function') {
          root.clearMciSharedPayload();
          U.debug('Erie Master Extractor shared payload cleared via bridge');
        } else {
          U.debug('Erie Master Extractor shared bridge unavailable on reset');
        }
      } catch (e) {
        U.debug('Erie Master Extractor shared payload clear failed:', e);
      }
    }
  };

  // -----------------------------
  // Script readers
  // -----------------------------
  const Readers = {
    getAllScripts() {
      return Array.from(document.scripts).map(function (s) {
        return s.textContent || '';
      }).filter(Boolean);
    },

    findScriptContaining(text) {
      return Readers.getAllScripts().find(function (s) {
        return s.indexOf(text) !== -1;
      }) || '';
    },

    extractBalancedObjectAt(text, startIndex) {
      if (startIndex < 0 || text[startIndex] !== '{') return null;

      let depth = 0;
      let inString = false;
      let stringQuote = '';
      let escaped = false;

      for (let i = startIndex; i < text.length; i++) {
        const ch = text[i];

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === stringQuote) {
            inString = false;
            stringQuote = '';
          }
          continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
          inString = true;
          stringQuote = ch;
          continue;
        }

        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            return text.slice(startIndex, i + 1);
          }
        }
      }

      return null;
    },

    extractConstructorObject(scriptText, constructorName) {
      if (!scriptText) return null;
      const needle = constructorName + '(';
      const i = scriptText.indexOf(needle);
      if (i < 0) return null;

      const after = scriptText.slice(i + needle.length);
      const braceIndex = after.indexOf('{');
      if (braceIndex < 0) return null;

      const absBraceIndex = i + needle.length + braceIndex;
      const objText = Readers.extractBalancedObjectAt(scriptText, absBraceIndex);
      if (!objText) return null;

      return U.tryEvalObjectLiteral(objText);
    },

    extractAssignedObject(scriptText, variableName) {
      if (!scriptText) return null;

      const patterns = [
        'var ' + variableName + ' =',
        'let ' + variableName + ' =',
        'const ' + variableName + ' =',
        variableName + ' ='
      ];

      let foundIndex = -1;
      let foundPattern = '';
      for (let i = 0; i < patterns.length; i++) {
        const idx = scriptText.indexOf(patterns[i]);
        if (idx >= 0) {
          foundIndex = idx;
          foundPattern = patterns[i];
          break;
        }
      }
      if (foundIndex < 0) return null;

      const after = scriptText.slice(foundIndex + foundPattern.length);
      const braceIndex = after.indexOf('{');
      if (braceIndex < 0) return null;

      const absBraceIndex = foundIndex + foundPattern.length + braceIndex;
      const objText = Readers.extractBalancedObjectAt(scriptText, absBraceIndex);
      if (!objText) return null;

      return U.tryEvalObjectLiteral(objText);
    },

    findBestCustomerVM() {
      const scripts = Readers.getAllScripts();
      for (let i = 0; i < scripts.length; i++) {
        const obj = Readers.extractConstructorObject(scripts[i], 'new plw.customer.ViewModel');
        if (obj && (obj.FirstNamedInsured || obj.SecondNamedInsured || obj.MailingAddress || obj.CurrentAutoInsurer)) {
          return obj;
        }
      }
      return null;
    },

    findDriverViewData() {
      const scripts = Readers.getAllScripts();
      for (let i = 0; i < scripts.length; i++) {
        const obj = Readers.extractAssignedObject(scripts[i], 'viewData');
        if (obj && obj.DriverFormList) return obj;
      }
      return null;
    },

    findVehicleData() {
      const scripts = Readers.getAllScripts();
      for (let i = 0; i < scripts.length; i++) {
        const obj = Readers.extractAssignedObject(scripts[i], 'data');
        if (obj && obj.VehicleGridItems) return obj;
      }
      return null;
    },

    findNestedCoverageObject(obj, depth) {
      if (!obj || typeof obj !== 'object') return null;
      if (depth > 6) return null;

      if (
        Array.isArray(obj.PolicyCoverageItems) ||
        Array.isArray(obj.VehicleCoverageItems) ||
        Array.isArray(obj.CoveragesThatOnlyAppearOncePremiums)
      ) {
        return obj;
      }

      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (val && typeof val === 'object') {
          const found = Readers.findNestedCoverageObject(val, depth + 1);
          if (found) return found;
        }
      }

      return null;
    },

    findFirstArrayByKey(obj, key, depth) {
      if (!obj || typeof obj !== 'object') return null;
      if (depth > 6) return null;

      if (Array.isArray(obj[key])) {
        return obj[key];
      }

      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (val && typeof val === 'object') {
          const found = Readers.findFirstArrayByKey(val, key, depth + 1);
          if (found) return found;
        }
      }

      return null;
    },

    findAnyObjectWithCoverageArrays(scriptText) {
      if (!scriptText) return null;

      function hasCoverageShape(obj) {
        return !!(
          obj &&
          (
            Array.isArray(obj.PolicyCoverageItems) ||
            Array.isArray(obj.VehicleCoverageItems) ||
            Array.isArray(obj.CoveragesThatOnlyAppearOncePremiums)
          )
        );
      }

      // First pass: scan balanced object literals around known coverage keys.
      const anchors = ['PolicyCoverageItems', 'VehicleCoverageItems', 'CoveragesThatOnlyAppearOncePremiums'];
      for (let a = 0; a < anchors.length; a++) {
        let idx = scriptText.indexOf(anchors[a]);
        while (idx >= 0) {
          let open = scriptText.lastIndexOf('{', idx);
          let tries = 0;
          while (open >= 0 && tries < 20) {
            const objText = Readers.extractBalancedObjectAt(scriptText, open);
            if (objText) {
              const obj = U.tryEvalObjectLiteral(objText);
              if (hasCoverageShape(obj)) return obj;
              const nested = Readers.findNestedCoverageObject(obj, 0);
              if (nested && hasCoverageShape(nested)) return nested;
            }
            open = scriptText.lastIndexOf('{', open - 1);
            tries++;
          }
          idx = scriptText.indexOf(anchors[a], idx + anchors[a].length);
        }
      }

      // Second pass: broad regex scan (kept for compatibility with prior behavior).
      const matches = scriptText.match(/\{[\s\S]*?\}/g);
      if (!matches) return null;

      for (let i = 0; i < matches.length; i++) {
        const raw = matches[i];
        let obj = null;

        try {
          obj = JSON.parse(raw);
        } catch (e) {
          obj = U.tryEvalObjectLiteral(raw);
        }

        if (hasCoverageShape(obj)) {
          return obj;
        }

        const nested = Readers.findNestedCoverageObject(obj, 0);
        if (nested && hasCoverageShape(nested)) {
          return nested;
        }
      }

      return null;
    },

    findCoverageData() {
      const scripts = Readers.getAllScripts();

      function hasCoverageShape(obj) {
        return !!(
          obj &&
          (
            Array.isArray(obj.PolicyCoverageItems) ||
            Array.isArray(obj.VehicleCoverageItems) ||
            Array.isArray(obj.CoveragesThatOnlyAppearOncePremiums)
          )
        );
      }

      const candidateNames = ['viewData', 'data', 'model', 'viewModelData', 'serverViewModelData'];

      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];

        for (let j = 0; j < candidateNames.length; j++) {
          const candidate = Readers.extractAssignedObject(script, candidateNames[j]);
          if (hasCoverageShape(candidate)) return candidate;

          const nested = Readers.findNestedCoverageObject(candidate, 0);
          if (nested && hasCoverageShape(nested)) return nested;
        }

        if (
          script.indexOf('VehicleCoverageItems') !== -1 ||
          script.indexOf('CoveragesThatOnlyAppearOncePremiums') !== -1
        ) {
          const brute = Readers.findAnyObjectWithCoverageArrays(script);
          if (hasCoverageShape(brute)) return brute;
        }
      }

      return null;
    },

    // Reports V1: locate the Erie reports model with ReportGrid.
    findNestedReportsObject(obj, depth) {
      if (!obj || typeof obj !== 'object') return null;
      if (depth > 6) return null;

      if (Array.isArray(obj.ReportGrid)) {
        return obj;
      }

      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (val && typeof val === 'object') {
          const found = Readers.findNestedReportsObject(val, depth + 1);
          if (found) return found;
        }
      }

      return null;
    },

    findReportsData() {
      const scripts = Readers.getAllScripts();
      const candidateNames = ['viewData', 'data', 'model', 'viewModelData', 'serverViewModelData'];

      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];

        for (let j = 0; j < candidateNames.length; j++) {
          const candidate = Readers.extractAssignedObject(script, candidateNames[j]);
          if (candidate && Array.isArray(candidate.ReportGrid)) return candidate;

          const nested = Readers.findNestedReportsObject(candidate, 0);
          if (nested && Array.isArray(nested.ReportGrid)) return nested;
        }

        if (script.indexOf('ReportGrid') !== -1) {
          const grid = Readers.findFirstArrayByKey(
            Readers.extractAssignedObject(script, 'viewData') ||
            Readers.extractAssignedObject(script, 'data') ||
            Readers.extractAssignedObject(script, 'model') ||
            Readers.extractAssignedObject(script, 'viewModelData') ||
            Readers.extractAssignedObject(script, 'serverViewModelData'),
            'ReportGrid',
            0
          );
          if (Array.isArray(grid)) {
            return { ReportGrid: grid };
          }
        }
      }

      return null;
    },

    findDwellingVM() {
      const scripts = Readers.getAllScripts();
      for (let i = 0; i < scripts.length; i++) {
        const obj = Readers.extractAssignedObject(scripts[i], 'serverViewModelData');
        if (obj && (Object.prototype.hasOwnProperty.call(obj, 'NumberOfStories') || Object.prototype.hasOwnProperty.call(obj, 'States'))) {
          return obj;
        }
      }
      return null;
    }
  };

  // -----------------------------
  // Detection
  // -----------------------------
  const Detector = {
    detect() {
      const path = location.pathname || '';
      const currentPageMarker = Readers.findScriptContaining('plw.currentPage');

      let pageType = 'unknown';
      let coverageSubType = '';

      if (/\/Customer$/i.test(path) || currentPageMarker.indexOf("plw.currentPage = 'Customer'") >= 0) {
        pageType = 'customer';
      } else if (/\/Driver$/i.test(path) || currentPageMarker.indexOf("plw.currentPage = 'Driver'") >= 0) {
        pageType = 'drivers';
      } else if (/\/Vehicle$/i.test(path) || currentPageMarker.indexOf("plw.currentPage = 'Vehicle'") >= 0) {
        pageType = 'vehicles';
      } else if (/\/Reports(\/|$)/i.test(path) || currentPageMarker.indexOf("plw.currentPage = 'Reports'") >= 0) {
        pageType = 'reports';
      } else if (/\/Coverages\/Auto/i.test(path) || currentPageMarker.indexOf("plw.currentPage = 'Coverages_Auto'") >= 0) {
        pageType = 'coverages';
        coverageSubType = 'Auto';
      } else if (/\/Dwelling$/i.test(path) || currentPageMarker.indexOf("plw.currentPage = 'Dwelling'") >= 0) {
        pageType = 'dwelling';
      } else if (/\/Coverages\//i.test(path)) {
        pageType = 'coverages';
        const parts = path.split('/').filter(Boolean);
        coverageSubType = parts[parts.length - 1] || '';
      }

      return {
        pageType: pageType,
        coverageSubType: coverageSubType,
        url: location.href,
        path: path,
        title: document.title || ''
      };
    }
  };

  // -----------------------------
  // Normalizers
  // -----------------------------
  const Norm = {
    phoneFromList(list, preferredType) {
      if (!Array.isArray(list) || !list.length) return '';

      const normalizeType = function (p) {
        return U.cleanString(
          (p && p.TypeOfPhoneNumber && p.TypeOfPhoneNumber.code) ||
          (p && p.TypeOfPhoneNumber && p.TypeOfPhoneNumber.Code) ||
          (p && p.Type) ||
          ''
        ).toLowerCase();
      };

      if (preferredType) {
        const preferred = list.find(function (p) {
          return normalizeType(p) === preferredType;
        });
        if (!preferred) return '';
        if (preferred.Number) return U.cleanString(preferred.Number);
        return U.cleanString([
          preferred.AreaCode || '',
          preferred.Exchange || '',
          preferred.Suffix || ''
        ].join(''));
      }

      const pick = list[0];
      if (!pick) return '';
      if (pick.Number) return U.cleanString(pick.Number);

      return U.cleanString([
        pick.AreaCode || '',
        pick.Exchange || '',
        pick.Suffix || ''
      ].join(''));
    },

    emailFromList(list, directEmail) {
      if (directEmail) return U.cleanString(directEmail);
      if (!Array.isArray(list) || !list.length) return '';
      const first = list[0];
      return U.cleanString(first.EmailAddress || first.Value || '');
    },

    address(addr) {
      if (!addr) {
        return {
          line1: '',
          line2: '',
          city: '',
          state: '',
          zip: '',
          zipPlus4: '',
          county: ''
        };
      }
      return {
        line1: U.cleanString(addr.AddressLine1 || addr.Line1 || ''),
        line2: U.cleanString(addr.AddressLine2 || addr.Line2 || ''),
        city: U.cleanString(addr.City || ''),
        state: U.cleanString(addr.State || addr.FullState || ''),
        zip: U.cleanString(addr.ZipCode || addr.Zip || ''),
        zipPlus4: U.cleanString(addr.ZipPlus4 || ''),
        county: U.cleanString(addr.County || '')
      };
    },

    namedInsuredFromCustomerForm(form, flags) {
      if (!form) return null;

      const firstName = U.cleanString(form.FirstName || '');
      const lastName = U.cleanString(form.LastName || '');
      if (!firstName && !lastName) return null;

      const person = {
        personType: 'namedInsured',
        fullName: U.cleanString(
          form.DisplayName || [firstName, form.MiddleName || '', lastName].join(' ')
        ),
        firstName: firstName,
        middleName: U.cleanString(form.MiddleName || ''),
        lastName: lastName,
        suffix: U.cleanString(form.Suffix || ''),
        dob: U.normalizeDate(
          form.DateOfBirth ||
          (form.DateOfBirthForm && form.DateOfBirthForm.DateOfBirth) ||
          ''
        ),
        gender: U.cleanString(form.Gender || ''),
        maritalStatus: U.cleanString(form.MaritalStatus || ''),
        relationshipToNamedInsured: U.cleanString(form.Relationship || form.RelationshipDescription || ''),
        isPrimary: !!(flags && flags.isPrimary),
        isSecondary: !!(flags && flags.isSecondary),
        license: {
          number: U.cleanString(form.DriverLicenseNumber || ''),
          state: U.cleanString(form.DriverLicenseState || ''),
          dateFirstLicensed: U.cleanString(form.FirstLicenseDate || '')
        },
        ssn: U.cleanString(
          form.ExistingSSN ||
          form.SSN ||
          (form.SSNForm && (form.SSNForm.ExistingSSN || form.SSNForm.SSN)) ||
          ''
        ),
        email: Norm.emailFromList(form.EmailAddressList || form.EmailList || [], form.EmailAddress),
        phone: {
          mobile: Norm.phoneFromList(form.PhoneNumberList || [], 'mobile'),
          home: Norm.phoneFromList(form.PhoneNumberList || [], 'home'),
          work: Norm.phoneFromList(form.PhoneNumberList || [], 'work')
        },
        sourceKeys: {
          id: U.cleanString(form.Id || ''),
          erieId: U.cleanString(form.ErieID || ''),
          cimIdentifier: U.cleanString(form.CimIdentifier || '')
        }
      };

      return person;
    },

    driver(d) {
      const firstName = U.cleanString(d.FirstName || '');
      const lastName = U.cleanString(d.LastName || '');

      const out = {
        driverId: U.cleanString(d.Id || ''),
        role: U.cleanString(d.DriverTypeDescription || d.DriverTypeCode || ''),
        relationshipToNamedInsured: U.cleanString(d.RelationshipDescription || d.Relationship || ''),
        isNamedInsured: !!(d.IsFirstNamedInsured || d.IsSecondNamedInsured),
        isExcluded: /excluded/i.test(U.cleanString(d.DriverTypeCode || d.DriverTypeDescription || '')),
        isHouseholdMember: true,

        fullName: U.cleanString(d.FullName || [firstName, d.MiddleName || '', lastName].join(' ')),
        firstName: firstName,
        middleName: U.cleanString(d.MiddleName || ''),
        lastName: lastName,
        suffix: U.cleanString(d.Suffix || ''),

        dob: U.normalizeDate(d.DateOfBirthForm && d.DateOfBirthForm.DateOfBirth || d.DateOfBirth || ''),
        gender: U.cleanString(d.Gender || ''),
        maritalStatus: U.cleanString(d.MaritalStatus || ''),

        license: {
          number: U.cleanString(d.DriverLicenseNumber || ''),
          state: U.cleanString(d.DriverLicenseState || ''),
          status: '',
          dateFirstLicensed: U.cleanString(d.FirstLicenseDate || '')
        },

        ssn: U.cleanString(d.SSNForm && d.SSNForm.ExistingSSN || d.SSN || ''),
        occupation: '',
        education: '',

        driverTraining: U.cleanString(d.HasDriverTrainingDiscount || ''),
        sr22: '',
        goodStudent: '',
        distantStudent: U.cleanString(d.CollegeStudent || ''),

        accidents: [],
        violations: [],

        phone: {
          mobile: Norm.phoneFromList(d.PhoneNumberList || [], 'mobile'),
          home: Norm.phoneFromList(d.PhoneNumberList || [], 'home'),
          work: Norm.phoneFromList(d.PhoneNumberList || [], 'work')
        },

        sourceKeys: {
          id: U.cleanString(d.Id || ''),
          erieId: U.cleanString(d.ErieID || ''),
          cimIdentifier: U.cleanString(d.CimIdentifier || ''),
          driverLicenseId: U.cleanString(d.DriverLicenseId || '')
        },

        matchKey: ''
      };

      out.matchKey = U.makeDriverMatchKey(out);
      return out;
    },

    vehicleFromGridItem(v) {
      const yearMakeModel = U.cleanString(v.YearMakeModel || v.VehicleDescription || '');
      const parts = yearMakeModel.split(/\s+/);

      const year = parts.length ? parts[0] : '';
      const make = parts.length > 1 ? parts[1] : '';
      const model = parts.length > 2 ? parts.slice(2).join(' ') : '';

      const out = {
        vehicleId: U.cleanString(v.Id || v.VehicleId || ''),
        unitNumber: U.cleanString(v.UnitNumber || ''),
        vin: '',
        vinMaskedTail: U.cleanString(v.VIN || v.VehicleIdentificationNumber || v.Vin || ''),
        year: U.cleanString(v.Year || year),
        make: U.cleanString(v.Make || make),
        model: U.cleanString(v.Model || model),
        trim: U.cleanString(v.Trim || ''),
        style: U.cleanString(v.Style || ''),
        bodyType: U.cleanString(v.VehicleTypeDescription || v.VehicleType || ''),
        doors: U.cleanString(v.Doors || ''),
        restraintType: U.cleanString(v.RestraintType || ''),
        use: U.cleanString(v.Use || v.VehicleUse || ''),
        annualMiles: U.cleanString(v.Annual || v.AnnualMiles || ''),
        commuteMiles: U.cleanString(v.DaysMiles || v.CommuteMiles || ''),
        ownership: U.cleanString(v.Ownership || ''),
        primaryOperator: U.cleanString(v.PrimaryOperator || ''),
        garagingAddress: {
          line1: '',
          line2: '',
          city: '',
          state: '',
          zip: ''
        },
        lienholder: {
          name: '',
          loanLease: ''
        },
        driversAssigned: [],
        coverages: [],
        sourceKeys: {
          id: U.cleanString(v.Id || v.VehicleId || '')
        },
        matchKey: ''
      };

      return out;
    },

    enrichVehicleFromDom(vehicle) {
      const out = U.clone(vehicle);

      const vin = U.inputValue('#VehicleIdentificationNumber, #Vin, input[name="VehicleIdentificationNumber"], input[name="VIN"]');
      if (vin) out.vin = vin;

      const year = U.inputValue('#ModelYear, input[name="ModelYear"], input[name="Year"]');
      if (year) out.year = year;

      const makeText = U.selectText('#Make, #VehicleMake, select[name="Make"], select[name="VehicleMake"]');
      if (makeText && !/^--/.test(makeText)) out.make = makeText;

      const modelText = U.selectText('#Model, #VehicleModel, select[name="Model"], select[name="VehicleModel"]');
      if (modelText && !/^--/.test(modelText)) out.model = modelText;

      const useText = U.selectText('#VehicleUse, select[name="VehicleUse"]');
      if (useText && !/^--/.test(useText)) out.use = useText;

      const annualMiles = U.inputValue('#AnnualMiles, input[name="AnnualMiles"]');
      if (annualMiles) out.annualMiles = annualMiles;

      out.matchKey = U.makeVehicleMatchKey(out);
      return out;
    },

    coverageItem(c) {
      return {
        coverageCode: U.cleanString(c.CoverageCode || c.Code || ''),
        coverageDescription: U.cleanString(c.CoverageDescription || c.Description || ''),
        summaryDescription: U.cleanString(c.SummaryDescription || c.Summary || ''),
        coverageLimit: U.cleanString(c.CoverageLimit || c.Limit || ''),
        premium: c.Premium,
        premium2: c.Premium2,
        subcategory: U.cleanString(c.CoverageSubcategory || c.Subcategory || ''),
        displayOrder: c.CoverageDisplayOrder != null ? c.CoverageDisplayOrder : c.DisplayOrder
      };
    }
  };

  // -----------------------------
  // Extractors
  // -----------------------------
  const Extractors = {
    customer(ctx) {
      const vm = Readers.findBestCustomerVM();
      const partial = {
        meta: {
          currentPageType: 'customer'
        },
        customer: {},
        namedInsureds: [],
        raw: {
          customer: {}
        }
      };

      if (!vm) {
        return partial;
      }

      partial.raw.customer.customerVM = vm;

      const primary = vm.FirstNamedInsured || null;
      const secondary = vm.SecondNamedInsured || null;

      const named1 = Norm.namedInsuredFromCustomerForm(primary, { isPrimary: true });
      const named2 = Norm.namedInsuredFromCustomerForm(secondary, { isSecondary: true });

      if (named1) partial.namedInsureds.push(named1);
      if (named2) partial.namedInsureds.push(named2);

      partial.meta.products = partial.meta.products || [];
      if (vm.HasAuto) U.pushUnique(partial.meta.products, 'Auto');
      if (vm.HasUmbrella) U.pushUnique(partial.meta.products, 'Umbrella');
      if (vm.HasHome) U.pushUnique(partial.meta.products, 'Home');
      if (vm.HasDwelling) U.pushUnique(partial.meta.products, 'Dwelling');
      if (vm.HasLife) U.pushUnique(partial.meta.products, 'Life');

      const mailingAddress = Norm.address(
        vm.MailingAddress ||
        vm.MailingAddressForm ||
        {}
      );

      const residenceAddress = Norm.address(
        vm.ResidenceAddress ||
        vm.ResidentialAddress ||
        vm.ResidenceAddressForm ||
        vm.MailingAddress ||
        {}
      );

      partial.customer = {
        fullName: named1 ? named1.fullName : '',
        firstName: named1 ? named1.firstName : '',
        middleName: named1 ? named1.middleName : '',
        lastName: named1 ? named1.lastName : '',
        suffix: named1 ? named1.suffix : '',
        dob: named1 ? named1.dob : '',
        email: named1 ? named1.email : '',
        phone: {
          mobile: named1 && named1.phone ? named1.phone.mobile : '',
          home: named1 && named1.phone ? named1.phone.home : '',
          work: named1 && named1.phone ? named1.phone.work : ''
        },
        maritalStatus: named1 ? named1.maritalStatus : '',
        gender: named1 ? named1.gender : '',
        mailingAddress: mailingAddress,
        residenceAddress: residenceAddress,
        currentInsurance: {
          currentAutoInsurer: U.cleanString(vm.CurrentAutoInsurer || ''),
          priorAutoEriePolicyNumber: U.cleanString(vm.PriorAutoEriePolicyNumber || ''),
          autoPriorBILimits: U.cleanString(vm.AutoPriorBILimits || ''),
          rewriteSpinoff: U.cleanString(vm.ErieAutoRewriteSpinoff || '')
        },
        sourceKeys: {
          customerId: U.cleanString(vm.Id || (named1 && named1.sourceKeys && named1.sourceKeys.id) || ''),
          erieId: U.cleanString(vm.ErieID || (named1 && named1.sourceKeys && named1.sourceKeys.erieId) || ''),
          cimIdentifier: U.cleanString(vm.CimIdentifier || (named1 && named1.sourceKeys && named1.sourceKeys.cimIdentifier) || '')
        }
      };

      return partial;
    },

    drivers(ctx) {
      const viewData = Readers.findDriverViewData();
      const partial = {
        meta: {
          currentPageType: 'drivers',
          effectiveDate: '',
          riskState: ''
        },
        drivers: [],
        raw: {
          drivers: {}
        }
      };

      if (!viewData) return partial;

      partial.raw.drivers.viewData = viewData;
      partial.meta.effectiveDate = U.cleanString(viewData.AutoPolicyEffectiveDate || '');
      partial.meta.riskState = U.cleanString(viewData.RiskState || '');

      const list = Array.isArray(viewData.DriverFormList) ? viewData.DriverFormList : [];
      partial.drivers = list.map(Norm.driver);

      return partial;
    },

    vehicles(ctx) {
      const data = Readers.findVehicleData();
      const partial = {
        meta: {
          currentPageType: 'vehicles'
        },
        vehicles: [],
        raw: {
          vehicles: {}
        }
      };

      if (!data) return partial;

      partial.raw.vehicles.data = data;

      const grid = Array.isArray(data.VehicleGridItems) ? data.VehicleGridItems : [];
      partial.vehicles = grid.map(function (item) {
        const v = Norm.vehicleFromGridItem(item);
        v.matchKey = U.makeVehicleMatchKey(v);
        return v;
      });

      // Enrich open vehicle from form DOM if present
      const fullVin = U.inputValue('#VehicleIdentificationNumber, #Vin, input[name="VehicleIdentificationNumber"], input[name="VIN"]');
      if (fullVin) {
        let target = null;

        const targetId = U.inputValue('#Id, input[name="Id"], input[name="VehicleId"]');
        if (targetId) {
          target = partial.vehicles.find(function (v) {
            return U.cleanString(v.vehicleId) === U.cleanString(targetId);
          });
        }

        if (!target && partial.vehicles.length === 1) {
          target = partial.vehicles[0];
        }

        if (!target) {
          const maskedTail = fullVin.slice(-4);
          target = partial.vehicles.find(function (v) {
            return U.cleanString(v.vinMaskedTail).slice(-4) === maskedTail;
          });
        }

        const enriched = Norm.enrichVehicleFromDom(target || {});
        if (target) {
          Object.assign(target, enriched);
        } else {
          partial.vehicles.push(enriched);
        }
      }

      return partial;
    },

    coverages(ctx) {
      const data = Readers.findCoverageData();
      const payloadVehicles = (Storage.loadPayload().vehicles || []);
      const partial = {
        meta: {
          currentPageType: 'coverages',
          coverageSubType: ctx.coverageSubType || ''
        },
        coverages: {
          policy: {
            effectiveDate: '',
            payPlan: '',
            riskState: '',
            lineOfBusinessList: [],
            policyCoverages: [],
            coveragesThatOnlyAppearOncePremiums: []
          },
          vehicleCoverages: [],
          discounts: [],
          endorsements: [],
          rawCoverageFields: {}
        },
        raw: {
          coverages: {}
        }
      };

      partial.coverages.policy.effectiveDate = U.inputValue('#EffectiveDate') || U.text('#EffectiveDate');
      partial.coverages.policy.payPlan = U.selectText('#PayPlan, select[name="PayPlan"]');
      partial.coverages.policy.riskState = U.inputValue('#RiskState') || '';

      if (data) {
        partial.raw.coverages = {
          data: data
        };

        partial.coverages.policy.lineOfBusinessList = U.asArray(data.LineOfBusinessList).slice();
        partial.coverages.policy.policyCoverages = U.asArray(data.PolicyCoverageItems).map(Norm.coverageItem);
        partial.coverages.policy.coveragesThatOnlyAppearOncePremiums = U.asArray(data.CoveragesThatOnlyAppearOncePremiums).map(Norm.coverageItem);
        partial.coverages.vehicleCoverages = U.asArray(data.VehicleCoverageItems).map(function (v) {
          return {
            vehicleId: U.cleanString(v.VehicleId || v.Id || ''),
            vehicleDescription: U.cleanString(v.VehicleDescription || v.YearMakeModel || ''),
            primaryOperator: U.cleanString(v.PrimaryOperator || ''),
            vehicleType: U.cleanString(v.VehicleTypeDescription || v.VehicleType || ''),
            premium: v.Premium,
            premium2: v.Premium2,
            discounts: U.asArray(v.Discounts).map(function (d) {
              return {
                name: U.cleanString(d.Name || d.Description || ''),
                premiumIncluded: U.cleanString(d.PremiumIncluded || ''),
                premium2Included: U.cleanString(d.Premium2Included || '')
              };
            }),
            coverages: U.asArray(v.Coverages).map(Norm.coverageItem)
          };
        });

        return partial;
      }

      // Fallback to visible coverage controls when structured arrays are missing.
      function readCoverageDescription(row) {
        const attr = U.cleanString(
          row.getAttribute('data-coveragedescription') ||
          row.getAttribute('data-coverage-description') ||
          ''
        );
        if (attr) return attr;

        const labelEl = row.querySelector('label, .coverage-description, .coverageDescription, [data-role="description"], th, td');
        if (labelEl) return U.cleanString(labelEl.textContent || '');

        return U.cleanString(row.textContent || '');
      }

      function isJunkSelectedValue(value) {
        const s = U.cleanString(value);
        if (!s) return false;
        if (U.isJunkCoverageText(s)) return true;
        if (s.length > 120 && /- None -/i.test(s)) return true;
        return false;
      }

      function rowToCoverage(row, idx) {
        return {
          coverageCode: U.cleanString(
            row.getAttribute('data-coveragecode') ||
            row.getAttribute('data-coverage-code') ||
            ''
          ),
          coverageDescription: readCoverageDescription(row),
          summaryDescription: '',
          coverageLimit: U.selectedControlValue(row),
          premium: null,
          premium2: null,
          subcategory: '',
          displayOrder: idx
        };
      }

      function shouldIncludeCoverage(item) {
        const hasIdentity = !!(U.cleanString(item.coverageCode) || U.cleanString(item.coverageDescription));
        if (!hasIdentity) return false;
        if (U.isJunkCoverageText(item.coverageDescription)) return false;
        if (isJunkSelectedValue(item.coverageLimit)) return false;
        return true;
      }


      const policyRows = U.safeQueryAll('[data-coveragelevel="Policy"]');
      policyRows.forEach(function (row, idx) {
        const item = rowToCoverage(row, idx);
        if (shouldIncludeCoverage(item)) {
          partial.coverages.policy.policyCoverages.push(item);
        }
      });
      partial.coverages.policy.policyCoverages = U.dedupeCoverageItems(partial.coverages.policy.policyCoverages);

      const vehicleRows = U.safeQueryAll('[data-coveragelevel="Vehicle"]');
      const groups = {};
      const groupOrder = [];

      vehicleRows.forEach(function (row, idx) {
        const rowVehicleId = U.cleanString(
          row.getAttribute('data-vehicleid') ||
          row.getAttribute('data-vehicle-id') ||
          ''
        );
        const ownerWithVehicleId = row.closest('[data-vehicleid], [data-vehicle-id]');
        const vehicleId = rowVehicleId || U.cleanString(
          ownerWithVehicleId &&
          (
            ownerWithVehicleId.getAttribute('data-vehicleid') ||
            ownerWithVehicleId.getAttribute('data-vehicle-id')
          ) ||
          ''
        );

        const rowVehicleIndex = U.cleanString(row.getAttribute('data-vehicleindex') || '');
        const ownerWithIndex = row.closest('[data-vehicleindex]');
        const vehicleIndex = rowVehicleIndex || U.cleanString(
          ownerWithIndex && ownerWithIndex.getAttribute('data-vehicleindex') || ''
        );

        const rowVehicleDescription = U.cleanString(
          row.getAttribute('data-vehicledescription') ||
          row.getAttribute('data-vehicle-description') ||
          ''
        );
        const ownerWithDescription = row.closest('[data-vehicledescription], [data-vehicle-description]');
        let vehicleDescription = rowVehicleDescription || U.cleanString(
          ownerWithDescription &&
          (
            ownerWithDescription.getAttribute('data-vehicledescription') ||
            ownerWithDescription.getAttribute('data-vehicle-description')
          ) ||
          ''
        );

        if (!vehicleDescription) {
          const block = row.closest('section, fieldset, table, div');
          if (block) {
            const heading = block.querySelector('h1, h2, h3, h4, legend, .vehicle-title, .vehicleHeader, .panel-title');
            if (heading) vehicleDescription = U.cleanString(heading.textContent || '');
          }
        }

        if (!vehicleDescription) {
          let prev = row.previousElementSibling;
          let hops = 0;
          while (prev && hops < 6 && !vehicleDescription) {
            if (/^(H1|H2|H3|H4|LEGEND)$/.test(prev.tagName)) {
              vehicleDescription = U.cleanString(prev.textContent || '');
              break;
            }
            const nested = prev.querySelector('h1, h2, h3, h4, legend');
            if (nested) {
              vehicleDescription = U.cleanString(nested.textContent || '');
              break;
            }
            prev = prev.previousElementSibling;
            hops++;
          }
        }

        if (!vehicleDescription) {
          vehicleDescription = vehicleIndex ? ('Vehicle ' + vehicleIndex) : 'Vehicle';
        }

        const groupKey = vehicleId ? ('VID|' + vehicleId) : (vehicleIndex ? ('IDX|' + vehicleIndex) : ('DESC|' + U.upper(vehicleDescription)));
        if (!groups[groupKey]) {
          groups[groupKey] = {
            vehicleId: vehicleId,
            _vehicleIndex: vehicleIndex,
            vehicleDescription: vehicleDescription,
            primaryOperator: '',
            vehicleType: '',
            premium: null,
            premium2: null,
            discounts: [],
            coverages: []
          };
          groupOrder.push(groupKey);
        }

        const item = rowToCoverage(row, idx);
        if (shouldIncludeCoverage(item)) {
          groups[groupKey].coverages.push(item);
        }
      });

      partial.coverages.vehicleCoverages = groupOrder.map(function (key) {
        const group = groups[key];
        group.coverages = U.dedupeCoverageItems(group.coverages);

        const existingById = payloadVehicles.find(function (v) {
          return U.cleanString(v.vehicleId) === U.cleanString(group.vehicleId);
        });

        if (!existingById) {
          const matched = U.matchVehicleByDescription(group.vehicleDescription, payloadVehicles);
          if (matched && matched.vehicleId) {
            group.vehicleId = U.cleanString(matched.vehicleId);
          }
        }

        if (!group.vehicleId) {
          group.vehicleId = U.cleanString(group._vehicleIndex || '');
        }

        delete group._vehicleIndex;
        return group;
      }).filter(function (group) {
        return !!(
          group &&
          (
            (Array.isArray(group.coverages) && group.coverages.length) ||
            U.cleanString(group.vehicleId) ||
            U.cleanString(group.vehicleDescription)
          )
        );
      });

      return partial;
    },

    // Reports V1: additive extractor for Erie Reports page only.
    reports(ctx) {
      const partial = {
        meta: {
          currentPageType: 'reports'
        },
        reports: {
          rows: [],
          summary: {
            hasInsuranceScore: false,
            hasClue: false,
            hasMvr: false,
            insuranceScoreCount: 0,
            clueCount: 0,
            mvrCount: 0,
            hitCount: 0,
            noClaimsCount: 0,
            noViolationsCount: 0
          }
        },
        raw: {
          reports: {}
        }
      };

      function firstNonEmpty(values) {
        for (let i = 0; i < values.length; i++) {
          const value = U.cleanString(values[i]);
          if (value) return value;
        }
        return '';
      }

      function mapDisputed(value) {
        const bool = U.boolFromErie(value);
        if (bool != null) return bool;
        const s = U.cleanString(value).toLowerCase();
        return s === 'y' || s === 'yes' || s === '1';
      }

      function mapReportRow(row) {
        const r = row || {};
        return {
          listSequenceId: firstNonEmpty([r.ListSequenceId, r.ListSequenceID, r.listSequenceId, r.Id, r.ID]),
          viewType: firstNonEmpty([r.ViewType, r.viewType]),
          name: firstNonEmpty([r.Name, r.DriverName, r.InsuredName, r.FullName]),
          driverType: firstNonEmpty([r.DriverType, r.DriverTypeDescription]),
          reportType: firstNonEmpty([r.ReportType, r.ReportTypeDescription, r.Type]),
          policyDescription: firstNonEmpty([r.PolicyDescription, r.PolicyDesc, r.Policy]),
          reportDate: firstNonEmpty([r.ReportDate, r.Date]),
          statusType: firstNonEmpty([r.StatusType, r.Status, r.Result]),
          eventDate: firstNonEmpty([r.EventDate, r.ClaimDate, r.ViolationDate]),
          amount: firstNonEmpty([r.Amount, r.LossAmount]),
          score: firstNonEmpty([r.Score, r.InsuranceScore]),
          indicatedTier: firstNonEmpty([r.IndicatedTier, r.Tier]),
          disputed: mapDisputed(
            firstNonEmpty([r.Disputed, r.IsDisputed, r.IsDisputedClaim, r.disputed])
          )
        };
      }

      function createSummary(rows) {
        const summary = {
          hasInsuranceScore: false,
          hasClue: false,
          hasMvr: false,
          insuranceScoreCount: 0,
          clueCount: 0,
          mvrCount: 0,
          hitCount: 0,
          noClaimsCount: 0,
          noViolationsCount: 0
        };

        (rows || []).forEach(function (row) {
          const reportType = U.upper(row && row.reportType || '');
          const statusType = U.upper(row && row.statusType || '');

          if (reportType.indexOf('INSURANCE SCORE') >= 0) {
            summary.insuranceScoreCount++;
          }
          if (reportType.indexOf('CLUE') >= 0) {
            summary.clueCount++;
          }
          if (reportType.indexOf('MVR') >= 0) {
            summary.mvrCount++;
          }
          if (statusType === 'HIT') {
            summary.hitCount++;
          }
          if (statusType.indexOf('NO CLAIMS') >= 0) {
            summary.noClaimsCount++;
          }
          if (statusType.indexOf('NO VIOLATIONS') >= 0) {
            summary.noViolationsCount++;
          }
        });

        summary.hasInsuranceScore = summary.insuranceScoreCount > 0;
        summary.hasClue = summary.clueCount > 0;
        summary.hasMvr = summary.mvrCount > 0;

        return summary;
      }

      function extractRowsFromDomFallback() {
        const tables = U.safeQueryAll('table[id*="Report"], table[class*="Report"], table[id*="report"], table[class*="report"]');
        if (!tables.length) return [];

        for (let t = 0; t < tables.length; t++) {
          const table = tables[t];
          const headerCells = Array.from(table.querySelectorAll('thead th'));
          const headers = headerCells.map(function (th) { return U.upper(th.textContent || ''); });

          if (!headers.length) continue;

          const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
          if (!bodyRows.length) continue;

          function findHeaderIndex(tokens) {
            for (let i = 0; i < headers.length; i++) {
              for (let j = 0; j < tokens.length; j++) {
                if (headers[i].indexOf(tokens[j]) >= 0) return i;
              }
            }
            return -1;
          }

          const idx = {
            listSequenceId: findHeaderIndex(['LIST SEQUENCE', 'SEQUENCE', 'LIST ID']),
            viewType: findHeaderIndex(['VIEW TYPE']),
            name: findHeaderIndex(['NAME', 'DRIVER']),
            driverType: findHeaderIndex(['DRIVER TYPE']),
            reportType: findHeaderIndex(['REPORT TYPE', 'TYPE']),
            policyDescription: findHeaderIndex(['POLICY DESCRIPTION', 'POLICY']),
            reportDate: findHeaderIndex(['REPORT DATE', 'DATE']),
            statusType: findHeaderIndex(['STATUS']),
            eventDate: findHeaderIndex(['EVENT DATE', 'CLAIM DATE', 'VIOLATION DATE']),
            amount: findHeaderIndex(['AMOUNT']),
            score: findHeaderIndex(['SCORE']),
            indicatedTier: findHeaderIndex(['TIER']),
            disputed: findHeaderIndex(['DISPUTED'])
          };

          const rows = bodyRows.map(function (tr) {
            const cells = Array.from(tr.querySelectorAll('td')).map(function (td) {
              return U.cleanString(td.textContent || td.innerText || '');
            });

            function cell(i) {
              return i >= 0 ? U.cleanString(cells[i] || '') : '';
            }

            return mapReportRow({
              ListSequenceId: cell(idx.listSequenceId),
              ViewType: cell(idx.viewType),
              Name: cell(idx.name),
              DriverType: cell(idx.driverType),
              ReportType: cell(idx.reportType),
              PolicyDescription: cell(idx.policyDescription),
              ReportDate: cell(idx.reportDate),
              StatusType: cell(idx.statusType),
              EventDate: cell(idx.eventDate),
              Amount: cell(idx.amount),
              Score: cell(idx.score),
              IndicatedTier: cell(idx.indicatedTier),
              Disputed: cell(idx.disputed)
            });
          }).filter(function (row) {
            return !!(
              row &&
              (
                row.listSequenceId ||
                row.reportType ||
                row.name ||
                row.statusType ||
                row.reportDate
              )
            );
          });

          if (rows.length) return rows;
        }

        return [];
      }

      const model = Readers.findReportsData();
      const modelRows = model && Array.isArray(model.ReportGrid) ? model.ReportGrid : null;

      if (modelRows) {
        partial.raw.reports.model = model;
        partial.reports.rows = modelRows.map(mapReportRow);
        partial.reports.summary = createSummary(partial.reports.rows);
        U.debug('Erie Master Extractor Reports V1 rows:', partial.reports.rows.length);
        return partial;
      }

      U.debug('Erie Master Extractor Reports V1: no ReportGrid model found; trying DOM fallback.');

      const fallbackRows = extractRowsFromDomFallback();
      if (fallbackRows.length) {
        partial.raw.reports.domFallback = {
          extractedRows: fallbackRows.length
        };
      }

      partial.reports.rows = fallbackRows;
      partial.reports.summary = createSummary(partial.reports.rows);
      U.debug('Erie Master Extractor Reports V1 rows (fallback):', partial.reports.rows.length);

      return partial;
    },

    dwelling(ctx) {
      const vm = Readers.findDwellingVM();
      const partial = {
        meta: {
          currentPageType: 'dwelling'
        },
        raw: {
          dwelling: {}
        }
      };

      partial.raw.dwelling.serverViewModelData = vm || null;
      partial.raw.dwelling.domFields = {
        homePolicyType: U.inputValue('#CurrentHomePolicy') || U.inputValue('#HomePolicyType'),
        constructionYear: U.inputValue('#ConstructionYear'),
        livingArea: U.inputValue('#txtLivingArea'),
        dwellingAmount: U.inputValue('#DwellingAmount'),
        personalPropertyValue: U.inputValue('#PersonalPropertyValue'),
        lossOfUseValue: U.inputValue('#LossOfUseValue')
      };

      return partial;
    }
  };

  // -----------------------------
  // Merge
  // -----------------------------
  const Merge = {
    mergeScalar(target, key, incoming, opts) {
      const existing = target[key];
      target[key] = U.betterScalar(existing, incoming, opts || {});
    },

    mergeAddress(target, incoming) {
      if (!incoming) return;
      const keys = ['line1', 'line2', 'city', 'state', 'zip', 'zipPlus4', 'county'];
      keys.forEach(function (k) {
        Merge.mergeScalar(target, k, incoming[k], {});
      });
    },

    mergeCustomer(payload, incoming) {
      if (!incoming) return;
      const t = payload.customer;

      [
        'fullName', 'firstName', 'middleName', 'lastName', 'suffix',
        'dob', 'email', 'maritalStatus', 'gender'
      ].forEach(function (k) {
        Merge.mergeScalar(t, k, incoming[k], {});
      });

      ['mobile', 'home', 'work'].forEach(function (k) {
        Merge.mergeScalar(t.phone, k, incoming.phone && incoming.phone[k], {});
      });

      Merge.mergeAddress(t.mailingAddress, incoming.mailingAddress || {});
      Merge.mergeAddress(t.residenceAddress, incoming.residenceAddress || {});

      const ci = incoming.currentInsurance || {};
      const ti = t.currentInsurance;
      ['currentAutoInsurer', 'priorAutoEriePolicyNumber', 'autoPriorBILimits', 'rewriteSpinoff'].forEach(function (k) {
        Merge.mergeScalar(ti, k, ci[k], {});
      });

      t.sourceKeys = Object.assign({}, t.sourceKeys, incoming.sourceKeys || {});
    },

    mergeNamedInsureds(payload, incomingList) {
      if (!Array.isArray(incomingList)) return;

      incomingList.forEach(function (person) {
        const key = [
          U.upper(person.firstName),
          U.upper(person.lastName),
          U.cleanString(person.dob)
        ].join('|');

        let existing = payload.namedInsureds.find(function (p) {
          const pKey = [
            U.upper(p.firstName),
            U.upper(p.lastName),
            U.cleanString(p.dob)
          ].join('|');
          return pKey === key;
        });

        if (!existing) {
          payload.namedInsureds.push(U.clone(person));
          return;
        }

        ['fullName', 'firstName', 'middleName', 'lastName', 'suffix', 'dob', 'gender', 'maritalStatus', 'relationshipToNamedInsured', 'email'].forEach(function (k) {
          Merge.mergeScalar(existing, k, person[k], {});
        });

        Merge.mergeScalar(existing.license, 'number', person.license && person.license.number, {
          existingSourceRank: 50,
          incomingSourceRank: 100
        });
        Merge.mergeScalar(existing.license, 'state', person.license && person.license.state, {});
        Merge.mergeScalar(existing.license, 'dateFirstLicensed', person.license && person.license.dateFirstLicensed, {});
        Merge.mergeScalar(existing, 'ssn', person.ssn, {
          existingSourceRank: 50,
          incomingSourceRank: 100
        });

        ['mobile', 'home', 'work'].forEach(function (k) {
          Merge.mergeScalar(existing.phone, k, person.phone && person.phone[k], {});
        });

        existing.sourceKeys = Object.assign({}, existing.sourceKeys, person.sourceKeys || {});
        existing.isPrimary = existing.isPrimary || person.isPrimary;
        existing.isSecondary = existing.isSecondary || person.isSecondary;
      });
    },

    mergeDrivers(payload, incomingDrivers) {
      if (!Array.isArray(incomingDrivers)) return;

      incomingDrivers.forEach(function (d) {
        const matchKey = d.matchKey || U.makeDriverMatchKey(d);

        let existing = payload.drivers.find(function (x) {
          return x.matchKey === matchKey ||
            (d.driverId && x.driverId && U.cleanString(x.driverId) === U.cleanString(d.driverId)) ||
            (d.sourceKeys && d.sourceKeys.erieId && x.sourceKeys && x.sourceKeys.erieId && U.cleanString(x.sourceKeys.erieId) === U.cleanString(d.sourceKeys.erieId));
        });

        if (!existing) {
          const copy = U.clone(d);
          copy.matchKey = matchKey;
          payload.drivers.push(copy);
          return;
        }

        [
          'driverId', 'role', 'relationshipToNamedInsured', 'fullName', 'firstName',
          'middleName', 'lastName', 'suffix', 'dob', 'gender', 'maritalStatus',
          'ssn', 'occupation', 'education', 'driverTraining', 'sr22',
          'goodStudent', 'distantStudent'
        ].forEach(function (k) {
          Merge.mergeScalar(existing, k, d[k], {});
        });

        existing.isNamedInsured = existing.isNamedInsured || d.isNamedInsured;
        existing.isExcluded = existing.isExcluded || d.isExcluded;
        existing.isHouseholdMember = existing.isHouseholdMember || d.isHouseholdMember;

        Merge.mergeScalar(existing.license, 'number', d.license && d.license.number, {
          existingSourceRank: U.sourceRank('inline-viewData'),
          incomingSourceRank: U.sourceRank('inline-viewData')
        });
        Merge.mergeScalar(existing.license, 'state', d.license && d.license.state, {});
        Merge.mergeScalar(existing.license, 'status', d.license && d.license.status, {});
        Merge.mergeScalar(existing.license, 'dateFirstLicensed', d.license && d.license.dateFirstLicensed, {});

        ['mobile', 'home', 'work'].forEach(function (k) {
          Merge.mergeScalar(existing.phone, k, d.phone && d.phone[k], {});
        });

        existing.sourceKeys = Object.assign({}, existing.sourceKeys, d.sourceKeys || {});
        existing.matchKey = U.makeDriverMatchKey(existing);
      });
    },

    mergeVehicles(payload, incomingVehicles) {
      if (!Array.isArray(incomingVehicles)) return;

      incomingVehicles.forEach(function (v) {
        const matchKey = v.matchKey || U.makeVehicleMatchKey(v);

        let existing = payload.vehicles.find(function (x) {
          return x.matchKey === matchKey ||
            (v.vehicleId && x.vehicleId && U.cleanString(x.vehicleId) === U.cleanString(v.vehicleId));
        });

        if (!existing) {
          const copy = U.clone(v);
          copy.matchKey = matchKey;
          payload.vehicles.push(copy);
          return;
        }

        [
          'vehicleId', 'unitNumber', 'year', 'make', 'model', 'trim', 'style',
          'bodyType', 'doors', 'restraintType', 'use', 'annualMiles', 'commuteMiles',
          'ownership', 'primaryOperator'
        ].forEach(function (k) {
          Merge.mergeScalar(existing, k, v[k], {});
        });

        Merge.mergeScalar(existing, 'vin', v.vin, {
          existingSourceRank: U.looksMasked(existing.vin) ? 0 : 100,
          incomingSourceRank: U.looksMasked(v.vin) ? 0 : 100
        });
        Merge.mergeScalar(existing, 'vinMaskedTail', v.vinMaskedTail, {});
        existing.sourceKeys = Object.assign({}, existing.sourceKeys, v.sourceKeys || {});
        existing.matchKey = U.makeVehicleMatchKey(existing);
      });
    },

    mergeCoverages(payload, incomingCoverages) {
      if (!incomingCoverages) return;

      const p = payload.coverages.policy;
      const i = incomingCoverages.policy || {};

      ['effectiveDate', 'payPlan', 'riskState'].forEach(function (k) {
        Merge.mergeScalar(p, k, i[k], {});
      });

      if (Array.isArray(i.lineOfBusinessList)) {
        i.lineOfBusinessList.forEach(function (lob) {
          U.pushUnique(p.lineOfBusinessList, lob);
        });
      }

      if (Array.isArray(i.policyCoverages) && i.policyCoverages.length) {
        p.policyCoverages = U.clone(i.policyCoverages);
      }

      if (Array.isArray(i.coveragesThatOnlyAppearOncePremiums) && i.coveragesThatOnlyAppearOncePremiums.length) {
        p.coveragesThatOnlyAppearOncePremiums = U.clone(i.coveragesThatOnlyAppearOncePremiums);
      }

      if (Array.isArray(incomingCoverages.vehicleCoverages)) {
        const normalizedVehicleCoverages = incomingCoverages.vehicleCoverages.map(function (vc) {
          const copy = U.clone(vc);
          const vehicle = payload.vehicles.find(function (v) {
            return U.cleanString(v.vehicleId) === U.cleanString(copy.vehicleId);
          });

          if (!vehicle) {
            const matchedByDescription = U.matchVehicleByDescription(copy.vehicleDescription, payload.vehicles);
            if (matchedByDescription && matchedByDescription.vehicleId) {
              copy.vehicleId = U.cleanString(matchedByDescription.vehicleId);
            }
          }

          return copy;
        });

        payload.coverages.vehicleCoverages = U.clone(normalizedVehicleCoverages);

        normalizedVehicleCoverages.forEach(function (vc) {
          const vehicle = payload.vehicles.find(function (v) {
            return U.cleanString(v.vehicleId) === U.cleanString(vc.vehicleId);
          });
          if (vehicle) {
            vehicle.coverages = U.clone(vc.coverages || []);
            if (Array.isArray(vc.discounts)) {
              vehicle.discounts = U.clone(vc.discounts);
            }
            if (vc.premium != null) {
              vehicle.coveragePremium = vc.premium;
            }
            if (vc.premium2 != null) {
              vehicle.coveragePremium2 = vc.premium2;
            }
          }
        });
      }

      if (Array.isArray(payload.coverages.vehicleCoverages)) {
        payload.coverages.vehicleCoverages.forEach(function (group) {
          const vehicle = payload.vehicles.find(function (v) {
            return String(v.vehicleId) === String(group.vehicleId);
          });

          if (vehicle) {
            vehicle.coverages = group.coverages || [];
            vehicle.discounts = group.discounts || [];
            vehicle.coveragePremium = group.premium;
            vehicle.coveragePremium2 = group.premium2;
          }
        });
      }
    },

    // Reports V1: additive merge, isolated from existing sections.
    mergeReports(payload, incomingReports) {
      if (!incomingReports) return;

      const defaultSummary = {
        hasInsuranceScore: false,
        hasClue: false,
        hasMvr: false,
        insuranceScoreCount: 0,
        clueCount: 0,
        mvrCount: 0,
        hitCount: 0,
        noClaimsCount: 0,
        noViolationsCount: 0
      };

      payload.reports = payload.reports || {
        rows: [],
        summary: U.clone(defaultSummary)
      };

      if (Array.isArray(incomingReports.rows)) {
        payload.reports.rows = U.clone(incomingReports.rows);
      }

      payload.reports.summary = Object.assign(
        {},
        defaultSummary,
        payload.reports.summary || {},
        incomingReports.summary || {}
      );
    },

    mergeMeta(payload, ctx, partial) {
      payload.meta.currentPageType = ctx.pageType || payload.meta.currentPageType;
      payload.meta.coverageSubType = ctx.coverageSubType || payload.meta.coverageSubType;
      const allowedPages = ['customer', 'drivers', 'vehicles', 'coverages', 'reports', 'dwelling'];
      if (allowedPages.includes(ctx.pageType)) {
        U.pushUnique(payload.meta.visitedPages, ctx.pageType + (ctx.coverageSubType ? ':' + ctx.coverageSubType : ''));
      }
      U.pushUnique(payload.meta.sourceUrls, ctx.url);
      U.pushUnique(payload.meta.pageTitles, ctx.title);

      if (partial && partial.meta) {
        ['policyNumber', 'effectiveDate', 'expirationDate', 'routeGuid'].forEach(function (k) {
          if (partial.meta[k]) payload.meta[k] = partial.meta[k];
        });

        if (Array.isArray(partial.meta.products)) {
          partial.meta.products.forEach(function (p) {
            U.pushUnique(payload.meta.products, p);
          });
        }

        if (partial.meta.riskState && !payload.coverages.policy.riskState) {
          payload.coverages.policy.riskState = partial.meta.riskState;
        }
      }
    },

    mergeRaw(payload, partial) {
      if (!partial.raw) return;
      payload.raw = payload.raw || {};

      Object.keys(partial.raw).forEach(function (k) {
        payload.raw[k] = Object.assign({}, payload.raw[k] || {}, partial.raw[k] || {});
      });
    },

    audit(payload, ctx, partial) {
      payload.sourceAudit.push({
        timestamp: U.nowIso(),
        pageType: ctx.pageType,
        coverageSubType: ctx.coverageSubType || '',
        url: ctx.url,
        summary: {
          namedInsureds: partial.namedInsureds ? partial.namedInsureds.length : 0,
          drivers: partial.drivers ? partial.drivers.length : 0,
          vehicles: partial.vehicles ? partial.vehicles.length : 0,
          reportsRows: partial.reports && Array.isArray(partial.reports.rows) ? partial.reports.rows.length : 0,
          hasCoverages: !!partial.coverages
        }
      });
    },

    apply(payload, ctx, partial) {
      Merge.mergeMeta(payload, ctx, partial);

      if (partial.customer) Merge.mergeCustomer(payload, partial.customer);
      if (partial.namedInsureds) Merge.mergeNamedInsureds(payload, partial.namedInsureds);
      if (partial.drivers) Merge.mergeDrivers(payload, partial.drivers);
      if (partial.vehicles) Merge.mergeVehicles(payload, partial.vehicles);
      if (partial.coverages) Merge.mergeCoverages(payload, partial.coverages);
      if (partial.reports) Merge.mergeReports(payload, partial.reports);

      Merge.mergeRaw(payload, partial);
      Merge.audit(payload, ctx, partial);
    }
  };

  // -----------------------------
  // App actions
  // -----------------------------
  const Actions = {
    harvestState: {
      running: false,
      total: 0,
      current: 0,
      harvested: 0,
      skipped: 0
    },

    collectCurrentPage(opts) {
      opts = opts || {};
      const ctx = Detector.detect();
      const payload = Storage.loadPayload();

      let partial = null;
      if (ctx.pageType === 'customer') partial = Extractors.customer(ctx);
      else if (ctx.pageType === 'drivers') partial = Extractors.drivers(ctx);
      else if (ctx.pageType === 'vehicles') partial = Extractors.vehicles(ctx);
      else if (ctx.pageType === 'coverages') partial = Extractors.coverages(ctx);
      else if (ctx.pageType === 'reports') partial = Extractors.reports(ctx);
      else if (ctx.pageType === 'dwelling') partial = Extractors.dwelling(ctx);
      else partial = { meta: { currentPageType: 'unknown' } };

      Merge.apply(payload, ctx, partial);
      Storage.savePayload(payload);
      UI.refresh();
      if (!opts.silent) {
        UI.toast('Collected: ' + ctx.pageType + (ctx.coverageSubType ? ' / ' + ctx.coverageSubType : ''));
      }
      U.debug('Erie Master Extractor partial:', partial);
      U.debug('Erie Master Extractor payload:', payload);
      return payload;
    },

    getVehicleEditControls() {
      const tableVehicleLinks = U.safeQueryAll('table.DataTable.tableStyle a.vehicle-name').filter(function (el) {
        return !!(el && document.contains(el));
      });
      if (tableVehicleLinks.length) return tableVehicleLinks;

      const fallbackCandidates = U.safeQueryAll('a, button, input[type="button"], input[type="submit"]');
      const controls = [];

      fallbackCandidates.forEach(function (el) {
        if (!el) return;
        if (UI.panel && UI.panel.contains(el)) return;
        if (el.disabled) return;

        const text = U.upper(
          el.value ||
          el.textContent ||
          el.innerText ||
          el.getAttribute('title') ||
          ''
        );
        if (text.indexOf('VIEW/EDIT') >= 0 || text.indexOf('VIEW / EDIT') >= 0) {
          controls.push(el);
        }
      });

      return controls;
    },

    async waitForVinChange(previousVin, timeout) {
      timeout = timeout || 5000;
      const start = Date.now();
      const prior = U.cleanString(previousVin || '');

      while (Date.now() - start < timeout) {
        const el = U.safeQuery('#VIN') ||
          U.safeQuery('input[name="VIN"]') ||
          U.safeQuery('#VehicleIdentificationNumber');

        const val = U.cleanString(el && el.value || '');
        if (val && val !== prior) {
          return val;
        }

        await U.delay(150);
      }

      return null;
    },

    mergeHarvestedVin(newVin, vehicleIndex) {
      const vin = U.cleanString(newVin);
      if (!vin || U.looksMasked(vin)) return false;

      const payload = Storage.loadPayload();
      const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
      if (!vehicles.length) return false;

      function maskedTail(masked) {
        const s = U.cleanString(masked || '').replace(/\.\.\./g, '').replace(/[^A-Za-z0-9]/g, '');
        return s ? s.slice(-4).toUpperCase() : '';
      }

      const vinUpper = vin.toUpperCase();
      let target = vehicles.find(function (v) {
        const tail = maskedTail(v.vinMaskedTail);
        return tail && vinUpper.endsWith(tail);
      }) || null;

      if (!target && vehicleIndex >= 0 && vehicleIndex < vehicles.length) {
        target = vehicles[vehicleIndex];
      }

      if (!target) return false;

      const existingVin = U.cleanString(target.vin || '');
      if (!existingVin || U.looksMasked(existingVin)) {
        target.vin = vin;
      } else if (existingVin.toUpperCase() !== vinUpper) {
        return false;
      }

      target.matchKey = U.makeVehicleMatchKey(target);
      Storage.savePayload(payload);
      return true;
    },

    getVinCollectionStats(payload) {
      const p = payload || Storage.loadPayload();
      const vehicles = Array.isArray(p.vehicles) ? p.vehicles : [];

      const collected = vehicles.reduce(function (count, vehicle) {
        const vin = U.cleanString(vehicle && vehicle.vin || '');
        return vin && !U.looksMasked(vin) ? count + 1 : count;
      }, 0);

      return {
        collected: collected,
        total: vehicles.length
      };
    },

    async harvestVins() {
      const state = Actions.harvestState;
      if (state.running) {
        UI.toast('VIN harvest already running');
        return;
      }

      const ctx = Detector.detect();
      if (ctx.pageType !== 'vehicles') {
        UI.toast('VIN harvest only works on Vehicle page');
        return;
      }

      state.running = true;
      state.total = 0;
      state.current = 0;
      state.harvested = 0;
      state.skipped = 0;
      UI.refresh();

      try {
        const vehicleLinks = Actions.getVehicleEditControls();
        if (!vehicleLinks.length) {
          UI.toast('No vehicle edit controls found');
          return;
        }

        state.total = vehicleLinks.length;
        UI.refresh();

        for (let i = 0; i < vehicleLinks.length; i++) {
          state.current = i + 1;
          UI.refresh();

          const currentLinks = Actions.getVehicleEditControls();
          const link = currentLinks[i] || vehicleLinks[i];
          if (!link || !document.contains(link)) {
            state.skipped++;
            UI.toast('VIN ' + (i + 1) + '/' + state.total + ' skipped');
            UI.refresh();
            continue;
          }

          const vinInput = U.safeQuery('#VIN') ||
            U.safeQuery('input[name="VIN"]') ||
            U.safeQuery('#VehicleIdentificationNumber');
          const previousVin = U.cleanString(vinInput && vinInput.value || '');

          try {
            link.click();
          } catch (e) {
            state.skipped++;
            U.debug('VIN harvest click failed:', e);
            UI.toast('VIN ' + (i + 1) + '/' + state.total + ' skipped');
            UI.refresh();
            continue;
          }

          await U.waitFor(function () {
            return U.safeQuery('#VehicleType') || U.safeQuery('select[name="VehicleType"]');
          }, 4000, 175);

          const newVin = await Actions.waitForVinChange(previousVin, 5000);
          if (!newVin) {
            state.skipped++;
            U.debug('VIN harvest skipped; VIN did not change for vehicle index', i);
            UI.toast('VIN ' + (i + 1) + '/' + state.total + ' skipped');
            UI.refresh();
            await U.delay(250);
            continue;
          }

          const merged = Actions.mergeHarvestedVin(newVin, i);
          if (merged) {
            state.harvested++;
            UI.toast('VIN ' + (i + 1) + '/' + state.total + ' captured');
          } else {
            state.skipped++;
            UI.toast('VIN ' + (i + 1) + '/' + state.total + ' skipped');
          }

          UI.refresh();
          await U.delay(350);
        }

        UI.toast('VIN harvest complete');
      } catch (e) {
        console.error('Erie Master Extractor VIN harvest failed:', e);
        UI.toast('VIN harvest failed');
      } finally {
        state.running = false;
        state.current = 0;
        state.total = 0;
        UI.refresh();
      }
    },

    copyPayload() {
      const payload = Storage.loadPayload();
      const text = JSON.stringify(payload, null, 2);
      U.copyText(text).then(function () {
        UI.toast('Master JSON copied');
      }).catch(function () {
        UI.toast('Copy failed');
      });
    },

    downloadPayload() {
      const payload = Storage.loadPayload();
      const filename = 'erie-master-payload-' + U.pageStamp() + '.json';
      U.downloadText(filename, JSON.stringify(payload, null, 2));
      UI.toast('Downloaded ' + filename);
    },

    resetPayload() {
      if (!confirm('Reset Erie master payload?')) return;
      Storage.resetPayload();
      UI.refresh();
      UI.toast('Payload reset');
    },

    showSummary() {
      const p = Storage.loadPayload();
      alert([
        'Erie Master Extractor',
        'Version: ' + APP.version,
        'Visited pages: ' + (p.meta.visitedPages || []).join(', '),
        'Named insureds: ' + (p.namedInsureds || []).length,
        'Drivers: ' + (p.drivers || []).length,
        'Vehicles: ' + (p.vehicles || []).length,
        'Policy coverages: ' + (p.coverages && p.coverages.policy && p.coverages.policy.policyCoverages || []).length,
        'Vehicle coverage groups: ' + (p.coverages && p.coverages.vehicleCoverages || []).length
      ].join('\n'));
    }
  };

  // -----------------------------
  // UI
  // -----------------------------
  const UI = {
    panel: null,
    status: null,

    init() {
      GM_addStyle(`
        #erie-master-extractor-panel{
          position:fixed;
          right:14px;
          bottom:14px;
          z-index:2147483647;
          width:260px;
          background:#0e1a2a;
          color:#fff;
          border:1px solid rgba(255,255,255,.16);
          border-radius:12px;
          box-shadow:0 12px 30px rgba(0,0,0,.35);
          font:12px/1.35 system-ui,Segoe UI,Arial,sans-serif;
          overflow:hidden;
        }
        #erie-master-extractor-panel .eme-head{
          position:relative;
          padding:10px 12px;
          background:#007EF5;
          font-weight:700;
        }
        #erie-master-extractor-panel .eme-close{
          position:absolute;
          top:6px;
          right:8px;
          width:20px;
          height:20px;
          line-height:18px;
          border:1px solid rgba(255,255,255,.35);
          border-radius:6px;
          background:transparent;
          color:#eaf2ff;
          font-size:14px;
          font-weight:700;
          padding:0;
          cursor:pointer;
          opacity:.85;
        }
        #erie-master-extractor-panel .eme-close:hover{
          opacity:1;
          background:rgba(255,255,255,.14);
        }
        #erie-master-extractor-panel .eme-sub{
          opacity:.8;
          font-size:11px;
          font-weight:400;
          margin-top:2px;
          color:#dbe8ff;
        }
        #erie-master-extractor-panel .eme-body{
          padding:10px 12px;
          color:#f3f7ff;
        }
        #erie-master-extractor-panel label,
        #erie-master-extractor-panel span,
        #erie-master-extractor-panel .eme-status,
        #erie-master-extractor-panel .eme-row{
          color:#f3f7ff;
        }
        #erie-master-extractor-panel .eme-row{
          display:flex;
          gap:6px;
          margin-bottom:6px;
        }
        #erie-master-extractor-panel button{
          flex:1;
          border:0;
          border-radius:8px;
          padding:7px 8px;
          cursor:pointer;
          font-size:12px;
        }
        #erie-master-extractor-panel .eme-primary{ background:#2c7be5; color:#fff; }
        #erie-master-extractor-panel .eme-secondary{ background:#e9eef5; color:#111; }
        #erie-master-extractor-panel .eme-success{ background:#1f9d55; color:#fff; }
        #erie-master-extractor-panel .eme-danger{ background:#b83232; color:#fff; }
        #erie-master-extractor-panel .eme-status{
          margin-top:8px;
          background:rgba(255,255,255,.08);
          border-radius:8px;
          padding:8px;
          white-space:pre-line;
          color:#ffffff;
        }
        #erie-master-extractor-panel input[type="checkbox"]{
          accent-color:#ffffff;
        }
        #erie-master-extractor-toast{
          position:fixed;
          top:16px;
          left:50%;
          transform:translateX(-50%);
          z-index:2147483647;
          background:#111;
          color:#fff;
          padding:8px 12px;
          border-radius:8px;
          box-shadow:0 6px 18px rgba(0,0,0,.35);
          font:12px/1.35 system-ui,Segoe UI,Arial,sans-serif;
        }
      `);

      const panel = document.createElement('div');
      panel.id = 'erie-master-extractor-panel';
      panel.innerHTML = `
        <div class="eme-head">
          <button id="eme-close" class="eme-close" title="Turn off Erie extractor" aria-label="Turn off Erie extractor" type="button">&times;</button>
          Erie Master Extractor
          <div class="eme-sub">v${APP.version}</div>
        </div>
        <div class="eme-body">
          <div class="eme-row">
            <button id="eme-collect" class="eme-primary">Collect</button>
            <button id="eme-harvest" class="eme-secondary">Harvest VINs</button>
          </div>
          <div class="eme-row">
            <button id="eme-copy" class="eme-secondary">Copy JSON</button>
            <button id="eme-download" class="eme-secondary">Download</button>
          </div>
          <div class="eme-row">
            <button id="eme-summary" class="eme-secondary">Summary</button>
            <button id="eme-reset" class="eme-danger">Reset</button>
          </div>
          <div class="eme-row" style="align-items:center;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
              <input type="checkbox" id="eme-autoCollect">
              <span>Auto collect</span>
            </label>
          </div>
          <div id="eme-status" class="eme-status"></div>
        </div>
      `;

      document.body.appendChild(panel);
      UI.panel = panel;
      UI.status = panel.querySelector('#eme-status');

      panel.querySelector('#eme-collect').addEventListener('click', Actions.collectCurrentPage);
      panel.querySelector('#eme-harvest').addEventListener('click', Actions.harvestVins);
      panel.querySelector('#eme-copy').addEventListener('click', Actions.copyPayload);
      panel.querySelector('#eme-download').addEventListener('click', Actions.downloadPayload);
      panel.querySelector('#eme-summary').addEventListener('click', Actions.showSummary);
      panel.querySelector('#eme-reset').addEventListener('click', Actions.resetPayload);
      panel.querySelector('#eme-close').addEventListener('click', disableExtractorFromUiClose);

      const settings = Storage.loadSettings();
      const autoBox = panel.querySelector('#eme-autoCollect');
      autoBox.checked = !!settings.autoCollect;
      autoBox.addEventListener('change', function () {
        const next = Storage.loadSettings();
        next.autoCollect = !!autoBox.checked;
        Storage.saveSettings(next);
        UI.refresh();
      });

      UI.refresh();
    },

    refresh() {
      if (!UI.status) return;
      const ctx = Detector.detect();
      const p = Storage.loadPayload();
      const settings = Storage.loadSettings();
      const hs = Actions.harvestState || {};
      const vinStats = Actions.getVinCollectionStats(p);
      const needsHarvest = vinStats.total > vinStats.collected;
      const harvestLine = hs.running
        ? ('VIN harvest: Running ' + (hs.current || 0) + '/' + (hs.total || 0) + ' (ok ' + (hs.harvested || 0) + ', skip ' + (hs.skipped || 0) + ')')
        : ('VINs collected: ' + vinStats.collected + '/' + vinStats.total);

      const harvestBtn = UI.panel && UI.panel.querySelector('#eme-harvest');
      if (harvestBtn) {
        harvestBtn.classList.remove('eme-secondary', 'eme-success');
        harvestBtn.classList.add(needsHarvest ? 'eme-success' : 'eme-secondary');
        harvestBtn.textContent = needsHarvest ? 'Harvest VINs' : 'Harvest VINs \u2713';
      }

      UI.status.textContent = [
        'Page: ' + ctx.pageType + (ctx.coverageSubType ? ' / ' + ctx.coverageSubType : ''),
        'Named insureds: ' + (p.namedInsureds || []).length,
        'Drivers: ' + (p.drivers || []).length,
        'Vehicles: ' + (p.vehicles || []).length,
        'Policy coverages: ' + (p.coverages && p.coverages.policy && p.coverages.policy.policyCoverages || []).length,
        'Vehicle coverages: ' + (p.coverages && p.coverages.vehicleCoverages || []).length,
        harvestLine,
        'Auto collect: ' + (settings.autoCollect ? 'On' : 'Off')
      ].join('\n');
    },

    toast(msg) {
      const old = document.getElementById('erie-master-extractor-toast');
      if (old) old.remove();

      const el = document.createElement('div');
      el.id = 'erie-master-extractor-toast';
      el.textContent = msg;
      document.body.appendChild(el);

      setTimeout(function () {
        el.remove();
      }, 1800);
    }
  };

  // -----------------------------
  // UI lifecycle gate
  // -----------------------------
  function disableExtractorFromUiClose() {
    try {
      localStorage.setItem(PREF_ERIE_EXTRACTOR_ENABLED_KEY, 'false');
    } catch (e) {}

    const detail = {
      source: 'erie-extractor-ui-close',
      enabled: false,
      storageKey: PREF_ERIE_EXTRACTOR_ENABLED_KEY
    };
    try { document.dispatchEvent(new CustomEvent('mci:erie-extractor-toggle', { detail: detail })); } catch (e2) {}
    try { window.dispatchEvent(new CustomEvent('mci:erie-extractor-toggle', { detail: detail })); } catch (e3) {}

    applyExtractorEnabledState();
  }

  function isExtractorEnabled() {
    try {
      const raw = localStorage.getItem(PREF_ERIE_EXTRACTOR_ENABLED_KEY);
      if (raw == null) return true;
      return raw === 'true';
    } catch (e) {
      return true;
    }
  }

  function mountExtractorUI() {
    const existing = document.getElementById('erie-master-extractor-panel');
    if (existing && UI.panel === existing) return;
    if (existing) existing.remove();

    UI.panel = null;
    UI.status = null;
    UI.init();
  }

  function unmountExtractorUI() {
    const panel = document.getElementById('erie-master-extractor-panel');
    if (panel) panel.remove();

    const toast = document.getElementById('erie-master-extractor-toast');
    if (toast) toast.remove();

    UI.panel = null;
    UI.status = null;
  }

  function applyExtractorEnabledState() {
    if (isExtractorEnabled()) {
      mountExtractorUI();
      return true;
    }
    unmountExtractorUI();
    return false;
  }

  function wireExtractorEnabledStateListeners() {
    window.addEventListener('storage', function (event) {
      if (!event || event.key !== PREF_ERIE_EXTRACTOR_ENABLED_KEY) return;
      applyExtractorEnabledState();
    });

    function onExtractorToggleEvent() {
      applyExtractorEnabledState();
    }

    document.addEventListener('mci:erie-extractor-toggle', onExtractorToggleEvent);
    window.addEventListener('mci:erie-extractor-toggle', onExtractorToggleEvent);
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    wireExtractorEnabledStateListeners();
    if (!applyExtractorEnabledState()) return;

    try {
      Storage.syncSharedPayload(Storage.loadPayload(), 'boot', 0);
    } catch (e) {
      U.debug('Erie Master Extractor boot shared sync failed:', e);
    }

    const settings = Storage.loadSettings();
    if (settings.autoCollect) {
      try {
        Actions.collectCurrentPage();
      } catch (e) {
        console.error('Erie Master Extractor auto-collect failed:', e);
        UI.toast('Auto collect failed');
      }
    }
  }

  boot();
})();
