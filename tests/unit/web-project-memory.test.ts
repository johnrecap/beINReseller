import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const repoRoot = resolve(process.cwd())
const skillRoot = join(repoRoot, '.agents', 'skills', 'web-project-memory')
const legacySkillRoot = join(repoRoot, '.agents', 'skills', 'web-project-memory-ledger')
const skillPath = join(skillRoot, 'SKILL.md')
const schemaPath = join(skillRoot, 'references', 'project-memory-schema.md')
const helperPath = join(skillRoot, 'scripts', 'project_memory.py')
const openAiPath = join(skillRoot, 'agents', 'openai.yaml')

const recordStates = [
  'VERIFIED',
  'INFERRED',
  'PLANNED',
  'PARTIAL',
  'STALE',
  'CONFLICT',
  'DEPRECATED',
  'UNKNOWN',
]

const featureStates = [
  'PLANNED',
  'PARTIAL',
  'WORKING',
  'BLOCKED',
  'DEPRECATED',
  'BROKEN',
  'UNKNOWN',
]

const sectionTitles = [
  'Project Identity',
  'Current System Snapshot',
  'Technology Stack',
  'Architecture Map',
  'Source Map',
  'Frontend',
  'Backend',
  'API Contracts',
  'Database',
  'Data Flows',
  'Authentication and Authorization',
  'External Integrations',
  'Environment Variables',
  'Security',
  'Testing and Quality',
  'Build Deployment and Operations',
  'Feature Registry',
  'Dependency and Impact Map',
  'Technical Decisions',
  'Known Issues and Technical Debt',
  'Open Tasks',
  'Change Ledger',
  'Freshness and Conflicts',
]

type PythonCommand = {
  command: string
  prefix: string[]
}

function resolvePython(): PythonCommand {
  const configured = process.env.PYTHON?.trim()
  const candidates: PythonCommand[] = [
    ...(configured ? [{ command: configured, prefix: [] }] : []),
    { command: 'python', prefix: [] },
    { command: 'py', prefix: ['-3'] },
  ]

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, '--version'], {
      encoding: 'utf8',
    })
    if (result.status === 0) return candidate
  }

  throw new Error('Python 3 is required to validate the project-memory helper')
}

function runHelper(
  python: PythonCommand,
  args: string[],
  cwd: string = repoRoot,
) {
  return spawnSync(python.command, [...python.prefix, helperPath, ...args], {
    cwd,
    encoding: 'utf8',
  })
}

function writeFixture(root: string, relativePath: string, content: string) {
  const destination = join(root, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, content, { encoding: 'utf8' })
}

function runGit(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result
}

function replaceEmptySection(text: string, section: number, record: string) {
  const title = sectionTitles[section - 1]
  const marker = `## ${section}. ${title}\n\n- No records yet.`
  assert.ok(text.includes(marker), `missing empty marker for section ${section}`)
  return text.replace(marker, `## ${section}. ${title}\n\n${record.trim()}`)
}

