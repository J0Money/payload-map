import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, renderMermaid, withoutPlugins, type ExtractResult } from './render.ts'

const fail = (message: string, code = 1): never => {
  console.error(message)
  process.exit(code)
}

// The user's project is the folder the command is run from.
const projectRoot = process.cwd()

// 1. Find the config. An explicit flag wins over the env variable, which wins over defaults.
function findConfig(): string {
  const flagIndex = process.argv.indexOf('--config')
  if (flagIndex !== -1) {
    const value = process.argv[flagIndex + 1]
    if (!value) fail('--config needs a path, for example: --config src/payload.config.ts')
    const fromFlag = path.resolve(projectRoot, value)
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

// extract.ts lives next to this file, wherever the user runs the command from.
const extractScript = fileURLToPath(new URL('./extract.ts', import.meta.url))

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

  const flag = (name: string) => process.argv.includes(name)
  const data = flag('--all') ? result! : withoutPlugins(result!)

  if (flag('--json')) console.log(JSON.stringify(data, null, 2))
  else if (flag('--mermaid')) console.log(renderMermaid(data))
  else console.log(render(data, { details: flag('--details') }))
})
