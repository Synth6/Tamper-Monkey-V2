// ==UserScript==
// @name         MCI Draw Tool
// @namespace    mci-tools
// @version      1.0.1
// @description  Toggle page draw tool overlay
// @match        *://*/*
// @run-at       document-idle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict";

  const PAGE_WINDOW = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  function runMciDrawTool() {
    const ID_MAIN = "__mci_draw_main__",
      ID_STROKE = "__mci_draw_stroke__",
      BAR_ID = "__mci_draw_bar__",
      CURSOR_STYLE_ID = "__mci_draw_cursorstyle__",
      PINS_ID = "__mci_draw_pins__",
      PINS_SVG_ID = "__mci_draw_pins_svg__";
    if (document.getElementById(ID_MAIN)) {
      [ID_MAIN, ID_STROKE, BAR_ID, CURSOR_STYLE_ID, PINS_ID].forEach(id => {
        const e = document.getElementById(id);
        if (e) e.remove();
      });
      document.documentElement.classList.remove("__mci_draw_cursor_draw", "__mci_draw_cursor_erase", "__mci_draw_cursor_delete", "__mci_draw_cursor_hl", "__mci_draw_cursor_arrow", "__mci_draw_cursor_pin");
      if (document.body) {
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
      }
      return;
    }

    /* ================== DEFAULTS ==================
       Change these to set default sizes/opacity per tool
    */
    let color = "#ff0000";
    let alphaDraw = 0.8,
      sizeDraw = 4;
    let sizeErase = 18;
    let colorHL = "#ffeb3b",
      alphaHL = 0.35,
      sizeHL = 18;
    let sizeArrow = 3;

    // pin cosmetics
    let pinColor = "rgba(168,85,247,.95)";
    let pinLineColor = "rgba(168,85,247,.85)";
    /* ================================================= */

    function docSize() {
      const d = document.documentElement,
        b = document.body;
      return {
        w: Math.max(d.scrollWidth, b.scrollWidth, d.clientWidth),
        h: Math.max(d.scrollHeight, b.scrollHeight, d.clientHeight)
      };
    }

    function mkCanvas(id, z) {
      const {
        w,
        h
      } = docSize();
      const cn = document.createElement("canvas");
      cn.id = id;
      cn.width = w;
      cn.height = h;
      Object.assign(cn.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: w + "px",
        height: h + "px",
        zIndex: String(z),
        pointerEvents: "none"
      });
      document.body.appendChild(cn);
      return cn;
    }

    const main = mkCanvas(ID_MAIN, 2147483646),
      stroke = mkCanvas(ID_STROKE, 2147483647);
    const mctx = main.getContext("2d"),
      sctx = stroke.getContext("2d");
    [mctx, sctx].forEach(ctx => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    });

    const ds0 = docSize();

    /* ===== Pins DOM layer (does NOT block page clicks) =====
       Important: width/height 0 + overflow visible => only the pin elements are clickable
    */
    const pinsWrap = document.createElement("div");
    pinsWrap.id = PINS_ID;
    Object.assign(pinsWrap.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "0px",
      height: "0px",
      overflow: "visible",
      zIndex: "2147483647",
      pointerEvents: "auto" // must be AUTO so children can receive pointer events
    });
    document.body.appendChild(pinsWrap);

    /* SVG lines stay full page but ignore clicks */
    const pinsSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    pinsSvg.setAttribute("id", PINS_SVG_ID);
    pinsSvg.setAttribute("width", ds0.w);
    pinsSvg.setAttribute("height", ds0.h);
    Object.assign(pinsSvg.style, {
      position: "absolute",
      left: "0",
      top: "0",
      pointerEvents: "none",
      zIndex: "2147483646"
    });
    document.body.appendChild(pinsSvg);

    /* ===== State ===== */
    let drawing = false,
      last = null;
    let drawKey = false,
      eraseKey = false,
      hlKey = false,
      arrowKey = false,
      deleteKey = false,
      pinKey = false;
    let hlMode = false,
      arrowMode = false,
      pinMode = false,
      deleteMode = false;
    let currentPts = null,
      arrowStart = null,
      arrowEnd = null;
    let pinCount = 0;

    let wrap = null,
      panel = null,
      tip = null,
      modePill = null,
      sizeMini = null;
    let sizeSlider = null,
      alphaSlider = null,
      colorEl = null,
      hlColorEl = null,
      hlAlphaEl = null;
    let btnHL = null,
      btnAR = null,
      btnPIN = null,
      btnDEL = null,
      btnUndo = null,
      btnRedo = null;

    const actions = []; // committed actions (paths/arrows/pins)
    const redo = []; // redo stack
    const pinDomById = {}; // pin.id -> {el, line}
    let trackedScrollEl = null;
    let trackedScrollBase = {
      x: 0,
      y: 0
    };

    /* ===== Utilities ===== */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function getScrollPos(el) {
      if (!el || el === window || el === document || el === document.documentElement || el === document.body) {
        return {
          x: window.scrollX || window.pageXOffset || 0,
          y: window.scrollY || window.pageYOffset || 0
        };
      }
      return {
        x: el.scrollLeft || 0,
        y: el.scrollTop || 0
      };
    }

    function getTrackedScrollDelta() {
      if (!trackedScrollEl) return {
        x: 0,
        y: 0
      };
      const now = getScrollPos(trackedScrollEl);
      return {
        x: now.x - trackedScrollBase.x,
        y: now.y - trackedScrollBase.y
      };
    }

    function updateOverlayScrollTransform() {
      const d = getTrackedScrollDelta();
      const t = (d.x || d.y) ? `translate(${-d.x}px,${-d.y}px)` : "none";
      main.style.transform = t;
      stroke.style.transform = t;
      pinsWrap.style.transform = t;
      pinsSvg.style.transform = t;
    }

    function onTrackedScroll() {
      updateOverlayScrollTransform();
    }

    function bindTrackedScrollEl(el) {
      const next = el || window;
      if (trackedScrollEl === next) {
        updateOverlayScrollTransform();
        return;
      }
      if (trackedScrollEl && trackedScrollEl !== window) {
        trackedScrollEl.removeEventListener("scroll", onTrackedScroll, true);
      }
      trackedScrollEl = next;
      trackedScrollBase = getScrollPos(next);
      if (trackedScrollEl !== window) {
        trackedScrollEl.addEventListener("scroll", onTrackedScroll, {
          capture: true,
          passive: true
        });
      }
      updateOverlayScrollTransform();
    }

    function isScrollable(el) {
      if (!el || el === document.body || el === document.documentElement) return false;
      const cs = getComputedStyle(el);
      const oy = cs.overflowY || "",
        ox = cs.overflowX || "";
      const yOk = /(auto|scroll|overlay)/.test(oy) && (el.scrollHeight > el.clientHeight + 1);
      const xOk = /(auto|scroll|overlay)/.test(ox) && (el.scrollWidth > el.clientWidth + 1);
      return yOk || xOk;
    }

    function elementUnderPointer(e) {
      const pm = main.style.pointerEvents,
        ps = stroke.style.pointerEvents,
        pp = pinsWrap.style.pointerEvents,
        pv = pinsSvg.style.pointerEvents;
      main.style.pointerEvents = "none";
      stroke.style.pointerEvents = "none";
      pinsWrap.style.pointerEvents = "none";
      pinsSvg.style.pointerEvents = "none";
      let el = null;
      try {
        el = document.elementFromPoint(e.clientX, e.clientY);
      } catch (_) {}
      main.style.pointerEvents = pm;
      stroke.style.pointerEvents = ps;
      pinsWrap.style.pointerEvents = pp;
      pinsSvg.style.pointerEvents = pv;
      return el;
    }

    function findScrollableAncestor(startEl) {
      let el = startEl;
      while (el && el !== document.body && el !== document.documentElement) {
        if (isScrollable(el)) return el;
        if (el.parentElement) {
          el = el.parentElement;
          continue;
        }
        const root = el.getRootNode ? el.getRootNode() : null;
        if (root && root.host) {
          el = root.host;
          continue;
        }
        break;
      }
      return window;
    }

    function maybeTrackScrollFromEvent(e) {
      if (!e) return;
      const under = elementUnderPointer(e) || e.target;
      const found = findScrollableAncestor(under);
      if (!trackedScrollEl) {
        bindTrackedScrollEl(found);
        return;
      }
      // avoid jumping existing marks to another scrolling context mid-session
      if (trackedScrollEl !== found && actions.length === 0 && !drawing) bindTrackedScrollEl(found);
    }
    const pagePos = e => {
      const d = getTrackedScrollDelta();
      return {
        x: e.clientX + window.scrollX + d.x,
        y: e.clientY + window.scrollY + d.y
      };
    };
    const clearStroke = () => sctx.clearRect(0, 0, stroke.width, stroke.height);

    /* ===== Tool routing ===== */
    function activeMode() {
      if (pinKey) return "pin";
      if (eraseKey) return "erase";
      if (deleteKey || deleteMode) return "delete";
      if (arrowKey || arrowMode) return "arrow";
      if (hlKey || hlMode) return "hl";
      if (drawKey) return "draw";
      if (pinMode) return "pin";
      return "idle";
    }

    function toolSize(mode) {
      if (mode === "erase") return sizeErase;
      if (mode === "hl") return sizeHL;
      if (mode === "arrow") return sizeArrow;
      return sizeDraw;
    }

    function setToolSize(mode, v) {
      v = clamp(v, 1, 80);
      if (mode === "erase") sizeErase = v;
      else if (mode === "hl") sizeHL = v;
      else if (mode === "arrow") sizeArrow = v;
      else sizeDraw = v;
    }

    function applyMainFor(mode) {
      const sz = toolSize(mode);
      if (mode === "erase") {
        mctx.globalCompositeOperation = "destination-out";
        mctx.globalAlpha = 1;
        mctx.strokeStyle = "rgba(0,0,0,1)";
        mctx.lineWidth = sz;
        return;
      }
      if (mode === "hl") {
        mctx.globalCompositeOperation = "source-over";
        mctx.globalAlpha = alphaHL;
        mctx.strokeStyle = colorHL;
        mctx.lineWidth = sz;
        return;
      }
      mctx.globalCompositeOperation = "source-over";
      mctx.globalAlpha = alphaDraw;
      mctx.strokeStyle = color;
      mctx.lineWidth = sz;
    }

    function applyStrokeFor(mode) {
      const sz = toolSize(mode);
      sctx.globalCompositeOperation = "source-over";
      sctx.globalAlpha = 1;
      if (mode === "hl") {
        stroke.style.opacity = String(alphaHL);
        sctx.strokeStyle = colorHL;
        sctx.lineWidth = sz;
      } else {
        stroke.style.opacity = String(alphaDraw);
        sctx.strokeStyle = color;
        sctx.lineWidth = sz;
      }
    }

    /* ===== Cursor system ===== */
    function svgCursor(svg) {
      return "url(\"data:image/svg+xml;utf8," + encodeURIComponent(svg) + "\")";
    }

    function circleSVG(d, stroke, fill, dash) {
      const D = Math.max(16, Math.min(96, Math.round(d)));
      const r = Math.max(2, (D / 2) - 2);
      const cx = D / 2,
        cy = D / 2;
      const dashAttr = dash ? `stroke-dasharray="${dash}"` : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${D}" height="${D}" viewBox="0 0 ${D} ${D}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dashAttr}/>
    <circle cx="${cx}" cy="${cy}" r="1.2" fill="${stroke}" opacity="0.9"/>
  </svg>`;
    }
    const cursorStyle = document.createElement("style");
    cursorStyle.id = CURSOR_STYLE_ID;
    document.head.appendChild(cursorStyle);

    const printStyle = document.createElement("style");
    printStyle.id = "__mci_draw_printstyle__";
    printStyle.textContent = `
