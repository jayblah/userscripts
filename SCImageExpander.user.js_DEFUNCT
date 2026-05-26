// ==UserScript==
// @name         SC Expand Image
// @version      1.5
// @description  Click thumbnail to expand the full image inline. Per-post expand button near Share.
// @match        https://simpcity.cr/*
// @match        https://forums.socialmediagirls.com/*
// @grant        none
// @run-at       document-end
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/jayblah/userscripts/main/SCImageExpander.user.js
// @downloadURL  https://raw.githubusercontent.com/jayblah/userscripts/main/SCImageExpander.user.js
// ==/UserScript==

(function () {
  "use strict";

  const THUMB_PATTERN = /\.(md|th)\.(jpg|webp)$/i;

  const style = document.createElement("style");
  style.textContent = `
    img.bbImage {
      cursor: pointer;
      transition: all 0.2s ease-in-out;
      display: inline-block;
      max-width: 200px;
      height: auto;
      margin: 2px;
    }
    img.bbImage.expanded {
      display: block;
      max-width: 100% !important;
      max-height: 90vh;
      margin: 8px auto;
    }
    .sc-expand-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      font-family: system-ui, sans-serif;
      color: #aaa;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      margin: 0;
      line-height: 1;
      transition: color 0.15s;
    }
    .sc-expand-btn:hover { color: #fff; }
    .sc-expand-btn.is-expanded { color: #3db7c7; }
  `;
  document.head.appendChild(style);

  function getBigUrl(src) {
    return src.replace(/\.(md|th)\.(jpg|webp)$/i, ".$2");
  }

  function cleanAttr(str) {
    return str.replace(/\.(md|th)(?=\.)/, "");
  }

  function processImage(img) {
    if (!THUMB_PATTERN.test(img.src)) return;
    if (img.title) img.title = cleanAttr(img.title);
    if (img.alt) img.alt = cleanAttr(img.alt);
  }

  function injectExpandButton(header) {
    if (header.querySelector(".sc-expand-btn")) return;

    const messageMain = header.closest(".message-main");
    if (!messageMain) return;
    const lbContainer = messageMain.querySelector(".js-lbContainer");
    if (!lbContainer) return;

    const btn = document.createElement("button");
    btn.className = "sc-expand-btn";
    btn.textContent = "⊞ EXP";
    btn.title = "Expand all images in this post";

    btn.addEventListener("click", () => {
      const images = lbContainer.querySelectorAll("img.bbImage");
      const isExpanded = btn.classList.contains("is-expanded");

      images.forEach((img) => {
        if (!isExpanded) {
          img.classList.add("expanded");
          if (!img.dataset.bigLoaded) {
            img.dataset.bigLoaded = "true";
            img.src = getBigUrl(img.src);
            img.removeAttribute("srcset");
          }
        } else {
          img.classList.remove("expanded");
        }
      });

      btn.classList.toggle("is-expanded", !isExpanded);
      btn.textContent = isExpanded ? "⊞ EXP" : "⊟ COL";
      btn.title = isExpanded
        ? "Expand all images in this post"
        : "Collapse all images in this post";
    });

    const li = document.createElement("li");
    li.appendChild(btn);
    header.appendChild(li);
  }

  function processAll() {
    document.querySelectorAll("img.bbImage").forEach(processImage);
    document
      .querySelectorAll(".message-attribution-opposite")
      .forEach(injectExpandButton);
  }

  document.body.addEventListener("click", (e) => {
    const img = e.target.closest("img.bbImage");
    if (!img) return;
    e.preventDefault();

    if (img.classList.contains("expanded")) {
      img.classList.remove("expanded");
    } else {
      img.classList.add("expanded");
      if (!img.dataset.bigLoaded) {
        img.dataset.bigLoaded = "true";
        img.src = getBigUrl(img.src);
        img.removeAttribute("srcset");
      }
    }
  });

  processAll();

  const observer = new MutationObserver(processAll);
  observer.observe(document.body, { childList: true, subtree: true });
})();
