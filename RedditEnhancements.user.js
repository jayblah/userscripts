// ==UserScript==
// @name            Reddit Enhancements
// @description     Nuking clutter and adding a built-in Lightbox/Zoom for images.
// @version         2.9.6
// @match           *://*.reddit.com/*
// @updateURL       https://raw.githubusercontent.com/jayblah/userscripts/main/RedditEnhancements.user.js
// @downloadURL     https://raw.githubusercontent.com/jayblah/userscripts/main/RedditEnhancements.user.js
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
    // Layout
    "#subreddit-banner-img",
    "shreddit-sidebar",
    "#right-sidebar-container",
    "aside:has(shreddit-sidebar)",
    "[grid-area='right-sidebar']",
    ".right-sidebar",
    // Nav clutter
    'faceplate-tracker[noun="games_drawer"]',
    "games-section-badge-controller",
    "#games_section",
    'faceplate-tracker[noun="resources_menu"]',
    "shreddit-related-communities",
    'details:has(summary[aria-controls="RESOURCES"])',
    "community-highlight-carousel",
    // User drawer clutter
    'faceplate-tracker[source="achievements"]',
    'faceplate-tracker[source="earn"]',
    'faceplate-tracker[noun="premium_menu"]',
    'faceplate-tracker[noun="advertise"]',
    'faceplate-tracker[noun="try_reddit_pro"]',
  ];

  // 1. GLOBAL CSS
  const globalStyle = document.createElement("style");
  globalStyle.textContent = `
    ${NUKE_SELECTORS.join(", ")} { display: none !important; }

    /* Hide award buttons in light DOM */
    award-button { display: none !important; }

    /* Hide HRs in user drawer and left nav */
    #user-drawer-content hr.bg-neutral-border-weak,
    #left-sidebar-container hr.border-neutral-border-weak,
    flex-left-nav-container hr.border-neutral-border-weak {
      display: none !important;
    }

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

    /* Collapse All Button */
    .pp_collapse_btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 0 12px;
      font-size: 14px; font-weight: 600; font-family: inherit;
      color: var(--color-neutral-content-weak);
      background: transparent;
      border: 1px solid var(--color-neutral-border-weak);
      border-radius: 99px; cursor: pointer;
      height: var(--size-button-sm-h, 32px);
      transition: background 0.15s, color 0.15s;
      user-select: none; white-space: nowrap;
    }
    .pp_collapse_btn:hover {
      background: var(--color-neutral-background-hover);
      color: var(--color-neutral-content-strong);
    }
    .pp_collapse_btn.pp_collapsed {
      color: var(--color-interactive-default, #0079d3);
      border-color: var(--color-interactive-default, #0079d3);
    }
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
  let allCollapsed = false;

  const Actions = {
    deepQuery: (root, selector) => {
      const found = root.querySelector(selector);
      if (found) return found;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const result = Actions.deepQuery(el.shadowRoot, selector);
          if (result) return result;
        }
      }
      return null;
    },

    deepQueryAll: (root, selector, results = []) => {
      root.querySelectorAll(selector).forEach((el) => results.push(el));
      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot)
          Actions.deepQueryAll(el.shadowRoot, selector, results);
      });
      return results;
    },

    injectCollapseButton: () => {
      if (!window.location.href.includes("/comments/")) return;
      if (Actions.deepQuery(document, ".pp_collapse_btn")) return;

      const commentsBtn = Actions.deepQuery(
        document,
        'button[name="comments-action-button"]',
      );
      if (!commentsBtn) return;

      const shadowHost = commentsBtn.getRootNode();
      if (shadowHost && shadowHost !== document) {
        const styleEl = document.createElement("style");
        styleEl.textContent = `
          .pp_collapse_btn {
            display: inline-flex; align-items: center;
            padding: 0 12px;
            font-size: 14px; font-weight: 600; font-family: inherit;
            color: var(--color-neutral-content-weak);
            background: transparent;
            border: 1px solid var(--color-neutral-border-weak);
            border-radius: 99px; cursor: pointer;
            height: var(--size-button-sm-h, 32px);
            transition: background 0.15s, color 0.15s;
            user-select: none; white-space: nowrap;
          }
          .pp_collapse_btn:hover {
            background: var(--color-neutral-background-hover);
            color: var(--color-neutral-content-strong);
          }
          .pp_collapse_btn.pp_collapsed {
            color: var(--color-interactive-default, #0079d3);
            border-color: var(--color-interactive-default, #0079d3);
          }
        `;
        shadowHost.appendChild(styleEl);
      }

      const btn = document.createElement("button");
      btn.className = "pp_collapse_btn";
      btn.textContent = "− Collapse";
      btn.title = "Collapse or expand all reply threads";

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const children = document.querySelectorAll(
          "shreddit-comment[depth]:not([depth='0'])",
        );
        if (!children.length) return;

        allCollapsed = !allCollapsed;
        children.forEach((c) => {
          if (allCollapsed) c.setAttribute("collapsed", "");
          else c.removeAttribute("collapsed");
        });

        btn.textContent = allCollapsed ? "+ Expand" : "− Collapse";
        btn.classList.toggle("pp_collapsed", allCollapsed);
      });

      commentsBtn.insertAdjacentElement("afterend", btn);
    },

    nukeAwardButtons: () => {
      Actions.deepQueryAll(document, "award-button").forEach((el) => {
        el.style.display = "none";
      });
    },

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
            comment.setAttribute("collapsed", "");
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
    Actions.nukeAwardButtons();
    Actions.processComments();
    Actions.injectCollapseButton();
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
