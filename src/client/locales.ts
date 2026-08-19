/** `richeditor` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'toggle.tooltip': 'Markdown 笔记本',
  'panel.placeholder': '用 Markdown 记录，支持列表、表格与 LaTeX 源码，Cmd+Enter 发送',
  'panel.submit': '发送',
  'panel.submitAria': '发送笔记本内容',
  'panel.close': '关闭笔记本',
  'panel.editorAria': 'Markdown 笔记本编辑器',
} satisfies Record<string, string>

/** The richeditor namespace key union. */
export type RichEditorKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'toggle.tooltip': 'Markdown notebook',
  'panel.placeholder': 'Write in Markdown — lists, tables and LaTeX source; Cmd+Enter sends',
  'panel.submit': 'Send',
  'panel.submitAria': 'Send notebook content',
  'panel.close': 'Close notebook',
  'panel.editorAria': 'Markdown notebook editor',
} satisfies Record<RichEditorKey, string>
