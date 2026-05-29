// ==UserScript==
// @name         XF Media Viewer
// @version      1.8
// @description  Streamlined media viewing experience for XenForo forums. Features mobile & keyboard support, inline expansion, slideshows, multi-media pipelines, and title extraction.
// @author       JR
// @license      MIT
// @include      /^[^:]*?:\/\/simpcity\.[^/]*?\/threads\/.*?$/
// @include      /^[^:]*?:\/\/f95zone\.to\/threads\/.*?$/
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

  // Combined selector reused across pipelines
  const SEL_FULL = `${SEL_IMG}, ${SEL_VID}`;

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
    _lastTap: 0,
    _decodeAbort: null,
    _galleryMode: "main", // "main" | "video" | "full"
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
    _edgeSwipeDelta: 0,
    _xpageLocked: false,
    _xpageUrl: null,
    _trackedUnseenElement: null,
    _observer: null,
    _slideshowTimer: null,
    _slideshowActive: false,
    _mediaListenerAbort: null,

    // ── Cached shadow-DOM element references (populated in bindInternalEvents) ──
    _el: {},

    init() {
      this.injectGlobalStyles();
      this.createHost();
      this.processInlineElements();
      this.refreshMediaPipelines();
      this._trackInitialUnseenPosition();
      this.setupGlobalEvents();

      let debounceTimeout = null;
      this._observer = new MutationObserver((mutations) => {
        if (!mutations.some((m) => m.addedNodes.length > 0)) return;
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          this.processInlineElements();
          this.refreshMediaPipelines();
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
        .btn-jump {
          background: transparent; border: none; color: #555;
          font-size: 13px; font-weight: 900; cursor: pointer;
          padding: 0 4px; line-height: 1; transition: color var(--t);
          user-select: none; outline: none; display: flex; align-items: center;
        }
        .btn-jump:hover { color: var(--theme); }

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
      for (const node of h1.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) return text;
        }
      }
      return "";
    },

    renderBase() {
      const modelName = this._getModelName();
      this.shadow.innerHTML = `
        <div class="panel" id="gv-panel" style="top: ${settings.panelTop}; left: ${settings.panelLeft}">
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
              <span class="key">[-/+]</span> DURATION ·
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
            <div class="counter" id="gv-counter" title="Page & Media Index">
              <button class="btn-jump" id="btn-jump-first" title="First media on this page">&#171;</button>
              <span id="gv-counter-text"></span>
              <button class="btn-jump" id="btn-jump-last" title="Last media on this page">&#187;</button>
            </div>
          </div>
        </div>
      `;
    },

    updateUI() {
      const btnExpand =
        this._el.btnExpand || this.shadow.getElementById("btn-expand");
      btnExpand.innerHTML = this.isExpanded
        ? "<span class='lbl-full'>COLLAPSE ALL</span><span class='lbl-short'>COL</span>"
        : "<span class='lbl-full'>E<u>X</u>PAND ALL</span><span class='lbl-short'>EXP</span>";
    },

    _clampPanelToScreen(panel) {
      requestAnimationFrame(() => {
        const panelW = panel.offsetWidth;
        const panelH = panel.offsetHeight;
        if (!panelW || !panelH) return;
        const maxLeft = window.innerWidth - panelW;
        const maxTop = window.innerHeight - panelH;
        const newLeft = Math.min(maxLeft, Math.max(0, panel.offsetLeft));
        const newTop = Math.min(maxTop, Math.max(0, panel.offsetTop));
        if (newLeft !== panel.offsetLeft) panel.style.left = `${newLeft}px`;
        if (newTop !== panel.offsetTop) panel.style.top = `${newTop}px`;
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
      }
      return img.src.replace(/\.(md|th)\.(jpg|webp)$/i, ".$2");
    },

    cleanAttr: (str) => str.replace(/\.(md|th)(?=\.)/, ""),

    processInlineElements() {
      document
        .querySelectorAll(`${SEL_IMG}:not([data-processed-thumb])`)
        .forEach((img) => {
          if (!IS_F95 && /\.(md|th)\.(jpg|webp)$/i.test(img.src)) {
            if (img.title) img.title = App.cleanAttr(img.title);
            if (img.alt) img.alt = App.cleanAttr(img.alt);
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

          const lbContainer = header
            .closest(".message-main")
            ?.querySelector(".js-lbContainer, .lbContainer");
          if (!lbContainer) return;

          const btn = document.createElement("button");
          btn.className = "sc-expand-btn";
          btn.textContent = "⊞ EXP";
          btn.title = "Expand all images in this post";

          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const expanding = !btn.classList.contains("is-expanded");
            lbContainer
              .querySelectorAll(SEL_IMG)
              .forEach((img) => this._applyImageExpand(img, expanding));
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

    _filterVisible(elements) {
      return elements.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0 || el.tagName === "DIV";
      });
    },

    // ── Media pipeline ───────────────────────────────────────────────────────
    refreshMediaPipelines() {
      // Single DOM pass — split into three lists in one shot
      const all = this._filterVisible(
        Array.from(document.querySelectorAll(SEL_FULL)),
      );
      this._fullList = [...new Set(all)];
      this.mediaList = all.filter((el) => el.matches(SEL_IMG));
      this._videoList = [...new Set(all.filter((el) => el.matches(SEL_VID)))];
    },

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

    _buildCounterHTML(idx, total) {
      const currentPage =
        this._parsePageNum(this._xpageUrl || window.location.href) || 1;
      const maxPage = Math.max(currentPage, this._getMaxPage());
      return `pg.&nbsp; <span class="dim">${currentPage}</span>&nbsp; / &nbsp;${maxPage}&nbsp; — &nbsp;<span class="dim">${idx + 1}</span>&nbsp; / &nbsp;${total}`;
    },

    // ── Page lock helpers ────────────────────────────────────────────────────
    _resetPageLock() {
      this._xpageLocked = false;
      this._xpageUrl = null;
    },

    // ── Expand / Collapse ────────────────────────────────────────────────────
    _applyImageExpand(img, expanding) {
      img.classList.toggle("gv-expanded", expanding);
      img.classList.toggle("expanded", expanding);
      if (expanding) {
        const fullSrc = this.getFullSrc(img);
        if (fullSrc !== img.src) {
          if (!img.dataset.origThumb) img.dataset.origThumb = img.src;
          img.src = fullSrc;
          img.removeAttribute("srcset");
        }
      } else if (img.dataset.origThumb) {
        img.src = img.dataset.origThumb;
        delete img.dataset.origThumb;
      }
    },

    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      document
        .querySelectorAll(SEL_IMG)
        .forEach((img) => this._applyImageExpand(img, this.isExpanded));
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
      if (!("wakeLock" in navigator)) return;
      try {
        this._wakeLock = await navigator.wakeLock.request("screen");
        this._wakeLock.addEventListener("release", () => {
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

    // ── Ring animation helper (DRY) ──────────────────────────────────────────
    _resetRing() {
      const ring = this._el.ring;
      const ringEl = this._el.ringEl;
      if (ring) {
        ring.style.transition = "none";
        ring.style.strokeDashoffset = "100";
      }
      if (ringEl) ringEl.classList.remove("visible");
    },

    _animateRing(intervalMs) {
      const ring = this._el.ring;
      const ringEl = this._el.ringEl;
      if (!ring) return;
      ring.style.transition = "none";
      ring.style.strokeDashoffset = "100";
      void ring.getBoundingClientRect(); // force reflow
      ring.style.transition = `stroke-dashoffset ${intervalMs}ms linear`;
      ring.style.strokeDashoffset = "0";
      if (ringEl) ringEl.classList.add("visible");
    },

    // ── Slideshow ────────────────────────────────────────────────────────────
    _getInterval() {
      const secs = settings.slideshowSeconds;
      return (secs > 0 ? secs : 3) * 1000;
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

      // Clear any in-flight timer and reset ring before scheduling a fresh one
      clearTimeout(this._slideshowTimer);
      this._slideshowTimer = null;
      this._resetRing();

      const currentItem = this._getActiveMediaNode();
      if (currentItem && currentItem.tagName !== "IMG") {
        // Video path — stop looping so `ended` event fires
        const container = this._el.container;
        const video = container?.querySelector("video");
        if (video) video.loop = false;

        // Iframes get a generous fallback timer
        if (container?.querySelector("iframe")) {
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
      if (this._getActiveMediaNode()?.tagName !== "IMG") return;

      const interval = this._getInterval();
      this._animateRing(interval);

      this._slideshowTimer = setTimeout(() => {
        if (!this._slideshowActive) return;
        this._navigateGallery(this._galleryMode, "slideshow_tick");
      }, interval);
    },

    _getActiveMediaNode() {
      const { list, idxProp } = this._getModeConfig(this._galleryMode);
      return list[this[idxProp]];
    },

    _stopSlideshow() {
      clearTimeout(this._slideshowTimer);
      this._slideshowTimer = null;
      this._slideshowActive = false;
      this._releaseWakeLock();
      this._updateSlideshowButton();
      this._resetRing();

      const video = this._el.container?.querySelector("video");
      if (video) video.loop = true;
    },

    _toggleSlideshow() {
      if (this._slideshowActive) this._stopSlideshow();
      else this._startSlideshow();
    },

    _updateSlideshowButton() {
      const btn = this._el.btnSlideshow;
      const icon = this._el.slideshowIcon;
      if (!btn || !icon) return;
      btn.classList.toggle("active", this._slideshowActive);
      btn.title = this._slideshowActive ? "Pause slideshow" : "Start slideshow";
      icon.innerHTML = this._slideshowActive
        ? `<rect x="2" y="1" width="4" height="12" rx="1"/><rect x="8" y="1" width="4" height="12" rx="1"/>`
        : `<polygon points="3,1 13,7 3,13"/>`;
    },

    // ── Slideshow duration adjustment ────────────────────────────────────────
    _adjustSlideshowDuration(delta) {
      const input = this._el.ssDuration;
      if (!input) return;
      let val = parseInt(input.value, 10);
      if (isNaN(val)) val = 3;
      val = Math.min(9, Math.max(1, val + delta));
      input.value = val;
      settings.slideshowSeconds = val;
      if (this._slideshowActive) this._startSlideshow();
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
      if (jumpInput?.max) {
        const val = parseInt(jumpInput.max, 10);
        if (val > max) max = val;
      }
      document
        .querySelectorAll(
          ".pageNav-main a[href], .pageNav-main li.pageNav-page, .pageNav a[href], .pageNav li.pageNav-page",
        )
        .forEach((el) => {
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

    _getBaseThreadUrl(url) {
      return (url || window.location.href)
        .replace(/\/page-\d+\/?/, "/")
        .replace(/[?&]page=\d+/, "")
        .split("#")[0];
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
      return `${cleanBase}${cleanBase.endsWith("/") ? "" : "/"}page-${targetPage}`;
    },

    _fetchPageMedia(url, type = "image") {
      return new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout: 10000,
          onload: (resp) => {
            const doc = new DOMParser().parseFromString(
              resp.responseText,
              "text/html",
            );
            if (type === "video")
              resolve(
                Array.from(doc.querySelectorAll(SEL_VID)).filter(
                  (el) => el.src || el.getAttribute("src"),
                ),
              );
            else if (type === "full")
              resolve(Array.from(doc.querySelectorAll(SEL_FULL)));
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
      if (this._el.counterText) this._el.counterText.textContent = msg;
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
      for (const msg of document.querySelectorAll(".message")) {
        const rect = msg.getBoundingClientRect();
        if (rect.top >= -120 && rect.top <= window.innerHeight) {
          this._trackedUnseenElement = msg;
          break;
        }
      }
    },

    _getFirstUnseenIdx(list) {
      if (!list?.length || !this._trackedUnseenElement) return 0;
      const idx = list.findIndex((el) => {
        const msgParent = el.closest(".message");
        if (!msgParent) return false;
        if (msgParent === this._trackedUnseenElement) return true;
        return !!(
          this._trackedUnseenElement.compareDocumentPosition(msgParent) &
          Node.DOCUMENT_POSITION_FOLLOWING
        );
      });
      return idx !== -1 ? idx : 0;
    },

    // ── Zoom / pan ───────────────────────────────────────────────────────────
    _getZoomTarget() {
      return this._el.container?.querySelector("img") ?? null;
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
        this._applyZoom(this._scale * (newDist / this._pinchDist));
        this._pinchDist = newDist;
      } else if (e.touches.length === 1 && this._isPanning) {
        e.preventDefault();
        const t = e.touches[0];
        const targetX = t.clientX - this._panStart.x;
        const targetY = t.clientY - this._panStart.y;

        const img = this._getZoomTarget();
        if (img) {
          const maxX = Math.max(
            0,
            (img.clientWidth * this._scale - window.innerWidth) / 2,
          );
          this._edgeSwipeDelta =
            targetX > maxX
              ? targetX - maxX
              : targetX < -maxX
                ? targetX + maxX
                : 0;
        }

        this._panOffset.x = targetX;
        this._panOffset.y = targetY;
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
        if (e.touches.length === 0) {
          this._isPanning = false;
          if (Math.abs(this._edgeSwipeDelta) > 60) {
            const direction = this._edgeSwipeDelta > 0 ? -1 : 1;
            this._edgeSwipeDelta = 0;
            this._scale = 1;
            this._panOffset = { x: 0, y: 0 };
            this._navigateGallery(this._galleryMode, direction);
          }
        }
        return;
      }

      if (e.target.closest("#gv-slideshow-ctrl")) return;
      const dx = e.changedTouches[0].screenX - this._touchStart.x;
      const dy = e.changedTouches[0].screenY - this._touchStart.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 50)
          this._navigateGallery(this._galleryMode, dx > 0 ? -1 : 1);
      } else if (Math.abs(dy) > 50) {
        this.closeGallery();
      }
    },

    // ── Event binding ────────────────────────────────────────────────────────
    bindInternalEvents() {
      const s = this.shadow;

      // Cache frequently accessed shadow-DOM nodes
      this._el = {
        panel: s.getElementById("gv-panel"),
        overlay: s.getElementById("overlay"),
        container: s.getElementById("media-container"),
        counterText: s.getElementById("gv-counter-text"),
        btnExpand: s.getElementById("btn-expand"),
        btnSlideshow: s.getElementById("btn-slideshow"),
        slideshowIcon: s.getElementById("slideshow-icon"),
        ssInputWrapper: s.getElementById("ss-input-wrapper"),
        ssDuration: s.getElementById("ss-duration"),
        ring: s.getElementById("ring-circle"),
        ringEl: s.getElementById("slideshow-ring"),
      };

      const { panel, overlay } = this._el;

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

      // Inline image click — expand/collapse
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
        this._applyImageExpand(img, !img.classList.contains("expanded"));
      });

      // Duration input
      this._el.ssDuration.addEventListener("change", () => {
        let val = parseInt(this._el.ssDuration.value, 10);
        if (isNaN(val) || val <= 0) val = 3;
        this._el.ssDuration.value = val;
        settings.slideshowSeconds = val;
        if (this._slideshowActive && this._galleryMode !== "video")
          this._startSlideshow();
      });
      this._el.ssDuration.addEventListener("keydown", (e) =>
        e.stopPropagation(),
      );

      // Combined shadow click handler
      s.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn");
        const btnSs = e.target.closest(".btn-ss");
        const btnSS = e.target.closest("#btn-slideshow");
        const btnJump = e.target.closest(".btn-jump");
        const onOverlay =
          e.target.id === "overlay" || e.target.id === "media-container";
        const onMedia = e.target.closest("img, video, iframe");
        const onControls = e.target.closest(".counter-row, .z-hint");

        if (onOverlay && !onMedia && !onControls) {
          this.closeGallery();
          return;
        }

        if (btnJump)
          this._jumpToEdge(btnJump.id === "btn-jump-first" ? "first" : "last");
        else if (btn?.dataset.action) btnActionHandlers[btn.dataset.action]?.();
        else if (btnSS) this._toggleSlideshow();
        else if (btnSs)
          this._adjustSlideshowDuration(
            btnSs.dataset.action === "ss-inc" ? 1 : -1,
          );
      });

      // Panel drag
      const dragTarget = this.isMobile ? panel : s.getElementById("gv-drag");
      dragTarget.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".btn, .btn-ss, #ss-duration")) return;
        const startX = e.clientX - panel.offsetLeft;
        const startY = e.clientY - panel.offsetTop;
        dragTarget.setPointerCapture(e.pointerId);

        const move = (m) => {
          const maxLeft = window.innerWidth - panel.offsetWidth;
          const maxTop = window.innerHeight - panel.offsetHeight;
          panel.style.left = `${Math.min(maxLeft, Math.max(0, m.clientX - startX))}px`;
          panel.style.top = `${Math.min(maxTop, Math.max(0, m.clientY - startY))}px`;
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

      // Overlay wheel (scroll = navigate, right-click+scroll = zoom)
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
        if (!this._isPanning) return;
        this._isPanning = false;
        this._getZoomTarget()?.classList.remove("dragging");
      };
      overlay.addEventListener("mouseup", stopMousePan);
      overlay.addEventListener("mouseleave", stopMousePan);
    },

    // ── Gallery navigation ───────────────────────────────────────────────────
    async _navigateGallery(mode, dir = 0) {
      this._galleryMode = mode;
      const isTick = dir === "slideshow_tick";

      if (!this._xpageLocked) this.refreshMediaPipelines();

      const { list, idxProp, fetchType } = this._getModeConfig(mode);
      if (!list?.length) return;

      if (dir === 0 && !this._xpageLocked) {
        this[idxProp] = this._getFirstUnseenIdx(list);
      }

      const numDir = isTick ? 1 : dir;
      const nextIdx = (this[idxProp] || 0) + numDir;

      if (numDir > 0 && nextIdx >= list.length) {
        await this._handlePageBoundary(1, fetchType, idxProp);
        return;
      }
      if (numDir < 0 && nextIdx < 0) {
        await this._handlePageBoundary(-1, fetchType, idxProp);
        return;
      }

      this[idxProp] =
        numDir === 0 ? this[idxProp] : (nextIdx + list.length) % list.length;

      await this._renderMedia(list[this[idxProp]], this[idxProp], list.length);
      if (this._slideshowActive) this._evaluateActiveAutoplayContext();
    },

    async _handlePageBoundary(dir, fetchType, currentIdxProp) {
      const liveUrlClean = window.location.href.split("#")[0];
      let currentScanUrl = this._xpageUrl || window.location.href;

      for (let attempts = 0; attempts < 10; attempts++) {
        let nextUrl = this._getAdjacentPageUrl(dir, currentScanUrl);

        if (!nextUrl) {
          if (dir > 0) {
            nextUrl = this._getBaseThreadUrl();
          } else {
            const maxPage = this._getMaxPage();
            const base = this._getBaseThreadUrl();
            nextUrl =
              maxPage <= 1
                ? base
                : `${base}${base.endsWith("/") ? "" : "/"}page-${maxPage}`;
          }
        }

        this._showCrossPageHint(
          `Scanning page ${this._parsePageNum(nextUrl) || 1}…`,
        );
        const items = await this._fetchPageMedia(nextUrl, fetchType);

        if (items.length > 0) {
          if (nextUrl.split("#")[0] === liveUrlClean) {
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
        if (this._el.counterText && list?.length) {
          this._el.counterText.innerHTML = this._buildCounterHTML(
            this[currentIdxProp],
            list.length,
          );
        }
      }, 2500);
    },

    _resetPageLockAndRender(currentIdxProp, fetchType, defaultIdx) {
      this._resetPageLock();
      this.refreshMediaPipelines();
      const list = this._getListRef(fetchType);
      if (!list?.length) return;
      this[currentIdxProp] = defaultIdx === -1 ? list.length - 1 : 0;
      this._renderMedia(
        list[this[currentIdxProp]],
        this[currentIdxProp],
        list.length,
      );
    },

    // ── Media rendering ──────────────────────────────────────────────────────
    async _renderMedia(current, idx, total) {
      const { overlay, container, counterText, ssInputWrapper } = this._el;
      overlay.style.display = "flex";
      document.body.classList.add("gv-noscroll");
      overlay.focus();

      // Cancel in-flight decode/listener teardown
      this._decodeAbort?.abort();
      this._mediaListenerAbort?.abort();
      this._mediaListenerAbort = null;
      container.replaceChildren();
      this._resetZoom();

      if (current.tagName === "IMG") {
        const el = new Image();
        el.src = this.getFullSrc(current);
        const controller = new AbortController();
        this._decodeAbort = controller;
        try {
          await el.decode();
        } catch {}
        if (controller.signal.aborted) return;
        this._decodeAbort = null;
        container.appendChild(el);
      } else {
        let directSrc =
          current.tagName !== "DIV"
            ? await this._fetchTurboCDNSrc(current)
            : null;

        if (!directSrc) {
          const node =
            current.tagName === "VIDEO"
              ? current
              : current.querySelector("video, source");
          if (node) directSrc = node.getAttribute("src") || node.src;
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

          const listenerAbort = new AbortController();
          this._mediaListenerAbort = listenerAbort;
          const opts = { signal: listenerAbort.signal };

          el.addEventListener(
            "volumechange",
            () => {
              settings.videoVolume = el.volume;
              settings.videoMuted = el.muted;
            },
            opts,
          );
          el.addEventListener(
            "ended",
            () => {
              if (this._slideshowActive)
                this._navigateGallery(this._galleryMode, "slideshow_tick");
            },
            opts,
          );

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

      if (ssInputWrapper)
        ssInputWrapper.style.display = current.tagName !== "IMG" ? "none" : "";
      if (counterText)
        counterText.innerHTML = this._buildCounterHTML(idx, total);
      this._updateSlideshowButton();
    },

    // ── Jump to first / last on current page ─────────────────────────────────
    _jumpToEdge(edge) {
      if (this._xpageLocked) {
        this._resetPageLock();
        this.refreshMediaPipelines();
      }
      const { list, idxProp } = this._getModeConfig(this._galleryMode);
      if (!list?.length) return;
      this[idxProp] = edge === "first" ? 0 : list.length - 1;
      this._renderMedia(list[this[idxProp]], this[idxProp], list.length);
      if (this._slideshowActive) this._evaluateActiveAutoplayContext();
    },

    closeGallery() {
      this._stopSlideshow();
      this._resetZoom();
      this._resetPageLock();

      const { container, overlay } = this._el;
      const video = container.querySelector("video");
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      const iframe = container.querySelector("iframe");
      if (iframe) iframe.src = "";
      container.replaceChildren();
      overlay.style.display = "none";
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

          const isVisible = this._el.overlay?.style.display === "flex";
          const key = e.key.toLowerCase();

          // Global hotkeys (work whether or not gallery is open)
          const globalActions = {
            g: () => this._navigateGallery("main", 0),
            x: () => this.toggleExpand(),
            v: () => this._navigateGallery("video", 0),
            f: () => this._navigateGallery("full", 0),
          };
          if (globalActions[key]) {
            e.preventDefault();
            globalActions[key]();
            return;
          }

          if (!isVisible) return;

          if (e.key === " ") {
            e.preventDefault();
            e.stopImmediatePropagation();
            this._toggleSlideshow();
            return;
          }
          if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            e.stopImmediatePropagation();
            this._adjustSlideshowDuration(-1);
            return;
          }
          if (e.key === "+" || e.key === "=" || e.key === "Equal") {
            e.preventDefault();
            e.stopImmediatePropagation();
            this._adjustSlideshowDuration(1);
            return;
          }

          const overlayActions = {
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
          if (overlayActions[key]) {
            e.preventDefault();
            e.stopImmediatePropagation();
            overlayActions[key]();
          }
        },
        true,
      );
    },
  };

  App.init();
})();
