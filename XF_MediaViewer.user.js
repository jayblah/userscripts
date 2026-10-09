// ==UserScript==
// @name         XF Media Viewer
// @version      2.5.12
// @description  Streamlined media viewing experience for XenForo forums. Features mobile & keyboard support, inline expansion, slideshows with dedicated reverse toggle button, automatic broken-image skipping, multi-media pipelines, and title extraction.
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

  // ── Environment flags ─────────────────────────────────────────────────────
  const IS_F95 = window.location.hostname.includes("f95zone.to");

  const APP_THEME = "#3db7c7";
  const APP_DIM = "#b8f7ff";
  const APP_NAME = "XF View™ 2.5";
  const APP_SHORT = "XF™";

  // ── Gallery mode constants ────────────────────────────────────────────────
  // Canonical mode names used throughout. Input aliases ("gallery", "vgallery",
  // "fullgallery") are normalised to these at entry points.
  const MODE = Object.freeze({ MAIN: "main", VIDEO: "video", FULL: "full" });

  // ── Selectors ─────────────────────────────────────────────────────────────
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
    : "video, div.video-container, iframe.saint-iframe, iframe[src*='video'], iframe[src*='redgifs'], iframe[src*='turbo'], div[onclick*='redgifs.com']";

  // Combined selector reused across pipelines
  const SEL_FULL = `${SEL_IMG}, ${SEL_VID}`;

  // ── Settings persistence ──────────────────────────────────────────────────
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

  // ── Shared GM_xmlhttpRequest promise wrapper ──────────────────────────────
  // Centralises error/timeout handling so _fetchPageMedia and
  // _fetchTurboCDNSrc don't each maintain their own boilerplate.
  function gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        return reject(new Error(`gmFetch aborted: ${url}`));
      }
      const req = GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: options.timeout ?? 10000,
        headers: options.headers,
        anonymous: options.anonymous ?? false,
        onload: (resp) => resolve(resp),
        onerror: () => reject(new Error(`gmFetch error: ${url}`)),
        ontimeout: () => reject(new Error(`gmFetch timeout: ${url}`)),
      });
      options.signal?.addEventListener("abort", () => {
        try {
          req?.abort();
        } catch {}
        reject(new Error(`gmFetch aborted: ${url}`));
      });
    });
  }

  // ── App ───────────────────────────────────────────────────────────────────
  const App = {
    // ── Media lists & indices ──────────────────────────────────────────────
    _lists: {
      [MODE.MAIN]: [],
      [MODE.VIDEO]: [],
      [MODE.FULL]: [],
    },
    _indices: {
      [MODE.MAIN]: 0,
      [MODE.VIDEO]: 0,
      [MODE.FULL]: 0,
    },

    // ── State ──────────────────────────────────────────────────────────────
    shadow: null,
    _galleryMode: MODE.MAIN,
    isMobile: window.matchMedia("(max-width: 600px) and (pointer: coarse)")
      .matches,

    // Touch state
    _touchStart: { x: 0, y: 0 },
    _twoFingerStart: { x: 0, y: 0 },
    _lastTap: 0,

    // Async/abort handles
    _decodeAbort: null,
    _mediaListenerAbort: null,
    _renderAbort: null,
    _currentRenderId: 0,
    _lastWheelNav: 0,

    // Zoom/pan state
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

    // Cross-page state
    _xpageLocked: false,
    _xpageUrl: null,

    // Unseen tracking
    _trackedUnseenElement: null,
    _observer: null,

    // Slideshow state
    _slideshowTimer: null,
    _slideshowActive: false,
    _slideshowDirection: 1, // 1 = Forward, -1 = Reverse

    // Wake lock
    _wakeLock: null,

    // Cached shadow-DOM element references (populated in bindInternalEvents)
    _el: {},

    // ── Init ──────────────────────────────────────────────────────────────

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

    // ── Mode helpers ──────────────────────────────────────────────────────

    // Normalise any public-facing mode alias to a canonical MODE constant.
    _normaliseMode(raw) {
      if (raw === "gallery") return MODE.MAIN;
      if (raw === "vgallery") return MODE.VIDEO;
      if (raw === "fullgallery") return MODE.FULL;
      return raw; // already canonical (MODE.MAIN / MODE.VIDEO / MODE.FULL)
    },

    // Return the list and index for the current (or given) gallery mode.
    _modeState(mode = this._galleryMode) {
      const m = this._normaliseMode(mode);
      return {
        list: this._lists[m],
        idx: this._indices[m],
        setIdx: (v) => {
          this._indices[m] = v;
        },
        mode: m,
      };
    },

    // ── Counter helper ────────────────────────────────────────────────────

    _setCounter(idx, total) {
      if (!this._el.counterText) return;
      const currentPage =
        this._parsePageNum(this._xpageUrl || window.location.href) || 1;
      const maxPage = Math.max(currentPage, this._getMaxPage());
      this._el.counterText.innerHTML =
        `pg.&nbsp; <span class="dim">${currentPage}</span>&nbsp; / &nbsp;${maxPage}` +
        `&nbsp; — &nbsp;<span class="dim">${idx + 1}</span>&nbsp; / &nbsp;${total}`;
    },

    // ── Styles ────────────────────────────────────────────────────────────

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
        iframe.gv-expanded, video.gv-expanded, div.video-container.gv-expanded,
        div[onclick*='redgifs.com'].gv-expanded, iframe.saint-iframe.gv-expanded {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          aspect-ratio: 16 / 9 !important;
          height: auto !important;
          margin: 15px auto !important;
          border: 1px solid #333 !important;
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

    // ── Shadow DOM host ───────────────────────────────────────────────────

    createHost() {
      const host = document.createElement("div");
      host.id = "gv-p-root";
      document.body.appendChild(host);
      this.shadow = host.attachShadow({ mode: "open" });

      // Build the full shadow stylesheet once, then never touch innerHTML for style.
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(this._buildShadowCSS());
      this.shadow.adoptedStyleSheets = [sheet];

      this._renderBase();
      this._bindInternalEvents();
    },

    _buildShadowCSS() {
      // All shadow-scoped styles in one place so they're never split across
      // an adoptedStyleSheet and an inline <style> block.
      return `
        :host {
          --theme: ${APP_THEME};
          --dim: ${APP_DIM};
          --bg: #171717;
          --border: #262626;
          --t: 0.2s ease;
          font-family: system-ui, -apple-system, sans-serif;
        }
        input { font: inherit; }

        /* ── Panel ── */
        .panel {
          position: fixed; z-index: 9999; background: var(--bg); color: #efefef;
          border-radius: 8px; border: 1px solid var(--border); padding: 12px;
          width: 155px; box-sizing: border-box;
          display: flex; flex-direction: column; gap: 10px; box-shadow: 0 12px 40px #000;
          user-select: none; touch-action: none;
        }
        .header {
          text-align: center; font-weight: 900; color: var(--theme); cursor: move;
          padding-bottom: 6px; font-size: 11px; text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }

        /* ── Buttons ── */
        .btn {
          background: #222; border: 1px solid #333; border-radius: 5px; height: 34px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          font-weight: 700; color: #aaa; font-size: 11px; transition: all var(--t);
        }
        .btn:hover { border-color: var(--theme); color: #fff; background: #2a2a2a; }
        .btn:focus-visible { outline: 2px solid var(--theme); outline-offset: 2px; }
        .btn.is-expanded { border-color: var(--theme); color: var(--theme); }
        .btn-ss {
          background: transparent; border: none; color: #666;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-weight: 700; font-size: 20px;
          height: 24px; width: 24px;
          transition: color var(--t); user-select: none; outline: none;
        }
        .btn-ss:hover { color: var(--theme); }
        .btn-jump {
          background: transparent; border: none; color: #666;
          font-size: 20px; font-weight: 900; cursor: pointer;
          padding: 4px 8px; line-height: 1; transition: color var(--t), transform 0.1s;
          user-select: none; outline: none;
          display: flex; align-items: center; justify-content: center;
          min-width: 24px; min-height: 24px;
        }
        .btn-jump:hover  { color: var(--theme); transform: scale(1.15); }
        .btn-jump:active { transform: scale(0.95); }
        #btn-slideshow-dir {
          background: transparent; border: none; color: #666;
          font-size: 15px; font-weight: 900; cursor: pointer;
          padding: 0 4px 0 6px; line-height: 1;
          transition: color var(--t), transform 0.1s;
          user-select: none; outline: none;
          display: flex; align-items: center; justify-content: center;
          min-width: 22px; min-height: 24px;
        }
        #btn-slideshow-dir:hover  { color: var(--theme); transform: scale(1.15); }
        #btn-slideshow-dir:active { transform: scale(0.95); }
        #btn-slideshow {
          width: 32px; height: 32px; border-radius: 50%; background: #111;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all var(--t); flex-shrink: 0;
          color: #aaa; position: relative;
        }
        #btn-slideshow:hover  { border-color: var(--theme); color: #fff; }
        #btn-slideshow.active { border-color: var(--theme); color: var(--theme); }
        #btn-slideshow svg    { display: block; }

        /* ── Layout helpers ── */
        .row { display: flex; gap: 6px; }
        .scroll-row .btn { flex: 1 1 0; min-width: 0; font-size: 14px; line-height: 1; }
        .lbl-short { display: none; }
        u {
          text-decoration: underline;
          text-decoration-color: var(--theme);
          text-underline-offset: 3px;
        }

        /* ── Overlay ── */
        #overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.98);
          display: none; align-items: center; justify-content: center;
          z-index: 10000; backdrop-filter: blur(4px);
          outline: none; touch-action: none;
        }

        /* ── Overlay hints ── */
        .z-hint {
          position: absolute; font-size: 9.5px; font-weight: 900;
          opacity: 0.9; top: 20px; left: 50%; transform: translateX(-50%);
          text-align: center; width: 90%; pointer-events: none;
          text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.9);
        }
        .z-model-name {
          font-size: 14px; color: var(--theme); margin-bottom: 6px;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .z-hotkeys { font-size: 8.5px; color: rgba(255,255,255,0.5); margin-top: 3px; }
        .z-hotkeys .key { color: #ffffff; }

        /* ── Media container ── */
        #media-container {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
        }
        #media-container :is(img, video, iframe) {
          max-width: 96vw;
          max-height: calc(100vh - 150px);
          object-fit: contain;
        }
        #media-container :is(video, iframe) {
          max-height: calc(100vh - 170px);
          margin-bottom: 25px;
        }
        #media-container img {
          transform-origin: center center;
          transition: transform 0.12s ease;
          cursor: zoom-in;
          will-change: transform;
        }
        #media-container img.zoomed          { cursor: grab; }
        #media-container img.zoomed.dragging { cursor: grabbing; }

        /* ── Counter row ── */
        .counter-row {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 8px;
          pointer-events: none;
        }
        .counter-row > * { pointer-events: auto; }
        .counter {
          color: var(--theme); font-weight: 800; background: rgba(0,0,0,0.8);
          padding: 5px 14px; border-radius: 24px; border: none;
          white-space: nowrap; font-size: 13px;
          height: 28px; display: flex; align-items: center; gap: 6px;
        }
        .dim { color: var(--dim); }

        /* ── Slideshow controls ── */
        .slideshow-ctrl {
          display: flex; align-items: center; background: rgba(0,0,0,0.8);
          border: none; border-radius: 20px; padding: 2px 4px 2px 2px;
          gap: 0; transition: all var(--t);
        }
        .slideshow-input-wrapper {
          display: flex; align-items: center;
          padding-left: 4px; padding-right: 8px;
        }
        .slideshow-input {
          width: 24px; background: transparent; border: none; color: #fff;
          font-size: 12px; font-weight: 700;
          text-align: center; padding: 0; margin: 0; outline: none;
          border-bottom: 1px dashed #555;
        }
        .slideshow-input:focus { border-bottom-color: var(--theme); }
        .slideshow-unit { color: #666; font-size: 10px; font-weight: 700; margin-left: 2px; }

        /* ── Slideshow ring ── */
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

        /* ── Mobile overrides ── */
        @media (max-width: 600px) and (pointer: coarse) {
          .panel {
            flex-direction: column; width: 70px; align-items: stretch;
            padding: 8px 5px; gap: 14px; cursor: grab;
          }
          .panel:active { cursor: grabbing; }
          .header {
            display: flex; align-items: center; justify-content: center;
            border-bottom: 1px solid var(--border); border-right: none;
            padding-bottom: 6px; padding-right: 0; font-size: 10px;
            min-width: 0; cursor: grab;
          }
          .header .lbl-full { display: none; }
          .header .lbl-short { display: inline; }
          .row.scroll-row { display: none; }
          .lbl-full { display: none; }
          .lbl-short { display: inline; }
          .btn { width: 100%; height: 38px; font-size: 10px; padding: 0 2px; flex: 0 0 auto; box-sizing: border-box; }
          .z-hotkeys { display: none !important; }
          .counter-row {
            flex-direction: column; align-items: center; gap: 5px;
            bottom: 12px; left: 50%; transform: translateX(-50%);
            width: calc(100vw - 16px); max-width: 340px;
          }
          .counter {
            font-size: 11px; padding: 4px 8px; gap: 3px;
            height: 24px; white-space: nowrap;
            width: 100%; justify-content: center; box-sizing: border-box;
          }
          .slideshow-ctrl {
            width: 100%; justify-content: center; box-sizing: border-box;
          }
          #btn-slideshow-dir {
            font-size: 13px; min-width: 18px; padding: 0 2px 0 4px;
          }
          .btn-jump { font-size: 16px; min-width: 18px; padding: 2px 4px; }

          /* Video mode: keep controls compact in a single horizontal row so they don't cover the video player */
          #overlay.is-video .counter-row {
            flex-direction: row;
            width: auto;
            max-width: calc(100vw - 16px);
            bottom: 10px;
            gap: 6px;
          }
          #overlay.is-video .slideshow-ctrl {
            width: auto;
            padding: 2px 4px;
            flex-shrink: 0;
          }
          #overlay.is-video .counter {
            width: auto;
            flex: 0 0 auto;
          }
          #overlay.is-video #media-container :is(video, iframe) {
            max-height: calc(100vh - 160px);
            margin-bottom: 35px;
          }
        }
      `;
    },

    // ── Shadow DOM markup ─────────────────────────────────────────────────

    _renderBase() {
      const titleText = this._getProjectTitle();

      // Build the shadow DOM using a document fragment so we never stomp the
      // adoptedStyleSheet that was set in createHost().
      const template = document.createElement("template");
      template.innerHTML = `
        <div class="panel" id="gv-panel" style="top: ${settings.panelTop}; left: ${settings.panelLeft}">
          <div class="header" id="gv-drag">
            <span class="lbl-full">${APP_NAME}</span>
            <span class="lbl-short">${APP_SHORT}</span>
          </div>
          <div class="row scroll-row">
            <div class="btn" role="button" tabindex="0" data-action="top"    title="Scroll to top">↑</div>
            <div class="btn" role="button" tabindex="0" data-action="bottom" title="Scroll to bottom">↓</div>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="expand-all" id="btn-expand-all" title="Expand all media on page">
            <span class="lbl-full">E<u>X</u>P ALL</span><span class="lbl-short">EXP</span>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="gallery"     id="btn-gallery">
            <span class="lbl-full">IMA<u>G</u>ES</span><span class="lbl-short">IMG</span>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="vgallery"    id="btn-vgallery">
            <span class="lbl-full"><u>V</u>IDEOS</span><span class="lbl-short">VID</span>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="fullgallery" id="btn-fullgallery" style="border-color: #444;">
            <span class="lbl-full"><u>A</u>LL</span><span class="lbl-short">ALL</span>
          </div>
        </div>

        <div id="overlay" tabindex="-1">
          <div class="z-hint">
            ${titleText ? `<div class="z-model-name">${titleText}</div>` : ""}
            <div class="z-hotkeys">
              <span class="key">[G]</span> IMAGES ·
              <span class="key">[V]</span> VIDEOS ·
              <span class="key">[A]</span> ALL ·
              <span class="key">[←/→]</span> PREV/NEXT ·
              <span class="key">[W/↑/ESC]</span> EXIT ·
              <span class="key">[SPACE]</span> AUTOPLAY ·
              <span class="key">[SCROLL]</span> ZOOM
            </div>
          </div>

          <div id="media-container"></div>

          <div class="counter-row">
            <div class="slideshow-ctrl" id="gv-slideshow-ctrl">
              <button id="btn-slideshow-dir" title="Toggle autoplay direction">⟲</button>
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
                <input type="text" class="slideshow-input" id="ss-duration"
                       value="${settings.slideshowSeconds}" maxlength="1"
                       title="Duration per image">
                <span class="slideshow-unit">s</span>
                <div class="btn-ss" data-action="ss-inc">+</div>
              </div>
            </div>

            <div class="counter" id="gv-counter" title="Page & Media Index">
              <button class="btn-jump" id="btn-thread-first" title="First page of thread">&#171;</button>
              <button class="btn-jump" id="btn-page-first"  title="First media on this page">&#139;</button>
              <span id="gv-counter-text"></span>
              <button class="btn-jump" id="btn-page-last"   title="Last media on this page">&#155;</button>
              <button class="btn-jump" id="btn-thread-last" title="Last page of thread">&#187;</button>
            </div>
          </div>
        </div>
      `;
      this.shadow.appendChild(template.content);
    },

    // ── DOM utilities ─────────────────────────────────────────────────────

    _getProjectTitle() {
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

    // ── Image src resolution ──────────────────────────────────────────────

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

    // ── Inline element processing ─────────────────────────────────────────

    processInlineElements() {
      // Clean thumbnail attributes on unprocessed images
      document
        .querySelectorAll(`${SEL_IMG}:not([data-processed-thumb])`)
        .forEach((img) => {
          if (!IS_F95 && /\.(md|th)\.(jpg|webp)$/i.test(img.src)) {
            if (img.title) img.title = App.cleanAttr(img.title);
            if (img.alt) img.alt = App.cleanAttr(img.alt);
          }
          img.setAttribute("data-processed-thumb", "true");
        });

      // Inject per-post ⊞ EXP expand buttons
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
          btn.textContent = "EXP";
          btn.title = "Expand all media in this post";

          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const expanding = !btn.classList.contains("is-expanded");
            lbContainer
              .querySelectorAll(SEL_IMG)
              .forEach((img) => this._applyImageExpand(img, expanding));
            lbContainer
              .querySelectorAll(SEL_VID)
              .forEach((el) => this._applyEmbedExpand(el, expanding));
            btn.classList.toggle("is-expanded", expanding);
            btn.textContent = expanding ? "COL" : "EXP";
            btn.title = expanding
              ? "Collapse all media in this post"
              : "Expand all media in this post";
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

    // ── Media pipeline ────────────────────────────────────────────────────

    refreshMediaPipelines() {
      const all = this._filterVisible(
        Array.from(document.querySelectorAll(SEL_FULL)),
      );
      this._lists[MODE.FULL] = all;
      this._lists[MODE.MAIN] = all.filter((el) => el.matches(SEL_IMG));
      this._lists[MODE.VIDEO] = [
        ...new Set(all.filter((el) => el.matches(SEL_VID))),
      ];
    },

    // ── Expand / Collapse ─────────────────────────────────────────────────

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

    _applyEmbedExpand(el, expanding) {
      if (!expanding) {
        el.classList.remove("gv-expanded");
        // Also collapse any redgifs iframe that was injected when this was expanded
        const injectedId = el.dataset.gvIframeId;
        if (injectedId) {
          const iframe = el.parentElement?.querySelector(
            `iframe[data-gv-id="${injectedId}"]`,
          );
          if (iframe) iframe.classList.remove("gv-expanded");
        }
        return;
      }

      // If this is a redgifs onclick placeholder div that hasn't been activated yet,
      // fire its onclick to trigger SC's own iframe injection, then size the result.
      if (el.tagName === "DIV" && el.hasAttribute("onclick")) {
        el.classList.add("gv-expanded");

        // If already activated (data-gv-iframe-id set), just re-expand the iframe directly.
        if (el.dataset.gvIframeId) {
          const iframe = el.parentElement?.querySelector(
            `iframe[data-gv-id="${el.dataset.gvIframeId}"]`,
          );
          if (iframe) iframe.classList.add("gv-expanded");
          return;
        }

        el.click();

        // The onclick replaces or inserts an iframe — watch for it.
        const parent = el.parentElement;
        if (!parent) return;
        const uid = Math.random().toString(36).slice(2);
        el.dataset.gvIframeId = uid;

        const observer = new MutationObserver(() => {
          const iframe = parent.querySelector("iframe[src*='redgifs']");
          if (iframe && !iframe.dataset.gvId) {
            observer.disconnect();
            iframe.dataset.gvId = uid;
            iframe.classList.add("gv-expanded");
          }
        });
        observer.observe(parent, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 5000);
      } else {
        el.classList.add("gv-expanded");
      }
    },

    _toggleExpandAll() {
      // Derive truth from the DOM: if any media is currently collapsed, expand all.
      // This handles the case where per-post buttons have been used individually.
      const imgs = this._lists[MODE.MAIN];
      const vids = this._lists[MODE.VIDEO];
      const expanding =
        imgs.some((el) => !el.classList.contains("gv-expanded")) ||
        vids.some((el) => !el.classList.contains("gv-expanded"));

      imgs.forEach((el) => this._applyImageExpand(el, expanding));
      vids.forEach((el) => this._applyEmbedExpand(el, expanding));

      // Sync per-post EXP buttons to match the new global state
      document.querySelectorAll(".sc-expand-btn").forEach((btn) => {
        btn.classList.toggle("is-expanded", expanding);
        btn.textContent = expanding ? "COL" : "EXP";
        btn.title = expanding
          ? "Collapse all media in this post"
          : "Expand all media in this post";
      });

      const { btnExpandAll, btnExpandAllFull, btnExpandAllShort } = this._el;
      if (btnExpandAll) {
        btnExpandAll.classList.toggle("is-expanded", expanding);
        btnExpandAll.title = expanding
          ? "Collapse all media on page"
          : "Expand all media on page";
        if (btnExpandAllFull) btnExpandAllFull.innerHTML = expanding ? "COL ALL" : "E<u>X</u>P ALL";
        if (btnExpandAllShort) btnExpandAllShort.textContent = expanding ? "COL" : "EXP";
      }
    },

    // ── Wake lock ─────────────────────────────────────────────────────────

    async _acquireWakeLock() {
      if (!("wakeLock" in navigator)) return;
      try {
        this._wakeLock = await navigator.wakeLock.request("screen");
        this._wakeLock.addEventListener("release", () => {
          this._wakeLock = null;
        });
      } catch {
        /* permission denied or unsupported — silently ignore */
      }
    },

    _releaseWakeLock() {
      if (this._wakeLock) {
        this._wakeLock.release().catch(() => {});
        this._wakeLock = null;
      }
    },

    // ── Ring animation ────────────────────────────────────────────────────

    _resetRing() {
      const { ring, ringEl } = this._el;
      if (ring) {
        ring.style.transition = "none";
        ring.style.strokeDashoffset = "100";
      }
      if (ringEl) ringEl.classList.remove("visible");
    },

    _animateRing(intervalMs) {
      const { ring, ringEl } = this._el;
      if (!ring) return;
      ring.style.transition = "none";
      ring.style.strokeDashoffset = "100";
      void ring.getBoundingClientRect(); // force reflow to restart animation
      ring.style.transition = `stroke-dashoffset ${intervalMs}ms linear`;
      ring.style.strokeDashoffset = "0";
      if (ringEl) ringEl.classList.add("visible");
    },

    // ── Slideshow ─────────────────────────────────────────────────────────

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

      clearTimeout(this._slideshowTimer);
      this._slideshowTimer = null;
      this._resetRing();

      const currentItem = this._getActiveMediaNode();
      if (currentItem && currentItem.tagName !== "IMG") {
        const video = this._el.container?.querySelector("video");
        if (video) video.loop = false;

        // For iframes (external embeds) use a long fixed timeout as a fallback
        if (this._el.container?.querySelector("iframe")) {
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
        if (this._slideshowActive)
          this._navigateGallery(this._galleryMode, "slideshow_tick");
      }, interval);
    },

    _getActiveMediaNode() {
      const { list, idx } = this._modeState();
      return list[idx];
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

    _toggleSlideshowDirection() {
      this._slideshowDirection = this._slideshowDirection === 1 ? -1 : 1;
      this._showCrossPageHint(
        this._slideshowDirection === 1
          ? "Playback: Forward"
          : "Playback: Reverse",
      );
      this._updateSlideshowButton();
      if (this._slideshowActive) this._evaluateActiveAutoplayContext();

      // Restore the real counter after the hint fades
      setTimeout(() => {
        const { list, idx } = this._modeState();
        if (list?.length) this._setCounter(idx, list.length);
      }, 1000);
    },

    _updateSlideshowButton() {
      const { btnSlideshow, slideshowIcon } = this._el;
      if (!btnSlideshow || !slideshowIcon) return;

      btnSlideshow.classList.toggle("active", this._slideshowActive);
      btnSlideshow.title = this._slideshowActive
        ? "Pause slideshow"
        : "Start slideshow";

      if (this._slideshowActive) {
        slideshowIcon.innerHTML = `<rect x="2" y="1" width="4" height="12" rx="1"/>
                                   <rect x="8" y="1" width="4" height="12" rx="1"/>`;
      } else {
        slideshowIcon.innerHTML =
          this._slideshowDirection === 1
            ? `<polygon points="3,1 13,7 3,13"/>`
            : `<polygon points="11,1 1,7 11,13"/>`;
      }
    },

    // ── Slideshow duration ────────────────────────────────────────────────

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

    // ── Cross-page fetching ───────────────────────────────────────────────

    async _fetchTurboCDNSrc(iframeEl, signal = null) {
      if (IS_F95) return null;
      const src = iframeEl?.getAttribute("src");
      if (!src) return null;
      const id = src.split("/embed/")[1]?.split("?")[0];
      if (!id) return null;

      try {
        const resp = await gmFetch(`https://turbo.cr/api/sign?v=${id}`, {
          timeout: 8000,
          signal,
          headers: {
            Referer: `https://turbo.cr/embed/${id}`,
            Origin: "https://turbo.cr",
          },
          anonymous: false,
        });
        const data = JSON.parse(resp.responseText);
        return (
          data.url ||
          data.src ||
          data.signed_url ||
          data.stream ||
          Object.values(data).find(
            (v) => typeof v === "string" && v.includes("http"),
          ) ||
          null
        );
      } catch {
        // Fallback: scan raw text for any URL
        try {
          const raw = (
            await gmFetch(`https://turbo.cr/api/sign?v=${id}`, {
              timeout: 8000,
              signal,
            })
          ).responseText;
          return raw.match(/https?:\/\/\S+/)?.[0] ?? null;
        } catch {
          return null;
        }
      }
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

    async _fetchPageMedia(url, mode = MODE.MAIN) {
      try {
        const resp = await gmFetch(url);
        const doc = new DOMParser().parseFromString(
          resp.responseText,
          "text/html",
        );
        if (mode === MODE.VIDEO)
          return Array.from(doc.querySelectorAll(SEL_VID)).filter(
            (el) => el.src || el.getAttribute("src"),
          );
        if (mode === MODE.FULL)
          return Array.from(doc.querySelectorAll(SEL_FULL));
        return Array.from(doc.querySelectorAll(SEL_IMG)).filter(
          (el) => el.src || el.getAttribute("data-src"),
        );
      } catch {
        return [];
      }
    },

    _showCrossPageHint(msg) {
      if (this._el.counterText) this._el.counterText.textContent = msg;
    },

    // ── Page-lock helpers ─────────────────────────────────────────────────

    _resetPageLock() {
      this._xpageLocked = false;
      this._xpageUrl = null;
    },

    // ── Unseen tracking ───────────────────────────────────────────────────

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

    // ── Zoom / pan ────────────────────────────────────────────────────────

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

    // ── Touch handling ────────────────────────────────────────────────────

    handleTouchStart(e) {
      if (e.touches.length === 2) {
        this._isPinching = true;
        this._isPanning = false;
        const [a, b] = e.touches;
        this._pinchDist = Math.hypot(
          b.clientX - a.clientX,
          b.clientY - a.clientY,
        );
        this._twoFingerStart.x = (a.screenX + b.screenX) / 2;
        this._twoFingerStart.y = (a.screenY + b.screenY) / 2;
      } else if (e.touches.length === 1) {
        if (e.target.closest("#gv-slideshow-ctrl, video, iframe")) return;
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
        if (e.touches.length === 0) {
          this._isPinching = false;
          this._pinchDist = null;

          if (this._scale === 1 && e.changedTouches.length >= 2) {
            const a = e.changedTouches[0];
            const b = e.changedTouches[1];
            const dx = (a.screenX + b.screenX) / 2 - this._twoFingerStart.x;
            const dy = (a.screenY + b.screenY) / 2 - this._twoFingerStart.y;

            if (Math.abs(dx) > Math.abs(dy)) {
              if (Math.abs(dx) > 40)
                this._jumpToThreadEdge(dx > 0 ? "first" : "last");
            } else {
              if (Math.abs(dy) > 40)
                this._jumpToThreadEdge(dy > 0 ? "first" : "last");
            }
            return;
          }
        }
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

      if (e.target.closest("#gv-slideshow-ctrl, video, iframe")) return;
      const dx = e.changedTouches[0].screenX - this._touchStart.x;
      const dy = e.changedTouches[0].screenY - this._touchStart.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > 50)
          this._navigateGallery(this._galleryMode, dx > 0 ? -1 : 1);
      } else if (Math.abs(dy) > 50) {
        this.closeGallery();
      }
    },

    // ── Event binding ─────────────────────────────────────────────────────

    _bindInternalEvents() {
      const s = this.shadow;

      // Cache all frequently-accessed shadow DOM elements once.
      this._el = {
        panel: s.getElementById("gv-panel"),
        overlay: s.getElementById("overlay"),
        container: s.getElementById("media-container"),
        counterText: s.getElementById("gv-counter-text"),
        btnSlideshow: s.getElementById("btn-slideshow"),
        slideshowIcon: s.getElementById("slideshow-icon"),
        ssInputWrapper: s.getElementById("ss-input-wrapper"),
        ssDuration: s.getElementById("ss-duration"),
        ring: s.getElementById("ring-circle"),
        ringEl: s.getElementById("slideshow-ring"),
        btnExpandAll: s.getElementById("btn-expand-all"),
        btnExpandAllFull: s.getElementById("btn-expand-all")?.querySelector(".lbl-full"),
        btnExpandAllShort: s.getElementById("btn-expand-all")?.querySelector(".lbl-short"),
      };

      const { panel, overlay } = this._el;

      // Panel action buttons
      const btnActionHandlers = {
        top: () => window.scrollTo({ top: 0, behavior: "smooth" }),
        bottom: () =>
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: "smooth",
          }),
        "expand-all": () => this._toggleExpandAll(),
        gallery: () => this._navigateGallery(MODE.MAIN, 0),
        vgallery: () => this._navigateGallery(MODE.VIDEO, 0),
        fullgallery: () => this._navigateGallery(MODE.FULL, 0),
      };

      // Delegate image-click expand/collapse to document body
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

      // Slideshow duration input
      this._el.ssDuration.addEventListener("change", () => {
        let val = parseInt(this._el.ssDuration.value, 10);
        if (isNaN(val) || val <= 0) val = 3;
        this._el.ssDuration.value = val;
        settings.slideshowSeconds = val;
        if (this._slideshowActive && this._galleryMode !== MODE.VIDEO)
          this._startSlideshow();
      });
      this._el.ssDuration.addEventListener("keydown", (e) =>
        e.stopPropagation(),
      );

      // Delegated click handler for the entire shadow root
      s.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn");
        const btnSs = e.target.closest(".btn-ss");
        const btnSS = e.target.closest("#btn-slideshow");
        const btnDir = e.target.closest("#btn-slideshow-dir");
        const btnJump = e.target.closest(".btn-jump");
        const onOverlay =
          e.target.id === "overlay" || e.target.id === "media-container";
        const onMedia = e.target.closest("img, video, iframe");
        const onControls = e.target.closest(".counter-row, .z-hint");

        if (onOverlay && !onMedia && !onControls) {
          this.closeGallery();
          return;
        }

        if (btnJump) {
          const actions = {
            "btn-thread-first": () => this._jumpToThreadEdge("first"),
            "btn-thread-last": () => this._jumpToThreadEdge("last"),
            "btn-page-first": () => this._jumpToEdge("first"),
            "btn-page-last": () => this._jumpToEdge("last"),
          };
          actions[btnJump.id]?.();
        } else if (btn?.dataset.action) {
          btnActionHandlers[btn.dataset.action]?.();
        } else if (btnSS) {
          this._toggleSlideshow();
        } else if (btnDir) {
          this._toggleSlideshowDirection();
        } else if (btnSs) {
          this._adjustSlideshowDuration(
            btnSs.dataset.action === "ss-inc" ? 1 : -1,
          );
        }
      });

      // Panel drag
      const dragTarget = this.isMobile ? panel : s.getElementById("gv-drag");
      dragTarget.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".btn, .btn-ss, #ss-duration, #btn-slideshow-dir"))
          return;
        const startX = e.clientX - panel.offsetLeft;
        const startY = e.clientY - panel.offsetTop;
        dragTarget.setPointerCapture(e.pointerId);

        const onMove = (m) => {
          const maxLeft = window.innerWidth - panel.offsetWidth;
          const maxTop = window.innerHeight - panel.offsetHeight;
          panel.style.left = `${Math.min(maxLeft, Math.max(0, m.clientX - startX))}px`;
          panel.style.top = `${Math.min(maxTop, Math.max(0, m.clientY - startY))}px`;
        };
        const onUp = () => {
          settings.panelLeft = panel.style.left;
          settings.panelTop = panel.style.top;
          dragTarget.removeEventListener("pointermove", onMove);
          dragTarget.removeEventListener("pointerup", onUp);
        };
        dragTarget.addEventListener("pointermove", onMove);
        dragTarget.addEventListener("pointerup", onUp);
      });

      this._clampPanelToScreen(panel);

      // Scroll-wheel navigation and zoom
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
            const now = Date.now();
            if (now - this._lastWheelNav < 350) return; // Increased from 180ms
            this._lastWheelNav = now;
            this._navigateGallery(this._galleryMode, e.deltaY > 0 ? 1 : -1);
          }
        },
        { passive: false },
      );

      // Touch events on overlay
      overlay.addEventListener("touchstart", (e) => this.handleTouchStart(e), {
        passive: true,
      });
      overlay.addEventListener("touchmove", (e) => this.handleTouchMove(e), {
        passive: false,
      });
      overlay.addEventListener("touchend", (e) => this.handleTouchEnd(e), {
        passive: true,
      });

      // Mouse pan on zoomed images
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

    // ── Gallery navigation ────────────────────────────────────────────────

    async _navigateGallery(rawMode, dir = 0) {
      this._galleryMode = this._normaliseMode(rawMode);
      const isTick = dir === "slideshow_tick";

      if (!this._xpageLocked) this.refreshMediaPipelines();

      const state = this._modeState();
      const { list, idx, setIdx, mode } = state;

      // Flash the button red if the gallery is empty
      if (!list?.length && dir === 0 && !this._xpageLocked) {
        this._flashEmptyButton(mode);
        return;
      }
      if (!list?.length) return;

      if (dir === 0 && !this._xpageLocked) {
        setIdx(this._getFirstUnseenIdx(list));
      }

      const numDir = isTick ? this._slideshowDirection : dir;
      const nextIdx = (this._indices[mode] || 0) + numDir;

      if (numDir > 0 && nextIdx >= list.length) {
        await this._handlePageBoundary(1, mode);
        return;
      }
      if (numDir < 0 && nextIdx < 0) {
        await this._handlePageBoundary(-1, mode);
        return;
      }

      setIdx(
        numDir === 0
          ? this._indices[mode]
          : (nextIdx + list.length) % list.length,
      );

      await this._renderMedia(
        list[this._indices[mode]],
        this._indices[mode],
        list.length,
        numDir,
      );
      if (this._slideshowActive) this._evaluateActiveAutoplayContext();
    },

    // Flash the relevant panel button red briefly when no media is found.
    _flashEmptyButton(mode) {
      const btnId = {
        [MODE.VIDEO]: "btn-vgallery",
        [MODE.MAIN]: "btn-gallery",
        [MODE.FULL]: "btn-fullgallery",
      }[mode];
      if (!btnId) return;
      const btn = this.shadow.getElementById(btnId);
      if (!btn) return;
      btn.style.borderColor = "#ff3b30";
      btn.style.color = "#fff";
      btn.style.backgroundColor = "#ff3b30";
      setTimeout(() => {
        btn.style.borderColor = "";
        btn.style.color = "";
        btn.style.backgroundColor = "";
      }, 1500);
    },

    async _handlePageBoundary(dir, mode) {
      const liveUrlClean = window.location.href.split("#")[0];
      let currentScanUrl = this._xpageUrl || window.location.href;

      for (let attempt = 0; attempt < 10; attempt++) {
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
        const items = await this._fetchPageMedia(nextUrl, mode);

        if (items.length > 0) {
          if (nextUrl.split("#")[0] === liveUrlClean) {
            this._resetPageLockAndRender(mode, dir > 0 ? 0 : -1, dir);
          } else {
            this._lists[mode] = items;
            this._indices[mode] = dir > 0 ? 0 : items.length - 1;
            this._xpageLocked = true;
            this._xpageUrl = nextUrl;
            await this._renderMedia(
              items[this._indices[mode]],
              this._indices[mode],
              items.length,
              dir,
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
        const list = this._lists[mode];
        if (list?.length) this._setCounter(this._indices[mode], list.length);
      }, 2500);
    },

    _resetPageLockAndRender(mode, defaultIdx, fallbackDir = 1) {
      this._resetPageLock();
      this.refreshMediaPipelines();
      const list = this._lists[mode];
      if (!list?.length) return;
      this._indices[mode] = defaultIdx === -1 ? list.length - 1 : 0;
      this._renderMedia(
        list[this._indices[mode]],
        this._indices[mode],
        list.length,
        fallbackDir,
      );
    },

    // ── Media rendering ───────────────────────────────────────────────────

    async _renderMedia(current, idx, total, lastDirection = 1) {
      const { overlay, container, ssInputWrapper } = this._el;
      overlay.style.display = "flex";
      document.body.classList.add("gv-noscroll");
      overlay.focus();

      // Cancel any in-flight decode or media event listeners
      this._decodeAbort?.abort();
      this._mediaListenerAbort?.abort();
      this._mediaListenerAbort = null;

      // Force teardown of active HTML5 video and iframe instances
      const existingVid = container.querySelector("video");
      if (existingVid) {
        existingVid.pause();
        existingVid.removeAttribute("src");
        existingVid.load();
      }
      const existingIframe = container.querySelector("iframe");
      if (existingIframe) {
        existingIframe.src = "about:blank";
      }

      container.replaceChildren();
      this._resetZoom();

      const isVideo = current.tagName !== "IMG";
      overlay.classList.toggle("is-video", isVideo);

      if (current.tagName === "IMG") {
        await this._renderImage(current, lastDirection);
      } else {
        await this._renderVideoOrEmbed(current);
      }

      if (ssInputWrapper)
        ssInputWrapper.style.display = current.tagName !== "IMG" ? "none" : "";

      this._setCounter(idx, total);
      this._updateSlideshowButton();
    },

    async _renderImage(current, lastDirection) {
      const el = new Image();
      el.src = this.getFullSrc(current);
      const controller = new AbortController();
      this._decodeAbort = controller;

      try {
        await el.decode();
      } catch {
        if (!controller.signal.aborted) {
          // Image failed to decode — skip it
          this._decodeAbort = null;
          const fallbackStep = lastDirection === 0 ? 1 : lastDirection;
          this._navigateGallery(this._galleryMode, fallbackStep);
        }
        return;
      }

      if (controller.signal.aborted) return;
      this._decodeAbort = null;
      this._el.container.appendChild(el);
    },

    async _renderVideoOrEmbed(current) {
      // Try to resolve a direct CDN URL from iframe embed services
      let directSrc =
        current.tagName !== "DIV" ||
        current.classList.contains("video-container")
          ? await this._fetchTurboCDNSrc(current)
          : null;

      // Fall back to extracting src from <video> or <source> elements
      if (!directSrc) {
        const node =
          current.tagName === "VIDEO"
            ? current
            : current.querySelector("video");
        if (node) {
          directSrc =
            node.getAttribute("src") ||
            node.src ||
            node.querySelector("source")?.getAttribute("src");
        } else {
          const sourceEl = current.querySelector("source");
          if (sourceEl) directSrc = sourceEl.getAttribute("src");
        }
      }

      const isDirectStream =
        directSrc &&
        /\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(directSrc.split("#")[0]);

      if (
        isDirectStream ||
        current.tagName === "VIDEO" ||
        (directSrc && current.tagName !== "IFRAME")
      ) {
        this._mountVideoElement(
          directSrc || current.getAttribute("src") || current.currentSrc,
        );
      } else {
        this._mountIframeElement(current, directSrc);
      }
    },

    _mountVideoElement(src) {
      const el = document.createElement("video");
      el.src = src;
      el.controls = true;
      el.loop = !this._slideshowActive;
      el.autoplay = true;
      el.preload = "auto";
      el.volume = settings.videoVolume;
      el.muted = settings.videoMuted;
      el.setAttribute("playsinline", "");

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

      this._el.container.appendChild(el);
      el.play().catch(() => {
        el.muted = true;
        el.play().catch(() => {});
      });
    },

    _mountIframeElement(current, directSrc) {
      const el = document.createElement("iframe");
      let src =
        current.tagName === "DIV"
          ? current.getAttribute("onclick")?.match(/'([^']+)'/)?.[1]
          : directSrc || current.src;
      if (src?.startsWith("//")) src = "https:" + src;

      el.style.cssText =
        "width: 90vw; height: calc(100vh - 170px); max-height: 80vh; border: none; background: #000;";
      el.allow = "fullscreen; autoplay";
      el.setAttribute("allowfullscreen", "");
      this._el.container.appendChild(el);

      if (src) {
        try {
          const url = new URL(src);
          url.searchParams.set("autoplay", "1");
          el.src = url.toString();
        } catch {
          el.src = src;
        }
      }
    },

    // ── Edge / thread jump ────────────────────────────────────────────────

    _jumpToEdge(edge) {
      if (this._xpageLocked) {
        this._resetPageLock();
        this.refreshMediaPipelines();
      }
      const { list, setIdx, mode } = this._modeState();
      if (!list?.length) return;
      const targetIdx = edge === "first" ? 0 : list.length - 1;
      setIdx(targetIdx);
      this._renderMedia(
        list[targetIdx],
        targetIdx,
        list.length,
        edge === "first" ? 1 : -1,
      );
      if (this._slideshowActive) this._evaluateActiveAutoplayContext();
    },

    async _jumpToThreadEdge(edge) {
      const mode = this._normaliseMode(this._galleryMode);
      const liveUrlClean = window.location.href.split("#")[0];
      const base = this._getBaseThreadUrl();

      let targetUrl = base;
      if (edge === "last") {
        const maxPage = this._getMaxPage();
        targetUrl =
          maxPage <= 1
            ? base
            : `${base}${base.endsWith("/") ? "" : "/"}page-${maxPage}`;
      }

      if (targetUrl.split("#")[0] === liveUrlClean) {
        this._resetPageLockAndRender(
          mode,
          edge === "first" ? 0 : -1,
          edge === "first" ? 1 : -1,
        );
        return;
      }

      this._showCrossPageHint(
        `Scanning page ${this._parsePageNum(targetUrl) || 1}…`,
      );
      const items = await this._fetchPageMedia(targetUrl, mode);

      if (items.length > 0) {
        this._lists[mode] = items;
        this._indices[mode] = edge === "first" ? 0 : items.length - 1;
        this._xpageLocked = true;
        this._xpageUrl = targetUrl;
        await this._renderMedia(
          items[this._indices[mode]],
          this._indices[mode],
          items.length,
          edge === "first" ? 1 : -1,
        );
        if (this._slideshowActive) this._evaluateActiveAutoplayContext();
      } else {
        this._showCrossPageHint("No media found on destination page.");
        setTimeout(() => {
          const list = this._lists[mode];
          if (list?.length) this._setCounter(this._indices[mode], list.length);
        }, 2000);
      }
    },

    // ── Close gallery ─────────────────────────────────────────────────────

    closeGallery() {
      this._stopSlideshow();
      this._resetZoom();
      this._resetPageLock();

      // Abort any in-flight decode or media listeners
      this._decodeAbort?.abort();
      this._decodeAbort = null;
      this._mediaListenerAbort?.abort();
      this._mediaListenerAbort = null;

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
      overlay?.classList.remove("is-video");
      overlay.style.display = "none";
      document.body.classList.remove("gv-noscroll");
      window.focus();
    },

    // ── Keyboard events ───────────────────────────────────────────────────

    setupGlobalEvents() {
      window.addEventListener(
        "keydown",
        (e) => {
          if (
            document.activeElement.matches("input, textarea") ||
            document.activeElement.isContentEditable ||
            e.target.closest?.(".slideshow-input")
          )
            return;

          const isVisible = this._el.overlay?.style.display === "flex";
          const key = e.key.toLowerCase();

          // Global hotkeys (work regardless of overlay state)
          // Note: 'a' opens the full gallery when overlay is closed, but
          // navigates left when overlay is open — handled in overlayActions below.
          if (!isVisible) {
            const globalActions = {
              g: () => this._navigateGallery(MODE.MAIN, 0),
              v: () => this._navigateGallery(MODE.VIDEO, 0),
              a: () => this._navigateGallery(MODE.FULL, 0),
              x: () => this._toggleExpandAll(),
            };
            if (globalActions[key]) {
              e.preventDefault();
              globalActions[key]();
              return;
            }
          }

          if (!isVisible) return;

          // Overlay-specific hotkeys
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
            // When overlay is open, G/V/A switch gallery modes without closing
            g: () => this._navigateGallery(MODE.MAIN, 0),
            v: () => this._navigateGallery(MODE.VIDEO, 0),
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
