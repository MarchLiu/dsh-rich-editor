// @vitest-environment jsdom
/**
 * `renderMarkdown` — the preview pipeline: marked parsing plus DOMPurify
 * sanitization. Asserts both the GFM surface users expect and the security
 * invariants that make `dangerouslySetInnerHTML` safe.
 */
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/client/preview.ts'

describe('renderMarkdown — rendering surface', () => {
  it('renders headings, emphasis and lists', () => {
    const html = renderMarkdown('# 标题\n\n**粗体** 和 *斜体*\n\n- 一\n- 二\n')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>粗体</strong>')
    expect(html).toContain('<em>斜体</em>')
    expect(html).toContain('<li>一</li>')
  })

  it('renders GFM tables and task lists', () => {
    const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('checkbox')
    expect(html).toContain('done')
  })

  it('renders fenced code blocks and inline code', () => {
    const html = renderMarkdown('```\nconst x = 1\n```\n\ninline `code` here\n')
    expect(html).toContain('<pre>')
    expect(html).toContain('const x = 1')
    expect(html).toContain('<code>code</code>')
  })

  it('treats single newlines as breaks (chat-style prose)', () => {
    const html = renderMarkdown('第一行\n第二行\n')
    expect(html).toContain('<br')
  })
})

describe('renderMarkdown — sanitization invariants', () => {
  it('strips script tags', () => {
    const html = renderMarkdown('hello <script>alert(1)</script> world')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)</script>')
  })

  it('strips event handlers', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('neutralizes javascript: URLs', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
  })

  it('strips style tags and iframe/embed', () => {
    const html = renderMarkdown('<style>body{}</style><iframe src="https://x"></iframe><embed src="y">')
    expect(html).not.toContain('<style')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('<embed')
  })

  it('keeps benign formatting while sanitizing hostile input', () => {
    const html = renderMarkdown('# ok\n\n<script>bad()</script>\n\n- list item\n')
    expect(html).toContain('<h1>ok</h1>')
    expect(html).toContain('<li>list item</li>')
    expect(html).not.toContain('bad()')
  })
})
