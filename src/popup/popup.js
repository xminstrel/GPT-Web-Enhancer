(function bootPopup(globalScope) {
  "use strict";

  const defaults = globalScope.LatexCopyDefaults;
  const enabled = document.querySelector("#enabled");
  const clickMode = document.querySelector("#clickMode");
  const pasteMode = document.querySelector("#pasteMode");
  const timelineEnabled = document.querySelector("#timelineEnabled");
  const status = document.querySelector("#status");
  let statusTimer = 0;

  function setStatus(message) {
    window.clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = window.setTimeout(() => {
      status.textContent = "";
    }, 1200);
  }

  function saveSetting(key, value) {
    chrome.storage.sync.set({ [key]: value }, () => {
      setStatus("已保存");
    });
  }

  function migratePasteMode(items) {
    if (items.pasteMode) {
      return items.pasteMode;
    }

    return items.delimiterMode === "raw" ? "latex-plain" : defaults.pasteMode;
  }

  chrome.storage.sync.get({ ...defaults, delimiterMode: "" }, (items) => {
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
})(globalThis);
