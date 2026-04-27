// ==UserScript==
// @name         QQ Catalyst - Download Selected PDFs
// @namespace    mci-tools
// @version      1.0.0
// @description  Downloads selected QQCatalyst PDF rows from File Manager using data-blobid.
// @match        https://app.qqcatalyst.com/*
// @match        https://*.qqcatalyst.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const TOOL_NAME = "qq-selected-pdfs";

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function toast(msg) {
    let t = document.querySelector(".mci-qq-download-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "mci-qq-download-toast";
      Object.assign(t.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        padding: "9px 12px",
        borderRadius: "10px",
        background: "#111827",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.18)",
        boxShadow: "0 8px 22px rgba(0,0,0,.38)",
        font: "12px/1.35 system-ui,Segoe UI,Arial",
        maxWidth: "420px"
      });
      document.documentElement.appendChild(t);
    }

    t.textContent = msg;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () {
      t.remove();
    }, 2500);
  }

  function cleanFileName(name) {
    return String(name || "QQCatalyst File.pdf")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getCheckedRows() {
    const boxes = Array.from(document.querySelectorAll(
      '.DocumentsImagesListTemplateContainer input[name="MultiSelectRow"]:checked, input[name="MultiSelectRow"]:checked'
    ));

    return boxes
      .map(cb => cb.closest(".TableRow.AcordItemRow, .TableRow, tr"))
      .filter(Boolean);
  }

  function getRowInfo(row, index) {
    const blobId = row.getAttribute("data-blobid");
    const fileType = (row.getAttribute("data-filetype") || "").trim();

    const fileNameEl = row.querySelector(".ContactItem.FileName");
    const createdOnEl = row.querySelector(".ContactItem.CreatedOn");
    const policyEl = row.querySelector(".ContactItem.PolicyNumber");

    const rawName =
      (fileNameEl && (fileNameEl.getAttribute("title") || fileNameEl.textContent)) ||
      ("QQCatalyst File " + index + ".pdf");

    const createdOn = createdOnEl ? createdOnEl.textContent.trim() : "";
    const policyNumber = policyEl ? (policyEl.getAttribute("title") || policyEl.textContent).trim() : "";

    let fileName = cleanFileName(rawName);

    const type = (fileType || "").toLowerCase();

    if (!/\.[a-z0-9]+$/i.test(fileName)) {
      if (type === "pdf") fileName += ".pdf";
      else if (type === "image") fileName += ".jpg";
      else if (type) fileName += "." + type;
    }

    return {
      blobId,
      fileType,
      fileName,
      createdOn,
      policyNumber
    };
  }

  function downloadUrl(url, fileName) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function runDownloadSelected() {
    const rows = getCheckedRows();

    if (!rows.length) {
      toast("No QQ files are checked.");
      return;
    }

    const items = rows
      .map((row, i) => getRowInfo(row, i + 1))
      .filter(item => item.blobId);

    if (!items.length) {
      toast("No checked file rows with data-blobid were found.");
      return;
    }

    toast("Starting download for " + items.length + " Files(s)...");

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const url = location.origin + "/FileUpload/DownloadFile/" + encodeURIComponent(item.blobId) + "?preview=true";

      downloadUrl(url, item.fileName);

      toast("Downloading " + (i + 1) + " of " + items.length + ": " + item.fileName);

      await sleep(650);
    }

    toast("Done starting " + items.length + " file download(s).");
  }

  window.addEventListener("message", function (event) {
    const data = event.data || {};
    if (data.__mci !== "run-file-downloader") return;

    const detail = data.detail || {};
    if (detail.tool !== TOOL_NAME) return;

    runDownloadSelected();
  });
})();
