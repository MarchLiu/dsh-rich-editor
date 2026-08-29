/**
 * Pure Markdown → sanitized HTML rendering for the notebook's live preview.
 * `marked` parses GFM; DOMPurify strips every active construct (script,
 * event handlers, javascript: URLs, and so on), so the result is safe to
 * inject into the panel with `dangerouslySetInnerHTML`. The module imports
 * no React and touches no React state, so it is unit-testable in plain
 * jsdom.
 */
import { marked } from 'marked'
import DOMPurifyImport from 'dompurify'

// GFM tables, strikethrough and task lists, line breaks as in chat prose.
marked.setOptions({ gfm: true, breaks: true })

type Sanitizer = { sanitize: (input: string, config?: object) => string }

// Without a window at import time the default export is a factory
// (`root => createDOMPurify(root)`) carrying no `sanitize`; bind it lazily
// on first use, when the ambient window (jsdom in tests, the browser in
// production) is guaranteed to exist. CJS interop may also park the export
// under `.default`.
const dompurifyModule = DOMPurifyImport as unknown as Record<string, unknown>
const dompurifyExport = (dompurifyModule.default ?? DOMPurifyImport) as unknown as
  & ((root?: unknown) => Sanitizer)
  & Sanitizer
let purifyCache: Sanitizer | null = null

function purify(): Sanitizer {
  if (purifyCache === null) {
    purifyCache = typeof dompurifyExport.sanitize === 'function'
      ? dompurifyExport
      : dompurifyExport(globalThis.window)
  }
  return purifyCache
}

/**
 * Render Markdown source to sanitized HTML.
 * @param text - the draft Markdown document.
 * @returns HTML safe for `dangerouslySetInnerHTML`.
 */
export function renderMarkdown(text: string): string {
  const parsed = marked.parse(text, { async: false })
  return purify().sanitize(parsed, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'disabled'],
    FORBID_TAGS: ['style', 'form'],
    FORBID_ATTR: ['srcset'],
  })
}
