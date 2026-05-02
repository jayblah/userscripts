// ==UserScript==
// @name         Goon Finder - Cross-Platform Leak Seeker
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Cross-checks profiles on OF, Fansly, IG, and TikTok against SimpCity and Coomer.
// @author       JR
// @match        https://onlyfans.com/*
// @match        https://fansly.com/*
// @match        https://fantrie.com/*
// @match        https://www.instagram.com/*
// @match        https://www.tiktok.com/*
// @match        *://*.coomer.st/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    COOMER_DOMAIN: "coomer.st",
    UI_ID: "leak-finder-overlay",
    STORAGE_KEY: "lfo_position_data",
    TIMEOUT: 10000,
    IGNORED_PATHS: new Set([
      "my",
      "home",
      "settings",
      "notifications",
      "lists",
      "chats",
      "bookmarks",
      "explore",
      "reels",
      "direct",
      "stories",
      "about",
      "legal",
      "p",
    ]),
  };

  if (window.location.hostname.includes("simpcity.cr")) return;

  GM_addStyle(`
    #${CONFIG.UI_ID} {
        position: fixed; width: 230px;
        background: #1a1a1a; border: 1px solid #444; border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5); color: #f0f0f0;
        font-family: system-ui, -apple-system, sans-serif; font-size: 13px;
        z-index: 99999; overflow: hidden; touch-action: none;
    }
    .lfo-header {
        padding: 10px; background: #2a2a2a; cursor: move;
        display: flex; justify-content: space-between; align-items: center;
        font-weight: bold; border-bottom: 1px solid #444; user-select: none;
    }
    .lfo-list { list-style: none; padding: 5px 10px; margin: 0; max-height: 450px; overflow-y: auto; }
    #${CONFIG.UI_ID}.collapsed .lfo-list { max-height: 0; padding: 0; border: none; }
    .lfo-item { margin: 4px 0; border-bottom: 1px solid #333; padding-bottom: 4px; }
    .lfo-item:last-child { border-bottom: none; }
    .lfo-link { text-decoration: none; display: block; padding: 4px; border-radius: 4px; color: #ffc107; transition: 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lfo-link:hover { background: #333; }
    .lfo-link.found { color: #4CAF50; font-weight: bold; }
    .lfo-link.not-found { color: #ff4d4d; opacity: 0.8; }
    .lfo-link.checking { color: #888; font-style: italic; }
    .lfo-tgl-btn { cursor: pointer; padding: 0 5px; font-size: 10px; }
  `);

  let activeIntervals = [];

  const cleanup = () => {
    activeIntervals.forEach(clearInterval);
    activeIntervals = [];
  };

  const request = (url, opts = {}) =>
    new Promise((resolve, reject) => {
      GM.xmlHttpRequest({
        method: "GET",
        url,
        timeout: CONFIG.TIMEOUT,
        headers: { "User-Agent": navigator.userAgent, ...opts.headers },
        onload: resolve,
        onerror: reject,
        ontimeout: reject,
        ...opts,
      });
    });

  const getUsername = () => {
    const { hostname, pathname } = window.location;
    const parts = pathname.split("/").filter(Boolean);
    if (!parts.length || CONFIG.IGNORED_PATHS.has(parts[0])) return null;

    if (hostname.includes("tiktok.com"))
      return parts[0].startsWith("@") ? parts[0].slice(1) : parts[0];
    if (hostname.includes("fansly.com"))
      return pathname.match(/^\/(?:profile\/)?([^/]+)/)?.[1];
    return parts[0];
  };

  const updateUIStatus = (id, found) => {
    const el = document.querySelector(`[data-lfo="${id}"]`);
    if (el) {
      el.classList.remove("checking");
      el.classList.add(found ? "found" : "not-found");
    }
  };

  const addLinkToUI = (list, name, url, id) => {
    if (document.querySelector(`[data-lfo="${id}"]`)) return;
    const li = document.createElement("li");
    li.className = "lfo-item";
    li.innerHTML = `<a href="${url}" target="_blank" rel="noopener" class="lfo-link checking" data-lfo="${id}">${name}</a>`;
    list.appendChild(li);
  };

  const checkers = {
    async performSearch(query, list, type, prefix) {
      if (!query || query.length < 2) return;
      const safeQuery = encodeURIComponent(query);
      const isSimp = type === "simpcity";
      const id = `${isSimp ? "sc" : "coo"}-${query.replace(/[^\w]/g, "-").toLowerCase()}`;
      const url = isSimp
        ? `https://simpcity.cr/search/1/?q=${safeQuery}&o=relevance`
        : `https://${CONFIG.COOMER_DOMAIN}/posts?q=${safeQuery}`;

      addLinkToUI(list, `${prefix}: ${query}`, url, id);

      try {
        const res = await request(url);
        const found = isSimp
          ? res.status === 200 && !res.responseText.includes("No results found")
          : res.status === 200 && res.responseText.includes("post-card");
        updateUIStatus(id, found);
      } catch (e) {
        updateUIStatus(id, false);
      }
    },
  };

  const initMovable = (el, header) => {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;

    const savedPos = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY));
    if (savedPos) {
      Object.assign(el.style, {
        top: savedPos.top,
        left: savedPos.left,
        right: "auto",
      });
    } else {
      Object.assign(el.style, { top: "70px", right: "20px" });
    }

    const dragMouseDown = (e) => {
      if (e.target.classList.contains("lfo-tgl-btn")) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    };

    const elementDrag = (e) => {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;

      el.style.top = el.offsetTop - pos2 + "px";
      el.style.left = el.offsetLeft - pos1 + "px";
      el.style.right = "auto";
    };

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      localStorage.setItem(
        CONFIG.STORAGE_KEY,
        JSON.stringify({
          top: el.style.top,
          left: el.style.left,
        }),
      );
    }

    header.onmousedown = dragMouseDown;
  };

  async function runChecks(username) {
    cleanup();
    let container = document.getElementById(CONFIG.UI_ID);

    if (!container) {
      container = document.createElement("div");
      container.id = CONFIG.UI_ID;
      container.innerHTML = `
        <div class="lfo-header" id="lfo-handle">
          <span>Goon Finder™</span>
          <span class="lfo-tgl-btn" id="lfo-tgl">▼</span>
        </div>
        <ul class="lfo-list"></ul>
      `;
      document.body.appendChild(container);

      const handle = container.querySelector("#lfo-handle");
      const tglBtn = container.querySelector("#lfo-tgl");

      initMovable(container, handle);

      tglBtn.onclick = (e) => {
        e.stopPropagation();
        container.classList.toggle("collapsed");
        tglBtn.textContent = container.classList.contains("collapsed")
          ? "▶"
          : "▼";
      };
    }

    const list = container.querySelector(".lfo-list");
    list.innerHTML = "";

    checkers.performSearch(username, list, "simpcity", "SimpCity");
    checkers.performSearch(username, list, "coomer", "Coomer");

    if (window.location.hostname.includes("instagram.com")) {
      let foundNames = new Set();
      let attempts = 0;
      const igInterval = setInterval(() => {
        attempts++;
        const nameEl = document.querySelector(
          "header section span.x1lliihq.x1plvlek.xryxfnj",
        );
        const displayName = nameEl?.innerText?.trim();

        if (
          displayName &&
          displayName.toLowerCase() !== username.toLowerCase() &&
          !foundNames.has(displayName.toLowerCase())
        ) {
          foundNames.add(displayName.toLowerCase());
          checkers.performSearch(
            displayName,
            list,
            "simpcity",
            "SimpCity (Name)",
          );
          checkers.performSearch(displayName, list, "coomer", "Coomer (Name)");
        }
        if (attempts > 12) clearInterval(igInterval);
      }, 1000);
      activeIntervals.push(igInterval);
    }

    if (window.location.hostname.includes("fansly.com")) {
      try {
        const res = await request(
          `https://apiv3.fansly.com/api/v1/account?usernames=${username}`,
        );
        const data = JSON.parse(res.responseText);
        if (data.success && data.response?.[0]?.id) {
          checkers.performSearch(
            data.response[0].id,
            list,
            "coomer",
            "Coomer (ID)",
          );
        }
      } catch (e) {}
    }
  }

  let lastUser = null;
  let lastUrl = location.href;

  const main = () => {
    const user = getUsername();
    if (user && (user !== lastUser || location.href !== lastUrl)) {
      lastUser = user;
      lastUrl = location.href;
      runChecks(user);
    } else if (!user) {
      document.getElementById(CONFIG.UI_ID)?.remove();
      lastUser = null;
      cleanup();
    }
  };

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      main();
    }
  });

  observer.observe(document.head, { childList: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    setTimeout(main, 1000);
  }
})();
