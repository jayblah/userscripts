// ==UserScript==
// @name         Greasy Fork Enhanced UI
// @namespace    https://greasyfork.org/
// @version      3.2.2
// @description  Clean, minimal dark theme for Greasy Fork with centered landing search, inline sorting, integrated search, converted 0..5 star ratings, increased content font sizes, properly stacked description rows, and hidden install help icons.
// @license      MIT
// @match        https://greasyfork.org/*
// @match        https://*.greasyfork.org/*
// @match        https://sleazyfork.org/*
// @match        https://*.sleazyfork.org/*
// @icon         https://greasyfork.org/vite/assets/blacklogo96-CxYTSM_T.png
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/GreasyForkUI.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/GreasyForkUI.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        GM_notification
// @connect      sleazyfork.org
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  // ── Constants ────────────────────────────────────────────────────────────
  const BG_BASE = "#13131a";

  const SORT_OPTIONS = [
    { value: "", label: "Daily Installs" },
    { value: "total_installs", label: "Total Installs" },
    { value: "ratings", label: "Ratings" },
    { value: "created", label: "Created Date" },
    { value: "updated", label: "Updated Date" },
    { value: "name", label: "Name" },
  ];

  // ── FOUC Prevention ──────────────────────────────────────────────────────
  document.documentElement.style.background = BG_BASE;

  injectStyle(
    "gf-critical",
    `
        html { background: ${BG_BASE} !important; }
        html:not(.gf-ready) body {
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
        html:not(.gf-ready)::before {
            content: '';
            position: fixed;
            inset: 0;
            background: ${BG_BASE};
            z-index: 999999;
        }
        html.gf-ready body {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
            transition: opacity 0.12s ease-out !important;
        }
    `,
  );

  // ── Main CSS ─────────────────────────────────────────────────────────────
  injectStyle(
    "gf-main-styles",
    `
        :root {
            --bg-0: #13131a;
            --bg-1: #1c1c26;
            --bg-2: #252530;
            --bg-3: #2e2e3c;
            --border:       #38384a;
            --border-hover: #4a4a60;
            --text-1: #f4f4f6;
            --text-2: #b8b8c8;
            --text-3: #8888a0;
            --accent:       #34d474;
            --accent-hover: #28b860;
            --accent-dim:   rgba(52, 212, 116, 0.12);
            --accent-glow:  rgba(52, 212, 116, 0.25);
            --red:    #f87171;
            --yellow: #fde047;
            --purple: #c084fc;
            --radius: 6px;
            --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --mono: ui-monospace, 'SF Mono', Consolas, monospace;
        }

        html, body { background: var(--bg-0) !important; color: var(--text-1) !important; font-family: var(--font) !important; }
        body { font-size: 15px; line-height: 1.6; }
        a { color: var(--accent); text-decoration: none; transition: color 0.15s; }
        a:hover { color: var(--accent-hover); }
        ::selection { background: var(--accent-glow); color: var(--text-1); }

        ::-webkit-scrollbar       { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: var(--bg-0); }
        ::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-3); }

        .ad-entry, .ad, #script-list-ea, .ethical-ads, [data-ea-publisher],
        #script-list-option-groups, .list-option-groups, .sidebar,
        .language-selector, .language-selector-locale, .language-selector-submit {
            display: none !important;
            height: 0 !important;
            width: 0 !important;
            overflow: hidden !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        .script-meta-block,
        #browse-script-list .inline-script-stats {
            display: none !important;
        }

        #main-header {
            background: var(--bg-1) !important;
            border-bottom: 1px solid var(--border) !important;
            position: sticky !important;
            top: 0;
            z-index: 1000;
        }
        #main-header > .width-constraint {
            max-width: 1720px;
            margin: 0 auto;
            padding: 12px 32px !important;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: none !important;
            border: none !important;
            background: transparent !important;
        }
        #site-name { display: flex; align-items: center; gap: 12px; }
        #site-name img { width: 36px !important; height: 36px !important; transition: transform 0.2s; }
        #site-name:hover img { transform: scale(1.05); }
        #site-name-text h1 { margin: 0; font-size: 20px; font-weight: 700; }
        #site-name-text h1 a { color: var(--text-1) !important; }

        #site-nav { display: flex; align-items: center; gap: 8px; }
        #site-nav nav { display: flex; align-items: center; gap: 4px; list-style: none; margin: 0; padding: 0; }
        #site-nav nav > li { position: relative; }

        #site-nav nav > li > a,
        #site-nav nav > li > .sign-in-link a {
            display: block;
            padding: 8px 14px;
            border-radius: var(--radius);
            color: var(--text-2) !important;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.15s;
        }
        #site-nav nav > li > a:hover,
        #site-nav nav > li > .sign-in-link a:hover {
            background: var(--bg-2);
            color: var(--text-1) !important;
        }
        #site-nav nav > li.scripts-index-link > a { background: var(--accent-dim); color: var(--accent) !important; }

        #site-nav nav > li.with-submenu > nav {
            position: absolute;
            top: calc(100% + 4px);
            right: 0;
            background: var(--bg-2);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 6px;
            min-width: 170px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-8px);
            transition: all 0.2s;
            z-index: 100;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        #site-nav nav > li.with-submenu:hover > nav { opacity: 1; visibility: visible; transform: translateY(0); }
        #site-nav nav > li.with-submenu > nav > li > a {
            display: block;
            padding: 8px 12px;
            border-radius: 4px;
            color: var(--text-2) !important;
            font-size: 13px;
        }
        #site-nav nav > li.with-submenu > nav > li > a:hover { background: var(--bg-3); color: var(--text-1) !important; }

        #nav-user-info { display: flex; align-items: center; gap: 12px; font-size: 14px; }
        #nav-user-info .notification-widget {
            padding: 4px 10px;
            background: var(--red);
            color: #fff !important;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        #nav-user-info .user-profile-link a { color: var(--text-1) !important; font-weight: 500; }
        #nav-user-info .sign-out-link a    { color: var(--text-3) !important; font-size: 13px; }

        #mobile-nav { display: none !important; }

        .width-constraint,
        #main-container,
        body > .width-constraint,
        html body div.width-constraint,
        #script-info {
            max-width: 1720px !important;
            width: 100% !important;
            margin: 0 auto !important;
            padding: 24px 32px !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            background: transparent !important;
        }

        #script-info {
            padding: 0 !important;
            background: var(--bg-1) !important;
            border: 1px solid var(--border) !important;
            border-radius: var(--radius) !important;
            overflow: hidden !important;
        }

        .sidebarred {
            display: grid !important;
            grid-template-columns: 1fr 300px !important;
            gap: 24px !important;
            max-width: 100% !important;
            width: 100% !important;
        }
        body:has(#browse-script-list) .sidebarred {
            grid-template-columns: 1fr !important;
        }

        .sidebarred-main-content, .text-content {
            max-width: 100% !important;
            width: 100% !important;
            flex: 1 !important;
            font-size: 17px !important;
            line-height: 1.7 !important;
        }

        .super-title {
            font-size: 28px !important;
            font-weight: 700 !important;
            color: var(--text-1) !important;
            margin: 12px 0 24px 0 !important;
        }

        /* ── Centered Home Landing Clean Setup (Strict Override) ── */
        body:not(:has(#browse-script-list)):not(:has(#script-info)) .width-constraint,
        body:not(:has(#browse-script-list)):not(:has(#script-info)) .text-content {
            background: #13131a !important;
            border: none !important;
            border-width: 0px !important;
            box-shadow: none !important;
            max-width: 100% !important;
            width: 100% !important;
        }

        body:not(:has(#browse-script-list)):not(:has(#script-info)) .super-title {
            display: none !important;
        }

        body:not(:has(#browse-script-list)):not(:has(#script-info)) #home-script-nav {
            background: #13131a !important;
            border: none !important;
            border-style: none !important;
            border-width: 0px !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 80px auto 0 auto !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 24px !important;
            max-width: 650px !important;
            width: 100% !important;
        }

        .home-search {
            display: flex !important;
            gap: 8px !important;
            width: 100% !important;
            margin: 0 !important;
        }
        .home-search input[type="search"] {
            flex: 1 !important;
            height: 48px !important;
            font-size: 16px !important;
            background: var(--bg-1) !important;
        }
        .home-search .search-submit {
            height: 48px !important;
            padding: 0 24px !important;
            font-size: 16px !important;
            background: var(--bg-3) !important;
        }
        #home-top-sites {
            font-size: 14.5px !important;
            color: var(--text-3) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-wrap: wrap !important;
            gap: 8px 12px !important;
            width: 100% !important;
        }
        #home-top-sites a {
            color: var(--text-2) !important;
            background: var(--bg-1) !important;
            padding: 5px 14px !important;
            border-radius: 20px !important;
            font-weight: 500 !important;
            transition: all 0.15s ease !important;
            border: 1px solid var(--border) !important;
        }
        #home-top-sites a:hover {
            color: var(--accent) !important;
            background: var(--accent-dim) !important;
            border-color: var(--accent) !important;
        }

        /* ── Regular Browser Views ── */
        #browse-script-list {
            list-style: none !important;
            padding: 0 !important;
            margin: 0 !important;
            display: flex;
            flex-direction: column;
            gap: 12px;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            background: transparent !important;
        }
        #browse-script-list > li {
            background: var(--bg-1);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 20px 24px;
            transition: border-color 0.2s, background 0.2s;
        }
        #browse-script-list > li:hover { border-color: var(--accent); background: var(--bg-2); }

        #browse-script-list article h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            display: grid !important;
            grid-template-columns: auto 1fr;
            align-items: center;
            gap: 6px 12px;
        }
        #browse-script-list article h2 .script-link {
            grid-column: 1;
            color: var(--text-1) !important;
        }
        #browse-script-list article h2 .script-link:hover {
            color: var(--accent)  !important;
        }
        #browse-script-list article h2 .badge {
            grid-column: 2;
            justify-self: start;
        }

        #script-info > header h2 {
            margin: 0 0 12px 0;
            font-size: 26px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .badge     { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .badge-js  { background: var(--accent-dim); color: var(--accent); }
        .badge-css { background: rgba(192, 132, 252, 0.15); color: var(--purple); }

        .name-description-separator { display: none !important; }

        .script-description {
            grid-column: 1 / -1 !important;
            grid-row: 2 !important;
            color: var(--text-2) !important;
            font-size: 15.5px;
            margin: 4px 0 6px 0 !important;
            font-weight: 400;
        }

        .gf-custom-stats-row {
            grid-column: 1 / -1 !important;
            grid-row: 3 !important;
            display: flex !important;
            align-items: center !important;
            gap: 16px !important;
            margin: 4px 0 0 0 !important;
            font-size: 14.5px !important;
            font-weight: 500 !important;
            color: var(--text-2) !important;
        }
        .gf-custom-stat-item {
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }

        .rating-link {
            text-decoration: none !important;
            color: inherit !important;
            display: inline-flex !important;
            align-items: center;
        }
        .rating-box {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .rating-num {
            font-weight: 700 !important;
            color: #ffffff !important;
            font-size: 14.5px;
        }
        .star-outer {
            position: relative;
            display: inline-block;
            font-size: 15px;
            color: #38384a;
            letter-spacing: 0.5px;
            vertical-align: middle;
        }
        .star-outer::before { content: '★★★★★'; }
        .star-inner {
            position: absolute;
            top: 0; left: 0;
            white-space: nowrap;
            overflow: hidden;
            color: #f39c12;
        }
        .star-inner::before { content: '★★★★★'; }
        .rating-total {
            color: var(--text-3);
            font-size: 13.5px;
        }

        .pagination, .pagy.series-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-top: 28px;
            padding-top: 24px;
            border-top: 1px solid var(--border);
        }
        .pagination a, .pagination span, .pagination em,
        .pagy.series-nav a, .pagy.series-nav [role="link"] {
            min-width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-1);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-2) !important;
            font-size: 15px;
            font-weight: 500;
            font-style: normal;
            transition: all 0.15s;
        }
        .pagination a:hover, .pagy.series-nav a:hover {
            border-color: var(--accent);
            color: var(--accent) !important;
            background: var(--accent-dim);
        }
        .pagination .current, .pagination em.current,
        .pagy.series-nav [aria-current="page"] {
            background: var(--accent) !important;
            border-color: var(--accent) !important;
            color: #000 !important;
            font-weight: 600;
        }
        .pagination .disabled, .pagy.series-nav [aria-disabled="true"] {
            opacity: 0.35;
            pointer-events: none;
        }

        #script-info > header { padding: 28px; border-bottom: 1px solid var(--border); }
        #script-info #script-description { color: var(--text-2); font-size: 17.5px; margin: 0; }
        #script-content { padding: 28px; font-size: 17px !important; }

        #script-links.tabs {
            display: flex !important;
            align-items: center;
            flex-wrap: wrap;
            margin: 0 !important;
            padding: 6px 16px !important;
            list-style: none;
            background: #1c1c26 !important;
            border-bottom: 1px solid var(--border) !important;
            box-sizing: border-box !important;
            width: 100% !important;
            gap: 4px;
        }
        #script-links.tabs li { flex-shrink: 0; }
        #script-links.tabs li span,
        #script-links.tabs li a span {
            display: block;
            padding: 8px 16px;
            font-size: 14px;
            font-weight: 500;
            color: var(--text-2);
            white-space: nowrap;
            transition: all 0.15s ease;
            border-radius: 4px;
        }
        #script-links.tabs li a:hover span { color: var(--text-1); background: var(--bg-3); }

        #script-links.tabs li.current { background: none !important; border: none !important; margin: 0 !important; }
        #script-links.tabs li.current span {
            background: var(--accent-dim) !important;
            color: var(--accent) !important;
            font-weight: 600;
        }

        #script-links.tabs #script-feedback-suggestion {
            margin-left: auto !important;
            margin-bottom: 0 !important;
            background: none !important;
            border: none !important;
            padding: 0 12px 0 0 !important;
            font-size: 13px !important;
            color: var(--text-3) !important;
            display: inline-flex;
            align-items: center;
        }
        #script-links.tabs #script-feedback-suggestion a {
            color: var(--text-2) !important;
            transition: color 0.15s;
        }
        #script-links.tabs #script-feedback-suggestion a:hover {
            color: var(--accent) !important;
        }

        #script-links.tabs #install-area {
            margin-left: 0 !important;
            margin-bottom: 0 !important;
            display: inline-flex;
            align-items: center;
            padding: 0 !important;
        }
        #script-links.tabs #install-area .install-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 16px;
            background: var(--accent);
            color: #000 !important;
            font-size: 13.5px;
            font-weight: 700;
            border-radius: 4px;
            transition: all 0.2s;
            line-height: 1.4;
        }
        #script-links.tabs #install-area .install-link::before { content: '↓'; font-size: 14px; font-weight: 700; }
        #script-links.tabs #install-area .install-link:hover { background: var(--accent-hover); transform: translateY(-1px); }

        #install-area .install-help-link {
            display: none !important;
        }

        .script-show-applies-to .block-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .script-show-applies-to .block-list.expandable { max-height: none !important; height: auto !important; }
        .script-show-applies-to .block-list li a {
            display: inline-block;
            padding: 6px 14px;
            background: var(--bg-3);
            border-radius: 20px;
            font-size: 13px;
            color: var(--text-2) !important;
        }
        .script-show-applies-to .block-list li a:hover { background: var(--accent-dim); color: var(--accent) !important; }
        .script-show-applies-to .expander { display: none !important; }

        #additional-info {
            padding: 24px;
            background: var(--bg-2);
            border-radius: var(--radius);
            margin-top: 24px;
            font-size: 17px;
            line-height: 1.7;
            color: var(--text-2);
        }
        #additional-info p         { margin: 0 0 16px 0; }
        #additional-info p:last-child { margin-bottom: 0; }
        #additional-info a         { color: var(--accent) !important; }
        #additional-info strong    { color: var(--text-1); font-weight: 600; }
        #additional-info code {
            padding: 3px 8px;
            background: var(--bg-1);
            border-radius: 4px;
            font-family: var(--mono);
            font-size: 14px;
            color: var(--accent);
        }
        #additional-info pre {
            padding: 16px;
            background: var(--bg-1);
            border-radius: var(--radius);
            overflow-x: auto;
            margin: 0 0 16px 0;
        }
        #additional-info pre code  { padding: 0; background: none; color: var(--text-1); }
        #additional-info img       { max-width: 100%; border-radius: var(--radius); margin: 16px 0; }

        .user-screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 20px; }
        .user-screenshots a { display: block; border-radius: var(--radius); overflow: hidden; border: 1px solid var(--border); transition: all 0.2s; }
        .user-screenshots a:hover { border-color: var(--accent); transform: scale(1.02); }
        .user-screenshots img { width: 100%; display: block; margin: 0 !important; }

        #gf-control-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            margin-bottom: 20px;
            padding: 12px 18px;
            background: var(--bg-1);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            box-sizing: border-box !important;
            width: 100% !important;
        }
        #gf-control-bar .cb-section { display: flex; align-items: center; gap: 14px; }
        #gf-control-bar .cb-label {
            font-size: 12px;
            font-weight: 700;
            color: var(--text-3);
            text-transform: uppercase;
            letter-spacing: 0.8px;
            white-space: nowrap;
        }
        #gf-control-bar .sort-options-container { display: flex; gap: 6px; flex-wrap: wrap; }
        #gf-control-bar .sort-item {
            background: var(--bg-2);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 6px 14px;
            font-size: 14px;
            color: var(--text-2);
            cursor: pointer;
            transition: all 0.15s ease;
        }
        #gf-control-bar .sort-item:hover {
            border-color: var(--border-hover);
            color: var(--text-1);
            background: var(--bg-3);
        }
        #gf-control-bar .sort-item.active {
            background: var(--accent-dim);
            border-color: var(--accent);
            color: var(--accent);
            font-weight: 600;
        }

        #gf-control-bar .cb-search-form {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 0;
        }
        #gf-control-bar .cb-search-input {
            width: 260px !important;
            padding: 6px 14px !important;
            font-size: 14px !important;
            height: 36px !important;
            box-sizing: border-box !important;
        }
        #gf-control-bar .cb-search-submit {
            padding: 0 14px !important;
            height: 36px !important;
            font-size: 14px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: var(--bg-2) !important;
        }

        #gf-scroll-top {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 44px;
            height: 44px;
            background: var(--bg-2);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            color: var(--text-2);
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999;
            opacity: 0;
            visibility: hidden;
            transform: translateY(10px);
            transition: all 0.2s;
        }
        #gf-scroll-top.show { opacity: 1; visibility: visible; transform: translateY(0); }
        #gf-scroll-top:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }

        input[type="text"], input[type="search"], input[type="email"],
        input[type="password"], textarea, select {
            background: var(--bg-2) !important;
            border: 1px solid var(--border) !important;
            border-radius: var(--radius) !important;
            color: var(--text-1) !important;
            padding: 10px 14px !important;
            font-size: 15px !important;
            outline: none !important;
            transition: border-color 0.15s !important;
        }
        input:focus, textarea:focus, select:focus { border-color: var(--accent) !important; }
        button, input[type="submit"], .button {
            background: var(--bg-3) !important;
            border: 1px solid var(--border) !important;
            border-radius: var(--radius) !important;
            color: var(--text-1) !important;
            padding: 10px 18px !important;
            font-size: 15px !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            transition: all 0.15s !important;
        }
        button:hover, input[type="submit"]:hover, .button:hover {
            background: var(--bg-2) !important;
            border-color: var(--border-hover) !important;
        }

        @media (max-width: 900px) {
            #script-links.tabs { flex-direction: column; align-items: flex-start; gap: 8px; }
            #script-links.tabs #script-feedback-suggestion { margin-left: 0 !important; padding: 4px 0 !important; }
        }
        @media (max-width: 768px) {
            #main-header > .width-constraint { padding: 10px 16px !important; }
            #site-nav    { display: none; }
            #mobile-nav  { display: block !important; }
            .width-constraint { padding: 16px !important; }
            #browse-script-list > li { padding: 16px 18px; }
            #browse-script-list article h2 { font-size: 17px; }
            #script-info > header  { padding: 20px; }
            #script-content { padding: 20px; }
            #gf-control-bar { padding: 12px; flex-direction: column; align-items: stretch; gap: 12px; }
            #gf-control-bar .cb-search-input { width: 100% !important; }
            body:not(:has(#browse-script-list)):not(:has(#script-info)) #home-script-nav { padding: 0 16px !important; margin: 40px auto 0 auto !important; }
            .home-search { flex-direction: column; }
        }
        @media (max-width: 480px) {
            #script-links.tabs {
                flex-wrap: nowrap;
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
                scrollbar-width: none;
            }
            #script-links.tabs::-webkit-scrollbar { display: none; }
        }

        #pagetual-sideController, .umdl-fab, .umdl-pick, .umdl-toast,
        .sae-bubble, .sae-palette { display: none !important; }
    `,
  );

  // ── Helpers ──────────────────────────────────────────────────────────────
  function injectStyle(id, cssText) {
    const el = document.createElement("style");
    el.id = id;
    el.textContent = cssText;
    (document.head || document.documentElement).appendChild(el);
  }

  function revealPage() {
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.documentElement.classList.add("gf-ready"),
      ),
    );
  }

  const incrementVisibility = () => {
    let views = parseInt(localStorage.getItem("star_rating_views") || "0", 10);
    views++;
    localStorage.setItem("star_rating_views", views);

    if (views === 2500) {
      const donationUrl =
        typeof GM_info !== "undefined"
          ? GM_info.script.header.match(/@contributionURL\s+(.+)/)?.[1]
          : "https://www.paypal.com/donate?hosted_button_id=BYW9D395KJWZ2";

      GM_notification({
        title: "☕ Support Wack.3gp",
        text: `You've viewed ${views} script ratings! Enjoying the star display? Click here to buy me a coffee.`,
        image: "https://greasyfork.org/vite/assets/blacklogo96-CxYTSM_T.png",
        timeout: 10000,
        onclick: function () {
          window.open(donationUrl, "_blank");
        },
      });
      localStorage.setItem("star_rating_views", "0");
    }
  };

  const checkLinkBridge = function (container) {
    if (!window.location.hostname.includes("sleazyfork.org")) return;

    const scriptLink = container.querySelector(".script-link");
    if (!scriptLink || scriptLink.dataset.bridgeChecked) return;

    scriptLink.dataset.bridgeChecked = "true";

    GM_xmlhttpRequest({
      method: "HEAD",
      url: scriptLink.href,
      onload: function (response) {
        if (response.status === 404) {
          const allLinks = container.getElementsByTagName("a");
          for (const a of allLinks) {
            const href = a.getAttribute("href");
            if (href) {
              if (href.startsWith("/")) {
                a.href = "https://greasyfork.org" + href;
              } else if (href.includes("sleazyfork.org")) {
                a.href = href.replace("sleazyfork.org", "greasyfork.org");
              }
            }
          }
        }
      },
    });
  };

  // ── Combined Core Engine: Processing & Mapping Ratings ───────────────────
  function processMetricsAndRelocate() {
    const listItems = document.querySelectorAll(
      "#browse-script-list > li, article",
    );
    if (listItems.length) {
      listItems.forEach((container) => {
        const targetHeader = container.querySelector("h2");
        if (!targetHeader || targetHeader.querySelector(".gf-custom-stats-row"))
          return;

        checkLinkBridge(container);

        const goodEl = container.querySelector(".good-rating-count");
        const okEl = container.querySelector(".ok-rating-count");
        const badEl = container.querySelector(".bad-rating-count");

        let starRatingHtml = "";
        if (goodEl || okEl || badEl) {
          incrementVisibility();

          let feedbackUrl = "#";
          const allLinks = container.getElementsByTagName("a");
          for (let i = 0; i < allLinks.length; i++) {
            const match = allLinks[i].href.match(/\/scripts\/(\d+)/);
            if (match) {
              feedbackUrl =
                allLinks[i].href.split("/scripts/")[0] +
                "/scripts/" +
                match[1] +
                "/feedback";
              break;
            }
          }

          const good = parseInt(goodEl?.textContent ?? 0, 10) || 0;
          const ok = parseInt(okEl?.textContent ?? 0, 10) || 0;
          const bad = parseInt(badEl?.textContent ?? 0, 10) || 0;
          const total = good + ok + bad;
          const avg = total > 0 ? (good * 5 + ok * 3 + bad * 1) / total : 0;
          const percent = (avg / 5) * 100;

          starRatingHtml = `
                <a href="${feedbackUrl}" class="rating-link" title="Feedback (Avg: ${avg.toFixed(2)})">
                    <div class="rating-box">
                        <span class="rating-num">${avg.toFixed(2)}</span>
                        <div class="star-outer"><div class="star-inner" style="width: ${percent}%"></div></div>
                        <span class="rating-total">(${total.toLocaleString()})</span>
                    </div>
                </a>
            `;
        }

        const totalInstalls =
          container.querySelector(
            ".script-list-total-installs + dd, dd.script-list-total-installs",
          )?.innerHTML || "";
        const updatedDate =
          container.querySelector(
            ".script-list-updated-date + dd, dd.script-list-updated-date",
          )?.innerHTML || "";

        if (totalInstalls || starRatingHtml || updatedDate) {
          const statsRow = document.createElement("span");
          statsRow.className = "gf-custom-stats-row";
          statsRow.innerHTML = `
            ${totalInstalls ? `<span class="gf-custom-stat-item">📊 <span>${totalInstalls}</span></span>` : ""}
            ${starRatingHtml ? `<span class="gf-custom-stat-item">⭐ ${starRatingHtml}</span>` : ""}
            ${updatedDate ? `<span class="gf-custom-stat-item">🔄 <span>${updatedDate}</span></span>` : ""}
          `;
          targetHeader.appendChild(statsRow);
        }
      });
    }

    const scriptInfoHeader = document.querySelector("#script-info > header");
    if (scriptInfoHeader) {
      const targetHeader = scriptInfoHeader.querySelector("h2");
      const metaBlock = document.querySelector(".script-meta-block");

      if (
        targetHeader &&
        metaBlock &&
        !targetHeader.querySelector(".gf-custom-stats-row")
      ) {
        const goodEl = metaBlock.querySelector(".good-rating-count");
        const okEl = metaBlock.querySelector(".ok-rating-count");
        const badEl = metaBlock.querySelector(".bad-rating-count");

        let starRatingHtml = "";
        if (goodEl || okEl || badEl) {
          let feedbackUrl = "#";
          const urlMatch = window.location.pathname.match(/\/scripts\/(\d+)/);
          if (urlMatch) {
            feedbackUrl =
              window.location.origin +
              window.location.pathname.split("/scripts/")[0] +
              "/scripts/" +
              urlMatch[1] +
              "/feedback";
          }

          const good = parseInt(goodEl?.textContent ?? 0, 10) || 0;
          const ok = parseInt(okEl?.textContent ?? 0, 10) || 0;
          const bad = parseInt(badEl?.textContent ?? 0, 10) || 0;
          const total = good + ok + bad;
          const avg = total > 0 ? (good * 5 + ok * 3 + bad * 1) / total : 0;
          const percent = (avg / 5) * 100;

          starRatingHtml = `
                <a href="${feedbackUrl}" class="rating-link" title="Feedback (Avg: ${avg.toFixed(2)})">
                    <div class="rating-box">
                        <span class="rating-num">${avg.toFixed(2)}</span>
                        <div class="star-outer"><div class="star-inner" style="width: ${percent}%"></div></div>
                        <span class="rating-total">(${total.toLocaleString()})</span>
                    </div>
                </a>
            `;
        }

        const totalInstalls =
          metaBlock.querySelector(
            ".script-list-total-installs + dd, dd.script-list-total-installs",
          )?.innerHTML || "";
        const updatedDate =
          metaBlock.querySelector(
            ".script-list-updated-date + dd, dd.script-list-updated-date",
          )?.innerHTML || "";

        if (totalInstalls || starRatingHtml || updatedDate) {
          const statsRow = document.createElement("span");
          statsRow.className = "gf-custom-stats-row";
          statsRow.innerHTML = `
            ${totalInstalls ? `<span class="gf-custom-stat-item">📊 <span>${totalInstalls}</span></span>` : ""}
            ${starRatingHtml ? `<span class="gf-custom-stat-item">⭐ ${starRatingHtml}</span>` : ""}
            ${updatedDate ? `<span class="gf-custom-stat-item">🔄 <span>${updatedDate}</span></span>` : ""}
          `;
          targetHeader.appendChild(statsRow);
        }
      }
    }
  }

  function cleanHomeLayoutPanel() {
    const homeNav = document.getElementById("home-script-nav");
    if (!homeNav) return;

    let nextEl = homeNav.nextElementSibling;
    while (nextEl) {
      const toRemove = nextEl;
      nextEl = nextEl.nextElementSibling;
      toRemove.remove();
    }
  }

  function relocateUserNavItems() {
    const navContainer = document.querySelector("#site-nav nav");
    const signInLink = document.querySelector("#nav-user-info .sign-in-link");

    if (
      navContainer &&
      signInLink &&
      !navContainer.querySelector(".gf-relocated-signin")
    ) {
      const wrapperLi = document.createElement("li");
      wrapperLi.className = "gf-relocated-signin";
      wrapperLi.appendChild(signInLink);
      navContainer.appendChild(wrapperLi);
    }
  }

  function relocateProfileHeaderActions() {
    const tabs = document.querySelector("#script-links.tabs");
    if (!tabs) return;

    const feedbackSuggestion = document.getElementById(
      "script-feedback-suggestion",
    );
    const installArea = document.getElementById("install-area");

    if (feedbackSuggestion && feedbackSuggestion.parentElement !== tabs) {
      tabs.appendChild(feedbackSuggestion);
    }
    if (installArea && installArea.parentElement !== tabs) {
      tabs.appendChild(installArea);
    }
  }

  function addScrollTop() {
    if (document.getElementById("gf-scroll-top")) return;

    const btn = Object.assign(document.createElement("button"), {
      id: "gf-scroll-top",
      innerHTML: "↑",
      title: "Scroll to top (G)",
      onclick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
    });
    document.body.appendChild(btn);

    window.addEventListener(
      "scroll",
      () => {
        btn.classList.toggle("show", window.scrollY > 400);
      },
      { passive: true },
    );
  }

  function addControlBar() {
    const main = document.querySelector(".sidebarred-main-content");
    if (!main || document.getElementById("gf-control-bar")) return;

    const scripts = document.querySelectorAll(
      "#browse-script-list li[data-script-id]",
    );
    if (!scripts.length) return;

    const urlParams = new URLSearchParams(window.location.search);
    const currentSort = urlParams.get("sort") ?? "";
    const currentSearchQuery = urlParams.get("q") ?? "";

    const bar = document.createElement("div");
    bar.id = "gf-control-bar";
    bar.innerHTML = `
            <div class="cb-section">
                <span class="cb-label">Sort By</span>
                <div class="sort-options-container">
                    ${SORT_OPTIONS.map(
                      ({ value, label }) => `
                        <div class="sort-item${value === currentSort ? " active" : ""}" data-value="${value}">
                            ${label}
                        </div>
                    `,
                    ).join("")}
                </div>
            </div>
            <form class="cb-search-form" action="${window.location.pathname}" method="get">
                ${currentSort ? `<input type="hidden" name="sort" value="${currentSort}">` : ""}
                <input class="cb-search-input" type="search" name="q" value="${currentSearchQuery.replace(/"/g, "&quot;")}" placeholder="Search scripts">
                <input class="cb-search-submit" type="submit" value="🔎">
            </form>
        `;
    main.prepend(bar);

    bar.querySelectorAll(".sort-item").forEach((item) => {
      item.addEventListener("click", function () {
        const value = this.dataset.value;
        const url = new URL(window.location.href);

        if (value) {
          url.searchParams.set("sort", value);
        } else {
          url.searchParams.delete("sort");
        }
        window.location.href = url.toString();
      });
    });
  }

  function addKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (
        ["INPUT", "TEXTAREA"].includes(e.target.tagName) ||
        e.target.isContentEditable
      )
        return;

      const actions = {
        "/": () => {
          e.preventDefault();
          document
            .querySelector(
              '#gf-control-bar .cb-search-input, input[type="search"], input[name="q"]',
            )
            ?.focus();
        },
        i: () => document.querySelector(".install-link")?.click(),
        g: () => window.scrollTo({ top: 0, behavior: "smooth" }),
      };

      actions[e.key.toLowerCase()]?.();
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    cleanHomeLayoutPanel();
    relocateUserNavItems();
    relocateProfileHeaderActions();
    processMetricsAndRelocate();
    revealPage();

    const collapsed = document.querySelectorAll(".expandable.collapsed");
    for (const el of collapsed) {
      el.style.cssText += "max-height:none;height:auto;";
      el.classList.remove("collapsed");
    }
    const expanders = document.querySelectorAll(".expander");
    for (const el of expanders) {
      el.style.display = "none";
    }

    addScrollTop();
    addKeyboardShortcuts();

    if (document.querySelector("#browse-script-list")) {
      addControlBar();
    }

    let mutationTimeout;
    const observer = new MutationObserver(() => {
      if (mutationTimeout) return;

      mutationTimeout = window.requestAnimationFrame(() => {
        observer.disconnect();
        cleanHomeLayoutPanel();
        relocateUserNavItems();
        relocateProfileHeaderActions();
        processMetricsAndRelocate();
        observer.observe(document.body, { childList: true, subtree: true });
        mutationTimeout = null;
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
