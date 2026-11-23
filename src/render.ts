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

// Keeps only the named sources (collections, or globals as "global:<slug>") and what they
// point at. The summary line then counts only these sources.
export function fromSources(data: ExtractResult, sources: string[]): ExtractResult {
  return {
    ...data,
    collections: data.collections.filter((slug) => sources.includes(slug)),
    globals: data.globals.filter((slug) => sources.includes(`global:${slug}`)),
    relations: data.relations.filter((relation) => sources.includes(relation.from)),
  }
}

// extract.ts uses "*" for a richText relation that may point at every collection.
const ANY = '*'
const nameOf = (slug: string) => (slug === ANY ? 'any collection' : slug)

const sourcesOf = (data: ExtractResult) => [
  ...data.collections,
  ...data.globals.map((slug) => `global:${slug}`),
]

// One line in the tree: a collection and the fields behind it. In the normal tree the
// name is a target, in the --to tree it is a source.
type Group = { name: string; fields: Relation[] }

const bold = (text: string) => styleText('bold', text)
const dim = (text: string) => styleText('dim', text)

// Groups relations by a key, so 12 fields pointing at "media" become one line
// instead of twelve. Most fields first.
function groupBy(relations: Relation[], keysOf: (relation: Relation) => string[]): Group[] {
  const groups = new Map<string, Relation[]>()
  for (const relation of relations) {
    for (const key of keysOf(relation)) groups.set(key, [...(groups.get(key) ?? []), relation])
  }
  return [...groups]
    .map(([name, fields]) => ({ name, fields }))
    .sort((a, b) => b.fields.length - a.fields.length || a.name.localeCompare(b.name))
}

const targetsOf = (source: string, relations: Relation[]) =>
  groupBy(
    relations.filter((relation) => relation.from === source),
    (relation) => relation.to,
  )

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`

// "3 fields, 1 join, rich text": the count, plus how many of the fields are joins, live
// in richText, or may point at any collection. A tag without a number means all fields have it.
function groupInfo(group: Group): string {
  const count = group.fields.length
  const tag = (matching: number, label: string) =>
    matching === 0 ? [] : [matching === count ? label : `${matching} ${label}`]
  // On an "any collection" line this tag would only repeat the name.
  const anyCount =
    group.name === ANY ? 0 : group.fields.filter((field) => field.to.includes(ANY)).length
  return [
    plural(count, 'field'),
    ...tag(group.fields.filter((field) => field.kind === 'join').length, 'join'),
    ...tag(group.fields.filter((field) => field.richText).length, 'rich text'),
    ...tag(anyCount, 'any collection'),
  ].join(', ')
}

const groupLabel = (group: Group) => `${nameOf(group.name)} ${dim(`(${groupInfo(group)})`)}`

// The branches under one heading, with field paths when --details is on.
function branches(groups: Group[], details: boolean): string[] {
  return groups.flatMap((group, index) => {
    const last = index === groups.length - 1
    const indent = last ? '   ' : '│  '
    return [
      `${last ? '└─' : '├─'} ${groupLabel(group)}`,
      ...(details ? group.fields.map((field) => dim(`${indent}  ${field.field}`)) : []),
    ]
  })
}

// Keeps only relations that can point at one collection, and narrows their targets to it.
// A relation allowed to point at any collection ("*") can point at this one too, so it
// stays, still marked "*".
// Collections and globals that point at nothing are dropped too, so --mermaid and --json
// only show what is involved.
export function pointingAt(data: ExtractResult, slug: string): ExtractResult {
  const relations = data.relations
    .filter((relation) => relation.to.includes(slug) || relation.to.includes(ANY))
    .map((relation) => ({ ...relation, to: relation.to.includes(slug) ? [slug] : [ANY] }))
  const isSource = (from: string) => relations.some((relation) => relation.from === from)
  return {
    ...data,
    collections: data.collections.filter((name) => name === slug || isSource(name)),
    globals: data.globals.filter((name) => isSource(`global:${name}`)),
    relations,
  }
}

// The --to tree: one collection on top, everything that points at it below.
// Expects data that has been through pointingAt.
export function renderIncoming(data: ExtractResult, slug: string, options: { details: boolean }): string {
  if (data.relations.length === 0) return `Nothing points at ${bold(slug)}.`
  const sources = groupBy(data.relations, (relation) => [relation.from])
  return [
    `${bold(slug)} ${dim('is pointed at by')}`,
    ...branches(sources, options.details),
    '',
    dim(`${plural(sources.length, 'source')}, ${plural(data.relations.length, 'field')}`),
  ].join('\n')
}

// Collections that nothing points at and that point at nothing: maybe forgotten, maybe dead.
// Fields that may point at any collection ("*") are not counted, otherwise one such field
// would make every collection look connected.
export function notConnected(data: ExtractResult): string[] {
  const linked = new Set(data.relations.flatMap((relation) => [relation.from, ...relation.to]))
  return data.collections.filter((slug) => !linked.has(slug))
}

// options.notConnected should come from the full map. Worked out from filtered data, a
// collection could look unconnected only because the fields pointing at it were filtered away.
export function render(
  data: ExtractResult,
  options: { details: boolean; notConnected?: string[] },
): string {
  const lines: string[] = []
  const unconnected = (options.notConnected ?? notConnected(data)).filter((slug) =>
    data.collections.includes(slug),
  )
  const withoutRelations: string[] = []

  for (const source of sourcesOf(data)) {
    const targets = targetsOf(source, data.relations)
    if (targets.length > 0) lines.push(bold(source), ...branches(targets, options.details), '')
    else if (!unconnected.includes(source)) withoutRelations.push(source)
  }

  if (withoutRelations.length > 0) {
    lines.push(dim(`No outgoing relations: ${withoutRelations.join(', ')}`))
  }
  if (unconnected.length > 0) {
    lines.push(`Not connected to anything: ${unconnected.join(', ')}`)
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

// options.leftOutRichText: how many richText fields the caller removed. They are named in
// a Mermaid comment (%%), which is not drawn, so nobody mistakes the diagram for the full map.
export function renderMermaid(data: ExtractResult, options: { leftOutRichText?: number } = {}): string {
  const lines = ['flowchart LR']
  const leftOut = options.leftOutRichText ?? 0
  if (leftOut > 0) {
    lines.push(`  %% ${plural(leftOut, 'rich text field')} left out. Add --rich-text to include them.`)
  }
  const nodes = new Set<string>()
  const edges: string[] = []

  for (const source of sourcesOf(data)) {
    nodes.add(source)
    for (const target of targetsOf(source, data.relations)) {
      nodes.add(target.name)
      const label = groupInfo(target)
      // A dotted arrow marks a line made only of join fields (the reverse side of a relation).
      const allJoins = target.fields.every((field) => field.kind === 'join')
      const arrow = allJoins ? `-. "${label}" .->` : `-->|"${label}"|`
      edges.push(`  ${mermaidId(source)} ${arrow} ${mermaidId(target.name)}`)
    }
  }

  for (const node of nodes) lines.push(`  ${mermaidId(node)}["${nameOf(node)}"]`)
  return [...lines, ...edges].join('\n')
}
