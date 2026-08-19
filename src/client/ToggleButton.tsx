/**
 * The notebook toggle: a small control in the composer tool row
 * (`conversation.input.left`). It only flips the shared per-session store's
 * `open` flag; the dock panel owns the editor itself.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { IconListPenOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import clsx from 'clsx'
import type { createRichEditorStore } from './store.ts'
import css from './ToggleButton.module.css'

/** Full toggle props: tool-row runtime share & shared store seat & locale seat. */
export type RichEditorToggleProps =
  PropsRuntime<'conversation.input.left'>
  & PropsStore<ReturnType<typeof createRichEditorStore>>
  & PropsLocale<'richeditor'>

/** Tool-row toggle button: pressed state mirrors the store, clicks flip it. */
export function RichEditorToggle({ useStore, actions, t }: RichEditorToggleProps) {
  const open = useStore(s => s.open)
  return (
    <Tooltip label={t('toggle.tooltip')} side="top" delayMs={500}>
      <button
        type="button"
        className={clsx(css.toggle, open && css.active)}
        aria-label={t('toggle.tooltip')}
        aria-pressed={open}
        onClick={() => { actions.setOpen(!open) }}
      >
        <IconListPenOutline16 size={16} />
      </button>
    </Tooltip>
  )
}
