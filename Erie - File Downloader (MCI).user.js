// ==UserScript==
// @name         Erie - File Downloader (MCI)
// @namespace    mci-tools
// @version      1.0.2
// @description  Click-to-open PDF + copy suggested filename for Erie downloads. Triggered from Master Menu.
// @match        https://portal.agentexchange.com/*
// @match        https://www.agentexchange.com/*
// @match        https://*.agentexchange.com/*
// @match        https://customerdatamanagement.agentexchange.com/*
// @run-at       document-idle
// @grant        none
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Erie%20-%20File%20Downloader%20(MCI).user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Erie%20-%20File%20Downloader%20(MCI).user.js
// ==/UserScript==

(function () {
  'use strict';

  let lastTrigger = 0;


  const ID = '__mciErieDownloader__';
  const MSG_ID = '__mciErieDownloaderMsg__';

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
    msg._t = setTimeout(() => {
      msg.style.opacity = 0;
    }, 1400);
  }

  function formatDate(dateStr) {
    const m = String(dateStr || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : (dateStr || '');
  }

  function buildFilename(row) {
    const form = row.querySelector('form[action*="/api/pdf/download"]');
    const typeBtn = form ? form.querySelector('button.download-btn') : null;
    const tds = row.querySelectorAll('td');

    const dateCell = Array.prototype.find.call(tds, (td) =>
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test((td.innerText || '').trim())
    );
    const finalDate = dateCell ? formatDate((dateCell.innerText || '').trim()) : '';

    const policyDropdown = document.querySelector('#policy-dropdown option:checked');
    const policyText = policyDropdown ? (policyDropdown.textContent || '') : '';
    const match = policyText.match(/\((.*?)\)/);
    const eriePolicy = match ? match[1].trim() : 'UnknownPolicy';

    // Main document label, like mortgage company / invoice label
    const mainLabel = row.querySelector('.info-label');
    const mainLabelText = mainLabel ? (mainLabel.innerText || '').trim() : '';

    // Recipient column extra name, like Wells Fargo Home Mortgage
    let recipientExtra = '';
    Array.prototype.forEach.call(tds, function (td) {
      const text = (td.innerText || '').trim();
      if (/Other Interest/i.test(text)) {
        const info = td.querySelector('.info-label');
        if (info) recipientExtra = (info.innerText || '').trim();
      }
    });

    return [
      eriePolicy,
      typeBtn ? (typeBtn.innerText || '').trim() : '',
      mainLabelText,
      recipientExtra,
      finalDate
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/[\\/:*?"<>|]/g, '-');
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
    showMessage('Erie downloader off.');
  }

  function activate() {
    if (window[ID]) { deactivate(); return; }

    const rows = Array.prototype.filter.call(document.querySelectorAll('tr'), (row) =>
      row.querySelector('form[action*="/api/pdf/download"]') && row.querySelector('.download-btn')
    );

    if (!rows.length) {
      showMessage('Erie: No PDF rows found on this page.');
      return;
    }

    rows.forEach((row) => {
      row.style.outline = '2px solid orange';
      row.style.cursor = 'pointer';

      const handler = function (e) {
        e.preventDefault();
        e.stopPropagation();

        // highlight active row
        Array.prototype.forEach.call(document.querySelectorAll('tr.__erieActive__'), (r) => {
          r.classList.remove('__erieActive__');
          r.style.backgroundColor = '';
        });
        row.classList.add('__erieActive__');
        row.style.backgroundColor = '#fff8c6';

        const filename = buildFilename(row);

        try { navigator.clipboard.writeText(filename); } catch (e2) {}

        const form = row.querySelector('form[action*="/api/pdf/download"]');
        if (form) {
          const clone = form.cloneNode(true);
          clone.target = '_blank';
          clone.style.display = 'none';
          document.body.appendChild(clone);
          clone.submit();
          clone.remove();
          showMessage('Opened PDF â€” filename copied.');
        } else {
          showMessage('Erie: No PDF form found.');
        }
      };

      row._mciDlHandler = handler;
      row.addEventListener('click', handler, true);
    });

    window[ID] = { rows: rows };
    showMessage('Erie: Click a row to open PDF and copy filename (click button again to turn off).');
  }

  function handleTrigger(detail) {
    const now = Date.now();
    if (now - lastTrigger < 250) return;
    lastTrigger = now;
    const tool = (detail && detail.tool) || '';
    if (tool === 'erie-natgen' || tool === 'erie') activate();
  }

  // Listen for Master Menu trigger (postMessage + CustomEvent)
  window.addEventListener('message', (e) => {
    const d = e && e.data;
    if (!d || d.__mci !== 'run-file-downloader') return;
    handleTrigger(d.detail);
  }, false);

  window.addEventListener('mci:file-downloader', (e) => handleTrigger(e && e.detail), true);
  document.addEventListener('mci:file-downloader', (e) => handleTrigger(e && e.detail), true);

})();
