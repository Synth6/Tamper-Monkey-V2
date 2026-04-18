// ==UserScript==
// @name         QQ Catalyst - MCI Logo Brand + Blue Ribbon
// @namespace    mci-tools
// @version      3.0
// @description  Replaces QQ nav logo with Middle Creek Insurance logo link and applies blue gradient to the fixed ribbon.
// @match        https://app.qqcatalyst.com/*
// @match        https://*.qqcatalyst.com/*
// @run-at       document-idle
// @allFrames    true
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ%20Catalyst%20-%20MCI%20Logo%20Brand%20%2B%20Blue%20Ribbon.user.js
// @downloadURL  https://raw.githubusercontent.com/Synth6/Tamper-Monkey-V2/main/QQ%20Catalyst%20-%20MCI%20Logo%20Brand%20%2B%20Blue%20Ribbon.user.js
// ==/UserScript==

(() => {
  "use strict";

  /* ========= CONFIG ========= */
  const DRIVE_URL = "https://sites.google.com/middlecreekins.com/easy-links/home";
  const LOGO_URL  = "https://middlecreekins.com/wp-content/uploads/2024/02/Logo-mobile2.png";

  const LOGO_WIDTH  = 150; // adjust if needed
  const LOGO_HEIGHT = 34;  // adjust if needed

  const RIBBON_GRADIENT = "linear-gradient(135deg,#00223E 0%,#005792 50%,#00BBF0 100%)";

  /* ========= CSS ========= */
  GM_addStyle(`
    /* --- Ribbon theming (ONLY #fix-ribbon) --- */
    #fix-ribbon.mci-themed {
      position: relative !important;
      background-image: ${RIBBON_GRADIENT} !important;
      background-size: cover !important;
      background-position: center !important;
      background-attachment: scroll !important;
    }

    #fix-ribbon .mci-ribbon-sheen {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,0));
    }

    /* --- Replace default QQ logo area with MCI linked logo --- */
    #navigation #menu #logo.mci-logo-replaced {
      background: none !important;
      width: 150px !important;
      height: 32px !important;
      min-width: 150px !important;
      min-height: 32px !important;
      max-height: 32px !important;
      display: inline-block !important;
      margin-right: 10px !important;
      vertical-align: middle !important;
      overflow: hidden !important;
      position: relative !important;
      top: -7px !important;
    }

    #navigation #menu #logo.mci-logo-replaced.sprite-global {
      background: none !important;
    }

     #navigation #menu #logo.mci-logo-replaced .mci-logo-link {
      display: inline-block !important;
      width: 150px !important;
      height: 32px !important;
      line-height: 32px !important;
    }

    #navigation #menu #logo.mci-logo-replaced .mci-logo-img {
      display: block !important;
      width: 150px !important;
      height: 32px !important;
      object-fit: contain !important;
    }

    /* Remove old injected text badge if an older script version left it behind */
    #navigation #menu .mci-brand {
      display: none !important;
    }

    #main {
      margin-top: 70px !important;
    }

    @media (max-width: 1200px) {
      #navigation #menu #logo.mci-logo-replaced .mci-logo-img {
        width: ${Math.max(120, LOGO_WIDTH - 20)}px !important;
        height: ${Math.max(28, LOGO_HEIGHT - 4)}px !important;
      }
    }
  `);

  /* ========= HELPERS ========= */
  function replaceLogoWithMci() {
    const logo = document.querySelector("#navigation #menu #logo");
    if (!logo) return;

    // If already replaced, just make sure href/src are still correct
    let link = logo.querySelector(".mci-logo-link");
    let img  = logo.querySelector(".mci-logo-img");

    if (!link || !img) {
      logo.innerHTML = `
        <a class="mci-logo-link" href="${DRIVE_URL}" target="_blank" rel="noopener" aria-label="Open Middle Creek Insurance Easy Links">
          <img class="mci-logo-img" src="${LOGO_URL}" alt="Middle Creek Insurance">
        </a>
      `;
      link = logo.querySelector(".mci-logo-link");
      img  = logo.querySelector(".mci-logo-img");
    }

    if (link) {
      link.href = DRIVE_URL;
      link.target = "_blank";
      link.rel = "noopener";
      link.setAttribute("aria-label", "Open Middle Creek Insurance Easy Links");
    }

    if (img) {
      img.src = LOGO_URL;
      img.alt = "Middle Creek Insurance";
    }

    logo.classList.add("mci-logo-replaced");
  }

  function removeOldInjectedBrand() {
    const oldBrands = document.querySelectorAll("#navigation #menu .mci-brand");
    oldBrands.forEach(el => el.remove());
  }

  function applyRibbonGradient() {
    const ribbon = document.getElementById("fix-ribbon");
    if (!ribbon) return;

    if (!ribbon.classList.contains("mci-themed")) {
      ribbon.classList.add("mci-themed");
    }

    if (!ribbon.querySelector(".mci-ribbon-sheen")) {
      const sheen = document.createElement("div");
      sheen.className = "mci-ribbon-sheen";
      ribbon.appendChild(sheen);
    }
  }

  function init() {
    removeOldInjectedBrand();
    replaceLogoWithMci();
    applyRibbonGradient();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  const mo = new MutationObserver(() => {
    init();
  });

  mo.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Optional hotkey: Alt+D opens Easy Links
  document.addEventListener("keydown", (e) => {
    if (e.altKey && !e.shiftKey && (e.key || "").toLowerCase() === "d") {
      window.open(DRIVE_URL, "_blank", "noopener");
      e.preventDefault();
    }
  });
})();
