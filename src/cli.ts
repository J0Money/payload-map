#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  fromSources,
  notConnected,
  pointingAt,
  render,
  renderIncoming,
  renderMermaid,
  withoutPlugins,
  withoutRichText,
  type ExtractResult,
} from './render.ts'

const fail = (message: string, code = 1): never => {
  console.error(message)
  process.exit(code)
}

// 0. Read the arguments. parseArgs (built into Node) handles values like "--to media" and
// rejects unknown flags, so a typo such as --detials gives an error instead of being ignored.
// Words without "--" (positionals) are collection names to show, as in "payload-map pages".
function readArgs() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        config: { type: 'string' },
        to: { type: 'string' },
        details: { type: 'boolean' },
        json: { type: 'boolean' },
        mermaid: { type: 'boolean' },
        all: { type: 'boolean' },
        'rich-text': { type: 'boolean' },
        'no-rich-text': { type: 'boolean' },
      },
    })
  } catch (error) {
    return fail(`${(error as Error).message}\nSee the README for all options.`)
  }
}

const { values: flags, positionals: sources } = readArgs()

if (flags['rich-text'] && flags['no-rich-text']) fail('Use --rich-text or --no-rich-text, not both.')

// richText relations are shown by default, except in --mermaid: one Lexical link field can
// point at almost every collection, and a diagram with that many arrows cannot be read.
// A tree is a list, so it stays readable however many relations there are.
const showRichText = flags['rich-text'] || (!flags['no-rich-text'] && !flags.mermaid)

// The user's project is the folder the command is run from.
const projectRoot = process.cwd()

// 1. Find the config. An explicit flag wins over the env variable, which wins over defaults.
function findConfig(): string {
  if (flags.config) {
    const fromFlag = path.resolve(projectRoot, flags.config)
    if (!existsSync(fromFlag)) fail(`Config not found: ${fromFlag}`)
    return fromFlag
  }

  const candidates = [
    process.env.PAYLOAD_CONFIG_PATH,
    'src/payload.config.ts',
    'payload.config.ts',
  ]
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => path.resolve(projectRoot, candidate))

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    fail(
      [
        'Could not find a Payload config. Tried:',
        ...candidates.map((candidate) => `  ${candidate}`),
        'Run the command from your project folder, or pass --config <path>.',
      ].join('\n'),
    )
  }
  return found!
}

const configPath = findConfig()

// 2. Resolve tsx from THIS package, so the user's project does not need it installed.
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli')

// extract lives next to this file, wherever the user runs the command from. It has the
// same extension as this file: .ts when run from src, .js when run from the built dist.
const thisFile = fileURLToPath(import.meta.url)
const extractScript = path.join(path.dirname(thisFile), `extract${path.extname(thisFile)}`)

// Without the project tsconfig the "@/" alias cannot be resolved.
const tsconfig = path.join(projectRoot, 'tsconfig.json')
const tsconfigArgs = existsSync(tsconfig) ? ['--tsconfig', tsconfig] : []

// 3. Run extract.ts in its own process, inside the user's project folder.
// stdout is collected (JSON only), stderr goes straight to the user's terminal.
const child = spawn(process.execPath, [tsxCli, ...tsconfigArgs, extractScript, configPath], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'inherit'],
})

let output = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk: string) => {
  output += chunk
})

child.on('error', (error) => fail(`Could not start the helper process: ${error.message}`))

// 4. Check the result.
child.on('close', (code) => {
  if (code !== 0) fail(`Could not load config: ${configPath}`, code ?? 1)

  let result: ExtractResult
  try {
    result = JSON.parse(output)
  } catch {
    fail(
      'The config loaded, but its output was not valid JSON. ' +
        'Does the config (or one of its imports) write to stdout with console.log?',
    )
  }

  // A collection named on the command line is shown even if a plugin added it.
  const all = flags.all || sources.length > 0 ? result! : withoutPlugins(result!)

  if (sources.length > 0) {
    const known = [...result!.collections, ...result!.globals.map((slug) => `global:${slug}`)]
    const unknown = sources.filter((source) => !known.includes(source))
    if (unknown.length > 0) {
      fail(`Unknown collection or global: ${unknown.join(', ')}\nAvailable: ${known.join(', ')}`)
    }
  }

  const to = flags.to
  if (to !== undefined && !result!.collections.includes(to)) {
    fail(`Unknown collection: ${to}\nCollections: ${result!.collections.join(', ')}`)
  }

  // The named sources, then --to, which narrows everything (tree, --json and --mermaid)
  // to what points at one collection.
  const narrow = (data: ExtractResult) => {
    if (sources.length > 0) data = fromSources(data, sources)
    if (to !== undefined) data = pointingAt(data, to)
    return data
  }

  const whole = showRichText ? all : withoutRichText(all)
  // Worked out on the whole map, before narrow removes relations.
  const unconnected = notConnected(whole)
  const data = narrow(whole)
  // Counted on the narrowed view, so the number matches what the diagram leaves out.
  const leftOutRichText = showRichText
    ? 0
    : narrow(all).relations.filter((relation) => relation.richText).length

  const details = flags.details ?? false
  if (flags.json) console.log(JSON.stringify(data, null, 2))
  else if (flags.mermaid) console.log(renderMermaid(data, { leftOutRichText }))
  else if (to !== undefined) console.log(renderIncoming(data, to, { details }))
  else console.log(render(data, { details, notConnected: unconnected }))
})
