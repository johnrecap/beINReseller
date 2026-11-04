// Planning-artifact checks only. Does not load application code or contact services.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const base = 'specs/037-panel-responsiveness-login-health';
const read = p => fs.readFileSync(path.resolve(root, p), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const errors = [];
const implementation = process.argv.includes('--implementation');
const template = read('.specify/templates/tasks-template.md');
const detailSection = template.split('## Required Detail Block For Every Task')[1]?.split('\n## ')[0];
const detailBlock = detailSection?.match(/```markdown\r?\n([\s\S]*?)```/)?.[1];
if (!detailBlock) throw new Error('Original task detail template is missing');
const labels = [...detailBlock.matchAll(/^\s+- ([^:\r\n]+):/gm)].map(m => m[1]);
if (labels.length === 0) throw new Error('No original template labels found');
const taskText = read(`${base}/tasks.md`);
const taskMatches = [...taskText.matchAll(/^- \[([ x])\] (T\d{3})(?: \[(US\d+)\])? (.+)$/gm)];
const tasks = taskMatches.map((m, i) => {
  let body = taskText.slice(m.index, taskMatches[i + 1]?.index ?? taskText.length);
  body = body.split(/\n##? /)[0].trim();
  const refs = body.match(/  - Requirements: (.+?)\. Depends on: (.+?)\./);
  if (!refs) errors.push(`Missing mapping/dependencies: ${m[2]}`);
  for (const label of labels) {
    const values = body.split('\n').filter(l => l.startsWith(`  - ${label}: `));
    if (values.length !== 1 || !values[0].slice(`  - ${label}: `.length).trim()) errors.push(`Missing/duplicate detail ${m[2]} ${label}`);
  }
  if (!implementation && m[1] !== ' ') errors.push(`Runtime task checked during planning: ${m[2]}`);
  const expanded = (refs?.[1] ?? '').replace(/(FR|SC)-(\d{3})[–-](?:(?:FR|SC)-)?(\d{3})/g, (_, prefix, a, b) => {
    const start = Number(a), end = Number(b);
    if (end < start || end - start > 100) throw new Error('Invalid requirement range');
    return Array.from({ length: end - start + 1 }, (_, n) => `${prefix}-${String(start + n).padStart(3, '0')}`).join(', ');
  });
  return { id: m[2], story: m[3] ?? null, requirements: [...expanded.matchAll(/(?:FR|SC)-\d{3}/g)].map(x => x[0]), dependencies: [...(refs?.[2] ?? '').matchAll(/T\d{3}/g)].map(x => x[0]), unitSha256: hash(body) };
});
if (!tasks.length) errors.push('No tasks');
tasks.forEach((t, i) => {
  if (t.id !== `T${String(i + 1).padStart(3, '0')}`) errors.push(`Task ordering: ${t.id}`);
  for (const dep of t.dependencies) if (!tasks.slice(0, i).some(x => x.id === dep)) errors.push(`Missing/forward dependency ${t.id}: ${dep}`);
});
const requirements = [...read(`${base}/spec.md`).matchAll(/^- \*\*((?:FR|SC)-\d{3})\*\*:/gm)].map(m => m[1]);
const coverage = requirements.map(id => ({ id, tasks: tasks.filter(t => t.requirements.includes(id)).map(t => t.id) }));
coverage.filter(r => !r.tasks.length).forEach(r => errors.push(`Unmapped requirement: ${r.id}`));
tasks.forEach(t => t.requirements.filter(r => !requirements.includes(r)).forEach(r => errors.push(`Unknown requirement ${t.id}: ${r}`)));

const files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, entry.name); if (entry.isDirectory()) walk(p); else files.push(p); } }
walk(path.resolve(root, base));
const docs = files.filter(p => p.endsWith('.md'));
for (const file of docs) {
  const bytes = fs.readFileSync(file), text = bytes.toString('utf8');
  if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) errors.push(`BOM: ${file}`);
  if (!Buffer.from(text, 'utf8').equals(bytes)) errors.push(`Invalid UTF-8: ${file}`);
  if (/[\uFFFD]|Ã|Â|â€|ï¿½/.test(text)) errors.push(`Possible mojibake: ${file}`);
  if (/NEEDS CLARIFICATION|\[FEATURE NAME\]|\[FEATURE\]|\[DATE\]|\$ARGUMENTS/.test(text)) errors.push(`Unfilled template: ${file}`);
  for (const m of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^[a-z]+:\/\//i.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) errors.push(`Broken link ${path.relative(root, file)}: ${target}`);
  }
}
const checklistDocs = docs.filter(p => p.includes(`${path.sep}checklists${path.sep}`));
const checklistItems = checklistDocs.flatMap(p => [...read(p).matchAll(/^- \[([ x])\] (CHK\d+) /gm)].map(m => ({ id: m[2], done: m[1] === 'x' })));
if (!checklistItems.length || checklistItems.some(c => !c.done)) errors.push('Incomplete requirement-quality checklist');
if (new Set(checklistItems.map(c => c.id)).size !== checklistItems.length) errors.push('Duplicate checklist IDs');
const representative = JSON.parse(read(`${base}/evidence/representative-task.json`));
if (representative.templateSha256 !== hash(template) || representative.unitSha256 !== tasks[0]?.unitSha256) errors.push('Representative evidence became stale');
const changed = [...new Set([
  ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n'),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n'),
].filter(Boolean))];
const permitted = p => p.startsWith(`${base}/`) || ['.specify/feature.json', 'AGENTS.md', 'docs/PROJECT_GUIDE.md', 'PROJECT_MEMORY.md'].includes(p);
if (!implementation) changed.filter(p => !permitted(p)).forEach(p => errors.push(`Outside documentation scope: ${p}`));
const report = { scope: '037 planning artifacts only; no runtime or production acceptance', result: errors.length ? 'FAIL' : 'PASS', originalTaskTemplate: '.specify/templates/tasks-template.md', originalTemplateSha256: hash(template), requiredTaskFields: labels, taskCount: tasks.length, checkedRuntimeTasks: taskMatches.filter(m => m[1] === 'x').length, requirementCount: requirements.length, checklistItems: checklistItems.length, documentCount: docs.length, coverage, tasks, errors, changedPaths: changed, limits: 'Structural coverage and labels are not semantic correctness, browser behavior, financial safety or user acceptance.' };
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
