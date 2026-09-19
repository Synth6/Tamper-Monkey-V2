// ==UserScript==
// @name         QQ Catalyst - Copy Claim
// @namespace    https://middlecreekins.com/
// @version      1.1.0
// @description  Copy the currently open QQ Catalyst claim to the MCI Customer Search clipboard format.
// @match        https://app.qqcatalyst.com/Contacts/Customer/Details/*
// @match        https://app.qqcatalyst.com/Contacts/CommercialCustomer/Details/*
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ%20Catalyst%20-%20Copy%20Claim.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ%20Catalyst%20-%20Copy%20Claim.user.js
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'mci-copy-qq-claim-button';
    const PASTE_BUTTON_ID = 'mci-paste-qq-claim-button';
    const STYLE_ID = 'mci-copy-qq-claim-style';
    const PAYLOAD_SOURCE = 'MCI_QQ_CLAIM';
    const PAYLOAD_VERSION = 1;

    function clean(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function isClaimsTab() {
        return /(?:^|[#&])tabs=Claims(?:&|$)/i.test(location.hash || '');
    }

    function claimsRoot() {
        const root = document.querySelector('#Claims .ClaimsDetailContainer');
        if (!root) {
            return null;
        }

        const claimNumber = root.querySelector('[name="ClaimNumber"]');
        if (!claimNumber) {
            return null;
        }

        return root;
    }

    function controlValue(root, name) {
        const element = root.querySelector(`[name="${CSS.escape(name)}"]`);
        if (!element) {
            return null;
        }

        if (element.matches('select')) {
            const option = element.options[element.selectedIndex];
            return clean(option ? option.textContent : element.value);
        }

        if (element.matches('input[type="checkbox"]')) {
            return Boolean(element.checked);
        }

        return clean(element.value);
    }

    function firstControlValue(root, names) {
        for (const name of names) {
            const value = controlValue(root, name);
            if (value !== null) {
                return value;
            }
        }
        return null;
    }

    function labelCell(root, labelText) {
        const wanted = clean(labelText).toLowerCase();

        for (const label of root.querySelectorAll('label')) {
            if (clean(label.textContent).toLowerCase() !== wanted) {
                continue;
            }

            return (
                label.closest('.tabular-cell') ||
                label.parentElement ||
                null
            );
        }

        return null;
    }

    function valueByLabel(root, labelText) {
        const cell = labelCell(root, labelText);
        if (!cell) {
            return null;
        }

        const control = cell.querySelector(
            'input:not([type="hidden"]), select, textarea'
        );
        if (control) {
            if (control.matches('select')) {
                const option = control.options[control.selectedIndex];
                return clean(option ? option.textContent : control.value);
            }

            if (control.matches('input[type="checkbox"]')) {
                return Boolean(control.checked);
            }

            return clean(control.value);
        }

        const value = cell.querySelector('.value');
        if (value) {
            return clean(value.textContent);
        }

        const labels = Array.from(cell.querySelectorAll('label'));
        const valueLabel = labels.find(
            label => clean(label.textContent).toLowerCase() !== clean(labelText).toLowerCase()
        );
        return valueLabel ? clean(valueLabel.textContent) : null;
    }

    function firstValue(root, names, fallbackLabel = '') {
        const direct = firstControlValue(root, names);
        if (direct !== null) {
            return direct;
        }
        return fallbackLabel ? valueByLabel(root, fallbackLabel) : null;
    }

    function setIfPresent(target, key, value) {
        if (value !== null && value !== undefined) {
            target[key] = value;
        }
    }

    function amountValue(root, name, label) {
        const value = firstValue(root, [name], label);
        if (value === null) {
            return null;
        }
        return clean(String(value).replace(/[$,]/g, ''));
    }

    function associatedPolicy(root) {
        const policyId = clean(
            root.querySelector('[name="PolicyID"]')?.value || ''
        );

        if (!policyId) {
            return {};
        }

        const policyRow = document.querySelector(
            `#PolicyList tr[data-policyid="${CSS.escape(policyId)}"]`
        );
        if (!policyRow) {
            return {};
        }

        const lobDivs = policyRow.querySelectorAll('.PolicyItem.lob div');
        const carrierDivs = policyRow.querySelectorAll('.PolicyItem.carrier div');

        return {
            policy_number: clean(lobDivs[1]?.textContent || ''),
            carrier: clean(carrierDivs[0]?.textContent || ''),
            line_of_business: clean(lobDivs[0]?.textContent || ''),
        };
    }

    function extractClaimInfo(root) {
        const claim = {};
        const policy = associatedPolicy(root);

        setIfPresent(claim, 'claim_number', firstValue(root, ['ClaimNumber'], 'Claim Number'));
        setIfPresent(claim, 'status', firstValue(root, ['ClaimStatusId'], 'Claim Status'));
        setIfPresent(claim, 'claim_type', firstValue(root, ['ClaimTypeId'], 'Claim Type'));
        setIfPresent(claim, 'date_opened', firstValue(root, ['DateOpened'], 'Date Opened'));
        setIfPresent(claim, 'date_of_loss', firstValue(root, ['DateOfLoss'], 'Date Of Loss'));
        setIfPresent(claim, 'date_reported', firstValue(root, ['DateReported'], 'Date Reported'));
        setIfPresent(claim, 'date_closed', firstValue(root, ['DateClosed'], 'Date Closed'));
        setIfPresent(claim, 'coverage', firstValue(root, ['CoverageID'], 'Coverage'));
        setIfPresent(claim, 'created_by', valueByLabel(root, 'Created by'));

        setIfPresent(
            claim,
            'disputed_suit_pending',
            firstValue(root, ['DisputedSuitPending'], 'Disputed Suit Pending')
        );
        setIfPresent(
            claim,
            'chargeable_to_company',
            firstValue(root, ['ChargeableToCompany'], 'Chargeable To Company')
        );

        setIfPresent(claim, 'amount_of_loss', amountValue(root, 'AmountOfLoss', 'Amount Of Loss'));
        setIfPresent(claim, 'amount_salvaged', amountValue(root, 'AmountSalvaged', 'Amount Salvaged'));
        setIfPresent(claim, 'amount_reserved', amountValue(root, 'AmountReserved', 'Amount Reserved'));
        setIfPresent(claim, 'amount_paid', amountValue(root, 'AmountPaid', 'Amount Paid'));

        if (policy.policy_number) {
            claim.policy_number = policy.policy_number;
        }
        if (policy.carrier) {
            claim.carrier = policy.carrier;
        }

        setIfPresent(
            claim,
            'loss_street',
            firstValue(
                root,
                ['Street', 'LossStreet', 'AddressLine1', 'LossAddressLine1'],
                'Street'
            )
        );
        setIfPresent(
            claim,
            'loss_city',
            firstValue(root, ['City', 'LossCity'], 'City')
        );
        setIfPresent(
            claim,
            'loss_state',
            firstValue(
                root,
                ['StateID', 'State', 'LossStateID', 'LossState', 'Province'],
                'State / Province'
            )
        );
        setIfPresent(
            claim,
            'loss_zip',
            firstValue(root, ['Zip', 'ZIP', 'ZipCode', 'LossZip'], 'ZIP Code')
        );
        setIfPresent(
            claim,
            'loss_country',
            firstValue(
                root,
                ['CountryID', 'Country', 'LossCountryID', 'LossCountry'],
                'Country'
            )
        );
        setIfPresent(
            claim,
            'loss_location_description',
            firstValue(
                root,
                [
                    'LossLocationDescription',
                    'LocationDescription',
                    'DescribeLocationOfLoss'
                ],
                'Describe Location Of Loss If Not At A Specific Address'
            )
        );

        setIfPresent(
            claim,
            'incident_description',
            firstValue(root, ['IncidentDescription'], 'Incident Description')
        );

        // QQ exposes a separate Damage Description. The current MCI claim form
        // does not have a separate field, so preserve it in the payload for a
        // future MCI field without mixing it into Incident Description.
        setIfPresent(
            claim,
            'damage_description',
            firstValue(root, ['DamageDescription'], 'Damage Description')
        );

        return {
            claim,
            line_of_business: policy.line_of_business || '',
        };
    }

    function extractVehicle(root) {
        const vehicle = {};

        setIfPresent(vehicle, 'year', firstValue(root, ['Year'], 'Year'));
        setIfPresent(vehicle, 'make', firstValue(root, ['Make'], 'Make'));
        setIfPresent(vehicle, 'model', firstValue(root, ['Model'], 'Model'));
        setIfPresent(vehicle, 'vin', firstValue(root, ['VIN'], 'VIN'));
        setIfPresent(
            vehicle,
            'vehicle_type',
            firstValue(root, ['BodyType'], 'Vehicle Type')
        );

        const hasValue = Object.values(vehicle).some(
            value => clean(value) !== ''
        );
        return hasValue ? vehicle : null;
    }

    function extractParties(root) {
        const container = root.querySelector('.ClaimPartiesContainer');
        if (!container) {
            return [];
        }

        const rows = Array.from(container.querySelectorAll('.tabular-row'))
            .filter(row => row.querySelector('[name="ClaimPartyFullName"]'));

        return rows.map(row => {
            const typeSelect = row.querySelector('[name="ClaimPartyTypeId"]');
            const selectedType = typeSelect
                ? clean(typeSelect.options[typeSelect.selectedIndex]?.textContent || typeSelect.value)
                : '';

            return {
                full_name: clean(row.querySelector('[name="ClaimPartyFullName"]')?.value || ''),
                phone: clean(row.querySelector('[name="ClaimPartyPhoneNumber"]')?.value || ''),
                email: clean(row.querySelector('[name="ClaimPartyEmailAddress"]')?.value || ''),
                party_type: selectedType || 'Other',
            };
        }).filter(party =>
            party.full_name ||
            party.phone ||
            party.email ||
            (party.party_type && party.party_type !== 'Other')
        );
    }

    function extractPayments(root) {
        const dateInputs = Array.from(
            root.querySelectorAll('[name="ClaimPaymentDate"]')
        );

        const rows = dateInputs
            .map(input => input.closest('.tabular-row'))
            .filter(Boolean);

        return rows.map(row => ({
            payment_date: clean(row.querySelector('[name="ClaimPaymentDate"]')?.value || ''),
            check_number: clean(row.querySelector('[name="ClaimPaymentCheckNumber"]')?.value || ''),
            amount: clean(
                String(
                    row.querySelector('[name="ClaimPaymentAmount"]')?.value || ''
                ).replace(/[$,]/g, '')
            ),
            comments: clean(row.querySelector('[name="ClaimPaymentComments"]')?.value || ''),
        })).filter(payment =>
            payment.payment_date ||
            payment.check_number ||
            payment.amount ||
            payment.comments
        );
    }

    function customerIdFromUrl() {
        const match = location.pathname.match(
            /\/Contacts\/(?:Customer|CommercialCustomer)\/Details\/(\d+)/i
        );
        return match ? match[1] : '';
    }

    function buildPayload() {
        const root = claimsRoot();
        if (!root) {
            throw new Error(
                'Open a claim in the QQ Claims tab before clicking Copy Claim.'
            );
        }

        const info = extractClaimInfo(root);
        const vehicle = extractVehicle(root);
        const parties = extractParties(root);
        const payments = extractPayments(root);

        const payload = {
            source: PAYLOAD_SOURCE,
            version: PAYLOAD_VERSION,
            copied_at: new Date().toISOString(),
            qq_customer_id: customerIdFromUrl(),
            qq_claim_id: clean(
                root.querySelector('[name="ClaimId"]')?.value || ''
            ),
            claim: info.claim,
            parties,
            payments,
        };

        if (vehicle) {
            payload.vehicle = vehicle;
        }

        if (info.line_of_business) {
            payload.qq_line_of_business = info.line_of_business;
        }

        return payload;
    }

    async function copyText(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            return;
        }

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();

        if (!ok) {
            throw new Error('The browser blocked clipboard access.');
        }
    }

    function toast(message, state = 'success') {
        const existing = document.getElementById('mci-copy-claim-toast');
        if (existing) {
            existing.remove();
        }

        const node = document.createElement('div');
        node.id = 'mci-copy-claim-toast';
        node.textContent = message;
        node.className = `mci-copy-claim-toast ${state}`;
        document.body.appendChild(node);

        window.setTimeout(() => {
            node.remove();
        }, 2600);
    }

    async function copyClaim() {
        try {
            const payload = buildPayload();

            if (!clean(payload.claim.claim_number)) {
                throw new Error(
                    'The currently open QQ claim does not have a Claim Number.'
                );
            }

            const text = JSON.stringify(payload, null, 2);
            await copyText(text);

            const partyCount = payload.parties.length;
            const paymentCount = payload.payments.length;
            toast(
                `Claim copied — ${partyCount} part${partyCount === 1 ? 'y' : 'ies'}, ` +
                `${paymentCount} payment${paymentCount === 1 ? '' : 's'}`
            );
        } catch (error) {
            console.error('[MCI Copy Claim]', error);
            toast(error?.message || 'Claim could not be copied.', 'error');
        }
    }

    async function readClipboardText() {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                return await navigator.clipboard.readText();
            } catch (error) {
                console.warn('[MCI Paste Claim] Clipboard API failed; using manual paste fallback.', error);
            }
        }

        const manual = window.prompt(
            'QQ could not read the clipboard automatically. Press Ctrl+V to paste the MCI claim data here, then click OK.'
        );
        return manual || '';
    }

    function dispatchFieldEvents(element) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        if (window.jQuery) {
            try {
                window.jQuery(element).trigger('input').trigger('change').trigger('blur');
            } catch (_error) {
                // Native events above are sufficient when QQ is not using jQuery for this field.
            }
        }
    }

    function setTextControl(root, names, value) {
        if (value === null || value === undefined) {
            return false;
        }

        for (const name of names) {
            const element = root.querySelector(`[name="${CSS.escape(name)}"]`);
            if (!element || element.matches('select, input[type="checkbox"]')) {
                continue;
            }
            element.value = String(value ?? '');
            dispatchFieldEvents(element);
            return true;
        }
        return false;
    }

    function setCheckboxControl(root, names, value) {
        if (value === null || value === undefined) {
            return false;
        }

        for (const name of names) {
            const element = root.querySelector(`[name="${CSS.escape(name)}"]`);
            if (!element || !element.matches('input[type="checkbox"]')) {
                continue;
            }
            element.checked = Boolean(value);
            dispatchFieldEvents(element);
            return true;
        }
        return false;
    }

    function normalizedOptionText(value) {
        return clean(value).toLowerCase();
    }

    function setSelectControl(root, names, value) {
        if (value === null || value === undefined || clean(value) === '') {
            return false;
        }

        for (const name of names) {
            const element = root.querySelector(`[name="${CSS.escape(name)}"]`);
            if (!element || !element.matches('select')) {
                continue;
            }

            const wanted = normalizedOptionText(value);
            const options = Array.from(element.options || []);
            const exact = options.find(option =>
                normalizedOptionText(option.textContent) === wanted ||
                normalizedOptionText(option.value) === wanted
            );
            const contains = exact || options.find(option =>
                normalizedOptionText(option.textContent).includes(wanted) ||
                wanted.includes(normalizedOptionText(option.textContent))
            );

            if (!contains) {
                return false;
            }

            element.value = contains.value;
            dispatchFieldEvents(element);
            return true;
        }
        return false;
    }

    function setAssociatedPolicyFromNumber(root, policyNumber) {
        const wanted = clean(policyNumber);
        if (!wanted) {
            return false;
        }

        const policyIdControl = root.querySelector('[name="PolicyID"]');
        if (!policyIdControl) {
            return false;
        }

        for (const row of document.querySelectorAll('#PolicyList tr[data-policyid]')) {
            const lobDivs = row.querySelectorAll('.PolicyItem.lob div');
            const displayedPolicy = clean(lobDivs[1]?.textContent || '');
            if (displayedPolicy.toLowerCase() !== wanted.toLowerCase()) {
                continue;
            }

            policyIdControl.value = clean(row.getAttribute('data-policyid') || '');
            dispatchFieldEvents(policyIdControl);
            return true;
        }

        return false;
    }

    function findActionElement(root, phrases) {
        const wanted = phrases.map(text => clean(text).toLowerCase());
        const candidates = root.querySelectorAll('button, a, input[type="button"], input[type="submit"]');
        for (const element of candidates) {
            const text = clean(
                element.matches('input') ? element.value : element.textContent
            ).toLowerCase();
            if (wanted.some(phrase => text === phrase || text.includes(phrase))) {
                return element;
            }
        }
        return null;
    }

    function delay(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    async function ensureRepeatedRows(root, rowSelector, desiredCount, addPhrases) {
        let rows = Array.from(root.querySelectorAll(rowSelector));
        let attempts = 0;
        while (rows.length < desiredCount && attempts < desiredCount + 3) {
            const addButton = findActionElement(root, addPhrases);
            if (!addButton) {
                break;
            }
            addButton.click();
            attempts += 1;
            await delay(120);
            rows = Array.from(root.querySelectorAll(rowSelector));
        }
        return rows;
    }

    async function pasteParties(root, parties) {
        if (!Array.isArray(parties) || !parties.length) {
            return { requested: 0, filled: 0 };
        }

        let rows = await ensureRepeatedRows(
            root,
            '.ClaimPartiesContainer .tabular-row:has([name="ClaimPartyFullName"])',
            parties.length,
            ['Add Claim Party', 'Add Party']
        );
        rows = rows.filter(row => row.querySelector('[name="ClaimPartyFullName"]'));

        let filled = 0;
        for (let index = 0; index < Math.min(rows.length, parties.length); index += 1) {
            const row = rows[index];
            const party = parties[index] || {};
            setTextControl(row, ['ClaimPartyFullName'], party.full_name ?? '');
            setTextControl(row, ['ClaimPartyPhoneNumber'], party.phone ?? '');
            setTextControl(row, ['ClaimPartyEmailAddress'], party.email ?? '');
            if (party.party_type) {
                setSelectControl(row, ['ClaimPartyTypeId'], party.party_type);
            }
            filled += 1;
        }

        return { requested: parties.length, filled };
    }

    async function pastePayments(root, payments) {
        if (!Array.isArray(payments) || !payments.length) {
            return { requested: 0, filled: 0 };
        }

        let rows = await ensureRepeatedRows(
            root,
            '.tabular-row:has([name="ClaimPaymentDate"])',
            payments.length,
            ['Add Claim Payment', 'Add Payment']
        );
        rows = rows.filter(row => row.querySelector('[name="ClaimPaymentDate"]'));

        let filled = 0;
        for (let index = 0; index < Math.min(rows.length, payments.length); index += 1) {
            const row = rows[index];
            const payment = payments[index] || {};
            setTextControl(row, ['ClaimPaymentDate'], payment.payment_date ?? '');
            setTextControl(row, ['ClaimPaymentCheckNumber'], payment.check_number ?? '');
            setTextControl(row, ['ClaimPaymentAmount'], payment.amount ?? '');
            setTextControl(row, ['ClaimPaymentComments'], payment.comments ?? '');
            filled += 1;
        }

        return { requested: payments.length, filled };
    }

    async function applyMciClaimPayload(payload) {
        const root = claimsRoot();
        if (!root) {
            throw new Error('Open the QQ claim you want to fill before clicking Paste Claim.');
        }

        if (!payload || payload.source !== PAYLOAD_SOURCE || payload.version !== PAYLOAD_VERSION) {
            throw new Error('The clipboard does not contain compatible MCI claim data.');
        }

        const claim = payload.claim;
        if (!claim || typeof claim !== 'object') {
            throw new Error('The MCI claim payload is missing its claim data.');
        }

        const currentClaimNumber = clean(root.querySelector('[name="ClaimNumber"]')?.value || '');
        const incomingClaimNumber = clean(claim.claim_number || '');
        let claimNumberPreserved = false;
        if (incomingClaimNumber) {
            if (!currentClaimNumber) {
                setTextControl(root, ['ClaimNumber'], incomingClaimNumber);
            } else if (currentClaimNumber.toLowerCase() !== incomingClaimNumber.toLowerCase()) {
                claimNumberPreserved = true;
            }
        }

        setSelectControl(root, ['ClaimStatusId'], claim.status);
        setSelectControl(root, ['ClaimTypeId'], claim.claim_type);
        setTextControl(root, ['DateOpened'], claim.date_opened);
        setTextControl(root, ['DateOfLoss'], claim.date_of_loss);
        setTextControl(root, ['DateReported'], claim.date_reported);
        setTextControl(root, ['DateClosed'], claim.date_closed);
        setSelectControl(root, ['CoverageID'], claim.coverage);
        setCheckboxControl(root, ['DisputedSuitPending'], claim.disputed_suit_pending);
        setCheckboxControl(root, ['ChargeableToCompany'], claim.chargeable_to_company);
        setTextControl(root, ['AmountOfLoss'], claim.amount_of_loss);
        setTextControl(root, ['AmountSalvaged'], claim.amount_salvaged);
        setTextControl(root, ['AmountReserved'], claim.amount_reserved);
        setTextControl(root, ['AmountPaid'], claim.amount_paid);

        const policyMatched = setAssociatedPolicyFromNumber(root, claim.policy_number);

        setTextControl(root, ['Street', 'LossStreet', 'AddressLine1', 'LossAddressLine1'], claim.loss_street);
        setTextControl(root, ['City', 'LossCity'], claim.loss_city);
        if (!setSelectControl(root, ['StateID', 'LossStateID'], claim.loss_state)) {
            setTextControl(root, ['State', 'LossState', 'Province'], claim.loss_state);
        }
        setTextControl(root, ['Zip', 'ZIP', 'ZipCode', 'LossZip'], claim.loss_zip);
        if (!setSelectControl(root, ['CountryID', 'LossCountryID'], claim.loss_country)) {
            setTextControl(root, ['Country', 'LossCountry'], claim.loss_country);
        }
        setTextControl(
            root,
            ['LossLocationDescription', 'LocationDescription', 'DescribeLocationOfLoss'],
            claim.loss_location_description
        );
        setTextControl(root, ['IncidentDescription'], claim.incident_description);

        const vehicle = payload.vehicle && typeof payload.vehicle === 'object'
            ? payload.vehicle
            : {};
        setTextControl(root, ['Year'], vehicle.year);
        setTextControl(root, ['Make'], vehicle.make);
        setTextControl(root, ['Model'], vehicle.model);
        setTextControl(root, ['VIN'], vehicle.vin);
        if (!setSelectControl(root, ['BodyType'], vehicle.vehicle_type)) {
            setTextControl(root, ['BodyType'], vehicle.vehicle_type);
        }

        const partyResult = await pasteParties(root, payload.parties || []);
        const paymentResult = await pastePayments(root, payload.payments || []);

        return {
            claimNumberPreserved,
            policyMatched,
            policyRequested: clean(claim.policy_number || ''),
            partyResult,
            paymentResult,
        };
    }

    async function pasteClaim() {
        try {
            const clipboardText = String(await readClipboardText() || '').trim();
            if (!clipboardText) {
                throw new Error('No claim data was pasted from the clipboard.');
            }

            let payload;
            try {
                payload = JSON.parse(clipboardText);
            } catch (_error) {
                throw new Error('The clipboard does not contain valid MCI claim JSON.');
            }

            const result = await applyMciClaimPayload(payload);
            const notes = ['Claim pasted from MCI. Review the QQ fields and click QQ Save when ready.'];
            if (result.claimNumberPreserved) {
                notes.push('Existing QQ Claim Number was preserved.');
            }
            if (result.policyRequested && !result.policyMatched) {
                notes.push(`Policy ${result.policyRequested} could not be matched automatically.`);
            }
            if (result.partyResult.requested > result.partyResult.filled) {
                notes.push(`Only ${result.partyResult.filled} of ${result.partyResult.requested} claim parties could be filled automatically.`);
            }
            if (result.paymentResult.requested > result.paymentResult.filled) {
                notes.push(`Only ${result.paymentResult.filled} of ${result.paymentResult.requested} claim payments could be filled automatically.`);
            }

            toast(notes.join(' '), 'success');
        } catch (error) {
            console.error('[MCI Paste Claim]', error);
            toast(error?.message || 'Claim could not be pasted.', 'error');
        }
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID},
            #${PASTE_BUTTON_ID} {
                display: inline-block;
                margin-left: 10px;
                padding: 4px 10px;
                min-height: 26px;
                border: 1px solid #1683c5;
                border-radius: 4px;
                background: #1683c5;
                color: #fff;
                font: 600 12px/16px Arial, sans-serif;
                cursor: pointer;
                vertical-align: middle;
                box-shadow: none;
            }

            #${BUTTON_ID}:hover,
            #${PASTE_BUTTON_ID}:hover {
                background: #0d6fae;
                border-color: #0d6fae;
            }

            #${BUTTON_ID}:active,
            #${PASTE_BUTTON_ID}:active {
                transform: translateY(1px);
            }

            #${PASTE_BUTTON_ID} {
                background: #16794a;
                border-color: #16794a;
            }

            #${PASTE_BUTTON_ID}:hover {
                background: #11663e;
                border-color: #11663e;
            }

            .mci-copy-claim-toast {
                position: fixed;
                z-index: 2147483647;
                left: 50%;
                top: 18px;
                transform: translateX(-50%);
                max-width: 520px;
                padding: 9px 14px;
                border-radius: 7px;
                background: #16794a;
                color: #fff;
                font: 600 12px/1.35 Arial, sans-serif;
                box-shadow: 0 5px 18px rgba(0, 0, 0, .30);
                pointer-events: none;
            }

            .mci-copy-claim-toast.error {
                background: #a83232;
            }
        `;
        document.head.appendChild(style);
    }

    function removeButton() {
        document.getElementById(BUTTON_ID)?.remove();
        document.getElementById(PASTE_BUTTON_ID)?.remove();
    }

    function ensureButton() {
        ensureStyles();

        if (!isClaimsTab()) {
            removeButton();
            return;
        }

        const claimsTab = document.querySelector('#Claims');
        if (!claimsTab) {
            removeButton();
            return;
        }

        const claimsHeading =
            claimsTab.querySelector(
                '.section-container[data-sectionkey="Claims"] > h2'
            ) ||
            claimsTab.querySelector('h2');

        if (!claimsHeading) {
            return;
        }

        let button = document.getElementById(BUTTON_ID);
        if (button && button.parentElement !== claimsHeading) {
            button.remove();
            button = null;
        }

        if (!button) {
            button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.textContent = 'Copy Claim';
            button.title =
                'Copy the currently open QQ claim for Paste from QQ in MCI Customer Search.';
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                copyClaim();
            });

            claimsHeading.appendChild(button);
        }

        let pasteButton = document.getElementById(PASTE_BUTTON_ID);
        if (pasteButton && pasteButton.parentElement !== claimsHeading) {
            pasteButton.remove();
            pasteButton = null;
        }

        if (!pasteButton) {
            pasteButton = document.createElement('button');
            pasteButton.id = PASTE_BUTTON_ID;
            pasteButton.type = 'button';
            pasteButton.textContent = 'Paste Claim';
            pasteButton.title =
                'Paste claim data copied from MCI Customer Search. QQ is not saved automatically.';
            pasteButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                pasteClaim();
            });

            claimsHeading.appendChild(pasteButton);
        }

        // Only show the buttons when a claim detail record is actually open.
        const hasOpenClaim = Boolean(claimsRoot());
        button.style.display = hasOpenClaim ? 'inline-block' : 'none';
        pasteButton.style.display = hasOpenClaim ? 'inline-block' : 'none';
    }

    let refreshTimer = 0;

    function scheduleRefresh() {
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(ensureButton, 100);
    }

    window.addEventListener('hashchange', scheduleRefresh);

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
    });

    ensureButton();
})();
