# Agent Note: A rich Markdown notebook as a composer-region plugin

Status: implemented

English | [中文](2026-08-16-rich-editor-notebook.zh.md)

## Problem

The shipped composer is a plain textarea owned by `dsh-client-ui-conversation`; its keyboard command face (`ComposerKeyboard`) is package-private by contract, so two capabilities were out of reach for any plugin: Codex-style list editing (Enter continues the item, empty item exits the list) and a richer Markdown editing surface (tables, LaTeX source). A plugin cannot intercept Enter in the default composer, and a `conversation.composer` chain takeover replaces the whole input area — losing the tool row, the model seat, and the draft machine — just to gain an editor.

## Decision

The new package `dsh-client-ui-rich-editor` contributes two entries to slots ui-conversation already owns, adding no new extension points:

- `conversation.input.left` — a tool-row circle toggle (the documented seat for a small always-visible control);
- `conversation.input.dock` — the editor card (the documented seat for content that carries prose).

Both registrations share one `createRichEditorStore()` handle; the slot engine scopes session stores by session id, so the engine — not the plugin — gives each session its own notebook draft, and closing the panel (a plain `return null` in the dock entry) keeps the textarea composer mounted and fully live below. This sidesteps the chain-takeover path entirely: chain selectors are pure functions of the owner currency (`interactions` + `session`), so a user-toggled takeover cannot be routed reactively through the chain without an owner change — the dock list slot needs nothing.

Submission resolves the session scope (`ctx.sessions.scope(id)`) and calls the scope-addressed `conversation.send(text)` — the same verb the plain composer's submit rides — so adjudication, queueing, and prompt-error reporting are identical. A rejected send surfaces on that session's input-machine notice channel (`conversation.input.for(actx).notify`) and the panel keeps its draft.

The editor is CodeMirror 6 over `@codemirror/lang-markdown` (a maintained dependency in place of hand-rolled undo/selection/paste): GFM-table-aware highlighting, native history, and a `Prec.highest` Enter keymap whose behavior lives in the pure `listEnterEdit(text, cursor)` (markdown.ts): non-empty item → insert `\n` + indent + marker (ordered incremented, checkbox reopened unchecked, mid-line caret splits the item); empty item → erase the marker line, returning to plain text; non-list line → decline and fall through. `Mod-Enter` submits.

## Alternatives considered

**A `conversation.composer` chain-takeover entry.** Rejected for this feature: the chain currency carries only pending interactions and the session snapshot, so a user toggle has no reactive routing into the election; and an elected takeover hides the whole bar — tool row, model seat, attachments — forcing the plugin to reimplement composer chrome.

**Extending `ComposerKeyboard` with a public arbitration chain (the "option B" seam).** Rejected for now: it is the right seam only for plugins that must stay inside the native textarea; a notebook replaces the editing surface wholesale, which the dock slot already expresses without a new framework extension point.

**Hand-rolled textarea with keydown handling.** Rejected: CodeMirror deletes the owned surface (history, selection, paste, IME, accessibility) and its jsdom behavior is provable — the component specs drive real keydown events through it.

## Consequences

The toggle and the panel land as one more composer-region plugin (three registration surfaces: `tsconfig.client.json`, the web-app bundle's `cordis.patch.yml` row and `package.json` dep). The textarea composer keeps every existing behavior — `/` and `@` triggers, claims, attachments — untouched. The notebook's known gaps are recorded in its README: no trigger integration yet, no attachment intake, session-lifetime draft, and deferred ordered-list renumbering.

## Testing

`packages/client/ui-rich-editor/tests/`: the pure list logic (continuation, ordered increment and delimiter style, checkbox reset, mid-line split, empty-item exit, non-list declines, mid-document bounds); the store; the editor glue (mount/destroy, typed changes, Enter continuation and exit through real keydown events, plain-line newline, non-empty-selection decline, Mod-Enter submit); both components over real store instances; and a REAL-cordis composition bench (browser-plugin spec) covering registration shapes, the shared store handle identity, the three submit outcomes, and fiber-disposal HMR safety. Per-file coverage is 100% (one documented defensive `v8 ignore` on the always-mounted host ref). `test:gui` stays green (279 files, 3798 tests).
