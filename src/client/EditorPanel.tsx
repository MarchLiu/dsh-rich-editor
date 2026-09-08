/**
 * The notebook editor card: the `conversation.input.dock` entry. Closed it
 * renders nothing (an absent dock row costs no layout); open it mounts one
 * CodeMirror editor whose document lives in the shared per-session store,
 * so closing and reopening keeps the draft. The native composer and the
 * notebook stay live-mirrored while the panel is open: opening adopts the
 * native draft (or pushes the kept notebook draft down when the composer is
 * empty), every edit on either surface flows to the other through the
 * composer bridge, and closing leaves the final text in the native editor.
 * Submission goes through the injected conversation send verb and clears
 * both surfaces; the plain composer stays live below.
 */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import clsx from 'clsx'
import { createMarkdownEditor, type MarkdownEditorHandle } from './editor.ts'
import { renderMarkdown } from './preview.ts'
import type { RichEditorComposerBridge, RichEditorInjected } from './slots.ts'
import type { createRichEditorStore } from './store.ts'
import css from './EditorPanel.module.css'

/** Full panel props: dock runtime share & shared store seat & injected verbs & locale seat. */
export type EditorPanelProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsStore<ReturnType<typeof createRichEditorStore>>
  & RichEditorInjected
  & PropsLocale<'richeditor'>

/** Dock adapter: closed renders nothing; open mounts the editor card. */
export function EditorPanel({ useStore, actions, submit, composer, t }: EditorPanelProps) {
  const open = useStore(s => s.open)
  if (!open) return null
  return <EditorCard useStore={useStore} actions={actions} submit={submit} composer={composer} t={t} />
}

type EditorCardProps = Omit<EditorPanelProps, keyof PropsRuntime<'conversation.input.dock'>>

/**
 * Push the notebook's text into the native composer unless both surfaces
 * already agree (the equality guard breaks the sync echo loop).
 *
 * Focus guard: the native composer's draft write is a Lexical update that
 * ends in `selectEnd()`, which moves the DOM selection into the composer's
 * contenteditable. The selection lands asynchronously, so every mirrored
 * keystroke — Enter and IME commits included — steals keyboard focus from
 * the notebook right after the edit, and the next Enter then submits from
 * the plain composer. When the keystroke started inside the notebook, focus
 * is restored to the CodeMirror view immediately and again on the next
 * animation frame (after Lexical's selectionchange has landed).
 */
function pushToComposer(composer: RichEditorComposerBridge, text: string): void {
  if (composer.getDraft() === text) return
  composer.setDraft(text)
}

