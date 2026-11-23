import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// These tests run the real CLI as a process, the same way a user would.
// That covers cli.ts and extract.ts together, including the helper process.
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli')
const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

function runCliIn(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [tsxCli, cliPath, ...args], { cwd, encoding: 'utf8' })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

const runCli = (...args: string[]) => runCliIn(fixtures, ...args)

test('works in a project folder with spaces, using the "@/" alias from its tsconfig', (t) => {
  // Paths are passed on to the helper process and turned into file URLs, which is where
  // spaces tend to break. Built at runtime, so the repo itself has no folder with spaces.
  const temp = mkdtempSync(path.join(tmpdir(), 'payload map '))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const project = path.join(temp, 'My Project (copy)')
  mkdirSync(path.join(project, 'src', 'collections'), { recursive: true })
  writeFileSync(
    path.join(project, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }),
  )
  writeFileSync(path.join(project, 'src', 'collections', 'Media.ts'), "export const Media = { slug: 'media', fields: [] }\n")
  writeFileSync(
    path.join(project, 'src', 'payload.config.ts'),
    [
      "import { Media } from '@/collections/Media'",
      'export default {',
      "  collections: [Media, { slug: 'posts', fields: [{ name: 'cover', type: 'upload', relationTo: 'media' }] }],",
      '  globals: [],',
      '}',
    ].join('\n'),
  )

  const { code, stdout, stderr } = runCliIn(project, '--json')
  assert.equal(code, 0, stderr)
  assert.deepEqual(JSON.parse(stdout).relations, [
    { from: 'posts', field: 'cover', to: ['media'], kind: 'upload' },
  ])
})

test('finds every relation, also nested, shared, join and richText fields', () => {
  const { code, stdout } = runCli('--config', 'blog.config.ts', '--json', '--all')
  assert.equal(code, 0)

  const data = JSON.parse(stdout)
  assert.deepEqual(data.collections, [
    'users',
    'media',
    'pages',
    'posts',
    'redirects',
    'search',
    'newsletter',
  ])
  assert.deepEqual(data.globals, ['footer'])
  assert.deepEqual(data.relations, [
    { from: 'users', field: 'posts', to: ['posts'], kind: 'join' },
    { from: 'pages', field: 'layout<hero>.image', to: ['media'], kind: 'upload' },
    { from: 'pages', field: 'layout<link>.page', to: ['pages'], kind: 'relationship' },
    { from: 'pages', field: 'meta.image', to: ['media'], kind: 'upload' },
    { from: 'pages', field: 'author', to: ['users'], kind: 'relationship' },
    { from: 'posts', field: 'related.doc', to: ['posts', 'pages'], kind: 'relationship' },
    { from: 'posts', field: 'details.cover', to: ['media'], kind: 'upload' },
    { from: 'posts', field: 'author', to: ['users'], kind: 'relationship' },
    { from: 'posts', field: 'body{link}.doc', to: ['pages', 'posts'], kind: 'relationship', richText: true },
    { from: 'posts', field: 'body{blocks}<mediaBlock>.media', to: ['media'], kind: 'upload', richText: true },
    { from: 'posts', field: 'body{upload}', to: ['media'], kind: 'upload', richText: true },
    { from: 'posts', field: 'body{relationship}', to: ['*'], kind: 'relationship', richText: true },
    { from: 'redirects', field: 'to', to: ['pages', 'posts'], kind: 'relationship' },
    { from: 'search', field: 'doc', to: ['posts'], kind: 'relationship' },
    { from: 'global:footer', field: 'nav.page', to: ['pages'], kind: 'relationship' },
  ])
})

test('reads a config built by real Payload, without a database', () => {
  const { code, stdout, stderr } = runCli('--config', 'real-payload.config.ts', '--json')
  assert.equal(code, 0, stderr)

  const data = JSON.parse(stdout)
  assert.deepEqual(data.collections, ['users', 'media', 'posts'])

  // Payload decides the order of Lexical features, so compare sorted by field path.
  const byField = (a: { field: string }, b: { field: string }) => a.field.localeCompare(b.field)
  assert.deepEqual(data.relations.sort(byField), [
    { from: 'posts', field: 'author', to: ['users'], kind: 'relationship' },
    { from: 'posts', field: 'content{blocks}<mediaBlock>.media', to: ['media'], kind: 'upload', richText: true },
    { from: 'posts', field: 'content{link}.doc', to: ['posts'], kind: 'relationship', richText: true },
    // Payload's relationship feature leaves out upload collections by default.
    { from: 'posts', field: 'content{relationship}', to: ['users', 'posts'], kind: 'relationship', richText: true },
    { from: 'posts', field: 'content{upload}', to: ['media'], kind: 'upload', richText: true },
    { from: 'posts', field: 'layout<cta>.link', to: ['posts'], kind: 'relationship' },
    { from: 'users', field: 'posts', to: ['posts'], kind: 'join' },
  ])
})

test('detects plugin collections and skips a plugin that throws on replay', () => {
  const data = JSON.parse(runCli('--config', 'blog.config.ts', '--json', '--all').stdout)
  assert.deepEqual(data.pluginCollections, ['redirects'])
})

