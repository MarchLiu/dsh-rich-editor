/**
 * The global Cmd/Ctrl+Shift+E toggle shortcut. Hosted by the tool-row toggle
 * (the one registration that stays mounted for the whole session), registered
 * on `document` in the capture phase so it wins over both the CodeMirror
 * keymap and the browser before any focused surface can react. The Shift
 * requirement keeps plain Cmd+E free for in-editor emacs-style bindings
 * (M-E moves to line end), while Shift+E carries the editor mnemonic.
 *
 * `e.code === 'KeyE'` keys the match to the physical key, so the shortcut
 * survives non-QWERTY layouts and IME composition states; the plain
 * `metaKey | ctrlKey`+shift chord with no alt keeps it a single reversible
 * toggle (⌘⇧E opens the notebook, ⌘⇧E again hands focus back to the
 * composer).
 */
import { useEffect } from 'react'

/** True when the current chord is the toggle shortcut. */
function isToggleChord(event: KeyboardEvent): boolean {
  return event.code === 'KeyE'
    && (event.metaKey || event.ctrlKey)
    && event.shiftKey
    && !event.altKey
}

/**
 * Bind the global shortcut for the lifetime of the host component.
 * @param toggle - flip callback; reads/writes the store through the caller.
 */
export function useToggleShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isToggleChord(event)) return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [toggle])
}

/** Platform-correct shortcut label for tooltips (`⌘⇧E` on Apple, `Ctrl+Shift+E` elsewhere). */
export function toggleShortcutLabel(): string {
  return /mac|iphone|ipad/i.test(navigator.userAgent) ? '⌘⇧E' : 'Ctrl+Shift+E'
}
