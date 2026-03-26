// ==UserScript==
// @name         ERIE_TO_PROGRESSIVE_PRODUCTS_FILLER_V1
// @namespace    https://middlecreekinsurance.com/
// @version      1.3.0
// @description  Fill Progressive Products page from Erie Master payload. No on-page UI.
// @match        https://quoting.foragentsonly.com/Quote/Index/*
// @match        https://www.foragentsonly.com/Quote/Index/*
// @grant        GM_getValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const APP = {
        name: 'ERIE_TO_PROGRESSIVE_PRODUCTS_FILLER_V1',
        version: '1.3.0',
        debug: true
    };

    const STATE = {
        running: false
    };

    const PAGE = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    const U = {
        log: function () {
            if (!APP.debug) return;
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[' + APP.name + ']');
            console.log.apply(console, args);
        },

        safeString: function (v) {
            return v == null ? '' : String(v);
        },

        clean: function (v) {
            return U.safeString(v).replace(/\s+/g, ' ').trim();
        },

        upper: function (v) {
            return U.clean(v).toUpperCase();
        },

        asArray: function (v) {
            return Array.isArray(v) ? v : [];
        },

        tryParseJson: function (v) {
            if (!v) return null;
            try {
                return typeof v === 'string' ? JSON.parse(v) : v;
            } catch (e) {
                return null;
            }
        },

        delay: function (ms) {
            return new Promise(function (resolve) {
                setTimeout(resolve, ms);
            });
        },

        query: function (sel, root) {
            try {
                return (root || document).querySelector(sel);
            } catch (e) {
                return null;
            }
        },

        queryAll: function (sel, root) {
            try {
                return Array.prototype.slice.call((root || document).querySelectorAll(sel));
            } catch (e) {
                return [];
            }
        },

        isVisible: function (el) {
            if (!el || !document.contains(el)) return false;
            var cs = window.getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        },

        dispatch: function (el, type) {
            if (!el) return;
            el.dispatchEvent(new Event(type, { bubbles: true }));
        },

        setNativeValue: function (el, value) {
            if (!el) return false;
            var proto = Object.getPrototypeOf(el);
            var desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
            if (desc && desc.set) {
                desc.set.call(el, value);
            } else {
                el.value = value;
            }
            return true;
        },

        setInputValue: function (el, value) {
            if (!el) return false;
            value = U.clean(value);
            U.setNativeValue(el, value);
            U.dispatch(el, 'input');
            U.dispatch(el, 'change');
            U.dispatch(el, 'blur');
            return true;
        },

        getSelectedText: function (el) {
            if (!el) return '';
            if (typeof el.selectedIndex === 'number' && el.options && el.options[el.selectedIndex]) {
                return U.clean(el.options[el.selectedIndex].text);
            }
            return U.clean(el.value);
        },

        setSelectByText: function (el, wantedText) {
            if (!el) return false;
            wantedText = U.clean(wantedText);
            if (!wantedText) return false;

            var options = Array.prototype.slice.call(el.options || []);
            var match = null;

            options.some(function (opt) {
                if (U.clean(opt.text) === wantedText) {
                    match = opt;
                    return true;
                }
                return false;
            });

            if (!match) {
                options.some(function (opt) {
                    if (U.upper(opt.text) === U.upper(wantedText)) {
                        match = opt;
                        return true;
                    }
                    return false;
                });
            }

            if (!match) {
                options.some(function (opt) {
                    if (U.upper(opt.text).indexOf(U.upper(wantedText)) !== -1) {
                        match = opt;
                        return true;
                    }
                    return false;
                });
            }

            if (!match) return false;

            el.value = match.value;
            U.dispatch(el, 'input');
            U.dispatch(el, 'change');
            U.dispatch(el, 'blur');
            return true;
        },

        setSelectByValue: function (el, wantedValue) {
            if (!el) return false;
            wantedValue = U.clean(wantedValue);
            var options = Array.prototype.slice.call(el.options || []);
            var match = options.find(function (opt) {
                return U.clean(opt.value) === wantedValue;
            });
            if (!match) return false;

            el.value = match.value;
            U.dispatch(el, 'input');
            U.dispatch(el, 'change');
            U.dispatch(el, 'blur');
            return true;
        },

        click: function (el) {
            if (!el) return false;
            el.click();
            return true;
        },

        waitFor: function (fn, timeoutMs, intervalMs) {
            timeoutMs = timeoutMs || 8000;
            intervalMs = intervalMs || 200;

            return new Promise(function (resolve) {
                var start = Date.now();

                (function poll() {
                    var out = null;
                    try {
                        out = fn();
                    } catch (e) { }

                    if (out) {
                        resolve(out);
                        return;
                    }

                    if (Date.now() - start >= timeoutMs) {
                        resolve(null);
                        return;
                    }

                    setTimeout(poll, intervalMs);
                })();
            });
        },

        normalizeMilesLabel: function (v) {
            var n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10);
            if (isNaN(n)) return '';

            if (n <= 3999) return '0 - 3,999';
            if (n <= 5999) return '4,000 - 5,999';
            if (n <= 7999) return '6,000 - 7,999';
            if (n <= 9999) return '8,000 - 9,999';
            if (n <= 11999) return '10,000 - 11,999';
            if (n <= 13999) return '12,000 - 13,999';
            if (n <= 15999) return '14,000 - 15,999';
            if (n <= 17999) return '16,000 - 17,999';
            if (n <= 19999) return '18,000 - 19,999';
            if (n <= 21999) return '20,000 - 21,999';
            if (n <= 23999) return '22,000 - 23,999';
            if (n <= 26999) return '24,000 - 26,999';
            if (n <= 29999) return '27,000 - 29,999';
            return '30,000 - 99,999';
        },

        mapVehicleUse: function (useText) {
            var s = U.upper(useText);
            if (!s) return '1A - Pleasure';
            if (s.indexOf('BUSINESS') !== -1) return '3 - Business (Incidental)';
            if (s.indexOf('FARM') !== -1) return '1AF - Farm';
            if (s.indexOf('WORK') !== -1 || s.indexOf('COMMUTE') !== -1 || s.indexOf('SCHOOL') !== -1) {
                return '1B - Commute < 10 miles';
            }
            return '1A - Pleasure';
        },

        inferOwnedDuration: function (vehicle, payload) {
            var eff = U.clean(
                payload &&
                payload.coverages &&
                payload.coverages.policy &&
                payload.coverages.policy.effectiveDate
            );

            var match = eff.match(/^\d{2}\/\d{2}\/(\d{4})$/);
            var effYear = match ? parseInt(match[1], 10) : null;
            var modelYear = parseInt(U.clean(vehicle && vehicle.year), 10);

            if (!effYear || isNaN(modelYear)) return 'At least 1 year but less than 3 years';

            var diff = effYear - modelYear;
            if (diff <= 0) return 'Less than 1 month';
            if (diff === 1) return 'At least 6 months but less than 1 year';
            if (diff <= 3) return 'At least 1 year but less than 3 years';
            if (diff <= 5) return 'At least 3 years but less than 5 years';
            return '5 years or more';
        },

        toast: function (message, ms) {
            ms = ms || 2200;
            var el = document.getElementById('mci-progressive-products-toast');

            if (!el) {
                el = document.createElement('div');
                el.id = 'mci-progressive-products-toast';
                el.style.cssText = [
                    'position:fixed',
                    'top:18px',
                    'left:50%',
                    'transform:translateX(-50%)',
                    'z-index:2147483647',
                    'background:#111',
                    'color:#fff',
                    'padding:8px 12px',
                    'border-radius:8px',
                    'font:12px/1.35 system-ui,Segoe UI,Arial,sans-serif',
                    'box-shadow:0 6px 18px rgba(0,0,0,.35)',
                    'pointer-events:none'
                ].join(';');
                document.body.appendChild(el);
            }

            el.textContent = message;
            el.style.display = 'block';
            clearTimeout(el._hideTimer);
            el._hideTimer = setTimeout(function () {
                el.style.display = 'none';
            }, ms);
        }
    };

    const Payload = {
        load: function () {
            function isValidPayload(obj) {
                return !!(obj && obj.meta && Array.isArray(obj.vehicles));
            }

            function tryParsed(v) {
                return U.tryParseJson(v);
            }

            try {
                if (PAGE && typeof PAGE.getMciSharedPayload === 'function') {
                    var bridged = PAGE.getMciSharedPayload();
                    if (isValidPayload(bridged)) {
                        U.log('Loaded payload from getMciSharedPayload()');
                        return bridged;
                    }
                }
            } catch (e) {
                U.log('getMciSharedPayload() failed', e);
            }

            try {
                if (PAGE && isValidPayload(PAGE.__MCI_SHARED_PAYLOAD)) {
                    U.log('Loaded payload from PAGE.__MCI_SHARED_PAYLOAD');
                    return PAGE.__MCI_SHARED_PAYLOAD;
                }
            } catch (e) { }

            try {
                if (PAGE && isValidPayload(PAGE.__eriePayload)) {
                    U.log('Loaded payload from PAGE.__eriePayload');
                    return PAGE.__eriePayload;
                }
            } catch (e) { }

            try {
                var rawLsShared = localStorage.getItem('mciMasterPayload');
                var parsedLsShared = tryParsed(rawLsShared);
                if (isValidPayload(parsedLsShared)) {
                    U.log('Loaded payload from localStorage.mciMasterPayload');
                    return parsedLsShared;
                }
            } catch (e) { }

            try {
                var rawLsErie = localStorage.getItem('erieMasterPayload');
                var parsedLsErie = tryParsed(rawLsErie);
                if (isValidPayload(parsedLsErie)) {
                    U.log('Loaded payload from localStorage.erieMasterPayload');
                    return parsedLsErie;
                }
            } catch (e) { }

            try {
                var rawSsShared = sessionStorage.getItem('mciMasterPayload');
                var parsedSsShared = tryParsed(rawSsShared);
                if (isValidPayload(parsedSsShared)) {
                    U.log('Loaded payload from sessionStorage.mciMasterPayload');
                    return parsedSsShared;
                }
            } catch (e) { }

            try {
                var rawSsErie = sessionStorage.getItem('erieMasterPayload');
                var parsedSsErie = tryParsed(rawSsErie);
                if (isValidPayload(parsedSsErie)) {
                    U.log('Loaded payload from sessionStorage.erieMasterPayload');
                    return parsedSsErie;
                }
            } catch (e) { }

            try {
                var rawGmShared = GM_getValue('mciMasterPayload', null);
                var parsedGmShared = tryParsed(rawGmShared);
                if (isValidPayload(parsedGmShared)) {
                    U.log('Loaded payload from GM_getValue(mciMasterPayload)');
                    return parsedGmShared;
                }
            } catch (e) { }

            try {
                var rawGmErie = GM_getValue('erieMasterPayload', null);
                var parsedGmErie = tryParsed(rawGmErie);
                if (isValidPayload(parsedGmErie)) {
                    U.log('Loaded payload from GM_getValue(erieMasterPayload)');
                    return parsedGmErie;
                }
            } catch (e) { }

            return null;
        }
    };

    const Progressive = {
        policyEffectiveDate: function () {
            return U.query('#ProductsAA_Embedded_Questions_List_PolicyEffectiveDate');
        },

        namedOperatorNo: function () {
            return U.query('#ProductsAA_Embedded_Questions_List_NamedOperatorIndicator_N');
        },

        nextButton: function () {
            return U.query('#btnNextId');
        },

        fieldId: function (index, suffix) {
            return '#ProductsAA_Vehicles_List_' + index + '_Embedded_Questions_List_' + suffix;
        },

        radioId: function (index, suffix, code) {
            return '#ProductsAA_Vehicles_List_' + index + '_Embedded_Questions_List_' + suffix + '_' + code;
        },

        vehicleCount: function () {
            var vinInputs = U.queryAll('input[id^="ProductsAA_Vehicles_List_"][id$="_Embedded_Questions_List_Vin"]')
                .filter(function (el) {
                    return U.isVisible(el);
                });

            return vinInputs.length;
        },

        addVehicleButton: function () {
            var nodes = U.queryAll('button, [role="button"], a, div');
            return nodes.find(function (el) {
                return U.upper(el.textContent) === 'ADD A NEW VEHICLE';
            }) || null;
        },

        vinSearchButton: function (index) {
            var vinEl = U.query(this.fieldId(index, 'Vin'));
            if (!vinEl) return null;

            var node = vinEl;
            for (var i = 0; i < 6 && node; i++, node = node.parentElement) {
                var candidates = U.queryAll('button, [role="button"], a, mat-icon, i, svg, span', node)
                    .filter(function (el) {
                        if (!U.isVisible(el)) return false;

                        var t = U.upper(el.textContent);
                        var aria = U.upper(el.getAttribute('aria-label') || '');
                        var title = U.upper(el.getAttribute('title') || '');
                        var cls = U.upper(String(el.className || ''));

                        if (t.indexOf('SEARCH') !== -1) return true;
                        if (aria.indexOf('SEARCH') !== -1) return true;
                        if (title.indexOf('SEARCH') !== -1) return true;
                        if (cls.indexOf('SEARCH') !== -1) return true;
                        if (cls.indexOf('MAGN') !== -1) return true;
                        if (cls.indexOf('ICON') !== -1) return true;
                        if (t.indexOf('ZOOM_IN') !== -1) return true;

                        return false;
                    });

                if (candidates.length) return candidates[0];
            }

            return null;
        }
    };

    const Data = {
        getEffectiveDate: function (payload) {
            return U.clean(
                payload &&
                payload.coverages &&
                payload.coverages.policy &&
                payload.coverages.policy.effectiveDate
            );
        },

        getVehicles: function (payload) {
            return U.asArray(payload && payload.vehicles);
        },

        getGaragingZip: function (payload, vehicle) {
            return U.clean(
                vehicle &&
                vehicle.garagingAddress &&
                vehicle.garagingAddress.zip
            ) || U.clean(
                payload &&
                payload.customer &&
                payload.customer.residenceAddress &&
                payload.customer.residenceAddress.zip
            ) || U.clean(
                payload &&
                payload.customer &&
                payload.customer.mailingAddress &&
                payload.customer.mailingAddress.zip
            ) || '';
        }
    };

    const Fill = {
        fillTopSection: async function (payload) {
            var effectiveDate = Data.getEffectiveDate(payload);

            if (!effectiveDate) {
                throw new Error('No policy effective date found in payload.coverages.policy.effectiveDate');
            }

            var effEl = Progressive.policyEffectiveDate();
            if (!effEl) {
                throw new Error('Progressive policy effective date field not found');
            }

            U.setInputValue(effEl, effectiveDate);
            U.log('Set policy effective date:', effectiveDate);
            await U.delay(400);

            var namedOperatorNo = Progressive.namedOperatorNo();
            if (namedOperatorNo) {
                U.click(namedOperatorNo);
                U.log('Set Named Operator Policy = No');
                await U.delay(300);
            }
        },

        ensureVehicleSlots: async function (countNeeded) {
            var guard = 0;

            while (Progressive.vehicleCount() < countNeeded && guard < 12) {
                var btn = Progressive.addVehicleButton();
                if (!btn) {
                    throw new Error('Add A New Vehicle button not found');
                }

                U.click(btn);
                guard += 1;
                U.log('Clicked Add A New Vehicle, attempt', guard);

                await U.waitFor(function () {
                    var vinEl = U.query(Progressive.fieldId(countNeeded - 1, 'Vin'));
                    return Progressive.vehicleCount() >= countNeeded && !!vinEl;
                }, 8000, 250);

                await U.delay(800);
            }

            var finalVin = U.query(Progressive.fieldId(countNeeded - 1, 'Vin'));
            if (Progressive.vehicleCount() < countNeeded || !finalVin) {
                throw new Error('Could not create enough vehicle slots');
            }
        },

        waitForVehicleDecode: async function (index, timeoutMs) {
            timeoutMs = timeoutMs || 12000;

            return U.waitFor(function () {
                var yearEl = U.query(Progressive.fieldId(index, 'Year'));
                var makeEl = U.query(Progressive.fieldId(index, 'Make'));
                var modelEl = U.query(Progressive.fieldId(index, 'Model'));
                var bodyEl = U.query(Progressive.fieldId(index, 'BodyStyle'));

                var yearVal = yearEl ? U.getSelectedText(yearEl) : '';
                var makeVal = makeEl ? U.getSelectedText(makeEl) : '';
                var modelVal = modelEl ? U.getSelectedText(modelEl) : '';
                var bodyVal = bodyEl ? U.getSelectedText(bodyEl) : '';

                return !!(yearVal || makeVal || modelVal || bodyVal);
            }, timeoutMs, 250);
        },

        setVehicleNoFieldSafe: function (index, fieldSuffixes, timeoutMs) {
            timeoutMs = timeoutMs || 2500;
            fieldSuffixes = Array.isArray(fieldSuffixes) ? fieldSuffixes : [fieldSuffixes];

            return new Promise(function (resolve) {
                var settled = false;
                var timer = setTimeout(function () {
                    if (settled) return;
                    settled = true;
                    U.log('Warning: Timed out setting vehicle field to No', {
                        index: index,
                        fieldSuffixes: fieldSuffixes,
                        timeoutMs: timeoutMs
                    });
                    resolve(false);
                }, timeoutMs);

                (async function () {
                    try {
                        for (var i = 0; i < fieldSuffixes.length; i++) {
                            var fieldSuffix = U.clean(fieldSuffixes[i]);
                            if (!fieldSuffix) continue;

                            await U.waitFor(function () {
                                return U.query(Progressive.fieldId(index, fieldSuffix)) ||
                                    U.query(Progressive.radioId(index, fieldSuffix, 'N'));
                            }, 650, 120);

                            var radioNo = U.query(Progressive.radioId(index, fieldSuffix, 'N'));
                            if (radioNo) {
                                U.click(radioNo);
                                U.dispatch(radioNo, 'input');
                                U.dispatch(radioNo, 'change');
                                U.dispatch(radioNo, 'blur');
                                await U.delay(120);

                                if (!settled) {
                                    settled = true;
                                    clearTimeout(timer);
                                    U.log('Set vehicle field to No via radio', {
                                        index: index,
                                        fieldSuffix: fieldSuffix
                                    });
                                    resolve(true);
                                }
                                return;
                            }

                            var selectEl = U.query(Progressive.fieldId(index, fieldSuffix));
                            if (selectEl) {
                                var setOk = U.setSelectByValue(selectEl, 'N') || U.setSelectByText(selectEl, 'No');
                                await U.delay(120);

                                if (setOk) {
                                    if (!settled) {
                                        settled = true;
                                        clearTimeout(timer);
                                        U.log('Set vehicle field to No via select', {
                                            index: index,
                                            fieldSuffix: fieldSuffix
                                        });
                                        resolve(true);
                                    }
                                    return;
                                }
                            }
                        }

                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            U.log('Warning: Vehicle No field not found or not set', {
                                index: index,
                                fieldSuffixes: fieldSuffixes
                            });
                            resolve(false);
                        }
                    } catch (e) {
                        if (!settled) {
                            settled = true;
                            clearTimeout(timer);
                            U.log('Warning: Failed to set vehicle field to No', {
                                index: index,
                                fieldSuffixes: fieldSuffixes,
                                error: e
                            });
                            resolve(false);
                        }
                    }
                })();
            });
        },

        fillVehicle: async function (index, vehicle, payload) {
            U.log('Filling vehicle', index, vehicle);

            var typeEl = U.query(Progressive.fieldId(index, 'TypeCode'));
            var vinEl = U.query(Progressive.fieldId(index, 'Vin'));
            var zipEl = U.query(Progressive.fieldId(index, 'GaragingZip'));
            var ownedEl = U.query(Progressive.fieldId(index, 'HowLongOwned'));
            var useEl = U.query(Progressive.fieldId(index, 'VehicleUse'));
            var annualMilesEl = U.query(Progressive.fieldId(index, 'AnnualMiles'));

            if (typeEl) {
                U.setSelectByValue(typeEl, 'A') ||
                    U.setSelectByText(typeEl, '1981 & Newer - Autos, Pickups, Vans, and Utility Vehicles');
                await U.delay(300);
            }

            if (!vinEl) {
                throw new Error('VIN field not found for vehicle index ' + index);
            }

            if (!vehicle || !U.clean(vehicle.vin)) {
                throw new Error('Payload vehicle VIN missing for vehicle index ' + index);
            }

            U.setInputValue(vinEl, vehicle.vin);
            U.log('Set VIN for vehicle', index, vehicle.vin);
            await U.delay(300);

            var vinSearchBtn = Progressive.vinSearchButton(index);
            if (vinSearchBtn) {
                U.click(vinSearchBtn);
                U.log('Clicked VIN search button for vehicle', index);
                await Fill.waitForVehicleDecode(index, 12000);
                await U.delay(400);
            } else {
                U.log('VIN search button not found for vehicle', index);
            }

            var garagingZip = Data.getGaragingZip(payload, vehicle);
            U.log('Garaging ZIP lookup for vehicle', index, {
                zipFieldFound: !!zipEl,
                garagingZip: garagingZip
            });

            if (zipEl && garagingZip) {
                U.setInputValue(zipEl, garagingZip);
                U.log('Set garaging ZIP for vehicle', index, garagingZip);
                await U.delay(250);
            }

            if (ownedEl) {
                U.setSelectByText(ownedEl, U.inferOwnedDuration(vehicle, payload));
                await U.delay(200);
            }

            if (useEl) {
                U.setSelectByText(useEl, U.mapVehicleUse(vehicle.use));
                await U.delay(200);
            }

            await Fill.setVehicleNoFieldSafe(index, [
                'VehicleTransportNetworkCompanyIndicator',
                'UsedForRideshareTncIndicator'
            ], 2500);
            await Fill.setVehicleNoFieldSafe(index, [
                'VehicleUseDelivery',
                'DeliveryVehicleIndicator'
            ], 2500);

            if (annualMilesEl && vehicle.annualMiles) {
                U.setSelectByText(annualMilesEl, U.normalizeMilesLabel(vehicle.annualMiles));
                await U.delay(200);
            }

            await U.delay(400);
        },

        run: async function () {
            if (STATE.running) {
                U.toast('Products filler is already running');
                return false;
            }

            var payload = Payload.load();
            if (!payload || !payload.meta) {
                throw new Error('No Erie master payload found. Checked bridge, page globals, localStorage, sessionStorage, and GM storage.');
            }

            var vehicles = Data.getVehicles(payload);
            if (!vehicles.length) {
                throw new Error('Payload has no vehicles');
            }

            STATE.running = true;

            try {
                U.toast('Starting Progressive Products fill...');
                U.log('Loaded payload:', payload);

                await Fill.fillTopSection(payload);

                for (var i = 0; i < vehicles.length; i++) {
                    if (i > 0) {
                        await Fill.ensureVehicleSlots(i + 1);
                        await U.delay(500);
                    }

                    await Fill.fillVehicle(i, vehicles[i], payload);
                    U.toast('Vehicle ' + (i + 1) + ' of ' + vehicles.length + ' filled', 1200);
                }

                U.toast('Progressive Products fill complete');
                U.log('Done');
                return true;
            } finally {
                STATE.running = false;
            }
        }
    };

    PAGE.testProgressiveProducts = async function () {
        return Fill.run();
    };

    PAGE.goNextProgressiveProducts = function () {
        var nextBtn = Progressive.nextButton();
        if (nextBtn) {
            nextBtn.click();
            return true;
        }
        return false;
    };

    U.log('Loaded. No UI mounted. Run testProgressiveProducts() from console.');
})();
