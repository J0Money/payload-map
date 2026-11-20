import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// These tests run the real CLI as a process, the same way a user would.
// That covers cli.ts and extract.ts together, including the helper process.
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli')
const cliPath = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url))

function runCli(...args: string[]) {
  const result = spawnSync(process.execPath, [tsxCli, cliPath, ...args], {
    cwd: fixtures,
    encoding: 'utf8',
  })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('finds every relation, also nested, shared, join and richText fields', () => {
  const { code, stdout } = runCli('--config', 'blog.config.ts', '--json', '--all')
  assert.equal(code, 0)

  const data = JSON.parse(stdout)
  assert.deepEqual(data.collections, ['users', 'media', 'pages', 'posts', 'redirects', 'search'])
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
