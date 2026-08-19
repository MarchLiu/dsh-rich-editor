/**
 * CodeMirror glue for the notebook editor. The behavior decisions live in
 * markdown.ts (pure); this module only adapts them onto an EditorView and
 * reports document changes outward.
 */
import { EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
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
  /** Move keyboard focus into the editor. */
  focus(): void
  /** Tear the view down and remove its DOM. */
  destroy(): void
}

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
    // codeLanguages stays empty: embedded fenced-code highlighting would
    // drag the javascript/html parsers into the browser bundle.
    markdown({ codeLanguages: [] }),
    syntaxHighlighting(defaultHighlightStyle),
    EditorView.lineWrapping,
    placeholder(options.placeholder),
    EditorView.contentAttributes.of({ 'aria-label': options.ariaLabel }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange(update.state.doc.toString())
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
  return {
    setText(text: string): void {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    focus(): void {
      view.focus()
    },
    destroy(): void {
      view.destroy()
    },
  }
}
