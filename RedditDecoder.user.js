// ==UserScript==
// @name         Reddit Multi Code Decoder
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Professional dark-themed decoder. Search targets Instagram, TikTok, OnlyFans, Fansly, and SimpCity.cr.
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

  const natoPattern = new RegExp(
    `\\b(?:${Object.keys(NATO_ALPHABET).join("|")})(?:[\\s,.-]+(?:${Object.keys(NATO_ALPHABET).join("|")}))*\\b`,
    "gi",
  );
  const binaryPattern = /(?:\b[01]{8}\b[\s]*){2,}/g;

  // TARGETED SEARCH: Specifically targeting simpcity.cr as requested
  function buildSocialSearchURL(q) {
    const query = `${q} (site:instagram.com OR site:tiktok.com OR site:onlyfans.com OR site:fansly.com OR site:simpcity.cr)`;
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function createSelectionPopup() {
    const popup = document.createElement("div");
    popup.style.cssText = `position: fixed; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.8); z-index: 10000; display: none; overflow: hidden;`;
    const btn = document.createElement("button");
    btn.innerHTML = `🔍 Social Search`;
    btn.style.cssText = `background: transparent; color: ${COLORS.text}; border: none; padding: 4px 12px; cursor: pointer; font-size: 11px; font-weight: 600; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 28px;`;
    btn.onmouseover = () => (btn.style.background = COLORS.border);
    btn.onmouseout = () => (btn.style.background = "transparent");
    popup.appendChild(btn);
    document.body.appendChild(popup);
    return { popup, btn };
  }

  function createTranslationComponent(type, translatedText) {
    const container = document.createElement("div");
    container.style.cssText = `margin: 6px 0; padding: 4px 8px; background: ${COLORS.bg}; border: 1px solid ${COLORS.border}; border-radius: 4px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; gap: 8px; color: ${COLORS.text};`;
    const label = document.createElement("div");
    label.style.cssText = `font-size: 9px; font-weight: 800; color: ${COLORS.accent}; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;`;
    label.textContent = type === "nato" ? "NATO" : "BIN";
    const resultBox = document.createElement("div");
    resultBox.style.cssText = `background: ${COLORS.darkInput}; padding: 4px 10px; border-radius: 2px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; flex-grow: 1; border: 1px solid #222; color: #eee; overflow-x: auto; white-space: nowrap;`;
    resultBox.textContent = translatedText;
    const actionStyle = `border: none; padding: 0 10px; height: 24px; border-radius: 2px; cursor: pointer; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; transition: background 0.1s; white-space: nowrap;`;
    const copyBtn = document.createElement("button");
    copyBtn.textContent = "COPY";
    copyBtn.style.cssText =
      actionStyle + `background: ${COLORS.border}; color: ${COLORS.text};`;
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
    searchBtn.textContent = "SOCIAL SEARCH";
    searchBtn.style.cssText =
      actionStyle + `background: ${COLORS.accent}; color: white;`;
    searchBtn.onclick = () =>
      window.open(buildSocialSearchURL(translatedText), "_blank");
    container.append(label, resultBox, copyBtn, searchBtn);
    return container;
  }

  function natoToText(s) {
    let normalized = s.toLowerCase();
    const words = Object.keys(NATO_ALPHABET).sort(
      (a, b) => b.length - a.length,
    );
    let res = "",
      pos = 0,
      count = 0;
    while (pos < normalized.length) {
      while (pos < normalized.length && /[^a-z0-9]/.test(normalized[pos]))
        pos++;
      if (pos >= normalized.length) break;
      let matched = false;
      for (const w of words) {
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
    const clean = b.replace(/\s/g, "");
    if (clean.length % 8 !== 0) return null;
    let res = "";
    for (let i = 0; i < clean.length; i += 8) {
      const char = parseInt(clean.substr(i, 8), 2);
      if ((char >= 32 && char <= 126) || [9, 10, 13].includes(char))
        res += String.fromCharCode(char);
      else return null;
    }
    return res;
  }

  function processTextNode(node) {
    const bin = node.textContent.match(binaryPattern);
    if (bin)
      bin.forEach((m) => {
        const d = binaryToText(m);
        if (d)
          node.parentNode.insertBefore(
            createTranslationComponent("binary", d),
            node.nextSibling,
          );
      });
    const nato = node.textContent.match(natoPattern);
    if (nato) {
      const d = natoToText(nato.join(" "));
      if (d)
        node.parentNode.insertBefore(
          createTranslationComponent("nato", d),
          node.nextSibling,
        );
    }
  }

  function scan() {
    COMMENT_SELECTORS.forEach((s) => {
      document.querySelectorAll(`${s} p`).forEach((p) => {
        if (p.hasAttribute("data-decoded")) return;
        p.setAttribute("data-decoded", "true");
        const walker = document.createTreeWalker(
          p,
          NodeFilter.SHOW_TEXT,
          null,
          false,
        );
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(processTextNode);
      });
    });
  }

  let selectionPopup = null;
  document.addEventListener("mouseup", (e) => {
    setTimeout(() => {
      const sel = window.getSelection().toString().trim();
      if (
        sel.length > 0 &&
        COMMENT_SELECTORS.some((s) => e.target.closest(s))
      ) {
        if (!selectionPopup) selectionPopup = createSelectionPopup();
        selectionPopup.btn.onclick = () => {
          window.open(buildSocialSearchURL(sel), "_blank");
          selectionPopup.popup.style.display = "none";
        };
        selectionPopup.popup.style.left = `${e.clientX - 40}px`;
        selectionPopup.popup.style.top = `${e.clientY - 40}px`;
        selectionPopup.popup.style.display = "block";
      } else if (selectionPopup) {
        selectionPopup.popup.style.display = "none";
      }
    }, 50);
  });

  setInterval(scan, 1500);
  console.log("Reddit Multi Code Decoder Loaded");
})();
