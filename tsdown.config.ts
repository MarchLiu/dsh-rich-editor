/**
 * Self-contained build for @mars/dsh-rich-editor, replicating the dsh client
 * plugin loader contract (see the harness's packages/client/tsdown.client.ts,
 * the authoritative preset this mirrors):
 *
 * - the node half (lib/index.js + lib/invariant.js) as plain ESM;
 * - the browser half as ONE closure artifact lib/client.js that calls
 *   window.__ModuleLoader__.load({ id, factory }) and resolves externals
 *   through the injected require (the loader module table: react, cordis,
 *   the dsh client platform modules);
 * - CSS Modules compiled by lightningcss inside the bundle: importing
 *   'x.module.css' yields the hashed class map and injects a
 *   <style data-plugin="<id>"> tag at factory execution.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { transform } from 'lightningcss'
import type { UserConfig } from 'tsdown'

const ID = '@mars/dsh-rich-editor'

/** Externals the dsh loader answers from its module table (platform seed entries). */
const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  // The runtime store exemption: the loader's lazy CJS table answers it.
  '@deepseek-ai/dsh-client-runtime/client',
] as const

/** Node half: plain ESM artifacts consumed from lib/. */
const lib: UserConfig = {
  name: ID,
  entry: ['src/index.ts', 'src/invariant.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}

const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  // tsdown auto-externalizes package dependencies; everything the loader
  // table cannot answer (CodeMirror, clsx, wire types) inlines instead.
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id as never) ? undefined : true),
  plugins: [{
    // CSS Modules inline: same virtual-id scheme as the harness preset, so
    // tsdown's own css pipeline stays out of the way and the class map rides
    // the bundle.
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
      return `\0dsh-css:${abs}.mjs`
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith('\0dsh-css:')) return null
      let fileId = virtualId.slice('\0dsh-css:'.length, -'.mjs'.length)
      // The client entry may resolve against emitted lib/types (tsc output);
      // map such importers back onto the mirrored src/ file.
      if (!existsSync(fileId)) {
        const marker = `${sep}lib${sep}types${sep}`
        const boundary = fileId.indexOf(marker)
        if (boundary >= 0) {
          const mirrored = resolvePath(fileId.slice(0, boundary), 'src', fileId.slice(boundary + marker.length))
          if (existsSync(mirrored)) fileId = mirrored
        }
      }
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
      const tagId = `${ID}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [lib, client]
