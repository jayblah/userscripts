// The redditPlus repository is a comprehensive suite of enhancements designed to customize the Reddit experience. Based on the codebase, the features are organized into several core categories:
// UI & Layout Enhancements

//     Navigation Cleanup: Removes specific sidebar elements, including the "Best of Reddit" section and the "Popular Communities" list.

//     Feed Customization: Includes options to hide the "Create Post" bar and the "Recent Posts" section.

//     Media Adjustments: Allows for the resizing of images within the feed to maintain a consistent UI.

//     Promoted Content: Features logic specifically designed to identify and hide promoted (advertisement) posts.

// Functional Tools

//     Scroll Management: Adds a "Back to Top" button for easier navigation on long threads or feeds.

//     Post Decoding: Includes a utility for decoding specific encoded strings often found in post titles or bodies (like Base64 or Multi-Code).

//     User Highlighting: Provides visual cues to distinguish the Original Poster (OP) or specific users within comment sections.

//     Filtering: Advanced logic to filter posts based on keywords, domains, or subreddits.

// System & Integration

//     Integrated Settings Menu: Injects a custom configuration panel directly into the Reddit header, allowing you to toggle features on or off without editing code.

//     Data Persistence: Uses browser storage to save your specific layout and filtering preferences.

//     Dynamic Loading: Utilizes a MutationObserver to ensure features are applied to new posts as they are loaded via infinite scroll.

// Development Framework

//     Modular Architecture: The repo is built using a modular structure where each feature (e.g., "Hiding Promoted Posts" or "Decoding") is its own isolated file for easier maintenance.

//     Build Pipeline: Uses Webpack to bundle these modules into a single, functional userscript
// ==UserScript==
// @name             Reddit++ Mobile
// @description      Force-removes News, Explore, Games, Resources, and Best of from mobile nav.
// @version          1.2.3
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-start
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// ==/UserScript==

(function () {
  "use strict";

  const purgeLogic = () => {
    // 1. Target the Top Section attributes (News/Explore/Best)
    const topSection = document.querySelector("left-nav-top-section");
    if (topSection) {
      if (topSection.hasAttribute("news")) topSection.removeAttribute("news");
      if (topSection.hasAttribute("explore"))
        topSection.removeAttribute("explore");
      if (topSection.hasAttribute("best")) topSection.removeAttribute("best");
    }

    // 2. Target Games section by its tracker noun
    const games = document.querySelector(
      'faceplate-tracker[noun="games_drawer"]',
    );
    if (games) {
      removeWithSeparator(games);
    }

    // 3. Target Resources and Content Policy by text content inside expandable helpers
    const helpers = document.querySelectorAll(
      "faceplate-expandable-section-helper",
    );
    helpers.forEach((helper) => {
      const text = helper.textContent.toLowerCase();
      if (text.includes("resources") || text.includes("content policy")) {
        removeWithSeparator(helper);
      }
    });
  };

  const removeWithSeparator = (element) => {
    // Remove adjacent HR or separator-classed lines[cite: 1]
    const prev = element.previousElementSibling;
    const next = element.nextElementSibling;

    if (
      prev &&
      (prev.tagName === "HR" ||
        prev.classList.contains("border-neutral-border-weak"))
    ) {
      prev.remove();
    } else if (
      next &&
      (next.tagName === "HR" ||
        next.classList.contains("border-neutral-border-weak"))
    ) {
      next.remove();
    }
    element.remove();
  };

  // Use a high-frequency observer to catch the menu content as it is injected[cite: 1]
  const observer = new MutationObserver(() => {
    purgeLogic();
  });

  // Observe the entire document to ensure we catch elements inside various faceplate-loaders[cite: 1]
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Execute immediately and on DOMContentLoaded
  purgeLogic();
  window.addEventListener("DOMContentLoaded", purgeLogic);
})();
