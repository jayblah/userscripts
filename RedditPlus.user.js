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
// @version          1.2.2
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-idle
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// ==/UserScript==

(function () {
  "use strict";

  const purgeWithSeparators = (selector) => {
    const element = document.querySelector(selector);
    if (element) {
      // Check for a separator immediately before or after the element
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
    }
  };

  const runPurge = () => {
    // 1. Target specific tracked sections and their lines[cite: 1]
    purgeWithSeparators('faceplate-tracker[noun="games_drawer"]');

    // 2. Target Expandable sections (Resources/Policy) and their lines[cite: 1]
    document
      .querySelectorAll("faceplate-expandable-section-helper")
      .forEach((section) => {
        const text = section.textContent.toLowerCase();
        if (text.includes("resources") || text.includes("content policy")) {
          // Remove the section and its adjacent line[cite: 1]
          purgeWithSeparators(
            `faceplate-expandable-section-helper:nth-of-type(${[...section.parentNode.children].indexOf(section) + 1})`,
          );
        }
      });

    // 3. Clean up the top section attributes[cite: 1]
    const topSection = document.querySelector("left-nav-top-section");
    if (topSection) {
      topSection.removeAttribute("news");
      topSection.removeAttribute("explore");
      topSection.removeAttribute("best");
    }

    // 4. Final Sweep: Remove double separators or separators at the very end of a section[cite: 1]
    document
      .querySelectorAll("hr, .border-neutral-border-weak")
      .forEach((hr) => {
        const next = hr.nextElementSibling;
        // Remove if it's a double line or if it's the last thing in the container[cite: 1]
        if (
          (next &&
            (next.tagName === "HR" ||
              next.classList.contains("border-neutral-border-weak"))) ||
          !next
        ) {
          hr.remove();
        }
      });
  };

  // Use a robust observer to catch elements as they are lazy-loaded[cite: 1]
  const observer = new MutationObserver(() => {
    runPurge();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial run
  runPurge();
})();
