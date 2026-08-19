// @vitest-environment jsdom
/**
 * ui-rich-editor browser half on a real cordis Context with fake sessions /
 * conversation faces: the plugin registers the tool-row toggle and the dock
 * editor as list entries sharing one store handle, and the injected submit
 * verb sends through the scope-addressed conversation service — resolving
 * false (with the failure surfaced on the session's notice channel) when the
 * scope or service is gone or the send rejects. Registration disposal rides
 * the plugin fiber (HMR safety).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { IConversation } from '@deepseek-ai/dsh-client-ui-conversation/src/client/service.ts'
import type { RichEditorInjected } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(cleanup)

const sid = (k: string): SessionId => k as SessionId

interface Bench {
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  send: ReturnType<typeof vi.fn>
  notify: ReturnType<typeof vi.fn>
  entries: (name: 'conversation.input.left' | 'conversation.input.dock') => readonly { options: Record<string, unknown>; locale?: string }[]
  injectFace: (sessionId: SessionId) => RichEditorInjected | undefined
}

/** Boot the plugin over fake faces; the conversation face records sends and notices. */
async function bench(options: { scopeGone?: boolean; rejectsWith?: unknown } = {}): Promise<Bench> {
  const ctx = new Context()
  const send = vi.fn(() => options.rejectsWith !== undefined
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the scenario under test.
    ? Promise.reject(options.rejectsWith)
    : Promise.resolve())
  const notify = vi.fn()
  const conversation = {
    send,
    input: { for: () => ({ notify }) },
  } as unknown as IConversation
  ctx.provide('conversation', conversation)
  ctx.provide('sessions', {
    scope: () => options.scopeGone === true ? undefined : ctx,
  } as never)
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.input.left': { kind: 'list', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
    },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return {
    ctx,
    fiber,
    send,
    notify,
    entries: name => ctx.slots.entries(name) as never,
    injectFace: (sessionId) => {
      const entry = ctx.slots.entries('conversation.input.dock')[0]
      return (entry?.inject as unknown as ((id: SessionId) => RichEditorInjected) | undefined)?.(sessionId)
    },
  }
}

describe('ui-rich-editor browser plugin', () => {
  it('registers the toggle and dock entries sharing one store handle', async () => {
    const b = await bench()
    await b.fiber.await()
    const toggle = b.entries('conversation.input.left')[0]
    const dock = b.entries('conversation.input.dock')[0]
    expect(toggle?.options).toMatchObject({ id: 'rich-editor' })
    expect(toggle?.locale).toBe('richeditor')
    expect(dock?.options).toMatchObject({ id: 'rich-editor', order: 20 })
    expect(dock?.locale).toBe('richeditor')
    // One handle across both registrations: the engine scopes it per session.
    expect(toggle?.options.store).toBe(dock?.options.store)
  })

  it('submit sends the markdown through the session conversation service', async () => {
    const b = await bench()
    await b.fiber.await()
    await expect(b.injectFace(sid('s1'))?.submit('# 笔记')).resolves.toBe(true)
    expect(b.send).toHaveBeenCalledWith('# 笔记')
  })

  it('a rejected send surfaces a notice and resolves false', async () => {
    const b = await bench({ rejectsWith: new Error('turn refused') })
    await b.fiber.await()
    await expect(b.injectFace(sid('s1'))?.submit('x')).resolves.toBe(false)
    expect(b.notify).toHaveBeenCalledWith('error', 'turn refused')
  })

  it('a rejection without an Error shape still surfaces readable text', async () => {
    const b = await bench({ rejectsWith: '字符串失败' })
    await b.fiber.await()
    await expect(b.injectFace(sid('s1'))?.submit('x')).resolves.toBe(false)
    expect(b.notify).toHaveBeenCalledWith('error', '字符串失败')
  })

  it('a gone session scope resolves false without touching the wire', async () => {
    const b = await bench({ scopeGone: true })
    await b.fiber.await()
    await expect(b.injectFace(sid('s1'))?.submit('x')).resolves.toBe(false)
    expect(b.send).not.toHaveBeenCalled()
    expect(b.notify).not.toHaveBeenCalled()
  })

  it('drops both entries when the plugin fiber unloads (HMR safety)', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entries('conversation.input.left')).toHaveLength(1)
    expect(b.entries('conversation.input.dock')).toHaveLength(1)
    await b.fiber.dispose()
    expect(b.entries('conversation.input.left')).toHaveLength(0)
    expect(b.entries('conversation.input.dock')).toHaveLength(0)
  })

  it('the node half mounts no host capability', async () => {
    const ctx = new Context()
    await ctx.plugin({ apply: nodeApply }).await()
    await ctx.fiber.dispose()
  })
})
