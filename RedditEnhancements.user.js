// ==UserScript==
// @name            Reddit Enhancements
// @description     Nukes Reddit clutter, adds image lightbox/gallery, collapse tools, NATO/Binary decoder, and social search helpers.
// @version         1.0.0
// @match           *://*.reddit.com/*
// @updateURL       https://raw.githubusercontent.com/jayblah/userscripts/main/RedditEnhancements.user.js
// @downloadURL     https://raw.githubusercontent.com/jayblah/userscripts/main/RedditEnhancements.user.js
// @grant           none
// @run-at          document-start
// ==/UserScript==

(function () {
  "use strict";

  // =========================================================
  // CONFIG
  // =========================================================

  const THREAD_COLORS = [
    "#4CAF50",
    "#1E88DB",
    "#FF9800",
    "#B650C7",
    "#F44336",
    "#3ABAA2",
  ];

  const DECODER_COLORS = {
    bg: "#1a1a1b",
    border: "#343536",
    text: "#d7dadc",
    accent: "#ff4500",
    accentHover: "#ff5414",
    success: "#05a133",
    darkInput: "#050505",
  };

  const COMMENT_SELECTORS = [
    '[data-testid="comment"]',
    "shreddit-comment",
    ".Comment",
    ".usertext-body",
    ".md",
    ".comment",
  ];

  const NUKE_SELECTORS = [
    "#subreddit-banner-img",
    "shreddit-sidebar",
    "#right-sidebar-container",
    "aside:has(shreddit-sidebar)",
    "[grid-area='right-sidebar']",
    ".right-sidebar",
    'faceplate-tracker[noun="games_drawer"]',
    "games-section-badge-controller",
    "#games_section",
    'faceplate-tracker[noun="resources_menu"]',
    "shreddit-related-communities",
    'details:has(summary[aria-controls="RESOURCES"])',
    "community-highlight-carousel",
    'faceplate-tracker[source="achievements"]',
    'faceplate-tracker[source="earn"]',
    'faceplate-tracker[noun="premium_menu"]',
    'faceplate-tracker[noun="advertise"]',
    'faceplate-tracker[noun="try_reddit_pro"]',
    "search-telemetry-tracker:has(search-answers-response-container-streaming)",
    "search-answers-response-container-streaming",
    "in-feed-community-recommendations",
  ];

  const NUKE_SELECTOR_STRING = NUKE_SELECTORS.join(", ");

  // =========================================================
  // NATO / BINARY DECODER
  // =========================================================

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

  const binaryPattern = /\b(?:[01]{8}[\s]?){2,}\b/g;

  function buildSocialSearchURL(q) {
    const query =
      `${q} ` +
      `(site:instagram.com OR ` +
      `site:tiktok.com OR ` +
      `site:onlyfans.com OR ` +
      `site:fansly.com OR ` +
      `site:simpcity.cr OR ` +
      `site:fapello.com OR ` +
      `site:boobpedia.com OR ` +
      `site:babepedia.com)`;

    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function natoToText(s) {
    let normalized = s.toLowerCase();
    let res = "";
    let pos = 0;
    let count = 0;

    while (pos < normalized.length) {
      while (pos < normalized.length && /[^a-z0-9]/.test(normalized[pos])) {
        pos++;
      }

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
    const clean = b.replace(/\s/g, "");

    if (clean.length % 8 !== 0) return null;

    let res = "";

    for (let i = 0; i < clean.length; i += 8) {
      const charCode = parseInt(clean.substr(i, 8), 2);

      if (
        (charCode >= 32 && charCode <= 126) ||
        [9, 10, 13].includes(charCode)
      ) {
        res += String.fromCharCode(charCode);
      } else {
        return null;
      }
    }

    return res;
  }

  // =========================================================
  // GLOBAL CSS
  // =========================================================

  const globalStyle = document.createElement("style");

  globalStyle.textContent = `
    ${NUKE_SELECTOR_STRING} {
      display: none !important;
    }

    award-button,
    shreddit-slot[slot="award-button"] {
      display: none !important;
    }

    #user-drawer-content hr.bg-neutral-border-weak,
    #left-sidebar-container hr.border-neutral-border-weak,
    flex-left-nav-container hr.border-neutral-border-weak {
      display: none !important;
    }

    .pp_imageViewable {
      cursor: zoom-in !important;
    }

    #pp_lightbox {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.9);
      z-index: 999999;
      display: none;
      justify-content: center;
      align-items: center;
      cursor: zoom-out;
      user-select: none;
    }

    #pp_lightbox img {
      max-width: 95%;
      max-height: 95%;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      pointer-events: none;
    }

    .pp_nav_btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255,255,255,0.1);
      color: white;
      border: none;
      font-size: 28px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
      z-index: 1000000;
      box-sizing: border-box;
      height: 60px;
      width: 60px;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 0;
      line-height: 1;
    }

    .pp_nav_btn:hover {
      background: rgba(255,255,255,0.25);
    }

    #pp_nav_prev { left: 20px; }
    #pp_nav_next { right: 20px; }

    #pp_gallery_counter {
      position: absolute;
      bottom: 20px;
      color: rgba(255,255,255,0.7);
      font-family: sans-serif;
      font-size: 14px;
      background: rgba(0,0,0,0.5);
      padding: 4px 12px;
      border-radius: 12px;
      display: none;
    }

    .pp_post_noWrap {
      max-height: none !important;
      display: block !important;
    }

    .pp_post_unwrapContainer {
      width: 100%;
      display: flex;
      justify-content: center;
      padding: 12px 0;
      cursor: pointer;
      background: linear-gradient(transparent, rgba(0,0,0,0.05));
      border-bottom: 1px solid var(--color-neutral-border-weak);
    }

    .pp_post_unwrapButton {
      font-weight: bold;
      color: var(--color-interactive-default);
    }

    .pp_collapse_btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 12px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      color: #eeefef !important;
      background: #2a3236 !important;
      border: 1px solid #2a3236 !important;
      border-radius: 99px;
      cursor: pointer;
      height: var(--size-button-sm-h, 32px);
      transition: background 0.15s, border-color 0.15s;
      user-select: none;
      white-space: nowrap;
    }

    .pp_collapse_btn:hover {
      background: #3a454a !important;
      border-color: #3a454a !important;
    }

    .pp_collapse_btn.pp_collapsed {
      opacity: 0.85;
    }

    .pp_decoder_box {
      margin: 8px 0;
      padding: 6px;
      background: ${DECODER_COLORS.bg};
      border: 1px solid ${DECODER_COLORS.border};
      border-radius: 6px;
      font-family: sans-serif;
      display: flex;
      align-items: center;
      gap: 10px;
      color: ${DECODER_COLORS.text};
    }

    .pp_decoder_label {
      font-size: 10px;
      font-weight: 900;
      color: ${DECODER_COLORS.accent};
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .pp_decoder_result {
      background: ${DECODER_COLORS.darkInput};
      padding: 5px 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
      flex-grow: 1;
      border: 1px solid #222;
      color: #eee;
      overflow-x: auto;
      white-space: nowrap;
    }

    .pp_decoder_btn {
      border: none;
      padding: 0 12px;
      height: 26px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
      font-weight: 700;
      transition: filter 0.1s;
    }

    .pp_selection_popup {
      position: absolute;
      background: ${DECODER_COLORS.bg};
      border: 1px solid ${DECODER_COLORS.border};
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      z-index: 10000;
      display: none;
      overflow: hidden;
    }

    .pp_selection_popup button {
      background: transparent;
      color: ${DECODER_COLORS.text};
      border: none;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      font-family: sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 32px;
    }

    .pp_selection_popup button:hover {
      background: ${DECODER_COLORS.border};
    }
  `;

  document.documentElement.appendChild(globalStyle);

  // =========================================================
  // LIGHTBOX
  // =========================================================

  let currentGalleryImages = [];
  let currentGalleryIndex = 0;
  let lastWheelTime = 0;

  const lightbox = document.createElement("div");
  lightbox.id = "pp_lightbox";

  const lightboxImg = document.createElement("img");

  const prevBtn = document.createElement("button");
  prevBtn.id = "pp_nav_prev";
  prevBtn.className = "pp_nav_btn";
  prevBtn.innerHTML = "&#10094;";

  const nextBtn = document.createElement("button");
  nextBtn.id = "pp_nav_next";
  nextBtn.className = "pp_nav_btn";
  nextBtn.innerHTML = "&#10095;";

  const counter = document.createElement("div");
  counter.id = "pp_gallery_counter";

  lightbox.append(lightboxImg, prevBtn, nextBtn, counter);

  const updateLightboxImage = () => {
    if (!currentGalleryImages.length) return;

    const src = currentGalleryImages[currentGalleryIndex];

    lightboxImg.src = src.replaceAll("&amp;", "&");

    if (currentGalleryImages.length > 1) {
      prevBtn.style.display = "flex";
      nextBtn.style.display = "flex";
      counter.style.display = "block";
      counter.textContent = `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
    } else {
      prevBtn.style.display = "none";
      nextBtn.style.display = "none";
      counter.style.display = "none";
    }
  };

  const navigateGallery = (direction) => {
    if (!currentGalleryImages.length) return;

    currentGalleryIndex =
      (currentGalleryIndex + direction + currentGalleryImages.length) %
      currentGalleryImages.length;

    updateLightboxImage();
  };

  lightbox.onclick = (e) => {
    if (e.target === lightbox) {
      lightbox.style.display = "none";
    }
  };

  prevBtn.onclick = (e) => {
    e.stopPropagation();
    navigateGallery(-1);
  };

  nextBtn.onclick = (e) => {
    e.stopPropagation();
    navigateGallery(1);
  };

  // =========================================================
  // EVENTS
  // =========================================================

  window.addEventListener(
    "keydown",
    (e) => {
      if (lightbox.style.display === "flex") {
        const code = e.code;

        if (code === "ArrowRight" || code === "KeyD") {
          e.preventDefault();
          e.stopPropagation();
          navigateGallery(1);
        } else if (code === "ArrowLeft" || code === "KeyA") {
          e.preventDefault();
          e.stopPropagation();
          navigateGallery(-1);
        } else if (code === "Escape" || code === "KeyW") {
          e.preventDefault();
          e.stopPropagation();
          lightbox.style.display = "none";
        }
      }
    },
    true,
  );

  // Shadow DOM search routing rescue
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        const path = e.composedPath();

        const input = path.find(
          (el) =>
            el.tagName === "INPUT" && (el.name === "q" || el.type === "search"),
        );

        if (input) {
          const query = input.value ? input.value.trim() : "";

          if (query) {
            e.preventDefault();
            e.stopImmediatePropagation();

            window.location.assign(`/search/?q=${encodeURIComponent(query)}`);
          }
        }
      }
    },
    { capture: true },
  );

  window.addEventListener(
    "wheel",
    (e) => {
      if (lightbox.style.display === "flex") {
        e.preventDefault();
        e.stopPropagation();

        const now = Date.now();

        if (now - lastWheelTime < 150) return;

        if (e.deltaY > 0) {
          navigateGallery(1);
          lastWheelTime = now;
        } else if (e.deltaY < 0) {
          navigateGallery(-1);
          lastWheelTime = now;
        }
      }
    },
    { passive: false, capture: true },
  );

  // =========================================================
  // HELPERS
  // =========================================================

  const attachLightbox = () => {
    if (!document.getElementById("pp_lightbox")) {
      document.body?.append(lightbox);
    }
  };

  function createTranslationComponent(type, translatedText) {
    const container = document.createElement("div");
    container.className = "pp_decoder_box";

    const label = document.createElement("div");
    label.className = "pp_decoder_label";
    label.textContent = type === "nato" ? "NATO" : "BIN";

    const resultBox = document.createElement("div");
    resultBox.className = "pp_decoder_result";
    resultBox.textContent = translatedText;

    const copyBtn = document.createElement("button");
    copyBtn.className = "pp_decoder_btn";

    copyBtn.style.background = DECODER_COLORS.border;
    copyBtn.style.color = DECODER_COLORS.text;
    copyBtn.textContent = "COPY";

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(translatedText).then(() => {
        copyBtn.textContent = "DONE";
        copyBtn.style.background = DECODER_COLORS.success;

        setTimeout(() => {
          copyBtn.textContent = "COPY";
          copyBtn.style.background = DECODER_COLORS.border;
        }, 1000);
      });
    };

    const searchBtn = document.createElement("button");
    searchBtn.className = "pp_decoder_btn";

    searchBtn.style.background = DECODER_COLORS.accent;
    searchBtn.style.color = "white";
    searchBtn.textContent = "SEARCH";

    searchBtn.onclick = () => {
      window.open(buildSocialSearchURL(translatedText), "_blank");
    };

    container.append(label, resultBox, copyBtn, searchBtn);

    return container;
  }

  function processTextNode(node) {
    const text = node.textContent;

    // Binary
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

    // NATO
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

    while ((n = walker.nextNode())) {
      nodes.push(n);
    }

    nodes.forEach(processTextNode);
  }

  function createSelectionPopup() {
    const popup = document.createElement("div");
    popup.className = "pp_selection_popup";

    const btn = document.createElement("button");
    btn.innerHTML = "🔍 Search";

    popup.appendChild(btn);
    document.body.appendChild(popup);

    return { popup, btn };
  }

  // =========================================================
  // ACTIONS
  // =========================================================

  let allCollapsed = false;

  const Actions = {
    deepQuery: (root, selector) => {
      const found = root.querySelector(selector);

      if (found) return found;

      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          const result = Actions.deepQuery(el.shadowRoot, selector);

          if (result) return result;
        }
      }

      return null;
    },

    deepQueryAll: (root, selector, results = []) => {
      root.querySelectorAll(selector).forEach((el) => results.push(el));

      root.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) {
          Actions.deepQueryAll(el.shadowRoot, selector, results);
        }
      });

      return results;
    },

    injectCollapseButton: () => {
      if (!window.location.href.includes("/comments/")) return;

      const commentsBtn = Actions.deepQuery(
        document,
        'button[name="comments-action-button"]',
      );

      if (!commentsBtn || commentsBtn.hasAttribute("pp-has-sibling-btn")) {
        return;
      }

      const shadowHost = commentsBtn.getRootNode();

      if (shadowHost && shadowHost !== document) {
        const styleEl = document.createElement("style");

        styleEl.textContent = `
          .pp_collapse_btn {
            display: inline-flex;
            align-items: center;
            padding: 0 12px;
            font-size: 14px;
            font-weight: 600;
            font-family: inherit;
            color: #eeefef !important;
            background: #2a3236 !important;
            border: 1px solid #2a3236 !important;
            border-radius: 99px;
            cursor: pointer;
            height: var(--size-button-sm-h, 32px);
            transition: background 0.15s, border-color 0.15s;
            user-select: none;
            white-space: nowrap;
          }

          .pp_collapse_btn:hover {
            background: #3a454a !important;
            border-color: #3a454a !important;
          }
        `;

        shadowHost.appendChild(styleEl);
      }

      const btn = document.createElement("button");

      btn.className = "pp_collapse_btn";
      btn.textContent = "− Collapse";
      btn.title = "Collapse or expand all reply threads";

      btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const children = document.querySelectorAll(
          "shreddit-comment[depth]:not([depth='0'])",
        );

        if (!children.length) return;

        allCollapsed = !allCollapsed;

        for (let i = 0; i < children.length; i++) {
          if (allCollapsed) {
            children[i].setAttribute("collapsed", "");
          } else {
            children[i].removeAttribute("collapsed");
          }
        }

        btn.textContent = allCollapsed ? "+ Expand" : "− Collapse";

        btn.classList.toggle("pp_collapsed", allCollapsed);
      });

      commentsBtn.insertAdjacentElement("afterend", btn);

      commentsBtn.setAttribute("pp-has-sibling-btn", "true");
    },

    nukeAwardButtons: () => {
      Actions.deepQueryAll(
        document,
        "award-button, shreddit-slot[slot='award-button']",
      ).forEach((el) => {
        el.style.display = "none";
      });
    },

    nuke: () => {
      const items = document.querySelectorAll(NUKE_SELECTOR_STRING);

      for (let i = 0; i < items.length; i++) {
        items[i].remove();
      }

      const nav = document.querySelector("left-nav-top-section");

      if (nav && !nav.hasAttribute("pp-sanitized")) {
        nav.removeAttribute("news");
        nav.removeAttribute("explore");

        nav.shadowRoot
          ?.querySelectorAll('a[href="/news/"], a[href="/explore/"]')
          .forEach((link) => {
            (link.closest("li") || link).remove();
          });

        nav.setAttribute("pp-sanitized", "true");
      }
    },

    handleImages: (post) => {
      if (post.hasAttribute("pp-images-handled")) return;

      const images = post.querySelectorAll(
        "faceplate-img, img:not(.pp_imageViewable)",
      );

      if (!images.length) return;

      for (let i = 0; i < images.length; i++) {
        const imgEl = images[i];

        if (imgEl.classList.contains("pp_imageViewable")) {
          continue;
        }

        imgEl.classList.add("pp_imageViewable");

        imgEl.addEventListener(
          "click",
          (e) => {
            let clickedSrc =
              imgEl.getAttribute("src") ||
              imgEl.querySelector("img")?.getAttribute("src");

            if (!clickedSrc) return;

            e.preventDefault();
            e.stopPropagation();

            attachLightbox();

            const galleryContainer =
              imgEl.closest("gallery-carousel") || imgEl.closest("ul");

            if (galleryContainer) {
              const allImgs = Array.from(
                galleryContainer.querySelectorAll("faceplate-img, img"),
              );

              currentGalleryImages = allImgs
                .map(
                  (el) =>
                    el.getAttribute("src") ||
                    el.querySelector("img")?.getAttribute("src"),
                )
                .filter((src, idx, self) => src && self.indexOf(src) === idx);

              currentGalleryIndex = currentGalleryImages.indexOf(clickedSrc);

              if (currentGalleryIndex === -1) {
                currentGalleryIndex = 0;
              }
            } else {
              currentGalleryImages = [clickedSrc];
              currentGalleryIndex = 0;
            }

            updateLightboxImage();
            lightbox.style.display = "flex";
          },
          true,
        );
      }

      post.setAttribute("pp-images-handled", "true");
    },

    processComments: () => {
      const comments = document.querySelectorAll(
        "shreddit-comment:not([pp-checked])",
      );

      if (!comments.length) return;

      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i];

        comment.setAttribute("pp-checked", "true");

        if (comment.getAttribute("author") === "AutoModerator") {
          comment.setAttribute("collapsed", "");
        }

        const shadow = comment.shadowRoot;

        if (shadow && !shadow.querySelector(".pp-line-style")) {
          const depth = parseInt(comment.getAttribute("depth") || 0);

          const color = THREAD_COLORS[depth % THREAD_COLORS.length];

          const style = document.createElement("style");

          style.className = "pp-line-style";

          style.textContent = `
            div[data-testid="main-thread-line"] {
              background-color: ${color} !important;
              width: 2px !important;
              opacity: 1 !important;
            }

            div[data-testid="branch-line"] {
              border-left: 2px solid ${color} !important;
              border-bottom: 2px solid ${color} !important;
              opacity: 1 !important;
            }
          `;

          shadow.appendChild(style);
        }
      }
    },

    processDecoders: () => {
      COMMENT_SELECTORS.forEach((selector) => {
        document.querySelectorAll(`${selector} p`).forEach(scanParagraph);
      });
    },
  };

  // =========================================================
  // OBSERVER
  // =========================================================

  let updateScheduled = false;

  const observer = new MutationObserver(() => {
    if (updateScheduled) return;

    updateScheduled = true;

    setTimeout(() => {
      Actions.nuke();
      Actions.nukeAwardButtons();
      Actions.processComments();
      Actions.injectCollapseButton();
      Actions.processDecoders();

      const posts = document.querySelectorAll(
        "shreddit-post:not([pp-images-handled])",
      );

      for (let i = 0; i < posts.length; i++) {
        Actions.handleImages(posts[i]);
      }

      updateScheduled = false;
    }, 0);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // =========================================================
  // TEXT SELECTION SEARCH POPUP
  // =========================================================

  let selectionPopup = null;

  document.addEventListener("mouseup", (e) => {
    setTimeout(() => {
      const selection = window.getSelection();
      const selText = selection.toString().trim();

      if (
        selText.length > 0 &&
        COMMENT_SELECTORS.some((s) => e.target.closest?.(s))
      ) {
        if (!selectionPopup) {
          selectionPopup = createSelectionPopup();
        }

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

  // =========================================================
  // INIT
  // =========================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      attachLightbox();
      Actions.processDecoders();
    });
  } else {
    attachLightbox();
    Actions.processDecoders();
  }

  console.log("Reddit Enhancements + Decoder Loaded (v4.0.0)");
})();
