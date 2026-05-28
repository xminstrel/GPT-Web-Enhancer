(function exposeDefaults(globalScope) {
  "use strict";

  const defaults = {
    enabled: true,
    clickMode: "single",
    pasteMode: "latex-delimited",
    timelineEnabled: true,
    toastDurationMs: 1400
  };

  globalScope.LatexCopyDefaults = Object.freeze(defaults);
})(globalThis);
