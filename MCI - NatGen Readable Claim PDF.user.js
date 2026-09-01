// ==UserScript==
// @name         MCI - NatGen Readable Claim PDF
// @namespace    https://middlecreekins.com/
// @version      1.0.1
// @description  Adds a readable PDF download button to NatGen Claims Report Summary pages.
// @match        https://natgenagency.com/Reports/ClaimsReportSummary.aspx*
// @match        https://www.natgenagency.com/Reports/ClaimsReportSummary.aspx*
// @require      https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    "use strict";

    const BUTTON_ID = "mci-natgen-readable-claim-pdf";
    const CLAIM_GRID_ID = "ctl00_MainContent_gvClaimsReportV2_noRegMgr";

    function cleanText(value) {
        return String(value || "")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function safeFilePart(value) {
        return cleanText(value)
            .replace(/[\\/:*?"<>|]+/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getById(id) {
        return document.getElementById(id);
    }

    function getTextById(id) {
        const el = getById(id);
        return el ? cleanText(el.textContent) : "";
    }

    function getSelectedText(selectId) {
        const sel = getById(selectId);
        if (!sel || sel.selectedIndex < 0) return "";
        return cleanText(sel.options[sel.selectedIndex].textContent || sel.value);
    }

    function getPdfLibrary() {
        const candidates = [
            window.jspdf && window.jspdf.jsPDF,
            typeof unsafeWindow !== "undefined" && unsafeWindow.jspdf && unsafeWindow.jspdf.jsPDF,
            typeof jspdf !== "undefined" && jspdf.jsPDF,
            typeof jsPDF !== "undefined" && jsPDF
        ];

        return candidates.find(Boolean) || null;
    }

    function findClaimGrid() {
        let grid = getById(CLAIM_GRID_ID);
        if (grid) return grid;

        const tables = Array.from(document.querySelectorAll("table"));
        return tables.find(table => {
            const text = cleanText(table.textContent).toLowerCase();
            return text.includes("claim number") &&
                   text.includes("loss date") &&
                   text.includes("amount paid") &&
                   text.includes("status");
        }) || null;
    }

    function findClaimsHistoryLabel() {
        const label = getById("ctl00_MainContent_lblClaimsDetail");
        if (label) return label;

        return Array.from(document.querySelectorAll("span, div, td"))
            .find(el => cleanText(el.textContent).toLowerCase() === "claims history") || null;
    }

    function getCarrierLine() {
        return getTextById("ctl00_lblInfo");
    }

    function getCustomerName() {
        return getTextById("ctl00_MainContent_InsuredInfo1_lblInsName") ||
               getTextById("ctl00_MainContent_lblInsName") ||
               "";
    }

    function getCustomerAddress() {
        const address1 = getTextById("ctl00_MainContent_InsuredInfo1_lblInsAddress");
        const cityStateZip = getTextById("ctl00_MainContent_InsuredInfo1_lblInsCityStateZip");
        return cleanText([address1, cityStateZip].filter(Boolean).join(", "));
    }

    function getCustomerPhone() {
        return getTextById("ctl00_MainContent_InsuredInfo1_lblInsPhone");
    }

    function getCustomerEmail() {
        return getTextById("ctl00_MainContent_InsuredInfo1_lblInsEmail");
    }

    function getSummaryValue(labelText) {
        const wanted = cleanText(labelText).replace(/:$/, "").toLowerCase();

        const cells = Array.from(document.querySelectorAll("td"));
        for (let i = 0; i < cells.length; i++) {
            const current = cleanText(cells[i].textContent).replace(/:$/, "").toLowerCase();
            if (current === wanted && cells[i + 1]) {
                return cleanText(cells[i + 1].textContent);
            }
        }

        return "";
    }

    function getClaimNumber() {
        const fromDropDown = getSelectedText("ctl00_MainContent_ddlClaims");
        if (fromDropDown && fromDropDown.toLowerCase() !== "all") return fromDropDown;

        const params = new URLSearchParams(window.location.search);
        return params.get("ClaimNumber") || getSummaryValue("Claim Number") || "";
    }

    function tableToObjects(table) {
        const rows = Array.from(table.querySelectorAll("tr"));
        if (!rows.length) return [];

        const headerCells = Array.from(rows[0].querySelectorAll("th,td"));
        const headers = headerCells.map(cell => cleanText(cell.textContent));

        return rows.slice(1).map(row => {
            const cells = Array.from(row.querySelectorAll("td,th"));
            const obj = {};

            headers.forEach((header, index) => {
                let key = header || `Column ${index + 1}`;

                if (obj[key] !== undefined) {
                    key = `${key} ${index + 1}`;
                }

                obj[key] = cleanText(cells[index] ? cells[index].textContent : "");
            });

            return obj;
        }).filter(obj => Object.values(obj).some(Boolean));
    }

    function value(row, possibleNames) {
        for (const name of possibleNames) {
            if (row[name]) return row[name];
        }

        const keys = Object.keys(row);
        const foundKey = keys.find(key =>
            possibleNames.some(name => key.toLowerCase() === name.toLowerCase())
        );

        return foundKey ? row[foundKey] : "";
    }

    function getClaimName(row) {
        return value(row, [
            "Claim Name",
            "Loss Description",
            "Cause of Loss",
            "Vehicle Damage Description",
            "Coverages",
            "Coverage",
            "Status"
        ]);
    }

    function addButton() {
        if (getById(BUTTON_ID)) return;

        const grid = findClaimGrid();
        if (!grid) return;

        const wrapper = document.createElement("div");
        wrapper.id = `${BUTTON_ID}-wrap`;
        wrapper.style.margin = "10px 0 8px 50px";
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.gap = "8px";

        const btn = document.createElement("button");
        btn.id = BUTTON_ID;
        btn.type = "button";
        btn.textContent = "Download Readable Claim PDF";
        btn.style.background = "#2e8b57";
        btn.style.color = "#ffffff";
        btn.style.border = "1px solid #1f6b40";
        btn.style.borderRadius = "5px";
        btn.style.padding = "5px 10px";
        btn.style.font = "bold 12px Arial, sans-serif";
        btn.style.cursor = "pointer";
        btn.style.boxShadow = "0 1px 3px rgba(0,0,0,.25)";

        const note = document.createElement("span");
        note.textContent = "MCI readable report";
        note.style.font = "12px Arial, sans-serif";
        note.style.color = "#555";

        btn.addEventListener("click", generatePdf);

        wrapper.appendChild(btn);
        wrapper.appendChild(note);

        const label = findClaimsHistoryLabel();
        if (label && label.parentElement) {
            label.parentElement.insertAdjacentElement("afterend", wrapper);
        } else {
            grid.insertAdjacentElement("beforebegin", wrapper);
        }
    }

    function addLabelValueRows(rows, label, valueText) {
        if (valueText) rows.push([label, valueText]);
    }

    function buildReportData() {
        const grid = findClaimGrid();

        if (!grid) {
            alert("MCI: Could not find the NatGen claims table on this page.");
            return null;
        }

        const rows = tableToObjects(grid);

        if (!rows.length) {
            alert("MCI: No claim rows found to export.");
            return null;
        }

        const customerName = getCustomerName() || "Customer";
        const claimNumber = getClaimNumber() || value(rows[0], ["Claim Number"]) || "Claim";
        const firstClaimName = getClaimName(rows[0]) || "Claim";

        const fileName = `${safeFilePart(claimNumber)} - ${safeFilePart(customerName)} - ${safeFilePart(firstClaimName)} claim.pdf`;

        const summaryRows = [];
        addLabelValueRows(summaryRows, "Customer", customerName);
        addLabelValueRows(summaryRows, "Address", getCustomerAddress());
        addLabelValueRows(summaryRows, "Phone", getCustomerPhone());
        addLabelValueRows(summaryRows, "Email", getCustomerEmail());
        addLabelValueRows(summaryRows, "Claim Number", claimNumber);
        addLabelValueRows(summaryRows, "Order Date", getSelectedText("ctl00_MainContent_ddlOrderDates") || value(rows[0], ["Order Date"]));
        addLabelValueRows(summaryRows, "Loss Date", getSelectedText("ctl00_MainContent_ddlLossDates") || value(rows[0], ["Loss Date"]));
        addLabelValueRows(summaryRows, "Account", getSummaryValue("Account"));
        addLabelValueRows(summaryRows, "Policy", getSummaryValue("Renewal Of Policy"));
        addLabelValueRows(summaryRows, "Term", getSummaryValue("Term"));
        addLabelValueRows(summaryRows, "Policy Status", getSummaryValue("Status"));

        return {
            rows,
            customerName,
            claimNumber,
            firstClaimName,
            fileName,
            summaryRows,
            carrierLine: getCarrierLine()
        };
    }

    function generatePdf() {
        const report = buildReportData();
        if (!report) return;

        const jsPDF = getPdfLibrary();

        if (!jsPDF) {
            openPrintableFallback(report);
            return;
        }

        const doc = new jsPDF({
            orientation: "landscape",
            unit: "pt",
            format: "letter"
        });

        const marginLeft = 36;
        let y = 36;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("NatGen Claim Report", marginLeft, y);

        y += 18;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString()}`, marginLeft, y);

        y += 14;
        if (report.carrierLine) {
            doc.text(report.carrierLine, marginLeft, y);
            y += 14;
        }

        doc.autoTable({
            startY: y + 8,
            theme: "grid",
            head: [["Claim / Customer Info", ""]],
            body: report.summaryRows,
            margin: { left: marginLeft, right: 36 },
            styles: {
                font: "helvetica",
                fontSize: 9,
                cellPadding: 4,
                overflow: "linebreak"
            },
            headStyles: {
                fillColor: [31, 90, 166],
                textColor: 255,
                fontStyle: "bold"
            },
            columnStyles: {
                0: { fontStyle: "bold", cellWidth: 115 },
                1: { cellWidth: 570 }
            }
        });

        y = doc.lastAutoTable.finalY + 14;

        report.rows.forEach((row, index) => {
            const claimTitle = getClaimName(row) || `Claim ${index + 1}`;

            const claimOverview = [
                ["Claim Number", value(row, ["Claim Number"])],
                ["Status", value(row, ["Status"])],
                ["Order Date", value(row, ["Order Date"])],
                ["Loss Date", value(row, ["Loss Date"])],
                ["Initial Contact", value(row, ["Initial Contact Date"])],
                ["Last Updated", value(row, ["Claim Last Updated"])],
                ["Coverage", value(row, ["Coverages", "Coverage"])],
                ["Amount Paid", value(row, ["Amount Paid"])],
                ["Payment Type", value(row, ["Payment Type"])],
                ["Payment Issued", value(row, ["Date Payment Issued"])]
            ].filter(r => r[1]);

            const peopleRows = [
                ["Adjuster", value(row, ["Adjuster"])],
                ["Adjuster Email", value(row, ["Adjuster Email"])],
                ["Adjuster Phone", value(row, ["Phone Number"])],
                ["Supervisor", value(row, ["Adjuster Supervisor"])],
                ["Supervisor Email", value(row, ["Adjuster Supervisor Email"])],
                ["Supervisor Phone", value(row, ["Phone Number 11", "Phone Number 10", "Phone Number 2"])]
            ].filter(r => r[1]);

            const vehicleRows = [
                ["Vehicle", value(row, ["Vehicle"])],
                ["Driver", value(row, ["Driver"])],
                ["Percent At Fault", value(row, ["Percent At Fault"])],
                ["Damage Description", value(row, ["Vehicle Damage Description"])],
                ["Damage Extent", value(row, ["Damage Extent"])]
            ].filter(r => r[1]);

            if (y > 420) {
                doc.addPage();
                y = 36;
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text(`Claim ${index + 1}: ${claimTitle}`, marginLeft, y);
            y += 8;

            doc.autoTable({
                startY: y,
                theme: "grid",
                head: [["Claim Details", ""]],
                body: claimOverview,
                margin: { left: marginLeft, right: 36 },
                styles: {
                    font: "helvetica",
                    fontSize: 9,
                    cellPadding: 4,
                    overflow: "linebreak"
                },
                headStyles: {
                    fillColor: [31, 90, 166],
                    textColor: 255,
                    fontStyle: "bold"
                },
                columnStyles: {
                    0: { fontStyle: "bold", cellWidth: 115 },
                    1: { cellWidth: 250 }
                }
            });

            const leftEnd = doc.lastAutoTable.finalY;

            doc.autoTable({
                startY: y,
                theme: "grid",
                head: [["Adjuster / Contact", ""]],
                body: peopleRows.length ? peopleRows : [["", ""]],
                margin: { left: 430, right: 36 },
                styles: {
                    font: "helvetica",
                    fontSize: 9,
                    cellPadding: 4,
                    overflow: "linebreak"
                },
                headStyles: {
                    fillColor: [31, 90, 166],
                    textColor: 255,
                    fontStyle: "bold"
                },
                columnStyles: {
                    0: { fontStyle: "bold", cellWidth: 115 },
                    1: { cellWidth: 205 }
                }
            });

            y = Math.max(leftEnd, doc.lastAutoTable.finalY) + 8;

            if (vehicleRows.length) {
                doc.autoTable({
                    startY: y,
                    theme: "grid",
                    head: [["Vehicle / Damage", ""]],
                    body: vehicleRows,
                    margin: { left: marginLeft, right: 36 },
                    styles: {
                        font: "helvetica",
                        fontSize: 9,
                        cellPadding: 4,
                        overflow: "linebreak"
                    },
                    headStyles: {
                        fillColor: [31, 90, 166],
                        textColor: 255,
                        fontStyle: "bold"
                    },
                    columnStyles: {
                        0: { fontStyle: "bold", cellWidth: 115 },
                        1: { cellWidth: 570 }
                    }
                });

                y = doc.lastAutoTable.finalY + 14;
            }
        });

        addFooter(doc);
        doc.save(report.fileName);
    }

    function addFooter(doc) {
        const pageCount = doc.internal.getNumberOfPages();

        for (let page = 1; page <= pageCount; page++) {
            doc.setPage(page);
            const width = doc.internal.pageSize.getWidth();
            const height = doc.internal.pageSize.getHeight();

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.text(`Source: ${window.location.href}`, 36, height - 20, {
                maxWidth: width - 120
            });

            doc.text(`Page ${page} of ${pageCount}`, width - 80, height - 20);
        }
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function rowsToHtml(rows) {
        return rows.map(row => `
            <tr>
                <th>${escapeHtml(row[0])}</th>
                <td>${escapeHtml(row[1])}</td>
            </tr>
        `).join("");
    }

    function openPrintableFallback(report) {
        const win = window.open("", "_blank");

        if (!win) {
            alert("MCI: PDF library was blocked, and the print window was blocked by the browser.");
            return;
        }

        let claimsHtml = "";

        report.rows.forEach((row, index) => {
            const claimTitle = getClaimName(row) || `Claim ${index + 1}`;

            const claimRows = [
                ["Claim Number", value(row, ["Claim Number"])],
                ["Status", value(row, ["Status"])],
                ["Order Date", value(row, ["Order Date"])],
                ["Loss Date", value(row, ["Loss Date"])],
                ["Initial Contact", value(row, ["Initial Contact Date"])],
                ["Last Updated", value(row, ["Claim Last Updated"])],
                ["Coverage", value(row, ["Coverages", "Coverage"])],
                ["Vehicle", value(row, ["Vehicle"])],
                ["Driver", value(row, ["Driver"])],
                ["Percent At Fault", value(row, ["Percent At Fault"])],
                ["Damage Description", value(row, ["Vehicle Damage Description"])],
                ["Damage Extent", value(row, ["Damage Extent"])],
                ["Amount Paid", value(row, ["Amount Paid"])],
                ["Payment Type", value(row, ["Payment Type"])],
                ["Payment Issued", value(row, ["Date Payment Issued"])],
                ["Adjuster", value(row, ["Adjuster"])],
                ["Adjuster Email", value(row, ["Adjuster Email"])],
                ["Adjuster Phone", value(row, ["Phone Number"])],
                ["Supervisor", value(row, ["Adjuster Supervisor"])],
                ["Supervisor Email", value(row, ["Adjuster Supervisor Email"])],
                ["Supervisor Phone", value(row, ["Phone Number 11", "Phone Number 10", "Phone Number 2"])]
            ].filter(r => r[1]);

            claimsHtml += `
                <h2>Claim ${index + 1}: ${escapeHtml(claimTitle)}</h2>
                <table>${rowsToHtml(claimRows)}</table>
            `;
        });

        win.document.open();
        win.document.write(`
            <!doctype html>
            <html>
            <head>
                <title>${escapeHtml(report.fileName.replace(/\.pdf$/i, ""))}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        color: #111;
                        margin: 24px;
                        font-size: 12px;
                    }

                    h1 {
                        font-size: 22px;
                        margin: 0 0 4px;
                    }

                    h2 {
                        font-size: 16px;
                        margin: 20px 0 6px;
                        color: #1f5aa6;
                    }

                    .small {
                        font-size: 10px;
                        color: #555;
                        margin-bottom: 12px;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 12px;
                        page-break-inside: avoid;
                    }

                    th {
                        width: 180px;
                        text-align: left;
                        background: #1f5aa6;
                        color: white;
                        padding: 6px;
                        border: 1px solid #ccc;
                        vertical-align: top;
                    }

                    td {
                        padding: 6px;
                        border: 1px solid #ccc;
                        vertical-align: top;
                    }

                    @media print {
                        button {
                            display: none;
                        }

                        body {
                            margin: 0.35in;
                        }
                    }
                </style>
            </head>
            <body>
                <button onclick="window.print()" style="padding:8px 12px;margin-bottom:12px;font-weight:bold;">
                    Print / Save as PDF
                </button>

                <h1>NatGen Claim Report</h1>
                <div class="small">
                    Generated: ${escapeHtml(new Date().toLocaleString())}<br>
                    ${escapeHtml(report.carrierLine || "")}<br>
                    Source: ${escapeHtml(window.location.href)}
                </div>

                <h2>Claim / Customer Info</h2>
                <table>${rowsToHtml(report.summaryRows)}</table>

                ${claimsHtml}
            </body>
            </html>
        `);
        win.document.close();

        win.focus();

        setTimeout(() => {
            win.print();
        }, 500);
    }

    function waitForPage() {
        let tries = 0;

        const timer = window.setInterval(() => {
            tries += 1;
            addButton();

            if (getById(BUTTON_ID) || tries >= 30) {
                window.clearInterval(timer);
            }
        }, 500);
    }

    waitForPage();
})();