@media print {
  /* ensure our overlays print */
  #${ID_MAIN}, #${PINS_ID}, #${PINS_SVG_ID} { display: block !important; }
  /* never print the preview stroke canvas */
  #${ID_STROKE} { display: none !important; }
  /* avoid weird cursor style printing */
  #${CURSOR_STYLE_ID} { display: none !important; }
}
`;
    document.head.appendChild(printStyle);

    function updateCursorCSS() {
      const m = activeMode();
      const modeFor = (m === "idle" || m === "pin") ? "draw" : m;
      const d = toolSize(modeFor);

      const drawSvg = circleSVG(d, "#0f172a", "rgba(255,255,255,0.15)", "4 3");
      const eraseSvg = circleSVG(d, "#ef4444", "rgba(255,255,255,0.10)", "");
      const delSvg = circleSVG(18, "#f43f5e", "rgba(244,63,94,0.10)", "");
      const hlSvg = circleSVG(d, "#f59e0b", "rgba(255,255,255,0.12)", "2 3");
      const arSvg = circleSVG(d, "#60a5fa", "rgba(255,255,255,0.10)", "6 3");
      const pinSvg = circleSVG(14, "#a855f7", "rgba(255,255,255,0.00)", "");

      const D = Math.max(16, Math.min(96, Math.round(d)));
      const hx = Math.floor(D / 2),
        hy = Math.floor(D / 2);

      cursorStyle.textContent = `
