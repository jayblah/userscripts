// ==UserScript==
// @name         SC Layout Improvements
// @version      1.7
// @match        https://simpcity.su/*
// @match        https://simpcity.cr/*
// @grant        GM_addStyle
// @updateURL       https://raw.githubusercontent.com/jayblah/userscripts/main/SCLayoutImprovements.user.js
// @downloadURL     https://raw.githubusercontent.com/jayblah/userscripts/main/SCLayoutImprovements.user.js
// ==/UserScript==
(function () {
  "use strict";
  GM_addStyle(`
        .p-body-sidebarCol {
            display: none !important;
        }
        .p-body-content {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            max-width: 100% !important;
        }
        .p-body-pageContent {
            width: 100% !important;
            max-width: 100% !important;
        }
        .block--category .block-header {
            cursor: pointer;
            user-select: none;
            display: flex !important;
            align-items: center;
            gap: 8px;
        }
        .sc-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            font-size: 10px;
            line-height: 1;
            opacity: 0.6;
            transition: transform 0.2s ease;
            flex-shrink: 0;
        }
        .block--category.is-collapsed .sc-toggle {
            transform: rotate(-90deg);
        }
        .block--category.is-collapsed .block-body {
            display: none !important;
        }
    `);

  // ── Category collapse ──────────────────────────────────────────────────────

  const STORAGE_KEY = "sc_category_collapsed";
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function getCategoryId(block) {
    const anchor = block.querySelector(".u-anchorTarget");
    return anchor ? anchor.id : null;
  }
  function initCategories() {
    const state = loadState();
    const blocks = document.querySelectorAll(".block--category");
    blocks.forEach((block) => {
      const id = getCategoryId(block);
      if (!id) return;
      const header = block.querySelector(".block-header");
      if (!header) return;
      const toggle = document.createElement("span");
      toggle.className = "sc-toggle";
      toggle.textContent = "▾";
      const headerLink = header.querySelector("a");
      if (headerLink) {
        headerLink.insertAdjacentElement("afterend", toggle);
      } else {
        header.prepend(toggle);
      }
      if (state[id]) {
        block.classList.add("is-collapsed");
      }
      header.addEventListener("click", () => {
        const collapsed = block.classList.toggle("is-collapsed");
        const current = loadState();
        if (collapsed) {
          current[id] = true;
        } else {
          delete current[id];
        }
        saveState(current);
      });
    });
  }

  // ── Alerts filter ──────────────────────────────────────────────────────────

  function styleAlerts(dropdown) {
    if (dropdown.hasAttribute("data-sc-styled")) return;
    dropdown.setAttribute("data-sc-styled", "1");

    const items = dropdown.querySelectorAll("li.alert");
    items.forEach((item) => {
      const link = item.querySelector("a.fauxBlockLink-blockLink");
      if (!link) {
        item.style.display = "none";
        return;
      }

      const labelEl = item.querySelector(".label");
      const labelText = labelEl?.textContent?.trim() ?? "";
      const fullText = item.textContent.trim().replace(/\s+/g, " ");
      const href = link.getAttribute("href");

      item.style.cssText = `
        display: block;
        background: #171717;
        border-bottom: 1px solid #262626;
        padding: 0;
        margin: 0;
      `;

      item.innerHTML = "";

      const row = document.createElement("a");
      row.href = href;
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        text-decoration: none;
        color: #d0d0d0;
        font-size: 12px;
        font-family: system-ui, sans-serif;
        transition: background 0.15s;
        white-space: nowrap;
        overflow: hidden;
      `;
      row.onmouseover = () => (row.style.background = "#222");
      row.onmouseout = () => (row.style.background = "transparent");

      if (labelText) {
        const badge = document.createElement("span");
        badge.textContent = labelText;
        badge.style.cssText = `
          background: #3db7c7;
          color: #000;
          font-size: 9px;
          font-weight: 900;
          padding: 2px 5px;
          border-radius: 3px;
          text-transform: uppercase;
          flex-shrink: 0;
          letter-spacing: 0.5px;
        `;
        row.appendChild(badge);
      }

      const title = document.createElement("span");
      title.textContent = fullText.replace(labelText, "").trim();
      title.style.cssText = `
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
      `;
      row.appendChild(title);

      const arrow = document.createElement("span");
      arrow.textContent = "→";
      arrow.style.cssText = `color: #3db7c7; flex-shrink: 0; font-size: 11px;`;
      row.appendChild(arrow);

      item.appendChild(row);
    });

    const list = dropdown.querySelector("ol, ul");
    if (list) {
      list.style.cssText = `
        list-style: none;
        margin: 0;
        padding: 0;
        background: #171717;
        border: 1px solid #262626;
        border-radius: 6px;
        overflow: hidden;
        box-shadow: 0 8px 32px #000;
        max-height: 420px;
        overflow-y: auto;
      `;
    }
  }

  function initAlertsFilter() {
    const DROPDOWN_SEL = '.js-alertsMenu, [data-menu="alerts"], .menu--alerts';
    const observer = new MutationObserver(() => {
      document.querySelectorAll(DROPDOWN_SEL).forEach((dropdown) => {
        if (dropdown.offsetParent !== null) styleAlerts(dropdown);
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  function init() {
    initCategories();
    initAlertsFilter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
