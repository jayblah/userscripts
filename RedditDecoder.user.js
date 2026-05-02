// ==UserScript==
// @name         Reddit Binary and NATO Decoder
// @namespace    http://tampermonkey.net/
// @version      1.0.3
// @description  Decodes NATO and Binary codes in Reddit comments with one-click search for Instagram, TikTok, OnlyFans, Fansly, and SimpCity.
// @author       JR
// @license      MIT
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const COMMENT_SELECTORS = [
    '[data-testid="comment"]',
    "shreddit-comment",
    ".Comment",
    ".usertext-body",
    ".md",
    ".comment",
  ];

  const COLORS = {
    bg: "#1a1a1b",
    border: "#343536",
    text: "#d7dadc",
    accent: "#ff4500",
    accentHover: "#ff5414",
    success: "#05a133",
    darkInput: "#050505",
  };

  const NATO_ALPHABET = {
    alpha: "A",
    alfa: "A",
    bravo: "B",
    charlie: "C",
    delta: "D",
    echo: "E",
    foxtrot: "F",
    golf: "G",
    hotel: "H",
    india: "I",
    juliet: "J",
    juliett: "J",
    kilo: "K",
    lima: "L",
    mike: "M",
    november: "N",
    oscar: "O",
    papa: "P",
    quebec: "Q",
    romeo: "R",
    sierra: "S",
    tango: "T",
    uniform: "U",
    victor: "V",
    whiskey: "W",
    xray: "X",
    "x-ray": "X",
    yankee: "Y",
    zulu: "Z",
    space: " ",
  };

  const NATO_WORDS = Object.keys(NATO_ALPHABET).sort(
    (a, b) => b.length - a.length,
  );

  const natoPattern = new RegExp(
    `\\b(?:${NATO_WORDS.join("|")})(?:[\\s,.-]+(?:${NATO_WORDS.join("|")}))*\\b`,
    "gi",
  );

  /**
   * UPDATED REGEX:
   * Looks for sequences of 0s and 1s that are multiples of 8.
   * Handles both spaced binary (01100001 01100010) and mashed binary (0110000101100010).
   */
  const binaryPattern = /\b(?:[01]{8}[\s]?){2,}\b/g;

  function buildSocialSearchURL(q) {
    const query = `${q} (site:instagram.com OR site:tiktok.com OR site:onlyfans.com OR site:fansly.com OR site:simpcity.cr)`;
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function createSelectionPopup() {
    const popup = document.createElement("div");
    popup.style.cssText = `position: absolute; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); z-index: 10000; display: none; overflow: hidden;`;
    const btn = document.createElement("button");
    btn.innerHTML = `🔍 Search`;
    btn.style.cssText = `background: transparent; color: ${COLORS.text}; border: none; padding: 6px 14px; cursor: pointer; font-size: 11px; font-weight: 600; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 32px;`;

    btn.onmouseover = () => (btn.style.background = COLORS.border);
    btn.onmouseout = () => (btn.style.background = "transparent");

    popup.appendChild(btn);
    document.body.appendChild(popup);
    return { popup, btn };
  }

  function createTranslationComponent(type, translatedText) {
    const container = document.createElement("div");
    container.style.cssText = `margin: 8px 0; padding: 6px; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 6px; font-family: sans-serif; display: flex; align-items: center; gap: 10px; color: ${COLORS.text};`;

    const label = document.createElement("div");
    label.style.cssText = `font-size: 10px; font-weight: 900; color: ${COLORS.accent}; text-transform: uppercase; letter-spacing: 1px;`;
    label.textContent = type === "nato" ? "NATO" : "BIN";

    const resultBox = document.createElement("div");
    resultBox.style.cssText = `background: ${COLORS.darkInput}; padding: 5px 10px; border-radius: 4px; font-family: monospace; font-size: 13px; flex-grow: 1; border: 1px solid #222; color: #eee; overflow-x: auto; white-space: nowrap;`;
    resultBox.textContent = translatedText;

    const btnStyle = `border: none; padding: 0 12px; height: 26px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: 700; transition: filter 0.1s;`;

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "COPY";
    copyBtn.style.cssText =
      btnStyle + `background: ${COLORS.border}; color: ${COLORS.text};`;
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(translatedText).then(() => {
        copyBtn.textContent = "DONE";
        copyBtn.style.background = COLORS.success;
        setTimeout(() => {
          copyBtn.textContent = "COPY";
          copyBtn.style.background = COLORS.border;
        }, 1000);
      });
    };

    const searchBtn = document.createElement("button");
    searchBtn.textContent = "SEARCH";
    searchBtn.style.cssText =
      btnStyle + `background: ${COLORS.accent}; color: white;`;
    searchBtn.onclick = () =>
      window.open(buildSocialSearchURL(translatedText), "_blank");

    container.append(label, resultBox, copyBtn, searchBtn);
    return container;
  }

  function natoToText(s) {
    let normalized = s.toLowerCase();
    let res = "",
      pos = 0,
      count = 0;

    while (pos < normalized.length) {
      while (pos < normalized.length && /[^a-z0-9]/.test(normalized[pos]))
        pos++;
      if (pos >= normalized.length) break;

      let matched = false;
      for (const w of NATO_WORDS) {
        if (normalized.substr(pos, w.length) === w) {
          const nextChar = normalized[pos + w.length];
          if (!nextChar || /[^a-z0-9]/.test(nextChar)) {
            res += NATO_ALPHABET[w];
            pos += w.length;
            count++;
            matched = true;
            break;
          }
        }
      }
      if (!matched) pos++;
    }
    return count >= 2 ? res : null;
  }

  function binaryToText(b) {
    // Remove all whitespace for processing
    const clean = b.replace(/\s/g, "");
    if (clean.length % 8 !== 0) return null;

    let res = "";
    for (let i = 0; i < clean.length; i += 8) {
      const charCode = parseInt(clean.substr(i, 8), 2);
      // Only include printable ASCII characters
      if (
        (charCode >= 32 && charCode <= 126) ||
        [9, 10, 13].includes(charCode)
      ) {
        res += String.fromCharCode(charCode);
      } else {
        return null; // Invalid character for standard text codes
      }
    }
    return res;
  }

  function processTextNode(node) {
    const text = node.textContent;

    // Process Binary
    const binMatches = text.match(binaryPattern);
    if (binMatches) {
      binMatches.forEach((m) => {
        const decoded = binaryToText(m);
        if (decoded && decoded.trim().length > 0) {
          node.parentNode.insertBefore(
            createTranslationComponent("binary", decoded),
            node.nextSibling,
          );
        }
      });
    }

    // Process NATO
    const natoMatches = text.match(natoPattern);
    if (natoMatches) {
      const decoded = natoToText(natoMatches.join(" "));
      if (decoded) {
        node.parentNode.insertBefore(
          createTranslationComponent("nato", decoded),
          node.nextSibling,
        );
      }
    }
  }

  function scanParagraph(p) {
    if (p.hasAttribute("data-decoded")) return;
    p.setAttribute("data-decoded", "true");

    const nodes = [];
    const walker = document.createTreeWalker(
      p,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(processTextNode);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          COMMENT_SELECTORS.forEach((selector) => {
            const paragraphs = node.matches?.(selector)
              ? node.querySelectorAll("p")
              : node.querySelectorAll(`${selector} p`);
            paragraphs.forEach(scanParagraph);
          });
        }
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  let selectionPopup = null;
  document.addEventListener("mouseup", (e) => {
    setTimeout(() => {
      const selection = window.getSelection();
      const selText = selection.toString().trim();

      if (
        selText.length > 0 &&
        COMMENT_SELECTORS.some((s) => e.target.closest(s))
      ) {
        if (!selectionPopup) selectionPopup = createSelectionPopup();
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        selectionPopup.btn.onclick = () => {
          window.open(buildSocialSearchURL(selText), "_blank");
          selectionPopup.popup.style.display = "none";
        };

        selectionPopup.popup.style.left = `${rect.left + window.scrollX + rect.width / 2 - 40}px`;
        selectionPopup.popup.style.top = `${rect.top + window.scrollY - 40}px`;
        selectionPopup.popup.style.display = "block";
      } else if (selectionPopup) {
        selectionPopup.popup.style.display = "none";
      }
    }, 50);
  });

  const initialScan = () => {
    COMMENT_SELECTORS.forEach((s) =>
      document.querySelectorAll(`${s} p`).forEach(scanParagraph),
    );
  };
  initialScan();

  console.log("Reddit Multi Code Decoder Loaded (v1.0.3)");
})();
