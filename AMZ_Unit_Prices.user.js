// ==UserScript==
// @name         Amazon Unit Prices
// @namespace    https://github.com/jayblah/userscripts
// @version      3.0.0
// @description  Adds large unit price badges to the best-value cards on Amazon search pages.
// @author       JR
// @match        *://*.amazon.com/*
// @match        *://*.amazon.co.uk/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/AMZ_Unit_Price_Badges.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/AMZ_Unit_Price_Badges.user.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ─── Constants ────────────────────────────────────────────────────────────

  const CARD_SELECTOR = ".puis-card-container";
  const UNIT_PRICE_SELECTOR = ".s-price-instructions-style";
  const LABEL_ATTR = "data-ulp-label";
  const WINNER_ATTR = "data-ulp-winner";

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
  const TO_GRAMS = { g: 1, kg: 1000, mg: 0.001, oz: 28.3495, lb: 453.592 };

  // Volume units → ml
  const TO_ML = { ml: 1, l: 1000, fl_oz: 29.5735 };

  // ─── Unit helpers ─────────────────────────────────────────────────────────

  function compareGroup(unit) {
    if (unit in TO_GRAMS) return "weight";
    if (unit in TO_ML) return "volume";
    return unit;
  }

  function normalisePrice(price, unit) {
    if (unit in TO_GRAMS) return price / TO_GRAMS[unit];
    if (unit in TO_ML) return price / TO_ML[unit];
    return null;
  }

  // ─── Color state ──────────────────────────────────────────────────────────

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

  function parseUnitPrice(section) {
    const unitPriceEl = section.querySelector(".a-price.a-text-price");
    if (!unitPriceEl) return null;

    const priceMatch = unitPriceEl.textContent.match(/([\$£€])(\d+\.?\d*)/);
    if (!priceMatch) return null;
    const symbol = priceMatch[1];
    const price = parseFloat(priceMatch[2]);
    if (isNaN(price) || price <= 0) return null;

    const sectionText = section.textContent.replace(/\s+/g, " ");
    const unitMatch = sectionText.match(/\/([a-zA-Z]+(?:\s[a-zA-Z]+)?)/);
    if (!unitMatch) return null;

    const rawUnit = unitMatch[1].trim().toLowerCase();
    const unit = UNIT_ALIASES[rawUnit] ?? rawUnit;
    return { price, unit, display: `${symbol}${price.toFixed(2)}/${rawUnit}` };
  }

  // ─── Card helpers ─────────────────────────────────────────────────────────

  function ensureRelative(el) {
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative";
    }
  }

  function createBadge(text, bg) {
    const badge = document.createElement("div");
    badge.setAttribute(LABEL_ATTR, "");
    badge.textContent = text;
    Object.assign(badge.style, {
      position: "absolute",
      top: "6px",
      right: "6px",
      background: bg,
      color: "#fff",
      fontSize: "13px",
      fontWeight: "bold",
      padding: "4px 8px",
      borderRadius: "5px",
      zIndex: "9",
      pointerEvents: "none",
    });
    return badge;
  }

  function applyHighlight(card, unit, displayLabel) {
    const [border, bg] = assignColorForUnit(unit);
    card.style.border = `4px solid ${border}`;
    card.style.backgroundColor = bg;
    card.setAttribute(WINNER_ATTR, unit);

    if (!card.querySelector(`[${LABEL_ATTR}]`)) {
      ensureRelative(card);
      card.appendChild(createBadge(`★ ${displayLabel}`, border));
    }
  }

  function clearHighlights() {
    document
      .querySelectorAll(`${CARD_SELECTOR}[${WINNER_ATTR}]`)
      .forEach((card) => {
        card.style.border = "";
        card.style.backgroundColor = "";
        card.removeAttribute(WINNER_ATTR);
      });
    document.querySelectorAll(`[${LABEL_ATTR}]`).forEach((el) => el.remove());
  }

  // ─── Core run ─────────────────────────────────────────────────────────────

  function run() {
    clearHighlights();
    clearColorState();

    // groups: compareGroup → { normPrice, unit, display, cards: card[] }
    const groups = {};

    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      const unitPriceEl = card.querySelector(UNIT_PRICE_SELECTOR);
      if (!unitPriceEl) return;

      const parsed = parseUnitPrice(unitPriceEl);
      if (!parsed) return;

      const { price, unit, display } = parsed;
      const group = compareGroup(unit);
      const normPrice = normalisePrice(price, unit) ?? price;

      if (!groups[group]) {
        groups[group] = { normPrice, unit, display, cards: [card] };
      } else if (normPrice < groups[group].normPrice) {
        groups[group] = { normPrice, unit, display, cards: [card] };
      } else if (normPrice === groups[group].normPrice) {
        groups[group].cards.push(card);
      }
    });

    Object.values(groups).forEach(({ unit, display, cards }) => {
      cards.forEach((card) => applyHighlight(card, unit, display));
    });
  }

  // ─── Observer ─────────────────────────────────────────────────────────────

  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      [...m.addedNodes].some((n) => n.nodeType === Node.ELEMENT_NODE),
    );
    if (relevant) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(run, 300);
    }
  });

  function attachObserver() {
    observer.observe(document.body, { childList: true, subtree: true });
    run();
  }

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
