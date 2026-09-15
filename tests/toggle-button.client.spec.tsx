// @vitest-environment jsdom
/** Toggle behavior: pressed state mirrors the store, clicks flip it. The
 * framework runtime share is cast away — the toggle reads none of it. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
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
    const button = screen.getByRole('button', { name: 'Markdown 笔记本 (Ctrl+E)' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('click opens the panel store and the button reads pressed', () => {
    const store = mount()
    const button = screen.getByRole('button', { name: 'Markdown 笔记本 (Ctrl+E)' })
    fireEvent.click(button)
    expect(store.getSnapshot().open).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(store.getSnapshot().open).toBe(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('the global Cmd/Ctrl+E chord toggles the store (capture on document)', () => {
    const store = mount()
    const chord = (init: KeyboardEventInit): void => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', ...init }))
    }
    chord({ code: 'KeyE', metaKey: true, cancelable: true })
    expect(store.getSnapshot().open).toBe(true)
    chord({ code: 'KeyE', ctrlKey: true, cancelable: true })
    expect(store.getSnapshot().open).toBe(false)
    // Shift/Alt variants and non-E chords are left alone.
    chord({ code: 'KeyE', metaKey: true, shiftKey: true, cancelable: true })
    chord({ code: 'KeyE', altKey: true, metaKey: true, cancelable: true })
    chord({ code: 'KeyF', ctrlKey: true, cancelable: true })
    expect(store.getSnapshot().open).toBe(false)
  })
})
