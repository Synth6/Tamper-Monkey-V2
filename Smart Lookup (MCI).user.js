// ==UserScript==
// MCI internal tooling
// Copyright (c) 2025 Middle Creek Insurance. All rights reserved.
// Not authorized for redistribution or resale.
// @name        Smart Lookup (MCI)
// @namespace    mci-tools
// @version      4.3.4
// @description  ALT+Right-Click: pinned chooser for Address/Name/Policy. Address: Wake/Maps/Vexcel combos. Name: LinkedIn/Google/Facebook. Policy: Erie/NatGen/Progressive/NFIP/NCJUA
// @match        *://*/*
// @match        file://*/*
// @match        https://services.wake.gov/realestate/*
// @match        https://www.linkedin.com/*
// @match        https://portal.agentexchange.com/*
// @match        https://www.agentexchange.com/*
// @match        https://agentexchange.com/*
// @match        https://natgenagency.com/*
// @match        https://app.vexcelgroup.com/*
// @match        https://www.foragentsonly.com/*
// @match        https://nationalgeneral.torrentflood.com/*
// @match        https://insure.ncjuanciua.org/*
// @match        https://app.orion180.com/*
// @match        https://natgen.beyondfloods.com/*
// @match        https://www.natgen.beyondfloods.com/*
// @grant        GM_openInTab
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Smart%20Lookup%20(MCI).user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Smart%20Lookup%20(MCI).user.js
// @run-at       document-idle
// @allFrames    true
// ==/UserScript==

