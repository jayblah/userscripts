// ==UserScript==
// @name         SC Layout Improvements
// @version      2.1
// @match        https://simpcity.su/*
// @match        https://simpcity.cr/*
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SCLayoutImprovements.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SCLayoutImprovements.user.js
// ==/UserScript==

(function () {
  "use strict";
  GM_addStyle(`
        /* --- Existing Layout Improvements --- */
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
        /* Hide meta and latest columns */
        .structItem-cell.structItem-cell--meta,
        .structItem-cell.structItem-cell--latest {
            display: none !important;
        }

        /* 1. Hide the cell and remove its borders/padding */
        .structItem-cell.structItem-cell--iconEnd {
            display: none !important;
        }

        /* 2. Force the icon cell to be a clean flex-center box */
        .structItem-cell.structItem-cell--icon {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            padding: 0 !important;        /* Removes the lines/padding */
            border: none !important;      /* Kills the faint lines */
            width: 90px !important;
            flex: 0 0 90px !important;
        }

        /* 3. Hide all avatars inside icon containers to clean up the look */
        .structItem-iconContainer .avatar {
            display: none !important;
        }

        /* 4. Kill the container borders that might be causing the lines */
        .structItem--thread {
            border-bottom: 1px solid rgba(255,255,255,0.05) !important;
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

  function init() {
    const state = loadState();

    // --- 1. Category Toggle Logic ---
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

    // --- 2. Sticky Threads Toggle Logic ---
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
})();
