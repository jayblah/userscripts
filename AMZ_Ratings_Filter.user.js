// ==UserScript==
// @name         Amazon Ratings Filtering
// @namespace    http://tampermonkey.net/
// @version      4.3.2
// @description  Display rating scores, add filtering options, and hide sponsored items on Amazon search pages.
// @author       Dave
// @match        https://*.amazon.com/*
// @exclude      https://*.amazon.com/gp/cart/*
// @exclude      https://*.amazon.com/gp/help/*
// @exclude      https://*.amazon.com/ap/*
// @grant        none
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/493802/Amazon%20Enhancements%3A%20Ratings%20Display%20and%20Filtering.user.js
// @updateURL    https://update.greasyfork.org/scripts/493802/Amazon%20Enhancements%3A%20Ratings%20Display%20and%20Filtering.meta.js
// ==/UserScript==
//
// Changelog:
// 4.3.2 - Fix hide-sponsored: restore scoped text fallback for label containers
//         Amazon doesn't always use a selector-matchable element for the label.
//
// 4.3.1 - Hide filtered items (display:none) instead of dimming them.
// Drop full-card textContent regex in isSponsored (false-positives on product titles).
//         Clear dataset.sponsored cache on forceRescan (handles ad slot rotation on INFY pages).
//         Cap processedAsins at 2000 entries to prevent unbounded growth during long INFY sessions.
//         Scope applyFilters to [data-asin] cards only (already scoped; comment clarified).

