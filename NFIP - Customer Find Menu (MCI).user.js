// ==UserScript==
// @name         NFIP - Customer Find Menu (MCI)
// @namespace    mci-tools
// @version      1.0.1
// @description  Adds a header menu button on NFIP Dashboard to open Advanced Search and auto-run "Active only" policy search.
// @match        https://nationalgeneral.torrentflood.com/*
// @run-at       document-idle
// @grant        none
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NFIP%20-%20Customer%20Find%20Menu%20(MCI).user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NFIP%20-%20Customer%20Find%20Menu%20(MCI).user.js
// ==/UserScript==

(function () {
  'use strict';

  var BTN_ID = 'mciNfipActiveCustomerListBtn';
  var FLAG_PARAM = 'mciActive';
  var TARGET_URL = '/flood/search/advancedsearch?searchenginetype=2&' + FLAG_PARAM + '=1';

  function qs(sel, root) { return (root || document).querySelector(sel); }

  function onReady(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function addStyles() {
    if (qs('#mci-nfip-customer-find-style')) return;
    var css = `
      #${BTN_ID} > a{
        background:#2b6cb0 !important;
        color:#fff !important;
        border-radius:6px !important;
        margin-left:6px !important;
        padding:8px 10px !important;
        font-weight:700 !important;
        line-height:1 !important;
      }
      #${BTN_ID} > a:hover{ filter:brightness(1.08); }
      #${BTN_ID} .mciDot{
        display:inline-block; width:8px; height:8px;
        background:#34d399; border-radius:50%;
        margin-right:6px; vertical-align:middle;
        box-shadow:0 0 0 2px rgba(255,255,255,.25);
      }
    `;
    var s = document.createElement('style');
    s.id = 'mci-nfip-customer-find-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function hasFlag() {
    try {
      var u = new URL(location.href);
      return u.searchParams.get(FLAG_PARAM) === '1';
    } catch (e) { return false; }
  }

  function fireChange(el) {
    if (!el) return;
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
  }

  function setChecked(el, checked) {
    if (!el) return;
    if (!!el.checked === !!checked) return;
    el.checked = checked;
    fireChange(el);
  }

  function setSelectValue(selEl, value) {
    if (!selEl) return false;
    if (selEl.value === value) return true;
    selEl.value = value;
    fireChange(selEl);
    return true;
  }

  function injectHeaderButton() {
    addStyles();

    var menu = qs('div.top-bar.mainMenu ul.dropdown.menu');
    if (!menu) return;

    if (qs('#' + BTN_ID)) return;

    var li = document.createElement('li');
    li.id = BTN_ID;
    li.setAttribute('role', 'menuitem');

    var a = document.createElement('a');
    a.href = TARGET_URL;
    a.innerHTML = '<span class="mciDot"></span>Active Customer List';
    a.title = 'MCI: Open Advanced Search, Active only, run Search';

    a.addEventListener('click', function (e) {
      e.preventDefault();
      try { sessionStorage.removeItem('mci_nfip_active_ran'); } catch (err) {}
      location.href = TARGET_URL;
    });

    li.appendChild(a);

    var policyCenterLi = qs('#MainPolicyCenter');
    if (policyCenterLi && policyCenterLi.parentNode === menu) {
      if (policyCenterLi.nextSibling) menu.insertBefore(li, policyCenterLi.nextSibling);
      else menu.appendChild(li);
    } else {
      menu.appendChild(li);
    }
  }

  function runActiveOnlySearch() {
    if (!/\/flood\/search\/advancedsearch/i.test(location.pathname + location.search)) return;
    if (!hasFlag()) return;

    try {
      if (sessionStorage.getItem('mci_nfip_active_ran') === '1') return;
    } catch (e) {}

    var attempts = 0;
    var maxAttempts = 120; // ~30s @ 250ms (gives their UI time to render)
    var timer = setInterval(function () {
      attempts++;

      var active   = qs('#AdvancedSearchInfo_SearchStatusMaskUIPolicyActive');
      var inactive = qs('#AdvancedSearchInfo_SearchStatusMaskUIPolicyInactive');
      var cancelled= qs('#AdvancedSearchInfo_SearchStatusMaskUIPolicyCancelled');
      var expired  = qs('#AdvancedSearchInfo_SearchStatusMaskUIPolicyExpired');
      var pending  = qs('#AdvancedSearchInfo_SearchStatusMaskUIPolicyPending');
      var deadfiled= qs('#AdvancedSearchInfo_SearchStatusMaskUIPolicyDeadfiled');
      var nonrenew = qs('#AdvancedSearchInfo_SearchStatusMaskUIPolicyMarkedForNonRenewal');
      var billed   = qs('#AdvancedSearchInfo_SearchStatusMaskUIBilledRenewal');

      var searchForSel = qs('#SearchEngineType'); // Search for: (Policies)
      var limitToSel   = qs('#AdvancedSearchInfo_SearchEngineFilterType'); // Limit to: (All)
      var btn          = qs('#AdvancedSearchButton');

      if (!btn || !searchForSel || !limitToSel) {
        if (attempts >= maxAttempts) clearInterval(timer);
        return;
      }

      // 1) Force dropdowns
      // Search for: Policies (value "2")
      setSelectValue(searchForSel, '2');

      // Limit to: All (value "0")
      setSelectValue(limitToSel, '0');

      // 2) Force checkboxes (Active only)
      if (active) setChecked(active, true);
      if (inactive) setChecked(inactive, false);
      if (cancelled) setChecked(cancelled, false);
      if (expired) setChecked(expired, false);
      if (pending) setChecked(pending, false);
      if (deadfiled) setChecked(deadfiled, false);
      if (nonrenew) setChecked(nonrenew, false);
      if (billed) setChecked(billed, false);

      // Mark as ran so UI re-render doesnâ€™t double-submit
      try { sessionStorage.setItem('mci_nfip_active_ran', '1'); } catch (e) {}

      // 3) Click search
      btn.click();
      clearInterval(timer);
    }, 250);
  }

  onReady(function () {
    injectHeaderButton();
    runActiveOnlySearch();

    var obs = new MutationObserver(function () { injectHeaderButton(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  });

})();
