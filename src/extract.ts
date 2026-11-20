import path from 'node:path'
import { pathToFileURL } from 'node:url'

type Field = {
  name?: string
  type: string
  relationTo?: string | string[]
  collection?: string | string[] // join fields point at a collection through "collection"
  fields?: Field[]
  tabs?: { name?: string; fields: Field[] }[]
  blocks?: Block[]
  blockReferences?: (string | Block)[]
  editor?: { editorConfig?: { resolvedFeatureMap?: Map<string, Feature> } }
}

type Block = { slug: string; fields: Field[] }

// A Lexical feature in a richText field. Only the props we read are typed.
type Feature = {
  sanitizedServerFeatureProps?: {
    fields?: Field[] // link: the fields of the link drawer, including a "doc" relationship
    blocks?: (string | Block)[] // blocks: blocks inside the editor
    inlineBlocks?: (string | Block)[]
    enabledCollectionSlugs?: string[] // upload and relationship: allowed collections
    collections?: Record<string, { fields?: Field[] }> // upload: extra fields per collection
  }
}

export type Relation = {
  from: string
  field: string
  to: string[]
  kind: 'relationship' | 'upload' | 'join'
  richText?: true // set when the relation lives inside a richText (Lexical) field
}

// What stays the same during one walk through a collection or global.
type Walk = {
  from: string
  sharedBlocks: Map<string, Block>
  found: Relation[]
  richText: boolean
}

const isInternal = (slug: string) => slug.startsWith('payload-')

const toArray = (value: string | string[]) => (Array.isArray(value) ? value : [value])

const joinPath = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name)

function addRelation(walk: Walk, field: string, to: string[], kind: Relation['kind']) {
  const relation: Relation = { from: walk.from, field, to, kind }
  if (walk.richText) relation.richText = true
  walk.found.push(relation)
}

function collectBlocks(blocks: (string | Block)[], prefix: string, walk: Walk) {
  for (const reference of blocks) {
    // Shared blocks are listed by slug and defined once in config.blocks.
    const block = typeof reference === 'string' ? walk.sharedBlocks.get(reference) : reference
    if (block) collectRelations(block.fields, `${prefix}<${block.slug}>`, walk)
  }
}

// Relations inside a richText field live in its Lexical features, not in normal fields.
// The path marks the feature in braces, for example "content{blocks}<mediaBlock>.media".
function collectRichText(field: Field, here: string, walk: Walk) {
  const features = field.editor?.editorConfig?.resolvedFeatureMap
  if (!features) return
  const inside: Walk = { ...walk, richText: true }

  for (const [key, feature] of features) {
    const props = feature.sanitizedServerFeatureProps ?? {}
    const prefix = `${here}{${key}}`
    if (props.fields) collectRelations(props.fields, prefix, inside)
    collectBlocks([...(props.blocks ?? []), ...(props.inlineBlocks ?? [])], prefix, inside)
    if ((key === 'upload' || key === 'relationship') && props.enabledCollectionSlugs) {
      addRelation(inside, prefix, props.enabledCollectionSlugs, key)
    }
    for (const extra of Object.values(props.collections ?? {})) {
      collectRelations(extra.fields ?? [], prefix, inside)
    }
  }
}

// Walks a list of fields and collects every field that points at another collection.
// Fields can be nested (groups, arrays, tabs, blocks, richText), so the function calls itself.
function collectRelations(fields: Field[], prefix: string, walk: Walk) {
  for (const field of fields) {
    const here = field.name ? joinPath(prefix, field.name) : prefix

    if (field.relationTo) {
      addRelation(walk, here, toArray(field.relationTo), field.type === 'upload' ? 'upload' : 'relationship')
    }

    if (field.type === 'join' && field.collection) {
      addRelation(walk, here, toArray(field.collection), 'join')
    }

    if (field.type === 'richText') collectRichText(field, here, walk)

    for (const tab of field.tabs ?? []) {
      collectRelations(tab.fields, tab.name ? joinPath(prefix, tab.name) : prefix, walk)
    }

    collectBlocks([...(field.blocks ?? []), ...(field.blockReferences ?? [])], here, walk)

    if (field.fields) collectRelations(field.fields, here, walk)
  }
}

// 1. Which config file? Take it from the command line, otherwise a default.
const configPath = path.resolve(process.argv[2] ?? 'src/payload.config.ts')

// 2. Import the config. import() needs a file URL, not a Windows path like C:\...
const mod = await import(pathToFileURL(configPath).href)

// 3. The default export is a Promise, because buildConfig is async.
const config = await mod.default

const sharedBlocks = new Map<string, Block>(
  (config.blocks ?? []).map((block: Block) => [block.slug, block]),
)

// 4. Keep only what the user defined (Payload adds internal "payload-*" collections).
const collections: string[] = config.collections
  .map((collection: { slug: string }) => collection.slug)
  .filter((slug: string) => !isInternal(slug))

const globals: string[] = (config.globals ?? []).map((global: { slug: string }) => global.slug)

// 5. Find collections added by plugins. The built config has no marker for them, but it
// keeps config.plugins. Each plugin is a function (config) => config, so running it on an
// empty config shows which collections it adds. A plugin that fails here is skipped,
// and its collections are then shown as the user's own.
const pluginCollections = new Set<string>()
for (const plugin of config.plugins ?? []) {
  try {
    const added = await plugin({ collections: [], globals: [] })
    for (const collection of added.collections ?? []) {
      if (collections.includes(collection.slug)) pluginCollections.add(collection.slug)
    }
  } catch {
    // Ignored on purpose, see above.
  }
}

// 6. Collect relations from every collection and global.
const found: Relation[] = []

const walkFrom = (from: string): Walk => ({ from, sharedBlocks, found, richText: false })

for (const collection of config.collections) {
  if (isInternal(collection.slug)) continue
  collectRelations(collection.fields, '', walkFrom(collection.slug))
}

for (const global of config.globals ?? []) {
  collectRelations(global.fields, '', walkFrom(`global:${global.slug}`))
}

// 7. Drop internal targets (fx media.folder -> payload-folders) and relations left empty.
// A richText relation allowed to point at every collection (no limit set in the editor)
// becomes "*", so the tree can show it as one "any collection" line.
const pointsAtAll = (relation: Relation) =>
  relation.richText === true && collections.every((slug) => relation.to.includes(slug))

const relations = found
  .map((relation) => ({ ...relation, to: relation.to.filter((slug) => !isInternal(slug)) }))
  .filter((relation) => relation.to.length > 0)
  .map((relation) => (pointsAtAll(relation) ? { ...relation, to: ['*'] } : relation))

// 8. Print ONLY JSON to stdout, so cli.ts can parse it later.
console.log(
  JSON.stringify(
    { collections, globals, pluginCollections: [...pluginCollections], relations },
    null,
    2,
  ),
)
