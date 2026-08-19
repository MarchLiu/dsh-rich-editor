# Agent Note：以输入区插件形态提供富 Markdown 笔记本

Status: implemented

[English](2026-08-16-rich-editor-notebook.md) | 中文

## 问题

随产品发布的输入框是 `dsh-client-ui-conversation` 拥有的普通 textarea；其键盘命令面（`ComposerKeyboard`）按契约是包内私有，因此任何插件都够不到两件事：Codex 风格的列表编辑（Enter 续项、空项退出列表），以及更强的 Markdown 编辑面（表格、LaTeX 源码）。插件无法拦截默认输入框的 Enter，而 `conversation.composer` 链接管会替换整个输入区——丢掉工具行、模型座位和草稿机——只为换来一个编辑器。

## 决策

新包 `dsh-client-ui-rich-editor` 向 ui-conversation 已拥有的槽位贡献两个条目，不新增任何扩展点：

- `conversation.input.left`——工具行圆形开关（文档定义的“常驻小控件”座位）；
- `conversation.input.dock`——编辑卡片（文档定义的“承载成段文字内容”的座位）。

两个注册共享一个 `createRichEditorStore()` 句柄；槽位引擎按会话 id 切分 session store，因此是引擎而不是插件在给每个会话分配各自的笔记本草稿，而关闭面板（dock 条目里一个普通的 `return null`）让 textarea 输入框保持挂载并在下方完全可用。这完全绕开了链接管路径：链选择器是 owner currency（`interactions` + `session`）的纯函数，用户开关式的接管无法在不改 owner 的前提下反应式地路由进选举——而 dock 这个 list 槽什么都不需要。

提交时解析会话作用域（`ctx.sessions.scope(id)`）并调用按作用域寻址的 `conversation.send(text)`——与普通输入框提交走的同一个动词——因此裁决、排队与 prompt 错误报告完全一致。发送被拒绝时浮现在该会话的输入机通知通道（`conversation.input.for(actx).notify`），面板保留草稿。

编辑器是运行 `@codemirror/lang-markdown` 的 CodeMirror 6（用受维护依赖替代手搓的 undo/选区/粘贴）：感知 GFM 表格的高亮、原生历史，以及一个 `Prec.highest` 的 Enter 键映射，其行为放在纯函数 `listEnterEdit(text, cursor)`（markdown.ts）里：非空列表项 → 插入 `\n` + 缩进 + 标记（有序递增、复选重置为未勾选、行中光标拆分该项）；空列表项 → 抹掉标记行、回到普通文本；非列表行 → 拒绝并放行默认行为。`Mod-Enter` 提交。

## 否决的替代方案

**`conversation.composer` 链接管条目。** 否决：链 currency 只携带 pending interactions 和会话快照，用户开关没有进入选举的反应式路由；且被选举的接管会隐藏整个输入栏——工具行、模型座位、附件——迫使插件重做输入框 chrome。

**给 `ComposerKeyboard` 开公开仲裁链（“方案 B”缝）。** 暂缓：它只对必须留在原生 textarea 里的插件才是对的缝；笔记本整体替换编辑面，而 dock 槽已经表达了这一点，不需要新的框架扩展点。

**手搓 textarea + keydown 处理。** 否决：CodeMirror 删掉了需要自有的面（历史、选区、粘贴、IME、可访问性），且其 jsdom 行为可证明——组件测试用真实 keydown 事件驱动它。

## 影响

开关与面板以又一个输入区插件的形态落地（三处注册面：`tsconfig.client.json`、web-app bundle 的 `cordis.patch.yml` 行与 `package.json` 依赖）。textarea 输入框的一切既有行为——`/` 与 `@` 触发、claim、附件——原封不动。笔记本的已知缺口记录在其 README 中：暂无触发集成、无附件接入、草稿仅会话生命周期、有序列表重编号延后。

## 测试

`packages/client/ui-rich-editor/tests/`：纯列表逻辑（续项、有序递增与分隔符风格、复选重置、行中拆分、空项退出、非列表拒绝、文档中部行界）；store；编辑器胶水（挂载/销毁、输入变化、真实 keydown 事件驱动的 Enter 续项与退出、普通行换行、非空选区拒绝、Mod-Enter 提交）；两个组件跑真实 store 实例；以及一个 REAL-cordis 组合 bench（browser-plugin spec）覆盖注册形态、共享 store 句柄同一性、三种提交结局、fiber 卸载 HMR 安全。逐文件覆盖率 100%（仅一处有据可查的防御性 `v8 ignore`，位于必然挂载的 host ref 上）。`test:gui` 保持绿色（279 个文件、3798 个测试）。
