/** Rich editor store: visibility and draft mutations through the declared actions. */
import { describe, expect, it } from 'vitest'
import { createRichEditorStore } from '../src/client/store.ts'

describe('createRichEditorStore', () => {
  it('starts closed with an empty draft', () => {
    const store = createRichEditorStore().create()
    expect(store.getSnapshot()).toEqual({ open: false, text: '' })
  })

  it('setOpen flips visibility, setText carries the draft across close/reopen', () => {
    const store = createRichEditorStore().create()
    store.actions.setText('- 草稿')
    store.actions.setOpen(true)
    expect(store.getSnapshot()).toEqual({ open: true, text: '- 草稿' })
    store.actions.setOpen(false)
    expect(store.getSnapshot()).toEqual({ open: false, text: '- 草稿' })
  })
})
