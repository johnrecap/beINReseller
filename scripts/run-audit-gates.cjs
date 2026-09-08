/* eslint-disable @typescript-eslint/no-require-imports -- Direct Node CommonJS entry point with no transpilation. */
const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const manifest = require('./audit-gate-manifest.cjs');

function validateGateResult(result) {
  return result.status === 0 && /# tests [1-9]\d*/.test(result.stdout || '') &&
    !/(?:^|\n)\s*(?:not )?ok .+#[ \t]*(?:SKIP|TODO)\b/i.test(result.stdout || '') &&
    !/# (?:skipped|todo) [1-9]\d*/i.test(result.stdout || '') && /# fail 0\b/.test(result.stdout || '');
}
module.exports = { validateGateResult };
if (require.main === module) {
  const group = process.argv[2];
  if (!Object.hasOwn(manifest, group)) throw new Error('UNKNOWN_AUDIT_GATE');
  const files = manifest[group]();
  if (!files.length || files.some(file => !existsSync(file))) throw new Error('MISSING_AUDIT_SUITE');
  if (group !== 'unit' && process.env.RUN_REDIS_INTEGRATION !== '1') throw new Error('REDIS_GATE_MUST_RUN');
  if (group === 'database' && (process.env.RUN_DB_INTEGRATION !== '1' || process.env.CONFIRM_DISPOSABLE_RENEWAL_FULFILLMENT_DB !== '1')) {
    throw new Error('DISPOSABLE_DATABASE_GATE_MUST_RUN');
  }
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=120000', ...files],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  const valid = validateGateResult(result);
  console.log(JSON.stringify({ auditGate: group, files: files.length, result: valid ? 'PASS' : 'BLOCKED_OR_FAILED', skipAccepted: false }));
  process.exitCode = valid ? 0 : 1;
}
