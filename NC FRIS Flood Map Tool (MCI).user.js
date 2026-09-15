// ==UserScript==
// @name         NC FRIS Flood Map Tool (MCI)
// @namespace    mci-tools
// @version      1.0.2
// @description  Adds MCI customer labeling and clean print tools to North Carolina FRIS.
// @match        https://fris.nc.gov/map*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NC_FRIS_Flood_Map.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NC_FRIS_Flood_Map.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ============================================================
  // NC FRIS FLOOD MAP - GLOBAL CONSTANTS / STORAGE
  // https://fris.nc.gov/map
  // ============================================================
  const TOOL_ID = "mci-fris-tool";
  const STYLE_ID = "mci-fris-style";
  const PRINT_HEADER_ID = "mci-fris-print-header";
  const SEARCH_SELECTOR = 'input[placeholder="Smart Search..."]';
  const NAME_KEY = "mci_fris_name";

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

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toast(message) {
    let el = $("#mci-fris-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "mci-fris-toast";
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        top: "18px",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        background: "#111827",
        color: "#fff",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: "8px",
        padding: "8px 12px",
        boxShadow: "0 5px 18px rgba(0,0,0,.35)",
        font: "12px/1.35 system-ui,Segoe UI,Arial",
        pointerEvents: "none"
      });
      document.documentElement.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._mciTimer);
    el.style.display = "block";
    el._mciTimer = setTimeout(() => { el.style.display = "none"; }, 2200);
  }

  function makeDraggable(el, handle) {
    if (!el || el.dataset.mciDraggable === "1") return;
    el.dataset.mciDraggable = "1";
    const dragHandle = handle || el;
    dragHandle.style.cursor = "move";

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    dragHandle.addEventListener("mousedown", function (e) {
      if (e.target && /input|button|textarea|select/i.test(e.target.tagName || "")) return;

      const rect = el.getBoundingClientRect();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      el.style.left = rect.left + "px";
      el.style.top = rect.top + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
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

  // ============================================================
  // NC FRIS FLOOD MAP - PRINT HEADER / MAP OUTPUT
  // ============================================================
  function getCurrentFrisAddress() {
    // Prefer the current FRIS Smart Search value because the user is now
    // responsible for choosing the correct location directly on the site.
    const searchValue = String($(SEARCH_SELECTOR)?.value || "").trim();
    if (searchValue) return searchValue;

    // If FRIS has already replaced/cleared the search text after selection,
    // look for a visible Building Selection address in the left results area.
    const candidates = Array.from(document.querySelectorAll(".layer-sidebar *"));
    for (let i = 0; i < candidates.length; i += 1) {
      const node = candidates[i];
      const txt = String(node.textContent || "").trim();
      if (!txt) continue;

      if (/building selection/i.test(txt)) {
        const parent = node.parentElement || node;
        const lines = String(parent.textContent || "")
          .split(/\n+/)
          .map(s => s.trim())
          .filter(Boolean);

        const idx = lines.findIndex(line => /building selection/i.test(line));
        if (idx >= 0 && lines[idx + 1]) return lines[idx + 1];
      }
    }

    return "";
  }

  function ensurePrintHeader() {
    let header = $("#" + PRINT_HEADER_ID);
    if (!header) {
      header = document.createElement("div");
      header.id = PRINT_HEADER_ID;
      document.body.appendChild(header);
    }

    const name = $("#mci-fris-name")?.value || "";
    const address = getCurrentFrisAddress();

    header.innerHTML = `
      <div class="mci-fris-print-title">NC FRIS - Flood Map</div>
      <div><b>Customer:</b> ${escapeHtml(name)} &nbsp; | &nbsp; <b>Address:</b> ${escapeHtml(address)} &nbsp; | &nbsp; <b>Date:</b> ${todayText()}</div>
    `;

    return header;
  }

  function printFris() {
    ensurePrintHeader();

    const name = safeFileText($("#mci-fris-name")?.value || "");
    const address = safeFileText(getCurrentFrisAddress());
    const oldTitle = document.title;

    if (name || address) {
      document.title = safeFileText(
        (name || "Customer") + " - " + (address || "Address") + " - NC FRIS Flood Map"
      );
    }

    setTimeout(function () {
      window.print();
      setTimeout(function () { document.title = oldTitle; }, 1500);
    }, 250);
  }

  // ============================================================
  // NC FRIS FLOOD MAP - TOOL UI
  // ============================================================
  function openTool() {
    const existing = $("#" + TOOL_ID);
    if (existing) {
      existing.style.display = "block";
      return;
    }

    injectStyles();

    const box = document.createElement("div");
    box.id = TOOL_ID;
    box.innerHTML = `
      <div class="mci-fris-title">
        <span>🗺️ MCI NC FRIS Map</span>
        <div class="mci-fris-actions">
          <button id="mci-fris-clear" class="mci-fris-clear">Clear</button>
          <button id="mci-fris-close">×</button>
        </div>
      </div>

      <label>Customer Name</label>
      <input id="mci-fris-name" type="text" placeholder="John Smith">

      <div class="mci-fris-note">
        Use the FRIS website search and map controls to select the property and zoom exactly where you want, then click Print.
      </div>

      <div class="mci-fris-row">
        <button id="mci-fris-print">Print Current View</button>
      </div>
    `;

    document.body.appendChild(box);
    makeDraggable(box, box.querySelector(".mci-fris-title"));

    $("#mci-fris-name").value = GM_getValue(NAME_KEY, "");

    $("#mci-fris-close").onclick = () => { box.style.display = "none"; };

    $("#mci-fris-clear").onclick = function () {
      GM_setValue(NAME_KEY, "");
      $("#mci-fris-name").value = "";
    };

    $("#mci-fris-name").addEventListener("input", function () {
      GM_setValue(NAME_KEY, this.value.trim());
    });

    $("#mci-fris-print").onclick = function () {
      GM_setValue(NAME_KEY, $("#mci-fris-name").value.trim());
      printFris();
    };
  }

  // ============================================================
  // NC FRIS FLOOD MAP - STYLES / PRINT LAYOUT
  // ============================================================
  function injectStyles() {
    if ($("#" + STYLE_ID)) return;

    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `
      #mci-fris-tool{
        position:fixed;
        right:18px;
        top:90px;
        width:300px;
        z-index:2147483647;
        background:#1a1c22;
        color:#fff;
        border:1px solid rgba(255,255,255,.16);
        border-radius:12px;
        box-shadow:0 10px 28px rgba(0,0,0,.38);
        padding:10px;
        font:13px system-ui,Segoe UI,Arial;
      }

      .mci-fris-title{
        font-weight:700;
        margin-bottom:8px;
        display:flex;
        justify-content:space-between;
        align-items:center;
        cursor:move;
        user-select:none;
      }

      .mci-fris-actions{display:flex;align-items:center;gap:6px;}

      #mci-fris-close{
        background:#7f1d1d;
        color:#fff;
        border:0;
        border-radius:6px;
        cursor:pointer;
        padding:2px 7px;
      }

      .mci-fris-clear{
        background:none;
        border:none;
        color:#93c5fd;
        font-size:11px;
        cursor:pointer;
        padding:0 2px;
      }

      .mci-fris-clear:hover{color:#fff;text-decoration:underline;}

      #mci-fris-tool label{
        display:block;
        font-size:12px;
        margin:8px 0 3px;
        color:#dbeafe;
      }

      #mci-fris-tool input{
        box-sizing:border-box;
        width:100%;
        padding:7px;
        border-radius:7px;
        border:1px solid rgba(255,255,255,.18);
        background:#111827;
        color:#fff;
      }

      .mci-fris-row{display:flex;gap:6px;margin-top:8px;}

      .mci-fris-row button{
        flex:1;
        padding:7px;
        border:0;
        border-radius:7px;
        cursor:pointer;
        color:#fff;
        background:linear-gradient(135deg,#2563eb,#1d4ed8,#1e3a8a);
        font-weight:700;
      }

      .mci-fris-note{
        margin-top:8px;
        padding:8px;
        border-radius:7px;
        background:#111827;
        border:1px solid rgba(255,255,255,.12);
        color:#bfdbfe;
        font-size:11px;
        line-height:1.35;
      }

      #mci-fris-print-header{display:none;}

      @media print{
        @page{size:landscape;margin:0;}

        html,body{
          margin:0!important;
          padding:0!important;
          width:100%!important;
          height:100%!important;
          overflow:hidden!important;
          background:#fff!important;
        }

        body *{visibility:hidden!important;}

        #mci-fris-print-header,
        #mci-fris-print-header *,
        .mapContainer,
        .mapContainer *,
        arcgis-map#main-map,
        arcgis-map#main-map *{
          visibility:visible!important;
        }

        #mci-fris-tool,
        #mci-shadow-host,
        nav,
        ._actionBar_gwa08_1,
        arcgis-zoom,
        arcgis-home,
        arcgis-locate,
        arcgis-expand{
          display:none!important;
          visibility:hidden!important;
        }

        #mci-fris-print-header{
          display:block!important;
          position:fixed!important;
          left:0!important;
          top:0!important;
          width:100vw!important;
          height:.65in!important;
          padding:.08in .18in!important;
          background:#fff!important;
          color:#111!important;
          border-bottom:2px solid #111!important;
          text-align:center!important;
          font:12px/1.25 Arial,sans-serif!important;
          box-sizing:border-box!important;
          z-index:2147483647!important;
        }

        #mci-fris-print-header .mci-fris-print-title{
          font-weight:700!important;
          font-size:15px!important;
          margin-bottom:3px!important;
        }

        .mapContainer{
          position:fixed!important;
          left:0!important;
          top:.65in!important;
          width:100vw!important;
          height:6.85in!important;
          margin:0!important;
          padding:0!important;
          overflow:hidden!important;
          display:block!important;
        }

        /* ============================================================
           NC FRIS PRINT - MAP ONLY
           Hide the FRIS tools/sidebar and let the actual map use the
           full printable width. The live map view/zoom is preserved.
           ============================================================ */
        .layer-sidebar{
          display:none!important;
          visibility:hidden!important;
          width:0!important;
          min-width:0!important;
          max-width:0!important;
          flex:0 0 0!important;
          overflow:hidden!important;
        }

        .layer-sidebar *{
          display:none!important;
          visibility:hidden!important;
        }

        .mapContainer > .h-100.position-relative{
          display:block!important;
          visibility:visible!important;
          position:relative!important;
          left:0!important;
          right:auto!important;
          width:100vw!important;
          min-width:100vw!important;
          max-width:100vw!important;
          height:6.85in!important;
          flex:0 0 100vw!important;
          margin:0!important;
          padding:0!important;
          transition:none!important;
        }

        arcgis-map#main-map{
          display:block!important;
          visibility:visible!important;
          position:absolute!important;
          left:0!important;
          top:0!important;
          width:100vw!important;
          min-width:100vw!important;
          max-width:100vw!important;
          height:6.85in!important;
          margin:0!important;
          padding:0!important;
        }
      }
    `;

    document.head.appendChild(st);
  }

  // ============================================================
  // NC FRIS FLOOD MAP - MASTER MENU EVENT / DIRECT OPEN
  // ============================================================
  window.addEventListener("mci:fris-map-open", openTool);

  if (location.hash.indexOf("mci-open-fris-tool=1") >= 0) {
    setTimeout(function () {
      openTool();
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {}
    }, 900);
  }
})();
