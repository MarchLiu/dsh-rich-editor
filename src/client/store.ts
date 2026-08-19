/**
 * The notebook editor's per-session viewing store: panel visibility and the
 * in-progress Markdown draft. The draft is viewing state (it survives
 * surface remounts and tab switches, like a composer draft), not business
 * data — submission hands the text to the conversation service and clears
 * it here.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Notebook panel state for one session. */
type RichEditorState = {
  /** Whether the dock editor card is expanded. */
  open: boolean
  /** The in-progress Markdown draft (kept across close/reopen within the session). */
  text: string
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type RichEditorActions = {
  setOpen: (draft: RichEditorState, open: boolean) => void
  setText: (draft: RichEditorState, text: string) => void
}

/**
 * Create the notebook store handle. The one handle is shared by the toggle
 * and the dock panel registrations, giving both the same per-session
 * instance (the engine scopes session stores by session id).
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createRichEditorStore(): EngineStoreHandle<RichEditorState, RichEditorActions> {
  return defineStore({
    init: (): RichEditorState => ({ open: false, text: '' }),
    actions: {
      setOpen: (d, open: boolean) => { d.open = open },
      setText: (d, text: string) => { d.text = text },
    },
  })
}
