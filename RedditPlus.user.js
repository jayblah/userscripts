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
// @version          1.2.0
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-idle
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/LeakFinder.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/LeakFinder.user.js
// ==/UserScript==

(function () {
  "use strict";

  // List of hrefs and labels to kill
  const targets = [
    "/topic/news/", // News
    "/recap/", // Explore
    "/gaming/", // Games
    "/best/", // Best of Reddit
    "content-policy", // Content Policy
  ];

  const labels = ["Explore", "Games", "Resources", "News"];

  const cleanNav = () => {
    // 1. Target by href
    targets.forEach((link) => {
      const elements = document.querySelectorAll(
        `shreddit-nav-item[href*="${link}"], a[href*="${link}"]`,
      );
      elements.forEach((el) => el.closest("li")?.remove() || el.remove());
    });

    // 2. Target by text content/attributes
    labels.forEach((text) => {
      const elements = document.querySelectorAll(
        `shreddit-nav-item[content="${text}"]`,
      );
      elements.forEach((el) => el.closest("li")?.remove() || el.remove());
    });

    // 3. Target specific IDs and containers
    const extras = [
      "#more-info-accordion-content",
      'faceplate-tracker[source="content_policy_menu"]',
      'shreddit-nav-item[content="Resources"]',
    ];

    extras.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        // Remove the parent <li> to ensure the spacing is cleaned up too
        el.closest("li")?.remove() || el.remove();
      });
    });
  };

  // Run immediately
  cleanNav();

  // Run every time the user opens the side menu or scrolls
  const observer = new MutationObserver(() => {
    cleanNav();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
