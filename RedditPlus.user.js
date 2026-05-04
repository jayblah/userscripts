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
// @description      Removes specific mobile navigation menu items.
// @version          1.1.0
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-start
// ==/UserScript==

(function () {
  "use strict";

  const style = document.createElement("style");
  style.innerHTML = `
        /* Target navigation items by their internal href or label content */

        /* News */
        shreddit-nav-item[href="/topic/news/"],

        /* Explore */
        shreddit-nav-item[href="/recap/"],
        shreddit-nav-item[content="Explore"],

        /* Games on Reddit */
        shreddit-nav-item[href="/gaming/"],
        shreddit-nav-item[content="Games"],

        /* Resources */
        #more-info-accordion-content,
        shreddit-nav-item[content="Resources"],

        /* Best of Reddit */
        shreddit-nav-item[href="/best/"],

        /* Content Policy Menu */
        shreddit-nav-item[href*="content-policy"],
        a[href*="content-policy"] {
            display: none !important;
        }

        /* General cleanup for the content policy menu container */
        faceplate-tracker[source="content_policy_menu"] {
            display: none !important;
        }
    `;
  document.head.appendChild(style);
})();
