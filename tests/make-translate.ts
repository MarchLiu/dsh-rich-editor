/**
 * Local twin of dsh-client-test-runtime's makeTranslate: build a translate
 * function from one or more dictionaries (first hit wins, `{name}` params
 * interpolated). Vendored because the published 0.1.0-rc.x test-runtime
 * references unshipped source paths and fails to load; this is the only
 * helper the specs need from it.
 */
export function makeTranslate(...dicts: Array<Record<string, string>>): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    let template = key
    for (const dict of dicts) {
      const hit = dict[key]
      if (hit !== undefined) {
        template = hit
        break
      }
    }
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
  }
}
