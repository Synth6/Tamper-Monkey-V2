// ==UserScript==
// @name         Master Menu 2 (MCI)
// @namespace    mci-tools
// @version      5.8.1
// @description  MCI slide-out toolbox (config-driven UI). Easier to maintain + add buttons without bloating HTML.
// @match        https://app.qqcatalyst.com/*
// @match        https://*.qqcatalyst.com/*
// @match        https://portal.agentexchange.com/*
// @match        https://www.agentexchange.com/*
// @match        https://*.agentexchange.com/*
// @match        https://customerdatamanagement.agentexchange.com/*
// @match        https://natgenagency.com/*
// @match        https://*.natgenagency.com/*
// @match        https://www.gotfreefax.com/*
// @match        https://gotfreefax.com/*
// @match        https://natgen.beyondfloods.com/*
// @match        https://nationalgeneral.torrentflood.com/*
// @match        https://quoting.foragentsonly.com/*
// @match        https://www.foragentsonly.com/*
// @match        https://*.foragentsonly.com/*
// @match        https://*.apps.foragentsonly.com/*
// @match        https://*.ncjua-nciua.org/*
// @match        https://*.ncjuanciua.org/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/Synth6/Tampermonkey/main/MCI%20Master%20Menu.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tampermonkey/main/MCI%20Master%20Menu.user.js
// ==/UserScript==

