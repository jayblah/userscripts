// ==UserScript==
// @name         SC Layout Improvements
// @version      1.8
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
        .block--category.is-collapsed .sc-toggle {
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

        /* Hide the user avatars */
        li.alert .contentRow-figure {
            display: none !important;
        }

        /* Hide the timestamps and minor subtext */
        li.alert .contentRow-minor {
            display: none !important;
        }

        /* Hide the unread indicator dot and extra icons */
        li.alert .contentRow-extra {
            display: none !important;
        }

        /* Drastically reduce padding to make it a dense list */
        li.alert.menu-row {
            padding: 6px 12px !important;
            min-height: auto !important;
        }

        /* Ensure the main link uses the full space cleanly */
        li.alert .fauxBlockLink-blockLink {
            font-size: 13px !important;
            line-height: 1.4 !important;
            display: block !important;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