(function () {
  "use strict";

  // ─── Page detection ───────────────────────────────────────────────────────

  /**
   * True only on Amazon search result pages. Used to gate all script activity
   * so product pages, cart, etc. are completely unaffected — including during
   * SPA navigation from a search page to a product page.
   */
  const isSearchPage = () => {
    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    // Search pages: /s?k=... or paths starting with /s/
    return (
      params.has("k") ||
      params.has("field-keywords") ||
      pathname === "/s" ||
      pathname.startsWith("/s/")
    );
  };

  // ─── Storage keys ─────────────────────────────────────────────────────────

  const LS = {
    RATING: "amazon-rating-filter",
    REVIEWS: "amazon-min-review-count",
    SPONSORED: "amazon-hide-sponsored",
  };

  // ─── State ────────────────────────────────────────────────────────────────

  const state = {
    currentFilter: parseFloat(localStorage.getItem(LS.RATING)) || 0,
    minReviewCount: parseInt(localStorage.getItem(LS.REVIEWS), 10) || 0,
    hideSponsored: localStorage.getItem(LS.SPONSORED) === "true",
    processedAsins: new Set(),
    hiddenCount: 0, // counter — only used for status display
  };

  // ─── Selectors ────────────────────────────────────────────────────────────

  const RATING_SELECTORS = [
    "span.a-size-small.a-color-base:not([aria-hidden])",
    'span[aria-hidden="true"].a-size-small.a-color-base',
    'span[aria-label*="out of 5 stars"]',
    'i[aria-label*="out of 5 stars"]',
    'a[aria-label*="out of 5 stars"]',
    "span.a-icon-alt",
    'i.a-icon-star-mini[aria-hidden="true"]',
  ];

  const REVIEW_COUNT_SELECTORS = [
    "span.a-size-mini.puis-normal-weight-text.s-underline-text",
    'a[aria-label*="ratings"] span.a-size-mini',
    'span[aria-label$=" ratings"]',
    'span[aria-label$=" rating"]',
    "span.a-size-base.s-underline-text",
  ];

  const SPONSORED_SELECTORS = [
    '[aria-label="Sponsored"]',
    ".s-label-popover-default",
    ".puis-sponsored-label-text",
    "span.s-label-popover-hover",
    '[data-component-type="sp-sponsored-result"]',
  ];

  // Containers that hold the sponsored label text — scoped so we don't
  // accidentally match product titles/descriptions containing "Sponsored".
  const SPONSORED_TEXT_CONTAINERS = [
    ".s-sponsored-label-info-icon",
    ".puis-sponsored-label-text",
    ".s-label-popover",
    "[data-cy='aax-sponsored-label']",
    "span.a-color-secondary",
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Return the first element matching any selector in `list` under `root`. */
  const qFirst = (root, list) => {
    for (const sel of list) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  /** Extract a numeric rating from an element's aria-label or text content. */
  const extractRating = (el) => {
    if (!el) return 0;
    const text = (
      el.getAttribute("aria-label") ||
      el.parentElement?.getAttribute("aria-label") ||
      el.textContent ||
      ""
    ).trim();
    const direct = text.match(/^(\d+(?:\.\d+)?)(?:\s|$)/);
    if (direct) return parseFloat(direct[1]);
    const outOf = text.match(/(\d+(?:\.\d+)?)\s*out of/i);
    return outOf ? parseFloat(outOf[1]) : 0;
  };

  /** Extract a review count, handling plain numbers, (1,234), (43.9K), (1.2M). */
  const extractReviewCount = (el) => {
    if (!el) return 0;
    const aria = el.getAttribute("aria-label") || "";
    const txt = el.textContent || "";

    const ariaMatch = aria.match(/(\d+(?:,\d+)*)\s*ratings?/i);
    if (ariaMatch) return parseInt(ariaMatch[1].replace(/,/g, ""), 10);

    const abbr = txt.match(/\((\d+(?:\.\d+)?)(K|M)\)/i);
    if (abbr) {
      const mul = abbr[2].toUpperCase() === "K" ? 1e3 : 1e6;
      return Math.round(parseFloat(abbr[1]) * mul);
    }

    const paren = txt.match(/\((\d+(?:,\d+)*)\)/);
    if (paren) return parseInt(paren[1].replace(/,/g, ""), 10);

    const anyNum = txt.match(/(\d+(?:,\d+)*)/);
    return anyNum ? parseInt(anyNum[1].replace(/,/g, ""), 10) : 0;
  };

  /**
   * Return whether a result card is sponsored.
   * Caches the answer in dataset.sponsored to avoid repeated DOM scans.
   * Uses selector checks first, then a scoped text check on known label
   * containers only — avoids false-positives on product titles/descriptions.
   */
  const isSponsored = (result) => {
    if (result.dataset.sponsored) return result.dataset.sponsored === "1";
    const bySelector = SPONSORED_SELECTORS.some((sel) =>
      result.querySelector(sel),
    );
    const byText =
      !bySelector &&
      SPONSORED_TEXT_CONTAINERS.some((sel) => {
        const el = result.querySelector(sel);
        return el && /^\s*Sponsored\s*$/i.test(el.textContent);
      });
    const sponsored = bySelector || byText;
    result.dataset.sponsored = sponsored ? "1" : "0";
    return sponsored;
  };

  /** Return the ASIN for a result card, preferring the dataset cache. */
  const getAsin = (result) => {
    if (result.dataset.asin) return result.dataset.asin;
    const link = result.querySelector(
      'a[href*="/dp/"], a[href*="/gp/product/"]',
    );
    const m = link?.href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    return m ? m[1] : "";
  };

  // ─── Rating extraction & enhancement ──────────────────────────────────────

  /**
   * Parse rating + review count from a result card and write them to
   * dataset.ratingValue / dataset.reviewCount. Optionally injects a bold
   * rating span when the layout doesn't already show the number plainly.
   * Guards against re-processing the same ASIN.
   */
  const enhanceRatingDisplay = (result) => {
    const asin = getAsin(result);
    if (!asin || state.processedAsins.has(asin)) return;

    let ratingEl = null;
    let rating = 0;

    // Prefer new Amazon layout: plain number in a small-row span
    const ratingRow = result.querySelector(".a-row.a-size-small");
    if (ratingRow) {
      const direct = ratingRow.querySelector("span.a-size-small.a-color-base");
      const txt = direct?.textContent.trim();
      if (txt && /^\d+(\.\d+)?$/.test(txt)) {
        ratingEl = direct;
        rating = parseFloat(txt);
      }
    }

    // Fallback: legacy aria-label selectors
    if (!ratingEl || !rating) {
      ratingEl = qFirst(result, RATING_SELECTORS);
      rating = extractRating(ratingEl);
    }

    if (!ratingEl || !rating) return;

    // Review count
    let countEl = qFirst(result, REVIEW_COUNT_SELECTORS);
    if (!countEl && ratingEl.tagName === "A") {
      countEl = ratingEl.querySelector("span.a-size-small") ?? null;
    }

    result.dataset.asin = asin;
    result.dataset.ratingValue = rating;
    result.dataset.reviewCount = extractReviewCount(countEl);

    // Skip injecting a span if the rating is already visible in the DOM
    const parentText = ratingEl.parentElement?.textContent || "";
    const alreadyVisible =
      (ratingRow && ratingEl.parentElement === ratingRow) ||
      parentText.includes(rating.toFixed(1));

    if (!alreadyVisible && !result.querySelector(".enhanced-rating-display")) {
      const span = document.createElement("span");
      span.className = "enhanced-rating-display";
      span.textContent = rating.toFixed(1) + " ";
      span.style.cssText =
        "font-weight:bold;color:#007600;margin-right:5px;font-size:14px;";
      (ratingEl.parentElement || ratingEl).insertBefore(span, ratingEl);
    }

    state.processedAsins.add(asin);
    pruneProcessedAsins();
    result.classList.add("enhanced-rating");
  };

  // ─── Filter bar UI ────────────────────────────────────────────────────────

  // Refs to bar elements held here so updateFilterStatus avoids repeated getElementById.
  let barEl = null;
  let statusEl = null;

  /** Add a simple hover-highlight to a button element. */
  const addHoverEffect = (btn) => {
    btn.addEventListener("mouseover", () => {
      btn.style.background = "#f0f0f0";
    });
    btn.addEventListener("mouseout", () => {
      btn.style.background = "#fff";
    });
  };

  /** Create a styled bar button with an aria-label. */
  const makeBarButton = (text, ariaLabel, extraCss = "") => {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.setAttribute("aria-label", ariaLabel);
    btn.style.cssText =
      `padding:4px 10px;background:#fff;border:1px solid #ccc;border-radius:4px;` +
      `cursor:pointer;font-weight:500;font-size:13px;${extraCss}`;
    addHoverEffect(btn);
    return btn;
  };

  /** Force a full re-scan without resetting filter values. */
  const forceRescan = () => {
    state.processedAsins.clear();
    // Clear sponsored cache too — ad slots can rotate between INFY page loads.
    document
      .querySelectorAll("[data-asin][data-sponsored]")
      .forEach((el) => delete el.dataset.sponsored);
    processAllResults();
  };

  /** Prune processedAsins if it gets very large (long INFY sessions). */
  const pruneProcessedAsins = () => {
    if (state.processedAsins.size > 2000) {
      // Keep the most recently added half by converting to array and slicing.
      const entries = [...state.processedAsins];
      state.processedAsins = new Set(entries.slice(entries.length / 2));
    }
  };

  const createFilterBar = () => {
    barEl = document.createElement("div");
    barEl.id = "rating-filter-bar";
    barEl.style.cssText =
      "padding:6px 12px;margin:8px auto;max-width:900px;font-size:13px;" +
      "background:#f3f3f3;border:1px solid #ddd;border-radius:6px;display:flex;" +
      "flex-wrap:wrap;justify-content:center;align-items:center;gap:10px;" +
      "box-shadow:0 1px 3px rgba(0,0,0,.1);position:sticky;top:0;z-index:100;";

    const mkGroup = () => {
      const g = document.createElement("div");
      g.style.cssText = "display:flex;align-items:center;gap:5px;";
      return g;
    };

    // ── Rating dropdown ──
    const ratingGroup = mkGroup();
    const ratingSelect = document.createElement("select");
    ratingSelect.id = "arf-rating-select";
    ratingSelect.setAttribute("aria-label", "Filter by minimum star rating");
    ratingSelect.style.cssText =
      "padding:3px 6px;border-radius:4px;border:1px solid #ccc;font-size:13px;";
    [0, 4.9, 4.8, 4.7, 4.6, 4.5, 4.4, 4.3, 4.2, 4.1, 4.0, 3.5, 3.0].forEach(
      (v) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v === 0 ? "All Ratings" : `${v}+ stars`;
        ratingSelect.appendChild(o);
      },
    );
    ratingSelect.value = state.currentFilter || 0;
    ratingSelect.addEventListener("change", (e) => {
      state.currentFilter = parseFloat(e.target.value) || 0;
      localStorage.setItem(LS.RATING, state.currentFilter);
      applyFilters();
    });

    const ratingLabel = document.createElement("label");
    ratingLabel.textContent = "Rating:";
    ratingLabel.htmlFor = "arf-rating-select";
    ratingLabel.style.cssText = "font-weight:500;font-size:13px;";
    ratingGroup.append(ratingLabel, ratingSelect);
    barEl.appendChild(ratingGroup);

    // ── Review count input ──
    const reviewGroup = mkGroup();
    const reviewInput = document.createElement("input");
    reviewInput.id = "arf-review-input";
    reviewInput.type = "number";
    reviewInput.min = 0;
    reviewInput.value = state.minReviewCount || 0;
    reviewInput.placeholder = "0";
    reviewInput.setAttribute(
      "aria-label",
      "Filter by minimum number of reviews",
    );
    reviewInput.style.cssText =
      "width:60px;padding:3px 6px;border-radius:4px;border:1px solid #ccc;font-size:13px;";
    reviewInput.addEventListener("input", (e) => {
      state.minReviewCount = parseInt(e.target.value, 10) || 0;
      localStorage.setItem(LS.REVIEWS, state.minReviewCount);
      applyFilters();
    });

    const reviewLabel = document.createElement("label");
    reviewLabel.textContent = "Reviews:";
    reviewLabel.htmlFor = "arf-review-input";
    reviewLabel.style.cssText = "font-weight:500;font-size:13px;";
    reviewGroup.append(reviewLabel, reviewInput);
    barEl.appendChild(reviewGroup);

    // ── Sponsored toggle (wrapper-label pattern is correct here) ──
    const sponsoredLabel = document.createElement("label");
    sponsoredLabel.style.cssText =
      "display:flex;align-items:center;gap:4px;cursor:pointer;font-weight:500;font-size:13px;";
    const sponsoredCheckbox = document.createElement("input");
    sponsoredCheckbox.type = "checkbox";
    sponsoredCheckbox.checked = state.hideSponsored;
    sponsoredCheckbox.setAttribute("aria-label", "Hide sponsored items");
    sponsoredCheckbox.addEventListener("change", () => {
      state.hideSponsored = sponsoredCheckbox.checked;
      localStorage.setItem(LS.SPONSORED, state.hideSponsored);
      applyFilters();
    });
    sponsoredLabel.append(
      sponsoredCheckbox,
      document.createTextNode("Hide Sponsored"),
    );
    barEl.appendChild(sponsoredLabel);

    // ── Reset button ──
    const resetBtn = makeBarButton("Reset", "Reset all filters");
    resetBtn.addEventListener("click", () => {
      state.currentFilter = 0;
      state.minReviewCount = 0;
      state.hideSponsored = false;
      ratingSelect.value = 0;
      reviewInput.value = 0;
      sponsoredCheckbox.checked = false;
      localStorage.removeItem(LS.RATING);
      localStorage.removeItem(LS.REVIEWS);
      localStorage.removeItem(LS.SPONSORED);
      forceRescan();
    });
    barEl.appendChild(resetBtn);

    // ── Refresh button ──
    const refreshBtn = makeBarButton(
      "🔄",
      "Refresh filters",
      "font-weight:normal;",
    );
    refreshBtn.title = "Force re-scan all results";
    refreshBtn.addEventListener("click", forceRescan);
    barEl.appendChild(refreshBtn);

    // ── Status ──
    statusEl = document.createElement("div");
    statusEl.style.cssText = "font-size:11px;color:#666;font-style:italic;";
    barEl.appendChild(statusEl);

    return barEl;
  };

  const updateFilterStatus = () => {
    if (!barEl || !statusEl) return;
    const active =
      state.currentFilter > 0 ||
      state.minReviewCount > 0 ||
      state.hideSponsored;
    barEl.style.background = active ? "#e8f5e9" : "#f3f3f3";
    barEl.style.borderColor = active ? "#4caf50" : "#ddd";
    if (active) {
      statusEl.textContent = `Filters active (${state.hiddenCount} items hidden)`;
      statusEl.style.color = "#2e7d32";
    } else {
      statusEl.textContent = "No filters applied";
      statusEl.style.color = "#666";
    }
  };

  // ─── Filtering ────────────────────────────────────────────────────────────

  const applyFilters = () => {
    state.hiddenCount = 0;
    // Scope to enhanced cards only — unenhanced cards have no ratingValue/reviewCount
    // and would always evaluate as 0, producing misleading filter results.
    document
      .querySelectorAll('[data-asin]:not([data-asin=""])')
      .forEach((result) => {
        const rating = parseFloat(result.dataset.ratingValue) || 0;
        const count = parseInt(result.dataset.reviewCount, 10) || 0;
        const sponsored = isSponsored(result);

        const show =
          (state.currentFilter === 0 || rating >= state.currentFilter) &&
          (state.minReviewCount === 0 || count >= state.minReviewCount) &&
          (!state.hideSponsored || !sponsored);

        if (show) {
          result.style.display = "";
          result.classList.remove("arfe-hidden", "hidden-by-filter");
        } else {
          result.style.display = "none";
          result.classList.add("arfe-hidden", "hidden-by-filter");
          state.hiddenCount++;
        }
      });
    updateFilterStatus();
  };

  const processAllResults = () => {
    if (!isSearchPage()) {
      // Navigated away from a search page (e.g. to a product page): undo any
      // dimming that was applied before the SPA navigation completed, and bail.
      document.querySelectorAll(".arfe-hidden").forEach((el) => {
        el.style.display = "";
        el.classList.remove("arfe-hidden", "hidden-by-filter");
      });
      return;
    }
    document
      .querySelectorAll('[data-asin]:not([data-asin=""])')
      .forEach(enhanceRatingDisplay);
    applyFilters();
  };

  // ─── Observers ────────────────────────────────────────────────────────────

  const observeResults = () => {
    const container =
      document.querySelector(".s-main-slot, .s-result-list, #search") ||
      document.body;

    // BUG FIX: use clearTimeout (not "if pending bail") so that late-loading
    // card batches always trigger a final process pass.
    let debounce = null;
    const scheduleProcess = () => {
      clearTimeout(debounce);
      debounce = setTimeout(processAllResults, 150);
    };

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (
              n.nodeType === 1 &&
              (n.dataset?.asin || n.querySelector?.("[data-asin]"))
            ) {
              scheduleProcess();
              return;
            }
          }
        }
      }
    }).observe(container, { childList: true, subtree: true });

    // SPA navigation: watch for title changes on search pages
    const titleEl = document.querySelector("title");
    if (titleEl) {
      new MutationObserver(() => {
        if (location.href.includes("/s?") || location.href.includes("/s/")) {
          scheduleProcess();
        }
      }).observe(titleEl, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  };

  const insertFilterBar = () => {
    if (document.getElementById("rating-filter-bar")) return;
    const bar = createFilterBar();
    for (const sel of [
      "#search",
      ".s-desktop-toolbar",
      ".s-result-list-parent-container",
      'div[data-component-type="s-search-results"]',
    ]) {
      const container = document.querySelector(sel);
      if (container) {
        container.insertBefore(bar, container.firstChild);
        updateFilterStatus();
        return;
      }
    }
    const main = document.querySelector('[role="main"]') || document.body;
    main.insertBefore(bar, main.firstChild);
    updateFilterStatus();
  };

  // ─── Debug ────────────────────────────────────────────────────────────────

  window.debugAmazonFilter = () => {
    const items = document.querySelectorAll('[data-asin]:not([data-asin=""])');
    console.log("Filter state:", {
      rating: state.currentFilter,
      minReviews: state.minReviewCount,
      hideSponsored: state.hideSponsored,
    });
    console.log(`Items: ${items.length}`);
    items.forEach((el, i) => {
      console.log(i + 1, {
        asin: el.dataset.asin,
        rating: parseFloat(el.dataset.ratingValue) || 0,
        reviews: parseInt(el.dataset.reviewCount, 10) || 0,
        sponsored: isSponsored(el),
        dimmed: el.classList.contains("arfe-dimmed"),
      });
    });
  };

  // ─── Init ─────────────────────────────────────────────────────────────────

  // Debounced nav handler avoids double-firing with the title MutationObserver
  // when both popstate and a title change occur together on SPA navigation.
  let navDebounce = null;
  const handleNav = () => {
    clearTimeout(navDebounce);
    navDebounce = setTimeout(() => {
      insertFilterBar();
      processAllResults();
    }, 150);
  };

  const init = () => {
    insertFilterBar();
    processAllResults();
    observeResults();
    window.addEventListener("popstate", handleNav);
  };

  if (isSearchPage()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
