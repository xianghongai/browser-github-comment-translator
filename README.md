# GitHub Comment Translator

Translate a single GitHub issue, pull request or discussion comment, not the whole page, with Google Translate or your own AI model. Works in Chrome, Edge and Firefox.

## Usage

Hover over a comment to reveal a translate button next to its `⋯` menu. The button stays visible once the comment has been translated.

- **Translate button**: translates the comment with the default engine. The translation appears below the original comment, which stays unchanged; the panel holds only the translation. Click again to hide or show it. The button tooltip names the engine that was used.
- **Arrow next to it**: pick Google Translate or any configured AI provider for this one comment. The default engine stays the same.
- **The translation is editable**. Edits are temporary and are lost when the page reloads. GitHub keyboard shortcuts are not triggered while you type. Ctrl/⌘-click opens a link in the translation.

Code blocks, inline code, links, @mentions and #references are kept as-is.

## Settings

Open the extension options (or **Settings** in the arrow menu). Changes are saved right away; there is no separate Save button for the page.

- **Target language**: pick one of about 50 major languages.
- **Default engine**: Google Translate or one of your AI providers. It is stored as `"google"` or as a reference such as `{ "vendor": "DeepSeek", "model": "deepseek-chat" }`.
- **AI providers**: the same providers as `ai-commit.providers` in [AI Commit++](https://github.com/xianghongai/vscode-ai-commit) (`openai`, `openai-compatible`, `openrouter`, `azure-openai`, `gemini`, `ollama`), with snake_case keys. Each provider is identified by its **vendor + model**, which must be unique; there is no `id`. **Test** translates "你好，世界".

```json
[
  {
    "vendor": "DeepSeek",
    "type": "openai-compatible",
    "base_url": "https://api.deepseek.com/v1",
    "api_key": "sk-…",
    "model": "deepseek-chat",
    "timeout_ms": 60000,
    "params": { "temperature": 0.3, "top_p": 1, "max_tokens": 4096 }
  }
]
```

AI providers are listed one per row with **Test**, **Edit** and **Remove** actions; **Add provider** and **Edit** open a form in a dialog. You can paste `ai-commit.providers` from VS Code under **Import / export** as-is (importing replaces all providers): camelCase keys such as `apiKey` and `baseUrl` are converted, `id` is dropped, and `vendor` is inferred from the type (`OpenAI`, `Gemini`, …) or from the `base_url` host (`api.deepseek.com` → `deepseek`). Replace `${env:NAME}` API keys with the key itself, because browsers cannot read environment variables.

When you save, the browser asks for access to each provider's host. API keys stay in this browser's local extension storage. Requests go from the extension background to the provider directly, so GitHub pages never see the keys.

Google Translate uses the free `translate.googleapis.com` endpoint that translate.google.com uses, and switches to the same endpoint on `translate.google.com` when Google blocks the first host for your IP. It is unofficial and may rate-limit heavy use.

### Ollama

Ollama rejects requests from browser extensions unless you allow their origin:

```sh
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve
```

## Development

```sh
pnpm install
pnpm dev            # Chrome
pnpm dev:firefox
pnpm test
pnpm zip:all        # .output/*.zip for Chrome, Edge and Firefox
```

---

# GitHub 评论翻译

用 Google 翻译或你自己的 AI 模型，只翻译 GitHub Issue / Pull Request / Discussion 中的某一条评论，而不是整页翻译。支持 Chrome、Edge 和 Firefox。

## 使用

鼠标经过某条评论时，标题栏 `⋯` 菜单旁边才会出现翻译按钮；翻译过的评论会一直显示按钮。

- **翻译按钮**：用默认引擎翻译这条评论。原文保持不变，译文显示在原文下方，形成双语对照；面板里只有译文。再次点击可以隐藏或显示译文。按钮的悬停提示会显示所用的引擎。
- **旁边的下拉箭头**：为这一条评论临时选用 Google 翻译或任一已配置的 AI 服务，不改变默认引擎。
- **译文可以直接编辑**。修改是临时的，刷新页面后消失。输入时不会触发 GitHub 的键盘快捷键。按住 Ctrl/⌘ 点击译文中的链接即可打开。

代码块、行内代码、链接、@ 提及和 # 引用都原样保留。

## 设置

打开扩展选项页（或下拉菜单里的「设置」）。修改会立即保存，页面上没有单独的「保存」按钮。

- **目标语言**：从约 50 种主流语言中选择。
- **默认引擎**：Google 翻译，或某个 AI 服务。保存为 `"google"`，或 `{ "vendor": "DeepSeek", "model": "deepseek-chat" }` 这样的引用。
- **AI 模型服务**：与 [AI Commit++](https://github.com/xianghongai/vscode-ai-commit) 的 `ai-commit.providers` 支持相同的服务（`openai`、`openai-compatible`、`openrouter`、`azure-openai`、`gemini`、`ollama`），键名使用 snake_case，格式见上方英文部分的示例。每个服务以「厂商（vendor）+ 模型（model）」作为唯一标识，不能重复，没有 `id` 字段。「测试」会翻译「你好，世界」。

  AI 服务以列表展示，每行可以测试、编辑、删除；「添加服务」和「编辑」在弹窗中填写。可以在「导入 / 导出」中原样粘贴 VS Code 里的 `ai-commit.providers`（导入会替换全部服务），`apiKey`、`baseUrl` 这类驼峰键名会自动转换，`id` 会被去掉，`vendor` 按类型（`OpenAI`、`Gemini`…）或 `base_url` 的域名（`api.deepseek.com` → `deepseek`）推断。`${env:NAME}` 形式的 API Key 需要换成真实的 Key，因为浏览器读不到环境变量。

保存时，浏览器会请求访问各服务所在主机的权限。API Key 只保存在本浏览器的扩展本地存储里；请求由扩展后台直接发给对应服务，GitHub 页面接触不到 Key。

Google 翻译使用 translate.google.com 网页版所用的免费接口 `translate.googleapis.com`；Google 按 IP 封锁该域名时，改用 `translate.google.com` 上的同一接口。它不是官方 API，使用过多时可能被限流。

### Ollama

Ollama 默认拒绝来自浏览器扩展的请求，需要放行扩展的 origin：

```sh
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve
```

## 开发

```sh
pnpm install
pnpm dev            # Chrome
pnpm dev:firefox
pnpm test
pnpm zip:all        # 生成 Chrome、Edge、Firefox 的 .output/*.zip
```
