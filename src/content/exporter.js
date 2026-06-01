(function bootGptWebExporter(globalScope) {
  "use strict";

  if (globalScope.__gptWebExporterBooted) {
    return;
  }

  globalScope.__gptWebExporterBooted = true;

  const ROLE_SELECTOR = [
    "[data-message-author-role='user']",
    "[data-message-author-role='assistant']"
  ].join(",");
  const TURN_SELECTOR = [
    "[data-testid^='conversation-turn']",
    "[class*='conversation-turn']",
    "article"
  ].join(",");
  const EXPORT_IGNORE_SELECTOR = "[data-gpt-export-ignore]";
  const FAVORITE_PREFIX = "gpt-web-enhancer:favorites:";
  let toolbarTimer = 0;
  let exportToastTimer = 0;
  let favoritesDock = null;
  let favoritesDockOpen = false;
  const favoriteMemoryStore = new Map();

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function readCleanText(element) {
    if (!element) {
      return "";
    }

    const clone = element.cloneNode(true);
    for (const ignored of clone.querySelectorAll(EXPORT_IGNORE_SELECTOR)) {
      ignored.remove();
    }

    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function sanitizeFilename(value) {
    const base = normalizeText(value)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim();
    return base || "chatgpt-conversation";
  }

  function getTimestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes())
    ].join("");
  }

  function getConversationTitle() {
    const title = normalizeText(document.title)
      .replace(/\s*[|-]\s*ChatGPT\s*$/i, "")
      .replace(/^ChatGPT\s*[|-]\s*/i, "");
    return title && title !== "ChatGPT" ? title : "ChatGPT Conversation";
  }

  function getConversationKey() {
    return `${FAVORITE_PREFIX}${location.origin}${location.pathname}`;
  }

  function getExplicitId(element) {
    return (
      element.getAttribute("data-message-id") ||
      element.getAttribute("data-testid") ||
      element.querySelector("[data-message-id]")?.getAttribute("data-message-id") ||
      ""
    );
  }

  function getElementTop(element) {
    const rect = element.getBoundingClientRect();
    return rect.top + window.scrollY;
  }

  function getMessageAnchor(element) {
    return element.closest(TURN_SELECTOR) || element.closest("[data-message-id]") || element;
  }

  function inferTurnRole(turn, index) {
    const roleElement = turn.querySelector("[data-message-author-role]");
    if (roleElement) {
      return roleElement.getAttribute("data-message-author-role");
    }

    const testId = turn.getAttribute("data-testid") || "";
    const match = testId.match(/conversation-turn-(\d+)/);
    if (match) {
      return Number(match[1]) % 2 === 1 ? "user" : "assistant";
    }

    return index % 2 === 0 ? "user" : "assistant";
  }

  function getMessageContentElement(anchor, role) {
    return anchor.querySelector(`[data-message-author-role='${role}']`) || anchor;
  }

  function collectMessages() {
    const seen = new Set();
    const messages = [];
    const roleElements = [...document.querySelectorAll(ROLE_SELECTOR)];

    for (const roleElement of roleElements) {
      const role = roleElement.getAttribute("data-message-author-role");
      const anchor = getMessageAnchor(roleElement);

      if (!role || seen.has(anchor)) {
        continue;
      }

      const text = readCleanText(roleElement);
      if (!text) {
        continue;
      }

      seen.add(anchor);
      messages.push({
        id: getExplicitId(anchor) || `${role}-${messages.length}-${text.slice(0, 48)}`,
        role,
        text,
        element: anchor,
        top: getElementTop(anchor)
      });
    }

    if (messages.length > 0) {
      return messages.sort((a, b) => a.top - b.top);
    }

    return [...document.querySelectorAll(TURN_SELECTOR)]
      .map((turn, index) => {
        const role = inferTurnRole(turn, index);
        const text = readCleanText(getMessageContentElement(turn, role));
        return {
          id: getExplicitId(turn) || `${role}-${index}-${text.slice(0, 48)}`,
          role,
          text,
          element: turn,
          top: getElementTop(turn)
        };
      })
      .filter((message) => message.text)
      .sort((a, b) => a.top - b.top);
  }

  function collectPairs() {
    const pairs = [];
    let current = null;

    for (const message of collectMessages()) {
      if (message.role === "user") {
        current = {
          id: message.id,
          question: message.text,
          questionElement: message.element,
          answers: [],
          top: message.top
        };
        pairs.push(current);
        continue;
      }

      if (!current) {
        current = {
          id: `assistant-start-${pairs.length}`,
          question: "",
          questionElement: message.element,
          answers: [],
          top: message.top
        };
        pairs.push(current);
      }

      current.answers.push(message.text);
    }

    return pairs.filter((pair) => pair.question || pair.answers.length > 0);
  }

  function getFavoriteIds() {
    const key = getConversationKey();

    try {
      const stored = globalScope.localStorage
        ? globalScope.localStorage.getItem(key)
        : favoriteMemoryStore.get(key);
      const parsed = JSON.parse(stored || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      const parsed = JSON.parse(favoriteMemoryStore.get(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    }
  }

  function setFavoriteIds(ids) {
    const key = getConversationKey();
    const value = JSON.stringify([...new Set(ids)]);
    favoriteMemoryStore.set(key, value);

    try {
      if (globalScope.localStorage) {
        globalScope.localStorage.setItem(key, value);
      }
    } catch (error) {
      // Keep the session fallback when the page blocks storage.
    }
  }

  function isFavorite(pairId) {
    return getFavoriteIds().includes(pairId);
  }

  function truncateText(text, maxLength) {
    const value = normalizeText(text);
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 1)}...`;
  }

  function getFavoritePairs() {
    const favoriteIds = new Set(getFavoriteIds());
    return collectPairs().filter((pair) => favoriteIds.has(pair.id));
  }

  function getFavoriteSummaries() {
    const favoriteIds = new Set(getFavoriteIds());
    return collectPairs()
      .map((pair, index) => ({
        id: pair.id,
        index: index + 1,
        question: truncateText(pair.question || "(empty)", 120),
        answerPreview: truncateText(pair.answers[0] || "", 100),
        answerCount: pair.answers.length,
        isFavorite: favoriteIds.has(pair.id)
      }))
      .filter((pair) => pair.isFavorite);
  }

  function removeFavorite(pairId) {
    const ids = getFavoriteIds();
    const next = ids.filter((id) => id !== pairId);
    setFavoriteIds(next);
    scheduleToolbarRender();
    return next.length !== ids.length;
  }

  function toggleFavorite(pairId) {
    const ids = getFavoriteIds();
    const next = ids.includes(pairId) ? ids.filter((id) => id !== pairId) : [...ids, pairId];
    setFavoriteIds(next);
    scheduleToolbarRender();
    return next.includes(pairId);
  }

  function getCurrentPair() {
    const pairs = collectPairs();
    if (!pairs.length) {
      return null;
    }

    const target = window.scrollY + window.innerHeight * 0.38;
    let active = pairs[0];

    for (const pair of pairs) {
      if (pair.top <= target) {
        active = pair;
      } else {
        break;
      }
    }

    return active;
  }

  function getPairsForScope(scope) {
    const pairs = collectPairs();

    if (scope === "current") {
      const current = getCurrentPair();
      return current ? [current] : [];
    }

    if (scope === "favorites") {
      return getFavoritePairs();
    }

    return pairs;
  }

  function pairsToMessages(pairs) {
    const messages = [];
    for (const pair of pairs) {
      if (pair.question) {
        messages.push({ role: "user", text: pair.question });
      }
      for (const answer of pair.answers) {
        messages.push({ role: "assistant", text: answer });
      }
    }
    return messages;
  }

  function formatMarkdown(pairs, scope) {
    const title = getConversationTitle();
    const heading = scope === "favorites" ? `${title} - 收藏片段` : title;
    const lines = [`# ${heading}`, "", `> Exported by GPT Web Enhancer at ${new Date().toLocaleString()}`, ""];
    const messages = pairsToMessages(pairs);

    messages.forEach((message, index) => {
      lines.push(`## ${index + 1}. ${message.role === "user" ? "User" : "Assistant"}`, "");
      lines.push(message.text || "_(empty)_", "");
    });

    return lines.join("\n");
  }

  function formatHtml(pairs, scope, options = {}) {
    const title = getConversationTitle();
    const heading = scope === "favorites" ? `${title} - 收藏片段` : title;
    const messages = pairsToMessages(pairs);
    const printScript = options.print
      ? "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));</script>"
      : "";
    const body = messages.map((message, index) => {
      const label = message.role === "user" ? "User" : "Assistant";
      return [
        `<section class="message message--${message.role}">`,
        `<div class="message__meta">${index + 1}. ${label}</div>`,
        `<pre>${escapeHtml(message.text)}</pre>`,
        "</section>"
      ].join("");
    }).join("\n");

    return [
      "<!doctype html>",
      "<html lang=\"zh-CN\">",
      "<head>",
      "<meta charset=\"utf-8\">",
      `<title>${escapeHtml(heading)}</title>`,
      "<style>",
      "body{margin:0;background:#f7f9fb;color:#172026;font:14px/1.65 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
      "main{max-width:880px;margin:0 auto;padding:38px 24px 56px;}",
      "h1{margin:0 0 6px;font-size:28px;line-height:1.2;}",
      ".meta{margin:0 0 28px;color:#66737d;font-size:12px;}",
      ".message{margin:0 0 18px;padding:16px 18px;border:1px solid #dce5ea;border-radius:8px;background:#fff;break-inside:avoid;}",
      ".message--user{border-left:4px solid #0f7a7a;}",
      ".message--assistant{border-left:4px solid #506070;}",
      ".message__meta{margin-bottom:8px;color:#5b6872;font-size:12px;font-weight:700;text-transform:uppercase;}",
      "pre{margin:0;white-space:pre-wrap;word-break:break-word;font:inherit;}",
      "@media print{body{background:#fff;}main{max-width:none;padding:0;} .message{box-shadow:none;}}",
      "</style>",
      printScript,
      "</head>",
      "<body>",
      "<main>",
      `<h1>${escapeHtml(heading)}</h1>`,
      `<p class="meta">Exported by GPT Web Enhancer at ${escapeHtml(new Date().toLocaleString())}</p>`,
      body || "<p>No exportable messages found.</p>",
      "</main>",
      "</body>",
      "</html>"
    ].join("\n");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function openPrintPage(html) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (opened) {
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      return;
    }

    if (globalScope.chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "gpt-web-enhancer-open-tab", url }, () => {
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      });
      return;
    }

    downloadBlob(blob, `${sanitizeFilename(getConversationTitle())}-${getTimestamp()}-print.html`);
  }

  function wrapCanvasText(context, text, maxWidth) {
    const paragraphs = normalizeText(text).split(/\n+/);
    const lines = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.split(/(\s+)/).filter(Boolean);
      let line = "";

      for (const word of words) {
        const testLine = line + word;
        if (context.measureText(testLine).width <= maxWidth) {
          line = testLine;
          continue;
        }

        if (line.trim()) {
          lines.push(line.trimEnd());
          line = "";
        }

        if (context.measureText(word).width <= maxWidth) {
          line = word.trimStart();
          continue;
        }

        let chunk = "";
        for (const char of word) {
          if (context.measureText(chunk + char).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      }

      if (line.trim()) {
        lines.push(line.trimEnd());
      }
      lines.push("");
    }

    if (lines[lines.length - 1] === "") {
      lines.pop();
    }

    return lines;
  }

  function makePairImage(pair) {
    const width = 1200;
    const padding = 56;
    const gap = 26;
    const headerHeight = 84;
    const labelHeight = 26;
    const lineHeight = 28;
    const maxTextWidth = width - padding * 2;
    const scratch = document.createElement("canvas").getContext("2d");
    scratch.font = "24px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    const sections = [
      { label: "User", text: pair.question || "(empty)", accent: "#0f7a7a" },
      ...pair.answers.map((answer) => ({ label: "Assistant", text: answer, accent: "#506070" }))
    ].map((section) => ({
      ...section,
      lines: wrapCanvasText(scratch, section.text, maxTextWidth)
    }));
    const contentHeight = sections.reduce((total, section) => {
      return total + labelHeight + Math.max(1, section.lines.length) * lineHeight + gap;
    }, 0);
    const height = Math.min(6000, Math.max(520, padding + headerHeight + contentHeight + padding));
    const canvas = document.createElement("canvas");
    const scale = window.devicePixelRatio > 1 ? 2 : 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#f7f9fb";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#172026";
    context.font = "700 34px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    context.fillText(getConversationTitle(), padding, padding + 12);
    context.fillStyle = "#66737d";
    context.font = "18px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    context.fillText(`Exported by GPT Web Enhancer - ${new Date().toLocaleString()}`, padding, padding + 46);

    let y = padding + headerHeight;
    for (const section of sections) {
      const boxHeight = labelHeight + Math.max(1, section.lines.length) * lineHeight + 28;
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#dce5ea";
      context.lineWidth = 1;
      context.beginPath();
      if (context.roundRect) {
        context.roundRect(padding - 18, y - 22, maxTextWidth + 36, boxHeight, 12);
      } else {
        context.rect(padding - 18, y - 22, maxTextWidth + 36, boxHeight);
      }
      context.fill();
      context.stroke();
      context.fillStyle = section.accent;
      context.fillRect(padding - 18, y - 22, 5, boxHeight);
      context.fillStyle = "#5b6872";
      context.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      context.fillText(section.label.toUpperCase(), padding, y);
      context.fillStyle = "#172026";
      context.font = "24px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
      y += labelHeight;

      for (const line of section.lines) {
        context.fillText(line, padding, y);
        y += lineHeight;
      }

      y += gap;
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
    });
  }

  function getExportFilename(scope, extension) {
    const suffix = scope === "favorites" ? "favorites" : scope === "current" ? "current-qa" : "full";
    return `${sanitizeFilename(getConversationTitle())}-${suffix}-${getTimestamp()}.${extension}`;
  }

  async function exportPairList(pairs, scope, format) {
    if (!pairs.length) {
      throw new Error(scope === "favorites" ? "还没有收藏片段" : "没有找到可导出的对话");
    }

    if (format === "markdown") {
      downloadBlob(
        new Blob([formatMarkdown(pairs, scope)], { type: "text/markdown;charset=utf-8" }),
        getExportFilename(scope, "md")
      );
      return "Markdown 已导出";
    }

    if (format === "html") {
      downloadBlob(
        new Blob([formatHtml(pairs, scope)], { type: "text/html;charset=utf-8" }),
        getExportFilename(scope, "html")
      );
      return "HTML 已导出";
    }

    if (format === "pdf") {
      openPrintPage(formatHtml(pairs, scope, { print: true }));
      return "已打开 PDF 打印页";
    }

    if (format === "png") {
      const pair = pairs[0];
      const blob = await makePairImage(pair);
      downloadBlob(blob, getExportFilename("current", "png"));
      return "问答图片已导出";
    }

    throw new Error("未知导出格式");
  }

  async function exportPairs(scope, format) {
    return exportPairList(getPairsForScope(scope), scope, format);
  }

  function showExportToast(message, isError = false) {
    window.clearTimeout(exportToastTimer);

    let toast = document.querySelector(".gpt-export-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "gpt-export-toast";
      toast.setAttribute("data-gpt-export-ignore", "true");
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.dataset.state = isError ? "error" : "ok";
    toast.classList.add("is-visible");
    exportToastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 1600);
  }

  function createToolButton(label, title, action, pairId) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.dataset.action = action;
    button.dataset.pairId = pairId;
    return button;
  }

  function getPairById(pairId) {
    return collectPairs().find((pair) => pair.id === pairId) || null;
  }

  function scrollToPair(pairId) {
    const pair = getPairById(pairId);
    if (!pair || !pair.questionElement) {
      return false;
    }

    pair.questionElement.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    pair.questionElement.classList.add("gpt-export-highlight");
    window.setTimeout(() => {
      pair.questionElement.classList.remove("gpt-export-highlight");
    }, 1400);
    return true;
  }

  async function handleToolbarAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pair = getPairById(button.dataset.pairId);
    if (!pair) {
      showExportToast("没有找到这段问答", true);
      return;
    }

    try {
      if (button.dataset.action === "favorite") {
        const active = toggleFavorite(pair.id);
        showExportToast(active ? "已收藏片段" : "已取消收藏");
        return;
      }

      const formatByAction = {
        markdown: "markdown",
        html: "html",
        pdf: "pdf",
        png: "png"
      };
      const message = await exportPairList([pair], "current", formatByAction[button.dataset.action]);
      showExportToast(message);
    } catch (error) {
      showExportToast(error.message || "导出失败", true);
    }
  }

  function renderInlineTools() {
    toolbarTimer = 0;

    if (!document.body) {
      return;
    }

    const pairs = collectPairs();
    const activePairIds = new Set(pairs.map((pair) => pair.id));

    for (const pair of pairs) {
      if (!pair.questionElement || pair.questionElement.querySelector(":scope > .gpt-export-toolbar")) {
        const toolbar = pair.questionElement?.querySelector(":scope > .gpt-export-toolbar");
        if (toolbar) {
          toolbar.querySelector("[data-action='favorite']")?.classList.toggle("is-active", isFavorite(pair.id));
        }
        continue;
      }

      const toolbar = document.createElement("div");
      toolbar.className = "gpt-export-toolbar";
      toolbar.setAttribute("data-gpt-export-ignore", "true");
      toolbar.dataset.pairId = pair.id;
      toolbar.append(
        createToolButton("☆", "收藏片段", "favorite", pair.id),
        createToolButton("MD", "导出这段问答为 Markdown", "markdown", pair.id),
        createToolButton("HTML", "导出这段问答为 HTML", "html", pair.id),
        createToolButton("PDF", "打开这段问答的 PDF 打印页", "pdf", pair.id),
        createToolButton("PNG", "导出这段问答为图片", "png", pair.id)
      );
      toolbar.addEventListener("click", handleToolbarAction);
      toolbar.querySelector("[data-action='favorite']").classList.toggle("is-active", isFavorite(pair.id));
      pair.questionElement.appendChild(toolbar);
    }

    for (const toolbar of document.querySelectorAll(".gpt-export-toolbar")) {
      if (!activePairIds.has(toolbar.dataset.pairId)) {
        toolbar.remove();
      }
    }

    renderFavoritesDock();
  }

  function scheduleToolbarRender() {
    if (toolbarTimer) {
      return;
    }

    toolbarTimer = window.setTimeout(renderInlineTools, 800);
  }

  function createFavoritesDock() {
    if (favoritesDock || !document.body) {
      return favoritesDock;
    }

    favoritesDock = document.createElement("aside");
    favoritesDock.className = "gpt-favorites-dock";
    favoritesDock.setAttribute("data-gpt-export-ignore", "true");
    favoritesDock.innerHTML = [
      "<button class=\"gpt-favorites-dock__trigger\" type=\"button\">",
      "<span>收藏夹</span>",
      "<strong>0</strong>",
      "</button>",
      "<section class=\"gpt-favorites-dock__panel\" aria-label=\"本地收藏\">",
      "<header>",
      "<span>本地收藏</span>",
      "<button type=\"button\" data-favorite-action=\"close\" aria-label=\"关闭收藏夹\">×</button>",
      "</header>",
      "<div class=\"gpt-favorites-dock__list\"></div>",
      "</section>"
    ].join("");

    favoritesDock.querySelector(".gpt-favorites-dock__trigger").addEventListener("click", () => {
      favoritesDockOpen = !favoritesDockOpen;
      renderFavoritesDock();
    });
    favoritesDock.addEventListener("click", handleFavoritesDockClick);
    document.body.appendChild(favoritesDock);
    return favoritesDock;
  }

  function createFavoriteDockItem(favorite) {
    const item = document.createElement("article");
    item.className = "gpt-favorites-dock__item";
    item.dataset.pairId = favorite.id;

    const question = document.createElement("button");
    question.type = "button";
    question.className = "gpt-favorites-dock__question";
    question.dataset.favoriteAction = "jump";
    question.dataset.pairId = favorite.id;
    question.textContent = favorite.question;

    const meta = document.createElement("p");
    meta.textContent = favorite.answerPreview
      ? `第 ${favorite.index} 段 · ${favorite.answerPreview}`
      : `第 ${favorite.index} 段 · ${favorite.answerCount} 条回复`;

    const actions = document.createElement("div");
    actions.className = "gpt-favorites-dock__actions";

    const jump = document.createElement("button");
    jump.type = "button";
    jump.dataset.favoriteAction = "jump";
    jump.dataset.pairId = favorite.id;
    jump.textContent = "定位";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.favoriteAction = "remove";
    remove.dataset.pairId = favorite.id;
    remove.textContent = "移除";

    actions.append(jump, remove);
    item.append(question, meta, actions);
    return item;
  }

  function renderFavoritesDock() {
    const dock = createFavoritesDock();
    if (!dock) {
      return;
    }

    const favorites = getFavoriteSummaries();
    dock.querySelector(".gpt-favorites-dock__trigger strong").textContent = String(favorites.length);
    dock.classList.toggle("is-open", favoritesDockOpen);
    dock.classList.toggle("has-favorites", favorites.length > 0);

    const list = dock.querySelector(".gpt-favorites-dock__list");
    list.replaceChildren();

    if (!favorites.length) {
      const empty = document.createElement("p");
      empty.className = "gpt-favorites-dock__empty";
      empty.textContent = "还没有收藏片段";
      list.appendChild(empty);
      return;
    }

    favorites.forEach((favorite) => {
      list.appendChild(createFavoriteDockItem(favorite));
    });
  }

  function handleFavoritesDockClick(event) {
    const actionButton = event.target.closest("[data-favorite-action]");
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.favoriteAction;
    if (action === "close") {
      favoritesDockOpen = false;
      renderFavoritesDock();
      return;
    }

    const pairId = actionButton.dataset.pairId;
    if (action === "jump") {
      if (scrollToPair(pairId)) {
        favoritesDockOpen = false;
        renderFavoritesDock();
      }
      return;
    }

    if (action === "remove") {
      removeFavorite(pairId);
      showExportToast("已移出收藏");
      renderFavoritesDock();
    }
  }

  if (globalScope.chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message) {
        return false;
      }

      if (message.type === "gpt-web-enhancer-export") {
        exportPairs(message.scope || "full", message.format || "markdown")
          .then((status) => sendResponse({ ok: true, status }))
          .catch((error) => sendResponse({ ok: false, error: error.message || "导出失败" }));
        return true;
      }

      if (message.type === "gpt-web-enhancer-favorites") {
        if (message.action === "jump") {
          sendResponse({ ok: scrollToPair(message.id), favorites: getFavoriteSummaries() });
          return false;
        }

        if (message.action === "remove") {
          removeFavorite(message.id);
          sendResponse({ ok: true, favorites: getFavoriteSummaries() });
          return false;
        }

        sendResponse({
          ok: true,
          title: getConversationTitle(),
          favorites: getFavoriteSummaries()
        });
        return false;
      }

      return false;
    });
  }

  const observer = new MutationObserver((mutations) => {
    const ownMutation = mutations.every((mutation) => {
      const target = mutation.target;
      return target instanceof Element && target.closest(
        ".gpt-export-toolbar, .gpt-export-toast, .gpt-favorites-dock"
      );
    });

    if (!ownMutation) {
      scheduleToolbarRender();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  globalScope.__gptWebExporterDebug = {
    collectMessages,
    collectPairs,
    getFavoriteIds,
    getFavoriteSummaries,
    exportPairs,
    scrollToPair,
    renderInlineTools
  };

  scheduleToolbarRender();
})(globalThis);
