# @mars.liu/dsh-rich-editor

English | [中文](README.zh.md)

![Markdown notebook open above the plain composer](docs/img/notebook-panel.png)

Third-party [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web plugin: a rich Markdown notebook for the composer region. Its browser half contributes two entries to the composer region that `dsh-client-ui-conversation` owns: a tool-row toggle (`conversation.input.left`) and an editor card in the composer context stack (`conversation.input.dock`). Both entries share one per-session store handle, so the in-progress draft survives closing and reopening the panel, surface remounts, and — because the engine scopes session stores by session id — each session keeps its own notebook.

The editor is a CodeMirror 6 instance over the Markdown language: syntax highlighting for the draft (GFM tables included), native undo/redo and selection, and Enter-key list editing in the Codex style — pressing Enter on a non-empty list item opens the next item (ordered markers increment `1.` → `2.`, checkbox items reopen unchecked, indentation is preserved, and a mid-line caret splits the item), while Enter on an empty item drops the marker and returns the line to plain-text editing. Enter on a non-list line falls through to a plain newline. `Mod+Enter` submits.

![Enter-key list editing: next item, unchecked checkbox, marker dropped](docs/img/enter-list-editing.png)

Submission rides the scope-addressed `conversation` service's `send` verb — the same path the plain composer's submit rides — so adjudication, queueing, and prompt-error reporting behave exactly like a typed prompt. A failed send surfaces on the session's composer notice channel and the panel keeps its draft.

The notebook and the native composer are two editing surfaces over one draft: opening the panel adopts whatever the native editor already holds (an empty composer instead receives the notebook's kept draft); while the panel is open, every edit on either side mirrors live to the other — notebook edits ride the session input facade's single `setDraft` write path, native edits flow back through a subscription on the facade's InputState store applied as a minimal-diff splice (an equality guard breaks the echo loop and preserves a caret outside the edited range); closing leaves the final text in the native editor, and a successful submit clears both surfaces.

![How the pieces connect: two composer slots, one session store, one send verb](docs/img/architecture.png)

## Install

```sh
dsh plugin --profile web add @mars.liu/dsh-rich-editor
```

The package carries its own bundle patch (`cordis.patch.yml` adds the `ui-rich-editor` row); list the bundle in the profile's `dsh.profile.bundles` if you compose profiles by hand. From a checkout:

```sh
pnpm install && pnpm run build && pnpm test
```

Requires the dsh family at `>=0.0.1-rc.1` (published on npm) and a dsh web composition that mounts `dsh-client-ui-conversation`.

### Development notes

The npm `0.0.1-rc.1` dsh snapshot ships browser loader bundles only — its node halves export almost nothing, and several pre-rename dependency names (`dsh-compact`, `dsh-user-interaction`, `dsh-type-meta`, `dsh-client-ui-slash`) were never published. This repo works around both:

- `package.json > overrides` points the missing names at empty stubs under `vendor/stubs/` (nothing in this plugin's surface imports them);
- `vitest.config.ts` aliases `@deepseek-ai/dsh-client-runtime/client` and `.../dsh-client-locale/client` onto a local harness checkout's TypeScript sources (`DSH_CHECKOUT`, default `../deepseek-harness`) and inlines all `@deepseek-ai/dsh-client-*` packages, mirroring how in-repo dsh tests reach client APIs.

Drop both workarounds when the dsh family republishes a complete, installable closure.

## Known Limitations and Deferred Work

- **Ordered renumbering is deferred** — continuing an ordered list increments the new item's marker, but editing or removing earlier items does not renumber the following ones.
- **No `/` and `@` trigger integration yet** — the notebook does not participate in the slash-command and file-mention pipeline; those gestures belong to the plain composer below it.
- **Draft is session-lifetime only** — the store keeps the draft across remounts and tab switches, but a full page reload discards it (no persistence key).
- **No attachment intake** — pasting or dropping images into the notebook is not wired to the session's image attachment path.
- **The browser bundle inlines ~268 kB gzip of CodeMirror** — `@codemirror/lang-markdown` statically depends on `@codemirror/lang-html` (which pulls the JavaScript and CSS parsers) even with embedded code highlighting off (`codeLanguages: []`), and the client bundler inlines the whole chain; a deferred trim would split the editor mount behind a dynamic import.

## License

MIT
