/**
 * CodeMirror glue for the notebook editor. The behavior decisions live in
 * markdown.ts (pure); this module only adapts them onto an EditorView and
 * reports document changes outward.
 */
import { EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { tags } from '@lezer/highlight'
import { listEnterEdit } from './markdown.ts'

/** Options of one mounted notebook editor. */
export interface MarkdownEditorOptions {
  /** Initial document text (the session's in-progress draft). */
  readonly initial: string
  /** Placeholder shown while the document is empty. */
  readonly placeholder: string
  /** Accessible name of the editable surface. */
  readonly ariaLabel: string
  /** Document-change sink (every edit, including the plugin's own list edits). */
  readonly onChange: (text: string) => void
  /** Mod-Enter gesture: submit the current document. */
  readonly onSubmit: () => void
}

/** Live handle of one mounted notebook editor. */
export interface MarkdownEditorHandle {
  /** Replace the whole document (submit clear); onChange fires through the listener. */
  setText(text: string): void
  /**
   * Apply an externally-authored document (native-composer sync) as a
   * minimal common-prefix/suffix splice. CodeMirror maps the existing
   * selection through the change, so a caret outside the edited range
   * survives; onChange fires through the listener like any edit.
   */
  applyExternal(text: string): void
  /** Move keyboard focus into the editor. */
  focus(): void
  /** Tear the view down and remove its DOM. */
  destroy(): void
}

/**
 * A design token with the harness's light-theme value as the fallback: the
 * `--shiki-token-*` palette is the web app's own code-highlight sheet
 * (ui-theme), light on :root and overridden under the dark body attribute,
 * so the notebook follows the app theme instead of a fixed palette.
 */
const token = (name: string, fallback: string): string => `var(${name}, ${fallback})`

/**
 * Markdown highlight style over the app's tokens. Tag coverage follows
 * @lezer/markdown's styleTags: structural marks (heading/list/quote/emphasis/
 * code marks, table delimiters) share one visible punctuation color, headings
 * and table headers read bold, inline styles keep their typographic cue, and
 * links, code and labels pick up the code-block palette.
 */
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold', color: token('--shiki-token-constant', '#1c7ed6') },
  { tag: tags.processingInstruction, color: token('--shiki-token-punctuation', '#495057') },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: token('--shiki-token-link', '#1971c2'), textDecoration: 'underline' },
  { tag: tags.url, color: token('--shiki-token-link', '#1971c2') },
  { tag: tags.monospace, color: token('--shiki-token-parameter', '#e8590c') },
  { tag: tags.quote, color: token('--shiki-token-string', '#2f9e44') },
  { tag: tags.contentSeparator, color: token('--shiki-token-comment', '#868e96') },
  { tag: tags.comment, color: token('--shiki-token-comment', '#868e96'), fontStyle: 'italic' },
  { tag: tags.labelName, color: token('--shiki-token-function', '#6741d9') },
  { tag: tags.string, color: token('--shiki-token-string', '#2f9e44') },
  { tag: [tags.escape, tags.character], color: token('--shiki-token-parameter', '#e8590c') },
])

/** Enter: continue/exit Markdown lists; decline leaves the default newline. */
function continueList(view: EditorView): boolean {
  const main = view.state.selection.main
  // A non-empty selection falls through to the default replace-with-newline.
  if (!main.empty) return false
  const edit = listEnterEdit(view.state.doc.toString(), main.head)
  if (edit === null) return false
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: { anchor: edit.cursor },
    scrollIntoView: true,
  })
  return true
}

/**
 * Build the extension list (exported for the specs: key order decides Enter
 * arbitration, so the list keymap must outrank the defaults).
 * @param options - editor behavior sinks and copy.
 * @returns the CodeMirror extension array.
 */
export function buildExtensions(options: MarkdownEditorOptions): Extension[] {
  return [
    Prec.highest(keymap.of([
      { key: 'Enter', run: continueList },
      { key: 'Mod-Enter', run: () => { options.onSubmit(); return true } },
    ])),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    // markdownLanguage (not the CommonMark default base) brings the GFM
    // extensions: tables, strikethrough, task lists, autolinks. codeLanguages
    // stays empty: embedded fenced-code highlighting would drag the
    // javascript/html parsers into the browser bundle.
    markdown({ base: markdownLanguage, codeLanguages: [] }),
    syntaxHighlighting(markdownHighlightStyle),
    EditorView.lineWrapping,
    placeholder(options.placeholder),
    EditorView.contentAttributes.of({ 'aria-label': options.ariaLabel }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return
      // IME composition: CodeMirror applies every composition update as a
      // doc change, but the panel mirrors each reported edit into the native
      // composer, whose draft write steals focus back — and refocusing the
      // view mid-composition kills the IME session (pinyin fragments commit
      // as garbage). Suppress reports while composing; the compositionend
      // flush installed in createMarkdownEditor reports the final document.
      if (update.view.composing) return
      options.onChange(update.state.doc.toString())
    }),
  ]
}

/**
 * Mount one notebook editor into a host element.
 * @param host - the element the EditorView attaches to.
 * @param options - editor behavior sinks and copy.
 * @returns the live handle; destroy() on unmount.
 */
export function createMarkdownEditor(host: HTMLElement, options: MarkdownEditorOptions): MarkdownEditorHandle {
  const view = new EditorView({
    parent: host,
    state: EditorState.create({ doc: options.initial, extensions: buildExtensions(options) }),
  })
  // Composition flush: while the IME is active the update listener stays
  // silent (see buildExtensions), so report the final document once the IME
  // closes. The rAF deferral lets CodeMirror apply its closing composition
  // sync first; guarded against a destroy racing the frame.
  let destroyed = false
  const onCompositionEnd = (): void => {
    requestAnimationFrame(() => {
      if (destroyed || view.composing) return
      options.onChange(view.state.doc.toString())
    })
  }
  view.dom.addEventListener('compositionend', onCompositionEnd)
  return {
    setText(text: string): void {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    applyExternal(text: string): void {
      const prev = view.state.doc.toString()
      if (prev === text) return
      let start = 0
      const prevEnd = prev.length
      const nextEnd = text.length
      while (start < prevEnd && start < nextEnd && prev[start] === text[start]) start += 1
      let tail = 0
      while (tail < prevEnd - start && tail < nextEnd - start
        && prev[prevEnd - 1 - tail] === text[nextEnd - 1 - tail]) tail += 1
      view.dispatch({
        changes: { from: start, to: prevEnd - tail, insert: text.slice(start, nextEnd - tail) },
      })
    },
    focus(): void {
      view.focus()
    },
    destroy(): void {
      destroyed = true
      view.dom.removeEventListener('compositionend', onCompositionEnd)
      view.destroy()
    },
  }
}
