// ==UserScript==
// @name             Reddit Mobile
// @description      Force-removes News, Explore, Games, Resources, and Best of. Adds post unwrapping and an integrated image zoom viewer.
// @version          1.6.1
// @match            *://*.reddit.com/*
// @grant            none
// @run-at           document-start
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/RedditPlus.user.js
// ==/UserScript==

(function () {
  "use strict";

  // 1. Inject Styles for UI Stability and Image Viewer
  const style = document.createElement("style");
  style.textContent = `
        /* Header Cleanups - Banner, Icons, and Stats */
        #subreddit-banner-img,
        #subreddit-icon-img,
        #subreddit-icon-img-desktop,
        .shreddit-subreddit-icon__icon,
        community-highlight-carousel {
            display: none !important;
            visibility: hidden !important;
        }

        /* Image Viewer Styles */
        .pp_imageViewer {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.95);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            touch-action: none;
        }
        .pp_imageViewer_imageContainer {
            transition: transform 0.1s ease-out;
            will-change: transform;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .pp_imageViewer_image {
            max-width: 100vw;
            max-height: 100vh;
            object-fit: contain;
            user-select: none;
            -webkit-user-drag: none;
        }
        .pp_imageViewer_closeButton {
            position: absolute;
            top: 15px; right: 15px;
            width: 44px; height: 44px;
            background: rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 28px;
            cursor: pointer;
            z-index: 10001;
        }

        /* Global UI Tweaks */
        shreddit-comment[author="AutoModerator"] { max-height: 50px; overflow: hidden; opacity: 0.7; }
    `;
  document.documentElement.appendChild(style);

  // 2. Image Viewer Logic
  class ImageViewer {
    constructor() {
      this.opened = false;
      this.drag = {
        enabled: false,
        start: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        scale: 1,
      };
      this.mouse = { x: 0, y: 0 };

      this.scrollImage = this.scrollImage.bind(this);
      this.startDrag = this.startDrag.bind(this);
      this.mouseMove = this.mouseMove.bind(this);
      this.endDrag = this.endDrag.bind(this);
    }

    build() {
      this.viewer = document.createElement("div");
      this.viewer.className = "pp_imageViewer";

      const closeBtn = document.createElement("div");
      closeBtn.className = "pp_imageViewer_closeButton";
      closeBtn.innerHTML = "×";
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.close();
      };

      this.container = document.createElement("div");
      this.container.className = "pp_imageViewer_imageContainer";

      this.image = document.createElement("img");
      this.image.className = "pp_imageViewer_image";
      this.image.ondragstart = () => false;

      this.container.appendChild(this.image);
      this.viewer.appendChild(closeBtn);
      this.viewer.appendChild(this.container);

      this.viewer.onclick = (e) => {
        if (e.target === this.viewer || e.target === this.container)
          this.close();
      };
    }

    open(src) {
      if (this.opened) return;
      if (!this.viewer) this.build();

      this.opened = true;
      this.image.src = src;
      this.drag.current = { x: 0, y: 0 };
      this.drag.scale = 1;
      this.updateTransform();

      document.body.appendChild(this.viewer);

      window.addEventListener("wheel", this.scrollImage, { passive: false });
      this.image.addEventListener("mousedown", this.startDrag);
      document.addEventListener("mousemove", this.mouseMove);
      window.addEventListener("mouseup", this.endDrag);

      // Touch handlers
      this.image.addEventListener(
        "touchstart",
        (e) => {
          const touch = e.touches[0];
          this.startDrag({ screenX: touch.screenX, screenY: touch.screenY });
        },
        { passive: true },
      );
      document.addEventListener(
        "touchmove",
        (e) => {
          if (!this.drag.enabled) return;
          const touch = e.touches[0];
          this.mouseMove({
            clientX: touch.clientX,
            clientY: touch.clientY,
            screenX: touch.screenX,
            screenY: touch.screenY,
          });
        },
        { passive: false },
      );
      window.addEventListener("touchend", this.endDrag);
    }

    close() {
      if (!this.opened) return;
      this.viewer.remove();
      this.opened = false;
      window.removeEventListener("wheel", this.scrollImage);
      this.image.removeEventListener("mousedown", this.startDrag);
      document.removeEventListener("mousemove", this.mouseMove);
    }

    updateTransform() {
      this.container.style.transform = `translate(${this.drag.current.x}px, ${this.drag.current.y}px) scale(${this.drag.scale})`;
    }

    startDrag(e) {
      this.drag.enabled = true;
      this.drag.start.x = e.screenX - this.drag.current.x;
      this.drag.start.y = e.screenY - this.drag.current.y;
    }

    mouseMove(e) {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.drag.enabled) {
        this.drag.current.x = e.screenX - this.drag.start.x;
        this.drag.current.y = e.screenY - this.drag.start.y;
        this.updateTransform();
      }
    }

    endDrag() {
      this.drag.enabled = false;
    }

    scrollImage(e) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.drag.scale = Math.max(0.5, Math.min(this.drag.scale * factor, 8));
      this.updateTransform();
    }
  }

  const viewer = new ImageViewer();

  // 3. Purge Logic
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
            if (
              link &&
              (link.href.match(/\.(jpg|jpeg|png|webp|gif)/i) ||
                link.href.includes("preview.redd.it"))
            ) {
              e.preventDefault();
              e.stopPropagation();
              viewer.open(img.src);
            }
          },
          true,
        );
      });

    // Banner & Stat Removal
    const banner = document.getElementById("subreddit-banner-img");
    if (banner) {
      const container = banner.closest(".\\@container");
      if (container) container.remove();
    }

    document
      .querySelectorAll("div.lowercase.text-neutral-content-weak")
      .forEach((el) => {
        if (el.textContent.includes("visitors")) el.remove();
      });

    const icons = ["subreddit-icon-img", "subreddit-icon-img-desktop"];
    icons.forEach((id) => {
      const icon = document.getElementById(id);
      if (icon) icon.closest(".shrink-0")?.remove();
    });

    // Nav Drawer & General Cleanup
    const topSection = document.querySelector("left-nav-top-section");
    if (topSection) {
      ["news", "explore", "best"].forEach((attr) =>
        topSection.removeAttribute(attr),
      );
    }

    const targets = [
      'faceplate-tracker[noun="games_drawer"]',
      "shreddit-related-communities",
      "community-highlight-carousel",
    ];
    targets.forEach((s) =>
      document.querySelectorAll(s).forEach((i) => i.remove()),
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
