// ==UserScript==
// @name         ERIE_TO_NATGEN_HOME_Quote_Filler
// @namespace    https://middlecreekinsurance.com/
// @version      1.0.1
// @description  Erie shared-payload filler for NatGen Homeowners. Fills only the current page; never clicks Search, Next, Save, Done, or Add.
// @match        https://ho.natgenagency.com/ContentPages/*
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_NATGEN_HOME_Quote_Filler.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_NATGEN_HOME_Quote_Filler.user.js
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.0.1';
  const PREFIX = '[MCI NatGen Home]';
  const ROOT = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  /* =========================================================
     SHARED PAYLOAD
     ========================================================= */

  function getSharedPayload() {
    try {
      if (ROOT && typeof ROOT.getMciSharedPayload === 'function') {
        const shared = ROOT.getMciSharedPayload();
        if (shared && typeof shared === 'object') return shared;
        if (typeof shared === 'string' && shared.trim()) return JSON.parse(shared);
      }
    } catch (e) {
      console.warn(PREFIX, 'getMciSharedPayload failed', e);
    }

    try {
      const raw = localStorage.getItem('mciMasterPayload');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn(PREFIX, 'mciMasterPayload read failed', e);
      return null;
    }
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

  function moneyNumber(v) {
    const n = Number(clean(v).replace(/[$,%\s,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function safeGet(obj, path, fallback) {
    if (!obj || !path) return fallback;
    let cur = obj;
    for (const key of String(path).split('.')) {
      if (cur == null || !Object.prototype.hasOwnProperty.call(cur, key)) return fallback;
      cur = cur[key];
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
    const arr = Array.isArray(payload && payload.namedInsureds) ? payload.namedInsureds : [];
    return arr[0] || {};
  }

  function customer(payload) {
    return payload && payload.customer || {};
  }

  function dwelling(payload) {
    return payload && payload.dwelling || {};
  }

  function boolLike(v) {
    if (v === true) return true;
    if (v === false) return false;
    const s = lower(v);
    if (!s) return null;
    if (['yes', 'y', 'true', '1', 'on', 'included'].includes(s)) return true;
    if (['no', 'n', 'false', '0', 'off', 'none', 'not included'].includes(s)) return false;
    if (/\byes\b/.test(s)) return true;
    if (/\bno\b/.test(s)) return false;
    return null;
  }

  /* =========================================================
     DOM HELPERS
     ========================================================= */

  function byId(id) {
    return document.getElementById(id);
  }

  function fire(el, type) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    } catch (_) {}
  }

  // IMPORTANT:
  // We intentionally do not fire "change" on controls that have inline
  // WebForms postback handlers. This avoids automatically navigating/reloading.
  function commitControl(el, allowChange) {
    if (!el) return;
    fire(el, 'input');
    if (allowChange !== false && !/doPostBack|WebForm_DoPostBack/i.test(el.getAttribute('onchange') || '')) {
      fire(el, 'change');
    }
    fire(el, 'blur');
  }

  function setInput(idOrEl, value, opts) {
    const el = typeof idOrEl === 'string' ? byId(idOrEl) : idOrEl;
    const v = clean(value);
    if (!el || !v || el.disabled || el.readOnly) return false;
    if (el.value === v) return false;
    el.value = v;
    commitControl(el, !(opts && opts.noChange));
    return true;
  }

  function selectOption(idOrEl, wanted, opts) {
    const el = typeof idOrEl === 'string' ? byId(idOrEl) : idOrEl;
    const raw = clean(wanted);
    if (!el || !raw || el.disabled || !el.options) return false;

    const normalized = lower(raw);
    const options = Array.from(el.options);
    let hit = options.find(o => clean(o.value) === raw);
    if (!hit) hit = options.find(o => lower(o.value) === normalized);
    if (!hit) hit = options.find(o => lower(o.textContent) === normalized);

    if (!hit && opts && opts.contains) {
      hit = options.find(o => lower(o.textContent).includes(normalized));
    }

    if (!hit && (normalized === 'true' || normalized === 'false' || normalized === 'yes' || normalized === 'no')) {
      const wantYes = ['true', 'yes'].includes(normalized);
      hit = options.find(o => {
        const t = lower(o.textContent);
        const v = lower(o.value);
        return wantYes
          ? ['yes', 'true', '1'].includes(t) || ['yes', 'true', '1'].includes(v)
          : ['no', 'false', '0'].includes(t) || ['no', 'false', '0'].includes(v);
      });
    }

    if (!hit || el.value === hit.value) return false;
    el.value = hit.value;
    commitControl(el, !(opts && opts.noChange));
    return true;
  }

  function chooseClosestPercent(selectEl, pct) {
    if (!selectEl || !Number.isFinite(pct)) return false;
    const options = Array.from(selectEl.options || []);
    const candidates = options.map(o => {
      const m = clean(o.textContent).match(/^(\d+(?:\.\d+)?)%$/);
      return m ? { option: o, pct: Number(m[1]) } : null;
    }).filter(Boolean);

    if (!candidates.length) return false;
    const exact = candidates.find(c => Math.abs(c.pct - pct) < 0.01);
    if (!exact) return false; // conservative: do not round to a different coverage percentage
    if (selectEl.value === exact.option.value) return false;
    selectEl.value = exact.option.value;
    commitControl(selectEl, false);
    return true;
  }

  function findLabel(text) {
    const target = lower(text);
    return Array.from(document.querySelectorAll('label')).find(l => lower(l.textContent).includes(target)) || null;
  }

  function fieldForLabel(text) {
    const label = findLabel(text);
    if (!label) return null;
    const forId = label.getAttribute('for');
    if (forId && byId(forId)) return byId(forId);
    const li = label.closest('li, tr, div');
    return li ? li.querySelector('input:not([type="hidden"]), select, textarea') : null;
  }

  function rowContaining(text) {
    const target = lower(text);
    const rows = Array.from(document.querySelectorAll('tr, li'));
    return rows.find(r => lower(r.textContent).includes(target)) || null;
  }

  function visibleControls(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll('input:not([type="hidden"]), select, textarea'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  }

  function setByLabel(labelText, value, opts) {
    const el = fieldForLabel(labelText);
    if (!el) return false;
    return el.tagName === 'SELECT'
      ? selectOption(el, value, opts)
      : setInput(el, value, opts);
  }

  function setSelectByRow(rowText, value, opts) {
    const row = rowContaining(rowText);
    if (!row) return false;
    const el = visibleControls(row).find(x => x.tagName === 'SELECT');
    return el ? selectOption(el, value, opts) : false;
  }

  function setInputByRow(rowText, value) {
    const row = rowContaining(rowText);
    if (!row) return false;
    const el = visibleControls(row).find(x => x.tagName === 'INPUT' && /^(text|number)?$/i.test(x.type || 'text'));
    return el ? setInput(el, value) : false;
  }

  function toast(msg, ms) {
    const old = byId('mci-ng-home-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'mci-ng-home-toast';
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', zIndex: '2147483647', top: '18px', left: '50%',
      transform: 'translateX(-50%)', background: '#111827', color: '#fff',
      padding: '8px 12px', borderRadius: '8px', boxShadow: '0 4px 18px rgba(0,0,0,.35)',
      font: '12px/1.35 system-ui,Segoe UI,Arial,sans-serif'
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms || 2200);
  }

  function resultCounter() {
    return {
      changed: 0,
      skipped: 0,
      add(ok) { ok ? this.changed++ : this.skipped++; }
    };
  }

  /* =========================================================
     SOURCE NORMALIZATION
     ========================================================= */

  function bestPerson(payload) {
    const c = customer(payload);
    const n = firstNamed(payload);
    return {
      first: firstValue({ c, n }, ['c.firstName', 'n.firstName']),
      middle: firstValue({ c, n }, ['c.middleName', 'n.middleName']),
      last: firstValue({ c, n }, ['c.lastName', 'n.lastName']),
      suffix: firstValue({ c, n }, ['c.suffix', 'n.suffix']),
      dob: firstValue({ c, n }, ['c.dob', 'n.dob', 'c.dateOfBirth', 'n.dateOfBirth']),
      gender: firstValue({ c, n }, ['c.gender', 'n.gender']),
      marital: firstValue({ c, n }, ['c.maritalStatus', 'n.maritalStatus']),
      occupation: firstValue({ c, n }, ['c.occupation', 'n.occupation'])
    };
  }

  function bestPhone(payload) {
    const c = customer(payload);
    const n = firstNamed(payload);
    const candidates = [
      ['Mobile', firstValue({ c, n }, ['c.phone.mobile', 'n.phone.mobile'])],
      ['Home', firstValue({ c, n }, ['c.phone.home', 'n.phone.home'])],
      ['Work', firstValue({ c, n }, ['c.phone.work', 'n.phone.work'])]
    ];
    for (const [type, value] of candidates) if (digits(value)) return { type, value };
    return { type: '', value: '' };
  }

  function bestEmail(payload) {
    const c = customer(payload);
    const n = firstNamed(payload);
    return firstValue({ c, n }, ['c.email', 'n.email']);
  }

  function bestResidence(payload) {
    const c = customer(payload);
    const d = dwelling(payload);
    const candidates = [
      safeGet(d, 'address', {}),
      safeGet(c, 'residenceAddress', {}),
      safeGet(c, 'mailingAddress', {})
    ];
    const a = candidates.find(x => x && typeof x === 'object' && (
      clean(x.line1) || clean(x.full) || clean(x.city) || clean(x.zip)
    )) || {};
    return a;
  }

  function policyCoverages(payload) {
    const arr = safeGet(payload, 'coverages.policy.policyCoverages', []);
    return Array.isArray(arr) ? arr : [];
  }

  function findPolicyCoverage(payload, patterns) {
    const pats = Array.isArray(patterns) ? patterns : [patterns];
    return policyCoverages(payload).find(c => {
      const hay = lower([
        c.coverageCode, c.coverageDescription, c.description, c.name, c.label
      ].filter(Boolean).join(' '));
      return pats.some(p => p instanceof RegExp ? p.test(hay) : hay.includes(lower(p)));
    }) || null;
  }

  function coverageLimit(cov) {
    if (!cov) return '';
    return firstValue(cov, ['coverageLimit', 'limit', 'value', 'amount', 'selectedValue']);
  }

  /* =========================================================
     CLIENT SEARCH / CLIENT INFORMATION
     ========================================================= */

  function fillClientPage(payload) {
    const path = lower(location.pathname);
    const r = resultCounter();
    const p = bestPerson(payload);
    const addr = bestResidence(payload);

    if (path.includes('/contentpages/clientsearch')) {
      r.add(setInput('MainContent_txtFirstName', p.first));
      r.add(setInput('MainContent_txtLastName', p.last));
      r.add(setInput('MainContent_txtZipCode', firstValue(addr, ['zip', 'postalCode'])));
      return r;
    }

    if (!path.includes('/contentpages/clientinfo')) return r;

    r.add(setInput('MainContent_ucNamedInsured_txtFirstName', p.first));
    r.add(setInput('MainContent_ucNamedInsured_txtMiddleName', p.middle));
    r.add(setInput('MainContent_ucNamedInsured_txtLastName', p.last));
    r.add(selectOption('MainContent_ucNamedInsured_ddlSuffix', p.suffix));
    r.add(setInput('MainContent_ucNamedInsured_txtDateOfBirth', p.dob));
    r.add(selectOption('MainContent_ucNamedInsured_ddlGender', p.gender, { contains: true }));
    r.add(selectOption('MainContent_ucNamedInsured_ddlMaritalStatus', p.marital, { contains: true }));
    r.add(selectOption('MainContent_ucNamedInsured_ddlOccupation', p.occupation, { contains: true }));

    const ph = bestPhone(payload);
    if (ph.value) {
      const d = digits(ph.value).slice(-10);
      r.add(selectOption('MainContent_ucContactInfo_ucPhoneNumber_ddlPhoneType', ph.type, { contains: true }));
      if (d.length === 10) {
        r.add(setInput('MainContent_ucContactInfo_ucPhoneNumber_txtAreaCode', d.slice(0, 3)));
        r.add(setInput('MainContent_ucContactInfo_ucPhoneNumber_txtPrefix', d.slice(3, 6)));
        r.add(setInput('MainContent_ucContactInfo_ucPhoneNumber_txtLineNumber', d.slice(6)));
      }
    }

    const email = bestEmail(payload);
    if (email) {
      r.add(setInput('MainContent_ucContactInfo_ucEmailAddress_txtEmailAddress', email));
      r.add(setInput('MainContent_ucContactInfo_ucEmailAddress_txtEmailAddressConfirmation', email));
    }

    r.add(setInput('MainContent_ucResidentialAddress_txtAddress', firstValue(addr, ['line1', 'address1', 'street'])));
    r.add(setInput('MainContent_ucResidentialAddress_txtAddress2', firstValue(addr, ['line2', 'address2'])));
    r.add(setInput('MainContent_ucResidentialAddress_txtCity', firstValue(addr, ['city'])));
    r.add(selectOption('MainContent_ucResidentialAddress_ddlState', firstValue(addr, ['state', 'stateCode'])));
    const zip = digits(firstValue(addr, ['zip', 'postalCode']));
    if (zip) {
      r.add(setInput('MainContent_ucResidentialAddress_txtZipCode', zip.slice(0, 5)));
      if (zip.length > 5) r.add(setInput('MainContent_ucResidentialAddress_txtZip4', zip.slice(5, 9)));
    }

    // Intentionally NOT filled:
    // consent, transactional email opt-in, residence < 3 years, prior address,
    // mailing-address toggle, deed-correction toggle, producer/agent/plan.
    return r;
  }

  /* =========================================================
     PROPERTY INFORMATION
     ========================================================= */

  function mapPolicyForm(v) {
    const s = lower(v);
    if (!s) return '';
    if (/\bho[\s-]?3\b|homeowners.*3/.test(s)) return 'HO3';
    if (/\bho[\s-]?4\b|renters?/.test(s)) return 'HO4';
    if (/\bho[\s-]?5\b|homeowners.*5/.test(s)) return 'HO5';
    if (/\bho[\s-]?6\b|condo/.test(s)) return 'HO6';
    return '';
  }

  function mapFamilies(v) {
    const s = lower(v);
    if (!s) return '';
    if (/single|one|^1$/.test(s)) return '1';
    if (/duplex|two|^2$/.test(s)) return '2';
    if (/triplex|three|^3$/.test(s)) return '3';
    if (/quad|four|^4$/.test(s)) return '4';
    return '';
  }

  function mapConstruction(v) {
    const s = lower(v);
    if (!s) return '';
    if (s.includes('masonry veneer')) return 'MasonryVeneer';
    if (s.includes('mixed') && s.includes('masonry')) return 'MixedMasonryFra';
    if (s.includes('synthetic') || s.includes('eifs')) return 'SyntheticStucco';
    if (s.includes('superior')) return 'SuperiorConst';
    if (s.includes('split log')) return 'Log Home - Split Log';
    if (s.includes('whole log')) return 'Log Home - Whole Log';
    if (s.includes('masonry')) return 'Masonry';
    if (s.includes('frame')) return 'Frame';
    if (s.includes('foam')) return 'Foam';
    return clean(v);
  }

  function fillPropertyPage(payload) {
    const r = resultCounter();
    if (!lower(location.pathname).includes('/contentpages/propertyinfo')) return r;

    const d = dwelling(payload);
    const s = d.structure || {};
    const form = mapPolicyForm(d.policyType);

    if (form) r.add(selectOption('MainContent_ddlForm', form, { noChange: true }));
    r.add(setInput('MainContent_txtYearBuilt', s.yearBuilt));
    r.add(selectOption('MainContent_ddlNumberOfFamilies', mapFamilies(s.numberOfFamilies)));
    r.add(selectOption('MainContent_ddlConstruction', mapConstruction(s.constructionType), { contains: true }));
    r.add(selectOption('MainContent_ddlProtectionClass', s.protectionClass, { contains: true }));

    const residenceClass = firstValue(d, ['residenceClass', 'occupancy.residenceClass', 'options.residenceClass']);
    const occupancy = firstValue(d, ['occupancyType', 'occupancy.type', 'options.occupancy']);
    if (residenceClass) r.add(selectOption('MainContent_ddlResidenceClass', residenceClass, { contains: true }));
    if (occupancy) r.add(selectOption('MainContent_ddlOccupancy2', occupancy, { contains: true }));

    const structureType = firstValue(d, ['structure.structureType', 'structure.dwellingStyle']);
    if (structureType) {
      const target = byId('MainContent_ddlStructure') || fieldForLabel('Structure');
      if (target && target.tagName === 'SELECT') r.add(selectOption(target, structureType, { contains: true }));
    }

    // County may be an input or select depending on state/product.
    const county = firstValue(d, ['address.county']);
    if (county) {
      const countyEl = fieldForLabel('County');
      if (countyEl) r.add(countyEl.tagName === 'SELECT'
        ? selectOption(countyEl, county, { contains: true })
        : setInput(countyEl, county));
    }

    return r;
  }

  /* =========================================================
     REPLACEMENT COST
     ========================================================= */

  function fillRcePage(payload) {
    const r = resultCounter();
    if (!lower(location.pathname).includes('/contentpages/replacementcostestimator')) return r;

    const d = dwelling(payload);
    const s = d.structure || {};
    const roof = d.roof || {};

    r.add(setByLabel('Square Footage', s.squareFeet));

    const stories = firstValue(d, [
      'structure.numberOfStories', 'structure.stories', 'structure.storyCount',
      'raw.numberOfStories'
    ]);
    if (stories) r.add(setByLabel('Number of Stories', stories, { contains: true }));

    // Only use dwellingStyle when NatGen offers an exact/containing style match.
    if (s.dwellingStyle) r.add(setByLabel('Style', s.dwellingStyle, { contains: true }));

    const foundation = firstValue(d, [
      'structure.foundationType', 'structure.foundation', 'raw.foundationType'
    ]);
    if (foundation) r.add(setByLabel('Foundation Type 1', foundation, { contains: true }));

    const exterior = firstValue(d, [
      'structure.exteriorWall', 'structure.exteriorWallFinish', 'raw.exteriorWall'
    ]);
    if (exterior) r.add(setByLabel('Exterior Wall Finish 1', exterior, { contains: true }));

    if (roof.material) {
      const roofCover = fieldForLabel('Roof Cover') || fieldForLabel('Roof Covering');
      if (roofCover) r.add(roofCover.tagName === 'SELECT'
        ? selectOption(roofCover, roof.material, { contains: true })
        : setInput(roofCover, roof.material));
    }

    // NatGen/CoreLogic public-data values are intentionally left in place
    // if Erie does not explicitly give us a matching source value.
    return r;
  }

  /* =========================================================
     COVERAGES
     ========================================================= */

  function coverageAmount(d, key) {
    return moneyNumber(safeGet(d, 'coverages.' + key, ''));
  }

  function fillCoveragePage(payload) {
    const r = resultCounter();
    if (!lower(location.pathname).includes('/contentpages/coverageinfod')) return r;

    const d = dwelling(payload);
    const a = coverageAmount(d, 'dwellingAmount');
    const b = coverageAmount(d, 'otherStructuresAmount');
    const c = coverageAmount(d, 'personalPropertyAmount');
    const lossUse = coverageAmount(d, 'lossOfUseAmount');

    if (a != null) r.add(setInputByRow('Coverage A - Dwelling Protection', String(Math.round(a))));

    if (a && b != null) {
      const row = rowContaining('Coverage B - Other Structures Protection (%)');
      const sel = row && visibleControls(row).find(x => x.tagName === 'SELECT');
      r.add(!!sel && chooseClosestPercent(sel, (b / a) * 100));
    }

    if (a && c != null) {
      const row = rowContaining('Coverage C - Personal Property Protection (%)');
      const sel = row && visibleControls(row).find(x => x.tagName === 'SELECT');
      r.add(!!sel && chooseClosestPercent(sel, (c / a) * 100));
    }

    if (a && lossUse != null) {
      const row = rowContaining('Coverage D - Loss of Use (%)');
      const sel = row && visibleControls(row).find(x => x.tagName === 'SELECT');
      r.add(!!sel && chooseClosestPercent(sel, (lossUse / a) * 100));
    }

    const liab = findPolicyCoverage(payload, [/personal liability/, /coverage e\b/, /\bliability\b/]);
    const med = findPolicyCoverage(payload, [/medical payments to others/, /coverage f\b/, /medical payments/]);
    const allPerils = findPolicyCoverage(payload, [/all perils.*deduct/, /policy.*deduct/, /deductible.*all perils/]);
    const wind = findPolicyCoverage(payload, [/wind.*hail.*deduct/, /windstorm.*hail.*deduct/, /wind.*deduct/]);

    if (liab) r.add(setSelectByRow('Coverage E- Personal Liability', coverageLimit(liab), { contains: true }));
    if (med) r.add(setSelectByRow('Coverage F- Medical Payments to Others', coverageLimit(med), { contains: true }));
    if (allPerils) r.add(setSelectByRow('All Perils Deductible', coverageLimit(allPerils), { contains: true }));
    if (wind) r.add(setSelectByRow('Windstorm or Hail Deductible', coverageLimit(wind), { contains: true }));

    const ppLoss = lower(safeGet(d, 'coverages.personalPropertyLossSettlement', ''));
    if (ppLoss) {
      const yes = ppLoss.includes('replacement');
      const row = rowContaining('Personal Property Replacement Cost');
      const sel = row && visibleControls(row).find(x => x.tagName === 'SELECT');
      if (sel) r.add(selectOption(sel, yes ? 'Yes' : 'No'));
    }

    const acv = boolLike(safeGet(d, 'options.acvWindHailRoofSurfacing', ''));
    if (acv !== null) {
      const row = rowContaining('ACV Loss Settlement Windstorm or Hail Losses to Roof Surfacing');
      const sel = row && visibleControls(row).find(x => x.tagName === 'SELECT');
      if (sel) r.add(selectOption(sel, acv ? 'Yes' : 'No'));
    }

    return r;
  }

  /* =========================================================
     HOME UNDERWRITING
     ========================================================= */

  function fillUnderwritingPage(payload) {
    const r = resultCounter();
    if (!lower(location.pathname).includes('/contentpages/underwriting')) return r;

    const c = customer(payload);
    const d = dwelling(payload);

    const priorCarrier = firstValue(c, [
      'currentInsurance.carrier',
      'currentInsurance.company',
      'priorInsurance.carrier',
      'priorInsurance.company'
    ]);
    const priorExpiration = firstValue(c, [
      'currentInsurance.expirationDate',
      'currentInsurance.expiration',
      'priorInsurance.expirationDate',
      'priorInsurance.expiration'
    ]);
    const yearsContinuous = firstValue(c, [
      'currentInsurance.yearsContinuousPropertyInsurance',
      'currentInsurance.yearsContinuous',
      'priorInsurance.yearsContinuous',
      'yearsContinuousPropertyInsurance'
    ]);

    if (priorCarrier) {
      r.add(selectOption('MainContent_ucPriorPolicyInformation_ddlPriorInsuranceCompany', priorCarrier, { contains: true }));
    }
    if (priorExpiration) {
      r.add(setInput('MainContent_ucPriorPolicyInformation_txtExpirationDate', priorExpiration));
      r.add(setInput('MainContent_ucPriorPolicyInformation_txtPriorPolicyExpiration', priorExpiration));
    }
    if (yearsContinuous) {
      r.add(setInput('MainContent_ucPriorPolicyInformation_txtContinuousInsurance', yearsContinuous));
    }

    const pool = boolLike(firstValue(d, ['options.swimmingPool', 'swimmingPool']));
    if (pool !== null) {
      const field = fieldForLabel('Is there a swimming pool on the premises?');
      if (field && field.tagName === 'SELECT') {
        r.add(selectOption(field, pool ? 'Yes' : 'No', { contains: true }));
      }
    }

    if (Array.isArray(payload.vehicles) && payload.vehicles.length) {
      const field = fieldForLabel('Number of Vehicles');
      if (field) r.add(field.tagName === 'SELECT'
        ? selectOption(field, String(payload.vehicles.length), { contains: true })
        : setInput(field, String(payload.vehicles.length)));
    }

    // Intentionally left to NatGen/Kate unless explicitly sourced:
    // site access, flood zone, trampoline, debris, existing NatGen Auto,
    // Go Paperless, Roof Score/aerial data.
    return r;
  }

  /* =========================================================
     PAGE ROUTING
     ========================================================= */

  function currentPageKind() {
    const p = lower(location.pathname);
    if (p.includes('/contentpages/clientsearch') || p.includes('/contentpages/clientinfo')) return 'client';
    if (p.includes('/contentpages/propertyinfo')) return 'property';
    if (p.includes('/contentpages/replacementcostestimator')) return 'rce';
    if (p.includes('/contentpages/coverageinfod')) return 'coverages';
    if (p.includes('/contentpages/underwriting')) return 'underwriting';
    return '';
  }

  function runKind(kind) {
    const payload = getSharedPayload();
    if (!payload) {
      toast('No MCI/Erie shared payload found.');
      return { ok: false, changed: 0, skipped: 0, reason: 'no_payload' };
    }

    let r;
    if (kind === 'client') r = fillClientPage(payload);
    else if (kind === 'property') r = fillPropertyPage(payload);
    else if (kind === 'rce') r = fillRcePage(payload);
    else if (kind === 'coverages') r = fillCoveragePage(payload);
    else if (kind === 'underwriting') r = fillUnderwritingPage(payload);
    else {
      toast('This NatGen Home page is not mapped yet.');
      return { ok: false, changed: 0, skipped: 0, reason: 'unsupported_page' };
    }

    toast(`Fill Page: ${r.changed} field${r.changed === 1 ? '' : 's'} updated. No navigation performed.`);
    console.log(PREFIX, 'fill result', kind, r, payload);
    return { ok: true, changed: r.changed, skipped: r.skipped, kind };
  }

  function runCurrentPage() {
    return runKind(currentPageKind());
  }

  /* =========================================================
     ADDRESS LOOKUPS
     Mirrors the useful address behavior from Smart Lookup.
     ========================================================= */

  function currentPropertyAddress() {
    const payload = getSharedPayload();
    if (payload) {
      const a = bestResidence(payload);
      const full = clean(a.full);
      if (full) return full;

      const joined = [
        firstValue(a, ['line1', 'address1', 'street']),
        firstValue(a, ['line2', 'address2']),
        firstValue(a, ['city']),
        firstValue(a, ['state', 'stateCode']),
        firstValue(a, ['zip', 'postalCode'])
      ].filter(Boolean).join(', ');
      if (joined) return joined;
    }

    const street = clean((byId('MainContent_ucAddressLabel_lblStreet') || {}).textContent);
    const csz = clean((byId('MainContent_ucAddressLabel_lblCSZ') || {}).textContent);
    if (street || csz) return [street, csz].filter(Boolean).join(', ');

    const pageText = clean(document.body && document.body.innerText);
    const m = pageText.match(/\b\d{1,6}\s+[A-Za-z0-9 .'-]+\s(?:St|Street|Rd|Road|Dr|Drive|Ave|Avenue|Ln|Lane|Ct|Court|Way|Blvd|Boulevard|Pkwy|Parkway|Cir|Circle|Trl|Trail)\b[^,\n]*,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/i);
    return m ? clean(m[0]) : '';
  }

  // Same street normalization used by Smart Lookup (MCI).
  // Wake's legacy ValidateAddress.asp expects only house number + street name;
  // city/state/ZIP and the street suffix must not be sent as stname.
  const WAKE_STREET_TYPES = [
    'rd','road','dr','drive','st','street','ave','avenue','blvd','boulevard',
    'ct','court','trl','trail','ln','lane','way','pkwy','parkway','cir','circle',
    'ter','terrace','pl','place','hwy','highway'
  ];

  function normalizeWakeAddress(raw) {
    let parts = String(raw || '')
      .replace(/[,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ');

    if (!parts.length || !/^\d+$/.test(parts[0])) return null;

    const stnum = parts.shift();
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase().replace(/\./g, '');
      if (WAKE_STREET_TYPES.includes(last)) parts.pop();
    }

    const stname = parts.join(' ');
    return stname ? { stnum, stname } : null;
  }

  function currentWakeStreetAddress() {
    const payload = getSharedPayload();

    // Best source: structured Erie/NatGen payload street line only.
    if (payload) {
      const a = bestResidence(payload);
      const line1 = firstValue(a, ['line1', 'address1', 'street']);
      if (line1) return clean(line1);
    }

    // NatGen Client Information page.
    const natgenStreet = clean((byId('MainContent_ucResidentialAddress_txtAddress') || {}).value);
    if (natgenStreet) return natgenStreet;

    // NatGen property address label, when present.
    const labeledStreet = clean((byId('MainContent_ucAddressLabel_lblStreet') || {}).textContent);
    if (labeledStreet) return labeledStreet;

    // Last-resort: take only the leading street portion from the general address.
    const full = currentPropertyAddress();
    if (!full) return '';
    const beforeComma = clean(full.split(',')[0]);
    const m = beforeComma.match(/^(\d+\s+.+?\b(?:RD|ROAD|DR|DRIVE|ST|STREET|AVE|AVENUE|BLVD|BOULEVARD|CT|COURT|TRL|TRAIL|LN|LANE|WAY|PKWY|PARKWAY|CIR|CIRCLE|TER|TERRACE|PL|PLACE|HWY|HIGHWAY))\b/i);
    return clean(m ? m[1] : beforeComma);
  }

  function openLookup(mode) {
    const address = currentPropertyAddress();
    if (!address) {
      toast('Could not find a property address on the quote/payload.');
      return;
    }

    const ts = Date.now();

    if (mode === 'wake') {
      const wakeStreet = currentWakeStreetAddress();
      const w = normalizeWakeAddress(wakeStreet);
      if (!w) {
        toast('Could not split this address for Wake County lookup.');
        return;
      }
      const url = 'https://services.wake.gov/realestate/ValidateAddress.asp'
        + '?stnum=' + encodeURIComponent(w.stnum)
        + '&stname=' + encodeURIComponent(w.stname)
        + '&locidList=&spg=&mci=1&ts=' + encodeURIComponent(String(ts));
      window.open(url, '_blank', 'noopener');
      return;
    }

    if (mode === 'maps') {
      window.open(
        'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address + ', Wake County, NC'),
        '_blank',
        'noopener'
      );
      return;
    }

    if (mode === 'vexcel') {
      window.open(
        'https://app.vexcelgroup.com/#/app/home?address=' + encodeURIComponent(address)
          + '&mci=1&ts=' + encodeURIComponent(String(ts)),
        '_blank',
        'noopener'
      );
    }
  }

  /* =========================================================
     SMALL ON-PAGE HELPER BAR
     ========================================================= */

  function mountHelper() {
    if (byId('mci-ng-home-tools')) return;

    const kind = currentPageKind();
    // Loss History / Premium Summary etc. are intentionally not filled yet,
    // but address lookup remains useful on quote pages.
    if (!location.pathname.toLowerCase().startsWith('/contentpages/')) return;

    const wrap = document.createElement('div');
    wrap.id = 'mci-ng-home-tools';
    wrap.innerHTML = `
      <button id="mci-ng-home-fill" type="button" ${kind ? '' : 'disabled'}>Fill Page</button>
      <select id="mci-ng-home-lookup" title="Lookup property address">
        <option value="">Lookup Address</option>
        <option value="wake">Wake County Property</option>
        <option value="maps">Google Maps</option>
        <option value="vexcel">Vexcel</option>
      </select>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #mci-ng-home-tools{
        position:fixed;right:14px;bottom:14px;z-index:2147483646;
        display:flex;gap:6px;align-items:center;padding:7px;
        background:#111827;border:1px solid rgba(255,255,255,.16);
        border-radius:9px;box-shadow:0 5px 18px rgba(0,0,0,.28);
        font:12px system-ui,Segoe UI,Arial,sans-serif;
        cursor:move;user-select:none
      }
      #mci-ng-home-tools button,#mci-ng-home-tools select{
        height:30px;border-radius:6px;border:1px solid #cbd5e1;
        font:12px system-ui,Segoe UI,Arial,sans-serif
      }
      #mci-ng-home-tools button{
        background:#2563eb;color:#fff;border-color:#2563eb;
        padding:0 12px;font-weight:600;cursor:pointer
      }
      #mci-ng-home-tools button:hover{background:#1d4ed8}
      #mci-ng-home-tools button:disabled{opacity:.45;cursor:not-allowed}
      #mci-ng-home-tools select{background:#fff;color:#111827;padding:0 8px;cursor:pointer}
    `;
    document.head.appendChild(style);
    document.body.appendChild(wrap);

    // Restore the helper's last position on NatGen pages.
    const POS_KEY = 'mciNatGenHomeToolsPosition';
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        const maxLeft = Math.max(0, window.innerWidth - wrap.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - wrap.offsetHeight);
        wrap.style.left = Math.min(Math.max(0, saved.left), maxLeft) + 'px';
        wrap.style.top = Math.min(Math.max(0, saved.top), maxTop) + 'px';
        wrap.style.right = 'auto';
        wrap.style.bottom = 'auto';
      }
    } catch (_) {}

    // Drag from the dark container itself. Buttons/select remain fully clickable.
    let drag = null;

    wrap.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('button, select, option')) return;

      const rect = wrap.getBoundingClientRect();
      drag = {
        pointerId: e.pointerId,
        dx: e.clientX - rect.left,
        dy: e.clientY - rect.top
      };

      wrap.setPointerCapture(e.pointerId);
      wrap.style.left = rect.left + 'px';
      wrap.style.top = rect.top + 'px';
      wrap.style.right = 'auto';
      wrap.style.bottom = 'auto';
      e.preventDefault();
    });

    wrap.addEventListener('pointermove', function (e) {
      if (!drag || drag.pointerId !== e.pointerId) return;

      const maxLeft = Math.max(0, window.innerWidth - wrap.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - wrap.offsetHeight);
      const left = Math.min(Math.max(0, e.clientX - drag.dx), maxLeft);
      const top = Math.min(Math.max(0, e.clientY - drag.dy), maxTop);

      wrap.style.left = left + 'px';
      wrap.style.top = top + 'px';
    });

    function finishDrag(e) {
      if (!drag || (e && drag.pointerId !== e.pointerId)) return;

      const rect = wrap.getBoundingClientRect();
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        }));
      } catch (_) {}

      try {
        if (e && wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
      } catch (_) {}

      drag = null;
    }

    wrap.addEventListener('pointerup', finishDrag);
    wrap.addEventListener('pointercancel', finishDrag);

    byId('mci-ng-home-fill').addEventListener('click', runCurrentPage);
    byId('mci-ng-home-lookup').addEventListener('change', function () {
      const mode = this.value;
      this.value = '';
      if (mode) openLookup(mode);
    });
  }

  /* =========================================================
     MASTER MENU / GLOBAL HOOKS
     ========================================================= */

  ROOT.runNatGenHomeClient = () => runKind('client');
  ROOT.runNatGenHomeProperty = () => runKind('property');
  ROOT.runNatGenHomeRCE = () => runKind('rce');
  ROOT.runNatGenHomeCoverages = () => runKind('coverages');
  ROOT.runNatGenHomeUnderwriting = () => runKind('underwriting');
  ROOT.runNatGenHomeCurrentPage = runCurrentPage;
  ROOT.openNatGenHomeAddressLookup = openLookup;

  // Also mirror onto sandbox window when different.
  try {
    window.runNatGenHomeClient = ROOT.runNatGenHomeClient;
    window.runNatGenHomeProperty = ROOT.runNatGenHomeProperty;
    window.runNatGenHomeRCE = ROOT.runNatGenHomeRCE;
    window.runNatGenHomeCoverages = ROOT.runNatGenHomeCoverages;
    window.runNatGenHomeUnderwriting = ROOT.runNatGenHomeUnderwriting;
    window.runNatGenHomeCurrentPage = ROOT.runNatGenHomeCurrentPage;
  } catch (_) {}

  // Current Master Menu v6.0.4 still has Home placeholders.
  // Capture these button clicks first so this filler works immediately
  // without requiring the Master Menu to be patched before testing.
  const menuMap = {
    mci_ng_home_client: 'client',
    mci_ng_home_property: 'property',
    mci_ng_home_rce: 'rce',
    mci_ng_home_coverages: 'coverages',
    mci_ng_home_underwriting: 'underwriting'
  };

  document.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('button, a');
    if (!btn || !menuMap[btn.id]) return;

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    runKind(menuMap[btn.id]);
  }, true);

  mountHelper();

  ROOT.__mciNatGenHomeFiller = {
    version: VERSION,
    getPayload: getSharedPayload,
    currentPageKind,
    runCurrentPage,
    openLookup,
    currentWakeStreetAddress
  };

  console.log(PREFIX, 'Loaded v' + VERSION, ROOT.__mciNatGenHomeFiller);
})();
