// ==UserScript==
// @name            Reddit Mobile
// @description     Nuking clutter and adding a built-in Lightbox/Zoom for images.
// @version         2.8.0
// @match           *://*.reddit.com/*
// @updateURL       https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// @downloadURL     https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// @grant           none
// @run-at          document-start
// ==/UserScript==

(function () {
  "use strict";

  const COLORS = [
    "#4CAF50",
    "#1E88DB",
    "#FF9800",
    "#B650C7",
    "#F44336",
    "#3ABAA2",
  ];

  const NUKE_SELECTORS = [
    "#subreddit-banner-img",
    "shreddit-sidebar",
    "#right-sidebar-container",
    "aside:has(shreddit-sidebar)",
    'faceplate-tracker[noun="games_drawer"]',
    "games-section-badge-controller",
    "#games_section",
    "award-button",
    'faceplate-tracker[noun="resources_menu"]',
    "shreddit-related-communities",
    'details:has(summary[aria-controls="RESOURCES"])',
    "community-highlight-carousel",
  ];

  // 1. GLOBAL CSS
  const globalStyle = document.createElement("style");
  globalStyle.textContent = `
        ${NUKE_SELECTORS.join(", ")} { display: none !important; }
        [grid-area="right-sidebar"], .right-sidebar { display: none !important; }

        /* Image Zoom / Lightbox */
        .pp_imageViewable { cursor: zoom-in !important; }
        #pp_lightbox {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 999999;
            display: none; justify-content: center; align-items: center; cursor: zoom-out;
        }
        #pp_lightbox img { max-width: 95%; max-height: 95%; box-shadow: 0 0 20px rgba(0,0,0,0.5); }

        /* Post Expansion */
        .pp_post_noWrap { max-height: none !important; display: block !important; }
        .pp_post_unwrapContainer {
            width: 100%; display: flex; justify-content: center; padding: 12px 0;
            cursor: pointer; background: linear-gradient(transparent, rgba(0,0,0,0.05));
            border-bottom: 1px solid var(--color-neutral-border-weak);
        }
        .pp_post_unwrapButton { font-weight: bold; color: var(--color-interactive-default); }
    `;
  document.documentElement.appendChild(globalStyle);

  // 2. LIGHTBOX DOM
  const lightbox = document.createElement("div");
  lightbox.id = "pp_lightbox";
  const lightboxImg = document.createElement("img");
  lightbox.append(lightboxImg);
  lightbox.onclick = () => (lightbox.style.display = "none");

  const attachLightbox = () => {
    if (!document.getElementById("pp_lightbox"))
      document.body?.append(lightbox);
  };

  // 3. LOGIC MODULES
  const Actions = {
    nuke: () => {
      document
        .querySelectorAll(NUKE_SELECTORS.join(", "))
        .forEach((el) => el.remove());

      const nav = document.querySelector("left-nav-top-section");
      if (nav) {
        ["news", "explore"].forEach((attr) => nav.removeAttribute(attr));
        nav.shadowRoot
          ?.querySelectorAll('a[href="/news/"], a[href="/explore/"]')
          .forEach((link) => (link.closest("li") || link).remove());
      }
    },

    handleImages: (post) => {
      post
        .querySelectorAll("faceplate-img, img:not(.pp_imageViewable)")
        .forEach((imgEl) => {
          if (imgEl.classList.contains("pp_imageViewable")) return;
          imgEl.classList.add("pp_imageViewable");

          imgEl.addEventListener(
            "click",
            (e) => {
              let src =
                imgEl.getAttribute("src") ||
                imgEl.querySelector("img")?.getAttribute("src");
              if (src) {
                e.preventDefault();
                e.stopPropagation();
                attachLightbox();
                lightboxImg.src = src.replaceAll("&amp;", "&");
                lightbox.style.display = "flex";
              }
            },
            true,
          );
        });
    },

    processComments: () => {
      document
        .querySelectorAll("shreddit-comment:not([pp-checked])")
        .forEach((comment) => {
          comment.setAttribute("pp-checked", "true");

          if (comment.getAttribute("author") === "AutoModerator") {
            comment.setAttribute("collapsed", "true");
          }

          const shadow = comment.shadowRoot;
          if (shadow && !shadow.querySelector(".pp-line-style")) {
            const depth = parseInt(comment.getAttribute("depth") || 0);
            const color = COLORS[depth % COLORS.length];

            const style = document.createElement("style");
            style.className = "pp-line-style";
            style.textContent = `
                        div[data-testid="main-thread-line"],
                        div[data-testid="branch-line"] {
                            border-left: 2px solid ${color} !important;
                            opacity: 1 !important;
                        }
                    `;
            shadow.appendChild(style);
          }
        });
    },
  };

  // 4. OBSERVER
  const observer = new MutationObserver(() => {
    Actions.nuke();
    Actions.processComments();
    document
      .querySelectorAll("shreddit-post")
      .forEach((post) => Actions.handleImages(post));
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachLightbox);
  } else {
    attachLightbox();
  }
})();
