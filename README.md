# ChatGPT LaTeX Navigator

一个面向 ChatGPT 网页端的浏览器扩展，提供公式点击复制和右侧提问时间轴导航。

项目基于 Chrome/Edge Manifest V3 开发，目标是改善长对话里的数学公式复制和问题定位体验。

## 功能特性

- 点击 ChatGPT 回复中的行内公式或行间公式，自动复制原始公式内容。
- 支持多种公式复制格式：
  - LaTeX（带 `$` / `$$`）
  - LaTeX（纯文本）
  - MathML
- 鼠标悬停公式时，在公式周围显示轻量浮动边框。
- 在页面右侧生成用户提问时间轴节点。
- 点击时间轴节点，可快速定位到对应用户提问。
- 支持 ChatGPT SPA 页面主动注入，减少刷新或路由切换后脚本未生效的问题。
- 提供 popup 设置面板，可配置复制触发方式、复制格式和时间轴开关。

## 设计参考

时间轴导航功能参考了 [Nagi-ovo/gemini-voyager](https://github.com/Nagi-ovo/gemini-voyager) 的实现思路：

- 检测真实滚动容器，而不是只依赖 `window.scrollY`。
- 为每个消息节点维护稳定 ID。
- 复用已有节点，避免频繁重绘导致闪烁。
- 滚动时只更新节点位置和 active 状态。

本项目没有直接复制 Voyager 源码，而是根据 ChatGPT 的 DOM 结构重新实现。

## 支持站点

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## 安装使用

当前项目适合以“加载已解压扩展”的方式本地安装。

1. 下载或克隆本仓库。
2. 打开 Chrome 或 Edge 的扩展管理页。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目根目录。
6. 打开或刷新 ChatGPT 页面。

如果扩展更新后页面没有变化，请在扩展管理页点击“重新加载”，然后刷新 ChatGPT 页面。

## 使用说明

### 复制公式

在 ChatGPT 回复中，将鼠标放到已渲染的公式上：

- 公式周围会出现浮动边框。
- 单击或双击公式即可复制，触发方式可在 popup 中设置。
- 复制成功后会出现轻量提示。

### 切换复制格式

点击浏览器工具栏中的扩展图标，在 popup 中选择“复制格式”：

- `LaTeX（带 $）`：行内公式复制为 `$...$`，行间公式复制为 `$$...$$`。
- `LaTeX（纯文本）`：只复制公式源文本。
- `MathML`：复制页面中可用的 MathML 标记。

如果当前公式没有可用的 MathML 源，扩展会提示该格式不可用。

### 使用提问时间轴

打开较长的 ChatGPT 对话时，页面右侧会出现一条细时间轴：

- 每个节点对应一个用户提问。
- 点击节点会平滑定位到对应提问。
- 当前阅读位置附近的节点会显示 active 状态。
- 可在 popup 中关闭“提问时间轴”。

## 项目结构

```text
.
├── manifest.json
├── package.json
├── scripts/
│   └── check-extension.js
├── src/
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   ├── content.css
│   │   ├── content.js
│   │   └── math-extractor.js
│   ├── popup/
│   │   ├── popup.css
│   │   ├── popup.html
│   │   └── popup.js
│   └── shared/
│       └── defaults.js
└── tests/
    └── fixtures/
        └── katex-like.html
```

## 开发

项目目前不依赖构建工具，源码可直接作为 MV3 扩展加载。

运行基础检查：

```bash
npm run check
```

在 Windows PowerShell 中如果遇到执行策略限制，可以使用：

```powershell
npm.cmd run check
```

语法检查示例：

```powershell
node --check src\content\content.js
node --check src\content\math-extractor.js
node --check src\popup\popup.js
node --check src\background\service-worker.js
```

## 当前限制

- ChatGPT 页面 DOM 可能随时变化，公式提取和时间轴选择器可能需要跟进维护。
- MathML 复制依赖页面中是否保留 MathML 源。
- 时间轴目前主要基于用户提问节点，不包含助手回复节点、收藏节点或分支层级。
- 尚未提供 Chrome Web Store / Edge Add-ons 打包脚本和正式图标资源。

## 隐私说明

扩展只在 ChatGPT 页面中运行，用于读取当前页面 DOM 以实现公式复制和时间轴导航。

当前版本不会上传对话内容，也不连接第三方服务。设置项通过 `chrome.storage.sync` 保存在浏览器扩展存储中。

## License

MIT
