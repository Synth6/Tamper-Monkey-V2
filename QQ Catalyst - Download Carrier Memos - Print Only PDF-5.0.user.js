// ==UserScript==
// @name         QQ Catalyst - Download Carrier Memos - Print Only PD
// @namespace    https://middlecreekins.com/
// @version      6.0
// @description  Select, group, and combine QQ Catalyst Print Only transactions into clean PDFs.
// @match        https://app.qqcatalyst.com/CarrierDownloads/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const PAGE_WAIT_MS = 500;
    const FILE_WAIT_MS = 150;

    /*
     * Keeps the user's selections while moving between QQ pages.
     *
     * Key   = transaction ID
     * Value = transaction information gathered from the row
     */
    const selectedItems = new Map();

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getPrintOnlySection() {
        return document.querySelector('#PrintOnly');
    }

    function getCurrentPage() {
        const input = document.querySelector(
            '#PrintOnly input.current-page'
        );

        return input ? Number(input.value) : 1;
    }

    function getTotalItems() {
        const input = document.querySelector(
            '#PrintOnly input.total-items'
        );

        return input ? Number(input.value) : 0;
    }

    function getPageSize() {
        const input = document.querySelector(
            '#PrintOnly input.page-size'
        );

        return input ? Number(input.value) : 10;
    }

    function cleanFileName(name) {
        return String(name || '')
            .replace(/[<>:"/\\|?*]+/g, '_')
            .trim();
    }

    function getDateStamp() {
        const now = new Date();

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }

        const text = String(value).trim();

        let match = text.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        if (match) {
            return `${match[2]}/${match[3]}/${match[1]}`;
        }

        match = text.match(
            /^(\d{4})(\d{2})(\d{2})$/
        );

        if (match) {
            return `${match[2]}/${match[3]}/${match[1]}`;
        }

        return text;
    }

    function parseDateForSort(value) {
        if (!value) {
            return Number.MAX_SAFE_INTEGER;
        }

        const text = String(value).trim();

        let match = text.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        if (match) {
            return new Date(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3])
            ).getTime();
        }

        match = text.match(
            /^(\d{4})(\d{2})(\d{2})$/
        );

        if (match) {
            return new Date(
                Number(match[1]),
                Number(match[2]) - 1,
                Number(match[3])
            ).getTime();
        }

        match = text.match(
            /^(\d{2})\/(\d{2})\/(\d{4})/
        );

        if (match) {
            return new Date(
                Number(match[3]),
                Number(match[1]) - 1,
                Number(match[2])
            ).getTime();
        }

        const parsed = Date.parse(text);

        if (!Number.isNaN(parsed)) {
            return parsed;
        }

        return Number.MAX_SAFE_INTEGER;
    }

    function normalizeCustomerName(name) {
        return String(name || '')
            .toUpperCase()
            .replace(/[.,]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function waitForPage(expectedPage, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const timer = setInterval(() => {
                const currentPage = getCurrentPage();

                if (currentPage === expectedPage) {
                    clearInterval(timer);

                    setTimeout(resolve, PAGE_WAIT_MS);
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    clearInterval(timer);

                    reject(
                        new Error(
                            `Timed out waiting for Print Only page ${expectedPage}.`
                        )
                    );
                }
            }, 100);
        });
    }

    function getItemFromRow(row) {
        const dataCell = row.querySelector(
            '.cd-trans-list[data-transactionid]'
        );

        if (!dataCell) {
            return null;
        }

        const transactionId =
            dataCell.dataset.transactionid || '';

        if (!transactionId) {
            return null;
        }

        const fileLink = row.querySelector(
            '.cd-file-name a'
        );

        const downloadLink = row.querySelector(
            'a[href*="/CarrierDownloads/Transaction/PrintAl3File?transactionId="]'
        );

        const fileName =
            fileLink?.textContent?.trim() ||
            dataCell.dataset.filename ||
            `Transaction_${transactionId}.txt`;

        const downloadDate =
            row.querySelector('.cd-file-date')?.textContent?.trim() ||
            dataCell.dataset.filedate ||
            '';

        const effectiveDate =
            row.querySelector('.cd-effective-date')?.textContent?.trim() ||
            '';

        const transactionType =
            row.querySelector('.cd-trans-type')?.textContent?.trim() ||
            '';

        const sequence =
            row.querySelector('.cd-sequence-in-file')?.textContent?.trim() ||
            dataCell.dataset.sequence ||
            '';

        const downloadUrl =
            downloadLink?.href ||
            `${location.origin}/CarrierDownloads/Transaction/PrintAl3File?transactionId=${encodeURIComponent(transactionId)}`;

        return {
            transactionId,
            fileName,
            downloadDate,
            effectiveDate,
            transactionType,
            sequence,
            downloadUrl
        };
    }

    function collectCurrentPageItems(results) {
        const rows = document.querySelectorAll(
            '#PrintOnly table#cd-print-only-transactions-list tbody > tr.search-results-row'
        );

        rows.forEach(row => {
            const item = getItemFromRow(row);

            if (!item) {
                return;
            }

            if (!results.has(item.transactionId)) {
                results.set(
                    item.transactionId,
                    item
                );
            }
        });
    }

    function updateSelectedCount() {
        const countDisplay = document.querySelector(
            '#mci-print-only-selected-count'
        );

        if (countDisplay) {
            const count = selectedItems.size;

            countDisplay.textContent =
                `${count} selected`;
        }

        const selectedButton = document.querySelector(
            '#mci-download-selected-pdf'
        );

        if (selectedButton) {
            selectedButton.disabled =
                selectedItems.size === 0;

            selectedButton.style.opacity =
                selectedItems.size === 0
                    ? '0.55'
                    : '1';

            selectedButton.style.cursor =
                selectedItems.size === 0
                    ? 'default'
                    : 'pointer';
        }
    }

    function syncVisibleCheckboxes() {
        const rows = document.querySelectorAll(
            '#PrintOnly table#cd-print-only-transactions-list tbody > tr.search-results-row'
        );

        rows.forEach(row => {
            const item = getItemFromRow(row);

            if (!item) {
                return;
            }

            const checkbox = row.querySelector(
                '.mci-print-only-checkbox'
            );

            if (!checkbox) {
                return;
            }

            checkbox.checked =
                selectedItems.has(
                    item.transactionId
                );
        });

        updateSelectedCount();
    }

    function addCheckboxesToRows() {
        const rows = document.querySelectorAll(
            '#PrintOnly table#cd-print-only-transactions-list tbody > tr.search-results-row'
        );

        rows.forEach(row => {
            const item = getItemFromRow(row);

            if (!item) {
                return;
            }

            if (
                row.querySelector(
                    '.mci-print-only-checkbox'
                )
            ) {
                return;
            }

            const fileCell = row.querySelector(
                '.cd-file-name'
            );

            if (!fileCell) {
                return;
            }

            const wrapper =
                document.createElement('span');

            wrapper.className =
                'mci-print-only-checkbox-wrapper';

            wrapper.style.display =
                'inline-block';

            wrapper.style.marginRight =
                '8px';

            wrapper.style.verticalAlign =
                'middle';

            const checkbox =
                document.createElement('input');

            checkbox.type =
                'checkbox';

            checkbox.className =
                'mci-print-only-checkbox';

            checkbox.dataset.transactionId =
                item.transactionId;

            checkbox.checked =
                selectedItems.has(
                    item.transactionId
                );

            checkbox.style.width =
                '16px';

            checkbox.style.height =
                '16px';

            checkbox.style.cursor =
                'pointer';

            checkbox.style.verticalAlign =
                'middle';

            checkbox.addEventListener(
                'change',
                function () {
                    if (checkbox.checked) {
                        selectedItems.set(
                            item.transactionId,
                            item
                        );
                    } else {
                        selectedItems.delete(
                            item.transactionId
                        );
                    }

                    updateSelectedCount();
                }
            );

            wrapper.appendChild(
                checkbox
            );

            fileCell.insertBefore(
                wrapper,
                fileCell.firstChild
            );
        });

        syncVisibleCheckboxes();
    }

    function selectVisiblePage() {
        const rows = document.querySelectorAll(
            '#PrintOnly table#cd-print-only-transactions-list tbody > tr.search-results-row'
        );

        rows.forEach(row => {
            const item = getItemFromRow(row);

            if (!item) {
                return;
            }

            selectedItems.set(
                item.transactionId,
                item
            );
        });

        syncVisibleCheckboxes();
    }

    function clearSelection() {
        selectedItems.clear();

        syncVisibleCheckboxes();
    }

    async function goToNextPage() {
        const section = getPrintOnlySection();

        if (!section) {
            return false;
        }

        const currentPage =
            getCurrentPage();

        const nextLink = section.querySelector(
            '.pagination a.nextPage'
        );

        if (!nextLink) {
            return false;
        }

        nextLink.click();

        await waitForPage(
            currentPage + 1
        );

        addCheckboxesToRows();

        return true;
    }

    async function collectAllPrintOnlyItems(button) {
        const results =
            new Map();

        const totalItems =
            getTotalItems();

        const pageSize =
            getPageSize();

        const totalPages =
            Math.max(
                1,
                Math.ceil(
                    totalItems / pageSize
                )
            );

        if (getCurrentPage() !== 1) {
            alert(
                'Please go to page 1 of the Print Only section before downloading all reports.'
            );

            return null;
        }

        for (
            let page = 1;
            page <= totalPages;
            page++
        ) {
            button.textContent =
                `Reading page ${page} of ${totalPages}...`;

            collectCurrentPageItems(
                results
            );

            if (page < totalPages) {
                const moved =
                    await goToNextPage();

                if (!moved) {
                    throw new Error(
                        `Could not move to Print Only page ${page + 1}.`
                    );
                }
            }
        }

        return Array.from(
            results.values()
        );
    }

    async function fetchTextFiles(
        items,
        button
    ) {
        for (
            let i = 0;
            i < items.length;
            i++
        ) {
            const item =
                items[i];

            button.textContent =
                `Downloading report ${i + 1} of ${items.length}...`;

            try {
                const response =
                    await fetch(
                        item.downloadUrl,
                        {
                            method: 'GET',
                            credentials: 'include'
                        }
                    );

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

                item.textContents =
                    await response.text();
            } catch (error) {
                console.error(
                    `Could not retrieve transaction ${item.transactionId}:`,
                    error
                );

                item.textContents =
                    `Unable to retrieve this report.\n\n` +
                    `Transaction ID: ${item.transactionId}\n` +
                    `Error: ${error.message}`;
            }

            await delay(
                FILE_WAIT_MS
            );
        }
    }

    function normalizeText(text) {
        const lines = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\t/g, '    ')
            .split('\n');

        const cleanedLines = [];

        for (let line of lines) {
            line = line.replace(
                /^\s*[A-Z0-9]{6,10}\s+\d+\s+\d{3}/,
                ''
            );

            line = line.replace(
                /^\s*\d[A-Z0-9]{5,9}\s+\d+\s+\d{3}/,
                ''
            );

            const trimmed =
                line.trim();

            if (
                /^2TRG/i.test(trimmed) ||
                /^2TCG/i.test(trimmed) ||
                /^5PSU/i.test(trimmed) ||
                /^7O$/i.test(trimmed) ||
                /^\d+\s+1006AC$/i.test(trimmed) ||
                /^\d{10,}.*\d{6,}/.test(trimmed)
            ) {
                continue;
            }

            cleanedLines.push(
                line.trimEnd()
            );
        }

        return cleanedLines
            .join('\n')
            .replace(
                /\n{3,}/g,
                '\n\n'
            )
            .trim();
    }

    function getMatch(
        text,
        regex
    ) {
        const match =
            text.match(regex);

        return match
            ? String(
                match[1] || ''
            ).trim()
            : '';
    }

    function parseUnderwritingMemo(text) {
        const report = {
            type: 'UNDERWRITING MEMO',
            insured: '',
            policyNumber: '',
            policyEffectiveDate: '',
            noticeDate: '',
            agent: '',
            addressLines: [],
            body: ''
        };

        report.noticeDate =
            getMatch(
                text,
                /^DATE\.*:\s*(.+)$/mi
            );

        report.policyNumber =
            getMatch(
                text,
                /^POLICY NUMBER:\s*(.+)$/mi
            );

        report.policyEffectiveDate =
            getMatch(
                text,
                /^POLICY EFFECTIVE DATE:\s*(.+)$/mi
            );

        report.insured =
            getMatch(
                text,
                /^INSURED\.*:\s*(.+)$/mi
            );

        report.agent =
            getMatch(
                text,
                /^AGENT\/BROKER\.*:\s*(.+)$/mi
            );

        const lines =
            text.split('\n');

        const agentIndex =
            lines.findIndex(
                line =>
                    /^AGENT\/BROKER\.*:/i.test(
                        line.trim()
                    )
            );

        if (agentIndex >= 0) {
            const repeatedName =
                lines[
                    agentIndex + 1
                ]?.trim() || '';

            const streetLine =
                lines[
                    agentIndex + 2
                ]?.trim() || '';

            const cityLine =
                lines[
                    agentIndex + 3
                ]?.trim() || '';

            if (
                repeatedName &&
                normalizeCustomerName(
                    repeatedName
                ) ===
                normalizeCustomerName(
                    report.insured
                )
            ) {
                if (streetLine) {
                    report.addressLines.push(
                        streetLine
                    );
                }

                if (cityLine) {
                    report.addressLines.push(
                        cityLine
                    );
                }
            }
        }

        const knownHeadings = [
            'Important information',
            'Your immediate action is required',
            'Your Paperless Discount',
            'Please provide',
            'Please send',
            'We made a change',
            'Confirmation of electronic funds transfer'
        ];

        let bodyStart = -1;

        for (
            let i = 0;
            i < lines.length;
            i++
        ) {
            const value =
                lines[i].trim();

            if (
                knownHeadings.some(
                    heading =>
                        value
                            .toLowerCase()
                            .startsWith(
                                heading.toLowerCase()
                            )
                )
            ) {
                bodyStart = i;
                break;
            }
        }

        if (
            bodyStart < 0 &&
            agentIndex >= 0
        ) {
            bodyStart =
                agentIndex + 4;
        }

        if (bodyStart >= 0) {
            report.body =
                lines
                    .slice(bodyStart)
                    .join('\n')
                    .trim();
        }

        return report;
    }

    function parseCancelNotice(text) {
        const report = {
            type: 'CANCEL / LAPSE NOTICE',
            insured: '',
            policyNumber: '',
            effectiveDate: '',
            minimumDue: '',
            notice: '',
            agent: '',
            body: ''
        };

        const lines =
            text
                .split('\n')
                .map(
                    line =>
                        line.trim()
                )
                .filter(Boolean);

        const headerIndex =
            lines.findIndex(
                line =>
                    /^POLICY#\s+NAME\s+EFF DATE/i.test(
                        line
                    )
            );

        let dataLine = '';

        if (
            headerIndex >= 0 &&
            lines[
                headerIndex + 1
            ]
        ) {
            dataLine =
                lines[
                    headerIndex + 1
                ];
        }

        const rowMatch =
            dataLine.match(
                /^(\S+)\s+(.+?)\s+(\d{8}|\d{4}-\d{2}-\d{2})\s+(\$[\d,.]+)\s+(\S+)\s+(\S+)$/
            );

        if (rowMatch) {
            report.policyNumber =
                rowMatch[1] || '';

            report.insured =
                rowMatch[2] || '';

            report.effectiveDate =
                rowMatch[3] || '';

            report.minimumDue =
                rowMatch[4] || '';

            report.notice =
                rowMatch[5] || '';

            report.agent =
                rowMatch[6] || '';
        } else {
            const fallback =
                dataLine.match(
                    /^(\S+)\s+(.+?)\s+(\$[\d,.]+)\s+(\S+)\s+(\S+)$/
                );

            if (fallback) {
                report.policyNumber =
                    fallback[1] || '';

                report.insured =
                    fallback[2] || '';

                report.minimumDue =
                    fallback[3] || '';

                report.notice =
                    fallback[4] || '';

                report.agent =
                    fallback[5] || '';
            }
        }

        report.body =
            'This transaction was delivered by QQ Catalyst as a Print Only cancel/lapse notice.';

        return report;
    }

    function parseReport(item) {
        const cleanedText =
            normalizeText(
                item.textContents
            );

        let parsed;

        if (
            /PROGRESSIVE CANCEL\/LAPSE NOTICE REPORT/i.test(
                cleanedText
            )
        ) {
            parsed =
                parseCancelNotice(
                    cleanedText
                );
        } else {
            parsed =
                parseUnderwritingMemo(
                    cleanedText
                );
        }

        parsed.transactionId =
            item.transactionId;

        parsed.fileName =
            item.fileName;

        parsed.downloadDate =
            item.downloadDate;

        parsed.sequence =
            item.sequence;

        parsed.rawText =
            cleanedText;

        parsed.originalEffectiveDate =
            item.effectiveDate;

        return parsed;
    }

    function getReportSortDate(report) {
        const noticeDate =
            parseDateForSort(
                report.noticeDate
            );

        if (
            noticeDate <
            Number.MAX_SAFE_INTEGER
        ) {
            return noticeDate;
        }

        const downloadDate =
            parseDateForSort(
                report.downloadDate
            );

        if (
            downloadDate <
            Number.MAX_SAFE_INTEGER
        ) {
            return downloadDate;
        }

        return parseDateForSort(
            report.effectiveDate ||
            report.policyEffectiveDate ||
            report.originalEffectiveDate
        );
    }

    function groupReportsByCustomer(items) {
        const customerMap =
            new Map();

        items.forEach(item => {
            const report =
                parseReport(item);

            const customerName =
                report.insured ||
                'UNKNOWN CUSTOMER';

            const customerKey =
                normalizeCustomerName(
                    customerName
                );

            if (
                !customerMap.has(
                    customerKey
                )
            ) {
                customerMap.set(
                    customerKey,
                    {
                        name: customerName,
                        policies: new Map()
                    }
                );
            }

            const customer =
                customerMap.get(
                    customerKey
                );

            const policyNumber =
                report.policyNumber ||
                'UNKNOWN POLICY';

            const policyKey =
                policyNumber
                    .toUpperCase()
                    .replace(
                        /\s+/g,
                        ''
                    );

            if (
                !customer.policies.has(
                    policyKey
                )
            ) {
                customer.policies.set(
                    policyKey,
                    {
                        policyNumber,
                        reports: []
                    }
                );
            }

            customer.policies
                .get(policyKey)
                .reports
                .push(report);
        });

        const customers =
            Array.from(
                customerMap.values()
            );

        customers.forEach(customer => {
            customer.policies =
                Array.from(
                    customer.policies.values()
                );

            customer.policies.forEach(
                policy => {
                    policy.reports.sort(
                        (a, b) =>
                            getReportSortDate(a) -
                            getReportSortDate(b)
                    );
                }
            );

            customer.policies.sort(
                (a, b) => {
                    const aDate =
                        a.reports.length
                            ? getReportSortDate(
                                a.reports[0]
                            )
                            : Number.MAX_SAFE_INTEGER;

                    const bDate =
                        b.reports.length
                            ? getReportSortDate(
                                b.reports[0]
                            )
                            : Number.MAX_SAFE_INTEGER;

                    return aDate - bDate;
                }
            );
        });

        customers.sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name,
                    undefined,
                    {
                        sensitivity:
                            'base'
                    }
                )
        );

        return customers;
    }

    function drawTopBrand(pdf) {
        const pageWidth =
            pdf.internal.pageSize.getWidth();

        pdf.setFont(
            'helvetica',
            'bold'
        );

        pdf.setFontSize(8);

        pdf.text(
            'QQ CATALYST - PRINT ONLY',
            40,
            27
        );

        pdf.setDrawColor(185);

        pdf.line(
            40,
            33,
            pageWidth - 40,
            33
        );
    }

    function drawCustomerPacketHeader(
        pdf,
        customer,
        customerNumber,
        customerCount
    ) {
        const pageWidth =
            pdf.internal.pageSize.getWidth();

        let y = 63;

        pdf.setFont(
            'helvetica',
            'bold'
        );

        pdf.setFontSize(20);

        pdf.text(
            customer.name ||
            'UNKNOWN CUSTOMER',
            45,
            y
        );

        y += 20;

        pdf.setFont(
            'helvetica',
            'normal'
        );

        pdf.setFontSize(8);

        const policyCount =
            customer.policies.length;

        const reportCount =
            customer.policies.reduce(
                (total, policy) =>
                    total +
                    policy.reports.length,
                0
            );

        pdf.text(
            `Customer ${customerNumber} of ${customerCount}  |  ` +
            `${policyCount} ${policyCount === 1 ? 'Policy' : 'Policies'}  |  ` +
            `${reportCount} ${reportCount === 1 ? 'Report' : 'Reports'}`,
            45,
            y
        );

        y += 14;

        pdf.setDrawColor(125);
        pdf.setLineWidth(1.2);

        pdf.line(
            45,
            y,
            pageWidth - 45,
            y
        );

        return y + 18;
    }

    function drawPolicyHeader(
        pdf,
        policyNumber,
        y
    ) {
        const pageWidth =
            pdf.internal.pageSize.getWidth();

        pdf.setFillColor(
            235,
            235,
            235
        );

        pdf.roundedRect(
            45,
            y,
            pageWidth - 90,
            27,
            4,
            4,
            'F'
        );

        pdf.setFont(
            'helvetica',
            'bold'
        );

        pdf.setFontSize(11);

        pdf.text(
            `POLICY ${policyNumber}`,
            55,
            y + 18
        );

        return y + 40;
    }

    function drawReportHeader(
        pdf,
        report,
        y
    ) {
        const pageWidth =
            pdf.internal.pageSize.getWidth();

        pdf.setFont(
            'helvetica',
            'bold'
        );

        pdf.setFontSize(11);

        pdf.text(
            report.type,
            50,
            y
        );

        const sortDate =
            report.noticeDate ||
            report.effectiveDate ||
            report.downloadDate ||
            '';

        if (sortDate) {
            pdf.setFont(
                'helvetica',
                'normal'
            );

            pdf.setFontSize(9);

            const displayDate =
                formatDate(
                    String(sortDate)
                        .split(' ')[0]
                );

            pdf.text(
                displayDate,
                pageWidth - 50,
                y,
                {
                    align: 'right'
                }
            );
        }

        y += 10;

        pdf.setDrawColor(205);
        pdf.setLineWidth(0.5);

        pdf.line(
            50,
            y,
            pageWidth - 50,
            y
        );

        return y + 16;
    }

    function drawReportInfo(
        pdf,
        report,
        startY
    ) {
        const pageWidth =
            pdf.internal.pageSize.getWidth();

        let y =
            startY;

        const leftX =
            50;

        const rightX =
            pageWidth / 2 + 5;

        pdf.setFontSize(8.5);

        if (
            report.type ===
            'CANCEL / LAPSE NOTICE'
        ) {
            if (report.effectiveDate) {
                pdf.setFont(
                    'helvetica',
                    'bold'
                );

                pdf.text(
                    'Effective Date:',
                    leftX,
                    y
                );

                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                pdf.text(
                    formatDate(
                        report.effectiveDate
                    ),
                    leftX + 66,
                    y
                );
            }

            if (report.minimumDue) {
                pdf.setFont(
                    'helvetica',
                    'bold'
                );

                pdf.text(
                    'Minimum Due:',
                    rightX,
                    y
                );

                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                pdf.text(
                    report.minimumDue,
                    rightX + 63,
                    y
                );
            }

            y += 15;

            if (report.notice) {
                pdf.setFont(
                    'helvetica',
                    'bold'
                );

                pdf.text(
                    'Notice:',
                    leftX,
                    y
                );

                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                pdf.text(
                    report.notice,
                    leftX + 36,
                    y
                );
            }

            if (report.agent) {
                pdf.setFont(
                    'helvetica',
                    'bold'
                );

                pdf.text(
                    'Agent:',
                    rightX,
                    y
                );

                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                pdf.text(
                    report.agent,
                    rightX + 34,
                    y
                );
            }
        } else {
            if (report.noticeDate) {
                pdf.setFont(
                    'helvetica',
                    'bold'
                );

                pdf.text(
                    'Notice Date:',
                    leftX,
                    y
                );

                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                pdf.text(
                    formatDate(
                        report.noticeDate
                    ),
                    leftX + 60,
                    y
                );
            }

            if (
                report.policyEffectiveDate
            ) {
                pdf.setFont(
                    'helvetica',
                    'bold'
                );

                pdf.text(
                    'Policy Effective:',
                    rightX,
                    y
                );

                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                pdf.text(
                    formatDate(
                        report.policyEffectiveDate
                    ),
                    rightX + 80,
                    y
                );
            }

            y += 15;

            if (report.agent) {
                pdf.setFont(
                    'helvetica',
                    'bold'
                );

                pdf.text(
                    'Agent/Broker:',
                    leftX,
                    y
                );

                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                pdf.text(
                    report.agent,
                    leftX + 68,
                    y
                );
            }

            if (
                report.addressLines &&
                report.addressLines.length
            ) {
                pdf.setFont(
                    'helvetica',
                    'normal'
                );

                const address =
                    report.addressLines.join(
                        ', '
                    );

                const wrapped =
                    pdf.splitTextToSize(
                        address,
                        210
                    );

                pdf.text(
                    wrapped,
                    rightX,
                    y
                );
            }
        }

        return y + 22;
    }

    function drawBodyText(
        pdf,
        report,
        startY,
        customerName,
        policyNumber
    ) {
        const pageWidth =
            pdf.internal.pageSize.getWidth();

        const pageHeight =
            pdf.internal.pageSize.getHeight();

        const leftMargin =
            55;

        const rightMargin =
            55;

        const bottomMargin =
            48;

        const usableWidth =
            pageWidth -
            leftMargin -
            rightMargin;

        let y =
            startY;

        const body =
            report.body ||
            report.rawText ||
            '';

        const paragraphs =
            body.split('\n');

        const lineHeight =
            13;

        pdf.setFontSize(
            9.5
        );

        for (
            const rawParagraph
            of paragraphs
        ) {
            const paragraph =
                rawParagraph.trim();

            if (!paragraph) {
                y += 5;
                continue;
            }

            const isHeading =
                paragraph.length < 80 &&
                (
                    /^(Important|Your |Please |Confirmation|We made|Driver Name|Bank Information|Category )/i.test(
                        paragraph
                    ) ||
                    /^[A-Z][A-Za-z /()'-]+:$/.test(
                        paragraph
                    )
                );

            pdf.setFont(
                'helvetica',
                isHeading
                    ? 'bold'
                    : 'normal'
            );

            const wrapped =
                pdf.splitTextToSize(
                    paragraph,
                    usableWidth
                );

            for (
                const line
                of wrapped
            ) {
                if (
                    y + lineHeight >
                    pageHeight -
                    bottomMargin
                ) {
                    pdf.addPage();

                    drawTopBrand(
                        pdf
                    );

                    pdf.setFont(
                        'helvetica',
                        'bold'
                    );

                    pdf.setFontSize(
                        11
                    );

                    pdf.text(
                        customerName,
                        45,
                        56
                    );

                    pdf.setFont(
                        'helvetica',
                        'normal'
                    );

                    pdf.setFontSize(
                        8
                    );

                    pdf.text(
                        `Policy ${policyNumber} - continued`,
                        45,
                        70
                    );

                    pdf.setDrawColor(
                        205
                    );

                    pdf.line(
                        45,
                        77,
                        pageWidth - 45,
                        77
                    );

                    y = 95;

                    pdf.setFontSize(
                        9.5
                    );

                    pdf.setFont(
                        'helvetica',
                        isHeading
                            ? 'bold'
                            : 'normal'
                    );
                }

                pdf.text(
                    line,
                    leftMargin,
                    y
                );

                y +=
                    lineHeight;
            }

            y += isHeading
                ? 5
                : 3;
        }

        return y;
    }

    function ensureRoom(
        pdf,
        y,
        requiredHeight
    ) {
        const pageHeight =
            pdf.internal.pageSize.getHeight();

        if (
            y + requiredHeight >
            pageHeight - 45
        ) {
            pdf.addPage();

            drawTopBrand(
                pdf
            );

            return 55;
        }

        return y;
    }

    function addCustomerToPdf(
        pdf,
        customer,
        customerIndex,
        customerCount,
        isFirstCustomer
    ) {
        if (!isFirstCustomer) {
            pdf.addPage();
        }

        drawTopBrand(
            pdf
        );

        let y =
            drawCustomerPacketHeader(
                pdf,
                customer,
                customerIndex + 1,
                customerCount
            );

        customer.policies.forEach(
            (policy, policyIndex) => {
                y = ensureRoom(
                    pdf,
                    y,
                    75
                );

                y = drawPolicyHeader(
                    pdf,
                    policy.policyNumber,
                    y
                );

                policy.reports.forEach(
                    (report, reportIndex) => {
                        y = ensureRoom(
                            pdf,
                            y,
                            140
                        );

                        y = drawReportHeader(
                            pdf,
                            report,
                            y
                        );

                        y = drawReportInfo(
                            pdf,
                            report,
                            y
                        );

                        y = drawBodyText(
                            pdf,
                            report,
                            y,
                            customer.name,
                            policy.policyNumber
                        );

                        if (
                            reportIndex <
                            policy.reports.length - 1
                        ) {
                            y += 13;

                            y = ensureRoom(
                                pdf,
                                y,
                                30
                            );

                            const pageWidth =
                                pdf.internal.pageSize.getWidth();

                            pdf.setDrawColor(
                                220
                            );

                            pdf.setLineDashPattern(
                                [3, 3],
                                0
                            );

                            pdf.line(
                                55,
                                y,
                                pageWidth - 55,
                                y
                            );

                            pdf.setLineDashPattern(
                                [],
                                0
                            );

                            y += 20;
                        }
                    }
                );

                if (
                    policyIndex <
                    customer.policies.length - 1
                ) {
                    y += 18;
                }
            }
        );
    }

    function createCombinedPdf(
        items,
        button,
        filePrefix
    ) {
        const {
            jsPDF
        } = jspdf;

        button.textContent =
            'Grouping customers...';

        const customers =
            groupReportsByCustomer(
                items
            );

        const pdf =
            new jsPDF({
                orientation:
                    'portrait',
                unit:
                    'pt',
                format:
                    'letter'
            });

        pdf.setProperties({
            title:
                'QQ Catalyst Print Only Reports',

            subject:
                'QQ Catalyst Carrier Downloads Print Only Transactions',

            creator:
                'MCI QQ Print Only Helper'
        });

        customers.forEach(
            (customer, index) => {
                button.textContent =
                    `Building customer ${index + 1} of ${customers.length}...`;

                addCustomerToPdf(
                    pdf,
                    customer,
                    index,
                    customers.length,
                    index === 0
                );
            }
        );

        const fileName =
            `${filePrefix}_${getDateStamp()}.pdf`;

        pdf.save(
            cleanFileName(
                fileName
            )
        );

        return {
            customers:
                customers.length,

            reports:
                items.length
        };
    }

    async function createSelectedPdf(
        button
    ) {
        const normalText =
            'Download Selected as PDF';

        try {
            if (
                selectedItems.size === 0
            ) {
                alert(
                    'Please select at least one Print Only transaction.'
                );

                return;
            }

            button.disabled =
                true;

            const items =
                Array.from(
                    selectedItems.values()
                ).map(
                    item => ({
                        ...item
                    })
                );

            await fetchTextFiles(
                items,
                button
            );

            const result =
                createCombinedPdf(
                    items,
                    button,
                    'QQ_Print_Only_Selected'
                );

            alert(
                `Finished!\n\n` +
                `${result.reports} selected reports\n` +
                `${result.customers} customers\n\n` +
                `The selected reports were grouped by customer and policy.`
            );
        } catch (error) {
            console.error(
                error
            );

            alert(
                `Could not create the selected PDF.\n\n${error.message}`
            );
        } finally {
            button.disabled =
                selectedItems.size === 0;

            button.textContent =
                normalText;

            updateSelectedCount();
        }
    }

    async function createAllPdf(
        button
    ) {
        const normalText =
            'Download All as PDF';

        try {
            button.disabled =
                true;

            const items =
                await collectAllPrintOnlyItems(
                    button
                );

            if (!items) {
                return;
            }

            if (
                items.length === 0
            ) {
                alert(
                    'No Print Only transactions were found.'
                );

                return;
            }

            await fetchTextFiles(
                items,
                button
            );

            const result =
                createCombinedPdf(
                    items,
                    button,
                    'QQ_Print_Only_All'
                );

            alert(
                `Finished!\n\n` +
                `${result.reports} reports\n` +
                `${result.customers} customers\n\n` +
                `All reports were grouped by customer and policy.`
            );
        } catch (error) {
            console.error(
                error
            );

            alert(
                `Could not create the Print Only PDF.\n\n${error.message}`
            );
        } finally {
            button.disabled =
                false;

            button.textContent =
                normalText;
        }
    }

    function styleButton(
        button,
        background,
        border
    ) {
        button.style.padding =
            '6px 11px';

        button.style.background =
            background;

        button.style.color =
            '#ffffff';

        button.style.border =
            `1px solid ${border}`;

        button.style.borderRadius =
            '4px';

        button.style.cursor =
            'pointer';

        button.style.fontSize =
            '12px';

        button.style.fontWeight =
            'bold';

        button.style.marginRight =
            '6px';
    }

    function addControls() {
        const section =
            getPrintOnlySection();

        if (!section) {
            return;
        }

        addCheckboxesToRows();

        if (
            document.querySelector(
                '#mci-print-only-controls'
            )
        ) {
            return;
        }

        const heading =
            section.querySelector(
                'h2'
            );

        if (!heading) {
            return;
        }

        const controls =
            document.createElement(
                'div'
            );

        controls.id =
            'mci-print-only-controls';

        controls.style.display =
            'inline-flex';

        controls.style.alignItems =
            'center';

        controls.style.marginLeft =
            '12px';

        controls.style.gap =
            '4px';

        controls.style.verticalAlign =
            'middle';

        const selectPageButton =
            document.createElement(
                'button'
            );

        selectPageButton.type =
            'button';

        selectPageButton.textContent =
            'Select Page';

        styleButton(
            selectPageButton,
            '#546e7a',
            '#37474f'
        );

        selectPageButton.addEventListener(
            'click',
            function () {
                selectVisiblePage();
            }
        );

        const clearButton =
            document.createElement(
                'button'
            );

        clearButton.type =
            'button';

        clearButton.textContent =
            'Clear Selection';

        styleButton(
            clearButton,
            '#757575',
            '#555555'
        );

        clearButton.addEventListener(
            'click',
            function () {
                clearSelection();
            }
        );

        const selectedCount =
            document.createElement(
                'span'
            );

        selectedCount.id =
            'mci-print-only-selected-count';

        selectedCount.textContent =
            '0 selected';

        selectedCount.style.margin =
            '0 8px';

        selectedCount.style.fontSize =
            '12px';

        selectedCount.style.fontWeight =
            'bold';

        selectedCount.style.color =
            '#444444';

        const selectedPdfButton =
            document.createElement(
                'button'
            );

        selectedPdfButton.id =
            'mci-download-selected-pdf';

        selectedPdfButton.type =
            'button';

        selectedPdfButton.textContent =
            'Download Selected as PDF';

        styleButton(
            selectedPdfButton,
            '#1976d2',
            '#0d47a1'
        );

        selectedPdfButton.disabled =
            true;

        selectedPdfButton.style.opacity =
            '0.55';

        selectedPdfButton.addEventListener(
            'click',
            function () {
                createSelectedPdf(
                    selectedPdfButton
                );
            }
        );

        const allPdfButton =
            document.createElement(
                'button'
            );

        allPdfButton.id =
            'mci-download-all-pdf';

        allPdfButton.type =
            'button';

        allPdfButton.textContent =
            'Download All as PDF';

        styleButton(
            allPdfButton,
            '#2e7d32',
            '#1b5e20'
        );

        allPdfButton.addEventListener(
            'click',
            function () {
                createAllPdf(
                    allPdfButton
                );
            }
        );

        controls.appendChild(
            selectPageButton
        );

        controls.appendChild(
            clearButton
        );

        controls.appendChild(
            selectedCount
        );

        controls.appendChild(
            selectedPdfButton
        );

        controls.appendChild(
            allPdfButton
        );

        heading.insertAdjacentElement(
            'afterend',
            controls
        );

        updateSelectedCount();
    }

    function safeRefreshControls() {
        const section = getPrintOnlySection();

        if (!section) {
            return;
        }

        /*
        * Don't touch the Print Only DOM while QQ is still
        * loading/replacing the contents.
        */
        const table = section.querySelector(
            '#cd-print-only-transactions-list'
        );

        if (!table) {
            return;
        }

        const loading = section.querySelector(
            '.table-loading:not(.hide)'
        );

        if (
            loading &&
            loading.style.display !== 'none'
        ) {
            return;
        }

        addControls();
        addCheckboxesToRows();
    }

    /*
    * Give QQ time to finish its own page setup first.
    */
    setTimeout(
        safeRefreshControls,
        1000
    );

    /*
    * A light polling check is much safer here than watching
    * every DOM mutation QQ makes.
    */
    setInterval(
        safeRefreshControls,
        1000
    );
})();