html.__mci_draw_cursor_draw, html.__mci_draw_cursor_draw * { cursor: ${svgCursor(drawSvg)} ${hx} ${hy}, crosshair !important; }
html.__mci_draw_cursor_erase, html.__mci_draw_cursor_erase * { cursor: ${svgCursor(eraseSvg)} ${hx} ${hy}, crosshair !important; }
html.__mci_draw_cursor_delete, html.__mci_draw_cursor_delete * { cursor: ${svgCursor(delSvg)} 9 9, crosshair !important; }
html.__mci_draw_cursor_hl, html.__mci_draw_cursor_hl * { cursor: ${svgCursor(hlSvg)} ${hx} ${hy}, crosshair !important; }
html.__mci_draw_cursor_arrow, html.__mci_draw_cursor_arrow * { cursor: ${svgCursor(arSvg)} ${hx} ${hy}, crosshair !important; }
html.__mci_draw_cursor_pin, html.__mci_draw_cursor_pin * { cursor: ${svgCursor(pinSvg)} 7 7, crosshair !important; }
`;
    }

    function setCursorMode() {
      const h = document.documentElement;
      h.classList.remove("__mci_draw_cursor_draw", "__mci_draw_cursor_erase", "__mci_draw_cursor_delete", "__mci_draw_cursor_hl", "__mci_draw_cursor_arrow", "__mci_draw_cursor_pin");
      const m = activeMode();
      if (m === "pin") h.classList.add("__mci_draw_cursor_pin");
      else if (m === "erase") h.classList.add("__mci_draw_cursor_erase");
      else if (m === "delete") h.classList.add("__mci_draw_cursor_delete");
      else if (m === "hl") h.classList.add("__mci_draw_cursor_hl");
      else if (m === "arrow") h.classList.add("__mci_draw_cursor_arrow");
      else if (m === "draw") h.classList.add("__mci_draw_cursor_draw");
    }
    updateCursorCSS();
    setCursorMode();

    /* ===== UI helpers ===== */
    function setSizeUI() {
      if (!sizeMini) return;
      const m = activeMode();
      const modeFor = (m === "idle" || m === "pin") ? "draw" : m;
      const sz = toolSize(modeFor);
      sizeMini.textContent = String(sz);
      if (sizeSlider) sizeSlider.value = String(sz);
    }

    function syncTogglesUI() {
      function on(b, ok) {
        if (!b) return;
        b.style.borderColor = ok ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.25)";
        b.style.background = ok ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.08)";
      }
      on(btnHL, hlMode);
      on(btnAR, arrowMode);
      on(btnPIN, pinMode);
      on(btnDEL, deleteMode);
      if (btnUndo) btnUndo.style.opacity = actions.length ? "1" : ".55";
      if (btnRedo) btnRedo.style.opacity = redo.length ? "1" : ".55";
    }

    function setModeUI() {
      if (!modePill) return;
      const m = activeMode();
      if (m === "erase") {
        modePill.textContent = "ERASE";
        modePill.style.borderColor = "rgba(239,68,68,.75)";
        modePill.style.background = "rgba(239,68,68,.18)";
      } else if (m === "delete") {
        modePill.textContent = "DEL";
        modePill.style.borderColor = "rgba(244,63,94,.75)";
        modePill.style.background = "rgba(244,63,94,.18)";
      } else if (m === "hl") {
        modePill.textContent = "HL";
        modePill.style.borderColor = "rgba(245,158,11,.75)";
        modePill.style.background = "rgba(245,158,11,.18)";
      } else if (m === "arrow") {
        modePill.textContent = "AR";
        modePill.style.borderColor = "rgba(96,165,250,.75)";
        modePill.style.background = "rgba(96,165,250,.18)";
      } else if (m === "pin") {
        modePill.textContent = "PIN";
        modePill.style.borderColor = "rgba(168,85,247,.75)";
        modePill.style.background = "rgba(168,85,247,.18)";
      } else if (m === "draw") {
        modePill.textContent = "DRAW";
        modePill.style.borderColor = "rgba(34,197,94,.75)";
        modePill.style.background = "rgba(34,197,94,.18)";
      } else {
        modePill.textContent = "IDLE";
        modePill.style.borderColor = "rgba(255,255,255,.22)";
        modePill.style.background = "rgba(255,255,255,.06)";
      }
      setDrawSurfaceInteractivity();
      setSizeUI();
      syncTogglesUI();
    }

    /* Route pointer input through the overlay only while a tool is active.
       This allows drawing over embedded/plugin content (like many in-browser PDFs)
       while keeping the page normally clickable in idle mode. */
    function setDrawSurfaceInteractivity() {
      const m = activeMode();
      const on = (m !== "idle");
      const pe = on ? "auto" : "none";
      main.style.pointerEvents = pe;
      stroke.style.pointerEvents = pe;
    }

    /* Prevent text selection while painting */
    let prevUserSelect = null,
      prevWebkitUserSelect = null;

    function lockSelection(on) {
      if (!document.body) return;
      if (on) {
        if (prevUserSelect === null) {
          prevUserSelect = document.body.style.userSelect;
          prevWebkitUserSelect = document.body.style.webkitUserSelect;
        }
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
      } else {
        if (prevUserSelect !== null) {
          document.body.style.userSelect = prevUserSelect;
          document.body.style.webkitUserSelect = prevWebkitUserSelect;
        }
        prevUserSelect = null;
        prevWebkitUserSelect = null;
      }
    }

    /* ===== Actions + redraw ===== */
    function clearPinsDOM() {
      while (pinsSvg.firstChild) pinsSvg.removeChild(pinsSvg.firstChild);
      while (pinsWrap.firstChild) pinsWrap.removeChild(pinsWrap.firstChild);
      for (const k in pinDomById) delete pinDomById[k];
    }

    function mkLine() {
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("stroke", pinLineColor);
      ln.setAttribute("stroke-width", "2");
      ln.setAttribute("stroke-linecap", "round");
      ln.setAttribute("opacity", "0.95");
      pinsSvg.appendChild(ln);
      return ln;
    }

    function setLine(ln, x1, y1, x2, y2) {
      ln.setAttribute("x1", x1);
      ln.setAttribute("y1", y1);
      ln.setAttribute("x2", x2);
      ln.setAttribute("y2", y2);
    }

    function bubbleAnchor(el) {
      // returns bottom-center of bubble (or badge if no bubble)
      const bubble = el.querySelector('[data-mci-pin-bubble="1"]');
      const badge = el.querySelector('[data-mci-pin-badge="1"]');
      const target = bubble || badge || el;
      const r = target.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 + window.scrollX,
        y: r.top + r.height + window.scrollY
      };
    }

    function renumberPins() {
      let n = 0;
      for (const a of actions) {
        if (a && a.type === "pin") {
          n++;
          a.n = n;
        }
      }
      pinCount = n;
    }

    function removePinById(pinId) {
      for (let i = actions.length - 1; i >= 0; i--) {
        const a = actions[i];
        if (a && a.type === "pin" && a.id === pinId) {
          const removed = actions.splice(i, 1)[0];
          return removed;
        }
      }
      return null;
    }

    function deletePinById(pinId) {
      const removed = removePinById(pinId);
      if (!removed) return false;
      renumberPins();
      redo.length = 0;
      redrawAll(true);
      return true;
    }

    function mkPinEl(pin) {
      const el = document.createElement("div");
      el.setAttribute("data-mci-pin", "1");
      Object.assign(el.style, {
        position: "absolute",
        left: pin.x + "px",
        top: pin.y + "px",
        transform: "none",
        pointerEvents: "auto",
        overflow: "visible",
        font: "12px system-ui, -apple-system, Segoe UI, Roboto, Arial",
        zIndex: "2147483647"
      });

      const safeVal = String(pin.note || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

      // input keeps original padding; finished bubble tighter
      const bubbleHtml = pin.editing ? `
    <input data-mci-pin-input="1" type="text" value="${safeVal}" placeholder="Type note, Enter to save"
      style="
        width:240px; min-width:240px; max-width:260px; flex:0 0 auto;
        padding:6px 8px; border-radius:10px;
        border:1px solid rgba(255,255,255,.18);
        background:rgba(15,23,42,.92); color:#fff; outline:none;
      "
    />
  ` : (String(pin.note || "").trim().length ? `
    <div data-mci-pin-bubble="1"
      style="
        max-width:260px; min-width:160px; flex:0 0 auto;
        padding:2px 6px; border-radius:10px;
        line-height:0.7;
        background:rgba(15,23,42,.92); color:#fff;
        border:1px solid rgba(255,255,255,.16);
        white-space:pre-wrap;
        box-shadow:0 10px 28px rgba(0,0,0,.42);
      ">
      ${String(pin.note).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
    </div>
  ` : `<div data-mci-pin-bubble="1" style="width:10px;height:10px;"></div>`);

      el.innerHTML = `
    <div data-mci-pin-badge="1" title="Drag to move"
      style="
        position:absolute; left:0; top:0; transform:translate(-50%,-50%);
        min-width:22px;height:22px;border-radius:999px;
        display:flex;align-items:center;justify-content:center;
        background:${pinColor};color:#fff;font-weight:800;
        box-shadow:0 8px 18px rgba(0,0,0,.35);
        cursor:grab; user-select:none;
        touch-action:none;
      ">${pin.n}</div>

    <div data-mci-pin-bubblewrap="1"
      style="
        position:absolute; left:12px; top:-12px;
        transform:translate(0,-100%);
        display:flex; align-items:flex-start; gap:6px;
        pointer-events:auto;
        flex-wrap:nowrap;
        flex:0 0 auto;
        max-width:none;
        cursor:grab;                 /* so you can drag the text too */
        touch-action:none;
      ">
      ${bubbleHtml}
      <button data-mci-pin-delete="1" title="Delete pin"
        style="
          width:20px;height:20px;min-width:20px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.26);
          background:rgba(239,68,68,.28);
          color:#fff;
          font-weight:800;
          line-height:1;
          cursor:pointer;
          padding:0;
          margin-top:1px;
        ">x</button>
    </div>
  `;

      const badge = el.querySelector('[data-mci-pin-badge="1"]');
      const bubbleWrap = el.querySelector('[data-mci-pin-bubblewrap="1"]');

      // ---- line update helper ----
      function updateLineLive() {
        const dom = pinDomById[pin.id];
        if (dom && dom.line) {
          const a = bubbleAnchor(el);
          setLine(dom.line, pin.x, pin.y, a.x, a.y);
        }
      }

      // ---- shared drag handler for badge + bubblewrap (but not the input) ----
      function attachDrag(handleEl) {
        if (!handleEl) return;

        let dragging = false,
          moved = false;
        let sx = 0,
          sy = 0;
        const MOVE_PX = 3;

        function endDrag(ev) {
          if (!dragging) return;
          dragging = false;
          handleEl.style.cursor = "grab";
          try {
            handleEl.releasePointerCapture(ev.pointerId);
          } catch (_) {}
          if (moved) redrawAll(true);
        }

        handleEl.addEventListener("pointerdown", (ev) => {
          // If this is the bubblewrap and you clicked the INPUT, do not drag.
          if (ev.target && ev.target.closest && ev.target.closest('[data-mci-pin-input="1"]')) return;
          if (ev.target && ev.target.closest && ev.target.closest('[data-mci-pin-delete="1"]')) return;

          ev.preventDefault();
          ev.stopPropagation();

          dragging = true;
          moved = false;
          sx = ev.clientX;
          sy = ev.clientY;
          handleEl.style.cursor = "grabbing";
          try {
            handleEl.setPointerCapture(ev.pointerId);
          } catch (_) {}
        }, true);

        handleEl.addEventListener("pointermove", (ev) => {
          if (!dragging) return;
          ev.preventDefault();
          ev.stopPropagation();

          const dx = ev.clientX - sx,
            dy = ev.clientY - sy;
          if (!moved && (Math.abs(dx) > MOVE_PX || Math.abs(dy) > MOVE_PX)) moved = true;
          if (!moved) return;

          const p = pagePos(ev);
          pin.x = p.x;
          pin.y = p.y;

          el.style.left = pin.x + "px";
          el.style.top = pin.y + "px";

          updateLineLive();
        }, true);

        handleEl.addEventListener("pointerup", endDrag, true);
        handleEl.addEventListener("pointercancel", endDrag, true);
        handleEl.addEventListener("lostpointercapture", () => {
          dragging = false;
          handleEl.style.cursor = "grab";
        }, true);

        // prevent click-from-drag turning into edit
        handleEl.addEventListener("click", (ev) => {
          if (!moved) return;
          ev.preventDefault();
          ev.stopPropagation();
          moved = false;
        }, true);
      }

      attachDrag(badge);
      attachDrag(bubbleWrap);

      // ---- clicking the bubble area (NOT dragging) should enter edit ----
      if (bubbleWrap) {
        bubbleWrap.addEventListener("dblclick", (ev) => {
          if (ev.target && ev.target.closest && ev.target.closest('[data-mci-pin-delete="1"]')) return;
          // double click is a clean way to edit without fighting drag
          ev.preventDefault();
          ev.stopPropagation();
          pin.editing = true;
          redrawAll(true, pin.id);
        }, true);
      }

      const delBtn = el.querySelector('[data-mci-pin-delete="1"]');
      if (delBtn) {
        ["pointerdown", "mousedown", "click", "dblclick"].forEach(evt => {
          delBtn.addEventListener(evt, (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
          }, true);
        });
        delBtn.addEventListener("click", () => {
          deletePinById(pin.id);
        }, true);
      }

      // ---- wire input Enter/Escape ----
      const input = el.querySelector('[data-mci-pin-input="1"]');
      if (input) {
        setTimeout(() => {
          try {
            input.focus();
            input.select();
          } catch (_) {}
        }, 0);

        // keep typing from triggering global stuff / pin placement
        ["pointerdown", "mousedown", "click"].forEach(evt => {
          input.addEventListener(evt, (ev) => {
            ev.stopPropagation();
          }, true);
        });

        input.addEventListener("keydown", (ev) => {
          ev.stopPropagation();

          if (ev.key === "Enter") {
            ev.preventDefault();
            pin.note = String(input.value || "").trim();
            pin.editing = false;
            redrawAll(true);
          } else if (ev.key === "Escape") {
            ev.preventDefault();

            const isNew =
              pin.editing &&
              (!String(pin.note || "").trim().length) &&
              (!String(input.value || "").trim().length);

            if (isNew) {
              removePinById(pin.id);
              renumberPins();
              redo.length = 0;
              redrawAll(true);
              return;
            }

            pin.editing = false;
            redrawAll(true);
          }
        }, true);
      }

      return el;
    }


    function drawPathTo(ctx, act) {
      ctx.save();
      if (act.kind === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = act.alpha;
        ctx.strokeStyle = act.color;
      }
      ctx.lineWidth = act.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pts = act.pts;
      if (pts && pts.length > 1) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawArrowTo(ctx, act) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = act.alpha;
      ctx.strokeStyle = act.color;
      ctx.lineWidth = act.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const x1 = act.a.x,
        y1 = act.a.y,
        x2 = act.b.x,
        y2 = act.b.y;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(10, act.size * 2.2);
      const a1 = ang - Math.PI / 7,
        a2 = ang + Math.PI / 7;
      const hx1 = x2 - head * Math.cos(a1),
        hy1 = y2 - head * Math.sin(a1);
      const hx2 = x2 - head * Math.cos(a2),
        hy2 = y2 - head * Math.sin(a2);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(hx1, hy1);
      ctx.moveTo(x2, y2);
      ctx.lineTo(hx2, hy2);
      ctx.stroke();
      ctx.restore();
    }

    function redrawAll(keepPanel, focusPinId) {
      mctx.clearRect(0, 0, main.width, main.height);
      clearStroke();
      clearPinsDOM();

      // draw raster actions
      for (const act of actions) {
        if (act.type === "path") drawPathTo(mctx, act);
        else if (act.type === "arrow") drawArrowTo(mctx, act);
      }

      // draw pins + leader lines
      for (const act of actions) {
        if (act.type !== "pin") continue;

        const ln = mkLine();
        const el = mkPinEl(act);
        pinsWrap.appendChild(el);

        // set initial line to bubble bottom center
        const a = bubbleAnchor(el);
        setLine(ln, act.x, act.y, a.x, a.y);

        pinDomById[act.id] = {
          el,
          line: ln
        };

        if (focusPinId && act.id === focusPinId) {
          // focus handled inside mkPinEl via setTimeout
        }
      }

      syncTogglesUI();
      if (!keepPanel && panel) panel.style.display = "none";
    }

    /* ===== Resize handling ===== */
    function growIfNeeded() {
      const {
        w,
        h
      } = docSize();
      if (w === main.width && h === main.height) {
        updateOverlayScrollTransform();
        return;
      }

      main.width = w;
      main.height = h;
      stroke.width = w;
      stroke.height = h;
      main.style.width = w + "px";
      main.style.height = h + "px";
      stroke.style.width = w + "px";
      stroke.style.height = h + "px";

      pinsSvg.setAttribute("width", w);
      pinsSvg.setAttribute("height", h);

      redrawAll(true);
      updateOverlayScrollTransform();
    }

    /* ===== Commit actions ===== */
    function commitPath(kind, pts) {
      if (!pts || pts.length < 2) return;
      const act = {
        type: "path",
        kind,
        pts: pts.slice(0),
        color: (kind === "hl") ? colorHL : color,
        alpha: (kind === "hl") ? alphaHL : alphaDraw,
        size: (kind === "hl") ? sizeHL : (kind === "erase" ? sizeErase : sizeDraw)
      };
      actions.push(act);
      redo.length = 0;
      redrawAll(true);
    }

    function commitArrow(a, b) {
      const act = {
        type: "arrow",
        a,
        b,
        color,
        alpha: alphaDraw,
        size: sizeArrow
      };
      actions.push(act);
      redo.length = 0;
      redrawAll(true);
    }

    function commitPin(x, y) {
      pinCount++;
      const act = {
        type: "pin",
        id: "pin_" + Date.now() + "_" + Math.random().toString(16).slice(2),
        x,
        y,
        n: pinCount,
        note: "",
        editing: true
      };
      actions.push(act);
      redo.length = 0;
      redrawAll(true, act.id);
    }

    /* ===== Undo/Redo ===== */
    function doUndo() {
      if (!actions.length) return;
      redo.push(actions.pop());
      redrawAll(true);
    }

    function doRedo() {
      if (!redo.length) return;
      actions.push(redo.pop());
      redrawAll(true);
    }

    /* ===== click filters ===== */
    function clickedUI(e) {
      return wrap && wrap.contains(e.target);
    }

    function clickedExistingPin(e) {
      return !!(e.target && e.target.closest && e.target.closest('[data-mci-pin="1"]'));
    }

    function anyEditingPin() {
      for (const a of actions) {
        if (a && a.type === "pin" && a.editing) return a;
      }
      return null;
    }

    function closeAllPinEdits() {
      let changed = false;

      for (let i = actions.length - 1; i >= 0; i--) {
        const a = actions[i];
        if (a && a.type === "pin" && a.editing) {
          const empty = !String(a.note || "").trim().length;
          if (empty) {
            actions.splice(i, 1); // delete pin
            changed = true;
            continue;
          }
          a.editing = false;
          changed = true;
        }
      }

      if (changed) {
        renumberPins(); // <— fixes the “count skipping”
      }
      return changed;
    }

    function distPointToSegment(p, a, b) {
      const abx = b.x - a.x,
        aby = b.y - a.y;
      const apx = p.x - a.x,
        apy = p.y - a.y;
      const ab2 = abx * abx + aby * aby;
      if (ab2 === 0) {
        const dx = p.x - a.x,
          dy = p.y - a.y;
        return Math.hypot(dx, dy);
      }
      const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);
      const px = a.x + abx * t,
        py = a.y + aby * t;
      return Math.hypot(p.x - px, p.y - py);
    }

    function findActionIndexAtPoint(p, targetEl) {
      const pinEl = targetEl && targetEl.closest ? targetEl.closest('[data-mci-pin="1"]') : null;
      if (pinEl) {
        const foundId = Object.keys(pinDomById).find(id => pinDomById[id] && pinDomById[id].el === pinEl);
        if (foundId) {
          for (let i = actions.length - 1; i >= 0; i--) {
            const a = actions[i];
            if (a && a.type === "pin" && a.id === foundId) return i;
          }
        }
      }

      for (let i = actions.length - 1; i >= 0; i--) {
        const act = actions[i];
        if (!act) continue;

        if (act.type === "arrow") {
          const tol = Math.max(8, act.size + 6);
          const x1 = act.a.x,
            y1 = act.a.y,
            x2 = act.b.x,
            y2 = act.b.y;
          if (distPointToSegment(p, act.a, act.b) <= tol) return i;

          const ang = Math.atan2(y2 - y1, x2 - x1);
          const head = Math.max(10, act.size * 2.2);
          const a1 = ang - Math.PI / 7,
            a2 = ang + Math.PI / 7;
          const h1 = {
            x: x2 - head * Math.cos(a1),
            y: y2 - head * Math.sin(a1)
          };
          const h2 = {
            x: x2 - head * Math.cos(a2),
            y: y2 - head * Math.sin(a2)
          };
          if (distPointToSegment(p, {
              x: x2,
              y: y2
            }, h1) <= tol || distPointToSegment(p, {
              x: x2,
              y: y2
            }, h2) <= tol) return i;
          continue;
        }

        if (act.type === "path" && act.pts && act.pts.length > 1) {
          const tol = Math.max(8, act.size + 5);
          for (let j = 1; j < act.pts.length; j++) {
            if (distPointToSegment(p, act.pts[j - 1], act.pts[j]) <= tol) return i;
          }
        }
      }

      return -1;
    }

    function deleteActionAtPoint(p, targetEl) {
      const idx = findActionIndexAtPoint(p, targetEl);
      if (idx < 0) return false;
      const removed = actions.splice(idx, 1)[0];
      if (!removed) return false;
      if (removed.type === "pin") renumberPins();
      redo.length = 0;
      redrawAll(true);
      return true;
    }

    /* ===== mouse interactions ===== */
    const down = e => {
      const m = activeMode();

      // ignore clicks on UI
      if (clickedUI(e)) return;
      if (m !== "idle") maybeTrackScrollFromEvent(e);

      // If a pin input is open and you click anywhere outside a pin, exit edit mode
      const editing = anyEditingPin();
      const onPin = clickedExistingPin(e);
      if (editing && !onPin) {
        e.preventDefault();
        e.stopPropagation();
        closeAllPinEdits();
        redrawAll(true);
        return; // IMPORTANT: do not place a new pin
      }

      if (m === "idle") return;

      if (m === "delete") {
        e.preventDefault();
        e.stopPropagation();
        const p = pagePos(e);
        deleteActionAtPoint(p, e.target);
        return;
      }

      // clicking an existing pin should never place a new pin or start drawing
      if (onPin) return;

      if (m === "pin") {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const p = pagePos(e);
        commitPin(p.x, p.y);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      lockSelection(true);
      drawing = true;
      last = pagePos(e);

      if (m === "arrow") {
        arrowStart = last;
        arrowEnd = last;
        clearStroke();
        applyStrokeFor("draw");
        return;
      }

      currentPts = [last];
      if (m === "erase") {
        applyMainFor("erase");
        mctx.beginPath();
        mctx.moveTo(last.x, last.y);
      } else {
        clearStroke();
        applyStrokeFor(m);
      }
    };

    const move = e => {
      if (!drawing) return;
      const m = activeMode();
      if (m === "idle" || m === "pin" || m === "delete") return;

      e.preventDefault();
      e.stopPropagation();
      const p = pagePos(e);

      if (m === "arrow") {
        arrowEnd = p;
        clearStroke();
        sctx.save();
        sctx.globalCompositeOperation = "source-over";
        sctx.globalAlpha = 1;
        sctx.strokeStyle = color;
        sctx.lineWidth = sizeArrow;
        sctx.lineCap = "round";
        sctx.lineJoin = "round";
        sctx.beginPath();
        sctx.moveTo(arrowStart.x, arrowStart.y);
        sctx.lineTo(arrowEnd.x, arrowEnd.y);
        sctx.stroke();

        const ang = Math.atan2(arrowEnd.y - arrowStart.y, arrowEnd.x - arrowStart.x);
        const head = Math.max(10, sizeArrow * 2.2);
        const a1 = ang - Math.PI / 7,
          a2 = ang + Math.PI / 7;
        const hx1 = arrowEnd.x - head * Math.cos(a1),
          hy1 = arrowEnd.y - head * Math.sin(a1);
        const hx2 = arrowEnd.x - head * Math.cos(a2),
          hy2 = arrowEnd.y - head * Math.sin(a2);
        sctx.beginPath();
        sctx.moveTo(arrowEnd.x, arrowEnd.y);
        sctx.lineTo(hx1, hy1);
        sctx.moveTo(arrowEnd.x, arrowEnd.y);
        sctx.lineTo(hx2, hy2);
        sctx.stroke();
        sctx.restore();
        return;
      }

      if (m === "erase") {
        applyMainFor("erase");
        mctx.lineTo(p.x, p.y);
        mctx.stroke();
      } else {
        applyStrokeFor(m);
        sctx.beginPath();
        sctx.moveTo(last.x, last.y);
        sctx.lineTo(p.x, p.y);
        sctx.stroke();
      }

      if (currentPts) currentPts.push(p);
      last = p;
    };

    const finish = () => {
      if (!drawing) return;
      const m = activeMode();

      if (m === "arrow") {
        clearStroke();
        if (arrowStart && arrowEnd) commitArrow(arrowStart, arrowEnd);
        arrowStart = arrowEnd = null;
      } else if (m === "erase") {
        if (currentPts && currentPts.length > 1) commitPath("erase", currentPts);
      } else if (m === "hl") {
        clearStroke();
        if (currentPts && currentPts.length > 1) commitPath("hl", currentPts);
      } else if (m === "draw") {
        clearStroke();
        if (currentPts && currentPts.length > 1) commitPath("draw", currentPts);
      }

      drawing = false;
      last = null;
      currentPts = null;
      lockSelection(false);
    };
    const up = e => {
      if (!drawing) return;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      finish();
    };

    /* Wheel resizes active tool size (except idle/pin) */
    const wheel = e => {
      const m = activeMode();
      if (m === "idle" || m === "pin" || m === "delete") return;
      e.preventDefault();
      e.stopPropagation();
      const cur = toolSize(m);
      const next = clamp(cur + (e.deltaY < 0 ? 1 : -1), 1, 80);
      setToolSize(m, next);
      updateCursorCSS();
      setCursorMode();
      setSizeUI();
    };

    /* ===== key handling ===== */
    const keydown = e => {
      const t = e.target,
        tag = t && t.tagName ? String(t.tagName).toLowerCase() : "";
      const typing = (tag === "input" || tag === "textarea" || (t && t.isContentEditable));

      // If pin shortcut is already active, swallow P repeats so they never type into page fields.
      if (e.code === "KeyP" && pinKey) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (!typing && (e.ctrlKey || e.metaKey)) {
        const k = (e.key || "").toLowerCase();
        if (k === "z") {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) doRedo();
          else doUndo();
          return;
        }
        if (k === "y") {
          e.preventDefault();
          e.stopPropagation();
          doRedo();
          return;
        }
      }
      if (typing) return;

      if (e.code === "KeyD") {
        drawKey = true;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyE") {
        eraseKey = true;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyX") {
        deleteKey = true;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyH") {
        hlKey = true;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyA") {
        arrowKey = true;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === "KeyP") {
        e.preventDefault();
        e.stopPropagation();
        pinKey = true;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
        return;
      }
      if (e.key === "Escape") cleanup();
    };
    const keyup = e => {
      if (e.code === "KeyD") {
        drawKey = false;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyE") {
        eraseKey = false;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyX") {
        deleteKey = false;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyH") {
        hlKey = false;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyA") {
        arrowKey = false;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (e.code === "KeyP") {
        if (pinKey) {
          e.preventDefault();
          e.stopPropagation();
        }
        pinKey = false;
        setModeUI();
        updateCursorCSS();
        setCursorMode();
      }
      if (!drawKey && !eraseKey && !deleteKey && !hlKey && !arrowKey && !pinKey && drawing) finish();
    };

    /* Extra selection blockers (only while painting) */
    const selectstart = e => {
      if (drawing) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const dragstart = e => {
      if (drawing) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    let wheelOn = false;

    function attachWheel() {
      if (wheelOn) return;
      wheelOn = true;
      window.addEventListener("wheel", wheel, {
        capture: true,
        passive: false
      });
      document.addEventListener("wheel", wheel, {
        capture: true,
        passive: false
      });
    }

    function detachWheel() {
      if (!wheelOn) return;
      wheelOn = false;
      window.removeEventListener("wheel", wheel, true);
      document.removeEventListener("wheel", wheel, true);
    }

    function cleanup() {
      // remove global listeners
      Object.entries(handlers).forEach(([k, v]) => {
        window.removeEventListener(k, v, true);
      });
      if (trackedScrollEl && trackedScrollEl !== window) {
        trackedScrollEl.removeEventListener("scroll", onTrackedScroll, true);
      }
      trackedScrollEl = null;
      trackedScrollBase = {
        x: 0,
        y: 0
      };
      detachWheel();

      // remove injected DOM
      [
        ID_MAIN,
        ID_STROKE,
        BAR_ID,
        CURSOR_STYLE_ID,
        PINS_ID,
        PINS_SVG_ID, // <— NEW: remove SVG leader-lines layer
        "__mci_draw_printstyle__" // <— NEW: remove print CSS
      ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });

      // reset cursor classes
      document.documentElement.classList.remove(
        "__mci_draw_cursor_draw",
        "__mci_draw_cursor_erase",
        "__mci_draw_cursor_delete",
        "__mci_draw_cursor_hl",
        "__mci_draw_cursor_arrow",
        "__mci_draw_cursor_pin"
      );

      // reset selection lock + any leftover selection styles
      lockSelection(false);
      if (document.body) {
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
      }
      [main, stroke, pinsWrap, pinsSvg].forEach(el => {
        if (el) el.style.transform = "none";
      });
    }


    const handlers = {
      mousedown: down,
      mousemove: move,
      mouseup: up,
      keydown,
      keyup,
      scroll: growIfNeeded,
      resize: growIfNeeded,
      selectstart: selectstart,
      dragstart: dragstart
    };
    Object.entries(handlers).forEach(([k, v]) => window.addEventListener(k, v, true));
    attachWheel();

    /* ───── Right-side pill + slide-out panel ───── */
    wrap = document.createElement("div");
    wrap.id = BAR_ID;
    Object.assign(wrap.style, {
      position: "fixed",
      right: "12px",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: "2147483647",
      font: "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial",
      userSelect: "none",
      pointerEvents: "auto"
    });

    wrap.innerHTML = `
