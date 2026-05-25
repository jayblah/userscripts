// ==UserScript==
// @name         SC Layout Improvements
// @version      3.3
// @match        https://simpcity.su/*
// @match        https://simpcity.cr/*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SCLayoutImprovements.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SCLayoutImprovements.user.js
// ==/UserScript==

(function () {
  "use strict";

  // 1. All Consolidated Styles
  GM_addStyle(`
        /* --- General Layout Improvements --- */
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
        .block--category.is-collapsed .sc-toggle,
        .sc-sticky-header.is-collapsed .sc-toggle {
            transform: rotate(-90deg);
        }
        .block--category.is-collapsed .block-body {
            display: none !important;
        }
        .reactionsBar.js-reactionsList {
            display: none !important;
        }
        .message-user {
            display: none !important;
        }

        /* --- Streamlined Alerts Dropdown --- */
        li.alert .contentRow-figure {
            display: none !important;
        }
        li.alert .contentRow-minor {
            display: none !important;
        }
        li.alert .contentRow-extra {
            display: none !important;
        }
        li.alert.menu-row {
            padding: 6px 12px !important;
            min-height: auto !important;
        }
        li.alert .fauxBlockLink {
            font-size: 0 !important;
        }
        li.alert .fauxBlockLink a.username {
            display: none !important;
        }
        li.alert .fauxBlockLink-blockLink .label,
        li.alert .fauxBlockLink-blockLink .label-append {
            display: none !important;
        }
        li.alert .fauxBlockLink-blockLink {
            font-size: 13px !important;
            line-height: 1.4 !important;
            display: block !important;
        }

        /* --- Sticky Threads Toggle --- */
        .sc-sticky-header {
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            font-size: 13px;
            font-weight: 600;
            color: #a5a5a5;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .sc-sticky-header:hover {
            color: #d1d1d1;
            background: rgba(0, 0, 0, 0.3);
        }
        .structItemContainer-group--sticky.is-collapsed {
            display: none !important;
        }
        hr.stickySeparatortop {
            display: none !important;
        }

        /* --- Streamlined Thread Lists --- */
        .structItem-cell.structItem-cell--meta,
        .structItem-cell.structItem-cell--latest,
        .structItem-cell.structItem-cell--iconEnd {
            display: none !important;
        }
        .structItem--thread {
            border-bottom: 1px solid rgba(255,255,255,0.05) !important;
        }

        /* Hide parent structural cell containers when the thumbnail inside has been moved */
        .structItem-cell--icon {
            display: none !important;
        }

        /* Safe avatar clean-up: Only hide standard profiles, ignore enlarged thumbnails */
        .structItem-iconContainer .avatar:not(.dcThumbnail):not([data-gv-thumb="true"]) {
            display: none !important;
        }

        /* --- Enlarged Thumbnail Display Properties --- */
        .structItem--thread [data-gv-thumb],
        .structItem [data-gv-thumb],
        .block-row [data-gv-thumb],
        .contentRow [data-gv-thumb] {
            width: 400px !important;
            height: 400px !important;
            display: block !important;
            margin: 0 auto 12px auto !important; /* Force Perfect Center */
            position: relative !important;
            z-index: 5 !important;
            opacity: 1 !important;
            filter: none !important;
        }

        .structItem--thread [data-gv-thumb] img,
        .structItem [data-gv-thumb] img,
        .block-row [data-gv-thumb] img,
        .contentRow [data-gv-thumb] img {
            width: 100% !important;
            height: 100% !important;
            display: block !important;
            object-fit: cover !important;
            object-position: center center !important;
            background-size: cover !important;
            background-position: center !important;
            opacity: 1 !important;
            filter: none !important;
        }

        /* Base64 Tracker Offsets from original script */
        .structItem--thread [data-gv-thumb] img[src*="base64"],
        .structItem [data-gv-thumb] img[src*="base64"],
        .block-row [data-gv-thumb] img[src*="base64"],
        .contentRow [data-gv-thumb] img[src*="base64"] {
            object-position: -9999px !important;
        }

        /* --- Global Grid Centering Fixes (What's New & Forum Thread Lists) --- */
        /* Force parent rows to drop side pad constraints and align everything vertical-center */
        .block-row:has([data-gv-thumb="true"]) .contentRow,
        .contentRow:has([data-gv-thumb="true"]),
        .structItem:has([data-gv-thumb="true"]) {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            text-align: center !important;
            padding-left: 0 !important;
        }

        /* Target text blocks inside lists and scale to 100% full width centered layouts */
        .contentRow-main:has([data-gv-thumb="true"]),
        .structItem-cell.structItem-cell--main:has([data-gv-thumb="true"]) {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            text-align: center !important;
            margin-left: 0 !important;
            padding-left: 0 !important;
        }

        /* Clean metadata items, descriptions, and tag arrays */
        .contentRow-main:has([data-gv-thumb="true"]) .listInline,
        .structItem-cell--main:has([data-gv-thumb="true"]) .structItem-minor,
        .structItem-cell--main:has([data-gv-thumb="true"]) .structItem-parts {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            flex-wrap: wrap !important;
            padding: 0 !important;
            margin: 0 auto !important;
            text-align: center !important;
        }

        .structItem-cell--main:has([data-gv-thumb="true"]) .structItem-parts > li {
            display: inline-flex !important;
            align-items: center !important;
            float: none !important;
        }

        /* --- Kill All Hover Dim Filters completely --- */
        .block-row:hover [data-gv-thumb],
        .contentRow:hover [data-gv-thumb],
        .structItem:hover [data-gv-thumb],
        .structItem--thread:hover [data-gv-thumb] {
            opacity: 1 !important;
            filter: none !important;
        }
    `);

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

  // 2. Thread Enlarger Positioning Logic
  function processThumbnails() {
    const items = document.querySelectorAll(
      ".structItem--thread:not([data-processed]), .structItem:not([data-processed]), .block-row:not([data-processed]), .contentRow:not([data-processed])",
    );

    if (items.length === 0) return;

    items.forEach((item) => {
      const thumbLink = item.querySelector(
        ".structItem-iconContainer a, .dcThumbnail",
      );
      const titleContainer = item.querySelector(
        ".structItem-title, .contentRow-title",
      );

      // Fallback strategy if custom grid containers lack classic heading elements
      let target = titleContainer;
      if (!target && thumbLink) {
        target = item.querySelector(
          ".contentRow-main > a[href*='/threads/'], .structItem-cell--main > a[href*='/threads/']",
        );
      }

      if (thumbLink && target) {
        thumbLink.setAttribute("data-gv-thumb", "true");
        target.parentNode.insertBefore(thumbLink, target);
      }

      item.setAttribute("data-processed", "true");
    });
  }

  function init() {
    const state = loadState();

    processThumbnails();

    // --- Category Toggle Logic ---
    const blocks = document.querySelectorAll(".block--category");
    blocks.forEach((block) => {
      const id = getCategoryId(block);
      if (!id) return;

      const header = block.querySelector(".block-header");
      if (!header) return;

      if (!header.querySelector(".sc-toggle")) {
        const toggle = document.createElement("span");
        toggle.className = "sc-toggle";
        toggle.textContent = "▾";

        const headerLink = header.querySelector("a");
        if (headerLink) {
          headerLink.insertAdjacentElement("afterend", toggle);
        } else {
          header.prepend(toggle);
        }
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

    // --- Sticky Threads Toggle Logic ---
    const stickyGroup = document.querySelector(
      ".structItemContainer-group--sticky",
    );
    if (stickyGroup && !document.querySelector(".sc-sticky-header")) {
      const header = document.createElement("div");
      header.className = "sc-sticky-header";

      const text = document.createElement("span");
      text.textContent = "Sticky Threads";

      const toggle = document.createElement("span");
      toggle.className = "sc-toggle";
      toggle.textContent = "▾";

      header.appendChild(toggle);
      header.appendChild(text);

      stickyGroup.parentNode.insertBefore(header, stickyGroup);

      if (state["sc_sticky_threads"] !== true) {
        header.classList.add("is-collapsed");
        stickyGroup.classList.add("is-collapsed");
      }

      header.addEventListener("click", () => {
        const isCollapsed = stickyGroup.classList.toggle("is-collapsed");
        header.classList.toggle("is-collapsed", isCollapsed);

        const current = loadState();
        if (!isCollapsed) {
          current["sc_sticky_threads"] = true;
        } else {
          delete current["sc_sticky_threads"];
        }
        saveState(current);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // 3. Dynamic Observer Loop
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldProcess = true;
        break;
      }
    }
    if (shouldProcess) processThumbnails();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
