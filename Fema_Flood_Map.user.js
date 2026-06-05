// ==UserScript==
// @name         FEMA Flood Map Tool (MCI)
// @namespace    mci-tools
// @version      1.0.8
// @description  Adds MCI customer/address label tools to FEMA Flood Map portal.
// @match        https://msc.fema.gov/portal/search*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Fema_Flood_Map.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/Fema_Flood_Map.user.js
// ==/UserScript==

(function () {
  "use strict";

  const TOOL_ID = "mci-fema-tool";
  const PRINT_HEADER_ID = "mci-fema-print-header";

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function todayText() {
    const d = new Date();
    return String(d.getMonth() + 1).padStart(2, "0") + "/" +
           String(d.getDate()).padStart(2, "0") + "/" +
           d.getFullYear();
  }

  function safeFileText(text) {
    return String(text || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function makeDraggable(el, handle) {
    if (!el || el.dataset.mciDraggable === "1") return;
    el.dataset.mciDraggable = "1";

    const dragHandle = handle || el;
    dragHandle.style.cursor = "move";

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    dragHandle.addEventListener("mousedown", function (e) {
      if (e.target && e.target.tagName && /input|button|textarea|select/i.test(e.target.tagName)) return;

      dragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = el.getBoundingClientRect();

      if (getComputedStyle(el).position === "fixed") {
        el.style.left = rect.left + "px";
        el.style.top = rect.top + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
      } else {
        el.style.left = el.offsetLeft + "px";
        el.style.top = el.offsetTop + "px";
        el.style.right = "auto";
        el.style.bottom = "auto";
      }

      startLeft = parseFloat(el.style.left) || rect.left || 0;
      startTop = parseFloat(el.style.top) || rect.top || 0;

      e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      el.style.left = (startLeft + e.clientX - startX) + "px";
      el.style.top = (startTop + e.clientY - startY) + "px";
    });

    document.addEventListener("mouseup", function () {
      dragging = false;
    });
  }

  function openTool() {
    if ($("#" + TOOL_ID)) {
      $("#" + TOOL_ID).style.display = "block";
      return;
    }

    const box = document.createElement("div");
    box.id = TOOL_ID;
    box.innerHTML = `
      <div class="mci-fema-title">
        <span>🌊 MCI FEMA Map</span>

        <div class="mci-fema-actions">
          <button id="mci-fema-clear" class="mci-fema-clear">
            Clear
          </button>

          <button id="mci-fema-close">×</button>
        </div>
      </div>

      <label>Customer Name</label>
      <input id="mci-fema-name" type="text" placeholder="John Smith">

      <label>Property Address</label>
      <input id="mci-fema-address" type="text" placeholder="123 Main St, Garner NC">

      <div class="mci-fema-row">
        <button id="mci-fema-search">Search FEMA</button>
        <button id="mci-fema-print">Print</button>
      </div>
    `;

    document.body.appendChild(box);
    injectStyles();
    makeDraggable(box, box.querySelector(".mci-fema-title"));

    $("#mci-fema-name").value = GM_getValue("mci_fema_name", "");
    $("#mci-fema-address").value = GM_getValue("mci_fema_address", "");

    $("#mci-fema-close").onclick = () => box.style.display = "none";

    $("#mci-fema-clear").onclick = () => {
      GM_setValue("mci_fema_name", "");
      GM_setValue("mci_fema_address", "");

      $("#mci-fema-name").value = "";
      $("#mci-fema-address").value = "";

      const searchBox = $("#txtfloodmapsearch");
      if (searchBox) {
        searchBox.value = "";
      }
    };

    $("#mci-fema-search").onclick = () => {
      const address = $("#mci-fema-address").value.trim();
      const name = $("#mci-fema-name").value.trim();

      GM_setValue("mci_fema_name", name);
      GM_setValue("mci_fema_address", address);

      const femaInput = $("#txtfloodmapsearch");
      const searchBtn = $("#locate");

      if (!femaInput || !searchBtn) {
        alert("Could not find FEMA search box.");
        return;
      }

      femaInput.value = address;
      femaInput.dispatchEvent(new Event("input", { bubbles: true }));
      femaInput.dispatchEvent(new Event("change", { bubbles: true }));
      searchBtn.click();
    };

    $("#mci-fema-print").onclick = () => {
      ensurePrintHeader();

      const name = safeFileText($("#mci-fema-name")?.value || "");
      const address = safeFileText($("#mci-fema-address")?.value || $("#txtfloodmapsearch")?.value || "");
      const oldTitle = document.title;

      if (name || address) {
        document.title = safeFileText(
          (name || "Customer") +
          " - " +
          (address || "Address") +
          " - Flood Map"
        );
      }

      setTimeout(() => {
        window.print();

        setTimeout(() => {
          document.title = oldTitle;
        }, 1500);
      }, 250);
    };
  }

  function ensurePrintHeader() {
    let header = $("#" + PRINT_HEADER_ID);
    if (!header) {
      header = document.createElement("div");
      header.id = PRINT_HEADER_ID;
      document.body.appendChild(header);
    }

    const name = ($("#mci-fema-name") || {}).value || "";
    const address = ($("#mci-fema-address") || {}).value || $("#txtfloodmapsearch")?.value || "";

    header.innerHTML = `
      <div class="mci-print-title">Fema - Flood Map</div>
      <div><b>Customer:</b> ${escapeHtml(name)} &nbsp; | &nbsp; <b>Address:</b> ${escapeHtml(address)} &nbsp; | &nbsp; <b>Date:</b> ${todayText()}</div>
    `;

    return header;
  }

  function injectStyles() {
    if ($("#mci-fema-style")) return;

    const st = document.createElement("style");
    st.id = "mci-fema-style";
    st.textContent = `
      #mci-fema-tool{
        position:fixed;
        right:18px;
        top:90px;
        width:280px;
        z-index:2147483647;
        background:#1a1c22;
        color:#fff;
        border:1px solid rgba(255,255,255,.16);
        border-radius:12px;
        box-shadow:0 10px 28px rgba(0,0,0,.38);
        padding:10px;
        font:13px system-ui,Segoe UI,Arial;
      }

      .mci-fema-title{
        font-weight:700;
        margin-bottom:8px;
        display:flex;
        justify-content:space-between;
        align-items:center;
        cursor:move;
        user-select:none;
      }

      #mci-fema-close{
        background:#7f1d1d;
        color:#fff;
        border:0;
        border-radius:6px;
        cursor:pointer;
        padding:2px 7px;
      }

      .mci-fema-actions{
        display:flex;
        align-items:center;
        gap:6px;
      }

      .mci-fema-clear{
        background:none;
        border:none;
        color:#93c5fd;
        font-size:11px;
        cursor:pointer;
        padding:0 2px;
      }

      .mci-fema-clear:hover{
        color:#ffffff;
        text-decoration:underline;
      }

      #mci-fema-tool label{
        display:block;
        font-size:12px;
        margin:8px 0 3px;
        color:#dbeafe;
      }

      #mci-fema-tool input{
        width:100%;
        padding:7px;
        border-radius:7px;
        border:1px solid rgba(255,255,255,.18);
        background:#111827;
        color:#fff;
      }

      .mci-fema-row{
        display:flex;
        gap:6px;
        margin-top:8px;
      }

      .mci-fema-row button{
        flex:1;
        padding:7px;
        border:0;
        border-radius:7px;
        cursor:pointer;
        color:#fff;
        background:linear-gradient(135deg,#0284c7,#06b6d4,#14b8a6);
        font-weight:700;
      }

      @media print{
        @page{
          size: landscape;
          margin: 0;
        }

        html,
        body{
          margin:0!important;
          padding:0!important;
          width:100%!important;
          height:100%!important;
          overflow:hidden!important;
          background:#fff!important;
        }

        body *{
          visibility:hidden!important;
        }

        #mci-fema-print-header,
        #mci-fema-print-header *,
        #MapContainer,
        #MapContainer *,
        #viewDiv,
        #viewDiv *{
          visibility:visible!important;
        }

        #mci-fema-tool,
        #mci-shadow-host,
        #mciSlideMenu,
        #mciSlideTrigger{
          display:none!important;
          visibility:hidden!important;
        }

        .esri-expand,
        .esri-expand *,
        .esri-expand__container,
        .esri-expand__container *,
        .esri-widget--button,
        .esri-ui-top-right,
        .esri-ui-top-right *,
        .esri-ui,
        .esri-ui *{
          visibility:hidden!important;
          display:none!important;
        }

        .esri-zoom,
        .esri-zoom *,
        .esri-component,
        .esri-component *{
          visibility:hidden!important;
          display:none!important;
        }

        #viewDiv,
        #viewDiv canvas,
        #MapContainer,
        #MapContainer *{
          visibility:visible!important;
        }

        #viewDiv canvas{
          width:100vw!important;
          height:6.85in!important;
          max-width:none!important;
          max-height:none!important;
          object-fit:cover!important;
        }

        #mci-fema-print-header{
          display:block!important;
          position:fixed!important;
          left:0!important;
          top:0!important;
          width:100vw!important;
          height:0.65in!important;
          padding:0.08in 0.18in!important;
          background:#ffffff!important;
          color:#111!important;
          border-bottom:2px solid #111!important;
          text-align:center!important;
          font:12px/1.25 Arial, sans-serif!important;
          box-sizing:border-box!important;
          z-index:2147483647!important;
        }

        #mci-fema-print-header .mci-print-title{
          font-weight:700!important;
          font-size:15px!important;
          margin-bottom:3px!important;
        }

        #MapContainer{
          position:fixed!important;
          left:0!important;
          top:0.65in!important;
          width:100vw!important;
          height:6.85in!important;
          margin:0!important;
          padding:0!important;
          overflow:hidden!important;
          transform:none!important;
        }

        #viewDiv{
          position:absolute!important;
          left:0!important;
          top:0!important;
          width:100vw!important;
          height:6.85in!important;
          margin:0!important;
          padding:0!important;
          overflow:hidden!important;
        }
      }
    `;

    document.head.appendChild(st);
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.addEventListener("mci:fema-map-open", openTool);

  // Also allow the tool to open directly on the FEMA page with Alt+F.
  if (location.hash.indexOf("mci-open-fema-tool=1") >= 0) {
    setTimeout(function () {
      openTool();

      try {
        history.replaceState(
          null,
          "",
          location.pathname + location.search
        );
      } catch (e) {}

    }, 800);
  }

  document.addEventListener("keydown", function (e) {
    if (e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openTool();
    }
  });
})();
