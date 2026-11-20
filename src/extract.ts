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
}

type Block = { slug: string; fields: Field[] }

export type Relation = {
  from: string
  field: string
  to: string[]
  kind: 'relationship' | 'upload' | 'join'
}

const isInternal = (slug: string) => slug.startsWith('payload-')

const toArray = (value: string | string[]) => (Array.isArray(value) ? value : [value])

const joinPath = (prefix: string, name: string) => (prefix ? `${prefix}.${name}` : name)

// Walks a list of fields and collects every field that points at another collection.
// Fields can be nested (groups, arrays, tabs, blocks), so the function calls itself.
function collectRelations(
  fields: Field[],
  from: string,
  prefix: string,
  sharedBlocks: Map<string, Block>,
  found: Relation[],
) {
  for (const field of fields) {
    const here = field.name ? joinPath(prefix, field.name) : prefix

    if (field.relationTo) {
      const kind = field.type === 'upload' ? 'upload' : 'relationship'
      found.push({ from, field: here, to: toArray(field.relationTo), kind })
    }

    if (field.type === 'join' && field.collection) {
      found.push({ from, field: here, to: toArray(field.collection), kind: 'join' })
    }

    for (const tab of field.tabs ?? []) {
      const tabPrefix = tab.name ? joinPath(prefix, tab.name) : prefix
      collectRelations(tab.fields, from, tabPrefix, sharedBlocks, found)
    }

    for (const block of field.blocks ?? []) {
      collectRelations(block.fields, from, `${here}<${block.slug}>`, sharedBlocks, found)
    }

    // Shared blocks are listed by slug here and defined once in config.blocks.
    for (const reference of field.blockReferences ?? []) {
      const block = typeof reference === 'string' ? sharedBlocks.get(reference) : reference
      if (block) collectRelations(block.fields, from, `${here}<${block.slug}>`, sharedBlocks, found)
    }

    if (field.fields) collectRelations(field.fields, from, here, sharedBlocks, found)
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

for (const collection of config.collections) {
  if (isInternal(collection.slug)) continue
  collectRelations(collection.fields, collection.slug, '', sharedBlocks, found)
}

for (const global of config.globals ?? []) {
  collectRelations(global.fields, `global:${global.slug}`, '', sharedBlocks, found)
}

// 7. Drop internal targets (fx media.folder -> payload-folders) and relations left empty.
const relations = found
  .map((relation) => ({ ...relation, to: relation.to.filter((slug) => !isInternal(slug)) }))
  .filter((relation) => relation.to.length > 0)

// 8. Print ONLY JSON to stdout, so cli.ts can parse it later.
console.log(
  JSON.stringify(
    { collections, globals, pluginCollections: [...pluginCollections], relations },
    null,
    2,
  ),
)
