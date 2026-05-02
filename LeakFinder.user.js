// ==UserScript==
// @name         Leak Finder Overlay
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Optimized leak finder with cleaner logic and better performance.
// @author       Gemini (Refined for Best Practices)
// @match        https://onlyfans.com/*
// @match        https://fansly.com/*
// @match        https://fantrie.com/*
// @match        *://*.coomer.st/*
// @match        *://*.simpcity.cr/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @license      Unlicense
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    COOMER_DOMAIN: "coomer.st",
    MAX_RETRIES: 2,
    UI_ID: "leak-finder-overlay",
    IGNORED_PATHS: new Set([
      "my",
      "home",
      "settings",
      "notifications",
      "lists",
      "chats",
      "bookmarks",
      "explore",
    ]),
  };

  // --- Styles ---
  GM_addStyle(`
        #${CONFIG.UI_ID} {
            position: fixed; bottom: 20px; right: 20px; width: 220px;
            background: #1a1a1a; border: 1px solid #444; border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5); color: #f0f0f0;
            font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
            z-index: 9999; overflow: hidden; transition: opacity 0.3s;
        }
        .lfo-header { padding: 10px; background: #2a2a2a; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
        .lfo-list { list-style: none; padding: 5px 10px; margin: 0; max-height: 300px; overflow-y: auto; transition: max-height 0.3s ease; }
        #${CONFIG.UI_ID}.collapsed .lfo-list { max-height: 0; padding: 0 10px; }
        .lfo-item { margin: 5px 0; }
        .lfo-link { text-decoration: none; display: block; padding: 4px; border-radius: 4px; color: #ffc107; transition: 0.2s; }
        .lfo-link:hover { background: #333; }
        .lfo-link.found { color: #4CAF50; font-weight: bold; }
        .lfo-link.not-found { color: #ff4d4d; }
    `);

  // --- Utilities ---
  const request = (url, opts = {}) =>
    new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url,
        headers: opts.headers || {},
        onload: resolve,
        onerror: reject,
        ...opts,
      });
    });

  const getUsername = () => {
    const { hostname, pathname } = window.location;
    const parts = pathname.split("/").filter(Boolean);
    if (!parts.length || CONFIG.IGNORED_PATHS.has(parts[0])) return null;

    if (hostname.includes("fansly.com")) {
      return pathname.match(/^\/(?:profile\/)?([^/]+)/)?.[1];
    }
    return parts[0];
  };

  // --- UI Logic ---
  const updateUIStatus = (id, found) => {
    const el = document.querySelector(`[data-lfo="${id}"]`);
    if (el) {
      el.classList.remove("pending");
      el.classList.add(found ? "found" : "not-found");
    }
  };

  const addLinkToUI = (list, name, url, id) => {
    const li = document.createElement("li");
    li.className = "lfo-item";
    li.innerHTML = `<a href="${url}" target="_blank" rel="noopener" class="lfo-link" data-lfo="${id}">${name}</a>`;
    list.appendChild(li);
  };

  // --- Core Checkers ---
  const checkers = {
    async coomer(service, username, list, note = "") {
      const id = `coomer-${service}-${note || "main"}`;
      const url = `https://${CONFIG.COOMER_DOMAIN}/${service}/user/${username}`;
      addLinkToUI(list, `Coomer${note ? ` (${note})` : ""}`, url, id);

      try {
        const res = await request(
          `https://${CONFIG.COOMER_DOMAIN}/api/v1/${service}/user/${username}/profile`,
          { headers: { Accept: "text/css" } },
        );
        updateUIStatus(id, res.status === 200);
      } catch {
        updateUIStatus(id, false);
      }
    },

    async simpcity(username, list, note = "") {
      const id = `simpcity-${note || "main"}`;
      const url = `https://simpcity.cr/search/1/?q=${username}&o=relevance`;
      addLinkToUI(list, `SimpCity${note ? ` (${note})` : ""}`, url, id);

      try {
        const res = await request(url);
        updateUIStatus(
          id,
          res.status === 200 && !res.responseText.includes("No results found"),
        );
      } catch {
        updateUIStatus(id, false);
      }
    },
  };

  // --- Execution Logic ---
  async function runChecks(username) {
    document.getElementById(CONFIG.UI_ID)?.remove();

    const container = document.createElement("div");
    container.id = CONFIG.UI_ID;
    container.innerHTML = `<div class="lfo-header"><span>Checking: ${username}</span><span id="lfo-tgl">▼</span></div><ul class="lfo-list"></ul>`;
    document.body.appendChild(container);

    const list = container.querySelector(".lfo-list");
    container.querySelector(".lfo-header").onclick = () => {
      container.classList.toggle("collapsed");
      document.getElementById("lfo-tgl").textContent =
        container.classList.contains("collapsed") ? "▶" : "▼";
    };

    const host = window.location.hostname;

    // 1. Always check SimpCity
    checkers.simpcity(username, list);

    // 2. Platform Specifics
    if (host.includes("onlyfans.com")) {
      checkers.coomer("onlyfans", username, list);
    } else if (host.includes("fansly.com")) {
      try {
        const res = await request(
          `https://apiv3.fansly.com/api/v1/account?usernames=${username}`,
        );
        const data = JSON.parse(res.responseText);
        if (data.success && data.response?.[0]?.id) {
          checkers.coomer("fansly", data.response[0].id, list, "ID");
        }
      } catch (e) {
        console.error("Fansly API failed", e);
      }

      // Social check logic
      setTimeout(() => {
        const insta = document
          .querySelector('a[href*="instagram.com"]')
          ?.href.match(/instagram\.com\/([a-zA-Z0-9_.]+)/)?.[1];
        if (insta) checkers.simpcity(insta, list, "Insta");
      }, 2000);
    }
  }

  // --- Observer / Init ---
  let lastUser = null;
  let lastUrl = location.href;

  const main = () => {
    const user = getUsername();
    if (user && user !== lastUser) {
      lastUser = user;
      runChecks(user);
    } else if (!user) {
      document.getElementById(CONFIG.UI_ID)?.remove();
      lastUser = null;
    }
  };

  // Optimized Observer: Only care about URL changes
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      main();
    }
  });

  observer.observe(document.head, { childList: true }); // Faster than body for SPA URL changes
  setTimeout(main, 1000);
})();
