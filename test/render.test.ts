import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripVTControlCharacters } from 'node:util'
import {
  pointingAt,
  render,
  renderIncoming,
  renderMermaid,
  withoutPlugins,
  withoutRichText,
  type ExtractResult,
} from '../src/render.ts'

// render() adds colors when the terminal supports them. Strip them so the
// tests compare plain text, whatever terminal they run in.
const plain = (data: ExtractResult, details = false) =>
  stripVTControlCharacters(render(data, { details }))

const data: ExtractResult = {
  collections: ['pages', 'media', 'forms'],
  globals: ['footer'],
  pluginCollections: ['forms'],
  relations: [
    { from: 'pages', field: 'hero', to: ['media'], kind: 'upload' },
    { from: 'pages', field: 'meta.image', to: ['media'], kind: 'upload' },
    { from: 'pages', field: 'form', to: ['forms'], kind: 'relationship' },
    { from: 'media', field: 'usedOn', to: ['pages'], kind: 'join' },
    { from: 'forms', field: 'redirect', to: ['pages'], kind: 'relationship' },
    { from: 'global:footer', field: 'nav.page', to: ['pages'], kind: 'relationship' },
  ],
}

test('groups fields per target, most fields first', () => {
  const output = plain(data)
  assert.match(output, /pages\n├─ media \(2 fields\)\n└─ forms \(1 field\)/)
})

test('labels join fields', () => {
  assert.match(plain(data), /media\n└─ pages \(1 field, join\)/)
})

test('lists field paths with --details', () => {
  const output = plain(data, true)
  assert.match(output, /├─ media \(2 fields\)\n│ {4}hero\n│ {4}meta\.image/)
})

test('prints globals with their prefix and a summary line', () => {
  const output = plain(data)
  assert.match(output, /global:footer\n└─ pages \(1 field\)/)
  assert.match(output, /3 collections, 1 global, 6 relations$/)
})

test('collects collections without outgoing relations on one line', () => {
  const output = plain({ ...data, relations: [] })
  assert.match(output, /No outgoing relations: pages, media, forms, global:footer/)
})

test('withoutPlugins hides plugin collections as sources but keeps them as targets', () => {
  const filtered = withoutPlugins(data)
  assert.deepEqual(filtered.collections, ['pages', 'media'])
  assert.ok(!filtered.relations.some((relation) => relation.from === 'forms'))
  assert.ok(filtered.relations.some((relation) => relation.to.includes('forms')))
})

test('mermaid uses safe ids, real labels and dotted arrows for joins', () => {
  const output = renderMermaid(data)
  assert.match(output, /^flowchart LR/)
  assert.match(output, /global_footer\["global:footer"\]/)
  assert.match(output, /pages -->\|"2 fields"\| media/)
  assert.match(output, /media -\. "1 field, join" \.-> pages/)
})

const withRichText: ExtractResult = {
  collections: ['posts', 'media'],
  globals: [],
  pluginCollections: [],
  relations: [
    { from: 'posts', field: 'cover', to: ['media'], kind: 'upload' },
    { from: 'posts', field: 'body{upload}', to: ['media'], kind: 'upload', richText: true },
    { from: 'posts', field: 'body{relationship}', to: ['*'], kind: 'relationship', richText: true },
  ],
}

test('labels richText fields and shows "*" as any collection', () => {
  const output = plain(withRichText)
  assert.match(output, /posts\n├─ media \(2 fields, 1 rich text\)\n└─ any collection \(1 field, rich text\)/)
})

test('withoutRichText drops relations inside richText fields', () => {
  assert.deepEqual(
    withoutRichText(withRichText).relations.map((relation) => relation.field),
    ['cover'],
  )
})

test('renderIncoming lists the sources of one collection, counting "any collection" fields', () => {
  const output = stripVTControlCharacters(
    renderIncoming(pointingAt(withRichText, 'media'), 'media', { details: true }),
  )
  assert.match(
    output,
    /^media is pointed at by\n└─ posts \(3 fields, 2 rich text, 1 any collection\)\n {5}cover\n/,
  )
  assert.match(output, /1 source, 3 fields$/)
})

test('renderIncoming says so when nothing points at a collection', () => {
  const output = stripVTControlCharacters(renderIncoming(pointingAt(data, 'forms'), 'forms', { details: false }))
  assert.match(output, /^forms is pointed at by\n└─ pages \(1 field\)/)
  // Without the richText fields nothing can point at posts (the "any collection" field is gone).
  const onlyCover = withoutRichText(withRichText)
  const empty = stripVTControlCharacters(renderIncoming(pointingAt(onlyCover, 'posts'), 'posts', { details: false }))
  assert.equal(empty, 'Nothing points at posts.')
})

test('mermaid gives "*" a safe id and a readable label', () => {
  const output = renderMermaid(withRichText)
  assert.match(output, /any_collection\["any collection"\]/)
  assert.match(output, /posts -->\|"1 field, rich text"\| any_collection/)
})
