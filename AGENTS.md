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
- Next.js production builds must not run while `bein-web` is serving traffic from the same `.next` directory. Stop `bein-web`, remove the old `.next`, build, then start/restart `bein-web`. This prevents `ChunkLoadError: Cannot find module ... .next/server/chunks/ssr/...` and stale Server Action errors after deploys.
- Standard deployment order:
  1. Fetch/pull the intended branch.
  2. Install dependencies only if package files changed or a clean install is needed.
  3. Run Prisma migration deploy.
  4. Generate Prisma client.
  5. Stop `bein-web`.
  6. Remove old `.next`.
  7. Build web app.
  8. Restart `bein-web`.
  9. Build worker.
  10. Restart worker/maintenance PM2 processes.
  11. Check PM2 status and recent logs.

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
pm2 stop bein-web
rm -rf .next
npm run build
pm2 restart bein-web --update-env
cd worker && npm run build && cd ..
pm2 restart bein-maintenance bein-worker-1 bein-worker-2 bein-worker-3 bein-worker-4 bein-worker-5 bein-worker-6 bein-worker-7 bein-worker-8 bein-worker-9 bein-worker-10
pm2 status
pm2 logs bein-web --lines 80
```

<!-- SPECKIT START -->
For the current Spec Kit workflow, read
`specs/027-bein-connection-mode/plan.md`,
`specs/027-bein-connection-mode/spec.md`, and
`specs/027-bein-connection-mode/tasks.md` before editing.
<!-- SPECKIT END -->
