// ==UserScript==
// @name            Reddit Enhancements
// @description     Nuking clutter and adding a built-in Lightbox/Zoom for images with mousewheel navigation.
// @version         3.1.2
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
    "#subreddit-banner-img",
    "shreddit-sidebar",
    "#right-sidebar-container",
    "aside:has(shreddit-sidebar)",
    "[grid-area='right-sidebar']",
    ".right-sidebar",
    'faceplate-tracker[noun="games_drawer"]',
    "games-section-badge-controller",
    "#games_section",
    'faceplate-tracker[noun="resources_menu"]',
    "shreddit-related-communities",
    'details:has(summary[aria-controls="RESOURCES"])',
    "community-highlight-carousel",
    'faceplate-tracker[source="achievements"]',
    'faceplate-tracker[source="earn"]',
    'faceplate-tracker[noun="premium_menu"]',
    'faceplate-tracker[noun="advertise"]',
    'faceplate-tracker[noun="try_reddit_pro"]',
    "search-telemetry-tracker:has(search-answers-response-container-streaming)",
    "search-answers-response-container-streaming",
  ];

  const NUKE_SELECTOR_STRING = NUKE_SELECTORS.join(", ");

  // 1. GLOBAL CSS
  const globalStyle = document.createElement("style");
  globalStyle.textContent = `
    ${NUKE_SELECTOR_STRING} { display: none !important; }

    award-button, shreddit-slot[slot="award-button"] { display: none !important; }

    #user-drawer-content hr.bg-neutral-border-weak,
    #left-sidebar-container hr.border-neutral-border-weak,
    flex-left-nav-container hr.border-neutral-border-weak {
      display: none !important;
    }

    .pp_imageViewable { cursor: zoom-in !important; }
    #pp_lightbox {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.9); z-index: 999999;
      display: none; justify-content: center; align-items: center; cursor: zoom-out;
      user-select: none;
    }
    #pp_lightbox img { max-width: 95%; max-height: 95%; box-shadow: 0 0 20px rgba(0,0,0,0.5); pointer-events: none; }

    .pp_nav_btn {
      position: absolute; top: 50%; transform: translateY(-50%);
      background: rgba(255,255,255,0.1); color: white; border: none;
      font-size: 28px; cursor: pointer; border-radius: 4px;
      transition: background 0.2s; z-index: 1000000; display: none;
      box-sizing: border-box; height: 60px; width: 60px;
      display: flex; justify-content: center; align-items: center;
      padding: 0; line-height: 1;
    }
    .pp_nav_btn:hover { background: rgba(255,255,255,0.25); }
    #pp_nav_prev { left: 20px; }
    #pp_nav_next { right: 20px; }
    #pp_gallery_counter {
      position: absolute; bottom: 20px; color: rgba(255,255,255,0.7);
      font-family: sans-serif; font-size: 14px; background: rgba(0,0,0,0.5);
      padding: 4px 12px; border-radius: 12px; display: none;
    }

    .pp_post_noWrap { max-height: none !important; display: block !important; }
    .pp_post_unwrapContainer {
      width: 100%; display: flex; justify-content: center; padding: 12px 0;
      cursor: pointer; background: linear-gradient(transparent, rgba(0,0,0,0.05));
      border-bottom: 1px solid var(--color-neutral-border-weak);
    }
    .pp_post_unwrapButton { font-weight: bold; color: var(--color-interactive-default); }

    .pp_collapse_btn {
      display: inline-flex; align-items: center; gap: 4px; padding: 0 12px;
      font-size: 14px; font-weight: 600; font-family: inherit;
      color: #eeefef !important; background: #2a3236 !important;
      border: 1px solid #2a3236 !important; border-radius: 99px; cursor: pointer;
      height: var(--size-button-sm-h, 32px); transition: background 0.15s, border-color 0.15s;
      user-select: none; white-space: nowrap;
    }
    .pp_collapse_btn:hover { background: #3a454a !important; border-color: #3a454a !important; }
    .pp_collapse_btn.pp_collapsed { opacity: 0.85; }
  `;
  document.documentElement.appendChild(globalStyle);

  // 2. LIGHTBOX DOM & GALLERY STATE
  let currentGalleryImages = [];
  let currentGalleryIndex = 0;
  let lastWheelTime = 0;

  const lightbox = document.createElement("div");
  lightbox.id = "pp_lightbox";

  const lightboxImg = document.createElement("img");
  const prevBtn = document.createElement("button");
  prevBtn.id = "pp_nav_prev";
  prevBtn.className = "pp_nav_btn";
  prevBtn.innerHTML = "&#10094;";

  const nextBtn = document.createElement("button");
  nextBtn.id = "pp_nav_next";
  nextBtn.className = "pp_nav_btn";
  nextBtn.innerHTML = "&#10095;";

  const counter = document.createElement("div");
  counter.id = "pp_gallery_counter";

  lightbox.append(lightboxImg, prevBtn, nextBtn, counter);

  const updateLightboxImage = () => {
    if (!currentGalleryImages.length) return;
    const src = currentGalleryImages[currentGalleryIndex];
    lightboxImg.src = src.replaceAll("&amp;", "&");

    if (currentGalleryImages.length > 1) {
      prevBtn.style.display = "flex";
      nextBtn.style.display = "flex";
      counter.style.display = "block";
      counter.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
    } else {
      prevBtn.style.display = "none";
      nextBtn.style.display = "none";
      counter.style.display = "none";
    }
  };

  const navigateGallery = (direction) => {
    if (!currentGalleryImages.length) return;
    currentGalleryIndex =
      (currentGalleryIndex + direction + currentGalleryImages.length) %
      currentGalleryImages.length;
    updateLightboxImage();
  };

  lightbox.onclick = (e) => {
    if (e.target === lightbox) lightbox.style.display = "none";
  };

  prevBtn.onclick = (e) => {
    e.stopPropagation();
    navigateGallery(-1);
  };
  nextBtn.onclick = (e) => {
    e.stopPropagation();
    navigateGallery(1);
  };

  window.addEventListener(
    "keydown",
    (e) => {
      if (lightbox.style.display === "flex") {
        const code = e.code;
        if (code === "ArrowRight" || code === "KeyD") {
          e.preventDefault();
          e.stopPropagation();
          navigateGallery(1);
        } else if (code === "ArrowLeft" || code === "KeyA") {
          e.preventDefault();
          e.stopPropagation();
          navigateGallery(-1);
        } else if (code === "Escape" || code === "KeyW") {
          e.preventDefault();
          e.stopPropagation();
          lightbox.style.display = "none";
        }
      }
    },
    true,
  );

  // SHADOW-DOM BOUND SEARCH ROUTING RESCUE
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        const path = e.composedPath();
        const input = path.find(
          (el) =>
            el.tagName === "INPUT" && (el.name === "q" || el.type === "search"),
        );

        if (input) {
          const query = input.value ? input.value.trim() : "";
          if (query) {
            e.preventDefault();
            e.stopImmediatePropagation();
            window.location.assign(`/search/?q=${encodeURIComponent(query)}`);
          }
        }
      }
    },
    { capture: true },
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (lightbox.style.display === "flex") {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastWheelTime < 150) return;

        if (e.deltaY > 0) {
          navigateGallery(1);
          lastWheelTime = now;
        } else if (e.deltaY < 0) {
          navigateGallery(-1);
          lastWheelTime = now;
        }
      }
    },
    { passive: false, capture: true },
  );

  const attachLightbox = () => {
    if (!document.getElementById("pp_lightbox"))
      document.body?.append(lightbox);
  };

  // 3. LOGIC MODULES
  let allCollapsed = false;

  const Actions = {
    // Restored deep query loop to ensure nested containers are traversed correctly
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

      const commentsBtn = Actions.deepQuery(
        document,
        'button[name="comments-action-button"]',
      );
      if (!commentsBtn || commentsBtn.hasAttribute("pp-has-sibling-btn"))
        return;

      const shadowHost = commentsBtn.getRootNode();
      if (shadowHost && shadowHost !== document) {
        const styleEl = document.createElement("style");
        styleEl.textContent = `
          .pp_collapse_btn {
            display: inline-flex; align-items: center; padding: 0 12px;
            font-size: 14px; font-weight: 600; font-family: inherit;
            color: #eeefef !important; background: #2a3236 !important;
            border: 1px solid #2a3236 !important; border-radius: 99px; cursor: pointer;
            height: var(--size-button-sm-h, 32px); transition: background 0.15s, border-color 0.15s;
            user-select: none; white-space: nowrap;
          }
          .pp_collapse_btn:hover { background: #3a454a !important; border-color: #3a454a !important; }
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
        for (let i = 0; i < children.length; i++) {
          if (allCollapsed) children[i].setAttribute("collapsed", "");
          else children[i].removeAttribute("collapsed");
        }

        btn.textContent = allCollapsed ? "+ Expand" : "− Collapse";
        btn.classList.toggle("pp_collapsed", allCollapsed);
      });

      commentsBtn.insertAdjacentElement("afterend", btn);
      commentsBtn.setAttribute("pp-has-sibling-btn", "true");
    },

    nukeAwardButtons: () => {
      Actions.deepQueryAll(
        document,
        "award-button, shreddit-slot[slot='award-button']",
      ).forEach((el) => {
        el.style.display = "none";
      });
    },

    nuke: () => {
      const items = document.querySelectorAll(NUKE_SELECTOR_STRING);
      for (let i = 0; i < items.length; i++) {
        items[i].remove();
      }

      const nav = document.querySelector("left-nav-top-section");
      if (nav && !nav.hasAttribute("pp-sanitized")) {
        nav.removeAttribute("news");
        nav.removeAttribute("explore");
        nav.shadowRoot
          ?.querySelectorAll('a[href="/news/"], a[href="/explore/"]')
          .forEach((link) => {
            (link.closest("li") || link).remove();
          });
        nav.setAttribute("pp-sanitized", "true");
      }
    },

    handleImages: (post) => {
      if (post.hasAttribute("pp-images-handled")) return;

      const images = post.querySelectorAll(
        "faceplate-img, img:not(.pp_imageViewable)",
      );
      if (!images.length) return;

      for (let i = 0; i < images.length; i++) {
        const imgEl = images[i];
        if (imgEl.classList.contains("pp_imageViewable")) continue;
        imgEl.classList.add("pp_imageViewable");

        imgEl.addEventListener(
          "click",
          (e) => {
            let clickedSrc =
              imgEl.getAttribute("src") ||
              imgEl.querySelector("img")?.getAttribute("src");
            if (!clickedSrc) return;

            e.preventDefault();
            e.stopPropagation();
            attachLightbox();

            const galleryContainer =
              imgEl.closest("gallery-carousel") || imgEl.closest("ul");
            if (galleryContainer) {
              const allImgs = Array.from(
                galleryContainer.querySelectorAll("faceplate-img, img"),
              );
              currentGalleryImages = allImgs
                .map(
                  (el) =>
                    el.getAttribute("src") ||
                    el.querySelector("img")?.getAttribute("src"),
                )
                .filter((src, idx, self) => src && self.indexOf(src) === idx);

              currentGalleryIndex = currentGalleryImages.indexOf(clickedSrc);
              if (currentGalleryIndex === -1) currentGalleryIndex = 0;
            } else {
              currentGalleryImages = [clickedSrc];
              currentGalleryIndex = 0;
            }

            updateLightboxImage();
            lightbox.style.display = "flex";
          },
          true,
        );
      }
      post.setAttribute("pp-images-handled", "true");
    },

    processComments: () => {
      const comments = document.querySelectorAll(
        "shreddit-comment:not([pp-checked])",
      );
      if (!comments.length) return;

      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
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
      }
    },
  };

  // 4. LOW-OVERHEAD TIMEOUT DEBOUNCED OBSERVER
  let updateScheduled = false;
  const observer = new MutationObserver(() => {
    if (updateScheduled) return;
    updateScheduled = true;

    setTimeout(() => {
      Actions.nuke();
      Actions.nukeAwardButtons();
      Actions.processComments();
      Actions.injectCollapseButton();

      const posts = document.querySelectorAll(
        "shreddit-post:not([pp-images-handled])",
      );
      for (let i = 0; i < posts.length; i++) {
        Actions.handleImages(posts[i]);
      }
      updateScheduled = false;
    }, 0);
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
