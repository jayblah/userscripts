// ==UserScript==
// @name            Reddit Enhancements
// @description     Nukes Reddit clutter, adds image lightbox/gallery, collapse tools, NATO/Binary decoder, and social search helpers.
// @author          JR
// @version         2.3
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
  // CONFIGURATION & CONSTANTS
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

  const FILTER_STORAGE_KEY = "pp_keyword_filters";
  const HIGHLIGHT_STORAGE_KEY = "pp_keyword_highlights";

  // =========================================================
  // CORE TRANSLATION DICTIONARIES
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
  // STATE
  // =========================================================

  let currentGalleryImages = [];
  let currentGalleryIndex = 0;
  let lastWheelTime = 0;
  let collapseState = 0; // 0 = expanded, 1 = all collapsed, 2 = first-level only
  let selectionPopup = null;
  let currentSelText = "";
  let lastScrollY = 0;
  let updateScheduled = false;
  let _showFiltered = false;

  let _dragging = false,
    _dragOffsetX = 0,
    _dragOffsetY = 0,
    _dragMoved = false;

  let _onAllowedSubreddit = ALLOWED_SUBREDDITS.some((sub) =>
    window.location.pathname.toLowerCase().startsWith(sub),
  );

  // =========================================================
  // HELPER UTILITIES
  // =========================================================

  function decodeAmpEntities(s) {
    return s.replaceAll("&amp;", "&");
  }

  function buildSocialSearchURL(q) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${q} (${SOCIAL_SITE_CLAUSE})`)}`;
  }

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
        for (const w of NATO_SORTED) {
          if (w.includes("-") && token === w) {
            res += NATO_ALPHABET[w];
            count++;
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

  function getHeaderOffset() {
    const header = document.querySelector("header.v2");
    return header ? header.offsetHeight : 56;
  }

  function getTopLevelComments() {
    return Array.from(document.querySelectorAll("shreddit-comment[depth='0']"));
  }

  function getPostTitle(post) {
    return (
      post.getAttribute("post-title") ||
      post.querySelector('[slot="title"]')?.textContent ||
      post.querySelector('a[id^="post-title"]')?.textContent ||
      ""
    );
  }

  // =========================================================
  // STORAGE HELPERS
  // =========================================================

  function lsGet(key, fallback = {}) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  }

  function lsSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getKeywordFilters() {
    return lsGet(FILTER_STORAGE_KEY, {});
  }
  function saveKeywordFilters(f) {
    lsSet(FILTER_STORAGE_KEY, f);
  }
  function getKeywordHighlights() {
    return lsGet(HIGHLIGHT_STORAGE_KEY, {});
  }
  function saveKeywordHighlights(h) {
    lsSet(HIGHLIGHT_STORAGE_KEY, h);
  }

  function getFiltersForScope(scope) {
    return getKeywordFilters()[scope] || [];
  }

  function getHighlightsForScope(scope) {
    return getKeywordHighlights()[scope] || [];
  }

  function addFilterForScope(scope, keyword) {
    const all = getKeywordFilters();
    if (!all[scope]) all[scope] = [];
    if (!all[scope].includes(keyword)) all[scope].push(keyword);
    saveKeywordFilters(all);
  }

  function removeFilterForScope(scope, index) {
    const all = getKeywordFilters();
    if (!all[scope]) return;
    all[scope].splice(index, 1);
    if (all[scope].length === 0) delete all[scope];
    saveKeywordFilters(all);
  }

  function addHighlightForScope(scope, keywords, color) {
    const all = getKeywordHighlights();
    if (!all[scope]) all[scope] = [];
    const exists = all[scope].some(
      (h) =>
        h.color === color &&
        JSON.stringify(h.keywords) === JSON.stringify(keywords),
    );
    if (!exists) all[scope].push({ keywords, color });
    saveKeywordHighlights(all);
  }

  function removeHighlightForScope(scope, index) {
    const all = getKeywordHighlights();
    if (!all[scope]) return;
    all[scope].splice(index, 1);
    if (all[scope].length === 0) delete all[scope];
    saveKeywordHighlights(all);
  }

  // =========================================================
  // GLOBAL STYLESHEET
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
      box-sizing: border-box;
      padding-top: 60px;
    }

    #pp_lightbox img#pp_lightbox_img {
      max-width: 90%;
      max-height: calc(100vh - 60px - 86px);
      flex: 1 1 0;
      min-height: 0;
      align-self: center;
      pointer-events: none;
      object-fit: contain;
    }

    #pp_filmstrip {
      flex-shrink: 0;
      display: flex;
      gap: 6px;
      padding: 10px 12px;
      overflow-x: auto;
      max-width: 90vw;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
    }
    #pp_filmstrip:empty { display: none; }

    .pp_film_thumb {
      width: 54px;
      height: 54px;
      object-fit: cover;
      border-radius: 4px;
      cursor: pointer;
      opacity: 0.45;
      border: 2px solid transparent;
      flex-shrink: 0;
      transition: opacity 0.15s, border-color 0.15s;
    }
    .pp_film_thumb:hover { opacity: 0.75; }
    .pp_film_thumb.pp_film_active {
      opacity: 1;
      border-color: #ff4500;
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

    /* ---- Keyword Panel ---- */
    .pp_panel {
      display: none;
      flex-direction: column;
      position: fixed;
      z-index: 99998;
      width: 320px;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #0d0d0e;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
    }
    .pp_panel_head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 8px;
    }
    .pp_panel_title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
    }
    .pp_panel_head_actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .pp_panel_show_btn {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.4);
      background: transparent !important;
      border: none !important;
      height: 24px;
      padding: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      box-sizing: border-box;
      transition: color 0.15s ease;
    }
    .pp_panel_show_btn:hover {
      color: #fff;
    }
    .pp_panel_close_btn {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent !important;
      border: none !important;
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      transition: color 0.15s ease;
    }
    .pp_panel_close_btn:hover {
      color: #ff4500;
    }
    .pp_tab_bar {
      display: flex;
      margin: 4px 16px 0;
      gap: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .pp_tab {
      background: transparent !important;
      border: none;
      padding: 8px 0;
      font-size: 12px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.35);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      box-sizing: border-box;
      transition: color 0.15s ease;
    }
    .pp_tab::after {
      display: none !important;
    }
    .pp_tab.pp_tab_active {
      color: #fff !important;
    }
    .pp_tab:hover:not(.pp_tab_active) {
      color: rgba(255, 255, 255, 0.75);
    }
    .pp_sub_edit {
      display: none;
      padding: 12px 16px 0;
    }
    .pp_sub_edit_row { display: flex; gap: 6px; margin-top: 6px; }
    .pp_kw_list {
      max-height: 190px;
      overflow-y: auto;
      margin: 8px 0 0;
      padding: 0 16px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .pp_kw_empty {
      padding: 24px 0;
      text-align: center;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.3);
    }
    .pp_kw_row {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      box-sizing: border-box;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    .pp_kw_row:last-child { border-bottom: none; }
    .pp_kw_swatch {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .pp_kw_label {
      flex: 1;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      font-family: ui-monospace, SFMono-Regular, monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }
    .pp_kw_label:hover { color: #fff; }
    .pp_kw_del {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent !important;
      border: none !important;
      color: rgba(255, 255, 255, 0.3);
      font-size: 10px;
      cursor: pointer;
      opacity: 0;
      line-height: 1;
      transition: color 0.15s ease;
    }
    .pp_kw_row:hover .pp_kw_del { opacity: 1; }
    .pp_kw_del:hover {
      color: #ff4500;
    }
    .pp_scope_header {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      box-sizing: border-box;
    }
    .pp_scope_chevron {
      font-size: 8px;
      color: rgba(255, 255, 255, 0.3);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .pp_scope_name {
      flex: 1;
      font-size: 12px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
    }
    .pp_scope_count {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 1px 6px;
    }
    .pp_scope_body { display: none; padding-left: 14px; }
    .pp_edit_row {
      display: flex;
      align-items: center !important;
      gap: 12px;
      height: 40px;
      padding: 4px 0 6px;
      box-sizing: border-box;
      width: 100%;
    }
    .pp_edit_save {
      flex-shrink: 0;
      padding: 0;
      height: 32px;
      background: transparent !important;
      border: none !important;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      color: #3ABAA2;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 1 !important;
      margin: 0 !important;
      box-sizing: border-box;
      transition: filter 0.15s ease;
    }
    .pp_edit_save:hover {
      filter: brightness(1.2);
    }
    .pp_edit_cancel {
      flex-shrink: 0;
      width: auto;
      height: 32px;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: transparent !important;
      border: none !important;
      color: rgba(255, 255, 255, 0.4);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      line-height: 1 !important;
      margin: 0 !important;
      box-sizing: border-box;
      transition: color 0.15s ease;
    }
    .pp_edit_cancel:hover {
      color: #fff;
    }
    .pp_add_row {
      display: flex;
      align-items: center !important;
      justify-content: center;
      gap: 10px;
      padding: 14px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      margin-top: 6px;
      box-sizing: border-box;
    }
    .pp_add_btn {
      flex-shrink: 0;
      padding: 0;
      height: 32px;
      background: transparent !important;
      border: none !important;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      color: #ff4500;
      box-sizing: border-box;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 1 !important;
      margin: 0 !important;
      vertical-align: middle;
      transition: filter 0.15s ease;
    }
    .pp_add_btn:hover {
      filter: brightness(1.2);
    }
    .pp_color_pick {
      -webkit-appearance: none !important;
      appearance: none !important;
      flex-shrink: 0;
      width: 20px !important;
      height: 20px !important;
      min-width: 20px !important;
      max-width: 20px !important;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 50% !important;
      cursor: pointer;
      padding: 0;
      background: transparent;
      box-sizing: border-box;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      margin: 0 !important;
      vertical-align: middle;
      overflow: hidden;
    }
    .pp_color_pick::-webkit-color-swatch-wrapper { padding: 0 !important; margin: 0 !important; }
    .pp_color_pick::-webkit-color-swatch { border: none !important; border-radius: 50% !important; width: 100% !important; height: 100% !important; box-sizing: border-box; }
    .pp_input {
      flex: 1;
      min-width: 0;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      padding: 0 10px;
      height: 32px;
      outline: none;
      box-sizing: border-box;
      display: inline-flex !important;
      align-items: center !important;
      margin: 0 !important;
      vertical-align: middle;
    }
    .pp_input::placeholder { color: rgba(255, 255, 255, 0.25); font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .pp_input:focus { border-color: rgba(255, 255, 255, 0.2); }

    #pp_sidebar_wrap { position: fixed; top: 0; right: 0; height: 100%; z-index: 9000; display: flex; align-items: center; pointer-events: none; transition: transform 0.25s ease; }
    #pp_sidebar_wrap.pp_sb_collapsed { transform: translateX(312px); }
    #pp_sidebar_tab { pointer-events: all; flex-shrink: 0; width: 22px; height: 56px; background: #000; border-radius: 6px 0 0 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #eeefef; font-size: 13px; user-select: none; transition: background 0.15s; box-shadow: -2px 0 6px rgba(0,0,0,0.5); }
    #pp_sidebar_tab:hover { background: #1a1a1b; }
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
  // FLOATING COLLAPSE TOOLBAR (DOM built at document-start)
  // =========================================================

  const collapseBtn = document.createElement("div");
  collapseBtn.id = "pp_float_collapse";
  collapseBtn.innerHTML = `
    <div class="pp_collapse_main_btn" id="pp_collapse_text" role="button" title="Toggle comment trees [S]">COL</div>
    <button class="pp_collapse_sub_btn" id="pp_jump_top" title="Scroll to top [W]">↑</button>
    <button class="pp_collapse_sub_btn" id="pp_jump_prev" title="Previous comment [A]">▲</button>
    <button class="pp_collapse_sub_btn" id="pp_jump_next" title="Next comment [D]">▼</button>
    <button class="pp_collapse_sub_btn" id="pp_jump_bottom" title="Scroll to bottom [X]">↓</button>
  `;

  const _savedPos = lsGet("pp_collapse_pos", null);
  collapseBtn.style.top = _savedPos ? _savedPos.top + "px" : "auto";
  collapseBtn.style.right = _savedPos ? _savedPos.right + "px" : "auto";
  collapseBtn.style.bottom = _savedPos ? "auto" : "24px";
  collapseBtn.style.left = _savedPos ? "auto" : "24px";
  document.documentElement.appendChild(collapseBtn);

  // =========================================================
  // LIGHTBOX & GALLERY
  // =========================================================

  const lightbox = document.createElement("div");
  lightbox.id = "pp_lightbox";

  function attachLightbox() {
    if (document.body?.contains(lightbox)) return;
    document.body?.appendChild(lightbox);

    lightbox.innerHTML = `
      <div id="pp_lightbox_close" style="position:absolute; top:20px; right:20px; color:white; font-size:32px; cursor:pointer; z-index:1000001; line-height:1;" title="Close Gallery [Esc]">&times;</div>
      <div id="pp_nav_prev" class="pp_nav_btn" title="Previous Image [A]">&#10094;</div>
      <img id="pp_lightbox_img" src="" alt="Enlarged View">
      <div id="pp_nav_next" class="pp_nav_btn" title="Next Image [D]">&#10095;</div>
      <div id="pp_gallery_counter">1 / 1</div>
      <div id="pp_filmstrip"></div>
    `;

    lightbox.querySelector("#pp_lightbox_close").onclick = (e) => {
      e.stopPropagation();
      closeLightbox();
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
      if (e.target === lightbox || e.target.id === "pp_lightbox_img")
        closeLightbox();
    };
  }

  function closeLightbox() {
    lightbox.style.display = "none";
  }

  function openLightbox(images, startIndex) {
    attachLightbox();
    currentGalleryImages = images;
    currentGalleryIndex = startIndex;
    updateLightboxImage();
    lightbox.style.display = "flex";
  }

  function updateLightboxImage() {
    if (!currentGalleryImages.length) return;

    const imgEl = lightbox.querySelector("#pp_lightbox_img");
    const counterEl = lightbox.querySelector("#pp_gallery_counter");
    const prevEl = lightbox.querySelector("#pp_nav_prev");
    const nextEl = lightbox.querySelector("#pp_nav_next");
    const filmstrip = lightbox.querySelector("#pp_filmstrip");

    const cleanSrc = decodeAmpEntities(
      currentGalleryImages[currentGalleryIndex],
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

    if (filmstrip) {
      if (filmstrip.children.length !== currentGalleryImages.length) {
        filmstrip.innerHTML = "";
        currentGalleryImages.forEach((src, i) => {
          const thumb = document.createElement("img");
          thumb.className = "pp_film_thumb";
          thumb.src = decodeAmpEntities(src);
          thumb.addEventListener("click", (e) => {
            e.stopPropagation();
            currentGalleryIndex = i;
            updateLightboxImage();
          });
          filmstrip.appendChild(thumb);
        });
      }

      Array.from(filmstrip.children).forEach((thumb, i) => {
        thumb.classList.toggle("pp_film_active", i === currentGalleryIndex);
      });
      const activeThumb = filmstrip.children[currentGalleryIndex];
      if (activeThumb) {
        activeThumb.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  }

  function navigateGallery(direction) {
    if (!currentGalleryImages.length) return;
    currentGalleryIndex =
      (currentGalleryIndex + direction + currentGalleryImages.length) %
      currentGalleryImages.length;
    updateLightboxImage();
  }

  async function fetchGalleryImages(permalink) {
    try {
      const res = await fetch(`https://www.reddit.com${permalink}.json`, {
        headers: { Accept: "application/json" },
      });
      const json = await res.json();
      const post = json?.[0]?.data?.children?.[0]?.data;
      if (!post) return null;

      const order = post.gallery_data?.items?.map((i) => i.media_id);
      const meta = post.media_metadata;
      if (!order || !meta) return null;

      return order
        .map((id) => {
          const entry = meta[id];
          const src = entry?.s?.u || entry?.p?.slice(-1)?.[0]?.u || null;
          return src ? decodeAmpEntities(src) : null;
        })
        .filter(Boolean);
    } catch (e) {
      console.warn("[RE] Gallery fetch failed:", e);
      return null;
    }
  }

  // =========================================================
  // ACCOUNT DISPLAY BADGE
  // =========================================================

  let _accountBadgeFetched = false;

  function injectAccountBadge() {
    if (document.getElementById("pp_account_badge")) return;
    if (_accountBadgeFetched) return;
    if (!document.getElementById("expand-user-drawer-button")) return;

    _accountBadgeFetched = true;
    fetch("/api/me.json", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const name = d?.data?.name;
        if (name && name !== "undefined") insertBadge(name);
      })
      .catch(() => {});
  }

  function insertBadge(username) {
    if (document.getElementById("pp_account_badge")) return;

    const btn = document.getElementById("expand-user-drawer-button");
    if (!btn) return;

    const avatarWrapper = btn.closest("div.flex.items-center.justify-center");
    if (avatarWrapper)
      avatarWrapper.style.cssText +=
        "width:auto !important; flex-shrink:0 !important;";

    btn.classList.remove("max-w-[40px]");
    btn.style.cssText +=
      "max-width:none !important; width:auto !important; padding:0 10px !important;";

    const avatar = btn.querySelector("div.max-h-xl");
    if (avatar) avatar.style.display = "none";

    const label = document.createElement("span");
    label.id = "pp_account_badge";
    label.textContent = username;
    label.style.cssText = `
      color: #ffffff;
      font-family: sans-serif;
      font-size: 16px;
      font-weight: 700;
      white-space: nowrap;
      letter-spacing: 0.2px;
    `;

    const inner = btn.querySelector("span.flex.items-center");
    if (inner) inner.appendChild(label);
  }

  // =========================================================
  // KEYWORD FILTER & HIGHLIGHT ENGINE
  // =========================================================

  function getCurrentSubreddit() {
    const parts = window.location.pathname.toLowerCase().split("/");
    if (parts[1] === "r" && parts[2]) return parts[2];
    return null;
  }

  function keywordMatchesTitle(keyword, title) {
    if (/^\/.*\/[gimsuy]*$/.test(keyword)) {
      try {
        const lastSlash = keyword.lastIndexOf("/");
        const pattern = keyword.slice(1, lastSlash);
        const flags = keyword.slice(lastSlash + 1) || "i";
        return new RegExp(pattern, flags).test(title);
      } catch {
        return false;
      }
    }
    const escaped = keyword
      .toLowerCase()
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(escaped).test(title.toLowerCase());
  }

  function getScopesForCurrentSub() {
    const sub = getCurrentSubreddit();
    const scopes = ["global"];
    const allScopes = new Set([
      ...Object.keys(getKeywordFilters()),
      ...Object.keys(getKeywordHighlights()),
    ]);
    allScopes.forEach((scope) => {
      if (scope === "global") return;
      if (!sub) return;
      const subs = scope.split(",").map((s) => s.trim().toLowerCase());
      if (subs.includes(sub) && !scopes.includes(scope)) scopes.push(scope);
    });
    if (sub && !scopes.includes(sub)) scopes.push(sub);
    return scopes;
  }

  function applyKeywordFilters() {
    const activeFilters = getScopesForCurrentSub().flatMap(
      (s) => getKeywordFilters()[s] || [],
    );

    document.querySelectorAll("shreddit-post").forEach((post) => {
      const title = getPostTitle(post);
      const matched =
        activeFilters.length > 0 &&
        activeFilters.some((kw) => keywordMatchesTitle(kw, title));

      if (matched) {
        post.setAttribute("pp-kw-filtered", "true");
        post.style.display = _showFiltered ? "" : "none";
        post.style.opacity = _showFiltered ? "0.35" : "";
      } else if (post.hasAttribute("pp-kw-filtered")) {
        post.removeAttribute("pp-kw-filtered");
        post.style.display = "";
        post.style.opacity = "";
      }
    });
  }

  function applyKeywordHighlights() {
    const activeHighlights = getScopesForCurrentSub().flatMap(
      (s) => getKeywordHighlights()[s] || [],
    );

    document.querySelectorAll("shreddit-post").forEach((post) => {
      const title = getPostTitle(post);
      const match = activeHighlights.find((h) =>
        h.keywords.some((kw) => keywordMatchesTitle(kw, title)),
      );

      if (match) {
        post.style.outline = `2px solid ${match.color}`;
        post.style.background = `${match.color}18`;
        post.setAttribute("pp-kw-highlighted", "true");
      } else if (post.hasAttribute("pp-kw-highlighted")) {
        post.style.outline = "";
        post.style.background = "";
        post.removeAttribute("pp-kw-highlighted");
      }
    });
  }

  function toggleShowFiltered() {
    _showFiltered = !_showFiltered;
    document
      .querySelectorAll("shreddit-post[pp-kw-filtered]")
      .forEach((post) => {
        post.style.display = _showFiltered ? "" : "none";
        post.style.opacity = _showFiltered ? "0.35" : "";
      });
    const btn = document.getElementById("pp_filter_show_toggle");
    if (btn) btn.textContent = _showFiltered ? "ON" : "OFF";
  }

  // =========================================================
  // KEYWORD PANEL UI
  // =========================================================

  function makeDeleteButton(onDelete) {
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.className = "pp_kw_del";
    btn.addEventListener("click", onDelete);
    return btn;
  }

  function splitKeywords(val) {
    return val
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  function buildKwPanel(mode) {
    const id = mode === "filter" ? "pp_filter_panel" : "pp_highlight_panel";
    if (document.getElementById(id)) return;

    const sub = getCurrentSubreddit();
    const defaultScope = sub || "global";
    const isFilter = mode === "filter";
    const accent = isFilter ? "#ff4500" : "#1E88DB";
    const title = isFilter ? "Filters" : "Highlights";

    const panel = document.createElement("div");
    panel.id = id;
    panel.className = "pp_panel";

    panel.innerHTML = `
      <div class="pp_panel_head">
        <span class="pp_panel_title">${title}</span>
        <div class="pp_panel_head_actions">
          ${isFilter ? `<button id="${id}_show_toggle" class="pp_panel_show_btn">OFF</button>` : ""}
          <button id="${id}_close" class="pp_panel_close_btn">✕</button>
        </div>
      </div>

      <div class="pp_tab_bar">
        <button id="${id}_tab_global" class="pp_tab">Global</button>
        <button id="${id}_tab_sub" class="pp_tab">${sub ? `r/${sub}` : "Subreddit"}</button>
        <button id="${id}_tab_all" class="pp_tab">All</button>
      </div>

      <div id="${id}_sub_edit" class="pp_sub_edit">
        <input id="${id}_sub_input" type="text" class="pp_input" placeholder="sub1, sub2, sub3" value="${sub || ""}" style="width:100%; height:30px;" />
        <div class="pp_sub_edit_row">
          <button id="${id}_sub_confirm" class="pp_add_btn" style="flex:1; background:${accent};">Apply</button>
          <button id="${id}_sub_cancel" class="pp_edit_cancel" style="flex:1; width:auto; border-radius:6px; font-size:11px; font-weight:600;">Cancel</button>
        </div>
      </div>

      <div id="${id}_list" class="pp_kw_list"></div>

      <div id="${id}_add_row" class="pp_add_row">
        <input id="${id}_input" type="text" class="pp_input"
          placeholder="${isFilter ? "keyword, wild*, /regex/" : "keyword1, keyword2"}" />
        ${!isFilter ? `<input id="${id}_color" type="color" value="#FFD700" class="pp_color_pick" />` : ""}
        <button id="${id}_add" class="pp_add_btn" style="background:${accent};">Add</button>
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector(`#${id}_close`).addEventListener("click", () => {
      panel.style.display = "none";
    });

    if (isFilter) {
      panel
        .querySelector(`#${id}_show_toggle`)
        .addEventListener("click", () => {
          toggleShowFiltered();
          const btn = panel.querySelector(`#${id}_show_toggle`);
          btn.textContent = _showFiltered ? "ON" : "OFF";
        });
    }

    // Tab state
    let activeScope = defaultScope;

    function setTab(tab) {
      const isAll = tab === "all";

      panel.querySelectorAll(".pp_tab").forEach((btn, i) => {
        const t = ["global", "sub", "all"][i];
        btn.classList.toggle("pp_tab_active", t === tab);
        btn.style.color = t === tab ? accent : "";
      });
      // Override active underline color via currentColor
      const activeTab = panel.querySelector(".pp_tab_active");
      if (activeTab) activeTab.style.color = accent;

      panel.querySelector(`#${id}_add_row`).style.display = isAll
        ? "none"
        : "flex";
      panel.querySelector(`#${id}_sub_edit`).style.display = "none";

      if (tab === "global") {
        activeScope = "global";
        renderKwList(mode, activeScope, id, false);
      } else if (tab === "sub") {
        activeScope =
          panel.querySelector(`#${id}_tab_sub`).dataset.scope || defaultScope;
        renderKwList(mode, activeScope, id, false);
      } else {
        renderAllScopes(mode, id);
      }
    }

    panel.querySelector(`#${id}_tab_global`).addEventListener("click", () => {
      panel.querySelector(`#${id}_sub_edit`).style.display = "none";
      setTab("global");
    });

    // Sub tab: single click = select, double click = edit scope
    const subTab = panel.querySelector(`#${id}_tab_sub`);
    let subClickTimer = null;
    subTab.addEventListener("click", () => {
      if (subClickTimer) {
        clearTimeout(subClickTimer);
        subClickTimer = null;
        panel.querySelector(`#${id}_sub_edit`).style.display = "block";
        panel.querySelector(`#${id}_sub_input`).focus();
      } else {
        subClickTimer = setTimeout(() => {
          subClickTimer = null;
          setTab("sub");
        }, 220);
      }
    });

    panel.querySelector(`#${id}_sub_confirm`).addEventListener("click", () => {
      const raw = panel.querySelector(`#${id}_sub_input`).value.trim();
      if (!raw) return;
      const normalized = raw
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/^r\//, ""))
        .filter(Boolean)
        .join(",");
      subTab.dataset.scope = normalized;
      subTab.textContent = normalized.includes(",")
        ? normalized
        : `r/${normalized}`;
      subTab.title = normalized;
      panel.querySelector(`#${id}_sub_edit`).style.display = "none";
      setTab("sub");
    });

    panel.querySelector(`#${id}_sub_cancel`).addEventListener("click", () => {
      panel.querySelector(`#${id}_sub_edit`).style.display = "none";
    });

    panel.querySelector(`#${id}_tab_all`).addEventListener("click", () => {
      panel.querySelector(`#${id}_sub_edit`).style.display = "none";
      setTab("all");
    });

    // Add entry
    const input = panel.querySelector(`#${id}_input`);
    const colorPicker = isFilter ? null : panel.querySelector(`#${id}_color`);

    const addEntry = () => {
      const val = input.value.trim();
      if (!val) return;
      if (isFilter) {
        addFilterForScope(activeScope, val);
        applyKeywordFilters();
      } else {
        addHighlightForScope(
          activeScope,
          splitKeywords(val),
          colorPicker.value,
        );
        applyKeywordHighlights();
      }
      renderKwList(mode, activeScope, id, false);
      input.value = "";
      input.focus();
    };

    panel.querySelector(`#${id}_add`).addEventListener("click", addEntry);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        addEntry();
      }
    });

    setTab(sub ? "sub" : "global");
  }

  function makeEditableRow(mode, scope, entry, index, panelId, onDone) {
    const isFilter = mode === "filter";
    const keywords = isFilter ? [entry] : entry.keywords;
    const accent = isFilter ? "#ff4500" : "#1E88DB";

    const row = document.createElement("div");
    row.className = "pp_edit_row";

    let colorPicker = null;
    if (!isFilter) {
      colorPicker = document.createElement("input");
      colorPicker.type = "color";
      colorPicker.value = entry.color;
      colorPicker.className = "pp_color_pick";
      colorPicker.style.cssText = "width:24px; height:24px; flex-shrink:0;";
      row.appendChild(colorPicker);
    }

    const input = document.createElement("input");
    input.type = "text";
    input.value = keywords.join(", ");
    input.className = "pp_input";
    input.style.height = "24px";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.className = "pp_edit_save";
    saveBtn.style.background = accent;

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "✕";
    cancelBtn.className = "pp_edit_cancel";

    row.append(input, saveBtn, cancelBtn);

    const save = () => {
      const val = input.value.trim();
      if (!val) return;
      if (isFilter) {
        const all = getKeywordFilters();
        if (!all[scope]) return;
        all[scope][index] = val;
        saveKeywordFilters(all);
        applyKeywordFilters();
      } else {
        const all = getKeywordHighlights();
        if (!all[scope]) return;
        all[scope][index] = {
          keywords: splitKeywords(val),
          color: colorPicker ? colorPicker.value : entry.color,
        };
        saveKeywordHighlights(all);
        applyKeywordHighlights();
      }
      onDone();
    };

    saveBtn.addEventListener("click", save);
    cancelBtn.addEventListener("click", onDone);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        save();
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        onDone();
      }
    });

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    return row;
  }

  function renderKwList(mode, scope, panelId, readonly) {
    const list = document.getElementById(`${panelId}_list`);
    if (!list) return;
    const isFilter = mode === "filter";
    const entries = isFilter
      ? getFiltersForScope(scope)
      : getHighlightsForScope(scope);
    list.innerHTML = "";

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pp_kw_empty";
      empty.textContent = "Nothing here yet";
      list.appendChild(empty);
      return;
    }

    entries.forEach((entry, i) => {
      const keywords = isFilter ? [entry] : entry.keywords;
      const color = isFilter ? null : entry.color;

      const row = document.createElement("div");
      row.className = "pp_kw_row";
      row.dataset.index = i;

      if (!isFilter) {
        const swatch = document.createElement("span");
        swatch.className = "pp_kw_swatch";
        swatch.style.background = color;
        row.appendChild(swatch);
      }

      const label = document.createElement("span");
      label.textContent = keywords.join(", ");
      label.title = readonly ? keywords.join(", ") : "Click to edit";
      label.className = "pp_kw_label";
      if (readonly) label.style.cursor = "default";

      if (!readonly) {
        label.addEventListener("click", () => {
          row.replaceWith(
            makeEditableRow(mode, scope, entry, i, panelId, () => {
              renderKwList(mode, scope, panelId, readonly);
            }),
          );
        });
      }

      row.appendChild(label);

      if (!readonly) {
        row.appendChild(
          makeDeleteButton(() => {
            if (isFilter) {
              removeFilterForScope(scope, i);
              applyKeywordFilters();
            } else {
              removeHighlightForScope(scope, i);
              applyKeywordHighlights();
            }
            renderKwList(mode, scope, panelId, readonly);
          }),
        );
      }

      list.appendChild(row);
    });
  }

  function renderAllScopes(mode, panelId) {
    const list = document.getElementById(`${panelId}_list`);
    if (!list) return;
    const isFilter = mode === "filter";
    const all = isFilter ? getKeywordFilters() : getKeywordHighlights();
    const scopes = Object.keys(all);
    list.innerHTML = "";

    if (scopes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pp_kw_empty";
      empty.textContent = "Nothing saved anywhere";
      list.appendChild(empty);
      return;
    }

    scopes.forEach((scope) => {
      const entries = all[scope];
      if (!entries?.length) return;

      const header = document.createElement("div");
      header.className = "pp_scope_header";

      const chevron = document.createElement("span");
      chevron.className = "pp_scope_chevron";
      chevron.textContent = "▶";

      const scopeLabel = document.createElement("span");
      scopeLabel.className = "pp_scope_name";
      scopeLabel.textContent =
        scope === "global" ? "🌐 Global" : `r/${scope.replace(/,/g, ", r/")}`;

      const countBadge = document.createElement("span");
      countBadge.className = "pp_scope_count";
      countBadge.textContent = entries.length;

      header.append(chevron, scopeLabel, countBadge);

      const body = document.createElement("div");
      body.className = "pp_scope_body";

      const renderBodyEntries = () => {
        body.innerHTML = "";
        const currentAll = isFilter
          ? getKeywordFilters()
          : getKeywordHighlights();
        const currentEntries = currentAll[scope] || [];

        currentEntries.forEach((entry, i) => {
          const keywords = isFilter ? [entry] : entry.keywords;
          const color = isFilter ? null : entry.color;

          const row = document.createElement("div");
          row.className = "pp_kw_row";

          if (!isFilter) {
            const swatch = document.createElement("span");
            swatch.className = "pp_kw_swatch";
            swatch.style.background = color;
            row.appendChild(swatch);
          }

          const label = document.createElement("span");
          label.textContent = keywords.join(", ");
          label.title = "Click to edit";
          label.className = "pp_kw_label";
          label.addEventListener("click", () => {
            row.replaceWith(
              makeEditableRow(
                mode,
                scope,
                entry,
                i,
                panelId,
                renderBodyEntries,
              ),
            );
          });

          const delBtn = makeDeleteButton(() => {
            if (isFilter) {
              removeFilterForScope(scope, i);
              applyKeywordFilters();
            } else {
              removeHighlightForScope(scope, i);
              applyKeywordHighlights();
            }
            renderBodyEntries();
          });

          row.append(label, delBtn);
          body.appendChild(row);
        });

        const currentAll2 = isFilter
          ? getKeywordFilters()
          : getKeywordHighlights();
        countBadge.textContent = (currentAll2[scope] || []).length;
      };

      let open = false;
      header.addEventListener("click", () => {
        open = !open;
        body.style.display = open ? "block" : "none";
        chevron.style.transform = open ? "rotate(90deg)" : "";
        if (open) renderBodyEntries();
      });

      list.appendChild(header);
      list.appendChild(body);
    });
  }

  function openKwPanel(mode) {
    const id = mode === "filter" ? "pp_filter_panel" : "pp_highlight_panel";
    buildKwPanel(mode);
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.style.display = panel.style.display === "flex" ? "none" : "flex";
  }

  function injectFilterMenuEntry() {
    if (document.getElementById("pp_filter_menu_entry")) return;
    const drawerContent = document.getElementById("user-drawer-content");
    if (!drawerContent) return;
    const menuList = drawerContent.querySelector('ul, nav, [role="menu"]');
    if (!menuList) return;

    const makeMenuEntry = (id, label, mode) => {
      const entry = document.createElement("li");
      entry.id = id;
      entry.style.cssText = "list-style:none;";
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = `
        display: flex; align-items: center; width: 100%;
        padding: 8px 16px; background: transparent; border: none;
        border-top: 1px solid rgba(255,255,255,0.06);
        color: #d7dadc; font-family: sans-serif; font-size: 14px;
        font-weight: 500; cursor: pointer; text-align: left;
        gap: 8px; box-sizing: border-box;
      `;
      btn.addEventListener(
        "mouseenter",
        () => (btn.style.background = "rgba(255,255,255,0.06)"),
      );
      btn.addEventListener(
        "mouseleave",
        () => (btn.style.background = "transparent"),
      );
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("expand-user-drawer-button")?.click();
        openKwPanel(mode);
      });
      entry.appendChild(btn);
      return entry;
    };

    menuList.appendChild(
      makeMenuEntry("pp_filter_menu_entry", "⊘ Keyword Filters", "filter"),
    );
    menuList.appendChild(
      makeMenuEntry(
        "pp_highlight_menu_entry",
        "◈ Keyword Highlights",
        "highlight",
      ),
    );
  }

  // =========================================================
  // COMMENT NAVIGATION
  // =========================================================

  function toggleCollapseAll() {
    const allComments = Array.from(
      document.querySelectorAll("shreddit-comment[depth]"),
    );
    if (!allComments.length) return;

    collapseState = (collapseState + 1) % 3;
    const topThreads = getTopLevelComments();
    const offset = getHeaderOffset();
    let anchor = topThreads.find(
      (el) => el.getBoundingClientRect().top > offset - 10,
    );
    if (!anchor && topThreads.length > 0)
      anchor = topThreads[topThreads.length - 1];

    allComments.forEach((c) => {
      const depth = parseInt(c.getAttribute("depth") || "0", 10);
      if (
        (collapseState === 1 && depth > 0) ||
        (collapseState === 2 && depth > 1)
      ) {
        c.setAttribute("collapsed", "");
      } else {
        c.removeAttribute("collapsed");
      }
    });

    const labels = ["COL", "1LV", "EXP"];
    const mainBtnLabel = collapseBtn.querySelector("#pp_collapse_text");
    if (mainBtnLabel) mainBtnLabel.textContent = labels[collapseState];
    collapseBtn.classList.toggle("pp_collapsed", collapseState !== 0);

    if (anchor) {
      setTimeout(() => {
        const targetY =
          window.scrollY + anchor.getBoundingClientRect().top - offset;
        window.scrollTo({ top: targetY, behavior: "smooth" });
      }, 30);
    }
  }

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

  function jumpToNextParent() {
    const targets = getTopLevelComments();
    if (!targets.length) return;
    const offset = getHeaderOffset();
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

    const targetY = window.scrollY + next.getBoundingClientRect().top - offset;
    if (
      Math.abs(targetY - window.scrollY) < 3 ||
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

  function syncCollapseButtonVisibility() {
    _onAllowedSubreddit = ALLOWED_SUBREDDITS.some((sub) =>
      window.location.pathname.toLowerCase().startsWith(sub),
    );
    collapseBtn.style.display = window.location.href.includes("/comments/")
      ? "flex"
      : "none";
  }

  // =========================================================
  // NATO / BINARY DECODER
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
      binMatches.forEach((match) => {
        const decoded = binaryToText(match);
        if (decoded?.trim().length > 0) {
          const target =
            node.parentNode.tagName === "P" ? node.parentNode : node;
          target.parentNode.insertBefore(
            createTranslationComponent("binary", decoded),
            target.nextSibling,
          );
        }
      });
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
    nodes.forEach(processTextNode);
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
  // ACTIONS PIPELINE
  // =========================================================

  const Actions = {
    nuke() {
      deepQueryAll(document, NUKE_SELECTOR_STRING).forEach((item) => {
        if (item.isConnected) item.remove();
      });
    },

    nukeAwardButtons() {
      deepQueryAll(
        document,
        "award-button:not([pp-award-hidden]), shreddit-slot[slot='award-button']:not([pp-award-hidden])",
      ).forEach((award) => {
        award.style.display = "none";
        award.setAttribute("pp-award-hidden", "true");
      });
    },

    injectAccountBadge,
    injectFilterMenuEntry,
    syncCollapseButton: syncCollapseButtonVisibility,
    applyKeywordFilters,
    applyKeywordHighlights,

    handleImages(post) {
      if (post.hasAttribute("pp-images-handled")) return;

      const isGallery = post.hasAttribute("gallery");
      const permalink = post.getAttribute("permalink");

      if (isGallery && permalink) {
        post.setAttribute("pp-images-handled", "true");
        fetchGalleryImages(permalink).then((urls) => {
          if (!urls?.length) return;
          post.querySelectorAll("faceplate-img, img").forEach((imgEl) => {
            imgEl.classList.add("pp_imageViewable");
            imgEl.addEventListener(
              "click",
              (e) => {
                const clickedSrc = decodeAmpEntities(
                  imgEl.getAttribute("src") ||
                    imgEl.querySelector("img")?.getAttribute("src") ||
                    "",
                );
                e.preventDefault();
                e.stopPropagation();
                const idx = urls.findIndex((u) => {
                  const id = u.match(
                    /\/([A-Za-z0-9]+)\.(jpg|png|gif|webp)/,
                  )?.[1];
                  return id && clickedSrc.includes(id);
                });
                openLightbox(urls, idx !== -1 ? idx : 0);
              },
              true,
            );
          });
        });
        return;
      }

      const images = post.querySelectorAll(
        "faceplate-img:not([pp-img-handled]), img:not(.pp_imageViewable)",
      );
      if (!images.length) return;

      images.forEach((imgEl) => {
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

            const galleryContainer =
              imgEl.closest("gallery-carousel") || imgEl.closest("ul");
            let images, startIndex;
            if (galleryContainer) {
              const allImgs = Array.from(
                galleryContainer.querySelectorAll("faceplate-img, img"),
              );
              images = [
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
              startIndex = images.indexOf(clickedSrc);
              if (startIndex === -1) startIndex = 0;
            } else {
              images = [clickedSrc];
              startIndex = 0;
            }
            openLightbox(images, startIndex);
          },
          true,
        );
      });
      post.setAttribute("pp-images-handled", "true");
    },

    processComments() {
      document
        .querySelectorAll("shreddit-comment:not([pp-checked])")
        .forEach((comment) => {
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
        });
    },

    initSidebar() {
      if (!/^\/r\/[^/]/.test(window.location.pathname)) {
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

      const collapsed = lsGet("pp_sidebar_collapsed", true) !== false;
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
        lsSet("pp_sidebar_collapsed", isCollapsed);
      });
    },

    processDecoders() {
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
  // EVENT LISTENERS
  // =========================================================

  // Floating toolbar drag
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
      lsSet("pp_collapse_pos", {
        top: parseInt(collapseBtn.style.top),
        right: parseInt(collapseBtn.style.right),
      });
    }
    _dragMoved = false;
  });

  // Floating toolbar buttons
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

  // SPA navigation
  const _patchHistory =
    (original) =>
    (...args) => {
      original(...args);
      syncCollapseButtonVisibility();
    };
  history.pushState = _patchHistory(history.pushState.bind(history));
  history.replaceState = _patchHistory(history.replaceState.bind(history));
  window.addEventListener("popstate", syncCollapseButtonVisibility);

  // Keyboard navigation
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      )
        return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();

      if (lightbox?.style.display === "flex") {
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
          else if (key === "escape" || key === "w") closeLightbox();
        }
        return;
      }

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

  // Gallery mouse wheel
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

  // Search scope override
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
      window.location.assign(
        `/search/?q=${encodeURIComponent(subredditName ? `${query} subreddit:${subredditName}` : query)}`,
      );
    },
    { capture: true },
  );

  // Text selection social search popup
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
  // MUTATION OBSERVER ENGINE
  // =========================================================

  const observer = new MutationObserver(() => {
    if (updateScheduled) return;
    updateScheduled = true;
    setTimeout(() => {
      Actions.nuke();
      Actions.nukeAwardButtons();
      Actions.injectAccountBadge();
      Actions.initSidebar();
      Actions.processComments();
      Actions.syncCollapseButton();
      Actions.processDecoders();
      Actions.applyKeywordFilters();
      Actions.applyKeywordHighlights();
      Actions.injectFilterMenuEntry();
      document
        .querySelectorAll("shreddit-post:not([pp-images-handled])")
        .forEach((post) => Actions.handleImages(post));
      updateScheduled = false;
    }, 0);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // =========================================================
  // BOOTSTRAP
  // =========================================================

  function bootstrap() {
    attachLightbox();
    syncCollapseButtonVisibility();
    Actions.processDecoders();
    Actions.injectAccountBadge();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

  console.log("Reddit Enhancements v2.3 loaded");
})();
