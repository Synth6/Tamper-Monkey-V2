// ==UserScript==
// @name         ERIE_TO_PROGRESSIVE_HOUSEHOLD_MEMBERS_FILLER_V1
// @namespace    https://middlecreekinsurance.com/
// @version      1.1.0
// @description  Fill Progressive Household Members page from Erie master payload bridge.
// @match        https://quoting.foragentsonly.com/Quote/Index/*
// @match        https://www.foragentsonly.com/Quote/Index/*
// @grant        unsafeWindow
// @updateURL   https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_PROGRESSIVE_HOUSEHOLD_MEMBERS_FILLER_V1.user.js
// @downloadURL https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/ERIE_TO_PROGRESSIVE_HOUSEHOLD_MEMBERS_FILLER_V1.user.js
// ==/UserScript==

(function () {
    'use strict';

    const APP = {
        key: 'mciMasterPayload',
        version: '1.1.0',
        pageId: 'HouseholdMembers',
        debugPrefix: '[ERIE_TO_PROGRESSIVE_HOUSEHOLD_MEMBERS_FILLER_V1]'
    };

    const U = {
        log(...args) { console.log(APP.debugPrefix, ...args); },
        warn(...args) { console.warn(APP.debugPrefix, ...args); },
        err(...args) { console.error(APP.debugPrefix, ...args); },

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        q(sel, root) {
            return (root || document).querySelector(sel);
        },

        qa(sel, root) {
            return Array.from((root || document).querySelectorAll(sel));
        },

        byId(id) {
            return document.getElementById(id);
        },

        cleanText(v) {
            return String(v || '').replace(/\s+/g, ' ').trim();
        },

        upper(v) {
            return U.cleanText(v).toUpperCase();
        },

        digits(v) {
            return String(v || '').replace(/\D+/g, '');
        },

        titleCase(v) {
            const s = U.cleanText(v).toLowerCase();
            if (!s) return '';
            return s.replace(/\b[a-z]/g, c => c.toUpperCase());
        },

        normalizeName(v) {
            return U.upper(v).replace(/\s+/g, ' ');
        },

        normalizeVehicleText(v) {
            return U.upper(v)
                .replace(/\bCHEV\b/g, 'CHEVROLET')
                .replace(/\bVW\b/g, 'VOLKSWAGEN')
                .replace(/\bMERC\b/g, 'MERCEDES')
                .replace(/\s+/g, ' ')
                .trim();
        },

        isVisible(el) {
            if (!el) return false;
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            return !!(r.width || r.height);
        },

        fire(el, type, opts) {
            if (!el) return;
            const cfg = Object.assign({ bubbles: true, cancelable: true }, opts || {});
            let ev;
            if (type === 'input' || type === 'change' || type === 'blur' || type === 'focus') {
                ev = new Event(type, cfg);
            } else {
                ev = new MouseEvent(type, cfg);
            }
            el.dispatchEvent(ev);
        },

        setNativeValue(el, value) {
            if (!el) return false;
            const val = value == null ? '' : String(value);
            const proto = Object.getPrototypeOf(el);
            const desc =
                Object.getOwnPropertyDescriptor(proto, 'value') ||
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

            if (desc && typeof desc.set === 'function') {
                desc.set.call(el, val);
            } else {
                el.value = val;
            }

            U.fire(el, 'input');
            U.fire(el, 'change');
            return true;
        },

        setInput(el, value) {
            if (!el) return false;
            el.focus();
            U.setNativeValue(el, value);
            U.fire(el, 'blur');
            return true;
        },

        setSelect(selectEl, wantedValue, wantedText) {
            if (!selectEl) return false;

            const options = Array.from(selectEl.options || []);
            const wantVal = U.cleanText(wantedValue);
            const wantTxt = U.cleanText(wantedText);
            const wantTxtUpper = wantTxt.toUpperCase();

            let match = null;

            if (wantVal) {
                match = options.find(o => U.cleanText(o.value) === wantVal);
            }

            if (!match && wantTxt) {
                match = options.find(o => U.cleanText(o.textContent) === wantTxt);
            }

            if (!match && wantTxt) {
                match = options.find(o => U.upper(o.textContent) === wantTxtUpper);
            }

            if (!match && wantTxt) {
                match = options.find(o => U.upper(o.textContent).includes(wantTxtUpper));
            }

            if (!match) return false;

            selectEl.focus();
            selectEl.value = match.value;
            U.fire(selectEl, 'input');
            U.fire(selectEl, 'change');
            U.fire(selectEl, 'blur');
            return true;
        },

        async waitFor(fn, opts) {
            const timeout = (opts && opts.timeout) || 4000;
            const interval = (opts && opts.interval) || 60;
            const start = Date.now();

            while (Date.now() - start < timeout) {
                try {
                    const value = fn();
                    if (value) return value;
                } catch (_) { }
                await U.sleep(interval);
            }

            return null;
        },

        async click(el) {
            if (!el) return false;
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.focus();
            el.click();
            return true;
        },

        openersForReadonlyInput(inputEl) {
            if (!inputEl) return [];
            return [
                inputEl.closest('.dropdown'),
                inputEl.parentElement,
                inputEl.closest('select-input'),
                inputEl
            ].filter(Boolean);
        },

        getVisibleOverlayOptions() {
            return U.qa([
                '.cdk-overlay-pane [role="option"]',
                '.cdk-overlay-pane mat-option',
                '.cdk-overlay-pane .mat-mdc-option',
                '.cdk-overlay-pane .mdc-list-item',
                '.cdk-overlay-pane li',
                '.cdk-overlay-pane button',
                '.cdk-overlay-pane [role="button"]',
                'body > .dropdown-menu li',
                'body > .dropdown-menu button'
            ].join(',')).filter(U.isVisible);
        },

        scoreVehicleOptionText(candidateText, wanted) {
            const cand = U.normalizeVehicleText(candidateText);
            const year = U.cleanText(wanted.year);
            const make = U.normalizeVehicleText(wanted.make);
            const model = U.normalizeVehicleText(wanted.model);
            const vinTail = U.upper(wanted.vinTail || '').replace(/^\.\.\./, '');

            let score = 0;
            if (year && cand.includes(year)) score += 5;
            if (make && cand.includes(make)) score += 4;
            if (model && cand.includes(model)) score += 4;
            if (vinTail && cand.includes(vinTail)) score += 3;
            return score;
        }
    };

    const Payload = {
        getBridgeRoot() {
            try {
                return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            } catch (_) {
                return window;
            }
        },

        getRaw() {
            const root = Payload.getBridgeRoot();

            if (root && typeof root.getMciSharedPayload === 'function') {
                try {
                    const payload = root.getMciSharedPayload();
                    if (payload) return payload;
                } catch (e) {
                    U.warn('getMciSharedPayload() failed:', e);
                }
            }

            try {
                const raw = localStorage.getItem(APP.key);
                if (raw) return JSON.parse(raw);
            } catch (e) {
                U.warn('localStorage fallback failed:', e);
            }

            return null;
        },

        require() {
            const payload = Payload.getRaw();
            if (!payload) {
                throw new Error('No shared payload found. Expected getMciSharedPayload() / mciMasterPayload.');
            }
            return payload;
        }
    };

    const Data = {
        stateCodeToName(code) {
            const map = {
                AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
                CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Dist Of Columbia',
                FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
                IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
                ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
                MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
                NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
                NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
                OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
                SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
                VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
                AB: 'Alberta', BC: 'British Columbia'
            };
            return map[String(code || '').toUpperCase()] || String(code || '');
        },

        mapGender(g) {
            const s = U.upper(g);
            if (s === 'M' || s === 'MALE') return { value: 'M', text: 'Male' };
            if (s === 'F' || s === 'FEMALE') return { value: 'F', text: 'Female' };
            return { value: '', text: '' };
        },

        mapMaritalStatus(ms) {
            const s = U.upper(ms);
            if (s === 'MARRIED' || s === 'M') return { value: 'M', text: 'Married' };
            if (s === 'SINGLE' || s === 'S') return { value: 'S', text: 'Single' };
            if (s === 'SEPARATED' || s === 'P') return { value: 'P', text: 'Separated' };
            if (s === 'WIDOWED' || s === 'W') return { value: 'W', text: 'Widowed' };
            if (s === 'DIVORCED' || s === 'D') return { value: 'D', text: 'Divorced' };
            return { value: '', text: '' };
        },

        mapRelationship(rel, isPrimaryNamedInsured) {
            const s = U.upper(rel);

            if (isPrimaryNamedInsured || s === 'INSURED' || s === 'SELF' || s === 'NAMED INSURED') {
                return '';
            }
            if (s === 'SPOUSE') return 'Spouse';
            if (s === 'CHILD' || s === 'SON' || s === 'DAUGHTER') return 'Child';
            if (s === 'PARENT' || s === 'MOTHER' || s === 'FATHER') return 'Parent';
            return 'Other';
        },

        inferEducation(person, payload) {
            const raw = U.cleanText(person.education || '');
            if (raw) return raw;

            const ageAtEff = Data.calcAgeOnDate(
                person.dob,
                payload && payload.meta && payload.meta.effectiveDate
            );

            if (ageAtEff != null) {
                if (ageAtEff <= 22) return 'Currently in college';
                if (ageAtEff >= 23) return 'High school diploma or GED';
            }

            return 'High school diploma or GED';
        },

        mapEducationToText(v) {
            const s = U.upper(v);
            if (!s) return '';
            if (s.includes('NO HIGH SCHOOL')) return 'No high school diploma or GED';
            if (s.includes('HIGH SCHOOL') || s.includes('GED')) return 'High school diploma or GED';
            if (s.includes('VOCATIONAL') || s.includes('TRADE') || s.includes('MILITARY')) return 'Vocational / trade school degree or military training';
            if (s.includes('COMPLETED SOME COLLEGE') || s === 'SOME COLLEGE') return 'Completed some college';
            if (s.includes('CURRENTLY IN COLLEGE')) return 'Currently in college';
            if (s.includes('COLLEGE DEGREE') || s === 'COLLEGE') return 'College degree';
            if (s.includes('GRADUATE')) return 'Graduate work or graduate degree';
            return v;
        },

        parseMmDdYyyy(s) {
            const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (!m) return null;
            const month = Number(m[1]);
            const day = Number(m[2]);
            const year = Number(m[3]);
            if (!month || !day || !year) return null;
            return new Date(year, month - 1, day);
        },

        parseMmYyyy(s) {
            const m = String(s || '').match(/^(\d{1,2})\/(\d{4})$/);
            if (!m) return null;
            return { month: Number(m[1]), year: Number(m[2]) };
        },

        calcAgeOnDate(dobStr, onDateStr) {
            const dob = Data.parseMmDdYyyy(dobStr);
            const onDate = Data.parseMmDdYyyy(onDateStr);
            if (!dob || !onDate) return null;

            let age = onDate.getFullYear() - dob.getFullYear();
            const monthDiff = onDate.getMonth() - dob.getMonth();

            if (monthDiff < 0 || (monthDiff === 0 && onDate.getDate() < dob.getDate())) {
                age -= 1;
            }
            return age;
        },

        calcAgeFirstLicensed(dobStr, firstLicensedMmYyyy) {
            const dob = Data.parseMmDdYyyy(dobStr);
            const fl = Data.parseMmYyyy(firstLicensedMmYyyy);
            if (!dob || !fl) return null;

            let age = fl.year - dob.getFullYear();
            if ((fl.month - 1) < dob.getMonth()) age -= 1;
            if (age < 0) age = 0;
            return String(age);
        },

        calcMonthsLicensedBucket(firstLicensedMmYyyy, policyEffectiveDate) {
            const fl = Data.parseMmYyyy(firstLicensedMmYyyy);
            const eff = Data.parseMmDdYyyy(policyEffectiveDate);
            if (!fl || !eff) return '';

            let months = (eff.getFullYear() - fl.year) * 12 + ((eff.getMonth() + 1) - fl.month);
            if (months < 0) months = 0;

            if (months <= 11) return '0';
            if (months <= 23) return '1';
            if (months <= 35) return '2';
            return '3';
        },

        buildVehicleLookup(payload) {
            const vehicles = Array.isArray(payload && payload.vehicles) ? payload.vehicles.slice() : [];
            const byOperator = new Map();

            for (const v of vehicles) {
                const opKey = U.normalizeName(v.primaryOperator || '');
                if (!opKey) continue;

                const entry = {
                    year: U.cleanText(v.year),
                    make: U.cleanText(v.make),
                    model: U.cleanText(v.model),
                    vin: U.cleanText(v.vin),
                    vinTail: U.cleanText(v.vinMaskedTail || '').replace(/^\.\.\./, ''),
                    raw: v
                };

                if (!byOperator.has(opKey)) byOperator.set(opKey, []);
                byOperator.get(opKey).push(entry);
            }

            return byOperator;
        },

        findPrimaryVehicleForDriver(driver, vehicleLookup) {
            const possibleNames = [
                driver.fullName,
                [driver.firstName, driver.middleName, driver.lastName].filter(Boolean).join(' '),
                [driver.firstName, driver.lastName].filter(Boolean).join(' ')
            ].map(U.normalizeName).filter(Boolean);

            for (const key of possibleNames) {
                const matches = vehicleLookup.get(key);
                if (matches && matches.length) return matches[0];
            }

            return null;
        },

        normalizeHousehold(payload) {
            const allDrivers = Array.isArray(payload && payload.drivers) ? payload.drivers.slice() : [];
            const effectiveDate = payload && payload.meta && payload.meta.effectiveDate
                ? payload.meta.effectiveDate
                : (payload && payload.coverages && payload.coverages.policy && payload.coverages.policy.effectiveDate) || '';

            const vehicleLookup = Data.buildVehicleLookup(payload);

            const people = allDrivers
                .filter(d => d && d.isHouseholdMember !== false && d.isExcluded !== true)
                .map((d, idx) => {
                    const isPrimary = !!(d.isNamedInsured && U.upper(d.relationshipToNamedInsured) === 'INSURED') || idx === 0;
                    const gender = Data.mapGender(d.gender);
                    const marital = Data.mapMaritalStatus(d.maritalStatus);
                    const relationshipText = Data.mapRelationship(d.relationshipToNamedInsured, isPrimary);
                    const licenseStateCode = U.upper(d.license && d.license.state);
                    const licenseStateText = Data.stateCodeToName(licenseStateCode);
                    const ageFirstLicensed = Data.calcAgeFirstLicensed(d.dob, d.license && d.license.dateFirstLicensed);
                    const monthsLicensedBucket = Data.calcMonthsLicensedBucket(d.license && d.license.dateFirstLicensed, effectiveDate);
                    const primaryVehicle = Data.findPrimaryVehicleForDriver(d, vehicleLookup);

                    return {
                        source: d,
                        firstName: d.firstName || '',
                        middleInitial: U.cleanText(d.middleName || '').charAt(0),
                        lastName: d.lastName || '',
                        suffix: d.suffix || '',
                        maritalStatusText: marital.text,
                        maritalStatusValue: marital.value,
                        relationshipText: relationshipText,
                        dob: d.dob || '',
                        ssn: U.digits(d.ssn || ''),
                        genderText: gender.text,
                        genderValue: gender.value,
                        educationText: Data.mapEducationToText(Data.inferEducation(d, payload)),
                        driverIncludedText: d.isExcluded ? 'Non-Rated' : 'Rated',
                        licenseTypeText: (d.license && d.license.number) ? 'Personal Auto' : 'Not Licensed/State ID',
                        licenseStatusText: (d.license && d.license.number) ? 'Valid' : 'Not Licensed/State ID',
                        licenseStateText,
                        licenseStateCode,
                        licenseNumber: d.license && d.license.number ? U.cleanText(d.license.number) : '',
                        previousLicenseStateText: 'None',
                        stateFilingValue: U.upper(d.sr22) === 'Y' ? 'Y' : 'N',
                        ageFirstLicensed: ageFirstLicensed || '',
                        monthsLicensedValue: monthsLicensedBucket || '',
                        internationalYearsLicensedText: 'None',
                        occupationText: 'Not currently employed',
                        primaryVehicle
                    };
                });

            return {
                effectiveDate,
                people
            };
        }
    };

    const Progressive = {
        isOnPage() {
            const main = U.q('main[aria-labelledby="HouseholdMembers"]');
            const h1 = U.qa('h1').find(el => U.cleanText(el.textContent) === 'Household Members');
            const nextBtn = U.byId('btnNextId');
            return !!(main || (h1 && nextBtn));
        },

        getNextButton() {
            return U.byId('btnNextId');
        },

        getAddMorePeopleButton() {
            return U.q('[analytics-id="AddMorePeople 0 Quote"]');
        },

        fieldId(index, tail) {
            return `People_Drivers_List_${index}_${tail}`;
        },

        input(index, tail) {
            return U.byId(Progressive.fieldId(index, tail));
        },

        select(index, tail) {
            return U.byId(Progressive.fieldId(index, tail));
        },

        getPersonIndexes() {
            const ids = U.qa([
                'input[id^="People_Drivers_List_"][id$="_Embedded_Questions_List_FirstName"]',
                'select[id^="People_Drivers_List_"][id*="_Embedded_Questions_List_Suffix"]'
            ].join(','))
                .map(el => {
                    const m = el.id.match(/^People_Drivers_List_(\d+)_/);
                    return m ? Number(m[1]) : null;
                })
                .filter(v => v != null);

            return Array.from(new Set(ids)).sort((a, b) => a - b);
        },

        async waitForPersonIndex(index, timeout) {
            return U.waitFor(() => {
                return (
                    U.byId(`People_Drivers_List_${index}_Embedded_Questions_List_FirstName`) ||
                    U.byId(`People_Drivers_List_${index}_Embedded_Questions_List_LastName`)
                );
            }, { timeout: timeout || 5000, interval: 60 });
        },

        async ensurePersonCount(targetCount) {
            let indexes = Progressive.getPersonIndexes();
            let tries = 0;

            while (indexes.length < targetCount && tries < 12) {
                const addBtn = Progressive.getAddMorePeopleButton();
                if (!addBtn) throw new Error('ADD MORE PEOPLE button not found.');

                const nextIndex = indexes.length;
                await U.click(addBtn);

                const added = await Progressive.waitForPersonIndex(nextIndex, 7000);
                if (!added) {
                    throw new Error(`Timed out waiting for household member block ${nextIndex}.`);
                }

                indexes = Progressive.getPersonIndexes();
                tries += 1;
            }

            if (indexes.length < targetCount) {
                throw new Error(`Unable to create enough household member blocks. Have ${indexes.length}, need ${targetCount}.`);
            }

            return indexes;
        },

        async pickReadonlyDropdownByText(inputEl, wantedTexts) {
            if (!inputEl) return false;

            const wants = (Array.isArray(wantedTexts) ? wantedTexts : [wantedTexts])
                .map(v => U.cleanText(v))
                .filter(Boolean);

            if (!wants.length) return false;

            for (const opener of U.openersForReadonlyInput(inputEl)) {
                await U.click(opener);
                await U.sleep(70);

                const picked = await U.waitFor(() => {
                    const candidates = U.getVisibleOverlayOptions();
                    for (const candidate of candidates) {
                        const txt = U.cleanText(candidate.textContent);
                        if (!txt) continue;

                        for (const want of wants) {
                            if (txt === want || U.upper(txt) === U.upper(want)) {
                                return candidate;
                            }
                        }
                    }
                    return null;
                }, { timeout: 1200, interval: 40 });

                if (picked) {
                    await U.click(picked);
                    await U.sleep(80);
                    return true;
                }
            }

            return false;
        },

        async pickPrimaryVehicle(inputEl, vehicleInfo) {
            if (!inputEl || !vehicleInfo) return false;

            for (const opener of U.openersForReadonlyInput(inputEl)) {
                await U.click(opener);
                await U.sleep(70);

                const picked = await U.waitFor(() => {
                    const candidates = U.getVisibleOverlayOptions();
                    let best = null;
                    let bestScore = 0;

                    for (const candidate of candidates) {
                        const txt = U.cleanText(candidate.textContent);
                        if (!txt) continue;

                        const score = U.scoreVehicleOptionText(txt, vehicleInfo);
                        if (score > bestScore) {
                            bestScore = score;
                            best = candidate;
                        }
                    }

                    return bestScore >= 8 ? best : null;
                }, { timeout: 1400, interval: 40 });

                if (picked) {
                    await U.click(picked);
                    await U.sleep(80);
                    return true;
                }
            }

            return false;
        },

        hasStateFilingRadio(index) {
            const radios = U.qa(`input[type="radio"][name="${CSS.escape(Progressive.fieldId(index, 'Embedded_Questions_List_StateFiling'))}"]`);
            return radios.length > 0;
        },

        async setStateFiling(index, value) {
            const groupName = Progressive.fieldId(index, 'Embedded_Questions_List_StateFiling');
            const radios = U.qa(`input[type="radio"][name="${CSS.escape(groupName)}"]`);
            if (!radios.length) return false;

            const target = radios.find(r => {
                const val = U.upper(r.value);
                return val === U.upper(value) || (U.upper(value) === 'Y' && val === 'YES') || (U.upper(value) === 'N' && val === 'NO');
            });

            if (!target) return false;

            target.click();
            U.fire(target, 'change');
            await U.sleep(40);
            return true;
        },

        async fillPerson(index, person, opts) {
            const dryRun = !!(opts && opts.dryRun);
            const prefix = `[#${index}] ${person.firstName} ${person.lastName}`.trim();

            const doInput = async (idTail, value) => {
                if (value == null || value === '') return;
                const el = Progressive.input(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'INPUT', idTail, value);
                    return;
                }

                U.setInput(el, value);
                await U.sleep(10);
            };

            const doSelect = async (idTail, value, text) => {
                if ((!value && !text) || (value == null && text == null)) return;
                const el = Progressive.select(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'SELECT', idTail, value || text);
                    return;
                }

                const ok = U.setSelect(el, value, text);
                if (!ok) {
                    U.warn(prefix, 'No select option match for', idTail, value || text);
                }
                await U.sleep(15);
            };

            const doReadonlyDropdown = async (idTail, texts) => {
                const list = (Array.isArray(texts) ? texts : [texts]).map(U.cleanText).filter(Boolean);
                if (!list.length) return;

                const el = Progressive.input(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'READONLY DROPDOWN', idTail, list);
                    return;
                }

                const ok = await Progressive.pickReadonlyDropdownByText(el, list);
                if (!ok) {
                    U.warn(prefix, 'Readonly dropdown selection failed for', idTail, list);
                }
            };

            const doVehicleDropdown = async (idTail, vehicleInfo) => {
                if (!vehicleInfo) return;

                const el = Progressive.input(index, idTail);
                if (!el) return;

                if (dryRun) {
                    U.log(prefix, 'VEHICLE DROPDOWN', idTail, {
                        year: vehicleInfo.year,
                        make: vehicleInfo.make,
                        model: vehicleInfo.model,
                        vinTail: vehicleInfo.vinTail
                    });
                    return;
                }

                const ok = await Progressive.pickPrimaryVehicle(el, vehicleInfo);
                if (!ok) {
                    U.warn(prefix, 'Primary vehicle selection failed for', idTail, vehicleInfo);
                }
            };

            await doInput('Embedded_Questions_List_FirstName', person.firstName);
            await doInput('Embedded_Questions_List_MiddleInitial', person.middleInitial);
            await doInput('Embedded_Questions_List_LastName', person.lastName);
            await doSelect('Embedded_Questions_List_Suffix', person.suffix, person.suffix);
            await doSelect('Embedded_Questions_List_MaritalStatus', person.maritalStatusValue, person.maritalStatusText);

            if (person.relationshipText) {
                await doReadonlyDropdown('Embedded_Questions_List_Relationship', [person.relationshipText]);
            }

            await doInput('Embedded_Questions_List_DateOfBirth', person.dob);
            await doInput('Embedded_Questions_List_SocialSecurityNumber', person.ssn);
            await doSelect('Embedded_Questions_List_Gender', person.genderValue, person.genderText);
            await doSelect('Embedded_Questions_List_HighestLevelOfEducation', '', person.educationText);

            await doSelect('ProductSpecificInformation_List_0_Embedded_Questions_List_DriverIncluded', '', person.driverIncludedText);
            await doSelect('Embedded_Questions_List_LicenseType', '', person.licenseTypeText);
            await doSelect('Embedded_Questions_List_LicenseStatus', '', person.licenseStatusText);

            await doReadonlyDropdown('Embedded_Questions_List_LicenseState', [
                person.licenseStateText,
                person.licenseStateCode
            ]);

            await doInput('Embedded_Questions_List_LicenseNumber', person.licenseNumber);
            await doSelect('Embedded_Questions_List_DriverPreviousLicenseState', '', person.previousLicenseStateText);

            if (Progressive.hasStateFilingRadio(index)) {
                const sfOk = dryRun ? true : await Progressive.setStateFiling(index, person.stateFilingValue);
                if (dryRun) {
                    U.log(prefix, 'RADIO', 'Embedded_Questions_List_StateFiling', person.stateFilingValue);
                } else if (!sfOk) {
                    U.warn(prefix, 'State Filing radio not set:', person.stateFilingValue);
                }
            }

            await doInput('ProductSpecificInformation_List_0_Embedded_Questions_List_AgeFirstLicensed', person.ageFirstLicensed);
            await doSelect('ProductSpecificInformation_List_0_Embedded_Questions_List_DriverMonthsLicensed', person.monthsLicensedValue, person.monthsLicensedValue);
            await doSelect('ProductSpecificInformation_List_0_Embedded_Questions_List_DrvrYearsLicIntl', '', person.internationalYearsLicensedText);

            await doVehicleDropdown('ProductSpecificInformation_List_0_Embedded_Questions_List_VehicleUseMost', person.primaryVehicle);
        }
    };

    const Fill = {
        async run(opts) {
            const options = Object.assign({ dryRun: true }, opts || {});

            if (!Progressive.isOnPage()) {
                throw new Error('Not on Progressive Household Members page.');
            }

            const payload = Payload.require();
            const data = Data.normalizeHousehold(payload);

            if (!data.people.length) {
                throw new Error('No household members found in Erie payload.');
            }

            U.log('Starting fill.', {
                dryRun: options.dryRun,
                effectiveDate: data.effectiveDate,
                householdCount: data.people.length,
                names: data.people.map(p => `${p.firstName} ${p.lastName}`)
            });

            await Progressive.ensurePersonCount(data.people.length);

            for (let i = 0; i < data.people.length; i += 1) {
                await Progressive.waitForPersonIndex(i, 5000);
                await Progressive.fillPerson(i, data.people[i], options);
            }

            return {
                ok: true,
                dryRun: !!options.dryRun,
                page: APP.pageId,
                householdCount: data.people.length,
                effectiveDate: data.effectiveDate,
                people: data.people.map((p, idx) => ({
                    index: idx,
                    name: `${p.firstName} ${p.lastName}`.trim(),
                    relationship: p.relationshipText,
                    dob: p.dob,
                    driverStatus: p.driverIncludedText,
                    licenseState: p.licenseStateText,
                    ageFirstLicensed: p.ageFirstLicensed,
                    monthsLicensedValue: p.monthsLicensedValue,
                    primaryVehicle: p.primaryVehicle ? `${p.primaryVehicle.year} ${p.primaryVehicle.make} ${p.primaryVehicle.model}` : ''
                }))
            };
        },

        async goNext(opts) {
            const options = Object.assign({ dryRun: false, skipFill: false }, opts || {});

            if (!Progressive.isOnPage()) {
                throw new Error('Not on Progressive Household Members page.');
            }

            let fillResult = null;

            if (!options.skipFill) {
                fillResult = await Fill.run({ dryRun: false });
            }

            const nextBtn = Progressive.getNextButton();
            if (!nextBtn) throw new Error('Next button (#btnNextId) not found.');

            await U.click(nextBtn);

            return {
                ok: true,
                clickedNext: true,
                fillResult
            };
        }
    };

    async function testProgressiveHouseholdMembers(opts) {
        return Fill.run(Object.assign({ dryRun: true }, opts || {}));
    }

    async function goNextProgressiveHouseholdMembers(opts) {
        return Fill.goNext(Object.assign({ dryRun: false }, opts || {}));
    }

    const root = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    root.testProgressiveHouseholdMembers = testProgressiveHouseholdMembers;
    root.goNextProgressiveHouseholdMembers = goNextProgressiveHouseholdMembers;

    U.log(`Loaded v${APP.version}. Run testProgressiveHouseholdMembers({ dryRun: true|false }) or goNextProgressiveHouseholdMembers().`);
})();
