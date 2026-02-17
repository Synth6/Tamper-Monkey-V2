// ==UserScript==
// @name         NCJUA - Downloader (MCI)
// @namespace    mci-tools
// @version      3.2.0
// @description  NCJUA downloader (new Guidewire). Triggered only by Master Menu. No observers. Correct naming + de-dupe + sub-item handling.
// @match        https://insure.ncjuanciua.org/*
// @exclude      https://insure.ncjuanciua.org/innovation?rq=STFile*
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_download
// @connect      insure.ncjuanciua.org
// ==/UserScript==

(function () {
  'use strict';

  var UI_ID = 'mci-ncjua-dl';
  var stopFlag = false;
  var downloading = false;

  // default behavior: when a parent Select_ row is checked, include all Item_ children under it
  var includeChildrenWhenParentChecked = true;

  window.addEventListener('message', function (ev) {
    try {
      var data = ev && ev.data;
      if (!data || data.__mci !== 'run-file-downloader') return;
      var detail = data.detail || {};
      if ((detail.tool || '').toLowerCase() !== 'ncjua') return;

      if (document.getElementById(UI_ID)) teardown();
      else mountUI();
    } catch (e) {}
  }, false);

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel) || []); }

  function sanitize(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[\\\/:*?"<>|]+/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s || 'Document';
  }

  function parseDate(raw) {
    raw = String(raw || '').trim();
    var m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return sanitize(raw).replace(/\s+/g, '-');
    var mm = (m[1].length === 1 ? '0' + m[1] : m[1]);
    var dd = (m[2].length === 1 ? '0' + m[2] : m[2]);
    var yy = m[3];
    return mm + '-' + dd + '-' + yy;
  }

  function absolutize(href) {
    if (!href) return null;
    if (/^https?:\/\//i.test(href)) return href;
    if (href.charAt(0) === '/') return location.origin + href;
    return location.origin + '/' + href;
  }

  function getPolicyNumber() {
    var re = /\b(DW\d{6,12}-\d{2})\b/i;
    var itemsArea = null;

    var nodes = qsa('div,span');
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').trim() === 'Items') {
        itemsArea = nodes[i].closest('div');
        break;
      }
    }
    if (itemsArea) {
      var m = (itemsArea.innerText || '').match(re);
      if (m) return m[1].toUpperCase();
    }

    var els = qsa('span,a,td,th,div');
    for (i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim();
      if (!t || t.length > 80) continue;
      var mm = t.match(re);
      if (mm) return mm[1].toUpperCase();
    }
    return 'UNKNOWN_POLICY';
  }

  function extractSTFileHref(tr) {
    function pickBestAnchor(list) {
      for (var i = 0; i < list.length; i++) {
        var txt = (list[i].textContent || '').trim().toLowerCase();
        if (txt && txt !== 'click to open') return list[i].getAttribute('href');
      }
      return list[list.length - 1].getAttribute('href');
    }

    var as = qsa('a[href*="innovation?rq=STFile"]', tr);
    if (as.length) return pickBestAnchor(as);

    var clickers = qsa('[onclick*="innovation?rq="]', tr);
    for (var i = 0; i < clickers.length; i++) {
      var oc = clickers[i].getAttribute('onclick') || '';
      var m = oc.match(/['"]([^'"]*innovation\?rq=STFile[^'"]*)['"]/i);
      if (m && m[1]) return m[1];
    }

    var html = tr.innerHTML || '';

    // Grab a full STThumbnail URL if present
    var m2 = html.match(/innovation\?rq=STThumbnail[^"']*/i);
    if (m2 && m2[0]) {
      var thumb = m2[0].replace(/&amp;/g, '&');

      var fn = (thumb.match(/[?&]Filename=([^&]+)/i) || [])[1];
      var rq = (thumb.match(/[?&]RqId=([^&]+)/i) || [])[1];
      var sec = (thumb.match(/[?&]SecurityId=([^&]+)/i) || [])[1];

      if (fn && rq && sec) {
        return 'innovation?rq=STFile&Filename=' + fn + '&RqId=' + rq + '&SecurityId=' + sec;
      }
    }

    return null;
  }

  function extractDocName(tr) {
    // best effort: the blue name link text (NOT "Click to Open")
    var as = qsa('a[href*="innovation?rq=STFile"]', tr);
    for (var i = 0; i < as.length; i++) {
      var txt = (as[i].textContent || '').trim();
      if (txt && txt.toLowerCase() !== 'click to open') return txt;
    }

    // fallback: any <a> with non-empty text
    var a2 = qsa('a', tr);
    for (i = 0; i < a2.length; i++) {
      var t = (a2[i].textContent || '').trim();
      if (t && t.toLowerCase() !== 'click to open') return t;
    }

    // fallback: hidden ItemDescription_... input in same row
    var hid = qs('input[type="hidden"][id^="ItemDescription_"]', tr);
    if (hid && hid.value) return hid.value;

    return 'Document';
  }

  function extractRowDate(tr) {
    // date is usually last TD, with title having full datetime
    var tds = qsa('td', tr);
    if (!tds.length) return '';
    var cell = tds[tds.length - 1];
    return ((cell.getAttribute('title') || cell.textContent || '').trim());
  }

  function getPolicyFileTables() {
    // This avoids scanning the whole page and avoids the 147 “rows”
    return qsa('table[id^="rowItemContainer"].format');
  }

  // Build entries in DOM order so parent date can flow to children.
  // FIX: include STFile rows even if they have NO checkbox (photos often behave this way)
  function getEntries() {
    var tables = getPolicyFileTables();
    var entries = [];
    var seen = new Set(); // dedupe by absolute url

    for (var t = 0; t < tables.length; t++) {
      var trs = qsa('tr', tables[t]);

      var currentParent = null; // { checked, dateRaw }
      var parentDateRaw = '';

      for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];

        // Detect STFile url first (some rows have no checkbox)
        var href = extractSTFileHref(tr);
        var absUrl = href ? absolutize(href) : null;

        // Detect checkbox if present
        var cb = qs('input[type="checkbox"]', tr);
        var cbId = cb ? (cb.id || '') : '';

        var isParent = cbId.indexOf('Select_') === 0;
        var isChild  = cbId.indexOf('Item_') === 0;

        // Update parent context on parent row (even if it doesn't have STFile)
        if (isParent) {
          parentDateRaw = extractRowDate(tr) || parentDateRaw;
          currentParent = {
            checked: !!cb.checked,
            dateRaw: parentDateRaw
          };
        }

        // If this TR doesn't represent a file, skip it
        if (!absUrl) continue;

        // Inherit date for child / expanded rows (often blank)
        var dateRaw = extractRowDate(tr);
        if (!dateRaw && currentParent && currentParent.dateRaw) dateRaw = currentParent.dateRaw;

        var name = extractDocName(tr);

        // Selected logic:
        // - if checkbox exists, it's selected when checked
        // - if NO checkbox exists (photos), select it when parent is checked AND toggle is ON
        var selected = false;

        if (cb) {
          selected = !!cb.checked;

          // If parent checked and toggle on, include child checkbox rows even if unchecked
          if (!selected && includeChildrenWhenParentChecked && isChild && currentParent && currentParent.checked) {
            selected = true;
          }
        } else {
          // No checkbox row (photos / weird attachments)
          if (includeChildrenWhenParentChecked && currentParent && currentParent.checked) {
            selected = true;
          }
        }

        // De-dupe by URL (prevents icon + name + thumbnail duplicates)
        if (seen.has(absUrl)) continue;
        seen.add(absUrl);

        entries.push({
          url: absUrl,
          name: name,
          dateRaw: dateRaw,
          checkbox: cb || null,
          selected: selected
        });
      }
    }

    return entries;
  }

  function buildFilename(policy, docName, dateRaw) {
    return sanitize(policy) + ' - ' + sanitize(docName) + ' - ' + parseDate(dateRaw) + '.pdf';
  }

  function mountUI() {
    GM_addStyle(`
      #${UI_ID}{
        position:fixed;
        top:18px;
        left:18px;
        z-index:999999;
        width: 225px;
        background:#1f232a;
        color:#fff;
        border-radius:10px;
        box-shadow:0 10px 25px rgba(0,0,0,.45);
        overflow:hidden;
        font:13px/1.3 Arial, sans-serif;
      }

      #${UI_ID} .hdr{
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:0px 6px;
        cursor:move;
        background:linear-gradient(90deg,#0b5cab,#0a3e73);
        font-weight:bold;
      }

      #${UI_ID} .hdr .x{
        background:#d32f2f;
        border:none;
        color:#fff;
        cursor:pointer;
        border-radius:6px;
        padding:2px 10px;
        font-weight:bold;
        line-height:18px;
        width:auto;                 /* key change */
        min-width:34px;
        flex:0 0 auto;              /* prevents stretch */
      }

      #${UI_ID} .body{
        padding:10px;
      }

      #${UI_ID} button{
        width:100%;
        margin:6px 0;
        padding:7px;                /* slightly tighter */
        background:#2b313b;
        color:#fff;
        border:1px solid rgba(255,255,255,.15);
        border-radius:8px;
        cursor:pointer;
        font-weight:bold;
      }

      #${UI_ID} button:hover{
        filter:brightness(1.15);
      }

      #${UI_ID} .stat{
        margin-top:8px;
        padding:8px;
        border-radius:8px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.10);
        font-size:12px;
        white-space:normal;
        word-break:break-word;
      }

      #${UI_ID} .row{
        display:flex;
        gap:6px;
        align-items:flex-start;
        margin:8px 0 4px;
      }

      #${UI_ID} label{
        cursor:pointer;
        user-select:none;
        font-size:12px;
      }

      #${UI_ID} .muted{
        opacity:.75;
      }
    `);

    var box = document.createElement('div');
    box.id = UI_ID;

    var hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.innerHTML = '<div><span style="opacity:.9;">MCI</span> <span style="opacity:.75;">|</span> NCJUA Downloader</div>';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'x';
    closeBtn.textContent = 'X';
    closeBtn.onclick = teardown;
    hdr.appendChild(closeBtn);

    var body = document.createElement('div');
    body.className = 'body';

    var stat = document.createElement('div');
    stat.className = 'stat';

    var toggleRow = document.createElement('div');
    toggleRow.className = 'row';

    var chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = includeChildrenWhenParentChecked;
    chk.id = 'mci_nc_include_children';
    chk.onchange = function () {
      includeChildrenWhenParentChecked = !!chk.checked;
      updateStat();
    };

    var lbl = document.createElement('label');
    lbl.htmlFor = chk.id;
    lbl.innerHTML = 'Include sub-items when parent checked <span class="muted">(recommended)</span>';

    toggleRow.appendChild(chk);
    toggleRow.appendChild(lbl);

    function updateStat(extraHtml) {
      var policy = getPolicyNumber();
      var all = getEntries();
      var sel = [];
      for (var i = 0; i < all.length; i++) if (all[i].selected) sel.push(all[i]);

      stat.innerHTML =
        '<div><b>Policy:</b> ' + policy + '</div>' +
        '<div class="muted" style="margin-top:4px;">Files found: <b>' + all.length + '</b> | To download: <b>' + sel.length + '</b></div>' +
        (extraHtml ? '<div style="margin-top:6px;">' + extraHtml + '</div>' : '');
    }

    function downloadList(list) {
      if (downloading) return;
      stopFlag = false;

      var policy = getPolicyNumber();
      if (!list || !list.length) {
        updateStat('<span style="color:#ffcc80;"><b>No files selected.</b></span>');
        return;
      }

      downloading = true;
      var i = 0;

      function next() {
        if (!document.getElementById(UI_ID)) { downloading = false; return; }
        if (stopFlag || i >= list.length) {
          downloading = false;
          updateStat(stopFlag ? '<span style="color:#ffcc80;"><b>Stopped.</b></span>' : '<span style="color:#a5d6a7;"><b>Done.</b></span>');
          return;
        }

        var r = list[i++];
        var filename = buildFilename(policy, r.name, r.dateRaw);

        stat.innerHTML =
          '<div><b>Policy:</b> ' + policy + '</div>' +
          '<div style="margin-top:6px;">Downloading <b>' + i + '</b> / <b>' + list.length + '</b></div>' +
          '<div class="muted" style="margin-top:4px;">' + sanitize(r.name) + '</div>';

        GM_download({
          url: r.url,
          name: filename,
          saveAs: false,
          onerror: function (e) { console.log('NCJUA download error:', e); }
        });

        setTimeout(next, 1200);
      }

      next();
    }

    function btn(label, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.onclick = fn;
      return b;
    }

    body.appendChild(btn('Download Selected', function () {
      var all = getEntries();
      var list = [];
      for (var i = 0; i < all.length; i++) if (all[i].selected) list.push(all[i]);
      downloadList(list);
    }));

    body.appendChild(btn('Download All Visible', function () {
      // All visible *files* (even if unchecked)
      var all = getEntries();
      downloadList(all);
    }));

    body.appendChild(btn('Refresh Count', function () { updateStat(); }));

    body.appendChild(btn('Stop', function () {
      stopFlag = true;
      updateStat('<span style="color:#ffcc80;"><b>Stopping…</b></span>');
    }));

    body.appendChild(toggleRow);
    body.appendChild(stat);

    box.appendChild(hdr);
    box.appendChild(body);
    document.body.appendChild(box);

    updateStat();
    enableDrag(hdr, box);
  }

  function teardown() {
    stopFlag = true;
    downloading = false;
    var box = document.getElementById(UI_ID);
    if (box) box.remove();
  }

  function enableDrag(handle, target) {
    var dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', function (e) {
      dragging = true;
      var r = target.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
      e.preventDefault();
    });
    function move(e) {
      if (!dragging) return;
      target.style.left = (e.clientX - ox) + 'px';
      target.style.top = (e.clientY - oy) + 'px';
      target.style.right = 'auto';
      target.style.bottom = 'auto';
    }
    function up() {
      dragging = false;
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
    }
  }
})();