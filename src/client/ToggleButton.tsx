/**
 * The notebook toggle: a small control in the composer tool row
 * (`conversation.input.left`). It only flips the shared per-session store's
 * `open` flag; the dock panel owns the editor itself.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { IconListPenOutlineMedium, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
import type { createRichEditorStore } from './store.ts'
import { toggleShortcutLabel, useToggleShortcut } from './shortcut.ts'
import css from './ToggleButton.module.css'

/** Full toggle props: tool-row runtime share & shared store seat & locale seat. */
export type RichEditorToggleProps =
  PropsRuntime<'conversation.input.left'>
  & PropsStore<ReturnType<typeof createRichEditorStore>>
  & PropsLocale<'richeditor'>

/** Tool-row toggle button: pressed state mirrors the store, clicks flip it. */
export function RichEditorToggle({ useStore, actions, t }: RichEditorToggleProps) {
  const open = useStore(s => s.open)
  // The always-mounted seat for the global Cmd/Ctrl+E toggle; the dock panel
  // mounts and unmounts with `open`, so it cannot host a global listener.
  // The flip is a store action, so no captured state can go stale between
  // the keystroke and the write.
  useToggleShortcut(actions.toggleOpen)
  const tooltip = `${t('toggle.tooltip')} (${toggleShortcutLabel()})`
  return (
    <Tooltip label={tooltip} side="top" delayMs={500}>
      <button
        type="button"
        className={clsx(css.toggle, open && css.active)}
        aria-label={tooltip}
        aria-pressed={open}
        aria-keyshortcuts={toggleShortcutLabel()}
        onClick={() => { actions.setOpen(!open) }}
      >
        <IconListPenOutlineMedium size={16} />
      </button>
    </Tooltip>
  )
}
