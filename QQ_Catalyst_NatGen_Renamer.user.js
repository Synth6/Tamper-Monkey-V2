// ==UserScript==
// @name         MCI - QQ Catalyst NatGen File Renamer
// @namespace    https://middlecreekins.com/
// @version      1.0.6
// @description  Rename selected NatGen carrier-download files on the QQ Catalyst Files tab using MCI's readable naming rules.
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ_Catalyst_NatGen_Renamer.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ_Catalyst_NatGen_Renamer.user.js
// @match        https://app.qqcatalyst.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_ID = 'mci-natgen-qq-renamer';
    const SAVE_URL = '/FileUpload/SaveMetadata';

    // Keep these in sync with Customer Search -> dropboxes.py -> NATGEN_TYPE_MAP.
    const NATGEN_TYPE_MAP = {
        ENDORSEMENT: 'Endorsement',
        RENEWAL: 'Renewal',
        NEWBUSINESS: 'New Business',
        NEW_BUSINESS: 'New Business',
        CANCEL_PENDING: 'Pending Notice',
        CANCELPENDING: 'Pending Notice',
        PENDING_NOTICE: 'Pending Notice',
        CANCELLATION: 'Cancellation',
        CANCELLED: 'Cancellation',
        CANCELED: 'Cancellation',
        REINSTATEMENT: 'Reinstatement',
        NONRENEWAL: 'Non-Renewal',
        NON_RENEWAL: 'Non-Renewal',
        DECLARATION: 'Declaration',
        DECLARATIONS: 'Declarations',
        DECPAGE: 'Declarations',
        POLICY: 'Policy',
        NOTICE: 'Notice'
    };

    function cleanNatGenType(rawType) {
        const raw = String(rawType || '').replace(/^[_\-\s]+|[_\-\s]+$/g, '').toUpperCase();
        if (Object.prototype.hasOwnProperty.call(NATGEN_TYPE_MAP, raw)) {
            return NATGEN_TYPE_MAP[raw];
        }
        return raw
            .replace(/[_-]+/g, ' ')
            .trim()
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function removeInvalidFilenameChars(value) {
        return String(value || '').replace(/[<>:"/\\|?*]/g, '');
    }

    function parseNatGenName(fileName) {
        const name = String(fileName || '').trim();
        if (!name || !/^pol\d+/i.test(name)) return null;

        const policyMatch = name.match(/pol(?<policy>\d+)/i);
        const dateMatch = name.match(/(?:tdt|td)(?<date>\d{8})/i);
        let typeMatch = name.match(/(?:Entr|trn)(?<type>.*?)(?:tdt|td)\d{8}/i);
        if (!typeMatch) {
            typeMatch = name.match(/itm(?<type>.*?)(?:tdt|td)\d{8}/i);
        }

        if (!policyMatch || !dateMatch || !typeMatch) return null;

        const ds = dateMatch.groups.date;
        const year = Number(ds.slice(0, 4));
        const month = Number(ds.slice(4, 6));
        const day = Number(ds.slice(6, 8));
        const testDate = new Date(year, month - 1, day);
        if (
            testDate.getFullYear() !== year ||
            testDate.getMonth() !== month - 1 ||
            testDate.getDate() !== day
        ) {
            return null;
        }

        const documentType = removeInvalidFilenameChars(cleanNatGenType(typeMatch.groups.type));
        if (!documentType) return null;

        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const newName = `${policyMatch.groups.policy} - ${documentType} - ${mm}-${dd}-${year}.pdf`;

        return {
            policy: policyMatch.groups.policy,
            documentType,
            date: `${mm}-${dd}-${year}`,
            newName
        };
    }

    function getFileManager() {
        return document.querySelector('#FileManager #DocumentsImagesSection') ||
               document.querySelector('#DocumentsImagesSection');
    }

    function getRows() {
        const manager = getFileManager();
        if (!manager) return [];
        return Array.from(manager.querySelectorAll('.documentsImagesList .AcordItemRow, .AcordItemRow'))
            .filter(row => row.querySelector('input[name="MultiSelectRow"]'));
    }

    function getRowTitle(row) {
        const el = row.querySelector('.FileName');
        return (el?.getAttribute('title') || el?.textContent || '').trim();
    }

    function getSelectedRows() {
        return getRows().filter(row => {
            const cb = row.querySelector('input[name="MultiSelectRow"]');
            return cb && cb.checked;
        });
    }

    function normalizeKey(name) {
        return String(name || '').trim().toLowerCase();
    }

    function nextUniqueName(baseName, usedNames) {
        if (!usedNames.has(normalizeKey(baseName))) {
            usedNames.add(normalizeKey(baseName));
            return baseName;
        }

        const dot = baseName.toLowerCase().endsWith('.pdf') ? baseName.length - 4 : baseName.length;
        const stem = baseName.slice(0, dot);
        const ext = baseName.slice(dot) || '.pdf';
        let n = 2;
        let candidate;
        do {
            candidate = `${stem} (${n})${ext}`;
            n += 1;
        } while (usedNames.has(normalizeKey(candidate)));

        usedNames.add(normalizeKey(candidate));
        return candidate;
    }

    function buildRenamePlan(rows) {
        const selectedSet = new Set(rows);
        const usedNames = new Set(
            getRows()
                .filter(row => !selectedSet.has(row))
                .map(getRowTitle)
                .filter(Boolean)
                .map(normalizeKey)
        );

        return rows.map(row => {
            const oldName = getRowTitle(row);
            const parsed = parseNatGenName(oldName);
            const fileInfoId = Number(row.dataset.blobid || 0);

            if (!fileInfoId) {
                return { row, oldName, status: 'skip', reason: 'QQ file ID not found.' };
            }
            if (!parsed) {
                return { row, oldName, status: 'skip', reason: 'Not a recognized NatGen filename.' };
            }

            const newName = nextUniqueName(parsed.newName, usedNames);
            if (normalizeKey(oldName) === normalizeKey(newName)) {
                return { row, oldName, newName, status: 'skip', reason: 'Already readable.' };
            }

            return {
                row,
                fileInfoId,
                oldName,
                newName,
                status: 'ready',
                tagList: row.dataset.taglist || '',
                folderId: row.dataset.folderid ? Number(row.dataset.folderid) : null,
                folderName: ''
            };
        });
    }

    function injectStyles() {
        if (document.getElementById(`${SCRIPT_ID}-style`)) return;
        const style = document.createElement('style');
        style.id = `${SCRIPT_ID}-style`;
        style.textContent = `
            /* Keep the renamer out of QQ's native toolbar entirely.
               Place it directly before QQ's "Files" heading instead. */
            #mci-natgen-rename-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 18px !important;
                height: 18px !important;
                margin-right: 5px !important;
                vertical-align: -1px !important;
                cursor: pointer !important;
                color: #4f9f35 !important;
                border-radius: 3px !important;
            }
            #mci-natgen-rename-btn .mci-pencil {
                font-size: 14px !important;
                line-height: 14px !important;
                color: inherit !important;
                pointer-events: none !important;
            }
            #mci-natgen-rename-btn:hover:not(.mci-disabled) {
                color: #72bf44 !important;
                background: rgba(114, 191, 68, .10) !important;
            }
            #mci-natgen-rename-btn.mci-disabled {
                opacity: .38 !important;
                cursor: default !important;
            }

            #mci-natgen-overlay {
                position: fixed; inset: 0; z-index: 2147483646;
                background: rgba(0,0,0,.50);
                display: flex; align-items: center; justify-content: center;
                font-family: Arial, sans-serif;
            }
            #mci-natgen-dialog {
                width: min(780px, calc(100vw - 50px));
                max-height: min(650px, calc(100vh - 50px));
                background: #f4f4f4;
                border-radius: 8px;
                box-shadow: 0 12px 38px rgba(0,0,0,.42);
                overflow: hidden;
                color: #444;
            }
            #mci-natgen-dialog .hdr {
                background: #72bf44;
                color: #fff;
                padding: 10px 14px;
                font-size: 15px;
                font-weight: bold;
                display:flex; align-items:center; justify-content:space-between;
            }
            #mci-natgen-dialog .x {
                border:0; background:transparent; color:#fff;
                font-size:22px; line-height:1; cursor:pointer; padding:0 2px;
            }
            #mci-natgen-dialog .body {
                padding: 14px;
                overflow: auto;
                max-height: calc(min(650px, 100vh - 50px) - 116px);
            }
            #mci-natgen-dialog .summary {
                margin-bottom: 10px;
                font-size: 12px;
            }
            #mci-natgen-dialog .item {
                background: #fff;
                border: 1px solid #d6d6d6;
                border-radius: 4px;
                padding: 9px 10px;
                margin-bottom: 8px;
                font-size: 12px;
            }
            #mci-natgen-dialog .old {
                color: #777;
                word-break: break-all;
            }
            #mci-natgen-dialog .arrow {
                color: #72bf44;
                font-weight: bold;
                margin: 5px 0;
            }
            #mci-natgen-dialog .new {
                color: #222;
                font-weight: bold;
                word-break: break-all;
            }
            #mci-natgen-dialog .skip {
                color: #9a6b00;
                font-size: 11px;
                margin-top: 4px;
            }
            #mci-natgen-dialog .foot {
                padding: 10px 14px;
                background: #ededed;
                border-top: 1px solid #d5d5d5;
                display:flex; justify-content:flex-end; gap:8px;
            }
            #mci-natgen-dialog .btn {
                border: 1px solid #999;
                border-radius: 3px;
                background: #fff;
                color: #444;
                padding: 6px 13px;
                cursor: pointer;
                font-size: 12px;
            }
            #mci-natgen-dialog .btn.primary {
                background: #72bf44;
                border-color: #66ad3c;
                color: #fff;
                font-weight: bold;
            }
            #mci-natgen-dialog .btn:disabled { opacity:.5; cursor:default; }

            .mci-natgen-toast {
                position: fixed; z-index: 2147483647;
                left: 50%; top: 18px; transform: translateX(-50%);
                padding: 9px 14px; border-radius: 6px;
                background: #222; color:#fff;
                box-shadow: 0 5px 18px rgba(0,0,0,.32);
                font: 600 12px/1.35 Arial,sans-serif;
                max-width: 650px;
            }
            .mci-natgen-toast.ok { background:#2e7d32; }
            .mci-natgen-toast.err { background:#a83232; }
        `;
        document.head.appendChild(style);
    }

    function toast(message, kind = '') {
        document.querySelectorAll('.mci-natgen-toast').forEach(el => el.remove());
        const el = document.createElement('div');
        el.className = `mci-natgen-toast ${kind}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4200);
    }

    function closeDialog() {
        document.getElementById('mci-natgen-overlay')?.remove();
    }

    function showPreview(plan) {
        closeDialog();
        const ready = plan.filter(x => x.status === 'ready');
        const skipped = plan.filter(x => x.status !== 'ready');

        const overlay = document.createElement('div');
        overlay.id = 'mci-natgen-overlay';
        overlay.innerHTML = `
            <div id="mci-natgen-dialog" role="dialog" aria-modal="true" aria-label="Rename NatGen Files">
                <div class="hdr">
                    <span>Rename NatGen Files</span>
                    <button type="button" class="x" title="Close">×</button>
                </div>
                <div class="body">
                    <div class="summary">
                        ${ready.length} file${ready.length === 1 ? '' : 's'} ready to rename${skipped.length ? ` · ${skipped.length} skipped` : ''}.
                    </div>
                    <div class="items"></div>
                </div>
                <div class="foot">
                    <button type="button" class="btn cancel">Cancel</button>
                    <button type="button" class="btn primary rename" ${ready.length ? '' : 'disabled'}>Rename Selected</button>
                </div>
            </div>
        `;

        const items = overlay.querySelector('.items');
        plan.forEach(item => {
            const box = document.createElement('div');
            box.className = 'item';
            const old = document.createElement('div');
            old.className = 'old';
            old.textContent = item.oldName || '(unknown file)';
            box.appendChild(old);

            if (item.status === 'ready') {
                const arrow = document.createElement('div');
                arrow.className = 'arrow';
                arrow.textContent = '↓';
                box.appendChild(arrow);
                const nn = document.createElement('div');
                nn.className = 'new';
                nn.textContent = item.newName;
                box.appendChild(nn);
            } else {
                const skip = document.createElement('div');
                skip.className = 'skip';
                skip.textContent = `Skipped: ${item.reason}`;
                box.appendChild(skip);
            }
            items.appendChild(box);
        });

        overlay.querySelector('.x').addEventListener('click', closeDialog);
        overlay.querySelector('.cancel').addEventListener('click', closeDialog);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeDialog();
        });
        overlay.querySelector('.rename').addEventListener('click', () => runRename(plan, overlay));

        document.body.appendChild(overlay);
    }

    async function saveMetadata(item) {
        // QQ's own SaveMetadata request includes these metadata fields.  The NatGen
        // carrier-download rows normally have no description/tags/folder; tags and
        // folder ID are still preserved from the row when present.
        const payload = [{
            FileInfoId: item.fileInfoId,
            Title: item.newName,
            Description: '',
            TagList: item.tagList || '',
            FolderId: item.folderId,
            FolderName: item.folderName || ''
        }];

        const response = await fetch(SAVE_URL, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`QQ returned HTTP ${response.status}`);
        }

        const text = await response.text();
        if (text) {
            try {
                const data = JSON.parse(text);
                if (data && (data.Success === false || data.success === false || data.ErrorMessage || data.error)) {
                    throw new Error(data.ErrorMessage || data.error || 'QQ reported that the rename failed.');
                }
            } catch (err) {
                if (err instanceof SyntaxError) {
                    // Some QQ endpoints return an empty/non-JSON success body.
                } else {
                    throw err;
                }
            }
        }
    }

    function updateRowAfterRename(item) {
        const nameEl = item.row.querySelector('.FileName');
        if (nameEl) {
            nameEl.textContent = item.newName;
            nameEl.setAttribute('title', item.newName);
        }

        // Keep hidden grid/carousel views in sync if QQ does not redraw immediately.
        const id = String(item.fileInfoId);
        document.querySelectorAll(`[data-blobid="${CSS.escape(id)}"]`).forEach(el => {
            if (el.matches('img')) {
                el.setAttribute('alt', item.newName);
                const span = el.parentElement?.querySelector('span');
                if (span) span.textContent = item.newName;
            }
        });
    }

    async function runRename(plan, overlay) {
        const ready = plan.filter(x => x.status === 'ready');
        if (!ready.length) return;

        const renameBtn = overlay.querySelector('.rename');
        const cancelBtn = overlay.querySelector('.cancel');
        renameBtn.disabled = true;
        cancelBtn.disabled = true;
        renameBtn.textContent = 'Renaming…';

        let renamed = 0;
        const errors = [];

        for (const item of ready) {
            try {
                await saveMetadata(item);
                updateRowAfterRename(item);
                renamed += 1;
            } catch (err) {
                errors.push(`${item.oldName}: ${err?.message || err}`);
            }
        }

        closeDialog();
        refreshButtonState();

        if (errors.length) {
            toast(`Renamed ${renamed}. ${errors.length} failed. Refresh the page before retrying.`, 'err');
            console.error('[MCI NatGen Renamer] Rename errors:', errors);
        } else {
            toast(`Renamed ${renamed} NatGen file${renamed === 1 ? '' : 's'}.`, 'ok');
            // Let QQ refresh its own file list so every view/context menu has the new title.
            setTimeout(() => window.location.reload(), 650);
        }
    }

    function refreshButtonState() {
        const btn = document.getElementById('mci-natgen-rename-btn');
        if (!btn) return;
        const selected = getSelectedRows();
        const disabled = selected.length === 0;
        btn.classList.toggle('mci-disabled', disabled);
        btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        btn.title = selected.length
            ? `Rename selected NatGen file${selected.length === 1 ? '' : 's'}`
            : 'Select one or more files, then rename NatGen files';
    }

    function onRenameClick() {
        const rows = getSelectedRows();
        if (!rows.length) {
            toast('Select one or more files first.');
            return;
        }
        showPreview(buildRenamePlan(rows));
    }

    function findFilesHeading() {
        const manager = getFileManager();
        if (!manager) return null;

        // QQ's visible Files heading immediately above the toolbar.
        return manager.querySelector('form#DocumentsImagesList > h2');
    }

    function injectButton() {
        if (document.getElementById('mci-natgen-rename-btn')) {
            refreshButtonState();
            return true;
        }

        const heading = findFilesHeading();
        if (!heading) return false;

        const btn = document.createElement('span');
        btn.id = 'mci-natgen-rename-btn';
        btn.className = 'mci-disabled';
        btn.title = 'Select one or more files, then rename NatGen files';
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');
        btn.setAttribute('aria-label', 'Rename selected NatGen files');
        btn.setAttribute('aria-disabled', 'true');
        btn.innerHTML = '<i class="fa fa-pencil mci-pencil" aria-hidden="true"></i>';

        const activateRename = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (btn.classList.contains('mci-disabled')) return;
            onRenameClick();
        };

        btn.addEventListener('click', activateRename);
        btn.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activateRename(event);
        });

        // Put the pencil directly BEFORE the word "Files".
        heading.insertBefore(btn, heading.firstChild);
        refreshButtonState();
        return true;
    }

    function bindSelectionWatcher() {
        if (document.documentElement.dataset.mciNatgenSelectionBound === '1') return;
        document.documentElement.dataset.mciNatgenSelectionBound = '1';
        document.addEventListener('change', e => {
            if (e.target && e.target.matches('#FileManager input[name="MultiSelectRow"], #DocumentsImagesSection input[name="MultiSelectRow"]')) {
                refreshButtonState();
            }
        }, true);
    }

    function initialize() {
        injectStyles();
        bindSelectionWatcher();
        injectButton();
    }

    initialize();

    // QQ loads tabs/file lists dynamically. Watch for the Files tab to appear/redraw.
    const observer = new MutationObserver(() => {
        if (getFileManager()) injectButton();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
