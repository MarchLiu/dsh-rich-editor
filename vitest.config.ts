import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * The dsh client packages publish two faces: node halves that export almost
 * nothing, and browser loader bundles (window.__ModuleLoader__.load) that are
 * not importable under Node. Inside the harness repo, tests reach the client
 * APIs through tsconfig paths onto the TypeScript sources; this repo mirrors
 * that by aliasing the same specifiers onto a local harness checkout.
 *
 * DSH_CHECKOUT overrides the checkout location (CI pins its own clone).
 */
const harness = process.env.DSH_CHECKOUT ?? resolve(__dirname, '../deepseek-harness')

const harnessSrc = (pkgPath: string, file = 'src/client/index.ts') =>
  resolve(harness, 'packages/client', pkgPath, file)

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@deepseek-ai\/dsh-client-runtime\/client$/, replacement: harnessSrc('runtime') },
      { find: /^@deepseek-ai\/dsh-client-locale\/client$/, replacement: harnessSrc('locale') },
      // The published dsh-client-test-runtime 0.1.0-rc.x build references
      // unshipped source paths (…ui-renderer/src/client/bind.ts); resolve it
      // (and the web-react bindings it pairs with) onto the checkout too.
      { find: /^@deepseek-ai\/dsh-client-test-runtime$/, replacement: harnessSrc('test-runtime', 'src/index.ts') },
    ],
  },
  test: {
    // Component specs carry their own `// @vitest-environment jsdom` pragma;
    // pure-logic specs run in the default node environment.
    include: ['tests/**/*.spec.{ts,tsx}'],
    // The published dsh client packages are ESM in node_modules; without
    // inlining, Node resolves their bare imports itself and the aliases above
    // never apply. Inlined, vite rewrites every specifier (and neutralizes
    // asset imports like katex's stylesheet).
    server: {
      deps: {
        inline: [/@deepseek-ai\/dsh-client-/],
      },
    },
  },
})
