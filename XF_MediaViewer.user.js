// ==UserScript==
// @name         XF Media Viewer
// @version      1.5
// @description  Streamlined media viewing experience for XenForo forums. Features mobile & keyboard support, inline expansion, slideshows, multi-media pipelines, and title extraction.
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
  const APP_DIM = "#b8f7ff";
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
    : 'video, iframe.saint-iframe, iframe[src*="video"], iframe[src*="redgifs"], iframe[src*="turbo"], div[onclick*="redgifs.com"]';

  // ── Settings persistence ────────────────────────────────────────────────
  const siteKey = IS_F95 ? "f95" : "sc";

  const SETTINGS_MAP = {
    panelTop: `gv_p_top_${siteKey}`,
    panelLeft: `gv_p_left_${siteKey}`,
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
        :host { --theme: ${APP_THEME}; --bg: #171717; --border: #262626; --t: 0.2s ease; font-family: system-ui, -apple-system, sans-serif; }
        input { font: inherit; }
        .panel {
          position: fixed; z-index: 9999; background: var(--bg); color: #efefef;
          border-radius: 8px; border: 1px solid var(--border); padding: 12px;
          width: 155px;
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
          font-weight: 700; color: #aaa; font-size: 11px; transition: all var(--t);
        }
        .btn-ss {
          background: transparent !important;
          border: none !important;
          color: #666;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-weight: 700;
          font-size: 16px;
          height: 24px;
          width: 24px;
          transition: color var(--t);
          user-select: none;
          outline: none;
        }
        .btn-ss:hover { color: var(--theme); }
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
          position: absolute; font-size: 9.5px; font-weight: 900;
          opacity: 0.9; top: 20px; left: 50%; transform: translateX(-50%); text-align: center;
          width: 90%; pointer-events: none;
          text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.9);
        }
        .z-model-name {
          font-size: 14px;
          color: var(--theme);
          margin-bottom: 6px;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .z-hotkeys {
          font-size: 8.5px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 3px;
        }
        .z-hotkeys .key { color: #ffffff; }

        #media-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
        #media-container :is(img, video, iframe) {
          max-width: 96vw;
          max-height: calc(100vh - 150px);
          object-fit: contain;
        }
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
          padding: 5px 15px; border-radius: 20px; border: none;
          white-space: nowrap; font-size: 13px;
          height: 22px; display: flex; align-items: center;
        }
        .dim { color: ${APP_DIM}; }

        .slideshow-ctrl {
          display: flex; align-items: center; background: rgba(0,0,0,0.8);
          border: none; border-radius: 20px; padding: 2px;
          gap: 0; transition: all var(--t);
        }
        #btn-slideshow {
          width: 32px; height: 32px; border-radius: 50%;
          background: #111;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all var(--t); flex-shrink: 0;
          color: #aaa; position: relative;
        }
        #btn-slideshow:hover { border-color: var(--theme); color: #fff; }
        #btn-slideshow.active { border-color: var(--theme); color: var(--theme); }
        #btn-slideshow svg { display: block; }

        .slideshow-input-wrapper { display: flex; align-items: center; padding-left: 4px; padding-right: 8px; }
        .slideshow-input {
          width: 24px; background: transparent; border: none; color: #fff;
          font-size: 12px; font-weight: 700;
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
          .panel { flex-direction: column; width: 70px; align-items: stretch; padding: 8px 5px; gap: 8px; box-sizing: border-box; cursor: grab; }
          .panel:active { cursor: grabbing; }
          .header { display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border); border-right: none; padding-bottom: 6px; padding-right: 0; font-size: 10px; min-width: 0; cursor: grab; }
          .header .lbl-full { display: none; }
          .header .lbl-short { display: inline; }
          .row.scroll-row { display: none; }
          .lbl-full { display: none; }
          .lbl-short { display: inline; }
          .btn { width: 100%; height: 38px; font-size: 10px; padding: 0 2px; box-sizing: border-box; flex: 0 0 auto; }
          .z-hotkeys { display: none !important; }
        }
      `);
      this.shadow.adoptedStyleSheets = [sheet];

      this.renderBase();
      this.updateUI();
      this.bindInternalEvents();
    },

    _getModelName() {
      const h1 = document.querySelector("h1.p-title-value");
      if (!h1) return "";
      let name = "";
      for (const node of h1.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) name = text;
        }
      }
      return name;
    },

    renderBase() {
      const defaultTop = this.isMobile
        ? GM_getValue(SETTINGS_MAP.panelTop, "80px")
        : settings.panelTop;
      const defaultLeft = this.isMobile
        ? GM_getValue(SETTINGS_MAP.panelLeft, "10px")
        : settings.panelLeft;

      const modelName = this._getModelName();

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
          <div class="btn" role="button" tabindex="0" data-action="fullgallery" id="btn-fullgallery" style="border-color: #444;">
            <span class="lbl-full"><u>F</u>ULL GALLERY</span>
            <span class="lbl-short">ALL</span>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="vgallery" id="btn-vgallery">
            <span class="lbl-full"><u>V</u>IDEO GALLERY</span>
            <span class="lbl-short">VID</span>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="gallery" id="btn-gallery">
            <span class="lbl-full">IMAGE&nbsp;<u>G</u>ALLERY</span>
            <span class="lbl-short">GAL</span>
          </div>
        </div>
        <div id="overlay" tabindex="-1">
          <div class="z-hint">
            ${modelName ? `<div class="z-model-name">${modelName}</div>` : ""}
            <div class="z-hotkeys">
              <span class="key">[A/←]</span> PREV ·
              <span class="key">[D/→]</span> NEXT ·
              <span class="key">[W/↑/ESC]</span> EXIT ·
              <span class="key">[SPACE]</span> AUTOPLAY ·
              <span class="key">[SCROLL]</span> TIMELINE ·
              <span class="key">[R-CLICK + SCROLL]</span> ZOOM
            </div>
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
                <div class="btn-ss" data-action="ss-dec">-</div>
                <input type="text" class="slideshow-input" id="ss-duration" value="${settings.slideshowSeconds}" maxlength="1" title="Duration per image">
                <span class="slideshow-unit">s</span>
                <div class="btn-ss" data-action="ss-inc">+</div>
              </div>
            </div>
            <div class="counter" id="gv-counter" title="Page & Media Index"></div>
          </div>
        </div>
      `;
    },

    updateUI() {
      const btnExpand = this.shadow.getElementById("btn-expand");
      btnExpand.innerHTML = this.isExpanded
        ? "<span class='lbl-full'>COLLAPSE ALL</span><span class='lbl-short'>COL</span>"
        : "<span class='lbl-full'>E<u>X</u>PAND ALL</span><span class='lbl-short'>EXP</span>";
    },

    _clampPanelToScreen(panel) {
      // Defer one frame so offsetWidth/Height are available after layout
      requestAnimationFrame(() => {
        const panelW = panel.offsetWidth;
        const panelH = panel.offsetHeight;
        if (!panelW || !panelH) return;
        const maxLeft = window.innerWidth - panelW;
        const maxTop = window.innerHeight - panelH;
        const curLeft = panel.offsetLeft;
        const curTop = panel.offsetTop;
        const clampedLeft = Math.min(maxLeft, Math.max(0, curLeft));
        const clampedTop = Math.min(maxTop, Math.max(0, curTop));
        if (clampedLeft !== curLeft) panel.style.left = `${clampedLeft}px`;
        if (clampedTop !== curTop) panel.style.top = `${clampedTop}px`;
      });
    },

    getFullSrc(img) {
      if (IS_F95) {
        const candidates = [img.getAttribute("data-src"), img.src].filter(
          Boolean,
        );
        const anchor = img.closest("a[href]");
        if (anchor) {
          const href = anchor.href;
          if (/\.(jpe?g|png|gif|webp|bmp|avif)(\?|$)/i.test(href))
            candidates.unshift(href);
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

    // ── Media pipeline helpers ───────────────────────────────────────────────
    refreshMediaPipelines() {
      this.mediaList = this._filterVisibleElements(SEL_IMG);
      this._videoList = [...new Set(this._filterVisibleElements(SEL_VID))];
      this._fullList = [
        ...new Set(this._filterVisibleElements(`${SEL_IMG}, ${SEL_VID}`)),
      ];
    },

    // Returns the canonical config for a given gallery mode.
    _getModeConfig(mode) {
      if (mode === "video")
        return {
          list: this._videoList,
          idxProp: "_videoIdx",
          fetchType: "video",
        };
      if (mode === "full")
        return { list: this._fullList, idxProp: "_fullIdx", fetchType: "full" };
      return { list: this.mediaList, idxProp: "zoomIdx", fetchType: "image" };
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

    // Builds the counter innerHTML string — single source of truth.
    _buildCounterHTML(idx, total) {
      const currentPage =
        this._parsePageNum(this._xpageUrl || window.location.href) || 1;
      const maxPage = Math.max(currentPage, this._getMaxPage());
      return `pg.&nbsp; <span class="dim">${currentPage}</span>&nbsp; / &nbsp;${maxPage}&nbsp; — &nbsp;<span class="dim">${idx + 1}</span>&nbsp; / &nbsp;${total}`;
    },

    // ── Expand / Collapse ────────────────────────────────────────────────────
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

    // ── Wake Lock ────────────────────────────────────────────────────────────
    _wakeLock: null,

    async _acquireWakeLock() {
      if (!('wakeLock' in navigator)) return;
      try {
        this._wakeLock = await navigator.wakeLock.request('screen');
        this._wakeLock.addEventListener('release', () => {
          this._wakeLock = null;
        });
      } catch {}
    },

    _releaseWakeLock() {
      if (this._wakeLock) {
        this._wakeLock.release().catch(() => {});
        this._wakeLock = null;
      }
    },

    // ── Slideshow ────────────────────────────────────────────────────────────
    _getInterval() {
      const input = this.shadow.getElementById("ss-duration");
      let secs = parseInt(input?.value, 10);
      if (isNaN(secs) || secs <= 0) secs = 3;
      return secs * 1000;
    },

    _startSlideshow() {
      this._stopSlideshow();
      this._slideshowActive = true;
      this._acquireWakeLock();
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
      return this._getModeConfig(this._galleryMode).list[
        this[this._getModeConfig(this._galleryMode).idxProp]
      ];
    },

    _stopSlideshow() {
      if (this._slideshowTimer) {
        clearTimeout(this._slideshowTimer);
        this._slideshowTimer = null;
      }
      this._slideshowActive = false;
      this._releaseWakeLock();
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
      icon.innerHTML = this._slideshowActive
        ? `<rect x="2" y="1" width="4" height="12" rx="1"/><rect x="8" y="1" width="4" height="12" rx="1"/>`
        : `<polygon points="3,1 13,7 3,13"/>`;
    },

    // ── Cross-page fetching ──────────────────────────────────────────────────
    _fetchTurboCDNSrc(iframeEl) {
      return new Promise((resolve) => {
        if (IS_F95) return resolve(null);
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
      const jumpInput = document.querySelector(
        'input.js-pageJumpPage, input[name="page"]',
      );
      if (jumpInput && jumpInput.max) {
        const val = parseInt(jumpInput.max, 10);
        if (val && val > max) max = val;
      }
      const navs = document.querySelectorAll(
        ".pageNav-main a[href], .pageNav-main li.pageNav-page, .pageNav a[href], .pageNav li.pageNav-page",
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

    // Returns the base thread URL with page number and fragment stripped.
    _getBaseThreadUrl(url) {
      return (url || window.location.href)
        .replace(/\/page-\d+\/?/, "/")
        .replace(/[?&]page=\d+/, "")
        .split("#")[0];
    },

    _getFirstPageUrl() {
      return this._getBaseThreadUrl();
    },

    _getAdjacentPageUrl(dir, baseOverride = null) {
      const base = (
        baseOverride ||
        this._xpageUrl ||
        window.location.href
      ).split("#")[0];
      const currentPage = this._parsePageNum(base) || 1;
      const targetPage = currentPage + (dir > 0 ? 1 : -1);
      const maxPage = this._getMaxPage();
      if (targetPage < 1 || targetPage > maxPage) return null;

      if (/\/page-\d+/.test(base))
        return base.replace(/\/page-\d+/, `/page-${targetPage}`);
      if (/[?&]page=\d+/.test(base))
        return base.replace(/([?&]page=)\d+/, `$1${targetPage}`);

      const cleanBase = this._getBaseThreadUrl(base);
      const sep = cleanBase.endsWith("/") ? "" : "/";
      return `${cleanBase}${sep}page-${targetPage}`;
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

    // ── Unseen tracking ──────────────────────────────────────────────────────
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

    // ── Zoom / pan ───────────────────────────────────────────────────────────
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
        (img.clientWidth * this._scale - window.innerWidth) / 2,
      );
      const maxY = Math.max(
        0,
        (img.clientHeight * this._scale - window.innerHeight) / 2,
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

    // ── Touch handling ───────────────────────────────────────────────────────
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
          this._edgeSwipeDelta = 0;
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

        // 1. Calculate the intended un-clamped coordinates first
        const targetX = t.clientX - this._panStart.x;
        const targetY = t.clientY - this._panStart.y;

        // 2. Determine if the user is dragging past the horizontal bounds
        const img = this._getZoomTarget();
        if (img) {
          const maxX = Math.max(
            0,
            (img.clientWidth * this._scale - window.innerWidth) / 2,
          );

          if (targetX > maxX) {
            this._edgeSwipeDelta = targetX - maxX; // Dragging right past the left edge
          } else if (targetX < -maxX) {
            this._edgeSwipeDelta = targetX + maxX; // Dragging left past the right edge
          } else {
            this._edgeSwipeDelta = 0; // Still inside image bounds
          }
        }

        // 3. Apply the coordinates, clamp them, and render
        this._panOffset.x = targetX;
        this._panOffset.y = targetY;
        this._clampPan(); // Uses your new layout-based clientWidth calculation
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
        if (e.touches.length === 0) {
          this._isPanning = false;

          // ─── EDGE RESISTANCE CHECK ──────────────────────────────────────────
          const SWIPE_THRESHOLD = 60; // Min pixels past the edge required to swipe
          if (Math.abs(this._edgeSwipeDelta) > SWIPE_THRESHOLD) {
            // Dragging right past left edge (delta > 0) -> Prev item (-1)
            // Dragging left past right edge (delta < 0) -> Next item (1)
            const direction = this._edgeSwipeDelta > 0 ? -1 : 1;

            // Clean up tracking and reset zoom states for the next item
            this._edgeSwipeDelta = 0;
            this._scale = 1;
            this._panOffset = { x: 0, y: 0 };

            this._navigateGallery(this._galleryMode, direction);
            return;
          }
          // ───────────────────────────────────────────────────────────────────
        }
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
          this._navigateGallery(this._galleryMode, dx > 0 ? -1 : 1);
        }
      } else if (Math.abs(dy) > threshold) {
        this.closeGallery();
      }
    },

    // ── Event binding ────────────────────────────────────────────────────────
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
        gallery: () => this._navigateGallery("main", 0),
        vgallery: () => this._navigateGallery("video", 0),
        fullgallery: () => this._navigateGallery("full", 0),
      };

      // Inline image click expansion
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

      // Duration input logic
      ssInput.addEventListener("change", () => {
        let val = parseInt(ssInput.value, 10);
        if (isNaN(val) || val <= 0) val = 3;
        ssInput.value = val;
        settings.slideshowSeconds = val;
        if (this._slideshowActive && this._galleryMode !== "video")
          this._startSlideshow();
      });
      ssInput.addEventListener("keydown", (e) => e.stopPropagation());

      // Combined click handler
      s.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn");
        const btnSs = e.target.closest(".btn-ss");
        const btnSlideshow = e.target.closest("#btn-slideshow");

        const onOverlay =
          e.target.id === "overlay" || e.target.id === "media-container";
        const onMedia = e.target.closest("img, video, iframe");
        const onControls = e.target.closest(".counter-row, .z-hint");

        if (onOverlay && !onMedia && !onControls) {
          this.closeGallery();
          return;
        }

        if (btn && btn.dataset.action) {
          btnActionHandlers[btn.dataset.action]?.();
        } else if (btnSlideshow) {
          this._toggleSlideshow();
        } else if (btnSs) {
          let val = parseInt(ssInput.value, 10);
          if (isNaN(val)) val = 1;
          if (btnSs.dataset.action === "ss-inc" && val < 9) val++;
          if (btnSs.dataset.action === "ss-dec" && val > 1) val--;
          ssInput.value = val;
          settings.slideshowSeconds = val;
          if (this._slideshowActive) this._startSlideshow();
        }
      });

      // Dragging logic
      const dragTarget = this.isMobile ? panel : s.getElementById("gv-drag");
      dragTarget.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".btn, .btn-ss, #ss-duration")) return;
        const startX = e.clientX - panel.offsetLeft;
        const startY = e.clientY - panel.offsetTop;
        dragTarget.setPointerCapture(e.pointerId);
        const move = (m) => {
          const panelW = panel.offsetWidth;
          const panelH = panel.offsetHeight;
          const maxLeft = window.innerWidth - panelW;
          const maxTop = window.innerHeight - panelH;
          const newLeft = Math.min(maxLeft, Math.max(0, m.clientX - startX));
          const newTop = Math.min(maxTop, Math.max(0, m.clientY - startY));
          panel.style.left = `${newLeft}px`;
          panel.style.top = `${newTop}px`;
        };
        const up = () => {
          settings.panelLeft = panel.style.left;
          settings.panelTop = panel.style.top;
          dragTarget.removeEventListener("pointermove", move);
          dragTarget.removeEventListener("pointerup", up);
        };
        dragTarget.addEventListener("pointermove", move);
        dragTarget.addEventListener("pointerup", up);
      });

      this._clampPanelToScreen(panel);

      // Overlay wheel
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
            this._navigateGallery(this._galleryMode, e.deltaY > 0 ? 1 : -1);
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
        this._panStart.x = e.clientX - this._panOffset.x;
        this._panStart.y = e.clientY - this._panOffset.y;
        e.target.classList.add("dragging");
      });

      overlay.addEventListener("mousemove", (e) => {
        if (!this._isPanning) return;
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

    // ── Gallery navigation ───────────────────────────────────────────────────
    async _navigateGallery(mode, dir = 0) {
      this._galleryMode = mode;
      const isAutoTick = dir === "slideshow_tick";
      if (dir !== 0 && !isAutoTick) this._stopSlideshow();

      if (!this._xpageLocked) this.refreshMediaPipelines();

      const {
        list,
        idxProp: currentIdxProp,
        fetchType,
      } = this._getModeConfig(mode);
      if (!list || !list.length) return;

      if (dir === 0 && !this._xpageLocked) {
        this[currentIdxProp] = this._getFirstUnseenIdx(list);
      }

      const numDir = isAutoTick ? 1 : dir;
      const nextIdx = (this[currentIdxProp] || 0) + numDir;

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
      let attempts = 0;
      let currentScanUrl = this._xpageUrl || window.location.href;
      const liveUrlClean = window.location.href.split("#")[0];

      while (attempts < 10) {
        attempts++;
        let nextUrl = this._getAdjacentPageUrl(dir, currentScanUrl);

        if (!nextUrl) {
          if (dir > 0) {
            nextUrl = this._getFirstPageUrl();
          } else {
            const maxPage = this._getMaxPage();
            const base = this._getFirstPageUrl();
            if (maxPage <= 1) {
              nextUrl = base;
            } else {
              const sep = base.endsWith("/") ? "" : "/";
              nextUrl = `${base}${sep}page-${maxPage}`;
            }
          }
        }

        const targetClean = nextUrl.split("#")[0];
        this._showCrossPageHint(
          `Scanning page ${this._parsePageNum(nextUrl) || 1}…`,
        );
        const items = await this._fetchPageMedia(nextUrl, fetchType);

        if (items.length > 0) {
          if (targetClean === liveUrlClean) {
            this._resetPageLockAndRender(
              currentIdxProp,
              fetchType,
              dir > 0 ? 0 : -1,
            );
          } else {
            this._updateListRef(fetchType, items);
            this[currentIdxProp] = dir > 0 ? 0 : items.length - 1;
            this._xpageLocked = true;
            this._xpageUrl = nextUrl;
            await this._renderMedia(
              items[this[currentIdxProp]],
              this[currentIdxProp],
              items.length,
            );
          }
          if (this._slideshowActive) this._evaluateActiveAutoplayContext();
          return;
        }

        currentScanUrl = nextUrl;
      }

      this._showCrossPageHint("Stopped scanning (no media found recently).");
      this._stopSlideshow();

      setTimeout(() => {
        const list = this._getListRef(fetchType);
        const idx = this[currentIdxProp];
        const counter = this.shadow.getElementById("gv-counter");
        if (counter && list && list.length) {
          counter.innerHTML = this._buildCounterHTML(idx, list.length);
        }
      }, 2500);
    },

    _resetPageLockAndRender(currentIdxProp, fetchType, defaultIdx) {
      this._xpageLocked = false;
      this._xpageUrl = null;
      this.refreshMediaPipelines();
      const list = this._getListRef(fetchType);
      if (!list || !list.length) return;
      this[currentIdxProp] = defaultIdx === -1 ? list.length - 1 : 0;
      this._renderMedia(
        list[this[currentIdxProp]],
        this[currentIdxProp],
        list.length,
      );
    },

    // ── Media rendering ──────────────────────────────────────────────────────
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

      // Hide slideshow duration input for non-image media
      const ssInputWrapper = this.shadow.getElementById("ss-input-wrapper");
      if (ssInputWrapper)
        ssInputWrapper.style.display = current.tagName !== "IMG" ? "none" : "";

      this.shadow.getElementById("gv-counter").innerHTML =
        this._buildCounterHTML(idx, total);
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

    // ── Global keyboard events ───────────────────────────────────────────────
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
            this._navigateGallery("main", 0);
            return;
          }
          if (key === "x") {
            e.preventDefault();
            this.toggleExpand();
            return;
          }
          if (key === "v") {
            e.preventDefault();
            this._navigateGallery("video", 0);
            return;
          }
          if (key === "f") {
            e.preventDefault();
            this._navigateGallery("full", 0);
            return;
          }

          if (isVisible) {
            if (e.key === " ") {
              e.preventDefault();
              e.stopImmediatePropagation();
              this._toggleSlideshow();
              return;
            }

            const actions = {
              escape: () => this.closeGallery(),
              w: () => this.closeGallery(),
              s: () => this.closeGallery(),
              arrowup: () => this.closeGallery(),
              arrowdown: () => this.closeGallery(),
              a: () => this._navigateGallery(this._galleryMode, -1),
              arrowleft: () => this._navigateGallery(this._galleryMode, -1),
              d: () => this._navigateGallery(this._galleryMode, 1),
              arrowright: () => this._navigateGallery(this._galleryMode, 1),
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
