// ==UserScript==
// @name            Reddit Enhancements
// @description     Nukes Reddit clutter, adds image lightbox/gallery, collapse tools, NATO/Binary decoder, and social search helpers.
// @author          JR
// @version         2.11.8
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

  /** Per-mode accent colors for filter/highlight panels. */
  const MODE_ACCENT = { filter: DC.accent, highlight: "#1E88DB" };

  // Containers scanned for NATO/binary content (tighter — paragraph-level bodies).
  const DECODER_SELECTORS = [
    '[data-testid="comment"]',
    "shreddit-comment",
    ".Comment",
    ".usertext-body",
  ];

  const NUKE_SELECTORS = [
    "#subreddit-banner-img",
    'faceplate-tracker[noun="games_drawer"]',
    "games-section-badge-controller",
    "#games_section",
    'faceplate-tracker[noun="resources_menu"]',
    'faceplate-tracker[noun="news_home"]',
    'faceplate-tracker[noun="explore_home"]',
    'a[href^="/news/"]',
    'a[href^="/explore/"]',
    'a[href^="https://www.reddit.com/news/"]',
    'a[href^="https://www.reddit.com/explore/"]',
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

  // Also hidden/removed by the sweep (see sweepRoot).
  const AWARD_SEL = "award-button, shreddit-slot[slot='award-button']";
  const BANNER_SEL = 'div[role="banner"].banner.error';

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
  const FILTER_VISIBLE_KEY = "pp_filter_show_state";
  const VERSION = "2.11.8";

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

  const DECODER_PENDING_SEL = DECODER_SELECTORS.map(
    (s) => `${s}:not([pp-decoder-scanned])`,
  ).join(", ");
  const BINARY_RE = /\b(?:[01]{8}\s*){2,}\b/g;
  const SOCIAL_SITE_CLAUSE = SOCIAL_SITES.map((s) => `site:${s}`).join(" OR ");

  // =========================================================
  // STATE
  // =========================================================

  let gallery = { images: [], index: 0 };
  let lastWheelTime = 0;
  let collapseState = 0;
  let lastScrollY = 0;
  let _filteredVisible = JSON.parse(
    localStorage.getItem(FILTER_VISIBLE_KEY) || "false",
  );
  let _cachedUsername = null;
  let _badgeFetchPromise = null;
  let _badgeRetryAt = 0;
  let drag = { active: false, offsetX: 0, offsetY: 0, moved: false };

  let _onAllowedSubreddit = false;

  // =========================================================
  // HELPER UTILITIES
  // =========================================================

  const decodeAmp = (s) => s.replaceAll("&amp;", "&");
  const normalizeScope = (str) =>
    str
      .split(",")
      .map((s) => s.trim().toLowerCase().replace(/^r\//, ""))
      .filter(Boolean)
      .join(",");
  const panelIdFor = (mode) =>
    mode === "filter" ? "pp_filter_panel" : "pp_highlight_panel";
  const accentFor = (mode) => MODE_ACCENT[mode] ?? DC.accent;
  const clearLightboxHash = () => {
    if (location.hash === "#lightbox") {
      history.replaceState(
        history.state,
        "",
        location.href.replace("#lightbox", ""),
      );
    }
  };
  const killNativeLightbox = () =>
    document
      .querySelectorAll("shreddit-lightbox, shreddit-media-lightbox")
      .forEach((el) => el.remove());
  const buildSocialURL = (q) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${q} (${SOCIAL_SITE_CLAUSE})`)}`;

  // XenForo re-runs the query from q= when the search ID in the path isn't one
  // it has stored for you, so a dummy ID works. If SimpCity changes behavior,
  // this is the only place to fix.
  const buildSimpCityUrl = (q, titleOnly = false) =>
    `https://simpcity.cr/search/1/?q=${encodeURIComponent(q)}${titleOnly ? "&c[title_only]=1" : ""}&o=relevance`;

  const buildRedditSearchUrl = (q, sub) =>
    sub
      ? `/r/${sub}/search/?q=${encodeURIComponent(q)}&restrict_sr=1`
      : `/search/?q=${encodeURIComponent(q)}`;

  const extractSubFromPathname = (pathname) => {
    const parts = pathname.split("/").filter(Boolean);
    return parts[0] === "r" && parts[1] ? parts[1] : null;
  };

  const stopEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const swallowEvent = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
  };

  const withStop = (fn) => (e) => {
    stopEvent(e);
    fn(e);
  };

  const createElement = (tag, props = {}, ...children) => {
    const { style, ...rest } = props;
    const el = Object.assign(document.createElement(tag), rest);
    if (style) {
      if (typeof style === "string") el.style.cssText = style;
      else Object.assign(el.style, style);
    }
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

  // Wheel delta in pixels for both pixel and line scroll modes.
  const wheelDelta = (e) => (e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY);

  // Coalesces bursts of calls (e.g. window resize) into one run per frame.
  const rafThrottle = (fn) => {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn();
      });
    };
  };

  const isVideoUrl = (u) => /\.(mp4|webm|mov|m3u8)|format=mp4/.test(u);
  const freshZoom = () => ({ s: 1, x: 0, y: 0 });
  // Inline style shared by everything that fills the lightbox stage.
  const FILL = "position:absolute; inset:0;";

  // Thumbnail for a gallery item: <img>, or a first-frame <video> for clips.
  const makeThumb = (src, className, lazy) => {
    const url = decodeAmp(src);
    return isVideoUrl(url)
      ? createElement("video", {
        className,
        src: `${url}#t=0.1`,
        muted: true,
        preload: "metadata",
        playsInline: true,
      })
      : createElement("img", {
        className,
        src: url,
        loading: lazy ? "lazy" : "eager",
        decoding: "async",
      });
  };

  // =========================================================
  // SHADOW ROOT REGISTRY
  // =========================================================
  // Reddit renders much of its UI inside shadow roots, which document-level
  // queries can't reach. Instead of re-walking every element on every mutation,
  // each root is registered once: imperative roots via an attachShadow hook,
  // declarative (SSR) roots via a one-time walk of newly added subtrees.

  const _seenRoots = new WeakSet();
  const _rootByHost = new WeakMap(); // also reaches closed shadow roots
  let _rootRefs = [];
  let _freshRoots = [];

  function registerRoot(root) {
    if (_seenRoots.has(root)) return false;
    _seenRoots.add(root);
    _rootByHost.set(root.host, root);
    _rootRefs.push(new WeakRef(root));
    _freshRoots.push(root);
    return true;
  }

  function discoverRoots(scope) {
    if (scope.shadowRoot && registerRoot(scope.shadowRoot))
      discoverRoots(scope.shadowRoot);
    for (const el of scope.querySelectorAll("*")) {
      if (el.shadowRoot && registerRoot(el.shadowRoot))
        discoverRoots(el.shadowRoot);
    }
  }

  const _attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = _attachShadow.call(this, init);
    registerRoot(root);
    return root;
  };

  // =========================================================
  // INLINE VIDEO LOOKUP (for resuming playback in the lightbox)
  // =========================================================

  // Every <video> that has ever been asked to play, so a player can be found even
  // when its element is hidden in a closed shadow root or its markup changes.
  const _videoRefs = [];
  const _videoSeen = new WeakSet();
  const _play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (this.localName === "video" && !_videoSeen.has(this)) {
      _videoSeen.add(this);
      _videoRefs.push(new WeakRef(this));
      // Drop collected players so the list can't grow without bound.
      if (_videoRefs.length > 100) {
        for (let i = _videoRefs.length - 1; i >= 0; i--)
          if (!_videoRefs[i].deref()) _videoRefs.splice(i, 1);
      }
    }
    return _play.apply(this, args);
  };

  // First <video> under a node: light DOM, open shadow roots and closed ones.
  function findVideo(node) {
    const own = node.querySelector("video");
    if (own) return own;
    const root = node.shadowRoot ?? _rootByHost.get(node);
    const inRoot = root && findVideo(root);
    if (inRoot) return inRoot;
    for (const el of node.querySelectorAll("*")) {
      const r = el.shadowRoot ?? _rootByHost.get(el);
      const hit = r && findVideo(r);
      if (hit) return hit;
    }
    return null;
  }

  // The tracked video overlapping an element the most (prunes dead refs).
  function videoNear(el) {
    const r = el.getBoundingClientRect();
    let best = null;
    let bestArea = 0;
    for (let i = _videoRefs.length - 1; i >= 0; i--) {
      const v = _videoRefs[i].deref();
      if (!v) {
        _videoRefs.splice(i, 1);
        continue;
      }
      if (!v.isConnected) continue;
      const b = v.getBoundingClientRect();
      const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      if (w > 0 && h > 0 && w * h > bestArea) {
        best = v;
        bestArea = w * h;
      }
    }
    return best;
  }

  // Best playable URL for a shreddit player: packaged MP4 (widest support, seekable),
  // then the HLS playlist, then the preview clip.
  function pickVideoSrc(player) {
    try {
      const best = JSON.parse(player.getAttribute("packaged-media-json") || "null")
        ?.playbackMp4s?.permutations?.map((p) => p.source)
        .filter((src) => src?.url)
        .sort((a, b) => (b.dimensions?.height ?? 0) - (a.dimensions?.height ?? 0))[0];
      if (best) return best.url;
    } catch {}
    return (
      player.querySelector("source")?.getAttribute("src") ||
      player.getAttribute("src") ||
      player.getAttribute("preview") ||
      ""
    );
  }

  const getHeaderOffset = () =>
    document.querySelector("header.v2")?.offsetHeight || 56;
  const getTopLevelComments = () =>
    Array.from(document.querySelectorAll("shreddit-comment[depth='0']"));
  const getCommentDepth = (el) => parseInt(el.getAttribute("depth") || "0", 10);
  const getPostTitle = (post) =>
    post.getAttribute("post-title") ||
    post.querySelector('[slot="title"]')?.textContent ||
    post.querySelector('a[id^="post-title"]')?.textContent ||
    "";
  const getPostSubreddit = (post) =>
    post.getAttribute("subreddit-name") ||
    post.getAttribute("subreddit") ||
    null;
  const getPostAuthor = (post) => post.getAttribute("author") || null;

  const isOwnPost = (post) => {
    const author = getPostAuthor(post);
    return (
      !!_cachedUsername &&
      !!author &&
      author.toLowerCase() === _cachedUsername.toLowerCase()
    );
  };

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
    if (parts[0] === "user" && parts[1])
      return { type: "user", username: parts[1] };
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
        const merged = [...(all[newScope] || []), ...all[oldScope]];
        all[newScope] =
          merged.length > 0 && typeof merged[0] === "string"
            ? [...new Set(merged)]
            : merged;
        delete all[oldScope];
      }
    };
    mutateStorage(FILTER_STORAGE_KEY, renameLogic);
    mutateStorage(HIGHLIGHT_STORAGE_KEY, renameLogic);
  }

  // =========================================================
  // KEYWORD MODE HELPERS
  // =========================================================

  const isFilterMode = (mode) => mode === "filter" || mode === true;
  const storageKeyFor = (mode) =>
    isFilterMode(mode) ? FILTER_STORAGE_KEY : HIGHLIGHT_STORAGE_KEY;
  const getScopeEntries = (mode, scope) =>
    getStorage(storageKeyFor(mode))[scope] || [];
  const applyRulesForMode = (mode) =>
    isFilterMode(mode) ? applyKeywordFilters() : applyKeywordHighlights();

  // =========================================================
  // GLOBAL STYLESHEET
  // =========================================================

  document.documentElement.appendChild(
    createElement("style", {
      textContent: `
    ${NUKE_SELECTORS.join(", ")} { display: none !important; }
    ${AWARD_SEL} { display: none !important; }

    /* =========================================================
       MODIFICATION: Hide horizontal rules globally across all views
       ========================================================= */
    #user-drawer-content hr,
    #left-sidebar-container hr,
    flex-left-nav-container hr,
    hr.w-100.my-sm.border-neutral-border-weak,
    nav hr,
    aside hr {
      display: none !important;
    }

    a[href*="reddit.com/news"], a[href*="/news/"] { display: none !important; }
    a[href*="reddit.com/explore"], a[href*="/explore/"] { display: none !important; }

    .pp_imageViewable { cursor: zoom-in !important; }

    .shreddit-subreddit-icon__icon { display: none !important; }

    /* AutoModerator fallback stub (used when Reddit's native collapse fails) */
    shreddit-comment[pp-am-stub]:not([pp-am-open]) { display: none !important; }
    .pp_am_stub { margin: 4px 0; padding: 8px 12px; background: ${DC.bg}; border: 1px solid ${DC.border}; border-radius: 6px; color: rgba(255,255,255,0.55); font: 600 13px sans-serif; cursor: pointer; user-select: none; -webkit-user-select: none; }

    #pp_lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 999999; display: none; flex-direction: column; align-items: center; cursor: zoom-out; user-select: none; -webkit-user-select: none; box-sizing: border-box; padding: 56px 0 0; overflow: hidden; overscroll-behavior: contain; }
    #pp_stage { position: relative; flex: 1 1 0; min-height: 0; width: 90%; overflow: hidden; }
    #pp_lightbox img#pp_lightbox_img { position: absolute; inset: 0; margin: auto; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; pointer-events: none; }
    #pp_filmstrip { position: relative; flex-shrink: 0; display: flex; gap: 6px; padding: 10px 12px; box-sizing: border-box; max-width: 90%; overflow-x: auto; overflow-y: hidden; overscroll-behavior: contain; cursor: default; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
    #pp_filmstrip:empty { display: none; }
    .pp_film_thumb { width: 54px; height: 54px; object-fit: cover; border-radius: 4px; cursor: pointer; opacity: 0.45; border: 2px solid transparent; flex-shrink: 0; transition: opacity 0.15s, border-color 0.15s; }
    .pp_film_thumb:hover { opacity: 0.75; }
    .pp_film_thumb.pp_film_active { opacity: 1; border-color: ${DC.accent}; }

    /* Shared look for the lightbox's round-cornered buttons (arrows, grid toggle). */
    .pp_nav_btn, #pp_grid_btn { position: absolute; background: rgba(255,255,255,0.1); color: #fff; border: none; cursor: pointer; border-radius: 4px; transition: background 0.2s; box-sizing: border-box; display: flex; justify-content: center; align-items: center; padding: 0; line-height: 1; }
    .pp_nav_btn:hover, #pp_grid_btn:hover { background: rgba(255,255,255,0.25); }
    .pp_nav_btn { top: 50%; transform: translateY(-50%); font-size: 28px; z-index: 1000000; height: 60px; width: 60px; }
    #pp_nav_prev { left: 20px; } #pp_nav_next { right: 20px; }
    #pp_gallery_counter { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.8); font-family: sans-serif; font-size: 14px; background: rgba(0,0,0,0.6); padding: 6px 16px; border-radius: 20px; display: none; z-index: 1000001; }

    /* No gallery counter showing (single image, video, embed): use the full screen. */
    #pp_lightbox.pp_lb_media { padding-top: 0 !important; }

    /* Gallery grid view: thumbnails of every image; click one to open it. */
    #pp_grid { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain; display: grid; gap: clamp(6px, 0.7vw, 14px); align-content: start; padding: 4px; box-sizing: border-box; cursor: zoom-out; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.2) transparent; }
    .pp_grid_thumb { display: block; border-radius: 6px; cursor: pointer; background: #111; border: 2px solid transparent; box-sizing: border-box; transition: border-color 0.15s, filter 0.15s; }
    /* Few images: fill the stage with as-large-as-possible, uncropped thumbnails. */
    #pp_grid.pp_grid_fit { overflow: hidden; align-content: stretch; }
    #pp_grid.pp_grid_fit .pp_grid_thumb { max-width: 100%; max-height: 100%; width: auto; height: auto; min-width: 0; min-height: 0; place-self: center; object-fit: contain; }
    /* Many images: square crops that scroll. */
    #pp_grid.pp_grid_scroll .pp_grid_thumb { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .pp_grid_thumb:hover { border-color: rgba(255,255,255,0.5); filter: brightness(1.1); }
    .pp_grid_thumb.pp_grid_active { border-color: ${DC.accent}; }
    #pp_grid_btn { top: 10px; right: 20px; width: 40px; height: 40px; display: none; font-size: 20px; z-index: 1000001; }

    .pp_decoder_box { margin: 8px 0; padding: 6px; background: ${DC.bg}; border: 1px solid ${DC.border}; border-radius: 6px; font-family: sans-serif; display: flex; align-items: center; gap: 10px; color: ${DC.text}; }
    .pp_decoder_label { font-size: 10px; font-weight: 900; color: ${DC.accent}; text-transform: uppercase; letter-spacing: 1px; }
    .pp_decoder_result { background: ${DC.darkInput}; padding: 5px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; flex-grow: 1; border: 1px solid #222; color: #eee; overflow-x: auto; white-space: nowrap; }
    .pp_decoder_btn { display: inline-flex; align-items: center; justify-content: center; border: none; padding: 0 12px; height: 26px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 700; transition: filter 0.1s; line-height: 1; }


    .pp_panel { display: none; flex-direction: column; position: fixed; z-index: 99998; width: 320px; top: 80px; left: 50%; transform: translateX(-50%); background: #0d0d0e; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
    .pp_panel_head { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 8px; }
    .pp_panel_title { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
    .pp_panel_head_actions { display: flex; gap: 12px; align-items: center; }
    .pp_panel_show_btn { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.35); background: transparent !important; border: none !important; height: 24px; padding: 0; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; line-height: 1; box-sizing: border-box; transition: color 0.15s ease; letter-spacing: 0.04em; }
    .pp_panel_show_btn.pp_show_active { color: ${DC.accent}; }
    .pp_panel_show_btn:hover:not(.pp_show_active) { color: rgba(255,255,255,0.6); }
    .pp_panel_close_btn { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; background: transparent !important; border: none !important; color: rgba(255,255,255,0.4); cursor: pointer; font-size: 14px; line-height: 1; padding: 0; transition: color 0.15s ease; }
    .pp_panel_close_btn:hover { color: ${DC.accent}; }
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
    .pp_kw_row:hover .pp_kw_del { opacity: 1; } .pp_kw_del:hover { color: ${DC.accent}; }
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
    .pp_add_btn { flex-shrink: 0; padding: 0; height: 32px; background: transparent !important; border: none !important; font-size: 12px; font-weight: 700; cursor: pointer; color: ${DC.accent}; box-sizing: border-box; display: inline-flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; margin: 0 !important; vertical-align: middle; transition: filter 0.15s ease; }
    .pp_add_btn:hover { filter: brightness(1.2); }
    .pp_color_pick { -webkit-appearance: none !important; appearance: none !important; flex-shrink: 0; width: 20px !important; height: 20px !important; min-width: 20px !important; max-width: 20px !important; border: 1px solid rgba(255,255,255,0.15); border-radius: 50% !important; cursor: pointer; padding: 0; background: transparent; box-sizing: border-box; display: inline-flex !important; align-items: center !important; justify-content: center !important; margin: 0 !important; vertical-align: middle; overflow: hidden; }
    .pp_color_pick::-webkit-color-swatch-wrapper { padding: 0 !important; margin: 0 !important; }
    .pp_color_pick::-webkit-color-swatch { border: none !important; border-radius: 50% !important; width: 100% !important; height: 100% !important; box-sizing: border-box; }
    .pp_input { flex: 1; min-width: 0; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #fff; font-size: 12px; font-family: ui-monospace, SFMono-Regular, monospace; padding: 0 10px; height: 32px; outline: none; box-sizing: border-box; display: inline-flex !important; align-items: center !important; margin: 0 !important; vertical-align: middle; }
    .pp_input::placeholder { color: rgba(255,255,255,0.25); font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .pp_input:focus { border-color: rgba(255,255,255,0.2); }
    .pp_scope_name_input { flex: 1; min-width: 0; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff; font-size: 12px; font-weight: 600; font-family: ui-monospace, SFMono-Regular, monospace; padding: 0 8px; height: 32px; outline: none; box-sizing: border-box; }

    #pp_sidebar_wrap { position: fixed; top: var(--shreddit-header-height, 56px); right: 0; height: calc(100% - var(--shreddit-header-height, 56px)); z-index: 9000; display: flex; align-items: center; pointer-events: none; transition: transform 0.25s ease; }
    #pp_sidebar_wrap.pp_sb_collapsed { transform: translateX(calc(100% - 22px)); }
    #pp_sidebar_tab { pointer-events: all; flex-shrink: 0; width: 22px; height: 56px; background: #000; border-radius: 6px 0 0 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #eeefef; font-size: 13px; user-select: none; transition: background 0.15s; box-shadow: -2px 0 6px rgba(0,0,0,0.5); }
    #pp_sidebar_tab:hover { background: #1a1a1b; }
    #pp_sidebar_inner { pointer-events: all; width: 312px; height: 100%; overflow-y: auto; background: var(--color-neutral-background, #1a1a1b); box-shadow: -4px 0 16px rgba(0,0,0,0.4); }
    #pp_sidebar_inner .pp_sb_section { border-top: 1px solid rgba(255,255,255,0.08); margin-top: 14px; padding-top: 12px; }
    #pp_sidebar_inner .pp_sb_heading { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 8px; }
    #pp_sidebar_inner .pp_sb_md { font-size: 12px; line-height: 1.45; color: rgba(255,255,255,0.85); word-break: break-word; }
    #pp_sidebar_inner .pp_sb_md > :first-child { margin-top: 0; }
    #pp_sidebar_inner .pp_sb_md p, #pp_sidebar_inner .pp_sb_md ul, #pp_sidebar_inner .pp_sb_md ol, #pp_sidebar_inner .pp_sb_md blockquote { margin: 0 0 8px; }
    #pp_sidebar_inner .pp_sb_md ul, #pp_sidebar_inner .pp_sb_md ol { padding-left: 18px; }
    #pp_sidebar_inner .pp_sb_md h1, #pp_sidebar_inner .pp_sb_md h2, #pp_sidebar_inner .pp_sb_md h3, #pp_sidebar_inner .pp_sb_md h4 { font-size: 13px; margin: 10px 0 6px; color: #fff; }
    #pp_sidebar_inner .pp_sb_md a, #pp_sidebar_inner .pp_sb_mods a { color: #4fbcff; text-decoration: none; }
    #pp_sidebar_inner .pp_sb_md img { max-width: 100%; height: auto; }
    #pp_sidebar_inner .pp_sb_md table { border-collapse: collapse; width: 100%; font-size: 11px; }
    #pp_sidebar_inner .pp_sb_md th, #pp_sidebar_inner .pp_sb_md td { border: 1px solid rgba(255,255,255,0.12); padding: 3px 5px; }
    #pp_sidebar_inner .pp_sb_rule { margin: 0 0 4px; }
    #pp_sidebar_inner .pp_sb_rule summary { cursor: pointer; font-size: 12px; color: rgba(255,255,255,0.75); padding: 4px 0; }
    #pp_sidebar_inner .pp_sb_rule .pp_sb_md { padding: 2px 0 6px 12px; }
    #pp_sidebar_inner .pp_sb_mods { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
    [grid-area="right-sidebar"], #right-sidebar-container, aside:has(shreddit-sidebar), .right-sidebar { display: none !important; }
    html[data-pp-page="user"] #right-sidebar-container { display: block !important; }

    div#pp_float_collapse { position: fixed; z-index: 99999; display: none; cursor: grab; flex-direction: column; align-items: center; justify-content: center; background: rgba(21,24,26,0.9) !important; backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.08) !important; border-radius: 8px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.5); width: 34px; padding: 4px 0; box-sizing: border-box; }
    div#pp_float_collapse:active { cursor: grabbing; }
    div#pp_float_collapse { -webkit-user-select: none; user-select: none; }
    div#pp_float_collapse.pp_dragging, div#pp_float_collapse.pp_dragging * { cursor: grabbing !important; }
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

  const COLLAPSE_GAP = 8;

  function anchorCollapseBar(side) {
    const gap = COLLAPSE_GAP;
    const s = collapseBtn.style;
    s.transition = "none";
    if (side === "right") {
      s.left = "auto";
      s.right = `${gap}px`;
    } else {
      s.right = "auto";
      s.left = `${gap}px`;
    }
  }

  function clampCollapseBar() {
    const top = parseInt(collapseBtn.style.top, 10);
    const h = collapseBtn.offsetHeight;
    if (!Number.isFinite(top) || !h) return;
    const gap = COLLAPSE_GAP;
    const maxTop = Math.max(gap, window.innerHeight - h - gap);
    collapseBtn.style.top = `${Math.min(Math.max(gap, top), maxTop)}px`;
  }

  const _savedPos = lsGet("pp_collapse_pos", null);
  const _hasSavedPos = Number.isFinite(_savedPos?.top);
  const _collapseSide =
    _savedPos?.side === "left" || _savedPos?.side === "right"
      ? _savedPos.side
      : Number(_savedPos?.right) < window.innerWidth / 2
        ? "right"
        : "left";
  collapseBtn.style.top = _hasSavedPos ? `${_savedPos.top}px` : "auto";
  collapseBtn.style.bottom = _hasSavedPos ? "auto" : "24px";
  anchorCollapseBar(_collapseSide);

  // =========================================================
  // LIGHTBOX & GALLERY (SUPPORTS IFRAMES)
  // =========================================================

  const lightbox = createElement("div", { id: "pp_lightbox" });

  // Show/hide an element inside the lightbox by selector.
  const setShown = (sel, show, display = "flex") => {
    const el = lightbox.querySelector(sel);
    if (el) el.style.display = show ? display : "none";
  };

  // Zoom for the image/video/embed being viewed (including a single image inside
  // a gallery): hold the right mouse button and scroll the wheel. Applied as a
  // transform on #pp_zoom (inside the stage), so the click-catching overlay above
  // iframes/videos never moves or scales.
  const ZOOM_MAX = 8;
  let _zoom = freshZoom();
  let _panned = false;

  function applyZoom() {
    const el = lightbox.querySelector("#pp_zoom");
    if (el)
      el.style.transform =
        _zoom.s === 1
          ? ""
          : `translate(${_zoom.x}px, ${_zoom.y}px) scale(${_zoom.s})`;
    lightbox.style.cursor = _zoom.s > 1 ? "grab" : "";
  }

  function resetZoom() {
    _zoom = freshZoom();
    applyZoom();
  }

  // Keep the zoomed media covering the stage (no empty edges).
  function clampZoom(stage) {
    if (_zoom.s <= 1) {
      _zoom = freshZoom();
      return;
    }
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    _zoom.x = Math.min(0, Math.max(W - W * _zoom.s, _zoom.x));
    _zoom.y = Math.min(0, Math.max(H - H * _zoom.s, _zoom.y));
  }

  // Zoom around the cursor so the point under it stays put.
  function zoomAt(e) {
    const stage = lightbox.querySelector("#pp_stage");
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const lx = e.clientX - r.left;
    const ly = e.clientY - r.top;
    const dy = wheelDelta(e);
    const s0 = _zoom.s;
    const s1 = Math.min(ZOOM_MAX, Math.max(1, s0 * Math.exp(-dy * 0.002)));
    if (s1 === s0) return;
    _zoom.x = lx - (lx - _zoom.x) * (s1 / s0);
    _zoom.y = ly - (ly - _zoom.y) * (s1 / s0);
    _zoom.s = s1;
    clampZoom(stage);
    applyZoom();
  }

  // Non-passive wheel listeners on window force scrolling to wait on the main
  // thread, so this is attached only while the lightbox is open.
  // Plain wheel: scrolls the grid, or pages through a gallery. With the right
  // mouse button held (e.buttons bit 2) it zooms the current media instead.
  function onLightboxWheel(e) {
    stopEvent(e);
    // Grid view: the wheel scrolls the thumbnails.
    if (gallery.grid) {
      const grid = lightbox.querySelector("#pp_grid");
      if (grid) grid.scrollTop += wheelDelta(e);
      return;
    }
    if (e.buttons & 2) {
      zoomAt(e);
      return;
    }
    if (gallery.images.length <= 1) return;
    const now = Date.now();
    if (now - lastWheelTime > 150) {
      lastWheelTime = now;
      navigateGallery(e.deltaY > 0 ? 1 : -1);
    }
  }
  const WHEEL_OPTS = { passive: false, capture: true };

  const closeLightbox = () => {
    window.removeEventListener("wheel", onLightboxWheel, WHEEL_OPTS);
    resetZoom();
    lightbox.style.display = "none";
    clearLightboxHash();
  };

  function attachLightbox() {
    if (document.documentElement.contains(lightbox)) return;
    document.documentElement.appendChild(lightbox);

    // Lightbox HTML without the redundant close button
    lightbox.innerHTML = `
      <div id="pp_nav_prev" class="pp_nav_btn" title="Previous [A]">&#10094;</div>
      <div id="pp_stage"></div>
      <div id="pp_nav_next" class="pp_nav_btn" title="Next [D]">&#10095;</div>
      <div id="pp_gallery_counter">1 / 1</div>
      <div id="pp_grid_btn" title="Grid view [G]">&#9638;</div>
      <div id="pp_filmstrip"></div>
    `;

    // Right-click + wheel is the zoom gesture; don't pop the browser menu on release.
    lightbox.addEventListener("contextmenu", (e) => e.preventDefault());

    lightbox.querySelector("#pp_grid_btn").onclick = withStop(toggleGrid);
    lightbox.querySelector("#pp_nav_prev").onclick = withStop(() =>
      navigateGallery(-1),
    );
    lightbox.querySelector("#pp_nav_next").onclick = withStop(() =>
      navigateGallery(1),
    );
    lightbox.onclick = (e) => {
      // A drag-pan ends in a click; it shouldn't close or reset anything.
      if (_panned) {
        _panned = false;
        return;
      }
      // While zoomed in, a plain click resets zoom instead of closing.
      if (_zoom.s > 1) {
        resetZoom();
        return;
      }
      // Backdrop, the grid's empty space, or the media itself (image, video or
      // embed overlay) all dismiss, so a click at 1x closes whatever you click.
      const t = e.target;
      if (
        t === lightbox ||
        t.id === "pp_stage" ||
        t.id === "pp_grid" ||
        t.closest?.("#pp_zoom, #pp_overlay")
      )
        closeLightbox();
    };

    // Re-fit the thumbnail grid when the window is resized.
    window.addEventListener(
      "resize",
      rafThrottle(() => {
        if (!gallery.grid || lightbox.style.display !== "flex") return;
        const grid = lightbox.querySelector("#pp_grid");
        if (grid) layoutGrid(grid);
      }),
    );

    // Drag to pan while zoomed in.
    const stage = lightbox.querySelector("#pp_stage");
    let pan = null;
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      _panned = false;
      if (_zoom.s <= 1) return;
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, zx: _zoom.x, zy: _zoom.y };
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {}
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pan || e.pointerId !== pan.id) return;
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (!_panned && Math.hypot(dx, dy) < 4) return;
      _panned = true;
      _zoom.x = pan.zx + dx;
      _zoom.y = pan.zy + dy;
      clampZoom(stage);
      applyZoom();
    });
    const endPan = (e) => {
      if (pan && e.pointerId === pan.id) pan = null;
    };
    stage.addEventListener("pointerup", endPan);
    stage.addEventListener("pointercancel", endPan);
  }

  // `grid` opens a multi-image gallery as a thumbnail grid instead of image 1.
  function openLightbox(images, startIndex, startTime = 0, grid = false) {
    attachLightbox();
    gallery = { images, index: startIndex, startTime, grid: grid && images.length > 1 };
    lightbox.style.display = "flex";
    window.addEventListener("wheel", onLightboxWheel, WHEEL_OPTS);
    updateLightboxImage();
    clearLightboxHash();
  }

  function toggleGrid() {
    if (gallery.images.length <= 1) return;
    gallery.grid = !gallery.grid;
    updateLightboxImage();
  }

  // Show image i in the normal (single-image) view.
  function showImage(i) {
    gallery.index = i;
    gallery.grid = false;
    updateLightboxImage();
  }

  // Click handler for a grid or filmstrip thumbnail.
  const onThumbClick = (i) => (e) => {
    e.stopPropagation();
    showImage(i);
  };

  // Sizes the grid to the stage. If every thumbnail can be at least GRID_MIN_FIT
  // px without scrolling, pick the columns/rows that make them largest (2 images
  // on a wide screen become left/right halves). Otherwise use scrolling squares
  // whose size follows the viewport width.
  const GRID_MIN_FIT = 140;
  function layoutGrid(grid) {
    const n = grid.children.length;
    // Gap and padding come from the stylesheet so there's one source of truth.
    const cs = getComputedStyle(grid);
    const gap = parseFloat(cs.columnGap) || 0;
    const W =
      grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H =
      grid.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let best = { size: 0, cols: 1, rows: n };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const size = Math.min(
        (W - gap * (cols - 1)) / cols,
        (H - gap * (rows - 1)) / rows,
      );
      if (size > best.size) best = { size, cols, rows };
    }
    const fit = best.size >= GRID_MIN_FIT;
    grid.classList.toggle("pp_grid_fit", fit);
    grid.classList.toggle("pp_grid_scroll", !fit);
    if (fit) {
      grid.style.gridTemplateColumns = `repeat(${best.cols}, minmax(0, 1fr))`;
      grid.style.gridTemplateRows = `repeat(${best.rows}, minmax(0, 1fr))`;
    } else {
      const target = Math.min(360, Math.max(160, window.innerWidth * 0.16));
      const cols = Math.max(1, Math.floor((W + gap) / (target + gap)));
      grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      grid.style.gridTemplateRows = "";
    }
  }

  // Thumbnail grid of every image in the gallery. Clicking one opens it in the
  // normal view (counter and filmstrip follow gallery.index).
  function renderGridView() {
    const stage = lightbox.querySelector("#pp_stage");
    const grid = createElement("div", { id: "pp_grid" });
    gallery.images.forEach((src, i) => {
      const className =
        "pp_grid_thumb" + (i === gallery.index ? " pp_grid_active" : "");
      const thumb = makeThumb(src, className, gallery.images.length > 24);
      thumb.addEventListener("click", onThumbClick(i));
      grid.appendChild(thumb);
    });
    stage.innerHTML = "";
    stage.appendChild(grid);
    layoutGrid(grid);
    resetZoom();

    // Keep the counter strip, hide the single-image controls.
    lightbox.classList.remove("pp_lb_media");
    setShown("#pp_gallery_counter", true, "block");
    lightbox.querySelector("#pp_gallery_counter").textContent =
      `${gallery.images.length} images`;
    for (const sel of ["#pp_nav_prev", "#pp_nav_next", "#pp_filmstrip", "#pp_grid_btn"])
      setShown(sel, false);

    // Center the current image's thumbnail.
    const current = grid.children[gallery.index];
    if (current)
      grid.scrollTop =
        current.offsetTop - (grid.clientHeight - current.offsetHeight) / 2;
  }

  function updateLightboxImage() {
    if (!gallery.images.length) return;
    if (gallery.grid && gallery.images.length > 1) {
      renderGridView();
      return;
    }
    const stage = lightbox.querySelector("#pp_stage");
    const filmstrip = lightbox.querySelector("#pp_filmstrip");

    const currentUrl = decodeAmp(gallery.images[gallery.index]);
    const isIframe = currentUrl.includes("redgifs.com") || currentUrl.includes("iframe");

    const isVideoFile = isVideoUrl(currentUrl);
    const safeUrl = escapeHtml(currentUrl);

    // Render stage content: Iframe, Video file, or Image.
    let media;
    let overlay = "";
    const overlayHtml = `<div id="pp_overlay" style="position:absolute; top:0; left:0; right:48px; bottom:48px; z-index:10; background:transparent;"></div>`;
    if (isIframe) {
      media = `<iframe src="${safeUrl}" frameborder="0" scrolling="no" width="100%" height="100%" allowfullscreen style="${FILL} width:100%; height:100%;"></iframe>`;
      overlay = overlayHtml;
    } else if (isVideoFile) {
      media = `<video src="${safeUrl}" autoplay loop muted playsinline style="${FILL} width:100%; height:100%; object-fit:contain;"></video>`;
      overlay = overlayHtml;
    } else {
      media = `<img id="pp_lightbox_img" src="${safeUrl}" alt="Enlarged View" style="${FILL} max-width:100%; max-height:100%; object-fit:contain; pointer-events:none;">`;
    }
    stage.innerHTML = `<div id="pp_zoom" style="${FILL} transform-origin:0 0;">${media}</div>${overlay}`;
    resetZoom();

    // Resume from the inline player's position (consumed once).
    if (isVideoFile && gallery.startTime > 0) {
      const video = stage.querySelector("video");
      const t = gallery.startTime;
      video.addEventListener(
        "loadedmetadata",
        () => {
          video.currentTime = Number.isFinite(video.duration)
            ? Math.min(t, Math.max(video.duration - 0.25, 0))
            : t;
        },
        { once: true },
      );
    }
    gallery.startTime = 0;

    const multi = gallery.images.length > 1 && !isIframe && !isVideoFile;
    // The top strip only exists for the gallery counter; skip it whenever no counter shows.
    lightbox.classList.toggle("pp_lb_media", !multi);

    // Grid button shows for any multi-image gallery; the rest only for images.
    setShown("#pp_grid_btn", gallery.images.length > 1);
    setShown("#pp_nav_prev", multi);
    setShown("#pp_nav_next", multi);
    setShown("#pp_gallery_counter", multi, "block");
    if (multi)
      lightbox.querySelector("#pp_gallery_counter").textContent =
        `${gallery.index + 1} / ${gallery.images.length}`;

    if (filmstrip) {
      if (isIframe || isVideoFile || gallery.images.length <= 1) {
        filmstrip.style.display = "none";
        filmstrip.innerHTML = "";
        filmstrip.dataset.galleryKey = "";
      } else {
        filmstrip.style.display = "flex";
        const galleryKey = gallery.images[0] ?? "";
        let rebuilt = false;
        if (filmstrip.dataset.galleryKey !== galleryKey) {
          rebuilt = true;
          filmstrip.dataset.galleryKey = galleryKey;
          filmstrip.innerHTML = "";
          gallery.images.forEach((src, i) => {
            const thumb = makeThumb(src, "pp_film_thumb", true);
            thumb.addEventListener("click", onThumbClick(i));
            filmstrip.appendChild(thumb);
          });
        }
        Array.from(filmstrip.children).forEach((t, i) =>
          t.classList.toggle("pp_film_active", i === gallery.index),
        );
        const active = filmstrip.children[gallery.index];
        if (active) {
          const left =
            active.offsetLeft - (filmstrip.clientWidth - active.offsetWidth) / 2;
          filmstrip.scrollTo({
            left: Math.max(0, left),
            behavior: rebuilt ? "auto" : "smooth",
          });
        }
      }
    }
  }

  function navigateGallery(dir) {
    if (!gallery.images.length || gallery.grid) return;
    showImage(
      (gallery.index + dir + gallery.images.length) % gallery.images.length,
    );
  }

  async function fetchGalleryImages(permalink) {
    try {
      const res = await fetch(`https://www.reddit.com${permalink}.json`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const post = json?.[0]?.data?.children?.[0]?.data;
      if (!post || !post.gallery_data?.items || !post.media_metadata)
        return null;
      return post.gallery_data.items
        .map((i) => {
          const entry = post.media_metadata[i.media_id];
          const src =
            entry?.s?.gif ||
            entry?.s?.mp4 ||
            entry?.s?.u ||
            entry?.p?.slice(-1)?.[0]?.u ||
            null;
          return src ? decodeAmp(src) : null;
        })
        .filter(Boolean);
    } catch (err) {
      console.warn("[RE] Gallery fetch failed:", err);
      return null;
    }
  }

  // =========================================================
  // ACCOUNT DISPLAY BADGE
  // =========================================================

  function injectAccountBadge() {
    if (document.getElementById("pp_account_badge")) return;
    const btn = document.getElementById("expand-user-drawer-button");
    if (!btn) return;
    if (_cachedUsername) return insertBadge(_cachedUsername);
    if (_badgeFetchPromise) return;
    // Logged out or failed lookups used to refetch on every pass; back off.
    if (performance.now() < _badgeRetryAt) return;
    _badgeRetryAt = performance.now() + 30000;

    _badgeFetchPromise = fetch("/api/me.json", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data?.name && d.data.name !== "undefined") {
          _cachedUsername = d.data.name;
          insertBadge(d.data.name);
          applyKeywordFilters();
        }
      })
      .catch(() => { })
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

  const _KW_CACHE_MAX = 256;
  const _kwRegexCache = new Map();

  function _buildKeywordRegex(keyword) {
    if (_kwRegexCache.has(keyword)) return _kwRegexCache.get(keyword);
    let entry;
    if (/^\/.*\/[gimsuy]*$/.test(keyword)) {
      try {
        const lastSlash = keyword.lastIndexOf("/");
        // g/y make RegExp.test() stateful (lastIndex), which would make cached
        // regexes alternate between match and miss; matching never needs them.
        const rawFlags = keyword.slice(lastSlash + 1);
        entry = {
          re: new RegExp(
            keyword.slice(1, lastSlash),
            rawFlags ? rawFlags.replace(/[gy]/g, "") : "i",
          ),
          caseFold: false,
        };
      } catch {
        entry = { re: null, caseFold: false };
      }
    } else {
      const escaped = keyword
        .toLowerCase()
        .replace(/[.+^^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      entry = { re: new RegExp(escaped), caseFold: true };
    }
    if (_kwRegexCache.size >= _KW_CACHE_MAX)
      _kwRegexCache.delete(_kwRegexCache.keys().next().value);
    _kwRegexCache.set(keyword, entry);
    return entry;
  }

  function keywordMatchesTitle(keyword, title, lowerTitle) {
    const { re, caseFold } = _buildKeywordRegex(keyword);
    if (!re) return false;
    return re.test(caseFold ? lowerTitle : title);
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

  function _getEntriesForPost(post, isAggregate, allData, pageData, scopeKeys, subCache) {
    if (!isAggregate) return pageData;
    const sub = getPostSubreddit(post);
    let entries = subCache.get(sub);
    if (!entries) {
      entries = getScopesForSub(sub, scopeKeys).flatMap((s) => allData[s] || []);
      subCache.set(sub, entries);
    }
    return entries;
  }

  // Per-mode version + per-post "evaluated at version" map. Forced calls bump the
  // version (re-evaluating everything); onlyNew calls skip already-evaluated posts.
  const _kwVer = [0, 0];
  const _kwSeen = [new WeakMap(), new WeakMap()];

  function applyKeywordRules(isFilter, onlyNew = false) {
    const i = isFilter ? 0 : 1;
    if (!onlyNew) _kwVer[i]++;
    const seen = _kwSeen[i];
    const ver = _kwVer[i];
    const posts = [...document.querySelectorAll("shreddit-post")].filter(
      (post) => seen.get(post) !== ver,
    );
    if (!posts.length) return;

    const ctx = getPageContext();
    const isAggregate = ctx.type !== "subreddit";
    const allData = getStorage(storageKeyFor(isFilter));
    const pageData = isAggregate
      ? null
      : getScopesForSub(ctx.sub, Object.keys(allData)).flatMap(
        (s) => allData[s] || [],
      );

    const scopeKeys = Object.keys(allData);
    const subCache = new Map();

    for (const post of posts) {
      seen.set(post, ver);
      const title = getPostTitle(post);
      const lowerTitle = title.toLowerCase();
      const entries = _getEntriesForPost(
        post,
        isAggregate,
        allData,
        pageData,
        scopeKeys,
        subCache,
      );

      if (isFilter) {
        const matched =
          !isOwnPost(post) &&
          entries.length > 0 &&
          entries.some((kw) => keywordMatchesTitle(kw, title, lowerTitle));
        if (matched) {
          post.setAttribute("pp-kw-filtered", "true");
          applyFilteredPostStyle(post);
        } else if (post.hasAttribute("pp-kw-filtered")) {
          post.removeAttribute("pp-kw-filtered");
          post.style.display = "";
          post.style.opacity = "";
        }
      } else {
        const match = entries.find((h) =>
          h.keywords.some((kw) => keywordMatchesTitle(kw, title, lowerTitle)),
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
    }
  }

  const applyKeywordFilters = () => applyKeywordRules(true);
  const applyKeywordHighlights = () => applyKeywordRules(false);
  const applyAllKeywordRules = (onlyNew = false) => {
    applyKeywordRules(true, onlyNew);
    applyKeywordRules(false, onlyNew);
  };

  const applyFilteredPostStyle = (post) => {
    post.style.display = _filteredVisible ? "" : "none";
    post.style.opacity = _filteredVisible ? "0.35" : "";
  };

  function toggleShowFiltered() {
    _filteredVisible = !_filteredVisible;
    lsSet(FILTER_VISIBLE_KEY, _filteredVisible);
    document
      .querySelectorAll("shreddit-post[pp-kw-filtered]")
      .forEach(applyFilteredPostStyle);
    document
      .querySelectorAll(".pp_panel_show_btn")
      .forEach((btn) =>
        btn.classList.toggle("pp_show_active", !_filteredVisible),
      );
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
    const id = panelIdFor(mode);
    if (document.getElementById(id)) return;

    const accent = accentFor(mode);
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
        <button id="${id}_tab_global" class="pp_tab" data-tab="global">Global</button>
        <button id="${id}_tab_sub" class="pp_tab" data-tab="sub">${sub ? `r/${sub}` : "Subreddit"}</button>
        <button id="${id}_tab_all" class="pp_tab" data-tab="all">All</button>
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

    const $ = (suffix) => panel.querySelector(`#${id}${suffix}`);

    if (isFilter) {
      const showToggle = $("_show_toggle");
      showToggle.classList.toggle("pp_show_active", !_filteredVisible);
      showToggle.addEventListener("click", toggleShowFiltered);
    }
    $("_close").addEventListener("click", () => {
      panel.style.display = "none";
    });

    let activeScope = defaultScope;
    const subTab = $("_tab_sub");
    const subEdit = $("_sub_edit");

    function setTab(tab) {
      panel.querySelectorAll(".pp_tab").forEach((btn) => {
        const active = btn.dataset.tab === tab;
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
        : renderKwList(mode, activeScope, id);
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
      const normalized = normalizeScope($("_sub_input").value);
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
      renderKwList(mode, activeScope, id);
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

  function makeEditableRow(mode, scope, entry, index, onDone) {
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

  function buildListRow(mode, scope, entry, index, onReRender) {
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
        makeEditableRow(mode, scope, entry, index, onReRender),
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

  function renderKwList(mode, scope, panelId) {
    const list = document.getElementById(`${panelId}_list`);
    if (!list) return;
    const entries = getScopeEntries(mode, scope);
    list.innerHTML = "";

    if (!entries.length)
      return list.appendChild(makeEmptyState("Nothing here yet"));
    entries.forEach((entry, i) => {
      list.appendChild(
        buildListRow(mode, scope, entry, i, () =>
          renderKwList(mode, scope, panelId),
        ),
      );
    });
  }

  function makeScopeNameEditor(oldScope, headerEl, mode, onDone) {
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
      `color:${accentFor(mode)};${btnStyle}`,
    );
    const cancelBtn = makeBtn("pp_edit_cancel", "✕", null, btnStyle);

    editorRow.append(input, saveBtn, cancelBtn);

    const save = () => {
      const newScope =
        input.value.trim() === "global" ? "global" : normalizeScope(input.value);
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
            buildListRow(mode, scope, entry, i, renderBodyEntries),
          ),
        );
        countBadge.textContent = currentEntries.length;
      };

      let open = false;
      scopeLabel.addEventListener("click", (e) => {
        e.stopPropagation();
        makeScopeNameEditor(scope, header, mode, () =>
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
    const id = panelIdFor(mode);
    const existing = document.getElementById(id);
    if (existing && !existing.isConnected) existing.remove();
    buildKwPanel(mode);
    const panel = document.getElementById(id);
    if (panel)
      panel.style.display = panel.style.display === "flex" ? "none" : "flex";
  }

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

    collapseState = (collapseState + 1) % 2;
    const offset = getHeaderOffset();
    const topThreads = getTopLevelComments();
    const anchor =
      topThreads.find((el) => el.getBoundingClientRect().top > offset - 10) ??
      topThreads[topThreads.length - 1];

    const shouldCollapse = collapseState === 1;
    allComments.forEach((c) => {
      if (getCommentDepth(c) === 0) return;
      c.handleCollapse?.(shouldCollapse);
    });

    const mainBtnLabel = collapseBtn.querySelector("#pp_collapse_text");
    if (mainBtnLabel) mainBtnLabel.textContent = shouldCollapse ? "EXP" : "COL";
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
    const container = document.querySelector(
      "#comment-tree-container, shreddit-comment-tree",
    );
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
    clampCollapseBar();
    const pageCtx = getPageContext();
    if (pageCtx.type === "user") {
      document.documentElement.setAttribute("data-pp-page", "user");
    } else {
      document.documentElement.removeAttribute("data-pp-page");
    }
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
        res += NATO_ALPHABET[token];
        count++;
      }
    }
    return count >= 3 ? res : null;
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
    const SEARCH_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" style="display:block"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
    const COPY_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" style="display:block"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
    const copyBtn = createElement("button", {
      className: "pp_decoder_btn",
      title: "Copy",
      style: `background:${DC.border};color:${DC.text}`,
    });
    copyBtn.innerHTML = COPY_ICON;
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(translatedText).then(() => {
        copyBtn.innerHTML = `<span style="font-size:14px">✓</span>`;
        copyBtn.style.background = DC.success;
        setTimeout(() => {
          copyBtn.innerHTML = COPY_ICON;
          copyBtn.style.background = DC.border;
        }, 1000);
      });
    };

    // Only the handle is worth searching: drop a link's host/path
    // (https://link.me/name) or a leading label ("TikTok and IG: name").
    const searchTerm =
      translatedText
        .replace(/^.*\//, "")
        .replace(/^.*:\s+/, "")
        .trim() || translatedText;

    // Two-stage SimpCity search: 1st click = title-only, later clicks = whole site.
    // Stage lives in this closure, so it resets whenever the box is rebuilt
    // (page reload / navigation).
    let scStage = 0;
    // ◎ bullseye = title search (stage 0), ◉ fisheye = whole site (stage 1).
    const scBtn = createElement("button", {
      className: "pp_decoder_btn",
      textContent: "◎",
      style: `background:#1E88DB;color:white;font-size:15px`,
    });
    scBtn.onclick = () => {
      window.open(buildSimpCityUrl(searchTerm, scStage === 0), "_blank");
      if (scStage === 0) {
        scStage = 1;
        scBtn.textContent = "◉";
      }
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
      scBtn,
      createElement("button", {
        className: "pp_decoder_btn",
        innerHTML: SEARCH_ICON,
        style: `background:${DC.accent};color:white`,
        onclick: () => window.open(buildSocialURL(searchTerm), "_blank"),
      }),
    );
    return container;
  }

  function processTextNode(node, seenDecoded) {
    const text = node.textContent;
    if (!/[a-zA-Z]/.test(text)) return;
    const decoded = natoToText(text);
    if (!decoded?.trim().length) return;
    const dedupeKey = `nato:${decoded}`;
    if (seenDecoded.has(dedupeKey)) return;
    seenDecoded.add(dedupeKey);
    const target = node.parentNode.tagName === "P" ? node.parentNode : node;
    target.parentNode.insertBefore(
      createTranslationComponent("nato", decoded),
      target.nextSibling,
    );
  }

  function scanParagraph(p) {
    if (p.hasAttribute("data-decoded")) return;
    p.setAttribute("data-decoded", "true");
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    const seenDecoded = new Set();
    nodes.forEach((node) => processTextNode(node, seenDecoded));

    // Binary is matched over the whole paragraph so a message wrapped across
    // lines (newlines or <br>, i.e. separate text nodes) decodes as one piece.
    const joined = nodes.map((t) => t.textContent).join("\n");
    let anchor = p;
    for (const match of joined.match(BINARY_RE) ?? []) {
      const decoded = binaryToText(match);
      if (!decoded?.trim().length) continue;
      const dedupeKey = `binary:${decoded}`;
      if (seenDecoded.has(dedupeKey)) continue;
      seenDecoded.add(dedupeKey);
      const box = createTranslationComponent("binary", decoded);
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      anchor = box;
    }
  }

  // =========================================================
  // ACTIONS PIPELINE
  // =========================================================

  // =========================================================
  // AUTOMODERATOR AUTO-COLLAPSE
  // =========================================================

  const isAutoMod = (c) =>
    (c.getAttribute("author") || "").toLowerCase() === "automoderator";

  // Fallback: hide the comment behind our own click-to-expand bar. Doesn't
  // depend on any Reddit internals.
  function stubAutoMod(comment) {
    if (comment.hasAttribute("pp-am-stub") || !comment.parentNode) return;
    comment.setAttribute("pp-am-stub", "true");
    const label = (open) =>
      open ? "▾ AutoModerator — click to collapse" : "▸ AutoModerator — click to expand";
    const bar = createElement("div", {
      className: "pp_am_stub",
      textContent: label(false),
      onclick: () => {
        bar.textContent = label(comment.toggleAttribute("pp-am-open"));
      },
    });
    if (comment.slot) bar.slot = comment.slot;
    comment.parentNode.insertBefore(bar, comment);
  }

  // Try Reddit's native collapse first; if the comment doesn't actually get
  // shorter, fall back to the stub.
  function collapseAutoMod(comment) {
    comment.setAttribute("pp-am-collapsed", "true");
    const before = comment.offsetHeight;
    let tried = false;
    if (typeof comment.handleCollapse === "function") {
      try {
        comment.handleCollapse(true);
        tried = true;
      } catch {}
    }
    setTimeout(() => {
      if (!comment.isConnected) return;
      if (tried && before > 0 && comment.offsetHeight < before - 20) return;
      stubAutoMod(comment);
    }, 800);
  }

  // =========================================================
  // SWEEP: nuke selectors, award buttons, ban banner
  // =========================================================
  // Light DOM is already hidden by the global stylesheet; this removes matches
  // in the document and inside registered shadow roots using one native query
  // per root (no JS element iteration).

  const SWEEP_SEL = `${NUKE_SELECTORS.join(", ")}, ${AWARD_SEL}, ${BANNER_SEL}`;
  const BAN_RE = /account has been (permanently )?(banned|suspended)/i;

  function sweepRoot(root) {
    for (const el of root.querySelectorAll(SWEEP_SEL)) {
      if (!el.isConnected) continue;
      if (el.matches(BANNER_SEL)) {
        const host = el.getRootNode()?.host;
        if (!BAN_RE.test(`${el.textContent} ${host?.textContent ?? ""}`)) continue;
        const target = host ?? el;
        if (target.hasAttribute("pp-ban-hidden")) continue;
        target.style.setProperty("display", "none", "important");
        target.setAttribute("pp-ban-hidden", "true");
      } else if (el.matches(AWARD_SEL)) {
        if (el.hasAttribute("pp-award-hidden")) continue;
        el.style.display = "none";
        el.setAttribute("pp-award-hidden", "true");
      } else {
        el.remove();
      }
    }
  }

  // Full sweeps (every registered root) are frequent right after load/navigation,
  // when hydration renders banners and rails, and rare once the page has settled.
  // New roots are always swept immediately regardless.
  const FULL_SWEEP_GAP_HOT = 750;
  const FULL_SWEEP_GAP_IDLE = 4000;
  const HOT_WINDOW = 8000;
  let _hotUntil = performance.now() + HOT_WINDOW;
  let _lastFullSweep = -Infinity;
  let _trailingSweep = 0;
  function sweep() {
    const fresh = _freshRoots;
    _freshRoots = [];
    const now = performance.now();
    const gap = now < _hotUntil ? FULL_SWEEP_GAP_HOT : FULL_SWEEP_GAP_IDLE;
    if (now - _lastFullSweep < gap) {
      // Cheap path: only roots registered since the last sweep, plus one trailing
      // run so late content in existing roots is still caught on an idle page.
      // The document-wide query is part of the full path only: the stylesheet
      // already hides light-DOM matches, so it doesn't need to run every pass.
      for (const root of fresh) if (root.host?.isConnected) sweepRoot(root);
      if (!_trailingSweep)
        _trailingSweep = setTimeout(() => {
          _trailingSweep = 0;
          queueRun();
        }, gap - (now - _lastFullSweep) + 20);
      return;
    }
    // Full path: catches content rendered into existing roots.
    _lastFullSweep = now;
    sweepRoot(document);
    const live = [];
    for (const ref of _rootRefs) {
      const root = ref.deref();
      if (!root) continue;
      live.push(ref);
      if (root.host?.isConnected) sweepRoot(root);
    }
    _rootRefs = live;
  }

  // Click-catching overlay over an inline player/embed that opens the lightbox.
  function addMediaBlocker(mediaEl, style, onOpen) {
    const container =
      mediaEl.closest('[slot="post-media-container"]') || mediaEl.parentElement;
    if (!container || container.querySelector(".pp-embed-blocker")) return;
    container.style.position = "relative";
    container.style.cursor = "zoom-in";
    const blocker = createElement("div", {
      className: "pp-embed-blocker",
      style: `position: absolute; ${style} z-index: 10; cursor: zoom-in; background: transparent;`,
    });
    blocker.addEventListener(
      "click",
      (e) => {
        swallowEvent(e);
        onOpen(container);
      },
      true,
    );
    container.appendChild(blocker);
  }

  const escapeHtml = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

  // Reddit's *_html fields arrive entity-escaped; decode, then strip anything
  // executable before it goes into innerHTML.
  function cleanRedditHtml(escaped) {
    if (!escaped) return "";
    const ta = document.createElement("textarea");
    ta.innerHTML = escaped;
    const doc = new DOMParser().parseFromString(ta.value, "text/html");
    doc
      .querySelectorAll("script, style, iframe, object, embed, link, meta, form")
      .forEach((n) => n.remove());
    doc.body.querySelectorAll("*").forEach((el) => {
      for (const a of [...el.attributes]) {
        if (
          /^on/i.test(a.name) ||
          (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))
        )
          el.removeAttribute(a.name);
      }
      if (el.tagName === "A") {
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      }
    });
    return doc.body.innerHTML;
  }

  // Makes an image open the lightbox on click. Capture phase, so it runs before
  // Reddit's own handlers.
  const bindViewable = (imgEl, onClick) => {
    imgEl.classList.add("pp_imageViewable");
    imgEl.addEventListener("click", onClick, true);
  };

  const Actions = {
    handleImages(post) {
      if (post.hasAttribute("pp-images-handled")) return;

      // --- 1. HANDLE REDGIFS / EMBEDS ---
      const embedEl = post.querySelector('shreddit-embed[providername="RedGIFs"], iframe[src*="redgifs.com"]');
      if (embedEl) {
        post.setAttribute("pp-images-handled", "true");
        let src = embedEl.getAttribute("src") || "";
        if (!src && embedEl.hasAttribute("html")) {
          const match = embedEl.getAttribute("html").match(/src="([^"]+)"/);
          if (match) src = match[1];
        }

        if (src)
          addMediaBlocker(
            embedEl,
            "top: 0; left: 0; right: 48px; bottom: 48px;",
            () => openLightbox([src], 0),
          );
        return;
      }

      // --- 2. HANDLE SHREDDIT PLAYERS (NATIVE VIDEOS / GIFS) ---
      const shredditPlayer = post.querySelector("shreddit-player, shreddit-player-2");
      if (shredditPlayer) {
        post.setAttribute("pp-images-handled", "true");
        const src = pickVideoSrc(shredditPlayer);

        if (src)
          addMediaBlocker(shredditPlayer, "inset: 0;", (container) => {
            const inline = findVideo(container) ?? videoNear(container);
            openLightbox(
              [pickVideoSrc(shredditPlayer) || src],
              0,
              inline?.currentTime ?? 0,
            );
          });
        return;
      }

      // --- 3. HANDLE GALLERIES ---
      const isGallery = post.hasAttribute("gallery");
      const permalink = post.getAttribute("permalink");
      if (isGallery && permalink) {
        post.setAttribute("pp-images-handled", "true");
        // Fetched on first click (not for every gallery in the feed); a failed
        // fetch is dropped so the next click retries.
        let galleryPromise = null;
        const loadUrls = async () => {
          galleryPromise ??= fetchGalleryImages(permalink);
          const result = await galleryPromise;
          if (!result) galleryPromise = null;
          return result;
        };

        post.querySelectorAll("faceplate-img, img").forEach((imgEl) => {
          bindViewable(imgEl, async (e) => {
            swallowEvent(e);
            killNativeLightbox();

            const urls = await loadUrls();
            if (!urls?.length) return;

            const clickedSrc = decodeAmp(getImgSrc(imgEl) || "");
            const idx = urls.findIndex((u) =>
              clickedSrc.includes(
                u.match(/\/([A-Za-z0-9]+)\.(jpg|png|gif|webp)/)?.[1],
              ),
            );
            openLightbox(urls, idx !== -1 ? idx : 0, 0, true);
          });
        });
        return;
      }

      // --- 4. HANDLE SINGLE IMAGES ---
      const images = post.querySelectorAll(
        "faceplate-img:not([pp-img-handled]), img:not(.pp_imageViewable)",
      );
      if (!images.length) return;
      images.forEach((imgEl) => {
        if (imgEl.tagName !== "IMG")
          imgEl.setAttribute("pp-img-handled", "true");
        bindViewable(imgEl, (e) => {
          const clickedSrc = getImgSrc(imgEl);
          if (!clickedSrc) return;
          swallowEvent(e);
          killNativeLightbox();
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
          openLightbox(imgs, Math.max(0, imgs.indexOf(clickedSrc)), 0, true);
        });
      });
      post.setAttribute("pp-images-handled", "true");
    },

    processComments() {
      document
        .querySelectorAll("shreddit-comment:not([pp-checked])")
        .forEach((comment) => {
          if (isAutoMod(comment) && !comment.hasAttribute("pp-am-collapsed")) {
            // Element not upgraded yet: skip, retried on the next pass.
            if (!customElements.get("shreddit-comment")) return;
            collapseAutoMod(comment);
          }
          if (comment.shadowRoot && !comment.hasAttribute("pp-shadow-styled")) {
            const color =
              THREAD_COLORS[getCommentDepth(comment) % THREAD_COLORS.length];
            comment.shadowRoot.appendChild(
              createElement("style", {
                className: "pp-line-style",
                textContent: `div[data-testid="main-thread-line"] { background-color: ${color} !important; width: 2px !important; opacity: 1 !important; } div[data-testid="branch-line"] { border-left: 2px solid ${color} !important; border-bottom: 2px solid ${color} !important; opacity: 1 !important; }`,
              }),
            );
            comment.setAttribute("pp-shadow-styled", "true");
          }
          comment.setAttribute("pp-checked", "true");
        });
    },

    async initSidebar() {
      const match = window.location.pathname.match(/^\/r\/([^/]+)/);
      if (!match || /\/search\/?(\?|$)/.test(window.location.href)) {
        document.getElementById("pp_sidebar_wrap")?.remove();
        return;
      }
      const subName = match[1];

      const existingWrap = document.getElementById("pp_sidebar_wrap");
      if (existingWrap && existingWrap.dataset.sub === subName) return;
      if (existingWrap) existingWrap.remove();

      const collapsed = lsGet("pp_sidebar_collapsed", true) !== false;
      const wrap = createElement("div", {
        id: "pp_sidebar_wrap",
        className: collapsed ? "pp_sb_collapsed" : "",
      });
      wrap.dataset.sub = subName;

      const tab = createElement("div", {
        id: "pp_sidebar_tab",
        textContent: collapsed ? "❮" : "❯",
      });
      const inner = createElement("div", {
        id: "pp_sidebar_inner",
        style: "padding: 16px; color: var(--color-neutral-content-weak, #d7dadc); font-family: sans-serif; font-size: 13px; line-height: 1.4;",
      });

      inner.innerHTML = `<div style="color:rgba(255,255,255,0.4); text-align:center; margin-top:20px;">Loading r/${escapeHtml(subName)} info…</div>`;
      wrap.append(tab, inner);
      document.body.appendChild(wrap);

      tab.addEventListener("click", () => {
        const isCollapsed = wrap.classList.toggle("pp_sb_collapsed");
        tab.textContent = isCollapsed ? "❮" : "❯";
        lsSet("pp_sidebar_collapsed", isCollapsed);
      });

      try {
        const getJson = async (path) => {
          const res = await fetch(`https://www.reddit.com/r/${subName}/${path}`, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) throw new Error();
          return res.json();
        };
        // About is required; rules and moderators are best-effort extras.
        const [aboutRes, rulesRes, modsRes] = await Promise.allSettled([
          getJson("about.json"),
          getJson("about/rules.json"),
          getJson("about/moderators.json"),
        ]);
        if (aboutRes.status !== "fulfilled") throw new Error();
        const d = aboutRes.value?.data;
        if (!d) throw new Error();

        const subs = d.subscribers ? d.subscribers.toLocaleString() : "Unknown";
        const active = d.active_user_count ? d.active_user_count.toLocaleString() : null;
        const created = d.created_utc
          ? new Date(d.created_utc * 1000).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
          : null;
        const publicDesc =
          cleanRedditHtml(d.public_description_html) ||
          escapeHtml(d.public_description || "");
        const fullDesc = cleanRedditHtml(d.description_html);
        const rules =
          rulesRes.status === "fulfilled" ? rulesRes.value?.rules || [] : [];
        const mods =
          modsRes.status === "fulfilled"
            ? modsRes.value?.data?.children || []
            : [];

        const section = (title, body) => `
          <div class="pp_sb_section">
            <div class="pp_sb_heading">${title}</div>
            ${body}
          </div>`;

        const rulesHtml = rules
          .map(
            (r, i) => `
            <details class="pp_sb_rule">
              <summary>${i + 1}. ${escapeHtml(r.short_name || "")}</summary>
              <div class="pp_sb_md">${cleanRedditHtml(r.description_html) || escapeHtml(r.description || "")}</div>
            </details>`,
          )
          .join("");
        const modsHtml = mods
          .map(
            (m) =>
              `<a href="/user/${encodeURIComponent(m.name)}/" target="_blank" rel="noopener noreferrer">u/${escapeHtml(m.name)}</a>`,
          )
          .join("");

        inner.innerHTML = `
          <div style="font-weight: 700; font-size: 15px; color: #fff; margin-bottom: 8px;">r/${escapeHtml(d.display_name)}</div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 4px;">
            👥 ${subs} members ${active ? `• 🟢 ${active} online` : ""}
          </div>
          <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 12px;">
            ${created ? `🎂 Created ${created}` : ""}${d.over18 ? " • 🔞 Adult content" : ""}
          </div>
          ${publicDesc ? `<div class="pp_sb_md">${publicDesc}</div>` : ""}
          ${fullDesc ? section("About", `<div class="pp_sb_md">${fullDesc}</div>`) : ""}
          ${rulesHtml ? section(`r/${escapeHtml(d.display_name)} Rules`, rulesHtml) : ""}
          ${modsHtml ? section("Moderators", `<div class="pp_sb_mods">${modsHtml}</div>`) : ""}
          ${!publicDesc && !fullDesc && !rulesHtml ? `<div style="color:rgba(255,255,255,0.4);">No description available.</div>` : ""}
        `;
      } catch {
        inner.innerHTML = `<div style="color:rgba(255,255,250,0.4); text-align:center; margin-top:20px;">Failed to load community info.</div>`;
      }
    },

    processDecoders() {
      if (!_onAllowedSubreddit) return;
      for (const container of document.querySelectorAll(DECODER_PENDING_SEL)) {
        container.setAttribute("pp-decoder-scanned", "true");
        container.querySelectorAll("p").forEach(scanParagraph);
      }
    },
  };

  // =========================================================
  // EVENT LISTENERS
  // =========================================================

  const DRAG_THRESHOLD = 6;
  let _collapseClickGuard = 0;
  let _collapseSettleTimer = 0;

  collapseBtn.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
    const rect = collapseBtn.getBoundingClientRect();
    drag = {
      active: true,
      moved: false,
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
  });

  collapseBtn.addEventListener("pointermove", (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <
        DRAG_THRESHOLD
      )
        return;
      drag.moved = true;
      collapseBtn.classList.add("pp_dragging");
      try {
        collapseBtn.setPointerCapture(e.pointerId);
      } catch { }
    }
    const maxLeft = Math.max(
      0,
      document.documentElement.clientWidth - collapseBtn.offsetWidth,
    );
    const maxTop = Math.max(0, window.innerHeight - collapseBtn.offsetHeight);
    const s = collapseBtn.style;
    s.transition = "none";
    s.right = s.bottom = "auto";
    s.left = `${Math.min(Math.max(0, e.clientX - drag.offsetX), maxLeft)}px`;
    s.top = `${Math.min(Math.max(0, e.clientY - drag.offsetY), maxTop)}px`;
  });

  function snapCollapseBar() {
    const gap = COLLAPSE_GAP;
    const rect = collapseBtn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const side = rect.left + rect.width / 2 < vw / 2 ? "left" : "right";
    const maxTop = Math.max(gap, window.innerHeight - rect.height - gap);
    const top = Math.min(Math.max(gap, rect.top), maxTop);
    const s = collapseBtn.style;
    s.transition = "left 0.18s ease-out, top 0.18s ease-out";
    s.left = `${side === "left" ? gap : vw - rect.width - gap}px`;
    s.top = `${top}px`;
    lsSet("pp_collapse_pos", { side, top: Math.round(top) });
    clearTimeout(_collapseSettleTimer);
    _collapseSettleTimer = setTimeout(() => {
      if (drag.active && drag.moved) return;
      anchorCollapseBar(side);
    }, 220);
  }

  const endCollapseDrag = (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    collapseBtn.classList.remove("pp_dragging");
    try {
      collapseBtn.releasePointerCapture(e.pointerId);
    } catch { }
    if (!drag.moved) return;
    _collapseClickGuard = Date.now() + 350;
    snapCollapseBar();
  };
  collapseBtn.addEventListener("pointerup", endCollapseDrag);
  collapseBtn.addEventListener("pointercancel", endCollapseDrag);

  collapseBtn.addEventListener(
    "click",
    (e) => {
      if (Date.now() < _collapseClickGuard) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  window.addEventListener("resize", rafThrottle(clampCollapseBar));

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

  const _origPushState = history.pushState.bind(history);
  const _origReplaceState = history.replaceState.bind(history);

  const _patchHistory =
    (original) =>
      (...args) => {
        original(...args);
        syncCollapseButtonVisibility();

        const rawUrl = args[2];
        if (!rawUrl) return;
        try {
          const u = new URL(rawUrl, location.origin);
          const q = u.searchParams.get("q");
          if (!q) return;

          if (!u.pathname.endsWith("/search/") && !u.pathname.endsWith("/search"))
            return;

          const corrected = buildRedditSearchUrl(
            q,
            extractSubFromPathname(u.pathname),
          );

          const correctedU = new URL(corrected, location.origin);

          for (const [k, v] of u.searchParams) {
            if (!correctedU.searchParams.has(k))
              correctedU.searchParams.set(k, v);
          }

          if (
            u.searchParams.get("q") !== correctedU.searchParams.get("q") ||
            u.pathname !== correctedU.pathname
          )
            _origReplaceState(args[0], args[1], correctedU.toString());
        } catch { }
      };
  history.pushState = _patchHistory(_origPushState);
  history.replaceState = _patchHistory(_origReplaceState);
  window.addEventListener("popstate", syncCollapseButtonVisibility);

  const HOTKEYS = new Set([
    "s", "w", "a", "d", "x", "g", "escape", "arrowleft", "arrowright",
  ]);

  window.addEventListener(
    "keydown",
    (e) => {
      // Cheap rejects first: this fires on every keystroke on the page.
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const key = e.key?.toLowerCase();
      if (!HOTKEYS.has(key)) return;
      const _inInput = e.composedPath().some(
        (el) =>
          el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable ||
          el.getAttribute?.("contenteditable") === "true",
      );
      if (_inInput) return;
      const prevent = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };

      if (lightbox.style.display === "flex") {
        const lbNav = { arrowright: 1, d: 1, arrowleft: -1, a: -1 };
        if (
          lbNav[key] !== undefined ||
          key === "escape" ||
          key === "x" ||
          key === "w" ||
          key === "s" ||
          key === "g"
        ) {
          prevent();
          if (key === "g") toggleGrid();
          else if (lbNav[key]) navigateGallery(lbNav[key]);
          else closeLightbox();
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

  if (window.navigation) {
    let _lastSearchHref = null;
    window.navigation.addEventListener("navigate", () => {
      _lastSearchHref = location.href;
    });
    window.navigation.addEventListener("navigatesuccess", () => {
      const u = new URL(location.href);
      if (!u.pathname.endsWith("/search/") && !u.pathname.endsWith("/search"))
        return;
      if (!u.searchParams.get("q")) return;

      if (_lastSearchHref === location.href) return;
      _lastSearchHref = location.href;

      setTimeout(() => {
        const rendered =
          document.querySelector(
            [
              "search-results-page",
              "shreddit-search-results",
              "[data-testid='search-results']",
              "faceplate-tracker[noun='search_result']",
              ".search-result-group",
            ].join(","),
          ) !== null;

        if (!rendered) {
          window.location.replace(location.href);
        }
      }, 800);
    });
  }

  // =========================================================
  // MUTATION OBSERVER ENGINE
  // =========================================================

  // Observer callback only records added nodes. All real work happens in a single
  // coalesced run (max once per 200ms) so a busy page can never starve it, and
  // each feature only runs when something relevant was actually added.
  let _added = [];
  let _runQueued = false;
  let _kwDirty = false;
  let _mediaDirty = false;
  let _commentsDirty = false;
  let _lastHref = location.href;

  const OWN_UI_SEL =
    "#pp_lightbox, #pp_sidebar_wrap, #pp_float_collapse, .pp_decoder_box, .pp_am_stub";

  const queueRun = () => {
    if (_runQueued) return;
    _runQueued = true;
    setTimeout(run, 200);
  };

  function run() {
    _runQueued = false;

    const batch = _added.splice(0);
    const batchSet = new Set(batch);
    for (const n of batch) {
      if (!n.isConnected) continue;
      // A node under another recorded node is already covered by that node's walk.
      let covered = false;
      for (let p = n.parentElement; p; p = p.parentElement) {
        if (batchSet.has(p)) {
          covered = true;
          break;
        }
      }
      if (!covered) discoverRoots(n);
      // Skip the subtree queries once a flag is already set this pass.
      if (!_kwDirty || !_mediaDirty) {
        const hasPost =
          n.localName === "shreddit-post" || n.querySelector("shreddit-post");
        if (hasPost) _kwDirty = true;
        if (hasPost || n.closest("shreddit-post")) _mediaDirty = true;
      }
      if (
        !_commentsDirty &&
        (n.localName === "shreddit-comment" ||
          n.closest("shreddit-comment") ||
          n.querySelector("shreddit-comment"))
      )
        _commentsDirty = true;
    }

    if (location.href !== _lastHref) {
      _lastHref = location.href;
      _hotUntil = performance.now() + HOT_WINDOW;
      syncCollapseButtonVisibility();
      _kwVer[0]++;
      _kwVer[1]++;
      _kwDirty = _mediaDirty = _commentsDirty = true;
    }

    sweep();
    injectAccountBadge();
    Actions.initSidebar();
    injectFilterMenuEntry();

    if (_commentsDirty) {
      _commentsDirty = false;
      Actions.processComments();
      Actions.processDecoders();
    }
    if (_kwDirty) {
      _kwDirty = false;
      applyAllKeywordRules(true);
    }
    if (_mediaDirty) {
      _mediaDirty = false;
      for (const post of document.querySelectorAll(
        "shreddit-post:not([pp-images-handled])",
      ))
        Actions.handleImages(post);
    }
  }

  new MutationObserver((records) => {
    let any = false;
    for (const { addedNodes } of records) {
      for (const n of addedNodes) {
        if (n.nodeType !== 1 || n.closest?.(OWN_UI_SEL)) continue;
        _added.push(n);
        any = true;
      }
    }
    if (any) queueRun();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // processComments skips AutoModerator comments until the element is upgraded.
  customElements.whenDefined("shreddit-comment").then(() => {
    _commentsDirty = true;
    queueRun();
  });

  // =========================================================
  // BOOTSTRAP
  // =========================================================

  function bootstrap() {
    document.documentElement.appendChild(collapseBtn);
    syncCollapseButtonVisibility();
    _added.push(document.documentElement);
    _kwDirty = _mediaDirty = _commentsDirty = true;
    run();
  }
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", bootstrap)
    : bootstrap();

  console.log(`Reddit Enhancements v${VERSION} loaded`);
})();
