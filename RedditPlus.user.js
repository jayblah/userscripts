// ==UserScript==
// @name             Reddit Mobile
// @description      Force-removes News, Explore, Games, Resources, and Best of. Adds post unwrapping, image zoom viewer, and colored comment guidelines.
// @version          1.7.0
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-start
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// ==/UserScript==

(function () {
  "use strict";

  // 1. Configuration & Colors
  const COLORS = [
    "#4CAF50",
    "#1E88DB",
    "#FF9800",
    "#B650C7",
    "#F44336",
    "#3ABAA2",
  ];

  // 2. Inject Styles for UI Stability, Viewer, and Guidelines
  const style = document.createElement("style");
  style.textContent = `
        /* Hide Unwanted UI Elements */
        #subreddit-banner-img, #subreddit-icon-img, #subreddit-icon-img-desktop,
        .shreddit-subreddit-icon__icon, community-highlight-carousel,
        faceplate-tracker[noun="games_drawer"], shreddit-related-communities {
            display: none !important;
        }

        /* Image Viewer Styles */
        .pp_imageViewer {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.95); z-index: 9999;
            display: flex; align-items: center; justify-content: center; touch-action: none;
        }
        .pp_imageViewer_imageContainer { transition: transform 0.1s ease-out; will-change: transform; }
        .pp_imageViewer_image { max-width: 100vw; max-height: 100vh; object-fit: contain; }
        .pp_imageViewer_closeButton {
            position: absolute; top: 15px; right: 15px; width: 44px; height: 44px;
            background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.3);
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            color: white; font-size: 28px; cursor: pointer; z-index: 10001;
        }

        /* Comment Guidelines */
        .pp-guideline-colorized {
            border-left-width: 2px !important;
            border-left-style: solid !important;
            opacity: 0.8 !important;
        }
    `;
  document.documentElement.appendChild(style);

  // 3. Image Viewer Class
  class ImageViewer {
    constructor() {
      this.opened = false;
      this.drag = {
        enabled: false,
        start: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        scale: 1,
      };
    }
    build() {
      this.viewer = document.createElement("div");
      this.viewer.className = "pp_imageViewer";
      this.viewer.innerHTML = `<div class="pp_imageViewer_closeButton">×</div><div class="pp_imageViewer_imageContainer"><img class="pp_imageViewer_image"></div>`;
      this.container = this.viewer.querySelector(
        ".pp_imageViewer_imageContainer",
      );
      this.image = this.viewer.querySelector("img");
      this.viewer.querySelector(".pp_imageViewer_closeButton").onclick = () =>
        this.close();
      this.viewer.onclick = (e) => {
        if (e.target === this.viewer) this.close();
      };
    }
    open(src) {
      if (!this.viewer) this.build();
      this.opened = true;
      this.image.src = src;
      this.drag.current = { x: 0, y: 0 };
      this.drag.scale = 1;
      this.updateTransform();
      document.body.appendChild(this.viewer);
    }
    close() {
      this.viewer.remove();
      this.opened = false;
    }
    updateTransform() {
      this.container.style.transform = `translate(${this.drag.current.x}px, ${this.drag.current.y}px) scale(${this.drag.scale})`;
    }
  }
  const viewer = new ImageViewer();

  // 4. Guideline Processing
  const renderGuidelines = (comment) => {
    if (comment.hasAttribute("pp-guidelines-rendered")) return;

    const depth = parseInt(comment.getAttribute("depth") || 0);
    const color = COLORS[depth % COLORS.length];
    const shadow = comment.shadowRoot;
    if (!shadow) return;

    // Target Reddit's specific threadline elements
    const lines = shadow.querySelectorAll(
      'div[data-testid="main-thread-line"], div[data-testid="branch-line"]',
    );
    lines.forEach((line) => {
      line.style.setProperty("border-left-color", color, "important");
      line.classList.add("pp-guideline-colorized");
    });

    comment.setAttribute("pp-guidelines-rendered", "true");
  };

  // 5. Main Purge & Logic Loop
  const purgeLogic = () => {
    // Image Interception
    document
      .querySelectorAll("shreddit-post img, .comment-body img")
      .forEach((img) => {
        if (img.dataset.viewerHooked) return;
        img.dataset.viewerHooked = "true";
        img.addEventListener(
          "click",
          (e) => {
            const link = img.closest("a");
            if (link && link.href.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
              e.preventDefault();
              e.stopPropagation();
              viewer.open(img.src);
            }
          },
          true,
        );
      });

    // Process Comment Guidelines
    document.querySelectorAll("shreddit-comment").forEach(renderGuidelines);

    // Header & Nav Cleanup
    const banner = document.getElementById("subreddit-banner-img");
    if (banner) banner.closest(".\\@container")?.remove();

    document
      .querySelectorAll("div.lowercase.text-neutral-content-weak")
      .forEach((el) => {
        if (el.textContent.includes("visitors")) el.remove();
      });

    const topSection = document.querySelector("left-nav-top-section");
    if (topSection)
      ["news", "explore", "best"].forEach((attr) =>
        topSection.removeAttribute(attr),
      );

    // Post Unwrapping
    document
      .querySelectorAll(
        'shreddit-post[view-type="cardView"] .truncated-content',
      )
      .forEach((p) => {
        p.style.maxHeight = "none";
        p.style.display = "block";
      });
  };

  const observer = new MutationObserver(purgeLogic);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  purgeLogic();
})();
