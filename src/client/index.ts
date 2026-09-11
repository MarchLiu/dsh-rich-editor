/**
 * Rich Markdown notebook plugin, browser half: a tool-row toggle
 * (`conversation.input.left`) plus the editor card in the composer context
 * stack (`conversation.input.dock`). Both entries share one per-session
 * store, so the draft survives close/reopen and surface remounts. The panel
 * submits through the scope-addressed conversation service — the same send
 * path the plain composer's submit rides — and keeps the regular composer
 * fully live below it. Copy rides the standard locale seat.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the renderer-owned slot registry merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
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
    const input = conversation.input.for(actx)

    /**
     * Attachment path: when the native composer holds pending attachments
     * (images), the notebook text must ride out with them as ONE submission
     * instead of a bare text send. The conversation controller's
     * `sendSession(session, text, imageIds, mode)` is the exact primitive the
     * composer's own default sink uses; it is public at runtime but absent
     * from the narrow `IConversation` face, so feature-detect before use.
     */
    // Called with an explicit receiver: `sendSession` reads `this.draftImages`,
    // so a detached call (`const fn = conversation.sendSession; fn(...)`) makes
    // `this` undefined and crashes ("reading 'draftImages'"). The same cordis
    // proxy rule noted for `sessionOf` below applies here.
    const sendSession = (conversation as unknown as {
      sendSession?: (
        session: unknown,
        text: string,
        imageIds: readonly unknown[],
        mode: 'queue',
        signal?: AbortSignal,
      ) => Promise<{ kind: 'success' | 'error'; text?: string }>
    }).sendSession
    // Feature-detect through method-call syntax: `ctx.sessions` is a cordis
    // traceable service proxy, so detaching `sessionOf` (const fn =
    // ctx.sessions.sessionOf; fn(...)) drops its `this` and crashes inside
    // the controller (`this.scopes` of undefined). Called as a method the
    // proxy binds the shadow receiver and the call resolves normally; hosts
    // without the face (and the test fake) degrade to the plain send.
    const sessionsFace = ctx.sessions as unknown as {
      sessionOf?: (actx: unknown) => unknown
    }
    // Older hosts (and the test fake) expose only the plain send face; the
    // snapshot's imageIds default to none there.
    const imageIds = input.state.getSnapshot().imageIds ?? []
    const session = imageIds.length > 0 && typeof sessionsFace.sessionOf === 'function'
      ? sessionsFace.sessionOf(actx)
      : undefined
    if (imageIds.length > 0 && typeof sendSession === 'function' && session !== undefined) {
      try {
        const outcome = await sendSession.call(conversation, session, text, imageIds, 'queue')
        if (outcome.kind !== 'success') {
          if (outcome.text !== undefined) input.notify('error', outcome.text)
          return false
        }
      } catch (error: unknown) {
        input.notify('error', error instanceof Error ? error.message : String(error))
        return false
      }
      // Success: drop the sent ids from the composer rail (the byte payloads
      // were released by sendSession's own retirement flow). The draft text
      // clears through the panel's mirror path, exactly like a text-only send.
      for (const id of imageIds) input.removeImage(id)
      return true
    }

    try {
      await conversation.send(text)
      return true
    } catch (error: unknown) {
      input.notify('error', error instanceof Error ? error.message : String(error))
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
