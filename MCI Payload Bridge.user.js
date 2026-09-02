// ==UserScript==
// @name         MCI Payload Bridge
// @namespace    https://middlecreekinsurance.com/
// @version      1.1.0
// @description  Shared payload bridge across Erie and NatGen domains using Tampermonkey storage.
// @match        https://www.agentexchange.com/PersonalLinesWeb/g/*
// @match        https://natgenagency.com/Quote/*
// @match        https://*.foragentsonly.com/*
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/MCI%20Payload%20Bridge.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/MCI%20Payload%20Bridge.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const LOG = '[MCI Payload Bridge]';
  const SHARED_KEY = 'mciMasterPayload';
  const LOCAL_MIRROR_KEYS = ['mciMasterPayload', 'erieMasterPayload'];
  const GM_LOCAL_PAYLOAD_KEYS = ['erieMasterPayload'];

  function text(v) {
    return v == null ? '' : String(v).trim();
  }

  function asArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function coverageCounts(payload) {
    const p = payload || {};
    const policy = asArray(p && p.coverages && p.coverages.policy && p.coverages.policy.policyCoverages);
    const vehicleGroups = asArray(p && p.coverages && p.coverages.vehicleCoverages);
    const vehicles = asArray(p && p.vehicles);
    const vehicleCoverageCounts = vehicles.map(function (v) {
      return asArray(v && v.coverages).length;
    });
    return {
      policyCoverageCount: policy.length,
      vehicleCoverageGroupCount: vehicleGroups.length,
      vehicleCoverageCounts: vehicleCoverageCounts
    };
  }

  function parseIsoToMs(v) {
    const s = text(v);
    if (!s) return 0;
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : 0;
  }

  function payloadTimestampMs(payload) {
    const p = payload || {};
    return Math.max(
      parseIsoToMs(p && p.meta && p.meta.updatedAt),
      parseIsoToMs(p && p.meta && p.meta.createdAt),
      parseIsoToMs(p && p.updatedAt),
      parseIsoToMs(p && p.createdAt)
    );
  }

  function payloadSummary(payload) {
    const p = payload || {};
    const counts = coverageCounts(p);
    return {
      timestamp: text(p && p.meta && p.meta.updatedAt) || text(p && p.meta && p.meta.createdAt) || '',
      visitedPages: asArray(p && p.meta && p.meta.visitedPages),
      policyCoverageCount: counts.policyCoverageCount,
      vehicleCoverageGroupCount: counts.vehicleCoverageGroupCount,
      vehicleCoverageCounts: counts.vehicleCoverageCounts
    };
  }

  function parseCandidate(raw, source) {
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        source: source,
        payload: parsed,
        timestampMs: payloadTimestampMs(parsed),
        summary: payloadSummary(parsed)
      };
    } catch (e) {
      console.warn(LOG, 'candidate parse failed', { source: source, error: String(e) });
      return null;
    }
  }

  function chooseNewest(candidates) {
    const list = candidates.filter(Boolean);
    if (!list.length) return null;

    list.sort(function (a, b) {
      if (b.timestampMs !== a.timestampMs) return b.timestampMs - a.timestampMs;

      const ac = (a.summary.policyCoverageCount || 0) + (a.summary.vehicleCoverageGroupCount || 0);
      const bc = (b.summary.policyCoverageCount || 0) + (b.summary.vehicleCoverageGroupCount || 0);
      if (bc !== ac) return bc - ac;

      return 0;
    });

    return list[0] || null;
  }

  function loadCandidates() {
    const candidates = [];

    const gmRaw = GM_getValue(SHARED_KEY, null);
    candidates.push(parseCandidate(gmRaw, 'GM:' + SHARED_KEY));

    for (let i = 0; i < LOCAL_MIRROR_KEYS.length; i += 1) {
      const key = LOCAL_MIRROR_KEYS[i];
      try {
        candidates.push(parseCandidate(localStorage.getItem(key), 'localStorage:' + key));
      } catch (e) {
        console.warn(LOG, 'localStorage read failed', { key: key, error: String(e) });
      }
    }

    return candidates.filter(Boolean);
  }

  function persistSharedPayload(payload, reason) {
    const serialized = JSON.stringify(payload || null);
    GM_setValue(SHARED_KEY, serialized);

    for (let i = 0; i < LOCAL_MIRROR_KEYS.length; i += 1) {
      const key = LOCAL_MIRROR_KEYS[i];
      try {
        localStorage.setItem(key, serialized);
      } catch (e) {
        console.warn(LOG, 'localStorage write failed', { key: key, error: String(e) });
      }
    }

    console.log(LOG, 'set shared payload', {
      storageKey: SHARED_KEY,
      reason: text(reason) || 'setMciSharedPayload',
      summary: payloadSummary(payload)
    });
  }

  function setMciSharedPayload(payload) {
    try {
      const incoming = parseCandidate(payload, 'incoming:setMciSharedPayload');
      if (!incoming) {
        console.warn(LOG, 'ignored invalid incoming payload');
        return false;
      }

      const existingRaw = GM_getValue(SHARED_KEY, null);
      const existing = parseCandidate(existingRaw, 'GM:' + SHARED_KEY);
      if (existing && existing.timestampMs > incoming.timestampMs) {
        console.log(LOG, 'ignored older incoming payload', {
          storageKey: SHARED_KEY,
          existing: existing.summary,
          incoming: incoming.summary
        });
        return true;
      }

      persistSharedPayload(incoming.payload, 'incoming');
      return true;
    } catch (e) {
      console.error(LOG, 'failed to set shared payload', e);
      return false;
    }
  }

  function getMciSharedPayload() {
    try {
      const candidates = loadCandidates();
      const best = chooseNewest(candidates);
      if (!best) {
        console.log(LOG, 'no shared payload found', { storageKey: SHARED_KEY });
        return null;
      }

      const gmCurrent = parseCandidate(GM_getValue(SHARED_KEY, null), 'GM:' + SHARED_KEY);
      if (!gmCurrent || gmCurrent.timestampMs < best.timestampMs) {
        persistSharedPayload(best.payload, 'get:newest-self-heal');
      }

      console.log(LOG, 'loaded shared payload', {
        storageKey: SHARED_KEY,
        sourceUsed: best.source,
        summary: best.summary
      });

      return best.payload;
    } catch (e) {
      console.error(LOG, 'failed to load shared payload', e);
      return null;
    }
  }

  function clearMciSharedPayload() {
    try {
      GM_deleteValue(SHARED_KEY);

      for (let i = 0; i < GM_LOCAL_PAYLOAD_KEYS.length; i += 1) {
        try {
          GM_deleteValue(GM_LOCAL_PAYLOAD_KEYS[i]);
        } catch (e) {}
      }

      for (let i = 0; i < LOCAL_MIRROR_KEYS.length; i += 1) {
        try {
          localStorage.removeItem(LOCAL_MIRROR_KEYS[i]);
        } catch (e) {}
      }

      console.log(LOG, 'cleared shared payload', {
        storageKey: SHARED_KEY,
        clearedLocalPayloadKeys: GM_LOCAL_PAYLOAD_KEYS
      });
      return true;
    } catch (e) {
      console.error(LOG, 'failed to clear shared payload', e);
      return false;
    }
  }

  const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  root.setMciSharedPayload = setMciSharedPayload;
  root.getMciSharedPayload = getMciSharedPayload;
  root.clearMciSharedPayload = clearMciSharedPayload;

  window.setMciSharedPayload = setMciSharedPayload;
  window.getMciSharedPayload = getMciSharedPayload;
  window.clearMciSharedPayload = clearMciSharedPayload;
})();
