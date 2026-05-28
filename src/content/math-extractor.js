(function exposeMathExtractor(globalScope) {
  "use strict";

  const SOURCE_SELECTOR = [
    "[data-latex]",
    "[data-tex]",
    "[data-math]",
    "math",
    "annotation[encoding='application/x-tex']",
    "annotation[encoding='application/x-latex']",
    "script[type^='math/tex']"
  ].join(",");

  const MATH_SELECTOR = [
    ".katex",
    ".katex-display",
    ".MathJax",
    "mjx-container",
    SOURCE_SELECTOR
  ].join(",");

  function cleanTex(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function cleanMarkup(value) {
    return String(value || "")
      .replace(/\sdata-semantic-[a-z-]+="[^"]*"/g, "")
      .replace(/\s+/g, " ")
      .replace(/>\s+</g, "><")
      .trim();
  }

  function readDataSource(element) {
    const source = element.closest("[data-latex], [data-tex], [data-math]");
    if (!source) {
      return "";
    }

    return cleanTex(source.dataset.latex || source.dataset.tex || source.dataset.math);
  }

  function readMathMlSource(element) {
    const directMath = element.closest("math");
    if (directMath) {
      return cleanMarkup(directMath.outerHTML);
    }

    const container = element.closest(".katex, .katex-display, .MathJax, mjx-container") || element;
    const math = container.querySelector("mjx-assistive-mml math, .katex-mathml math, math");
    return math ? cleanMarkup(math.outerHTML) : "";
  }

  function readAnnotationSource(element) {
    const container = element.closest(".katex, .katex-display, .MathJax, mjx-container") || element;
    const annotation = container.querySelector(
      "annotation[encoding='application/x-tex'], annotation[encoding='application/x-latex']"
    );

    return annotation ? cleanTex(annotation.textContent) : "";
  }

  function readScriptSource(element) {
    const script = element.closest("script[type^='math/tex']");
    if (script) {
      return cleanTex(script.textContent);
    }

    const mathJax = element.closest(".MathJax");
    if (!mathJax || !mathJax.id) {
      return "";
    }

    const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(mathJax.id) : mathJax.id;
    const sourceScript = document.querySelector(`script[type^='math/tex']#${escapedId}`);
    return sourceScript ? cleanTex(sourceScript.textContent) : "";
  }

  function inferKind(element) {
    const container = element.closest(".katex-display, mjx-container, script[type^='math/tex']");
    if (!container) {
      return "inline";
    }

    if (container.matches(".katex-display")) {
      return "display";
    }

    if (container.matches("mjx-container")) {
      return container.getAttribute("display") === "true" ? "display" : "inline";
    }

    if (container.matches("script[type^='math/tex']")) {
      return container.type.includes("mode=display") ? "display" : "inline";
    }

    return "inline";
  }

  function findMathTarget(startElement) {
    if (!startElement || startElement.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const displayContainer = startElement.closest(".katex-display");
    if (displayContainer) {
      return displayContainer;
    }

    return startElement.closest(MATH_SELECTOR);
  }

  function extract(startElement) {
    const target = findMathTarget(startElement);
    if (!target) {
      return null;
    }

    const tex =
      readDataSource(target) ||
      readAnnotationSource(target) ||
      readScriptSource(target);

    const mathml = readMathMlSource(target);

    if (!tex && !mathml) {
      return null;
    }

    return {
      tex,
      mathml,
      kind: inferKind(target),
      element: target
    };
  }

  function formatLatexWithDollar(tex, kind) {
    const normalized = cleanTex(tex);
    return kind === "display" ? `$$${normalized}$$` : `$${normalized}$`;
  }

  function format(result, pasteMode) {
    if (pasteMode === "mathml") {
      return result.mathml || "";
    }

    if (pasteMode === "latex-plain") {
      return cleanTex(result.tex);
    }

    return formatLatexWithDollar(result.tex, result.kind);
  }

  globalScope.LatexCopyExtractor = Object.freeze({
    extract,
    format,
    cleanTex,
    cleanMarkup
  });
})(globalThis);
