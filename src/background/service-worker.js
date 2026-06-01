chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (items) => {
    const defaults = {
      enabled: true,
      clickMode: "single",
      pasteMode: "latex-delimited",
      timelineEnabled: true,
      toastDurationMs: 1400
    };

    chrome.storage.sync.set({ ...defaults, ...items });
  });

  injectIntoExistingChatTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoExistingChatTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isChatGptUrl(tab.url)) {
    return;
  }

  injectIntoTab(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !isChatGptUrl(tab.url)) {
      return;
    }

    injectIntoTab(tabId);
  });
});

function isChatGptUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (
      parsed.hostname === "chatgpt.com" ||
      parsed.hostname === "chat.openai.com"
    );
  } catch (error) {
    return false;
  }
}

function injectIntoExistingChatTabs() {
  chrome.tabs.query(
    {
      url: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*"
      ]
    },
    (tabs) => {
      if (chrome.runtime.lastError) {
        return;
      }

      for (const tab of tabs) {
        if (typeof tab.id === "number") {
          injectIntoTab(tab.id);
        }
      }
    }
  );
}

function injectIntoTab(tabId) {
  chrome.scripting.insertCSS(
    {
      target: { tabId },
      files: ["src/content/content.css"]
    },
    () => {
      chrome.runtime.lastError;
    }
  );

  chrome.scripting.executeScript(
    {
      target: { tabId },
      files: [
        "src/shared/defaults.js",
        "src/content/math-extractor.js",
        "src/content/content.js",
        "src/content/exporter.js"
      ]
    },
    () => {
      chrome.runtime.lastError;
    }
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "gpt-web-enhancer-open-tab") {
    return false;
  }

  chrome.tabs.create({ url: message.url, active: true }, () => {
    sendResponse({
      ok: !chrome.runtime.lastError,
      error: chrome.runtime.lastError?.message || ""
    });
  });
  return true;
});
