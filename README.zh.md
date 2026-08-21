# @mars.liu/dsh-rich-editor

[English](README.md) | 中文

![打开 Markdown 笔记本后的输入区](docs/img/notebook-panel.png)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的第三方 Web 插件：输入区的富 Markdown 笔记本。浏览器半边向 `dsh-client-ui-conversation` 拥有的输入区贡献两个条目：工具行开关（`conversation.input.left`）与输入区上下文栈中的编辑卡片（`conversation.input.dock`）。两个条目共享同一个按会话作用域的 store 句柄，因此进行中的草稿在关闭/重开面板、表面重挂载后仍然保留；引擎按会话 id 切分 session store，每个会话各有自己的笔记本。

编辑器是运行 Markdown 语言扩展的 CodeMirror 6 实例：草稿语法高亮（含 GFM 表格）、原生 undo/redo 与选区，以及 Codex 风格的 Enter 列表编辑——在非空列表项上按 Enter 打开下一项（有序标记 `1.` → `2.` 递增，复选项重新变为未勾选，缩进保留，光标在行中时拆分该项），在空列表项上按 Enter 删除标记、回到普通文本编辑。非列表行的 Enter 落回普通换行。`Mod+Enter` 提交。

![Enter 列表编辑：打开下一项、复选框重置、空项去标记](docs/img/enter-list-editing.png)

提交走按作用域寻址的 `conversation` 服务的 `send` 动词——与普通输入框的提交同一条路径——因此裁决、排队与 prompt 错误报告的行为与手打 prompt 完全一致。发送失败时会话的 composer 通知通道会浮现错误，草稿保留在面板中。

![组件关系：两个输入区插槽、一个会话 store、一个 send 动词](docs/img/architecture.png)

## 安装

```sh
dsh plugin --profile web add @mars.liu/dsh-rich-editor
```

包自带 bundle patch（`cordis.patch.yml` 添加 `ui-rich-editor` 行）；手动编排 profile 时把本 bundle 列进 `dsh.profile.bundles`。从源码构建：

```sh
pnpm install && pnpm run build && pnpm test
```

要求 dsh 家族 `>=0.0.1-rc.1`（已发布到 npm），以及挂载了 `dsh-client-ui-conversation` 的 dsh web 组合。

### 开发说明

npm 上的 `0.0.1-rc.1` dsh 快照只发布了浏览器 loader bundle——node 半边几乎无导出，且若干改名前的依赖名（`dsh-compact`、`dsh-user-interaction`、`dsh-type-meta`、`dsh-client-ui-slash`）从未发布。本仓库用两个手段绕开：

- `package.json > overrides` 把缺失名指向 `vendor/stubs/` 下的空 stub（本插件的任何代码路径都不 import 它们）；
- `vitest.config.ts` 把 `@deepseek-ai/dsh-client-runtime/client` 与 `.../dsh-client-locale/client` 别名到本地 harness checkout 的 TypeScript 源码（`DSH_CHECKOUT` 环境变量，默认 `../deepseek-harness`），并 inline 全部 `@deepseek-ai/dsh-client-*` 包——与 dsh 树内测试获取 client API 的方式一致。

待 dsh 家族重新发布完整可安装的闭包后，移除这两个绕行。

## 已知限制与暂缓事项

- **有序列表重编号暂缓** — 续写有序列表会递增新项标记，但编辑或删除前项不会自动重编后续项。
- **暂未接入 `/` 与 `@` 触发** — 笔记本不参与斜杠命令与文件提及管线；这些手势属于其下方的普通输入框。
- **草稿仅会话生命周期** — store 让草稿跨重挂载与标签切换保留，但整页刷新会丢弃（无持久化键）。
- **无附件入口** — 笔记本未接入会话的图片附件路径，粘贴/拖入图片不生效。
- **浏览器 bundle 内联了约 268 kB gzip 的 CodeMirror** — 即便关闭嵌入代码高亮（`codeLanguages: []`），`@codemirror/lang-markdown` 仍静态依赖 `@codemirror/lang-html`（连带 JavaScript 与 CSS 解析器），客户端打包器会把整条链内联进来；后续瘦身方向是把编辑器挂载拆到动态导入之后。

## 许可

MIT
