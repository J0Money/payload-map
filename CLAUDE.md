# payload-map

Terminal CLI that reads a Payload CMS (v3) config and draws how its collections relate to each other.

## Conventions

- Code, comments, identifiers and commit messages in English.
- Never commit real project configs, their output or screenshots of them. Tests and the demo use generic configs only.
- `CLAUDE.local.md` (not committed) holds personal notes. Read it if it exists.

## Architecture decisions

- Two processes. `cli.ts` finds the config and starts a helper process in the USER'S project folder. `extract.ts` loads the config and prints JSON to stdout. `cli.ts` parses the JSON and passes it to `render.ts`.
- Why a separate process: a crash in the user's config becomes a readable error instead of killing the tool.
- The helper must run with the user's project folder as working directory, and also get `--tsconfig <project tsconfig>`. Without one of them the `@/` alias fails with `Cannot find package '@/...'`. Tested: `--tsconfig` fixes it from a wrong working directory.
- TypeScript is run with `tsx`. Config path must go through `pathToFileURL(...)` before `import()` (Windows paths).
- `tsx` is a runtime dependency, not a dev dependency: the published `dist/extract.js` still needs it to load the user's `payload.config.ts`.
- Build: `tsc` compiles `src` to `dist` (`npm run build`, runs automatically on `npm pack`/`npm publish`). Source imports use `.ts` extensions, and `rewriteRelativeImportExtensions` turns them into `.js`. `cli.ts` picks `extract.ts` or `extract.js` by its own extension, so it works from both `src` and `dist`.
- Loading the config does not need Payload to start, a database or a `.env`. Tested on Payload 3.88.0 and 3.92.1.
- Loading a config runs the user's code (its imports). The README states this.
- stdout from the helper is JSON only. Messages and errors go to stderr.

## JSON contract (extract.ts output)

```json
{
  "collections": ["users", "posts"],
  "globals": ["header"],
  "pluginCollections": ["redirects"],
  "relations": [
    { "from": "posts", "field": "author", "to": ["users"], "kind": "relationship" }
  ]
}
```

`kind` is `relationship`, `upload` or `join` (join is the reverse side of a relation). Globals use `from: "global:<slug>"`. Nested fields use a path such as `layout<hero>.media`.

Relations inside a richText field get `"richText": true` (the key is left out otherwise). Their path marks the Lexical feature in braces, for example `content{link}.doc` or `content{blocks}<mediaBlock>.media`. A richText relation that may point at every collection (no limit set in the editor) gets `"to": ["*"]`, shown as "any collection".

`pluginCollections` is a subset of `collections`. The built config has no marker for plugin collections, so `extract.ts` runs each function in `config.plugins` again on `{ collections: [], globals: [] }` and records the slugs it adds. A plugin that throws during this replay is skipped, and its collections count as the user's own.

## Traps already found (keep handled)

1. Relations are often nested in tabs, blocks, groups and arrays. A flat scan of top-level fields finds only a fraction of them.
2. Shared blocks: `blockReferences` holds slugs only, the blocks live in `config.blocks`. Reading only `field.blocks` silently misses them.
3. `upload` fields also have `relationTo`. Check `relationTo`, not the field type.
4. Join fields have `collection` and `on`, not `relationTo`.
5. Payload adds internal `payload-*` collections. Filter them as sources AND as targets (for example `media.folder -> payload-folders`).
6. richText relations live in the Lexical editor, not in fields: `field.editor.editorConfig.resolvedFeatureMap` (a Map), each feature's `sanitizedServerFeatureProps`. `link` has `fields` (with a `doc` relationship), `blocks` has `blocks` and `inlineBlocks`, `upload` and `relationship` have `enabledCollectionSlugs`, `upload` also has `collections` with extra fields. Seen on Payload 3.92.1.

## Behaviour

- Flags: `--config <path>`, `--details` (field paths in the tree), `--json`, `--mermaid`, `--all` (include plugin collections), `--no-rich-text` (leave out richText relations).
- richText relations are shown by default, tagged `rich text` (or `2 rich text` when only some of the fields are).
- Plugin collections are hidden by default, as sources only. A user field pointing at one (for example `pages.form -> forms`) is still shown.
- Join fields are shown, labelled `(join)` in the tree and as a dotted arrow in Mermaid.
- Colors come from `node:util` `styleText`, which turns them off when output is piped or `NO_COLOR` is set.

## Tests

- `npm test` (node:test via tsx). `test/cli.test.ts` runs the real CLI against `test/fixtures/`, `test/render.test.ts` tests the output functions.
- The fixtures are plain objects shaped like a built config, so Payload is not a dependency. Join fields, shared blocks, richText features and plugin replay are covered by fixtures.
- Not tested: Payload versions below 3.88, custom Lexical features, Windows paths with spaces, join fields and shared blocks in a real Payload project.

## Demo GIF

- `demo/demo.gif` is recorded with VHS from `demo/demo.tape` on the generic shop config in `demo/src/payload.config.ts`.
- Re-record after output changes: `npm run build`, then `vhs demo/demo.tape` from the repo root. Needs VHS, ttyd and ffmpeg.
- The tape hides the setup: a `> ` prompt so no local paths show, and `Remove-Item Env:NO_COLOR` because VHS sets `NO_COLOR` and payload-map respects it.
