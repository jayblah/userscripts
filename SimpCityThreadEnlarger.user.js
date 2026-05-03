// ==UserScript==
// @name         SimpCity Move and Enlarge Thumbnails
// @version      1.1.1
// @description  Moves thread thumbnails to appear before the thread titles on SimpCity forums and makes them larger.
// @author       JR
// @license      MIT
// @match        *://simpcity.*/
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SimpCityThreadEnlarger.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SimpCityThreadEnlarger.user.js
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  /**
   * 1. Inject Global Styles
   * Using a single style block is more performant than per-element inline styles.
   */
  const injectStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
      /* Target the moved thumbnail links */
      .structItem--thread [data-gv-thumb],
      .block-row [data-gv-thumb] {
        width: 400px !important;
        height: 400px !important;
        display: block !important;
        margin-bottom: 10px !important;
        opacity: 1 !important;
      }

      /* Target the internal images */
      .structItem--thread [data-gv-thumb] img,
      .block-row [data-gv-thumb] img {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        filter: none !important;
        opacity: 1 !important;
        background-size: cover !important;
        background-position: center !important;
      }

      /* Fix for 1x1 placeholder pixels (the 'haze' fix) */
      .structItem--thread [data-gv-thumb] img[src*="base64"],
      .block-row [data-gv-thumb] img[src*="base64"] {
        object-position: -9999px !important;
      }
    `;
    document.head.appendChild(style);
  };

  /**
   * 2. Process Items
   * Handles the structural moving of elements.
   */
  function processItems() {
    const items = document.querySelectorAll(
      ".structItem--thread:not([data-processed]), .block-row:not([data-processed])",
    );

    if (items.length === 0) return;

    items.forEach((item) => {
      const thumbLink = item.querySelector(
        ".structItem-iconContainer a, .dcThumbnail",
      );
      const titleContainer = item.querySelector(
        ".structItem-title, .contentRow-title",
      );

      if (thumbLink && titleContainer) {
        // Tag the link so our CSS picks it up
        thumbLink.setAttribute("data-gv-thumb", "true");

        // Move the element
        titleContainer.parentNode.insertBefore(thumbLink, titleContainer);
      }

      // Mark as processed to prevent infinite loops
      item.setAttribute("data-processed", "true");
    });
  }

  // Initial Run
  injectStyles();
  processItems();

  /**
   * 3. Optimized Observer
   * Instead of a blind interval, we react to DOM changes.
   */
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldProcess = true;
        break;
      }
    }
    if (shouldProcess) processItems();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
