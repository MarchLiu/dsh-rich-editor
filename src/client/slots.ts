/**
 * The notebook plugin's injected face. Both target slots
 * (`conversation.input.left` for the toggle, `conversation.input.dock` for
 * the panel) are declared by ui-conversation; this plugin contributes only.
 */

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
}
