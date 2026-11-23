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
- Loading the config does not need Payload to start, a database or a `.env`. Tested on Payload 3.88.0, 3.92.1 and 3.94.0 (the last one in the test suite).
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

- Flags: `--config <path>`, `--details` (field paths in the tree), `--to <collection>` (what points at one collection), `--json`, `--mermaid`, `--all` (include plugin collections), `--no-rich-text` (leave out richText relations).
- The tree ends with "Not connected to anything:" for collections with no relations either way (`notConnected`). `to: ["*"]` does not count. `cli.ts` works it out on the whole map before `fromSources` and `pointingAt`, so filtering cannot make a collection look unconnected. Globals cannot be targets, so they only appear under "No outgoing relations".
- Positional arguments are sources to show (`payload-map pages global:header`), filtered with `fromSources`. A named plugin collection is shown without `--all`. Unknown names are an error that lists the valid ones.
- Flags are read with `node:util` `parseArgs`, so unknown flags and missing values are errors, not silently ignored.
- `--to` narrows the data with `pointingAt` before any output, so it combines with `--json`, `--mermaid` and `--details`. Fields with `to: ["*"]` count as pointing at the collection and are tagged `any collection`.
- richText relations are shown by default, tagged `rich text` (or `2 rich text` when only some of the fields are).
- Plugin collections are hidden by default, as sources only. A user field pointing at one (for example `pages.form -> forms`) is still shown.
- Join fields are shown, labelled `(join)` in the tree and as a dotted arrow in Mermaid.
- Colors come from `node:util` `styleText`, which turns them off when output is piped or `NO_COLOR` is set.

## Tests

- `npm test` (node:test via tsx). `test/cli.test.ts` runs the real CLI against `test/fixtures/`, `test/render.test.ts` tests the output functions.
- Most fixtures are plain objects shaped like a built config: fast, and easy to read. Join fields, shared blocks, richText features and plugin replay are covered there.
- `test/fixtures/real-payload.config.ts` is built by Payload's real `buildConfig` (no database needed), with a join field, a shared block and Lexical features. It catches changes in Payload's built config shape. Payload, Lexical and React are dev dependencies, pinned to exact versions (Payload 3.94.0).
- `.npmrc` sets `legacy-peer-deps=true`: Lexical lists Next.js as a peer, and installing it would grow `node_modules` from about 189 MB to 629 MB for nothing.
- CI (`.github/workflows/ci.yml`): `npm ci`, build and tests on Linux, Windows and macOS with Node 22 and 24, on every push to main and every pull request.
- Not tested: Payload versions below 3.88, custom Lexical features, Windows paths with spaces.

## Demo GIF

- `demo/demo.gif` is recorded with VHS from `demo/demo.tape` on the generic shop config in `demo/src/payload.config.ts`.
- Re-record after output changes: `npm run build`, then `vhs demo/demo.tape` from the repo root. Needs VHS, ttyd and ffmpeg.
- Two scenes: the whole map, then `--to media`. The screen is cleared off camera between them.
- `Set Framerate 10`: at the default rate Windows screen capture drops frames and the GIF plays faster than real time (11 s instead of 19 s). Check with ffprobe that the duration matches the sleeps.
- The tape hides the setup: a `> ` prompt so no local paths show, and `Remove-Item Env:NO_COLOR` because VHS sets `NO_COLOR` and payload-map respects it.
