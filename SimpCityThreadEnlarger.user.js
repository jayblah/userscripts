// ==UserScript==
// @name         SimpCity Move and Enlarge Thumbnails
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Moves thread thumbnails to appear before the thread titles on SimpCity forums and makes them larger.
// @author       JR
// @match        https://simpcity.cr/*
// @grant        none
// @license      MIT
// @downloadURL https://update.sleazyfork.org/scripts/551739/SimpCity%20Move%20and%20Enlarge%20Thumbnails%20Before%20Titles%20in%20Threads.user.js
// @updateURL https://update.sleazyfork.org/scripts/551739/SimpCity%20Move%20and%20Enlarge%20Thumbnails%20Before%20Titles%20in%20Threads.meta.js
// ==/UserScript==

(function () {
  "use strict";

  function processItems() {
    const items = document.querySelectorAll(
      ".structItem--thread:not([data-processed]), .block-row:not([data-processed])",
    );

    items.forEach((item) => {
      const thumbLink = item.querySelector(
        ".structItem-iconContainer a, .dcThumbnail",
      );
      const titleContainer = item.querySelector(
        ".structItem-title, .contentRow-title",
      );

      if (thumbLink && titleContainer) {
        // Style the container link
        thumbLink.style.setProperty("width", "400px", "important");
        thumbLink.style.setProperty("height", "400px", "important");
        thumbLink.style.display = "block";
        thumbLink.style.marginBottom = "10px";
        thumbLink.style.setProperty("opacity", "1", "important");

        const innerImg = thumbLink.querySelector("img");
        if (innerImg) {
          innerImg.style.setProperty("width", "100%", "important");
          innerImg.style.setProperty("height", "100%", "important");
          innerImg.style.setProperty("background-size", "cover", "important");
          innerImg.style.setProperty(
            "background-position",
            "center",
            "important",
          );
          innerImg.style.setProperty("object-fit", "cover", "important");

          // Remove filters/haze and ensure full brightness
          innerImg.style.setProperty("filter", "none", "important");
          innerImg.style.setProperty("opacity", "1", "important");

          // This is the specific fix: hide the 1x1 placeholder pixel
          // while keeping the background-image visible.
          if (innerImg.src.includes("base64")) {
            innerImg.style.setProperty(
              "object-position",
              "-9999px",
              "important",
            );
          }
        }

        titleContainer.parentNode.insertBefore(thumbLink, titleContainer);
      }

      item.setAttribute("data-processed", "true");
    });
  }

  processItems();

  const observer = new MutationObserver(() => {
    processItems();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
