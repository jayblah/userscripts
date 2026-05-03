// ==UserScript==
// @name         Goon View
// @namespace    http://tampermonkey.net/
// @version      1.5.1
// @description  Streamlined media viewing experience for SimpCity.cr with Mobile & Keyboard updates.
// @author       JR
// @match        *://simpcity.*/threads/*
// @exclude      *://simpcity.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const SETTINGS_MAP = {
    includeVideos: "gv_include_vids",
    panelTop: "gv_p_top",
    panelLeft: "gv_p_left",
  };

  const settings = new Proxy(
    {
      includeVideos: GM_getValue(SETTINGS_MAP.includeVideos, true),
      panelTop: GM_getValue(SETTINGS_MAP.panelTop, "120px"),
      panelLeft: GM_getValue(SETTINGS_MAP.panelLeft, "calc(100% - 175px)"),
    },
    {
      set(target, prop, value) {
        target[prop] = value;
        if (SETTINGS_MAP[prop]) GM_setValue(SETTINGS_MAP[prop], value);
        // Defer to avoid coupling to App before it exists
        if (prop === "includeVideos") App.updateUI();
        return true;
      },
    },
  );

  const App = {
    mediaList: [],
    zoomIdx: 0,
    isExpanded: false,
    shadow: null,
    _lastWheel: 0,
    _wheelThrottle: 180,
    _touchStart: { x: 0, y: 0 },
    // Track in-flight decode so we can abort on rapid navigation
    _decodeAbort: null,
    // True on narrow/touch viewports (iPhone etc.)
    isMobile: window.matchMedia("(max-width: 600px) and (pointer: coarse)")
      .matches,

    init() {
      this.injectGlobalStyles();
      this.createHost();
      this.setupGlobalEvents();
    },

    injectGlobalStyles() {
      const style = document.createElement("style");
      style.textContent = `
        img.bbImage.gv-expanded {
          display: block !important;
          max-width: 100% !important;
          max-height: 94vh !important;
          margin: 15px auto !important;
          border: 1px solid #333 !important;
          object-fit: contain !important;
        }
        body.gv-noscroll { overflow: hidden !important; }
      `;
      document.head.appendChild(style);
    },

    createHost() {
      const host = document.createElement("div");
      host.id = "gv-p-root";
      document.body.appendChild(host);
      this.shadow = host.attachShadow({ mode: "open" });

      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`
        :host { --teal: #3db7c7; --bg: #171717; --border: #262626; }
        .panel {
          position: fixed; z-index: 9999; background: var(--bg); color: #efefef;
          border-radius: 8px; border: 1px solid var(--border); padding: 12px;
          font-family: system-ui, -apple-system, sans-serif; width: 155px;
          display: flex; flex-direction: column; gap: 10px; box-shadow: 0 12px 40px #000;
          user-select: none; touch-action: none;
        }
        .header {
          text-align: center; font-weight: 900; color: var(--teal); cursor: move;
          padding-bottom: 6px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--border);
        }
        .btn {
          background: #222; border: 1px solid #333; border-radius: 5px; height: 34px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          font-weight: 700; color: #aaa; font-size: 11px; transition: all 0.2s ease;
        }
        .btn:hover { border-color: var(--teal); color: #fff; background: #2a2a2a; }
        .btn:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
        .btn.active { background: #0e3a40; color: var(--teal); border-color: var(--teal); }
        .row { display: flex; gap: 6px; }
        .row .btn { flex: 1; }
        u { text-decoration: underline; text-decoration-color: var(--teal); text-underline-offset: 3px; }

        #overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.98); display: none;
          align-items: center; justify-content: center; z-index: 10000;
          backdrop-filter: blur(4px); outline: none; touch-action: none;
        }
        .z-hint {
          position: absolute; color: var(--teal); font-size: 11px; font-weight: 900;
          opacity: 0.7; top: 20px; left: 50%; transform: translateX(-50%); text-align: center;
        }
        #media-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        #media-container :is(img, video, iframe) { max-width: 96%; max-height: 96%; object-fit: contain; }
        .counter {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          color: var(--teal); font-weight: 800; background: rgba(0,0,0,0.8);
          padding: 5px 15px; border-radius: 20px; border: 1px solid #333;
        }
        /* Mobile: slim panel, no scroll buttons */
        @media (max-width: 600px) and (pointer: coarse) {
          .panel { width: 120px; padding: 8px; gap: 7px; }
          .header { font-size: 10px; padding-bottom: 5px; }
          .btn { height: 30px; font-size: 10px; }
          .row.scroll-row { display: none; }
        }
      `);
      this.shadow.adoptedStyleSheets = [sheet];

      // renderBase must come before updateUI so DOM elements exist
      this.renderBase();
      this.updateUI();
      this.bindInternalEvents();
    },

    renderBase() {
      // On mobile, default the panel to top-left so it doesn't obscure content
      const defaultTop = this.isMobile
        ? GM_getValue(SETTINGS_MAP.panelTop, "80px")
        : settings.panelTop;
      const defaultLeft = this.isMobile
        ? GM_getValue(SETTINGS_MAP.panelLeft, "10px")
        : settings.panelLeft;

      this.shadow.innerHTML = `
        <div class="panel" id="gv-panel" style="top: ${defaultTop}; left: ${defaultLeft}">
          <div class="header" id="gv-drag">Goon View™</div>
          <div class="row scroll-row">
            <div class="btn" role="button" tabindex="0" data-action="top" title="Scroll to top">▴ TOP</div>
            <div class="btn" role="button" tabindex="0" data-action="bottom" title="Scroll to bottom">▾ BOT</div>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="expand" id="btn-expand">EXPAND ALL</div>
          <div class="btn" role="button" tabindex="0" data-action="gallery"><u>G</u>ALLERY</div>
          <div class="btn" role="button" tabindex="0" data-action="video" id="btn-video"><u>V</u>IDEO: ON</div>
        </div>
        <div id="overlay" tabindex="-1">
          <div class="z-hint">[A / ←] PREV | [D / →] NEXT | [W / ↑ / ESC] EXIT</div>
          <div id="media-container"></div>
          <div class="counter" id="gv-counter"></div>
        </div>
      `;
    },

    updateUI() {
      const btnExpand = this.shadow.getElementById("btn-expand");
      const btnVideo = this.shadow.getElementById("btn-video");

      btnExpand.innerHTML = this.isExpanded
        ? "COLLAPSE ALL"
        : "E<u>X</u>PAND ALL";

      btnVideo.innerHTML = `<u>V</u>IDEO: ${settings.includeVideos ? "ON" : "OFF"}`;
      btnVideo.classList.toggle("active", settings.includeVideos);
    },

    refreshMediaList() {
      const selector =
        'img.bbImage, video, iframe.saint-iframe, iframe[src*="video"], iframe[src*="redgifs"], div[onclick*="redgifs.com"]';
      this.mediaList = Array.from(document.querySelectorAll(selector)).filter(
        (el) => {
          const rect = el.getBoundingClientRect();
          const isVisible =
            rect.width > 0 || rect.height > 0 || el.tagName === "DIV";
          return isVisible && (settings.includeVideos || el.tagName === "IMG");
        },
      );
    },

    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      document
        .querySelectorAll("img.bbImage")
        .forEach((img) => img.classList.toggle("gv-expanded", this.isExpanded));
      if (this.isExpanded) {
        document
          .querySelectorAll('div[onclick*="redgifs.com"]')
          .forEach((div) => div.click());
      }
      this.updateUI();
    },

    // Mobile Swipe Handling
    handleTouchStart(e) {
      this._touchStart.x = e.changedTouches[0].screenX;
      this._touchStart.y = e.changedTouches[0].screenY;
    },

    handleTouchEnd(e) {
      const xEnd = e.changedTouches[0].screenX;
      const yEnd = e.changedTouches[0].screenY;
      const dx = xEnd - this._touchStart.x;
      const dy = yEnd - this._touchStart.y;
      const threshold = 50;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > threshold) {
          this.openGallery(dx > 0 ? -1 : 1);
        }
      } else {
        if (Math.abs(dy) > threshold) {
          this.closeGallery();
        }
      }
    },

    bindInternalEvents() {
      const s = this.shadow;
      const panel = s.getElementById("gv-panel");
      const overlay = s.getElementById("overlay");

      // Unified click + keyboard (Enter/Space) handler for .btn elements
      const btnActionHandlers = {
        top: () => window.scrollTo({ top: 0, behavior: "smooth" }),
        bottom: () =>
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          }),
        expand: () => this.toggleExpand(),
        gallery: () => this.openGallery(0),
        video: () => (settings.includeVideos = !settings.includeVideos),
      };

      s.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn");
        if (btn) btnActionHandlers[btn.dataset.action]?.();
        if (["overlay", "media-container"].includes(e.target.id))
          this.closeGallery();
      });

      // Keyboard activation for div.btn (Enter / Space)
      s.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const btn = e.target.closest(".btn");
          if (btn) {
            e.preventDefault();
            btnActionHandlers[btn.dataset.action]?.();
          }
        }
      });

      // Panel Dragging
      const dragHdr = s.getElementById("gv-drag");
      dragHdr.addEventListener("pointerdown", (e) => {
        const startX = e.clientX - panel.offsetLeft;
        const startY = e.clientY - panel.offsetTop;
        dragHdr.setPointerCapture(e.pointerId);
        const move = (m) => {
          panel.style.left = `${m.clientX - startX}px`;
          panel.style.top = `${m.clientY - startY}px`;
        };
        const up = () => {
          settings.panelLeft = panel.style.left;
          settings.panelTop = panel.style.top;
          dragHdr.removeEventListener("pointermove", move);
          dragHdr.removeEventListener("pointerup", up);
        };
        dragHdr.addEventListener("pointermove", move);
        dragHdr.addEventListener("pointerup", up);
      });

      // Gallery Scroll Nav — guard against null hovered element
      overlay.addEventListener(
        "wheel",
        (e) => {
          const hovered = s.elementFromPoint(e.clientX, e.clientY);
          if (hovered?.matches("video, iframe")) return;
          e.preventDefault();
          const now = Date.now();
          if (now - this._lastWheel < this._wheelThrottle) return;
          this._lastWheel = now;
          this.openGallery(e.deltaY > 0 ? 1 : -1);
        },
        { passive: false },
      );

      // Mobile Touch Listeners
      overlay.addEventListener("touchstart", (e) => this.handleTouchStart(e), {
        passive: true,
      });
      overlay.addEventListener("touchend", (e) => this.handleTouchEnd(e), {
        passive: true,
      });
    },

    async openGallery(dir = 0) {
      this.refreshMediaList();
      if (!this.mediaList.length) return;

      this.zoomIdx =
        (this.zoomIdx + dir + this.mediaList.length) % this.mediaList.length;
      const current = this.mediaList[this.zoomIdx];

      const overlay = this.shadow.getElementById("overlay");
      const container = this.shadow.getElementById("media-container");

      overlay.style.display = "flex";
      document.body.classList.add("gv-noscroll");
      overlay.focus();

      // Cancel any prior in-flight image decode
      if (this._decodeAbort) {
        this._decodeAbort.abort();
        this._decodeAbort = null;
      }

      container.replaceChildren();

      let el;
      if (current.tagName === "IMG") {
        el = new Image();
        el.src = current.src;
        const controller = new AbortController();
        this._decodeAbort = controller;
        try {
          await el.decode();
          // If aborted before decode finished, bail — a newer call is already running
          if (controller.signal.aborted) return;
        } catch {
          // Decode failed or aborted; continue with partially-loaded image
        }
        this._decodeAbort = null;
      } else if (current.tagName === "VIDEO") {
        el = document.createElement("video");
        el.src = current.src || current.querySelector("source")?.src;
        el.controls = true;
        el.loop = true;
        el.autoplay = true;
        el.muted = false;
        el.setAttribute("playsinline", ""); // Essential for mobile autoplay
      } else {
        el = document.createElement("iframe");
        let src =
          current.tagName === "DIV"
            ? current.getAttribute("onclick")?.match(/'([^']+)'/)?.[1]
            : current.src;
        if (src?.startsWith("//")) src = "https:" + src;
        el.src = src || "";
        el.style.cssText =
          "width: 85vw; height: 85vh; border: none; background: #000;";
        el.allow = "fullscreen; autoplay";
      }

      container.appendChild(el);
      this.shadow.getElementById("gv-counter").textContent =
        `${this.zoomIdx + 1} / ${this.mediaList.length}`;
    },

    closeGallery() {
      const container = this.shadow.getElementById("media-container");
      // Stop active media before removing from DOM
      const video = container.querySelector("video");
      if (video) {
        video.pause();
        video.src = "";
      }
      const iframe = container.querySelector("iframe");
      if (iframe) iframe.src = "";
      container.replaceChildren();
      this.shadow.getElementById("overlay").style.display = "none";
      document.body.classList.remove("gv-noscroll");
      window.focus();
    },

    setupGlobalEvents() {
      window.addEventListener(
        "keydown",
        (e) => {
          if (
            document.activeElement.matches("input, textarea") ||
            document.activeElement.isContentEditable
          )
            return;

          const isVisible =
            this.shadow.getElementById("overlay").style.display === "flex";
          const key = e.key.toLowerCase();

          if (key === "g") {
            e.preventDefault();
            this.openGallery(0);
            return;
          }
          if (key === "x") {
            e.preventDefault();
            this.toggleExpand();
            return;
          }
          if (key === "v") {
            e.preventDefault();
            settings.includeVideos = !settings.includeVideos;
            return;
          }

          if (isVisible) {
            const actions = {
              escape: () => this.closeGallery(),
              w: () => this.closeGallery(),
              arrowup: () => this.closeGallery(),
              a: () => this.openGallery(-1),
              arrowleft: () => this.openGallery(-1),
              d: () => this.openGallery(1),
              arrowright: () => this.openGallery(1),
            };

            if (actions[key]) {
              e.preventDefault();
              e.stopImmediatePropagation();
              actions[key]();
            }
          }
        },
        true,
      );

      // Only re-focus the overlay when it is actually open
      window.addEventListener("blur", () => {
        const overlay = this.shadow.getElementById("overlay");
        if (overlay?.style.display === "flex") {
          setTimeout(() => overlay.focus(), 100);
        }
      });
    },
  };

  App.init();
})();
