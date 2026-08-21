/**
 * Rich Markdown notebook plugin, browser half: a tool-row toggle
 * (`conversation.input.left`) plus the editor card in the composer context
 * stack (`conversation.input.dock`). Both entries share one per-session
 * store, so the draft survives close/reopen and surface remounts. The panel
 * submits through the scope-addressed conversation service — the same send
 * path the plain composer's submit rides — and keeps the regular composer
 * fully live below it. Copy rides the standard locale seat.
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left /
// input.dock entries) and the cordis Context merge (ctx.conversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { EditorPanel } from './EditorPanel.tsx'
import { RichEditorToggle } from './ToggleButton.tsx'
import { en, zh, type RichEditorKey } from './locales.ts'
import type { RichEditorComposerBridge, RichEditorInjected } from './slots.ts'
import { createRichEditorStore } from './store.ts'

export type { RichEditorComposerBridge, RichEditorInjected } from './slots.ts'
export { createRichEditorStore } from './store.ts'
export type { RichEditorKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The notebook editor's copy. */
    richeditor: RichEditorKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'richeditor'

/** Required services: the slot registry, copy, session scope resolution, and the send path. */
export const inject = ['slots', 'locale', 'sessions', 'conversation']

/**
 * Client plugin body: dictionaries plus the two composer-region entries
 * sharing one store handle.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-rich-editor: dictionaries')

  // One handle across both registrations: the engine scopes session stores
  // by session id, so the toggle and the panel always see the same draft.
  const store = createRichEditorStore()

  /** Session-scoped send: resolve the session's context, then its conversation service. */
  const submit = async (sessionId: SessionId, text: string): Promise<boolean> => {
    const actx = ctx.sessions.scope(sessionId)
    const conversation = actx?.get('conversation')
    if (actx === undefined || conversation === undefined) return false
    try {
      await conversation.send(text)
      return true
    } catch (error: unknown) {
      conversation.input.for(actx).notify('error', error instanceof Error ? error.message : String(error))
      return false
    }
  }

  // Lazy per-call resolution: the session scope may not be queryable yet at
  // inject time, and a missed resolution degrades to a no-op bridge rather
  // than a broken panel.
  const composerFor = (sessionId: SessionId): RichEditorComposerBridge => {
    const resolve = () => {
      const actx = ctx.sessions.scope(sessionId)
      const conversation = actx?.get('conversation')
      return actx === undefined || conversation === undefined ? undefined : conversation.input.for(actx)
    }
    return {
      getDraft: (): string => resolve()?.state.getSnapshot().draft ?? '',
      setDraft: (text: string): void => { resolve()?.setDraft(text) },
      subscribe: (fn: () => void): (() => void) => {
        const input = resolve()
        return input === undefined ? () => {} : input.state.subscribe(fn)
      },
    }
  }

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
    { name: 'conversation.input.left', id: 'rich-editor', store, locale: NS },
    RichEditorToggle,
  ))

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'rich-editor',
    order: 20,
    store,
    locale: NS,
    inject: (sessionId): RichEditorInjected => ({
      submit: text => submit(sessionId, text),
      composer: composerFor(sessionId),
    }),
  }, EditorPanel))
}
