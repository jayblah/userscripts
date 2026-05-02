// ==UserScript==
// @name         Goon View
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Streamlined media viewing experience for SimpCity.cr with tooltips, floating control panel, and built-in gallery.
// @author       JR
// @match        *://simpcity.*/threads/*
// @exclude      *://simpcity.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const settings = new Proxy(
    {
      includeVideos: GM_getValue("gv_include_vids", true),
      panelTop: GM_getValue("gv_p_top", "120px"),
      panelLeft: GM_getValue("gv_p_left", "calc(100% - 175px)"),
    },
    {
      set(target, prop, value) {
        target[prop] = value;
        const key =
          prop === "includeVideos"
            ? "gv_include_vids"
            : `gv_p_${prop.replace("panel", "").toLowerCase()}`;
        GM_setValue(key, value);
        return true;
      },
    },
  );

  const App = {
    mediaList: [],
    zoomIdx: 0,
    isExpanded: false,
    shadow: null,
    isDragging: false,
    focusInterval: null, // Restored
    _lastWheel: 0,

    refreshMediaList() {
      const selector =
        'img.bbImage, video, iframe.saint-iframe, iframe[src*="video"]';
      this.mediaList = Array.from(document.querySelectorAll(selector)).filter(
        (el) => {
          const rect = el.getBoundingClientRect();
          return (
            (rect.width > 0 || rect.height > 0) &&
            (settings.includeVideos || el.tagName === "IMG")
          );
        },
      );
    },

    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      document
        .querySelectorAll("img.bbImage")
        .forEach((img) => img.classList.toggle("gv-expanded", this.isExpanded));
      this.render();
    },

    init() {
      this.injectGlobalStyles();
      const host = document.createElement("div");
      host.id = "gv-p-root";
      document.body.appendChild(host);
      this.shadow = host.attachShadow({ mode: "open" });
      this.render();
      this.setupGlobalEvents();
    },

    injectGlobalStyles() {
      const style = document.createElement("style");
      style.textContent = `
        img.bbImage.gv-expanded { display: block !important; max-width: 100% !important; max-height: 94vh !important; margin: 15px auto !important; border: 1px solid #333 !important; object-fit: contain !important; }
        body.gv-noscroll { overflow: hidden !important; }
      `;
      document.head.appendChild(style);
    },

    render() {
      const panelHTML = `
        <style>
          :host { --teal: #3db7c7; --bg: #171717; --border: #262626; }
          .panel { position: fixed; z-index: 9999; background: var(--bg); color: #efefef; border-radius: 8px; border: 1px solid var(--border); padding: 12px; font-family: sans-serif; width: 155px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 12px 40px #000; top: ${settings.panelTop}; left: ${settings.panelLeft}; user-select: none; }
          .header { text-align: center; font-weight: 900; color: var(--teal); cursor: move; padding-bottom: 6px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--border); }
          .btn { background: #222; border: 1px solid #333; border-radius: 5px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: 700; color: #aaa; font-size: 11px; transition: 0.2s; }
          .btn:hover { border-color: var(--teal); color: #fff; background: #2a2a2a; }
          .btn.active { background: #0e3a40; color: var(--teal); border-color: var(--teal); }
          .row { display: flex; gap: 6px; }
          .row .btn { flex: 1; }

          u { text-decoration: underline; text-decoration-color: var(--teal); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }

          #overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.98); display: none; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px); outline: none; }
          .z-hint { position: absolute; color: var(--teal); font-size: 12px; font-weight: 900; opacity: 0.7; pointer-events: none; text-shadow: 2px 2px 4px #000; text-align: center; z-index: 10006; top: 20px; left: 50%; transform: translateX(-50%); }
          .z-help { font-size: 11px; font-weight: 600; color: #eee; margin-top: 4px; letter-spacing: 0.5px; }

          #media-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; z-index: 10001; }
          #media-container img, #media-container video, #media-container iframe { max-width: 96%; max-height: 96%; object-fit: contain; position: relative; pointer-events: auto; }

          .counter { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); color: var(--teal); font-weight: 800; background: rgba(0,0,0,0.8); padding: 5px 15px; border-radius: 20px; border: 1px solid #333; z-index: 10002; }
          #sc-focus-trap { position: absolute; left: -9999px; top: -9999px; opacity: 0; }
        </style>
        <div class="panel" id="gv-panel">
          <div class="header" id="gv-drag" title="Drag to move panel">Goon View™</div>
          <div class="row">
            <div class="btn" id="btn-top" title="Scroll to top of page">▴ TOP</div>
            <div class="btn" id="btn-bot" title="Scroll to bottom of page">▾ BOT</div>
          </div>
          <div class="btn" id="btn-expand" title="Toggle full-size expansion for all images [X]">${this.isExpanded ? "COLLAPSE ALL" : "E<u>X</u>PAND ALL"}</div>
          <div class="btn" id="btn-gallery" title="Open the media gallery [G]"><u>G</u>ALLERY</div>
          <div class="btn ${settings.includeVideos ? "active" : ""}" id="btn-video" title="Toggle whether to include videos in gallery mode [V]"><u>V</u>IDEO: ${settings.includeVideos ? "ON" : "OFF"}</div>
        </div>
        <div id="overlay" tabindex="0">
            <button id="sc-focus-trap"></button>
            <div class="z-hint">
                <div class="z-help">
                    [A / ←] PREV &nbsp; | &nbsp; [D / →] NEXT &nbsp; | &nbsp; [WHEEL] NAV &nbsp; | &nbsp; [W / ESC] EXIT
                </div>
            </div>
            <div id="media-container"></div>
            <div class="counter" id="gv-counter"></div>
        </div>
      `;
      this.shadow.innerHTML = panelHTML;
      this.bindInternalEvents();
    },

    bindInternalEvents() {
      const s = this.shadow;
      s.getElementById("btn-top").onclick = () =>
        window.scrollTo({ top: 0, behavior: "smooth" });
      s.getElementById("btn-bot").onclick = () =>
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      s.getElementById("btn-expand").onclick = () => this.toggleExpand();
      s.getElementById("btn-video").onclick = () => {
        settings.includeVideos = !settings.includeVideos;
        this.render();
      };
      s.getElementById("btn-gallery").onclick = () => this.openGallery(0);

      const overlay = s.getElementById("overlay");
      overlay.onclick = (e) => {
        if (e.target === overlay || e.target.id === "media-container")
          this.closeGallery();
      };

      const handleWheel = (e) => {
        const hovered = this.shadow.elementFromPoint(e.clientX, e.clientY);
        if (
          hovered &&
          (hovered.tagName === "VIDEO" || hovered.tagName === "IFRAME")
        )
          return;
        e.preventDefault();
        const now = Date.now();
        if (now - this._lastWheel < 180) return;
        this._lastWheel = now;
        this.openGallery(e.deltaY > 0 ? 1 : -1);
      };
      overlay.addEventListener("wheel", handleWheel, { passive: false });

      const dragHdr = s.getElementById("gv-drag");
      const panel = s.getElementById("gv-panel");
      dragHdr.onmousedown = (e) => {
        this.isDragging = true;
        const offsetX = e.clientX - panel.offsetLeft;
        const offsetY = e.clientY - panel.offsetTop;
        const doDrag = (m) => {
          if (!this.isDragging) return;
          panel.style.left = `${m.clientX - offsetX}px`;
          panel.style.top = `${m.clientY - offsetY}px`;
        };
        const stopDrag = () => {
          this.isDragging = false;
          settings.panelLeft = panel.style.left;
          settings.panelTop = panel.style.top;
          document.removeEventListener("mousemove", doDrag);
          document.removeEventListener("mouseup", stopDrag);
        };
        document.addEventListener("mousemove", doDrag);
        document.addEventListener("mouseup", stopDrag);
      };
    },

    openGallery(dir = 0) {
      this.refreshMediaList();
      if (!this.mediaList.length) return;

      this.zoomIdx =
        (this.zoomIdx + dir + this.mediaList.length) % this.mediaList.length;
      const current = this.mediaList[this.zoomIdx];
      const overlay = this.shadow.getElementById("overlay");
      const container = this.shadow.getElementById("media-container");

      overlay.style.display = "flex";
      document.body.classList.add("gv-noscroll");

      // RESTORED FOCUS TRAP
      if (!this.focusInterval) {
        this.focusInterval = setInterval(() => {
          const trap = this.shadow.getElementById("sc-focus-trap");
          if (trap) trap.focus();
        }, 200);
      }

      // Cleanup logic
      const oldVideo = container.querySelector("video");
      if (oldVideo) {
        oldVideo.pause();
        oldVideo.src = "";
        oldVideo.load();
      }
      container.innerHTML = "";

      let el;
      if (current.tagName === "IMG") {
        el = new Image();
        el.src = current.src;
      } else if (current.tagName === "VIDEO") {
        el = document.createElement("video");
        el.src = current.src || current.querySelector("source")?.src;
        el.controls = true;
        el.loop = true;
        el.autoplay = true;
        el.play().catch(() => {});
      } else {
        el = document.createElement("iframe");
        el.src = current.src;
        el.style.cssText =
          "width: 85vw; height: 85vh; border: none; background: #000;";
        el.allow = "fullscreen";
      }

      container.appendChild(el);
      this.shadow.getElementById("gv-counter").textContent =
        `${this.zoomIdx + 1} / ${this.mediaList.length}`;
    },

    closeGallery() {
      if (this.focusInterval) {
        clearInterval(this.focusInterval);
        this.focusInterval = null;
      }
      const container = this.shadow.getElementById("media-container");
      const video = container.querySelector("video");
      if (video) {
        video.pause();
        video.src = "";
        video.load();
      }

      this.shadow.getElementById("overlay").style.display = "none";
      container.innerHTML = "";
      document.body.classList.remove("gv-noscroll");
      window.focus();
    },

    setupGlobalEvents() {
      window.addEventListener(
        "keydown",
        (e) => {
          if (
            ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) ||
            document.activeElement.isContentEditable
          )
            return;

          const overlay = this.shadow.getElementById("overlay");
          const isVisible = overlay && overlay.style.display === "flex";
          const key = e.key.toLowerCase();

          const actions = {
            g: () => this.openGallery(0),
            x: () => this.toggleExpand(),
            v: () => {
              settings.includeVideos = !settings.includeVideos;
              this.render();
            },
            escape: () => isVisible && this.closeGallery(),
            w: () => isVisible && this.closeGallery(),
            a: () => isVisible && this.openGallery(-1),
            arrowleft: () => isVisible && this.openGallery(-1),
            d: () => isVisible && this.openGallery(1),
            arrowright: () => isVisible && this.openGallery(1),
          };

          if (actions[key]) {
            e.preventDefault();
            e.stopImmediatePropagation();
            actions[key]();
          }
        },
        true,
      );
    },
  };

  App.init();
})();
