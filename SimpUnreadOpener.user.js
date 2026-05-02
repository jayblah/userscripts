// ==UserScript==
// @name         SimpCity - Open Unread Alerts in Tabs
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Adds a button next to "Alerts" to open all unread alerts in new tabs with a delay to prevent rate limiting.
// @author       bitter.beer
// @match        https://simpcity.cr/*
// @match        https://simpcity.is/*
// @match        https://simpcity.cz/*
// @match        https://simpcity.hk/*
// @match        https://simpcity.rs/*
// @match        https://simpcity.ax/*
// @grant        GM_openInTab
// @connect      simpcity.cr
// @connect      simpcity.is
// @connect      simpcity.cz
// @connect      simpcity.hk
// @connect      simpcity.rs
// @connect      simpcity.ax
// @run-at       document-idle
// @license      MIT
// @downloadURL https://update.sleazyfork.org/scripts/556830/SimpCity%20-%20Open%20Unread%20Alerts%20in%20Tabs.user.js
// @updateURL https://update.sleazyfork.org/scripts/556830/SimpCity%20-%20Open%20Unread%20Alerts%20in%20Tabs.meta.js
// ==/UserScript==

(function () {
  "use strict";

  // ===== CONFIG =====
  const OPEN_DELAY_MS = 3000;
  const MAX_TO_OPEN = null;

  // ===== STATE =====
  let isProcessing = false;

  /**
   * Helper to wait for a specific duration
   */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Find unread alert links
   */
  function getUnreadAlertLinks() {
    return Array.from(
      document.querySelectorAll(
        ".js-alertsMenuBody li.alert.is-unread .fauxBlockLink-blockLink",
      ),
    );
  }

  /**
   * Main execution logic
   */
  async function openUnreadAlerts(button) {
    if (isProcessing) return;

    const links = getUnreadAlertLinks();
    if (!links.length) {
      console.log("SimpCity: No unread alerts found.");
      return;
    }

    isProcessing = true;
    const originalText = button.textContent;
    const totalToOpen = MAX_TO_OPEN
      ? Math.min(MAX_TO_OPEN, links.length)
      : links.length;

    for (let i = 0; i < totalToOpen; i++) {
      const link = links[i];
      if (!link?.href) continue;

      // Update button UI to show progress
      button.textContent = `Opening (${i + 1}/${totalToOpen})...`;

      try {
        if (typeof GM_openInTab === "function") {
          GM_openInTab(link.href, {
            active: false,
            insert: true,
            setParent: true,
          });
        } else {
          window.open(link.href, "_blank");
        }
      } catch (e) {
        console.error("SimpCity: Failed to open alert tab:", e);
      }

      // Wait if there are more links to open
      if (i < totalToOpen - 1) {
        await sleep(OPEN_DELAY_MS);
      }
    }

    button.textContent = originalText;
    isProcessing = false;

    // Refresh the UI state after processing
    updateAlertsHeaders();
  }

  /**
   * Create or update the button
   */
  function ensureUnreadButton(headerEl) {
    if (!headerEl || headerEl.querySelector("[data-unread-open-btn]")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Open Unread";
    btn.title = "Open unread alerts with delay";
    btn.setAttribute("data-unread-open-btn", "1");

    // Using Object.assign for cleaner style application
    Object.assign(btn.style, {
      marginLeft: "0.5em",
      fontSize: "0.85em",
      cursor: "pointer",
      padding: "2px 8px",
      borderRadius: "4px",
      border: "1px solid rgba(255,255,255,0.2)",
      background: "hsla(187, 73%, 52%, 0.4)",
      color: "#fff",
      transition: "background 0.2s",
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openUnreadAlerts(btn);
    });

    headerEl.appendChild(btn);
  }

  /**
   * Update all relevant headers
   */
  function updateAlertsHeaders() {
    const unreadCount = getUnreadAlertLinks().length;
    const headers = document.querySelectorAll("h3.menu-header");

    headers.forEach((h3) => {
      if (h3.textContent.trim().includes("Alerts")) {
        const existingBtn = h3.querySelector("[data-unread-open-btn]");
        if (unreadCount > 0) {
          ensureUnreadButton(h3);
        } else if (existingBtn && !isProcessing) {
          existingBtn.remove();
        }
      }
    });
  }

  // ===== INITIALIZE & OBSERVE =====

  // Optimized MutationObserver
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        shouldUpdate = true;
        break;
      }
    }
    if (shouldUpdate) updateAlertsHeaders();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial run
  updateAlertsHeaders();

  // Listen for the "SC_TAB_LOADED" message for backward compatibility
  // with your adaptive logic if desired, though async/await sleep is more reliable.
  window.addEventListener("message", (e) => {
    if (e.data?.type === "SC_TAB_LOADED" && window.opener) {
      // Logic handled by async loop now, but kept for handshake integrity
      console.log("SimpCity: Child tab loaded successfully.");
    }
  });

  // Self-identify to parent if opened via script
  if (window.opener) {
    window.addEventListener(
      "load",
      () => {
        try {
          window.opener.postMessage({ type: "SC_TAB_LOADED" }, "*");
        } catch (err) {}
      },
      { once: true },
    );
  }
})();
