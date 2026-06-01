# GPT Web Enhancer

面向 ChatGPT 网页端的浏览器扩展，用几个轻量但高频的能力改善长对话、数学内容和阅读定位体验。

当前版本基于 Chrome / Edge Manifest V3 开发，不需要构建步骤，适合快速加载、试用和二次开发。

## 现在能做什么

- 点击 ChatGPT 回复里的渲染公式，复制原始 LaTeX 或 MathML。
- 支持单击 / 双击两种复制触发方式。
- 支持三种复制格式：带 `$` / `$$` 的 LaTeX、纯 LaTeX、MathML。
- 鼠标悬停公式时显示轻量高亮框，降低误点概率。
- 在长对话右侧显示用户提问时间轴。
- 点击时间轴节点，快速定位到对应的用户提问。
- 支持 ChatGPT 的单页应用路由切换，减少刷新后扩展失效的问题。
- 从 popup 导出整段对话、收藏片段或当前问答为 Markdown / HTML / PDF 打印页。
- 在每段用户提问旁收藏片段，并可单独导出该段问答为 Markdown / HTML / PDF / PNG 图片。
- 提供 popup 收藏列表和页面右下角收藏夹入口，用于查看、定位和移除本地收藏片段。

## 快速开始

1. 下载或克隆本仓库。
2. 打开 Chrome 或 Edge 的扩展管理页。
3. 开启「开发者模式」。
4. 点击「加载已解压的扩展程序」。
5. 选择本项目根目录。
6. 打开或刷新 [ChatGPT](https://chatgpt.com/)。

如果修改代码后页面没有变化，请在扩展管理页点击「重新加载」，然后刷新 ChatGPT 页面。

## 使用方式

点击浏览器工具栏里的扩展图标，可以调整：

- 扩展开关
- 公式复制触发方式
- 公式复制格式
- 提问时间轴开关
- 导出整段对话、收藏片段或当前问答
- 查看本地收藏列表，并定位或移除收藏片段

在 ChatGPT 对话中，把鼠标移到公式上会看到高亮框；按当前设置单击或双击即可复制。打开较长对话时，页面右侧会出现提问时间轴，点击节点即可跳到对应问题。

每段用户提问旁会出现一组轻量操作按钮：

- `☆`：收藏或取消收藏当前问答片段。
- `MD` / `HTML` / `PDF`：导出当前问答片段。
- `PNG`：把当前问答渲染成图片并下载。

页面右下角的「收藏夹」入口会显示当前对话收藏数量。打开后可以直接查看收藏片段、跳回对应问答，或把不需要的片段移出收藏。

PDF 导出会打开打印友好的 HTML 页面，并调用浏览器打印流程；在 Chrome / Edge 中选择「另存为 PDF」即可得到 PDF 文件。

## 本地开发

项目目前没有打包流程，源码可以直接作为 MV3 扩展加载。

运行基础检查：

```bash
npm run check
```

Windows PowerShell 如果遇到执行策略限制，可以使用：

```powershell
npm.cmd run check
```

也可以单独做语法检查：

```powershell
node --check src\content\content.js
node --check src\content\math-extractor.js
node --check src\popup\popup.js
node --check src\background\service-worker.js
```

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

## 支持站点

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## 隐私说明

扩展只在 ChatGPT 页面内运行，用于读取当前页面 DOM，以实现公式复制和提问时间轴导航。

当前版本不会上传对话内容，也不会连接第三方服务。设置项通过 `chrome.storage.sync` 保存在浏览器扩展存储中。

## 当前限制

- ChatGPT 页面 DOM 可能变化，公式提取和时间轴选择器需要持续维护。
- MathML 复制依赖页面中是否保留 MathML 源。
- 时间轴目前主要基于用户提问节点，不包含助手回复、收藏节点或分支层级。
- PDF 导出依赖浏览器打印流程，扩展不会静默生成 PDF 文件。
- PNG 图片导出使用轻量 Canvas 文本渲染，适合分享问答内容，不会完整复刻 ChatGPT 原始样式。
- 尚未提供 Chrome Web Store / Edge Add-ons 发布脚本和正式图标资源。

## 后续体验提升方向

- 对话目录：按用户提问、代码块、公式、图片生成可过滤目录。
- 重点标记：给任意消息添加本地书签、颜色标签和备注。
- 快捷复制：为代码块、表格、列表、引用分别提供更稳的复制格式。
- 搜索增强：支持只在当前对话中搜索问题、回答、代码块或公式。
- 回答折叠：长回答可折叠为标题、摘要或代码块预览，减少滚动负担。
- 分支导航：识别同一问题的多次重试回答，提供横向切换入口。
- 导出工具：把当前对话导出为 Markdown、HTML、PDF 或只导出收藏片段。
- 提示词片段库：保存常用提示词，在 ChatGPT 输入框旁快速插入。
- 阅读进度：记住每个对话上次阅读位置，重新打开后自动恢复。
- 本地安全模式：把所有增强能力保持在浏览器本地运行，并在 README 中明确数据边界。

## License

MIT
