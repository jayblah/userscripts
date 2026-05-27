// ==UserScript==
// @name         SC Enhancements
// @version      1.2
// @description  Streamlines thread layouts, centers enlarged media, adds structural toggles, and features a sequential, single-tab unread alert walker.
// @author       JR
// @license      MIT
// @match        *://simpcity.*/*
// @match        https://simpcity.su/*
// @match        https://simpcity.cr/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SC_Enhancements.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SC_Enhancements.user.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // =========================================================================
  // 1. STYLES & INTERFACE CUSTOMIZATION
  // =========================================================================

  GM_addStyle(`
        /* --- General Layout Improvements --- */
        .p-body-sidebarCol { display: none !important; }
        .p-body-content { flex: 1 1 auto !important; min-width: 0 !important; max-width: 100% !important; }
        .p-body-pageContent { width: 100% !important; max-width: 100% !important; }
        .block--category .block-header { cursor: pointer; user-select: none; display: flex !important; align-items: center; gap: 8px; }
        .sc-toggle { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; font-size: 10px; line-height: 1; opacity: 0.6; transition: transform 0.2s ease; flex-shrink: 0; }
        .block--category.is-collapsed .sc-toggle, .sc-sticky-header.is-collapsed .sc-toggle, .sc-notices-header.is-collapsed .sc-toggle { transform: rotate(-90deg); }
        .block--category.is-collapsed .block-body, .reactionsBar.js-reactionsList, .message-user { display: none !important; }

        /* --- Collapsible Notices Bar --- */
        .sc-notices-header { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #e06c75; background: rgba(224, 108, 117, 0.08); border: 1px solid rgba(224, 108, 117, 0.2); border-radius: 4px; margin-bottom: 10px; }
        .sc-notices-header:hover { background: rgba(224, 108, 117, 0.15); }
        .notices.js-notices.is-collapsed { display: none !important; }

        /* --- Streamlined Alerts Dropdown --- */
        li.alert .contentRow-figure, li.alert .contentRow-minor, li.alert .contentRow-extra, li.alert .fauxBlockLink a.username, li.alert .fauxBlockLink-blockLink .label, li.alert .fauxBlockLink-blockLink .label-append { display: none !important; }
        li.alert.menu-row { padding: 6px 12px !important; min-height: auto !important; }
        li.alert .fauxBlockLink { font-size: 0 !important; }
        li.alert .fauxBlockLink-blockLink { font-size: 13px !important; line-height: 1.4 !important; display: block !important; }

        /* --- Sticky Threads Toggle --- */
        .sc-sticky-header { cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; padding: 8px 10px; font-size: 13px; font-weight: 600; color: #a5a5a5; background: rgba(0, 0, 0, 0.2); border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .sc-sticky-header:hover { color: #d1d1d1; background: rgba(0, 0, 0, 0.3); }
        .structItemContainer-group--sticky.is-collapsed, hr.stickySeparatortop { display: none !important; }

        /* --- Streamlined Thread Lists --- */
        .structItem-cell.structItem-cell--meta, .structItem-cell.structItem-cell--latest, .structItem-cell.structItem-cell--iconEnd { display: none !important; }
        .structItem--thread { border-bottom: 1px solid rgba(255,255,255,0.05) !important; }
        .structItem-cell--icon { display: none !important; }
        .structItem-iconContainer .avatar:not(.dcThumbnail):not([data-gv-thumb="true"]) { display: none !important; }

        /* --- Enlarged Thumbnail Display Properties --- */
        .structItem--thread [data-gv-thumb], .structItem [data-gv-thumb], .block-row [data-gv-thumb], .contentRow [data-gv-thumb] { width: 400px !important; height: 400px !important; display: block !important; margin: 0 auto 12px auto !important; position: relative !important; z-index: 5 !important; opacity: 1 !important; filter: none !important; }
        .structItem--thread [data-gv-thumb] img, .structItem [data-gv-thumb] img, .block-row [data-gv-thumb] img, .contentRow [data-gv-thumb] img { width: 100% !important; height: 100% !important; display: block !important; object-fit: cover !important; object-position: center center !important; background-size: cover !important; background-position: center !important; opacity: 1 !important; filter: none !important; }
        .structItem--thread [data-gv-thumb] img[src*="base64"], .structItem [data-gv-thumb] img[src*="base64"], .block-row [data-gv-thumb] img[src*="base64"], .contentRow [data-gv-thumb] img[src*="base64"] { object-position: -9999px !important; }

        /* --- Global Grid Centering Fixes --- */
        .block-row:has([data-gv-thumb="true"]) .contentRow, .contentRow:has([data-gv-thumb="true"]), .structItem:has([data-gv-thumb="true"]) { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; width: 100% !important; text-align: center !important; padding-left: 0 !important; }
        .contentRow-main:has([data-gv-thumb="true"]), .structItem-cell.structItem-cell--main:has([data-gv-thumb="true"]) { display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; width: 100% !important; text-align: center !important; margin-left: 0 !important; padding-left: 0 !important; }
        .contentRow-main:has([data-gv-thumb="true"]) .listInline, .structItem-cell--main:has([data-gv-thumb="true"]) .structItem-minor, .structItem-cell--main:has([data-gv-thumb="true"]) .structItem-parts { display: flex !important; justify-content: center !important; align-items: center !important; flex-wrap: wrap !important; padding: 0 !important; margin: 0 auto !important; text-align: center !important; }
        .structItem-cell--main:has([data-gv-thumb="true"]) .structItem-parts > li { display: inline-flex !important; align-items: center !important; float: none !important; }

        /* --- Kill All Hover Dim Filters completely --- */
        .block-row:hover [data-gv-thumb], .contentRow:hover [data-gv-thumb], .structItem:hover [data-gv-thumb], .structItem--thread:hover [data-gv-thumb] { opacity: 1 !important; filter: none !important; }
  `);

  const STORAGE_KEY = "sc_category_collapsed";

  const StateManager = {
    load: () => {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      } catch {
        return {};
      }
    },
    save: (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)),
  };

  /**
   * Universal abstraction for creating structural toggle components to keep code DRY.
   */
  function setupCollapsible({
    header,
    target,
    stateKey,
    state,
    isReversedLogic = false,
    insertMethod,
  }) {
    if (!header || !target || header.querySelector(".sc-toggle")) return;

    const toggle = document.createElement("span");
    toggle.className = "sc-toggle";
    toggle.textContent = "▾";

    if (insertMethod) {
      insertMethod(toggle, header);
    } else {
      header.prepend(toggle);
    }

    // "Reversed logic" means the section defaults to collapsed instead of open
    const isCollapsed = isReversedLogic
      ? state[stateKey] !== true
      : state[stateKey] === true;

    if (isCollapsed) {
      target.classList.add("is-collapsed");
      if (header !== target) header.classList.add("is-collapsed");
    }

    header.addEventListener("click", () => {
      const nowCollapsed = target.classList.toggle("is-collapsed");
      if (header !== target)
        header.classList.toggle("is-collapsed", nowCollapsed);

      const current = StateManager.load();
      const shouldSave = isReversedLogic ? !nowCollapsed : nowCollapsed;

      if (shouldSave) current[stateKey] = true;
      else delete current[stateKey];

      StateManager.save(current);
    });
  }

  // Thread Enlarger Positioning Logic
  function processThumbnails() {
    const items = document.querySelectorAll(
      ".structItem--thread:not([data-processed]), .structItem:not([data-processed]), .block-row:not([data-processed]), .contentRow:not([data-processed])",
    );

    if (!items.length) return;

    items.forEach((item) => {
      const thumbLink = item.querySelector(
        ".structItem-iconContainer a, .dcThumbnail",
      );
      let target = item.querySelector(".structItem-title, .contentRow-title");

      if (!target && thumbLink) {
        target = item.querySelector(
          ".contentRow-main > a[href*='/threads/'], .structItem-cell--main > a[href*='/threads/']",
        );
      }

      if (thumbLink && target) {
        thumbLink.setAttribute("data-gv-thumb", "true");
        target.parentNode.insertBefore(thumbLink, target);
      }

      item.setAttribute("data-processed", "true");
    });
  }

  function initLayout() {
    const state = StateManager.load();

    processThumbnails();

    // --- Category Toggle Logic ---
    document.querySelectorAll(".block--category").forEach((block) => {
      const anchor = block.querySelector(".u-anchorTarget");
      if (!anchor) return;

      setupCollapsible({
        header: block.querySelector(".block-header"),
        target: block,
        stateKey: anchor.id,
        state: state,
        insertMethod: (toggle, hdr) => {
          const headerLink = hdr.querySelector("a");
          headerLink
            ? headerLink.insertAdjacentElement("afterend", toggle)
            : hdr.prepend(toggle);
        },
      });
    });

    // --- Sticky Threads Toggle Logic ---
    const stickyGroup = document.querySelector(
      ".structItemContainer-group--sticky",
    );
    if (stickyGroup && !document.querySelector(".sc-sticky-header")) {
      const header = document.createElement("div");
      header.className = "sc-sticky-header";
      header.innerHTML = `<span>Sticky Threads</span>`;
      stickyGroup.parentNode.insertBefore(header, stickyGroup);

      setupCollapsible({
        header: header,
        target: stickyGroup,
        stateKey: "sc_sticky_threads",
        state: state,
        isReversedLogic: true,
      });
    }

    // --- Global Notices Toggle Logic ---
    const noticesBlock = document.querySelector(".notices.js-notices");
    if (noticesBlock && !document.querySelector(".sc-notices-header")) {
      const header = document.createElement("div");
      header.className = "sc-notices-header";
      header.innerHTML = `<span>Important Board Notices</span>`;
      noticesBlock.parentNode.insertBefore(header, noticesBlock);

      setupCollapsible({
        header: header,
        target: noticesBlock,
        stateKey: "sc_board_notices",
        state: state,
        isReversedLogic: true,
      });
    }
  }

  // =========================================================================
  // 2. ALERT TRACKING ENGINE & STATE
  // =========================================================================

  const AlertEngine = {
    queue: [],
    cursor: 0,
    built: false,
    btn: null,
  };

  function withPostFragment(url) {
    const m = url.match(/\/posts\/(\d+)\/?/);
    return m ? `${url.split("#")[0].replace(/\/$/, "")}/#post-${m[1]}` : url;
  }

  function parseUnreadAlerts(doc) {
    const results = [];
    doc
      .querySelectorAll(
        ".js-alertsMenuBody li.alert.is-unread, ol.listPlain li.alert.is-unread",
      )
      .forEach((li) => {
        const postLink = li.querySelector("a.fauxBlockLink-blockLink");
        if (!postLink) return;
        results.push({
          alertId: li.dataset.alertId || "",
          postUrl: withPostFragment(postLink.getAttribute("href")),
          label: postLink.textContent.trim().replace(/\s+/g, " "),
        });
      });
    return results;
  }

  // Modernized background fetching
  function fetchAlertsHtml() {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${location.origin}/account/alerts-popup`,
        timeout: 8000,
        onload: (resp) => resolve(resp.responseText),
        onerror: () => resolve(""),
        ontimeout: () => resolve(""),
      });
    });
  }

  function alertsMenuVisible() {
    const body = document.querySelector(".js-alertsMenuBody");
    return !!(body && body.offsetParent !== null);
  }

  function rebuildFromDOM() {
    const items = parseUnreadAlerts(document);
    if (items.length) updateQueueState(items);
  }

  function updateQueueState(items) {
    AlertEngine.queue = items;
    AlertEngine.cursor = 0;
    AlertEngine.built = true;
    updateUI();
  }

  async function ensureQueue() {
    if (AlertEngine.built) return;

    if (alertsMenuVisible()) {
      rebuildFromDOM();
      return;
    }

    const html = await fetchAlertsHtml();
    if (html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const items = parseUnreadAlerts(doc);
      if (items.length) updateQueueState(items);
    }
  }

  async function onWalkClick(e) {
    e.preventDefault();
    e.stopPropagation();

    await ensureQueue();

    if (!AlertEngine.built || !AlertEngine.queue.length) return;

    if (AlertEngine.cursor >= AlertEngine.queue.length) {
      // All done — reset for next time
      AlertEngine.queue = [];
      AlertEngine.cursor = 0;
      AlertEngine.built = false;
      updateUI();
      return;
    }

    const entry = AlertEngine.queue[AlertEngine.cursor++];
    updateUI();
    location.href = entry.postUrl;
  }

  function setDisabled(disabled) {
    AlertEngine.btn.style.pointerEvents = disabled ? "none" : "";
    AlertEngine.btn.style.cursor = disabled ? "default" : "";
  }

  function updateUI() {
    if (!AlertEngine.btn) return;

    const total = AlertEngine.queue.length;
    const remaining = total - AlertEngine.cursor;

    if (!AlertEngine.built) {
      AlertEngine.btn.title = "Alert Walker — fetching\u2026";
      AlertEngine.btn.style.opacity = "0.4";
      setDisabled(true);
    } else if (total === 0) {
      AlertEngine.btn.title = "Alert Walker — no new posts";
      AlertEngine.btn.style.opacity = "0.3";
      setDisabled(true);
    } else if (AlertEngine.cursor >= total) {
      AlertEngine.btn.title = "Alert Walker — all caught up";
      AlertEngine.btn.style.opacity = "0.3";
      setDisabled(true);
    } else {
      AlertEngine.btn.title = `Alert Walker \u2014 ${remaining} unread (click to open next)`;
      AlertEngine.btn.style.opacity = "1";
      setDisabled(false);
    }
  }

  function injectButton() {
    const alertsLink = document.querySelector(".p-navgroup-link--alerts");
    if (!alertsLink) return false;

    const btn = document.createElement("a");
    btn.href = "#";
    btn.className = "p-navgroup-link p-navgroup-link--iconic aw-walker-btn";
    btn.title = "Alert Walker";
    btn.setAttribute("aria-label", "Alert Walker");

    const icon = document.createElement("i");
    icon.setAttribute("aria-hidden", "true");
    Object.assign(icon.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
    });

    icon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    `;

    const text = document.createElement("span");
    text.className = "p-navgroup-linkText";

    btn.appendChild(icon);
    btn.appendChild(text);
    btn.addEventListener("click", onWalkClick);

    alertsLink.insertAdjacentElement("afterend", btn);
    AlertEngine.btn = btn;
    return true;
  }

  async function afterInject() {
    updateUI();

    // Pre-fetch queue immediately so it's ready before the user clicks
    const html = await fetchAlertsHtml();
    if (html && !AlertEngine.built) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const items = parseUnreadAlerts(doc);
      if (items.length) updateQueueState(items);
    }

    // Rebuild whenever the live alerts menu opens (catches live socket refreshes)
    const menuObs = new MutationObserver(() => {
      if (alertsMenuVisible()) rebuildFromDOM();
    });
    menuObs.observe(document.body, { childList: true, subtree: true });
  }

  // =========================================================================
  // 3. MASTER RUN TIME AND INITIALIZATION
  // =========================================================================

  function masterInit() {
    initLayout();

    if (!injectButton()) {
      const navObs = new MutationObserver(() => {
        if (injectButton()) {
          navObs.disconnect();
          afterInject();
        }
      });
      navObs.observe(document.body, { childList: true, subtree: true });
    } else {
      afterInject();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", masterInit);
  } else {
    masterInit();
  }

  // Debounced Dynamic Mutation Observer Loop (For performance)
  let thumbnailTimeout;
  const layoutObserver = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0)) {
      clearTimeout(thumbnailTimeout);
      thumbnailTimeout = setTimeout(processThumbnails, 50);
    }
  });

  layoutObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
