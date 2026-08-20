// @vitest-environment jsdom
/** Toggle behavior: pressed state mirrors the store, clicks flip it. The
 * framework runtime share is cast away — the toggle reads none of it. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from './make-translate.ts'
import { RichEditorToggle, type RichEditorToggleProps } from '../src/client/ToggleButton.tsx'
import { createRichEditorStore } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh) as RichEditorToggleProps['t']

afterEach(cleanup)

function mount() {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createRichEditorStore().create()
  const props = {
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t,
  } as RichEditorToggleProps
  render(<RichEditorToggle {...props} />)
  return store
}

describe('RichEditorToggle', () => {
  it('renders the tool-row button with its tooltip copy, unpressed while closed', () => {
    mount()
    const button = screen.getByRole('button', { name: 'Markdown 笔记本' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('click opens the panel store and the button reads pressed', () => {
    const store = mount()
    const button = screen.getByRole('button', { name: 'Markdown 笔记本' })
    fireEvent.click(button)
    expect(store.getSnapshot().open).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(store.getSnapshot().open).toBe(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })
})
