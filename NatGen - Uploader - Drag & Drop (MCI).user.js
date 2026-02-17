// ==UserScript==
// @name         NatGen - Uploader - Drag & Drop (MCI)
// @namespace    mci-tools
// @version      1.2.0
// @description  Adds drag-and-drop support to NatGen "Uploader" popup (up to 4 files) + per-file remove + ADD-on-drop.
// @match        https://natgenagency.com/Policy/PolicySummary.aspx
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var POPUP_ID = 'ctl00_MainContent_PolicyTodos_pnlProofUpload';
  var INPUT_ID = 'ctl00_MainContent_PolicyTodos_uProofs';
  var LIST_ID  = 'ulProofUploads';
  var MAX_FILES = 4;

  var styleAdded = false;
  function addStyles() {
    if (styleAdded) return;
    styleAdded = true;

    var css = ''
      + '#' + POPUP_ID + ' .mci-dropwrap{ margin:10px 0 0 0; }'
      + '#' + POPUP_ID + ' .mci-dropzone{'
      + '  border:2px dashed #1e40af; border-radius:10px; padding:14px;'
      + '  text-align:center; font-weight:600; color:#1e40af;'
      + '  background:rgba(30,64,175,0.06);'
      + '}'
      + '#' + POPUP_ID + ' .mci-dropzone.small{ font-weight:500; font-size:12px; color:#334155; border-color:#94a3b8; background:rgba(148,163,184,0.12); }'
      + '#' + POPUP_ID + ' .mci-dropzone.dragover{ background:rgba(30,64,175,0.14); border-color:#0b2e8a; }'
      + '#' + POPUP_ID + ' .mci-row{ display:flex; gap:8px; justify-content:center; margin-top:8px; flex-wrap:wrap; }'
      + '#' + POPUP_ID + ' .mci-miniBtn{ cursor:pointer; padding:6px 10px; border-radius:8px; background:#e2e8f0; color:#0f172a; font-weight:600; user-select:none; }'
      + '#' + POPUP_ID + ' .mci-miniBtn:hover{ background:#cbd5e1; }'
      + '#' + POPUP_ID + ' .mci-hint{ margin-top:6px; font-size:12px; color:#475569; }'
      + '#' + POPUP_ID + ' .mci-filelist{ margin-top:10px; border:1px solid #cbd5e1; border-radius:10px; padding:8px; background:#f8fafc; }'
      + '#' + POPUP_ID + ' .mci-fileitem{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 8px; border-radius:8px; }'
      + '#' + POPUP_ID + ' .mci-fileitem + .mci-fileitem{ border-top:1px dashed #cbd5e1; }'
      + '#' + POPUP_ID + ' .mci-filename{ font-size:12px; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:360px; }'
      + '#' + POPUP_ID + ' .mci-remove{ cursor:pointer; font-weight:900; color:#b91c1c; padding:2px 8px; border-radius:8px; background:#fee2e2; user-select:none; }'
      + '#' + POPUP_ID + ' .mci-remove:hover{ background:#fecaca; }'
      + '#' + POPUP_ID + ' .mci-banner{ margin-top:10px; padding:8px 10px; border-radius:10px; border:1px solid #cbd5e1; background:#f1f5f9; color:#0f172a; font-size:12px; }'
      + '#' + POPUP_ID + ' .mci-banner b{ color:#1e40af; }';

    var s = document.createElement('style');
    s.type = 'text/css';
    s.appendChild(document.createTextNode(css));
    document.head.appendChild(s);
  }

  function q(id) { return document.getElementById(id); }

  function getPopup() {
    var el = q(POPUP_ID);
    if (!el) return null;
    if (el.style && el.style.display === 'none') return null;
    return el;
  }

  function buildDropUI(popup) {
    if (!popup || popup.__mciDropBuilt) return;

    var input = q(INPUT_ID);
    if (!input) return;

    addStyles();

    // Canonical list of currently selected files
    var selectedFiles = [];

    // UI
    var wrap = document.createElement('div');
    wrap.className = 'mci-dropwrap';

    var dz = document.createElement('div');
    dz.className = 'mci-dropzone';
    dz.textContent = 'Drag & drop files here (max ' + MAX_FILES + ')';

    var row = document.createElement('div');
    row.className = 'mci-row';

    var openBtn = document.createElement('div');
    openBtn.className = 'mci-miniBtn';
    openBtn.textContent = 'Choose Files';

    var clearBtn = document.createElement('div');
    clearBtn.className = 'mci-miniBtn';
    clearBtn.textContent = 'Clear';

    row.appendChild(openBtn);
    row.appendChild(clearBtn);

    var hint = document.createElement('div');
    hint.className = 'mci-hint';
    hint.textContent = 'Drop ADDS to the list (until ' + MAX_FILES + '). Nothing uploads until you click Submit.';

    var banner = document.createElement('div');
    banner.className = 'mci-banner';
    banner.innerHTML = 'Ready to upload: <b>0</b> file(s). Files are not uploaded until you click <b>Submit</b>.';

    var fileListBox = document.createElement('div');
    fileListBox.className = 'mci-filelist';
    fileListBox.style.display = 'none';

    wrap.appendChild(dz);
    wrap.appendChild(row);
    wrap.appendChild(hint);
    wrap.appendChild(banner);
    wrap.appendChild(fileListBox);

    // Insert after the instructions paragraph if present
    var pTags = popup.getElementsByTagName('p');
    if (pTags && pTags.length) {
      pTags[pTags.length - 1].insertAdjacentElement('afterend', wrap);
    } else {
      popup.insertBefore(wrap, popup.firstChild);
    }

    function syncInputFromSelected() {
      var dt = new DataTransfer();
      for (var i = 0; i < selectedFiles.length; i++) dt.items.add(selectedFiles[i]);
      input.files = dt.files;

      try {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        if (input.onchange) input.onchange();
      }
    }

    function updateBanner() {
      var b = banner.getElementsByTagName('b');
      if (b && b.length) b[0].textContent = String(selectedFiles.length);
    }

    function renderSelectedList() {
      updateBanner();

      if (selectedFiles.length) {
        dz.classList.add('small');
        dz.textContent = selectedFiles.length + ' selected — drop more to add (max ' + MAX_FILES + ')';
      } else {
        dz.classList.remove('small');
        dz.textContent = 'Drag & drop files here (max ' + MAX_FILES + ')';
      }

      fileListBox.innerHTML = '';
      if (!selectedFiles.length) {
        fileListBox.style.display = 'none';
        return;
      }

      fileListBox.style.display = 'block';

      for (var i = 0; i < selectedFiles.length; i++) {
        (function (idx) {
          var f = selectedFiles[idx];

          var item = document.createElement('div');
          item.className = 'mci-fileitem';

          var name = document.createElement('div');
          name.className = 'mci-filename';
          name.title = f.name;
          name.textContent = f.name;

          var rm = document.createElement('div');
          rm.className = 'mci-remove';
          rm.textContent = 'X';
          rm.title = 'Remove this file';

          rm.addEventListener('click', function () {
            selectedFiles.splice(idx, 1);
            syncInputFromSelected();
            renderSelectedList();

            // If NatGen didn't populate its UL and we did fallback before, keep it consistent
            var ul = q(LIST_ID);
            if (ul && ul.children && ul.children.length > 0) {
              // We won't try to surgically remove; we rebuild fallback UL only if NatGen isn't managing it.
              // If NatGen manages it, its JS should re-render on input change.
            }
          });

          item.appendChild(name);
          item.appendChild(rm);
          fileListBox.appendChild(item);
        })(i);
      }
    }

    function addFilesToSelection(fileList) {
      if (!fileList || !fileList.length) return;

      // Convert to array
      var incoming = [];
      for (var i = 0; i < fileList.length; i++) incoming.push(fileList[i]);

      // If we're already full, block immediately
      if (selectedFiles.length >= MAX_FILES) {
        alert('NatGen allows only ' + MAX_FILES + ' files. Remove one (X) to add another.');
        return;
      }

      // Add until full (ignore extras)
      var space = MAX_FILES - selectedFiles.length;
      if (incoming.length > space) {
        alert('NatGen allows only ' + MAX_FILES + ' files. Adding the first ' + space + ' from your drop.');
        incoming = incoming.slice(0, space);
      }

      // Optional: prevent duplicates by filename+size+lastModified
      for (var j = 0; j < incoming.length; j++) {
        var f = incoming[j];
        var dup = false;
        for (var k = 0; k < selectedFiles.length; k++) {
          var e = selectedFiles[k];
          if (e.name === f.name && e.size === f.size && e.lastModified === f.lastModified) {
            dup = true;
            break;
          }
        }
        if (!dup) selectedFiles.push(f);
      }

      syncInputFromSelected();
      renderSelectedList();

      // Fallback: if NatGen UL is empty, populate it so user sees something
      var ul = q(LIST_ID);
      if (ul && ul.children && ul.children.length === 0) {
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        for (var m = 0; m < selectedFiles.length; m++) {
          var li = document.createElement('li');
          li.textContent = selectedFiles[m].name;
          ul.appendChild(li);
        }
      }
    }

    function setSelectionFromInputFiles() {
      // When user uses native chooser, we treat that as the new truth (replace),
      // because the file picker itself doesn't "add" across sessions reliably.
      var arr = [];
      for (var i = 0; i < input.files.length; i++) arr.push(input.files[i]);

      if (arr.length > MAX_FILES) {
        alert('NatGen allows only ' + MAX_FILES + ' files. Keeping the first ' + MAX_FILES + '.');
        arr = arr.slice(0, MAX_FILES);
      }

      selectedFiles = arr;
      syncInputFromSelected();
      renderSelectedList();
    }

    // Drag events (ADD)
    dz.addEventListener('dragenter', function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover'); });
    dz.addEventListener('dragover',  function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.remove('dragover');

      var files = (e.dataTransfer && e.dataTransfer.files) ? e.dataTransfer.files : null;
      if (!files || !files.length) return;

      addFilesToSelection(files);
    });

    openBtn.addEventListener('click', function () { input.click(); });

    clearBtn.addEventListener('click', function () {
      selectedFiles = [];
      try {
        input.files = new DataTransfer().files;
      } catch (e) {}
      renderSelectedList();

      var ul = q(LIST_ID);
      if (ul) while (ul.firstChild) ul.removeChild(ul.firstChild);
    });

    // Native picker change => replace selection
    input.addEventListener('change', function () {
      if (!input.files) return;
      setSelectionFromInputFiles();
    });

    // Initial state
    renderSelectedList();

    popup.__mciDropBuilt = true;
  }

  function scan() {
    var popup = getPopup();
    if (popup) buildDropUI(popup);
  }

  var mo = new MutationObserver(function () { scan(); });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  setInterval(scan, 800);
  scan();

})();