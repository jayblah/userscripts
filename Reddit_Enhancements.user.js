// ==UserScript==
// @name            Reddit Enhancements
// @description     Nukes Reddit clutter, adds image lightbox/gallery, collapse tools, NATO/Binary decoder, and social search helpers.
// @author          JR
// @version         2.0
// @license         MIT
// @match           *://*.reddit.com/*
// @updateURL       https://raw.githubusercontent.com/jayblah/userscripts/main/Reddit_Enhancements.user.js
// @downloadURL     https://raw.githubusercontent.com/jayblah/userscripts/main/Reddit_Enhancements.user.js
// @grant           none
// @run-at          document-start
// ==/UserScript==

(function () {
  "use strict";

  // =========================================================
  // CONFIG
  // =========================================================

  const THREAD_COLORS = [
    "#4CAF50",
    "#1E88DB",
    "#FF9800",
    "#B650C7",
    "#F44336",
    "#3ABAA2",
  ];

  const DECODER_COLORS = {
    bg: "#1a1a1b",
    border: "#343536",
    text: "#d7dadc",
    accent: "#ff4500",
    success: "#05a133",
    darkInput: "#050505",
  };

  const COMMENT_SELECTORS = [
    '[data-testid="comment"]',
    "shreddit-comment",
    ".Comment",
    ".usertext-body",
    ".md",
    ".comment",
  ];

  const NUKE_SELECTORS = [
    "#subreddit-banner-img",
    'faceplate-tracker[noun="games_drawer"]',
    "games-section-badge-controller",
    "#games_section",
    'faceplate-tracker[noun="resources_menu"]',
    'faceplate-tracker[noun="news_home"]',
    'faceplate-tracker[noun="explore_home"]',
    'a[href*="/news/"]',
    'a[href*="/explore/"]',
    "shreddit-related-communities",
    'details:has(summary[aria-controls="RESOURCES"])',
    "community-highlight-carousel",
    'faceplate-tracker[source="achievements"]',
    'faceplate-tracker[source="earn"]',
    'faceplate-tracker[noun="premium_menu"]',
    'faceplate-tracker[noun="advertise"]',
    'faceplate-tracker[noun="try_reddit_pro"]',
    "search-telemetry-tracker:has(search-answers-response-container-streaming)",
    "search-answers-response-container-streaming",
    "in-feed-community-recommendations",
  ];

  const NUKE_SELECTOR_STRING = NUKE_SELECTORS.join(", ");

  const SIDEBAR_SELECTORS = [
    "faceplate-partial[id='subreddit-right-rail__partial']",
    "#right-rail-entity-panel-root",
    "shreddit-sidebar",
    "#right-sidebar-container",
    "[grid-area='right-sidebar']",
  ];

  const ALLOWED_SUBREDDITS = [
    "/r/bigtitsinbikinis/",
    "/r/ygwbt/",
    "/r/2busty2hide/",
  ];

  const SOCIAL_SITES = [
    "instagram.com",
    "tiktok.com",
    "onlyfans.com",
    "fansly.com",
    "simpcity.cr",
    "fapello.com",
    "boobpedia.com",
    "babepedia.com",
  ];

  // =========================================================
  // NATO / BINARY DECODER
  // =========================================================

  const NATO_ALPHABET = {
    alpha: "A",
    alfa: "A",
    bravo: "B",
    charlie: "C",
    delta: "D",
    echo: "E",
    foxtrot: "F",
    golf: "G",
    hotel: "H",
    india: "I",
    juliet: "J",
    juliett: "J",
    kilo: "K",
    lima: "L",
    mike: "M",
    november: "N",
    oscar: "O",
    papa: "P",
    quebec: "Q",
    romeo: "R",
    sierra: "S",
    tango: "T",
    uniform: "U",
    victor: "V",
    whiskey: "W",
    xray: "X",
    "x-ray": "X",
    yankee: "Y",
    zulu: "Z",
    zero: "0",
    one: "1",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    space: " ",
    dot: ".",
    period: ".",
    underscore: "_",
    dash: "-",
    hyphen: "-",
    ".": ".",
    _: "_",
    "-": "-",
    " ": " ",
  };

  const NATO_SORTED = Object.keys(NATO_ALPHABET).sort(
    (a, b) => b.length - a.length,
  );
  const binaryPattern = /\b(?:[01]{8} ?){2,}\b/g;
  const SOCIAL_SITE_CLAUSE = SOCIAL_SITES.map((s) => `site:${s}`).join(" OR ");

  // =========================================================
  // HELPERS
  // =========================================================

  function buildSocialSearchURL(q) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${q} (${SOCIAL_SITE_CLAUSE})`)}`;
  }

  let _onAllowedSubreddit = ALLOWED_SUBREDDITS.some((sub) =>
    window.location.pathname.toLowerCase().startsWith(sub),
  );

  function isAllowedSubreddit() {
    return _onAllowedSubreddit;
  }

  function natoToText(s) {
    const tokens = s.toLowerCase().split(/[\s,+/]+/);
    let res = "";
    let count = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].trim();
      if (!token) continue;
      if (NATO_ALPHABET[token] !== undefined) {
        res += NATO_ALPHABET[token];
        count++;
      } else {
        let matchedCompound = false;
        for (const w of NATO_SORTED) {
          if (w.includes("-") && token === w) {
            res += NATO_ALPHABET[w];
            count++;
            matchedCompound = true;
            break;
          }
        }
      }
    }
    return count >= 2 ? res : null;
  }

  function binaryToText(b) {
    const clean = b.replace(/\s/g, "");
    if (clean.length % 8 !== 0) return null;
    let res = "";
    for (let i = 0; i < clean.length; i += 8) {
      const c = parseInt(clean.slice(i, i + 8), 2);
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) return null;
      if (c > 126) return null;
      res += String.fromCharCode(c);
    }
    return res;
  }

  function deepQueryAll(root, selector, results = []) {
    const direct = root.querySelectorAll(selector);
    for (let i = 0; i < direct.length; i++) results.push(direct[i]);
    const all = root.querySelectorAll("*");
    for (let i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) deepQueryAll(all[i].shadowRoot, selector, results);
    }
    return results;
  }

  // =========================================================
  // GLOBAL CSS
  // =========================================================

  const globalStyle = document.createElement("style");
  globalStyle.textContent = `
    ${NUKE_SELECTOR_STRING} { display: none !important; }
    award-button, shreddit-slot[slot="award-button"] { display: none !important; }
    #user-drawer-content hr.bg-neutral-border-weak,
    #left-sidebar-container hr.border-neutral-border-weak,
    flex-left-nav-container hr.border-neutral-border-weak { display: none !important; }
    a[href*="reddit.com/news"], a[href*="/news/"] { display: none !important; }
    a[href*="reddit.com/explore"], a[href*="/explore/"] { display: none !important; }

    .pp_imageViewable { cursor: zoom-in !important; }

    #pp_lightbox {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.95);
      z-index: 999999;
      display: none;
      flex-direction: column;
      align-items: center;
      cursor: zoom-out;
      user-select: none;
      padding: 60px 0 24px 0; /* Tightened and stabilized */
      box-sizing: border-box;
    }

    #pp_lightbox img#pp_lightbox_img {
      max-width: 90%;
      max-height: 70vh; /* Use viewport height to prevent overflow */
      margin: auto 0;   /* Centers in the remaining space */
      pointer-events: none;
      object-fit: contain;
    }

    .pp_nav_btn {
      position: absolute; top: 50%; transform: translateY(-50%);
      background: rgba(255,255,255,0.1); color: white; border: none;
      font-size: 28px; cursor: pointer; border-radius: 4px;
      transition: background 0.2s; z-index: 1000000;
      box-sizing: border-box; height: 60px; width: 60px;
      display: flex; justify-content: center; align-items: center;
      padding: 0; line-height: 1;
    }
    .pp_nav_btn:hover { background: rgba(255,255,255,0.25); }
    #pp_nav_prev { left: 20px; }
    #pp_nav_next { right: 20px; }

    #pp_gallery_counter {
      position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
      color: rgba(255,255,255,0.8); font-family: sans-serif; font-size: 14px;
      background: rgba(0,0,0,0.6); padding: 6px 16px; border-radius: 20px;
      display: none; z-index: 1000001;
    }

    .pp_decoder_box {
      margin: 8px 0; padding: 6px;
      background: ${DECODER_COLORS.bg}; border: 1px solid ${DECODER_COLORS.border};
      border-radius: 6px; font-family: sans-serif;
      display: flex; align-items: center; gap: 10px; color: ${DECODER_COLORS.text};
    }
    .pp_decoder_label { font-size: 10px; font-weight: 900; color: ${DECODER_COLORS.accent}; text-transform: uppercase; letter-spacing: 1px; }
    .pp_decoder_result { background: ${DECODER_COLORS.darkInput}; padding: 5px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; flex-grow: 1; border: 1px solid #222; color: #eee; overflow-x: auto; white-space: nowrap; }
    .pp_decoder_btn { display: inline-flex; align-items: center; justify-content: center; border: none; padding: 0 12px; height: 26px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 700; transition: filter 0.1s; line-height: 1; }

    .pp_selection_popup { position: absolute; background: ${DECODER_COLORS.bg}; border: 1px solid ${DECODER_COLORS.border}; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 10000; display: none; overflow: hidden; }
    .pp_selection_popup button { background: transparent; color: ${DECODER_COLORS.text}; border: none; padding: 6px 14px; cursor: pointer; font-size: 11px; font-weight: 600; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 32px; }
    .pp_selection_popup button:hover { background: ${DECODER_COLORS.border}; }

    #pp_sidebar_wrap { position: fixed; top: 0; right: 0; height: 100%; z-index: 9000; display: flex; align-items: center; pointer-events: none; transition: transform 0.25s ease; }
    #pp_sidebar_wrap.pp_sb_collapsed { transform: translateX(312px); }
    #pp_sidebar_tab { pointer-events: all; flex-shrink: 0; width: 22px; height: 56px; background: #000; border-radius: 6px 0 0 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #eeefef; font-size: 13px; user-select: none; transition: background 0.15s; box-shadow: -2px 0 6px rgba(0,0,0,0.5); }
    #pp_sidebar_tab:hover { background: #1a1a1a; }
    #pp_sidebar_inner { pointer-events: all; width: 312px; height: 100%; overflow-y: auto; background: var(--color-neutral-background, #1a1a1b); box-shadow: -4px 0 16px rgba(0,0,0,0.4); }

    [grid-area="right-sidebar"], #right-sidebar-container, aside:has(shreddit-sidebar), .right-sidebar { display: none !important; }

    div#pp_float_collapse {
      position: fixed; z-index: 99999; display: none; cursor: grab;
      flex-direction: column; align-items: center; justify-content: center;
      background: rgba(21, 24, 26, 0.9) !important; backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.08) !important; border-radius: 8px !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); width: 34px; padding: 4px 0; box-sizing: border-box;
    }
    div#pp_float_collapse:active { cursor: grabbing; }
    div#pp_float_collapse .pp_collapse_main_btn, div#pp_float_collapse .pp_collapse_sub_btn {
      display: inline-flex !important; align-items: center !important; justify-content: center !important;
      width: 26px !important; background: transparent !important; color: #b3b3b3 !important; border: none !important;
      font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important; border-radius: 4px !important;
      transition: background 0.2s, color 0.2s !important; user-select: none !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;
    }
    div#pp_float_collapse .pp_collapse_main_btn { height: 28px !important; color: #ffffff !important; font-size: 9px !important; font-weight: 700 !important; }
    div#pp_float_collapse .pp_collapse_sub_btn { height: 26px !important; }
    div#pp_float_collapse .pp_collapse_main_btn:hover, div#pp_float_collapse .pp_collapse_sub_btn:hover { background: rgba(255, 255, 255, 0.08) !important; color: #3db7c7 !important; }
    div#pp_float_collapse .pp_collapse_divider { width: 16px; height: 1px; background: rgba(255, 255, 255, 0.15) !important; margin: 4px 0 !important; }
    div#pp_float_collapse.pp_collapsed .pp_collapse_main_btn { color: #3db7c7 !important; }
  `;
  document.documentElement.appendChild(globalStyle);

  // =========================================================
  // LIGHTBOX STORAGE VARIABLES
  // =========================================================

  let currentGalleryImages = [];
  let currentGalleryIndex = 0;
  let lastWheelTime = 0;

  const lightbox = document.createElement("div");
  lightbox.id = "pp_lightbox";

  const attachLightbox = () => {
    if (!document.body?.contains(lightbox)) {
      document.body?.appendChild(lightbox);

      lightbox.innerHTML = `
        <div id="pp_lightbox_close" style="position:absolute; top:20px; right:20px; color:white; font-size:32px; cursor:pointer; z-index:1000001; line-height:1;" title="Close Gallery [Esc]">&times;</div>
        <div id="pp_nav_prev" class="pp_nav_btn" title="Previous Image [A]">&#10094;</div>
        <img id="pp_lightbox_img" src="" alt="Enlarged View">
        <div id="pp_nav_next" class="pp_nav_btn" title="Next Image [D]">&#10095;</div>
        <div id="pp_gallery_counter">1 / 1</div>
      `;

      lightbox.querySelector("#pp_lightbox_close").onclick = (e) => {
        e.stopPropagation();
        lightbox.style.display = "none";
      };
      lightbox.querySelector("#pp_nav_prev").onclick = (e) => {
        e.stopPropagation();
        navigateGallery(-1);
      };
      lightbox.querySelector("#pp_nav_next").onclick = (e) => {
        e.stopPropagation();
        navigateGallery(1);
      };
      lightbox.onclick = (e) => {
        if (e.target === lightbox || e.target.id === "pp_lightbox_img") {
          lightbox.style.display = "none";
        }
      };
    }
  };

  const updateLightboxImage = () => {
    if (!currentGalleryImages.length) return;

    const imgEl = lightbox.querySelector("#pp_lightbox_img");
    const counterEl = lightbox.querySelector("#pp_gallery_counter");
    const prevEl = lightbox.querySelector("#pp_nav_prev");
    const nextEl = lightbox.querySelector("#pp_nav_next");

    const cleanSrc = currentGalleryImages[currentGalleryIndex].replaceAll(
      "&amp;",
      "&",
    );
    if (imgEl) imgEl.src = cleanSrc;

    const multi = currentGalleryImages.length > 1;
    if (prevEl) prevEl.style.display = multi ? "flex" : "none";
    if (nextEl) nextEl.style.display = multi ? "flex" : "none";
    if (counterEl) {
      counterEl.style.display = multi ? "block" : "none";
      if (multi)
        counterEl.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
    }
  };

  const navigateGallery = (direction) => {
    if (!currentGalleryImages.length) return;
    currentGalleryIndex =
      (currentGalleryIndex + direction + currentGalleryImages.length) %
      currentGalleryImages.length;
    updateLightboxImage();
  };

  // =========================================================
  // GLOBAL HOTKEY TRAPS (INTEGRATED CAPTURING OVERRIDES)
  // =========================================================

  window.addEventListener(
    "keydown",
    (e) => {
      // 1. Always bypass hotkeys if typing in inputs or fields across the site
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const key = e.key.toLowerCase();

      // STATE A: Lightbox view captures priorities globally
      if (lightbox && lightbox.style.display === "flex") {
        if (
          [
            "s",
            "w",
            "a",
            "d",
            "x",
            "escape",
            "arrowright",
            "arrowleft",
          ].includes(key)
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();

          if (key === "arrowright" || key === "d") navigateGallery(1);
          else if (key === "arrowleft" || key === "a") navigateGallery(-1);
          else if (key === "escape" || key === "w")
            lightbox.style.display = "none";
        }
        return; // Halt logic tree here when gallery is active
      }

      // STATE B: Standard Thread Navigation (Only run if the toolbar button is active on a thread)
      if (collapseBtn.style.display === "none") return;

      if (["s", "w", "a", "d", "x"].includes(key)) {
        e.preventDefault();
        e.stopImmediatePropagation();

        if (key === "s") toggleCollapseAll();
        else if (key === "w") jumpToTop();
        else if (key === "a") jumpToPrevParent();
        else if (key === "d") jumpToNextParent();
        else if (key === "x") jumpToBottom();
      }
    },
    true,
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (lightbox.style.display !== "flex") return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastWheelTime < 150) return;
      if (e.deltaY > 0) {
        navigateGallery(1);
        lastWheelTime = now;
      } else if (e.deltaY < 0) {
        navigateGallery(-1);
        lastWheelTime = now;
      }
    },
    { passive: false, capture: true },
  );

  // =========================================================
  // SHADOW DOM CAPTURING HELPERS
  // =========================================================

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter") return;
      const input = e
        .composedPath()
        .find(
          (el) =>
            el.tagName === "INPUT" && (el.name === "q" || el.type === "search"),
        );
      if (!input) return;
      const query = input.value?.trim();
      if (!query) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      let subredditName = null;
      const chip = document.querySelector(
        "rpl-input-chip[id='search-input-remove-filter'][selected]",
      );
      if (chip) {
        const match = (chip.getAttribute("aria-label") || "").match(
          /Remove r\/([^\s]+) filter/,
        );
        if (match) subredditName = match[1];
      }
      if (!subredditName) {
        const parts = window.location.pathname.split("/");
        if (parts[1] === "r" && parts[2]) subredditName = parts[2];
      }
      const finalQuery = subredditName
        ? `${query} subreddit:${subredditName}`
        : query;
      window.location.assign(`/search/?q=${encodeURIComponent(finalQuery)}`);
    },
    { capture: true },
  );

  // =========================================================
  // DECODER UI GENERATORS
  // =========================================================

  function createTranslationComponent(type, translatedText) {
    const container = document.createElement("div");
    container.className = "pp_decoder_box";

    const label = document.createElement("div");
    label.className = "pp_decoder_label";
    label.textContent = type === "nato" ? "NATO" : "BIN";

    const resultBox = document.createElement("div");
    resultBox.className = "pp_decoder_result";
    resultBox.textContent = translatedText;

    const copyBtn = document.createElement("button");
    copyBtn.className = "pp_decoder_btn";
    copyBtn.style.background = DECODER_COLORS.border;
    copyBtn.style.color = DECODER_COLORS.text;
    copyBtn.textContent = "COPY";
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(translatedText).then(() => {
        copyBtn.textContent = "DONE";
        copyBtn.style.background = DECODER_COLORS.success;
        setTimeout(() => {
          copyBtn.textContent = "COPY";
          copyBtn.style.background = DECODER_COLORS.border;
        }, 1000);
      });
    };

    const searchBtn = document.createElement("button");
    searchBtn.className = "pp_decoder_btn";
    searchBtn.style.background = DECODER_COLORS.accent;
    searchBtn.style.color = "white";
    searchBtn.textContent = "SEARCH";
    searchBtn.onclick = () =>
      window.open(buildSocialSearchURL(translatedText), "_blank");

    container.append(label, resultBox, copyBtn, searchBtn);
    return container;
  }

  function processTextNode(node) {
    const text = node.textContent;

    const binMatches = text.match(binaryPattern);
    if (binMatches) {
      for (let i = 0; i < binMatches.length; i++) {
        const decoded = binaryToText(binMatches[i]);
        if (decoded?.trim().length > 0) {
          const target =
            node.parentNode.tagName === "P" ? node.parentNode : node;
          target.parentNode.insertBefore(
            createTranslationComponent("binary", decoded),
            target.nextSibling,
          );
        }
      }
    }

    if (/[a-zA-Z]/.test(text)) {
      const decoded = natoToText(text);
      if (decoded) {
        const target = node.parentNode.tagName === "P" ? node.parentNode : node;
        target.parentNode.insertBefore(
          createTranslationComponent("nato", decoded),
          target.nextSibling,
        );
      }
    }
  }

  function scanParagraph(p) {
    if (p.hasAttribute("data-decoded")) return;
    p.setAttribute("data-decoded", "true");
    const nodes = [];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (let i = 0; i < nodes.length; i++) processTextNode(nodes[i]);
  }

  function createSelectionPopup() {
    const popup = document.createElement("div");
    popup.className = "pp_selection_popup";
    const btn = document.createElement("button");
    btn.innerHTML = "🔍 Search";
    popup.appendChild(btn);
    document.body.appendChild(popup);
    return { popup, btn };
  }

  // =========================================================
  // FLOATING COLLAPSE TOOLBAR
  // =========================================================

  let allCollapsed = false;
  const collapseBtn = document.createElement("div");
  collapseBtn.id = "pp_float_collapse";

  collapseBtn.innerHTML = `
    <div class="pp_collapse_main_btn" id="pp_collapse_text" role="button" title="Toggle comment trees [S]">COL</div>
    <div class="pp_collapse_divider"></div>
    <button class="pp_collapse_sub_btn" id="pp_jump_top" title="Scroll to top [W]">⤒</button>
    <button class="pp_collapse_sub_btn" id="pp_jump_prev" title="Previous comment [A]">▲</button>
    <button class="pp_collapse_sub_btn" id="pp_jump_next" title="Next comment [D]">▼</button>
    <button class="pp_collapse_sub_btn" id="pp_jump_bottom" title="Scroll to bottom [X]">⤓</button>
  `;

  const _savedPos = JSON.parse(
    localStorage.getItem("pp_collapse_pos") || "null",
  );
  collapseBtn.style.top = _savedPos ? _savedPos.top + "px" : "auto";
  collapseBtn.style.right = _savedPos ? _savedPos.right + "px" : "auto";
  collapseBtn.style.bottom = _savedPos ? "auto" : "24px";
  collapseBtn.style.left = _savedPos ? "auto" : "24px";
  document.documentElement.appendChild(collapseBtn);

  let _dragging = false,
    _dragOffsetX = 0,
    _dragOffsetY = 0,
    _dragMoved = false;

  collapseBtn.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.id === "pp_collapse_text")
      return;
    e.preventDefault();
    _dragging = true;
    _dragMoved = false;
    const rect = collapseBtn.getBoundingClientRect();
    _dragOffsetX = e.clientX - rect.left;
    _dragOffsetY = e.clientY - rect.top;
  });

  document.addEventListener("mousemove", (e) => {
    if (!_dragging) return;
    _dragMoved = true;
    const right =
      window.innerWidth - (e.clientX - _dragOffsetX) - collapseBtn.offsetWidth;
    const top = e.clientY - _dragOffsetY;
    collapseBtn.style.left = collapseBtn.style.bottom = "auto";
    collapseBtn.style.right = Math.max(0, right) + "px";
    collapseBtn.style.top = Math.max(0, top) + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!_dragging) return;
    _dragging = false;
    if (_dragMoved) {
      localStorage.setItem(
        "pp_collapse_pos",
        JSON.stringify({
          top: parseInt(collapseBtn.style.top),
          right: parseInt(collapseBtn.style.right),
        }),
      );
    }
  });

  function getHeaderOffset() {
    const header = document.querySelector("header.v2");
    return header ? header.offsetHeight : 56;
  }

  function toggleCollapseAll() {
    const children = document.querySelectorAll(
      "shreddit-comment[depth]:not([depth='0'])",
    );
    if (!children.length) return;
    allCollapsed = !allCollapsed;

    const topThreads = Array.from(
      document.querySelectorAll("shreddit-comment[depth='0']"),
    );
    const offset = getHeaderOffset();
    let anchor = topThreads.find(
      (el) => el.getBoundingClientRect().top > offset - 10,
    );
    if (!anchor && topThreads.length > 0)
      anchor = topThreads[topThreads.length - 1];

    for (let i = 0; i < children.length; i++) {
      if (allCollapsed) children[i].setAttribute("collapsed", "");
      else children[i].removeAttribute("collapsed");
    }

    const mainBtnLabel = collapseBtn.querySelector("#pp_collapse_text");
    if (mainBtnLabel) mainBtnLabel.textContent = allCollapsed ? "EXP" : "COL";
    collapseBtn.classList.toggle("pp_collapsed", allCollapsed);

    if (anchor) {
      setTimeout(() => {
        const targetY =
          window.scrollY + anchor.getBoundingClientRect().top - offset;
        window.scrollTo({ top: targetY, behavior: "smooth" });
      }, 30);
    }
  }

  const getTopLevelComments = () =>
    Array.from(document.querySelectorAll("shreddit-comment[depth='0']"));

  function jumpToTop() {
    const post = document.querySelector("shreddit-post");
    if (post) {
      window.scrollTo({
        top:
          window.scrollY + post.getBoundingClientRect().top - getHeaderOffset(),
        behavior: "smooth",
      });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function jumpToPrevParent() {
    const targets = getTopLevelComments();
    const prev = targets
      .reverse()
      .find((el) => el.getBoundingClientRect().top < -5);
    if (prev) {
      window.scrollTo({
        top:
          window.scrollY + prev.getBoundingClientRect().top - getHeaderOffset(),
        behavior: "smooth",
      });
    } else {
      jumpToTop();
    }
  }

  let lastScrollY = 0;
  function jumpToNextParent() {
    const targets = getTopLevelComments();
    if (!targets.length) return;
    const offset = getHeaderOffset();
    const currentScrollY = window.scrollY;
    const next = targets.find(
      (el) => el.getBoundingClientRect().top > offset + 5,
    );

    if (!next) {
      window.scrollTo({
        top: window.scrollY + targets[0].getBoundingClientRect().top - offset,
        behavior: "smooth",
      });
      return;
    }

    const targetY = currentScrollY + next.getBoundingClientRect().top - offset;
    if (
      Math.abs(targetY - currentScrollY) < 3 ||
      Math.abs(targetY - lastScrollY) < 3
    ) {
      window.scrollTo({
        top: window.scrollY + targets[0].getBoundingClientRect().top - offset,
        behavior: "smooth",
      });
    } else {
      lastScrollY = targetY;
      window.scrollTo({ top: targetY, behavior: "smooth" });
    }
  }

  function jumpToBottom() {
    const container =
      document.querySelector("#comment-tree-container") ||
      document.querySelector("shreddit-comment-tree");
    if (container)
      container.scrollIntoView({ behavior: "smooth", block: "end" });
    else
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  collapseBtn
    .querySelector("#pp_collapse_text")
    .addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!_dragMoved) toggleCollapseAll();
    });
  collapseBtn.querySelector("#pp_jump_top").addEventListener("click", (e) => {
    e.stopPropagation();
    jumpToTop();
  });
  collapseBtn.querySelector("#pp_jump_prev").addEventListener("click", (e) => {
    e.stopPropagation();
    jumpToPrevParent();
  });
  collapseBtn.querySelector("#pp_jump_next").addEventListener("click", (e) => {
    e.stopPropagation();
    jumpToNextParent();
  });
  collapseBtn
    .querySelector("#pp_jump_bottom")
    .addEventListener("click", (e) => {
      e.stopPropagation();
      jumpToBottom();
    });

  function syncCollapseButtonVisibility() {
    _onAllowedSubreddit = ALLOWED_SUBREDDITS.some((sub) =>
      window.location.pathname.toLowerCase().startsWith(sub),
    );
    const onThread = window.location.href.includes("/comments/");
    collapseBtn.style.display = onThread ? "flex" : "none";
  }

  const _patchHistory =
    (original) =>
    (...args) => {
      original(...args);
      syncCollapseButtonVisibility();
    };
  history.pushState = _patchHistory(history.pushState.bind(history));
  history.replaceState = _patchHistory(history.replaceState.bind(history));
  window.addEventListener("popstate", syncCollapseButtonVisibility);

  // =========================================================
  // CORE ACTIONS PIPELINE
  // =========================================================

  const Actions = {
    syncCollapseButton: syncCollapseButtonVisibility,

    nukeAwardButtons: () => {
      const awards = deepQueryAll(
        document,
        "award-button:not([pp-award-hidden]), shreddit-slot[slot='award-button']:not([pp-award-hidden])",
      );
      for (let i = 0; i < awards.length; i++) {
        awards[i].style.display = "none";
        awards[i].setAttribute("pp-award-hidden", "true");
      }
    },

    nuke: () => {
      const items = deepQueryAll(document, NUKE_SELECTOR_STRING);
      for (let i = 0; i < items.length; i++) {
        if (items[i].isConnected) items[i].remove();
      }
    },

    handleImages: (post) => {
      if (post.hasAttribute("pp-images-handled")) return;
      const images = post.querySelectorAll(
        "faceplate-img:not([pp-img-handled]), img:not(.pp_imageViewable)",
      );
      if (!images.length) return;

      for (let i = 0; i < images.length; i++) {
        const imgEl = images[i];
        imgEl.classList.add("pp_imageViewable");
        if (imgEl.tagName !== "IMG")
          imgEl.setAttribute("pp-img-handled", "true");

        imgEl.addEventListener(
          "click",
          (e) => {
            const clickedSrc =
              imgEl.getAttribute("src") ||
              imgEl.querySelector("img")?.getAttribute("src");
            if (!clickedSrc) return;

            e.preventDefault();
            e.stopPropagation();
            attachLightbox();

            const galleryContainer =
              imgEl.closest("gallery-carousel") || imgEl.closest("ul");
            if (galleryContainer) {
              const allImgs = Array.from(
                galleryContainer.querySelectorAll("faceplate-img, img"),
              );
              currentGalleryImages = [
                ...new Set(
                  allImgs
                    .map(
                      (el) =>
                        el.getAttribute("src") ||
                        el.querySelector("img")?.getAttribute("src"),
                    )
                    .filter(Boolean),
                ),
              ];
              currentGalleryIndex = currentGalleryImages.indexOf(clickedSrc);
              if (currentGalleryIndex === -1) currentGalleryIndex = 0;
            } else {
              currentGalleryImages = [clickedSrc];
              currentGalleryIndex = 0;
            }

            updateLightboxImage();
            lightbox.style.display = "flex";
          },
          true,
        );
      }
      post.setAttribute("pp-images-handled", "true");
    },

    processComments: () => {
      const comments = document.querySelectorAll(
        "shreddit-comment:not([pp-checked])",
      );
      if (!comments.length) return;

      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];
        if (
          comment.getAttribute("author") === "AutoModerator" &&
          !comment.hasAttribute("collapsed")
        ) {
          comment.setAttribute("collapsed", "");
        }

        const shadow = comment.shadowRoot;
        if (shadow && !comment.hasAttribute("pp-shadow-styled")) {
          const depth = parseInt(comment.getAttribute("depth") || "0", 10);
          const color = THREAD_COLORS[depth % THREAD_COLORS.length];
          const style = document.createElement("style");
          style.className = "pp-line-style";
          style.textContent = `
            div[data-testid="main-thread-line"] { background-color: ${color} !important; width: 2px !important; opacity: 1 !important; }
            div[data-testid="branch-line"] { border-left: 2px solid ${color} !important; border-bottom: 2px solid ${color} !important; opacity: 1 !important; }
          `;
          shadow.appendChild(style);
          comment.setAttribute("pp-shadow-styled", "true");
          comment.setAttribute("pp-checked", "true");
        }
      }
    },

    initSidebar: () => {
      const isSubredditPage = /^\/r\/[^/]/.test(window.location.pathname);
      if (!isSubredditPage) {
        document.getElementById("pp_sidebar_wrap")?.remove();
        return;
      }

      const sidebar = SIDEBAR_SELECTORS.reduce(
        (found, sel) => found || document.querySelector(sel),
        null,
      );
      if (!sidebar) return;

      const existingWrap = document.getElementById("pp_sidebar_wrap");
      if (existingWrap) {
        if (existingWrap.contains(sidebar)) return;
        existingWrap.remove();
      }

      const collapsed =
        localStorage.getItem("pp_sidebar_collapsed") !== "false";
      const wrap = document.createElement("div");
      wrap.id = "pp_sidebar_wrap";
      if (collapsed) wrap.classList.add("pp_sb_collapsed");

      const tab = document.createElement("div");
      tab.id = "pp_sidebar_tab";
      tab.textContent = collapsed ? "❮" : "❯";

      const inner = document.createElement("div");
      inner.id = "pp_sidebar_inner";

      if (
        sidebar.tagName === "FACEPLATE-PARTIAL" ||
        !sidebar.classList.contains("contents")
      ) {
        inner.appendChild(sidebar);
      } else {
        while (sidebar.firstChild) inner.appendChild(sidebar.firstChild);
      }

      wrap.append(tab, inner);
      document.body.appendChild(wrap);

      tab.addEventListener("click", () => {
        const isCollapsed = wrap.classList.toggle("pp_sb_collapsed");
        tab.textContent = isCollapsed ? "❮" : "❯";
        localStorage.setItem("pp_sidebar_collapsed", String(isCollapsed));
      });
    },

    processDecoders: () => {
      if (!isAllowedSubreddit()) return;
      COMMENT_SELECTORS.forEach((selector) => {
        document
          .querySelectorAll(`${selector}:not([pp-decoder-scanned])`)
          .forEach((container) => {
            container.setAttribute("pp-decoder-scanned", "true");
            container.querySelectorAll("p").forEach(scanParagraph);
          });
      });
    },
  };

  // =========================================================
  // OBSERVER ENGINE
  // =========================================================

  let updateScheduled = false;
  const observer = new MutationObserver(() => {
    if (updateScheduled) return;
    updateScheduled = true;
    setTimeout(() => {
      Actions.nuke();
      Actions.nukeAwardButtons();
      Actions.initSidebar();
      Actions.processComments();
      Actions.syncCollapseButton();
      Actions.processDecoders();
      const posts = document.querySelectorAll(
        "shreddit-post:not([pp-images-handled])",
      );
      for (let i = 0; i < posts.length; i++) Actions.handleImages(posts[i]);
      updateScheduled = false;
    }, 0);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Text Selection Popups
  let selectionPopup = null;
  let currentSelText = "";
  document.addEventListener("mouseup", (e) => {
    const inComment = COMMENT_SELECTORS.some((s) => e.target.closest?.(s));
    setTimeout(() => {
      const selection = window.getSelection();
      const selText = selection.toString().trim();

      if (selText.length > 0 && inComment) {
        if (!selectionPopup) {
          selectionPopup = createSelectionPopup();
          selectionPopup.btn.addEventListener("click", () => {
            if (currentSelText)
              window.open(buildSocialSearchURL(currentSelText), "_blank");
            selectionPopup.popup.style.display = "none";
          });
        }
        currentSelText = selText;
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        selectionPopup.popup.style.left = `${rect.left + window.scrollX + rect.width / 2 - 40}px`;
        selectionPopup.popup.style.top = `${rect.top + window.scrollY - 40}px`;
        selectionPopup.popup.style.display = "block";
      } else if (selectionPopup) {
        selectionPopup.popup.style.display = "none";
      }
    }, 50);
  });

  // =========================================================
  // INITIALIZATION HANDLERS
  // =========================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      attachLightbox();
      syncCollapseButtonVisibility();
      Actions.processDecoders();
    });
  } else {
    attachLightbox();
    syncCollapseButtonVisibility();
    Actions.processDecoders();
  }

  console.log("Reddit Enhancements Clean Loaded v2.0");
})();
