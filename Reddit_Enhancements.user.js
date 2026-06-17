// ==UserScript==
// @name            Reddit Enhancements
// @description     Nukes Reddit clutter, adds image lightbox/gallery, collapse tools, NATO/Binary decoder, and social search helpers.
// @author          JR
// @version         2.5.10
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

  const DC = {
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

  // The /g flag is safe here because this regex is only ever used with
  // String.prototype.match(), which always resets lastIndex and returns all
  // matches. It is never used with exec() or test(), so there is no shared-
  // state lastIndex footgun.
  const BINARY_RE = /\b(?:[01]{8} ?){2,}\b/g;
  const SOCIAL_SITE_CLAUSE = SOCIAL_SITES.map((s) => `site:${s}`).join(" OR ");

  // =========================================================
  // STATE
  // =========================================================

  let gallery = { images: [], index: 0 };
  let lastWheelTime = 0;
  let collapseState = 0; // 0=EXP, 1=COL, 2=1LV
  let selectionPopup = null;
  let currentSelText = "";
  let lastScrollY = 0;
  let _showFiltered = false;
  let _cachedUsername = null;
  let _badgeFetchPromise = null;
  let drag = { active: false, offsetX: 0, offsetY: 0, moved: false };

  let _onAllowedSubreddit = false;

  // =========================================================
  // HELPER UTILITIES
  // =========================================================

  const decodeAmp = (s) => s.replaceAll("&amp;", "&");
  const buildSocialURL = (q) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${q} (${SOCIAL_SITE_CLAUSE})`)}`;

  /** Build a Reddit search URL with a properly encoded query, optionally scoped to a subreddit. */
  const buildRedditSearchUrl = (q, sub) =>
    sub
      ? `/r/${sub}/search/?q=${encodeURIComponent(q)}&restrict_sr=1`
      : `/search/?q=${encodeURIComponent(q)}`;

  /** Extract the subreddit name from a URL pathname ("/r/sub/…" → "sub", else null). */
  const extractSubFromPathname = (pathname) => {
    const parts = pathname.split("/").filter(Boolean);
    return parts[0] === "r" && parts[1] ? parts[1] : null;
  };

  /** Prevent default and stop propagation on an event. */
  const stopEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  /** Wrap a handler so it always calls stopEvent first. */
  const withStop = (fn) => (e) => {
    stopEvent(e);
    fn(e);
  };

  const createElement = (tag, props = {}, ...children) => {
    const el = Object.assign(document.createElement(tag), props);
    if (props.style && typeof props.style === "string")
      el.style.cssText = props.style;
    children.forEach((c) => c && el.appendChild(c));
    return el;
  };

  const makeBtn = (className, text, onClick, style = "") =>
    createElement("button", {
      className,
      textContent: text,
      onclick: onClick,
      style,
    });

  function deepQueryAll(root, selector, results = []) {
    root.querySelectorAll(selector).forEach((el) => results.push(el));
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) deepQueryAll(el.shadowRoot, selector, results);
    });
    return results;
  }

  const getHeaderOffset = () =>
    document.querySelector("header.v2")?.offsetHeight || 56;
  const getTopLevelComments = () =>
    Array.from(document.querySelectorAll("shreddit-comment[depth='0']"));
  const getPostTitle = (post) =>
    post.getAttribute("post-title") ||
    post.querySelector('[slot="title"]')?.textContent ||
    post.querySelector('a[id^="post-title"]')?.textContent ||
    "";
  const getPostSubreddit = (post) =>
    post.getAttribute("subreddit-name") ||
    post.getAttribute("subreddit") ||
    null;

  /** Get the src from an img-like element (faceplate-img or img). */
  const getImgSrc = (imgEl) =>
    imgEl.getAttribute("src") ||
    imgEl.querySelector("img")?.getAttribute("src") ||
    null;

  // =========================================================
  // PAGE CONTEXT DETECTION
  // =========================================================

  function getPageContext() {
    const parts = window.location.pathname
      .toLowerCase()
      .split("/")
      .filter(Boolean);
    if (parts[0] === "user" && parts[2] === "m") return { type: "multireddit" };
    if (parts[0] === "r" && parts[1])
      return { type: "subreddit", sub: parts[1] };
    return { type: "aggregate" };
  }

  const getCurrentSubreddit = () => {
    const ctx = getPageContext();
    return ctx.type === "subreddit" ? ctx.sub : null;
  };

  // =========================================================
  // STORAGE HELPERS
  // =========================================================

  const lsGet = (key, fallback = {}) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  };
  const lsSet = (key, value) =>
    localStorage.setItem(key, JSON.stringify(value));

  const getStorage = (key) => lsGet(key, {});
  const mutateStorage = (key, cb) => {
    const all = getStorage(key);
    cb(all);
    lsSet(key, all);
  };

  function renameScopeInStorage(oldScope, newScope) {
    if (!oldScope || !newScope || oldScope === newScope) return;
    const renameLogic = (all) => {
      if (all[oldScope] !== undefined) {
        all[newScope] = [...(all[newScope] || []), ...all[oldScope]];
        delete all[oldScope];
      }
    };
    mutateStorage(FILTER_STORAGE_KEY, renameLogic);
    mutateStorage(HIGHLIGHT_STORAGE_KEY, renameLogic);
  }

  // =========================================================
  // KEYWORD MODE HELPERS
  // =========================================================

  /** Return the storage key for a given mode string or isFilter bool. */
  const storageKeyFor = (mode) =>
    mode === "filter" || mode === true
      ? FILTER_STORAGE_KEY
      : HIGHLIGHT_STORAGE_KEY;

  /** Return the entries array for a scope (never mutate the result). */
  const getScopeEntries = (mode, scope) =>
    getStorage(storageKeyFor(mode))[scope] || [];

  /** Apply keyword rules after a storage mutation. */
  const applyRulesForMode = (mode) =>
    mode === "filter" || mode === true
      ? applyKeywordFilters()
      : applyKeywordHighlights();

  // =========================================================
  // GLOBAL STYLESHEET
  // =========================================================

  document.documentElement.appendChild(
    createElement("style", {
      textContent: `
    ${NUKE_SELECTORS.join(", ")} { display: none !important; }
    award-button, shreddit-slot[slot="award-button"] { display: none !important; }
    #user-drawer-content hr.bg-neutral-border-weak, #left-sidebar-container hr.border-neutral-border-weak, flex-left-nav-container hr.border-neutral-border-weak { display: none !important; }
    a[href*="reddit.com/news"], a[href*="/news/"] { display: none !important; }
    a[href*="reddit.com/explore"], a[href*="/explore/"] { display: none !important; }

    .pp_imageViewable { cursor: zoom-in !important; }

    #pp_lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 999999; display: none; flex-direction: column; align-items: center; cursor: zoom-out; user-select: none; box-sizing: border-box; padding-top: 60px; }
    #pp_lightbox img#pp_lightbox_img { max-width: 90%; max-height: calc(100vh - 60px - 86px); flex: 1 1 0; min-height: 0; align-self: center; pointer-events: none; object-fit: contain; }
    #pp_filmstrip { flex-shrink: 0; display: flex; gap: 6px; padding: 10px 12px; overflow-x: auto; max-width: 90vw; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
    #pp_filmstrip:empty { display: none; }
    .pp_film_thumb { width: 54px; height: 54px; object-fit: cover; border-radius: 4px; cursor: pointer; opacity: 0.45; border: 2px solid transparent; flex-shrink: 0; transition: opacity 0.15s, border-color 0.15s; }
    .pp_film_thumb:hover { opacity: 0.75; }
    .pp_film_thumb.pp_film_active { opacity: 1; border-color: #ff4500; }

    .pp_nav_btn { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(255,255,255,0.1); color: white; border: none; font-size: 28px; cursor: pointer; border-radius: 4px; transition: background 0.2s; z-index: 1000000; box-sizing: border-box; height: 60px; width: 60px; display: flex; justify-content: center; align-items: center; padding: 0; line-height: 1; }
    .pp_nav_btn:hover { background: rgba(255,255,255,0.25); }
    #pp_nav_prev { left: 20px; } #pp_nav_next { right: 20px; }
    #pp_gallery_counter { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.8); font-family: sans-serif; font-size: 14px; background: rgba(0,0,0,0.6); padding: 6px 16px; border-radius: 20px; display: none; z-index: 1000001; }

    .pp_decoder_box { margin: 8px 0; padding: 6px; background: ${DC.bg}; border: 1px solid ${DC.border}; border-radius: 6px; font-family: sans-serif; display: flex; align-items: center; gap: 10px; color: ${DC.text}; }
    .pp_decoder_label { font-size: 10px; font-weight: 900; color: ${DC.accent}; text-transform: uppercase; letter-spacing: 1px; }
    .pp_decoder_result { background: ${DC.darkInput}; padding: 5px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; flex-grow: 1; border: 1px solid #222; color: #eee; overflow-x: auto; white-space: nowrap; }
    .pp_decoder_btn { display: inline-flex; align-items: center; justify-content: center; border: none; padding: 0 12px; height: 26px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 700; transition: filter 0.1s; line-height: 1; }

    .pp_selection_popup { position: absolute; background: ${DC.bg}; border: 1px solid ${DC.border}; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 10000; display: none; overflow: hidden; }
    .pp_selection_popup button { background: transparent; color: ${DC.text}; border: none; padding: 6px 14px; cursor: pointer; font-size: 11px; font-weight: 600; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 32px; }
    .pp_selection_popup button:hover { background: ${DC.border}; }

    .pp_panel { display: none; flex-direction: column; position: fixed; z-index: 99998; width: 320px; top: 80px; left: 50%; transform: translateX(-50%); background: #0d0d0e; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
    .pp_panel_head { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px; }
    .pp_panel_title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
    .pp_panel_head_actions { display: flex; gap: 12px; align-items: center; }
    .pp_panel_show_btn { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.35); background: transparent !important; border: none !important; height: 24px; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; line-height: 1; box-sizing: border-box; transition: color 0.15s ease; letter-spacing: 0.04em; }
    .pp_panel_show_btn.pp_show_active { color: #ff4500; }
    .pp_panel_show_btn:hover:not(.pp_show_active) { color: rgba(255,255,255,0.6); }
    .pp_panel_close_btn { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; background: transparent !important; border: none !important; color: rgba(255,255,255,0.4); cursor: pointer; font-size: 14px; line-height: 1; padding: 0; transition: color 0.15s ease; }
    .pp_panel_close_btn:hover { color: #ff4500; }
    .pp_tab_bar { display: flex; margin: 4px 16px 0; gap: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .pp_tab { background: transparent !important; border: none; padding: 8px 0; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.35); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; line-height: 1; box-sizing: border-box; transition: color 0.15s ease; }
    .pp_tab::after { display: none !important; } .pp_tab.pp_tab_active { color: #fff !important; } .pp_tab:hover:not(.pp_tab_active) { color: rgba(255,255,255,0.75); }
    .pp_sub_edit { display: none; padding: 12px 16px 0; }
    .pp_sub_edit_row { display: flex; gap: 6px; margin-top: 6px; }
    .pp_kw_list { max-height: 190px; overflow-y: auto; margin: 8px 0 0; padding: 0 16px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
    .pp_kw_empty { padding: 24px 0; text-align: center; font-size: 12px; color: rgba(255,255,255,0.3); }
    .pp_kw_row { display: flex; align-items: center; gap: 8px; height: 32px; box-sizing: border-box; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .pp_kw_row:last-child { border-bottom: none; }
    .pp_kw_swatch { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .pp_kw_label { flex: 1; font-size: 12px; color: rgba(255,255,255,0.7); font-family: ui-monospace, SFMono-Regular, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
    .pp_kw_label:hover { color: #fff; }
    .pp_kw_del { flex-shrink: 0; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; background: transparent !important; border: none !important; color: rgba(255,255,255,0.3); font-size: 10px; cursor: pointer; opacity: 0; line-height: 1; transition: color 0.15s ease; }
    .pp_kw_row:hover .pp_kw_del { opacity: 1; } .pp_kw_del:hover { color: #ff4500; }
    .pp_scope_header { display: flex; align-items: center; gap: 6px; height: 32px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.04); box-sizing: border-box; }
    .pp_scope_chevron { font-size: 8px; color: rgba(255,255,255,0.3); transition: transform 0.15s ease; flex-shrink: 0; }
    .pp_scope_name { flex: 1; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5); cursor: text; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pp_scope_name:hover { color: rgba(255,255,255,0.85); }
    .pp_scope_count { font-size: 10px; color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.06); border-radius: 10px; padding: 1px 6px; }
    .pp_scope_body { display: none; padding-left: 14px; }
    .pp_edit_row { display: flex; align-items: center !important; gap: 12px; height: 40px; padding: 4px 0 6px; box-sizing: border-box; width: 100%; }
    .pp_edit_save { flex-shrink: 0; padding: 0; height: 32px; background: transparent !important; border: none !important; font-size: 12px; font-weight: 700; cursor: pointer; color: #3ABAA2; display: inline-flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; margin: 0 !important; box-sizing: border-box; transition: filter 0.15s ease; }
    .pp_edit_save:hover { filter: brightness(1.2); }
    .pp_edit_cancel { flex-shrink: 0; width: auto; height: 32px; display: inline-flex !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; color: rgba(255,255,255,0.4); font-size: 12px; font-weight: 500; cursor: pointer; line-height: 1 !important; margin: 0 !important; box-sizing: border-box; transition: color 0.15s ease; }
    .pp_edit_cancel:hover { color: #fff; }
    .pp_add_row { display: flex; align-items: center !important; justify-content: center; gap: 10px; padding: 14px 16px; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 6px; box-sizing: border-box; }
    .pp_add_btn { flex-shrink: 0; padding: 0; height: 32px; background: transparent !important; border: none !important; font-size: 12px; font-weight: 700; cursor: pointer; color: #ff4500; box-sizing: border-box; display: inline-flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; margin: 0 !important; vertical-align: middle; transition: filter 0.15s ease; }
    .pp_add_btn:hover { filter: brightness(1.2); }
    .pp_color_pick { -webkit-appearance: none !important; appearance: none !important; flex-shrink: 0; width: 20px !important; height: 20px !important; min-width: 20px !important; max-width: 20px !important; border: 1px solid rgba(255,255,255,0.15); border-radius: 50% !important; cursor: pointer; padding: 0; background: transparent; box-sizing: border-box; display: inline-flex !important; align-items: center !important; justify-content: center !important; margin: 0 !important; vertical-align: middle; overflow: hidden; }
    .pp_color_pick::-webkit-color-swatch-wrapper { padding: 0 !important; margin: 0 !important; }
    .pp_color_pick::-webkit-color-swatch { border: none !important; border-radius: 50% !important; width: 100% !important; height: 100% !important; box-sizing: border-box; }
    .pp_input { flex: 1; min-width: 0; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #fff; font-size: 12px; font-family: ui-monospace, SFMono-Regular, monospace; padding: 0 10px; height: 32px; outline: none; box-sizing: border-box; display: inline-flex !important; align-items: center !important; margin: 0 !important; vertical-align: middle; }
    .pp_input::placeholder { color: rgba(255,255,255,0.25); font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .pp_input:focus { border-color: rgba(255,255,255,0.2); }
    .pp_scope_name_input { flex: 1; min-width: 0; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff; font-size: 12px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, monospace; padding: 0 8px; height: 32px; outline: none; box-sizing: border-box; }

    #pp_sidebar_wrap { position: fixed; top: 0; right: 0; height: 100%; z-index: 9000; display: flex; align-items: center; pointer-events: none; transition: transform 0.25s ease; }
    #pp_sidebar_wrap.pp_sb_collapsed { transform: translateX(312px); }
    #pp_sidebar_tab { pointer-events: all; flex-shrink: 0; width: 22px; height: 56px; background: #000; border-radius: 6px 0 0 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #eeefef; font-size: 13px; user-select: none; transition: background 0.15s; box-shadow: -2px 0 6px rgba(0,0,0,0.5); }
    #pp_sidebar_tab:hover { background: #1a1a1b; }
    #pp_sidebar_inner { pointer-events: all; width: 312px; height: 100%; overflow-y: auto; background: var(--color-neutral-background, #1a1a1b); box-shadow: -4px 0 16px rgba(0,0,0,0.4); }
    [grid-area="right-sidebar"], #right-sidebar-container, aside:has(shreddit-sidebar), .right-sidebar { display: none !important; }

    div#pp_float_collapse { position: fixed; z-index: 99999; display: none; cursor: grab; flex-direction: column; align-items: center; justify-content: center; background: rgba(21,24,26,0.9) !important; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 8px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.5); width: 34px; padding: 4px 0; box-sizing: border-box; }
    div#pp_float_collapse:active { cursor: grabbing; }
    div#pp_float_collapse .pp_collapse_main_btn, div#pp_float_collapse .pp_collapse_sub_btn { display: inline-flex !important; align-items: center !important; justify-content: center !important; width: 26px !important; background: transparent !important; color: #b3b3b3 !important; border: none !important; font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important; border-radius: 4px !important; transition: background 0.2s, color 0.2s !important; user-select: none !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important; }
    div#pp_float_collapse .pp_collapse_main_btn { height: 28px !important; color: #ffffff !important; font-size: 9px !important; font-weight: 700 !important; }
    div#pp_float_collapse .pp_collapse_sub_btn { height: 26px !important; }
    div#pp_float_collapse .pp_collapse_main_btn:hover, div#pp_float_collapse .pp_collapse_sub_btn:hover { background: rgba(255,255,255,0.08) !important; color: #3db7c7 !important; }
    div#pp_float_collapse.pp_collapsed .pp_collapse_main_btn { color: #3db7c7 !important; }
    #user-drawer-content ul li button { border-radius: 0 !important; border: none !important; }
  `,
    }),
  );

  // =========================================================
  // FLOATING COLLAPSE TOOLBAR
  // =========================================================

  const collapseBtn = createElement("div", { id: "pp_float_collapse" });
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

  const lightbox = createElement("div", { id: "pp_lightbox" });
  const closeLightbox = () => {
    lightbox.style.display = "none";
  };

  function attachLightbox() {
    if (document.body?.contains(lightbox)) return;
    document.body?.appendChild(lightbox);

    lightbox.innerHTML = `
      <div id="pp_lightbox_close" style="position:absolute;top:20px;right:20px;color:white;font-size:32px;cursor:pointer;z-index:1000001;line-height:1;" title="Close [Esc]">&times;</div>
      <div id="pp_nav_prev" class="pp_nav_btn" title="Previous [A]">&#10094;</div>
      <img id="pp_lightbox_img" src="" alt="Enlarged View">
      <div id="pp_nav_next" class="pp_nav_btn" title="Next [D]">&#10095;</div>
      <div id="pp_gallery_counter">1 / 1</div>
      <div id="pp_filmstrip"></div>
    `;

    lightbox.querySelector("#pp_lightbox_close").onclick =
      withStop(closeLightbox);
    lightbox.querySelector("#pp_nav_prev").onclick = withStop(() =>
      navigateGallery(-1),
    );
    lightbox.querySelector("#pp_nav_next").onclick = withStop(() =>
      navigateGallery(1),
    );
    lightbox.onclick = (e) => {
      if (e.target === lightbox || e.target.id === "pp_lightbox_img")
        closeLightbox();
    };
  }

  function openLightbox(images, startIndex) {
    attachLightbox();
    gallery = { images, index: startIndex };
    updateLightboxImage();
    lightbox.style.display = "flex";
  }

  function updateLightboxImage() {
    if (!gallery.images.length) return;
    const imgEl = lightbox.querySelector("#pp_lightbox_img");
    const counterEl = lightbox.querySelector("#pp_gallery_counter");
    const prevEl = lightbox.querySelector("#pp_nav_prev");
    const nextEl = lightbox.querySelector("#pp_nav_next");
    const filmstrip = lightbox.querySelector("#pp_filmstrip");

    imgEl.src = decodeAmp(gallery.images[gallery.index]);
    const multi = gallery.images.length > 1;

    if (prevEl) prevEl.style.display = multi ? "flex" : "none";
    if (nextEl) nextEl.style.display = multi ? "flex" : "none";
    if (counterEl) {
      counterEl.style.display = multi ? "block" : "none";
      if (multi)
        counterEl.textContent = `${gallery.index + 1} / ${gallery.images.length}`;
    }

    if (filmstrip) {
      if (filmstrip.children.length !== gallery.images.length) {
        filmstrip.innerHTML = "";
        gallery.images.forEach((src, i) => {
          const thumb = createElement("img", {
            className: "pp_film_thumb",
            src: decodeAmp(src),
          });
          thumb.addEventListener("click", (e) => {
            e.stopPropagation();
            gallery.index = i;
            updateLightboxImage();
          });
          filmstrip.appendChild(thumb);
        });
      }
      Array.from(filmstrip.children).forEach((t, i) =>
        t.classList.toggle("pp_film_active", i === gallery.index),
      );
      filmstrip.children[gallery.index]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }

  function navigateGallery(dir) {
    if (!gallery.images.length) return;
    gallery.index =
      (gallery.index + dir + gallery.images.length) % gallery.images.length;
    updateLightboxImage();
  }

  async function fetchGalleryImages(permalink) {
    try {
      const res = await fetch(`https://www.reddit.com${permalink}.json`, {
        headers: { Accept: "application/json" },
      });
      const json = await res.json();
      const post = json?.[0]?.data?.children?.[0]?.data;
      if (!post || !post.gallery_data?.items || !post.media_metadata)
        return null;
      return post.gallery_data.items
        .map((i) => {
          const entry = post.media_metadata[i.media_id];
          const src = entry?.s?.u || entry?.p?.slice(-1)?.[0]?.u || null;
          return src ? decodeAmp(src) : null;
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

  function injectAccountBadge() {
    if (document.getElementById("pp_account_badge")) return; // already injected
    const btn = document.getElementById("expand-user-drawer-button");
    if (!btn) return; // drawer not in DOM yet
    // If we already know the username, go straight to DOM injection.
    // insertBadge() has its own duplicate-check guard at the top.
    if (_cachedUsername) return insertBadge(_cachedUsername);
    // A fetch is already in flight from a previous call; don't stack requests.
    if (_badgeFetchPromise) return;

    _badgeFetchPromise = fetch("/api/me.json", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data?.name && d.data.name !== "undefined") {
          _cachedUsername = d.data.name;
          insertBadge(d.data.name);
        }
      })
      .catch(() => {})
      .finally(() => {
        _badgeFetchPromise = null;
      });
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
    const avatarEl = btn.querySelector("div.max-h-xl");
    if (avatarEl) avatarEl.style.display = "none";

    const inner = btn.querySelector("span.flex.items-center") || btn;
    inner.appendChild(
      createElement("span", {
        id: "pp_account_badge",
        textContent: username,
        style:
          "color:#fff;font-family:sans-serif;font-size:16px;font-weight:700;white-space:nowrap;letter-spacing:0.2px;",
      }),
    );
  }

  // =========================================================
  // KEYWORD FILTER & HIGHLIGHT ENGINE
  // =========================================================

  function keywordMatchesTitle(keyword, title) {
    if (/^\/.*\/[gimsuy]*$/.test(keyword)) {
      try {
        const lastSlash = keyword.lastIndexOf("/");
        return new RegExp(
          keyword.slice(1, lastSlash),
          keyword.slice(lastSlash + 1) || "i",
        ).test(title);
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

  function getScopesForSub(sub, allScopeKeys) {
    const scopes = ["global"];
    if (!sub) return scopes;
    allScopeKeys.forEach((scope) => {
      if (
        scope !== "global" &&
        scope
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .includes(sub.toLowerCase()) &&
        !scopes.includes(scope)
      )
        scopes.push(scope);
    });
    if (!scopes.includes(sub.toLowerCase())) scopes.push(sub.toLowerCase());
    return scopes;
  }

  function _getEntriesForPost(post, isAggregate, allData, pageData) {
    if (!isAggregate) return pageData;
    return getScopesForSub(
      getPostSubreddit(post),
      Object.keys(allData),
    ).flatMap((s) => allData[s] || []);
  }

  function applyKeywordRules(isFilter) {
    const storageKey = storageKeyFor(isFilter);
    const ctx = getPageContext();
    const isAggregate = ctx.type !== "subreddit";
    const allData = getStorage(storageKey);
    const pageData = isAggregate
      ? null
      : getScopesForSub(ctx.sub, Object.keys(allData)).flatMap(
          (s) => allData[s] || [],
        );

    document.querySelectorAll("shreddit-post").forEach((post) => {
      const title = getPostTitle(post);
      const entries = _getEntriesForPost(post, isAggregate, allData, pageData);

      if (isFilter) {
        const matched =
          entries.length > 0 &&
          entries.some((kw) => keywordMatchesTitle(kw, title));
        if (matched) {
          post.setAttribute("pp-kw-filtered", "true");
          post.style.display = _showFiltered ? "" : "none";
          post.style.opacity = _showFiltered ? "0.35" : "";
        } else if (post.hasAttribute("pp-kw-filtered")) {
          post.removeAttribute("pp-kw-filtered");
          post.style.display = "";
          post.style.opacity = "";
        }
      } else {
        const match = entries.find((h) =>
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
      }
    });
  }

  const applyKeywordFilters = () => applyKeywordRules(true);
  const applyKeywordHighlights = () => applyKeywordRules(false);
  const applyAllKeywordRules = () => {
    applyKeywordFilters();
    applyKeywordHighlights();
  };

  function toggleShowFiltered() {
    _showFiltered = !_showFiltered;
    document
      .querySelectorAll("shreddit-post[pp-kw-filtered]")
      .forEach((post) => {
        post.style.display = _showFiltered ? "" : "none";
        post.style.opacity = _showFiltered ? "0.35" : "";
      });
    document
      .querySelectorAll(".pp_panel_show_btn")
      .forEach((btn) => btn.classList.toggle("pp_show_active", !_showFiltered));
  }

  // =========================================================
  // KEYWORD PANEL UI
  // =========================================================

  const splitKeywords = (val) =>
    val
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

  const makeDeleteButton = (onDelete) => makeBtn("pp_kw_del", "✕", onDelete);

  /**
   * Wire up save/cancel/Enter/Escape behaviour shared by both inline editors.
   */
  function wireEditor(input, saveBtn, cancelBtn, onSave, onCancel) {
    saveBtn.onclick = withStop(onSave);
    cancelBtn.onclick = withStop(onCancel);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        onSave();
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function buildKwPanel(mode) {
    const isFilter = mode === "filter";
    const id = isFilter ? "pp_filter_panel" : "pp_highlight_panel";
    if (document.getElementById(id)) return;

    const accent = isFilter ? "#ff4500" : "#1E88DB";
    const sub = getCurrentSubreddit();
    const defaultScope = sub || "global";

    const panel = createElement("div", { id, className: "pp_panel" });
    panel.innerHTML = `
      <div class="pp_panel_head">
        <span class="pp_panel_title">${isFilter ? "Filters" : "Highlights"}</span>
        <div class="pp_panel_head_actions">
          ${isFilter ? `<button id="${id}_show_toggle" class="pp_panel_show_btn" title="Show filtered posts at reduced opacity">ON</button>` : ""}
          <button id="${id}_close" class="pp_panel_close_btn">✕</button>
        </div>
      </div>
      <div class="pp_tab_bar">
        <button id="${id}_tab_global" class="pp_tab">Global</button>
        <button id="${id}_tab_sub" class="pp_tab">${sub ? `r/${sub}` : "Subreddit"}</button>
        <button id="${id}_tab_all" class="pp_tab">All</button>
      </div>
      <div id="${id}_sub_edit" class="pp_sub_edit">
        <input id="${id}_sub_input" type="text" class="pp_input" placeholder="sub1, sub2, sub3" value="${sub || ""}" style="width:100%;height:30px;" />
        <div class="pp_sub_edit_row">
          <button id="${id}_sub_confirm" class="pp_add_btn" style="flex:1;background:${accent};">Apply</button>
          <button id="${id}_sub_cancel" class="pp_edit_cancel" style="flex:1;width:auto;border-radius:6px;font-size:11px;font-weight:600;">Cancel</button>
        </div>
      </div>
      <div id="${id}_list" class="pp_kw_list"></div>
      <div id="${id}_add_row" class="pp_add_row">
        <input id="${id}_input" type="text" class="pp_input" placeholder="${isFilter ? "keyword, wild*, /regex/" : "keyword1, keyword2"}" />
        ${!isFilter ? `<input id="${id}_color" type="color" value="#FFD700" class="pp_color_pick" />` : ""}
        <button id="${id}_add" class="pp_add_btn" style="background:${accent};">Add</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Shorthand panel element accessor
    const $ = (suffix) => panel.querySelector(`#${id}${suffix}`);

    if (isFilter) {
      const showToggle = $("_show_toggle");
      showToggle.classList.toggle("pp_show_active", !_showFiltered);
      showToggle.addEventListener("click", toggleShowFiltered);
    }
    $("_close").addEventListener("click", () => {
      panel.style.display = "none";
    });

    let activeScope = defaultScope;
    const subTab = $("_tab_sub");
    const subEdit = $("_sub_edit");

    function setTab(tab) {
      panel.querySelectorAll(".pp_tab").forEach((btn, i) => {
        const active = ["global", "sub", "all"][i] === tab;
        btn.classList.toggle("pp_tab_active", active);
        btn.style.color = active ? accent : "";
      });
      $("_add_row").style.display = tab === "all" ? "none" : "flex";
      subEdit.style.display = "none";
      activeScope =
        tab === "global"
          ? "global"
          : tab === "sub"
            ? subTab.dataset.scope || defaultScope
            : null;
      tab === "all"
        ? renderAllScopes(mode, id)
        : renderKwList(mode, activeScope, id, false);
    }

    $("_tab_global").addEventListener("click", () => setTab("global"));
    $("_tab_all").addEventListener("click", () => setTab("all"));

    let subClickTimer = null;
    subTab.addEventListener("click", () => {
      if (subClickTimer) {
        clearTimeout(subClickTimer);
        subClickTimer = null;
        subEdit.style.display = "block";
        $("_sub_input").focus();
      } else {
        subClickTimer = setTimeout(() => {
          subClickTimer = null;
          setTab("sub");
        }, 220);
      }
    });

    $("_sub_confirm").addEventListener("click", () => {
      const normalized = $("_sub_input")
        .value.trim()
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/^r\//, ""))
        .filter(Boolean)
        .join(",");
      if (!normalized) return;
      subTab.dataset.scope = normalized;
      subTab.textContent = normalized.includes(",")
        ? normalized
        : `r/${normalized}`;
      subTab.title = normalized;
      setTab("sub");
    });
    $("_sub_cancel").addEventListener("click", () => {
      subEdit.style.display = "none";
    });

    const input = $("_input");
    const colorPicker = isFilter ? null : $("_color");

    const addEntry = () => {
      const val = input.value.trim();
      if (!val) return;
      mutateStorage(storageKeyFor(mode), (all) => {
        all[activeScope] ??= [];
        if (isFilter) {
          if (!all[activeScope].includes(val)) all[activeScope].push(val);
        } else {
          const kw = splitKeywords(val);
          const exists = all[activeScope].some(
            (h) =>
              h.color === colorPicker.value &&
              JSON.stringify(h.keywords) === JSON.stringify(kw),
          );
          if (!exists)
            all[activeScope].push({ keywords: kw, color: colorPicker.value });
        }
      });
      applyRulesForMode(mode);
      renderKwList(mode, activeScope, id, false);
      input.value = "";
      input.focus();
    };

    $("_add").addEventListener("click", addEntry);
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
    const row = createElement("div", { className: "pp_edit_row" });

    let colorPicker = null;
    if (!isFilter) {
      colorPicker = createElement("input", {
        type: "color",
        value: entry.color,
        className: "pp_color_pick",
        style: "width:24px;height:24px;flex-shrink:0;",
      });
      row.appendChild(colorPicker);
    }

    const input = createElement("input", {
      type: "text",
      value: keywords.join(", "),
      className: "pp_input",
      style: "height:24px;",
    });
    const saveBtn = makeBtn("pp_edit_save", "Save", null);
    const cancelBtn = makeBtn("pp_edit_cancel", "✕", null);
    row.append(input, saveBtn, cancelBtn);

    const save = () => {
      const val = input.value.trim();
      if (!val) return;
      mutateStorage(storageKeyFor(mode), (all) => {
        if (all[scope])
          all[scope][index] = isFilter
            ? val
            : {
                keywords: splitKeywords(val),
                color: colorPicker?.value ?? entry.color,
              };
      });
      applyRulesForMode(mode);
      onDone();
    };

    wireEditor(input, saveBtn, cancelBtn, save, onDone);
    return row;
  }

  function buildListRow(mode, scope, entry, index, panelId, onReRender) {
    const isFilter = mode === "filter";
    const keywords = isFilter ? [entry] : entry.keywords;

    const row = createElement("div", { className: "pp_kw_row" });
    if (!isFilter)
      row.appendChild(
        createElement("span", {
          className: "pp_kw_swatch",
          style: `background:${entry.color}`,
        }),
      );

    const label = createElement("span", {
      textContent: keywords.join(", "),
      title: "Click to edit",
      className: "pp_kw_label",
    });
    label.addEventListener("click", () =>
      row.replaceWith(
        makeEditableRow(mode, scope, entry, index, panelId, onReRender),
      ),
    );

    const delBtn = makeDeleteButton(() => {
      mutateStorage(storageKeyFor(mode), (all) => {
        if (all[scope]) {
          all[scope].splice(index, 1);
          if (!all[scope].length) delete all[scope];
        }
      });
      applyRulesForMode(mode);
      onReRender();
    });

    row.append(label, delBtn);
    return row;
  }

  const makeEmptyState = (text) =>
    createElement("div", { className: "pp_kw_empty", textContent: text });

  function renderKwList(mode, scope, panelId, readonly) {
    const list = document.getElementById(`${panelId}_list`);
    if (!list) return;
    const entries = getScopeEntries(mode, scope);
    list.innerHTML = "";

    if (!entries.length)
      return list.appendChild(makeEmptyState("Nothing here yet"));
    entries.forEach((entry, i) => {
      const row = buildListRow(mode, scope, entry, i, panelId, () =>
        renderKwList(mode, scope, panelId, readonly),
      );
      if (readonly) {
        const label = row.querySelector(".pp_kw_label");
        label.title = label.textContent;
        label.style.cursor = "default";
        label.replaceWith(label.cloneNode(true));
        row.querySelector(".pp_kw_del")?.remove();
      }
      list.appendChild(row);
    });
  }

  function makeScopeNameEditor(
    oldScope,
    headerEl,
    _bodyEl,
    mode,
    panelId,
    onDone,
  ) {
    const isFilter = mode === "filter";
    const editorRow = createElement("div", {
      style:
        "display:flex;align-items:center;gap:6px;height:32px;box-sizing:border-box;border-bottom:1px solid rgba(255,255,255,0.04);padding:0 2px;",
    });
    const input = createElement("input", {
      type: "text",
      className: "pp_scope_name_input",
      placeholder: "r/sub1, r/sub2",
      value:
        oldScope === "global"
          ? "global"
          : oldScope
              .split(",")
              .map((s) => `r/${s.trim()}`)
              .join(", "),
    });

    const btnStyle = `height:32px;font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;`;
    const saveBtn = makeBtn(
      "pp_edit_save",
      "Save",
      null,
      `color:${isFilter ? "#ff4500" : "#1E88DB"};${btnStyle}`,
    );
    const cancelBtn = makeBtn("pp_edit_cancel", "✕", null, btnStyle);

    editorRow.append(input, saveBtn, cancelBtn);

    const save = () => {
      const newScope =
        input.value.trim() === "global"
          ? "global"
          : input.value
              .trim()
              .split(",")
              .map((s) => s.trim().toLowerCase().replace(/^r\//, ""))
              .filter(Boolean)
              .join(",");
      if (!newScope) return;
      renameScopeInStorage(oldScope, newScope);
      applyAllKeywordRules();
      onDone();
    };

    wireEditor(input, saveBtn, cancelBtn, save, onDone);
    headerEl.replaceWith(editorRow);
    return editorRow;
  }

  function renderAllScopes(mode, panelId) {
    const list = document.getElementById(`${panelId}_list`);
    if (!list) return;
    const all = getStorage(storageKeyFor(mode));
    const scopes = Object.keys(all);
    list.innerHTML = "";

    if (!scopes.length)
      return list.appendChild(makeEmptyState("Nothing saved anywhere"));

    scopes.forEach((scope) => {
      if (!all[scope]?.length) return;
      const header = createElement("div", { className: "pp_scope_header" });
      const chevron = createElement("span", {
        className: "pp_scope_chevron",
        textContent: "▶",
      });
      const scopeLabel = createElement("span", {
        className: "pp_scope_name",
        title: "Click to edit scope name",
        textContent:
          scope === "global" ? "🌐 Global" : `r/${scope.replace(/,/g, ", r/")}`,
      });
      const countBadge = createElement("span", {
        className: "pp_scope_count",
        textContent: all[scope].length,
      });
      header.append(chevron, scopeLabel, countBadge);

      const body = createElement("div", { className: "pp_scope_body" });
      const renderBodyEntries = () => {
        body.innerHTML = "";
        const currentEntries = getScopeEntries(mode, scope);
        currentEntries.forEach((entry, i) =>
          body.appendChild(
            buildListRow(mode, scope, entry, i, panelId, renderBodyEntries),
          ),
        );
        countBadge.textContent = currentEntries.length;
      };

      let open = false;
      scopeLabel.addEventListener("click", (e) => {
        e.stopPropagation();
        makeScopeNameEditor(scope, header, body, mode, panelId, () =>
          renderAllScopes(mode, panelId),
        );
      });
      header.addEventListener("click", () => {
        open = !open;
        body.style.display = open ? "block" : "none";
        chevron.style.transform = open ? "rotate(90deg)" : "";
        if (open) renderBodyEntries();
      });
      list.append(header, body);
    });
  }

  function openKwPanel(mode) {
    const id = mode === "filter" ? "pp_filter_panel" : "pp_highlight_panel";
    buildKwPanel(mode);
    const panel = document.getElementById(id);
    if (panel)
      panel.style.display = panel.style.display === "flex" ? "none" : "flex";
  }

  /** Add a subtle background on hover to a button element (used for menu entries). */
  const addHoverBg = (el, hoverColor = "rgba(255,255,255,0.06)") => {
    el.addEventListener("mouseenter", () => {
      el.style.background = hoverColor;
    });
    el.addEventListener("mouseleave", () => {
      el.style.background = "transparent";
    });
  };

  function injectFilterMenuEntry() {
    if (document.getElementById("pp_filter_menu_entry")) return;
    const menuList = document
      .getElementById("user-drawer-content")
      ?.querySelector('ul, nav, [role="menu"]');
    if (!menuList) return;

    const makeMenuEntry = (id, label, mode) => {
      const entry = createElement("li", { id, style: "list-style:none;" });
      const btn = createElement("button", {
        textContent: label,
        style:
          "display:flex;align-items:center;width:100%;padding:8px 16px;background:transparent;border:none;border-top:1px solid rgba(255,255,255,0.06);color:#d7dadc;font-family:sans-serif;font-size:14px;font-weight:500;cursor:pointer;text-align:left;gap:8px;box-sizing:border-box;border-radius:0 !important;",
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.getElementById("expand-user-drawer-button")?.click();
        openKwPanel(mode);
      });
      addHoverBg(btn);
      entry.appendChild(btn);
      return entry;
    };
    menuList.append(
      makeMenuEntry("pp_filter_menu_entry", "⊘ Keyword Filters", "filter"),
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

  const smoothScrollTo = (top) => window.scrollTo({ top, behavior: "smooth" });
  const getRelativeTop = (el) =>
    window.scrollY + el.getBoundingClientRect().top - getHeaderOffset();

  function toggleCollapseAll() {
    const allComments = Array.from(
      document.querySelectorAll("shreddit-comment[depth]"),
    );
    if (!allComments.length) return;

    collapseState = (collapseState + 1) % 3;
    const offset = getHeaderOffset();
    const topThreads = getTopLevelComments();
    const anchor =
      topThreads.find((el) => el.getBoundingClientRect().top > offset - 10) ??
      topThreads[topThreads.length - 1];

    allComments.forEach((c) => {
      const depth = parseInt(c.getAttribute("depth") || "0", 10);
      if (
        (collapseState === 1 && depth > 0) ||
        (collapseState === 2 && depth > 1)
      )
        c.setAttribute("collapsed", "");
      else c.removeAttribute("collapsed");
    });

    const mainBtnLabel = collapseBtn.querySelector("#pp_collapse_text");
    if (mainBtnLabel)
      mainBtnLabel.textContent = ["COL", "1LV", "EXP"][collapseState];
    collapseBtn.classList.toggle("pp_collapsed", collapseState !== 0);

    if (anchor)
      setTimeout(
        () =>
          smoothScrollTo(
            window.scrollY + anchor.getBoundingClientRect().top - offset,
          ),
        30,
      );
  }

  function jumpToTop() {
    const post = document.querySelector("shreddit-post");
    smoothScrollTo(post ? getRelativeTop(post) : 0);
  }

  function jumpToTarget(direction) {
    const offset = getHeaderOffset();
    const targets = getTopLevelComments();
    if (!targets.length) return jumpToTop();

    const targetEl =
      direction === -1
        ? targets.reverse().find((el) => el.getBoundingClientRect().top < -5)
        : targets.find((el) => el.getBoundingClientRect().top > offset + 5);

    if (!targetEl)
      return smoothScrollTo(direction === 1 ? getRelativeTop(targets[0]) : 0);

    const targetY = getRelativeTop(targetEl);
    if (
      direction === 1 &&
      (Math.abs(targetY - window.scrollY) < 3 ||
        Math.abs(targetY - lastScrollY) < 3)
    ) {
      smoothScrollTo(getRelativeTop(targets[0]));
    } else {
      lastScrollY = targetY;
      smoothScrollTo(targetY);
    }
  }

  const jumpToPrevParent = () => jumpToTarget(-1);
  const jumpToNextParent = () => jumpToTarget(1);

  function jumpToBottom() {
    const container =
      document.querySelector("#comment-tree-container") ||
      document.querySelector("shreddit-comment-tree");
    if (container)
      container.scrollIntoView({ behavior: "smooth", block: "end" });
    else smoothScrollTo(document.body.scrollHeight);
  }

  function syncCollapseButtonVisibility() {
    _onAllowedSubreddit = ALLOWED_SUBREDDITS.some((s) =>
      window.location.pathname.toLowerCase().startsWith(s),
    );
    collapseBtn.style.display = window.location.href.includes("/comments/")
      ? "flex"
      : "none";
  }

  // =========================================================
  // NATO / BINARY DECODER
  // =========================================================

  function natoToText(s) {
    const tokens = s.toLowerCase().split(/[\s,+/]+/);
    let res = "",
      count = 0;
    for (const token of tokens.map((t) => t.trim())) {
      if (!token) continue;
      if (NATO_ALPHABET[token] !== undefined) {
        // Hyphenated keys like "x-ray" live directly in NATO_ALPHABET,
        // so this single lookup handles all cases; no secondary scan needed.
        res += NATO_ALPHABET[token];
        count++;
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
      if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || c > 126) return null;
      res += String.fromCharCode(c);
    }
    return res;
  }

  function createTranslationComponent(type, translatedText) {
    const container = createElement("div", { className: "pp_decoder_box" });
    const copyBtn = createElement("button", {
      className: "pp_decoder_btn",
      textContent: "COPY",
      style: `background:${DC.border};color:${DC.text}`,
    });
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(translatedText).then(() => {
        copyBtn.textContent = "DONE";
        copyBtn.style.background = DC.success;
        setTimeout(() => {
          copyBtn.textContent = "COPY";
          copyBtn.style.background = DC.border;
        }, 1000);
      });
    };

    container.append(
      createElement("div", {
        className: "pp_decoder_label",
        textContent: type === "nato" ? "NATO" : "BIN",
      }),
      createElement("div", {
        className: "pp_decoder_result",
        textContent: translatedText,
      }),
      copyBtn,
      createElement("button", {
        className: "pp_decoder_btn",
        textContent: "SEARCH",
        style: `background:${DC.accent};color:white`,
        onclick: () => window.open(buildSocialURL(translatedText), "_blank"),
      }),
    );
    return container;
  }

  function processTextNode(node) {
    const text = node.textContent;
    const processMatch = (val, type, decoder) => {
      if (!val) return;
      const decoded = decoder(val);
      if (decoded?.trim().length > 0) {
        const target = node.parentNode.tagName === "P" ? node.parentNode : node;
        target.parentNode.insertBefore(
          createTranslationComponent(type, decoded),
          target.nextSibling,
        );
      }
    };
    text
      .match(BINARY_RE)
      ?.forEach((match) => processMatch(match, "binary", binaryToText));
    if (/[a-zA-Z]/.test(text)) processMatch(text, "nato", natoToText);
  }

  function scanParagraph(p) {
    if (p.hasAttribute("data-decoded")) return;
    p.setAttribute("data-decoded", "true");
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(processTextNode);
  }

  function createSelectionPopup() {
    const popup = createElement("div", { className: "pp_selection_popup" });
    const btn = createElement("button", { innerHTML: "🔍 Search" });
    popup.appendChild(btn);
    document.body.appendChild(popup);
    return { popup, btn };
  }

  // =========================================================
  // ACTIONS PIPELINE
  // =========================================================

  const Actions = {
    nuke() {
      deepQueryAll(document, NUKE_SELECTORS.join(", ")).forEach(
        (item) => item.isConnected && item.remove(),
      );
    },
    nukeAwardButtons() {
      deepQueryAll(
        document,
        "award-button:not([pp-award-hidden]), shreddit-slot[slot='award-button']:not([pp-award-hidden])",
      ).forEach((el) => {
        el.style.display = "none";
        el.setAttribute("pp-award-hidden", "true");
      });
    },
    injectAccountBadge,
    injectFilterMenuEntry,
    syncCollapseButton: syncCollapseButtonVisibility,
    applyKeywordFilters,
    applyKeywordHighlights,
    applyAllKeywordRules,

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
                stopEvent(e);
                const clickedSrc = decodeAmp(getImgSrc(imgEl) || "");
                const idx = urls.findIndex((u) =>
                  clickedSrc.includes(
                    u.match(/\/([A-Za-z0-9]+)\.(jpg|png|gif|webp)/)?.[1],
                  ),
                );
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
            const clickedSrc = getImgSrc(imgEl);
            if (!clickedSrc) return;
            stopEvent(e);
            const galleryContainer =
              imgEl.closest("gallery-carousel") || imgEl.closest("ul");
            const imgs = galleryContainer
              ? [
                  ...new Set(
                    Array.from(
                      galleryContainer.querySelectorAll("faceplate-img, img"),
                    )
                      .map(getImgSrc)
                      .filter(Boolean),
                  ),
                ]
              : [clickedSrc];
            openLightbox(imgs, Math.max(0, imgs.indexOf(clickedSrc)));
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
          )
            comment.setAttribute("collapsed", "");
          if (comment.shadowRoot && !comment.hasAttribute("pp-shadow-styled")) {
            const color =
              THREAD_COLORS[
                parseInt(comment.getAttribute("depth") || "0", 10) %
                  THREAD_COLORS.length
              ];
            comment.shadowRoot.appendChild(
              createElement("style", {
                className: "pp-line-style",
                textContent: `div[data-testid="main-thread-line"] { background-color: ${color} !important; width: 2px !important; opacity: 1 !important; } div[data-testid="branch-line"] { border-left: 2px solid ${color} !important; border-bottom: 2px solid ${color} !important; opacity: 1 !important; }`,
              }),
            );
            comment.setAttribute("pp-shadow-styled", "true");
          }
          // Mark as checked unconditionally so comments without a shadowRoot
          // don't get reprocessed on every MutationObserver tick.
          comment.setAttribute("pp-checked", "true");
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
      const wrap = createElement("div", {
        id: "pp_sidebar_wrap",
        className: collapsed ? "pp_sb_collapsed" : "",
      });
      const tab = createElement("div", {
        id: "pp_sidebar_tab",
        textContent: collapsed ? "❮" : "❯",
      });
      const inner = createElement("div", { id: "pp_sidebar_inner" });

      if (
        sidebar.tagName === "FACEPLATE-PARTIAL" ||
        !sidebar.classList.contains("contents")
      )
        inner.appendChild(sidebar);
      else while (sidebar.firstChild) inner.appendChild(sidebar.firstChild);

      wrap.append(tab, inner);
      document.body.appendChild(wrap);
      tab.addEventListener("click", () => {
        const isCollapsed = wrap.classList.toggle("pp_sb_collapsed");
        tab.textContent = isCollapsed ? "❮" : "❯";
        lsSet("pp_sidebar_collapsed", isCollapsed);
      });
    },

    processDecoders() {
      if (!_onAllowedSubreddit) return;
      document
        .querySelectorAll(
          COMMENT_SELECTORS.map((s) => `${s}:not([pp-decoder-scanned])`).join(
            ", ",
          ),
        )
        .forEach((container) => {
          container.setAttribute("pp-decoder-scanned", "true");
          container.querySelectorAll("p").forEach(scanParagraph);
        });
    },
  };

  // =========================================================
  // EVENT LISTENERS
  // =========================================================

  collapseBtn.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.id === "pp_collapse_text")
      return;
    e.preventDefault();
    drag.active = true;
    drag.moved = false;
    const rect = collapseBtn.getBoundingClientRect();
    drag.offsetX = e.clientX - rect.left;
    drag.offsetY = e.clientY - rect.top;
  });

  document.addEventListener("mousemove", (e) => {
    if (!drag.active) return;
    drag.moved = true;
    collapseBtn.style.left = collapseBtn.style.bottom = "auto";
    collapseBtn.style.right =
      Math.max(
        0,
        window.innerWidth -
          (e.clientX - drag.offsetX) -
          collapseBtn.offsetWidth,
      ) + "px";
    collapseBtn.style.top = Math.max(0, e.clientY - drag.offsetY) + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!drag.active) return;
    drag.active = false;
    if (drag.moved)
      lsSet("pp_collapse_pos", {
        top: parseInt(collapseBtn.style.top),
        right: parseInt(collapseBtn.style.right),
      });
    drag.moved = false;
  });

  // Collapse toolbar button wiring
  const collapseActions = [
    [
      "#pp_collapse_text",
      () => {
        if (!drag.moved) toggleCollapseAll();
      },
    ],
    ["#pp_jump_top", jumpToTop],
    ["#pp_jump_prev", jumpToPrevParent],
    ["#pp_jump_next", jumpToNextParent],
    ["#pp_jump_bottom", jumpToBottom],
  ];
  collapseActions.forEach(([sel, fn]) =>
    collapseBtn.querySelector(sel).addEventListener("click", withStop(fn)),
  );

  // Patch history.pushState / replaceState to:
  //   1. Keep collapse button in sync (existing behaviour)
  //   2. Correct Reddit's own search navigation so the q param is properly
  //      encoded and subreddit-scoped searches stay within the subreddit.
  //      Reddit builds its search URLs with unencoded spaces in `q`, which
  //      breaks multi-word queries. We intercept after Reddit commits the
  //      navigation and immediately replace it with a clean URL.
  const _patchHistory =
    (original) =>
    (...args) => {
      original(...args);
      syncCollapseButtonVisibility();

      // args[2] is the new URL string passed to pushState/replaceState
      const rawUrl = args[2];
      if (!rawUrl) return;
      try {
        const u = new URL(rawUrl, location.origin);
        const q = u.searchParams.get("q");
        if (!q) return;

        // Only act on Reddit search pages
        if (!u.pathname.endsWith("/search/") && !u.pathname.endsWith("/search"))
          return;

        const corrected = buildRedditSearchUrl(
          q,
          extractSubFromPathname(u.pathname),
        );

        // Only replace if the URL actually differs (avoids an infinite loop)
        if (corrected !== u.pathname + u.search)
          history.replaceState(args[0], args[1], corrected);
      } catch {
        // Malformed URL — ignore
      }
    };
  history.pushState = _patchHistory(history.pushState.bind(history));
  history.replaceState = _patchHistory(history.replaceState.bind(history));
  window.addEventListener("popstate", syncCollapseButtonVisibility);

  window.addEventListener(
    "keydown",
    (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.shiftKey
      )
        return;
      const key = e.key.toLowerCase();
      const prevent = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };

      if (lightbox?.style.display === "flex") {
        const lbNav = { arrowright: 1, d: 1, arrowleft: -1, a: -1 };
        if (
          lbNav[key] !== undefined ||
          key === "escape" ||
          key === "x" ||
          key === "w" ||
          key === "s"
        ) {
          prevent();
          lbNav[key] ? navigateGallery(lbNav[key]) : closeLightbox();
        }
        return;
      }

      if (collapseBtn.style.display === "none") return;
      const jumps = {
        s: toggleCollapseAll,
        w: jumpToTop,
        a: jumpToPrevParent,
        d: jumpToNextParent,
        x: jumpToBottom,
      };
      if (jumps[key]) {
        prevent();
        jumps[key]();
      }
    },
    true,
  );

  // =========================================================
  // INTRA-SUBREDDIT SEARCH — URL correction
  // =========================================================
  // Reddit's hybridNavigate (SPA navigation) is unreliable on search pages
  // and often aborts with a DOMException. We listen on the "navigate" event,
  // let Reddit's handler run first, then use setTimeout(0) to force a real
  // page load to the corrected URL. This bypasses Reddit's broken SPA path
  // entirely. We do NOT call e.intercept() — that would compete with Reddit's
  // own intercept handler and cause it to abort before rendering.

  if (window.navigation) {
    window.navigation.addEventListener("navigate", (e) => {
      if (!e.canIntercept || e.hashChange || e.downloadRequest) return;

      let u;
      try {
        u = new URL(e.destination.url);
      } catch {
        return;
      }

      if (!u.pathname.endsWith("/search/") && !u.pathname.endsWith("/search"))
        return;

      const q = u.searchParams.get("q");
      if (!q) return;

      const corrected = buildRedditSearchUrl(
        q,
        extractSubFromPathname(u.pathname),
      );
      if (corrected === u.pathname + u.search) return;

      // Let Reddit's navigate handler run first (we do not intercept).
      // After it commits (or aborts), force a real load to the corrected URL.
      setTimeout(() => window.location.assign(corrected), 0);
    });
  } else {
    // Fallback for browsers without Navigation API
    document.addEventListener(
      "keydown",
      (e) => {
        if (
          e.key !== "Enter" ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          e.shiftKey
        )
          return;

        const input = e
          .composedPath()
          .find(
            (el) =>
              el.tagName === "INPUT" &&
              (el.name === "q" || el.type === "search"),
          );
        if (!input) return;

        const query = input.value?.trim();
        if (!query) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        window.location.assign(
          buildRedditSearchUrl(
            query,
            extractSubFromPathname(window.location.pathname),
          ),
        );
      },
      { capture: true },
    );
  }

  window.addEventListener(
    "wheel",
    (e) => {
      if (lightbox.style.display !== "flex") return;
      stopEvent(e);
      const now = Date.now();
      if (now - lastWheelTime > 150) {
        lastWheelTime = now;
        navigateGallery(e.deltaY > 0 ? 1 : -1);
      }
    },
    { passive: false, capture: true },
  );

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
              window.open(buildSocialURL(currentSelText), "_blank");
            selectionPopup.popup.style.display = "none";
          });
        }
        currentSelText = selText;
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        selectionPopup.popup.style.left = `${rect.left + window.scrollX + rect.width / 2 - 40}px`;
        selectionPopup.popup.style.top = `${rect.top + window.scrollY - 40}px`;
        selectionPopup.popup.style.display = "block";
      } else if (selectionPopup) selectionPopup.popup.style.display = "none";
    }, 50);
  });

  // =========================================================
  // MUTATION OBSERVER ENGINE
  // =========================================================

  let debounceTimer = null;
  new MutationObserver((mutations) => {
    if (!mutations.some((m) => m.addedNodes.length > 0)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      Actions.nuke();
      Actions.nukeAwardButtons();
      Actions.injectAccountBadge();
      Actions.initSidebar();
      Actions.processComments();
      Actions.syncCollapseButton();
      Actions.processDecoders();
      Actions.applyAllKeywordRules();
      Actions.injectFilterMenuEntry();
      document
        .querySelectorAll("shreddit-post:not([pp-images-handled])")
        .forEach((post) => Actions.handleImages(post));
    }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });

  // =========================================================
  // BOOTSTRAP
  // =========================================================

  function bootstrap() {
    attachLightbox();
    syncCollapseButtonVisibility();
    Actions.processDecoders();
    Actions.injectAccountBadge();
  }
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", bootstrap)
    : bootstrap();

  console.log("Reddit Enhancements v2.5.10 loaded");
})();
