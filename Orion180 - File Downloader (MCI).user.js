// ==UserScript==
// @name         Orion180 - File Downloader (MCI)
// @namespace    mci-tools
// @version      1.0.0
// @description  Adds selectable batch downloads to Orion180 policy document tables.
// @match        https://app.orion180.com/policies/*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const TOOL = "orion180";
  const HOST_OK = location.hostname === "app.orion180.com";
  const PATH_OK = /^\/policies(?:\/|$)/i.test(location.pathname);
  const CHECKBOX_CLASS = "mci-orion180-doc-checkbox";
  const SELECT_ALL_CLASS = "mci-orion180-select-all";
  const CHECKBOX_HEADER_CLASS = "mci-orion180-check-header";
  const CHECKBOX_CELL_CLASS = "mci-orion180-check-cell";
  const BUTTON_ID = "mci-orion180-download-files";
  const OBSERVER_ATTR = "data-mci-orion180-observed";

  if (!HOST_OK || !PATH_OK) return;

  let activated = false;
  let observer = null;
  let scanTimer = null;
  let downloading = false;

  addStyles();
  bindTriggers();

  function bindTriggers() {
    window.addEventListener("message", function (ev) {
      const data = ev && ev.data;
      if (!data || data.__mci !== "run-file-downloader") return;
      if (!data.detail || data.detail.tool !== TOOL) return;
      activate();
    });

    ["mci-run-file-downloader", "mci:file-downloader", "mci:orion180-downloader"].forEach(function (eventName) {
      window.addEventListener(eventName, handleCustomTrigger);
      document.addEventListener(eventName, handleCustomTrigger);
    });
  }

  function handleCustomTrigger(ev) {
    const detail = ev && ev.detail ? ev.detail : {};
    if (ev && ev.type !== "mci:orion180-downloader" && detail.tool !== TOOL) return;
    if (detail.tool && detail.tool !== TOOL) return;
    activate();
  }

  function activate() {
    if (!HOST_OK || !PATH_OK) return;

    const firstRun = !activated;
    activated = true;
    if (firstRun) toast("Activated");

    applyUi();
    startWatching();
  }

  function startWatching() {
    if (observer) return;

    observer = new MutationObserver(function () {
      if (!activated) return;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(applyUi, 150);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function applyUi() {
    const table = findDocumentTable();
    ensureDownloadButton();

    if (!table) return;

    const added = ensureCheckboxes(table);
    ensureTableEvents(table);

    if (added > 0) {
      toast("Added checkboxes");
    }
  }

  function findDocumentTable() {
    const tables = Array.from(document.querySelectorAll("table[role='table'], table"));

    return tables.find(function (table) {
      const headers = getHeaderText(table);
      const hasDocHeaders =
        headers.indexOf("date created") !== -1 &&
        headers.indexOf("document type") !== -1 &&
        headers.indexOf("file name") !== -1;
      if (!hasDocHeaders) return false;
      return getDocumentRows(table).length > 0;
    }) || null;
  }

  function getHeaderText(table) {
    return Array.from(table.querySelectorAll("thead th"))
      .map(function (th) { return normalizeText(th).toLowerCase(); })
      .join(" ");
  }

  function getDocumentRows(table) {
    return Array.from(table.querySelectorAll("tbody tr[role='row']")).filter(isDocumentRow);
  }

  function isDocumentRow(row) {
    const cells = getDataCells(row);
    if (cells.length < 5) return false;

    const fileName = getFileName(row);
    const hasPdfName = /\.pdf(?:\s*)$/i.test(fileName);
    const hasPk = !!row.getAttribute("data-pk");
    const control = findDownloadControl(row);
    const hasDownload = !!(control && (control.icon || control.clickable));

    return hasPdfName && (hasPk || hasDownload);
  }

  function getDataCells(row) {
    return Array.from(row.querySelectorAll(":scope > td")).filter(function (td) {
      return !td.classList.contains(CHECKBOX_CELL_CLASS);
    });
  }

  function getFileName(row) {
    const explicitCell = row.querySelector("td[aria-colindex='3']");
    if (explicitCell) return normalizeText(explicitCell);

    const cells = getDataCells(row);
    const match = cells.find(function (cell) {
      return /\.pdf(?:\s*)$/i.test(normalizeText(cell));
    });

    return match ? normalizeText(match) : "";
  }

  function findDownloadControl(row) {
    const cells = getDataCells(row);
    const lastCell = cells[cells.length - 1];
    if (!lastCell) return null;

    const explicitIcon = row.querySelector('td[aria-colindex="6"] img.btn');
    const icon = [explicitIcon]
      .concat(Array.from(lastCell.querySelectorAll("img.btn, img")))
      .filter(Boolean)
      .find(isVisible);

    if (!icon) return { clickable: lastCell, icon: null, cell: lastCell };

    const clickable = closestWithin(icon.parentElement, "span, button, a, [role='button']", lastCell);
    return { clickable: clickable, icon: icon, cell: lastCell };
  }

  function ensureCheckboxes(table) {
    let added = 0;
    const headerRow = table.querySelector("thead tr[role='row'], thead tr");

    if (headerRow && !headerRow.querySelector("." + SELECT_ALL_CLASS)) {
      const th = document.createElement("th");
      th.className = CHECKBOX_HEADER_CLASS;
      th.setAttribute("role", "columnheader");
      th.setAttribute("scope", "col");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = SELECT_ALL_CLASS;
      checkbox.title = "Select all documents";
      checkbox.addEventListener("click", stopOnly);
      checkbox.addEventListener("change", function () {
        const checked = checkbox.checked;
        getDocumentRows(table).forEach(function (row) {
          const rowBox = row.querySelector("." + CHECKBOX_CLASS);
          if (rowBox) rowBox.checked = checked;
        });
      });

      th.appendChild(checkbox);
      headerRow.insertBefore(th, headerRow.firstElementChild);
      added++;
    }

    getDocumentRows(table).forEach(function (row) {
      if (row.querySelector("." + CHECKBOX_CLASS)) return;

      const td = document.createElement("td");
      td.className = CHECKBOX_CELL_CLASS;
      td.setAttribute("role", "cell");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = CHECKBOX_CLASS;
      checkbox.title = getFileName(row) || "Select document";
      checkbox.addEventListener("click", stopOnly);
      checkbox.addEventListener("change", function () {
        syncSelectAll(table);
      });

      td.appendChild(checkbox);
      row.insertBefore(td, row.firstElementChild);
      added++;
    });

    syncSelectAll(table);
    return added;
  }

  function ensureTableEvents(table) {
    if (table.getAttribute(OBSERVER_ATTR) === "1") return;
    table.setAttribute(OBSERVER_ATTR, "1");

    table.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest("." + CHECKBOX_CELL_CLASS + ", ." + CHECKBOX_HEADER_CLASS)) {
        ev.stopPropagation();
        return;
      }
    }, true);
  }

  function syncSelectAll(table) {
    const selectAll = table.querySelector("." + SELECT_ALL_CLASS);
    if (!selectAll) return;

    const boxes = getDocumentRows(table)
      .map(function (row) { return row.querySelector("." + CHECKBOX_CLASS); })
      .filter(Boolean);

    const checkedCount = boxes.filter(function (box) { return box.checked; }).length;
    selectAll.checked = boxes.length > 0 && checkedCount === boxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
  }

  function ensureDownloadButton() {
    if (document.getElementById(BUTTON_ID)) return false;

    const generateButton = findGenerateDocumentsButton();
    if (!generateButton) return false;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Download Files";
    button.className = generateButton.className || "btn";
    button.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      downloadCheckedFiles();
    });

    generateButton.insertAdjacentElement("afterend", button);
    return true;
  }

  function findGenerateDocumentsButton() {
    return Array.from(document.querySelectorAll("button")).find(function (button) {
      return normalizeText(button).toLowerCase() === "generate documents";
    }) || null;
  }

  async function downloadCheckedFiles() {
    if (downloading) return;

    const table = findDocumentTable();
    if (!table) {
      toast("No document table found");
      return;
    }

    const selected = getDocumentRows(table).filter(function (row) {
      const checkbox = row.querySelector("." + CHECKBOX_CLASS);
      return checkbox && checkbox.checked;
    });

    if (!selected.length) {
      toast("No files checked");
      return;
    }

    downloading = true;
    toast("Downloading " + selected.length + " file(s)");

    for (let i = 0; i < selected.length; i++) {
      const row = selected[i];
      const docId = getRowDocId(row);
      const fileName = getFileName(row);
      const control = findDownloadControl(row);

      if (control && control.icon) {
        clickDownloadIcon(control, row);
      } else {
        console.warn("[MCI Orion180 Downloader] Download icon not found:", {
          docId: docId,
          fileName: fileName,
          iconFound: false,
          clickTarget: "(none)"
        });
      }

      if (i < selected.length - 1) {
        await delay(700);
      }
    }

    downloading = false;
    toast("Done");
  }

  function closestWithin(el, selector, boundary) {
    let current = el;
    while (current && current !== document && current !== boundary.parentElement) {
      if (current.matches && current.matches(selector)) return current;
      if (current === boundary) break;
      current = current.parentElement;
    }
    return null;
  }

  function clickDownloadIcon(control, row) {
    const fileName = getFileName(row);
    const docId = getRowDocId(row);
    const icon = control.icon;
    const parent = control.clickable;

    try {
      icon.scrollIntoView({ block: "center", inline: "center" });
    } catch (e) {
      icon.scrollIntoView();
    }

    console.log("[MCI Orion180 Downloader] Clicking download icon:", {
      fileName: fileName,
      docId: docId,
      iconFound: true,
      clickTarget: describeElement(icon)
    });

    icon.click();

    if (parent && parent !== icon && typeof parent.click === "function") {
      console.log("[MCI Orion180 Downloader] Clicking download parent fallback:", {
        fileName: fileName,
        docId: docId,
        iconFound: true,
        clickTarget: describeElement(parent)
      });
      parent.click();
    }
  }

  function getRowDocId(row) {
    return row ? (row.getAttribute("data-pk") || "").trim() : "";
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function describeElement(el) {
    if (!el) return "(none)";
    const tag = (el.tagName || "").toLowerCase();
    const cls = el.className && typeof el.className === "string" ? "." + el.className.trim().replace(/\s+/g, ".") : "";
    return tag + cls;
  }

  function normalizeText(el) {
    return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
  }

  function stopOnly(ev) {
    ev.stopPropagation();
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function toast(message) {
    const existing = document.querySelector(".mci-orion180-toast");
    if (existing) existing.remove();

    const node = document.createElement("div");
    node.className = "mci-orion180-toast";
    node.textContent = message;
    document.body.appendChild(node);

    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 2300);
  }

  function addStyles() {
    const css = [
      ".mci-orion180-check-header,.mci-orion180-check-cell{width:42px!important;min-width:42px!important;text-align:center!important;vertical-align:middle!important;}",
      ".mci-orion180-check-header input,.mci-orion180-check-cell input{width:16px;height:16px;cursor:pointer;accent-color:#16a34a;border:1px solid #000!important;}",
      "#" + BUTTON_ID + "{margin-left:10px!important;background:#16a34a!important;border-color:#15803d!important;color:#fff!important;border-radius:6px!important;padding:8px 14px!important;font-weight:600!important;box-shadow:none!important;}",
      "#" + BUTTON_ID + ":hover{background:#15803d!important;border-color:#166534!important;}",
      ".mci-orion180-toast{position:fixed;z-index:2147483647;left:50%;top:18px;transform:translateX(-50%);background:#111;color:#fff;padding:8px 12px;border-radius:8px;font:12px/1.35 system-ui,Segoe UI,Arial;box-shadow:0 4px 18px rgba(0,0,0,.35);opacity:.95;pointer-events:none;}"
    ].join("\n");

    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
