// ==UserScript==
// @name         Goon View™
// @version      1.7.0
// @description  Streamlined media viewing experience for SimpCity.cr with mobile & keyboard support.
// @author       JR
// @license      MIT
// @match        *://simpcity.*/threads/*
// @exclude      *://simpcity.com/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/GoonView.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/GoonView.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const SETTINGS_MAP = {
    panelTop: "gv_p_top",
    panelLeft: "gv_p_left",
  };

  const settings = new Proxy(
    {
      panelTop: GM_getValue(SETTINGS_MAP.panelTop, "120px"),
      panelLeft: GM_getValue(SETTINGS_MAP.panelLeft, "calc(100% - 175px)"),
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
    zoomIdx: 0,
    isExpanded: false,
    shadow: null,
    _touchStart: { x: 0, y: 0 },
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
        .row { display: flex; gap: 6px; }
        .row .btn { flex: 1; }
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
        #media-container img.zoomed { cursor: zoom-out; }
        .counter {
          position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
          color: var(--teal); font-weight: 800; background: rgba(0,0,0,0.8);
          padding: 5px 15px; border-radius: 20px; border: 1px solid #333;
        }
        @media (max-width: 600px) and (pointer: coarse) {
          .panel {
            width: auto;
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
            padding: 6px 8px;
            gap: 5px;
          }
          .header {
            font-size: 9px;
            padding-bottom: 0;
            padding-right: 6px;
            border-bottom: none;
            border-right: 1px solid var(--border);
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transform: rotate(180deg);
            align-self: stretch;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .btn { height: 28px; font-size: 10px; padding: 0 7px; }
          .row.scroll-row { display: none; }
          .lbl-full { display: none; }
          .lbl-short { display: inline; }
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
          <div class="header" id="gv-drag">Goon View™</div>
          <div class="row scroll-row">
            <div class="btn" role="button" tabindex="0" data-action="top" title="Scroll to top">▴ TOP</div>
            <div class="btn" role="button" tabindex="0" data-action="bottom" title="Scroll to bottom">▾ BOT</div>
          </div>
          <div class="btn" role="button" tabindex="0" data-action="expand" id="btn-expand">EXPAND ALL</div>
          <div class="btn" role="button" tabindex="0" data-action="gallery" id="btn-gallery"><span class="lbl-full">IMAGE&nbsp;</span><u>G</u><span class="lbl-full">ALLERY</span><span class="lbl-short">AL</span></div>
          <div class="btn" role="button" tabindex="0" data-action="vgallery" id="btn-vgallery"><u>V</u><span class="lbl-full">IDEO GALLERY</span><span class="lbl-short">ID</span></div>
        </div>
        <div id="overlay" tabindex="-1">
          <div class="z-hint">[A/←] PREV · [D/→] NEXT · [W/↑/ESC] EXIT · [SCROLL] ZOOM</div>
          <div id="media-container"></div>
          <div class="counter" id="gv-counter"></div>
        </div>
      `;
    },

    updateUI() {
      const btnExpand = this.shadow.getElementById("btn-expand");
      btnExpand.innerHTML = this.isExpanded
        ? "<span class='lbl-full'>COLLAPSE ALL</span><span class='lbl-short'>COL</span>"
        : "<span class='lbl-full'>E<u>X</u>PAND ALL</span><span class='lbl-short'>E<u>X</u>P</span>";
    },

    refreshMediaList() {
      const selector = "img.bbImage";
      this.mediaList = Array.from(document.querySelectorAll(selector)).filter(
        (el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 || rect.height > 0;
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
        if (now - (this._lastTap ?? 0) < 300) {
          this._resetZoom();
          this._lastTap = 0;
          return;
        } else this._lastTap = now;

        if (this._scale > 1) {
          this._isPanning = true;
          this._panStart.x = t.clientX - this._panOffset.x;
          this._panStart.y = t.clientY - this._panOffset.y;
        } else this._isPanning = false;
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
        if (Math.abs(dx) > threshold)
          this._galleryMode === "video"
            ? this.openVideoGallery(dx > 0 ? -1 : 1)
            : this.openGallery(dx > 0 ? -1 : 1);
      } else if (Math.abs(dy) > threshold) this.closeGallery();
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

      s.addEventListener("click", (e) => {
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

      overlay.addEventListener(
        "wheel",
        (e) => {
          const hovered = s.elementFromPoint(e.clientX, e.clientY);
          if (hovered?.matches("video, iframe")) return;
          e.preventDefault();
          this._applyZoom(
            this._scale + (e.deltaY < 0 ? this._zoomStep : -this._zoomStep),
          );
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
    },

    async openGallery(dir = 0) {
      this._galleryMode = "main";
      this.refreshMediaList();
      if (!this.mediaList.length) return;
      this.zoomIdx =
        (this.zoomIdx + dir + this.mediaList.length) % this.mediaList.length;
      const current = this.mediaList[this.zoomIdx];
      this._renderMedia(current, this.zoomIdx, this.mediaList.length);
    },

    async openVideoGallery(dir = 0) {
      this._galleryMode = "video";
      const videoSelector =
        'video, iframe.saint-iframe, iframe[src*="video"], iframe[src*="redgifs"], div[onclick*="redgifs.com"]';
      this._videoList = Array.from(
        document.querySelectorAll(videoSelector),
      ).filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0 || el.tagName === "DIV";
      });
      if (!this._videoList.length) return;
      this._videoIdx =
        ((this._videoIdx ?? 0) + dir + this._videoList.length) %
        this._videoList.length;
      this._renderMedia(
        this._videoList[this._videoIdx],
        this._videoIdx,
        this._videoList.length,
      );
    },

    async _renderMedia(current, idx, total) {
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
        const directSrc =
          current.tagName !== "DIV"
            ? await this._fetchTurboCDNSrc(current)
            : null;
        if (directSrc || current.tagName === "VIDEO") {
          const el = document.createElement("video");
          el.src =
            directSrc || current.src || current.querySelector("source")?.src;
          el.controls = true;
          el.loop = true;
          el.autoplay = true;
          el.setAttribute("playsinline", "");
          el.addEventListener(
            "canplay",
            () => {
              el.muted = false;
            },
            { once: true },
          );
          container.appendChild(el);
        } else {
          const el = document.createElement("iframe");
          let src =
            current.tagName === "DIV"
              ? current.getAttribute("onclick")?.match(/'([^']+)'/)?.[1]
              : current.src;
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
