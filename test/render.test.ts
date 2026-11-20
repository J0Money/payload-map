import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripVTControlCharacters } from 'node:util'
import { render, renderMermaid, withoutPlugins, type ExtractResult } from '../src/render.ts'

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
  assert.match(output, /3 collections, 1 globals, 6 relations$/)
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
  assert.match(output, /media -\. "1 field" \.-> pages/)
})
