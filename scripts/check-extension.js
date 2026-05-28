const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "manifest.json",
  "src/shared/defaults.js",
  "src/content/math-extractor.js",
  "src/content/content.js",
  "src/content/content.css",
  "src/background/service-worker.js",
  "src/popup/popup.html",
  "src/popup/popup.js",
  "src/popup/popup.css"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const manifestPath = path.join(root, "manifest.json");
const manifest = readJson(manifestPath);

assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(Array.isArray(manifest.content_scripts), "content_scripts is required");
assert(manifest.action && manifest.action.default_popup, "default popup is required");

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Missing required file: ${relativePath}`);
}

for (const script of manifest.content_scripts[0].js) {
  assert(fs.existsSync(path.join(root, script)), `Missing content script: ${script}`);
}

for (const cssFile of manifest.content_scripts[0].css || []) {
  assert(fs.existsSync(path.join(root, cssFile)), `Missing content css: ${cssFile}`);
}

console.log("Extension scaffold looks good.");
