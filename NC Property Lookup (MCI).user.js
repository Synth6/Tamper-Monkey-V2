// ==UserScript==
// @name         NC Property Lookup (MCI)
// @namespace    mci-tools
// @version      1.2.40
// @description  NC property lookup with statewide parcel matching plus county-specific enrichment.
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NC%20Property%20Lookup%20(MCI).user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/NC%20Property%20Lookup%20(MCI).user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      services.nconemap.gov
// @connect      services.wake.gov
// @connect      services1.arcgis.com
// @connect      gis.harnett.org
// @connect      gisservices.chathamcountync.gov
// @connect      cityworks.johnstonnc.com
// @connect      webgis.durhamnc.gov
// @connect      gis.orangecountync.gov
// @connect      lee-arcgis.leecountync.gov
// @connect      gis.nashcountync.gov
// @connect      gis.wilson-co.com
// @connect      services6.arcgis.com
// @connect      services5.arcgis.com
// @connect      services3.arcgis.com
// @connect      services.arcgis.com
// @connect      www.arcgis.com
// @connect      gis1.fuquay-varina.org
// @connect      www.franklincountymaps.net
// @connect      gis.edgecombecountync.gov
// @connect      gis.co.cumberland.nc.us
// @connect      gis.moorecountync.gov
// @connect      vance.ustaxdata.com
// @connect      www.zillow.com
// @connect      www.granvillecounty.org
// @connect      tax.granvillecounty.org
// @connect      www.bttaxpayerportal.com
// ==/UserScript==

