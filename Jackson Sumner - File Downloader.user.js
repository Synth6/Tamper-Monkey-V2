// ==UserScript==
// @name         Jackson Sumner - File Downloader (MCI)
// @namespace    mci-tools
// @version      1.0.0
// @description  Adds selectable batch downloads to Jackson Sumner policy document tables.
// @match        https://www.jsausa.com/download/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const TOOL = "jackson-sumner";
  const selectedUrls = new Set();
  let active = false;
  let observer = null;
  let refreshTimer = 0;
  let stylesAdded = false;

  window.addEventListener("message", function (ev) {
    const data = ev && ev.data;
    if (!data || data.__mci !== "run-file-downloader") return;
    if (!data.detail || data.detail.tool !== TOOL) return;

    activate();
  });

  function activate() {
    ensureStyles();

    const table = document.querySelector("table#files");
    const hasDownloads = !!(table && table.querySelector('tbody a.file-link[href*="backend/index.php?method=download"]'));
    if (!table || !hasDownloads) {
      toast("Open a Jackson Sumner policy document page first.");
      return;
    }

    active = true;
    injectToolbar();
    refreshTable();
    startRedrawHandling();
    toast("Jackson Sumner downloader activated.");
  }

  function ensureStyles() {
    if (stylesAdded) return;
    stylesAdded = true;
    GM_addStyle(`
      .mci-jsa-select-col{
        width:36px!important;
        min-width:36px!important;
        max-width:40px!important;
        text-align:center!important;
        vertical-align:middle!important;
        padding-left:6px!important;
        padding-right:6px!important;
      }
      .mci-jsa-doc-checkbox{
        width:16px;
        height:16px;
        margin:0;
        cursor:pointer;
        vertical-align:middle;
        accent-color:#198754;
      }
      .mci-jsa-controls{
        display:inline-flex;
        align-items:center;
        gap:6px;
        margin:0 12px 0 0;
        vertical-align:middle;
        white-space:nowrap;
      }
      .mci-jsa-btn{
        border:1px solid #c8d0d8;
        background:#f7f9fb;
        color:#26323d;
        border-radius:6px;
        padding:5px 9px;
        font:600 12px/1.2 Arial, sans-serif;
        cursor:pointer;
      }
      .mci-jsa-btn:hover{ background:#eef3f7; }
      .mci-jsa-btn-primary{
        background:#198754;
        border-color:#198754;
        color:#fff;
        border-radius:7px;
        font-weight:600;
      }
      .mci-jsa-btn-primary:hover{
        background:#157347;
        border-color:#146c43;
      }
      .mci-jsa-toast{
        position:fixed;
        right:18px;
        bottom:18px;
        z-index:2147483647;
        max-width:360px;
        padding:10px 12px;
        border-radius:7px;
        background:#26323d;
        color:#fff;
        box-shadow:0 8px 22px rgba(0,0,0,.25);
        font:13px/1.35 Arial, sans-serif;
      }
    `);
  }

  function injectToolbar() {
    if (document.querySelector("#mci-jsa-controls")) return;

    const topbar = document.querySelector(".dt-topbar");
    if (!topbar) return;

    const controls = document.createElement("span");
    controls.id = "mci-jsa-controls";
    controls.className = "mci-jsa-controls";

    const checkAll = makeButton("Check All", "mci-jsa-check-all", "mci-jsa-btn");
    const uncheckAll = makeButton("Uncheck All", "mci-jsa-uncheck-all", "mci-jsa-btn");
    const download = makeButton("Download Selected", "mci-jsa-download-selected", "mci-jsa-btn mci-jsa-btn-primary");

    checkAll.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      getDownloadRows().forEach(function (row) {
        const href = getDownloadHref(row);
        if (href) selectedUrls.add(href);
      });
      refreshTable();
    });

    uncheckAll.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      selectedUrls.clear();
      refreshTable();
    });

    download.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      downloadSelected();
    });

    controls.appendChild(checkAll);
    controls.appendChild(uncheckAll);
    controls.appendChild(download);

    const filter = topbar.querySelector("#files_filter");
    const length = topbar.querySelector("#files_length");

    if (filter) {
      topbar.insertBefore(controls, filter);
    } else if (length) {
      topbar.insertBefore(controls, length);
    } else {
      topbar.insertBefore(controls, topbar.firstChild);
    }
  }

  function makeButton(text, id, className) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.className = className;
    btn.textContent = text;
    return btn;
  }

  function refreshTable() {
    if (!active) return;
    const table = document.querySelector("table#files");
    if (!table) return;

    ensureHeader(table);
    Array.from(table.querySelectorAll("tbody tr")).forEach(ensureRowCheckbox);
  }

  function ensureHeader(table) {
    const headerRow = table.querySelector("thead tr");
    if (!headerRow || headerRow.querySelector(".mci-jsa-select-col")) return;

    const th = document.createElement("th");
    th.className = "mci-jsa-select-col";
    th.textContent = "";
    headerRow.insertBefore(th, headerRow.firstElementChild);
  }

  function ensureRowCheckbox(row) {
    if (!row || row.querySelector("td.dataTables_empty")) return;

    const href = getDownloadHref(row);
    const existingCell = row.querySelector("td.mci-jsa-select-col");
    if (!href) {
      if (existingCell) existingCell.remove();
      return;
    }

    let cell = existingCell;
    let box = cell && cell.querySelector(".mci-jsa-doc-checkbox");
    if (!cell) {
      cell = document.createElement("td");
      cell.className = "mci-jsa-select-col";
      row.insertBefore(cell, row.firstElementChild);
    }

    if (!box) {
      box = document.createElement("input");
      box.type = "checkbox";
      box.className = "mci-jsa-doc-checkbox";
      box.addEventListener("click", function (ev) {
        ev.stopPropagation();
      });
      box.addEventListener("change", function (ev) {
        ev.stopPropagation();
        const key = box.getAttribute("data-mci-jsa-url") || "";
        if (!key) return;
        if (box.checked) selectedUrls.add(key);
        else selectedUrls.delete(key);
      });
      cell.appendChild(box);
    }

    box.setAttribute("data-mci-jsa-url", href);
    box.checked = selectedUrls.has(href);
  }

  function getDownloadHref(row) {
    const link = row && row.querySelector('a.file-link[href*="backend/index.php?method=download"]');
    return link ? String(link.getAttribute("href") || "").trim() : "";
  }

  function getDownloadRows() {
    const table = document.querySelector("table#files");
    if (!table) return [];

    const apiRows = getDataTableRows(table);
    const rows = apiRows.length ? apiRows : Array.from(table.querySelectorAll("tbody tr"));
    return rows.filter(function (row) {
      return !!getDownloadHref(row) && !row.querySelector("td.dataTables_empty");
    });
  }

  function getDataTableRows(table) {
    try {
      const jq = window.jQuery || window.$;
      if (!jq || !jq.fn || !jq.fn.dataTable || !jq.fn.dataTable.isDataTable(table)) return [];
      return jq(table).DataTable().rows({ search: "applied" }).nodes().toArray();
    } catch (_) {}
    return [];
  }

  function startRedrawHandling() {
    const table = document.querySelector("table#files");
    if (!table) return;

    try {
      const jq = window.jQuery || window.$;
      if (jq) {
        jq(table).off("draw.dt.mciJsa").on("draw.dt.mciJsa", scheduleRefresh);
      }
    } catch (_) {}

    if (observer) return;
    const target = table.tBodies && table.tBodies[0] ? table.tBodies[0] : table;
    observer = new MutationObserver(scheduleRefresh);
    observer.observe(target, { childList: true, subtree: true });
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshTable, 50);
  }

  async function downloadSelected() {
    const urls = Array.from(selectedUrls);
    if (!urls.length) {
      toast("No Jackson Sumner documents selected.");
      return;
    }

    for (let i = 0; i < urls.length; i++) {
      toast("Downloading " + (i + 1) + " of " + urls.length + "...");
      triggerDownload(new URL(urls[i], location.href).href);
      await delay(650);
    }

    toast("Started " + urls.length + " Jackson Sumner downloads.");
  }

  function triggerDownload(url) {
    const a = document.createElement("a");
    a.href = url;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      a.remove();
    }, 1000);
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function toast(msg) {
    const prior = document.querySelector(".mci-jsa-toast");
    if (prior) prior.remove();

    const el = document.createElement("div");
    el.className = "mci-jsa-toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      if (el && el.parentNode) el.remove();
    }, 2600);
  }
})();
