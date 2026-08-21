/**
 * The notebook plugin's injected face. Both target slots
 * (`conversation.input.left` for the toggle, `conversation.input.dock` for
 * the panel) are declared by ui-conversation; this plugin contributes only.
 */

/**
 * The native composer bridge: the narrow face the panel needs over the
 * session's input facade (`conversation.input.for(actx)` → SessionInput).
 * Kept structural so tests mount a plain fake; every write is the facade's
 * single public draft path, so occurrence math and undo history stay whole.
 */
export interface RichEditorComposerBridge {
  /** Read the native composer's live draft. */
  getDraft(): string
  /** Replace the native composer's draft (the facade's single write path). */
  setDraft(text: string): void
  /**
   * Subscribe to native draft mutations (the facade's InputState store
   * fires on every machine dispatch).
   * @param fn - change listener (no payload; read via getDraft).
   * @returns the unsubscribe handle.
   */
  subscribe(fn: () => void): () => void
}

/** Business verbs handed to the dock panel through its own inject. */
export interface RichEditorInjected {
  /**
   * Send the editor's Markdown as one prompt into the entry's session
   * (queued while a turn runs). Resolves false with the failure already
   * surfaced on the session's composer notice channel, so the panel keeps
   * the draft and stays open.
   * @param text - the serialized Markdown document.
   * @returns true when the prompt was accepted into the session queue.
   */
  readonly submit: (text: string) => Promise<boolean>
  /** The native composer bridge used for open/close handoff and live sync. */
  readonly composer: RichEditorComposerBridge
}