<div id="__mci_pill__" title="Click to open/close" style="
  width:56px;height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;border-radius:14px;background:rgba(15,23,42,.92);color:#fff;
  border:1px solid rgba(255,255,255,.16);box-shadow:0 10px 28px rgba(0,0,0,.42);
  cursor:pointer;backdrop-filter:blur(6px);font-weight:800;letter-spacing:.6px;
">
  <span id="__mci_mode__">IDLE</span>
  <span id="__mci_sz__" style="font-size:11px;opacity:.85;font-weight:700;letter-spacing:.2px;">${sizeDraw}</span>
</div>

<div id="__mci_panel__" style="
  position:absolute; right:64px; top:50%; transform:translateY(-50%);
  width:300px;background:rgba(15,23,42,.94);color:#fff;border:1px solid rgba(255,255,255,.16);
  border-radius:16px;box-shadow:0 16px 36px rgba(0,0,0,.55);padding:12px;display:none;
  backdrop-filter:blur(8px);
">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
    <div style="font-weight:800;opacity:.95;">Marker Tools</div>
    <button id="__mci_print__" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(96,165,250,.75);background:rgba(59,130,246,.28);color:#fff;cursor:pointer;font-weight:700;">Print</button>
    <button id="__mci_close__" title="Close (Esc)" style="padding:4px 10px;border-radius:999px;border:1px solid rgba(239,68,68,.6);background:rgba(239,68,68,.2);color:#fff;cursor:pointer;">Close</button>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
    <button id="__mci_undo__" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">Undo</button>
    <button id="__mci_redo__" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">Redo</button>

    <button id="__mci_hl__"  title="Toggle Highlighter (or hold H)" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">HL</button>
    <button id="__mci_ar__"  title="Toggle Arrows (or hold A)" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">AR</button>
    <button id="__mci_pin__" title="Toggle Pins/Notes (or hold P + click)" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">PIN</button>
    <button id="__mci_del__" title="Toggle delete mode (or hold X)" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">DEL</button>

  </div>

  <div style="display:flex;flex-direction:column;gap:10px;">
    <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="opacity:.85;">Pen Color</span>
      <input id="__mci_color__" type="color" value="${color}" style="width:40px;height:24px;border:0;background:transparent;padding:0;">
    </label>

    <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="opacity:.85;">Pen Opacity</span>
      <input id="__mci_alpha__" type="range" min="5" max="100" value="${Math.round(alphaDraw*100)}" style="width:170px;">
    </label>

    <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="opacity:.85;">Active Size</span>
      <input id="__mci_size__" type="range" min="1" max="80" value="${sizeDraw}" style="width:170px;">
    </label>

    <div style="height:1px;background:rgba(255,255,255,.12);margin:2px 0;"></div>

    <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="opacity:.85;">HL Color</span>
      <input id="__mci_hl_color__" type="color" value="${colorHL}" style="width:40px;height:24px;border:0;background:transparent;padding:0;">
    </label>

    <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span style="opacity:.85;">HL Opacity</span>
      <input id="__mci_hl_alpha__" type="range" min="5" max="100" value="${Math.round(alphaHL*100)}" style="width:170px;">
    </label>

    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button id="__mci_clear__" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">Clear</button>
      <button id="__mci_help__" style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;">Help</button>
    </div>

    <div id="__mci_tip__" style="display:none;padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);white-space:normal;">
    <div style="font-weight:700;margin-bottom:6px;">Controls</div>
      <div style="opacity:.9;">
        Hold <b>D</b> + Mouse = Draw<br>
        Hold <b>E</b> + Mouse = Erase<br>
        Hold <b>H</b> + Mouse = Highlighter<br>
        Hold <b>A</b> + Drag = Arrow<br>
        Hold <b>X</b> + Click = Delete item<br>
        Hold <b>P</b> + Click = Pin/Note (Enter to save, Esc to cancel)<br>
        Drag purple number to move pin anytime<br>
        Click pin <b>x</b> button = Delete that pin<br>
        Wheel (while tool active) = Size<br>
        <b>Ctrl+Z</b> Undo • <b>Ctrl+Y</b> Redo
      </div>
    </div>
  </div>
