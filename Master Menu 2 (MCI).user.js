// ==UserScript==
// @name         Master Menu 2 (MCI)
// @namespace    mci-tools
// @version      6.0.1
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
// @match        https://app.orion180.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Master%20Menu%202%20(MCI).user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Master%20Menu%202%20(MCI).user.js
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
  const IS_ORION180 = /app\.orion180\.com/.test(HOST);

  const IN_IFRAME = window.top !== window.self;
  if (IN_IFRAME && !(IS_QQ || IS_PROG)) return;

  /*************************
   * CONSTS / IDS / PREFS   *
   *************************/
  const HOST_ID = "mci-shadow-host";
  const MENU_ID = "mciSlideMenu";
  const TRIGGER_ID = "mciSlideTrigger";

  const PREF_HOVER_KEY = "mci_pref_hover_open";
  const PREF_ERIE_EXTRACTOR_ENABLED_KEY = "mci_pref_erie_extractor_enabled";
  const EVENT_ERIE_EXTRACTOR_TOGGLE = "mci:erie-extractor-toggle";
  const EVENT_COUNTY_RUN = "mci-county-run";
  const EVENT_COUNTY_MANUAL = "mci-county-manual";

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
    if (IS_ORION180) return "Orion180";
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
      .ContactItem.FileName.mci-fileNameFixed{
        display:block !important;
        max-width:240px !important;
        white-space:normal !important;
        overflow:visible !important;
        text-overflow:clip !important;
        word-break:break-word !important;
        overflow-wrap:anywhere !important;
        line-height:1.25 !important;
      }

      .ContactItem.FileName.mci-fileNameFixed::after{
        content:"";
        display:block;
        clear:both;
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

  function qqBuildReadableFileName(fileName) {
    const name = String(fileName || "").trim();
    if (!name) return { error: "The current file name is empty." };

    const policyMatch = name.match(/pol(?<policy>\d+)/i);
    const dateMatch = name.match(/(?:tdt|td)(?<date>\d{8})/i);
    let typeMatch = name.match(/(?:Entr|trn)(?<type>.*?)(?:tdt|td)\d{8}/i);

    if (!typeMatch) {
      typeMatch = name.match(/itm(?<type>.*?)(?:tdt|td)\d{8}/i);
    }

    if (!policyMatch || !policyMatch.groups || !policyMatch.groups.policy) {
      return { error: "Could not find a policy number after 'pol'." };
    }

    if (!dateMatch || !dateMatch.groups || !dateMatch.groups.date) {
      return { error: "Could not find an 8-digit date after 'tdt' or 'td'." };
    }

    if (!typeMatch || !typeMatch.groups || !typeMatch.groups.type) {
      return { error: "Could not find the document type." };
    }

    const policy = policyMatch.groups.policy;
    const rawDate = dateMatch.groups.date;

    const rawType = typeMatch.groups.type
      .trim()
      .replace(/^[_\-\s]+|[_\-\s]+$/g, "")
      .toUpperCase();

    const typeMap = {
      ENDORSEMENT: "Endorsement",
      RENEWAL: "Renewal",
      NEWBUSINESS: "New Business",
      NEW_BUSINESS: "New Business",
      CANCEL_PENDING: "Pending Notice",
      CANCELPENDING: "Pending Notice",
      PENDING_NOTICE: "Pending Notice",
      CANCELLATION: "Cancellation",
      CANCELLED: "Cancellation",
      CANCELED: "Cancellation",
      REINSTATEMENT: "Reinstatement",
      NONRENEWAL: "Non-Renewal",
      NON_RENEWAL: "Non-Renewal",
      DECLARATION: "Declaration",
      DECLARATIONS: "Declarations",
      DECPAGE: "Declarations",
      POLICY: "Policy",
      NOTICE: "Notice"
    };

    let documentType = typeMap[rawType];

    if (!documentType) {
      documentType = rawType
        .replace(/[_-]+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, function (ch) {
          return ch.toUpperCase();
        })
        .trim();
    }

    const year = Number(rawDate.slice(0, 4));
    const month = Number(rawDate.slice(4, 6));
    const day = Number(rawDate.slice(6, 8));

    const parsedDate = new Date(
      Date.UTC(year, month - 1, day)
    );

    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      return { error: "The date in the file name is not valid." };
    }

    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");

    const safeType = documentType
      .replace(/[<>:\"/\|?*]/g, "")
      .trim();

    return {
      name:
        policy +
        " - " +
        safeType +
        " - " +
        mm +
        "-" +
        dd +
        "-" +
        year +
        ".pdf"
    };
  }

  function qqFindPopupButtonByText(popup, wantedText) {
    const wanted = String(wantedText || "")
      .trim()
      .toLowerCase();

    return Array.from(
      popup.querySelectorAll(
        "button, input[type='button'], input[type='submit'], a"
      )
    ).find(function (el) {
      const text = String(
        el.textContent || el.value || ""
      )
        .trim()
        .toLowerCase();

      return text === wanted;
    }) || null;
  }

  function qqFindPopupTitleInput(popup) {
    return (
      (popup &&
        popup.querySelector(
          '#titleBox input[name="docTitleTextEdit"]'
        )) ||
      document.querySelector(
        '#preview.file-edit-popup #titleBox input[name="docTitleTextEdit"]'
      ) ||
      document.querySelector(
        '#titleBox input[name="docTitleTextEdit"]'
      )
    );
  }

  function qqSetInputValue(input, value) {
    const proto =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const descriptor = Object.getOwnPropertyDescriptor(
      proto,
      "value"
    );

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    ["input", "change", "keyup"].forEach(function (eventName) {
      input.dispatchEvent(
        new Event(eventName, {
          bubbles: true
        })
      );
    });
  }

  function qqFixPopupFileName(popup, fixButton, attempt) {
    attempt = attempt || 0;

    // QQ may rebuild or replace the popup after Edit is clicked,
    // so always get the current popup again.
    const activePopup =
      document.querySelector("#preview.file-edit-popup") ||
      popup;

    const titleInput =
      qqFindPopupTitleInput(activePopup);

    if (!titleInput) {
      if (attempt < 15) {
        setTimeout(function () {
          qqFixPopupFileName(
            activePopup,
            fixButton,
            attempt + 1
          );
        }, 200);

        return;
      }

      toast("Could not find QQ's Title field.");
      return;
    }

    // Click QQ's Edit button if the field is disabled or read-only.
    if (titleInput.disabled || titleInput.readOnly) {
      const editButton =
        qqFindPopupButtonByText(
          activePopup,
          "Edit"
        );

      if (editButton && attempt === 0) {
        editButton.click();
      }

      if (attempt < 15) {
        setTimeout(function () {
          qqFixPopupFileName(
            document.querySelector(
              "#preview.file-edit-popup"
            ) || activePopup,
            fixButton,
            attempt + 1
          );
        }, 200);

        return;
      }

      toast("QQ's Title field is still locked.");
      return;
    }

    const result =
      qqBuildReadableFileName(
        titleInput.value
      );

    if (result.error) {
      toast(result.error);
      return;
    }

    qqSetInputValue(
      titleInput,
      result.name
    );

    titleInput.focus();
    titleInput.select();

    if (fixButton) {
      const originalText =
        fixButton.textContent;

      fixButton.textContent = "Fixed ✓";

      setTimeout(function () {
        fixButton.textContent =
          originalText;
      }, 1400);
    }

    toast(
      "Name fixed. Click Save to apply it."
    );
  }

  function addOpenPdfButtonToPopup() {
    const popup = document.querySelector(
      "#preview.file-edit-popup"
    );

    if (
      !popup ||
      getComputedStyle(popup).display === "none"
    ) {
      return;
    }

    const img = popup.querySelector("img");

    if (
      !img ||
      !/DownloadQuickFile/i.test(img.src || "")
    ) {
      return;
    }

    if (
      popup.querySelector(".mci-popup-file-actions")
    ) {
      return;
    }

    let id = "";

    try {
      id =
        new URL(
          img.src,
          location.origin
        ).searchParams.get("id") || "";
    } catch (e) {}

    if (!id) {
      return;
    }

    const actions = document.createElement("div");

    actions.className = "mci-popup-file-actions";

    Object.assign(actions.style, {
      marginTop: "10px",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      flexWrap: "wrap"
    });

    function stylePopupButton(btn) {
      Object.assign(btn.style, {
        display: "inline-block",
        background: "#1f6feb",
        color: "#fff",
        padding: "8px 12px",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: "600"
      });
    }

    const openButton =
      document.createElement("button");

    openButton.type = "button";
    openButton.textContent =
      "Open PDF in New Tab";
    openButton.className =
      "mci-open-popup-btn";

    stylePopupButton(openButton);

    openButton.addEventListener(
      "click",
      function () {
        window.open(
          location.origin +
            "/FileUpload/DownloadFile/" +
            id +
            "?preview=true",
          "_blank"
        );
      }
    );

    const fixButton =
      document.createElement("button");

    fixButton.type = "button";
    fixButton.textContent = "Fix Name";
    fixButton.className =
      "mci-fix-popup-name-btn";

    stylePopupButton(fixButton);

    fixButton.addEventListener(
      "click",
      function () {
        qqFixPopupFileName(
          popup,
          fixButton,
          0
        );
      }
    );

    actions.appendChild(openButton);
    actions.appendChild(fixButton);
    popup.appendChild(actions);
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
    const target = ev.target;
    if (target && target.closest(
      '.transactions.arrow, .action-south, [title="Show Transactions"], [data-url*="TransactionsList"], ' +
      'a, button, input, select, textarea, label, [role="button"], [onclick]'
    )) {
      return;
    }

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
      const rows = document.querySelectorAll(
        "div.zebra-row.email-row, .search-results-row, .TableRow.AcordItemRow"
      );

      rows.forEach(function (row) {
        row.style.cursor = "pointer";

        if (!row.dataset.mciRowListener) {
          row.addEventListener("click", rowHighlightHandler);
          row.dataset.mciRowListener = "1";
        }
      });

      return rows.length;
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

  function triggerCountyFinder(mode, address) {
    const isManual = mode === "manual";
    const detail = {
      source: "mci-menu",
      mode: isManual ? "manual" : "auto",
      address: address || ""
    };
    const eventName = isManual ? EVENT_COUNTY_MANUAL : EVENT_COUNTY_RUN;

    try { window.dispatchEvent(new CustomEvent(eventName, { detail: detail })); } catch (e) {}
  }

  function getErieExtractorEnabled() {
    try {
      const raw = localStorage.getItem(PREF_ERIE_EXTRACTOR_ENABLED_KEY);
      if (raw == null) return true;
      return raw === "true";
    } catch (e) {
      return true;
    }
  }

  function setErieExtractorEnabled(enabled) {
    try {
      localStorage.setItem(PREF_ERIE_EXTRACTOR_ENABLED_KEY, enabled ? "true" : "false");
    } catch (e) {}
  }

  function getErieExtractorToggleLabel(enabled) {
    return "Erie Extractor: " + (enabled ? "On" : "Off");
  }

  function refreshErieExtractorToggleButton() {
    const host = document.getElementById(HOST_ID);
    const root = host && host.shadowRoot;
    if (!root) return;

    const btn = root.querySelector("#mci_erie_extractor_toggle");
    if (!btn) return;

    const enabled = getErieExtractorEnabled();
    btn.textContent = getErieExtractorToggleLabel(enabled);
    btn.setAttribute("data-on", enabled ? "1" : "0");
  }

  let erieExtractorToggleSyncWired = false;
  function wireErieExtractorToggleSyncListeners() {
    if (erieExtractorToggleSyncWired) return;
    erieExtractorToggleSyncWired = true;

    window.addEventListener("storage", function (event) {
      if (!event || event.key !== PREF_ERIE_EXTRACTOR_ENABLED_KEY) return;
      refreshErieExtractorToggleButton();
    });

    function onErieExtractorToggleEvent() {
      refreshErieExtractorToggleButton();
    }

    document.addEventListener(EVENT_ERIE_EXTRACTOR_TOGGLE, onErieExtractorToggleEvent);
    window.addEventListener(EVENT_ERIE_EXTRACTOR_TOGGLE, onErieExtractorToggleEvent);
  }

  function broadcastErieExtractorToggle(enabled) {
    const detail = {
      source: "mci-menu",
      enabled: !!enabled,
      storageKey: PREF_ERIE_EXTRACTOR_ENABLED_KEY
    };
    try { window.postMessage({ __mci: "erie-extractor-toggle", detail: detail }, "*"); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent(EVENT_ERIE_EXTRACTOR_TOGGLE, { detail: detail })); } catch (e2) {}
    try { window.dispatchEvent(new CustomEvent(EVENT_ERIE_EXTRACTOR_TOGGLE, { detail: detail })); } catch (e3) {}
    try { if (window.top && window.top !== window) window.top.dispatchEvent(new CustomEvent(EVENT_ERIE_EXTRACTOR_TOGGLE, { detail: detail })); } catch (e4) {}
  }

  function isOnNatGenQuotePage(pathPart) {
    const path = String(location.pathname || "").toLowerCase();
    return !!IS_NG && path.indexOf(String(pathPart || "").toLowerCase()) >= 0;
  }

  function resolveCallableGlobal(fnName) {
    if (!fnName) return null;

    const roots = [PAGE_WINDOW, window];
    try {
      if (window.top && window.top !== window) roots.push(window.top);
    } catch (e) {}

    for (let i = 0; i < roots.length; i += 1) {
      const root = roots[i];
      if (!root) continue;
      try {
        const fn = root[fnName];
        if (typeof fn === "function") return { root: root, fn: fn };
      } catch (e2) {}
    }

    return null;
  }

  function runNatGenFillLauncher(opts) {
    const pagePath = opts && opts.pagePath ? opts.pagePath : "";
    const fnName = opts && opts.fnName ? opts.fnName : "";
    const wrongPageMsg = opts && opts.wrongPageMsg ? opts.wrongPageMsg : "Open the correct NatGen page first.";
    const missingFnMsg = opts && opts.missingFnMsg ? opts.missingFnMsg : "NatGen filler script not found on this page.";

    if (!isOnNatGenQuotePage(pagePath)) {
      toast(wrongPageMsg);
      return;
    }

    const target = resolveCallableGlobal(fnName);
    if (!target) {
      toast(missingFnMsg);
      return;
    }

    try {
      const res = target.fn.call(target.root);
      if (res && typeof res.then === "function") {
        res.catch(function (e) {
          console.warn("[MCI Toolbox] NatGen launcher error:", e);
          toast("Error starting NatGen filler - see console.");
        });
      }
    } catch (e) {
      console.warn("[MCI Toolbox] NatGen launcher error:", e);
      toast("Error starting NatGen filler - see console.");
    }
  }

  function runProgressiveFillLauncher(opts) {
    const fnName = opts && opts.fnName ? opts.fnName : "";
    const wrongPageMsg = opts && opts.wrongPageMsg ? opts.wrongPageMsg : "Open Progressive before running this.";
    const missingFnMsg = opts && opts.missingFnMsg ? opts.missingFnMsg : "Progressive filler script not found on this page.";

    if (!IS_PROG) {
      toast(wrongPageMsg);
      return;
    }

    const target = resolveCallableGlobal(fnName);
    if (!target) {
      toast(missingFnMsg);
      return;
    }

    try {
      const res = target.fn.call(target.root);
      if (res && typeof res.then === "function") {
        res.catch(function (e) {
          console.warn("[MCI Toolbox] Progressive launcher error:", e);
          toast("Error starting Progressive filler - see console.");
        });
      }
    } catch (e) {
      console.warn("[MCI Toolbox] Progressive launcher error:", e);
      toast("Error starting Progressive filler - see console.");
    }
  }

  /*************************
   * CONFIG UI DSL          *
   *************************/
  // Supported item types:
  // - button: {type:"button", id, text, className, onClick}
  // - pair:   {type:"pair", left:{...button}, right:{...button}}
  // - split:  {type:"split", className, left:{...}, right:{...}}
  // - group:  {type:"group", className, items:[...buttons]}
  // - panel:  {type:"panel", toggle:{...button}, panelId, items:[...]}
  // - custom: {type:"custom", html}  (for your shortcuts card etc.)
  // - rowControls: QQ row highlighter + color input compact row

  const storedRowColor = localStorage.getItem(HIGHLIGHT_COLOR_KEY) || DEFAULT_ROW_COLOR;
  if (IS_QQ && !localStorage.getItem(HIGHLIGHT_COLOR_KEY)) localStorage.setItem(HIGHLIGHT_COLOR_KEY, storedRowColor);

  const SECTIONS = [
    IS_QQ ? {
      label: "QQ Helpers",
      items: [
      { type: "button", id: "mci_pdf_open", text: "📄 Open PDFs (Smart)", className: "mci-btn qq-pdf" },
      { type: "button", id: "mci_qq_download_selected", text: "📥 Download Files", className: "mci-btn qq-download" },
      { type: "button", id: "mci_fix_names", text: "🧾Show Full File Names", className: "mci-btn qq-names" },
        { type: "rowControls" }
      ]
    } : null,

    {
      label: "Simple",
      items: [
        {
          type: "pair",
          left:  { id: "mci_copy",  text: "✂️Copy",  className: "mci-btn ring copy-ring" },
          right: { id: "mci_paste", text: "📋Paste", className: "mci-btn ring paste-ring" }
        }
      ]
    },

    {
      label: "Quote Export",
      items: [
        { type: "button", id: "mci_erie_extractor_toggle", text: getErieExtractorToggleLabel(getErieExtractorEnabled()), className: "mci-btn erie-toggle" },
        {
          type: "panel",
          panelId: "mci_export_panel",
          toggle: { id: "mci_export_toggle", text: "🚗 Erie Export Quote ▸", className: "mci-btn export" },
          items: [
            {
              type: "panel",
              panelId: "mci_natgen_fillers_panel",
              className: "mci-subsection mci-subsection-ng",
              toggle: { id: "mci_natgen_fillers_toggle", text: "National General", className: "mci-btn ng-parent" },
              items: [
                {
                  type: "group",
                  className: "mci-btn-group ng-group",
                  items: [
                    { type: "button", id: "mci_ng_fill_named", text: "Nmd", title: "Fill Named Insured", className: "mci-btn ng-named" },
                    { type: "button", id: "mci_ng_fill_drivers", text: "Drv", title: "Fill Drivers", className: "mci-btn ng-drivers" },
                    { type: "button", id: "mci_ng_fill_vehicles", text: "Veh", title: "Fill Vehicles", className: "mci-btn ng-vehicles" },
                    { type: "button", id: "mci_ng_fill_coverages", text: "Cov", title: "Fill Coverages", className: "mci-btn ng-coverages" }
                  ]
                }
              ]
            },
            {
              type: "panel",
              panelId: "mci_progressive_fillers_panel",
              className: "mci-subsection mci-subsection-prog",
              toggle: { id: "mci_progressive_fillers_toggle", text: "Progressive", className: "mci-btn prog-parent" },
              items: [
                {
                  type: "group",
                  className: "mci-btn-group prog-group",
                  items: [
                    { type: "button", id: "mci_prog_fill_named", text: "Nmd", title: "Fill Named Insured", className: "mci-btn prog-named" },
                    { type: "button", id: "mci_prog_fill_products", text: "Prod", title: "Fill Products", className: "mci-btn prog-products" },
                    { type: "button", id: "mci_prog_fill_members", text: "Mem", title: "Fill Household Members", className: "mci-btn prog-members" }
                  ]
                }
              ]
            },
            {
              type: "panel",
              panelId: "mci_jones_forms_panel",
              className: "mci-subsection mci-subsection-jones",
              toggle: { id: "mci_jones_forms_toggle", text: "Jones Forms", className: "mci-btn jones-parent" },
              items: [
                {
                  type: "group",
                  className: "mci-btn-group jones-group",
                  items: [
                    { type: "button", id: "mci_export_auto", text: "Auto", title: "Auto Quote Form", className: "mci-btn jones-auto" },
                    { type: "button", id: "mci_export_home", text: "Home", title: "Home Quote Form", className: "mci-btn jones-home" }
                  ]
                }
              ]
            },
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
          toggle: { id: "mci_fd_toggle", text: "📥 File Downloader ▸", className: "mci-btn downloader" },
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
        { type: "button", id: "mci_open_qqc", text: "📂 Get Customer Data", className: "mci-btn qqc" }
      ]
    },

    {
      label: "VIN Tools",
      items: [
        {
          type: "panel",
          panelId: "mci_vin_panel",
          toggle: { id: "mci_vin_toggle", text: "🚗 VIN Lookup ▸", className: "mci-btn vin-parent" },
          items: [
            {
              type: "custom",
              html:
                '<div class="mci-vin-wrap">' +
                  '<input id="mci_vin_input" class="mci-vin-input" type="text" maxlength="17" placeholder="Paste or type VIN">' +
                  '<div class="mci-btn-pair">' +
                    '<button class="mci-btn vin-util" id="mci_vin_paste" type="button">Paste</button>' +
                    '<button class="mci-btn vin-util" id="mci_vin_clear" type="button">Clear</button>' +
                  '</div>' +
                  '<div class="mci-btn-group vin-group">' +
                    '<button class="mci-btn vin-nhtsa" id="mci_vin_nhtsa" type="button">NHTSA</button>' +
                    '<button class="mci-btn vin-google" id="mci_vin_google" type="button">Google</button>' +
                    '<button class="mci-btn vin-copy" id="mci_vin_copy" type="button">Copy</button>' +
                  '</div>' +
                '</div>'
            }
          ]
        }
      ]
    },

    {
      label: "Tools",
      items: [
          {
          type: "split",
          className: "mci-split-btn county-split",
          left:  { id: "mci_county_run", text: "📍 County Finder", title: "Run County Finder using selection / hover / page detection" },
          right: { id: "mci_county_manual", text: "✏️",title: "Open manual address entry" }
        },
        { type: "button", id: "mci_cashCenter", text: "💵 Cash Payment", className: "mci-btn brand" },
        { type: "button", id: "mci_fax",        text: "📠 Fax", className: "mci-btn brand" },
        { type: "button", id: "mci_draw_tool",  text: "🎨 Draw Tool", className: "mci-btn draw-gradient" }
      ]
    },

    {
      label: "Shortcuts",
      items: [
        {
          type: "panel",
          panelId: "mci_shortcuts_panel",
          toggle: { id: "mci_shortcuts_toggle", text: "⌨️ Shortcuts Help ▸", className: "mci-btn help" },
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

                '<hr style="border:none;border-top:1px dashed rgba(255,255,255,.2);margin:8px 0;">' +

                '<div class="group"><div class="list">' +
                  '<span><b>COUNTY LOOKUP</b></span>' +
                  '<div><span class="kbd">ALT</span> + <span class="kbd">C</span></div>' +
                  '<div>Find County from Address</div>' +
                '</div></div>' +

              '</div>'
            }
          ]
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
    const wrapperClass = "mci-downloader" + (panel.className ? (" " + panel.className) : "");
    return (
      '<div class="' + escHtml(wrapperClass) + '">' +
        renderButton(panel.toggle) +
        '<div class="mci-downloader-panel" id="' + escHtml(panel.panelId) + '">' +
          panel.items.map(renderItem).join("") +
        "</div>" +
      "</div>"
    );
  }

  function renderGroup(group) {
    const cls = group.className || "mci-btn-group";
    const items = Array.isArray(group.items) ? group.items : [];
    return (
      '<div class="' + escHtml(cls) + '" role="group">' +
        items.map(renderButton).join("") +
      "</div>"
    );
  }

  function renderRowControls() {
    return (
      '<div class="qq-row-controls">' +
        '<button class="mci-btn qq-highlight-live" id="mci_row_highlight" style="flex:1" type="button">🟡 Row Highlighter</button>' +
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
    if (item.type === "group") return renderGroup(item);
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
    wireErieExtractorToggleSyncListeners();
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
        '#' + MENU_ID + '{position:fixed;top:0;left:-214px;width:214px;height:100vh;background:#1a1c22;color:#eef3ff;z-index:2147483646;padding-top:0;box-shadow:2px 0 10px rgba(0,0,0,.55);transition:left .22s cubic-bezier(.2,.9,.2,1),box-shadow .22s ease,filter .22s ease;overflow-x:hidden;overflow-y:auto;font:13px system-ui,Segoe UI,Arial;will-change:left}' +
        '#' + MENU_ID + '[data-open="1"]{left:0!important;filter:brightness(1.02)}' +
        /* Menu scrolling hidden but still scrolls */
        '#' + MENU_ID + '{scrollbar-width:none;-ms-overflow-style:none;}' +
        '#' + MENU_ID + '::-webkit-scrollbar{display:none;}' +

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
        /* BUTTONS */
        '.mci-btn{display:block;width:100%;margin:4px 0!important;padding:3px 5px!important;border-radius:4px;border:1px solid rgba(255,255,255,.08);background:#2a2f39;color:#fff;text-align:left;cursor:pointer;line-height:1.2;transition:transform .08s ease,box-shadow .18s ease,filter .18s ease,border-color .18s ease!important}' +
        '.mci-btn:hover{transform:translateY(-1px)!important;box-shadow:0 6px 14px rgba(0,0,0,.45)!important;filter:brightness(1.15)!important;border-color:rgba(255,255,255,.2)!important}' +
        '.mci-btn:active{transform:translateY(0)!important;box-shadow:0 3px 8px rgba(0,0,0,.4)!important}' +
        '.mci-btn.primary{background:#1f6feb}.mci-btn.primary:hover{background:#2b79f0}' +
        '.mci-btn.green{background:#3ba55d}.mci-btn.green:hover{background:#44b569}' +
        '.mci-btn.blue{background:#007EF5}.mci-btn.blue:hover{background:#2b6ef5}' +
        '.mci-btn.purple{background:#7b68ee}.mci-btn.purple:hover{background:#6c5ce7}' +
        '.mci-btn.brand{background:#1e40af}.mci-btn.brand:hover{background:#1e3a8a}' +
        '.mci-btn.ng-parent{background:#1e3a8a;padding:4px 8px!important;font-weight:600;opacity:.9}' +
        '.mci-btn.ng-parent:hover{background:#1e40af;opacity:.97;transform:translateY(0)!important;box-shadow:0 3px 8px rgba(0,0,0,.34)!important;filter:brightness(1.05)!important}' +
        '.mci-btn.prog-parent{background:#813E17;padding:4px 8px!important;font-weight:600;opacity:.9}' +
        '.mci-btn.prog-parent:hover{background:#DB7235;opacity:.97;transform:translateY(0)!important;box-shadow:0 3px 8px rgba(0,0,0,.34)!important;filter:brightness(1.05)!important}' +
        '.mci-btn.prog-named{background:#2563eb}.mci-btn.prog-named:hover{background:#2b6ef5}' +
        '.mci-btn.prog-products{background:#d97706}.mci-btn.prog-products:hover{background:#ea860c}' +
        '.mci-btn.prog-members{background:#2f9e58}.mci-btn.prog-members:hover{background:#36ad61}' +
        '.mci-btn.jones-parent{background:#5b21b6;padding:4px 8px!important;font-weight:600;opacity:.9}' +
        '.mci-btn.jones-parent:hover{background:#6d28d9;opacity:.97;transform:translateY(0)!important;box-shadow:0 3px 8px rgba(0,0,0,.34)!important;filter:brightness(1.05)!important}' +
        '.mci-disclosure-toggle{position:relative;padding-right:22px!important}' +
        '.mci-disclosure-toggle::after{content:"";position:absolute;right:8px;top:50%;width:0;height:0;border-top:4px solid transparent;border-bottom:4px solid transparent;border-left:6px solid rgba(255,255,255,.92);transform:translateY(-50%) rotate(0deg);transform-origin:35% 50%;transition:transform .16s ease,opacity .16s ease;opacity:.88}' +
        '.mci-disclosure-toggle[data-open="1"]::after{transform:translateY(-50%) rotate(90deg);opacity:1}' +
        '.mci-btn.ng-named{background:#2563eb}.mci-btn.ng-named:hover{background:#2b6ef5}' +
        '.mci-btn.ng-drivers{background:#2f9e58}.mci-btn.ng-drivers:hover{background:#36ad61}' +
        '.mci-btn.ng-vehicles{background:#d97706}.mci-btn.ng-vehicles:hover{background:#ea860c}' +
        '.mci-btn.ng-coverages{background:#0f766e}.mci-btn.ng-coverages:hover{background:#0d857c}' +
        '.mci-btn.jones-auto{background:#1d4ed8}.mci-btn.jones-auto:hover{background:#2563eb}' +
        '.mci-btn.jones-home{background:#4f7b2f}.mci-btn.jones-home:hover{background:#5a8a35}' +
        '.mci-btn.erie-toggle{position:relative;padding-right:52px!important;background:#334155}' +
        '.mci-btn.erie-toggle:hover{background:#3f4f63}' +
        '.mci-btn.erie-toggle::before{content:"";position:absolute;right:10px;top:50%;transform:translateY(-50%);width:34px;height:18px;border-radius:999px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.25)}' +
        '.mci-btn.erie-toggle::after{content:"";position:absolute;right:27px;top:50%;transform:translateY(-50%);width:14px;height:14px;border-radius:50%;background:#cbd5e1;transition:right .16s ease,background .16s ease}' +
        '.mci-btn.erie-toggle[data-on="1"]{background:#1f7a3d}' +
        '.mci-btn.erie-toggle[data-on="1"]:hover{background:#258d47}' +
        '.mci-btn.erie-toggle[data-on="1"]::before{background:rgba(17,94,39,.75);border-color:rgba(167,243,208,.55)}' +
        '.mci-btn.erie-toggle[data-on="1"]::after{right:11px;background:#dcfce7}' +

        '.mci-btn-pair{display:flex;gap:8px}.mci-btn-pair .mci-btn{flex:1;margin:0!important}' +

        '.mci-split-btn{display:flex;width:100%;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.12);padding:0;height:37px}' +
        '.mci-split-btn.brand{background:#1e40af}.mci-split-btn.aqua{background:#32a8a2}' +
        '.mci-split-half{flex:1;border:none;margin:0;background:transparent;color:#fff;text-align:center;cursor:pointer;font:inherit;line-height:1.2;transition:background .15s,transform .05s,filter .18s ease}' +
        '.mci-split-half:hover{background:rgba(0,0,0,.18);filter:brightness(1.15)}' +
        '.mci-split-half:active{transform:scale(.99)}' +
        '.mci-split-divider{width:1px;background:rgba(255,255,255,.18)}' +
        /* County Finder Button (Carolina Blue) */
        '.mci-split-btn.county-split{display:flex;align-items:center;width:100%;height:24px;min-height:20px;border-radius:6px;overflow:hidden;white-space:nowrap;background:linear-gradient(180deg,#a8cce6 0%,#7bafd4 55%,#5f95bd 100%);border:1px solid rgba(60,90,120,.35);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 3px 8px rgba(0,0,0,.22)}' +
        '.mci-split-btn.county-split:hover{background:linear-gradient(180deg,#bdd9ec 0%,#8bb9dc 55%,#6aa2c9 100%)}' +
        '.mci-split-btn.county-split .mci-split-half{height:30px;min-height:30px;display:flex;align-items:center;white-space:nowrap;color:#0f2a3a;font-weight:700;text-shadow:0 1px 0 rgba(255,255,255,.35)}' +
        '.mci-split-btn.county-split .mci-split-half:hover{background:rgba(255,255,255,.12);filter:brightness(1.03)}' +
        '.mci-split-btn.county-split .mci-split-divider{width:1px;height:70%;background:rgba(0,0,0,.2)}' +
        '#mci_county_run{flex:1 1 auto;justify-content:flex-start;padding:0 10px;font-size:13px}' +
        '#mci_county_manual{flex:0 0 30px;justify-content:center;padding:0;font-size:12px;letter-spacing:0}' +

        '#mci_county_run.mci-split-half{flex:2 0 0}' +
        '#mci_county_manual.mci-split-half{flex:1 0 0;font-size:12px;letter-spacing:.15px}' +

        /* Erie Export Button */
        '.mci-btn.export{background:linear-gradient(180deg,#3b82f6 0%,#2563eb 52%,#1e3a8a 100%)}' +
        '.mci-btn.export:hover{background:linear-gradient(180deg,#60a5fa 0%,#3b82f6 52%,#1e40af 100%)}' +
        /* Help Button */
        '.mci-btn.help{background:#A11702}' +
        '.mci-btn.help:hover{background:#c11a03}' +

        /* DIVIDERS */
        '.divider{margin:12px 10px 10px;border-top:1px dashed rgba(255,255,255,.25);position:relative;height:0}' +
        '.divider::after{content:attr(data-label);position:absolute;left:50%;transform:translate(-50%,-55%);background:#1a1c22;padding:0 6px;color:#9fb4d8;font-size:11px;letter-spacing:.2px}' +

        '.mci-downloader{display:flex;flex-direction:column;gap:6px}' +
        '.mci-downloader .mci-btn{margin:0!important}' +
        '.mci-downloader-panel{display:none;flex-direction:column;gap:6px}' +
        '.mci-downloader-panel.open{display:flex}' +
        '.mci-downloader-panel#mci_export_panel.open{gap:8px}' +
        '.mci-downloader.mci-subsection{padding:5px 6px;border-radius:10px;gap:5px;overflow:hidden}' +
        '.mci-downloader.mci-subsection-ng{background:rgba(30,58,138,.28);border:1px solid rgba(96,165,250,.24)}' +
        '.mci-downloader.mci-subsection-prog{background:rgba(138,100,30,.20);border:1px solid rgba(250,167,96,.20)}' +
        '.mci-downloader.mci-subsection-jones{background:rgba(91,33,182,.24);border:1px solid rgba(167,139,250,.24)}' +
        '.mci-downloader.mci-subsection .mci-downloader-panel{padding-top:1px;gap:6px}' +
        '.mci-btn-group{display:flex;gap:6px;width:100%;max-width:100%;min-width:0}' +
        '.mci-btn-group .mci-btn{flex:1 1 0;width:auto!important;min-width:0;display:flex;align-items:center;justify-content:center;height:25px;min-height:25px;margin:0!important;padding:4px 6px!important;text-align:center;border-radius:6px; border: 1px solid #00b9ff;}' +
        '.mci-downloader-panel .mci-btn-group{margin-top:0}' +

        /* Downloader Buttons */
        '.mci-btn.downloader{background:linear-gradient(180deg,#b04dff 0%,#9100f5 55%,#5e00a8 100%)}' +
        '.mci-btn.downloader:hover{background:linear-gradient(180deg,#c066ff 0%,#a020ff 55%,#6b00c2 100%)}' +
        /* QQ Get Customer Data Button */
        '.mci-btn.qqc{background:linear-gradient(180deg,#ff7a33 0%,#EE6521 52%,#b94b12 100%)}' +
        '.mci-btn.qqc:hover{background:linear-gradient(180deg,#ff8c4d 0%,#ff7029 52%,#c55418 100%)}' +
        /* Draw Tool Button */
        '.mci-btn.draw-gradient{background:linear-gradient(135deg,#7c3aed 0%,#2563eb 45%,#06b6d4 100%);color:#ffffff;border:1px solid rgba(255,255,255,.18);}' +
        '.mci-btn.draw-gradient:hover{filter:brightness(1.06);transform:translateY(-1px);}' +
        '.mci-btn.draw-gradient:active{transform:translateY(0);filter:brightness(.98);}' +

        /* Copy Paste Buttons Ring*/
        '.mci-btn.ring{border:1px solid rgba(255,255,255,.25);box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 0 2px rgba(255,255,255,.10),inset 0 2px 3px rgba(255,255,255,.15),inset 0 -3px 6px rgba(0,0,0,.7);transition:transform .12s ease,box-shadow .18s ease,filter .18s ease;}' +
        '.mci-btn.ring:hover{filter:brightness(1.08);box-shadow:0 0 0 1px rgba(0,0,0,.65),0 0 0 2px rgba(255,255,255,.14),0 8px 18px rgba(0,0,0,.5),inset 0 2px 4px rgba(255,255,255,.2),inset 0 -4px 8px rgba(0,0,0,.75);}' +
        '.mci-btn.ring:active{transform:translateY(1px);box-shadow:inset 0 3px 6px rgba(0,0,0,.75),inset 0 1px 2px rgba(255,255,255,.08);}' +

        /* Copy button */
        '.mci-btn.copy-ring{background:linear-gradient(180deg,#5c6675 0%,#3b434f 52%,#262c34 100%);color:#e8edf5;}' +
        '.mci-btn.copy-ring:hover{background:linear-gradient(180deg,#6b7686 0%,#46505d 52%,#2f3640 100%);}' +

        /* Paste button */
        '.mci-btn.paste-ring{background:linear-gradient(180deg,#34d4c7 0%,#1aa39a 52%,#0f6d67 100%);color:#ffffff;}' +
        '.mci-btn.paste-ring:hover{background:linear-gradient(180deg,#49e3d6 0%,#20b5ab 52%,#13827c 100%);}' +

        /* Row Highlighter Button */
        '.mci-btn.qq-highlight-live{color:#111;border:1px solid rgba(255,255,255,.18);box-shadow:0 0 0 1px rgba(0,0,0,.45),0 6px 14px rgba(0,0,0,.25),inset 0 1px 2px rgba(255,255,255,.22)}' +
        '.mci-btn.qq-highlight-live:hover{filter:brightness(1.06)!important;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 8px 18px rgba(0,0,0,.35),inset 0 1px 2px rgba(255,255,255,.28)!important}' +

        /* QQ Helper Buttons */
        '.mci-btn.qq-pdf{background:linear-gradient(180deg,#38bdf8 0%,#0ea5e9 52%,#0369a1 100%);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 10px rgba(14,165,233,.18),inset 0 1px 2px rgba(255,255,255,.18)}' +
        '.mci-btn.qq-pdf:hover{background:linear-gradient(180deg,#67d3ff 0%,#22b8f2 52%,#0b7db8 100%);box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 14px rgba(14,165,233,.28),0 6px 14px rgba(0,0,0,.35),inset 0 1px 2px rgba(255,255,255,.22)}' +
        '.mci-btn.qq-download{background:linear-gradient(180deg,#34d399 0%,#10b981 52%,#047857 100%);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 10px rgba(16,185,129,.18),inset 0 1px 2px rgba(255,255,255,.18)}' +
'.mci-btn.qq-download:hover{background:linear-gradient(180deg,#6ee7b7 0%,#22c55e 52%,#059669 100%);box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 14px rgba(16,185,129,.28),0 6px 14px rgba(0,0,0,.35),inset 0 1px 2px rgba(255,255,255,.22)}' +
        '.mci-btn.qq-names{background:linear-gradient(180deg,#a78bfa 0%,#8b5cf6 52%,#5b21b6 100%);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 10px rgba(139,92,246,.18),inset 0 1px 2px rgba(255,255,255,.18)}' +
        '.mci-btn.qq-names:hover{background:linear-gradient(180deg,#bea7ff 0%,#9d72ff 52%,#6d28d9 100%);box-shadow:0 0 0 1px rgba(0,0,0,.45),0 0 14px rgba(139,92,246,.28),0 6px 14px rgba(0,0,0,.35),inset 0 1px 2px rgba(255,255,255,.22)}' +

        /* VIN Tools */
        '.mci-btn.vin-parent{background:linear-gradient(180deg,#475569 0%,#334155 52%,#1e293b 100%)}' +
        '.mci-btn.vin-parent:hover{background:linear-gradient(180deg,#64748b 0%,#475569 52%,#334155 100%)}' +
        '.mci-vin-wrap{display:flex;flex-direction:column;gap:6px}' +
        '.mci-vin-input{width:100%;height:30px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.16);background:#111827;color:#fff;outline:none}' +
        '.mci-vin-input:focus{border-color:rgba(96,165,250,.75);box-shadow:0 0 0 1px rgba(96,165,250,.35) inset}' +
        '.mci-btn.vin-util{background:#374151;color:#fff}' +
        '.mci-btn.vin-util:hover{background:#4b5563}' +
        '.vin-group .mci-btn{flex:1 1 0;width:auto!important;min-width:0;display:flex;align-items:center;justify-content:center;height:25px;min-height:25px;margin:0!important;padding:4px 6px!important;text-align:center;border-radius:6px}' +
        '.mci-btn.vin-nhtsa{background:#0f766e}.mci-btn.vin-nhtsa:hover{background:#0d857c}' +
        '.mci-btn.vin-google{background:#b45309}.mci-btn.vin-google:hover{background:#c2410c}' +
        '.mci-btn.vin-copy{background:#5b21b6}.mci-btn.vin-copy:hover{background:#6d28d9}' +

        '.qq-row-controls{display:flex;gap:8px;align-items:center}' +
        '#mci_row_color{width:26px;height:29px;border:none;padding:0;background:none;cursor:pointer;}' +

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
    applyRowHighlightButtonColor(root);
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
    function wirePanel(toggleId, panelId, openText, closedText, opts) {
      opts = opts || {};
      const t = $s("#" + toggleId);
      const p = $s("#" + panelId);
      if (!t || !p) return;

      const accordionGroup = opts.accordionGroup || "";

      if (opts.disclosure) {
        t.classList.add("mci-disclosure-toggle");
        t.setAttribute("data-open", "0");
        t.setAttribute("aria-expanded", "false");
      }

      t.setAttribute("aria-controls", panelId);
      if (accordionGroup) {
        t.setAttribute("data-accordion-group", accordionGroup);
        p.setAttribute("data-accordion-group", accordionGroup);
      }

      t.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();

        const willOpen = !p.classList.contains("open");

        if (willOpen && accordionGroup) {
          root.querySelectorAll('.mci-downloader-panel.open[data-accordion-group="' + accordionGroup + '"]').forEach(function (otherPanel) {
            if (otherPanel === p) return;

            otherPanel.classList.remove("open");

            const otherToggle = root.querySelector('[aria-controls="' + otherPanel.id + '"]');
            if (otherToggle) {
              otherToggle.setAttribute("data-open", "0");
              otherToggle.setAttribute("aria-expanded", "false");

              const otherPanelId = otherToggle.getAttribute("aria-controls");
              if (otherPanelId === "mci_fd_panel") {
                otherToggle.textContent = "📥 File Downloader ▸";
              } else if (otherPanelId === "mci_export_panel") {
                otherToggle.textContent = "🚗 Erie Export Quote ▸";
              } else if (otherPanelId === "mci_vin_panel") {
                otherToggle.textContent = "🚗 VIN Lookup ▸";
              } else if (otherPanelId === "mci_natgen_fillers_panel") {
                otherToggle.textContent = "National General";
              } else if (otherPanelId === "mci_progressive_fillers_panel") {
                otherToggle.textContent = "Progressive";
              } else if (otherPanelId === "mci_jones_forms_panel") {
                otherToggle.textContent = "Jones Forms";
              }
            }
          });
        }

        const open = p.classList.toggle("open");

        if (opts.disclosure) {
          t.setAttribute("data-open", open ? "1" : "0");
          t.setAttribute("aria-expanded", open ? "true" : "false");
        }

        if (typeof openText === "string" && typeof closedText === "string") {
          t.textContent = open ? openText : closedText;
        }
      });
    }

    wirePanel("mci_natgen_fillers_toggle", "mci_natgen_fillers_panel", null, null, {
      disclosure: true,
      accordionGroup: "export-submenus"
    });

    wirePanel("mci_progressive_fillers_toggle", "mci_progressive_fillers_panel", null, null, {
      disclosure: true,
      accordionGroup: "export-submenus"
    });

    wirePanel("mci_jones_forms_toggle", "mci_jones_forms_panel", null, null, {
      disclosure: true,
      accordionGroup: "export-submenus"
    });

    wirePanel("mci_fd_toggle", "mci_fd_panel", "📥 File Downloader ▾", "📥 File Downloader ▸", {
      accordionGroup: "main-sections"
    });

    wirePanel("mci_export_toggle", "mci_export_panel", "🚗 Export Quote ▾", "🚗 Erie Export Quote ▸", {
      accordionGroup: "main-sections"
    });

    wirePanel("mci_vin_toggle", "mci_vin_panel", "🚗 VIN Lookup ▾", "🚗 VIN Lookup ▸", {
      accordionGroup: "main-sections"
    });

    const vinToggleBtn = $s("#mci_vin_toggle");
    if (vinToggleBtn) {
      vinToggleBtn.addEventListener("click", function () {
        setTimeout(function () {
          const input = $s("#mci_vin_input");
          if (!input) return;
          if (!input.value) {
            const vin = getSelectedTextVin();
            if (vin) input.value = vin;
          }
        }, 0);
      });
    }

    wirePanel("mci_shortcuts_toggle", "mci_shortcuts_panel", "⌨️ Shortcuts Help ▾", "⌨️ Shortcuts Help ▸");

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
      onClick("mci_qq_download_selected", function () {
        triggerFileDownloader("qq-selected-pdfs");
      });

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
          applyRowHighlightButtonColor(root);
          toast("Highlight color set to " + color + ".");
        });
      }
    }

    function applyRowHighlightButtonColor(root) {
      if (!root) return;
      const btn = root.querySelector("#mci_row_highlight");
      if (!btn) return;

      const color = localStorage.getItem(HIGHLIGHT_COLOR_KEY) || DEFAULT_ROW_COLOR;

      function adjust(hex, amt) {
        hex = hex.replace("#", "");
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);

        r = Math.min(255, Math.max(0, r + amt));
        g = Math.min(255, Math.max(0, g + amt));
        b = Math.min(255, Math.max(0, b + amt));

        return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
      }

      const light = adjust(color, 25);
      const dark  = adjust(color, -35);

      btn.style.background = `linear-gradient(180deg, ${light} 0%, ${color} 55%, ${dark} 100%)`;

      // Text contrast (same logic you already had)
      const hex = color.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;

      btn.style.color = brightness >= 150 ? "#111" : "#fff";
    }

    function getVinValue() {
      const input = $s("#mci_vin_input");
      if (!input) return "";
      return String(input.value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 17);
    }

    function setVinValue(value) {
      const input = $s("#mci_vin_input");
      if (!input) return "";
      const vin = String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 17);
      input.value = vin;
      return vin;
    }

    function getSelectedTextVin() {
      try {
        return String(window.getSelection ? window.getSelection().toString() : "")
          .replace(/[^A-Za-z0-9]/g, "")
          .toUpperCase()
          .slice(0, 17);
      } catch (e) {
        return "";
      }
    }

    function requireVin() {
      let vin = getVinValue();
      if (!vin) {
        vin = setVinValue(getSelectedTextVin());
      }
      if (!vin || vin.length < 11) {
        toast("Paste, type, or select a VIN first.");
        return "";
      }
      return vin;
    }

    // VIN tools
    onClick("mci_vin_paste", async function () {
      try {
        const txt = await navigator.clipboard.readText();
        const vin = setVinValue(txt);
        toast(vin ? "VIN pasted." : "Clipboard did not contain a VIN.");
      } catch (e) {
        toast("Clipboard paste was blocked.");
      }
    });

    onClick("mci_vin_clear", function () {
      setVinValue("");
      toast("VIN cleared.");
    });

    onClick("mci_vin_nhtsa", function () {
      const vin = requireVin();
      if (!vin) return;
      window.open("https://vpic.nhtsa.dot.gov/decoder/VinDecoder?VIN=" + encodeURIComponent(vin) + "&ModelYear=", "_blank");
    });

    onClick("mci_vin_google", function () {
      const vin = requireVin();
      if (!vin) return;
      window.open("https://www.google.com/search?q=" + encodeURIComponent(vin), "_blank");
    });

    onClick("mci_vin_copy", function () {
      const vin = requireVin();
      if (!vin) return;
      try {
        GM_setClipboard(vin);
        toast("VIN copied.");
      } catch (e) {
        toast("Could not copy VIN.");
      }
    });

    // Cross-site tools (your separate script listens)

    onClick("mci_copy", function () {
      window.dispatchEvent(new CustomEvent("mci:copy"));
      toast("Copy requested…");
    });

    onClick("mci_paste", function () {
      window.dispatchEvent(new CustomEvent("mci:paste"));
      toast("Paste requested…");
    });

    onClick("mci_county_run", function () {
      try {
        triggerCountyFinder("auto");
        toast("County Finder triggered.");
      } catch (e) {
        console.warn("[MCI Toolbox] County Finder trigger error:", e);
        toast("County Finder trigger failed.");
      }
    });

    onClick("mci_county_manual", function () {
      try {
        triggerCountyFinder("manual");
        toast("County Finder manual entry opened.");
      } catch (e) {
        console.warn("[MCI Toolbox] County Finder manual trigger error:", e);
        toast("County Finder manual trigger failed.");
      }
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

    onClick("mci_ng_fill_named", function () {
      runNatGenFillLauncher({
        pagePath: "/quote/quotenamedinsured.aspx",
        fnName: "testNatGenNamed",
        wrongPageMsg: "Open NatGen Named Insured page before running this.",
        missingFnMsg: "NatGen Named Insured filler not found (expected: testNatGenNamed)."
      });
    });

    onClick("mci_ng_fill_drivers", function () {
      runNatGenFillLauncher({
        pagePath: "/quote/quotedriver.aspx",
        fnName: "testNatGenDrivers",
        wrongPageMsg: "Open NatGen Drivers page before running this.",
        missingFnMsg: "NatGen Drivers filler not found (expected: testNatGenDrivers)."
      });
    });

    onClick("mci_ng_fill_vehicles", function () {
      runNatGenFillLauncher({
        pagePath: "/quote/quoteauto.aspx",
        fnName: "testNatGenVehicles",
        wrongPageMsg: "Open NatGen Vehicles page before running this.",
        missingFnMsg: "NatGen Vehicles filler not found (expected: testNatGenVehicles)."
      });
    });

    onClick("mci_ng_fill_coverages", function () {
      runNatGenFillLauncher({
        pagePath: "/quote/quotecoverages",
        fnName: "runNatGenCoverages",
        wrongPageMsg: "Open NatGen Coverages page before running this.",
        missingFnMsg: "NatGen Coverages filler not found (expected: runNatGenCoverages)."
      });
    });

    onClick("mci_prog_fill_named", function () {
      runProgressiveFillLauncher({
        fnName: "testProgressiveNamedInsured",
        wrongPageMsg: "Open Progressive before running Named Insured.",
        missingFnMsg: "Progressive Named Insured filler not found (expected: testProgressiveNamedInsured)."
      });
    });

    onClick("mci_prog_fill_products", function () {
      runProgressiveFillLauncher({
        fnName: "testProgressiveProducts",
        wrongPageMsg: "Open Progressive before running Products.",
        missingFnMsg: "Progressive Products filler not found (expected: testProgressiveProducts)."
      });
    });

    onClick("mci_prog_fill_members", function () {
      runProgressiveFillLauncher({
        fnName: "testProgressiveHouseholdMembers",
        wrongPageMsg: "Open Progressive before running Household Members.",
        missingFnMsg: "Progressive Household Members filler not found (expected: testProgressiveHouseholdMembers)."
      });
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
    refreshErieExtractorToggleButton();

    onClick("mci_erie_extractor_toggle", function () {
      const enabled = !getErieExtractorEnabled();
      setErieExtractorEnabled(enabled);
      refreshErieExtractorToggleButton();
      broadcastErieExtractorToggle(enabled);
      toast("Erie extractor " + (enabled ? "enabled." : "disabled."));
    });

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

    onClick("mci_draw_tool", function () {
      try {
        if (typeof window.runMciDrawTool === "function") {
          window.runMciDrawTool();
          toast("Draw Tool toggled.");
          return;
        }

        window.dispatchEvent(new CustomEvent("mci:draw-tool-toggle"));
        toast("Draw Tool trigger sent.");
      } catch (e) {
        console.warn("[MCI Toolbox] Draw Tool launcher error:", e);
        toast("Draw Tool failed - see console.");
      }
    });
    return root;
  }

  /***************************
   * Extractor function to pick carrier
   */
  function triggerContactMapper(mode) {
    mode = mode || "auto";

    const host = location.hostname.toLowerCase();

    // carrier detection
    let key = null;
    if (host.includes("agentexchange.com")) key = "erie";
    else if (host.includes("natgenagency.com") || host.includes("nationalgeneral.torrentflood.com")) key = "natgen";
    else if (host.includes("foragents.progressive.com")) key = "progressive";
    else if (host.includes("quoting.foragentsonly.com") || host.includes("foragentsonly.com")) key = "progressive";
    else if (host.includes("beyondfloods.com")) key = "beyondfloods";
    else if (host.includes("ncjuanciua.org") || host.includes("insure.ncjuanciua.org")) key = "ncjua";
    else if (host.includes("app.orion180.com")) key = "orion180";
    // add more as we create them…

    if (!key) {
      toast("No exporter for this site yet.");
      return;
    }

    // prefer direct API (same page)
    const exp = (window.MCI_EXPORTERS && window.MCI_EXPORTERS[key]) ? window.MCI_EXPORTERS[key] : null;

    if (exp) {
      if (mode === "send") exp.sendToQQ();
      else if (mode === "get") exp.getCustomerData();
      else exp.openUI(); // auto
      return;
    }

    // fallback: postMessage (works even when sandboxed)
    window.postMessage({
      mci: "mciExporter",
      carrier: key,
      action: (mode === "send") ? "sendToQQ" : (mode === "get") ? "getCustomerData" : "openUI"
    }, "*");

    toast("Exporter not detected on this page (is it installed/enabled?)");
  }
  /*************************
   * BOOT                  *
   *************************/
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

})();
