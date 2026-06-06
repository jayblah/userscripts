// ==UserScript==
// @name         Unit Price Comparator for Amazon
// @namespace    https://github.com/jayblah/userscripts
// @version      2.3.1
// @description  Highlights lowest unit price cards with per-unit colors, legend, labels, jump buttons, and cross-unit weight conversion
// @author       Jay
// @match        *://*.amazon.com/*
// @match        *://*.amazon.co.uk/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  "use strict";

  // ─── Constants ────────────────────────────────────────────────────────────

  const CARD_SELECTOR = ".puis-card-container";
  const UNIT_PRICE_SELECTOR = ".a-unit-price";
  const LABEL_ATTR = "data-ulp-label";
  const WINNER_ATTR = "data-ulp-winner";
  const EXACT_ATTR = "data-ulp-exact";
  const STORAGE_KEY_POS = "ulp_panel_pos";
  const STORAGE_KEY_CACHE = "ulp_cache";

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
  const TO_GRAMS = {
    g: 1,
    kg: 1000,
    mg: 0.001,
    oz: 28.3495,
    lb: 453.592,
  };

  // Volume units → ml
  const TO_ML = {
    ml: 1,
    l: 1000,
    fl_oz: 29.5735,
  };

  // The canonical "compare group" merges weight units and volume units
  // so $/oz competes with $/lb and $/g etc.
  function compareGroup(unit) {
    if (unit in TO_GRAMS) return "weight";
    if (unit in TO_ML) return "volume";
    return unit; // everything else is its own group
  }

  // Normalise price to a per-gram or per-ml basis for cross-unit comparison.
  // Returns null if the unit isn't convertible.
  function normalisePrice(price, unit) {
    if (unit in TO_GRAMS) return price / TO_GRAMS[unit];
    if (unit in TO_ML) return price / TO_ML[unit];
    return null;
  }

  // ─── State ────────────────────────────────────────────────────────────────

  const unitColorMap = new Map(); // canonical unit → [border, bg]
  // groupColorMap maps a compare-group → color, so all weight units share one color slot
  const groupColorMap = new Map();

  function colorForUnit(unit) {
    if (!unitColorMap.has(unit)) {
      const group = compareGroup(unit);
      if (!groupColorMap.has(group)) {
        const idx = groupColorMap.size % PALETTE.length;
        groupColorMap.set(group, PALETTE[idx]);
      }
      unitColorMap.set(unit, groupColorMap.get(group));
    }
    return unitColorMap.get(unit);
  }

  // ─── Parsing ──────────────────────────────────────────────────────────────

  function parseUnitPrice(text) {
    const clean = text.replace(/\s+/g, " ").trim();
    const m = clean.match(/[\$£€](\d+(?:\.\d+)?)\/([a-zA-Z]+(?:\s[a-zA-Z]+)?)/);
    if (!m) return null;
    const price = parseFloat(m[1]);
    const rawUnit = m[2].trim().toLowerCase().replace(/\s+/g, " ");
    const unit = UNIT_ALIASES[rawUnit] ?? rawUnit;
    return { price, unit, display: `$${price.toFixed(2)}/${rawUnit}` };
  }

  // ─── Card helpers ─────────────────────────────────────────────────────────

  function getCardTitle(card) {
    // Amazon's title element selector varies — instead read the card's innerText
    // and take the first non-empty line, which is reliably the product title.
    const lines = card.innerText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines[0] ?? "";
  }

  function applyHighlight(card, unit, displayLabel, exactMatch) {
    const [border, bg] = colorForUnit(unit);
    card.style.border = `4px solid ${border}`;
    card.style.backgroundColor = bg;
    card.setAttribute(WINNER_ATTR, unit);

    // Exact match gets a gold inner ring via outline
    if (exactMatch) {
      card.style.outline = "3px solid #f5a623";
      card.style.outlineOffset = "-7px";
      card.setAttribute(EXACT_ATTR, "");
    }

    // Stamp a unit price label badge onto the card if not already there
    if (!card.querySelector(`[${LABEL_ATTR}]`)) {
      const badge = document.createElement("div");
      badge.setAttribute(LABEL_ATTR, "");
      badge.textContent = exactMatch
        ? `★ ${displayLabel} ✓`
        : `★ ${displayLabel}`;
      Object.assign(badge.style, {
        position: "absolute",
        top: "6px",
        right: "6px",
        background: exactMatch ? "#f5a623" : border,
        color: "#fff",
        fontSize: "11px",
        fontWeight: "bold",
        padding: "2px 6px",
        borderRadius: "4px",
        zIndex: "9",
        pointerEvents: "none",
      });
      if (getComputedStyle(card).position === "static") {
        card.style.position = "relative";
      }
      card.appendChild(badge);
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
        card.querySelector(`[${LABEL_ATTR}]`)?.remove();
      });
    // Also remove injected per-card unit price labels on non-winners
    document.querySelectorAll(`[${LABEL_ATTR}]`).forEach((el) => el.remove());
  }

  // Inject a small grey unit price label onto every card that has one,
  // so cards Amazon doesn't show the price on still display it.
  function injectUnitPriceLabels(allParsed) {
    allParsed.forEach(({ card, parsed }) => {
      if (card.querySelector(`[${LABEL_ATTR}]`)) return; // winner badge already there
      const badge = document.createElement("div");
      badge.setAttribute(LABEL_ATTR, "");
      badge.textContent = parsed.display;
      Object.assign(badge.style, {
        position: "absolute",
        top: "6px",
        right: "6px",
        background: "#555",
        color: "#fff",
        fontSize: "10px",
        padding: "2px 5px",
        borderRadius: "4px",
        zIndex: "9",
        pointerEvents: "none",
      });
      if (getComputedStyle(card).position === "static") {
        card.style.position = "relative";
      }
      card.appendChild(badge);
    });
  }

  // ─── Search query ─────────────────────────────────────────────────────────

  function getSearchQuery() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("k") ?? params.get("field-keywords") ?? "";
    return q.trim().toLowerCase();
  }

  function isExactMatch(card, query) {
    if (!query) return false;
    const title = getCardTitle(card).toLowerCase();
    if (!title) return false;
    return query.split(/\s+/).every((word) => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`).test(title);
    });
  }

  // winners: { [compareGroup]: { normPrice, price, unit, display, cards: Set } }
  let lastWinners = {};

  function run() {
    clearHighlights();
    unitColorMap.clear();
    groupColorMap.clear();

    const query = getSearchQuery();
    const allParsed = [];

    // First pass: collect everything
    const groups = {}; // compareGroup → { exact: {normPrice, unit, display, cards: Map}, any: {same} }

    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      const unitPriceEl = card.querySelector(UNIT_PRICE_SELECTOR);
      const text = unitPriceEl ? unitPriceEl.innerText : card.innerText;
      const parsed = parseUnitPrice(text);
      if (!parsed) return;

      allParsed.push({ card, parsed });

      const { price, unit, display } = parsed;
      const group = compareGroup(unit);
      const normPrice = normalisePrice(price, unit) ?? price;
      const exact = isExactMatch(card, query);

      if (!groups[group]) groups[group] = { exact: null, any: null };

      // Track best among exact matches only
      if (exact) {
        const e = groups[group].exact;
        if (!e || normPrice < e.normPrice) {
          groups[group].exact = {
            normPrice,
            unit,
            display,
            cards: new Map([[card, true]]),
          };
        } else if (normPrice === e.normPrice) {
          e.cards.set(card, true);
        }
      }

      // Track best among all cards (fallback when no exact matches exist)
      const a = groups[group].any;
      if (!a || normPrice < a.normPrice) {
        groups[group].any = {
          normPrice,
          unit,
          display,
          cards: new Map([[card, exact]]),
        };
      } else if (normPrice === a.normPrice) {
        a.cards.set(card, exact);
      }
    });

    // Second pass: for each group, winners are exact-match pool if it exists,
    // otherwise fall back to the global best.
    const winners = {};
    Object.entries(groups).forEach(([group, { exact, any }]) => {
      winners[group] = exact ?? any;
    });

    Object.entries(winners).forEach(([, { unit, display, cards }]) => {
      cards.forEach((exact, card) =>
        applyHighlight(card, unit, display, exact),
      );
    });

    injectUnitPriceLabels(allParsed);

    lastWinners = winners;

    const cachePayload = Object.fromEntries(
      Object.entries(winners).map(
        ([group, { normPrice, price, unit, display }]) => [
          group,
          { normPrice, unit, display },
        ],
      ),
    );
    GM_setValue(STORAGE_KEY_CACHE, JSON.stringify(cachePayload));

    updatePanel();
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
    });

    // Restore saved position
    const savedPos = GM_getValue(STORAGE_KEY_POS, null);
    if (savedPos) {
      try {
        const { left, top } = JSON.parse(savedPos);
        panel.style.left = left;
        panel.style.top = top;
      } catch (_) {}
    } else {
      panel.style.right = "16px";
      panel.style.bottom = "80px";
    }

    // Header / drag handle
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
    });
    header.innerHTML = "🏷️ Best Unit Prices";
    panel.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.id = "ulp-body";
    Object.assign(body.style, { padding: "8px 10px" });
    panel.appendChild(body);

    document.body.appendChild(panel);
    makeDraggable(panel, header);
  }

  function updatePanel() {
    if (!panel) buildPanel();
    const body = panel.querySelector("#ulp-body");
    body.innerHTML = "";

    const entries = Object.entries(lastWinners);
    if (!entries.length) {
      body.textContent = "No unit prices found.";
      return;
    }

    // Sort entries by compare group label
    entries.sort(([a], [b]) => a.localeCompare(b));

    entries.forEach(([group, { unit, display, price, normPrice, cards }]) => {
      const [borderColor, bgColor] = colorForUnit(unit);

      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "6px",
      });

      // Color swatch
      const swatch = document.createElement("span");
      Object.assign(swatch.style, {
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        background: borderColor,
        flexShrink: "0",
        border: "1px solid rgba(0,0,0,0.15)",
      });

      // Label
      const label = document.createElement("span");
      label.style.flex = "1";

      // Show a human-readable group name
      const groupLabel =
        group === "weight"
          ? "Weight (g/oz/lb/kg)"
          : group === "volume"
            ? "Volume (ml/l/fl oz)"
            : group;
      label.innerHTML = `<strong>${groupLabel}</strong><br><span style="color:#555">${display}</span>`;

      row.appendChild(swatch);
      row.appendChild(label);
      body.appendChild(row);
    });

    // Cross-unit note if weight group has multiple original units
    const weightEntries = entries.filter(([g]) => g === "weight");
    if (weightEntries.length) {
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
        // Only commit to a drag after 4px movement to preserve click behaviour
        if (!dragging && dx < 4 && dy < 4) return;
        if (!dragging) {
          dragging = true;
          handle.style.cursor = "grabbing";
        }

        const newLeft = Math.max(
          0,
          Math.min(
            startLeft + (e.clientX - startX),
            window.innerWidth - el.offsetWidth,
          ),
        );
        const newTop = Math.max(
          0,
          Math.min(
            startTop + (e.clientY - startY),
            window.innerHeight - el.offsetHeight,
          ),
        );

        el.style.left = newLeft + "px";
        el.style.top = newTop + "px";
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
            JSON.stringify({
              left: el.style.left,
              top: el.style.top,
            }),
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

  function attachObserver() {
    observer.observe(document.body, { childList: true, subtree: true });
    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachObserver);
  } else {
    attachObserver();
  }
})();