test('package exposes the exact personal skill identity and Codex UI metadata', () => {
  for (const path of [skillPath, schemaPath, helperPath, openAiPath]) {
    assert.ok(existsSync(path), `missing package file: ${path}`)
  }
  assert.equal(existsSync(legacySkillRoot), false, 'legacy skill package must be retired')

  const skill = readFileSync(skillPath, 'utf8')
  const openAi = readFileSync(openAiPath, 'utf8')

  assert.match(skill, /^name:\s*web-project-memory$/m)
  assert.match(skill, /existing web (?:project|repository)/i)
  assert.match(skill, /frontend[\s\S]*backend[\s\S]*database/i)
  assert.match(skill, /Do not use[\s\S]*general programming questions/i)
  assert.match(openAi, /^\s*display_name:\s*["']Web Project Memory["']\s*$/m)
  assert.match(openAi, /^\s*default_prompt:.*\$web-project-memory.*$/m)
  assert.match(openAi, /^\s*allow_implicit_invocation:\s*true\s*$/m)

  const visible = spawnSync(
    'git',
    ['check-ignore', '-q', '--', '.agents/skills/web-project-memory/SKILL.md'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(visible.status, 1, 'corrected skill package must be visible to Git')

  const adjacent = spawnSync(
    'git',
    ['check-ignore', '-q', '--', '.agents/skills/always-on-agent-discipline/SKILL.md'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(adjacent.status, 0, 'adjacent local skill packages must remain ignored')
})

test('schema declares the exact compact record and feature contracts', () => {
  const schema = readFileSync(schemaPath, 'utf8')

  for (const [index, title] of sectionTitles.entries()) {
    assert.match(schema, new RegExp(`^## ${index + 1}\\. ${title}$`, 'm'))
  }
  for (const state of recordStates) assert.match(schema, new RegExp(`\\b${state}\\b`))
  for (const state of featureStates) assert.match(schema, new RegExp(`\\b${state}\\b`))

  const validationBoundary = schema.split('## Validation Boundary')[1]?.trim() ?? ''
  assert.ok(validationBoundary.length >= 200, 'validation boundary must be substantive')
  assert.match(validationBoundary, /structural/i)
  assert.match(validationBoundary, /freshness/i)
  assert.match(validationBoundary, /semantic/i)
  assert.match(validationBoundary, /production/i)
})

test('helper exercises a Git-backed multi-layer project without live services', () => {
  const python = resolvePython()
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'web-project-memory-demo-'))

  try {
    writeFixture(
      temporaryRoot,
      'src/frontend/dashboard.ts',
      "export async function loadDashboard() { return fetch('/api/accounts') }\n",
    )
    writeFixture(
      temporaryRoot,
      'src/api/accounts.ts',
      "import { listAccounts } from '../services/accounts'\nexport const GET = listAccounts\n",
    )
    writeFixture(
      temporaryRoot,
      'src/services/accounts.ts',
      'export function listAccounts() { return [] }\n',
    )
    writeFixture(
      temporaryRoot,
      'db/schema.sql',
      'create table accounts (id integer primary key, owner_id integer not null);\n',
    )
    writeFixture(
      temporaryRoot,
      'src/auth/authorize.ts',
      'export function authorize() { return true }\n',
    )
    writeFixture(
      temporaryRoot,
      'tests/accounts.test.ts',
      "import '../src/api/accounts'\n",
    )

    runGit(temporaryRoot, ['init'])
    runGit(temporaryRoot, ['config', 'user.email', 'memory-test@example.invalid'])
    runGit(temporaryRoot, ['config', 'user.name', 'Memory Test'])
    runGit(temporaryRoot, ['add', '--', '.'])
    runGit(temporaryRoot, ['commit', '-m', 'test fixture baseline'])

    const initialize = runHelper(
      python,
      ['init', temporaryRoot, '--project-name', 'Layered Demo'],
      temporaryRoot,
    )
    assert.equal(initialize.status, 0, initialize.stderr || initialize.stdout)

    const ledgerPath = join(temporaryRoot, 'PROJECT_MEMORY.md')
    let ledger = readFileSync(ledgerPath, 'utf8')
    for (const [index, title] of sectionTitles.entries()) {
      assert.ok(ledger.includes(`## ${index + 1}. ${title}`))
    }
    assert.ok(
      ledger.includes(`> Record states: ${recordStates.join(' | ')}`),
      'initialized ledger must declare exact record states',
    )
    assert.ok(
      ledger.includes(`> Feature states: ${featureStates.join(' | ')}`),
      'initialized ledger must declare exact feature states',
    )
    assert.match(ledger, /^> Last synchronized commit: [0-9a-f]{40}$/m)
    assert.match(ledger, /^> Working tree at synchronization: CLEAN$/m)
    assert.match(ledger, /^> Working tree fingerprint: SHA256:[0-9a-f]{64}$/m)

    ledger = replaceEmptySection(
      ledger,
      6,
      `### FE-001 — Account dashboard\n\n- State: VERIFIED\n- Sources: \`src/frontend/dashboard.ts\`\n- Connections: \`API-001\`, \`FEAT-001\`\n- Current state: Loads account data through the accounts API.`,
    )
    ledger = replaceEmptySection(
      ledger,
      7,
      `### BE-001 — Account service\n\n- State: VERIFIED\n- Sources: \`src/services/accounts.ts\`\n- Connections: \`API-001\`, \`DATA-001\`\n- Current state: Owns account query behavior.`,
    )
    ledger = replaceEmptySection(
      ledger,
      8,
      `### API-001 — Accounts API\n\n- State: VERIFIED\n- Sources: \`src/api/accounts.ts\`\n- Connections: \`FE-001\`, \`BE-001\`, \`DATA-001\`, \`FEAT-001\`\n- Current state: Exposes account reads to the dashboard.`,
    )
    ledger = replaceEmptySection(
      ledger,
      9,
      `### DATA-001 — Accounts table\n\n- State: VERIFIED\n- Sources: \`db/schema.sql\`\n- Connections: \`API-001\`, \`BE-001\`, \`FEAT-001\`\n- Current state: Stores account ownership.`,
    )
    ledger = replaceEmptySection(
      ledger,
      11,
      `### AUTH-001 — Independent authorization helper\n\n- State: VERIFIED\n- Sources: \`src/auth/authorize.ts\`\n- Current state: Exists but is not declared as part of this demo slice.`,
    )
    ledger = replaceEmptySection(
      ledger,
      15,
      `### TEST-001 — Account API test\n\n- State: VERIFIED\n- Sources: \`tests/accounts.test.ts\`\n- Connections: \`API-001\`\n- Current state: Imports the account API boundary.`,
    )
    ledger = replaceEmptySection(
      ledger,
      17,
      `### FEAT-001 — Account listing\n\n- State: VERIFIED\n- Status: WORKING\n- Sources: \`src/frontend/dashboard.ts\`; \`src/api/accounts.ts\`; \`src/services/accounts.ts\`; \`db/schema.sql\`\n- Entry points: \`FE-001\`, \`API-001\`\n- Connections: \`BE-001\`, \`DATA-001\`, \`TEST-001\`\n- Impact: frontend, API, service, database`,
    )
    writeFileSync(ledgerPath, ledger, { encoding: 'utf8' })

    const valid = runHelper(
      python,
      ['validate', ledgerPath, '--repository', temporaryRoot],
      temporaryRoot,
    )
    assert.equal(valid.status, 0, valid.stderr || valid.stdout)

    const current = runHelper(
      python,
      ['freshness', temporaryRoot, ledgerPath],
      temporaryRoot,
    )
    assert.equal(current.status, 0, current.stderr || current.stdout)
    assert.equal(JSON.parse(current.stdout).status, 'CURRENT')

    const overwrite = runHelper(
      python,
      ['init', temporaryRoot, '--project-name', 'Replacement'],
      temporaryRoot,
    )
    assert.notEqual(overwrite.status, 0)
    assert.match(overwrite.stderr, /refus(?:e|ing).*overwrite/i)

    writeFixture(
      temporaryRoot,
      'src/api/accounts.ts',
      "import { listAccounts } from '../services/accounts'\nexport const GET = () => listAccounts().slice(0, 25)\n",
    )

    const stale = runHelper(
      python,
      ['freshness', temporaryRoot, ledgerPath],
      temporaryRoot,
    )
    assert.equal(stale.status, 1, stale.stderr || stale.stdout)
    assert.equal(JSON.parse(stale.stdout).status, 'STALE')
    assert.deepEqual(JSON.parse(stale.stdout).changed_paths, ['src/api/accounts.ts'])

    const impact = runHelper(
      python,
      ['impact', temporaryRoot, ledgerPath],
      temporaryRoot,
    )
    assert.equal(impact.status, 0, impact.stderr || impact.stdout)
    const impactReport = JSON.parse(impact.stdout)
    assert.deepEqual(impactReport.direct_records, ['API-001', 'FEAT-001'])
    assert.ok(impactReport.connected_records.includes('FE-001'))
    assert.ok(impactReport.connected_records.includes('DATA-001'))
    assert.equal(impactReport.connected_records.includes('AUTH-001'), false)
    assert.ok(impactReport.read_paths.includes('src/frontend/dashboard.ts'))
    assert.ok(impactReport.read_paths.includes('db/schema.sql'))
    assert.equal(impactReport.read_paths.includes('src/auth/authorize.ts'), false)
    assert.ok(impactReport.read_paths.length < 6, 'second read must stay narrower than all sources')

    const safeLedger = readFileSync(ledgerPath, 'utf8')
    writeFileSync(ledgerPath, `${safeLedger}\n- password: super-secret-value\n`, {
      encoding: 'utf8',
    })
    const unsafe = runHelper(
      python,
      ['validate', ledgerPath, '--repository', temporaryRoot],
      temporaryRoot,
    )
    assert.equal(unsafe.status, 1)
    assert.match(unsafe.stderr, /secret-like value/i)

    writeFileSync(
      ledgerPath,
      safeLedger.replace('`src/frontend/dashboard.ts`', '`src/frontend/missing.ts`'),
      { encoding: 'utf8' },
    )
    const missingSource = runHelper(
      python,
      ['validate', ledgerPath, '--repository', temporaryRoot],
      temporaryRoot,
    )
    assert.equal(missingSource.status, 1)
    assert.match(missingSource.stderr, /source pointer does not exist/i)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
