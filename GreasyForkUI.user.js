// ==UserScript==
// @name         Greasy Fork Minimal UI
// @namespace    https://greasyfork.org/
// @version      2.8.0
// @description  Clean, minimal dark theme for Greasy Fork with optimized performance
// @author       quantavil
// @match        https://greasyfork.org/*
// @match        https://*.greasyfork.org/*
// @grant        GM_addStyle
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/GreasyForkUI.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/GreasyForkUI.user.js
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    bgBase: "#13131a",
    logPower: 3,
    accent: "#34d474",
    sortOptions: [
      { value: "", label: "Daily Installs" },
      { value: "total_installs", label: "Total Installs" },
      { value: "ratings", label: "Ratings" },
      { value: "created", label: "Created Date" },
      { value: "updated", label: "Updated Date" },
      { value: "name", label: "Name" },
    ],
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const $ = (sel, context = document) => context.querySelector(sel);
  const $$ = (sel, context = document) =>
    Array.from(context.querySelectorAll(sel));

  const injectStyle = (id, css) => {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  };

  const formatNumber = (n) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
    return String(n);
  };

  // ── Styles ───────────────────────────────────────────────────────────────

  // FOUC Prevention
  document.documentElement.style.background = CONFIG.bgBase;
  injectStyle(
    "gf-critical",
    `
    html { background: ${CONFIG.bgBase} !important; }
    html:not(.gf-ready) body { opacity: 0 !important; visibility: hidden !important; }
    html.gf-ready body { opacity: 1 !important; transition: opacity 0.15s ease-out !important; }
  `,
  );

  injectStyle(
    "gf-main-styles",
    `
    :root {
      --bg-0: #13131a; --bg-1: #1c1c26; --bg-2: #252530; --bg-3: #2e2e3c;
      --border: #38384a; --text-1: #f4f4f6; --text-2: #b8b8c8; --text-3: #8888a0;
      --accent: ${CONFIG.accent}; --radius: 8px;
    }

    /* Modern Layout Fixes */
    .width-constraint { max-width: 900px !important; margin: 0 auto !important; padding: 2rem !important; }
    .sidebarred { display: flex; flex-direction: column !important; }
    .sidebar { display: none !important; }

    /* Clean List Items */
    #browse-script-list { display: grid; gap: 1rem; }
    #browse-script-list li {
      background: var(--bg-1); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 1.5rem; transition: 0.2s;
    }
    #browse-script-list li:hover { border-color: var(--accent); background: var(--bg-2); }

    /* Control Bar Spacing */
    #gf-control-bar {
      display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;
      background: var(--bg-1); padding: 1rem; border: 1px solid var(--border);
      border-radius: var(--radius); margin-bottom: 1.5rem;
    }

    /* Scroll Top */
    #gf-scroll-top {
      position: fixed; bottom: 2rem; right: 2rem; width: 45px; height: 45px;
      background: var(--bg-2); border: 1px solid var(--border); border-radius: 50%;
      color: var(--text-1); cursor: pointer; opacity: 0; transition: 0.3s;
    }
    #gf-scroll-top.show { opacity: 1; transform: translateY(0); }
  `,
  );

  // ── Features ─────────────────────────────────────────────────────────────

  function setupControlBar() {
    const main = $(".sidebarred-main-content");
    if (!main || $("#gf-control-bar")) return;

    const scripts = $$("#browse-script-list li[data-script-id]");
    if (!scripts.length) return;

    const maxDaily = Math.max(
      100,
      ...scripts.map((li) => parseInt(li.dataset.scriptDailyInstalls) || 0),
    );
    const maxTotal = Math.max(
      1000,
      ...scripts.map((li) => parseInt(li.dataset.scriptTotalInstalls) || 0),
    );

    const bar = document.createElement("div");
    bar.id = "gf-control-bar";

    // Create Sort Section
    const sortWrap = document.createElement("div");
    sortWrap.className = "cb-section";
    const select = document.createElement("select");
    const currentSort = new URL(location.href).searchParams.get("sort") || "";

    CONFIG.sortOptions.forEach((opt) => {
      const o = new Option(opt.label, opt.value);
      if (opt.value === currentSort) o.selected = true;
      select.add(o);
    });

    select.onchange = () => {
      const url = new URL(location.href);
      select.value
        ? url.searchParams.set("sort", select.value)
        : url.searchParams.delete("sort");
      location.href = url.href;
    };

    sortWrap.append("Sort: ", select);
    bar.append(sortWrap);

    // Filter Logic
    const createFilter = (label, max, dataKey) => {
      const wrap = document.createElement("div");
      wrap.className = "cb-section";
      const input = Object.assign(document.createElement("input"), {
        type: "range",
        min: 0,
        max: 100,
        value: 0,
      });
      const valDisplay = document.createElement("span");
      valDisplay.className = "slider-value";
      valDisplay.textContent = "0";

      input.oninput = () => {
        const threshold = Math.round(
          max * Math.pow(input.value / 100, CONFIG.logPower),
        );
        valDisplay.textContent = formatNumber(threshold);

        let visibleCount = 0;
        scripts.forEach((li) => {
          const val = parseInt(li.dataset[dataKey]) || 0;
          // Note: This logic assumes a single filter for simplicity,
          // but you can combine them by reading both slider values inside this loop.
          li.style.display = val >= threshold ? "" : "none";
          if (li.style.display === "") visibleCount++;
        });
        $("#gf-visible-count").textContent = visibleCount;
      };

      wrap.append(`${label} ≥ `, input, valDisplay);
      return wrap;
    };

    bar.append(createFilter("Daily", maxDaily, "scriptDailyInstalls"));
    bar.append(createFilter("Total", maxTotal, "scriptTotalInstalls"));

    const stats = document.createElement("div");
    stats.innerHTML = `<strong id="gf-visible-count">${scripts.length}</strong> / ${scripts.length} scripts`;
    bar.append(stats);

    main.prepend(bar);
  }

  function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      if (e.target.matches("input, textarea, [contenteditable]")) return;

      const key = e.key.toLowerCase();
      if (key === "/") {
        e.preventDefault();
        $('input[type="search"], input[name="q"]')?.focus();
      } else if (key === "g") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (key === "i") {
        $(".install-link")?.click();
      }
    });
  }

  function setupScrollTop() {
    const btn = document.createElement("button");
    btn.id = "gf-scroll-top";
    btn.textContent = "↑";
    btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.appendChild(btn);

    window.addEventListener(
      "scroll",
      () => {
        btn.classList.toggle("show", window.scrollY > 400);
      },
      { passive: true },
    );
  }

  // ── Initialization ───────────────────────────────────────────────────────

  const init = () => {
    document.documentElement.classList.add("gf-ready");

    // Auto-expand sections
    $$(".expandable.collapsed").forEach((el) => {
      el.classList.remove("collapsed");
      el.style.maxHeight = "none";
    });
    $$(".expander").forEach((el) => (el.style.display = "none"));

    setupScrollTop();
    setupKeyboardShortcuts();
    if ($("#browse-script-list")) setupControlBar();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
