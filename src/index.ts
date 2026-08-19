/**
 * Rich Markdown notebook plugin, node half.
 *
 * Deliberately empty. The notebook is a browser editing surface: it submits
 * through the client-side conversation service and owns no host capability,
 * so there is nothing to mount in the Host process.
 */

/** Host plugin body — the feature lives entirely in the client half. */
export function apply(): void {}
