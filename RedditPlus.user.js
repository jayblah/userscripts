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
// @version          1.2.1
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-idle
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/LeakFinder.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/LeakFinder.user.js
// ==/UserScript==

(function () {
  "use strict";

  const purgeRedditNav = () => {
    // 1. Target "Games on Reddit" via its specific tracker noun
    const gamesSection = document.querySelector(
      'faceplate-tracker[noun="games_drawer"]',
    );
    if (gamesSection) gamesSection.remove();

    // 2. Target "News" and "Explore" via the top section attributes
    const topSection = document.querySelector("left-nav-top-section");
    if (topSection) {
      // These are handled as attributes in your DOM
      topSection.removeAttribute("news");
      topSection.removeAttribute("explore");

      // If they are rendered as links inside, find and kill them
      topSection
        .querySelectorAll('a[href*="/topic/news/"], a[href*="/recap/"]')
        .forEach((el) => {
          el.closest("li")?.remove() || el.remove();
        });
    }

    // 3. Target "Resources" and "Content Policy"
    // In the mobile DOM, these are often inside faceplate-expandable-section-helper
    document
      .querySelectorAll("faceplate-expandable-section-helper")
      .forEach((section) => {
        const text = section.textContent.toLowerCase();
        if (text.includes("resources") || text.includes("content policy")) {
          section.remove();
        }
      });

    // 4. Cleanup any lingering HR (separators) that become redundant
    document.querySelectorAll("hr").forEach((hr) => {
      if (hr.nextElementSibling?.tagName === "HR" || !hr.nextElementSibling) {
        hr.remove();
      }
    });
  };

  // Use a robust observer to catch elements as they are lazy-loaded
  const observer = new MutationObserver((mutations) => {
    purgeRedditNav();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial run
  purgeRedditNav();
})();
