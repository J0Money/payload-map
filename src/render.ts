import { styleText } from 'node:util'
import type { Relation } from './extract.ts'

export type ExtractResult = {
  collections: string[]
  globals: string[]
  pluginCollections: string[]
  relations: Relation[]
}

// Hides plugin collections as sources. They stay as targets, because a field the user
// wrote (fx pages.form -> forms) is still part of the user's own model.
export function withoutPlugins(data: ExtractResult): ExtractResult {
  const isPlugin = (slug: string) => data.pluginCollections.includes(slug)
  return {
    ...data,
    collections: data.collections.filter((slug) => !isPlugin(slug)),
    relations: data.relations.filter((relation) => !isPlugin(relation.from)),
  }
}

// Drops relations inside richText fields (the --no-rich-text flag).
export function withoutRichText(data: ExtractResult): ExtractResult {
  return { ...data, relations: data.relations.filter((relation) => !relation.richText) }
}

// extract.ts uses "*" for a richText relation that may point at every collection.
const ANY = '*'
const nameOf = (slug: string) => (slug === ANY ? 'any collection' : slug)

const sourcesOf = (data: ExtractResult) => [
  ...data.collections,
  ...data.globals.map((slug) => `global:${slug}`),
]

type Pair = { to: string; fields: Relation[] }

const bold = (text: string) => styleText('bold', text)
const dim = (text: string) => styleText('dim', text)

// Groups the relations of one source by target, so 12 fields pointing at
// "media" become one line instead of twelve.
function pairsFor(source: string, relations: Relation[]): Pair[] {
  const byTarget = new Map<string, Relation[]>()
  for (const relation of relations) {
    if (relation.from !== source) continue
    for (const to of relation.to) {
      byTarget.set(to, [...(byTarget.get(to) ?? []), relation])
    }
  }
  return [...byTarget]
    .map(([to, fields]) => ({ to, fields }))
    .sort((a, b) => b.fields.length - a.fields.length || a.to.localeCompare(b.to))
}

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`

// "3 fields, 1 join, rich text": the count, plus how many of the fields are joins or live
// in richText. A tag without a number means all fields have it.
function pairInfo(pair: Pair): string {
  const count = pair.fields.length
  const tag = (matching: number, label: string) =>
    matching === 0 ? [] : [matching === count ? label : `${matching} ${label}`]
  return [
    plural(count, 'field'),
    ...tag(pair.fields.filter((field) => field.kind === 'join').length, 'join'),
    ...tag(pair.fields.filter((field) => field.richText).length, 'rich text'),
  ].join(', ')
}

const pairLabel = (pair: Pair) => `${nameOf(pair.to)} ${dim(`(${pairInfo(pair)})`)}`

export function render(data: ExtractResult, options: { details: boolean }): string {
  const lines: string[] = []
  const withoutRelations: string[] = []

  for (const source of sourcesOf(data)) {
    const pairs = pairsFor(source, data.relations)
    if (pairs.length === 0) {
      withoutRelations.push(source)
      continue
    }

    lines.push(bold(source))
    pairs.forEach((pair, index) => {
      const last = index === pairs.length - 1
      lines.push(`${last ? '└─' : '├─'} ${pairLabel(pair)}`)

      if (options.details) {
        const indent = last ? '   ' : '│  '
        for (const field of pair.fields) lines.push(dim(`${indent}  ${field.field}`))
      }
    })
    lines.push('')
  }

  if (withoutRelations.length > 0) {
    lines.push(dim(`No outgoing relations: ${withoutRelations.join(', ')}`))
  }

  lines.push(
    dim(
      `${plural(data.collections.length, 'collection')}, ` +
        `${plural(data.globals.length, 'global')}, ` +
        `${plural(data.relations.length, 'relation')}`,
    ),
  )
  return lines.join('\n')
}

// Mermaid node ids may only hold letters, digits and underscores ("global:header" may not),
// so each node gets a safe id and keeps the real slug as its label.
const mermaidId = (slug: string) =>
  slug === ANY ? 'any_collection' : slug.replace(/[^a-zA-Z0-9_]/g, '_')

export function renderMermaid(data: ExtractResult): string {
  const lines = ['flowchart LR']
  const nodes = new Set<string>()
  const edges: string[] = []

  for (const source of sourcesOf(data)) {
    nodes.add(source)
    for (const pair of pairsFor(source, data.relations)) {
      nodes.add(pair.to)
      const label = pairInfo(pair)
      // A dotted arrow marks a pair made only of join fields (the reverse side of a relation).
      const allJoins = pair.fields.every((field) => field.kind === 'join')
      const arrow = allJoins ? `-. "${label}" .->` : `-->|"${label}"|`
      edges.push(`  ${mermaidId(source)} ${arrow} ${mermaidId(pair.to)}`)
    }
  }

  for (const node of nodes) lines.push(`  ${mermaidId(node)}["${nameOf(node)}"]`)
  return [...lines, ...edges].join('\n')
}