/** The mounted editor card: one CodeMirror instance per open, draft in the store. */
function EditorCard({ useStore, actions, submit, composer, t }: EditorCardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  // The live draft mirror for event handlers (the store write rides the
  // editor's change listener; handlers must not wait a render round).
  const textRef = useRef(useStore(s => s.text))
  const [submitting, setSubmitting] = useState(false)
  // Surface switch: the CodeMirror editor keeps mounting (state preserved)
  // while hidden, so toggling to preview and back never drops draft or caret.
  // `split` keeps both surfaces visible side by side, preview mirroring the
  // draft as it is typed.
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('edit')
  // Store-seat mirror of the draft: both editing paths write actions.setText,
  // so a store subscription re-renders the preview even when the keystrokes
  // land in the hidden editor or the native composer.
  const draft = useStore(s => s.text)

  const doSubmit = async (): Promise<void> => {
    const text = textRef.current
    if (text.trim() === '') return
    setSubmitting(true)
    const ok = await submit(text)
    setSubmitting(false)
    if (!ok) return
    textRef.current = ''
    // Clearing the editor document fires onChange, which mirrors the empty
    // draft into the native composer on the same path as every other edit.
    editorRef.current?.setText('')
    actions.setText('')
    actions.setOpen(false)
  }
  // The editor's Mod-Enter keymap is bound once at mount; route it to the
  // latest submit closure through a ref.
  const submitRef = useRef(doSubmit)
  submitRef.current = doSubmit

  /**
   * Put keyboard focus back into the notebook editor when it has been
   * pulled away by the composer's mirrored-draft write (see pushToComposer).
   * Checked synchronously and once more on the next animation frame, because
   * Lexical's selection steal lands via a later selectionchange event.
   */
  const restoreFocus = (): void => {
    const steal = (): void => {
      const host = hostRef.current
      if (host !== null && !host.contains(document.activeElement)) editorRef.current?.focus()
    }
    steal()
    // Two chained frames: Lexical's selection steal can land one frame after
    // the dispatch that queued it, so a single rAF is not always enough.
    window.requestAnimationFrame(() => {
      steal()
      window.requestAnimationFrame(steal)
    })
  }

  /**
   * Move keyboard focus into the native composer's contenteditable (the
   * main edit area). Both surfaces live under the same composer seat, so
   * the query scopes from the panel host and never crosses sessions.
   * Takes the host explicitly: on unmount React nulls the ref before the
   * cleanup runs, so the effect passes its captured element instead.
   */
  const focusNativeComposer = (input: HTMLElement | null): void => {
    if (input !== null && input.isConnected) input.focus({ preventScroll: true })
  }

  /** Mirror one notebook edit into the native composer, keeping notebook focus. */
  const mirror = (text: string): void => {
    const host = hostRef.current
    const hadFocus = host !== null && host.contains(document.activeElement)
    pushToComposer(composer, text)
    if (hadFocus) restoreFocus()
  }

  /** Close the panel, leaving the final notebook text in the native editor. */
  const close = (): void => {
    pushToComposer(composer, textRef.current)
    actions.setOpen(false)
  }

  useEffect(() => {
    const host = hostRef.current
    /* v8 ignore next -- defensive: the editor host div renders unconditionally, so the mount effect always finds it. */
    if (host === null) return
    // Open handshake: a non-empty native draft wins (opening the notebook
    // adopts what the composer already holds); an empty composer instead
    // receives the notebook's kept draft, so both surfaces start equal.
    const native = composer.getDraft()
    if (native !== '') {
      textRef.current = native
      actions.setText(native)
    } else {
      pushToComposer(composer, textRef.current)
    }
    const editor = createMarkdownEditor(host, {
      initial: textRef.current,
      placeholder: t('panel.placeholder'),
      ariaLabel: t('panel.editorAria'),
      onChange: (text) => {
        textRef.current = text
        actions.setText(text)
        mirror(text)
      },
      onSubmit: () => { void submitRef.current() },
    })
    editorRef.current = editor
    // Native → notebook: the composer's InputState store fires on every
    // machine dispatch; the equality guard absorbs our own echoes, and the
    // minimal-splice apply keeps the notebook caret when it sits outside
    // the externally edited range.
    const unsubscribe = composer.subscribe(() => {
      const draft = composer.getDraft()
      if (draft === textRef.current) return
      textRef.current = draft
      actions.setText(draft)
      editorRef.current?.applyExternal(draft)
    })
    editor.focus()
    // The handshake above may have written the draft into the composer;
    // its async selection steal would land after this focus(), so guard it.
    restoreFocus()
    // Capture the native composer's contenteditable at mount: both surfaces
    // sit under the same composer seat, so the scoped query cannot cross
    // sessions, and the element reference survives the panel's own unmount
    // (when the host DOM is already gone).
    const composerInputEl =
      host.closest('[data-composer-seat]')?.querySelector('[data-composer-input]')
    const composerInput = composerInputEl instanceof HTMLElement ? composerInputEl : null
    return () => {
      unsubscribe()
      editor.destroy()
      editorRef.current = null
      // Close handoff (toggle button, close button, submit): the notebook is
      // gone, so keyboard focus returns to the native composer below. The
      // immediate call loses to the same-commit removal of the focused
      // CodeMirror content (the browser resets activeElement to body), so
      // retry on the next frame, after the panel's DOM has been dropped.
      const handoff = (): void => { focusNativeComposer(composerInput) }
      handoff()
      window.requestAnimationFrame(handoff)
    }
    // Mount-once per open: the store holds the draft across re-renders, the
    // editor writes it; copy is fixed for the session's locale at mount.
  }, [])

  return (
    <div className={css.dock}>
      <div className={css.card}>
        <div className={css.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'edit'}
            className={clsx(css.tab, mode === 'edit' && css.tabActive)}
            onClick={() => { setMode('edit') }}
          >
            {t('panel.edit')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preview'}
            className={clsx(css.tab, mode === 'preview' && css.tabActive)}
            onClick={() => { setMode('preview') }}
          >
            {t('panel.preview')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'split'}
            className={clsx(css.tab, mode === 'split' && css.tabActive)}
            onClick={() => { setMode('split') }}
          >
            {t('panel.split')}
          </button>
        </div>
        {/* Hidden, not unmounted: CodeMirror state (undo history, caret)
            survives a preview round-trip; in split mode it stays visible as
            the left column. */}
        <div className={mode === 'split' ? css.splitRow : undefined}>
          <div
            ref={hostRef}
            className={clsx(css.editorHost, mode === 'split' && css.editorSplit)}
            hidden={mode === 'preview'}
          />
          {mode !== 'edit' && (
            <div
              className={clsx(css.previewHost, mode === 'split' && css.previewSplit)}
              aria-label={t('panel.previewAria')}
              /* Content passed through DOMPurify in renderMarkdown; no raw
                 draft HTML ever reaches the DOM unsanitized. */
              dangerouslySetInnerHTML={{ __html: renderMarkdown(draft) }}
            />
          )}
        </div>
        <div className={css.footer}>
          <button
            type="button"
            className={clsx(css.button, css.secondary)}
            disabled={submitting}
            onClick={close}
            aria-label={t('panel.close')}
          >
            {t('panel.close')}
          </button>
          <button
            type="button"
            className={clsx(css.button, css.primary)}
            disabled={submitting}
            onClick={() => { void doSubmit() }}
            aria-label={t('panel.submitAria')}
          >
            {t('panel.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
