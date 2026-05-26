// ==UserScript==
// @name         SC Alert Crawler
// @version      2.0.0
// @description  Step through unread alerts one by one in the same tab. Button lives next to the alerts bell.
// @author       JR
// @license      MIT
// @match        *://simpcity.*/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SCAlertCrawler.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SCAlertCrawler.user.js
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────────────────────

  let _queue = []; // { alertId, postUrl, label }[]
  let _cursor = 0;
  let _built = false;
  let _btn = null; // the injected <a> element

  // ── Helpers ───────────────────────────────────────────────────────────────

  function withPostFragment(url) {
    const m = url.match(/\/posts\/(\d+)\/?/);
    if (!m) return url;
    const base = url.split("#")[0].replace(/\/$/, "");
    return `${base}/#post-${m[1]}`;
  }

  /** Parse unread alerts out of any document (live page or fetched HTML). */
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

  /** Fetch the alerts popup HTML in the background and build the queue. */
  function fetchAndBuildQueue(callback) {
    GM_xmlhttpRequest({
      method: "GET",
      url: `${location.origin}/account/alerts-popup`,
      timeout: 8000,
      onload(resp) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(resp.responseText, "text/html");
        const items = parseUnreadAlerts(doc);
        callback(items);
      },
      onerror: () => callback([]),
      ontimeout: () => callback([]),
    });
  }

  function alertsMenuVisible() {
    const body = document.querySelector(".js-alertsMenuBody");
    return !!(body && body.offsetParent !== null);
  }

  // ── Queue management ──────────────────────────────────────────────────────

  function rebuildFromDOM() {
    const items = parseUnreadAlerts(document);
    if (items.length) {
      _queue = items;
      _cursor = 0;
      _built = true;
      updateUI();
    }
  }

  function ensureQueue(then) {
    if (_built) {
      then();
      return;
    }

    // Try DOM first (menu may already be open)
    if (alertsMenuVisible()) {
      rebuildFromDOM();
      then();
      return;
    }

    // Fetch in background — no user action required
    fetchAndBuildQueue((items) => {
      if (items.length) {
        _queue = items;
        _cursor = 0;
        _built = true;
        updateUI();
      }
      then();
    });
  }

  // ── Click ─────────────────────────────────────────────────────────────────

  function onWalkClick(e) {
    e.preventDefault();
    e.stopPropagation();

    ensureQueue(() => {
      if (!_built || !_queue.length) return; // nothing to do

      if (_cursor >= _queue.length) {
        // All done — reset for next time
        _queue = [];
        _cursor = 0;
        _built = false;
        updateUI();
        return;
      }

      const entry = _queue[_cursor++];
      updateUI();
      location.href = entry.postUrl;
    });
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  function setDisabled(disabled) {
    _btn.style.pointerEvents = disabled ? "none" : "";
    _btn.style.cursor = disabled ? "default" : "";
  }

  function updateUI() {
    if (!_btn) return;

    const total = _queue.length;
    const remaining = total - _cursor;

    // Still fetching
    if (!_built) {
      _btn.title = "Alert Walker — fetching\u2026";
      _btn.style.opacity = "0.4";
      setDisabled(true);
      return;
    }

    // Fetched but nothing unread
    if (total === 0) {
      _btn.title = "Alert Walker — no new posts";
      _btn.style.opacity = "0.3";
      setDisabled(true);
      return;
    }

    // All walked
    if (_cursor >= total) {
      _btn.title = "Alert Walker — all caught up";
      _btn.style.opacity = "0.3";
      setDisabled(true);
      return;
    }

    // Ready
    _btn.title = `Alert Walker \u2014 ${remaining} unread (click to open next)`;
    _btn.style.opacity = "1";
    setDisabled(false);
  }

  // ── Injection ─────────────────────────────────────────────────────────────

  /**
   * Build the nav button. Mirrors the structure of the alerts <a>:
   *   <a class="p-navgroup-link p-navgroup-link--iconic …">
   *     <i aria-hidden="true"></i>
   *     <span class="p-navgroup-linkText"></span>
   *   </a>
   * We reuse those classes so it inherits all existing icon-link styles
   * (sizing, spacing, hover colour) for free.
   */
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

    // Flexbox ensures the SVG sits perfectly dead-center in the nav bar
    Object.assign(icon.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
    });

    // An SVG play outline. 'currentColor' ensures it matches the native gray and turns white on hover!
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
    _btn = btn;
    return true;
  }

  // ── Observer: alerts menu load + nav availability ─────────────────────────

  function init() {
    // Try injecting immediately; if the nav isn't rendered yet, wait for it
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

  function afterInject() {
    updateUI();

    // Pre-fetch queue immediately so it's ready before the user clicks
    fetchAndBuildQueue((items) => {
      if (items.length && !_built) {
        _queue = items;
        _cursor = 0;
        _built = true;
        updateUI();
      }
    });

    // Also rebuild whenever the live alerts menu opens (catches refresh)
    const menuObs = new MutationObserver(() => {
      if (alertsMenuVisible()) {
        const items = parseUnreadAlerts(document);
        if (items.length) {
          _queue = items;
          _cursor = 0;
          _built = true;
          updateUI();
        }
      }
    });
    menuObs.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