(function () {
  'use strict';

  const UI_ID = '__mciNcPropertyLookup__';
  const OPEN_EVENT = 'mci:nc-property-open';
  // Shared dedicated-window marker. Companion MCI userscripts use this
  // window name to stay out of the NC Property popup.
  const POPUP_NAME = 'mciNcPropertyLookupWindow';
  const POPUP_WIDTH = 820;
  const POPUP_HEIGHT = 850;
  let ncPropertyPopup = null;
  let pendingSelectedText = '';

  function isNcPropertyPopup() {
    return window.name === POPUP_NAME;
  }

  function openNcPropertyPopup(selectedText = '') {
    pendingSelectedText = String(selectedText || '').trim();

    try {
      if (ncPropertyPopup && !ncPropertyPopup.closed) {
        ncPropertyPopup.focus();

        if (pendingSelectedText) {
          try {
            ncPropertyPopup.postMessage({
              __mci: 'nc-property-prefill',
              text: pendingSelectedText
            }, '*');
          } catch (e) {}
        }

        return ncPropertyPopup;
      }
    } catch (e) {
      ncPropertyPopup = null;
    }

    const left = Math.max(0, Math.round((window.screenX || 0) + 70));
    const top = Math.max(0, Math.round((window.screenY || 0) + 55));

    const features = [
      'popup=yes',
      `width=${POPUP_WIDTH}`,
      `height=${POPUP_HEIGHT}`,
      `left=${left}`,
      `top=${top}`,
      'resizable=yes',
      'scrollbars=yes'
    ].join(',');

    const popup = window.open(location.href, POPUP_NAME, features);

    if (!popup) {
      alert('NC Property popup was blocked. Allow popups for this site and try again.');
      return null;
    }

    ncPropertyPopup = popup;
    try { popup.focus(); } catch (e) {}
    return popup;
  }

  const ONE_MAP_QUERY =
    'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1/query';

  const NC_GEOCODER =
    'https://services.nconemap.gov/secure/rest/services/AddressNC/AddressNC_geocoder/GeocodeServer/findAddressCandidates';

  const WAKE_QUERY =
    'https://services1.arcgis.com/nry3yyvaEfskMEXA/ArcGIS/rest/services/Wake_County_data/FeatureServer/9/query';

  const WAKE_FIRE_DISTRICT_QUERY =
    'https://services1.arcgis.com/nry3yyvaEfskMEXA/ArcGIS/rest/services/Wake_County_data/FeatureServer/6/query';

  const WAKE_FIRE_STATION_QUERY =
    'https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/ArcGIS/rest/services/FireStations/FeatureServer/0/query';


  const WAKE_IMAPS_TAX_PARCELS_QUERY =
    'https://services.arcgis.com/l0M0OC6J9QAHCiGx/ArcGIS/rest/services/TaxParcels/FeatureServer/0/query';

  const FUQUAY_HYDRANT_QUERY =
    'https://gis1.fuquay-varina.org/server/rest/services/Public/All_Utilities/MapServer/8/query';

  const HARNETT_QUERY =
    'https://gis.harnett.org/arcgis/rest/services/Tax/Parcels/MapServer/0/query';

  const CHATHAM_RES_QUERY =
    'https://gisservices.chathamcountync.gov/portalservices/rest/services/PropertyTaxLive/Residential_layer/MapServer/0/query';

  const CHATHAM_PARCEL_QUERY =
    'https://gisservices.chathamcountync.gov/portalservices/rest/services/PropertyTaxLive/Residential_layer/MapServer/2/query';

  const JOHNSTON_QUERY =
    'https://cityworks.johnstonnc.com/server/rest/services/TAX/ParcelMap/MapServer/0/query';

  const DURHAM_QUERY =
    'https://webgis.durhamnc.gov/server/rest/services/PublicWorksServices/EQWQ_MS_4/MapServer/26/query';

  const DURHAM_HYDRANT_QUERY =
    'https://webgis.durhamnc.gov/server/rest/services/PublicWorksServices/FireFlow2/MapServer/2/query';

  const DURHAM_FIRE_STATION_QUERY =
    'https://webgis.durhamnc.gov/server/rest/services/PublicServices/Public_Safety/MapServer/3/query';

  const DURHAM_FIRE_DISTRICT_QUERY =
    'https://webgis.durhamnc.gov/server/rest/services/PublicServices/Public_Safety/MapServer/7/query';

  const DURHAM_FIRE_INSURANCE_QUERY =
    'https://webgis.durhamnc.gov/server/rest/services/PublicServices/Public_Safety/MapServer/12/query';

  const ORANGE_QUERY_PRIMARY =
    'https://gis.orangecountync.gov/arcgis/rest/services/WebParcelService/MapServer/0/query';

  const ORANGE_QUERY_FALLBACK =
    'https://gis.orangecountync.gov/arcgis/rest/services/WebIdentifyService/MapServer/6/query';

  const ORANGE_FIRE_STATION_QUERY =
    'https://gis.orangecountync.gov/arcgis/rest/services/WebIdentifyService/MapServer/2/query';

  const ORANGE_FIRE_DISTRICT_QUERY =
    'https://gis.orangecountync.gov/arcgis/rest/services/EnerGovServices/ProdOCPlanningDisplay/MapServer/79/query';

  const ORANGE_FIRE_INSURANCE_QUERY =
    'https://gis.orangecountync.gov/arcgis/rest/services/EnerGovServices/ProdOCPlanningDisplay/MapServer/31/query';

  const LEE_QUERY =
    'https://lee-arcgis.leecountync.gov/arcgis/rest/services/BaseLayers/BaseLayers/MapServer/10/query';

  const NASH_QUERY =
    'https://gis.nashcountync.gov/nashmaps/rest/services/OpenGov/GIS_Flags/MapServer/5/query';

  const WILSON_QUERY =
    'https://gis.wilson-co.com/arcgis/rest/services/Tax/Taxparcels/FeatureServer/0/query';

  const VANCE_PARCEL_QUERY =
    'https://services6.arcgis.com/pET3krhY1T0smsXf/ArcGIS/rest/services/Web_Map_Service/FeatureServer/3/query';

  const VANCE_HYDRANT_QUERY =
    'https://services6.arcgis.com/pET3krhY1T0smsXf/ArcGIS/rest/services/Hydrants_VC_2024/FeatureServer/0/query';

  const VANCE_FIRE_DISTRICT_QUERY =
    'https://services6.arcgis.com/pET3krhY1T0smsXf/ArcGIS/rest/services/VC_FireDistricts_2024/FeatureServer/0/query';

  const VANCE_FIRE_STATION_QUERY =
    'https://services.arcgis.com/mq0BGE5kHpm8mHFz/ArcGIS/rest/services/VC_FireStations/FeatureServer/0/query';

  const GRANVILLE_BUILDING_CSV =
    'https://www.granvillecounty.org/DocumentCenter/View/4642/Tax-Building-Information-CSV';

  const GRANVILLE_PARCEL_CSV =
    'https://www.granvillecounty.org/DocumentCenter/View/4646/Tax-Parcel-Information-CSV';

  const GRANVILLE_TAX_SEARCH =
    'https://tax.granvillecounty.org/ITSPublic/RealEstateSearch';

  const GRANVILLE_APPRAISAL_CARD =
    'https://tax.granvillecounty.org/ITSPublic/AppraisalCard.aspx?id=';

  const GRANVILLE_PARCEL_PROFILE =
    'https://tax.granvillecounty.org/ITSPublic/ParcelProfileEntry.aspx?parcel=';

  const GRANVILLE_GIS_MAP =
    'https://experience.arcgis.com/experience/9fb947310691479b8a2468d86316e8de/page/Granville-County-Parcel-Viewer';

  const GRANVILLE_CACHE_KEY = '__mci_granville_tax_cache_v4';
  const GRANVILLE_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
  let granvilleLocalIndex = null;

  const HARNETT_HYDRANT_QUERY =
    'https://gis.harnett.org/arcgis/rest/services/Public_Utilities/FM_insurance/MapServer/0/query';

  const HARNETT_FIRE_INSURANCE_6_QUERY =
    'https://gis.harnett.org/arcgis/rest/services/Public_Safety/Fire_Insurance/MapServer/0/query';

  const HARNETT_FIRE_INSURANCE_5_QUERY =
    'https://gis.harnett.org/arcgis/rest/services/Public_Safety/Fire_Insurance/MapServer/1/query';

  const CHATHAM_HYDRANT_QUERY =
    'https://gisservices.chathamcountync.gov/webapps/rest/services/ApplicationMapServices/Chatham_Chatview/MapServer/2/query';


  // Statewide NC Office of State Fire Marshal fallbacks. These layers cover
  // active fire stations and response districts statewide, so counties without
  // a dedicated local adapter can still return useful fire-protection data.
  const OSFM_FIRE_STATION_QUERY =
    'https://services5.arcgis.com/yCv672AxcRF0kngG/arcgis/rest/services/NC_Fire_Stations/FeatureServer/0/query';

  const OSFM_FIRE_DISTRICT_QUERY =
    'https://services5.arcgis.com/yCv672AxcRF0kngG/ArcGIS/rest/services/NC_Fire_Districts/FeatureServer/0/query';

  const FRANKLIN_PARCEL_QUERY =
    'https://www.franklincountymaps.net/arcgis/rest/services/OperationalLayers/MapServer/0/query';
  const FRANKLIN_FIRE_STATION_QUERY =
    'https://www.franklincountymaps.net/arcgis/rest/services/OperationalLayers/MapServer/15/query';
  const FRANKLIN_FIRE_DISTRICT_QUERY =
    'https://www.franklincountymaps.net/arcgis/rest/services/OperationalLayers/MapServer/16/query';

  const EDGECOMBE_PARCEL_QUERY =
    'https://gis.edgecombecountync.gov/arcgis/rest/services/webmap/MapServer/10/query';
  const EDGECOMBE_HYDRANT_QUERY =
    'https://gis.edgecombecountync.gov/arcgis/rest/services/webmap/MapServer/0/query';
  const EDGECOMBE_FIRE_DISTRICT_QUERY =
    'https://gis.edgecombecountync.gov/arcgis/rest/services/webmap/MapServer/39/query';

  const CUMBERLAND_PARCEL_QUERY =
    'https://gis.co.cumberland.nc.us/server/rest/services/Tax/Parcels/MapServer/0/query';
  const CUMBERLAND_FIRE_STATION_QUERY =
    'https://gis.co.cumberland.nc.us/server/rest/services/EMS/FireStations/MapServer/0/query';
  const CUMBERLAND_FIRE_DISTRICT_QUERY =
    'https://gis.co.cumberland.nc.us/server/rest/services/Tax/FireDistricts/MapServer/0/query';

  const SAMPSON_PARCEL_QUERY =
    'https://services3.arcgis.com/fM4kjZmPOS4ay2Ff/ArcGIS/rest/services/Sampson_County_Viewer/FeatureServer/9/query';
  const SAMPSON_FIRE_STATION_QUERY =
    'https://services3.arcgis.com/fM4kjZmPOS4ay2Ff/ArcGIS/rest/services/Sampson_County_Viewer/FeatureServer/2/query';
  const SAMPSON_FIRE_RESPONSE_QUERY =
    'https://services3.arcgis.com/fM4kjZmPOS4ay2Ff/ArcGIS/rest/services/Sampson_County_Viewer/FeatureServer/12/query';

  const MOORE_FIRE_STATION_QUERY =
    'https://gis.moorecountync.gov/server/rest/services/General/General_Layers/MapServer/5/query';
  const MOORE_FIRE_DISTRICT_QUERY =
    'https://gis.moorecountync.gov/server/rest/services/General/General_Layers/MapServer/6/query';

  const WARREN_PARCEL_QUERY =
    'https://services.arcgis.com/lcU85Lh3UvDs5Naw/ArcGIS/rest/services/Parcels051622/FeatureServer/0/query';

  const WARREN_TAX_SEARCH =
    'https://www.bttaxpayerportal.com/ITSPublicWN';

  function normalizeSpaces(s) {
    return String(s || '').trim().replace(/\s+/g, ' ');
  }

  function escSql(s) {
    return String(s || '').replace(/'/g, "''");
  }

  function requestJson(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: timeoutMs,
        headers: { Accept: 'application/json' },
        onload: (r) => {
          try {
            const data = JSON.parse(r.responseText);
            if (data && data.error) {
              reject(new Error(data.error.message || 'Remote GIS service returned an error.'));
              return;
            }
            resolve(data);
          } catch (e) {
            reject(new Error('Could not read GIS response.'));
          }
        },
        onerror: () => reject(new Error('Could not connect to GIS service.')),
        ontimeout: () => reject(new Error('GIS request timed out.'))
      });
    });
  }

  function requestText(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: timeoutMs,
        headers: { Accept: 'text/html,application/xhtml+xml' },
        onload: (r) => {
          if (r.status >= 200 && r.status < 400) {
            resolve(r.responseText || '');
          } else {
            reject(new Error(`HTTP ${r.status || 0}`));
          }
        },
        onerror: () => reject(new Error('Could not connect to tax record service.')),
        ontimeout: () => reject(new Error('Tax record request timed out.'))
      });
    });
  }

  function requestArrayBuffer(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: timeoutMs,
        responseType: 'arraybuffer',
        headers: { Accept: 'application/pdf,*/*' },
        onload: (r) => {
          if (r.status >= 200 && r.status < 400 && r.response) {
            resolve(r.response);
          } else {
            reject(new Error(`HTTP ${r.status || 0}`));
          }
        },
        onerror: () => reject(new Error('Could not download property record card.')),
        ontimeout: () => reject(new Error('Property record card download timed out.'))
      });
    });
  }


  function requestJsonPost(url, payload, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        timeout: timeoutMs,
        data: JSON.stringify(payload || {}),
        headers: {
          'Accept': 'application/json,text/html,*/*',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': WARREN_TAX_SEARCH
        },
        onload: (r) => {
          if (r.status < 200 || r.status >= 400) {
            reject(new Error(`HTTP ${r.status || 0}`));
            return;
          }
          resolve(r.responseText || '');
        },
        onerror: () => reject(new Error('Could not connect to Warren tax service.')),
        ontimeout: () => reject(new Error('Warren tax request timed out.'))
      });
    });
  }

  async function pdfTextFromArrayBuffer(buffer) {
    if (!buffer || typeof pdfjsLib === 'undefined' || !pdfjsLib.getDocument) {
      return '';
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true
    });

    const pdf = await loadingTask.promise;
    const chunks = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      chunks.push(
        content.items
          .map(item => item && item.str ? item.str : '')
          .filter(Boolean)
          .join(' ')
      );
    }

    return normalizeSpaces(chunks.join(' '));
  }

  function parseWarrenAppraisalCardText(text, url, parcelNumber, taxYear, prid) {
    text = normalizeSpaces(text);
    if (!text) return null;

    let yearBuilt = '';
    const ym =
      text.match(/\bAYB\s*:?\s*(\d{4})\b/i) ||
      text.match(/\bACTUAL\s+YEAR\s+BUILT\s*:?\s*(\d{4})\b/i);
    if (ym) yearBuilt = Number(ym[1]) || '';

    let squareFeet = '';
    const sfm =
      text.match(/\b([\d,]+)\s+HSF\b/i) ||
      text.match(/\bHSF\s*:?\s*([\d,]+)\b/i);
    if (sfm) squareFeet = Number(String(sfm[1]).replace(/,/g, '')) || '';

    let stories = '';
    const stm =
      text.match(/\b(\d+(?:\.\d+)?)\s+STHT\b/i) ||
      text.match(/\bSTHT\s*:?\s*(\d+(?:\.\d+)?)\b/i);
    if (stm) {
      const n = Number(stm[1]);
      stories = Number.isFinite(n)
        ? String(n).replace(/\.0+$/, '')
        : '';
    }

    let dwellingStyle = '';
    const singleFamily = /\bSNG\s+FAML\b/i.test(text);
    const conventional = /\bDWELLING\s+CONVTNAL\b/i.test(text);
    if (singleFamily && conventional) {
      dwellingStyle = 'Single Family / Conventional';
    } else if (singleFamily) {
      dwellingStyle = 'Single Family';
    } else if (conventional) {
      dwellingStyle = 'Conventional';
    }

    let numberFamilies = '';
    if (singleFamily) numberFamilies = '1';

    let construction = '';
    let roofMaterial = '';
    let roofType = '';

    // Warren's appraisal card prints these five values directly beneath:
    // FOUNDATION | XTR_FINISH | ROOF TYPE | ROOF MTRL | SIZE/QTY
    const structureMatch = text.match(
      /\bFOUNDATION\s+XTR_FINISH\s+ROOF\s+TYPE\s+ROOF\s+MTRL\s+SIZE\/QTY\s+(\S+)\s+(.+?)\s+(GABLE|HIP|FLAT|SHED|GAMBREL|MANSARD)\s+(.+?)\s+\d+(?:\.\d+)?\s+STHT\b/i
    );

    if (structureMatch) {
      construction = normalizeSpaces(structureMatch[2]);
      roofType = normalizeSpaces(structureMatch[3]);
      roofMaterial = normalizeSpaces(structureMatch[4]);
    } else {
      // Conservative fallbacks for common Warren card wording.
      const roof =
        text.match(/\b(ASPHALT\s+SHINGLE|METAL|SLATE|WOOD\s+SHINGLE|COMPOSITION\s+SHINGLE)\b/i);
      if (roof) roofMaterial = normalizeSpaces(roof[1]);

      const ext =
        text.match(/\b(ALUMINUM\/VINYL\/STEEL|VINYL\s+SIDING|BRICK\s+VENEER|WOOD\s+SIDING|ALUMINUM\s+SIDING)\b/i);
      if (ext) construction = normalizeSpaces(ext[1]);
    }

    return {
      source: 'Warren County Property Record Card',
      taxRecordUrl: url || WARREN_TAX_SEARCH,
      yearBuilt,
      yearBuiltSource: yearBuilt ? 'Warren County Property Record Card' : '',
      squareFeet,
      squareFeetSource: squareFeet ? 'Warren County Property Record Card' : '',
      dwellingStyle,
      dwellingStyleSource: dwellingStyle ? 'Warren County Property Record Card' : '',
      numberFamilies,
      numberFamiliesSource: numberFamilies ? 'Warren County Property Record Card' : '',
      construction,
      constructionSource: construction ? 'Warren County Property Record Card' : '',
      stories,
      storiesSource: stories ? 'Warren County Property Record Card' : '',
      roofMaterial,
      roofType,
      raw: {
        parcelNumber,
        taxYear,
        prid,
        appraisalCardUrl: url || '',
        textSample: text.slice(0, 7000)
      }
    };
  }

  async function fetchWarrenDirectPropertyCard(rawAddress) {
    const parsed = splitAddress(rawAddress || '');
    const streetOnly = normalizeSpaces(parsed.street || rawAddress || '');
    if (!streetOnly) return null;

    // Match the browser sequence captured in the Warren HAR exactly:
    // initial page -> search options -> search table partial -> table data -> ViewParcel.
    await requestText(WARREN_TAX_SEARCH, 15000);

    await requestJsonPost(
      'https://www.bttaxpayerportal.com/itspublicwn/BasicSearch/GetSearchOptionsPartial',
      { searchType: 'PropertyAddress' },
      15000
    );

    await requestJsonPost(
      'https://www.bttaxpayerportal.com/itspublicwn/basicsearch/GetSearchTablePartial/',
      {
        PageSize: 50,
        ParcelSearch: 'false',
        FormattedPropertyAddress: streetOnly
      },
      20000
    );

    const tableText = await requestJsonPost(
      'https://www.bttaxpayerportal.com/itspublicwn/BasicSearch/GetSearchTableData',
      {
        Page: 1,
        NumRows: 25,
        SortBy: 'AccountName1',
        SortOrder: 'Asc',
        Table: 'BasicSearch'
      },
      20000
    );

    let tableData = null;
    try {
      tableData = JSON.parse(tableText);
    } catch (e) {
      return null;
    }

    const rows = Array.isArray(tableData && tableData.rows)
      ? tableData.rows
      : [];

    const wanted = normalizeAddressForMatch(streetOnly);
    let match = null;

    for (const row of rows) {
      const cells = Array.isArray(row && row.cell) ? row.cell : [];
      const address = normalizeSpaces(cells[2] || '');
      if (address && normalizeAddressForMatch(address) === wanted) {
        match = row;
        break;
      }
    }

    if (!match) return null;

    const cells = Array.isArray(match.cell) ? match.cell : [];
    const parcelNumber = normalizeSpaces(cells[4] || '');
    const taxYear = normalizeSpaces(cells[6] || '');

    if (!parcelNumber || !taxYear) return null;

    const parcelHtml = await requestJsonPost(
      'https://www.bttaxpayerportal.com/itspublicwn/BasicSearch/ViewParcel',
      {
        parcelNumber,
        taxYear
      },
      20000
    );

    const pridMatch = String(parcelHtml || '').match(
      /AppraisalCard\.aspx\?prid=(\d+)/i
    );

    if (!pridMatch) {
      return {
        source: 'Warren County Tax Search',
        taxRecordUrl: WARREN_TAX_SEARCH,
        raw: {
          parcelNumber,
          taxYear,
          searchAddress: streetOnly,
          viewParcelSample: String(parcelHtml || '').slice(0, 5000)
        }
      };
    }

    const prid = pridMatch[1];
    const cardUrl =
      'https://www.bttaxpayerportal.com/itspublicwn/AppraisalCard.aspx?prid=' +
      encodeURIComponent(prid);

    try {
      const buffer = await requestArrayBuffer(cardUrl, 60000);
      const pdfText = await pdfTextFromArrayBuffer(buffer);
      const card = parseWarrenAppraisalCardText(
        pdfText,
        cardUrl,
        parcelNumber,
        taxYear,
        prid
      );

      if (card) return card;
    } catch (e) {
      // Search succeeded but Warren's report server did not return a readable
      // PDF. Keep the exact card URL so the user can still open it manually.
    }

    return {
      source: 'Warren County Tax Search',
      taxRecordUrl: cardUrl,
      raw: {
        parcelNumber,
        taxYear,
        prid,
        appraisalCardUrl: cardUrl,
        searchAddress: streetOnly
      }
    };
  }


  function htmlRowValue(doc, wantedLabel) {
    const target = normalizeSpaces(wantedLabel).toUpperCase();

    for (const tr of Array.from(doc.querySelectorAll('tr'))) {
      const cells = Array.from(tr.children)
        .filter(el => /^(TD|TH)$/i.test(el.tagName));

      if (cells.length < 2) continue;

      const label = normalizeSpaces(cells[0].textContent).toUpperCase();
      if (label === target) {
        return normalizeSpaces(cells[1].textContent);
      }
    }

    return '';
  }

  async function fetchVanceBuildingRecord(ownerId, parcelId) {
    ownerId = normalizeSpaces(ownerId);
    parcelId = normalizeSpaces(parcelId);

    if (!ownerId || !parcelId) return null;

    const url =
      'https://vance.ustaxdata.com/building.cfm' +
      `?ownerID=${encodeURIComponent(ownerId)}` +
      `&parcelID=${encodeURIComponent(parcelId)}` +
      '&groupParcel=';

    const html = await requestText(url, 9000);
    if (!html) return null;

    const doc = new DOMParser().parseFromString(html, 'text/html');

    const yearRaw = htmlRowValue(doc, 'Year Built');
    const heatedAreaRaw = htmlRowValue(doc, 'Heated Area (S/F)');
    const style = htmlRowValue(doc, 'Built Use/Style');

    const year = Number(String(yearRaw).replace(/[^\d]/g, ''));
    const sqft = Number(String(heatedAreaRaw).replace(/[^\d.]/g, ''));

    return {
      url,
      yearBuilt: Number.isFinite(year) && year > 0 ? year : '',
      squareFeet: Number.isFinite(sqft) && sqft > 0 ? sqft : '',
      dwellingStyle: finalStyle || '',
      raw: {
        yearBuilt: yearRaw || '',
        heatedArea: heatedAreaRaw || '',
        builtUseStyle: style || ''
      }
    };
  }

  function normalizeParcelId(v) {
    return String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  function extractYearBuiltFromHtml(html) {
    if (!html) return '';

    const candidates = [];

    const jsonRx = /["']yearBuilt["']\s*:\s*["']?(\d{4})["']?/gi;
    let m;
    while ((m = jsonRx.exec(html)) !== null) {
      candidates.push(Number(m[1]));
    }

    const textPatterns = [
      /\bBuilt\s+in\s+(\d{4})\b/gi,
      /\bYear\s+built\s*:?\s*(\d{4})\b/gi,
      /\bYearBuilt\b[^0-9]{0,20}(\d{4})\b/gi
    ];

    for (const rx of textPatterns) {
      while ((m = rx.exec(html)) !== null) {
        candidates.push(Number(m[1]));
      }
    }

    const valid = candidates.filter(
      y => Number.isFinite(y) && y >= 1700 && y <= new Date().getFullYear() + 1
    );

    const unique = [...new Set(valid)];
    return unique.length === 1 ? unique[0] : '';
  }

  function extractParcelFromHtml(html) {
    if (!html) return '';
    const patterns = [
      /["']parcelNumber["']\s*:\s*["']([^"']+)["']/i,
      /\bParcel\s+number\s*:?\s*([A-Za-z0-9 -]{5,30})/i,
      /\bAPN\s*:?\s*([A-Za-z0-9 -]{5,30})/i
    ];
    for (const rx of patterns) {
      const m = html.match(rx);
      if (m) return normalizeParcelId(m[1]);
    }
    return '';
  }

  async function fetchPublicYearBuilt(address, expectedParcelId = '') {
    address = normalizeSpaces(address);
    if (!address) return null;

    const expectedParcel = normalizeParcelId(expectedParcelId);

    const searchUrl =
      'https://www.zillow.com/homes/' +
      encodeURIComponent(address).replace(/%20/g, '-') +
      '_rb/';

    try {
      const searchHtml = await requestText(searchUrl, 10000);
      if (!searchHtml) return null;

      if (/captcha|verify you are human|access denied|robot check/i.test(searchHtml)) {
        return null;
      }

      let year = extractYearBuiltFromHtml(searchHtml);
      let parcel = extractParcelFromHtml(searchHtml);

      if (year && (!expectedParcel || !parcel || parcel === expectedParcel)) {
        return {
          yearBuilt: year,
          source: 'Zillow public record fallback',
          url: searchUrl,
          parcel: parcel || ''
        };
      }

      const links = [];
      const linkRx = /https?:\/\/www\.zillow\.com\/homedetails\/[^"'<>\\\s]+/gi;
      let lm;
      while ((lm = linkRx.exec(searchHtml)) !== null) {
        links.push(lm[0].replace(/&amp;/g, '&'));
      }

      const relRx = /["'](\/homedetails\/[^"'<>\\\s]+)["']/gi;
      while ((lm = relRx.exec(searchHtml)) !== null) {
        links.push('https://www.zillow.com' + lm[1].replace(/&amp;/g, '&'));
      }

      const uniqueLinks = [...new Set(links)].slice(0, 8);

      for (const detailUrl of uniqueLinks) {
        let detailHtml = '';
        try {
          detailHtml = await requestText(detailUrl, 10000);
        } catch (e) {
          continue;
        }

        if (!detailHtml ||
            /captcha|verify you are human|access denied|robot check/i.test(detailHtml)) {
          continue;
        }

        year = extractYearBuiltFromHtml(detailHtml);
        if (!year) continue;

        parcel = extractParcelFromHtml(detailHtml);

        if (expectedParcel && parcel && parcel !== expectedParcel) {
          continue;
        }

        return {
          yearBuilt: year,
          source: 'Zillow public record fallback',
          url: detailUrl,
          parcel: parcel || ''
        };
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  function extractSquareFeetFromHtml(html) {
    if (!html) return '';

    const values = [];
    const patterns = [
      /["']livingArea["']\s*:\s*(\d{3,6})/gi,
      /["']livingAreaValue["']\s*:\s*(\d{3,6})/gi,
      /\bLiving\s+area\s*:?\s*([\d,]{3,7})\s*(?:sq\.?\s*ft|sqft|square feet)?/gi,
      /\b([\d,]{3,7})\s+sq\.?\s*ft\b/gi
    ];

    for (const rx of patterns) {
      let m;
      while ((m = rx.exec(html)) !== null) {
        const n = Number(String(m[1]).replace(/,/g, ''));
        if (Number.isFinite(n) && n >= 200 && n <= 50000) values.push(n);
      }
    }

    const unique = [...new Set(values)];
    return unique.length === 1 ? unique[0] : '';
  }

  async function fetchPublicPropertyFacts(address, expectedParcelId = '') {
    address = normalizeSpaces(address);
    if (!address) return null;

    const expectedParcel = normalizeParcelId(expectedParcelId);
    const searchUrl =
      'https://www.zillow.com/homes/' +
      encodeURIComponent(address).replace(/%20/g, '-') +
      '_rb/';

    try {
      const searchHtml = await requestText(searchUrl, 10000);
      if (!searchHtml ||
          /captcha|verify you are human|access denied|robot check/i.test(searchHtml)) {
        return null;
      }

      const links = [];
      const absRx = /https?:\/\/www\.zillow\.com\/homedetails\/[^"'<>\\\s]+/gi;
      let m;
      while ((m = absRx.exec(searchHtml)) !== null) {
        links.push(m[0].replace(/&amp;/g, '&'));
      }

      const relRx = /["'](\/homedetails\/[^"'<>\\\s]+)["']/gi;
      while ((m = relRx.exec(searchHtml)) !== null) {
        links.push('https://www.zillow.com' + m[1].replace(/&amp;/g, '&'));
      }

      const uniqueLinks = [...new Set(links)].slice(0, 8);

      // Prefer the exact property detail page because search pages may contain
      // facts for nearby homes as well.
      for (const detailUrl of uniqueLinks) {
        let html = '';
        try {
          html = await requestText(detailUrl, 10000);
        } catch (e) {
          continue;
        }

        if (!html ||
            /captcha|verify you are human|access denied|robot check/i.test(html)) {
          continue;
        }

        const parcel = extractParcelFromHtml(html);
        if (expectedParcel && parcel && parcel !== expectedParcel) continue;

        const yearBuilt = extractYearBuiltFromHtml(html);
        const squareFeet = extractSquareFeetFromHtml(html);

        if (yearBuilt || squareFeet || parcel) {
          return {
            source: 'Public real-estate record fallback',
            yearBuilt: yearBuilt || '',
            squareFeet: squareFeet || '',
            parcel: parcel || '',
            url: detailUrl
          };
        }
      }

      // Last resort: exact-address search page, but only accept unambiguous facts.
      const parcel = extractParcelFromHtml(searchHtml);
      if (expectedParcel && parcel && parcel !== expectedParcel) return null;

      const yearBuilt = extractYearBuiltFromHtml(searchHtml);
      const squareFeet = extractSquareFeetFromHtml(searchHtml);

      if (yearBuilt || squareFeet || parcel) {
        return {
          source: 'Public real-estate record fallback',
          yearBuilt: yearBuilt || '',
          squareFeet: squareFeet || '',
          parcel: parcel || '',
          url: searchUrl
        };
      }
    } catch (e) {}

    return null;
  }

  async function primeGranvilleSession() {
    try {
      await requestText(GRANVILLE_TAX_SEARCH, 8000);
    } catch (e) {}
  }

  function readableGranvilleValue(v) {
    const s = normalizeSpaces(v);
    if (!s) return '';

    // Granville's downloadable tax files contain coded values such as =01, =02, =04.
    // Do not display those as if they were human-readable underwriting values.
    if (/^=?\d{1,4}$/.test(s)) return '';

    return s.replace(/^=/, '').trim();
  }

  function firstHeaderIndex(headers, patterns) {
    const normalized = headers.map(h => normalizeSpaces(h).toUpperCase());
    for (const rx of patterns) {
      const idx = normalized.findIndex(h => rx.test(h));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function compactGranvilleIndex(parcelText, buildingText) {
    const parcelRows = parseCsv(parcelText);
    const buildingRows = parseCsv(buildingText);

    if (!parcelRows.length || !buildingRows.length) {
      throw new Error('Granville tax data files were empty.');
    }

    const ph = parcelRows[0].map(normalizeSpaces);
    const bh = buildingRows[0].map(normalizeSpaces);

    const pParcel = firstHeaderIndex(ph, [
      /^PARCEL(\s|$)/i, /PARCEL.*(NO|NUMBER|ID)/i, /^PIN$/i, /PARCEL/i
    ]);
    const pAddress = firstHeaderIndex(ph, [
      /^PROPERTY\s*ADDRESS$/i, /^SITE\s*ADDRESS$/i, /^SITUS\s*ADDRESS$/i,
      /^ADDRESS$/i, /PROPERTY.*ADDRESS/i, /SITE.*ADDRESS/i, /SITUS/i, /ADDRESS/i
    ]);
    const pCity = firstHeaderIndex(ph, [/^CITY$/i, /PROPERTY.*CITY/i, /SITE.*CITY/i]);
    const pZip = firstHeaderIndex(ph, [/^ZIP$/i, /ZIP.*CODE/i, /POSTAL/i]);
    const pFire = firstHeaderIndex(ph, [/FIRE.*INSURANCE/i, /FIRE.*DISTRICT/i]);

    const bParcel = firstHeaderIndex(bh, [
      /^PARCEL(\s|$)/i, /PARCEL.*(NO|NUMBER|ID)/i, /^PIN$/i, /PARCEL/i
    ]);
    const bYear = firstHeaderIndex(bh, [
      /^AYB$/i, /YEAR.*BUILT/i, /YR.*BUILT/i, /^YEAR$/i
    ]);
    const bSqft = firstHeaderIndex(bh, [
      /\bHSF\b/i, /HEATED.*(AREA|SF|SQUARE)/i,
      /(LIVING|FINISHED).*(AREA|SF|SQUARE)/i, /SQUARE.*FEET/i, /\bSQFT\b/i
    ]);
    const bStyle = firstHeaderIndex(bh, [
      /BUILT.*USE/i, /STYLE/i, /DWELL/i, /BLDG.*TYPE/i, /BUILDING.*TYPE/i
    ]);
    const bStories = firstHeaderIndex(bh, [/STOR(Y|IES)/i, /STORY.*HEIGHT/i]);
    const bConstruction = firstHeaderIndex(bh, [
      /EXTERIOR.*WALL/i, /CONSTRUCTION/i, /WALL.*TYPE/i
    ]);
    const bRoof = firstHeaderIndex(bh, [/ROOF.*(COVER|MATERIAL)/i]);

    if (pParcel < 0 || pAddress < 0 || bParcel < 0) {
      throw new Error('Granville tax file columns were not recognized.');
    }

    const byStreet = Object.create(null);
    for (const r of parcelRows.slice(1)) {
      const parcel = normKey(r[pParcel]);
      const address = normalizeSpaces(r[pAddress]);
      if (!parcel || !address) continue;

      const streetKey = normalizeAddressForMatch(address);
      if (!streetKey) continue;

      const rec = {
        p: parcel,
        a: address,
        c: pCity >= 0 ? normalizeSpaces(r[pCity]) : '',
        z: pZip >= 0 ? normalizeSpaces(r[pZip]).slice(0, 5) : '',
        f: pFire >= 0 ? normalizeSpaces(r[pFire]) : ''
      };

      (byStreet[streetKey] ||= []).push(rec);
    }

    const byParcel = Object.create(null);
    for (const r of buildingRows.slice(1)) {
      const parcel = normKey(r[bParcel]);
      if (!parcel) continue;

      const year = bYear >= 0 ? Number(String(r[bYear]).replace(/[^\d]/g, '')) : 0;
      const sqft = bSqft >= 0 ? Number(String(r[bSqft]).replace(/[^0-9.]/g, '')) : 0;
      const rec = {
        y: Number.isFinite(year) && year > 0 ? year : '',
        s: Number.isFinite(sqft) && sqft > 0 ? sqft : '',
        d: bStyle >= 0 ? normalizeSpaces(r[bStyle]) : '',
        t: bStories >= 0 ? normalizeSpaces(r[bStories]) : '',
        c: bConstruction >= 0 ? normalizeSpaces(r[bConstruction]) : '',
        r: bRoof >= 0 ? normalizeSpaces(r[bRoof]) : ''
      };

      (byParcel[parcel] ||= []).push(rec);
    }

    return {
      fetchedAt: Date.now(),
      byStreet,
      byParcel
    };
  }

  async function loadGranvilleLocalIndex(forceRefresh = false) {
    if (!forceRefresh && granvilleLocalIndex) return granvilleLocalIndex;

    if (!forceRefresh) {
      try {
        const cached = await GM_getValue(GRANVILLE_CACHE_KEY, null);
        if (cached && cached.fetchedAt &&
            Date.now() - cached.fetchedAt < GRANVILLE_CACHE_MAX_AGE &&
            cached.byStreet && cached.byParcel) {
          granvilleLocalIndex = cached;
          return cached;
        }
      } catch (e) {}
    }

    // These are background HTTP fetches, not browser downloads. The user will
    // not get files in Downloads. We fetch them only when the cache is missing
    // or older than 30 days, then reuse the local index for later searches.
    const [parcelText, buildingText] = await Promise.all([
      requestText(GRANVILLE_PARCEL_CSV, 30000),
      requestText(GRANVILLE_BUILDING_CSV, 30000)
    ]);

    const index = compactGranvilleIndex(parcelText, buildingText);

    try {
      await GM_setValue(GRANVILLE_CACHE_KEY, index);
    } catch (e) {
      // Even if persistent storage fails, keep it in memory for this session.
    }

    granvilleLocalIndex = index;
    return index;
  }

  function chooseGranvilleBuilding(rows) {
    if (!rows || !rows.length) return null;

    return rows.find(r => Number(r.y) > 0 && Number(r.s) > 0) ||
           rows.find(r => Number(r.y) > 0 || Number(r.s) > 0) ||
           rows[0];
  }

  async function lookupGranvilleLocalProperty(rawAddress) {
    const parsed = splitAddress(rawAddress);
    const street = normalizeAddressForMatch(parsed.street || rawAddress);
    if (!street) return null;

    let index;
    try {
      index = await loadGranvilleLocalIndex(false);
    } catch (e) {
      return null;
    }

    let matches = (index.byStreet && index.byStreet[street]) || [];
    if (!matches.length) return null;

    const wantedCity = normalizeSpaces(parsed.city).toUpperCase();
    const wantedZip = normalizeSpaces(parsed.zip).slice(0, 5);

    if (matches.length > 1 && wantedZip) {
      const z = matches.filter(m => m.z === wantedZip);
      if (z.length) matches = z;
    }

    if (matches.length > 1 && wantedCity) {
      const c = matches.filter(m => normalizeSpaces(m.c).toUpperCase() === wantedCity);
      if (c.length) matches = c;
    }

    if (matches.length !== 1) return null;

    const parcelRec = matches[0];
    const building = chooseGranvilleBuilding(index.byParcel[parcelRec.p] || []);

    return {
      parcel: parcelRec.p,
      address: parcelRec.a,
      fireDistrict: readableGranvilleValue(parcelRec.f) || '',
      yearBuilt: building && building.y ? building.y : '',
      squareFeet: building && building.s ? building.s : '',
      dwellingStyle: building && building.d ? readableGranvilleValue(building.d) : '',
      stories: building && building.t ? readableGranvilleValue(building.t) : '',
      construction: building && building.c ? readableGranvilleValue(building.c) : '',
      roofMaterial: building && building.r ? readableGranvilleValue(building.r) : '',
      source: 'Granville County cached tax data'
    };
  }

  let granvilleBuildingCache = null;
  let granvilleParcelCache = null;

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          quoted = true;
        } else if (ch === ',') {
          row.push(field);
          field = '';
        } else if (ch === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else if (ch !== '\r') {
          field += ch;
        }
      }
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function normKey(v) {
    return String(v || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  function findHeaderIndex(headers, patterns) {
    const normalized = headers.map(h => normalizeSpaces(h).toUpperCase());
    for (const p of patterns) {
      const idx = normalized.findIndex(h => p.test(h));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  async function loadGranvilleBuildingCsv() {
    if (granvilleBuildingCache) return granvilleBuildingCache;

    const text = await requestText(GRANVILLE_BUILDING_CSV, 15000);
    const rows = parseCsv(text);

    if (!rows.length) {
      throw new Error('Granville tax building file was empty.');
    }

    const headers = rows[0].map(h => normalizeSpaces(h));

    granvilleBuildingCache = {
      headers,
      rows: rows.slice(1)
    };

    return granvilleBuildingCache;
  }

  async function loadGranvilleParcelCsv() {
    if (granvilleParcelCache) return granvilleParcelCache;

    const text = await requestText(GRANVILLE_PARCEL_CSV, 15000);
    const rows = parseCsv(text);

    if (!rows.length) {
      throw new Error('Granville tax parcel file was empty.');
    }

    const headers = rows[0].map(h => normalizeSpaces(h));
    granvilleParcelCache = {
      headers,
      rows: rows.slice(1)
    };
    return granvilleParcelCache;
  }

  async function lookupGranvilleParcelCsvByAddress(rawAddress) {
    const parsed = splitAddress(rawAddress);
    const wantedStreet = normalizeAddressForMatch(parsed.street || rawAddress);
    if (!wantedStreet) return null;

    let csv;
    try {
      csv = await loadGranvilleParcelCsv();
    } catch (e) {
      return null;
    }

    const headers = csv.headers;

    const parcelIdx = findHeaderIndex(headers, [
      /^PARCEL(\s|$)/i,
      /PARCEL.*(NO|NUMBER|ID)/i,
      /^PIN$/i,
      /PARCEL/i
    ]);

    const addressIdx = findHeaderIndex(headers, [
      /^PROPERTY\s*ADDRESS$/i,
      /^SITE\s*ADDRESS$/i,
      /^SITUS\s*ADDRESS$/i,
      /^ADDRESS$/i,
      /PROPERTY.*ADDRESS/i,
      /SITE.*ADDRESS/i,
      /SITUS/i,
      /ADDRESS/i
    ]);

    if (parcelIdx < 0 || addressIdx < 0) return null;

    const matches = csv.rows.filter(r =>
      normalizeAddressForMatch(r[addressIdx]) === wantedStreet
    );

    if (matches.length !== 1) return null;

    const row = matches[0];
    const parcel = normalizeSpaces(row[parcelIdx]).replace(/[^0-9A-Za-z]/g, '');
    if (!parcel) return null;

    return {
      parcel,
      address: normalizeSpaces(row[addressIdx]),
      source: 'Granville County Tax Parcel Data',
      raw: { headers, matchedRow: row }
    };
  }

  function tableRowsById(doc, tableId) {
    const table = doc.getElementById(tableId);
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td =>
        normalizeSpaces(td.getAttribute('title') || td.textContent)
      )
    );
  }

  function firstStructuralElement(doc, wanted) {
    const rows = tableRowsById(doc, 'BuildingStructuralElementsData');
    const row = rows.find(r =>
      r.length >= 2 &&
      normalizeSpaces(r[0]).toUpperCase() === wanted.toUpperCase()
    );
    return row && row[1] ? normalizeSpaces(row[1]) : '';
  }

  function extractGranvillePrid(html) {
    if (!html) return '';

    const patterns = [
      /AppraisalCard\.aspx\?prid=(\d+)/i,
      /PopulateTable\("BuildingData",\s*'\{~id~:~(\d+)~/i,
      /PopulateTable\("LandData",\s*'\{~id~:~(\d+)~/i
    ];

    for (const rx of patterns) {
      const m = html.match(rx);
      if (m) return m[1];
    }
    return '';
  }

  function parseGranvillePrc(html, url, parcelId) {
    if (!html) return null;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = normalizeSpaces(doc.body ? doc.body.textContent : html);

    const yearPatterns = [
      /\bAYB\s*:?\s*(\d{4})\b/i,
      /\bACTUAL\s+YEAR\s+BUILT\s*:?\s*(\d{4})\b/i,
      /\bYEAR\s+BUILT\s*:?\s*(\d{4})\b/i
    ];

    let year = 0;
    for (const rx of yearPatterns) {
      const m = text.match(rx);
      if (m) {
        year = Number(m[1]);
        break;
      }
    }

    const sqftPatterns = [
      /\b([\d,]+)\s+HSF\b/i,
      /\bHSF\s*:?\s*([\d,]+)\b/i,
      /\bHEATED\s+(?:AREA|SQUARE\s+FEET)\s*:?\s*([\d,]+)\b/i
    ];

    let sqft = 0;
    for (const rx of sqftPatterns) {
      const m = text.match(rx);
      if (m) {
        sqft = Number(m[1].replace(/,/g, ''));
        break;
      }
    }

    let roofMaterial = '';
    const roofMatch = text.match(/\bRoof(?:ing)?\s+(?:Cover|Material)\s*:?\s*([A-Z][A-Z0-9 /-]{2,30})/i);
    if (roofMatch) roofMaterial = normalizeSpaces(roofMatch[1]);

    let construction = '';
    const extMatch = text.match(/\bExterior\s+Walls?\s*:?\s*([A-Z][A-Z0-9 /-]{2,30})/i);
    if (extMatch) construction = normalizeSpaces(extMatch[1]);

    return {
      source: 'Granville County Property Record Card',
      url,
      parcelId,
      yearBuilt: Number.isFinite(year) && year > 0 ? year : '',
      squareFeet: Number.isFinite(sqft) && sqft > 0 ? sqft : '',
      construction,
      roofMaterial,
      rawTextSample: text.slice(0, 5000)
    };
  }

  async function searchGranvilleTaxByAddress(rawAddress) {
    const parsed = splitAddress(rawAddress);
    const street = normalizeSpaces(parsed.street || rawAddress);
    if (!street) return null;

    const params = new URLSearchParams({
      FormattedPropertyAddress: street,
      ParcelSearch: 'false'
    });

    const url = `${GRANVILLE_TAX_SEARCH}?${params.toString()}`;

    try {
      const html = await requestText(url, 12000);
      if (!html) return null;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = Array.from(doc.querySelectorAll('#RealEstateSearch tbody tr'));
      if (!rows.length) return null;

      const wanted = normalizeAddressForMatch(street);

      for (const tr of rows) {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length < 4) continue;

        const parcel = normalizeSpaces(cells[0].getAttribute('title') || cells[0].textContent);
        const addr = normalizeSpaces(cells[3].getAttribute('title') || cells[3].textContent);

        if (normalizeAddressForMatch(addr) === wanted && parcel) {
          return {
            parcel: parcel.replace(/[^0-9A-Za-z]/g, ''),
            address: addr,
            url
          };
        }
      }
    } catch (e) {}

    return null;
  }

  async function fetchGranvilleAppraisalCard(feature) {
    const a = feature && feature.attributes ? feature.attributes : {};

    const candidates = [a.parno, a.altparno, a.mapref]
      .filter(Boolean)
      .map(v => String(v).replace(/[^0-9A-Za-z]/g, ''))
      .filter(Boolean);

    for (const parcelId of [...new Set(candidates)]) {
      // First try Granville's directly indexed appraisal-card URL using parcel number.
      try {
        const directUrl = GRANVILLE_APPRAISAL_CARD + encodeURIComponent(parcelId);
        const directHtml = await requestText(directUrl, 12000);
        const direct = parseGranvillePrc(directHtml, directUrl, parcelId);

        if (direct && (direct.yearBuilt || direct.squareFeet ||
                       direct.construction || direct.roofMaterial)) {
          return direct;
        }
      } catch (e) {}

      // Fallback: parcel profile -> internal PRID -> printable appraisal card.
      try {
        const profileUrl = GRANVILLE_PARCEL_PROFILE + encodeURIComponent(parcelId);
        const profileHtml = await requestText(profileUrl, 12000);
        if (!profileHtml) continue;

        const prid = extractGranvillePrid(profileHtml);
        if (!prid) continue;

        const prcUrl =
          'https://tax.granvillecounty.org/ITSPublic/AppraisalCard.aspx?prid=' +
          encodeURIComponent(prid);

        const prcHtml = await requestText(prcUrl, 12000);
        const prc = parseGranvillePrc(prcHtml, prcUrl, parcelId);
        if (!prc) continue;

        const profileDoc = new DOMParser().parseFromString(profileHtml, 'text/html');

        const subRows = tableRowsById(profileDoc, 'BuildingSubareasData');
        for (const sr of subRows) {
          const desc = normalizeSpaces(sr[1] || '');
          if (/SNG FAML|SINGLE|RANCH|CAPE|COLONIAL|DUPLEX|MULTI|MOBILE|MANUF|MODULAR/i.test(desc)) {
            prc.dwellingStyle = desc;
            break;
          }
        }

        if (!prc.roofMaterial) {
          prc.roofMaterial = firstStructuralElement(profileDoc, 'Roofing Cover');
        }
        if (!prc.construction) {
          prc.construction = firstStructuralElement(profileDoc, 'Exterior Walls');
        }

        const locationRows = tableRowsById(profileDoc, 'LocationCodeData');
        for (const lr of locationRows) {
          if (normalizeSpaces(lr[0]).toUpperCase() === 'FIREINSURANCE') {
            prc.fireDistrict = normalizeSpaces(lr[2] || '');
            break;
          }
        }

        if (prc.yearBuilt || prc.squareFeet || prc.dwellingStyle ||
            prc.construction || prc.roofMaterial || prc.fireDistrict) {
          return prc;
        }
      } catch (e) {}
    }

    return null;
  }

  function normalizeAddressForMatch(v) {
    return normalizeSpaces(v)
      .toUpperCase()
      .replace(/[.,#]/g, '')
      .replace(/\bSTREET\b/g, 'ST')
      .replace(/\bROAD\b/g, 'RD')
      .replace(/\bDRIVE\b/g, 'DR')
      .replace(/\bLANE\b/g, 'LN')
      .replace(/\bCOURT\b/g, 'CT')
      .replace(/\bAVENUE\b/g, 'AVE')
      .replace(/\bBOULEVARD\b/g, 'BLVD')
      .replace(/\bCIRCLE\b/g, 'CIR')
      .replace(/\bHIGHWAY\b/g, 'HWY')
      .replace(/\bPARKWAY\b/g, 'PKWY')
      .replace(/\bTERRACE\b/g, 'TER')
      .replace(/\bTRAIL\b/g, 'TRL')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function fetchGranvilleBuildingRecord(feature, lookupResult = null) {
    const a = feature && feature.attributes ? feature.attributes : {};

    const fullParcel = normKey(a.parno || '');
    const altParcel = normKey(a.altparno || '');
    const mapRef = normKey(a.mapref || '');

    const wantedStreet = normalizeAddressForMatch(
      (lookupResult && lookupResult.parsed && lookupResult.parsed.street) ||
      a.siteadd ||
      ''
    );

    let csv;
    try {
      csv = await loadGranvilleBuildingCsv();
    } catch (e) {
      return {
        error: e && e.message ? e.message : 'Granville tax building file unavailable.'
      };
    }

    const headers = csv.headers;

    const parcelIdx = findHeaderIndex(headers, [
      /^PARCEL(\s|$)/i,
      /PARCEL.*(NO|NUMBER|ID)/i,
      /^PIN$/i,
      /PARCEL/i
    ]);

    const addressIdx = findHeaderIndex(headers, [
      /^PROPERTY\s*ADDRESS$/i,
      /^SITE\s*ADDRESS$/i,
      /^SITUS\s*ADDRESS$/i,
      /^ADDRESS$/i,
      /PROPERTY.*ADDRESS/i,
      /SITE.*ADDRESS/i,
      /SITUS/i,
      /ADDRESS/i
    ]);

    const yearIdx = findHeaderIndex(headers, [
      /YEAR.*BUILT/i,
      /YR.*BUILT/i,
      /^AYB$/i,
      /^YEAR$/i
    ]);

    const sqftIdx = findHeaderIndex(headers, [
      /HEATED.*(AREA|SF|SQUARE)/i,
      /(LIVING|FINISHED).*(AREA|SF|SQUARE)/i,
      /SQUARE.*FEET/i,
      /\bHSF\b/i,
      /\bSQFT\b/i
    ]);

    const styleIdx = findHeaderIndex(headers, [
      /BUILT.*USE/i,
      /STYLE/i,
      /DWELL/i,
      /BLDG.*TYPE/i,
      /BUILDING.*TYPE/i
    ]);

    const storiesIdx = findHeaderIndex(headers, [
      /STOR(Y|IES)/i,
      /STORY.*HEIGHT/i
    ]);

    let matches = [];
    let matchType = '';

    // First choice: exact full parcel number.
    if (parcelIdx >= 0 && fullParcel) {
      matches = csv.rows.filter(r => normKey(r[parcelIdx]) === fullParcel);
      if (matches.length) matchType = 'parcel';
    }

    // Second choice: exact alternate parcel, but only when no full parcel exists.
    if (!matches.length && parcelIdx >= 0 && !fullParcel && altParcel) {
      matches = csv.rows.filter(r => normKey(r[parcelIdx]) === altParcel);
      if (matches.length) matchType = 'alternate parcel';
    }

    // Critical Granville fallback: exact property street address.
    // This is what we need when NC OneMap identifies Granville County but
    // does not return Granville's parcel number.
    if (!matches.length && addressIdx >= 0 && wantedStreet) {
      matches = csv.rows.filter(r => {
        const got = normalizeAddressForMatch(r[addressIdx]);
        return got === wantedStreet;
      });
      if (matches.length) matchType = 'exact property address';
    }

    if (!matches.length) return null;

    // If more than one building row exists for the same property, prefer a row
    // with a real AYB and heated/living square footage.
    const row = matches.find(r =>
      (yearIdx >= 0 && Number(String(r[yearIdx]).replace(/[^\d]/g, '')) > 0) &&
      (sqftIdx >= 0 && Number(String(r[sqftIdx]).replace(/[^0-9.]/g, '')) > 0)
    ) || matches.find(r =>
      (yearIdx >= 0 && Number(String(r[yearIdx]).replace(/[^\d]/g, '')) > 0) ||
      (sqftIdx >= 0 && Number(String(r[sqftIdx]).replace(/[^0-9.]/g, '')) > 0)
    ) || matches[0];

    const year = yearIdx >= 0
      ? Number(String(row[yearIdx]).replace(/[^\d]/g, ''))
      : 0;

    const sqft = sqftIdx >= 0
      ? Number(String(row[sqftIdx]).replace(/[^0-9.]/g, ''))
      : 0;

    const stories = storiesIdx >= 0
      ? Number(String(row[storiesIdx]).replace(/[^0-9.]/g, ''))
      : 0;

    return {
      source: 'Granville County Tax Building Data',
      matchType,
      parcelMatched: parcelIdx >= 0 ? normKey(row[parcelIdx]) : '',
      addressMatched: addressIdx >= 0 ? normalizeSpaces(row[addressIdx]) : '',
      yearBuilt: Number.isFinite(year) && year > 0 ? year : '',
      squareFeet: Number.isFinite(sqft) && sqft > 0 ? sqft : '',
      dwellingStyle: styleIdx >= 0 ? normalizeSpaces(row[styleIdx]) : '',
      stories: Number.isFinite(stories) && stories > 0 ? stories : '',
      raw: {
        headers,
        matchedRow: row
      }
    };
  }

  function splitAddress(raw) {
    const original = normalizeSpaces(raw);
    let text = original.replace(/\s*,\s*/g, ', ');

    // Pull NC + ZIP from the end first.
    let zip = '';
    let state = '';
    const tail = text.match(/\bNC\b(?:\s+(\d{5}(?:-\d{4})?))?\s*$/i);
    if (tail) {
      state = 'NC';
      zip = tail[1] || '';
      text = normalizeSpaces(text.slice(0, tail.index).replace(/,\s*$/, ''));
    } else {
      const zm = text.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
      if (zm) {
        zip = zm[1];
        text = normalizeSpaces(text.slice(0, zm.index).replace(/,\s*$/, ''));
      }
    }

    let street = '';
    let city = '';

    // Comma form: 123 Main St, Raleigh
    const commaParts = text.split(',').map(normalizeSpaces).filter(Boolean);
    if (commaParts.length >= 2) {
      street = commaParts[0];
      city = commaParts.slice(1).join(' ');
    } else {
      // No comma between street and city:
      // identify the end of the street using common NC street suffixes.
      const suffixRx =
        /\b(ALY|AVE|AVENUE|BLVD|BOULEVARD|CIR|CIRCLE|CT|COURT|DR|DRIVE|HWY|HIGHWAY|LN|LANE|PKWY|PARKWAY|PL|PLACE|RD|ROAD|ST|STREET|TER|TERRACE|TRL|TRAIL|WAY)\b/i;
      const m = suffixRx.exec(text);
      if (m) {
        const end = m.index + m[0].length;
        street = normalizeSpaces(text.slice(0, end));
        city = normalizeSpaces(text.slice(end));
      } else {
        street = text;
      }
    }

    return { raw: original, street, city, state, zip };
  }

  function streetKey(street) {
    return normalizeSpaces(street)
      .toUpperCase()
      .replace(/[.,]/g, '')
      .replace(/\bSTREET\b/g, 'ST')
      .replace(/\bROAD\b/g, 'RD')
      .replace(/\bDRIVE\b/g, 'DR')
      .replace(/\bLANE\b/g, 'LN')
      .replace(/\bCOURT\b/g, 'CT')
      .replace(/\bAVENUE\b/g, 'AVE')
      .replace(/\bBOULEVARD\b/g, 'BLVD')
      .replace(/\bCIRCLE\b/g, 'CIR')
      .replace(/\bHIGHWAY\b/g, 'HWY')
      .replace(/\bPARKWAY\b/g, 'PKWY')
      .replace(/\bTERRACE\b/g, 'TER')
      .replace(/\bTRAIL\b/g, 'TRL');
  }

  function streetParts(street) {
    const s = streetKey(street);
    const m = s.match(/^(\d+[A-Z-]*)\s+(.+)$/);
    const house = m ? m[1] : '';
    const rest = m ? m[2] : s;

    const suffixes = new Set([
      'ALY','AVE','BLVD','CIR','CT','DR','HWY','LN','PKWY','PL','RD','ST','TER','TRL','WAY'
    ]);

    const words = rest.split(/\s+/).filter(Boolean);
    let suffix = '';
    if (words.length && suffixes.has(words[words.length - 1])) {
      suffix = words.pop();
    }

    return {
      house,
      streetName: words.join(' '),
      suffix
    };
  }

  function buildCandidateWhere(a, mode) {
    const p = streetParts(a.street);
    const house = escSql(p.house);
    const city = escSql((a.city || '').toUpperCase());
    const zip = escSql((a.zip || '').slice(0, 5));

    if (!house) return '1=0';

    // Query only a small candidate set using indexed/simple fields.
    // Then we compare the street text locally in JavaScript.
    if (mode === 0 && zip) {
      return `saddno = '${house}' AND szip LIKE '${zip}%'`;
    }
    if (mode === 1 && city) {
      return `saddno = '${house}' AND UPPER(scity) = '${city}'`;
    }
    return `saddno = '${house}'`;
  }

  function normalizeStreetForCompare(s) {
    return normalizeSpaces(String(s || ''))
      .toUpperCase()
      .replace(/[.,#]/g, '')
      .replace(/\bSTREET\b/g, 'ST')
      .replace(/\bROAD\b/g, 'RD')
      .replace(/\bDRIVE\b/g, 'DR')
      .replace(/\bLANE\b/g, 'LN')
      .replace(/\bCOURT\b/g, 'CT')
      .replace(/\bAVENUE\b/g, 'AVE')
      .replace(/\bBOULEVARD\b/g, 'BLVD')
      .replace(/\bCIRCLE\b/g, 'CIR')
      .replace(/\bHIGHWAY\b/g, 'HWY')
      .replace(/\bPARKWAY\b/g, 'PKWY')
      .replace(/\bTERRACE\b/g, 'TER')
      .replace(/\bTRAIL\b/g, 'TRL')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function streetSimilarity(inputStreet, featureAttrs) {
    const wanted = normalizeStreetForCompare(inputStreet);
    const siteadd = normalizeStreetForCompare(featureAttrs.siteadd || '');
    const fullStreet = normalizeStreetForCompare(
      [featureAttrs.saddno, featureAttrs.saddpref, featureAttrs.saddstname,
       featureAttrs.saddstsuf, featureAttrs.saddsttyp].filter(Boolean).join(' ')
    );

    if (siteadd === wanted || fullStreet === wanted) return 100;
    if (siteadd.startsWith(wanted) || fullStreet.startsWith(wanted)) return 95;

    const wantedNoHouse = wanted.replace(/^\d+[A-Z-]*\s+/, '');
    const siteNoHouse = siteadd.replace(/^\d+[A-Z-]*\s+/, '');
    const fullNoHouse = fullStreet.replace(/^\d+[A-Z-]*\s+/, '');

    if (siteNoHouse === wantedNoHouse || fullNoHouse === wantedNoHouse) return 90;
    if (siteNoHouse.includes(wantedNoHouse) || fullNoHouse.includes(wantedNoHouse)) return 80;

    const tokens = wantedNoHouse.split(' ').filter(Boolean);
    const hay = `${siteNoHouse} ${fullNoHouse}`;
    const hits = tokens.filter(t => hay.includes(t)).length;
    return tokens.length ? Math.round((hits / tokens.length) * 70) : 0;
  }

  async function geocodeAddress(raw) {
    const params = new URLSearchParams({
      f: 'json',
      SingleLine: normalizeSpaces(raw),
      outFields: '*',
      outSR: '4326',
      maxLocations: '5'
    });

    const data = await requestJson(`${NC_GEOCODER}?${params.toString()}`);
    const candidates = (data.candidates || []).filter(c => Number(c.score || 0) >= 80);
    if (!candidates.length) return null;
    return candidates[0];
  }

  async function parcelAtPoint(pt) {
    const outFields = [
      'parno','altparno','siteadd','scity','sstate','stname','szip',
      'cntyname','cntyfips','struct','multistruc','structno','structyear',
      'parusecode','parusedesc','sourceagnt','mapref'
    ].join(',');

    const params = new URLSearchParams({
      f: 'json',
      geometry: `${pt.x},${pt.y}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields,
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '10'
    });

    return requestJson(`${ONE_MAP_QUERY}?${params.toString()}`);
  }

  async function statewideLookup(raw) {
    const parsed = splitAddress(raw);
    let candidate = null;
    let geocodeError = '';

    try {
      candidate = await geocodeAddress(raw);
    } catch (e) {
      geocodeError = e && e.message ? e.message : 'Statewide geocoder unavailable.';
    }

    // Retry once with a cleaner address string if the first geocoder request
    // times out or returns nothing.
    if (!candidate) {
      const retryAddress = [
        parsed.street,
        parsed.city,
        parsed.state || 'NC',
        parsed.zip
      ].filter(Boolean).join(', ');

      if (retryAddress && retryAddress !== raw) {
        try {
          candidate = await geocodeAddress(retryAddress);
        } catch (e) {
          geocodeError = e && e.message ? e.message : geocodeError;
        }
      }
    }

    // Granville-specific escape hatch: the county's downloadable parcel data
    // can identify an exact street address even when NC OneMap is timing out.
    if (!candidate) {
      let g = null;

      try {
        g = await lookupGranvilleLocalProperty(raw);
      } catch (e) {}

      if (!g) {
        try {
          g = await lookupGranvilleParcelCsvByAddress(raw);
        } catch (e) {}
      }

      if (!g) {
        try {
          g = await searchGranvilleTaxByAddress(raw);
        } catch (e) {}
      }

      if (g && g.parcel) {
        return {
          parsed,
          geocode: null,
          data: {
            features: [{
              attributes: {
                parno: g.parcel,
                siteadd: g.address || parsed.street || raw,
                scity: parsed.city || '',
                sstate: 'NC',
                szip: parsed.zip || '',
                cntyname: 'Granville',
                sourceagnt: 'Granville County Tax'
              },
              geometry: null
            }],
            __searchMode: 2,
            __geocodeError: geocodeError || null
          }
        };
      }
    }

    if (!candidate || !candidate.location) {
      return {
        parsed,
        geocode: null,
        data: {
          features: [],
          __geocodeError: geocodeError || 'Address could not be geocoded.'
        }
      };
    }

    let data = { features: [] };

    try {
      data = await parcelAtPoint(candidate.location);
    } catch (e) {
      data = {
        features: [],
        __parcelLookupError: e && e.message
          ? e.message
          : 'Statewide parcel lookup unavailable.'
      };
    }

    data.__geocodeCandidate = candidate;
    if (!data.features) data.features = [];

    return { parsed, geocode: candidate, data };
  }

  function geometryCenter(g) {
    if (!g) return null;
    if (typeof g.x === 'number' && typeof g.y === 'number') {
      return { x: g.x, y: g.y };
    }
    if (g.rings && g.rings.length) {
      let sx = 0, sy = 0, n = 0;
      g.rings.forEach(ring => ring.forEach(p => {
        if (Array.isArray(p) && p.length >= 2) {
          sx += Number(p[0]); sy += Number(p[1]); n++;
        }
      }));
      if (n) return { x: sx / n, y: sy / n };
    }
    return null;
  }

  function countyName(sourceAgency) {
    const s = String(sourceAgency || '').trim();
    const m = s.match(/^(.+?)\s+County\b/i);
    return m ? `${normalizeSpaces(m[1])} County` : s;
  }

  async function queryPoint(url, pt, outFields) {
    const params = new URLSearchParams({
      f: 'json',
      geometry: `${pt.x},${pt.y}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields,
      returnGeometry: 'false',
      resultRecordCount: '5'
    });
    return requestJson(`${url}?${params.toString()}`);
  }


  async function queryPointNoPaging(url, pt, outFields, returnGeometry = false, timeoutMs = 12000) {
    const params = new URLSearchParams({
      f: 'json',
      geometry: `${pt.x},${pt.y}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: outFields || '*',
      returnGeometry: returnGeometry ? 'true' : 'false'
    });

    if (returnGeometry) {
      params.set('outSR', '4326');
    }

    return requestJson(`${url}?${params.toString()}`, timeoutMs);
  }


  async function queryWhere(url, where, outFields) {
    const params = new URLSearchParams({
      f: 'json',
      where,
      outFields,
      returnGeometry: 'false',
      resultRecordCount: '20'
    });
    return requestJson(`${url}?${params.toString()}`);
  }


  function haversineFeet(a, b) {
    const R = 6371008.8;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.y - a.y);
    const dLon = toRad(b.x - a.x);
    const lat1 = toRad(a.y);
    const lat2 = toRad(b.y);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const meters = 2 * R * Math.asin(Math.sqrt(h));
    return meters * 3.280839895;
  }

  async function nearestPointDistance(url, pt, outFields, radiusMeters = 3218.688) {
    const params = new URLSearchParams({
      f: 'json',
      geometry: `${pt.x},${pt.y}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(radiusMeters),
      units: 'esriSRUnit_Meter',
      outFields: outFields || '*',
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '200'
    });

    const data = await requestJson(`${url}?${params.toString()}`);
    const features = data.features || [];
    let best = null;

    for (const f of features) {
      const g = f.geometry;
      if (!g || typeof g.x !== 'number' || typeof g.y !== 'number') continue;
      const feet = haversineFeet(pt, { x: g.x, y: g.y });
      if (!best || feet < best.feet) {
        best = {
          feet,
          attributes: f.attributes || {}
        };
      }
    }
    return best;
  }

  function fmtDistanceFeet(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    if (n < 1000) return `${Math.round(n).toLocaleString()} ft`;
    return `${Math.round(n).toLocaleString()} ft (${(n / 5280).toFixed(2)} mi)`;
  }


  async function nearestPointDistanceNoPaging(url, pt, outFields, radiusMeters = 16093.44, timeoutMs = 7000) {
    const params = new URLSearchParams({
      f: 'json',
      geometry: `${pt.x},${pt.y}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: String(radiusMeters),
      units: 'esriSRUnit_Meter',
      outFields: outFields || '*',
      returnGeometry: 'true',
      outSR: '4326'
    });

    const data = await requestJson(`${url}?${params.toString()}`, timeoutMs);
    const features = data.features || [];
    let best = null;

    for (const f of features) {
      const g = f.geometry;
      if (!g || typeof g.x !== 'number' || typeof g.y !== 'number') continue;
      const feet = haversineFeet(pt, { x: g.x, y: g.y });
      if (!best || feet < best.feet) {
        best = { feet, attributes: f.attributes || {} };
      }
    }

    return best;
  }

  function firstMatchingAttribute(obj, keyPatterns) {
    if (!obj) return '';
    const keys = Object.keys(obj);
    for (const p of keyPatterns) {
      const key = keys.find(k => p.test(k));
      if (key && obj[key] !== null && obj[key] !== undefined && String(obj[key]).trim()) {
        return String(obj[key]).trim();
      }
    }
    return '';
  }

  const JOHNSTON_PPC = {
    '50/210': '3/9E',
    'ANTIOCH/O NEALS': '4/9E',
    'ANTIOCH/ONEALS': '4/9E',
    'BENSON/BANNER': '2/9E',
    'BENTONVILLE': '5/9E',
    'BETHANY/SHOEHEEL': '4/9E',
    'BLACKMANS CROSSROADS': '5/9E',
    'BROGDEN': '4/9E',
    'CLAYTON/CLAYTEX': '2/9E',
    'CLEVELAND/MCLEMORE': '2/9E',
    'CORINTH-HOLDERS': '3/9E',
    'ELEVATION': '4/9E',
    'FOUR OAKS/WYNN': '3/9E',
    'KENLY/BEULAH': '3/9E',
    'MEADOW': '5/9E',
    'MICRO': '2/9E',
    'NORTH SIDE': '3/9E',
    'PINE LEVEL/PI-LE': '3/9E',
    'PRINCETON/BOON HILL': '3/9E',
    'SELMA/SELMA RURAL': '3/9E',
    'SMITHFIELD/SMITHFIELD RURAL': '3/9E',
    'STRICKLANDS CROSSROADS': '4/9E',
    'WEST JOHNSTON': '3/9E',
    'WILSONS MILLS': '2/9E',
    'GARNER': '1/9E',
    'ZEBULON': '3/9E'
  };

  function normalizeDistrictName(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/[’']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function lookupJohnstonPpc(district) {
    const d = normalizeDistrictName(district);
    if (!d) return '';
    if (JOHNSTON_PPC[d]) return JOHNSTON_PPC[d];

    for (const [name, rating] of Object.entries(JOHNSTON_PPC)) {
      if (d.includes(name) || name.includes(d)) return rating;
    }
    return '';
  }

  const ORANGE_PPC = {
    'CALDWELL': '5/9E',
    'CANE CREEK': '5/9E',
    'CEDAR GROVE': '6/9E',
    'CENTRAL ORANGE': '5/9E',
    'EAST ALAMANCE': '3/9E',
    'EAST ORANGE': '5/9E',
    'GREATER CHAPEL HILL': '2/9E',
    'NORTH CHATHAM': '4/9E',
    'ORANGE NEW HOPE': '4/9E',
    'SOUTH ORANGE': '4/9E',
    'WEST ORANGE': '3/9E',
    'WHITE CROSS': '4/9E',
    'TOWN OF CARRBORO': '2',
    'TOWN OF CHAPEL HILL': '2',
    'TOWN OF HILLSBOROUGH': '5',
    'TOWN OF MEBANE': '2'
  };

  const VANCE_PPC = {
    'KITTRELL': '6',
    'GOLDEN BELT': '5',
    'DREWRY': '5',
    'COKESBURY': '5',
    'TOWNSVILLE': '6',
    'WATKINS': '6',
    'HICKSBORO': '6'
  };

  const NASH_PPC = {
    'WEST MOUNT': '4/9E',
    'MIDDLESEX/DRYWELLS': '4/9E',
    'MIDDLESEX': '4/9E',
    'DRYWELLS': '4/9E',
    'SPRING HOPE/TAR RIVER': '4/9E',
    'SPRING HOPE': '4/9E',
    'TAR RIVER': '4/9E',
    'CASTALIA': '5/9E',
    'BAILEY MUNICIPAL': '3/9E',
    'BAILEY': '3/9E',
    'GREEN HORNET': '4/9E',
    'BATTLEBORO/HARRISON': '4/9E',
    'BATTLEBORO': '4/9E',
    'HARRISON': '4/9E',
    'WHITAKERS/DAVENPORT': '5/9E',
    'WHITAKERS': '5/9E',
    'DAVENPORT': '5/9E',
    'SHARPSBURG': '3/9E',
    'TRI-COUNTY': '4/9E',
    'TRI COUNTY': '4/9E',
    'RED OAK': '5/9E',
    'FERRELLS': '5/9E',
    'NASHVILLE MUNICIPAL': '3/9E',
    'NASHVILLE': '3/9E',
    'GULLEY': '4/9E',
    'NS GULLEY': '4/9E',
    'N S GULLEY': '4/9E',
    'COOPERS': '5/9E',
    'MOMEYER': '4/9E',
    'SALEM': '6/9E',
    'STANHOPE': '6/9E'
  };

  function normalizePpcKey(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/[’']/g, '')
      .replace(/\bFIRE DISTRICT\b/g, '')
      .replace(/\bFD\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function lookupPpc(table, value) {
    const key = normalizePpcKey(value);
    if (!key) return '';
    if (table[key]) return table[key];

    for (const [name, rating] of Object.entries(table)) {
      if (key.includes(name) || name.includes(key)) return rating;
    }
    return '';
  }

  const HARNETT_PPC = {
    // OSFM/NCRRS rating published by Northwest Harnett Fire Department.
    // Effective 01/01/2025.
    'NORTHWEST HARNETT': '3/9E',

    // Harnett County published Angier / Black River rating.
    // Black River Rural: 3/9E, effective 05/01/2023.
    'ANGIER BLACK RIVER': '3/9E',
    'ANGIER & BLACK RIVER': '3/9E',
    'BLACK RIVER': '3/9E'
  };

  const WAKE_PPC = {
    // Verified current/officially published municipal or district ratings.
    'CARY': '1',
    'CARY FIRE': '1',
    'APEX': '1',
    'HYPEX': '1',
    'FUQUAY VARINA': '1',
    'FUQUAY-VARINA': '1',
    'FURINA': '2',
    'HOLLY SPRINGS': '1',
    'MORRISVILLE': '1',
    'KNIGHTDALE': '2',
    'ALERT': '2',
    'WAKE FOREST': '1',
    'WAKETTE': '2',
    'GARNER': '1',
    'GARNER SUBURBAN': '3/9E',
    'WAKE NEW HOPE': '2/9E',
    'WAKE-NEW HOPE': '2/9E',
    'WESTERN WAKE': '2',
    'DURHAM HIGHWAY': '2',
    'NORTHERN WAKE': '3',
    'FAIRVIEW': '3',
    'WENDELL': '1',
    'RALEIGH': '3'
  };

  function lookupWakePpc(fireDistrict, municipality = '') {
    const key = normalizePpcKey(fireDistrict);
    const muni = normalizePpcKey(municipality);
    if (!key && !muni) return '';

    // More-specific split/rural districts must be checked before the town name.
    if (key.includes('GARNER') && key.includes('SUBURBAN')) return '3/9E';
    if (key.includes('WAKE') && key.includes('NEW HOPE')) return '2/9E';
    if (key.includes('WAKETTE')) return '2';
    if (key.includes('FURINA')) return '2';
    if (key.includes('HYPEX')) return '1';
    if (key.includes('ALERT')) return '2';
    if (key.includes('WESTERN WAKE')) return '2';
    if (key.includes('DURHAM HIGHWAY')) return '2';
    if (key.includes('NORTHERN WAKE')) return '3';
    if (key.includes('FAIRVIEW')) return '3';

    // Wendell has different published town and surrounding rural ratings.
    // Use the parcel municipality to avoid applying the municipal Class 1
    // to a county parcel merely because the response district says Wendell.
    if (muni.includes('WENDELL')) return '1';
    if (key.includes('WENDELL')) return '2';

    if (key.includes('FUQUAY') && key.includes('VARINA')) return '1';
    if (key.includes('WAKE FOREST')) return '1';
    if (key.includes('HOLLY SPRINGS')) return '1';
    if (key.includes('MORRISVILLE')) return '1';
    if (key.includes('KNIGHTDALE')) return '2';
    if (key.includes('APEX')) return '1';
    if (key.includes('CARY')) return '1';
    if (key.includes('GARNER')) return '1';
    if (key.includes('RALEIGH')) return '3';

    return lookupPpc(WAKE_PPC, key || muni);
  }

  function wakePpcNote(fireDistrict, rating, municipality = '') {
    const key = normalizePpcKey(fireDistrict);
    const muni = normalizePpcKey(municipality);
    if (!rating) return '';

    if (key.includes('GARNER') && key.includes('SUBURBAN')) {
      return 'Garner Suburban official split PPC 3/9E';
    }
    if (key.includes('WAKE') && key.includes('NEW HOPE')) {
      return 'Wake-New Hope official split PPC 2/9E';
    }
    if (key.includes('WAKETTE')) {
      return 'Wake Forest rural Wakette district Class 2; properties beyond 5 miles from a Wake Forest station can differ';
    }
    if (key.includes('WAKE FOREST')) {
      return 'Wake Forest town district ISO Class 1';
    }
    if (key.includes('FURINA')) {
      return 'Fuquay-Varina Fire Department / Furina rural district OSFM Class 2';
    }
    if (key.includes('FUQUAY') && key.includes('VARINA')) {
      return 'Fuquay-Varina Fire Department OSFM Class 1';
    }
    if (key.includes('HYPEX')) {
      return 'Apex Fire Department / Hypex district ISO Class 1';
    }
    if (key.includes('APEX')) {
      return 'Apex Fire Department ISO Class 1';
    }
    if (key.includes('CARY')) {
      return 'Cary Fire Department ISO Class 1';
    }
    if (key.includes('HOLLY SPRINGS')) {
      return 'Holly Springs Fire Department ISO Class 1';
    }
    if (key.includes('MORRISVILLE')) {
      return 'Morrisville Fire/Rescue ISO Class 1';
    }
    if (key.includes('KNIGHTDALE') || key.includes('ALERT')) {
      return 'Knightdale / Alert Fire District protection rating 2';
    }
    if (key.includes('GARNER')) {
      return 'Garner town district PPC Class 1';
    }
    if (key.includes('WESTERN WAKE')) {
      return 'Western Wake Fire District Class 2';
    }
    if (key.includes('DURHAM HIGHWAY')) {
      return 'Durham Highway Fire District Class 2';
    }
    if (key.includes('NORTHERN WAKE')) {
      return 'Northern Wake Fire Department current published ISO Public Protection Class 3';
    }
    if (key.includes('FAIRVIEW')) {
      return 'Fairview Fire District ISO Class 3';
    }
    if (muni.includes('WENDELL')) {
      return 'Wendell municipal district current published ISO Class 1';
    }
    if (key.includes('WENDELL')) {
      return 'Wendell surrounding rural district published Class 2';
    }
    if (key.includes('RALEIGH')) {
      return 'City of Raleigh ISO Class 3';
    }

    return 'Verified Wake-area fire protection rating';
  }

  async function nearestFuquayHydrant(pt) {
    try {
      return await nearestPointDistanceNoPaging(
        FUQUAY_HYDRANT_QUERY,
        pt,
        '*',
        3218.688,
        8000
      );
    } catch (e) {
      return null;
    }
  }

  function wakeTaxId(v) {
    const digits = String(v || '').replace(/\D/g, '');
    return digits ? digits.padStart(7, '0') : '';
  }

  function wakeStreetSearchParts(rawAddress) {
    const parsed = splitAddress(rawAddress || '');
    const street = normalizeSpaces(parsed.street || rawAddress || '');
    const m = street.match(/^(\d+[A-Za-z-]*)\s+(.+)$/);

    return {
      stnum: m ? m[1] : '',
      stname: m ? m[2].replace(
        /\s+(ST|STREET|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|AVE|AVENUE|BLVD|BOULEVARD|WAY|PL|PLACE|CIR|CIRCLE|PKWY|PARKWAY|HWY|HIGHWAY)$/i,
        ''
      ) : street
    };
  }

  function absoluteWakeUrl(relativeUrl) {
    relativeUrl = normalizeSpaces(relativeUrl || '');
    if (!relativeUrl) return '';

    try {
      return new URL(
        relativeUrl,
        'https://services.wake.gov/realestate/'
      ).href;
    } catch (e) {
      return '';
    }
  }

  async function fetchWakeTaxBuildingRecord(reid, pin, rawAddress, propertyDescription = '') {
    const id = wakeTaxId(reid);
    if (!id) return null;

    const parts = wakeStreetSearchParts(rawAddress);
    const parsed = splitAddress(rawAddress || '');
    const streetOnly = normalizeSpaces(parsed.street || rawAddress || '');

    const params = new URLSearchParams({
      id,
      stype: 'addr',
      stnum: parts.stnum || '',
      stname: parts.stname || '',
      locidList: '',
      spg: '1',
      cd: '01',
      loc: streetOnly,
      des: normalizeSpaces(propertyDescription || ''),
      pin: pin ? String(pin) : ''
    });

    const url =
      'https://services.wake.gov/realestate/Building.asp?' +
      params.toString();

    const html = await requestText(url, 9000);
    if (!html) return null;

    const doc = new DOMParser().parseFromString(html, 'text/html');

    const yearRaw = htmlRowValue(doc, 'Year Blt');
    const heatedAreaRaw = htmlRowValue(doc, 'Heated Area');
    const storyHeight = htmlRowValue(doc, 'Story Height');
    const style = htmlRowValue(doc, 'Style');
    const exterior = htmlRowValue(doc, 'Exterior');
    const units = htmlRowValue(doc, 'Units');
    const buildingType = htmlRowValue(doc, 'Bldg Type');
    const basement = htmlRowValue(doc, 'Basement');
    const heating = htmlRowValue(doc, 'Heating');
    const airConditioning = htmlRowValue(doc, 'Air Cond');
    const plumbing = htmlRowValue(doc, 'Plumbing');

    const flatText = normalizeSpaces(doc.body ? doc.body.textContent : '');

    function wakeTextField(label, nextLabels) {
      const stop = (nextLabels || []).join('|');
      const rx = new RegExp(
        '\\b' + label.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') +
        '\\s+(.+?)(?=\\s+(?:' + stop + ')\\b|$)',
        'i'
      );
      const m = flatText.match(rx);
      return m ? normalizeSpaces(m[1]) : '';
    }

    const finalStoryHeight = storyHeight || wakeTextField(
      'Story Height',
      ['Style','Basement','Exterior','Const Type','Heating']
    );
    const finalStyle = style || wakeTextField(
      'Style',
      ['Basement','Exterior','Const Type','Heating','Air Cond']
    );
    const finalExterior = exterior || wakeTextField(
      'Exterior',
      ['Const Type','Heating','Air Cond','Plumbing','Year Blt']
    );
    const finalUnits = units || wakeTextField(
      'Units',
      ['Heated Area','Story Height','Style']
    );
    const finalBuildingType = buildingType || wakeTextField(
      'Bldg Type',
      ['Units','Heated Area']
    );
    const finalBasement = basement || wakeTextField(
      'Basement',
      ['Exterior','Const Type','Heating']
    );
    const finalHeating = heating || wakeTextField(
      'Heating',
      ['Air Cond','Plumbing','Year Blt']
    );
    const finalAirConditioning = airConditioning || wakeTextField(
      'Air Cond',
      ['Plumbing','Year Blt','Eff Year']
    );
    const finalPlumbing = plumbing || wakeTextField(
      'Plumbing',
      ['Year Blt','Eff Year','Base Bldg Value']
    );

    const finalYearRaw = yearRaw || wakeTextField(
      'Year Blt',
      ['Eff Year','Addns','Remod','Int. Adjust.']
    );
    const finalHeatedAreaRaw = heatedAreaRaw || wakeTextField(
      'Heated Area',
      ['Story Height','Style','Basement']
    );

    const yearBuilt = Number(String(finalYearRaw).replace(/[^\d]/g, ''));
    const squareFeet = Number(String(finalHeatedAreaRaw).replace(/[^\d.]/g, ''));

    let photoUrl = '';
    let photoDate = '';

    const photoImg = Array.from(doc.querySelectorAll('img')).find(img =>
      /photos\//i.test(img.getAttribute('src') || '')
    );

    if (photoImg) {
      photoUrl = absoluteWakeUrl(photoImg.getAttribute('src'));

      const parentText = normalizeSpaces(
        (photoImg.parentElement && photoImg.parentElement.textContent) || ''
      );
      const dm = parentText.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
      if (dm) photoDate = dm[1];
    }

    const sketchImg = Array.from(doc.querySelectorAll('img')).find(img =>
      /sketch\//i.test(img.getAttribute('src') || '')
    );

    const sketchUrl = sketchImg
      ? absoluteWakeUrl(sketchImg.getAttribute('src'))
      : '';

    // Make sure this really is the requested parcel/building page.
    const bodyText = normalizeSpaces(doc.body ? doc.body.textContent : '');
    const pageIdMatch = bodyText.match(/\bReal Estate ID\s+(\d{7})\b/i);
    const pageId = pageIdMatch ? pageIdMatch[1] : '';

    if (pageId && pageId !== id) return null;

    return {
      source: 'Wake County Tax Record',
      url,
      yearBuilt:
        Number.isFinite(yearBuilt) && yearBuilt > 0 ? yearBuilt : '',
      squareFeet:
        Number.isFinite(squareFeet) && squareFeet > 0 ? squareFeet : '',
      stories: finalStoryHeight || '',
      dwellingStyle: style || '',
      construction: finalExterior || '',
      numberFamilies: finalUnits || '',
      buildingType: finalBuildingType || '',
      basement: finalBasement || '',
      heating: finalHeating || '',
      airConditioning: finalAirConditioning || '',
      plumbing: finalPlumbing || '',
      photoUrl,
      photoDate,
      sketchUrl,
      raw: {
        realEstateId: id,
        pin: pin || '',
        buildingType: finalBuildingType || '',
        units: finalUnits || '',
        heatedArea: finalHeatedAreaRaw || '',
        storyHeight: finalStoryHeight || '',
        style: finalStyle || '',
        basement: finalBasement || '',
        exterior: finalExterior || '',
        heating: finalHeating || '',
        airConditioning: finalAirConditioning || '',
        plumbing: finalPlumbing || '',
        yearBuilt: finalYearRaw || '',
        photoUrl,
        photoDate,
        sketchUrl
      }
    };
  }

  async function enrichWake(feature, lookupResult) {
    let pt = null;

    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }

    if (!pt) return null;

    const params = new URLSearchParams({
      f: 'json',
      geometry: `${pt.x},${pt.y}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: [
        'REID','PIN_NUM','SITE_ADDRESS','CITY_DECODE','ZIPNUM',
        'HEATEDAREA','YEAR_BUILT','FIREDIST','TYPE_AND_USE',
        'TYPE_USE_DECODE','DESIGNSTYL','DESIGN_STYLE_DECODE',
        'UNITS','TOTUNITS','TOTSTRUCTS','PROPDESC'
      ].join(','),
      returnGeometry: 'false',
      resultRecordCount: '5'
    });

    const data = await requestJson(`${WAKE_QUERY}?${params.toString()}`);
    const a = data.features && data.features[0]
      ? data.features[0].attributes || {}
      : {};

    if (!Object.keys(a).length) return null;

    const rawAddress =
      (lookupResult && lookupResult.parsed && lookupResult.parsed.raw) ||
      a.SITE_ADDRESS ||
      '';

    // Start the independent Wake lookups together so adding the tax-record page
    // does not make the lookup noticeably slower.
    const imapsPromise = queryPoint(
      WAKE_IMAPS_TAX_PARCELS_QUERY,
      pt,
      'PARCELID,FLOORCOUNT,BLDGAREA,RESFLRAREA,RESYRBLT,RESSTRTYP,STRCLASS,CLASSMOD'
    ).catch(() => null);

    const fireDistrictPromise = queryPoint(
      WAKE_FIRE_DISTRICT_QUERY,
      pt,
      '*'
    ).catch(() => null);

    const stationPromise = nearestPointDistance(
      WAKE_FIRE_STATION_QUERY,
      pt,
      '*',
      16093.44
    ).catch(() => null);

    const hydrantPromise = nearestFuquayHydrant(pt).catch(() => null);

    const taxPromise = fetchWakeTaxBuildingRecord(
      a.REID,
      a.PIN_NUM,
      rawAddress,
      a.PROPDESC || ''
    ).catch(() => null);

    const [
      imapsData,
      fireDistrictData,
      station,
      hydrant,
      taxRecord
    ] = await Promise.all([
      imapsPromise,
      fireDistrictPromise,
      stationPromise,
      hydrantPromise,
      taxPromise
    ]);

    const imapsAttrs =
      imapsData && imapsData.features && imapsData.features[0]
        ? imapsData.features[0].attributes || {}
        : {};

    const fireDistrictAttrs =
      fireDistrictData &&
      fireDistrictData.features &&
      fireDistrictData.features[0]
        ? fireDistrictData.features[0].attributes || {}
        : {};

    const fireDistrict =
      firstMatchingAttribute(fireDistrictAttrs, [
        /^DISTRICT$/i,
        /^NAME$/i,
        /FIRE.*DISTRICT/i
      ]) ||
      a.FIREDIST ||
      '';

    const stationName = station
      ? firstMatchingAttribute(station.attributes, [
          /^LABEL$/i,
          /^LOCATION$/i,
          /^STATIONID$/i
        ])
      : '';

    const wakeMunicipality = a.CITY_DECODE || '';
    const ppc = lookupWakePpc(fireDistrict, wakeMunicipality);

    const wakeYear = Number(a.YEAR_BUILT) > 0 ? a.YEAR_BUILT : '';
    const imapsYear = Number(imapsAttrs.RESYRBLT) > 0
      ? imapsAttrs.RESYRBLT
      : '';
    const taxYear = taxRecord && Number(taxRecord.yearBuilt) > 0
      ? taxRecord.yearBuilt
      : '';

    const wakeSqft = Number(a.HEATEDAREA) > 0 ? a.HEATEDAREA : '';
    const imapsSqft = Number(imapsAttrs.RESFLRAREA) > 0
      ? imapsAttrs.RESFLRAREA
      : '';
    const taxSqft = taxRecord && Number(taxRecord.squareFeet) > 0
      ? taxRecord.squareFeet
      : '';

    const floorCount = Number(imapsAttrs.FLOORCOUNT) > 0
      ? imapsAttrs.FLOORCOUNT
      : '';

    const imapsStyle = normalizeSpaces(imapsAttrs.RESSTRTYP || '');

    const yearBuilt = taxYear || wakeYear || imapsYear;
    const squareFeet = taxSqft || wakeSqft || imapsSqft;

    return {
      source: 'Wake County GIS / iMAPS',
      yearBuilt,
      yearBuiltSource:
        taxYear ? 'Wake County Tax Record' :
        wakeYear ? 'Wake County GIS' :
        imapsYear ? 'Wake iMAPS Tax Parcels' : '',
      squareFeet,
      squareFeetSource:
        taxSqft ? 'Wake County Tax Record' :
        wakeSqft ? 'Wake County GIS' :
        imapsSqft ? 'Wake iMAPS Tax Parcels' : '',
      fireDistrict,
      dwellingStyle:
        (taxRecord && taxRecord.dwellingStyle) ||
        imapsStyle ||
        a.DESIGN_STYLE_DECODE ||
        a.DESIGNSTYL ||
        a.TYPE_USE_DECODE ||
        '',
      dwellingStyleSource:
        (taxRecord && taxRecord.dwellingStyle)
          ? 'Wake County Tax Record'
          : (imapsStyle ? 'Wake iMAPS Tax Parcels' : 'Wake County GIS'),
      stories:
        (taxRecord && taxRecord.stories) ||
        floorCount ||
        '',
      storiesSource:
        (taxRecord && taxRecord.stories)
          ? 'Wake County Tax Record'
          : (floorCount ? 'Wake iMAPS Tax Parcels' : ''),
      numberFamilies:
        (taxRecord && taxRecord.numberFamilies) ||
        a.UNITS ||
        a.TOTUNITS ||
        '',
      numberFamiliesSource:
        (taxRecord && taxRecord.numberFamilies)
          ? 'Wake County Tax Record'
          : 'Wake County GIS',
      construction:
        (taxRecord && taxRecord.construction) || '',
      constructionSource:
        (taxRecord && taxRecord.construction)
          ? 'Wake County Tax Record'
          : '',
      hydrantDistanceFeet: hydrant ? hydrant.feet : '',
      hydrantSource: hydrant ? 'Fuquay-Varina public hydrant GIS' : '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: stationName || '',
      protectionClass: ppc,
      protectionNote: wakePpcNote(fireDistrict, ppc, wakeMunicipality),
      taxRecordUrl: taxRecord ? taxRecord.url : '',
      propertyPhotoUrl: taxRecord ? taxRecord.photoUrl : '',
      propertyPhotoDate: taxRecord ? taxRecord.photoDate : '',
      propertySketchUrl: taxRecord ? taxRecord.sketchUrl : '',
      wakeTaxDetails: taxRecord ? {
        buildingType: taxRecord.buildingType,
        basement: taxRecord.basement,
        heating: taxRecord.heating,
        airConditioning: taxRecord.airConditioning,
        plumbing: taxRecord.plumbing
      } : null,
      raw: {
        parcel: a,
        imapsTaxParcel: imapsAttrs,
        wakeTaxRecord: taxRecord ? taxRecord.raw : null,
        fireDistrict: fireDistrictAttrs,
        nearestFireStation: station ? station.attributes : null,
        nearestFuquayHydrant: hydrant ? hydrant.attributes : null
      }
    };
  }

  function normalizeHarnettStreetText(s) {
    return normalizeSpaces(String(s || ''))
      .toUpperCase()
      .replace(/[.,#-]/g, ' ')
      .replace(/\bNORTH CAROLINA\b/g, 'NC')
      .replace(/\bHIGHWAY\b/g, 'HWY')
      .replace(/\bROUTE\b/g, 'RTE')
      .replace(/\bROAD\b/g, 'RD')
      .replace(/\bSTREET\b/g, 'ST')
      .replace(/\bDRIVE\b/g, 'DR')
      .replace(/\bLANE\b/g, 'LN')
      .replace(/\bCOURT\b/g, 'CT')
      .replace(/\bAVENUE\b/g, 'AVE')
      .replace(/\bBOULEVARD\b/g, 'BLVD')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function harnettAddressScore(attrs, parsed) {
    const wantedStreet = normalizeHarnettStreetText(parsed && parsed.street);
    const wantedCity = normalizeHarnettStreetText(parsed && parsed.city);
    const wantedZip = String((parsed && parsed.zip) || '').slice(0, 5);

    const candidates = [
      attrs.PhysicalAddress,
      attrs.ParAddress,
      [
        attrs.HouseNumber,
        attrs.StreetDirection,
        attrs.StreetName,
        attrs.StreetType,
        attrs.StreetSuffix
      ].filter(Boolean).join(' ')
    ].map(normalizeHarnettStreetText).filter(Boolean);

    let score = 0;
    for (const c of candidates) {
      if (wantedStreet && c === wantedStreet) score = Math.max(score, 100);
      else if (wantedStreet && c.includes(wantedStreet)) score = Math.max(score, 95);
      else if (wantedStreet) {
        const wantedTokens = wantedStreet.split(' ').filter(Boolean);
        const hits = wantedTokens.filter(t => c.includes(t)).length;
        if (wantedTokens.length) score = Math.max(score, Math.round((hits / wantedTokens.length) * 80));
      }
    }

    const parcelCity = normalizeHarnettStreetText(attrs.ParCity || '');
    const parcelZip = String(attrs.ParZipCode || '').slice(0, 5);
    if (wantedCity && parcelCity && parcelCity === wantedCity) score += 8;
    if (wantedZip && parcelZip && parcelZip === wantedZip) score += 12;

    return score;
  }

  async function findHarnettParcelByAddress(parsed) {
    if (!parsed) return null;

    const p = streetParts(parsed.street || '');
    const house = escSql(p.house || '');
    if (!house) return null;

    const wheres = [
      `HouseNumber = '${house}'`,
      `PhysicalAddress LIKE '${house}%'`,
      `ParAddress LIKE '${house}%'`
    ];

    let all = [];

    for (const where of wheres) {
      try {
        const data = await queryWhere(HARNETT_QUERY, where, '*');
        const records = (data.features || []).map(f => f.attributes || {});
        all = all.concat(records);
      } catch (e) {}
    }

    if (!all.length) return null;

    // Remove duplicate parcels returned by multiple fallback queries.
    const seen = new Set();
    all = all.filter(a => {
      const key = String(a.ParcelID || a.PIN || a.PID || a.REID || a.PhysicalAddress || '');
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    });

    all.sort((a, b) =>
      harnettAddressScore(b, parsed) - harnettAddressScore(a, parsed)
    );

    const best = all[0];
    if (!best) return null;

    // If the house number matched, prefer the best candidate even when rural
    // highway naming differs (NC-27 / NC 27 W / HWY 27, etc.).
    const bestHouse = String(best.HouseNumber || '').trim();
    if (bestHouse === String(p.house || '').trim()) return best;

    return harnettAddressScore(best, parsed) >= 25 ? best : null;
  }

  async function enrichHarnett(feature, lookupResult) {
    let geocodePt = null;

    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      const g = lookupResult.geocode.location;
      if (Number.isFinite(Number(g.x)) && Number.isFinite(Number(g.y))) {
        geocodePt = { x: Number(g.x), y: Number(g.y) };
      }
    }

    if (!geocodePt) {
      const c = geometryCenter(feature && feature.geometry);
      if (c && Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y))) {
        geocodePt = { x: Number(c.x), y: Number(c.y) };
      }
    }

    let a = {};

    // Normal point-in-parcel lookup first.
    if (geocodePt) {
      try {
        const data = await queryPoint(HARNETT_QUERY, geocodePt, '*');
        a = data.features && data.features[0]
          ? data.features[0].attributes || {}
          : {};
      } catch (e) {}
    }

    // Rural/highway geocoders often land on the road instead of the parcel.
    // Search Harnett's own address fields if the spatial record is empty or
    // lacks the building values we need.
    if (!Object.keys(a).length || (!a.ActualYearBuilt && !a.TotalAcutalAreaHeated)) {
      const byAddress = await findHarnettParcelByAddress(
        lookupResult && lookupResult.parsed
      );
      if (byAddress) a = byAddress;
    }

    // Prefer Harnett's parcel coordinates when available. They are usually
    // better for hydrant distance than a highway-centerline geocode.
    let hydrantPt = geocodePt;
    if (a && Number.isFinite(Number(a.Longitude)) && Number.isFinite(Number(a.Latitude))) {
      hydrantPt = {
        x: Number(a.Longitude),
        y: Number(a.Latitude)
      };
    }

    let hydrant = null;
    let insurance5 = null;
    let insurance6 = null;

    if (hydrantPt) {
      try {
        hydrant = await nearestPointDistance(HARNETT_HYDRANT_QUERY, hydrantPt, '*');
      } catch (e) {}

      try {
        const d5 = await queryPoint(HARNETT_FIRE_INSURANCE_5_QUERY, hydrantPt, '*');
        insurance5 = d5.features && d5.features[0]
          ? d5.features[0].attributes || null
          : null;
      } catch (e) {}

      try {
        const d6 = await queryPoint(HARNETT_FIRE_INSURANCE_6_QUERY, hydrantPt, '*');
        insurance6 = d6.features && d6.features[0]
          ? d6.features[0].attributes || null
          : null;
      } catch (e) {}
    }

    const fireDistrict =
      a.FireTaxDistrict ||
      a.FireDepartmentResponseArea ||
      (insurance6 && insurance6.FireDistrict) ||
      (insurance5 && insurance5.NAME) ||
      '';

    const protectionClass =
      lookupPpc(HARNETT_PPC, fireDistrict) ||
      lookupPpc(HARNETT_PPC, insurance6 && insurance6.FireDistrict) ||
      lookupPpc(HARNETT_PPC, insurance5 && insurance5.NAME) ||
      '';

    if (!Object.keys(a).length && !hydrant && !insurance5 && !insurance6) return null;

    const harnettPid = String(a.PID || '').trim();
    const harnettPropertyCardUrl = harnettPid
      ? 'https://cama.harnett.org/ITSPublicHT/AppraisalCard.aspx?id=' +
        encodeURIComponent(harnettPid)
      : '';

    return {
      source: 'Harnett County GIS',
      countySiteUrl: 'https://gis.harnett.org/gisviewer/',
      taxRecordUrl: harnettPropertyCardUrl || 'https://cama.harnett.org/ITSPublicHT/',
      yearBuilt: a.ActualYearBuilt || '',
      squareFeet: a.TotalAcutalAreaHeated || '',
      fireDistrict,
      construction: a.UseModel || '',
      hydrantDistanceFeet: hydrant ? hydrant.feet : '',
      protectionClass,
      protectionNote: protectionClass
        ? (
            /ANGIER|BLACK RIVER/i.test(fireDistrict)
              ? 'Angier / Black River official NCRRS split rating 3/9E, effective 05/01/2023'
              : 'Northwest Harnett official NCRRS split rating 3/9E, effective 01/01/2025'
          )
        : '',
      matchedAddress: a.PhysicalAddress || a.ParAddress || '',
      raw: {
        parcel: Object.keys(a).length ? a : null,
        nearestHydrant: hydrant ? hydrant.attributes : null,
        approved5MileInsuranceDistrict: insurance5,
        approved6MileInsuranceDistrict: insurance6
      }
    };
  }

  async function enrichChatham(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    // First find the Chatham parcel that contains the geocoded address.
    // Then use its parcel number to query residential records.
    //
    // This is more reliable than testing the address point directly against
    // the residential/quality polygons because the house point can fall
    // outside a structure polygon even though it is inside the correct parcel.
    const parcelData = await queryPoint(
      CHATHAM_PARCEL_QUERY,
      pt,
      'parcel_number,Address,land_use,use_code_group,neighborhood_code'
    );

    const parcelAttrs = parcelData.features && parcelData.features[0]
      ? parcelData.features[0].attributes || {}
      : {};

    const parcelNumber = parcelAttrs.parcel_number || '';
    if (!parcelNumber) return null;

    try {
      const residential = await queryWhere(
        CHATHAM_RES_QUERY,
        `parcel_number = '${escSql(parcelNumber)}'`,
        [
          'parcel_number','structure_id','structure_style','gross_living_area',
          'year_built','effective_year_built','quality_description',
          'condition_description'
        ].join(',')
      );

      const records = (residential.features || []).map(f => f.attributes || {});
      if (records.length) {
        // Prefer the largest residential structure when a parcel has multiple records.
        records.sort((a, b) =>
          (Number(b.gross_living_area) || 0) - (Number(a.gross_living_area) || 0)
        );
        const a = records[0];

        let hydrant = null;
        try {
          hydrant = await nearestPointDistance(CHATHAM_HYDRANT_QUERY, pt, '*');
        } catch (e) {}

        return {
          source: 'Chatham County Property Tax / GIS',
          yearBuilt: a.year_built,
          squareFeet: a.gross_living_area,
          dwellingStyle: a.structure_style || '',
          hydrantDistanceFeet: hydrant ? hydrant.feet : '',
          raw: {
            parcel: parcelAttrs,
            residential: a,
            residentialRecords: records,
            nearestHydrant: hydrant ? hydrant.attributes : null
          }
        };
      }
    } catch (e) {}

    // At minimum return the matched parcel so Raw JSON shows what Chatham found.
    let hydrant = null;
    try {
      hydrant = await nearestPointDistance(CHATHAM_HYDRANT_QUERY, pt, '*');
    } catch (e) {}

    return {
      source: 'Chatham County Property Tax / GIS',
      hydrantDistanceFeet: hydrant ? hydrant.feet : '',
      raw: {
        parcel: parcelAttrs,
        nearestHydrant: hydrant ? hydrant.attributes : null
      }
    };
  }

  async function enrichJohnston(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    const data = await queryPoint(
      JOHNSTON_QUERY,
      pt,
      '*'
    );

    const a = data.features && data.features[0]
      ? data.features[0].attributes || {}
      : {};

    if (!Object.keys(a).length) return null;

    const fireDistrict = firstMatchingAttribute(a, [
      /^FIRE_DISTRICT$/i,
      /^FIRE_DIST$/i,
      /^FIRE_DEPT$/i,
      /^FIRE_DEPARTMENT$/i,
      /FIRE.*DISTRICT/i,
      /FIRE.*DEPT/i
    ]);
    const ppc = lookupJohnstonPpc(fireDistrict);

    return {
      source: 'Johnston County GIS / Tax Parcel',
      yearBuilt: a.YEAR_BUILT,
      squareFeet: a.HEATED_AREA,
      dwellingStyle: a.USE_CODE || '',
      stories: '',
      construction: a.EXTERIOR_WALLS || '',
      fireDistrict: fireDistrict || '',
      protectionClass: ppc || '',
      protectionNote: ppc ? 'Official Johnston County district rating; split ratings can depend on location.' : '',
      raw: a
    };
  }

  async function enrichDurham(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    const data = await queryPoint(
      DURHAM_QUERY,
      pt,
      '*'
    );

    const a = data.features && data.features[0]
      ? data.features[0].attributes || {}
      : {};

    if (!Object.keys(a).length) return null;

    const heatedArea = firstMatchingAttribute(a, [
      /^HEATED_AREA$/i,
      /^HEATEDAREA$/i
    ]);

    const totalUnits = firstMatchingAttribute(a, [
      /^TOTAL_UNITS$/i,
      /^UNITS$/i
    ]);

    let hydrant = null;
    try {
      hydrant = await nearestPointDistance(DURHAM_HYDRANT_QUERY, pt, '*');
    } catch (e) {}

    let station = null;
    try {
      station = await nearestPointDistance(DURHAM_FIRE_STATION_QUERY, pt, '*', 16093.44);
    } catch (e) {}

    let fireDistrictAttrs = {};
    try {
      const fd = await queryPoint(DURHAM_FIRE_DISTRICT_QUERY, pt, '*');
      fireDistrictAttrs = fd.features && fd.features[0]
        ? fd.features[0].attributes || {}
        : {};
    } catch (e) {}

    let insuranceAttrs = {};
    try {
      const fi = await queryPoint(DURHAM_FIRE_INSURANCE_QUERY, pt, '*');
      insuranceAttrs = fi.features && fi.features[0]
        ? fi.features[0].attributes || {}
        : {};
    } catch (e) {}

    const fireDistrict =
      firstMatchingAttribute(fireDistrictAttrs, [
        /^District$/i,
        /^Fire_Org$/i,
        /^Station$/i
      ]) ||
      firstMatchingAttribute(a, [
        /^FIRE_DISTRICT$/i,
        /^FIRE_DISTRICT_CODE$/i,
        /FIRE.*DISTRICT/i
      ]);

    const protectionClass =
      firstMatchingAttribute(insuranceAttrs, [
        /^ISO_text$/i,
        /^ISO_Rating$/i,
        /^ISO_Range$/i
      ]);

    const stationName = station
      ? firstMatchingAttribute(station.attributes, [
          /^Station$/i,
          /^NAME$/i,
          /^FACILITY_NAME$/i,
          /^STATION_NAME$/i,
          /NAME/i
        ])
      : '';

    return {
      source: 'Durham County GIS / Tax Parcel',
      squareFeet: heatedArea || '',
      numberFamilies: totalUnits || '',
      fireDistrict: fireDistrict || '',
      dwellingStyle: '',
      hydrantDistanceFeet: hydrant ? hydrant.feet : '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: stationName || '',
      protectionClass: protectionClass || '',
      protectionNote: protectionClass ? 'Durham County Fire Insurance Area / ISO field' : '',
      raw: {
        parcel: a,
        nearestHydrant: hydrant ? hydrant.attributes : null,
        nearestFireStation: station ? station.attributes : null,
        fireDistrict: fireDistrictAttrs,
        fireInsuranceArea: insuranceAttrs
      }
    };
  }

  async function enrichOrange(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    const parcelFields = [
      'PIN','ADDRESS1','ADDRESS2','CITY','STATE','ZIPCODE',
      'YEARBUILT','SQFT','BLDGCNT','TOWNSHIP_NAME','SUBDIVISION_NAME'
    ].join(',');

    let a = {};
    let parcelSource = '';

    try {
      const data = await queryPointNoPaging(
        ORANGE_QUERY_PRIMARY,
        pt,
        parcelFields,
        false,
        5500
      );
      a = data.features && data.features[0]
        ? data.features[0].attributes || {}
        : {};
      if (Object.keys(a).length) parcelSource = 'Orange County WebParcelService';
    } catch (e) {}

    if (!Object.keys(a).length) {
      try {
        const data = await queryPointNoPaging(
          ORANGE_QUERY_FALLBACK,
          pt,
          parcelFields,
          false,
          5500
        );
        a = data.features && data.features[0]
          ? data.features[0].attributes || {}
          : {};
        if (Object.keys(a).length) parcelSource = 'Orange County WebIdentifyService';
      } catch (e) {}
    }

    let station = null;
    try {
      station = await nearestPointDistanceNoPaging(
        ORANGE_FIRE_STATION_QUERY,
        pt,
        '*',
        16093.44,
        6500
      );
    } catch (e) {}

    let fireDistrictAttrs = {};
    try {
      const fd = await queryPointNoPaging(
        ORANGE_FIRE_DISTRICT_QUERY,
        pt,
        '*',
        false,
        6500
      );
      fireDistrictAttrs = fd.features && fd.features[0]
        ? fd.features[0].attributes || {}
        : {};
    } catch (e) {}

    let fireInsuranceAttrs = {};
    try {
      const fi = await queryPointNoPaging(
        ORANGE_FIRE_INSURANCE_QUERY,
        pt,
        '*',
        false,
        6500
      );
      fireInsuranceAttrs = fi.features && fi.features[0]
        ? fi.features[0].attributes || {}
        : {};
    } catch (e) {}

    const stationName = station
      ? firstMatchingAttribute(station.attributes, [
          /^Description$/i,
          /^NAME$/i,
          /^Station$/i,
          /DESCRIPTION/i
        ])
      : '';

    const fireDistrict = firstMatchingAttribute(
      fireDistrictAttrs,
      [
        /^FIRE$/i,
        /^DISTRICT$/i,
        /FIRE.*DISTRICT/i
      ]
    );

    const fireInsuranceDistrict =
      firstMatchingAttribute(fireInsuranceAttrs, [
        /^FIREINSURANCE$/i,
        /^FIRE$/i,
        /^DISTRICT$/i
      ]);

    const protectionClass = lookupPpc(
      ORANGE_PPC,
      fireInsuranceDistrict || fireDistrict
    );

    if (!Object.keys(a).length &&
        !station &&
        !Object.keys(fireDistrictAttrs).length &&
        !Object.keys(fireInsuranceAttrs).length) {
      return null;
    }

    return {
      source: parcelSource || 'Orange County GIS',
      yearBuilt: a.YEARBUILT || '',
      squareFeet: a.SQFT || '',
      fireDistrict: fireDistrict || fireInsuranceDistrict || '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: stationName || '',
      protectionClass: protectionClass || '',
      protectionNote: protectionClass
        ? 'Orange County official 2022 ISO/PPC table'
        : '',
      raw: {
        parcel: Object.keys(a).length ? a : null,
        parcelSource: parcelSource || null,
        nearestFireStation: station ? station.attributes : null,
        fireDistrict: Object.keys(fireDistrictAttrs).length ? fireDistrictAttrs : null,
        fireInsuranceDistrict: Object.keys(fireInsuranceAttrs).length ? fireInsuranceAttrs : null
      }
    };
  }

  async function enrichLee(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    const data = await queryPoint(
      LEE_QUERY,
      pt,
      [
        'PIN','ADRADD','ADRNO','ADRDIRECT','ADRSTR','ADRSUF',
        'dwel_STYLE','dwel_DESCR','dwel_YRBLT','dwel_SFLA',
        'ob_DESCRIB','ob_YRBLT','ob_AREA','TaxCard'
      ].join(',')
    );

    const a = data.features && data.features[0]
      ? data.features[0].attributes || {}
      : {};

    if (!Object.keys(a).length) return null;

    return {
      source: 'Lee County GIS / Appraisal',
      yearBuilt: a.dwel_YRBLT || '',
      squareFeet: a.dwel_SFLA || '',
      dwellingStyle: a.dwel_DESCR || a.dwel_STYLE || '',
      raw: a
    };
  }

  async function enrichNash(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    const data = await queryPoint(
      NASH_QUERY,
      pt,
      '*'
    );

    const a = data.features && data.features[0]
      ? data.features[0].attributes || {}
      : {};

    if (!Object.keys(a).length) return null;

    const stories = Number(a.R_STORY_HT);
    const fireDistrict = a.TAX_FIRE || '';
    const protectionClass = lookupPpc(NASH_PPC, fireDistrict);

    // Nash stores residential and commercial building cards in separate
    // fields. Prefer the residential values, but do not throw away useful
    // building data when only the commercial card fields are populated.
    const yearBuilt =
      (Number(a.R_YR_BUILT) > 0 ? a.R_YR_BUILT : '') ||
      (Number(a.C_YR_BUILT) > 0 ? a.C_YR_BUILT : '');

    const squareFeet =
      (Number(a.R_SQFT) > 0 ? a.R_SQFT : '') ||
      (Number(a.C_SQFT) > 0 ? a.C_SQFT : '');

    const dwellingStyle =
      a.R_S_STYLE ||
      a.R_S_TYPE ||
      a.BLDG_TYPE ||
      a.C_STRUCT ||
      '';

    return {
      source: 'Nash County GIS / CAMA',
      yearBuilt,
      squareFeet,
      dwellingStyle,
      stories: Number.isFinite(stories) && stories > 0 ? stories : '',
      fireDistrict,
      protectionClass: protectionClass || '',
      protectionNote: protectionClass
        ? 'Nash County official Fire District PPC table'
        : '',
      raw: a
    };
  }

  async function enrichWilson(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    const data = await queryPoint(
      WILSON_QUERY,
      pt,
      [
        'PIN','ParcelNumber','PhysLcStreetNumber','PhysLcStrDirection',
        'PhysLcStreetName','PhysLcStrType','ZIPCode',
        'YearActuallyBuilt1Imp','FinishedArea1Imp','BuiltUseCode1Imp',
        'BuiltUseDesc1Imp','CurrentUseDesc1Imp','EffYrBuilt','Description2','Description3'
      ].join(',')
    );

    const a = data.features && data.features[0]
      ? data.features[0].attributes || {}
      : {};

    if (!Object.keys(a).length) return null;

    return {
      source: 'Wilson County GIS / Tax Parcel',
      yearBuilt: a.YearActuallyBuilt1Imp || '',
      squareFeet: a.FinishedArea1Imp || '',
      dwellingStyle: a.BuiltUseDesc1Imp || a.CurrentUseDesc1Imp || '',
      raw: a
    };
  }

  async function enrichVance(feature, lookupResult) {
    let pt = null;
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      pt = lookupResult.geocode.location;
    } else {
      pt = geometryCenter(feature && feature.geometry);
    }
    if (!pt) return null;

    let parcel = {};
    try {
      const data = await queryPoint(
        VANCE_PARCEL_QUERY,
        pt,
        '*'
      );
      parcel = data.features && data.features[0]
        ? data.features[0].attributes || {}
        : {};
    } catch (e) {}

    // Vance's GIS parcel contains the identifiers needed to jump straight to
    // the county tax application's Building page.
    const ownerId = firstMatchingAttribute(parcel, [
      /^OWNID$/i,
      /^OWNER_?ID$/i,
      /^OWNERID$/i
    ]);

    const parcelId = firstMatchingAttribute(parcel, [
      /^PIN$/i,
      /^PARCEL_?ID$/i,
      /^PARCELID$/i
    ]);

    let building = null;
    let buildingError = '';
    if (ownerId && parcelId) {
      try {
        building = await fetchVanceBuildingRecord(ownerId, parcelId);
      } catch (e) {
        buildingError = e && e.message ? e.message : 'Vance building record lookup failed.';
      }
    }

    let hydrant = null;
    try {
      hydrant = await nearestPointDistance(
        VANCE_HYDRANT_QUERY,
        pt,
        '*',
        16093.44
      );
    } catch (e) {}

    let station = null;
    try {
      station = await nearestPointDistance(
        VANCE_FIRE_STATION_QUERY,
        pt,
        '*',
        16093.44
      );
    } catch (e) {}

    let fireDistrictAttrs = {};
    try {
      const fd = await queryPoint(
        VANCE_FIRE_DISTRICT_QUERY,
        pt,
        '*'
      );
      fireDistrictAttrs = fd.features && fd.features[0]
        ? fd.features[0].attributes || {}
        : {};
    } catch (e) {}

    const fireDistrict = firstMatchingAttribute(
      fireDistrictAttrs,
      [
        /^DISTRICT$/i,
        /^NAME$/i,
        /^FIRE.*DIST/i,
        /^FD.*NAME/i,
        /DISTRICT/i
      ]
    );

    const stationName = station
      ? firstMatchingAttribute(station.attributes, [
          /^NAME$/i,
          /^STATION$/i,
          /^STATION_NAME$/i,
          /^DEPT_NAME$/i,
          /NAME/i
        ])
      : '';

    const protectionClass = lookupPpc(VANCE_PPC, fireDistrict);

    const gisYear = Number(parcel.YEAR_BUILT) > 0 ? parcel.YEAR_BUILT : '';
    const taxYear = building && Number(building.yearBuilt) > 0
      ? building.yearBuilt
      : '';

    let publicYear = null;
    if (!taxYear && !gisYear && lookupResult && lookupResult.parsed) {
      publicYear = await fetchPublicYearBuilt(lookupResult.parsed.raw, parcelId);
    }

    if (!Object.keys(parcel).length &&
        !building &&
        !hydrant &&
        !station &&
        !Object.keys(fireDistrictAttrs).length) {
      return null;
    }

    return {
      source: 'Vance County GIS',
      yearBuilt: taxYear || gisYear || (publicYear ? publicYear.yearBuilt : ''),
      yearBuiltSource: taxYear
        ? 'Vance County Tax Record'
        : (gisYear
            ? 'Vance County GIS'
            : (publicYear ? publicYear.source : '')),
      squareFeet: building && building.squareFeet
        ? building.squareFeet
        : '',
      squareFeetSource: building && building.squareFeet
        ? 'Vance County Tax Record'
        : '',
      dwellingStyle: building && building.dwellingStyle
        ? building.dwellingStyle
        : '',
      dwellingStyleSource: building && building.dwellingStyle
        ? 'Vance County Tax Record'
        : '',
      fireDistrict: fireDistrict || '',
      hydrantDistanceFeet: hydrant ? hydrant.feet : '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: stationName || '',
      protectionClass: protectionClass || '',
      protectionNote: protectionClass
        ? 'Vance County published fire district ISO rating'
        : '',
      raw: {
        parcel: Object.keys(parcel).length ? parcel : null,
        ownerId: ownerId || null,
        parcelId: parcelId || null,
        buildingRecord: building || null,
        buildingRecordError: buildingError || null,
        publicYearFallback: publicYear || null,
        nearestHydrant: hydrant ? hydrant.attributes : null,
        nearestFireStation: station ? station.attributes : null,
        fireDistrict: Object.keys(fireDistrictAttrs).length ? fireDistrictAttrs : null
      }
    };
  }

  function extractGranvilleRenderedTables() {
    const getRows = (id) => {
      const table = document.getElementById(id);
      if (!table) return [];
      return Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td =>
          normalizeSpaces(td.getAttribute('title') || td.textContent)
        )
      );
    };

    const result = {
      yearBuilt: '',
      squareFeet: '',
      dwellingStyle: '',
      stories: '',
      construction: '',
      roofMaterial: '',
      fireDistrict: ''
    };

    const buildingRows = getRows('BuildingData');
    if (buildingRows.length) {
      const row = buildingRows.find(r =>
        Number(String(r[1] || '').replace(/[^\d]/g, '')) > 0 ||
        Number(String(r[3] || '').replace(/[^\d.]/g, '')) > 0
      ) || buildingRows[0];

      const year = Number(String(row[1] || '').replace(/[^\d]/g, ''));
      const sqft = Number(String(row[3] || '').replace(/[^\d.]/g, ''));

      if (Number.isFinite(year) && year > 0) result.yearBuilt = year;
      if (Number.isFinite(sqft) && sqft > 0) result.squareFeet = sqft;
    }

    const subRows = getRows('BuildingSubareasData');
    let bestDwelling = null;

    for (const row of subRows) {
      const desc = normalizeSpaces(row[1] || '');
      const area = Number(String(row[2] || '').replace(/[^0-9.]/g, '')) || 0;

      if (/SNG FAML|SINGLE|RANCH|CAPE|COLONIAL|DUPLEX|MULTI|MOBILE HOME|MANUF|MODULAR|DWELLING/i.test(desc)) {
        if (!bestDwelling || area > bestDwelling.area) {
          bestDwelling = { desc, area };
        }
      }
    }

    if (bestDwelling) result.dwellingStyle = bestDwelling.desc;

    const structuralRows = getRows('BuildingStructuralElementsData');
    for (const row of structuralRows) {
      const element = normalizeSpaces(row[0] || '').toUpperCase();
      const desc = normalizeSpaces(row[1] || '');

      if (!result.construction && element === 'EXTERIOR WALLS') {
        result.construction = desc;
      }
      if (!result.roofMaterial && element === 'ROOFING COVER') {
        result.roofMaterial = desc;
      }
    }

    const locationRows = getRows('LocationCodeData');
    for (const row of locationRows) {
      const category = normalizeSpaces(row[0] || '').toUpperCase();
      if (category === 'FIREINSURANCE') {
        result.fireDistrict = normalizeSpaces(row[2] || '');
        break;
      }
    }

    return result;
  }

  const GRANVILLE_EXTRACT_SESSION_KEY = '__mci_granville_extract_state_v1';

  function getGranvilleExtractorState() {
    if (!/(^|\.)tax\.granvillecounty\.org$/i.test(location.hostname)) return null;

    // Initial state arrives in the hash from the hidden iframe creator.
    if (location.hash.startsWith('#mci-nc-granville-extract=')) {
      const raw = location.hash.replace('#mci-nc-granville-extract=', '');
      try {
        const state = JSON.parse(decodeURIComponent(raw));
        sessionStorage.setItem(GRANVILLE_EXTRACT_SESSION_KEY, JSON.stringify(state));
        return state;
      } catch (e) {
        const state = {
          parcelId: decodeURIComponent(raw || ''),
          address: ''
        };
        sessionStorage.setItem(GRANVILLE_EXTRACT_SESSION_KEY, JSON.stringify(state));
        return state;
      }
    }

    // Granville's search form reloads the page and drops the URL hash.
    // Keep the extractor state in sessionStorage so the automation resumes.
    try {
      const raw = sessionStorage.getItem(GRANVILLE_EXTRACT_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearGranvilleExtractorState() {
    try {
      sessionStorage.removeItem(GRANVILLE_EXTRACT_SESSION_KEY);
    } catch (e) {}
  }

  function isGranvilleExtractorFrame() {
    return !!getGranvilleExtractorState();
  }

  function clickGranvilleMatchingResult(parcelId, address) {
    const table = document.getElementById('RealEstateSearch');
    if (!table) return false;

    const wantedParcel = String(parcelId || '').replace(/[^0-9A-Za-z]/g, '');
    const wantedStreet = normalizeAddressForMatch(
      (splitAddress(address || '').street || address || '')
    );

    const rows = Array.from(table.querySelectorAll('tbody tr'))
      .filter(tr => tr.querySelectorAll('td').length);

    let match = rows.find(tr => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const parcel = normalizeSpaces(
        cells[0]?.getAttribute('title') || cells[0]?.textContent
      ).replace(/[^0-9A-Za-z]/g, '');

      return wantedParcel && parcel === wantedParcel;
    });

    if (!match && wantedStreet) {
      match = rows.find(tr => {
        const cells = Array.from(tr.querySelectorAll('td'));
        const situs = normalizeSpaces(
          cells[3]?.getAttribute('title') || cells[3]?.textContent
        );
        return normalizeAddressForMatch(situs) === wantedStreet;
      });
    }

    if (!match && rows.length === 1) match = rows[0];
    if (!match) return false;

    // Granville's row-selection handler is delegated through jQuery.
    // Trigger both the native click and jQuery click so its detail AJAX fires.
    try {
      if (window.jQuery) window.jQuery(match).trigger('click');
    } catch (e) {}

    match.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));

    return true;
  }

  function runGranvilleExtractorFrame() {
    document.documentElement.style.display = 'none';

    const state = getGranvilleExtractorState() || {};
    const parcelId = String(state.parcelId || '').replace(/[^0-9A-Za-z]/g, '');
    const rawAddress = normalizeSpaces(state.address || '');

    const started = Date.now();

    const finish = (data) => {
      clearGranvilleExtractorState();

      window.parent.postMessage({
        type: 'MCI_GRANVILLE_PROFILE',
        parcelId,
        data
      }, '*');
    };

    const timer = setInterval(() => {
      const detailsLoaded =
        document.querySelector('#BuildingData tbody tr') &&
        (
          document.querySelector('#BuildingStructuralElementsData tbody tr') ||
          document.querySelector('#BuildingSubareasData tbody tr') ||
          document.querySelector('#LocationCodeData tbody tr')
        );

      // If the parcel details already exist, read them immediately.
      if (detailsLoaded) {
        clearInterval(timer);
        finish(extractGranvilleRenderedTables());
        return;
      }

      const resultRows = document.querySelectorAll('#RealEstateSearch tbody tr td');

      // Search results are present but parcel detail has not been selected yet.
      if (resultRows.length) {
        clickGranvilleMatchingResult(parcelId, rawAddress);
        return;
      }

      // No search results yet: submit Granville's search form.
      const submit = document.getElementById('real-estate-search-submit');
      const parcelInput = document.getElementById('Parcel');
      const hiddenParcel = document.getElementById('ParcelNumber');
      const addressInput = document.getElementById('FormattedPropertyAddress');

      if (submit) {
        // Mark that we have submitted so repeated 300ms timer ticks don't
        // submit again before Granville navigates/reloads.
        if (!state.submitted) {
          state.submitted = true;

          try {
            sessionStorage.setItem(
              GRANVILLE_EXTRACT_SESSION_KEY,
              JSON.stringify(state)
            );
          } catch (e) {}

          if (parcelId && parcelInput) {
            parcelInput.value = parcelId;

            if (hiddenParcel) {
              // Granville pads this field internally, but the compact parcel
              // number is accepted by its search handler.
              hiddenParcel.value = parcelId;
            }

            parcelInput.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (addressInput && rawAddress) {
            addressInput.value = splitAddress(rawAddress).street || rawAddress;
          }

          submit.click();
          return;
        }
      }

      // If search was submitted but nothing appeared, allow one address retry.
      if (state.submitted && !state.addressRetried &&
          Date.now() - started > 7000 && addressInput && rawAddress) {
        state.addressRetried = true;
        state.submitted = false;

        try {
          sessionStorage.setItem(
            GRANVILLE_EXTRACT_SESSION_KEY,
            JSON.stringify(state)
          );
        } catch (e) {}

        if (parcelInput) parcelInput.value = '';
        if (hiddenParcel) hiddenParcel.value = '';
        addressInput.value = splitAddress(rawAddress).street || rawAddress;
        submit.click();
        return;
      }

      if (Date.now() - started > 25000) {
        clearInterval(timer);
        finish(extractGranvilleRenderedTables());
      }
    }, 300);
  }

  function fetchGranvilleRenderedProfile(parcelId, rawAddress = '') {
    return new Promise((resolve) => {
      parcelId = String(parcelId || '').replace(/[^0-9A-Za-z]/g, '');

      if (!parcelId && !rawAddress) {
        resolve(null);
        return;
      }

      const frame = document.createElement('iframe');
      frame.style.cssText =
        'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none;';

      const payload = encodeURIComponent(JSON.stringify({
        parcelId,
        address: rawAddress || '',
        submitted: false,
        addressRetried: false
      }));

      frame.src =
        GRANVILLE_TAX_SEARCH +
        '#mci-nc-granville-extract=' +
        payload;

      let finished = false;

      const cleanup = (value) => {
        if (finished) return;
        finished = true;
        window.removeEventListener('message', onMessage);
        clearTimeout(timeout);
        try { frame.remove(); } catch (e) {}
        resolve(value);
      };

      const onMessage = (event) => {
        if (event.origin !== 'https://tax.granvillecounty.org') return;

        const msg = event.data || {};
        if (msg.type !== 'MCI_GRANVILLE_PROFILE') return;

        if (parcelId && String(msg.parcelId || '') !== parcelId) return;

        cleanup(msg.data || null);
      };

      const timeout = setTimeout(() => cleanup(null), 30000);

      window.addEventListener('message', onMessage);
      document.body.appendChild(frame);
    });
  }

  async function enrichGranville(feature, lookupResult) {
    const a = feature && feature.attributes ? feature.attributes : {};

    const rawAddress =
      (lookupResult && lookupResult.parsed && lookupResult.parsed.raw) ||
      a.siteadd ||
      '';

    let localFacts = null;
    let knownParcel = a.parno || '';

    // FAST PATH: use the cached Granville Parcel + Building data only.
    // This reliably gives us Year Built and Square Feet without making the
    // main lookup wait on Granville's slow interactive website.
    try {
      localFacts = await lookupGranvilleLocalProperty(rawAddress);
      if (!knownParcel && localFacts && localFacts.parcel) {
        knownParcel = localFacts.parcel;
      }
    } catch (e) {}

    // If the local address index did not resolve a parcel, use the parcel CSV
    // fallback. This is still a static county-data lookup, not the slow website.
    if (!knownParcel) {
      try {
        const csvMatch = await lookupGranvilleParcelCsvByAddress(rawAddress);
        if (csvMatch && csvMatch.parcel) {
          knownParcel = csvMatch.parcel;
        }
      } catch (e) {}
    }

    const fallbackYear = Number(a.structyear) > 0 ? a.structyear : '';

    return {
      source: localFacts ? localFacts.source : 'Granville County',
      yearBuilt:
        (localFacts && localFacts.yearBuilt) ||
        fallbackYear ||
        '',
      yearBuiltSource:
        (localFacts && localFacts.yearBuilt)
          ? localFacts.source
          : (fallbackYear ? 'NC OneMap / Granville County parcel' : ''),
      squareFeet:
        (localFacts && localFacts.squareFeet) || '',
      squareFeetSource:
        (localFacts && localFacts.squareFeet)
          ? localFacts.source
          : '',
      dwellingStyle:
        (localFacts && localFacts.dwellingStyle) || '',
      dwellingStyleSource:
        (localFacts && localFacts.dwellingStyle)
          ? localFacts.source
          : '',
      stories:
        (localFacts && localFacts.stories) || '',
      construction:
        (localFacts && localFacts.construction) || '',
      roofMaterial:
        (localFacts && localFacts.roofMaterial) || '',
      fireDistrict:
        (localFacts && localFacts.fireDistrict) || '',
      granvilleBackgroundParcel: knownParcel || '',
      granvilleBackgroundAddress: rawAddress,
      raw: {
        parcel: a,
        cachedCountyRecord: localFacts || null,
        resolvedParcel: knownParcel || null,
        officialTaxSearch: GRANVILLE_TAX_SEARCH,
        officialGisMap: GRANVILLE_GIS_MAP
      }
    };
  }

  function lookupPointForFeature(feature, lookupResult) {
    if (lookupResult && lookupResult.geocode && lookupResult.geocode.location) {
      const g = lookupResult.geocode.location;
      if (Number.isFinite(Number(g.x)) && Number.isFinite(Number(g.y))) {
        return { x: Number(g.x), y: Number(g.y) };
      }
    }
    const c = geometryCenter(feature && feature.geometry);
    return c && Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y))
      ? { x: Number(c.x), y: Number(c.y) }
      : null;
  }

  async function statewideFireInfo(pt) {
    if (!pt) return null;

    const stationPromise = nearestPointDistanceNoPaging(
      OSFM_FIRE_STATION_QUERY,
      pt,
      '*',
      16093.44,
      8000
    ).catch(() => null);

    const districtPromise = queryPointNoPaging(
      OSFM_FIRE_DISTRICT_QUERY,
      pt,
      '*',
      false,
      8000
    ).catch(() => null);

    const [station, districtData] = await Promise.all([stationPromise, districtPromise]);
    const districtAttrs = districtData && districtData.features && districtData.features[0]
      ? districtData.features[0].attributes || {}
      : {};

    const fireDistrict = firstMatchingAttribute(districtAttrs, [
      /^firedepartment$/i,
      /^FDID$/i,
      /FIRE.*DEPARTMENT/i,
      /DISTRICT/i
    ]);

    const stationName = station ? firstMatchingAttribute(station.attributes, [
      /^DEPT_NAME$/i,
      /^STATION_NUMBER$/i,
      /^NAME$/i,
      /DEPT/i,
      /STATION/i
    ]) : '';

    if (!station && !Object.keys(districtAttrs).length) return null;

    return {
      source: 'NC OSFM Fire GIS',
      fireDistrict: fireDistrict || '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: stationName || '',
      raw: {
        nearestFireStation: station ? station.attributes : null,
        fireDistrict: Object.keys(districtAttrs).length ? districtAttrs : null
      }
    };
  }

  async function enrichFranklin(feature, lookupResult) {
    const pt = lookupPointForFeature(feature, lookupResult);
    if (!pt) return null;

    const parcelP = queryPointNoPaging(FRANKLIN_PARCEL_QUERY, pt, '*', false, 7000).catch(() => null);
    const districtP = queryPointNoPaging(FRANKLIN_FIRE_DISTRICT_QUERY, pt, '*', false, 7000).catch(() => null);
    const stationP = nearestPointDistanceNoPaging(FRANKLIN_FIRE_STATION_QUERY, pt, '*', 16093.44, 7000).catch(() => null);
    const [parcelData, districtData, station] = await Promise.all([parcelP, districtP, stationP]);

    const parcel = parcelData && parcelData.features && parcelData.features[0] ? parcelData.features[0].attributes || {} : {};
    const district = districtData && districtData.features && districtData.features[0] ? districtData.features[0].attributes || {} : {};
    const fireDistrict = district.DEPT__NAME || firstMatchingAttribute(district, [/DEPT.*NAME/i, /DISTRICT/i]) || '';
    const protectionClass = district.INS_RATING || '';
    const stationName = station ? firstMatchingAttribute(station.attributes, [/^DEPARTMENT$/i, /^NAME$/i, /DEPT/i]) : '';

    return {
      source: 'Franklin County GIS',
      fireDistrict,
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: stationName || '',
      protectionClass,
      protectionNote: protectionClass ? 'Franklin County GIS insurance rating field' : '',
      raw: { parcel, fireDistrict: district, nearestFireStation: station ? station.attributes : null }
    };
  }

  async function enrichEdgecombe(feature, lookupResult) {
    const pt = lookupPointForFeature(feature, lookupResult);
    if (!pt) return null;

    const parcelP = queryPointNoPaging(EDGECOMBE_PARCEL_QUERY, pt, '*', false, 7000).catch(() => null);
    const districtP = queryPointNoPaging(EDGECOMBE_FIRE_DISTRICT_QUERY, pt, '*', false, 7000).catch(() => null);
    const hydrantP = nearestPointDistanceNoPaging(EDGECOMBE_HYDRANT_QUERY, pt, '*', 3218.688, 7000).catch(() => null);
    const fireP = statewideFireInfo(pt).catch(() => null);
    const [parcelData, districtData, hydrant, stateFire] = await Promise.all([parcelP, districtP, hydrantP, fireP]);

    const parcel = parcelData && parcelData.features && parcelData.features[0] ? parcelData.features[0].attributes || {} : {};
    const district = districtData && districtData.features && districtData.features[0] ? districtData.features[0].attributes || {} : {};
    const fireDistrict = district.ALPHA || firstMatchingAttribute(district, [/^ALPHA$/i, /FIRE.*DIST/i, /^NAME$/i]) || (stateFire && stateFire.fireDistrict) || '';

    return {
      source: 'Edgecombe County GIS',
      fireDistrict,
      hydrantDistanceFeet: hydrant ? hydrant.feet : '',
      hydrantSource: hydrant ? 'Edgecombe County Fire Hydrants GIS' : '',
      fireStationDistanceFeet: stateFire ? stateFire.fireStationDistanceFeet : '',
      fireStationName: stateFire ? stateFire.fireStationName : '',
      raw: { parcel, fireDistrict: district, nearestHydrant: hydrant ? hydrant.attributes : null, statewideFire: stateFire ? stateFire.raw : null }
    };
  }

  async function enrichCumberland(feature, lookupResult) {
    const pt = lookupPointForFeature(feature, lookupResult);
    if (!pt) return null;

    const parcelP = queryPointNoPaging(CUMBERLAND_PARCEL_QUERY, pt, '*', false, 7000).catch(() => null);
    const districtP = queryPointNoPaging(CUMBERLAND_FIRE_DISTRICT_QUERY, pt, '*', false, 7000).catch(() => null);
    const stationP = nearestPointDistanceNoPaging(CUMBERLAND_FIRE_STATION_QUERY, pt, '*', 16093.44, 7000).catch(() => null);
    const [parcelData, districtData, station] = await Promise.all([parcelP, districtP, stationP]);
    const parcel = parcelData && parcelData.features && parcelData.features[0] ? parcelData.features[0].attributes || {} : {};
    const district = districtData && districtData.features && districtData.features[0] ? districtData.features[0].attributes || {} : {};

    return {
      source: 'Cumberland County GIS',
      fireDistrict: firstMatchingAttribute(district, [/FIRE.*DIST/i, /^NAME$/i, /^DISTRICT$/i, /^FDNAME$/i]) || '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: station ? firstMatchingAttribute(station.attributes, [/^NAME$/i, /^FDNAME$/i, /STATION/i]) : '',
      raw: { parcel, fireDistrict: district, nearestFireStation: station ? station.attributes : null }
    };
  }

  async function enrichSampson(feature, lookupResult) {
    const pt = lookupPointForFeature(feature, lookupResult);
    if (!pt) return null;

    const parcelP = queryPointNoPaging(SAMPSON_PARCEL_QUERY, pt, '*', false, 7000).catch(() => null);
    const districtP = queryPointNoPaging(SAMPSON_FIRE_RESPONSE_QUERY, pt, '*', false, 7000).catch(() => null);
    const stationP = nearestPointDistanceNoPaging(SAMPSON_FIRE_STATION_QUERY, pt, '*', 16093.44, 7000).catch(() => null);
    const [parcelData, districtData, station] = await Promise.all([parcelP, districtP, stationP]);
    const parcel = parcelData && parcelData.features && parcelData.features[0] ? parcelData.features[0].attributes || {} : {};
    const district = districtData && districtData.features && districtData.features[0] ? districtData.features[0].attributes || {} : {};

    return {
      source: 'Sampson County GIS',
      fireDistrict: firstMatchingAttribute(district, [/DEPT.*NAME/i, /FIRE.*(AREA|DIST|DEPT)/i, /^NAME$/i]) || '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: station ? firstMatchingAttribute(station.attributes, [/^DEPT_NAME$/i, /^Station$/i, /STATION/i]) : '',
      raw: { parcel, fireResponseArea: district, nearestFireStation: station ? station.attributes : null }
    };
  }

  async function enrichMoore(feature, lookupResult) {
    const pt = lookupPointForFeature(feature, lookupResult);
    if (!pt) return null;

    const districtP = queryPointNoPaging(MOORE_FIRE_DISTRICT_QUERY, pt, '*', false, 7000).catch(() => null);
    const stationP = nearestPointDistanceNoPaging(MOORE_FIRE_STATION_QUERY, pt, '*', 16093.44, 7000).catch(() => null);
    const [districtData, station] = await Promise.all([districtP, stationP]);
    const district = districtData && districtData.features && districtData.features[0] ? districtData.features[0].attributes || {} : {};

    return {
      source: 'Moore County GIS',
      fireDistrict: firstMatchingAttribute(district, [/FIRE.*DIST/i, /^NAME$/i, /DISTRICT/i]) || '',
      fireStationDistanceFeet: station ? station.feet : '',
      fireStationName: station ? firstMatchingAttribute(station.attributes, [/^NAME$/i, /STATION/i, /FIRE/i]) : '',
      raw: { fireDistrict: district, nearestFireStation: station ? station.attributes : null }
    };
  }


  function warrenAddressScore(attrs, parsed) {
    const wantedStreet = normalizeAddressForMatch((parsed && parsed.street) || '');
    const wantedCity = normalizeSpaces((parsed && parsed.city) || '').toUpperCase();
    const wantedZip = normalizeSpaces((parsed && parsed.zip) || '').slice(0, 5);

    const fullAddress = normalizeAddressForMatch(attrs.ADDRESS || '');
    const streetFromFields = normalizeAddressForMatch(
      [attrs.HOUSENUM, attrs.STREETNAME].filter(Boolean).join(' ')
    );

    let score = 0;
    for (const candidate of [fullAddress, streetFromFields].filter(Boolean)) {
      if (wantedStreet && candidate === wantedStreet) score = Math.max(score, 100);
      else if (wantedStreet && candidate.startsWith(wantedStreet)) score = Math.max(score, 95);
      else if (wantedStreet && candidate.includes(wantedStreet)) score = Math.max(score, 90);
      else if (wantedStreet) {
        const wantedTokens = wantedStreet.split(/\s+/).filter(Boolean);
        const hits = wantedTokens.filter(t => candidate.includes(t)).length;
        if (wantedTokens.length) {
          score = Math.max(score, Math.round((hits / wantedTokens.length) * 75));
        }
      }
    }

    const addrText = normalizeSpaces(attrs.ADDRESS || '').toUpperCase();
    if (wantedCity && addrText.includes(wantedCity)) score += 5;
    if (wantedZip && addrText.includes(wantedZip)) score += 5;
    return score;
  }

  async function findWarrenParcelByAddress(parsed) {
    if (!parsed) return null;

    const parts = streetParts(parsed.street || '');
    const house = escSql(parts.house || '');
    if (!house) return null;

    const streetName = escSql(parts.streetName || '');
    const wheres = [
      `HOUSENUM = '${house}'`,
      `ADDRESS LIKE '${house}%'`
    ];

    if (streetName) {
      wheres.unshift(`HOUSENUM = '${house}' AND UPPER(STREETNAME) LIKE '%${streetName.toUpperCase()}%'`);
    }

    let records = [];
    for (const where of wheres) {
      try {
        const data = await queryWhere(WARREN_PARCEL_QUERY, where, '*');
        records = records.concat((data.features || []).map(f => f.attributes || {}));
      } catch (e) {}
    }

    if (!records.length) return null;

    const seen = new Set();
    records = records.filter(a => {
      const key = normalizeSpaces(a.PARCELID || a.Parcel_Num || a.GIS_Number || a.OBJECTID || '');
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    });

    records.sort((a, b) => warrenAddressScore(b, parsed) - warrenAddressScore(a, parsed));
    const best = records[0];
    if (!best) return null;

    // Do NOT accept a Warren parcel just because its house number matches.
    // Rural addresses can share the same house number across many roads.
    // Require the street text itself to match strongly enough to identify the
    // requested parcel (for example, 528 RABBIT BOTTOM RD must never match
    // 528 N 43RD ST).
    const bestScore = warrenAddressScore(best, parsed);
    return bestScore >= 80 ? best : null;
  }




  async function enrichWarren(feature, lookupResult) {
    const pt = lookupPointForFeature(feature, lookupResult);
    if (!pt) return null;

    const rawAddress =
      (lookupResult && lookupResult.parsed && lookupResult.parsed.raw) ||
      '';

    const fireP = statewideFireInfo(pt).catch(() => null);
    const taxP = fetchWarrenDirectPropertyCard(rawAddress).catch(() => null);

    const [stateFire, taxCard] = await Promise.all([fireP, taxP]);

    return {
      source: taxCard && (
        taxCard.yearBuilt ||
        taxCard.squareFeet ||
        taxCard.dwellingStyle ||
        taxCard.construction ||
        taxCard.stories ||
        taxCard.roofMaterial
      )
        ? 'Warren County Property Record Card'
        : 'Warren County GIS',

      taxRecordUrl:
        (taxCard && taxCard.taxRecordUrl) || WARREN_TAX_SEARCH,

      yearBuilt: taxCard ? (taxCard.yearBuilt || '') : '',
      yearBuiltSource: taxCard ? (taxCard.yearBuiltSource || '') : '',

      squareFeet: taxCard ? (taxCard.squareFeet || '') : '',
      squareFeetSource: taxCard ? (taxCard.squareFeetSource || '') : '',

      numberFamilies: taxCard ? (taxCard.numberFamilies || '') : '',
      numberFamiliesSource: taxCard ? (taxCard.numberFamiliesSource || '') : '',

      construction: taxCard ? (taxCard.construction || '') : '',
      constructionSource: taxCard ? (taxCard.constructionSource || '') : '',

      dwellingStyle: taxCard ? (taxCard.dwellingStyle || '') : '',
      dwellingStyleSource: taxCard ? (taxCard.dwellingStyleSource || '') : '',

      stories: taxCard ? (taxCard.stories || '') : '',
      storiesSource: taxCard ? (taxCard.storiesSource || '') : '',

      roofMaterial: taxCard ? (taxCard.roofMaterial || '') : '',
      roofType: taxCard ? (taxCard.roofType || '') : '',

      fireDistrict: stateFire ? stateFire.fireDistrict : '',
      fireStationDistanceFeet: stateFire ? stateFire.fireStationDistanceFeet : '',
      fireStationName: stateFire ? stateFire.fireStationName : '',

      raw: {
        warrenTax: taxCard ? taxCard.raw : null,
        statewideFire: stateFire ? stateFire.raw : null,
        directPostSearch: true
      }
    };
  }

  async function enrichGenericNcCounty(feature, lookupResult) {
    const pt = lookupPointForFeature(feature, lookupResult);
    const stateFire = await statewideFireInfo(pt).catch(() => null);
    if (!stateFire) return null;
    return stateFire;
  }

  async function enrichCounty(feature, lookupResult) {
    const a = feature.attributes || {};
    const source = String(a.sourceagnt || '');
    const county = String(a.cntyname || source || '');
    if (/Wake/i.test(county)) return enrichWake(feature, lookupResult);
    if (/Harnett/i.test(county)) return enrichHarnett(feature, lookupResult);
    if (/Chatham/i.test(county)) return enrichChatham(feature, lookupResult);
    if (/Johnston/i.test(county)) return enrichJohnston(feature, lookupResult);
    if (/Durham/i.test(county)) return enrichDurham(feature, lookupResult);
    if (/Orange/i.test(county)) return enrichOrange(feature, lookupResult);
    if (/Lee/i.test(county)) return enrichLee(feature, lookupResult);
    if (/Nash/i.test(county)) return enrichNash(feature, lookupResult);
    if (/Wilson/i.test(county)) return enrichWilson(feature, lookupResult);
    if (/Vance/i.test(county)) return enrichVance(feature, lookupResult);
    if (/Granville/i.test(county)) return enrichGranville(feature, lookupResult);
    if (/Franklin/i.test(county)) return enrichFranklin(feature, lookupResult);
    if (/Edgecombe/i.test(county)) return enrichEdgecombe(feature, lookupResult);
    if (/Cumberland/i.test(county)) return enrichCumberland(feature, lookupResult);
    if (/Sampson/i.test(county)) return enrichSampson(feature, lookupResult);
    if (/Moore/i.test(county)) return enrichMoore(feature, lookupResult);
    if (/Warren/i.test(county)) return enrichWarren(feature, lookupResult);
    return enrichGenericNcCounty(feature, lookupResult);
  }

  function val(v) {
    return (v === null || v === undefined || v === '') ? 'Not Found' : String(v);
  }

  function fmtNum(v) {
    if (v === null || v === undefined || v === '') return 'Not Found';
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : String(v);
  }

  function row(label, value, source, good) {
    return `<div class="mci-nc-row ${good ? 'good' : ''}">
      <div class="mci-nc-label">${label}</div>
      <div class="mci-nc-value">
        <div>${value}</div>
        <div class="mci-nc-source">${source || ''}</div>
      </div>
    </div>`;
  }

  function taxRecordLinkForCounty(name) {
    if (/Wake/i.test(name)) {
      return 'https://services.wake.gov/realestate/';
    }
    if (/Johnston/i.test(name)) {
      return 'https://www.bttaxpayerportal.com/itspublicjo';
    }
    if (/Vance/i.test(name)) {
      return 'https://vance.ustaxdata.com/Search.cfm';
    }
    if (/Granville/i.test(name)) {
      return GRANVILLE_TAX_SEARCH;
    }
    if (/Warren/i.test(name)) {
      return WARREN_TAX_SEARCH;
    }
    return '';
  }

  function sourceLinkForCounty(name) {
    if (/Wake/i.test(name)) return 'https://services.wake.gov/realestate/';
    if (/Harnett/i.test(name)) return 'https://gis.harnett.org/gisviewer/';
    if (/Chatham/i.test(name)) return 'https://gisservices.chathamcountync.gov/landinformation/';
    if (/Johnston/i.test(name)) return 'https://mapclick8.johnstonnc.com/mapclick6/index.html/';
    if (/Durham/i.test(name)) return 'https://maps.durhamnc.gov/';
    if (/Orange/i.test(name)) return 'https://gis.orangecountync.gov/';
    if (/Lee/i.test(name)) return 'https://leecountync.gov/gis';
    if (/Nash/i.test(name)) return 'https://nashcountync.gov/430/GIS';
    if (/Wilson/i.test(name)) return 'https://www.wilson-co.com/departments/gis';
    if (/Vance/i.test(name)) return 'https://www.vancecounty.org/departments/planning-and-development/gis/';
    if (/Granville/i.test(name)) return GRANVILLE_GIS_MAP;
    if (/Franklin/i.test(name)) return 'https://www.franklincountync.gov/298/GIS-Mapping-Department';
    if (/Edgecombe/i.test(name)) return 'https://gis.edgecombecountync.gov/arcgis/rest/services/webmap/MapServer';
    if (/Cumberland/i.test(name)) return 'https://gis.co.cumberland.nc.us/server/rest/services';
    if (/Sampson/i.test(name)) return 'https://services3.arcgis.com/fM4kjZmPOS4ay2Ff/arcgis/rest/services/Sampson_County_Viewer/FeatureServer';
    if (/Moore/i.test(name)) return 'https://gis.moorecountync.gov/server/rest/services/General/General_Layers/MapServer';
    if (/Warren/i.test(name)) return 'https://services.arcgis.com/lcU85Lh3UvDs5Naw/ArcGIS/rest/services/Parcels051622/FeatureServer/0';
    return '';
  }

  function updateGranvilleCardFromBackground(card, details) {
    if (!card || !details) return false;

    const source = 'Granville County Tax Record';
    let changed = false;

    function setRow(label, value) {
      value = normalizeSpaces(value || '');
      if (!value) return;

      const rows = Array.from(card.querySelectorAll('.mci-nc-row'));
      const target = rows.find(r =>
        normalizeSpaces(r.querySelector('.mci-nc-label')?.textContent) === label
      );

      if (!target) return;

      const valueBox = target.querySelector('.mci-nc-value');
      if (!valueBox) return;

      valueBox.innerHTML =
        `<div>${val(value)}</div><div class="mci-nc-source">${source}</div>`;
      target.classList.add('good');
      changed = true;
    }

    setRow('Construction', details.construction);
    setRow('Dwelling Style', details.dwellingStyle);
    setRow('Stories', details.stories);
    setRow('Roof Material', details.roofMaterial);

    if (details.fireDistrict) {
      const existing = Array.from(card.querySelectorAll('.mci-nc-row')).find(r =>
        normalizeSpaces(r.querySelector('.mci-nc-label')?.textContent) === 'Fire District'
      );

      if (existing) {
        const valueBox = existing.querySelector('.mci-nc-value');
        if (valueBox) {
          valueBox.innerHTML =
            `<div>${val(details.fireDistrict)}</div><div class="mci-nc-source">${source}</div>`;
          existing.classList.add('good');
          changed = true;
        }
      } else {
        const section = card.querySelector('.mci-nc-section-title');
        if (section) {
          const temp = document.createElement('div');
          temp.innerHTML = row('Fire District', val(details.fireDistrict), source, true);
          card.appendChild(temp.firstElementChild);
          changed = true;
        }
      }
    }

    return changed;
  }

  function buildStreetViewUrls(result, feature) {
    let lat = null;
    let lon = null;

    if (result && result.geocode && result.geocode.location) {
      lat = Number(result.geocode.location.y);
      lon = Number(result.geocode.location.x);
    }

    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && feature) {
      const center = geometryCenter(feature.geometry);
      if (center) {
        lat = Number(center.y);
        lon = Number(center.x);
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { embed: '', link: '' };
    }

    const coord = `${lat},${lon}`;

    return {
      embed:
        'https://maps.google.com/maps?layer=c' +
        '&cbll=' + encodeURIComponent(coord) +
        '&cbp=11,0,0,0,0' +
        '&source=embed' +
        '&output=svembed',
      link:
        'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' +
        encodeURIComponent(coord)
    };
  }

  async function renderResults(result) {
    const out = document.querySelector(`#${UI_ID} .mci-nc-results`);
    const status = document.querySelector(`#${UI_ID} .mci-nc-status`);
    let features = (result.data && result.data.features) || [];

    if (!features.length && result.geocode && result.geocode.location) {
      const ga = result.geocode.attributes || {};
      features = [{
        attributes: {
          siteadd: result.geocode.address || result.parsed.raw,
          scity: ga.City || ga.Subregion || '',
          szip: ga.Postal || ga.PostalExt || '',
          cntyname: ga.Subregion || '',
          sourceagnt: ga.Subregion || '',
          structyear: ''
        },
        geometry: {
          x: result.geocode.location.x,
          y: result.geocode.location.y
        }
      }];
    }

    if (!features.length) {
      status.textContent = 'Address lookup did not return a usable match.';
      out.innerHTML = `<div class="mci-nc-empty">
        The statewide address service did not return a usable match. County-specific fallbacks were also checked.
      </div>`;
      return;
    }

    status.textContent = 'Address located. Checking parcel/county data…';
    out.innerHTML = '';

    for (let i = 0; i < Math.min(features.length, 3); i++) {
      const f = features[i];
      const a = f.attributes || {};
      const county = a.cntyname ? `${a.cntyname} County` : countyName(a.sourceagnt);
      const fullAddress =
        (result.parsed && result.parsed.raw)
          ? result.parsed.raw
          : [a.siteadd, a.scity, a.sstate, a.szip].filter(Boolean).join(', ');

      const streetView = buildStreetViewUrls(result, f);

      let enrichment = null;
      try {
        enrichment = await enrichCounty(f, result);
      } catch (e) {
        enrichment = { error: e.message || 'County lookup failed.' };
      }

      const fallbackYear = Number(a.structyear) > 0 ? a.structyear : '';
      const year = enrichment && Number(enrichment.yearBuilt) > 0 ? enrichment.yearBuilt : fallbackYear;
      const yearSource = enrichment && Number(enrichment.yearBuilt) > 0
        ? (enrichment.yearBuiltSource || enrichment.source)
        : (fallbackYear ? 'NC OneMap' : '');
      const sqft = enrichment && enrichment.squareFeet ? fmtNum(enrichment.squareFeet) : 'Not Found';
      const sqftSource = enrichment && enrichment.squareFeet
        ? (enrichment.squareFeetSource || enrichment.source)
        : '';
      const dwellingStyleSource = enrichment && enrichment.dwellingStyle
        ? (enrichment.dwellingStyleSource || enrichment.source)
        : '';
      const countyLink = (enrichment && enrichment.countySiteUrl) || sourceLinkForCounty(county);
      const taxRecordLink = (enrichment && enrichment.taxRecordUrl) || taxRecordLinkForCounty(county);

      const card = document.createElement('div');
      card.className = 'mci-nc-card';
      card.innerHTML = `
        <div class="mci-nc-card-head">
          <div>
            <div class="mci-nc-match">MATCH ${i + 1} · ${val(county)}</div>
            <div class="mci-nc-address">${val(fullAddress)}</div>
          </div>
          <div class="mci-nc-head-actions">
            ${countyLink ? `<a class="mci-nc-link" href="${countyLink}" target="_blank">County Site</a>` : ''}
            ${taxRecordLink ? `<a class="mci-nc-link" href="${taxRecordLink}" target="_blank">Tax Record</a>` : ''}
            <button class="mci-nc-raw">Raw JSON</button>
          </div>
        </div>

        <div class="mci-nc-section-title">ERIE DWELLING FIELDS</div>
        ${row('Year Built', `<b>${val(year)}</b>`, yearSource, !!year)}
        ${row('Square Feet', `<b>${sqft}</b>`, sqftSource, sqft !== 'Not Found')}
        ${row('Swimming Pool', 'Not Found', '')}
        ${row('Number of Families', enrichment && enrichment.numberFamilies ? val(enrichment.numberFamilies) : 'Not Found',
              enrichment && enrichment.numberFamilies ? (enrichment.numberFamiliesSource || enrichment.source) : '',
              !!(enrichment && enrichment.numberFamilies))}
        ${row('Construction', enrichment && enrichment.construction ? val(enrichment.construction) : 'Not Found',
              enrichment && enrichment.construction ? (enrichment.constructionSource || enrichment.source) : '',
              !!(enrichment && enrichment.construction))}
        ${row('Dwelling Style', enrichment && enrichment.dwellingStyle ? val(enrichment.dwellingStyle) : 'Not Found', dwellingStyleSource, !!(enrichment && enrichment.dwellingStyle))}
        ${row('Stories', enrichment && enrichment.stories ? val(enrichment.stories) : 'Not Found',
              enrichment && enrichment.stories ? (enrichment.storiesSource || enrichment.source) : '',
              !!(enrichment && enrichment.stories))}
        ${row('Alarm', 'Not Found', '')}
        ${row('Sprinkler System', 'Not Found', '')}
        ${row('Distance to Fire Hydrant', enrichment && enrichment.hydrantDistanceFeet ? fmtDistanceFeet(enrichment.hydrantDistanceFeet) : 'Not Found',
              enrichment && enrichment.hydrantDistanceFeet ? (enrichment.hydrantSource || enrichment.source) : '',
              !!(enrichment && enrichment.hydrantDistanceFeet))}
        ${row('Distance to Fire Department', enrichment && enrichment.fireStationDistanceFeet ? `${fmtDistanceFeet(enrichment.fireStationDistanceFeet)}${enrichment.fireStationName ? ` · ${enrichment.fireStationName}` : ''}` : 'Not Found', enrichment && enrichment.fireStationDistanceFeet ? enrichment.source : '', !!(enrichment && enrichment.fireStationDistanceFeet))}
        ${row('Protection Class', enrichment && enrichment.protectionClass ? val(enrichment.protectionClass) : 'Not Found', enrichment && enrichment.protectionClass ? (enrichment.protectionNote || enrichment.source) : '', !!(enrichment && enrichment.protectionClass))}
        ${row('Roof Installation Year', 'Not Found', '')}
        ${row('Roof Material', enrichment && enrichment.roofMaterial ? val(enrichment.roofMaterial) : 'Not Found',
              enrichment && enrichment.roofMaterial ? enrichment.source : '', !!(enrichment && enrichment.roofMaterial))}
        ${enrichment && enrichment.fireDistrict
          ? row('Fire District', val(enrichment.fireDistrict), enrichment.source, true)
          : ''}
        ${((enrichment && enrichment.propertyPhotoUrl) || streetView.embed)
          ? `<div class="mci-nc-visual-wrap">
               ${enrichment && enrichment.propertyPhotoUrl
                 ? `<div class="mci-nc-visual-card">
                      <div class="mci-nc-photo-title">
                        Wake County Property Photograph
                        ${enrichment.propertyPhotoDate ? `<span>${val(enrichment.propertyPhotoDate)}</span>` : ''}
                      </div>
                      <a href="${enrichment.propertyPhotoUrl}" target="_blank" title="Open full-size Wake County photograph">
                        <img class="mci-nc-photo" src="${enrichment.propertyPhotoUrl}" alt="Wake County property photograph">
                      </a>
                    </div>`
                 : ''}
               ${streetView.embed
                 ? `<div class="mci-nc-visual-card">
                      <div class="mci-nc-photo-title">
                        Google Street View
                        ${streetView.link
                          ? `<a class="mci-nc-street-link" href="${streetView.link}" target="_blank">Open in Google</a>`
                          : ''}
                      </div>
                      <iframe
                        class="mci-nc-streetview"
                        src="${streetView.embed}"
                        loading="lazy"
                        allowfullscreen
                        referrerpolicy="no-referrer-when-downgrade"
                        title="Google Street View">
                      </iframe>
                    </div>`
                 : ''}
             </div>`
          : ''}
      `;

      card.querySelector('.mci-nc-raw').addEventListener('click', () => {
        const pre = document.querySelector(`#${UI_ID} .mci-nc-json`);
        pre.textContent = JSON.stringify({
          statewide: a,
          county: enrichment && enrichment.raw ? enrichment.raw : null
        }, null, 2);
        pre.style.display = 'block';
      });

      out.appendChild(card);

      // Granville's static county files return Year Built / Square Feet quickly.
      // Try the interactive detail page separately in the background so it
      // cannot delay the main result.
      if (/Granville/i.test(county) &&
          enrichment &&
          enrichment.granvilleBackgroundParcel) {

        const parcelId = enrichment.granvilleBackgroundParcel;
        const granvilleAddress =
          enrichment.granvilleBackgroundAddress || fullAddress;

        fetchGranvilleRenderedProfile(parcelId, granvilleAddress)
          .then(details => {
            if (!details) return;

            const changed = updateGranvilleCardFromBackground(card, details);

            if (changed) {
              const currentStatus =
                document.querySelector(`#${UI_ID} .mci-nc-status`);
              if (currentStatus) {
                currentStatus.textContent =
                  'Property lookup complete. Granville detail fields updated.';
              }
            }

            if (enrichment.raw) {
              enrichment.raw.renderedCountyProfile = details;
            }
          })
          .catch(() => {});
      }

    }

    status.textContent =
      result.data.__searchMode === 0
        ? 'Property lookup complete.'
        : 'Property lookup complete (relaxed address match).';
  }

  function createUi() {
    if (document.getElementById(UI_ID)) return;

    const wrap = document.createElement('div');
    wrap.id = UI_ID;
    wrap.innerHTML = `
      <style>
        #${UI_ID}{
          position:fixed; inset:0; z-index:2147483647; display:none;
          background:rgba(0,0,0,.38); font-family:Arial,sans-serif; color:#1f2933;
        }
        #${UI_ID} *{box-sizing:border-box}
        #${UI_ID} .mci-nc-panel{
          position:absolute; top:3vh; left:50%; transform:translateX(-50%);
          width:min(800px,95vw); max-height:94vh; overflow:auto;
          background:#f7f9fb !important; color:#1f2933 !important;
          border-radius:12px; box-shadow:0 16px 44px rgba(0,0,0,.35);
          border:1px solid #9fb4c7; isolation:isolate;
        }
        #${UI_ID} .mci-nc-head{
          position:sticky; top:0; z-index:20;
          background:linear-gradient(135deg,#1976c8 0%,#0d5f9f 58%,#084a7d 100%) !important;
          color:#fff !important;
          padding:13px 15px; display:flex; align-items:center; justify-content:space-between;
          border-radius:11px 11px 0 0;
          cursor:move; user-select:none;
          box-shadow:0 2px 7px rgba(0,0,0,.22);
        }
        #${UI_ID} .mci-nc-head *{color:#fff !important}
        #${UI_ID} .mci-nc-title{
          font-size:18px !important;font-weight:700 !important;
          color:#fff !important;text-shadow:0 1px 1px rgba(0,0,0,.25);
        }
        #${UI_ID} .mci-nc-sub{
          font-size:12px !important;opacity:1 !important;margin-top:2px;
          color:#eaf6ff !important;
        }
        #${UI_ID} .mci-nc-close{
          width:31px;height:31px;border:1px solid rgba(255,255,255,.35) !important;
          border-radius:6px;cursor:pointer;
          background:rgba(0,0,0,.18) !important;color:#fff !important;font-size:20px !important;
          line-height:1;
        }
        #${UI_ID} .mci-nc-close:hover{
          background:rgba(255,255,255,.18) !important;
        }
        #${UI_ID} .mci-nc-body{padding:15px}
        #${UI_ID} .mci-nc-search{display:flex;gap:8px}
        #${UI_ID} .mci-nc-input{
          flex:1;border:1px solid #aebbc7;border-radius:6px;padding:10px 11px;font-size:14px;
        }
        #${UI_ID} .mci-nc-go{
          border:0;border-radius:6px;background:#1873b9;color:white;font-weight:700;
          padding:0 18px;cursor:pointer;
        }
        #${UI_ID} .mci-nc-status{min-height:20px;margin:9px 2px 4px;font-size:13px;color:#53616d}
        #${UI_ID} .mci-nc-card{
          background:white;border:1px solid #d6dde3;border-radius:8px;margin-top:12px;overflow:hidden;
        }
        #${UI_ID} .mci-nc-card-head{
          display:flex;justify-content:space-between;gap:12px;align-items:center;
          padding:11px 12px;background:#edf3f8;border-bottom:1px solid #d6dde3;
        }
        #${UI_ID} .mci-nc-match{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#627487}
        #${UI_ID} .mci-nc-address{font-weight:700;color:#123a63;margin-top:2px}
        #${UI_ID} .mci-nc-head-actions{display:flex;gap:6px;align-items:center}
        #${UI_ID} .mci-nc-link,#${UI_ID} .mci-nc-raw{
          border:1px solid #a9b8c5;border-radius:5px;background:white;padding:5px 8px;
          cursor:pointer;font-size:11px;text-decoration:none;color:#23445d;
        }
        #${UI_ID} .mci-nc-section-title{
          padding:8px 11px;background:#123a63;color:#fff;font-size:11px;font-weight:700;
          letter-spacing:.5px;
        }
        #${UI_ID} .mci-nc-row{display:grid;grid-template-columns:220px 1fr;border-top:1px solid #edf0f2}
        #${UI_ID} .mci-nc-label{padding:8px 11px;background:#fafbfc;font-weight:600;font-size:13px}
        #${UI_ID} .mci-nc-value{padding:7px 11px;font-size:13px}
        #${UI_ID} .mci-nc-source{font-size:10px;color:#71808c;margin-top:2px}
        #${UI_ID} .mci-nc-row.good .mci-nc-value{background:#eff9ef}
        #${UI_ID} .mci-nc-row.mci-nc-working .mci-nc-value{background:#fff8e6}
        #${UI_ID} .mci-nc-row.mci-nc-working .mci-nc-value b{font-style:italic}
        #${UI_ID} .mci-nc-empty{
          margin-top:12px;padding:13px;border:1px dashed #b9c3cc;border-radius:7px;background:#fff;
          color:#5a6772;font-size:13px;line-height:1.45;
        }
        #${UI_ID} .mci-nc-warning{
          padding:9px 11px;background:#fff7e8;border-top:1px solid #ecd9ad;color:#785c1b;font-size:12px;
        }
        #${UI_ID} .mci-nc-visual-wrap{
          display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;
          padding:10px 12px 12px;border-top:1px solid #dbe3e9;background:#f8fbfd;
        }
        #${UI_ID} .mci-nc-visual-card{
          min-width:0;
        }
        #${UI_ID} .mci-nc-photo-title{
          display:flex;justify-content:space-between;align-items:center;gap:8px;
          margin-bottom:7px;font-size:11px;font-weight:700;color:#40566a;
          text-transform:uppercase;letter-spacing:.35px;
        }
        #${UI_ID} .mci-nc-photo-title span,
        #${UI_ID} .mci-nc-street-link{
          font-weight:400;text-transform:none;letter-spacing:0;color:#56738b;
        }
        #${UI_ID} .mci-nc-street-link{
          text-decoration:none;white-space:nowrap;
        }
        #${UI_ID} .mci-nc-street-link:hover{
          text-decoration:underline;
        }
        #${UI_ID} .mci-nc-photo,
        #${UI_ID} .mci-nc-streetview{
          display:block;width:100%;height:240px;object-fit:cover;
          border:1px solid #c9d3dc;border-radius:6px;background:#fff;
          box-shadow:0 2px 7px rgba(0,0,0,.12);
        }
        #${UI_ID} .mci-nc-streetview{
          border:1px solid #c9d3dc;
        }
        @media (max-width:700px){
          #${UI_ID} .mci-nc-visual-wrap{
            grid-template-columns:1fr;
          }
        }
        #${UI_ID} .mci-nc-json{
          display:none;white-space:pre-wrap;word-break:break-word;background:#101820;color:#c8f7c5;
          padding:12px;border-radius:7px;font:12px Consolas,monospace;margin-top:12px;max-height:300px;overflow:auto;
        }
        #${UI_ID} .mci-nc-foot{
          margin-top:12px;font-size:11px;color:#697986;line-height:1.45;
        }
      </style>
      <div class="mci-nc-panel">
        <div class="mci-nc-head">
          <div>
            <div class="mci-nc-title">MCI - NC Property Lookup</div>
                      <span
              class="mci-nc-version"
              title="Highlighted-address prefill build from v1.2.36 baseline. Address matching uses NC OneMap's statewide geocoder. Wake, Harnett, Chatham, Johnston, Durham, Orange, Lee, Nash, Wilson, Vance, Granville, Franklin, Edgecombe, Cumberland, Sampson, Moore and Warren have dedicated county enrichment. Harnett now also checks its approved 5/6-mile fire-insurance districts for protection-class resolution. Warren uses the county's direct BTTax POST workflow and falls back to the Tax Record link if the report card cannot be read. Other NC counties use current NC OSFM fire-station and fire-district fallback data. Other NC counties still use the statewide parcel record while we add their official data adapters. Fields marked Not Found are intentionally left blank rather than guessed."
            >
              v1.2.40
            </span>
          </div>
          <button class="mci-nc-close" title="Close">×</button>
        </div>
        <div class="mci-nc-body">
          <div class="mci-nc-search">
            <input class="mci-nc-input" type="text"
              placeholder="471 Red Cedar Way Fuquay Varina, NC 27526">
            <button class="mci-nc-go">Look Up</button>
          </div>
          <div class="mci-nc-status"></div>
          <div class="mci-nc-results"></div>
          <pre class="mci-nc-json"></pre>
        </div>
      </div>`;

    document.body.appendChild(wrap);

    const input = wrap.querySelector('.mci-nc-input');
    const go = wrap.querySelector('.mci-nc-go');
    const status = wrap.querySelector('.mci-nc-status');

    function applyPrefill(text) {
      const value = String(text || '').trim();
      if (!value) return;

      input.value = value;
      try {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}
    }

    function open(detail = null) {
      wrap.style.display = 'block';

      if (detail && detail.selectedText) {
        applyPrefill(detail.selectedText);
      }

      setTimeout(() => input.focus(), 0);
    }

    function close() {
      if (isNcPropertyPopup()) {
        try { window.close(); } catch (e) {}
        return;
      }
      wrap.style.display = 'none';
    }

    // Drag the lookup window by its header. The first drag converts the
    // centered transform position into explicit pixel coordinates.
    const panel = wrap.querySelector('.mci-nc-panel');
    const dragHandle = wrap.querySelector('.mci-nc-head');

    let dragState = null;

    function clampPanel(left, top) {
      const rect = panel.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - 48);

      return {
        left: Math.max(0, Math.min(left, maxLeft)),
        top: Math.max(0, Math.min(top, maxTop))
      };
    }

    dragHandle.addEventListener('pointerdown', (e) => {
      if (isNcPropertyPopup()) return;
      if (e.button !== 0) return;
      if (e.target.closest('.mci-nc-close,button,a,input,select,textarea')) return;

      const rect = panel.getBoundingClientRect();

      // Stop using translateX once the user starts dragging.
      panel.style.transform = 'none';
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;

      dragState = {
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top
      };

      try { dragHandle.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    dragHandle.addEventListener('pointermove', (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;

      const pos = clampPanel(
        e.clientX - dragState.offsetX,
        e.clientY - dragState.offsetY
      );

      panel.style.left = `${Math.round(pos.left)}px`;
      panel.style.top = `${Math.round(pos.top)}px`;
    });

    function endDrag(e) {
      if (!dragState) return;
      if (e && e.pointerId !== dragState.pointerId) return;
      try { dragHandle.releasePointerCapture(dragState.pointerId); } catch (err) {}
      dragState = null;
    }

    dragHandle.addEventListener('pointerup', endDrag);
    dragHandle.addEventListener('pointercancel', endDrag);

    async function run() {
      const raw = input.value.trim();
      if (!raw) {
        status.textContent = 'Enter an address.';
        input.focus();
        return;
      }

      go.disabled = true;
      go.textContent = 'Searching…';
      status.textContent = 'Searching NC OneMap…';
      wrap.querySelector('.mci-nc-results').innerHTML = '';
      wrap.querySelector('.mci-nc-json').style.display = 'none';

      try {
        const result = await statewideLookup(raw);
        await renderResults(result);
      } catch (e) {
        status.textContent = e && e.message ? e.message : 'Lookup failed.';
      } finally {
        go.disabled = false;
        go.textContent = 'Look Up';
      }
    }

    // Allow the MCI Master Menu to open/prefill this UI.
    window.addEventListener(OPEN_EVENT, (event) => {
      open(event && event.detail ? event.detail : null);
    });

    document.addEventListener(OPEN_EVENT, (event) => {
      open(event && event.detail ? event.detail : null);
    });

    window.addEventListener('message', (event) => {
      const msg = event && event.data ? event.data : null;

      if (msg && msg.__mci === 'nc-property-open') {
        open(msg.detail || null);
        return;
      }

      if (msg && msg.__mci === 'nc-property-prefill') {
        applyPrefill(msg.text || '');
      }
    });

    wrap.querySelector('.mci-nc-close').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    go.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  }

  function wireNcPropertyPopupLauncher() {
    function handleOpenRequest(detail = null) {
      const selectedText = detail && detail.selectedText
        ? String(detail.selectedText).trim()
        : '';

      openNcPropertyPopup(selectedText);
    }

    window.addEventListener(OPEN_EVENT, (event) => {
      handleOpenRequest(event && event.detail ? event.detail : null);
    });

    document.addEventListener(OPEN_EVENT, (event) => {
      handleOpenRequest(event && event.detail ? event.detail : null);
    });

    window.addEventListener('message', (event) => {
      const msg = event && event.data ? event.data : null;

      if (msg && msg.__mci === 'nc-property-open') {
        handleOpenRequest(msg.detail || null);
        return;
      }

      // Popup asks the opener for the most recent highlighted address.
      if (msg && msg.__mci === 'nc-property-ready') {
        if (!pendingSelectedText) return;

        try {
          event.source.postMessage({
            __mci: 'nc-property-prefill',
            text: pendingSelectedText
          }, '*');
        } catch (e) {}
      }
    });
  }

  function prepareNcPropertyPopupPage() {
    // The popup loads the current carrier page only so the userscript has a
    // normal http/https document to run in. Hide that page and show only the
    // NC Property UI.
    try {
      document.title = 'NC Property Lookup';
      document.documentElement.style.background = '#eef3f7';
      document.body.style.margin = '0';
      document.body.style.background = '#eef3f7';
    } catch (e) {}

    createUi();

    const wrap = document.getElementById(UI_ID);
    if (!wrap) return;

    // Hide the duplicated carrier-site content in this popup.
    Array.from(document.body.children).forEach((el) => {
      if (el !== wrap) el.style.display = 'none';
    });

    // Fill the popup window instead of looking like an overlay.
    wrap.style.display = 'block';
    wrap.style.background = '#eef3f7';

    const panel = wrap.querySelector('.mci-nc-panel');
    const head = wrap.querySelector('.mci-nc-head');

    if (panel) {
      panel.style.top = '0';
      panel.style.left = '0';
      panel.style.width = '100%';
      panel.style.maxHeight = '100vh';
      panel.style.height = '100vh';
      panel.style.transform = 'none';
      panel.style.borderRadius = '0';
      panel.style.border = '0';
      panel.style.boxShadow = 'none';
    }

    if (head) {
      head.style.cursor = 'default';
      head.style.borderRadius = '0';
    }

    const input = wrap.querySelector('.mci-nc-input');
    try { if (input) input.focus(); } catch (e) {}

    // Ask the opener for any address text that was highlighted when the
    // Master Menu button was clicked. This handshake avoids timing issues
    // while the popup is still loading.
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          __mci: 'nc-property-ready'
        }, '*');
      }
    } catch (e) {}
  }

  if (isGranvilleExtractorFrame()) {
    runGranvilleExtractorFrame();
  } else if (isNcPropertyPopup()) {
    prepareNcPropertyPopupPage();
  } else {
    wireNcPropertyPopupLauncher();
  }
})();
