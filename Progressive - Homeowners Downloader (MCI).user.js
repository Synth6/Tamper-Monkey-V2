// ==UserScript==
// @name         Progressive - Homeowners Downloader (MCI)
// @namespace    https://middlecreekins.com/
// @version      1.0.0
// @description  Adds checkboxes to Progressive Home PDF Documents and downloads selected PDFs with readable filenames.
// @author       Ron
// @match        https://policy.americanstrategic.com/Policy/History.aspx*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const SCRIPT_VERSION = '1.0.0';

  const IDS = {
    style: '__mci_prog_home_style__',
    button: '__mci_prog_home_download__',
    master: '__mci_prog_home_master__'
  };

  const CLASSES = {
    checkbox: '__mci_prog_home_cb__',
    selected: '__mci_prog_home_selected__',
    active: '__mci_prog_home_active__',
    checkboxCell: '__mci_prog_home_cb_cell__'
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function clean(value) {
    return (value || '').toString().replace(/\s+/g, ' ').trim();
  }

  function sanitize(value) {
    return clean(value)
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toast(message, timeout = 1800) {
    const old = document.getElementById('__mci_prog_home_toast__');
    if (old) old.remove();

    const el = document.createElement('div');
    el.id = '__mci_prog_home_toast__';
    el.textContent = message;
    Object.assign(el.style, {
      position: 'fixed',
      right: '18px',
      bottom: '18px',
      zIndex: '2147483647',
      background: '#111827',
      color: '#fff',
      padding: '9px 13px',
      borderRadius: '8px',
      font: '12px/1.35 system-ui, Segoe UI, Arial, sans-serif',
      boxShadow: '0 6px 22px rgba(0,0,0,.35)'
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }

  function ensureStyles() {
    if (document.getElementById(IDS.style)) return;

    const style = document.createElement('style');
    style.id = IDS.style;
    style.textContent = `
      .${CLASSES.checkboxCell} {
        width: 34px !important;
        min-width: 34px !important;
        max-width: 34px !important;
        text-align: center !important;
        padding-left: 5px !important;
        padding-right: 5px !important;
      }

      .${CLASSES.checkbox} {
        width: 16px;
        height: 16px;
        margin: 0;
        cursor: pointer;
        accent-color: #16a34a;
        vertical-align: middle;
      }

      tr.${CLASSES.selected} > td {
        background: rgba(22, 163, 74, 0.10) !important;
      }

      tr.${CLASSES.active} > td {
        background: rgba(22, 163, 74, 0.20) !important;
        box-shadow: inset 0 2px 0 #16a34a, inset 0 -2px 0 #16a34a;
      }

      #${IDS.button} {
        float: right;
        margin: -3px 2px 0 10px;
        padding: 5px 13px;
        border: 1px solid #12833b;
        border-radius: 5px;
        background: #16a34a;
        color: #fff;
        font: 700 13px/1.3 system-ui, Segoe UI, Arial, sans-serif;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(0,0,0,.15);
      }

      #${IDS.button}:hover {
        background: #138a3f;
      }

      #${IDS.button}:disabled {
        opacity: .60;
        cursor: wait;
      }
    `;
    document.head.appendChild(style);
  }

  function getPdfTables() {
    return [
      document.getElementById('dgOutboundPolicyPackets'),
      document.getElementById('dgOutboundPolicyDocuments')
    ].filter(Boolean);
  }

  function getPdfRows() {
    const rows = [];
    for (const table of getPdfTables()) {
      for (const row of table.querySelectorAll('tr.table-row')) {
        if (getDownloadUrl(row)) rows.push(row);
      }
    }
    return rows;
  }

  function getPdfSectionHeader() {
    const anchor = document.querySelector('a[name="PDFDocuments"]');
    if (anchor && anchor.previousElementSibling &&
        anchor.previousElementSibling.classList.contains('sectionTitle')) {
      return anchor.previousElementSibling;
    }

    return [...document.querySelectorAll('.sectionTitle')]
      .find(el => clean(el.textContent) === 'PDF Documents') || null;
  }

  function getPolicyNumber() {
    const urlPolicy = new URL(location.href).searchParams.get('PolicyID');
    if (urlPolicy) return clean(urlPolicy);

    const inputs = [...document.querySelectorAll('input[readonly][value]')];
    for (let i = 0; i < inputs.length - 1; i++) {
      if (clean(inputs[i].value).toLowerCase() === 'policyid:') {
        const value = clean(inputs[i + 1]?.value);
        if (value) return value;
      }
    }

    return '';
  }

  function getDownloadUrl(row) {
    if (!row) return '';

    const onclick = row.getAttribute('onclick') || '';
    const match = onclick.match(/window\.open\(\s*(['"])(.*?)\1/i);
    if (!match) return '';

    try {
      return new URL(match[2], location.origin).href;
    } catch {
      return '';
    }
  }

  function getDescription(row) {
    if (!row) return '';

    const cells = [...row.children];
    const descriptionCell = cells.find(td => !td.classList.contains(CLASSES.checkboxCell));
    return clean(descriptionCell?.textContent);
  }

  function splitDescription(description) {
    const text = clean(description);

    // Examples:
    // "New Business Packet 10/1/2026"
    // "New Business Invoice: 9/30/2026"
    const match = text.match(/^(.*?)(?::)?\s+(\d{1,2}\/\d{1,2}\/\d{4})$/);

    if (!match) {
      return {
        title: text || 'Document',
        date: ''
      };
    }

    return {
      title: clean(match[1]).replace(/:$/, '').trim() || 'Document',
      date: match[2]
    };
  }

  function filenameDate(dateText) {
    const match = clean(dateText).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return sanitize(dateText);

    return `${parseInt(match[1], 10)}-${parseInt(match[2], 10)}-${match[3]}`;
  }

  function buildFilename(row) {
    const policy = sanitize(getPolicyNumber() || 'Policy');
    const { title, date } = splitDescription(getDescription(row));

    const parts = [policy, sanitize(title)];
    if (date) parts.push(filenameDate(date));

    return parts.filter(Boolean).join(' - ') + '.pdf';
  }

  function getCheckbox(row) {
    return row?.querySelector(`input.${CLASSES.checkbox}`) || null;
  }

  function selectedRows() {
    return getPdfRows().filter(row => getCheckbox(row)?.checked);
  }

  function updateButton() {
    const button = document.getElementById(IDS.button);
    if (!button) return;

    const count = selectedRows().length;
    button.textContent = count ? `Download (${count})` : 'Download';

    const master = document.getElementById(IDS.master);
    const rows = getPdfRows();
    if (master) {
      const checked = rows.filter(row => getCheckbox(row)?.checked).length;
      master.checked = rows.length > 0 && checked === rows.length;
      master.indeterminate = checked > 0 && checked < rows.length;
    }
  }

  function installCheckboxes() {
    for (const table of getPdfTables()) {
      const headerRow = table.querySelector('tr.table-primary-head');

      if (headerRow && !headerRow.querySelector(`.${CLASSES.checkboxCell}`)) {
        const th = document.createElement('td');
        th.className = CLASSES.checkboxCell;

        const master = document.createElement('input');
        master.type = 'checkbox';
        master.className = CLASSES.checkbox;
        master.title = 'Select all PDF documents';

        // Use one master ID only on the first table. The second master mirrors it.
        if (!document.getElementById(IDS.master)) master.id = IDS.master;

        master.addEventListener('click', event => {
          event.stopPropagation();

          for (const row of getPdfRows()) {
            const cb = getCheckbox(row);
            if (!cb) continue;
            cb.checked = master.checked;
            row.classList.toggle(CLASSES.selected, cb.checked);
          }

          // Keep both table header checkboxes in sync.
          for (const headerCb of document.querySelectorAll(`tr.table-primary-head input.${CLASSES.checkbox}`)) {
            headerCb.checked = master.checked;
            headerCb.indeterminate = false;
          }

          updateButton();
        });

        th.appendChild(master);
        headerRow.insertBefore(th, headerRow.firstElementChild);
      }

      for (const row of table.querySelectorAll('tr.table-row')) {
        if (!getDownloadUrl(row)) continue;
        if (row.querySelector(`.${CLASSES.checkboxCell}`)) continue;

        const cell = document.createElement('td');
        cell.className = CLASSES.checkboxCell;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = CLASSES.checkbox;
        cb.title = `Select ${getDescription(row) || 'document'}`;

        cb.addEventListener('click', event => {
          // Prevent the row's built-in onclick from opening the PDF.
          event.stopPropagation();
        });

        cb.addEventListener('change', () => {
          row.classList.toggle(CLASSES.selected, cb.checked);
          updateButton();
        });

        cell.addEventListener('click', event => event.stopPropagation());
        cell.appendChild(cb);
        row.insertBefore(cell, row.firstElementChild);
      }
    }

    updateButton();
  }

  async function savePdf(url, filename) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }
  }

  async function downloadSelected() {
    const rows = selectedRows();
    if (!rows.length) {
      toast('Select at least one PDF first.');
      return;
    }

    const button = document.getElementById(IDS.button);
    if (button) button.disabled = true;

    let downloaded = 0;
    const failed = [];

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        for (const other of getPdfRows()) {
          other.classList.remove(CLASSES.active);
        }
        row.classList.add(CLASSES.active);

        const filename = buildFilename(row);
        const url = getDownloadUrl(row);

        toast(`Downloading ${i + 1} of ${rows.length}: ${filename}`, 1400);

        try {
          await savePdf(url, filename);
          downloaded++;
        } catch (error) {
          console.error('[MCI Progressive Home] Download failed:', filename, error);
          failed.push(filename);
        }

        await sleep(650);
      }
    } finally {
      for (const row of getPdfRows()) row.classList.remove(CLASSES.active);
      if (button) button.disabled = false;
    }

    if (failed.length) {
      toast(`Downloaded ${downloaded}. Failed ${failed.length}.`, 3500);
    } else {
      toast(`Downloaded ${downloaded} PDF${downloaded === 1 ? '' : 's'}.`, 2500);
    }
  }

  function installDownloadButton() {
    if (document.getElementById(IDS.button)) return;

    const header = getPdfSectionHeader();
    if (!header) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = IDS.button;
    button.textContent = 'Download';
    button.title = `MCI Progressive Home Downloader v${SCRIPT_VERSION}`;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      downloadSelected();
    });

    header.appendChild(button);
  }

  function install() {
    ensureStyles();
    installDownloadButton();
    installCheckboxes();
  }

  // The page is classic ASP.NET, but this also protects us if its contents are
  // refreshed or rebuilt after load.
  install();

  const observer = new MutationObserver(() => {
    if (!document.getElementById(IDS.button) ||
        getPdfRows().some(row => !getCheckbox(row))) {
      install();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
