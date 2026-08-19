/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-rich-editor`.
 * @module @deepseek-ai/dsh-client-ui-rich-editor/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-rich-editor'

/** Cordis companion plugin name. */
export const name = 'client-ui-rich-editor-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: slot registrations are effects owned and observed by
 * the slot registry, and the per-session editor store is scoped viewing
 * state exercised through the component specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
