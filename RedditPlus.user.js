// ==UserScript==
// @name             Reddit++ Mobile
// @description      Force-removes News, Explore, Games, Resources, and Best of. Adds post unwrapping, shadow-piercing highlights, and hides subreddit banners/stats/icons.
// @version          1.5.1
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-start
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// ==/UserScript==

(function () {
  "use strict";

  // 1. CSS for structural stability and high-speed hiding
  const style = document.createElement("style");
  style.textContent = `
        /* High-priority hide for the banner and icons */
        #subreddit-banner-img,
        #subreddit-icon-img,
        #subreddit-icon-img-desktop,
        .shreddit-subreddit-icon__icon {
            display: none !important;
            visibility: hidden !important;
            width: 0 !important;
            height: 0 !important;
        }

        /* Community Highlights - Force collapse by default */
        community-highlight-carousel:not([data-user-expanded="true"]) [slot="content"] {
            display: none !important;
        }

        /* Up Arrow (0deg) for collapsed, Down (180deg) for expanded */
        community-highlight-carousel:not([data-user-expanded="true"]) svg[icon-name="caret-up"] {
            transform: rotate(0deg) !important;
        }
        community-highlight-carousel[data-user-expanded="true"] [slot="content"] {
            display: block !important;
        }
        community-highlight-carousel[data-user-expanded="true"] svg[icon-name="caret-up"] {
            transform: rotate(180deg) !important;
        }

        /* AutoMod/Stickied comments visual reduction */
        shreddit-comment[author="AutoModerator"] {
            max-height: 50px;
            overflow: hidden;
            opacity: 0.8;
        }
    `;
  document.documentElement.appendChild(style);

  const removeWithSeparator = (element) => {
    if (!element) return;
    const prev = element.previousElementSibling;
    const next = element.nextElementSibling;
    const isSeparator = (el) =>
      el &&
      (el.tagName === "HR" ||
        el.classList.contains("border-neutral-border-weak") ||
        el.classList.contains("my-sm"));

    if (isSeparator(prev)) prev.remove();
    else if (isSeparator(next)) next.remove();
    element.remove();
  };

  const setupHighlightToggles = () => {
    const highlights = document.querySelectorAll(
      "community-highlight-carousel:not([data-processed])",
    );
    highlights.forEach((carousel) => {
      let btn = carousel.querySelector(
        'button[aria-label*="community highlights"]',
      );
      if (!btn && carousel.shadowRoot) {
        btn = carousel.shadowRoot.querySelector(
          'button[aria-label*="community highlights"]',
        );
      }

      if (btn) {
        carousel.setAttribute("data-processed", "true");
        carousel.setAttribute("data-user-expanded", "false");

        btn.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const current =
              carousel.getAttribute("data-user-expanded") === "true";
            carousel.setAttribute("data-user-expanded", !current);
          },
          true,
        );
      }
    });
  };

  const unwrapPosts = () => {
    const clippedPosts = document.querySelectorAll(
      'shreddit-post[view-type="cardView"] .truncated-content, shreddit-post[view-type="cardView"] .v2-truncated-content',
    );
    clippedPosts.forEach((post) => {
      post.style.maxHeight = "none";
      post.style.webkitLineClamp = "initial";
      post.style.display = "block";

      const readMore = post.querySelector(
        '.read-more-button, .show-more-button, [class*="read-more"]',
      );
      if (readMore) readMore.remove();
    });
  };

  const purgeLogic = () => {
    // 1. Subreddit Banner & Icon cleanup
    const banner = document.getElementById("subreddit-banner-img");
    if (banner) {
      const container = banner.closest(".\\@container");
      if (container) container.remove();
      else banner.remove();
    }

    const icons = ["subreddit-icon-img", "subreddit-icon-img-desktop"];
    icons.forEach((id) => {
      const icon = document.getElementById(id);
      if (icon) {
        // Remove the wrapping container that has the width/height defined
        const wrapper = icon.closest(".shrink-0");
        if (wrapper) wrapper.remove();
        else icon.remove();
      }
    });

    // 2. Weekly Stats cleanup (visitors and contributions)
    document
      .querySelectorAll("div.lowercase.text-neutral-content-weak")
      .forEach((el) => {
        if (
          el.textContent.includes("visitors") ||
          el.textContent.includes("contributions")
        ) {
          el.remove();
        }
      });

    // 3. Nav Drawer Cleanup
    const topSection = document.querySelector("left-nav-top-section");
    if (topSection) {
      ["news", "explore", "best"].forEach((attr) => {
        if (topSection.hasAttribute(attr)) topSection.removeAttribute(attr);
      });
    }

    // 4. Section Removal
    const specificTargets = [
      'faceplate-tracker[noun="games_drawer"]',
      'faceplate-tracker[noun="recommended_communities"]',
      'faceplate-tracker[noun="communities_drawer"]',
      'faceplate-tracker[noun="related_communities"]',
      "shreddit-related-communities",
    ];

    specificTargets.forEach((selector) => {
      document
        .querySelectorAll(selector)
        .forEach((item) => removeWithSeparator(item));
    });

    // 5. Expandable text sweep
    document
      .querySelectorAll("faceplate-expandable-section-helper")
      .forEach((el) => {
        const text = el.textContent.toLowerCase();
        if (
          text.includes("resources") ||
          text.includes("content policy") ||
          text.includes("recommended")
        ) {
          removeWithSeparator(el);
        }
      });

    setupHighlightToggles();
    unwrapPosts();
  };

  const observer = new MutationObserver(purgeLogic);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  purgeLogic();
})();
