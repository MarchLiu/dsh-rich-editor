/**
 * The notebook editor card: the `conversation.input.dock` entry. Closed it
 * renders nothing (an absent dock row costs no layout); open it mounts one
 * CodeMirror editor whose document lives in the shared per-session store,
 * so closing and reopening keeps the draft. Submission goes through the
 * injected conversation send verb; the plain composer stays live below.
 */
import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.dock entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import clsx from 'clsx'
import { createMarkdownEditor, type MarkdownEditorHandle } from './editor.ts'
import type { RichEditorInjected } from './slots.ts'
import type { createRichEditorStore } from './store.ts'
import css from './EditorPanel.module.css'

/** Full panel props: dock runtime share & shared store seat & injected verbs & locale seat. */
export type EditorPanelProps =
  PropsRuntime<'conversation.input.dock'>
  & PropsStore<ReturnType<typeof createRichEditorStore>>
  & RichEditorInjected
  & PropsLocale<'richeditor'>

/** Dock adapter: closed renders nothing; open mounts the editor card. */
export function EditorPanel({ useStore, actions, submit, t }: EditorPanelProps) {
  const open = useStore(s => s.open)
  if (!open) return null
  return <EditorCard useStore={useStore} actions={actions} submit={submit} t={t} />
}

type EditorCardProps = Omit<EditorPanelProps, keyof PropsRuntime<'conversation.input.dock'>>

/** The mounted editor card: one CodeMirror instance per open, draft in the store. */
function EditorCard({ useStore, actions, submit, t }: EditorCardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  // The live draft mirror for event handlers (the store write rides the
  // editor's change listener; handlers must not wait a render round).
  const textRef = useRef(useStore(s => s.text))
  const [submitting, setSubmitting] = useState(false)

  const doSubmit = async (): Promise<void> => {
    const text = textRef.current
    if (text.trim() === '') return
    setSubmitting(true)
    const ok = await submit(text)
    setSubmitting(false)
    if (!ok) return
    textRef.current = ''
    editorRef.current?.setText('')
    actions.setText('')
    actions.setOpen(false)
  }
  // The editor's Mod-Enter keymap is bound once at mount; route it to the
  // latest submit closure through a ref.
  const submitRef = useRef(doSubmit)
  submitRef.current = doSubmit

  useEffect(() => {
    const host = hostRef.current
    /* v8 ignore next -- defensive: the editor host div renders unconditionally, so the mount effect always finds it. */
    if (host === null) return
    const editor = createMarkdownEditor(host, {
      initial: textRef.current,
      placeholder: t('panel.placeholder'),
      ariaLabel: t('panel.editorAria'),
      onChange: (text) => {
        textRef.current = text
        actions.setText(text)
      },
      onSubmit: () => { void submitRef.current() },
    })
    editorRef.current = editor
    editor.focus()
    return () => {
      editor.destroy()
      editorRef.current = null
    }
    // Mount-once per open: the store holds the draft across re-renders, the
    // editor writes it; copy is fixed for the session's locale at mount.
  }, [])

  return (
    <div className={css.dock}>
      <div className={css.card}>
        <div ref={hostRef} className={css.editorHost} />
        <div className={css.footer}>
          <button
            type="button"
            className={clsx(css.button, css.secondary)}
            disabled={submitting}
            onClick={() => { actions.setOpen(false) }}
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