(function () {
  "use strict";

  /*************************
   * ENV / HOST DETECT      *
   *************************/
  const HOST = location.hostname.toLowerCase();
  const PATH = (location.pathname || "").toLowerCase();
  const PAGE_WINDOW = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  const IS_QQ = /qqcatalyst/.test(HOST);

  const IS_PROG =
    /quoting\.foragentsonly\.com/i.test(HOST) ||
    /foragentsonly\.com/i.test(HOST);

  const IS_ERIE =
    /agentexchange\.com|portal\.agentexchange\.com|customerdatamanagement\.agentexchange\.com/.test(HOST);

  const IS_NG = /natgenagency\.com/.test(HOST);

  const IS_TORRENT = /torrentflood\.com/.test(HOST);
  const IS_BEYOND_HOST = /beyondfloods\.com/.test(HOST);

  const IS_NFIP = IS_TORRENT && PATH.startsWith("/dashboard/agency");
  const IS_BEYOND = IS_BEYOND_HOST || (IS_TORRENT && !IS_NFIP);

  const IN_IFRAME = window.top !== window.self;
  if (IN_IFRAME && !(IS_QQ || IS_PROG)) return;

  /*************************
   * CONSTS / IDS / PREFS   *
   *************************/
  const HOST_ID = "mci-shadow-host";
  const MENU_ID = "mciSlideMenu";
  const TRIGGER_ID = "mciSlideTrigger";

  const PREF_HOVER_KEY = "mci_pref_hover_open";

  const GLOBAL_STYLE_ID = "mci-global-style";

  const HIGHLIGHT_COLOR_KEY = "mci_row_highlight_color";
  const DEFAULT_ROW_COLOR = "#fffbcc";

  /*************************
   * MINI UTILS             *
   *************************/
  const $ = (sel, root = document) => root.querySelector(sel);

  function getSystemLabel() {
    if (IS_QQ) return "QQ Catalyst";
    if (IS_ERIE) return "Erie";
    if (IS_PROG) return "Progressive";
    if (IS_NFIP) return "NFIP";
    if (IS_BEYOND) return "Beyond Floods";
    if (IS_NG) return "National General";
    return location.hostname;
  }

  function toast(msg) {
    let t = document.querySelector(".toast-mci");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast-mci";
      Object.assign(t.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        padding: "8px 12px",
        borderRadius: "10px",
        background: "#111",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.15)",
        boxShadow: "0 6px 18px rgba(0,0,0,.35)",
        font: "12px/1.2 system-ui,Segoe UI,Arial",
        opacity: "0",
        transform: "translateY(6px)",
        transition: "opacity .18s, transform .18s",
        maxWidth: "60vw",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        overflow: "hidden"
      });
      document.documentElement.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => {
      t.style.opacity = "1";
      t.style.transform = "translateY(0)";
    });
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateY(6px)";
    }, 1600);
  }

  function ensureGlobalStyles() {
    if (!document.head || document.getElementById(GLOBAL_STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = GLOBAL_STYLE_ID;
    st.textContent = `
      .mci-fileNameFixed{
        white-space:pre-line !important;
        overflow:visible !important;
        text-overflow:unset !important;
      }
    `;
    document.head.appendChild(st);
  }

  /*************************
   * QQ HELPERS (same logic)*
   *************************/
  let fileNamesFixed = false;
  let pdfPopupObserver = null;

  function qqGetCheckedBoxes() {
    const selectors = [
      '.DocumentsImagesListTemplateContainer input[name="MultiSelectRow"]:checked',
      'input[name="MultiSelectRow"]:checked',
      'input[type="checkbox"][name="MultiSelectRow"]:checked'
    ];
    for (let i = 0; i < selectors.length; i++) {
      const boxes = Array.from(document.querySelectorAll(selectors[i]));
      if (boxes.length) return boxes;
    }
    return [];
  }

  function qqGetRowForCheckbox(cb) {
    return cb.closest(".TableRow, tr, .documents-row, .zebra-row, [data-row]") || cb.closest("*");
  }

  function qqGetDownloadUrlFromRow(row, origin) {
    if (!row) return null;

    const ds = row.dataset || {};
    const id =
      ds.blobid ||
      ds.blobId ||
      ds.fileid ||
      ds.fileId ||
      ds.documentid ||
      ds.documentId ||
      ds.id;

    if (id) return origin + "/FileUpload/DownloadFile/" + id + "?preview=true";

    const cb = row.querySelector('input[type="checkbox"][name="MultiSelectRow"]');
    if (cb && cb.value) {
      if (/^[\w-]+$/.test(cb.value)) {
        return origin + "/FileUpload/DownloadFile/" + cb.value + "?preview=true";
      }
      try {
        const u = new URL(cb.value, origin);
        const qid = u.searchParams.get("id");
        if (qid) return origin + "/FileUpload/DownloadFile/" + qid + "?preview=true";
        const m = u.pathname.match(/\/FileUpload\/DownloadFile\/([^/?#]+)/);
        if (m && m[1]) return origin + "/FileUpload/DownloadFile/" + m[1] + "?preview=true";
        return u.href;
      } catch (e) {}
    }

    const anchor = row.querySelector(
      'a[href*="/FileUpload/DownloadFile/"], a[href*="DownloadQuickFile"], a[href*="DownloadFile?"], a[href*="/Download/"]'
    );
    if (anchor) {
      try {
        const u2 = new URL(anchor.getAttribute("href"), origin);
        const qid2 = u2.searchParams.get("id");
        if (qid2) return origin + "/FileUpload/DownloadFile/" + qid2 + "?preview=true";
        const m2 = u2.pathname.match(/\/FileUpload\/DownloadFile\/([^/?#]+)/);
        if (m2 && m2[1]) return origin + "/FileUpload/DownloadFile/" + m2[1] + "?preview=true";
        return u2.href;
      } catch (e2) {}
    }

    return null;
  }

  function addOpenPdfButtonToPopup() {
    const popup = document.querySelector("#preview.file-edit-popup");
    if (!popup || getComputedStyle(popup).display === "none") return;

    const img = popup.querySelector("img");
    if (!img || !/DownloadQuickFile/i.test(img.src || "")) return;
    if (popup.querySelector(".mci-open-popup-btn")) return;

    let id = "";
    try { id = new URL(img.src, location.origin).searchParams.get("id") || ""; } catch (e) {}
    if (!id) return;

    const btn = document.createElement("button");
    btn.textContent = "Open PDF in New Tab";
    btn.className = "mci-open-popup-btn";
    Object.assign(btn.style, {
      marginTop: "10px",
      display: "block",
      background: "#1f6feb",
      color: "#fff",
      padding: "8px 12px",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer"
    });

    btn.addEventListener("click", function () {
      window.open(location.origin + "/FileUpload/DownloadFile/" + id + "?preview=true", "_blank");
    });

    popup.appendChild(btn);
  }

  function startPdfPopupObserver() {
    if (!IS_QQ || pdfPopupObserver || !document.body || typeof MutationObserver === "undefined") return;
    pdfPopupObserver = new MutationObserver(function () { addOpenPdfButtonToPopup(); });
    pdfPopupObserver.observe(document.body, { childList: true, subtree: true });
  }

  function smartOpenPdfs() {
    const origin = location.origin;
    let attempts = 0;

    function tryOpen() {
      attempts++;

      const checked = qqGetCheckedBoxes();
      if (checked.length) {
        let opened = 0;
        checked.forEach(function (cb) {
          const row = qqGetRowForCheckbox(cb);
          const url = qqGetDownloadUrlFromRow(row, origin);
          if (url) {
            window.open(url, "_blank");
            opened++;
          }
        });
        if (opened) {
          toast("Opened " + opened + " PDF" + (opened > 1 ? "s" : "") + " from selected rows.");
          return;
        }
      }

      const iframe = document.getElementById("iframePdf");
      if (iframe && /\/DownloadFile\//i.test(iframe.src || "")) {
        const url2 = iframe.src.charAt(0) === "/" ? origin + iframe.src : iframe.src;
        window.open(url2, "_blank");
        toast("Opened PDF from iframe viewer.");
        return;
      }

      const popupImg = document.querySelector("#preview.file-edit-popup img");
      if (popupImg && /DownloadQuickFile/i.test(popupImg.src || "")) {
        try {
          const id = new URL(popupImg.src, origin).searchParams.get("id");
          if (id) {
            window.open(origin + "/FileUpload/DownloadFile/" + id + "?preview=true", "_blank");
            toast("Opened PDF from popup viewer.");
            return;
          }
        } catch (e) {}
      }

      if (attempts < 8) setTimeout(tryOpen, 350);
      else toast("PDF not found. Try again after the document loads.");
    }

    tryOpen();
  }

  function toggleFileNameFix() {
    fileNamesFixed = !fileNamesFixed;
    const targets = document.querySelectorAll(".ContactItem.FileName");
    targets.forEach(function (el) { el.classList.toggle("mci-fileNameFixed", fileNamesFixed); });
    return { active: fileNamesFixed, count: targets.length };
  }

  function rowHighlightHandler(ev) {
    ev.stopPropagation();
    const row = ev.currentTarget;
    const color = localStorage.getItem(HIGHLIGHT_COLOR_KEY) || DEFAULT_ROW_COLOR;

    const isOn = row.dataset.mciHighlighted === "true";
    if (isOn) {
      row.style.backgroundColor = "";
      row.dataset.mciHighlighted = "";
    } else {
      row.style.backgroundColor = color;
      row.dataset.mciHighlighted = "true";
    }
  }

  function attachRowHighlighter() {
    const rows = document.querySelectorAll("div.zebra-row.email-row, .search-results-row");
    rows.forEach(function (row) {
      row.style.cursor = "pointer";
      if (!row.dataset.mciRowListener) {
        row.addEventListener("click", rowHighlightHandler);
        row.dataset.mciRowListener = "1";
      }
    });
    return rows.length;
  }

  function updateHighlightedRows(color) {
    document.querySelectorAll('[data-mci-highlighted="true"]').forEach(function (row) {
      row.style.backgroundColor = color;
    });
  }

  /*************************
   * CROSS-SITE TRIGGERS    *
   *************************/
  function triggerContactMapper(mode) {
    const detail = { source: "mci-menu", mode: mode || "auto" };
    try { window.postMessage({ __mci: "run-contact-mapper", detail: detail }, "*"); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent("mci-run-contact-mapper", { detail: detail })); } catch (e2) {}
    try { window.dispatchEvent(new CustomEvent("mci-run-contact-mapper", { detail: detail })); } catch (e3) {}
    try { if (window.top && window.top !== window) window.top.dispatchEvent(new CustomEvent("mci-run-contact-mapper", { detail: detail })); } catch (e4) {}
  }

  function triggerFileDownloader(tool) {
    const detail = { source: "mci-menu", tool: tool };
    try { window.postMessage({ __mci: "run-file-downloader", detail: detail }, "*"); } catch (e) {}
  }

  /*************************
   * CONFIG UI DSL          *
   *************************/
  // Supported item types:
  // - button: {type:"button", id, text, className, onClick}
  // - pair:   {type:"pair", left:{...button}, right:{...button}}
  // - split:  {type:"split", className, left:{...}, right:{...}}
  // - panel:  {type:"panel", toggle:{...button}, panelId, items:[...]}
  // - custom: {type:"custom", html}  (for your shortcuts card etc.)
  // - rowControls: QQ row highlighter + color input compact row

  const storedRowColor = localStorage.getItem(HIGHLIGHT_COLOR_KEY) || DEFAULT_ROW_COLOR;
  if (IS_QQ && !localStorage.getItem(HIGHLIGHT_COLOR_KEY)) localStorage.setItem(HIGHLIGHT_COLOR_KEY, storedRowColor);

  const SECTIONS = [
    IS_QQ ? {
      label: "QQ Helpers",
      items: [
        { type: "button", id: "mci_pdf_open", text: "📄 Open PDFs (Smart)", className: "mci-btn primary" },
        { type: "button", id: "mci_fix_names", text: "🧾Show Full File Names", className: "mci-btn purple" },
        { type: "rowControls" }
      ]
    } : null,

    {
      label: "Cross-site tools",
      items: [
        {
          type: "pair",
          left:  { id: "mci_copy",  text: "✂️Copy",  className: "mci-btn blue" },
          right: { id: "mci_paste", text: "📋Paste", className: "mci-btn green" }
        }
      ]
    },

    {
      label: "Quote Export",
      items: [
        {
          type: "panel",
          panelId: "mci_export_panel",
          toggle: { id: "mci_export_toggle", text: "🚗 Erie Export Quote ▸", className: "mci-btn blue" },
          items: [
            { type: "button", id: "mci_export_auto", text: "Auto Quote", className: "mci-btn brand" },
            { type: "button", id: "mci_export_home", text: "Home Quote", className: "mci-btn brand" }
          ]
        }
      ]
    },

    {
      label: "File Downloader",
      items: [
        {
          type: "panel",
          panelId: "mci_fd_panel",
          toggle: { id: "mci_fd_toggle", text: "📥 File Downloader ▸", className: "mci-btn blue" },
          items: [
            { type: "button", id: "mci_fd_erie", text: "Erie / NatGen", className: "mci-btn purple" },
            {
              type: "split",
              className: "mci-split-btn brand",
              left:  { id: "mci_fd_prog_res", text: "Progressive Residential", title: "Trigger Progressive Residential downloader" },
              right: { id: "mci_fd_prog_com", text: "Progressive Commercial",  title: "Trigger Progressive Commercial downloader" }
            },
            {
              type: "split",
              className: "mci-split-btn aqua",
              left:  { id: "mci_fd_flood_beyond", text: "Beyond Floods", title: "Trigger Beyond Floods downloader" },
              right: { id: "mci_fd_flood_nfip",   text: "NFIP Flood",   title: "Trigger NFIP Flood downloader" }
            },
            { type: "button", id: "mci_fd_ncjua", text: "NCJUA", className: "mci-btn green" }
          ]
        }
      ]
    },

    {
      label: "QQC Extractor",
      items: [
        { type: "button", id: "mci_open_qqc", text: "📂 Get Customer Data", className: "mci-btn purple" }
      ]
    },

    {
      label: "Menu",
      items: [
        { type: "button", id: "mci_cashCenter", text: "💵 Cash Payment Center", className: "mci-btn brand" },
        { type: "button", id: "mci_fax",        text: "📠 Fax",               className: "mci-btn brand" }
      ]
    },

    {
      label: "Shortcuts",
      items: [
        {
          type: "custom",
          html:
            '<div class="mci-footer-note shortcuts v2">' +
              '<div class="tip">💡 <b>Tip:</b> Hover text, then press the key</div>' +
              '<div class="group"><div class="list">' +
                '<span><b>SMART LOOKUP</b></span>' +
                '<div><span class="kbd">ALT</span> + <span class="kbd">Right-Click</span></div>' +
                '<div>Name → Address → Policy #</div>' +
              '</div></div>' +
              '<hr style="border:none;border-top:1px dashed rgba(255,255,255,.2);margin:8px 0;">' +
              '<div class="group"><div class="list">' +
                '<span><b>VIN LOOKUP</b></span>' +
                '<div><span class="kbd">F10</span></div>' +
                '<div>NHTSA Decoder</div>' +
              '</div></div>' +
            '</div>'
        }
      ]
    }
  ].filter(Boolean);

  /*************************
   * RENDER HELPERS         *
   *************************/
  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderButton(btn) {
    const cls = btn.className || "mci-btn";
    const title = btn.title ? ' title="' + escHtml(btn.title) + '"' : "";
    return '<button class="' + escHtml(cls) + '" id="' + escHtml(btn.id) + '"' + title + ' type="button">' +
      escHtml(btn.text) +
    "</button>";
  }

  function renderPair(pair) {
    return (
      '<div class="mci-btn-pair">' +
        renderButton(pair.left) +
        renderButton(pair.right) +
      "</div>"
    );
  }

  function renderSplit(split) {
    const leftTitle = split.left.title ? ' title="' + escHtml(split.left.title) + '"' : "";
    const rightTitle = split.right.title ? ' title="' + escHtml(split.right.title) + '"' : "";

    return (
      '<div class="' + escHtml(split.className || "mci-split-btn") + '" role="group">' +
        '<button class="mci-split-half" id="' + escHtml(split.left.id) + '" type="button"' + leftTitle + ">" +
          escHtml(split.left.text) +
        "</button>" +
        '<div class="mci-split-divider" aria-hidden="true"></div>' +
        '<button class="mci-split-half" id="' + escHtml(split.right.id) + '" type="button"' + rightTitle + ">" +
          escHtml(split.right.text) +
        "</button>" +
      "</div>"
    );
  }

  function renderPanel(panel) {
    return (
      '<div class="mci-downloader">' +
        renderButton(panel.toggle) +
        '<div class="mci-downloader-panel" id="' + escHtml(panel.panelId) + '">' +
          panel.items.map(renderItem).join("") +
        "</div>" +
      "</div>"
    );
  }

  function renderRowControls() {
    return (
      '<div class="qq-row-controls">' +
        '<button class="mci-btn green" id="mci_row_highlight" style="flex:1" type="button">🟡 Row Highlighter</button>' +
        '<label class="color-chip" title="Pick highlight color">' +
          '<input type="color" id="mci_row_color" value="' + escHtml(storedRowColor) + '" />' +
        "</label>" +
      "</div>"
    );
  }

  function renderItem(item) {
    if (!item || !item.type) return "";
    if (item.type === "button") return renderButton(item);
    if (item.type === "pair") return renderPair(item);
    if (item.type === "split") return renderSplit(item);
    if (item.type === "panel") return renderPanel(item);
    if (item.type === "custom") return item.html || "";
    if (item.type === "rowControls") return renderRowControls();
    return "";
  }

  function renderSections() {
    return SECTIONS.map(function (sec) {
      return (
        '<div class="divider" data-label="' + escHtml(sec.label) + '"></div>' +
        '<div class="mci-section"><div class="mci-body">' +
          sec.items.map(renderItem).join("") +
        "</div></div>"
      );
    }).join("");
  }

  /*************************
   * MOUNT SHADOW UI        *
   *************************/
  function mount() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      Object.assign(host.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "0",
        height: "0",
        zIndex: "2147483647"
      });
      document.documentElement.appendChild(host);
      host.attachShadow({ mode: "open" });
    }

    const root = host.shadowRoot;
    if (root.getElementById(MENU_ID)) return root;

    if (IS_QQ) ensureGlobalStyles();

    root.innerHTML =
      '<style>' +
        ':host{all:initial} *,*::before,*::after{box-sizing:border-box}' +

        /* TAB */
        '#' + TRIGGER_ID + '{position:fixed;top:50%;left:0;transform:translateY(-50%);width:18px;height:54px;z-index:2147483647;background:#0a5efa;color:#fff;border:none;border-radius:0 10px 10px 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:6px 0;opacity:.90;box-shadow:2px 0 10px rgba(0,0,0,.35);transition:opacity .15s ease,width .15s ease,background .15s ease,box-shadow .2s ease}' +
        '#' + TRIGGER_ID + ':hover{opacity:1;width:22px;background:#1e3a8a;box-shadow:3px 0 14px rgba(0,0,0,.45)}' +
        '#' + TRIGGER_ID + '[data-open="1"]{opacity:.55}' +
        '.mci-tab-mark{width:14px;height:14px;border-radius:50%;background-size:contain;background-repeat:no-repeat;background-position:center}' +
        '.mci-tab-label{writing-mode:vertical-rl;transform:rotate(180deg);font:700 10px system-ui,Segoe UI,Arial;letter-spacing:.8px;opacity:.95;user-select:none}' +

        /* MENU */
        '#' + MENU_ID + '{position:fixed;top:0;left:-230px;width:230px;height:100vh;background:#1a1c22;color:#eef3ff;z-index:2147483646;padding-top:0;box-shadow:2px 0 10px rgba(0,0,0,.55);transition:left .22s cubic-bezier(.2,.9,.2,1),box-shadow .22s ease,filter .22s ease;overflow-x:hidden;overflow-y:auto;font:13px system-ui,Segoe UI,Arial;will-change:left}' +
        '#' + MENU_ID + '[data-open="1"]{left:0!important;filter:brightness(1.02)}' +

        '.mci-section{margin:10px 10px 6px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:#20232b;overflow:hidden}' +
        '.mci-head{background:#0f172a;color:#fff;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;align-items:flex-start;gap:2px;font-weight:700;letter-spacing:.2px}' +
        '.mci-head-top{display:flex;align-items:center;gap:6px}' +
        '.mci-head-meta{display:flex;align-items:center;gap:6px;font-weight:600;font-size:12px;width:100%}' +
        '.mci-close-btn{background:none;border:none;color:#f97373;cursor:pointer;font-size:14px;padding:0;margin:0}' +
        '.mci-close-btn:hover{color:#fecaca}' +
        '.mci-title{font-size:14px}' +
        '.badge{display:inline-block;background:#334155;color:#e6eef8;border:1px solid rgba(255,255,255,.08);padding:3px 6px;border-radius:999px;font-size:11px;margin-left:6px}' +

        /* HEADER HOVER TOGGLE */
        '.mci-switch{margin-left:auto;display:flex;align-items:center;gap:6px;user-select:none;cursor:pointer;font:600 11px system-ui,Segoe UI,Arial;color:#cfe2ff}' +
        '.mci-switch input{display:none}' +
        '.mci-slider{width:34px;height:18px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);position:relative;transition:background .15s ease,border-color .15s ease}' +
        '.mci-slider::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#9fb4d8;transition:transform .15s ease,background .15s ease}' +
        '.mci-switch-text{opacity:.9;letter-spacing:.2px}' +
        '.mci-switch input:checked + .mci-slider{background:rgba(19,115,51,.45);border-color:rgba(19,115,51,.65)}' +
        '.mci-switch input:checked + .mci-slider::after{transform:translateX(16px);background:#c7f9d4}' +

        /* BODY */
        '.mci-body{padding:8px 10px}' +
        '.mci-btn{display:block;width:100%;margin:4px 0!important;padding:5px 9px!important;border-radius:4px;border:1px solid rgba(255,255,255,.08);background:#2a2f39;color:#fff;text-align:left;cursor:pointer;line-height:1.2;transition:transform .08s ease,box-shadow .18s ease,filter .18s ease,border-color .18s ease!important}' +
        '.mci-btn:hover{transform:translateY(-1px)!important;box-shadow:0 6px 14px rgba(0,0,0,.45)!important;filter:brightness(1.15)!important;border-color:rgba(255,255,255,.2)!important}' +
        '.mci-btn:active{transform:translateY(0)!important;box-shadow:0 3px 8px rgba(0,0,0,.4)!important}' +
        '.mci-btn.primary{background:#1f6feb}.mci-btn.primary:hover{background:#2b79f0}' +
        '.mci-btn.green{background:#3ba55d}.mci-btn.green:hover{background:#44b569}' +
        '.mci-btn.blue{background:#2563eb}.mci-btn.blue:hover{background:#2b6ef5}' +
        '.mci-btn.purple{background:#7b68ee}.mci-btn.purple:hover{background:#6c5ce7}' +
        '.mci-btn.brand{background:#1e40af}.mci-btn.brand:hover{background:#1e3a8a}' +

        '.mci-btn-pair{display:flex;gap:8px}.mci-btn-pair .mci-btn{flex:1;margin:0!important}' +

        '.mci-split-btn{display:flex;width:100%;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.12);padding:0;height:37px}' +
        '.mci-split-btn.brand{background:#1e40af}.mci-split-btn.aqua{background:#32a8a2}' +
        '.mci-split-half{flex:1;border:none;margin:0;background:transparent;color:#fff;text-align:center;cursor:pointer;font:inherit;line-height:1.2;transition:background .15s,transform .05s,filter .18s ease}' +
        '.mci-split-half:hover{background:rgba(0,0,0,.18);filter:brightness(1.15)}' +
        '.mci-split-half:active{transform:scale(.99)}' +
        '.mci-split-divider{width:1px;background:rgba(255,255,255,.18)}' +

        '.divider{margin:12px 10px 10px;border-top:1px dashed rgba(255,255,255,.25);position:relative;height:0}' +
        '.divider::after{content:attr(data-label);position:absolute;left:50%;transform:translate(-50%,-55%);background:#1a1c22;padding:0 6px;color:#9fb4d8;font-size:11px;letter-spacing:.2px}' +

        '.mci-downloader{display:flex;flex-direction:column;gap:8px}' +
        '.mci-downloader .mci-btn{margin:0!important}' +
        '.mci-downloader-panel{display:none;flex-direction:column;gap:8px}' +
        '.mci-downloader-panel.open{display:flex}' +

        '.qq-row-controls{display:flex;gap:8px;align-items:center}' +
        '#mci_row_color{width:26px;height:29px;border:none;padding:0;background:none;cursor:pointer}' +

        '.mci-footer-note.shortcuts.v2{margin-top:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.06);color:#d0d6e2;font-size:12px;line-height:1.25}' +
        '.mci-footer-note.shortcuts.v2 .tip{margin-bottom:6px;color:#c7cfdb}' +
        '.mci-footer-note.shortcuts.v2 .group{display:flex;align-items:flex-start;gap:10px;margin:6px 0 0}' +
        '.mci-footer-note.shortcuts.v2 .kbd{flex:0 0 auto;font:600 11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.15);letter-spacing:.3px;margin-top:1px}' +
        '.mci-footer-note.shortcuts.v2 .list{flex:1 1 auto;display:flex;flex-direction:column;gap:3px;max-width:100%;white-space:normal;word-break:break-word}' +
        '.mci-footer-note.shortcuts.v2 .list b{color:#fff}' +
      "</style>" +

      '<button id="' + TRIGGER_ID + '" type="button" title="MCI Toolbox" aria-label="Toggle MCI Toolbox">' +
        '<span class="mci-tab-mark" style="background-image:url(\'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%3Ccircle%20cx%3D%2232%22%20cy%3D%2232%22%20r%3D%2230%22%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.16%22%2F%3E%3Cpath%20d%3D%22M16%2044V20h6l10%2014%2010-14h6v24h-6V30l-10%2014-10-14v14z%22%20fill%3D%22%23ffffff%22%2F%3E%3C%2Fsvg%3E\')"></span>' +
        '<span class="mci-tab-label">MCI</span>' +
      "</button>" +

      '<div id="' + MENU_ID + '">' +
        '<div class="mci-head">' +
          '<div class="mci-head-top">' +
            '<button id="mci_remove_header" class="mci-close-btn" title="Remove Menu">❌</button>' +
            '<span class="mci-title">MCI Toolbox</span>' +
          "</div>" +
          '<div class="mci-head-meta">' +
            '<span class="badge">' + escHtml(getSystemLabel()) + "</span>" +
            '<label class="mci-switch" title="When ON, moving to the left edge opens the menu">' +
              '<input type="checkbox" id="mci_hover_toggle">' +
              '<span class="mci-slider"></span>' +
              '<span class="mci-switch-text">Hover</span>' +
            "</label>" +
          "</div>" +
        "</div>" +

        renderSections() +
      "</div>";

    const $s = (sel) => root.querySelector(sel);
    const menuEl = $s("#" + MENU_ID);
    const tabEl = $s("#" + TRIGGER_ID);

    function setMenuOpen(open) {
      if (menuEl) {
        menuEl.style.left = open ? "0" : "-230px";
        menuEl.setAttribute("data-open", open ? "1" : "");
      }
      if (tabEl) tabEl.setAttribute("data-open", open ? "1" : "");
    }

    setMenuOpen(false);

    tabEl.addEventListener("click", function () {
      const isOpen = menuEl && menuEl.getAttribute("data-open") === "1";
      setMenuOpen(!isOpen);
    });

    $s("#mci_remove_header").addEventListener("click", function () {
      document.getElementById(HOST_ID).remove();
    });

    /***************
     * HOVER MODE   *
     ***************/
    let hoverMode = false;

    function readPref() {
      try { return !!GM_getValue(PREF_HOVER_KEY, false); } catch (e) { return false; }
    }

    function applyHoverUi() {
      tabEl.setAttribute("data-hovermode", hoverMode ? "1" : "");
      const ht = $s("#mci_hover_toggle");
      if (ht) ht.checked = !!hoverMode;
    }

    function writePref(v) {
      try { GM_setValue(PREF_HOVER_KEY, !!v); } catch (e) {}
      hoverMode = !!v;
      applyHoverUi();
      toast(hoverMode ? "Hover-open: ON (edge opens menu)" : "Hover-open: OFF (click tab to open)");
    }

    hoverMode = readPref();

    // Green only on the M circle (no box-shadow bleed)
    (function injectHoverModeCss() {
      if (root.getElementById("mci-hovermode-css")) return;
      const st = document.createElement("style");
      st.id = "mci-hovermode-css";
      st.textContent =
        "#" + TRIGGER_ID + '[data-hovermode="1"] .mci-tab-mark{background-color:#137333 !important;}';
      root.appendChild(st);
    })();

    const hoverToggle = $s("#mci_hover_toggle");
    hoverToggle.checked = !!hoverMode;
    hoverToggle.addEventListener("change", function () { writePref(hoverToggle.checked); });

    tabEl.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();
      writePref(!hoverMode);
    });

    tabEl.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      e.stopPropagation();
      writePref(!hoverMode);
    });

    let hoverCloseTimer = null;
    let overMenuOrTab = false;

    function clearHoverCloseTimer() {
      if (hoverCloseTimer) clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    }

    function scheduleCloseIfSafe() {
      clearHoverCloseTimer();
      hoverCloseTimer = setTimeout(function () {
        if (!hoverMode) return;
        if (overMenuOrTab) return;
        const isOpen = menuEl && menuEl.getAttribute("data-open") === "1";
        if (isOpen) setMenuOpen(false);
      }, 220);
    }

    function bindEnterLeave(el) {
      if (!el) return;
      el.addEventListener("mouseenter", function () {
        overMenuOrTab = true;
        clearHoverCloseTimer();
      });
      el.addEventListener("mouseleave", function () {
        overMenuOrTab = false;
        scheduleCloseIfSafe();
      });
    }

    bindEnterLeave(menuEl);
    bindEnterLeave(tabEl);

    document.addEventListener("mousemove", function (ev) {
      if (!hoverMode) return;

      if (ev.clientX <= 2) {
        const isOpen = menuEl && menuEl.getAttribute("data-open") === "1";
        if (!isOpen) setMenuOpen(true);
        return;
      }

      const isOpen2 = menuEl && menuEl.getAttribute("data-open") === "1";
      if (isOpen2 && !overMenuOrTab) {
        // Option A: distance from left edge
        if (ev.clientX > 260) scheduleCloseIfSafe();
      }
    }, true);

    applyHoverUi();

    /*************************
     * PANEL TOGGLES (generic)
     *************************/
    function wirePanel(toggleId, panelId, openText, closedText) {
      const t = $s("#" + toggleId);
      const p = $s("#" + panelId);
      if (!t || !p) return;

      t.addEventListener("click", function () {
        const open = p.classList.toggle("open");
        if (open) t.textContent = openText;
        else t.textContent = closedText;
      });
    }

    wirePanel("mci_fd_toggle", "mci_fd_panel", "File Downloader ▾", "📥 File Downloader ▸");
    wirePanel("mci_export_toggle", "mci_export_panel", "🚗 Export Quote ▾", "🚗 Erie Export Quote ▸");

    /*************************
     * WIRE BUTTON ACTIONS    *
     *************************/
    function onClick(id, fn) {
      const el = $s("#" + id);
      if (el) el.addEventListener("click", fn);
    }

    // QQ
    if (IS_QQ) {
      startPdfPopupObserver();

      onClick("mci_pdf_open", function () { smartOpenPdfs(); });

      onClick("mci_fix_names", function () {
        const res = toggleFileNameFix();
        if (!res.count) toast("No file name cells found on this page.");
        else if (res.active) toast("Showing full file names on " + res.count + " cell(s).");
        else toast("File names returned to normal.");
      });

      onClick("mci_row_highlight", function () {
        const count = attachRowHighlighter();
        toast(count ? ("Row highlighter active on " + count + " row(s).") : "No rows found to highlight on this page.");
      });

      const c = $s("#mci_row_color");
      if (c) {
        c.addEventListener("input", function (e) {
          const color = e.target.value || DEFAULT_ROW_COLOR;
          localStorage.setItem(HIGHLIGHT_COLOR_KEY, color);
          updateHighlightedRows(color);
          toast("Highlight color set to " + color + ".");
        });
      }
    }

    // Cross-site tools (your separate script listens)
    onClick("mci_copy", function () {
      window.dispatchEvent(new CustomEvent("mci:copy"));
      toast("Copy requested…");
    });

    onClick("mci_paste", function () {
      window.dispatchEvent(new CustomEvent("mci:paste"));
      toast("Paste requested…");
    });

    // QQC extractor
    onClick("mci_open_qqc", function () {
      if (/qqcatalyst\.com$/i.test(location.hostname)) {
        toast("Get Customer Data is for carrier sites (not QQ).");
        return;
      }
      triggerContactMapper("auto");
    });

    // Export quote (expects global functions available)
    onClick("mci_export_auto", function () {
      try {
        if (PAGE_WINDOW.mciRunErieAutoExport) PAGE_WINDOW.mciRunErieAutoExport();
        else if (window.top && window.top.mciRunErieAutoExport) window.top.mciRunErieAutoExport();
        else toast("Auto export script not found on this page.");
      } catch (e) {
        console.warn("[MCI Toolbox] Auto export error:", e);
        toast("Error starting Auto export – see console.");
      }
    });

    onClick("mci_export_home", function () {
      try {
        if (PAGE_WINDOW.mciRunErieHomeExport) PAGE_WINDOW.mciRunErieHomeExport();
        else if (window.top && window.top.mciRunErieHomeExport) window.top.mciRunErieHomeExport();
        else toast("Home export script not found on this page.");
      } catch (e) {
        console.warn("[MCI Toolbox] Home export error:", e);
        toast("Error starting Home export – see console.");
      }
    });

    // File downloader triggers
    onClick("mci_fd_erie", function () {
      $s("#mci_fd_panel").classList.remove("open");
      $s("#mci_fd_toggle").textContent = "📥 File Downloader ▸";
      triggerFileDownloader("erie-natgen");
      toast("Erie/NatGen downloader triggered.");
    });

    onClick("mci_fd_prog_res", function () {
      $s("#mci_fd_panel").classList.remove("open");
      $s("#mci_fd_toggle").textContent = "📥 File Downloader ▸";
      try {
        window.dispatchEvent(new CustomEvent("mci:progressive-residential"));
        window.dispatchEvent(new CustomEvent("mci:progressive-downloader")); // back-compat
      } catch (e) {}
      toast("Progressive Residential triggered.");
    });

    onClick("mci_fd_prog_com", function () {
      $s("#mci_fd_panel").classList.remove("open");
      $s("#mci_fd_toggle").textContent = "📥 File Downloader ▸";
      try { window.dispatchEvent(new CustomEvent("mci:progressive-commercial")); } catch (e) {}
      toast("Progressive Commercial triggered.");
    });

    onClick("mci_fd_flood_beyond", function () {
      $s("#mci_fd_panel").classList.remove("open");
      $s("#mci_fd_toggle").textContent = "📥 File Downloader ▸";
      try { window.dispatchEvent(new CustomEvent("mci:flood-beyond")); } catch (e) {}
      toast("Beyond Floods triggered.");
    });

    onClick("mci_fd_flood_nfip", function () {
      $s("#mci_fd_panel").classList.remove("open");
      $s("#mci_fd_toggle").textContent = "📥 File Downloader ▸";
      try { window.dispatchEvent(new CustomEvent("mci:flood-nfip")); } catch (e) {}
      toast("NFIP Flood triggered.");
    });

    onClick("mci_fd_ncjua", function () {
      // close sub panel + menu
      $s("#mci_fd_panel").classList.remove("open");
      $s("#mci_fd_toggle").textContent = "📥 File Downloader ▸";
      setMenuOpen(false);

      triggerFileDownloader("ncjua");
      toast("NCJUA downloader triggered.");
    });

    // Menu links
    onClick("mci_cashCenter", function () {
      window.open(
        "https://script.google.com/macros/s/AKfycbyna22X-JzASUbS4pR6IdvPrtd_m_lYzUAXqbwxHAVBqYRHvkOCehY1uzY3wC_4gavu/exec",
        "_blank",
        "noopener,noreferrer"
      );
    });

    onClick("mci_fax", function () {
      const onSite = location.hostname.indexOf("gotfreefax.com") >= 0;
      if (!onSite) {
        window.open("https://www.gotfreefax.com/", "_blank", "noopener,noreferrer");
        return;
      }
      // If you have your fax enhancer function elsewhere, call it here.
      toast("Fax page detected.");
    });

    return root;
  }

  /*************************
   * BOOT                  *
   *************************/
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

})();