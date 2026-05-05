// ==UserScript==
// @name             Reddit Mobile
// @description      Force-removes News, Explore, Games, Resources, and Best of. Adds post unwrapping, shadow-piercing highlights, and an integrated image zoom viewer.
// @version          1.6.0
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
        /* Header Cleanups */
        #subreddit-banner-img, #subreddit-icon-img, #subreddit-icon-img-desktop, .shreddit-subreddit-icon__icon {
            display: none !important;
        }

        /* Image Viewer Styles */
        .pp_imageViewer {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9);
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
            max-width: 95vw;
            max-height: 95vh;
            object-fit: contain;
            user-select: none;
            -webkit-user-drag: none;
        }
        .pp_imageViewer_closeButton {
            position: absolute;
            top: 20px; right: 20px;
            width: 40px; height: 40px;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            cursor: pointer;
            z-index: 10001;
        }

        /* Highlights & Comments */
        community-highlight-carousel:not([data-user-expanded="true"]) [slot="content"] { display: none !important; }
        shreddit-comment[author="AutoModerator"] { max-height: 50px; overflow: hidden; opacity: 0.8; }
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
      closeBtn.onclick = () => this.close();

      this.container = document.createElement("div");
      this.container.className = "pp_imageViewer_imageContainer";

      this.image = document.createElement("img");
      this.image.className = "pp_imageViewer_image";

      this.container.appendChild(this.image);
      this.viewer.appendChild(closeBtn);
      this.viewer.appendChild(this.container);

      this.viewer.onclick = (e) => {
        if (e.target === this.viewer) this.close();
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

      // Mobile Touch Support
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
      this.drag.start.x =
        (e.screenX || e.touches[0].screenX) - this.drag.current.x;
      this.drag.start.y =
        (e.screenY || e.touches[0].screenY) - this.drag.current.y;
    }

    mouseMove(e) {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.drag.enabled) {
        this.drag.current.x =
          (e.screenX || e.touches[0].screenX) - this.drag.start.x;
        this.drag.current.y =
          (e.screenY || e.touches[0].screenY) - this.drag.start.y;
        this.updateTransform();
      }
    }

    endDrag() {
      this.drag.enabled = false;
    }

    scrollImage(e) {
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.1 : 0.9;
      this.drag.scale = Math.max(0.5, Math.min(this.drag.scale * factor, 5));
      this.updateTransform();
    }
  }

  const viewer = new ImageViewer();

  // 3. Main Purge and Intercept Logic
  const purgeLogic = () => {
    // Intercept image clicks
    document
      .querySelectorAll("shreddit-post img, .comment-body img")
      .forEach((img) => {
        if (img.dataset.viewerHooked) return;
        img.dataset.viewerHooked = "true";
        img.style.cursor = "zoom-in";

        img.addEventListener(
          "click",
          (e) => {
            // If it's inside a link, stop the redirect
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

    // Subreddit Banner & Icon cleanup
    const banner = document.getElementById("subreddit-banner-img");
    if (banner) {
      const container = banner.closest(".\\@container");
      if (container) container.remove();
    }

    // Weekly Stats cleanup
    document
      .querySelectorAll("div.lowercase.text-neutral-content-weak")
      .forEach((el) => {
        if (el.textContent.includes("visitors")) el.remove();
      });

    // Section Removal
    const specificTargets = [
      'faceplate-tracker[noun="games_drawer"]',
      "shreddit-related-communities",
    ];
    specificTargets.forEach((selector) => {
      document.querySelectorAll(selector).forEach((item) => item.remove());
    });

    // Unwrap Posts
    document
      .querySelectorAll(
        'shreddit-post[view-type="cardView"] .truncated-content',
      )
      .forEach((post) => {
        post.style.maxHeight = "none";
        post.style.display = "block";
      });
  };

  const observer = new MutationObserver(purgeLogic);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  purgeLogic();
})();
