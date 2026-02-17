// ==UserScript==
// @name         NatGen - File Downloader (MCI)
// @namespace    mci-tools
// @version      1.0.2
// @description  Click-to-open PDF + copy suggested filename for NatGen policy history. Triggered from Master Menu.
// @match        https://natgenagency.com/*
// @match        https://*.natgenagency.com/*
// @run-at       document-idle
// @grant        none
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NatGen%20-%20File%20Downloader%20(MCI).user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NatGen%20-%20File%20Downloader%20(MCI).user.js
// ==/UserScript==

(function () {
  'use strict';

  let lastTrigger = 0;


  const ID = '__mciNatGenDownloader__';
  const MSG_ID = '__mciNatGenDownloaderMsg__';

  function showMessage(text) {
    let msg = document.getElementById(MSG_ID);
    if (!msg) {
      msg = document.createElement('div');
      msg.id = MSG_ID;
      Object.assign(msg.style, {
        position: 'fixed', bottom: '20px', left: '50%',
        transform: 'translateX(-50%)',
        background: '#222', color: '#fff', padding: '8px 14px',
        borderRadius: '6px', fontSize: '14px', zIndex: 99999,
        opacity: 0, transition: 'opacity 0.25s',
        pointerEvents: 'none'
      });
      document.body.appendChild(msg);
    }
    msg.textContent = text;
    requestAnimationFrame(() => { msg.style.opacity = 1; });
    clearTimeout(msg._t);
    msg._t = setTimeout(() => { msg.style.opacity = 0; }, 1400);
  }

  function formatDate(dateStr) {
    const m = String(dateStr || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : (dateStr || '');
  }

  function deactivate() {
    const state = window[ID];
    if (state && state.rows) {
      state.rows.forEach((row) => {
        row.style.outline = '';
        row.style.backgroundColor = '';
        if (row._mciDlHandler) row.removeEventListener('click', row._mciDlHandler, true);
        delete row._mciDlHandler;
      });
    }
    delete window[ID];
    const msg = document.getElementById(MSG_ID);
    if (msg) msg.remove();
    showMessage('NatGen downloader off.');
  }

  function activate() {
    if (window[ID]) { deactivate(); return; }

    const table = document.querySelector('#ctl00_MainContent_PolicyHistoryControl2_dgPolicyHistory');
    if (!table) {
      showMessage('NatGen: Policy History table not found on this page.');
      return;
    }

    const allRows = table.querySelectorAll('tr');
    const rows = Array.prototype.filter.call(allRows, (row) => row.querySelector('a.btnView.pdfButton, .pdfButton'));

    if (!rows.length) {
      showMessage('NatGen: No PDF rows found.');
      return;
    }

    rows.forEach((row) => {
      row.style.outline = '2px solid orange';
      row.style.cursor = 'pointer';


const handler = function (e) {
  // If the user actually clicked the PDF button/icon, let the page handle the download.
  // We still copy the filename, but we do NOT preventDefault/stopPropagation.
  const clickedBtn = e && e.target ? e.target.closest('a.btnView.pdfButton, .pdfButton') : null;

  // highlight active row
  Array.prototype.forEach.call(document.querySelectorAll('tr.__natgenActive__'), (r) => {
    r.classList.remove('__natgenActive__');
    r.style.backgroundColor = '';
  });
  row.classList.add('__natgenActive__');
  row.style.backgroundColor = '#fff8c6';

  const tds = row.querySelectorAll('td');
  const date = formatDate((tds[1] ? (tds[1].innerText || '').trim() : ''));
  const activity = (tds[2] ? Array.prototype.map.call(tds[2].querySelectorAll('p'), (p) => (p.innerText || '').trim()).join(' ') : '');

  const hdr = document.getElementById('ctl00_lblHeaderPageTitleTop');
  const policyNum = (hdr ? (hdr.textContent || '') : '').trim().replace(/\s+/g, '') || 'UnknownPolicy';

  const filename = (policyNum + '_' + activity + ' ' + date).replace(/[\\/:*?"<>|]/g, '-');
  try { navigator.clipboard.writeText(filename); } catch (e2) {}

  // If user clicked the real button, weâ€™re done.
  if (clickedBtn) {
    showMessage('Opened PDF â€” filename copied.');
    return;
  }

  // Otherwise, trigger a "real" click on the PDF button/icon.
  const btn = row.querySelector('a.btnView.pdfButton, .pdfButton');
  if (!btn) {
    showMessage('NatGen: PDF button not found in this row.');
    return;
  }

  // Prevent the row click from also doing anything else on the page.
  e.preventDefault();
  e.stopPropagation();

  // Guard so our own synthetic click doesn't get intercepted by this same row handler.
  if (row._mciInternalClick) return;
  row._mciInternalClick = true;

  try {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
    btn.dispatchEvent(ev);
    if (typeof btn.click === 'function') btn.click();
    if (typeof btn.onclick === 'function') btn.onclick();
  } catch (e3) {
    try { btn.click(); } catch (e4) {}
  } finally {
    setTimeout(() => { row._mciInternalClick = false; }, 0);
  }

  showMessage('Opened PDF â€” filename copied.');
};

      row._mciDlHandler = handler;
      row.addEventListener('click', handler, true);
    });

    window[ID] = { rows: rows };
    showMessage('NatGen: Click a row to open PDF and copy filename (click button again to turn off).');
  }

  function handleTrigger(detail) {
    const now = Date.now();
    if (now - lastTrigger < 250) return;
    lastTrigger = now;
    const tool = (detail && detail.tool) || '';
    if (tool === 'erie-natgen' || tool === 'natgen') activate();
  }

  window.addEventListener('message', (e) => {
    const d = e && e.data;
    if (!d || d.__mci !== 'run-file-downloader') return;
    handleTrigger(d.detail);
  }, false);

  window.addEventListener('mci:file-downloader', (e) => handleTrigger(e && e.detail), true);
  document.addEventListener('mci:file-downloader', (e) => handleTrigger(e && e.detail), true);

})();
