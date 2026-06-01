(function bootLatexCopy(globalScope) {
  "use strict";

  if (globalScope.__latexCopyBooted) {
    document.documentElement.dataset.latexCopyBooted = "true";
    return;
  }

  globalScope.__latexCopyBooted = true;
  document.documentElement.dataset.latexCopyBooted = "true";

  const defaults = globalScope.LatexCopyDefaults || {
    enabled: true,
    clickMode: "single",
    pasteMode: "latex-delimited",
    timelineEnabled: true,
    toastDurationMs: 1400
  };
  const extractor = globalScope.LatexCopyExtractor || {
    extract: () => null,
    format: () => ""
  };
  let settings = { ...defaults };
  let toastTimer = 0;
  let hoveredElement = null;
  let frameElement = null;
  let frameUpdateId = 0;
  let timelineRoot = null;
  let timelineTrack = null;
  let timelineItems = [];
  let timelineNodeMap = new Map();
  let timelineScrollContainer = null;
  let timelineObservedScrollContainer = null;
  let timelineSignature = "";
  let timelineRefreshTimer = 0;
  let timelinePositionId = 0;
  let timelineObserver = null;
  let timelineCalibrationTimer = 0;
  const userMessageSelector = [
    "[data-message-author-role='user']",
    "[data-testid='conversation-turn-user']",
    "[data-testid='user-message']",
    "[data-testid*='user'][data-testid*='message']",
    "[class*='user-message']"
  ].join(",");
  const conversationTurnSelector = [
    "[data-testid^='conversation-turn']",
    "[class*='conversation-turn']",
    "article"
  ].join(",");
  const userBubbleFallbackSelector = [
    "main [class*='ml-auto']",
    "main [class*='items-end']"
  ].join(",");

  function migrateSettings(items) {
    const next = { ...defaults, ...items };

    if (!items.pasteMode && items.delimiterMode) {
      next.pasteMode = items.delimiterMode === "raw" ? "latex-plain" : "latex-delimited";
    }

    return next;
  }

  function loadSettings() {
    if (!globalScope.chrome || !chrome.storage || !chrome.storage.sync) {
      settings = { ...defaults };
      applyDocumentState();
      scheduleTimelineRefresh();
      return;
    }

    chrome.storage.sync.get({ ...defaults, delimiterMode: "" }, (items) => {
      settings = migrateSettings(items);
      applyDocumentState();
      scheduleTimelineRefresh();
    });
  }

  function applyDocumentState() {
    document.documentElement.dataset.latexCopyEnabled = String(settings.enabled);
    document.documentElement.dataset.latexCopyTimelineEnabled = String(
      settings.enabled && settings.timelineEnabled
    );
  }

  function shouldHandleEvent(event) {
    if (!settings.enabled) {
      return false;
    }

    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }

    return (
      (settings.clickMode === "single" && event.type === "click") ||
      (settings.clickMode === "double" && event.type === "dblclick")
    );
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
    } finally {
      textArea.remove();
    }
  }

  function showToast(message, anchorElement, isError) {
    window.clearTimeout(toastTimer);

    let toast = document.querySelector(".latex-copy-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "latex-copy-toast";
      document.documentElement.appendChild(toast);
    }

    const rect = anchorElement.getBoundingClientRect();
    toast.textContent = message;
    toast.dataset.state = isError ? "error" : "ok";
    toast.style.left = `${Math.min(rect.left + rect.width / 2, window.innerWidth - 24)}px`;
    toast.style.top = `${Math.max(rect.top - 10, 12)}px`;
    toast.classList.add("is-visible");

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, settings.toastDurationMs);
  }

  function getFormulaFrame() {
    if (!frameElement) {
      frameElement = document.createElement("div");
      frameElement.className = "latex-copy-frame";
      document.documentElement.appendChild(frameElement);
    }

    return frameElement;
  }

  function getFrameRect(element) {
    const rect = element.getBoundingClientRect();
    const padding = element.matches(".katex-display, mjx-container[display='true']") ? 10 : 6;
    const left = Math.max(8, rect.left - padding);
    const top = Math.max(8, rect.top - padding);

    return {
      left,
      top,
      width: Math.max(24, Math.min(window.innerWidth - left - 8, rect.width + padding * 2)),
      height: Math.max(24, rect.height + padding * 2)
    };
  }

  function positionFormulaFrame() {
    if (!hoveredElement || !frameElement) {
      return;
    }

    const rect = getFrameRect(hoveredElement);
    frameElement.style.left = `${rect.left}px`;
    frameElement.style.top = `${rect.top}px`;
    frameElement.style.width = `${rect.width}px`;
    frameElement.style.height = `${rect.height}px`;
  }

  function scheduleFormulaFramePosition() {
    if (!hoveredElement || !frameElement || frameUpdateId) {
      return;
    }

    frameUpdateId = window.requestAnimationFrame(() => {
      frameUpdateId = 0;
      positionFormulaFrame();
    });
  }

  function hideFormulaFrame() {
    if (hoveredElement) {
      hoveredElement.classList.remove("latex-copy-hovered");
      hoveredElement = null;
    }

    if (frameElement) {
      frameElement.classList.remove("is-visible");
    }

    if (frameUpdateId) {
      window.cancelAnimationFrame(frameUpdateId);
      frameUpdateId = 0;
    }
  }

  function showFormulaFrame(result) {
    if (!settings.enabled || !result) {
      hideFormulaFrame();
      return;
    }

    if (hoveredElement && hoveredElement !== result.element) {
      hoveredElement.classList.remove("latex-copy-hovered");
    }

    hoveredElement = result.element;
    hoveredElement.classList.add("latex-copy-hovered");

    const frame = getFormulaFrame();
    positionFormulaFrame();
    frame.classList.add("is-visible");
  }

  function handleFormulaHover(event) {
    if (!settings.enabled) {
      return;
    }

    const result = extractor.extract(event.target);
    if (!result) {
      return;
    }

    showFormulaFrame(result);
  }

  function handleFormulaLeave(event) {
    if (!hoveredElement) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && hoveredElement.contains(nextTarget)) {
      return;
    }

    hideFormulaFrame();
  }

  function getTimelineRoot() {
    if (!timelineRoot) {
      timelineRoot = document.createElement("nav");
      timelineRoot.className = "latex-copy-timeline";
      timelineRoot.setAttribute("aria-label", "用户提问时间轴");

      timelineTrack = document.createElement("div");
      timelineTrack.className = "latex-copy-timeline__track";
      timelineRoot.appendChild(timelineTrack);
      document.body.appendChild(timelineRoot);
    }

    return timelineRoot;
  }

  function getQuestionAnchor(element) {
    const turn = element.closest("[data-testid^='conversation-turn'], [class*='conversation-turn'], article");
    if (turn) {
      return turn;
    }

    return element.closest("[data-message-id]") || element;
  }

  function getQuestionText(anchor) {
    const source = (anchor.querySelector("[data-message-author-role='user']") || anchor).cloneNode(true);

    for (const ignored of source.querySelectorAll("[data-gpt-export-ignore]")) {
      ignored.remove();
    }

    return String(source.innerText || source.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isUsableQuestionText(text) {
    return text.length >= 1 && text.length <= 12000;
  }

  function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1)}...`;
  }

  function getDocumentTop(element) {
    if (!timelineScrollContainer || timelineScrollContainer === document.documentElement) {
      const rect = element.getBoundingClientRect();
      return rect.top + window.scrollY;
    }

    const containerRect = timelineScrollContainer.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return rect.top - containerRect.top + timelineScrollContainer.scrollTop;
  }

  function getScrollContainerForElement(element) {
    let current = element.parentElement;

    while (current && current !== document.body) {
      const style = getComputedStyle(current);
      const canScroll = style.overflowY === "auto" || style.overflowY === "scroll";

      if (canScroll && current.scrollHeight > current.clientHeight + 1) {
        return current;
      }

      current = current.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function syncTimelineScrollListener() {
    if (timelineObservedScrollContainer === timelineScrollContainer) {
      return;
    }

    if (timelineObservedScrollContainer) {
      timelineObservedScrollContainer.removeEventListener("scroll", scheduleTimelinePosition);
    }

    timelineObservedScrollContainer = timelineScrollContainer;

    if (
      timelineObservedScrollContainer &&
      timelineObservedScrollContainer !== document.documentElement &&
      timelineObservedScrollContainer !== document.body
    ) {
      timelineObservedScrollContainer.addEventListener("scroll", scheduleTimelinePosition, {
        passive: true
      });
    }
  }

  function getTimelineItemId(element, index, text) {
    const explicitId =
      element.getAttribute("data-testid") ||
      element.getAttribute("data-message-id") ||
      element.querySelector("[data-message-id]")?.getAttribute("data-message-id");

    if (explicitId) {
      return explicitId;
    }

    return `question-${index}-${text.slice(0, 64)}`;
  }

  function filterTopLevelElements(elements) {
    return elements.filter((element) => {
      return !elements.some((other) => other !== element && other.contains(element));
    });
  }

  function findQuestions() {
    const candidates = [];
    const seen = new Set();

    function addQuestion(element, anchorOverride) {
      const anchor = anchorOverride || getQuestionAnchor(element);
      const text = getQuestionText(anchor);

      if (!isUsableQuestionText(text) || seen.has(anchor)) {
        return;
      }

      seen.add(anchor);
      candidates.push({
        element: anchor,
        text
      });
    }

    for (const turn of document.querySelectorAll(conversationTurnSelector)) {
      const userMessage = turn.querySelector(userMessageSelector);
      const assistantMessage = turn.querySelector("[data-message-author-role='assistant']");
      const testId = turn.getAttribute("data-testid") || "";
      const turnNumberMatch = testId.match(/conversation-turn-(\d+)/);
      const isLikelyUserTurn = turnNumberMatch && Number(turnNumberMatch[1]) % 2 === 1;

      if (userMessage) {
        addQuestion(userMessage, turn);
        continue;
      }

      if (isLikelyUserTurn && !assistantMessage) {
        addQuestion(turn, turn);
        continue;
      }

      if (!assistantMessage && turn.matches("[data-testid*='user'], [class*='user']")) {
        addQuestion(turn, turn);
      }
    }

    for (const element of document.querySelectorAll(userMessageSelector)) {
      addQuestion(element);
    }

    for (const element of document.querySelectorAll(userBubbleFallbackSelector)) {
      const anchor = getQuestionAnchor(element);
      const assistantMessage = anchor.querySelector("[data-message-author-role='assistant']");

      if (assistantMessage) {
        continue;
      }

      addQuestion(element, anchor);
    }

    for (const element of document.querySelectorAll("[data-message-author-role]")) {
      if (element.getAttribute("data-message-author-role") !== "user") {
        continue;
      }

      const anchor = getQuestionAnchor(element);
      addQuestion(element, anchor);
    }

    const topLevel = filterTopLevelElements(candidates.map((candidate) => candidate.element));
    const textByElement = new Map(candidates.map((candidate) => [candidate.element, candidate.text]));

    if (topLevel.length > 0) {
      timelineScrollContainer = getScrollContainerForElement(topLevel[0]);
      syncTimelineScrollListener();
    }

    return topLevel
      .map((element, index) => {
        const text = textByElement.get(element) || getQuestionText(element);
        const top = getDocumentTop(element);

        return {
          id: getTimelineItemId(element, index, text),
          element,
          text,
          top
        };
      })
      .sort((a, b) => a.top - b.top);
  }

  function getTimelineSignature(items) {
    return items
      .map((item) => {
        return `${item.id}:${item.text.slice(0, 80)}`;
      })
      .join("|");
  }

  function setActiveTimelineNode() {
    if (!timelineTrack || !timelineItems.length) {
      return;
    }

    const scrollTop =
      !timelineScrollContainer || timelineScrollContainer === document.documentElement
        ? window.scrollY
        : timelineScrollContainer.scrollTop;
    const viewportHeight =
      !timelineScrollContainer || timelineScrollContainer === document.documentElement
        ? window.innerHeight
        : timelineScrollContainer.clientHeight;
    const targetTop = scrollTop + viewportHeight * 0.4;
    let activeIndex = 0;

    for (let index = 0; index < timelineItems.length; index += 1) {
      if (timelineItems[index].top <= targetTop) {
        activeIndex = index;
      } else {
        break;
      }
    }

    for (const node of timelineTrack.querySelectorAll(".latex-copy-timeline__node")) {
      node.classList.toggle("is-active", Number(node.dataset.index) === activeIndex);
    }
  }

  function positionTimelineNodes() {
    if (!timelineTrack || !timelineItems.length) {
      return;
    }

    for (const item of timelineItems) {
      item.top = getDocumentTop(item.element);
    }

    const firstTop = timelineItems[0].top;
    const lastTop = timelineItems[timelineItems.length - 1].top;
    const span = Math.max(1, lastTop - firstTop);

    for (const node of timelineTrack.querySelectorAll(".latex-copy-timeline__node")) {
      const item = timelineItems[Number(node.dataset.index)];
      if (!item) {
        continue;
      }

      const progress =
        timelineItems.length === 1 ? 0.5 : Math.min(1, Math.max(0, (item.top - firstTop) / span));
      node.style.top = `${progress * 100}%`;
    }

    setActiveTimelineNode();
  }

  function scrollToQuestion(index) {
    const item = timelineItems[index];
    if (!item) {
      return;
    }

    const container = timelineScrollContainer || getScrollContainerForElement(item.element);
    const targetRatio = 0.22;

    function getCurrentScrollTop() {
      if (!container || container === document.documentElement || container === document.body) {
        return window.scrollY;
      }

      return container.scrollTop;
    }

    function getViewportHeight() {
      if (!container || container === document.documentElement || container === document.body) {
        return window.innerHeight;
      }

      return container.clientHeight;
    }

    function computeTargetTop() {
      const rect = item.element.getBoundingClientRect();

      if (!container || container === document.documentElement || container === document.body) {
        return window.scrollY + rect.top - window.innerHeight * targetRatio;
      }

      const containerRect = container.getBoundingClientRect();
      return container.scrollTop + rect.top - containerRect.top - container.clientHeight * targetRatio;
    }

    function applyScroll(top, behavior) {
      const maxTop =
        !container || container === document.documentElement || container === document.body
          ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
          : Math.max(0, container.scrollHeight - container.clientHeight);
      const nextTop = Math.max(0, Math.min(maxTop, top));

      if (!container || container === document.documentElement || container === document.body) {
        window.scrollTo({ top: nextTop, behavior });
      } else {
        container.scrollTo({ top: nextTop, behavior });
      }
    }

    applyScroll(computeTargetTop(), "smooth");

    timelineItems.forEach((entry) => {
      entry.top = getDocumentTop(entry.element);
    });
    setActiveTimelineNode();

    window.clearTimeout(timelineCalibrationTimer);
    timelineCalibrationTimer = window.setTimeout(() => {
      const current = getCurrentScrollTop();
      const desired = computeTargetTop();
      const tolerance = Math.max(16, getViewportHeight() * 0.04);

      if (Math.abs(current - desired) > tolerance) {
        applyScroll(desired, "auto");
      }

      positionTimelineNodes();
    }, 520);
  }

  function renderTimeline() {
    const enabled = settings.enabled && settings.timelineEnabled;
    const root = getTimelineRoot();

    root.classList.toggle("is-visible", enabled);

    if (!enabled) {
      timelineItems = [];
      timelineSignature = "";
      timelineNodeMap.clear();
      timelineTrack.replaceChildren();
      return;
    }

    const nextItems = findQuestions();
    const nextSignature = getTimelineSignature(nextItems);

    timelineItems = nextItems;
    root.classList.toggle("has-nodes", timelineItems.length > 0);
    root.dataset.count = String(timelineItems.length);

    if (nextSignature === timelineSignature && timelineNodeMap.size === timelineItems.length) {
      positionTimelineNodes();
      return;
    }

    timelineSignature = nextSignature;

    const fragment = document.createDocumentFragment();
    const activeIds = new Set(timelineItems.map((item) => item.id));

    timelineItems.forEach((item, index) => {
      let node = timelineNodeMap.get(item.id);

      if (!node) {
        node = document.createElement("button");
        node.type = "button";
        node.className = "latex-copy-timeline__node";
        node.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          scrollToQuestion(Number(node.dataset.index));
        });
        timelineNodeMap.set(item.id, node);
        fragment.appendChild(node);
      }

      node.dataset.index = String(index);
      node.title = truncateText(item.text, 90);
      node.setAttribute("aria-label", `定位到第 ${index + 1} 个提问：${truncateText(item.text, 60)}`);
    });

    for (const [id, node] of timelineNodeMap.entries()) {
      if (!activeIds.has(id)) {
        node.remove();
        timelineNodeMap.delete(id);
      }
    }

    timelineTrack.appendChild(fragment);
    positionTimelineNodes();
  }

  function scheduleTimelineRefresh() {
    if (timelineRefreshTimer) {
      return;
    }

    timelineRefreshTimer = window.setTimeout(() => {
      timelineRefreshTimer = 0;
      renderTimeline();
    }, 700);
  }

  function scheduleTimelinePosition() {
    if (!timelineRoot || !timelineRoot.classList.contains("is-visible") || timelinePositionId) {
      return;
    }

    timelinePositionId = window.requestAnimationFrame(() => {
      timelinePositionId = 0;
      positionTimelineNodes();
    });
  }

  function startTimelineObserver() {
    if (timelineObserver) {
      return;
    }

    timelineObserver = new MutationObserver((mutations) => {
      const onlyOwnMutations = mutations.every((mutation) => {
        const target = mutation.target;
        return target instanceof Element && target.closest(
          ".latex-copy-timeline, .latex-copy-toast, .latex-copy-frame"
        );
      });

      if (onlyOwnMutations) {
        return;
      }

      scheduleTimelineRefresh();
    });

    timelineObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function handleFormulaClick(event) {
    if (!shouldHandleEvent(event)) {
      return;
    }

    const result = extractor.extract(event.target);
    if (!result) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const text = extractor.format(result, settings.pasteMode);
    if (!text) {
      showToast("当前格式不可用", result.element, true);
      return;
    }

    try {
      await writeClipboard(text);
      showToast("公式已复制", result.element, false);
    } catch (error) {
      console.error("[latex-copy] Clipboard write failed", error);
      showToast("复制失败", result.element, true);
    }
  }

  loadSettings();

  if (globalScope.chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      for (const [key, change] of Object.entries(changes)) {
        settings[key] = change.newValue;
      }

      applyDocumentState();
      if (!settings.enabled) {
        hideFormulaFrame();
      } else if (hoveredElement) {
        showFormulaFrame({ element: hoveredElement });
      }
      scheduleTimelineRefresh();
    });
  }

  globalScope.__latexCopyDebug = {
    getSettings: () => ({ ...settings }),
    getTimelineCount: () => timelineItems.length,
    getTimelineItems: () => timelineItems.map((item, index) => ({
      index,
      top: Math.round(item.top),
      text: truncateText(item.text, 80)
    })),
    refreshTimeline: () => {
      renderTimeline();
      return timelineItems.length;
    },
    selectorCounts: () => ({
      roleUser: document.querySelectorAll("[data-message-author-role='user']").length,
      roleAssistant: document.querySelectorAll("[data-message-author-role='assistant']").length,
      userCandidates: document.querySelectorAll(userMessageSelector).length,
      conversationTurns: document.querySelectorAll(conversationTurnSelector).length,
      oddConversationTurns: [...document.querySelectorAll(conversationTurnSelector)]
        .filter((turn) => {
          const testId = turn.getAttribute("data-testid") || "";
          const match = testId.match(/conversation-turn-(\d+)/);
          return match && Number(match[1]) % 2 === 1;
        })
        .length,
      fallbackBubbles: document.querySelectorAll(userBubbleFallbackSelector).length,
      timelineRoot: Boolean(document.querySelector(".latex-copy-timeline"))
    })
  };

  startTimelineObserver();
  document.addEventListener("mouseover", handleFormulaHover, true);
  document.addEventListener("mouseout", handleFormulaLeave, true);
  document.addEventListener("click", handleFormulaClick, true);
  document.addEventListener("dblclick", handleFormulaClick, true);
  window.addEventListener("scroll", scheduleFormulaFramePosition, true);
  window.addEventListener("scroll", scheduleTimelinePosition, true);
  window.addEventListener("resize", scheduleFormulaFramePosition);
  window.addEventListener("resize", scheduleTimelineRefresh);
})(globalThis);
