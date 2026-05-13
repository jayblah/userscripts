// ==UserScript==
// @name         Greasy Fork UI Improvements
// @namespace    https://greasyfork.org/
// @version      2.8.1
// @description  Deep dark theme and wide layout for Greasy Fork
// @author       quantavil
// @match        https://greasyfork.org/*
// @match        https://*.greasyfork.org/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    bgBase: "#13131a",
    accent: "#34d474",
    width: "860px",
    logPower: 3,
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
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  const injectStyle = (id, css) => {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  };

  // ── Styles ───────────────────────────────────────────────────────────────
  document.documentElement.style.background = CONFIG.bgBase;

  injectStyle(
    "gf-critical",
    `
    html { background: ${CONFIG.bgBase} !important; }
    html:not(.gf-ready) body { opacity: 0 !important; visibility: hidden !important; }
    html.gf-ready body { opacity: 1 !important; transition: opacity 0.12s ease-out !important; }
  `,
  );

  injectStyle(
    "gf-main-styles",
    `
    :root {
      --bg-0: #13131a; --bg-1: #1c1c26; --bg-2: #252530; --bg-3: #2e2e3c;
      --border: #38384a; --text-1: #f4f4f6; --text-2: #b8b8c8; --text-3: #8888a0;
      --accent: ${CONFIG.accent}; --accent-dim: rgba(52, 212, 116, 0.12);
      --radius: 6px;
    }

    body { background: var(--bg-0) !important; color: var(--text-1) !important; font-family: sans-serif; line-height: 1.6; }

    /* Layout Restoration */
    .width-constraint { max-width: ${CONFIG.width} !important; margin: 0 auto !important; padding: 24px 32px !important; }
    .sidebarred { display: block !important; }
    .sidebar, .open-sidebar, .ad-entry, .ethical-ads { display: none !important; }

    /* Header & Nav */
    #main-header { background: var(--bg-1) !important; border-bottom: 1px solid var(--border) !important; position: sticky; top: 0; z-index: 1000; }
    #site-nav nav > li > a { color: var(--text-2) !important; padding: 8px 14px; border-radius: var(--radius); }
    #site-nav nav > li.scripts-index-link > a { background: var(--accent-dim); color: var(--accent) !important; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: var(--bg-0); }
    ::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 5px; }

    /* Script Cards */
    #browse-script-list li {
      background: var(--bg-1); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px 24px; margin-bottom: 12px; list-style: none;
    }
    #browse-script-list li:hover { border-color: var(--accent); background: var(--bg-2); }
  `,
  );

  // ── Features ─────────────────────────────────────────────────────────────
  function setupControlBar() {
    const main = $(".sidebarred-main-content");
    if (!main || $("#gf-control-bar")) return;

    const scripts = $$("#browse-script-list li[data-script-id]");
    if (!scripts.length) return;

    const bar = document.createElement("div");
    bar.id = "gf-control-bar";
    bar.style.cssText =
      "display:flex; gap:16px; background:var(--bg-1); padding:16px; border:1px solid var(--border); border-radius:var(--radius); margin-bottom:20px; align-items:center; flex-wrap:wrap;";

    // Sort Dropdown
    const currentSort = new URL(location.href).searchParams.get("sort") || "";
    const sortHTML = CONFIG.sortOptions
      .map(
        (o) =>
          `<option value="${o.value}" ${o.value === currentSort ? "selected" : ""}>${o.label}</option>`,
      )
      .join("");

    bar.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:12px; color:var(--text-3); text-transform:uppercase;">Sort</span>
        <select id="gf-sort-select">${sortHTML}</select>
      </div>
      <div style="margin-left:auto; font-size:13px; color:var(--text-3);">
        <strong id="gf-count" style="color:var(--accent);">${scripts.length}</strong> / ${scripts.length} scripts
      </div>
    `;

    main.prepend(bar);

    $("#gf-sort-select", bar).onchange = (e) => {
      const url = new URL(location.href);
      e.target.value
        ? url.searchParams.set("sort", e.target.value)
        : url.searchParams.delete("sort");
      location.href = url.href;
    };
  }

  const init = () => {
    document.documentElement.classList.add("gf-ready");
    if ($("#browse-script-list")) setupControlBar();

    // Auto-expand
    $$(".expandable.collapsed").forEach((el) => {
      el.classList.remove("collapsed");
      el.style.maxHeight = "none";
    });
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