test('hides plugin collections as sources unless --all is passed', () => {
  const data = JSON.parse(runCli('--config', 'blog.config.ts', '--json').stdout)
  assert.ok(!data.collections.includes('redirects'))
  assert.ok(!data.relations.some((relation: { from: string }) => relation.from === 'redirects'))
  assert.equal(data.relations.length, 14)
})

test('drops richText relations with --no-rich-text', () => {
  const data = JSON.parse(runCli('--config', 'blog.config.ts', '--json', '--no-rich-text').stdout)
  assert.ok(!data.relations.some((relation: { richText?: true }) => relation.richText))
  assert.equal(data.relations.length, 10)
})

test('leaves richText relations out of --mermaid unless --rich-text is passed', () => {
  const diagram = runCli('--config', 'blog.config.ts', '--mermaid').stdout
  assert.doesNotMatch(diagram, /any_collection/)
  assert.match(diagram, /%% 4 rich text fields left out\. Add --rich-text to include them\./)

  // Counted after --to: only the 3 richText fields that can point at media.
  assert.match(runCli('--config', 'blog.config.ts', '--mermaid', '--to', 'media').stdout, /%% 3 rich text fields/)

  const full = runCli('--config', 'blog.config.ts', '--mermaid', '--rich-text').stdout
  assert.match(full, /posts -->\|"1 field, rich text"\| any_collection/)
  assert.doesNotMatch(full, /%%/)
})

test('reports --rich-text and --no-rich-text together', () => {
  const { code, stderr } = runCli('--config', 'blog.config.ts', '--rich-text', '--no-rich-text')
  assert.equal(code, 1)
  assert.match(stderr, /not both/)
})

test('--to keeps only what points at one collection, including "any collection" fields', () => {
  const data = JSON.parse(runCli('--config', 'blog.config.ts', '--json', '--all', '--to', 'media').stdout)
  assert.deepEqual(data.collections, ['media', 'pages', 'posts'])
  assert.deepEqual(
    data.relations.map((relation: { field: string; to: string[] }) => `${relation.field} -> ${relation.to}`),
    [
      'layout<hero>.image -> media',
      'meta.image -> media',
      'details.cover -> media',
      'body{blocks}<mediaBlock>.media -> media',
      'body{upload} -> media',
      'body{relationship} -> *',
    ],
  )
})

test('shows only the collections named on the command line, plugin collections too', () => {
  const data = JSON.parse(runCli('--config', 'blog.config.ts', '--json', 'redirects', 'global:footer').stdout)
  assert.deepEqual(data.collections, ['redirects'])
  assert.deepEqual(data.globals, ['footer'])
  assert.deepEqual(
    data.relations.map((relation: { from: string }) => relation.from),
    ['redirects', 'global:footer'],
  )
})

test('names collections that are not connected to anything', () => {
  const { stdout } = runCli('--config', 'blog.config.ts')
  assert.match(stdout, /Not connected to anything: newsletter/)
  // media points at nothing, but pages and posts point at it, so it is connected.
  assert.match(stdout, /No outgoing relations: media\n/)
})

test('works out unconnected collections on the whole map, also when filtered', () => {
  // Filtered to media alone, nothing seems to point at it, but on the whole map pages does.
  assert.doesNotMatch(runCli('--config', 'blog.config.ts', 'media').stdout, /Not connected/)
  assert.match(
    runCli('--config', 'blog.config.ts', 'newsletter').stdout,
    /Not connected to anything: newsletter/,
  )
})

test('reports an unknown collection name', () => {
  const { code, stderr } = runCli('--config', 'blog.config.ts', 'nope')
  assert.equal(code, 1)
  assert.match(stderr, /Unknown collection or global: nope/)
  assert.match(stderr, /global:footer/)
})

test('reports an unknown collection for --to', () => {
  const { code, stderr } = runCli('--config', 'blog.config.ts', '--to', 'nope')
  assert.equal(code, 1)
  assert.match(stderr, /Unknown collection: nope/)
  assert.match(stderr, /Collections: users, media, pages/)
})

test('reports an unknown flag instead of ignoring it', () => {
  const { code, stderr } = runCli('--config', 'blog.config.ts', '--detials')
  assert.equal(code, 1)
  assert.match(stderr, /Unknown option '--detials'/)
})

test('reports a missing config with the paths it tried', () => {
  const { code, stderr } = runCli()
  assert.equal(code, 1)
  assert.match(stderr, /Could not find a Payload config/)
  assert.match(stderr, /payload\.config\.ts/)
})

test('reports a --config path that does not exist', () => {
  const { code, stderr } = runCli('--config', 'missing.config.ts')
  assert.equal(code, 1)
  assert.match(stderr, /Config not found/)
})

test('reports a config that crashes while loading', () => {
  const { code, stderr } = runCli('--config', 'throws.config.ts')
  assert.notEqual(code, 0)
  assert.match(stderr, /Broken config/)
  assert.match(stderr, /Could not load config/)
})

test('reports a config that writes to stdout', () => {
  const { code, stderr } = runCli('--config', 'noisy.config.ts')
  assert.equal(code, 1)
  assert.match(stderr, /not valid JSON/)
})