</div>
`;
    document.body.appendChild(wrap);

    modePill = wrap.querySelector("#__mci_mode__");
    sizeMini = wrap.querySelector("#__mci_sz__");
    panel = wrap.querySelector("#__mci_panel__");
    tip = wrap.querySelector("#__mci_tip__");

    const pill = wrap.querySelector("#__mci_pill__");

    function togglePanel(force) {
      const open = (typeof force === "boolean") ? force : (panel.style.display === "none");
      panel.style.display = open ? "block" : "none";
    }
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
    }, true);
    window.addEventListener("mousedown", (e) => {
      if (!panel || panel.style.display === "none") return;
      if (wrap.contains(e.target)) return;
      togglePanel(false);
    }, true);

    btnUndo = wrap.querySelector("#__mci_undo__");
    btnRedo = wrap.querySelector("#__mci_redo__");
    btnHL = wrap.querySelector("#__mci_hl__");
    btnAR = wrap.querySelector("#__mci_ar__");
    btnPIN = wrap.querySelector("#__mci_pin__");
    btnDEL = wrap.querySelector("#__mci_del__");
    const btnPrint = wrap.querySelector("#__mci_print__");

    btnUndo.onclick = () => doUndo();
    btnRedo.onclick = () => doRedo();

    btnHL.onclick = () => {
      hlMode = !hlMode;
      if (hlMode) {
        arrowMode = false;
        pinMode = false;
        deleteMode = false;
      }
      setModeUI();
      updateCursorCSS();
      setCursorMode();
    };
    btnAR.onclick = () => {
      arrowMode = !arrowMode;
      if (arrowMode) {
        hlMode = false;
        pinMode = false;
        deleteMode = false;
      }
      setModeUI();
      updateCursorCSS();
      setCursorMode();
    };
    btnPIN.onclick = () => {
      pinMode = !pinMode;
      if (pinMode) {
        hlMode = false;
        arrowMode = false;
        deleteMode = false;
      }
      setModeUI();
      updateCursorCSS();
      setCursorMode();
    };
    btnDEL.onclick = () => {
      deleteMode = !deleteMode;
      if (deleteMode) {
        hlMode = false;
        arrowMode = false;
        pinMode = false;
      }
      setModeUI();
      updateCursorCSS();
      setCursorMode();
    };

    // ===== PRINT (updated) =====
    // ===== PRINT (UPDATED: stable filename + hard-hide UI + better restore) =====

    function safeTitleForPdf() {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = ("0" + (d.getMonth() + 1)).slice(-2);
      const dd = ("0" + d.getDate()).slice(-2);
      return "MCI Markup " + yyyy + "-" + mm + "-" + dd;
    }

    function ensurePrintStyle() {
      const STYLE_ID = "__mci_draw_printstyle__";
      let st = document.getElementById(STYLE_ID);
      if (!st) {
        st = document.createElement("style");
        st.id = STYLE_ID;
        document.head.appendChild(st);
      }

      const ds = docSize(); // full doc pixels at time of print

      st.textContent = `
