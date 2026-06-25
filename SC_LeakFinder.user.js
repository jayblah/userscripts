// ==UserScript==
// @name         SC Leak Finder
// @version      1.8
// @description  Cross-checks profiles on OF, Fansly, IG, TikTok, Fanfix, VSCO, and X against SC.
// @author       JR
// @license      MIT
// @match        https://onlyfans.com/*
// @match        https://fansly.com/*
// @match        https://fantrie.com/*
// @match        https://www.instagram.com/*
// @match        https://www.tiktok.com/*
// @match        https://app.fanfix.io/*
// @match        https://vsco.co/*
// @match        https://x.com/*
// @match        https://twitter.com/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SC_LeakFinder.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SC_LeakFinder.user.js
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
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
      "feed",
      "messages",
      "discover",
      "i",
      "search",
      "compose",
      "intent",
    ]),
  };

  const State = {
    intervals: [],
    lastUser: null,
    lastUrl: "",
    container: null,
  };

  const cleanup = () => {
    State.intervals.forEach(clearInterval);
    State.intervals = [];
  };

  // Strip emojis, non-ASCII unicode, and collapse extra whitespace
  const sanitizeQuery = (str) =>
    str
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
      .replace(/[\u{2600}-\u{27FF}]/gu, "")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Extract only text nodes from an element, ignoring child elements (e.g. SVG badges)
  const textNodesOnly = (el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(" ")
      .trim();

  const getUsername = () => {
    const { hostname, pathname } = window.location;
    const parts = pathname.split("/").filter(Boolean);
    if (!parts.length || CONFIG.IGNORED_PATHS.has(parts[0])) return null;

    if (hostname.includes("tiktok.com") || hostname.includes("fanfix.io"))
      return parts[0].startsWith("@") ? parts[0].slice(1) : parts[0];

    if (hostname.includes("fansly.com"))
      return pathname.match(/^\/(?:profile\/)?([^/]+)/)?.[1];

    return parts[0];
  };

  const updateUIStatus = (id, found) => {
    document.querySelectorAll(`[data-lfo="${id}"]`).forEach((el) => {
      el.classList.remove("checking");
      el.classList.add(found ? "found" : "not-found");
    });
  };

  const searchSimpCity = async (rawQuery, list, prefix) => {
    const query = sanitizeQuery(rawQuery);
    if (!query || query.length < 2) return;
    const safeSlug = query.replace(/[^\w]/g, "-").toLowerCase();
    const id = `sc-${safeSlug}`;

    if (document.querySelector(`[data-lfo="${id}"]`)) return;

    const urlGeneral = `https://simpcity.cr/search/1/?q=${encodeURIComponent(query)}&o=relevance`;
    const urlTitleOnly = `https://simpcity.cr/search/1/?q=${encodeURIComponent(query)}&c[title_only]=1&o=relevance`;

    const li = document.createElement("li");
    li.className = "lfo-item";
    li.innerHTML = `
      <span class="lfo-label">${prefix}: ${query}</span>
      <span class="lfo-links">
        <a href="${urlGeneral}"   target="_blank" rel="noopener" class="lfo-link checking" data-lfo="${id}" title="General search">All</a>
        <a href="${urlTitleOnly}" target="_blank" rel="noopener" class="lfo-link checking" data-lfo="${id}" title="Title-only search">Title</a>
      </span>
    `;
    list.appendChild(li);

    try {
      const res = await GM.xmlHttpRequest({
        method: "GET",
        url: urlTitleOnly,
        timeout: CONFIG.TIMEOUT,
      });
      updateUIStatus(
        id,
        res.status === 200 && !res.responseText.includes("No results found"),
      );
    } catch {
      updateUIStatus(id, false);
    }
  };

  const initUI = () => {
    if (State.container) return State.container.querySelector(".lfo-list");

    State.container = document.createElement("div");
    State.container.id = CONFIG.UI_ID;
    State.container.innerHTML = `
        <div class="lfo-header" id="lfo-handle">
            <span>SC Finder™</span>
            <span class="lfo-tgl-btn" id="lfo-tgl">▼</span>
        </div>
        <ul class="lfo-list"></ul>
    `;
    document.body.appendChild(State.container);

    const handle = State.container.querySelector("#lfo-handle");
    const tglBtn = State.container.querySelector("#lfo-tgl");

    tglBtn.onclick = (e) => {
      e.stopPropagation();
      const collapsed = State.container.classList.toggle("collapsed");
      tglBtn.textContent = collapsed ? "▶" : "▼";
    };

    const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY));
    if (saved)
      Object.assign(State.container.style, {
        top: saved.top,
        left: saved.left,
        right: "auto",
      });

    handle.onmousedown = (e) => {
      if (e.target.id === "lfo-tgl") return;
      let pos = {
        x: e.clientX - State.container.offsetLeft,
        y: e.clientY - State.container.offsetTop,
      };
      const move = (me) => {
        State.container.style.left = `${me.clientX - pos.x}px`;
        State.container.style.top = `${me.clientY - pos.y}px`;
        State.container.style.right = "auto";
      };
      document.addEventListener("mousemove", move);
      document.onmouseup = () => {
        document.removeEventListener("mousemove", move);
        localStorage.setItem(
          CONFIG.STORAGE_KEY,
          JSON.stringify({
            top: State.container.style.top,
            left: State.container.style.left,
          }),
        );
      };
    };
    return State.container.querySelector(".lfo-list");
  };

  const pollForDisplayName = (
    username,
    list,
    selectorFn,
    extractFn,
    prefix,
    maxTicks = 20,
  ) => {
    const found = new Set([username.toLowerCase()]);
    let count = 0;
    const interval = setInterval(() => {
      const el = selectorFn();
      const raw = el ? (extractFn ? extractFn(el) : el.innerText.trim()) : null;
      const displayName = raw ? sanitizeQuery(raw) : null;
      if (
        displayName &&
        displayName.length > 2 &&
        !found.has(displayName.toLowerCase())
      ) {
        found.add(displayName.toLowerCase());
        searchSimpCity(displayName, list, prefix);
      }
      if (++count > maxTicks) clearInterval(interval);
    }, 1000);
    State.intervals.push(interval);
  };

  const runChecks = (username) => {
    cleanup();
    const list = initUI();
    list.innerHTML = "";
    searchSimpCity(username, list, "SC");

    const { hostname } = window.location;

    if (hostname.includes("onlyfans.com")) {
      // .g-user-name contains a text node + an SVG badge; use textNodesOnly to avoid badge text
      pollForDisplayName(
        username,
        list,
        () => document.querySelector(".g-user-name"),
        textNodesOnly,
        "SC (Name)",
      );
    }

    if (hostname.includes("instagram.com")) {
      pollForDisplayName(
        username,
        list,
        () => document.querySelector("h1, header section span[dir='auto']"),
        null,
        "SC (Name)",
      );
    }

    if (hostname.includes("x.com") || hostname.includes("twitter.com")) {
      pollForDisplayName(
        username,
        list,
        () => document.querySelector("div.text-headline1.font-bold"),
        null,
        "SC (Name)",
      );
    }
  };

  const main = () => {
    const user = getUsername();
    if (user && (user !== State.lastUser || location.href !== State.lastUrl)) {
      State.lastUser = user;
      State.lastUrl = location.href;
      runChecks(user);
    } else if (!user && State.container) {
      State.container.remove();
      State.container = null;
      State.lastUser = null;
      cleanup();
    }
  };

  GM_addStyle(`
    #${CONFIG.UI_ID} { position: fixed; top: 70px; right: 20px; width: 260px; background: #1a1a1a; border: 1px solid #444; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); color: #f0f0f0; font-family: system-ui; font-size: 13px; z-index: 99999; overflow: hidden; }
    .lfo-header { padding: 10px; background: #2a2a2a; cursor: move; display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #444; user-select: none; }
    .lfo-list { list-style: none; padding: 5px 10px; margin: 0; max-height: 450px; overflow-y: auto; }
    #${CONFIG.UI_ID}.collapsed .lfo-list { max-height: 0; padding: 0; }

    .lfo-item { margin: 4px 0; border-bottom: 1px solid #333; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
    .lfo-item:last-child { border-bottom: none; margin-bottom: 0; }

    .lfo-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ccc; padding: 4px 0; }
    .lfo-links { display: flex; gap: 4px; flex-shrink: 0; }

    .lfo-link { text-decoration: none; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid #555; white-space: nowrap; }
    .lfo-link.checking  { color: #888; border-color: #444; font-style: italic; }
    .lfo-link.found     { color: #4CAF50; border-color: #4CAF50; }
    .lfo-link.not-found { color: #ff4d4d; border-color: #ff4d4d; }
    .lfo-tgl-btn { cursor: pointer; padding: 0 5px; }
  `);

  new MutationObserver(main).observe(document.body, {
    childList: true,
    subtree: true,
  });
  main();
})();
