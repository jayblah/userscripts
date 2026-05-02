// ==UserScript==
// @name         Gooner Panel
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  SimpCity floating UI to help you goon.
// @author       JR
// @match        *://simpcity.*/threads/*
// @exclude      *://simpcity.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const CFG = {
    TITLE: "GOONER PANEL",
    TEAL: "#3db7c7",
    BG: "#171717",
    WIDTH: "155px",
    MAX_SPEED: 11.0,
    DEFAULT_SPEED: 5.0,
    SPEED_MODIFIER: 0.15,
    MEDIA_SELECTOR:
      'img.bbImage, video, iframe.saint-iframe, iframe[src*="video"]',
  };

  const state = {
    autoScroll: GM_getValue("as_enabled", false),
    speed: GM_getValue("as_speed", CFG.DEFAULT_SPEED),
    includeVideos: GM_getValue("as_include_vids", true),
    dir: GM_getValue("as_dir", 1),
    accruedY: 0,
    mediaList: [],
    zoomIdx: 0,
    rafId: null,
    focusInterval: null,
    drag: { active: false, offset: { x: 0, y: 0 } },
    lastWheel: 0,
  };

  const cache = {};
  const getEl = (id) => cache[id] || (cache[id] = document.getElementById(id));

  const save = (key, val) => {
    state[key] = val;
    GM_setValue(`as_${key}`, val);
  };

  const updateScrollLoop = () => {
    if (state.autoScroll && state.speed > 0) {
      const moveStep = state.speed * CFG.SPEED_MODIFIER * state.dir;
      state.accruedY += moveStep;
      const physicalMove = Math.trunc(state.accruedY);
      if (physicalMove !== 0) {
        window.scrollBy(0, physicalMove);
        state.accruedY -= physicalMove;
      }
      state.rafId = requestAnimationFrame(updateScrollLoop);
    } else {
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.rafId = null;
      state.accruedY = 0;
    }
  };

  const updateUI = () => {
    const p = getEl("sc-controls");
    if (!p) return;

    p.querySelector(".speed-text").textContent =
      `SPD: ${Math.round(state.speed)}`;
    p.querySelector(".speed-display").classList.toggle(
      "active",
      state.autoScroll,
    );
    p.querySelector(".dir-up").classList.toggle("active", state.dir === -1);
    p.querySelector(".dir-down").classList.toggle("active", state.dir === 1);

    const vidBtn = p.querySelector(".vid-toggle");
    if (vidBtn) {
      vidBtn.innerHTML = `<u>V</u>IDEO: ${state.includeVideos ? "ON" : "OFF"}`;
      vidBtn.classList.toggle("active", state.includeVideos);
    }
  };

  const actions = {
    toggleScroll: () => {
      state.autoScroll = !state.autoScroll;
      save("enabled", state.autoScroll);
      updateScrollLoop();
      updateUI();
    },
    toggleVideos: () => {
      state.includeVideos = !state.includeVideos;
      save("include_vids", state.includeVideos);
      state.mediaList = [];
      updateUI();
    },
    setDir: (d) => {
      state.dir = d;
      save("dir", d);
      updateUI();
    },
    adjustSpeed: (delta) => {
      state.speed =
        delta === 0
          ? CFG.DEFAULT_SPEED
          : Math.min(CFG.MAX_SPEED, Math.max(0, state.speed + delta));
      save("speed", state.speed);
      updateUI();
      if (state.autoScroll && !state.rafId && state.speed > 0)
        updateScrollLoop();
    },
    toggleExpand: () =>
      document
        .querySelectorAll("img.bbImage")
        .forEach((i) => i.classList.toggle("expanded")),
    closeZoom: () => {
      clearInterval(state.focusInterval);
      state.focusInterval = null;
      const vid = getEl("sc-zoom-vid");
      getEl("sc-zoom-overlay").style.display = "none";
      vid.pause();
      vid.src = "";
      vid.load();
      getEl("sc-zoom-frame").src = "";
      document.body.style.overflow = "";
      window.focus();
    },
    navZoom: (dir) => {
      if (!state.mediaList.length || dir === 0) {
        state.mediaList = [
          ...document.querySelectorAll(CFG.MEDIA_SELECTOR),
        ].filter(
          (el) =>
            el.offsetParent !== null &&
            (state.includeVideos || el.tagName === "IMG"),
        );
      }

      if (!state.mediaList.length) return;

      state.zoomIdx =
        (state.zoomIdx + dir + state.mediaList.length) % state.mediaList.length;
      const current = state.mediaList[state.zoomIdx];
      const img = getEl("sc-zoom-img"),
        vid = getEl("sc-zoom-vid"),
        frame = getEl("sc-zoom-frame");

      [img, vid, frame].forEach((el) => {
        el.style.display = "none";
        el.src = "";
      });
      vid.pause();

      if (current.tagName === "IFRAME") {
        frame.src = current.src;
        frame.style.display = "block";
      } else if (current.tagName === "VIDEO") {
        vid.src = current.src || current.querySelector("source")?.src;
        vid.style.display = "block";
        vid.play().catch(() => {});
      } else {
        img.src = current.src;
        img.style.display = "block";
      }

      getEl("sc-zoom-overlay").style.display = "flex";
      document.body.style.overflow = "hidden";
      getEl("z-count").textContent =
        `${state.zoomIdx + 1} / ${state.mediaList.length}`;

      if (!state.focusInterval) {
        state.focusInterval = setInterval(
          () => getEl("sc-focus-trap")?.focus(),
          200,
        );
      }
    },
  };

  const injectStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
            :root { --sc-teal: ${CFG.TEAL}; --sc-bg: ${CFG.BG}; }
            .sc-panel { position: fixed; z-index: 9999999; background: var(--sc-bg); color: #efefef; border-radius: 6px; border: 1px solid #262626; padding: 10px; font-family: sans-serif; width: ${CFG.WIDTH}; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 8px 30px #000; }
            .sc-header { text-align: center; font-weight: 900; color: var(--sc-teal); cursor: move; padding-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; user-select: none; }
            .sc-btn { background: #222; border: 1px solid #333; border-radius: 4px; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; font-weight: 700; color: #aaa; font-size: 11px; transition: 0.2s; }
            .sc-btn:hover { border-color: var(--sc-teal); color: #fff; background: #2a2a2a; }
            .sc-btn.active { background: #0e3a40 !important; color: var(--sc-teal) !important; border-color: var(--sc-teal) !important; }
            .sc-btn-group { display: flex; gap: 6px; width: 100%; }
            .sc-btn.small { flex: 1; }
            .sc-nav-row .sc-btn { font-size: 16px; line-height: 0; padding-bottom: 2px; }
            .speed-display { flex: 2; font-size: 10px; background: #222; border: 1px solid #333; height: 30px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 800; cursor: pointer; transition: 0.2s; color: #aaa; }
            .speed-display.active { background: #0e3a40 !important; color: var(--sc-teal) !important; border-color: var(--sc-teal) !important; }
            img.bbImage.expanded { display: block; max-width: 100% !important; max-height: 94vh; margin: 15px auto; border: 1px solid #333; }
            #sc-zoom-overlay { position: fixed; inset:0; background: rgba(0,0,0,0.98); display: none; align-items: center; justify-content: center; z-index: 10000000; backdrop-filter: blur(4px); }
            #sc-zoom-img, #sc-zoom-vid, #sc-zoom-frame { max-width: 96%; max-height: 96%; object-fit: contain; display: none; z-index: 10000001; position: relative; }
            #sc-zoom-frame { width: 85vw; height: 85vh; border: none; background: #000; }
            .z-hint { position: fixed; color: var(--sc-teal); font-size: 14px; font-weight: 900; opacity: 0.4; pointer-events: none; z-index: 10000010; text-shadow: 2px 2px 4px #000; }
            #z-count { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); color: var(--sc-teal); font-weight: 800; background: rgba(0,0,0,0.8); padding: 5px 15px; border-radius: 20px; z-index: 10000015; border: 1px solid #333; }
            #sc-focus-trap { position: absolute; left: -9999px; top: -9999px; opacity: 0; }
            u { text-decoration-thickness: 1.5px; text-underline-offset: 2px; }
        `;
    document.head.appendChild(style);
  };

  const initUI = () => {
    const p = document.createElement("div");
    p.id = "sc-controls";
    p.className = "sc-panel";
    p.style.top = GM_getValue("p_top", "120px");
    p.style.left = GM_getValue("p_left", "14px");

    const btn = (html, fn, cls = "") => {
      const b = document.createElement("div");
      b.className = `sc-btn ${cls}`;
      b.innerHTML = html;
      b.onclick = (e) => {
        e.stopPropagation();
        fn();
      };
      return b;
    };

    const spd = document.createElement("div");
    spd.className = "speed-display";
    spd.innerHTML = `<span class="speed-text"></span>`;
    spd.onclick = actions.toggleScroll;

    const hdr = document.createElement("div");
    hdr.className = "sc-header";
    hdr.textContent = CFG.TITLE;
    hdr.onmousedown = (e) => {
      state.drag.active = true;
      state.drag.offset = {
        x: e.clientX - p.offsetLeft,
        y: e.clientY - p.offsetTop,
      };
    };

    const rowConfigs = [
      [
        "sc-btn-group",
        [
          ["↑", () => actions.setDir(-1), "small dir-up"],
          [spd],
          ["↓", () => actions.setDir(1), "small dir-down"],
        ],
      ],
      [
        "sc-btn-group",
        [
          ["-", () => actions.adjustSpeed(-1), "small"],
          ["↺", () => actions.adjustSpeed(0), "small"],
          ["+", () => actions.adjustSpeed(1), "small"],
        ],
      ],
      [
        "sc-btn-group sc-nav-row",
        [
          ["▴", () => window.scrollTo({ top: 0, behavior: "smooth" }), "small"],
          [
            "▾",
            () =>
              window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth",
              }),
            "small",
          ],
        ],
      ],
    ];

    p.appendChild(hdr);
    rowConfigs.forEach(([cls, bts]) => {
      const r = document.createElement("div");
      r.className = cls;
      bts.forEach((b) =>
        r.appendChild(b[0] instanceof HTMLElement ? b[0] : btn(...b)),
      );
      p.appendChild(r);
    });

    p.append(
      btn("E<u>X</u>PAND ALL", actions.toggleExpand),
      btn("<u>G</u>ALLERY", () => actions.navZoom(0)),
      btn("", actions.toggleVideos, "vid-toggle"),
    );
    document.body.appendChild(p);

    const over = document.createElement("div");
    over.id = "sc-zoom-overlay";
    over.innerHTML = `<button id="sc-focus-trap"></button><div class="z-hint" style="top:20px;left:50%;transform:translateX(-50%)">[W] CLOSE</div><div class="z-hint" style="top:50%;left:20px;transform:translateY(-50%)">[A] PREV</div><div class="z-hint" style="top:50%;right:20px;transform:translateY(-50%)">[D] NEXT</div><img id="sc-zoom-img"><video id="sc-zoom-vid" controls loop></video><iframe id="sc-zoom-frame" allow="fullscreen"></iframe><div id="z-count"></div>`;
    over.onclick = (e) => e.target === over && actions.closeZoom();
    over.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const now = performance.now();
        if (now - state.lastWheel < 180) return;
        state.lastWheel = now;
        actions.navZoom(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false },
    );
    document.body.appendChild(over);
  };

  const setupEvents = () => {
    document.addEventListener("mousemove", (e) => {
      if (!state.drag.active) return;
      const p = getEl("sc-controls");
      p.style.left = `${e.clientX - state.drag.offset.x}px`;
      p.style.top = `${e.clientY - state.drag.offset.y}px`;
    });
    document.addEventListener("mouseup", () => {
      if (state.drag.active) {
        state.drag.active = false;
        const p = getEl("sc-controls");
        GM_setValue("p_top", p.style.top);
        GM_setValue("p_left", p.style.left);
      }
    });
    document.addEventListener(
      "keydown",
      (e) => {
        if (
          ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) ||
          document.activeElement.isContentEditable
        )
          return;
        const k = e.key.toLowerCase();
        const isZoomed = getEl("sc-zoom-overlay").style.display === "flex";
        const keyMap = {
          g: () => actions.navZoom(0),
          x: actions.toggleExpand,
          v: actions.toggleVideos,
          w: () => isZoomed && actions.closeZoom(),
          escape: () => isZoomed && actions.closeZoom(),
          a: () => isZoomed && actions.navZoom(-1),
          arrowleft: () => isZoomed && actions.navZoom(-1),
          d: () => isZoomed && actions.navZoom(1),
          s: () => isZoomed && actions.navZoom(1),
          arrowright: () => isZoomed && actions.navZoom(1),
        };
        if (keyMap[k]) {
          e.preventDefault();
          e.stopImmediatePropagation();
          keyMap[k]();
        }
      },
      true,
    );
  };

  const init = () => {
    injectStyles();
    initUI();
    setupEvents();
    updateUI();
    if (state.autoScroll) updateScrollLoop();
  };

  document.readyState === "complete"
    ? init()
    : window.addEventListener("load", init);
})();