@page { margin: 0 !important; }
@media print {
  html, body {
    width: ${ds.w}px !important;
    height: ${ds.h}px !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
  }

  /* hide UI */
  #${BAR_ID} { display:none !important; visibility:hidden !important; }

  /* never print live preview */
  #${ID_STROKE} { display:none !important; }

  /* print committed overlays */
  #${ID_MAIN}, #${PINS_ID}, #${PINS_SVG_ID} {
    display:block !important;
    visibility:visible !important;
    opacity:1 !important;
  }

  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;
    }

    let __mciPrintState = null;
    let __mciTitleGuard = null;

    function applyTitleGuard() {
      if (__mciTitleGuard) return;

      const target = safeTitleForPdf();
      const oldTitle = document.title;

      // set immediately
      document.title = target;

      // keep forcing it briefly (Google/others can overwrite title)
      const started = Date.now();
      const timer = setInterval(() => {
        if (Date.now() - started > 8000) {
          clearInterval(timer);
          return;
        }
        if (document.title !== target) document.title = target;
      }, 100);

      __mciTitleGuard = {
        oldTitle,
        timer
      };
    }

    function removeTitleGuard() {
      if (!__mciTitleGuard) return;
      clearInterval(__mciTitleGuard.timer);
      document.title = __mciTitleGuard.oldTitle;
      __mciTitleGuard = null;
    }

    function applyPrintFreeze() {
      if (__mciPrintState) return; // already frozen

      const html = document.documentElement;
      const body = document.body;
      const strokeEl = document.getElementById(ID_STROKE);
      const ds = docSize();

      __mciPrintState = {
        wrapDisplay: wrap ? wrap.style.display : "",
        panelDisplay: panel ? panel.style.display : "",
        htmlWidth: html.style.width,
        htmlHeight: html.style.height,
        bodyWidth: body ? body.style.width : "",
        bodyHeight: body ? body.style.height : "",
        bodyMargin: body ? body.style.margin : "",
        bodyPadding: body ? body.style.padding : "",
        bodyOverflow: body ? body.style.overflow : "",
        strokeDisplay: strokeEl ? strokeEl.style.display : ""
      };

      // title (for filename) + guard
      applyTitleGuard();

      // Hard-hide UI (beats stubborn fixed elements / print quirks)
      if (panel) panel.style.display = "none";
      if (wrap) wrap.style.display = "none";

      // Hide stroke preview
      if (strokeEl) strokeEl.style.display = "none";

      // Freeze layout to exact doc pixels (matches ensurePrintStyle)
      html.style.width = ds.w + "px";
      html.style.height = ds.h + "px";
      if (body) {
        body.style.width = ds.w + "px";
        body.style.height = ds.h + "px";
        body.style.margin = "0";
        body.style.padding = "0";
        body.style.overflow = "visible";
      }
    }

    function removePrintFreeze() {
      if (!__mciPrintState) return;

      const html = document.documentElement;
      const body = document.body;
      const strokeEl = document.getElementById(ID_STROKE);

      if (wrap) wrap.style.display = __mciPrintState.wrapDisplay;
      if (panel) panel.style.display = __mciPrintState.panelDisplay;

      html.style.width = __mciPrintState.htmlWidth;
      html.style.height = __mciPrintState.htmlHeight;

      if (body) {
        body.style.width = __mciPrintState.bodyWidth;
        body.style.height = __mciPrintState.bodyHeight;
        body.style.margin = __mciPrintState.bodyMargin;
        body.style.padding = __mciPrintState.bodyPadding;
        body.style.overflow = __mciPrintState.bodyOverflow;
      }

      if (strokeEl) strokeEl.style.display = __mciPrintState.strokeDisplay;

      __mciPrintState = null;

      // restore title after we restore layout
      removeTitleGuard();
    }

    function doPrint() {
      ensurePrintStyle();
      applyPrintFreeze();

      // Let the browser apply styles/title before opening print UI
      setTimeout(() => window.print(), 50);

      // Fallback restore if afterprint doesn't fire
      setTimeout(() => {
        removePrintFreeze();
      }, 2500);
    }

    // Use beforeprint/afterprint for best reliability
    window.addEventListener("beforeprint", () => {
      ensurePrintStyle();
      applyPrintFreeze();
    }, true);

    window.addEventListener("afterprint", () => {
      removePrintFreeze();
    }, true);

    if (btnPrint) btnPrint.onclick = doPrint;

    // ===== /PRINT =====


    // (keep the rest of your wiring the same)
    wrap.querySelector("#__mci_close__").onclick = cleanup;

    colorEl = wrap.querySelector("#__mci_color__");
    alphaSlider = wrap.querySelector("#__mci_alpha__");
    sizeSlider = wrap.querySelector("#__mci_size__");
    hlColorEl = wrap.querySelector("#__mci_hl_color__");
    hlAlphaEl = wrap.querySelector("#__mci_hl_alpha__");

    colorEl.oninput = () => {
      color = colorEl.value;
    };
    alphaSlider.oninput = () => {
      alphaDraw = clamp(+alphaSlider.value / 100, 0.05, 1);
    };
    sizeSlider.oninput = () => {
      const m = activeMode();
      const modeFor = (m === "idle" || m === "pin") ? "draw" : m;
      setToolSize(modeFor, +sizeSlider.value);
      updateCursorCSS();
      setCursorMode();
      setSizeUI();
    };

    hlColorEl.oninput = () => {
      colorHL = hlColorEl.value;
    };
    hlAlphaEl.oninput = () => {
      alphaHL = clamp(+hlAlphaEl.value / 100, 0.05, 1);
    };

    wrap.querySelector("#__mci_clear__").onclick = () => {
      actions.length = 0;
      redo.length = 0;
      pinCount = 0;
      redrawAll(true);
    };
    wrap.querySelector("#__mci_help__").onclick = () => {
      tip.style.display = (tip.style.display === "none" ? "block" : "none");
    };

    setModeUI();
    redrawAll(true);
    growIfNeeded();
  }

  PAGE_WINDOW.runMciDrawTool = runMciDrawTool;
  window.runMciDrawTool = runMciDrawTool;

  window.addEventListener("mci:draw-tool-toggle", function () {
    try {
      runMciDrawTool();
    } catch (err) {
      console.error("[MCI Draw Tool] launch failed:", err);
    }
  });
})();