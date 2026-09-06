/** Shared mounting helpers for the per-platform editor specs. Each platform
 *  spec stubs `navigator.platform` BEFORE its first @codemirror/view import
 *  — CodeMirror reads the platform once at module load, and the external
 *  module registry is fresh per test file, which is why the matrix lives in
 *  one file per platform. */
import { vi } from 'vitest'
import type { EditorView } from '@codemirror/view'

// jsdom lacks Range.getClientRects; once a test waits long enough for
// CodeMirror's measure rAF to fire (the composition cleanup window does),
// measurement would crash. Empty rects are fine for jsdom's layout-less DOM.
if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = function () {
    return { length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] } as unknown as DOMRectList
  }
  Range.prototype.getBoundingClientRect = function () {
    return new DOMRect(0, 0, 0, 0)
  }
}
import type { MarkdownEditorHandle, MarkdownEditorOptions } from '../src/client/editor.ts'

export interface Mounted {
  host: HTMLElement
  content: HTMLElement
  view: EditorView
  editor: MarkdownEditorHandle
  options: MarkdownEditorOptions
}

export function makeOptions(over: Partial<MarkdownEditorOptions> = {}): MarkdownEditorOptions {
  return {
    initial: '',
    placeholder: '写点什么',
    ariaLabel: '笔记本编辑器',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    ...over,
  }
}

/** Mount one editor from the CURRENTLY loaded module registry. Call only
 *  after the platform spec's dynamic imports have run. */
export async function mountEditor(
  editorModule: typeof import('../src/client/editor.ts'),
  EditorViewClass: (typeof import('@codemirror/view'))['EditorView'],
  initial: string,
  over: Partial<MarkdownEditorOptions> = {},
): Promise<Mounted> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const options = makeOptions({ initial, ...over })
  const editor = editorModule.createMarkdownEditor(host, options)
  const dom = host.querySelector('.cm-editor')
  if (!(dom instanceof HTMLElement)) throw new Error('editor dom not found')
  const view = EditorViewClass.findFromDOM(dom)
  if (view === null) throw new Error('editor view not found')
  const content = host.querySelector<HTMLElement>('.cm-content')
  if (content === null) throw new Error('no content surface')
  view.dispatch({ selection: { anchor: view.state.doc.length } })
  return { host, content, view, editor, options }
}

export function pressEnter(
  content: HTMLElement,
  mods: { metaKey?: boolean; ctrlKey?: boolean; keyCode?: number; isComposing?: boolean } = {},
): void {
  content.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter',
    metaKey: mods.metaKey ?? false,
    ctrlKey: mods.ctrlKey ?? false,
    keyCode: mods.keyCode ?? 13,
    isComposing: mods.isComposing ?? false,
    bubbles: true,
    cancelable: true,
  }))
}

/** Open an IME composition and move CM's input state into the composing
 *  phase, mirroring what the browser DOM-sync path does for real IMEs. */
export async function startComposition(
  editorModule: typeof import('../src/client/editor.ts'),
  EditorViewClass: (typeof import('@codemirror/view'))['EditorView'],
  initial: string,
): Promise<Mounted> {
  const mounted = await mountEditor(editorModule, EditorViewClass, initial)
  mounted.content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
  ;(mounted.view as unknown as { inputState: { composing: number } }).inputState.composing = 1
  return mounted
}

/** Flush the composition-end report (the editor defers it one frame). */
export async function nextFrame(): Promise<void> {
  await new Promise(resolve => requestAnimationFrame(resolve))
}