(function(){
  "use strict";

  /* ================= CONFIG ================= */
  const CFG = {
    mapsRegionHint: "Wake County, NC",
    stripStreetTypes: ["rd","road","dr","drive","st","street","ave","avenue","blvd","boulevard","ct","court","trl","trail","ln","lane","way","pkwy","parkway","cir","circle","ter","terrace","pl","place","hwy","highway"],
    indicatorTimeout: 2200,
    armedTTLms: 10 * 60 * 1000,  // 10 minutes
    faoWaitMs: 55 * 1000,        // give FAO up to ~55s after load to reveal search UI
    faoMaxAutoRunsPerTab: 1
  };

  // Erie (WWW)
  const ERIE_ORIGIN = "https://www.agentexchange.com";
  const ERIE_PATH   = "/Customer/Search";

  // NatGen
  const NG_ORIGIN   = "https://natgenagency.com";
  const NG_PATH     = "/MainMenu.aspx";

  // Progressive (FAO)
  const PR_ORIGIN   = "https://www.foragentsonly.com";
  const PR_PATH     = "/";

  // Vexcel
  const VEX_ORIGIN  = "https://app.vexcelgroup.com";

  // NFIP (TorrentFlood)
  const NFIP_ORIGIN = "https://nationalgeneral.torrentflood.com";
  const NFIP_PATH   = "/Dashboard/Agency";

  // NCJUA
  const NCJUA_ORIGIN = "https://insure.ncjuanciua.org";
  const NCJUA_PATH   = "/innovation";

  // Orion180
  const ORION_ORIGIN = "https://app.orion180.com";
  const ORION_PATH   = "/search";

  // Beyond Floods
  const BF_LAUNCH_ORIGIN = "https://natgenagency.com";
  const BF_LAUNCH_PATH   = "/Flood/FloodCenter.aspx";
  const BF_ORIGIN        = "https://natgen.beyondfloods.com";
  const BF_DASH_PATH     = "/Public/AgentDashboard";

  /* ================= STORAGE KEYS ================= */
  // Erie
  const K_ERIE_POL="carrier.erie.pol", K_ERIE_AWAIT="carrier.erie.await";

  // NatGen
  const K_NG_POL="carrier.ng.pol", K_NG_AWAIT="carrier.ng.await";

  // NFIP
  const K_NFIP_POL="carrier.nfip.pol", K_NFIP_AWAIT="carrier.nfip.await";

  // NCJUA
  const K_NCJUA_POL="carrier.ncjua.pol", K_NCJUA_AWAIT="carrier.ncjua.await";

  // Orion180
  const K_ORION_POL="carrier.orion.pol";
  const K_ORION_AWAIT="carrier.orion.await";

  // Vexcel
  const K_VEX_ADDR="vexcel.addr", K_VEX_AWAIT="vexcel.await";

  // Progressive
  const K_PR_POL="carrier.pr.pol";
  const K_PR_RAN="carrier.pr.ran"; // per-tab
  const K_PR_PENDING_GM="carrier.pr.pending.gm"; // cross-tab safety
  const K_PR_PENDING_TS="carrier.pr.pending.ts";

  // Beyond Floods
  const K_BF_POL="carrier.bf.pol", K_BF_AWAIT="carrier.bf.await";
  const K_BF_POL_GM="carrier.bf.pol.gm", K_BF_AWAIT_GM="carrier.bf.await.gm";
  const K_BF_RUN="carrier.bf.run", K_BF_RUN_GM="carrier.bf.run.gm";
  const K_BF_OWNER_GM="carrier.bf.owner.gm";
  const K_BF_TAB_ID="carrier.bf.tabid";
  const K_BF_LAUNCHED="carrier.bf.launched";


  // Arming gate (generic; NOT tied to hotkey anymore)
  const K_ARMED   = "mci.lookup.armed";
  const K_ARMED_TS= "mci.lookup.armed.ts";
  const K_ARMED_GM_TS = "mci.lookup.armed.gm.ts";

  /* ================= URL PARAM HELPERS ================= */
  function getHashParams(){
    // supports:
    //  - Erie/NatGen: "#pol=...&mci=1&ts=..."
    //  - Vexcel: "#/app/home?address=...&mci=1&ts=..."
    try{
      const h = String(location.hash || "").replace(/^#/, "");
      const qIndex = h.indexOf("?");
      const qs = (qIndex >= 0) ? h.slice(qIndex + 1) : h;
      return new URLSearchParams(qs);
    }catch(_){}
    return new URLSearchParams("");
  }

  function makeRunId(){
    return "bf_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  }

  function getBfTabId(){
    try{
      let id = sessionStorage.getItem(K_BF_TAB_ID) || "";
      if (!id) {
        id = "bftab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(K_BF_TAB_ID, id);
      }
      return id;
    }catch(_){
      return "bftab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    }
  }

  function tokenOKFromLocation(){
    try{
      const ttl = CFG.armedTTLms || (10*60*1000);

      // hash token
      const hp = getHashParams();
      const mciH = hp.get("mci");
      const tsH  = parseInt(hp.get("ts") || "0", 10);
      if (mciH === "1" && tsH && (Date.now() - tsH) <= ttl) return { ok:true, ts: tsH };

      // query token (Wake + Progressive uses query)
      const sp = new URLSearchParams(location.search || "");
      const mciQ = sp.get("mci");
      const tsQ  = parseInt(sp.get("ts") || "0", 10);
      if (mciQ === "1" && tsQ && (Date.now() - tsQ) <= ttl) return { ok:true, ts: tsQ };

    }catch(_){}
    return { ok:false, ts:0 };
  }

  /* ================= ARMING HELPERS ================= */
  function armAutomations(ts){
    const stamp = ts || Date.now();
    try{
      sessionStorage.setItem(K_ARMED, "1");
      sessionStorage.setItem(K_ARMED_TS, String(stamp));
    }catch(_){}
    // Cross-tab / cross-origin fallback
    try{ if (typeof GM_setValue === "function") GM_setValue(K_ARMED_GM_TS, String(stamp)); }catch(_){}
    return stamp;
  }

  function disarmAutomations(){
    try{
      sessionStorage.removeItem(K_ARMED);
      sessionStorage.removeItem(K_ARMED_TS);
    }catch(_){}
    try{ if (typeof GM_deleteValue === "function") GM_deleteValue(K_ARMED_GM_TS); }catch(_){}
  }

  function isArmed(){
    try{
      const ttl = CFG.armedTTLms || (10*60*1000);
      const now = Date.now();

      // same-tab arm
      if (sessionStorage.getItem(K_ARMED) === "1"){
        const ts = parseInt(sessionStorage.getItem(K_ARMED_TS) || "0", 10);
        if (ts && (now - ts) <= ttl) return true;
      }

      // cross-tab / cross-origin arm (GM storage)
      try{
        if (typeof GM_getValue === "function"){
          const gts = parseInt(GM_getValue(K_ARMED_GM_TS, "0") || "0", 10);
          if (gts && (now - gts) <= ttl) return true;
        }
      }catch(_){}

      // token in URL
      const tok = tokenOKFromLocation();
      if (tok.ok) return true;

    }catch(_){}
    return false;
  }

  /* ================= TOAST ================= */
  GM_addStyle(`
    .mci-toast{position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);
      background:#111;color:#fff;padding:8px 12px;border-radius:8px;font:12px/1.35 system-ui,Segoe UI,Arial;
      box-shadow:0 4px 18px rgba(0,0,0,.35);opacity:.95;pointer-events:none}
  `);
  function toast(msg,ms=1600){
    try{
      const t=document.createElement("div");
      t.className="mci-toast"; t.textContent=msg; document.body.appendChild(t);
      setTimeout(()=>t.remove(),ms);
    }catch(_){}
  }

  /* ================= TAB TITLE INDICATOR ================= */
  let baseTitle=document.title||"";
  function setTab(dot,label){
    clearTimeout(setTab.timer);
    document.title = `${dot} ${label}`;
    setTab.timer = setTimeout(()=>{ document.title = baseTitle; }, CFG.indicatorTimeout);
  }

  /* ================= HOVER / SELECTION ================= */
  let lastHoverText="";
  document.addEventListener("mouseover",(e)=>{
    const tag=(e.target && e.target.tagName || "").toLowerCase();
    if(tag==="input"||tag==="textarea"||(e.target && e.target.isContentEditable)) return;
    const t=(e.target && (e.target.innerText||e.target.textContent) || "").trim();
    if(t) lastHoverText=t;
  },{capture:true,passive:true});

  function getSelectedOrHoverText(){
    const sel=(window.getSelection&&window.getSelection().toString().trim())||"";
    if(sel) return sel;
    return (lastHoverText||"").trim();
  }

  /* ================= DETECTION HELPERS ================= */
  const RE = {
    ERIE_FMT1:  /^[A-Z]\d{2}-\d{6,}$/,
    HYPHENATED: /\b([A-Z0-9]{1,4}-\d{5,12})\b/,
    DIGITS_8_10:/^\d{8,10}$/,
    DIGITS_11P: /^\d{11,}$/,
    // Orion180 common prefixes: OIC..., OSIH..., RCAP...
    ORION_POLICY: /\b((?:OIC|OSIH|RCAP)[A-Z0-9_]{3,})\b/i,

    // NCJUA common policy prefixes
    NCJUA_POLICY: /\b((?:DW|DP|HO|HW|WH|CP)[A-Z0-9-]{4,})\b/i,

    // Beyond Floods common policy format: 11111-12345
    BF_POLICY: /\b(\d{5}-\d{5})\b/
  };

  const norm=s=>(s||"").replace(/\s+/g," ").trim();

  function isLikelyAddress(s){
    const txt=String(s||"").replace(/[,]/g," ").replace(/\s+/g," ").trim();
    return /^\d+\s+[\w\s.-]+$/.test(txt);
  }
  function normalizeAddressForWake(s){
    let parts=String(s||"").replace(/[,]/g," ").replace(/\s+/g," ").trim().split(" ");
    if(!parts.length || !/^\d+$/.test(parts[0])) return null;
    const stnum=parts.shift();
    if(parts.length>=2){
      const last=parts[parts.length-1].toLowerCase().replace(/\./g,"");
      if(CFG.stripStreetTypes.includes(last)) parts.pop();
    }
    const stname=parts.join(" ");
    return { stnum, stname };
  }

  // Name cleaners
  function extractLeadingName(raw){
    let s = String(raw||"")
      .replace(/\s+/g, " ")
      .replace(/[,\u2013\u2014-]\s*(first\s+named\s+insured|named\s+insured|insured|policyholder|applicant|contact|primary)\b.*$/i, "")
      .replace(/\s*\((first\s+named\s+insured|named\s+insured|insured|policyholder|applicant|primary)\)\s*$/i, "")
      .trim();
    s = s.split(/\s+[-–—]\s+|\s*\/\s*|\s*\|\s*|\s*·\s*/)[0].trim();
    const m = s.match(/^\s*([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){1,3})\b/u);
    if (m) return m[1];
    const tokens = s.split(" ").filter(Boolean);
    if (tokens.length >= 2 && /^[A-Za-z]/.test(tokens[0])) {
      return tokens.slice(0, Math.min(tokens.length, 4)).join(" ");
    }
    return s;
  }
  function cleanNameForSearch(raw){
    const suffixes=/^(jr|sr|ii|iii|iv|v|vi)\.?$/i;
    const clean=String(raw||"").replace(/[,]/g," ").replace(/\s+/g," ").trim();
    const parts=clean.split(" ").filter(Boolean);
    const filtered=[];
    for(const p of parts){
      const naked=p.replace(/\./g,"");
      if(naked.length===1) continue;
      if(suffixes.test(naked)) continue;
      filtered.push(p);
    }
    return (filtered.length>=2 ? filtered.join(" ") : clean);
  }
  function isLikelyName(s){
    const clean=String(s||"").replace(/[,]/g," ").replace(/\s+/g," ").trim();
    const parts=clean.split(" ").filter(Boolean);
    if(parts.length<2 || parts.length>5) return false;
    return parts.every(p=>/^[\p{L}'\-\.]+$/u.test(p));
  }

  // Policy extraction
  function extractPolicy(txt){
    const s = String(txt || "");
    if(!s.trim()) return null;

    // Orion180 prefixed policies before NCJUA
    const orion = s.match(RE.ORION_POLICY);
    if (orion) return orion[1].toUpperCase();

    // NCJUA prefixed policies first
    const ncjua = s.match(RE.NCJUA_POLICY);
    if (ncjua) return ncjua[1].toUpperCase();

    // Beyond Floods 11111-12345 style
    const bf = s.match(RE.BF_POLICY);
    if (bf) return bf[1];

    // Erie "Q..."
    const q = s.match(/\bQ\d{5,}\b/i);

    if(q) return q[0].toUpperCase();

    const erieExact = s.match(RE.ERIE_FMT1)?.[0];
    if(erieExact) return erieExact;

    const hyp = s.match(RE.HYPHENATED)?.[0];
    if(hyp) return hyp;

    const digits = (s.match(/\b\d{8,}\b/) || [])[0];
    return digits || null;
  }

  /* ================= OPENERS (ARM + PASS TOKEN) ================= */
  function openVexcel(addressRaw){
    const addr = String(addressRaw || "").replace(/\s+/g, " ").trim();
    const ts = armAutomations(Date.now());

    try {
      sessionStorage.setItem(K_VEX_ADDR, addr);
      sessionStorage.setItem(K_VEX_AWAIT, "1");
    } catch(_) {}

    toast(`Vexcel: loading map for “${addr}”...`, 2600);

    GM_openInTab(
      VEX_ORIGIN + "/#/app/home?address=" + encodeURIComponent(addr) + "&mci=1&ts=" + encodeURIComponent(String(ts)),
      {active:false, insert:true}
    );
  }

  function openWakeOnly(rawAddress){
    const raw = String(rawAddress || "").replace(/\s+/g, " ").trim();
    const normd = normalizeAddressForWake(raw);
    if(!normd){ toast("Doesn't look like a Wake address."); return; }

    const ts = armAutomations(Date.now());
    const { stnum, stname } = normd;
    const wakeURL =
      `https://services.wake.gov/realestate/ValidateAddress.asp?stnum=${encodeURIComponent(stnum)}&stname=${encodeURIComponent(stname)}&locidList=&spg=&mci=1&ts=${encodeURIComponent(String(ts))}`;

    GM_openInTab(wakeURL,{active:true,insert:true});
    toast(`Wake: ${raw}`);
  }

  function openAddressLookups(rawAddress, mode){
    const raw = String(rawAddress || "").replace(/\s+/g, " ").trim();
    if(mode === "wake") return openWakeOnly(raw);

    const normd = normalizeAddressForWake(raw);
    if(!normd){ toast("Doesn't look like a Wake address."); return; }

    if(mode === "vexcel") { openVexcel(raw); return; }
    if(mode === "maps") {
      const mapsQ   = CFG.mapsRegionHint ? `${raw}, ${CFG.mapsRegionHint}` : raw;
      GM_openInTab(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQ)}`, {active:true, insert:true});
      toast(`Maps: ${raw}`);
      return;
    }

    // default combo: wake+maps+vexcel
    openWakeOnly(raw);
    const mapsQ   = CFG.mapsRegionHint ? `${raw}, ${CFG.mapsRegionHint}` : raw;
    GM_openInTab(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQ)}`, {active:false, insert:true});
    openVexcel(raw);

    toast(`Opening Wake, Maps & Vexcel for: ${raw}`);
  }

  function openNameLookups(nameRaw, mode){
    const leading = extractLeadingName(nameRaw);
    const cleaned = cleanNameForSearch(leading);

    if(mode === "google"){
      const q = cleaned;
      GM_openInTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`, {active:true, insert:true});
      toast(`Google: ${cleaned}`);
      return;
    }
    if(mode === "facebook"){
      // Facebook search works when logged in; if not logged in it will just prompt.
      const q = cleaned;
      GM_openInTab(`https://www.facebook.com/search/people/?q=${encodeURIComponent(q)}`, {active:true, insert:true});
      toast(`Facebook: ${cleaned}`);
      return;
    }

    // default linkedin
    GM_openInTab(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(cleaned)}`, {active:true, insert:true});
    toast(`LinkedIn: ${cleaned}`);
  }

  function openErie(pol){
    const ts = armAutomations(Date.now());
    const p = String(pol||"").trim().toUpperCase();

    try {
      sessionStorage.setItem(K_ERIE_POL, p);
      sessionStorage.setItem(K_ERIE_AWAIT, "1");
    } catch(_) {}

    window.open(
      ERIE_ORIGIN + ERIE_PATH + "#pol=" + encodeURIComponent(p) + "&mci=1&ts=" + encodeURIComponent(String(ts)),
      "_blank"
    );
    toast(`Erie: ${p}`);
  }

  function openNatGen(pol){
    const ts = armAutomations(Date.now());
    const digits = String(pol||"").replace(/\D/g,""); // NatGen wants digits
    if(!digits){ toast("No policy digits detected."); return; }

    try{
      sessionStorage.setItem(K_NG_POL, digits);
      sessionStorage.setItem(K_NG_AWAIT,"1");
    }catch(_){}

    window.open(
      NG_ORIGIN + NG_PATH + "#pol=" + encodeURIComponent(digits) + "&mci=1&ts=" + encodeURIComponent(String(ts)),
      "_blank"
    );
    toast(`NatGen: ${digits}`);
  }

  function setProgressivePending(pol, ts){
    const digits = String(pol||"").replace(/\D/g,"");
    if(!digits) return "";
    try { sessionStorage.setItem(K_PR_PENDING_TS, String(ts||Date.now())); } catch(_){}
    try { if (typeof GM_setValue === "function") GM_setValue(K_PR_PENDING_GM, digits); } catch(_){}
    try { if (typeof GM_setValue === "function") GM_setValue(K_PR_POL, digits); } catch(_){}
    return digits;
  }
  function openNFIP(pol){
    const ts = armAutomations(Date.now());
    const p = String(pol||"").trim();
    if(!p){ toast("No policy detected."); return; }

    try{
      sessionStorage.setItem(K_NFIP_POL, p);
      sessionStorage.setItem(K_NFIP_AWAIT,"1");
    }catch(_){}

    window.open(
      NFIP_ORIGIN + NFIP_PATH + "#pol=" + encodeURIComponent(p) + "&mci=1&ts=" + encodeURIComponent(String(ts)),
      "_blank"
    );
    toast(`NFIP: ${p}`);
  }

  // ================= NCJUA =================
  function openNCJUA(pol){
    const ts = armAutomations(Date.now());
    const p = String(pol || "").trim().toUpperCase();
    if(!p){ toast("No NCJUA policy detected."); return; }

    try{
      sessionStorage.setItem(K_NCJUA_POL, p);
      sessionStorage.setItem(K_NCJUA_AWAIT, "1");
    }catch(_){}

    window.open(
      NCJUA_ORIGIN + NCJUA_PATH + "#pol=" + encodeURIComponent(p) + "&mci=1&ts=" + encodeURIComponent(String(ts)),
      "_blank"
    );
    toast(`NCJUA: ${p}`);
  }

  // ================= Orion180 =================
  function openOrion180(pol){
    const ts = armAutomations(Date.now());
    const p = String(pol || "").trim().toUpperCase();
    if(!p){ toast("No Orion180 policy detected."); return; }

    try{
      sessionStorage.setItem(K_ORION_POL, p);
      sessionStorage.setItem(K_ORION_AWAIT, "1");
    }catch(_){}

    try{
      if (typeof GM_setValue === "function") {
        GM_setValue(K_ORION_POL, p);
        GM_setValue(K_ORION_AWAIT, "1");
      }
    }catch(_){}

    window.open(
      ORION_ORIGIN + ORION_PATH +
      "?tab=policies&diary=false&mci=1&ts=" + encodeURIComponent(String(ts)) +
      "#pol=" + encodeURIComponent(p),
      "_blank"
    );
    toast(`Orion180: ${p}`);
  }

  function openProgressive(pol){
    const ts = armAutomations(Date.now());
    const digits = setProgressivePending(pol, ts);
    if(!digits){ toast("No policy digits detected."); return; }

    window.open(
      PR_ORIGIN + PR_PATH + "?mci=1&ts=" + encodeURIComponent(String(ts)) + "&pol=" + encodeURIComponent(digits),
      "_blank"
    );
    toast(`Progressive: ${digits}`);
  }

  // ================= Beyond Floods =================
  function openBeyondFloods(pol){
    const ts = armAutomations(Date.now());
    const p = String(pol || "").trim();
    if(!p){ toast("No Beyond Floods policy detected."); return; }

    const runId = makeRunId();

    try{
      sessionStorage.setItem(K_BF_POL, p);
      sessionStorage.setItem(K_BF_AWAIT, "1");
      sessionStorage.setItem(K_BF_RUN, runId);
      sessionStorage.removeItem(K_BF_LAUNCHED);
    }catch(_){}

    try{
      if (typeof GM_setValue === "function") {
        GM_setValue(K_BF_POL_GM, p);
        GM_setValue(K_BF_AWAIT_GM, "1");
        GM_setValue(K_BF_RUN_GM, runId);
        GM_deleteValue(K_BF_OWNER_GM);
      }
    }catch(_){}

    window.open(
      BF_LAUNCH_ORIGIN + BF_LAUNCH_PATH +
      "#bfpol=" + encodeURIComponent(p) +
      "&bfrun=" + encodeURIComponent(runId) +
      "&mci=1&ts=" + encodeURIComponent(String(ts)),
      "_blank"
    );
    toast(`Beyond Floods: ${p}`);
  }

  /* ================= ALT+RIGHT-CLICK CHOOSER (PINNED) ================= */
  GM_addStyle(`
    #mci-hover-chooser{
      position:fixed; z-index:2147483647; display:none;
      background:rgba(15,15,15,.94); color:#fff;
      border:1px solid rgba(255,255,255,.14);
      border-radius:10px; box-shadow:0 10px 28px rgba(0,0,0,.38);
      padding:8px; font:12px/1.25 system-ui,Segoe UI,Arial;
      width: 200px;
      min-width: 150px;
    }
    #mci-hover-chooser .row{display:flex; align-items:center; gap:8px;}
    #mci-hover-chooser .lbl{opacity:.85; font-size:11px; white-space:nowrap;}
    #mci-hover-chooser select{
      flex:1; width:100%;
      padding:6px 8px; border-radius:8px;
      border:1px solid rgba(255,255,255,.14);
      background:#ffffff; color:#111;
      outline:none;
    }
    #mci-hover-chooser select option{ color:#111; background:#fff; }
    #mci-hover-chooser .sub{
      margin-top:6px; opacity:.8; font-size:11px;
      max-width:520px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    #mci-hover-chooser button{
      cursor:pointer;border:1px solid rgba(255,255,255,.14);
      background:#ffffff;color:#111;border-radius:8px;padding:6px 8px;line-height:1;
    }
  `);

  const HoverChooser = (function(){
    let el=null, sel=null, sub=null;
    let x=40, y=40;

    function ensure(){
      if(el) return;

      el=document.createElement("div");
      el.id="mci-hover-chooser";
      el.innerHTML=`
        <div class="row">
          <div class="lbl">Open:</div>
          <select id="mci-hc-select"></select>
          <button id="mci-hc-close" title="Close">✖</button>
        </div>
        <div class="sub" id="mci-hc-sub"></div>
      `;
      document.body.appendChild(el);

      sel=el.querySelector("#mci-hc-select");
      sub=el.querySelector("#mci-hc-sub");

      el.querySelector('#mci-hc-close').addEventListener('click', hide, true);

      window.addEventListener("keydown",(e)=>{ if(e.key==="Escape") hide(); }, true);

      // click outside to close
      window.addEventListener("mousedown",(e)=>{
        if(!el || el.style.display==="none") return;
        if(el.contains(e.target)) return;
        hide();
      }, true);

      sel.addEventListener("change", ()=>{
        const v = sel.value;
        if(!v) return;
        const payload = sel._mciPayload || {};
        hide();
        try{ runChooserAction(v, payload); }catch(_){ toast("Chooser error."); }
        sel.value="";
      });

      // prevent the native context menu inside chooser
      el.addEventListener("contextmenu",(e)=>{ e.preventDefault(); }, true);
    }

    function hide(){
      if(!el) return;
      el.style.display="none";
    }

    function position(){
      if(!el) return;
      const pad=10;
      const w=el.offsetWidth||300;
      const h=el.offsetHeight||70;
      let left=x+10, top=y+12;
      left=Math.min(left, window.innerWidth - w - pad);
      top =Math.min(top,  window.innerHeight - h - pad);
      left=Math.max(pad, left);
      top =Math.max(pad, top);
      el.style.left=left+"px";
      el.style.top=top+"px";
    }

    function show(options, payload, subtitle){
      ensure();
      sel.innerHTML = `<option value="">Choose…</option>` + options.map(o=>`<option value="${o.value}">${o.label}</option>`).join("");
      sel._mciPayload = payload;
      sub.textContent = subtitle || "";
      el.style.display="block";
      position();
      setTimeout(() => sel.focus(), 0);
    }

    function openPinned(text, clientX, clientY){
      const t=String(text||"").trim();
      if(!t){ toast("No text detected."); return; }

      x = (typeof clientX === "number") ? clientX : 40;
      y = (typeof clientY === "number") ? clientY : 40;

      if(isLikelyAddress(t)){
        show(
          [
            {value:"addr_wake_maps_vex", label:"Wake + Maps + Vexcel"},
            {value:"addr_wake",          label:"Wake only"},
            {value:"addr_maps",          label:"Google Maps only"},
            {value:"addr_vexcel",        label:"Vexcel only"}
          ],
          {addr:t},
          t
        );
        return;
      }

      const lead = extractLeadingName(t);
      if(isLikelyName(lead)){
        show(
          [
            {value:"name_linkedin", label:"LinkedIn People Search"},
            {value:"name_google",   label:"Google Search"},
            {value:"name_facebook", label:"Facebook People Search"}
          ],
          {name:t, lead},
          lead
        );
        return;
      }

      const pol = extractPolicy(t);
      if(pol){
        show(
          [
            {value:"pol_erie",        label:"Policy: Erie"},
            {value:"pol_natgen",      label:"Policy: NatGen"},
            {value:"pol_progressive", label:"Policy: Progressive"},
            {value:"pol_nfip",        label:"Policy: NFIP"},
            {value:"pol_beyondfloods",label:"Policy: Beyond Floods"},
            {value:"pol_orion180",    label:"Policy: Orion180"},
            {value:"pol_ncjua",       label:"Policy: NCJUA"}
          ],
          {pol},
          pol
        );
        return;
      }

      // fallback: treat as name
      show(
        [
          {value:"name_linkedin", label:"LinkedIn People Search"},
          {value:"name_google",   label:"Google Search"},
          {value:"name_facebook", label:"Facebook People Search"}
        ],
        {name:t, lead:lead},
        lead || t
      );
    }

    return { openPinned, hide };
  })();

  function runChooserAction(action, payload){
    if(!payload) return;

    if(action==="addr_wake_maps_vex") return openAddressLookups(payload.addr, "combo");
    if(action==="addr_wake")          return openAddressLookups(payload.addr, "wake");
    if(action==="addr_maps")          return openAddressLookups(payload.addr, "maps");
    if(action==="addr_vexcel")        return openAddressLookups(payload.addr, "vexcel");

    if(action==="name_linkedin") return openNameLookups(payload.name, "linkedin");
    if(action==="name_google")   return openNameLookups(payload.name, "google");
    if(action==="name_facebook") return openNameLookups(payload.name, "facebook");

    if(action==="pol_erie")        return openErie(payload.pol);
    if(action==="pol_natgen")      return openNatGen(payload.pol);
    if(action==="pol_progressive") return openProgressive(payload.pol);
    if(action==="pol_nfip")        return openNFIP(payload.pol);
    if(action==="pol_beyondfloods") return openBeyondFloods(payload.pol);
    if(action==="pol_orion180")    return openOrion180(payload.pol);
    if(action==="pol_ncjua")       return openNCJUA(payload.pol);
  }

// ALT + RIGHT-CLICK opens chooser pinned at cursor
document.addEventListener("contextmenu", (e) => {
  if (!e.altKey) return;

  const tag = (e.target && e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;

  function getTextUnderCursor(evt) {
    try {
      let node = document.elementFromPoint(evt.clientX, evt.clientY);
      if (!node) return "";

      if (node.nodeType === 3) node = node.parentNode;
      if (!node) return "";

      // Prefer a tighter clickable/text element first
      let cur = node;
      while (cur && cur !== document.body) {
        const t = ((cur.innerText || cur.textContent) || "").trim();
        if (t && extractPolicy(t)) return t;
        cur = cur.parentElement;
      }

      // Fall back to direct node text
      let txt = ((node.innerText || node.textContent) || "").trim();

      // If too large, try a smaller child
      if (txt && txt.length > 80 && node.querySelector) {
        const small = node.querySelector("a, span, div, td, th, label");
        if (small) {
          const t2 = ((small.innerText || small.textContent) || "").trim();
          if (t2) txt = t2;
        }
      }

      return txt || "";
    } catch (_) {
      return "";
    }
  }

  // stop browser menu and most selection behavior
  e.preventDefault();
  e.stopPropagation();

  // clear accidental selection that may have happened already
  try {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
  } catch (_) {}

  const underCursor = getTextUnderCursor(e);
  const selected = (window.getSelection && window.getSelection().toString().trim()) || "";
  const hovered = getSelectedOrHoverText();
  const txt = underCursor || selected || hovered;

  HoverChooser.openPinned(txt, e.clientX, e.clientY);
}, true);

  /* ================= TAB INDICATOR ================= */
  function updateTabIndicator(){
    const txt=getSelectedOrHoverText();
    if(!txt){ document.title = baseTitle; return; }
    let dot="⚫", label="";

    if(isLikelyAddress(txt)){ dot="🟩"; label=`Address: ${txt}`; }
    else if(isLikelyName(extractLeadingName(txt))){ dot="🔵"; label=`Name: ${txt}`; }
    else {
      const pol = extractPolicy(txt);
      if(pol){
        dot="🟠"; label=`Policy: ${pol}`;
      }
    }
    setTab(dot,label);
  }
  document.addEventListener("mousemove", updateTabIndicator, {capture:true, passive:true});
  document.addEventListener("mouseover", updateTabIndicator, {capture:true, passive:true});

  /* ================= ON-SITE AUTOMATIONS (ONLY IF ARMED/TOKEN) ================= */

  // Wake: auto-follow to Account
  (function wakeAutoFollow(){
    if(!/services\.wake\.gov\/realestate\/ValidateAddress\.asp/i.test(location.href)) return;

    const tok = tokenOKFromLocation();
    if (tok.ok) armAutomations(tok.ts);
    if(!isArmed()) return;

    const tryClick=()=>{
      const link=document.querySelector('a[href*="Account.asp"]');
      if(link){ link.click(); return true; }
      return false;
    };
    let attempts=0;
    const iv=setInterval(()=>{
      attempts++;
      if(tryClick()||attempts>30){
        clearInterval(iv);
        disarmAutomations();
      }
    },150);
  })();

  // ERIE side (WWW)
  if (location.hostname === "www.agentexchange.com" || location.hostname === "agentexchange.com") {
    (function erieRun(){
      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);
      if(!isArmed()) return;

      const m = (location.hash || "").match(/[#&]pol=([^&]+)/i);
      let pol = m ? decodeURIComponent(m[1]) : "";

      if (!pol) {
        const awaiting = sessionStorage.getItem(K_ERIE_AWAIT) === "1";
        if (!awaiting) return;
        pol = sessionStorage.getItem(K_ERIE_POL) || "";
        if (!pol) return;
      }

            const hp = getHashParams();
      const keepTs = hp.get("ts") || String(Date.now());

      // Run Erie automation only in the top window (prevents iframe loops with @allFrames)
      try { if (window.top !== window.self) return; } catch(_) {}

      // Pause on Erie portal/login pages (server may force these when logged out)
      const eriePath = (location.pathname || "").toLowerCase();
      const isErieLogin =
        eriePath.indexOf("/my.policy") === 0 ||
        eriePath.indexOf("/my.logout.php3") === 0 ||
        !!document.querySelector("input[type='password'], input[name*='user' i], input[name*='login' i]");
      if (isErieLogin) {
        try { sessionStorage.setItem(K_ERIE_POL, pol); sessionStorage.setItem(K_ERIE_AWAIT, "1"); } catch(_) {}
        toast("Erie: login detected — automation paused. Log in, then refresh.", 4500);
        return;
      }

      if (!location.pathname.toLowerCase().startsWith(ERIE_PATH.toLowerCase())) {
        try { sessionStorage.setItem(K_ERIE_POL, pol); sessionStorage.setItem(K_ERIE_AWAIT, "1"); } catch(_) {}
        location.replace(
          ERIE_ORIGIN + ERIE_PATH +
          "#pol=" + encodeURIComponent(pol) +
          "&mci=1&ts=" + encodeURIComponent(keepTs)
        );
        return;
      }
const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent || r.width || r.height);
      };

      function observeUntil(predicate, timeoutMs=7000, root=document){
        return new Promise(resolve => {
          const first = predicate();
          if (first) return resolve(first);
          const obs = new MutationObserver(() => {
            const el = predicate();
            if (el) { obs.disconnect(); resolve(el); }
          });
          obs.observe(root === document ? document.documentElement : root, {childList:true,subtree:true,attributes:true,characterData:true});
          setTimeout(() => { obs.disconnect(); resolve(predicate()); }, timeoutMs);
        });
      }

      function finish(){
        try { history.replaceState(null, "", location.pathname + location.search); } catch(_) {}
        try { sessionStorage.removeItem(K_ERIE_POL); sessionStorage.removeItem(K_ERIE_AWAIT); } catch(_) {}
        disarmAutomations();
      }

      function flipDropdown(){
        const ddl = document.querySelector("#dropdown-select");
        if (ddl && ddl.value !== "0") {
          ddl.value = "0";
          ddl.dispatchEvent(new Event("input",{bubbles:true}));
          ddl.dispatchEvent(new Event("change",{bubbles:true}));
        }
        const s=document.createElement("script");
        s.textContent="(()=>{try{var el=document.querySelector('#dropdown-select');if(!el)return; if(window.angular&&angular.element){var sc=angular.element(el).scope()||(angular.element(el).isolateScope&&angular.element(el).isolateScope()); if(sc){sc.searchType='0'; if(typeof sc.searchTypeChanged==='function') sc.searchTypeChanged(); if(sc.$applyAsync) sc.$applyAsync(); else if(sc.$apply) sc.$apply();}} el.value='0'; el.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}})()";
        document.documentElement.appendChild(s); s.remove();
      }

      function findPolicyInput(){
        let el = document.querySelector("#policyNumber, #policyNumber-txt, input[name='policyNumber']");
        if (el && visible(el)) return el;

        const all = Array.from(document.querySelectorAll("#searchContainer input, #searchContainer input[type='text'], #searchContainer input[type='search']")).filter(i => visible(i));
        const candidates = all.filter(i => {
          if (i.closest && i.closest("#nameAndAdvSrch")) return false;
          const sig = ((i.placeholder||"")+" "+(i.name||"")+" "+(i.id||"")+" "+(i.getAttribute("aria-label")||"")).toLowerCase();
          return /policy/.test(sig) || /number/.test(sig);
        });
        if (candidates.length) return candidates[0];

        const nameSection = document.querySelector("#nameAndAdvSrch");
        const nameVisible = nameSection && visible(nameSection);
        if (!nameVisible && all.length === 1) return all[0];

        return null;
      }

      (async function main(){
        await observeUntil(() => document.querySelector("#dropdown-select"), 9000);

        let tries = 0;
        let input = null;
        while (tries < 18 && !input){
          tries++;
          flipDropdown();
          input = findPolicyInput();
          if (!input) await new Promise(r => setTimeout(r, 300));
        }
        if (!input) {
          toast("Erie: search box not found, stopping lookup.", 3000);
          finish();
          return;
        }

        input.focus();
        input.value = pol;
        input.dispatchEvent(new Event("input",{bubbles:true}));
        input.dispatchEvent(new Event("change",{bubbles:true}));

        const btn = document.querySelector("#btnSearch") ||
                    Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
                      .find(b => /search/i.test(norm(b.innerText || b.textContent || b.value || "")));
        if (!btn) {
          toast("Erie: search button not found, stopping lookup.", 3000);
          finish();
          return;
        }
        btn.click();

        const row = await observeUntil(() => {
          const r = document.querySelector("#custSrchResults .custResListArr");
          return r && visible(r) ? r : null;
        }, 9000);

        if (!row) {
          toast("Erie: policy not found, stopping lookup.", 3000);
          finish();
          return;
        }

        const link =
          row.querySelector("#resCustName") ||
          row.querySelector(".custName") ||
          row.querySelector("[ng-click*='gotoCustomerDetail']") ||
          row.querySelector("a");
        if (link) link.click();
        else row.click();

        finish();
      })();
    })();
  }

  // NATGEN side
  if (location.hostname === "natgenagency.com") {
    (function natgenAuto(){
      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);
      if(!isArmed()) return;

      const hp = getHashParams();
      const polFromHash = hp.get("pol") || "";

      let pol = polFromHash;
      if (!pol) {
        const awaiting = sessionStorage.getItem(K_NG_AWAIT) === "1";
        if (!awaiting) return;
        pol = sessionStorage.getItem(K_NG_POL) || "";
        if (!pol) return;
      }

      const keepTs = hp.get("ts") || String(Date.now());

      const finish=()=>{
        try{ history.replaceState(null,"",location.pathname+location.search);}catch(_){}
        try{ sessionStorage.removeItem(K_NG_POL); sessionStorage.removeItem(K_NG_AWAIT);}catch(_){}
        disarmAutomations();
      };

      function visible(el){ if(!el) return false; const r=el.getBoundingClientRect(); return !!(el.offsetParent||r.width||r.height); }
      function waitForSel(selector, timeout=12000){
        return new Promise(resolve=>{
          const t0=performance.now();
          const iv=setInterval(()=>{
            const el=document.querySelector(selector);
            if(el && visible(el)){ clearInterval(iv); resolve(el); }
            else if(performance.now()-t0>timeout){ clearInterval(iv); resolve(null); }
          },150);
        });
      }

      (async ()=>{
        // Run NatGen automation only in the top window (prevents iframe loops with @allFrames)
        try { if (window.top !== window.self) return; } catch(_) {}

        const isMainPage = /\/MainMenu\.aspx$/i.test(location.pathname);
        const isFloodCenterPage = /\/Flood\/FloodCenter\.aspx$/i.test(location.pathname);

        // Detect if we're on the login screen (URL patterns OR common login controls)
        const isLoginPage =
          /\/Login\.aspx$/i.test(location.pathname) ||
          /\/Account\/Login/i.test(location.pathname) ||
          !!document.querySelector("input[name*='User' i], input[name*='Login' i], input[type='password'], #btnLogin, #btnSignIn");

        if (isFloodCenterPage) {
          return;
        }

        if (!isMainPage) {
          // Always persist state so it's ready after login / redirect
          try{
            sessionStorage.setItem(K_NG_POL, pol);
            sessionStorage.setItem(K_NG_AWAIT,"1");
          }catch(_){}

          // SAFE GATE: If we're on login, do nothing and let the user sign in
          if (isLoginPage) {
            toast("NatGen: login detected — automation paused. Log in, then refresh.", 4500);
            return;
          }

          // Runaway guard only when we aren't on MainMenu or Login
          if (typeof bumpRunawayGuard === "function" && !bumpRunawayGuard("mci.ng.redirects", 2)) {
            toast("NatGen: auto-redirect stopped, stopping lookup.", 3500);
            finish();
            return;
          }

          location.replace(
            NG_ORIGIN + NG_PATH +
            "#pol=" + encodeURIComponent(pol) +
            "&mci=1&ts=" + encodeURIComponent(keepTs)
          );
          return;
        }

        const input = await waitForSel("#ctl00_MainContent_wgtMainMenuFindPolicy_txtSearchString", 12000);
        if(!input){
          toast("NatGen: search box not found, stopping lookup.", 3000);
          finish();
          return;
        }

        const digits = String(pol).replace(/\D/g,"");
        input.focus();
        input.value = digits;
        input.dispatchEvent(new Event("input",{bubbles:true}));
        input.dispatchEvent(new Event("change",{bubbles:true}));

        const ddl=document.querySelector("#ctl00_MainContent_wgtMainMenuFindPolicy_ddlAction");
        if(ddl && ddl.value!=="0"){
          ddl.value="0";
          ddl.dispatchEvent(new Event("change",{bubbles:true}));
        }

        const btn=document.querySelector("#ctl00_MainContent_wgtMainMenuFindPolicy_btnSearch");
        if(!btn){
          toast("NatGen: search button not found, stopping lookup.", 3000);
          finish();
          return;
        }
        btn.click();

        finish();
      })();
    })();
  }
  // NFIP (TorrentFlood) — quick search on Dashboard/Agency
  if (location.hostname === "nationalgeneral.torrentflood.com") {
    (function nfipAuto(){
      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);
      if(!isArmed()) return;

      // Run only top frame (prevents iframe loops with @allFrames)
      try { if (window.top !== window.self) return; } catch(_) {}

      const hp = getHashParams();
      const polFromHash = hp.get("pol") || "";
      let pol = polFromHash;

      if (!pol) {
        const awaiting = sessionStorage.getItem(K_NFIP_AWAIT) === "1";
        if (!awaiting) return;
        pol = sessionStorage.getItem(K_NFIP_POL) || "";
        if (!pol) return;
      }

      const keepTs = hp.get("ts") || String(Date.now());

      const finish=()=>{
        try{ history.replaceState(null,"",location.pathname+location.search);}catch(_){}
        try{ sessionStorage.removeItem(K_NFIP_POL); sessionStorage.removeItem(K_NFIP_AWAIT);}catch(_){}
        disarmAutomations();
      };

      function visible(el){ if(!el) return false; const r=el.getBoundingClientRect(); return !!(el.offsetParent||r.width||r.height); }
      function waitForSel(selector, timeout=12000){
        return new Promise(resolve=>{
          const t0=performance.now();
          const iv=setInterval(()=>{
            const el=document.querySelector(selector);
            if(el && visible(el)){ clearInterval(iv); resolve(el); }
            else if(performance.now()-t0>timeout){ clearInterval(iv); resolve(null); }
          },150);
        });
      }
      function setNativeValue(el, value){
        try{
          const proto = (el.tagName === "TEXTAREA") ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          if (desc && desc.set) desc.set.call(el, value);
          else el.value = value;
        }catch(_){ try{ el.value = value; }catch(__){} }
      }

      (async ()=>{
        const isAgency = /\/Dashboard\/Agency/i.test(location.pathname || "");

        // Detect if we're on a login screen (URL patterns OR common login controls)
        const isLoginPage =
          /\/Account\/Login/i.test(location.pathname || "") ||
          /\/Login/i.test(location.pathname || "") ||
          !!document.querySelector("input[type='password'], button[type='submit'], #Password, #UserName");

        // Always persist state so it's ready after login / redirect
        try{
          sessionStorage.setItem(K_NFIP_POL, pol);
          sessionStorage.setItem(K_NFIP_AWAIT, "1");
        }catch(_){}

        // SAFE GATE: If login, pause and let user sign in
        if (isLoginPage) {
          toast("NFIP: login detected — automation paused. Log in, then refresh.", 4500);
          return;
        }

        if (!isAgency) {
          location.replace(
            NFIP_ORIGIN + NFIP_PATH +
            "#pol=" + encodeURIComponent(pol) +
            "&mci=1&ts=" + encodeURIComponent(keepTs)
          );
          return;
        }

        const input = await waitForSel("#DashboardQuickSearch_SearchText", 12000);
        if(!input){ toast("NFIP: search box not found, stopping lookup.", 3000); finish(); return; }

        input.focus();
        setNativeValue(input, "");
        input.dispatchEvent(new Event("input",{bubbles:true}));
        setNativeValue(input, pol);
        input.dispatchEvent(new Event("input",{bubbles:true}));
        input.dispatchEvent(new Event("change",{bubbles:true}));

        const btn = await waitForSel("#DashQuickSearchButton", 8000);
        if(!btn){
          toast("NFIP: search button not found, stopping lookup.", 3000);
          finish();
          return;
        }
        btn.click();

        finish();
      })();
    })();
  }

  // BEYOND FLOODS — launch from NatGen Flood Center, open portal, search policy, click View, then View Docs
  if (location.hostname === "natgenagency.com" || location.hostname === "natgen.beyondfloods.com" || location.hostname === "www.natgen.beyondfloods.com") {
    (function beyondFloodsAuto(){
      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);
      if (!isArmed()) return;

      // Run only in top frame
      try { if (window.top !== window.self) return; } catch(_) {}

      const hp = getHashParams();
      const polFromHash = hp.get("bfpol") || "";
      const runFromHash = hp.get("bfrun") || "";
      let pol = polFromHash;
      let runId = runFromHash;

      if (!pol) {
        let awaiting = false;
        try { awaiting = sessionStorage.getItem(K_BF_AWAIT) === "1"; } catch(_) {}

        if (!awaiting) {
          try {
            if (typeof GM_getValue === "function") {
              awaiting = GM_getValue(K_BF_AWAIT_GM, "") === "1";
            }
          } catch(_) {}
        }

        if (!awaiting) return;

        try { pol = sessionStorage.getItem(K_BF_POL) || ""; } catch(_) {}
        try { runId = runId || sessionStorage.getItem(K_BF_RUN) || ""; } catch(_) {}

        if (!pol) {
          try {
            if (typeof GM_getValue === "function") {
              pol = String(GM_getValue(K_BF_POL_GM, "") || "").trim();
            }
          } catch(_) {}
        }

        if (!runId) {
          try {
            if (typeof GM_getValue === "function") {
              runId = String(GM_getValue(K_BF_RUN_GM, "") || "").trim();
            }
          } catch(_) {}
        }

        if (!pol || !runId) return;
      }

      // Only the active Beyond Floods run should continue.
      try {
        const activeRun = typeof GM_getValue === "function"
          ? String(GM_getValue(K_BF_RUN_GM, "") || "").trim()
          : "";
        if (!runId || !activeRun || runId !== activeRun) return;
      } catch(_) {
        return;
      }

      // Only ONE Beyond Floods portal tab may own the run.
      const isBFHost =
        location.hostname === "natgen.beyondfloods.com" ||
        location.hostname === "www.natgen.beyondfloods.com";
      const myBfTabId = getBfTabId();

      if (isBFHost) {
        try {
          let owner = typeof GM_getValue === "function"
            ? String(GM_getValue(K_BF_OWNER_GM, "") || "").trim()
            : "";

          if (!owner && typeof GM_setValue === "function") {
            GM_setValue(K_BF_OWNER_GM, myBfTabId);
            owner = myBfTabId;
          }

          if (!owner || owner !== myBfTabId) return;
        } catch(_) {
          return;
        }
      }

      const keepTs = hp.get("ts") || String(Date.now());

      const finish = () => {
        try { history.replaceState(null, "", location.pathname + location.search); } catch(_) {}
        try {
          sessionStorage.removeItem(K_BF_POL);
          sessionStorage.removeItem(K_BF_AWAIT);
          sessionStorage.removeItem(K_BF_RUN);
          sessionStorage.removeItem(K_BF_LAUNCHED);
        } catch(_) {}
        try {
          if (typeof GM_deleteValue === "function") {
            const owner = String(GM_getValue(K_BF_OWNER_GM, "") || "").trim();
            if (owner && owner === myBfTabId) {
              GM_deleteValue(K_BF_OWNER_GM);
            }
            GM_deleteValue(K_BF_POL_GM);
            GM_deleteValue(K_BF_AWAIT_GM);
            GM_deleteValue(K_BF_RUN_GM);
          }
        } catch(_) {}
        disarmAutomations();
      };

      function visible(el){
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent || r.width || r.height);
      }

      function waitForSel(selector, timeout=15000){
        return new Promise(resolve => {
          const t0 = performance.now();
          const iv = setInterval(() => {
            const el = document.querySelector(selector);
            if (el && visible(el)) {
              clearInterval(iv);
              resolve(el);
            } else if (performance.now() - t0 > timeout) {
              clearInterval(iv);
              resolve(null);
            }
          }, 150);
        });
      }

      function sleep(ms){
        return new Promise(r => setTimeout(r, ms));
      }

      function setNativeValue(el, value){
        try{
          const proto = (el.tagName === "TEXTAREA") ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          if (desc && desc.set) desc.set.call(el, value);
          else el.value = value;
        }catch(_){
          try{ el.value = value; }catch(__){}
        }
      }

      (async () => {
        const host = location.hostname.toLowerCase();
        const path = location.pathname || "";

        // Keep state alive across redirects/pages
        try {
          sessionStorage.setItem(K_BF_POL, pol);
          sessionStorage.setItem(K_BF_AWAIT, "1");
        } catch(_) {}

        const isLoginPage =
          /\/login/i.test(path) ||
          !!document.querySelector("input[type='password'], input[name*='user' i], input[name*='login' i], #Login, #LoginButton, #btnLogin, #btnSignIn");

        if (isLoginPage) {
          toast("Beyond Floods: login detected - automation paused. Log in, then refresh.", 4500);
          return;
        }

        // STEP 1: NatGen Flood Center page -> click Beyond Floods access button ONCE
        if (host === "natgenagency.com" && /\/Flood\/FloodCenter\.aspx$/i.test(path)) {
          try {
            const launched = sessionStorage.getItem(K_BF_LAUNCHED) === "1";
            const launchedRun = sessionStorage.getItem(K_BF_RUN) || "";
            if (launched && launchedRun && launchedRun === runId) {
              return;
            }
          } catch(_) {}

          const btn = await waitForSel("#ctl00_MainContent_btnNatGenFlood", 15000);
          if (!btn) {
            toast("Beyond Floods: access button not found, stopping lookup.", 3000);
            finish();
            return;
          }

          try {
            sessionStorage.setItem(K_BF_LAUNCHED, "1");
            sessionStorage.setItem(K_BF_RUN, runId);
          } catch(_) {}

          // Stop THIS launcher tab from looping, but keep cross-tab armed state alive
          try {
            sessionStorage.removeItem(K_BF_AWAIT);
            sessionStorage.removeItem(K_BF_POL);
            sessionStorage.removeItem(K_ARMED);
            sessionStorage.removeItem(K_ARMED_TS);
          } catch(_) {}

          try {
            const s = document.createElement("script");
            s.textContent = `
              try {
                if (typeof __doPostBack === "function") {
                  __doPostBack('ctl00$MainContent$btnNatGenFlood','');
                } else {
                  var el = document.getElementById('ctl00_MainContent_btnNatGenFlood');
                  if (el) el.click();
                }
              } catch (e) {}
            `;
            document.documentElement.appendChild(s);
            s.remove();
          } catch(_) {
            btn.click();
          }

          toast('Beyond Floods: opening portal...', 2200);
          return;
        }

        // If we're on natgenagency.com but NOT the Flood Center page, send user there first
        if (host === "natgenagency.com" && !/\/Flood\/FloodCenter\.aspx$/i.test(path)) {
          location.replace(
            BF_LAUNCH_ORIGIN + BF_LAUNCH_PATH +
            "#bfpol=" + encodeURIComponent(pol) +
            "&bfrun=" + encodeURIComponent(runId) +
            "&mci=1&ts=" + encodeURIComponent(keepTs)
          );
          return;
        }

        // STEP 2: Portal landing page -> go to Dashboard in same tab
        if ((host === "natgen.beyondfloods.com" || host === "www.natgen.beyondfloods.com") && /\/Public\/Index$/i.test(path)) {
          const dashLink = await waitForSel('a.instanda-nav-item-link[href="/Public/AgentDashboard"]', 15000);
          if (!dashLink) {
            toast("Beyond Floods: Dashboard link not found, stopping lookup.", 3000);
            finish();
            return;
          }

          const href = dashLink.getAttribute("href") || "/Public/AgentDashboard";
          location.assign(href);
          return;
        }

        // If we're on the BF site but not yet on the dashboard, go there directly
        if ((host === "natgen.beyondfloods.com" || host === "www.natgen.beyondfloods.com") &&
            !/\/Public\/AgentDashboard$/i.test(path) &&
            !/\/Public\/ViewQuoteOrPolicy/i.test(path) &&
            !/\/Public\/AgentAllDocs/i.test(path)) {
          location.replace(
            BF_ORIGIN + BF_DASH_PATH +
            "#bfpol=" + encodeURIComponent(pol) +
            "&mci=1&ts=" + encodeURIComponent(keepTs)
          );
          return;
        }

        // STEP 3: Dashboard -> fill Policy Number and click Search
        if ((host === "natgen.beyondfloods.com" || host === "www.natgen.beyondfloods.com") && /\/Public\/AgentDashboard$/i.test(path)) {
          const input = await waitForSel('input[name="SearchParams[3].ParameterValue"]', 15000);
          if (!input) {
            toast("Beyond Floods: policy number field not found, stopping lookup.", 3000);
            finish();
            return;
          }

          input.focus();
          setNativeValue(input, "");
          input.dispatchEvent(new Event("input", { bubbles:true }));
          setNativeValue(input, pol);
          input.dispatchEvent(new Event("input", { bubbles:true }));
          input.dispatchEvent(new Event("change", { bubbles:true }));

          await sleep(150);

          const searchBtn = await waitForSel("#agentSearchButton", 8000);
          if (!searchBtn) {
            toast("Beyond Floods: search button not found, stopping lookup.", 3000);
            finish();
            return;
          }

          searchBtn.click();

          const viewLink = await waitForSel('a[href*="/Public/ViewQuoteOrPolicy"]', 15000);
          if (!viewLink) {
            toast("Beyond Floods: View link not found, stopping lookup.", 3000);
            finish();
            return;
          }

          const href = viewLink.getAttribute("href");
          if (!href) {
            toast("Beyond Floods: View link href missing, stopping lookup.", 3000);
            finish();
            return;
          }

          location.assign(href);
          return;
        }

        // STEP 4: Policy page -> go to View Docs in same tab
        if ((host === "natgen.beyondfloods.com" || host === "www.natgen.beyondfloods.com") && /\/Public\/ViewQuoteOrPolicy/i.test(path)) {
          const docsBtn = await waitForSel('a.btnViewDocs[href*="/Public/AgentAllDocs"]', 15000);
          if (!docsBtn) {
            toast("Beyond Floods: View Docs button not found, stopping lookup.", 3000);
            finish();
            return;
          }

          const href = docsBtn.getAttribute("href");
          if (!href) {
            toast("Beyond Floods: View Docs href missing, stopping lookup.", 3000);
            finish();
            return;
          }

          location.assign(href);
          return;
        }

        // STEP 5: Already on docs page
        if ((host === "natgen.beyondfloods.com" || host === "www.natgen.beyondfloods.com") && /\/Public\/AgentAllDocs/i.test(path)) {
          toast(`Beyond Floods Docs: ${pol}`, 2200);
          finish();
          return;
        }
      })();
    })();
  }

  // Orion180 - search policy and open customer policy page
  if (location.hostname === "app.orion180.com") {
    (function orion180Auto(){
      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);
      if (!isArmed()) return;

      // Run only in top frame
      try { if (window.top !== window.self) return; } catch(_) {}

      const hp = getHashParams();
      const sp = new URLSearchParams(location.search || "");
      const polFromHash = hp.get("pol") || "";
      const polFromQuery = sp.get("pol") || "";
      let pol = polFromHash || polFromQuery;

      if (!pol) {
        try {
          const awaiting = sessionStorage.getItem(K_ORION_AWAIT) === "1";
          if (awaiting) pol = sessionStorage.getItem(K_ORION_POL) || "";
        } catch(_) {}
      }

      if (!pol) {
        try {
          if (typeof GM_getValue === "function" && GM_getValue(K_ORION_AWAIT, "") === "1") {
            pol = GM_getValue(K_ORION_POL, "") || "";
          }
        } catch(_) {}
      }

      pol = String(pol || "").trim().toUpperCase();
      if (!pol) return;

      const keepTs = hp.get("ts") || sp.get("ts") || String(Date.now());

      const finish = () => {
        try { history.replaceState(null, "", location.pathname + location.search); } catch(_) {}
        try {
          sessionStorage.removeItem(K_ORION_POL);
          sessionStorage.removeItem(K_ORION_AWAIT);
        } catch(_) {}
        try {
          if (typeof GM_deleteValue === "function") {
            GM_deleteValue(K_ORION_POL);
            GM_deleteValue(K_ORION_AWAIT);
          }
        } catch(_) {}
        disarmAutomations();
      };

      function visible(el){
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent || r.width || r.height);
      }

      function waitFor(predicate, timeout=15000, interval=150){
        return new Promise(resolve => {
          const t0 = performance.now();
          const iv = setInterval(() => {
            let found = null;
            try { found = predicate(); } catch(_) {}
            if (found) {
              clearInterval(iv);
              resolve(found);
            } else if (performance.now() - t0 > timeout) {
              clearInterval(iv);
              resolve(null);
            }
          }, interval);
        });
      }

      function waitForSel(selector, timeout=15000){
        return waitFor(() => {
          const el = document.querySelector(selector);
          return el && visible(el) ? el : null;
        }, timeout);
      }

      function setNativeValue(el, value){
        try{
          const proto = (el.tagName === "TEXTAREA") ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          if (desc && desc.set) desc.set.call(el, value);
          else el.value = value;
        }catch(_){ try{ el.value = value; }catch(__){} }
      }

      function normalizedPolicy(value){
        return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      }

      function findSearchButton(){
        const exact = document.querySelector("button.btn.btn-quote-primary.mr-4");
        if (exact && visible(exact) && /search/i.test(norm(exact.innerText || exact.textContent || ""))) return exact;

        return Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button']"))
          .find(btn => visible(btn) && /search/i.test(norm(btn.innerText || btn.textContent || btn.value || btn.getAttribute("aria-label") || "")));
      }

      function findMatchingRow(){
        const target = normalizedPolicy(pol);
        if (!target) return null;

        const rows = Array.from(document.querySelectorAll("table tbody tr, table tr"));
        return rows.find(row => {
          if (!visible(row)) return false;
          const rowText = normalizedPolicy(row.innerText || row.textContent || "");
          return rowText.indexOf(target) >= 0;
        }) || null;
      }

      function findViewControl(row){
        if (!row) return null;
        const controls = Array.from(row.querySelectorAll("a, button, [role='button']"));
        return controls.find(el => visible(el) && /^view$/i.test(norm(el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || ""))) ||
               controls.find(el => visible(el) && /view/i.test(norm(el.innerText || el.textContent || el.value || el.getAttribute("aria-label") || "")));
      }

      (async () => {
        const isSearchPage = /\/search/i.test(location.pathname || "");
        const isLoginPage =
          /\/login/i.test(location.pathname || "") ||
          !!document.querySelector("input[type='password'], input[name*='user' i], input[name*='login' i], button[type='submit']");

        try {
          sessionStorage.setItem(K_ORION_POL, pol);
          sessionStorage.setItem(K_ORION_AWAIT, "1");
        } catch(_) {}

        try {
          if (typeof GM_setValue === "function") {
            GM_setValue(K_ORION_POL, pol);
            GM_setValue(K_ORION_AWAIT, "1");
          }
        } catch(_) {}

        if (!isSearchPage) {
          if (isLoginPage) {
            toast("Orion180: login detected - automation paused. Log in, then refresh.", 4500);
            return;
          }

          location.replace(
            ORION_ORIGIN + ORION_PATH +
            "?tab=policies&diary=false&mci=1&ts=" + encodeURIComponent(keepTs) +
            "#pol=" + encodeURIComponent(pol)
          );
          return;
        }

        const input = await waitForSel("#policyNumber", 20000);
        if (!input) {
          toast("Orion180: search box not found, stopping lookup.", 3000);
          finish();
          return;
        }

        input.focus();
        setNativeValue(input, "");
        input.dispatchEvent(new Event("input", { bubbles:true }));
        setNativeValue(input, pol);
        input.dispatchEvent(new Event("input", { bubbles:true }));
        input.dispatchEvent(new Event("change", { bubbles:true }));
        input.dispatchEvent(new Event("blur", { bubbles:true }));

        const searchBtn = await waitFor(() => findSearchButton(), 10000);
        if (!searchBtn) {
          toast("Orion180: search button not found, stopping lookup.", 3000);
          finish();
          return;
        }
        searchBtn.click();

        const row = await waitFor(() => findMatchingRow(), 25000, 200);
        if (!row) {
          toast("Orion180: policy not found, stopping lookup.", 3000);
          finish();
          return;
        }

        const view = await waitFor(() => findViewControl(row), 10000, 200);
        if (!view) {
          toast("Orion180: View link not found, stopping lookup.", 3000);
          finish();
          return;
        }

        view.click();
        toast(`Orion180 Policy: ${pol}`, 2200);
        finish();
      })();
    })();
  }

  // NCJUA — search policy and open Policy File
  if (location.hostname === "insure.ncjuanciua.org") {
    (function ncjuaAuto(){
      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);
      if (!isArmed()) return;

      // Run only in top frame
      try { if (window.top !== window.self) return; } catch(_) {}

      const hp = getHashParams();
      const polFromHash = hp.get("pol") || "";
      let pol = polFromHash;

      if (!pol) {
        const awaiting = sessionStorage.getItem(K_NCJUA_AWAIT) === "1";
        if (!awaiting) return;
        pol = sessionStorage.getItem(K_NCJUA_POL) || "";
        if (!pol) return;
      }

      const keepTs = hp.get("ts") || String(Date.now());

      const finish = () => {
        try { history.replaceState(null, "", location.pathname + location.search); } catch(_) {}
        try {
          sessionStorage.removeItem(K_NCJUA_POL);
          sessionStorage.removeItem(K_NCJUA_AWAIT);
        } catch(_) {}
        disarmAutomations();
      };

      function visible(el){
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return !!(el.offsetParent || r.width || r.height);
      }

      function waitForSel(selector, timeout=15000){
        return new Promise(resolve => {
          const t0 = performance.now();
          const iv = setInterval(() => {
            const el = document.querySelector(selector);
            if (el && visible(el)) {
              clearInterval(iv);
              resolve(el);
            } else if (performance.now() - t0 > timeout) {
              clearInterval(iv);
              resolve(null);
            }
          }, 150);
        });
      }

      function runPageScript(fn, arg){
        const s = document.createElement("script");
        s.textContent = `(${fn})(${JSON.stringify(arg)});`;
        document.documentElement.appendChild(s);
        s.remove();
      }

      (async () => {
        const isInnovation = /\/innovation/i.test(location.pathname || "");
        const isLoginPage =
          /\/login/i.test(location.pathname || "") ||
          !!document.querySelector("input[type='password'], input[name*='user' i], input[name*='login' i], #Login, #LoginButton");

        if (!isInnovation) {
          try {
            sessionStorage.setItem(K_NCJUA_POL, pol);
            sessionStorage.setItem(K_NCJUA_AWAIT, "1");
          } catch(_) {}

          if (isLoginPage) {
            toast("NCJUA: login detected - automation paused. Log in, then refresh.", 4500);
            return;
          }

          location.replace(
            NCJUA_ORIGIN + NCJUA_PATH +
            "#pol=" + encodeURIComponent(pol) +
            "&mci=1&ts=" + encodeURIComponent(keepTs)
          );
          return;
        }

        // Persist in THIS tab so if the page navigates after search, the next load can continue
        try {
          sessionStorage.setItem(K_NCJUA_POL, pol);
          sessionStorage.setItem(K_NCJUA_AWAIT, "1");
        } catch(_) {}

        // Step 2 first: if Policy File is already present, click it and finish
        const existingPolicyFile =
          document.querySelector("#Tab_Documents") ||
          document.querySelector("a.menu-item-link[title='Policy File']");

        if (existingPolicyFile && visible(existingPolicyFile)) {
          existingPolicyFile.click();
          toast(`NCJUA Policy File: ${pol}`, 2200);
          finish();
          return;
        }

        // Step 1: perform search from the PAGE context
        const input = await waitForSel("#ToolbarSearchText", 15000);
        if (!input) {
          toast("NCJUA: search box not found, stopping lookup.", 3000);
          finish();
          return;
        }

        runPageScript(function(policyNumber){
          try {
            var input = document.getElementById("ToolbarSearchText");
            if (!input) return;

            // prevent opening in a separate window
            var newWin = document.getElementById("SearchNewWindow");
            if (newWin) newWin.checked = false;

            input.focus();
            input.value = policyNumber;
            input.setAttribute("value", policyNumber);

            if (window.jQuery) {
              window.jQuery(input).val(policyNumber).trigger("input").trigger("change").trigger("blur");
            } else {
              input.dispatchEvent(new Event("input", { bubbles:true }));
              input.dispatchEvent(new Event("change", { bubbles:true }));
              input.dispatchEvent(new Event("blur", { bubbles:true }));
            }

            if (typeof siteSearchService === "function") {
              siteSearchService();
              return;
            }

            var btn = document.getElementById("ToolbarSearch");
            if (btn) btn.click();
          } catch (e) {}
        }, pol);

        // After search, the page may re-render or navigate.
        // Wait a bit to see if Policy File appears on this same page.
        const policyFileLink = await waitForSel("#Tab_Documents, a.menu-item-link[title='Policy File']", 15000);
        if (policyFileLink) {
          policyFileLink.click();
          toast(`NCJUA Policy File: ${pol}`, 2200);
          finish();
          return;
        }

        toast("NCJUA: policy not found, stopping lookup.", 3000);
        finish();
      })();
    })();
  }

  // PROGRESSIVE (FAO) — safe automation: waits for login instead of looping
  if (location.hostname === "www.foragentsonly.com") {
    (function progressiveAuto(){
      if (window.top !== window.self) return;

      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);

      // If we're not armed, still allow a pending GM policy to run after login (user triggered it in another tab)
      let pending = "";
      try{
        const sp = new URLSearchParams(location.search || "");
        pending = (sp.get("pol") || "").trim();
      }catch(_){}

      if(!pending){
        try{ pending = String(GM_getValue(K_PR_PENDING_GM, "") || "").trim(); }catch(_){ pending = ""; }
      }
      if(!pending){
        try{ pending = String(GM_getValue(K_PR_POL, "") || "").trim(); }catch(_){ pending = ""; }
      }

      // Nothing to do
      if(!pending) { disarmAutomations(); return; }

      // If neither token nor arm exists, we still proceed (because policy is explicitly pending)
      const allowed = isArmed() || !!pending;

      // Heuristic: login page detection
      function looksLikeLogin(){
        const u = (location.href || "").toLowerCase();
        if (u.includes("/login")) return true;
        if (document.querySelector("input[type='password']")) return true;
        const btn = Array.from(document.querySelectorAll("button, input[type='submit']")).find(b=>{
          const t = (b.innerText||b.value||"").toLowerCase();
          return /log\s*in|sign\s*in/.test(t);
        });
        return !!btn;
      }

      // If login page: do nothing (keep pending) and do NOT disarm.
      if(looksLikeLogin()){
        // One small hint toast (rate-limited)
        try{
          const k="mci.pr.loginToastTs";
          const last=parseInt(sessionStorage.getItem(k)||"0",10);
          if(!last || Date.now()-last>12000){
            sessionStorage.setItem(k, String(Date.now()));
            toast("MCI Smart Lookup: log into Progressive, then refresh this tab (or open policy search).", 3500);
          }
        }catch(_){}
        return;
      }

      if(!allowed) return;

      // Only run once per tab. If stale pending data reaches an already-used page, clear it.
      try{
        if (sessionStorage.getItem(K_PR_RAN) === "1") {
          toast("Progressive: lookup already attempted, stopping lookup.", 3000);
          try{ history.replaceState(null, "", location.pathname); }catch(_){}
          try{ if (typeof GM_deleteValue === "function") GM_deleteValue(K_PR_PENDING_GM); }catch(_){}
          try{ if (typeof GM_deleteValue === "function") GM_deleteValue(K_PR_POL); }catch(_){}
          try{ if (typeof GM_deleteValue === "function") GM_deleteValue(K_PR_PENDING_TS); }catch(_){}
          disarmAutomations();
          return;
        }
      }catch(_){}

      function visible(el){
        if(!el) return false;
        const r=el.getBoundingClientRect();
        return !!(el.offsetParent || r.width || r.height);
      }
      function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

      async function waitForAny(selectors, ms){
        const t0=performance.now();
        while(performance.now()-t0<ms){
          for(const sel of selectors){
            const el=document.querySelector(sel);
            if(el && visible(el)) return el;
          }
          await sleep(150);
        }
        return null;
      }

      function setNativeValue(el, value){
        try{
          const proto = (el.tagName === "TEXTAREA") ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          if (desc && desc.set) desc.set.call(el, value);
          else el.value = value;
        }catch(_){ try{ el.value = value; }catch(__){} }
      }

      function isNameField(input){
        const sig = (
          (input.getAttribute("aria-label")||"") + " " +
          (input.getAttribute("data-at")||"") + " " +
          (input.getAttribute("data-label")||"") + " " +
          (input.placeholder||"") + " " +
          (input.name||"") + " " +
          (input.id||"")
        ).toLowerCase();
        if (/sbp_userselectedlastname/.test(sig)) return true;
        if (/sbp_userselectedfirstname/.test(sig)) return true;
        if (/\blast name\b/.test(sig)) return true;
        if (/\bfirst name\b/.test(sig)) return true;
        if (/sbp-lastname/.test(sig)) return true;
        if (/sbp-firstname/.test(sig)) return true;
        return false;
      }

      function clickPolicyRadio(){
        const inp = document.querySelector("#SBP_PolSearch");
        if(inp && visible(inp)){ inp.click(); return true; }
        const lab = document.querySelector('label[for="SBP_PolSearch"]');
        if(lab && visible(lab)){ lab.click(); return true; }
        return false;
      }

      function pickPolicyInput(){
        const inputs = Array.from(document.querySelectorAll("input[type='text'], input[type='search'], input:not([type])"))
          .filter(i => visible(i) && !i.disabled && !i.readOnly);
        if(!inputs.length) return null;

        const ranked = inputs.map(i=>{
          const sig = (
            (i.getAttribute("aria-label")||"") + " " +
            (i.getAttribute("data-at")||"") + " " +
            (i.getAttribute("data-label")||"") + " " +
            (i.placeholder||"") + " " +
            (i.name||"") + " " +
            (i.id||"")
          ).toLowerCase();
          let score = 0;
          if (i.closest && i.closest(".search-bar")) score += 20;
          if (/policy/.test(sig)) score += 80;
          if (/polsearch|pol/.test(sig)) score += 10;
          if (isNameField(i)) score -= 200;
          return {i, score};
        }).sort((a,b)=>b.score-a.score);

        const best = ranked[0] ? ranked[0].i : null;
        if(best && !isNameField(best)) return best;

        const nonName = inputs.find(i=>!isNameField(i));
        return nonName || null;
      }

      function clickSearch(){
        const btn = document.querySelector("#sbp-search") || document.querySelector("button.js-search-bar__search");
        if(btn && visible(btn)){ btn.click(); return true; }
        return false;
      }

      function finish(){
        try{ sessionStorage.setItem(K_PR_RAN, "1"); }catch(_){}
        try{ history.replaceState(null, "", location.pathname); }catch(_){}
        try{ if (typeof GM_deleteValue === "function") GM_deleteValue(K_PR_PENDING_GM); }catch(_){}
        try{ if (typeof GM_deleteValue === "function") GM_deleteValue(K_PR_POL); }catch(_){}
        try{ if (typeof GM_deleteValue === "function") GM_deleteValue(K_PR_PENDING_TS); }catch(_){}
        disarmAutomations();
      }

      (async function run(){
        // Wait for the search UI to exist; if it never appears, do NOT loop forever.
        const searchBtn = await waitForAny(["#sbp-search", "button.js-search-bar__search"], CFG.faoWaitMs);
        if(!searchBtn){
          toast("Progressive: search UI not found, stopping lookup.", 3500);
          finish();
          return;
        }

        clickPolicyRadio();
        await sleep(600);

        const input = pickPolicyInput();
        if(input){
          input.focus();
          setNativeValue(input, "");
          input.dispatchEvent(new Event("input",{bubbles:true}));
          await sleep(60);
          setNativeValue(input, pending);
          input.dispatchEvent(new Event("input",{bubbles:true}));
          input.dispatchEvent(new Event("change",{bubbles:true}));
        } else {
          toast("Progressive: search UI not found, stopping lookup.", 3500);
          finish();
          return;
        }

        await sleep(200);
        if(!clickSearch()){
          toast("Progressive: search UI not found, stopping lookup.", 3500);
          finish();
          return;
        }

        finish();
      })();
    })();
  }

  /* ================= VEXCEL (SPA) ================= */
  if (location.hostname === "app.vexcelgroup.com") {
    (function vexcelAuto(){
      const tok = tokenOKFromLocation();
      if (tok.ok) armAutomations(tok.ts);
      if(!isArmed()) return;

      const wantParams = getHashParams();
      const addrFromHash = wantParams.get("address") ? decodeURIComponent(wantParams.get("address")) : null;

      const storedFlag = sessionStorage.getItem(K_VEX_AWAIT) === "1";
      const storedAddr = sessionStorage.getItem(K_VEX_ADDR) || "";

      if (!addrFromHash && !(storedFlag && storedAddr)) return;

      const addr = (addrFromHash || storedAddr || "").trim();
      if (!addr) { sessionStorage.removeItem(K_VEX_AWAIT); disarmAutomations(); return; }

      const s = document.createElement("script");
      s.textContent = `(() => {
        const ADDR = ${JSON.stringify(addr)};

        const sleep = ms => new Promise(r=>setTimeout(r, ms));
        const visible = el => !!el && (()=>{const r=el.getBoundingClientRect();return !!(el.offsetParent||r.width||r.height);})();

        function addOverlay(text){
          const id = "mci-vexcel-overlay";
          if (document.getElementById(id)) return id;

          const style = document.createElement("style");
          style.id = id + "-style";
          style.textContent = \`
            @keyframes mci-spin { to { transform: rotate(360deg); } }
            #\${id}{
              position: fixed; inset: 0; background: rgba(0,0,0,.45);
              display: flex; align-items: center; justify-content: center;
              z-index: 2147483647;
            }
            #\${id} .card{
              background: #121212; color: #fff; padding: 18px 20px; border-radius: 12px;
              box-shadow:0 10px 30px rgba(0,0,0,.45); display:flex; align-items:center; gap:12px;
              font: 14px/1.4 system-ui,Segoe UI,Arial;
              max-width: 80vw;
            }
            #\${id} .spinner{
              width: 18px; height: 18px; border-radius: 50%;
              border: 2px solid rgba(255,255,255,.2); border-top-color: #4da3ff;
              animation: mci-spin .9s linear infinite;
            }
            #\${id} .text{ white-space: nowrap; }
          \`;
          document.head.appendChild(style);

          const overlay = document.createElement("div");
          overlay.id = id;
          overlay.innerHTML = '<div class="card"><div class="spinner"></div><div class="text"></div></div>';
          document.body.appendChild(overlay);
          updateOverlay(text);
          return id;
        }
        function updateOverlay(text){
          const t = document.querySelector("#mci-vexcel-overlay .text");
          if (t) t.textContent = text;
        }
        function removeOverlay(){
          const id="mci-vexcel-overlay";
          document.getElementById(id)?.remove();
          document.getElementById(id+"-style")?.remove();
        }

        (async () => {
          const hasAddressParam = /[?&]address=/i.test(location.hash||"");
          if (!hasAddressParam) {
            location.hash = '#/app/home?address=' + encodeURIComponent(ADDR);
          }

          addOverlay('Loading map for “' + ADDR + '”…');

          if (document.readyState !== 'complete') {
            await new Promise(res => window.addEventListener('load', res, {once:true}));
          }
          await sleep(500);

          const t0 = performance.now();
          while (performance.now() - t0 < 10000) {
            if (/[?&]latitude=/.test(location.hash||"") && /[?&]longitude=/.test(location.hash||"")) {
              updateOverlay("Map centered.");
              await sleep(500);
              removeOverlay();
              return;
            }
            await sleep(200);
          }

          updateOverlay("Finalizing…");
          const input = document.querySelector('#searchText');
          if (input && visible(input)) {
            try { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ADDR); }
            catch { input.value = ADDR; }
            input.dispatchEvent(new InputEvent('input', {bubbles:true, cancelable:true, inputType:'insertFromPaste', data: ADDR}));
            input.dispatchEvent(new Event('change', {bubbles:true, cancelable:true}));
            await sleep(120);
            ['keydown','keypress','keyup'].forEach(type => {
              input.dispatchEvent(new KeyboardEvent(type, {bubbles:true, cancelable:true, key:'Enter', code:'Enter', keyCode:13, which:13}));
            });
            await sleep(800);
          }
          removeOverlay();
        })();
      })();`;

      document.documentElement.appendChild(s);
      s.remove();

      sessionStorage.removeItem(K_VEX_AWAIT);
      try { history.replaceState(null,"", location.pathname + location.search); } catch {}
      disarmAutomations();
    })();
  }

})();
