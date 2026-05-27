# Encoding Safety Rules

These rules are mandatory for all automated edits in this repository.

1. Never rewrite source files using risky PowerShell text APIs:

- Do not use `Set-Content`, `Out-File`, or `[System.IO.File]::WriteAllText` for code edits.
- Do not run any codepage conversion (for example `Encoding.GetEncoding(...).GetBytes(...)` on file text).

1. Preferred edit method:

- Use `apply_patch` for manual edits.
- If a scripted edit is required, preserve original bytes/encoding and do not change encoding format.

1. BOM safety:

- Do not add UTF-8 BOM to existing files.
- If a file did not start with BOM, it must remain BOM-free after edits.

1. Unicode/mojibake safety check after edits:

- Verify no mojibake patterns were introduced (examples: `â`, `ï؟½`, `Ã`, `Â` in logs/comments/strings unless intentionally present).

1. Scope safety:

- Make minimal diffs only.
- Never perform full-file rewrites unless explicitly requested by the user.

---

# Skills-First Rule (MANDATORY)

**Before responding to ANY user request, you MUST:**

1. **Scan your available skills** and identify any that match the user's intent
2. **Read the SKILL.md** of any matching skill before taking action
3. **Announce which skill you're using**: "Using [skill name] for [purpose]"
4. **Follow the skill's instructions** exactly

**This applies to ALL requests** — including questions, code changes, debugging, planning, and research.

**For creative or implementation work** (building features, designing solutions, modifying behavior):

- Always invoke the `brainstorming` skill FIRST
- Then invoke task-specific skills (e.g., `writing-plans`, `react-component-performance`)

**If no skill matches** → proceed normally, but state: "No matching skill found."

> This rule is non-negotiable. Skipping skill checks wastes time and produces lower quality results.

---

# Agent Skills and Bridge Skills

## Available Skills

This project has agent skills installed in two locations:

- `.agents/skills/` - Codex project skills
- `.agent/skills/` - Antigravity project skills

## Bridge Skills Available

The following bridge skills wrap external CLI tools for auto-discovery:

| Bridge Skill | Backing Tool | Install Command |
|---|---|---|
| `semantic-code-search` | osgrep | `npm i -g osgrep` |
| `persistent-memory` | memsearch | `pip install memsearch` |
| `stable-local-urls` | portless | `npm i -g portless` |
| `mobile-agent-qa` | droidrun | `pip install droidrun` |
| `parallel-agent-control` | FleetCode | Build from source (macOS) |
| `codex-ci-review` | codex-action | GitHub Action (no local install) |
| `workspace-ops` | gws CLI | See googleworkspace/cli repo |

## Skill Discovery

- Codex scans `.agents/skills/` automatically and matches skills based on the `description` field.
- Antigravity skills are placed in `.agent/skills/`; keep descriptions precise so skill matching remains specific.

## Rules for Adding New Skills

1. Skill repos: `npx skills add <repo> -a codex -a antigravity -y`
2. CLI tools: install the tool, then create a bridge `SKILL.md` in both `.agents/skills/<name>/` and `.agent/skills/<name>/`
3. Keep descriptions specific; vague descriptions cause false triggers

---

# Production Server Notes

Use these details when giving deployment commands for this project.

- Production path: `/www/wwwroot/deshpanel.com`
- Worker path: `/www/wwwroot/deshpanel.com/worker`
- PM2 process names seen in production commands:
  - `bein-web`
  - `bein-keepalive`
  - `bein-worker-10`
- PM2 ecosystem file: `ecosystem.config.js`
- Production has a live database. Prefer `npx prisma migrate deploy` when migrations exist. Do not suggest `npx prisma db push` for normal production deploys unless the user explicitly asks for a schema push workaround.
- Standard deployment order:
  1. Fetch/pull the intended branch.
  2. Install dependencies only if package files changed or a clean install is needed.
  3. Run Prisma migration deploy.
  4. Generate Prisma client.
  5. Build web app.
  6. Build worker.
  7. Restart PM2 processes.
  8. Check PM2 status and recent logs.

Preferred command shape for feature branch deploys:

```bash
cd /www/wwwroot/deshpanel.com
git fetch origin
git checkout <branch>
git pull --ff-only origin <branch>
npm ci
npm --prefix worker ci
npx prisma migrate deploy
npx prisma generate
npm run build
cd worker && npm run build && cd ..
pm2 restart all
pm2 status
pm2 logs --lines 20
```

<!-- SPECKIT START -->
For the current Spec Kit workflow, read
`specs/019-points-analysis-report/plan.md`,
`specs/019-points-analysis-report/spec.md`, and
`specs/019-points-analysis-report/tasks.md` before editing.
<!-- SPECKIT END -->
