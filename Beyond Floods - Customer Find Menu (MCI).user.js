// ==UserScript==
// @name         Beyond Floods - Customer Find Menu (MCI)
// @namespace    mci-tools
// @version      1.0.3
// @description  BillItNow Policy List -> Beyond Floods AgentDashboard auto-search + adds "Customer List" button on Beyond Floods (AgentDashboard + Results).
// @match        https://www.billitnow.com/Apps/PolicyList.aspx*
// @match        https://www.billitnow.com/Apps/*PolicyList.aspx*
// @match        https://natgen.beyondfloods.com/*
// @grant        GM_addStyle
// @run-at       document-idle
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Beyond%20Floods%20-%20Customer%20Find%20Menu%20(MCI).user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Beyond%20Floods%20-%20Customer%20Find%20Menu%20(MCI).user.js
// ==/UserScript==

(function () {
  'use strict';

  var BF_AGENT_DASH = 'https://natgen.beyondfloods.com/Public/AgentDashboard';
  var BILLIT_POLICY_LIST = 'https://www.billitnow.com/Apps/PolicyList.aspx';

  function addStyle(css) {
    try { GM_addStyle(css); }
    catch (e) {
      var s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    }
  }

  function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function waitFor(fnCheck, fnDone, timeoutMs, intervalMs) {
    var start = Date.now();
    var t = setInterval(function () {
      var res = null;
      try { res = fnCheck(); } catch (e) { res = null; }

      if (res) {
        clearInterval(t);
        try { fnDone(res); } catch (e2) {}
        return;
      }
      if (Date.now() - start > (timeoutMs || 15000)) clearInterval(t);
    }, intervalMs || 250);
  }

  // ----------------------------
  // BILLITNOW: add "Open" per row (same-tab)
  // ----------------------------
  function onBillItNow() {
    var grid = document.getElementById('pHolder_phPageContent_ucContent_gridPolicy');
    if (!grid) return;

    addStyle(
      '.mciOpenBF{display:inline-block;padding:3px 8px;border-radius:6px;background:#1e40af;color:#fff;text-decoration:none;font-weight:700;font-size:12px;}' +
      '.mciOpenBF:hover{opacity:.9;}' +
      '.mciColHead{min-width:68px;text-align:center;}'
    );

    // Add header cell once
    var headerRow = grid.querySelector('tr.ListHeaderCell');
    if (headerRow && !headerRow.querySelector('.mciColHead')) {
      var h = document.createElement('td');
      h.className = 'ListHeaderCell mciColHead';
      h.textContent = 'Customer';
      headerRow.appendChild(h);
    }

    var rows = Array.prototype.slice.call(grid.querySelectorAll('tr.ListCell, tr.ListCellOther'));
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.querySelector('.mciOpenBF')) continue;

      var firstTd = tr.querySelector('td');
      if (!firstTd) continue;

      var aPolicy = firstTd.querySelector('a');
      var policy = aPolicy ? norm(aPolicy.textContent) : norm(firstTd.textContent);
      if (!policy) continue;

      var td = document.createElement('td');
      td.style.textAlign = 'center';
      td.style.whiteSpace = 'nowrap';

      var a = document.createElement('a');
      a.className = 'mciOpenBF';
      a.textContent = 'Open';
      a.href = BF_AGENT_DASH + '?mciPolicy=' + encodeURIComponent(policy);
      a.title = 'Open Beyond Floods and auto-search this policy number';
      a.style.cursor = 'pointer';

      // Force same-tab navigation
      a.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = this.href;
      });

      td.appendChild(a);
      tr.appendChild(td);
    }
  }

  // ----------------------------
  // BEYOND FLOODS: inject Customer List + auto-search
  // ----------------------------
  function onBeyondFloods() {
    addStyle(`
      #mciBFUnifiedRow{
        display:flex !important;
        justify-content:flex-start !important;
        margin: 0 0 12px 0 !important;
      }
      #mciCustomerListBtnUnified{
        display:inline-flex !important;
        align-items:center !important;
        justify-content:center !important;
        padding:8px 14px !important;
        border-radius:8px !important;
        background:#7dd3fc !important;
        color:#0b1220 !important;
        font-weight:800 !important;
        border:1px solid rgba(0,0,0,.15) !important;
        text-decoration:none !important;
        cursor:pointer !important;
        white-space:nowrap !important;
      }
      #mciCustomerListBtnUnified:hover{
        filter:brightness(.96) !important;
        transform:translateY(-1px) !important;
      }
    `);

    function injectCustomerListButton() {
      if (document.getElementById('mciCustomerListBtnUnified')) return;

      var btn = document.createElement('a');
      btn.id = 'mciCustomerListBtnUnified';
      btn.href = BILLIT_POLICY_LIST;
      btn.textContent = 'Customer List';
      btn.title = 'Open BillItNow Policy List';

      // same-tab (tight flow)
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = this.href;
      });

      var row = document.createElement('div');
      row.id = 'mciBFUnifiedRow';
      row.appendChild(btn);

      // Anchor priority:
      // 1) AgentDashboard (Search Options panel)
      var agentSearchControl = document.getElementById('agentSearchControl');
      if (agentSearchControl) {
        var title = document.getElementById('searchTitle');
        if (title && title.parentNode) {
          title.parentNode.insertBefore(row, title.nextSibling);
          return;
        }
        agentSearchControl.insertBefore(row, agentSearchControl.firstChild);
        return;
      }

      // 2) Results page layout (search-field wrapper)
      var searchField = document.querySelector('.search-field.col-lg-10.col-md-10.col-sm-10.col-xs-12');
      if (searchField) {
        searchField.insertBefore(row, searchField.firstChild);
        return;
      }

      // 3) Fallback: above the form
      var form = document.getElementById('agentSearchParameters');
      if (form && form.parentNode) {
        form.parentNode.insertBefore(row, form);
        return;
      }
    }

    // Inject button once an anchor exists
    waitFor(
      function () {
        if (document.getElementById('agentSearchControl')) return true;
        if (document.querySelector('.search-field.col-lg-10.col-md-10.col-sm-10.col-xs-12')) return true;
        if (document.getElementById('agentSearchParameters')) return true;
        return false;
      },
      function () {
        injectCustomerListButton();
      },
      30000,
      250
    );

    // ---- Auto-search policy if URL has ?mciPolicy= ----
    var url = new URL(window.location.href);
    var pol = url.searchParams.get('mciPolicy');

    if (pol) {
      sessionStorage.setItem('MCI_BF_PENDING_POLICY', pol);
      url.searchParams.delete('mciPolicy');
      history.replaceState(null, '', url.toString());
    }

    var pending = sessionStorage.getItem('MCI_BF_PENDING_POLICY');
    if (!pending) return;

    if (sessionStorage.getItem('MCI_BF_SUBMITTED') === pending) return;

    waitFor(
      function () {
        var form = document.getElementById('agentSearchParameters');
        var input = document.querySelector('input[name="SearchParams[3].ParameterValue"]');
        if (form && input) return { form: form, input: input };
        return null;
      },
      function (els) {
        els.input.focus();
        els.input.value = pending;
        els.input.dispatchEvent(new Event('input', { bubbles: true }));
        els.input.dispatchEvent(new Event('change', { bubbles: true }));

        sessionStorage.setItem('MCI_BF_SUBMITTED', pending);
        sessionStorage.removeItem('MCI_BF_PENDING_POLICY');

        els.form.submit();
      },
      45000,
      250
    );
  }

  // ----------------------------
  // Boot
  // ----------------------------
  if (location.hostname.indexOf('billitnow.com') > -1) onBillItNow();
  if (location.hostname.indexOf('beyondfloods.com') > -1) onBeyondFloods();

})();
