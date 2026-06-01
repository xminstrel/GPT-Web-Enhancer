(function bootPopup(globalScope) {
  "use strict";

  const defaults = globalScope.LatexCopyDefaults || {
    enabled: true,
    clickMode: "single",
    pasteMode: "latex-delimited",
    timelineEnabled: true
  };
  const chromeApi = globalScope.chrome;
  const enabled = document.querySelector("#enabled");
  const clickMode = document.querySelector("#clickMode");
  const pasteMode = document.querySelector("#pasteMode");
  const timelineEnabled = document.querySelector("#timelineEnabled");
  const status = document.querySelector("#status");
  const exportButtons = [...document.querySelectorAll("[data-export-scope][data-export-format]")];
  const favoriteSummary = document.querySelector("#favoriteSummary");
  const favoriteList = document.querySelector("#favoriteList");
  const refreshFavorites = document.querySelector("#refreshFavorites");
  let statusTimer = 0;

  function setStatus(message, isError = false) {
    window.clearTimeout(statusTimer);
    status.textContent = message;
    status.dataset.state = isError ? "error" : "ok";
    statusTimer = window.setTimeout(() => {
      status.textContent = "";
      status.dataset.state = "";
    }, 1800);
  }

  function applyDefaults() {
    enabled.checked = Boolean(defaults.enabled);
    clickMode.value = defaults.clickMode;
    pasteMode.value = defaults.pasteMode;
    timelineEnabled.checked = Boolean(defaults.timelineEnabled);
  }

  if (!chromeApi?.storage?.sync || !chromeApi?.tabs) {
    applyDefaults();
    exportButtons.forEach((button) => {
      button.disabled = true;
    });
    refreshFavorites.disabled = true;
    favoriteSummary.textContent = "请在扩展环境中查看收藏";
    setStatus("请在扩展环境中使用导出");
    return;
  }

  function saveSetting(key, value) {
    chromeApi.storage.sync.set({ [key]: value }, () => {
      setStatus("已保存");
    });
  }

  function migratePasteMode(items) {
    if (items.pasteMode) {
      return items.pasteMode;
    }

    return items.delimiterMode === "raw" ? "latex-plain" : defaults.pasteMode;
  }

  function isChatGptUrl(url) {
    try {
      const parsed = new URL(url || "");
      return parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
    } catch (error) {
      return false;
    }
  }

  function getActiveChatTab(callback) {
    chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      if (!tab || typeof tab.id !== "number" || !isChatGptUrl(tab.url)) {
        callback(null);
        return;
      }

      callback(tab);
    });
  }

  function sendContentMessage(message, callback) {
    getActiveChatTab((tab) => {
      if (!tab) {
        callback({ ok: false, error: "请先打开 ChatGPT 页面" });
        return;
      }

      chromeApi.tabs.sendMessage(tab.id, message, (response) => {
        if (chromeApi.runtime.lastError) {
          callback({ ok: false, error: "请刷新 ChatGPT 后重试" });
          return;
        }

        callback(response || { ok: false, error: "没有收到页面响应" });
      });
    });
  }

  function renderFavorites(favorites = [], message = "") {
    favoriteList.replaceChildren();

    if (message) {
      favoriteSummary.textContent = message;
    } else {
      favoriteSummary.textContent = favorites.length
        ? `当前对话已收藏 ${favorites.length} 段问答`
        : "当前对话还没有收藏片段";
    }

    if (!favorites.length) {
      const empty = document.createElement("div");
      empty.className = "favorite-empty";
      empty.textContent = "在 ChatGPT 页面里点击 ☆ 收藏问答片段。";
      favoriteList.appendChild(empty);
      return;
    }

    favorites.forEach((favorite) => {
      const item = document.createElement("article");
      item.className = "favorite-item";
      item.setAttribute("role", "listitem");

      const main = document.createElement("button");
      main.type = "button";
      main.className = "favorite-item__main";
      main.dataset.favoriteAction = "jump";
      main.dataset.favoriteId = favorite.id;
      main.textContent = favorite.question;

      const meta = document.createElement("p");
      meta.textContent = favorite.answerPreview
        ? `第 ${favorite.index} 段 · ${favorite.answerPreview}`
        : `第 ${favorite.index} 段 · ${favorite.answerCount} 条回复`;

      const actions = document.createElement("div");
      actions.className = "favorite-item__actions";

      const jump = document.createElement("button");
      jump.type = "button";
      jump.dataset.favoriteAction = "jump";
      jump.dataset.favoriteId = favorite.id;
      jump.textContent = "定位";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.favoriteAction = "remove";
      remove.dataset.favoriteId = favorite.id;
      remove.textContent = "移除";

      actions.append(jump, remove);
      item.append(main, meta, actions);
      favoriteList.appendChild(item);
    });
  }

  function loadFavorites() {
    refreshFavorites.disabled = true;
    favoriteSummary.textContent = "正在读取收藏...";

    sendContentMessage(
      {
        type: "gpt-web-enhancer-favorites",
        action: "list"
      },
      (response) => {
        refreshFavorites.disabled = false;

        if (!response.ok) {
          renderFavorites([], response.error || "读取收藏失败");
          return;
        }

        renderFavorites(response.favorites || []);
      }
    );
  }

  function sendFavoriteAction(action, id) {
    sendContentMessage(
      {
        type: "gpt-web-enhancer-favorites",
        action,
        id
      },
      (response) => {
        if (!response.ok) {
          setStatus(response.error || "操作失败", true);
          return;
        }

        if (action === "jump") {
          setStatus("已定位到收藏");
          window.setTimeout(() => window.close(), 250);
          return;
        }

        setStatus("已移出收藏");
        renderFavorites(response.favorites || []);
      }
    );
  }

  function sendExportCommand(scope, format) {
    setStatus("正在导出...");
    sendContentMessage(
      {
        type: "gpt-web-enhancer-export",
        scope,
        format
      },
      (response) => {
        if (!response.ok) {
          setStatus(response.error || "导出失败", true);
          return;
        }

        setStatus(response.status || "导出完成");
      }
    );
  }

  chromeApi.storage.sync.get({ ...defaults, delimiterMode: "" }, (items) => {
    enabled.checked = Boolean(items.enabled);
    clickMode.value = items.clickMode || defaults.clickMode;
    pasteMode.value = migratePasteMode(items);
    timelineEnabled.checked = Boolean(items.timelineEnabled);
  });

  enabled.addEventListener("change", () => {
    saveSetting("enabled", enabled.checked);
  });

  clickMode.addEventListener("change", () => {
    saveSetting("clickMode", clickMode.value);
  });

  pasteMode.addEventListener("change", () => {
    saveSetting("pasteMode", pasteMode.value);
  });

  timelineEnabled.addEventListener("change", () => {
    saveSetting("timelineEnabled", timelineEnabled.checked);
  });

  exportButtons.forEach((button) => {
    button.addEventListener("click", () => {
      sendExportCommand(button.dataset.exportScope, button.dataset.exportFormat);
    });
  });

  refreshFavorites.addEventListener("click", loadFavorites);

  favoriteList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-favorite-action]");
    if (!actionButton) {
      return;
    }

    sendFavoriteAction(actionButton.dataset.favoriteAction, actionButton.dataset.favoriteId);
  });

  loadFavorites();
})(globalThis);
