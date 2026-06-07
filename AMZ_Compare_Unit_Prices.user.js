// ==UserScript==
// @name         Unit Price Comparator for Amazon
// @namespace    https://github.com/jayblah/userscripts
// @version      2.4.4
// @description  Highlights lowest unit price cards with per-unit colors, legend, labels, jump buttons, and cross-unit weight conversion
// @author       JR
// @match        *://*.amazon.com/*
// @match        *://*.amazon.co.uk/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/AMZ_Compare_Unit_Prices.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/AMZ_Compare_Unit_Prices.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  "use strict";

  // ─── Constants ────────────────────────────────────────────────────────────

  const CARD_SELECTOR = ".puis-card-container";
  const UNIT_PRICE_SELECTOR = ".s-price-instructions-style";
  const LABEL_ATTR = "data-ulp-label";
  const WINNER_ATTR = "data-ulp-winner";
  const EXACT_ATTR = "data-ulp-exact";
  const STORAGE_KEY_POS = "ulp_panel_pos";

  // [border, background]
  const PALETTE = [
    ["#28a745", "#f0fff0"],
    ["#007bff", "#e8f0ff"],
    ["#fd7e14", "#fff4e8"],
    ["#9b59b6", "#f8f0ff"],
    ["#e83e8c", "#fff0f6"],
    ["#20c997", "#e8fff8"],
    ["#dc3545", "#fff0f0"],
    ["#d4a017", "#fffbe8"],
  ];

  // Canonical unit aliases
  const UNIT_ALIASES = {
    oz: "oz",
    ounce: "oz",
    ounces: "oz",
    "fl oz": "fl_oz",
    fl_oz: "fl_oz",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    pounds: "lb",
    g: "g",
    gram: "g",
    grams: "g",
    kg: "kg",
    kilogram: "kg",
    kilograms: "kg",
    mg: "mg",
    milligram: "mg",
    milligrams: "mg",
    ml: "ml",
    milliliter: "ml",
    millilitre: "ml",
    l: "l",
    liter: "l",
    litre: "l",
    liters: "l",
    litres: "l",
    ct: "ct",
    count: "ct",
    counts: "ct",
    sheet: "sheet",
    sheets: "sheet",
    load: "load",
    loads: "load",
    tablet: "tablet",
    tablets: "tablet",
    capsule: "capsule",
    capsules: "capsule",
    serving: "serving",
    servings: "serving",
    pod: "pod",
    pods: "pod",
    roll: "roll",
    rolls: "roll",
    sqft: "sqft",
    "sq ft": "sqft",
  };

  // Conversion to grams for cross-unit weight comparison.
  // Units not listed here are non-convertible (count, sheet, etc.)
  // and only compete within their own group.
  const TO_GRAMS = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 };

  // Volume units → ml
  const TO_ML = { ml: 1, l: 1000, fl_oz: 29.5735 };

  // ─── Unit helpers ─────────────────────────────────────────────────────────

  // The canonical "compare group" merges weight units and volume units
  // so $/oz competes with $/lb and $/g etc.
  function compareGroup(unit) {
    if (unit in TO_GRAMS) return "weight";
    if (unit in TO_ML) return "volume";
    return unit;
  }

  // Normalise price to a per-gram or per-ml basis for cross-unit comparison.
  function normalisePrice(price, unit) {
    if (unit in TO_GRAMS) return price / TO_GRAMS[unit];
    if (unit in TO_ML) return price / TO_ML[unit];
    return null;
  }

  // ─── Color state ──────────────────────────────────────────────────────────

  // groupColorMap maps compare-group → color slot, so all weight units share one color.
  // unitColorMap caches the resolved color per canonical unit.
  const unitColorMap = new Map();
  const groupColorMap = new Map();

  function assignColorForUnit(unit) {
    if (!unitColorMap.has(unit)) {
      const group = compareGroup(unit);
      if (!groupColorMap.has(group)) {
        groupColorMap.set(group, PALETTE[groupColorMap.size % PALETTE.length]);
      }
      unitColorMap.set(unit, groupColorMap.get(group));
    }
    return unitColorMap.get(unit);
  }

  function clearColorState() {
    unitColorMap.clear();
    groupColorMap.clear();
  }

  // ─── Parsing ──────────────────────────────────────────────────────────────

  // Amazon no longer uses a dedicated .a-unit-price element. The unit price
  // lives inside .s-price-instructions-style as plain text, e.g.:
  //   "Price, product page$1.99$1.99 ($0.12$0.12/ounce)..."
  // The per-unit price is the second .a-price.a-text-price element (the first
  // is the total price). We reconstruct it from the whole/fraction spans and
  // find the unit from the surrounding text content.
  function parseUnitPrice(section) {
    // .a-price.a-text-price contains the per-unit price as plain text "$0.12$0.12"
    // (duplicated by Amazon for screen readers — take the first match only).
    const unitPriceEl = section.querySelector(".a-price.a-text-price");
    if (!unitPriceEl) return null;

    // Grab the first currency+number from the raw text, ignoring the duplicate
    const priceText = unitPriceEl.textContent;
    const priceMatch = priceText.match(/([\$£€])(\d+\.?\d*)/);
    if (!priceMatch) return null;
    const symbol = priceMatch[1];
    const price = parseFloat(priceMatch[2]);
    if (isNaN(price) || price <= 0) return null;

    // Unit lives in the section text as "/ounce", "/oz", "/count" etc.
    const sectionText = section.textContent.replace(/\s+/g, " ");
    const unitMatch = sectionText.match(/\/([a-zA-Z]+(?:\s[a-zA-Z]+)?)/);
    if (!unitMatch) return null;

    const rawUnit = unitMatch[1].trim().toLowerCase();
    const unit = UNIT_ALIASES[rawUnit] ?? rawUnit;
    return { price, unit, display: `${symbol}${price.toFixed(2)}/${rawUnit}` };
  }

  // ─── Card helpers ─────────────────────────────────────────────────────────

  // Prefer a specific title element; fall back to the heading span Amazon uses.
  // Avoids a full innerText reflow on every card.
  function getCardTitle(card) {
    const el =
      card.querySelector("h2 span") ??
      card.querySelector("[data-cy='title-recipe-title']") ??
      card.querySelector(".a-size-medium");
    if (el) return el.textContent.trim();
    // Last-resort: first non-empty line of visible text
    return (
      card.innerText
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean) ?? ""
    );
  }

  function ensureRelative(el) {
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
  }

  // Shared badge factory — eliminates the duplicated Object.assign blocks.
  function createBadge({ text, bg, large = false }) {
    const badge = document.createElement("div");
    badge.setAttribute(LABEL_ATTR, "");
    badge.textContent = text;
    Object.assign(badge.style, {
      position: "absolute",
      top: "6px",
      right: "6px",
      background: bg,
      color: "#fff",
      fontSize: large ? "13px" : "12px",
      fontWeight: "bold",
      padding: large ? "4px 8px" : "3px 7px",
      borderRadius: "5px",
      zIndex: "9",
      pointerEvents: "none",
    });
    return badge;
  }

  function applyHighlight(card, unit, displayLabel, exactMatch) {
    const [border, bg] = assignColorForUnit(unit);
    card.style.border = `4px solid ${border}`;
    card.style.backgroundColor = bg;
    card.setAttribute(WINNER_ATTR, unit);

    if (exactMatch) {
      card.style.outline = "3px solid #f5a623";
      card.style.outlineOffset = "-7px";
      card.setAttribute(EXACT_ATTR, "");
    }

    if (!card.querySelector(`[${LABEL_ATTR}]`)) {
      ensureRelative(card);
      card.appendChild(
        createBadge({
          text: exactMatch ? `★ ${displayLabel} ✓` : `★ ${displayLabel}`,
          bg: exactMatch ? "#f5a623" : border,
          large: true,
        }),
      );
    }
  }

  function clearHighlights() {
    document
      .querySelectorAll(`${CARD_SELECTOR}[${WINNER_ATTR}]`)
      .forEach((card) => {
        card.style.border = "";
        card.style.backgroundColor = "";
        card.style.outline = "";
        card.style.outlineOffset = "";
        card.removeAttribute(WINNER_ATTR);
        card.removeAttribute(EXACT_ATTR);
      });
    // Remove all badges — both winner badges (above) and non-winner grey badges
    // added by injectUnitPriceLabels. Two passes are intentional: the first
    // resets card styles, this second cleans up any orphaned label elements.
    document.querySelectorAll(`[${LABEL_ATTR}]`).forEach((el) => el.remove());
  }

  // Inject a small grey unit price badge onto every non-winner card that has a
  // parsed unit price, so the figure is always visible regardless of Amazon's layout.
  function injectUnitPriceLabels(allParsed) {
    allParsed.forEach(({ card, parsed }) => {
      if (card.querySelector(`[${LABEL_ATTR}]`)) return; // winner badge already present
      ensureRelative(card);
      card.appendChild(createBadge({ text: parsed.display, bg: "#555" }));
    });
  }

  // ─── Search / exact-match ─────────────────────────────────────────────────

  function getSearchQuery() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("k") ?? params.get("field-keywords") ?? "")
      .trim()
      .toLowerCase();
  }

  function isExactMatch(card, query) {
    if (!query) return false;
    const title = getCardTitle(card).toLowerCase();
    return (
      !!title &&
      query.split(/\s+/).every((word) => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`).test(title);
      })
    );
  }

  // ─── Core run ─────────────────────────────────────────────────────────────

  function collectGroups(query) {
    const allParsed = [];
    // groups: compareGroup → { exact: winner | null, any: winner | null }
    // winner: { normPrice, unit, display, cards: Map<card, isExact> }
    const groups = {};

    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      // Only parse the dedicated unit price element; don't fall back to raw
      // card text, which is too noisy and triggers unnecessary reflows.
      const unitPriceEl = card.querySelector(UNIT_PRICE_SELECTOR);
      if (!unitPriceEl) return;

      const parsed = parseUnitPrice(unitPriceEl); // unitPriceEl is now the section
      if (!parsed) return;

      allParsed.push({ card, parsed });

      const { price, unit, display } = parsed;
      const group = compareGroup(unit);
      const normPrice = normalisePrice(price, unit) ?? price;
      const exact = isExactMatch(card, query);

      if (!groups[group]) groups[group] = { exact: null, any: null };

      function updateBest(bucket, isExact) {
        const current = groups[group][bucket];
        if (!current || normPrice < current.normPrice) {
          groups[group][bucket] = {
            normPrice,
            unit,
            display,
            cards: new Map([[card, isExact]]),
          };
        } else if (normPrice === current.normPrice) {
          current.cards.set(card, isExact);
        }
      }

      if (exact) updateBest("exact", true);
      updateBest("any", exact);
    });

    return { allParsed, groups };
  }

  function resolveWinners(groups) {
    // For each group, prefer exact-match winners; fall back to global best.
    const winners = {};
    Object.entries(groups).forEach(([group, { exact, any }]) => {
      winners[group] = exact ?? any;
    });
    return winners;
  }

  function run() {
    clearHighlights();
    clearColorState();

    const query = getSearchQuery();
    const { allParsed, groups } = collectGroups(query);
    const winners = resolveWinners(groups);

    Object.values(winners).forEach(({ unit, display, cards }) => {
      cards.forEach((exact, card) =>
        applyHighlight(card, unit, display, exact),
      );
    });

    injectUnitPriceLabels(allParsed);
    updatePanel(winners);
  }

  // ─── Panel UI ─────────────────────────────────────────────────────────────

  let panel = null;

  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "ulp-panel";
    Object.assign(panel.style, {
      position: "fixed",
      zIndex: "999999",
      background: "#fff",
      border: "1px solid #ccc",
      borderRadius: "8px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      minWidth: "200px",
      maxWidth: "280px",
      // Prevent the panel from swallowing pointer events on Amazon UI beneath it.
      // Child elements that need interaction (header drag, etc.) re-enable this.
      pointerEvents: "none",
    });

    const savedPos = GM_getValue(STORAGE_KEY_POS, null);
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        panel.style.left = left;
        panel.style.top = top;
      } catch (_) {
        panel.style.right = "16px";
        panel.style.bottom = "80px";
      }
    } else {
      panel.style.right = "16px";
      panel.style.bottom = "80px";
    }

    const header = document.createElement("div");
    header.id = "ulp-header";
    Object.assign(header.style, {
      padding: "8px 10px",
      background: "#f5f5f5",
      borderRadius: "8px 8px 0 0",
      borderBottom: "1px solid #ddd",
      cursor: "grab",
      fontWeight: "bold",
      fontSize: "12px",
      color: "#333",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      userSelect: "none",
      pointerEvents: "auto",
    });
    header.textContent = "🏷️ Best Unit Prices";
    panel.appendChild(header);

    const body = document.createElement("div");
    body.id = "ulp-body";
    body.style.padding = "8px 10px";
    body.style.pointerEvents = "auto";
    panel.appendChild(body);

    document.body.appendChild(panel);
    makeDraggable(panel, header);
  }

  function updatePanel(winners) {
    if (!panel) buildPanel();
    const body = panel.querySelector("#ulp-body");
    body.innerHTML = "";

    const entries = Object.entries(winners);
    if (!entries.length) {
      body.textContent = "No unit prices found.";
      return;
    }

    entries.sort(([a], [b]) => a.localeCompare(b));

    const hasWeight = entries.some(([g]) => g === "weight");

    entries.forEach(([group, { unit, display }]) => {
      const [borderColor] = assignColorForUnit(unit);

      const groupLabel =
        group === "weight"
          ? "Weight (g/oz/lb/kg)"
          : group === "volume"
            ? "Volume (ml/l/fl oz)"
            : group;

      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "6px",
      });

      const swatch = document.createElement("span");
      Object.assign(swatch.style, {
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        background: borderColor,
        flexShrink: "0",
        border: "1px solid rgba(0,0,0,0.15)",
      });

      const label = document.createElement("span");
      label.style.flex = "1";
      label.innerHTML = `<strong>${groupLabel}</strong><br><span style="color:#555">${display}</span>`;

      row.appendChild(swatch);
      row.appendChild(label);
      body.appendChild(row);
    });

    if (hasWeight) {
      const note = document.createElement("div");
      note.textContent = "* Weight & volume units compared by conversion";
      Object.assign(note.style, {
        fontSize: "10px",
        color: "#999",
        marginTop: "4px",
      });
      body.appendChild(note);
    }
  }

  // ─── Drag ─────────────────────────────────────────────────────────────────

  function makeDraggable(el, handle) {
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      let dragging = false;

      function onMove(e) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (!dragging && dx < 4 && dy < 4) return;
        if (!dragging) {
          dragging = true;
          handle.style.cursor = "grabbing";
        }
        el.style.left =
          Math.max(
            0,
            Math.min(
              startLeft + (e.clientX - startX),
              window.innerWidth - el.offsetWidth,
            ),
          ) + "px";
        el.style.top =
          Math.max(
            0,
            Math.min(
              startTop + (e.clientY - startY),
              window.innerHeight - el.offsetHeight,
            ),
          ) + "px";
        el.style.right = "";
        el.style.bottom = "";
      }

      function onUp() {
        handle.style.cursor = "grab";
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (dragging) {
          GM_setValue(
            STORAGE_KEY_POS,
            JSON.stringify({ left: el.style.left, top: el.style.top }),
          );
        }
      }

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // ─── Observer ─────────────────────────────────────────────────────────────

  let debounceTimer = null;

  function scheduleRun() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 300);
  }

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      [...m.addedNodes].some((n) => n.nodeType === Node.ELEMENT_NODE),
    );
    if (relevant) scheduleRun();
  });

  // Exposed for future disable/toggle support.
  function destroy() {
    observer.disconnect();
    clearTimeout(debounceTimer);
    clearHighlights();
    panel?.remove();
    panel = null;
  }

  function attachObserver() {
    observer.observe(document.body, { childList: true, subtree: true });
    run();
  }

  // Only activate on search result pages — not the homepage, product pages, etc.
  // This prevents the observer and panel from interfering with Amazon's own UI
  // (e.g. the search bar) on pages where we have nothing to do.
  function isSearchPage() {
    const params = new URLSearchParams(window.location.search);
    return params.has("k") || params.has("field-keywords");
  }

  if (isSearchPage()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attachObserver);
    } else {
      attachObserver();
    }
  }
})();
