// ==UserScript==
// @name         SC Media Viewer
// @version      2.6.3
// @description  Streamlined media viewing experience for SC with mobile & keyboard support. Includes inline click-to-expand, per-post controls, and auto-seek to unseen content.
// @author       JR
// @license      MIT
// @match        *://simpcity.*/threads/*
// @exclude      *://simpcity.com/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SCViewer.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SCViewer.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const THUMB_PATTERN = /\.(md|th)\.(jpg|webp)$/i;
  const SETTINGS_MAP = {
    panelTop: "gv_p_top",
    panelLeft: "gv_p_left",
    videoVolume: "gv_v_volume",
    videoMuted: "gv_v_muted",
  };

  const settings = new Proxy(
    {
      panelTop: GM_getValue(SETTINGS_MAP.panelTop, "120px"),
      panelLeft: GM_getValue(SETTINGS_MAP.panelLeft, "calc(100% - 175px)"),
      videoVolume: GM_getValue(SETTINGS_MAP.videoVolume, 1.0),
      videoMuted: GM_getValue(SETTINGS_MAP.videoMuted, false),
    },
    {
      set(target, prop, value) {
        target[prop] = value;
        if (SETTINGS_MAP[prop]) GM_setValue(SETTINGS_MAP[prop], value);
        return true;
      },
    },
  );

  const App = {
    mediaList: [],
    _videoList: [],
    zoomIdx: 0,
    _videoIdx: 0,
    isExpanded: false,
    shadow: null,
    _touchStart: { x: 0, y: 0 },
    _lastScroll: 0,
    _lastTap: 0,
    _decodeAbort: null,
    _galleryMode: "main",
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

    init() {
      this.injectGlobalStyles();
      this.createHost();
      this.processInlineElements();

      this.refreshMediaList();
      this._refreshVideoList();
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
          this.refreshMediaList();
          this._refreshVideoList();
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
        .sc-expand-btn.is-expanded { color: #3db7c7; }

        /* PREVENT BACKGROUND OVERLAYS FROM PIERCING THROUGH SHADOW BOUNDARIES */
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
          padding-bottom: 6px; font-size: 11px; text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }
        .btn {
          background: #222; border: 1px solid #333; border-radius: 5px; height: 34px;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          font-weight: 700; color: #aaa; font-size: 11px; transition: all 0.2s ease;
        }
        .btn:hover { border-color: var(--teal); color: #fff; background: #2a2a2a; }
        .btn:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
        .row { display: flex; gap: 6px; }
        .scroll-row .btn { flex: 1 1 0; min-width: 0; }
        .lbl-short { display: none; }
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
        #media-container img {
          transform-origin: center center;
          transition: transform 0.12s ease;
          cursor: zoom-in;
          will-change: transform;
        }
        #media-container img.zoomed { cursor: grab; }
        #media-container img.zoomed.dragging { cursor: grabbing; }
        .counter {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          color: var(--teal); font-weight: 800; background: rgba(0,0,0,0.8);
          padding: 5px 15px; border-radius: 20px; border: 1px solid #333;
          white-space: nowrap;
        }

        @media (max-width: 600px) and (pointer: coarse) {
          .panel { width: auto; flex-direction: row; flex-wrap: nowrap; align-items: center; padding: 8px 10px; gap: 8px; cursor: grab; }
          .panel:active { cursor: grabbing; }
          .header { display: flex; align-items: center; justify-content: center; border-bottom: none; border-right: 1px solid var(--border); padding-bottom: 0; padding-right: 8px; font-size: 10px; min-width: 28px; cursor: grab; }
          .header .lbl-full { display: none; }
          .header .lbl-short { display: inline; }
          .btn { height: 44px; font-size: 15px; padding: 0 14px; border-radius: 7px; }
          .row.scroll-row { display: none; }
          .lbl-full { display: none; }
          .lbl-short { display: inline; }
        }

        @media (max-width: 600px) and (pointer: coarse) {
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
            <span class="lbl-full">Goon View™</span>
            <span class="lbl-short">GV™</span>
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
        </div>
        <div id="overlay" tabindex="-1">
          <div class="z-hint">
            [A/←] PREV · [D/→] NEXT · [W/↑/ESC] EXIT<br>
            [SCROLL] GALLERY · [R-CLICK + SCROLL] ZOOM
          </div>
          <div id="media-container"></div>
          <div class="counter" id="gv-counter"></div>
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

    getBigUrl(src) {
      return src.replace(THUMB_PATTERN, ".$2");
    },

    cleanAttr(str) {
      return str.replace(/\.(md|th)(?=\.)/, "");
    },

    processInlineElements() {
      document
        .querySelectorAll("img.bbImage:not([data-processed-thumb])")
        .forEach((img) => {
          if (!THUMB_PATTERN.test(img.src)) return;
          if (img.title) img.title = this.cleanAttr(img.title);
          if (img.alt) img.alt = this.cleanAttr(img.alt);
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
          const lbContainer = messageMain?.querySelector(".js-lbContainer");
          if (!lbContainer) return;

          const btn = document.createElement("button");
          btn.className = "sc-expand-btn";
          btn.textContent = "⊞ EXP";
          btn.title = "Expand all images in this post";

          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const images = lbContainer.querySelectorAll("img.bbImage");
            const expanding = !btn.classList.contains("is-expanded");

            images.forEach((img) => {
              img.classList.toggle("expanded", expanding);
              if (expanding && !img.dataset.bigLoaded) {
                img.dataset.bigLoaded = "true";
                img.src = this.getBigUrl(img.src);
                img.removeAttribute("srcset");
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

    refreshMediaList() {
      this.mediaList = this._filterVisibleElements("img.bbImage");
    },

    _refreshVideoList() {
      const selector =
        'video, iframe.saint-iframe, iframe[src*="video"], iframe[src*="redgifs"], div[onclick*="redgifs.com"]';
      this._videoList = this._filterVisibleElements(selector);
    },

    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      document.querySelectorAll("img.bbImage").forEach((img) => {
        img.classList.toggle("gv-expanded", this.isExpanded);
        img.classList.toggle("expanded", this.isExpanded);

        if (
          this.isExpanded &&
          !img.dataset.bigLoaded &&
          THUMB_PATTERN.test(img.src)
        ) {
          img.dataset.bigLoaded = "true";
          img.src = this.getBigUrl(img.src);
          img.removeAttribute("srcset");
        }
      });
      if (this.isExpanded) {
        document
          .querySelectorAll('div[onclick*="redgifs.com"]')
          .forEach((div) => div.click());
      }
      this.updateUI();
    },

    _fetchTurboCDNSrc(iframeEl) {
      return new Promise((resolve) => {
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
            if (type === "video") {
              const selector =
                'video, iframe.saint-iframe, iframe[src*="video"], iframe[src*="redgifs"], div[onclick*="redgifs.com"]';
              resolve(Array.from(doc.querySelectorAll(selector)));
            } else {
              resolve(
                Array.from(doc.querySelectorAll("img.bbImage")).filter(
                  (el) => el.src,
                ),
              );
            }
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
      const xEnd = e.changedTouches[0].screenX;
      const yEnd = e.changedTouches[0].screenY;
      const dx = xEnd - this._touchStart.x;
      const dy = yEnd - this._touchStart.y;
      const threshold = 50;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > threshold) {
          this._galleryMode === "video"
            ? this.openVideoGallery(dx > 0 ? -1 : 1)
            : this.openGallery(dx > 0 ? -1 : 1);
        }
      } else if (Math.abs(dy) > threshold) {
        this.closeGallery();
      }
    },

    bindInternalEvents() {
      const s = this.shadow;
      const panel = s.getElementById("gv-panel");
      const overlay = s.getElementById("overlay");

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
      };

      document.body.addEventListener("click", (e) => {
        const img = e.target.closest("img.bbImage");
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
        } else {
          img.classList.add("expanded");
          if (!img.dataset.bigLoaded) {
            img.dataset.bigLoaded = "true";
            img.src = this.getBigUrl(img.src);
            img.removeAttribute("srcset");
          }
        }
      });

      s.addEventListener("click", (e) => {
        if (this._hasDragged) {
          setTimeout(() => (this._hasDragged = false), 50);
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
            this._galleryMode === "video"
              ? this.openVideoGallery(dir)
              : this.openGallery(dir);
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

    openGallery: async function (dir = 0) {
      this._galleryMode = "main";

      if (!this._xpageLocked) this.refreshMediaList();
      if (!this.mediaList.length) return;

      if (dir === 0 && !this._xpageLocked) {
        this.zoomIdx = this._getFirstUnseenIdx(this.mediaList);
      }

      const nextIdx = this.zoomIdx + dir;

      if (dir > 0 && nextIdx >= this.mediaList.length) {
        const url = this._getAdjacentPageUrl(1);

        if (!url) {
          const firstUrl = this._getFirstPageUrl();
          const currentGalleryUrl = (
            this._xpageUrl || window.location.href
          ).split("#")[0];

          if (firstUrl === currentGalleryUrl) {
            this.zoomIdx = 0;
            this._renderMedia(this.mediaList[0], 0, this.mediaList.length);
          } else {
            const liveUrlClean = window.location.href.split("#")[0];
            if (firstUrl === liveUrlClean) {
              this._xpageLocked = false;
              this._xpageUrl = null;
              this.refreshMediaList();
              if (!this.mediaList.length) return;
              this.zoomIdx = 0;
              this._renderMedia(this.mediaList[0], 0, this.mediaList.length);
            } else {
              this._showCrossPageHint("Wrapping to page 1…");
              const items = await this._fetchPageMedia(firstUrl, "image");
              if (items.length) {
                this.mediaList = items;
                this.zoomIdx = 0;
                this._xpageLocked = true;
                this._xpageUrl = firstUrl;
                this._renderMedia(items[0], 0, items.length);
              }
            }
          }
          return;
        }

        const targetClean = url.split("#")[0];
        const liveUrlClean = window.location.href.split("#")[0];
        if (targetClean === liveUrlClean) {
          this._xpageLocked = false;
          this._xpageUrl = null;
          this.refreshMediaList();
          if (!this.mediaList.length) return;
          this.zoomIdx = 0;
          this._renderMedia(this.mediaList[0], 0, this.mediaList.length);
          return;
        }

        this._showCrossPageHint("Loading next page…");
        const items = await this._fetchPageMedia(url, "image");
        if (items.length) {
          this.mediaList = items;
          this.zoomIdx = 0;
          this._xpageLocked = true;
          this._xpageUrl = url;
          this._renderMedia(items[0], 0, items.length);
        }
        return;
      }

      if (dir < 0 && nextIdx < 0) {
        const url = this._getAdjacentPageUrl(-1);

        if (!url) {
          const maxPage = this._getMaxPage();
          const base = this._getFirstPageUrl();
          let lastUrl;
          if (maxPage <= 1) {
            lastUrl = base;
          } else {
            const qIdx = base.indexOf("?");
            const path = qIdx > -1 ? base.substring(0, qIdx) : base;
            const query = qIdx > -1 ? base.substring(qIdx) : "";
            const sep = path.endsWith("/") ? "" : "/";
            lastUrl = `${path}${sep}page-${maxPage}${query}`;
          }

          const currentGalleryUrl = (
            this._xpageUrl || window.location.href
          ).split("#")[0];

          if (lastUrl === currentGalleryUrl) {
            this.zoomIdx = this.mediaList.length - 1;
            this._renderMedia(
              this.mediaList[this.zoomIdx],
              this.zoomIdx,
              this.mediaList.length,
            );
          } else {
            const liveUrlClean = window.location.href.split("#")[0];
            if (lastUrl === liveUrlClean) {
              this._xpageLocked = false;
              this._xpageUrl = null;
              this.refreshMediaList();
              if (!this.mediaList.length) return;
              this.zoomIdx = this.mediaList.length - 1;
              this._renderMedia(
                this.mediaList[this.zoomIdx],
                this.zoomIdx,
                this.mediaList.length,
              );
            } else {
              this._showCrossPageHint("Wrapping to last page…");
              const items = await this._fetchPageMedia(lastUrl, "image");
              if (items.length) {
                this.mediaList = items;
                this.zoomIdx = items.length - 1;
                this._xpageLocked = true;
                this._xpageUrl = lastUrl;
                this._renderMedia(
                  items[this.zoomIdx],
                  this.zoomIdx,
                  items.length,
                );
              }
            }
          }
          return;
        }

        const targetClean = url.split("#")[0];
        const liveUrlClean = window.location.href.split("#")[0];
        if (targetClean === liveUrlClean) {
          this._xpageLocked = false;
          this._xpageUrl = null;
          this.refreshMediaList();
          if (!this.mediaList.length) return;
          this.zoomIdx = this.mediaList.length - 1;
          this._renderMedia(
            this.mediaList[this.zoomIdx],
            this.zoomIdx,
            this.mediaList.length,
          );
          return;
        }

        this._showCrossPageHint("Loading previous page…");
        const items = await this._fetchPageMedia(url, "image");
        if (items.length) {
          this.mediaList = items;
          this.zoomIdx = items.length - 1;
          this._xpageLocked = true;
          this._xpageUrl = url;
          this._renderMedia(items[this.zoomIdx], this.zoomIdx, items.length);
        }
        return;
      }

      this.zoomIdx = (nextIdx + this.mediaList.length) % this.mediaList.length;
      this._renderMedia(
        this.mediaList[this.zoomIdx],
        this.zoomIdx,
        this.mediaList.length,
      );
    },

    openVideoGallery: async function (dir = 0) {
      this._galleryMode = "video";

      if (!this._xpageLocked) this._refreshVideoList();
      if (!this._videoList?.length) return;

      if (dir === 0 && !this._xpageLocked) {
        this._videoIdx = this._getFirstUnseenIdx(this._videoList);
      }

      const nextIdx = (this._videoIdx ?? 0) + dir;

      if (dir > 0 && nextIdx >= this._videoList.length) {
        const url = this._getAdjacentPageUrl(1);

        if (!url) {
          const firstUrl = this._getFirstPageUrl();
          const currentGalleryUrl = (
            this._xpageUrl || window.location.href
          ).split("#")[0];

          if (firstUrl === currentGalleryUrl) {
            this._videoIdx = 0;
            this._renderMedia(this._videoList[0], 0, this._videoList.length);
          } else {
            const liveUrlClean = window.location.href.split("#")[0];
            if (firstUrl === liveUrlClean) {
              this._xpageLocked = false;
              this._xpageUrl = null;
              this._refreshVideoList();
              if (!this._videoList.length) return;
              this._videoIdx = 0;
              this._renderMedia(this._videoList[0], 0, this._videoList.length);
            } else {
              this._showCrossPageHint("Wrapping to page 1…");
              const items = await this._fetchPageMedia(firstUrl, "video");
              if (items.length) {
                this._videoList = items;
                this._videoIdx = 0;
                this._xpageLocked = true;
                this._xpageUrl = firstUrl;
                this._renderMedia(items[0], 0, items.length);
              }
            }
          }
          return;
        }

        const targetClean = url.split("#")[0];
        const liveUrlClean = window.location.href.split("#")[0];
        if (targetClean === liveUrlClean) {
          this._xpageLocked = false;
          this._xpageUrl = null;
          this._refreshVideoList();
          if (!this._videoList.length) return;
          this._videoIdx = 0;
          this._renderMedia(this._videoList[0], 0, this._videoList.length);
          return;
        }

        this._showCrossPageHint("Loading next page…");
        const items = await this._fetchPageMedia(url, "video");
        if (items.length) {
          this._videoList = items;
          this._videoIdx = 0;
          this._xpageLocked = true;
          this._xpageUrl = url;
          this._renderMedia(items[0], 0, items.length);
        }
        return;
      }

      if (dir < 0 && nextIdx < 0) {
        const url = this._getAdjacentPageUrl(-1);

        if (!url) {
          const maxPage = this._getMaxPage();
          const base = this._getFirstPageUrl();
          let lastUrl;
          if (maxPage <= 1) {
            lastUrl = base;
          } else {
            const qIdx = base.indexOf("?");
            const path = qIdx > -1 ? base.substring(0, qIdx) : base;
            const query = qIdx > -1 ? base.substring(qIdx) : "";
            const sep = path.endsWith("/") ? "" : "/";
            lastUrl = `${path}${sep}page-${maxPage}${query}`;
          }

          const currentGalleryUrl = (
            this._xpageUrl || window.location.href
          ).split("#")[0];

          if (lastUrl === currentGalleryUrl) {
            this._videoIdx = this._videoList.length - 1;
            this._renderMedia(
              this._videoList[this._videoIdx],
              this._videoIdx,
              this._videoList.length,
            );
          } else {
            const liveUrlClean = window.location.href.split("#")[0];
            if (lastUrl === liveUrlClean) {
              this._xpageLocked = false;
              this._xpageUrl = null;
              this._refreshVideoList();
              if (!this._videoList.length) return;
              this._videoIdx = this._videoList.length - 1;
              this._renderMedia(
                this._videoList[this._videoIdx],
                this._videoIdx,
                this._videoList.length,
              );
            } else {
              this._showCrossPageHint("Wrapping to last page…");
              const items = await this._fetchPageMedia(lastUrl, "video");
              if (items.length) {
                this._videoList = items;
                this._videoIdx = items.length - 1;
                this._xpageLocked = true;
                this._xpageUrl = lastUrl;
                this._renderMedia(
                  items[this._videoIdx],
                  this._videoIdx,
                  items.length,
                );
              }
            }
          }
          return;
        }

        const targetClean = url.split("#")[0];
        const liveUrlClean = window.location.href.split("#")[0];
        if (targetClean === liveUrlClean) {
          this._xpageLocked = false;
          this._xpageUrl = null;
          this._refreshVideoList();
          if (!this._videoList.length) return;
          this._videoIdx = this._videoList.length - 1;
          this._renderMedia(
            this._videoList[this._videoIdx],
            this._videoIdx,
            this._videoList.length,
          );
          return;
        }

        this._showCrossPageHint("Loading previous page…");
        const items = await this._fetchPageMedia(url, "video");
        if (items.length) {
          this._videoList = items;
          this._videoIdx = items.length - 1;
          this._xpageLocked = true;
          this._xpageUrl = url;
          this._renderMedia(
            items[this._videoIdx],
            this._videoIdx,
            items.length,
          );
        }
        return;
      }

      this._videoIdx =
        (nextIdx + this._videoList.length) % this._videoList.length;
      this._renderMedia(
        this._videoList[this._videoIdx],
        this._videoIdx,
        this._videoList.length,
      );
    },

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
        el.src = current.src;
        const controller = new AbortController();
        this._decodeAbort = controller;
        try {
          await el.decode();
          if (controller.signal.aborted) return;
        } catch {}
        this._decodeAbort = null;
        container.appendChild(el);
      } else {
        // Step 1: Safely check for Direct API Video links first
        let directSrc =
          current.tagName !== "DIV"
            ? await this._fetchTurboCDNSrc(current)
            : null;

        // Step 2: Extract pristine underlying source elements if Plyr components are shielding it
        if (!directSrc) {
          const directNode =
            current.tagName === "VIDEO"
              ? current
              : current.querySelector("video, source");
          if (directNode) {
            directSrc = directNode.getAttribute("src") || directNode.src;
          }
        }

        // Hardened Evaluation Route: Route matching strings to the native pipeline
        const isDirectStream =
          directSrc &&
          /\.(mp4|webm|mov|ogg|m3u8)(\?|$)/i.test(directSrc.split("#")[0]);

        if (
          isDirectStream ||
          current.tagName === "VIDEO" ||
          (directSrc && !current.tagName === "IFRAME")
        ) {
          const el = document.createElement("video");
          el.src =
            directSrc || current.getAttribute("src") || current.currentSrc;

          el.removeAttribute("id");
          el.className = "";
          el.controls = true;
          el.loop = true;
          el.autoplay = true;
          el.preload = "auto";
          el.setAttribute("playsinline", "");

          el.volume = settings.videoVolume;
          el.muted = settings.videoMuted;

          el.addEventListener("volumechange", () => {
            settings.videoVolume = el.volume;
            settings.videoMuted = el.muted;
          });

          container.appendChild(el);
          el.play().catch(() => {
            el.muted = true;
            el.play().catch(() => {});
          });
        } else {
          // If it's a true cross-origin frame wrapper, build an iframe fallback container securely
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
            const url = new URL(src);
            url.searchParams.set("autoplay", "1");
            el.src = url.toString();
          }
        }
      }
      this.shadow.getElementById("gv-counter").textContent =
        `${idx + 1} / ${total}`;
    },

    closeGallery() {
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
            this.openVideoGallery(0);
            return;
          }

          if (isVisible) {
            const isV = this._galleryMode === "video";
            const actions = {
              escape: () => this.closeGallery(),
              w: () => this.closeGallery(),
              s: () => this.closeGallery(),
              arrowup: () => this.closeGallery(),
              arrowdown: () => this.closeGallery(),
              a: () => (isV ? this.openVideoGallery(-1) : this.openGallery(-1)),
              arrowleft: () =>
                isV ? this.openVideoGallery(-1) : this.openGallery(-1),
              d: () => (isV ? this.openVideoGallery(1) : this.openGallery(1)),
              arrowright: () =>
                isV ? this.openVideoGallery(1) : this.openGallery(1),
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
