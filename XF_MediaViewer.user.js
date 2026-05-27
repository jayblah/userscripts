// ==UserScript==
// @name         XF Media Viewer
// @version      1.2.0
// @description  Streamlined media viewing experience for XenForo forums. Features mobile & keyboard support, inline expansion, slideshows, and multi-media pipelines.
// @author       JR
// @license      MIT
// @match        *://simpcity.*/threads/*
// @match        *://f95zone.to/threads/*
// @exclude      *://simpcity.com/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/XF_MediaViewer.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/XF_MediaViewer.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // ── Environment Flags ───────────────────────────────────────────────────
  const IS_F95 = window.location.hostname.includes("f95zone.to");

  // Unified styling
  const APP_THEME = "#3db7c7";
  const APP_NAME = "XF View™";
  const APP_SHORT = "XF™";

  const SEL_IMG = IS_F95
    ? "img.bbImage:not(.message-signature img, aside img)"
    : "img.bbImage";

  const SEL_VID = IS_F95
    ? [
        "video",
        "iframe[src*='youtube.com']",
        "iframe[src*='youtu.be']",
        "iframe[src*='vimeo.com']",
        "iframe[src*='streamtape']",
        "iframe[src*='doodstream']",
        "iframe[src*='mixdrop']",
        "iframe[src*='streamlare']",
        "iframe[src*='upstream']",
        "iframe[src*='vidoza']",
        "iframe[src*='filemoon']",
        "iframe[src*='mp4upload']",
        "iframe[src*='gofile']",
        "iframe",
      ].join(", ")
    : 'video, iframe.saint-iframe, iframe[src*="video"], iframe[src*="redgifs"], div[onclick*="redgifs.com"]';

  // ── Settings persistence ────────────────────────────────────────────────
  const SETTINGS_MAP = {
    panelTop: "gv_p_top",
    panelLeft: "gv_p_left",
    videoVolume: "gv_v_volume",
    videoMuted: "gv_v_muted",
    slideshowSeconds: "gv_ss_seconds",
  };

  const settings = new Proxy(
    {
      panelTop: GM_getValue(SETTINGS_MAP.panelTop, "120px"),
      panelLeft: GM_getValue(SETTINGS_MAP.panelLeft, "calc(100% - 175px)"),
      videoVolume: GM_getValue(SETTINGS_MAP.videoVolume, 1.0),
      videoMuted: GM_getValue(SETTINGS_MAP.videoMuted, false),
      slideshowSeconds: GM_getValue(SETTINGS_MAP.slideshowSeconds, 3),
    },
    {
      set(target, prop, value) {
        target[prop] = value;
        if (SETTINGS_MAP[prop]) GM_setValue(SETTINGS_MAP[prop], value);
        return true;
      },
    },
  );

  // ── App ─────────────────────────────────────────────────────────────────
  const App = {
    mediaList: [],
    _videoList: [],
    _fullList: [],
    zoomIdx: 0,
    _videoIdx: 0,
    _fullIdx: 0,
    isExpanded: false,
    shadow: null,
    _touchStart: { x: 0, y: 0 },
    _lastScroll: 0,
    _lastTap: 0,
    _decodeAbort: null,
    _galleryMode: "main", // "main" (images), "video", or "full"
    isMobile: window.matchMedia("(max-width: 600px) and (pointer: coarse)")
      .matches,
    _scale: 1,
    _minScale: 1,
    _maxScale: 5,
    _zoomStep: 0.15,
    _pinchDist: null,
    _isPinching: false,
    _panOffset: { x: 0, y: 0 },
    _panStart: { x: 0, y: 0 },
    _isPanning: false,
    _hasDragged: false,
    _xpageLocked: false,
    _xpageUrl: null,
    _trackedUnseenElement: null,
    _observer: null,
    _slideshowTimer: null,
    _slideshowActive: false,

    init() {
      this.injectGlobalStyles();
      this.createHost();
      this.processInlineElements();

      this.refreshMediaPipelines();
      this._trackInitialUnseenPosition();
      this.setupGlobalEvents();

      // Mutation observer optimized to throttle executions on broad tree changes
      let debounceTimeout = null;
      this._observer = new MutationObserver((mutations) => {
        const hasRelevantNodes = mutations.some((m) => m.addedNodes.length > 0);
        if (!hasRelevantNodes) return;

        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          this._observer.disconnect();
          this.processInlineElements();
          this.refreshMediaPipelines();
          this._observer.observe(document.body, {
            childList: true,
            subtree: true,
          });
        }, 200);
      });
      this._observer.observe(document.body, { childList: true, subtree: true });
    },

    injectGlobalStyles() {
      const style = document.createElement("style");
      style.textContent = `
        img.bbImage.gv-expanded, img.bbImage.expanded {
          display: block !important;
          max-width: 100% !important;
          max-height: 94vh !important;
          margin: 15px auto !important;
          border: 1px solid #333 !important;
          object-fit: contain !important;
        }
        .js-lbContainer.expanded > a, .lbContainer.expanded > a {
          pointer-events: none !important;
        }
        body.gv-noscroll { overflow: hidden !important; }
        img.bbImage {
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          display: inline-block;
          max-width: 200px;
          height: auto;
          margin: 2px;
        }
        .sc-expand-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          font-family: system-ui, sans-serif;
          color: #aaa;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          margin: 0;
          line-height: 1;
          transition: color 0.15s;
        }
        .sc-expand-btn:hover { color: #fff; }
        .sc-expand-btn.is-expanded { color: ${APP_THEME}; }

        body.gv-noscroll .plyr--error .plyr__poster,
        body.gv-noscroll .plyr--error .plyr__controls,
        body.gv-noscroll .plyr__video-wrapper + [class*="error"],
        body.gv-noscroll [id*="video"] [class*="error"],
        body.gv-noscroll .watermark {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
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
        :host { --theme: ${APP_THEME}; --bg: #171717; --border: #262626; }
        .panel {
          position: fixed; z-index: 9999; background: var(--bg); color: #efefef;
          border-radius: 8px; border: 1px solid var(--border); padding: 12px;
          font-family: system-ui, -apple-system, sans-serif; width: 155px;
          display: flex; flex-direction: column; gap: 10px; box-shadow: 0 12px 40px #000;
          user-select: none; touch-action: none;
        }
        .header {
          text-align: center; font-weight: 900; color: var(--theme); cursor: move;
          padding-bottom: 6px; font-size: 11px; text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }
        .btn {
          background: #222; border: 1px solid #333; border-radius: 5px; height: 34px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          font-weight: 700; color: #aaa; font-size: 11px; transition: all 0.2s ease;
        }
        .btn:hover { border-color: var(--theme); color: #fff; background: #2a2a2a; }
        .btn:focus-visible { outline: 2px solid var(--theme); outline-offset: 2px; }
        .row { display: flex; gap: 6px; }
        .scroll-row .btn { flex: 1 1 0; min-width: 0; }
        .lbl-short { display: none; }
        u { text-decoration: underline; text-decoration-color: var(--theme); text-underline-offset: 3px; }

        #overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.98); display: none;
          align-items: center; justify-content: center; z-index: 10000;
          backdrop-filter: blur(4px); outline: none; touch-action: none;
        }
        .z-hint {
          position: absolute; color: var(--theme); font-size: 11px; font-weight: 900;
          opacity: 0.7; top: 20px; left: 50%; transform: translateX(-50%); text-align: center;
        }
        #media-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        #media-container :is(img, video, iframe) { max-width: 96%; max-height: 96%; object-fit: contain; }
        #media-container img {
          transform-origin: center center;
          transition: transform 0.12s ease;
          cursor: zoom-in;
          will-change: transform;
        }
        #media-container img.zoomed { cursor: grab; }
        #media-container img.zoomed.dragging { cursor: grabbing; }

        .counter-row {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 8px;
        }
        .counter {
          color: var(--theme); font-weight: 800; background: rgba(0,0,0,0.8);
          padding: 5px 15px; border-radius: 20px; border: 1px solid #333;
          white-space: nowrap; font-family: system-ui, sans-serif; font-size: 13px;
          height: 22px; display: flex; align-items: center;
        }
        .slideshow-ctrl {
          display: flex; align-items: center; background: rgba(0,0,0,0.8);
          border: 1px solid #333; border-radius: 20px; padding: 2px;
          gap: 0; transition: all 0.15s ease-in-out;
        }
        #btn-slideshow {
          width: 32px; height: 32px; border-radius: 50%;
          background: #111; border: 1px solid #222;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.2s ease; flex-shrink: 0;
          color: #aaa; position: relative;
        }
        #btn-slideshow:hover { border-color: var(--theme); color: #fff; }
        #btn-slideshow.active { border-color: var(--theme); color: var(--theme); }
        #btn-slideshow svg { display: block; }

        .slideshow-input-wrapper { display: flex; align-items: center; padding-left: 4px; padding-right: 8px; }
        .slideshow-input {
          width: 24px; background: transparent; border: none; color: #fff;
          font-family: system-ui, sans-serif; font-size: 12px; font-weight: 700;
          text-align: center; padding: 0; margin: 0; outline: none;
          border-bottom: 1px dashed #555;
        }
        .slideshow-input:focus { border-bottom-color: var(--theme); }
        .slideshow-unit { color: #666; font-size: 10px; font-weight: 700; margin-left: 2px; }

        #slideshow-ring {
          position: absolute; inset: -1px; border-radius: 50%;
          pointer-events: none; opacity: 0; transition: opacity 0.2s;
        }
        #slideshow-ring.visible { opacity: 1; }
        #slideshow-ring circle {
          fill: none; stroke: var(--theme); stroke-width: 2;
          stroke-dasharray: 100; stroke-dashoffset: 100;
          stroke-linecap: round;
          transform-origin: center;
          transform: rotate(-90deg);
          transition: stroke-dashoffset linear;
        }

        @media (max-width: 600px) and (pointer: coarse) {
          .panel { width: auto; flex-direction: row; flex-wrap: nowrap; align-items: center; padding: 8px 10px; gap: 8px; cursor: grab; }
          .panel:active { cursor: grabbing; }
          .header { display: flex; align-items: center; justify-content: center; border-bottom: none; border-right: 1px solid var(--border); padding-bottom: 0; padding-right: 8px; font-size: 10px; min-width: 28px; cursor: grab; }
          .header .lbl-full { display: none; }
          .header .lbl-short { display: inline; }
          .btn { height: 44px; font-size: 13px; padding: 0 12px; border-radius: 7px; }
          .row.scroll-row { display: none; }
          .lbl-full { display: none; }
          .lbl-short { display: inline; }

          .panel.vertical { flex-direction: column !important; width: 70px !important; align-items: stretch !important; padding: 8px 5px !important; gap: 8px !important; box-sizing: border-box !important; }
          .panel.vertical .row.scroll-row, .panel.vertical .scroll-row { display: none !important; }
          .panel.vertical .header { border-right: none !important; border-bottom: 1px solid var(--border) !important; padding-right: 0 !important; padding-bottom: 6px !important; }
          .panel.vertical .btn { width: 100% !important; height: 38px !important; font-size: 10px !important; padding: 0 2px !important; box-sizing: border-box !important; flex: 0 0 auto !important; }
          .z-hint { display: none !important; }
        }
      `);
      this.shadow.adoptedStyleSheets = [sheet];

      this.renderBase();
      this.updateUI();
      this.bindInternalEvents();
    },

    renderBase() {
      const defaultTop = this.isMobile
        ? GM_getValue(SETTINGS_MAP.panelTop, "80px")
        : settings.panelTop;
      const defaultLeft = this.isMobile
        ? GM_getValue(SETTINGS_MAP.panelLeft, "10px")
        : settings.panelLeft;

      this.shadow.innerHTML = `
        <div class="panel" id="gv-panel" style="top: ${defaultTop}; left: ${defaultLeft}">
          <div class="header" id="gv-drag">
            <span class="lbl-full">${APP_NAME}</span>
            <span class="lbl-short">${APP_SHORT}</span>
          </div>
          <div class="row scroll-row">
            <div class="btn" role="button" tabindex="0" data-action="top" title="Scroll to top">▴ TOP</div>
            <div class="btn" role="button" tabindex="0" data-action="bottom" title="Scroll to bottom">▾ BOT</div>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="expand" id="btn-expand">EXPAND ALL</div>
          <div class="btn" role="button" tabindex="0" data-action="gallery" id="btn-gallery">
            <span class="lbl-full">IMAGE&nbsp;<u>G</u>ALLERY</span>
            <span class="lbl-short">GAL</span>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="vgallery" id="btn-vgallery">
            <span class="lbl-full"><u>V</u>IDEO GALLERY</span>
            <span class="lbl-short">VID</span>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="fullgallery" id="btn-fullgallery" style="border-color: #444;">
            <span class="lbl-full"><u>F</u>ULL GALLERY</span>
            <span class="lbl-short">FUL</span>
          </div>
        </div>
        <div id="overlay" tabindex="-1">
          <div class="z-hint">
            [A/←] PREV · [D/→] NEXT · [W/↑/ESC] EXIT<br>
            [SPACE] AUTOPLAY · [SCROLL] TIMELINE · [R-CLICK + SCROLL] ZOOM
          </div>
          <div id="media-container"></div>
          <div class="counter-row">
            <div class="slideshow-ctrl" id="gv-slideshow-ctrl">
              <div id="btn-slideshow" role="button" tabindex="0" title="Slideshow">
                <svg id="slideshow-ring" viewBox="0 0 40 40" width="34" height="34">
                  <circle cx="20" cy="20" r="15.9" id="ring-circle"/>
                </svg>
                <svg id="slideshow-icon" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <polygon points="3,1 13,7 3,13" id="icon-play"/>
                </svg>
              </div>
              <div class="slideshow-input-wrapper" id="ss-input-wrapper">
                <input type="text" class="slideshow-input" id="ss-duration" value="${settings.slideshowSeconds}" maxlength="3" title="Duration per image">
                <span class="slideshow-unit">s</span>
              </div>
            </div>
            <div class="counter" id="gv-counter"></div>
          </div>
        </div>
      `;
    },

    updateUI() {
      if (
        this.isMobile &&
        this.shadow.getElementById("gv-panel").classList.contains("vertical")
      ) {
        this.shadow.querySelector(".scroll-row").style.display = "none";
      }
      const btnExpand = this.shadow.getElementById("btn-expand");
      btnExpand.innerHTML = this.isExpanded
        ? "<span class='lbl-full'>COLLAPSE ALL</span><span class='lbl-short'>COL</span>"
        : "<span class='lbl-full'>E<u>X</u>PAND ALL</span><span class='lbl-short'>EXP</span>";
    },

    _updatePanelOrientation(panel) {
      if (!this.isMobile) return;
      const left = panel.offsetLeft;
      const screenW = window.innerWidth;
      const isCurrentlyVertical = panel.classList.contains("vertical");
      const shouldBeVertical = left <= 100 || left >= screenW - 170;

      if (shouldBeVertical !== isCurrentlyVertical) {
        panel.classList.toggle("vertical", shouldBeVertical);
      }
    },

    getFullSrc(img) {
      if (IS_F95) {
        const candidates = [img.getAttribute("data-src"), img.src].filter(
          Boolean,
        );
        const anchor = img.closest("a[href]");
        if (anchor) {
          const href = anchor.href;
          if (/\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i.test(href)) {
            candidates.unshift(href);
          }
        }
        for (const src of candidates) {
          const full = src.replace(/\/thumb\//, "/");
          if (full !== src) return full;
          if (src) return src;
        }
        return img.src;
      } else {
        return img.src.replace(/\.(md|th)\.(jpg|webp)$/i, ".$2");
      }
    },

    cleanAttr(str) {
      return str.replace(/\.(md|th)(?=\.)/, "");
    },

    processInlineElements() {
      document
        .querySelectorAll(SEL_IMG + ":not([data-processed-thumb])")
        .forEach((img) => {
          if (!IS_F95 && /\.(md|th)\.(jpg|webp)$/i.test(img.src)) {
            if (img.title) img.title = this.cleanAttr(img.title);
            if (img.alt) img.alt = this.cleanAttr(img.alt);
          }
          img.setAttribute("data-processed-thumb", "true");
        });

      document
        .querySelectorAll(
          ".message-attribution-opposite:not([data-processed-btn])",
        )
        .forEach((header) => {
          header.setAttribute("data-processed-btn", "true");
          if (header.querySelector(".sc-expand-btn")) return;

          const messageMain = header.closest(".message-main");
          const lbContainer = messageMain?.querySelector(
            ".js-lbContainer, .lbContainer",
          );
          if (!lbContainer) return;

          const btn = document.createElement("button");
          btn.className = "sc-expand-btn";
          btn.textContent = "⊞ EXP";
          btn.title = "Expand all images in this post";

          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const images = lbContainer.querySelectorAll(SEL_IMG);
            const expanding = !btn.classList.contains("is-expanded");

            images.forEach((img) => {
              img.classList.toggle("expanded", expanding);
              if (expanding) {
                const fullSrc = this.getFullSrc(img);
                if (fullSrc !== img.src) {
                  if (!img.dataset.origThumb) img.dataset.origThumb = img.src;
                  img.src = fullSrc;
                  img.removeAttribute("srcset");
                }
              } else {
                if (img.dataset.origThumb) {
                  img.src = img.dataset.origThumb;
                  delete img.dataset.origThumb;
                }
              }
            });

            btn.classList.toggle("is-expanded", expanding);
            btn.textContent = expanding ? "⊟ COL" : "⊞ EXP";
            btn.title = expanding
              ? "Collapse all images in this post"
              : "Expand all images in this post";
          });

          const li = document.createElement("li");
          li.appendChild(btn);
          header.appendChild(li);
        });
    },

    _filterVisibleElements(selector) {
      return Array.from(document.querySelectorAll(selector)).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0 || el.tagName === "DIV";
      });
    },

    refreshMediaPipelines() {
      this.mediaList = this._filterVisibleElements(SEL_IMG);

      const rawVideos = this._filterVisibleElements(SEL_VID);
      const seenVid = new Set();
      this._videoList = rawVideos.filter((el) => {
        if (seenVid.has(el)) return false;
        seenVid.add(el);
        return true;
      });

      const rawFull = this._filterVisibleElements(`${SEL_IMG}, ${SEL_VID}`);
      const seenFull = new Set();
      this._fullList = rawFull.filter((el) => {
        if (seenFull.has(el)) return false;
        seenFull.add(el);
        return true;
      });
    },

    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      document.querySelectorAll(SEL_IMG).forEach((img) => {
        img.classList.toggle("gv-expanded", this.isExpanded);
        img.classList.toggle("expanded", this.isExpanded);

        if (this.isExpanded) {
          const fullSrc = this.getFullSrc(img);
          if (fullSrc !== img.src) {
            if (!img.dataset.origThumb) img.dataset.origThumb = img.src;
            img.src = fullSrc;
            img.removeAttribute("srcset");
          }
        } else {
          if (img.dataset.origThumb) {
            img.src = img.dataset.origThumb;
            delete img.dataset.origThumb;
          }
        }
      });
      if (this.isExpanded && !IS_F95) {
        document
          .querySelectorAll('div[onclick*="redgifs.com"]')
          .forEach((div) => div.click());
      }
      this.updateUI();
    },

    // ─── Slideshow & Dynamic Autoplay Layouts ───────────────────────────────
    _getInterval() {
      const input = this.shadow.getElementById("ss-duration");
      let secs = parseInt(input?.value, 10);
      if (isNaN(secs) || secs <= 0) secs = 3;
      return secs * 1000;
    },

    _startSlideshow() {
      this._stopSlideshow();
      this._slideshowActive = true;
      this._updateSlideshowButton();
      this._evaluateActiveAutoplayContext();
    },

    _evaluateActiveAutoplayContext() {
      if (!this._slideshowActive) return;

      const currentItem = this._getActiveMediaNode();
      const isVideoItem = currentItem && currentItem.tagName !== "IMG";

      if (isVideoItem) {
        const video = this.shadow
          .getElementById("media-container")
          ?.querySelector("video");
        if (video) video.loop = false;

        const iframe = this.shadow
          .getElementById("media-container")
          ?.querySelector("iframe");
        if (iframe) {
          if (this._slideshowTimer) clearTimeout(this._slideshowTimer);
          this._slideshowTimer = setTimeout(() => {
            if (this._slideshowActive)
              this._navigateGallery(this._galleryMode, "slideshow_tick");
          }, 30000);
        }
      } else {
        this._scheduleSlideshowTick();
      }
    },

    _scheduleSlideshowTick() {
      if (!this._slideshowActive) return;

      const currentItem = this._getActiveMediaNode();
      if (currentItem && currentItem.tagName !== "IMG") return;

      const interval = this._getInterval();
      const ring = this.shadow.getElementById("ring-circle");
      if (ring) {
        ring.style.transition = "none";
        ring.style.strokeDashoffset = "100";
        void ring.getBoundingClientRect();
        ring.style.transition = `stroke-dashoffset ${interval}ms linear`;
        ring.style.strokeDashoffset = "0";
      }

      const ringEl = this.shadow.getElementById("slideshow-ring");
      if (ringEl) ringEl.classList.add("visible");

      this._slideshowTimer = setTimeout(() => {
        if (!this._slideshowActive) return;
        this._navigateGallery(this._galleryMode, "slideshow_tick");
      }, interval);
    },

    _getActiveMediaNode() {
      if (this._galleryMode === "video") return this._videoList[this._videoIdx];
      if (this._galleryMode === "full") return this._fullList[this._fullIdx];
      return this.mediaList[this.zoomIdx];
    },

    _stopSlideshow() {
      if (this._slideshowTimer) {
        clearTimeout(this._slideshowTimer);
        this._slideshowTimer = null;
      }
      this._slideshowActive = false;
      this._updateSlideshowButton();

      const ring = this.shadow.getElementById("ring-circle");
      if (ring) {
        ring.style.transition = "none";
        ring.style.strokeDashoffset = "100";
      }
      const ringEl = this.shadow.getElementById("slideshow-ring");
      if (ringEl) ringEl.classList.remove("visible");

      const video = this.shadow
        .getElementById("media-container")
        ?.querySelector("video");
      if (video) video.loop = true;
    },

    _toggleSlideshow() {
      if (this._slideshowActive) {
        this._stopSlideshow();
      } else {
        this._startSlideshow();
      }
    },

    _updateSlideshowButton() {
      const btn = this.shadow.getElementById("btn-slideshow");
      const icon = this.shadow.getElementById("slideshow-icon");
      if (!btn || !icon) return;

      btn.classList.toggle("active", this._slideshowActive);
      btn.title = this._slideshowActive ? "Pause slideshow" : "Start slideshow";

      if (this._slideshowActive) {
        icon.innerHTML = `<rect x="2" y="1" width="4" height="12" rx="1"/><rect x="8" y="1" width="4" height="12" rx="1"/>`;
      } else {
        icon.innerHTML = `<polygon points="3,1 13,7 3,13"/>`;
      }
    },

    // ─────────────────────────────────────────────────────────────────────────

    _fetchTurboCDNSrc(iframeEl) {
      return new Promise((resolve) => {
        if (IS_F95) return resolve(null); // Bypass for F95
        const src = iframeEl?.getAttribute("src");
        if (!src) return resolve(null);
        const id = src.split("/embed/")[1]?.split("?")[0];
        if (!id) return resolve(null);

        GM_xmlhttpRequest({
          method: "GET",
          url: `https://turbo.cr/api/sign?v=${id}`,
          headers: {
            Referer: `https://turbo.cr/embed/${id}`,
            Origin: "https://turbo.cr",
          },
          anonymous: false,
          timeout: 8000,
          onload(resp) {
            try {
              const data = JSON.parse(resp.responseText);
              const url =
                data.url ||
                data.src ||
                data.signed_url ||
                data.stream ||
                Object.values(data).find(
                  (v) => typeof v === "string" && v.includes("http"),
                );
              resolve(url || null);
            } catch {
              const match = resp.responseText.match(/https?:\/\/\S+/);
              resolve(match?.[0] ?? null);
            }
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null),
        });
      });
    },

    _parsePageNum(url) {
      const m = url.match(/\/page-(\d+)/) || url.match(/[?&]page=(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    },

    _getMaxPage() {
      let max = 1;
      const navs = document.querySelectorAll(
        ".pageNav a[href], .pageNav li.pageNav-page",
      );
      navs.forEach((el) => {
        const num =
          el.tagName === "A"
            ? this._parsePageNum(el.href)
            : parseInt(el.textContent.trim(), 10);
        if (num && num > max) max = num;
      });
      const current = this._parsePageNum(window.location.href);
      if (current && current > max) max = current;
      return max;
    },

    _getFirstPageUrl() {
      return window.location.href
        .replace(/\/page-\d+\/?/, "/")
        .replace(/[?&]page=\d+/, "")
        .split("#")[0];
    },

    _getAdjacentPageUrl(dir) {
      const base = (this._xpageUrl || window.location.href).split("#")[0];
      const currentPage = this._parsePageNum(base) || 1;
      const targetPage = currentPage + (dir > 0 ? 1 : -1);
      const maxPage = this._getMaxPage();

      if (targetPage < 1 || targetPage > maxPage) return null;

      if (/\/page-\d+/.test(base)) {
        return base.replace(/\/page-\d+/, `/page-${targetPage}`);
      } else if (/[?&]page=\d+/.test(base)) {
        return base.replace(/([?&]page=)\d+/, `$1${targetPage}`);
      } else {
        const qIdx = base.indexOf("?");
        const path = qIdx > -1 ? base.substring(0, qIdx) : base;
        const query = qIdx > -1 ? base.substring(qIdx) : "";
        const sep = path.endsWith("/") ? "" : "/";
        return `${path}${sep}page-${targetPage}${query}`;
      }
    },

    _fetchPageMedia(url, type = "image") {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout: 10000,
          onload: (resp) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(resp.responseText, "text/html");

            if (type === "video")
              resolve(
                Array.from(doc.querySelectorAll(SEL_VID)).filter(
                  (el) => el.src || el.getAttribute("src"),
                ),
              );
            else if (type === "full")
              resolve(
                Array.from(doc.querySelectorAll(`${SEL_IMG}, ${SEL_VID}`)),
              );
            else
              resolve(
                Array.from(doc.querySelectorAll(SEL_IMG)).filter(
                  (el) => el.src || el.getAttribute("data-src"),
                ),
              );
          },
          onerror: () => resolve([]),
          ontimeout: () => resolve([]),
        });
      });
    },

    _showCrossPageHint(msg) {
      const counter = this.shadow.getElementById("gv-counter");
      if (counter) counter.textContent = msg;
    },

    _trackInitialUnseenPosition() {
      const unreadAnchor = document.querySelector(
        ".u-anchorTarget#unread, .message.is-unread, .message--new",
      );
      if (unreadAnchor) {
        this._trackedUnseenElement = unreadAnchor.closest(".message");
        return;
      }

      const messages = document.querySelectorAll(".message");
      for (const msg of messages) {
        const rect = msg.getBoundingClientRect();
        if (rect.top >= -120 && rect.top <= window.innerHeight) {
          this._trackedUnseenElement = msg;
          break;
        }
      }
    },

    _getFirstUnseenIdx(list) {
      if (!list || !list.length) return 0;
      const firstUnreadMessage = this._trackedUnseenElement;
      if (!firstUnreadMessage) return 0;

      const idx = list.findIndex((el) => {
        const msgParent = el.closest(".message");
        if (!msgParent) return false;
        if (msgParent === firstUnreadMessage) return true;
        return !!(
          firstUnreadMessage.compareDocumentPosition(msgParent) &
          Node.DOCUMENT_POSITION_FOLLOWING
        );
      });

      return idx !== -1 ? idx : 0;
    },

    _getZoomTarget() {
      return (
        this.shadow.getElementById("media-container")?.querySelector("img") ??
        null
      );
    },

    _applyTransform() {
      const img = this._getZoomTarget();
      if (!img) return;
      img.style.transform =
        this._scale === 1
          ? ""
          : `translate(${this._panOffset.x}px, ${this._panOffset.y}px) scale(${this._scale})`;
      img.classList.toggle("zoomed", this._scale > 1);
    },

    _applyZoom(newScale) {
      this._scale = Math.min(
        this._maxScale,
        Math.max(this._minScale, newScale),
      );
      this._clampPan();
      this._applyTransform();
    },

    _clampPan() {
      const img = this._getZoomTarget();
      if (!img) return;
      const maxX = Math.max(
        0,
        (img.naturalWidth * this._scale - window.innerWidth) / 2 / this._scale,
      );
      const maxY = Math.max(
        0,
        (img.naturalHeight * this._scale - window.innerHeight) /
          2 /
          this._scale,
      );
      this._panOffset.x = Math.min(maxX, Math.max(-maxX, this._panOffset.x));
      this._panOffset.y = Math.min(maxY, Math.max(-maxY, this._panOffset.y));
    },

    _resetZoom() {
      this._scale = 1;
      this._panOffset.x = 0;
      this._panOffset.y = 0;
      this._isPanning = false;
      const img = this._getZoomTarget();
      if (img) {
        img.style.transform = "";
        img.classList.remove("zoomed");
      }
    },

    handleTouchStart(e) {
      if (e.touches.length === 2) {
        this._isPinching = true;
        this._isPanning = false;
        const [a, b] = e.touches;
        this._pinchDist = Math.hypot(
          b.clientX - a.clientX,
          b.clientY - a.clientY,
        );
      } else if (e.touches.length === 1) {
        if (e.target.closest("#gv-slideshow-ctrl")) return;
        this._isPinching = false;
        const t = e.changedTouches[0];
        this._touchStart.x = t.screenX;
        this._touchStart.y = t.screenY;
        const now = Date.now();
        if (now - this._lastTap < 300) {
          this._resetZoom();
          this._lastTap = 0;
          return;
        }
        this._lastTap = now;

        if (this._scale > 1) {
          this._isPanning = true;
          this._panStart.x = t.clientX - this._panOffset.x;
          this._panStart.y = t.clientY - this._panOffset.y;
        } else {
          this._isPanning = false;
        }
      }
    },

    handleTouchMove(e) {
      if (e.touches.length === 2 && this._pinchDist !== null) {
        e.preventDefault();
        const [a, b] = e.touches;
        const newDist = Math.hypot(
          b.clientX - a.clientX,
          b.clientY - a.clientY,
        );
        const ratio = newDist / this._pinchDist;
        this._pinchDist = newDist;
        this._applyZoom(this._scale * ratio);
      } else if (e.touches.length === 1 && this._isPanning) {
        e.preventDefault();
        const t = e.touches[0];
        this._panOffset.x = t.clientX - this._panStart.x;
        this._panOffset.y = t.clientY - this._panStart.y;
        this._clampPan();
        this._applyTransform();
      }
    },

    handleTouchEnd(e) {
      if (this._isPinching) {
        if (e.touches.length < 2) {
          this._isPinching = false;
          this._pinchDist = null;
          if (this._scale > 1) this._isPanning = true;
        }
        return;
      }
      if (this._isPanning) {
        if (e.touches.length === 0) this._isPanning = false;
        return;
      }
      if (e.target.closest("#gv-slideshow-ctrl")) return;
      const xEnd = e.changedTouches[0].screenX;
      const yEnd = e.changedTouches[0].screenY;
      const dx = xEnd - this._touchStart.x;
      const dy = yEnd - this._touchStart.y;
      const threshold = 50;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > threshold) {
          this._stopSlideshow();
          this._navigateGallery(this._galleryMode, dx > 0 ? -1 : 1);
        }
      } else if (Math.abs(dy) > threshold) {
        this.closeGallery();
      }
    },

    bindInternalEvents() {
      const s = this.shadow;
      const panel = s.getElementById("gv-panel");
      const overlay = s.getElementById("overlay");
      const ssInput = s.getElementById("ss-duration");

      const btnActionHandlers = {
        top: () => window.scrollTo({ top: 0, behavior: "smooth" }),
        bottom: () =>
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          }),
        expand: () => this.toggleExpand(),
        gallery: () => this.openGallery(0),
        vgallery: () => this.openVideoGallery(0),
        fullgallery: () => this.openFullGallery(0),
      };

      document.body.addEventListener("click", (e) => {
        const img = e.target.closest(SEL_IMG);
        if (
          !img ||
          e.target.closest("#overlay") ||
          e.target.closest("#gv-p-root")
        )
          return;

        e.preventDefault();
        e.stopPropagation();

        if (img.classList.contains("expanded")) {
          img.classList.remove("expanded");
          if (img.dataset.origThumb) {
            img.src = img.dataset.origThumb;
            delete img.dataset.origThumb;
          }
        } else {
          img.classList.add("expanded");
          const fullSrc = this.getFullSrc(img);
          if (fullSrc !== img.src) {
            if (!img.dataset.origThumb) img.dataset.origThumb = img.src;
            img.src = fullSrc;
            img.removeAttribute("srcset");
          }
        }
      });

      ssInput.addEventListener("change", () => {
        let val = parseInt(ssInput.value, 10);
        if (isNaN(val) || val <= 0) val = 3;
        ssInput.value = val;
        settings.slideshowSeconds = val;
        if (this._slideshowActive && this._galleryMode !== "video") {
          this._startSlideshow();
        }
      });
      ssInput.addEventListener("keydown", (e) => e.stopPropagation());

      s.addEventListener("click", (e) => {
        if (this._hasDragged) {
          setTimeout(() => (this._hasDragged = false), 50);
          return;
        }

        if (e.target.closest("#btn-slideshow")) {
          this._toggleSlideshow();
          return;
        }

        const btn = e.target.closest(".btn");
        if (btn) btnActionHandlers[btn.dataset.action]?.();
        if (["overlay", "media-container"].includes(e.target.id))
          this.closeGallery();
      });

      s.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const btn = e.target.closest(".btn");
          if (btn) {
            e.preventDefault();
            btnActionHandlers[btn.dataset.action]?.();
          }
          if (e.target.closest("#btn-slideshow")) {
            e.preventDefault();
            this._toggleSlideshow();
          }
        }
      });

      const dragTarget = this.isMobile ? panel : s.getElementById("gv-drag");

      dragTarget.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".btn")) return;
        const startX = e.clientX - panel.offsetLeft;
        const startY = e.clientY - panel.offsetTop;
        dragTarget.setPointerCapture(e.pointerId);

        const move = (m) => {
          panel.style.left = `${m.clientX - startX}px`;
          panel.style.top = `${m.clientY - startY}px`;
        };
        const up = () => {
          settings.panelLeft = panel.style.left;
          settings.panelTop = panel.style.top;
          this._updatePanelOrientation(panel);
          dragTarget.removeEventListener("pointermove", move);
          dragTarget.removeEventListener("pointerup", up);
        };

        dragTarget.addEventListener("pointermove", move);
        dragTarget.addEventListener("pointerup", up);
      });

      this._updatePanelOrientation(panel);

      overlay.addEventListener(
        "wheel",
        (e) => {
          if (
            s.elementFromPoint(e.clientX, e.clientY)?.matches("video, iframe")
          )
            return;
          e.preventDefault();

          if (e.buttons === 2) {
            this._applyZoom(
              this._scale + (e.deltaY < 0 ? this._zoomStep : -this._zoomStep),
            );
          } else if (Math.abs(e.deltaY) > 30) {
            const dir = e.deltaY > 0 ? 1 : -1;
            this._stopSlideshow();
            this._navigateGallery(this._galleryMode, dir);
          }
        },
        { passive: false },
      );

      overlay.addEventListener("touchstart", (e) => this.handleTouchStart(e), {
        passive: true,
      });
      overlay.addEventListener("touchmove", (e) => this.handleTouchMove(e), {
        passive: false,
      });
      overlay.addEventListener("touchend", (e) => this.handleTouchEnd(e), {
        passive: true,
      });

      overlay.addEventListener("mousedown", (e) => {
        if (e.button !== 0 || this._scale <= 1 || e.target.tagName !== "IMG")
          return;
        e.preventDefault();
        this._isPanning = true;
        this._hasDragged = false;
        this._panStart.x = e.clientX - this._panOffset.x;
        this._panStart.y = e.clientY - this._panOffset.y;
        e.target.classList.add("dragging");
      });

      overlay.addEventListener("mousemove", (e) => {
        if (!this._isPanning) return;
        this._hasDragged = true;
        this._panOffset.x = e.clientX - this._panStart.x;
        this._panOffset.y = e.clientY - this._panStart.y;
        this._clampPan();
        this._applyTransform();
      });

      const stopMousePan = () => {
        if (this._isPanning) {
          this._isPanning = false;
          this._getZoomTarget()?.classList.remove("dragging");
        }
      };
      overlay.addEventListener("mouseup", stopMousePan);
      overlay.addEventListener("mouseleave", stopMousePan);
    },

    // ─── Unified Gallery Navigation ──────────────────────────────────────────
    openGallery(dir = 0) {
      this._navigateGallery("main", dir);
    },
    openVideoGallery(dir = 0) {
      this._navigateGallery("video", dir);
    },
    openFullGallery(dir = 0) {
      this._navigateGallery("full", dir);
    },

    async _navigateGallery(mode, dir = 0) {
      this._galleryMode = mode;
      const isAutoTick = dir === "slideshow_tick";
      if (dir !== 0 && !isAutoTick) this._stopSlideshow();

      const ssInputWrapper = this.shadow.getElementById("ss-input-wrapper");
      if (ssInputWrapper)
        ssInputWrapper.style.display = mode === "video" ? "none" : "";

      if (!this._xpageLocked) {
        this.refreshMediaPipelines();
      }

      let list, currentIdxProp, fetchType;
      if (mode === "video") {
        list = this._videoList;
        currentIdxProp = "_videoIdx";
        fetchType = "video";
      } else if (mode === "full") {
        list = this._fullList;
        currentIdxProp = "_fullIdx";
        fetchType = "full";
      } else {
        list = this.mediaList;
        currentIdxProp = "zoomIdx";
        fetchType = "image";
      }

      if (!list || !list.length) return;

      if (dir === 0 && !this._xpageLocked) {
        this[currentIdxProp] = this._getFirstUnseenIdx(list);
      }

      const numDir = isAutoTick ? 1 : dir;
      const nextIdx = (this[currentIdxProp] || 0) + numDir;

      if (ssInputWrapper && mode === "full") {
        const activeNode =
          list[
            numDir === 0
              ? this[currentIdxProp]
              : (nextIdx + list.length) % list.length
          ];
        ssInputWrapper.style.display =
          activeNode && activeNode.tagName !== "IMG" ? "none" : "";
      }

      if (numDir > 0 && nextIdx >= list.length) {
        await this._handlePageBoundary(1, fetchType, currentIdxProp);
        return;
      }

      if (numDir < 0 && nextIdx < 0) {
        await this._handlePageBoundary(-1, fetchType, currentIdxProp);
        return;
      }

      this[currentIdxProp] =
        numDir === 0
          ? this[currentIdxProp]
          : (nextIdx + list.length) % list.length;
      await this._renderMedia(
        list[this[currentIdxProp]],
        this[currentIdxProp],
        list.length,
      );

      if (this._slideshowActive) this._evaluateActiveAutoplayContext();
    },

    async _handlePageBoundary(dir, fetchType, currentIdxProp) {
      const url = this._getAdjacentPageUrl(dir);
      const liveUrlClean = window.location.href.split("#")[0];
      const currentList = this._getListRef(fetchType);

      if (!url) {
        let targetUrl;
        if (dir > 0) {
          targetUrl = this._getFirstPageUrl();
        } else {
          const maxPage = this._getMaxPage();
          const base = this._getFirstPageUrl();
          if (maxPage <= 1) {
            targetUrl = base;
          } else {
            const qIdx = base.indexOf("?");
            const path = qIdx > -1 ? base.substring(0, qIdx) : base;
            const query = qIdx > -1 ? base.substring(qIdx) : "";
            const sep = path.endsWith("/") ? "" : "/";
            targetUrl = `${path}${sep}page-${maxPage}${query}`;
          }
        }

        const currentGalleryUrl = (
          this._xpageUrl || window.location.href
        ).split("#")[0];

        if (targetUrl === currentGalleryUrl) {
          this[currentIdxProp] = dir > 0 ? 0 : currentList.length - 1;
          await this._renderMedia(
            currentList[this[currentIdxProp]],
            this[currentIdxProp],
            currentList.length,
          );
        } else if (targetUrl === liveUrlClean) {
          this._resetPageLockAndRender(currentIdxProp, dir > 0 ? 0 : -1);
        } else {
          this._showCrossPageHint(
            `Wrapping to ${dir > 0 ? "page 1" : "last page"}…`,
          );
          await this._fetchAndRenderNewPage(
            targetUrl,
            fetchType,
            currentIdxProp,
            dir > 0 ? 0 : -1,
          );
        }
      } else {
        const targetClean = url.split("#")[0];
        if (targetClean === liveUrlClean) {
          this._resetPageLockAndRender(currentIdxProp, dir > 0 ? 0 : -1);
        } else {
          this._showCrossPageHint(
            `Loading ${dir > 0 ? "next" : "previous"} page…`,
          );
          await this._fetchAndRenderNewPage(
            url,
            fetchType,
            currentIdxProp,
            dir > 0 ? 0 : -1,
          );
        }
      }
      if (this._slideshowActive) this._evaluateActiveAutoplayContext();
    },

    async _fetchAndRenderNewPage(url, fetchType, currentIdxProp, defaultIdx) {
      const items = await this._fetchPageMedia(url, fetchType);
      if (items.length) {
        this._updateListRef(fetchType, items);
        this[currentIdxProp] = defaultIdx === -1 ? items.length - 1 : 0;
        this._xpageLocked = true;
        this._xpageUrl = url;
        await this._renderMedia(
          items[this[currentIdxProp]],
          this[currentIdxProp],
          items.length,
        );
      }
    },

    _resetPageLockAndRender(currentIdxProp, defaultIdx) {
      this._xpageLocked = false;
      this._xpageUrl = null;
      this.refreshMediaPipelines();
      const list = this._getListRef(
        currentIdxProp === "_videoIdx"
          ? "video"
          : currentIdxProp === "_fullIdx"
            ? "full"
            : "image",
      );
      if (!list || !list.length) return;
      this[currentIdxProp] = defaultIdx === -1 ? list.length - 1 : 0;
      this._renderMedia(
        list[this[currentIdxProp]],
        this[currentIdxProp],
        list.length,
      );
    },

    _updateListRef(fetchType, items) {
      if (fetchType === "video") this._videoList = items;
      else if (fetchType === "full") this._fullList = items;
      else this.mediaList = items;
    },

    _getListRef(fetchType) {
      if (fetchType === "video") return this._videoList;
      if (fetchType === "full") return this._fullList;
      return this.mediaList;
    },

    // ─────────────────────────────────────────────────────────────────────────

    _renderMedia: async function (current, idx, total) {
      const overlay = this.shadow.getElementById("overlay");
      const container = this.shadow.getElementById("media-container");
      overlay.style.display = "flex";
      document.body.classList.add("gv-noscroll");
      overlay.focus();

      if (this._decodeAbort) this._decodeAbort.abort();
      container.replaceChildren();
      this._resetZoom();

      if (current.tagName === "IMG") {
        const el = new Image();
        el.src = this.getFullSrc(current);
        const controller = new AbortController();
        this._decodeAbort = controller;
        try {
          await el.decode();
          if (controller.signal.aborted) return;
        } catch {}
        this._decodeAbort = null;
        container.appendChild(el);
      } else {
        let directSrc =
          current.tagName !== "DIV"
            ? await this._fetchTurboCDNSrc(current)
            : null;

        if (!directSrc) {
          const directNode =
            current.tagName === "VIDEO"
              ? current
              : current.querySelector("video, source");
          if (directNode)
            directSrc = directNode.getAttribute("src") || directNode.src;
        }

        const isDirectStream =
          directSrc &&
          /\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(directSrc.split("#")[0]);

        if (
          isDirectStream ||
          current.tagName === "VIDEO" ||
          (directSrc && current.tagName !== "IFRAME")
        ) {
          const el = document.createElement("video");
          el.src =
            directSrc || current.getAttribute("src") || current.currentSrc;
          el.removeAttribute("id");
          el.className = "";
          el.controls = true;
          el.loop = !this._slideshowActive;
          el.autoplay = true;
          el.preload = "auto";
          el.setAttribute("playsinline", "");
          el.volume = settings.videoVolume;
          el.muted = settings.videoMuted;

          el.addEventListener("volumechange", () => {
            settings.videoVolume = el.volume;
            settings.videoMuted = el.muted;
          });

          el.addEventListener("ended", () => {
            if (this._slideshowActive)
              this._navigateGallery(this._galleryMode, "slideshow_tick");
          });

          container.appendChild(el);
          el.play().catch(() => {
            el.muted = true;
            el.play().catch(() => {});
          });
        } else {
          const el = document.createElement("iframe");
          let src =
            current.tagName === "DIV"
              ? current.getAttribute("onclick")?.match(/'([^']+)'/)?.[1]
              : directSrc || current.src;
          if (src?.startsWith("//")) src = "https:" + src;
          el.style.cssText =
            "width: 85vw; height: 85vh; border: none; background: #000;";
          el.allow = "fullscreen; autoplay";
          el.setAttribute("allowfullscreen", "");
          container.appendChild(el);
          if (src) {
            try {
              const url = new URL(src);
              url.searchParams.set("autoplay", "1");
              el.src = url.toString();
            } catch {
              el.src = src;
            }
          }
        }
      }

      const ssInputWrapper = this.shadow.getElementById("ss-input-wrapper");
      if (ssInputWrapper)
        ssInputWrapper.style.display =
          current && current.tagName !== "IMG" ? "none" : "";

      this.shadow.getElementById("gv-counter").textContent =
        `${idx + 1} / ${total}`;
      this._updateSlideshowButton();
    },

    closeGallery() {
      this._stopSlideshow();
      this._resetZoom();
      this._xpageLocked = false;
      this._xpageUrl = null;

      const container = this.shadow.getElementById("media-container");
      const video = container.querySelector("video");
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
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
            document.activeElement.isContentEditable ||
            e.target.closest(".slideshow-input")
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
            this.openVideoGallery(0);
            return;
          }
          if (key === "f") {
            e.preventDefault();
            this.openFullGallery(0);
            return;
          }

          if (isVisible) {
            if (e.key === " ") {
              e.preventDefault();
              e.stopImmediatePropagation();
              this._toggleSlideshow();
              return;
            }

            const shiftDir = (dir) => {
              this._stopSlideshow();
              this._navigateGallery(this._galleryMode, dir);
            };

            const actions = {
              escape: () => this.closeGallery(),
              w: () => this.closeGallery(),
              s: () => this.closeGallery(),
              arrowup: () => this.closeGallery(),
              arrowdown: () => this.closeGallery(),
              a: () => shiftDir(-1),
              arrowleft: () => shiftDir(-1),
              d: () => shiftDir(1),
              arrowright: () => shiftDir(1),
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
    },
  };

  App.init();
})();
