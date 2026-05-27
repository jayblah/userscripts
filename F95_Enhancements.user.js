// ==UserScript==
// @name         F95 Layout Improvements
// @namespace    http://tampermonkey.net/
// @version      3.1.0
// @description  Adds developer/game search buttons (Steam only) and utility buttons to F95Zone threads.
// @author       FunkyJustin, TxHx (Merged by AI)
// @license      MIT
// @match        https://f95zone.to/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=f95zone.to
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/F95_Enhancements.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/F95_Enhancements.user.js
// @grant        GM_openInTab
// ==/UserScript==

(function () {
  "use strict";

  const UTILITY_BUTTONS = [
    { label: "Update", searchSuffix: " Update Only" },
    { label: "Compressed", searchSuffix: " Compressed" },
    { label: "Walkthrough", searchSuffix: " Walkthrough" },
    { label: "Mod", searchTerm: "Mod" },
    { label: "Cheats", searchSuffix: " Cheats" },
  ];

  // --- Styling ---
  const style = document.createElement("style");
  style.innerHTML = `
        .f95-combined-container {
            margin: 10px 0;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 10px;
            background: rgba(0,0,0,0.05);
            border-radius: 5px;
        }
        .f95-action-btn {
            cursor: pointer;
            padding: 6px 12px;
            font-size: 13px;
            color: #FFFFFF !important;
            border: none;
            border-radius: 3px;
            font-weight: bold;
            transition: opacity 0.2s;
        }
        .f95-action-btn:hover { opacity: 0.8; }
        .btn-main { background: linear-gradient(45deg, #1b2838, #2a475e); } /* Steam Color Scheme */
        .btn-util { background: #333; }
    `;
  document.head.appendChild(style);

  function extractGameTitle(element, developer) {
    let gameTitle = element.innerText
      .replace(/\[v\d+\.\d+(\.\d+)?\]/g, "")
      .trim();
    if (developer) gameTitle = gameTitle.replace(`[${developer}]`, "").trim();
    return gameTitle.trim();
  }

  function init() {
    if (!window.location.pathname.startsWith("/threads/")) return;
    const titleElement = document.querySelector(".p-title h1.p-title-value");
    if (!titleElement) return;

    const container = document.createElement("div");
    container.className = "f95-combined-container";

    const titleText = titleElement.innerText;
    const developerMatch = titleText.match(/\[([^\]]+)\]$/);
    const developer = developerMatch ? developerMatch[1] : null;
    const gameTitle = extractGameTitle(titleElement, developer);

    // 1. Steam Search Buttons
    if (developer) {
      const b = document.createElement("button");
      b.className = "f95-action-btn btn-main";
      b.innerText = "Search Dev on Steam";
      b.onclick = () =>
        window.open(
          `https://store.steampowered.com/search/?developer=${encodeURIComponent(developer)}`,
          "_blank",
        );
      container.appendChild(b);
    }

    const g = document.createElement("button");
    g.className = "f95-action-btn btn-main";
    g.innerText = "Search Game on Steam";
    g.onclick = () =>
      window.open(
        `https://store.steampowered.com/search/?term=${encodeURIComponent(gameTitle)}`,
        "_blank",
      );
    container.appendChild(g);

    // 2. Utility Buttons
    UTILITY_BUTTONS.forEach((cfg) => {
      const b = document.createElement("button");
      b.className = "f95-action-btn btn-util";
      b.innerText = cfg.label;
      b.onclick = () => {
        const searchInput = document.querySelector(".uix_searchInput");
        const searchBtn = document.querySelector(
          "button.button--primary.button--icon--search",
        );
        if (searchInput && searchBtn) {
          searchInput.value = cfg.searchTerm || gameTitle + cfg.searchSuffix;
          searchBtn.click();
        }
      };
      container.appendChild(b);
    });

    titleElement.parentElement.appendChild(container);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
