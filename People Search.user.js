// ==UserScript==
// MCI internal tooling
// Copyright (c) 2025 Middle Creek Insurance. All rights reserved.
// Not authorized for redistribution or resale.
// @name        People Search (MCI)
// @namespace   mci-tools
// @version     1.0.0
// @description ALT+Right-Click: pinned people search chooser for LinkedIn, Google, and Facebook.
// @match       *://*/*
// @match       file://*/*
// @match       https://www.linkedin.com/*
// @grant       GM_openInTab
// @grant       GM_addStyle
// @run-at      document-idle
// ==/UserScript==

(function(){
  "use strict";

  /* ================= TOAST ================= */
  GM_addStyle(`
    .mci-people-toast{
      position:fixed; z-index:2147483647; left:50%; top:18px;
      transform:translateX(-50%);
      background:#111; color:#fff; padding:8px 12px; border-radius:8px;
      font:12px/1.35 system-ui,Segoe UI,Arial;
      box-shadow:0 4px 18px rgba(0,0,0,.35);
      opacity:.95; pointer-events:none;
    }
  `);

  function toast(msg, ms=1600){
    try{
      const t = document.createElement("div");
      t.className = "mci-people-toast";
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), ms);
    }catch(_){}
  }

  /* ================= HOVER / SELECTION ================= */
  let lastHoverText = "";
  document.addEventListener("mouseover", (e) => {
    const tag = (e.target && e.target.tagName || "").toLowerCase();
    if(tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;
    const t = (e.target && (e.target.innerText || e.target.textContent) || "").trim();
    if(t) lastHoverText = t;
  }, {capture:true, passive:true});

  function getSelectedOrHoverText(){
    const sel = (window.getSelection && window.getSelection().toString().trim()) || "";
    if(sel) return sel;
    return (lastHoverText || "").trim();
  }

  /* ================= NAME HELPERS ================= */
  function extractLeadingName(raw){
    let s = String(raw || "")
      .replace(/\s+/g, " ")
      .replace(/[,\u2013\u2014-]\s*(first\s+named\s+insured|named\s+insured|insured|policyholder|applicant|contact|primary)\b.*$/i, "")
      .replace(/\s*\((first\s+named\s+insured|named\s+insured|insured|policyholder|applicant|primary)\)\s*$/i, "")
      .trim();
    s = s.split(/\s+[-\u2013\u2014]\s+|\s*\/\s*|\s*\|\s*|\s*\u00b7\s*/)[0].trim();
    const m = s.match(/^\s*([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){1,3})\b/u);
    if(m) return m[1];
    const tokens = s.split(" ").filter(Boolean);
    if(tokens.length >= 2 && /^[A-Za-z]/.test(tokens[0])){
      return tokens.slice(0, Math.min(tokens.length, 4)).join(" ");
    }
    return s;
  }

  function cleanNameForSearch(raw){
    const suffixes = /^(jr|sr|ii|iii|iv|v|vi)\.?$/i;
    const clean = String(raw || "").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
    const parts = clean.split(" ").filter(Boolean);
    const filtered = [];
    for(const p of parts){
      const naked = p.replace(/\./g, "");
      if(naked.length === 1) continue;
      if(suffixes.test(naked)) continue;
      filtered.push(p);
    }
    return (filtered.length >= 2 ? filtered.join(" ") : clean);
  }

  function isLikelyName(s){
    const clean = String(s || "").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
    const parts = clean.split(" ").filter(Boolean);
    if(parts.length < 2 || parts.length > 5) return false;
    return parts.every(p => /^[\p{L}'\-\.]+$/u.test(p));
  }

  function getTextUnderCursor(evt){
    try{
      let node = document.elementFromPoint(evt.clientX, evt.clientY);
      if(!node) return "";
      if(node.nodeType === 3) node = node.parentNode;
      if(!node) return "";

      let txt = ((node.innerText || node.textContent) || "").trim();
      if(txt && txt.length > 120 && node.querySelector){
        const small = node.querySelector("a, span, div, td, th, label");
        if(small){
          const t2 = ((small.innerText || small.textContent) || "").trim();
          if(t2) txt = t2;
        }
      }
      return txt || "";
    }catch(_){
      return "";
    }
  }

  /* ================= OPENERS ================= */
  function openNameLookup(nameRaw, mode){
    const leading = extractLeadingName(nameRaw);
    const cleaned = cleanNameForSearch(leading);
    if(!cleaned){ toast("No name detected."); return; }

    if(mode === "google"){
      GM_openInTab(`https://www.google.com/search?q=${encodeURIComponent(cleaned)}`, {active:true, insert:true});
      toast(`Google: ${cleaned}`);
      return;
    }

    if(mode === "facebook"){
      GM_openInTab(`https://www.facebook.com/search/people/?q=${encodeURIComponent(cleaned)}`, {active:true, insert:true});
      toast(`Facebook: ${cleaned}`);
      return;
    }

    GM_openInTab(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(cleaned)}`, {active:true, insert:true});
    toast(`LinkedIn: ${cleaned}`);
  }

  /* ================= ALT+RIGHT-CLICK CHOOSER ================= */
  GM_addStyle(`
    #mci-people-chooser{
      position:fixed; z-index:2147483647; display:none;
      background:rgba(15,15,15,.94); color:#fff;
      border:1px solid rgba(255,255,255,.14);
      border-radius:10px; box-shadow:0 10px 28px rgba(0,0,0,.38);
      padding:8px; font:12px/1.25 system-ui,Segoe UI,Arial;
      width:220px; min-width:170px;
    }
    #mci-people-chooser .mci-people-row{display:flex; align-items:center; gap:8px;}
    #mci-people-chooser .mci-people-lbl{opacity:.85; font-size:11px; white-space:nowrap;}
    #mci-people-chooser select{
      flex:1; width:100%; padding:6px 8px; border-radius:8px;
      border:1px solid rgba(255,255,255,.14);
      background:#fff; color:#111; outline:none;
    }
    #mci-people-chooser select option{color:#111; background:#fff;}
    #mci-people-chooser .mci-people-sub{
      margin-top:6px; opacity:.8; font-size:11px;
      max-width:520px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    #mci-people-chooser button{
      cursor:pointer; border:1px solid rgba(255,255,255,.14);
      background:#fff; color:#111; border-radius:8px; padding:6px 8px; line-height:1;
    }
  `);

  const PeopleChooser = (function(){
    let el = null, sel = null, sub = null;
    let x = 40, y = 40;

    function ensure(){
      if(el) return;

      el = document.createElement("div");
      el.id = "mci-people-chooser";
      el.innerHTML = `
        <div class="mci-people-row">
          <div class="mci-people-lbl">Open:</div>
          <select id="mci-people-select"></select>
          <button id="mci-people-close" title="Close">x</button>
        </div>
        <div class="mci-people-sub" id="mci-people-sub"></div>
      `;
      document.body.appendChild(el);

      sel = el.querySelector("#mci-people-select");
      sub = el.querySelector("#mci-people-sub");

      el.querySelector("#mci-people-close").addEventListener("click", hide, true);
      window.addEventListener("keydown", (e) => { if(e.key === "Escape") hide(); }, true);
      window.addEventListener("mousedown", (e) => {
        if(!el || el.style.display === "none") return;
        if(el.contains(e.target)) return;
        hide();
      }, true);

      sel.addEventListener("change", () => {
        const value = sel.value;
        if(!value) return;
        const name = sel._mciPeopleName || "";
        hide();
        openNameLookup(name, value);
        sel.value = "";
      });

      el.addEventListener("contextmenu", (e) => { e.preventDefault(); }, true);
    }

    function hide(){
      if(!el) return;
      el.style.display = "none";
    }

    function position(){
      if(!el) return;
      const pad = 10;
      const w = el.offsetWidth || 220;
      const h = el.offsetHeight || 70;
      let left = x + 10, top = y + 12;
      left = Math.min(left, window.innerWidth - w - pad);
      top = Math.min(top, window.innerHeight - h - pad);
      left = Math.max(pad, left);
      top = Math.max(pad, top);
      el.style.left = left + "px";
      el.style.top = top + "px";
    }

    function openPinned(text, clientX, clientY){
      const raw = String(text || "").trim();
      const leading = extractLeadingName(raw);
      const cleaned = cleanNameForSearch(leading);
      if(!raw || !isLikelyName(cleaned)){
        toast("No name detected.");
        return;
      }

      x = (typeof clientX === "number") ? clientX : 40;
      y = (typeof clientY === "number") ? clientY : 40;

      ensure();
      sel.innerHTML = `
        <option value="">Choose...</option>
        <option value="linkedin">LinkedIn People Search</option>
        <option value="google">Google Search</option>
        <option value="facebook">Facebook People Search</option>
      `;
      sel._mciPeopleName = raw;
      sub.textContent = cleaned;
      el.style.display = "block";
      position();
      setTimeout(() => sel.focus(), 0);
    }

    return {openPinned, hide};
  })();

  document.addEventListener("contextmenu", (e) => {
    if(!e.altKey) return;

    const tag = (e.target && e.target.tagName || "").toLowerCase();
    if(tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable)) return;

    e.preventDefault();
    e.stopPropagation();

    const selected = (window.getSelection && window.getSelection().toString().trim()) || "";
    const hovered = getSelectedOrHoverText();
    const underCursor = getTextUnderCursor(e);
    const txt = selected || hovered || underCursor;

    PeopleChooser.openPinned(txt, e.clientX, e.clientY);
  }, true);
})();
