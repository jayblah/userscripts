// ==UserScript==
// @name         Amazon Unit Prices
// @namespace    https://github.com/jayblah/userscripts
// @version      3.3.5
// @description  Adds large unit price badges to the best-value cards on Amazon search pages.
// @author       JR
// @match        *://*.amazon.com/*
// @match        *://*.amazon.co.uk/*
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/AMZ_Unit_Prices.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/AMZ_Unit_Prices.user.js
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ─── Constants ────────────────────────────────────────────────────────────

  const CARD_SELECTOR = ".s-main-slot .puis-card-container";
  const UNIT_PRICE_SELECTOR = ".s-price-instructions-style";
  const UNIT_PRICE_LABEL_SELECTOR =
    ".s-price-instructions-style span.a-size-base.a-color-base";
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
    "fluid ounce": "fl_oz",
    "fluid ounces": "fl_oz",
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

  function styleUnitPriceLabel(
    el,
    {
      color,
      fontSize,
      fontWeight,
      background,
      padding,
      borderRadius,
      border,
    } = {},
  ) {
    Object.assign(el.style, {
      color: color || "",
      fontSize: fontSize || "",
      fontWeight: fontWeight || "",
      background: background || "",
      padding: padding || "",
      borderRadius: borderRadius || "",
      border: border || "",
      display: padding ? "inline-block" : "",
    });
    el.setAttribute(
      LABEL_ATTR,
      color && color !== "#444" ? "winner" : "styled",
    );
  }

  function applyHighlight(card, unit, unitPriceSection) {
    const [border] = assignColorForUnit(unit);
    card.style.setProperty("border", `4px solid ${border}`, "important");
    card.style.setProperty(
      "background-color",
      assignColorForUnit(unit)[1],
      "important",
    );
    card.setAttribute(WINNER_ATTR, unit);

    const label = unitPriceSection.querySelector(
      "span.a-size-base.a-color-base",
    );
    if (label && !label.hasAttribute(LABEL_ATTR)) {
      styleUnitPriceLabel(label, {
        color: "#fff",
        fontSize: "14px",
        fontWeight: "bold",
        background: border,
        padding: "2px 8px",
        borderRadius: "20px",
      });
    }
  }

  function clearHighlights() {
    clearStrip();
    document.querySelectorAll(`[${WINNER_ATTR}]`).forEach((card) => {
      card.style.removeProperty("border");
      card.style.removeProperty("background-color");
      card.removeAttribute(WINNER_ATTR);
    });
    document.querySelectorAll(`[${LABEL_ATTR}]`).forEach((el) => {
      styleUnitPriceLabel(el); // reset
      el.removeAttribute(LABEL_ATTR);
    });
  }

  const STRIP_ID = "ulp-winner-strip";

  // ─── Winner strip ─────────────────────────────────────────────────────────

  function clearStrip() {
    document.getElementById(STRIP_ID)?.remove();
  }

  function buildStrip(groups) {
    clearStrip();
    if (!Object.keys(groups).length) return;

    const slot = document.querySelector(".s-main-slot");
    if (!slot) return;

    const strip = document.createElement("div");
    strip.id = STRIP_ID;
    Object.assign(strip.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "10px",
      padding: "10px 14px",
      marginBottom: "8px",
      background: "#f8f8f8",
      border: "1px solid #ddd",
      borderRadius: "8px",
      fontFamily: "sans-serif",
    });

    Object.values(groups).forEach(({ unit, display, entries }) => {
      const [border, bg] = assignColorForUnit(unit);
      const { card } = entries[0];

      // Grab thumbnail and title from the winner card
      const img = card.querySelector("img.s-image");
      const title = card
        .querySelector(".a-size-medium, .a-size-base-plus")
        ?.textContent?.trim();

      const href = card
        .querySelector("a.a-link-normal[href]")
        ?.getAttribute("href");

      const row = document.createElement("a");
      row.href = href
        ? `https://www.amazon.com${href.startsWith("/") ? href : "/" + href}`
        : "#";
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px",
        background: bg,
        border: `2px solid ${border}`,
        borderRadius: "6px",
        cursor: "pointer",
        maxWidth: "320px",
        flex: "1 1 auto",
        textDecoration: "none",
      });
      row.title = title || "";

      if (img) {
        const thumb = document.createElement("img");
        thumb.src = img.src;
        thumb.alt = "";
        Object.assign(thumb.style, {
          width: "40px",
          height: "40px",
          objectFit: "contain",
          flexShrink: "0",
        });
        row.appendChild(thumb);
      }

      const text = document.createElement("div");
      Object.assign(text.style, { minWidth: "0" });

      const price = document.createElement("div");
      price.textContent = `★ Best ${display}`;
      Object.assign(price.style, {
        fontWeight: "bold",
        fontSize: "13px",
        color: border,
        whiteSpace: "nowrap",
      });

      const name = document.createElement("div");
      name.textContent = title || "";
      Object.assign(name.style, {
        fontSize: "11px",
        color: "#333",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });

      text.appendChild(price);
      if (title) text.appendChild(name);
      row.appendChild(text);
      strip.appendChild(row);
    });

    slot.insertAdjacentElement("beforebegin", strip);
  }

  const CARD_POSITION_CAP = 60;

  // ─── Relevance filtering ──────────────────────────────────────────────────

  function getQueryWords() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("k") || params.get("field-keywords") || "";
    return q.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function isSponsored(card) {
    return !!card.querySelector(
      '[data-component-type="sp-sponsored-result"], .s-sponsored-label-info-icon, [aria-label="Sponsored"]',
    );
  }

  function titleMatchesQuery(card, queryWords) {
    if (!queryWords.length) return true;
    const title = (
      card.querySelector(".a-size-medium, .a-size-base-plus, .a-size-mini")
        ?.textContent || ""
    ).toLowerCase();
    return queryWords.every((w) => title.includes(w));
  }

  function run() {
    clearHighlights();
    clearColorState();

    const queryWords = getQueryWords();
    const allCards = [...document.querySelectorAll(CARD_SELECTOR)];

    // groups: compareGroup → { normPrice, unit, display, entries: {card, unitPriceEl}[] }
    const groups = {};

    allCards.slice(0, CARD_POSITION_CAP).forEach((card) => {
      if (isSponsored(card)) return;
      if (!titleMatchesQuery(card, queryWords)) return;

      const unitPriceEl = card.querySelector(UNIT_PRICE_SELECTOR);
      if (!unitPriceEl) return;

      const parsed = parseUnitPrice(unitPriceEl);
      if (!parsed) return;

      const { price, unit, display } = parsed;
      const group = compareGroup(unit);
      if (group === "ct") return; // count/unit pricing is not comparable across products
      const normPrice = normalisePrice(price, unit) ?? price;

      if (!groups[group]) {
        groups[group] = {
          normPrice,
          unit,
          display,
          entries: [{ card, unitPriceEl }],
        };
      } else if (normPrice < groups[group].normPrice) {
        groups[group] = {
          normPrice,
          unit,
          display,
          entries: [{ card, unitPriceEl }],
        };
      } else if (normPrice === groups[group].normPrice) {
        groups[group].entries.push({ card, unitPriceEl });
      }
    });

    // Style all unit price labels as a subtle grey pill
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      const label = card.querySelector(UNIT_PRICE_LABEL_SELECTOR);
      if (label && !label.hasAttribute(LABEL_ATTR)) {
        styleUnitPriceLabel(label, {
          color: "#444",
          fontSize: "13px",
          fontWeight: "bold",
          background: "#e8e8e8",
          padding: "2px 7px",
          borderRadius: "20px",
        });
      }
    });

    Object.values(groups).forEach(({ unit, display, entries }) => {
      entries.forEach(({ card, unitPriceEl }) =>
        applyHighlight(card, unit, unitPriceEl),
      );
    });

    buildStrip(groups);
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
    return (
      params.has("k") ||
      params.has("field-keywords") ||
      window.location.pathname === "/s"
    );
  }

  if (isSearchPage()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attachObserver);
    } else {
      attachObserver();
    }
  }
})();
