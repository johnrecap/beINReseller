// Scoped checkpoint checks; deliberately does not claim full T020–T024 acceptance.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';

const root = process.cwd();
const base = 'specs/037-panel-responsiveness-login-health/evidence';
const changed = [...new Set([
    ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n'),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'),
])].filter(p => /^(src|shared|worker\/src|tests|worker\/tests)\/.+\.(ts|tsx|jsx|cjs)$/.test(p));
const sources = changed.map(path => {
    const bytes = fs.readFileSync(path);
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) throw new Error(`BOM: ${path}`);
    return { path, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
const commands = [
    ['unit', ['--import', 'tsx', '--test', 'tests/unit/panel-command-state.test.ts', 'tests/unit/panel-command-runner.test.ts', 'tests/unit/panel-balance-rejection.test.ts', 'tests/unit/bein-balance-refresh.test.ts', 'tests/unit/bein-balance-refresh-api.test.ts', 'tests/unit/panel-balance-tracker.test.ts', 'tests/unit/bein-account-recovery.test.ts']],
    ['worker', ['--import', 'tsx', '--test', 'worker/tests/login-health-policy.test.ts', 'worker/tests/login-failure-classification.test.ts', 'worker/tests/login-tracking-recovery.test.ts', 'worker/tests/keepalive-login-recovery.test.ts', 'worker/tests/login-retry-consumers.test.ts', 'worker/tests/balance-refresh-job.test.ts', 'worker/tests/balance-read-boundary.test.ts', 'worker/tests/provider-report-browser.test.ts']],
    ['types-root', ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false']],
    ['types-worker', ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false', '-p', 'worker/tsconfig.json']],
    ['lint', ['node_modules/eslint/bin/eslint.js', ...changed.filter(p => /^(src|shared)\/.+\.tsx?$/.test(p))]],
];
const checks = commands.map(([name, args]) => {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 180_000 });
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    fs.writeFileSync(`${base}/current-${name}.txt`, output);
    console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'}`);
    return { name, command: ['node', ...args], exitCode: result.status, error: result.error?.message ?? null, output: `current-${name}.txt` };
});
fs.writeFileSync(`${base}/current-checks.json`, JSON.stringify({ date: new Date().toISOString(),
    scope: 'Partial 037 checkpoint: selected unit/worker cases, types, affected runtime lint and UTF-8/BOM. No full feature acceptance.',
    result: checks.every(c => c.exitCode === 0) ? 'PASS' : 'FAIL', sources, checks,
    notVerified: ['full consumer migration', 'native integrated balance and health races', 'health UI browser acceptance', 'real App Router', 'builds', 'production'],
}, null, 2) + '\n');
if (checks.some(c => c.exitCode !== 0)) process.exitCode = 1;
